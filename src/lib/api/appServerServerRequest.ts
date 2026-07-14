import {
  ERROR_CODES,
  METHOD_SERVER_REQUEST_RESOLVED,
  type ServerRequestResolvedNotification,
  isAppServerServerRequestMethod,
} from "../../../packages/app-server-client/src/protocol";
import { AppServerClient } from "./appServerClient";
import {
  getDefaultAppServerEventBus,
  type AppServerEventBus,
} from "./appServerEventBus";
import type {
  AppServerJsonRpcError,
  AppServerJsonRpcRequest,
  AppServerRequestId,
} from "./appServerTypes";

type ServerRequestResponder = Pick<
  AppServerClient,
  "respondServerRequest" | "rejectServerRequest"
>;

export type AppServerServerRequestHandler<TParams, TResult> = (
  params: TParams,
  request: AppServerJsonRpcRequest,
  signal: AbortSignal,
) => Promise<TResult> | TResult;

type RegisteredServerRequestHandler = AppServerServerRequestHandler<
  unknown,
  unknown
>;

export class AppServerServerRequestDispatcher {
  readonly #eventBus: Pick<AppServerEventBus, "subscribe">;
  readonly #handlers = new Map<string, RegisteredServerRequestHandler>();
  readonly #inFlightRequests = new Map<string, AbortController>();
  readonly #settledRequestIds = new Set<string>();
  readonly #responder: ServerRequestResponder;
  #connectionGeneration = 0;
  #unsubscribe: (() => void) | null = null;

  constructor(
    responder: ServerRequestResponder = new AppServerClient(),
    eventBus: Pick<
      AppServerEventBus,
      "subscribe"
    > = getDefaultAppServerEventBus(),
  ) {
    this.#responder = responder;
    this.#eventBus = eventBus;
  }

  register<TParams, TResult>(
    method: string,
    handler: AppServerServerRequestHandler<TParams, TResult>,
  ): () => void {
    if (!isAppServerServerRequestMethod(method)) {
      throw new Error(`App Server method is not a server request: ${method}`);
    }
    if (this.#handlers.has(method)) {
      throw new Error(
        `App Server server request handler already registered: ${method}`,
      );
    }
    this.#handlers.set(method, handler as RegisteredServerRequestHandler);
    this.#ensureSubscribed();
    return () => {
      if (this.#handlers.get(method) === handler) {
        this.#handlers.delete(method);
      }
      this.#stopIfIdle();
    };
  }

  async dispatch(request: AppServerJsonRpcRequest): Promise<boolean> {
    const requestKey = stableRequestId(request.id);
    if (
      this.#inFlightRequests.has(requestKey) ||
      this.#settledRequestIds.has(requestKey)
    ) {
      return false;
    }
    const controller = new AbortController();
    const connectionGeneration = this.#connectionGeneration;
    this.#inFlightRequests.set(requestKey, controller);
    try {
      const handler = this.#handlers.get(request.method);
      if (!handler) {
        await this.#reject(request.id, {
          code: ERROR_CODES.methodNotFound,
          message: `App Server server request method is not handled: ${request.method}`,
        });
        return false;
      }
      try {
        const result = await handler(
          request.params,
          request,
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          this.#settledRequestIds.has(requestKey)
        ) {
          return false;
        }
        await this.#responder.respondServerRequest(request.id, result);
        return true;
      } catch (error) {
        if (
          controller.signal.aborted ||
          this.#settledRequestIds.has(requestKey)
        ) {
          return false;
        }
        await this.#reject(request.id, {
          code: ERROR_CODES.runtimeError,
          message: serverRequestErrorMessage(error),
        });
        return false;
      }
    } finally {
      this.#inFlightRequests.delete(requestKey);
      if (connectionGeneration === this.#connectionGeneration) {
        this.#settledRequestIds.add(requestKey);
      }
    }
  }

  reset(): void {
    this.#connectionGeneration += 1;
    for (const controller of this.#inFlightRequests.values()) {
      controller.abort();
    }
    this.#handlers.clear();
    this.#inFlightRequests.clear();
    this.#settledRequestIds.clear();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  #ensureSubscribed(): void {
    if (this.#unsubscribe) {
      return;
    }
    this.#unsubscribe = this.#eventBus.subscribe({
      onNotifications: (notifications) => {
        for (const notification of notifications) {
          const resolved = readResolvedNotification(notification);
          if (resolved) {
            this.#resolve(resolved.requestId);
          }
        }
      },
      onServerRequests: (requests) => {
        for (const request of requests) {
          void this.dispatch(request);
        }
      },
    });
  }

  #stopIfIdle(): void {
    if (this.#handlers.size > 0) {
      return;
    }
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  async #reject(id: AppServerRequestId, error: AppServerJsonRpcError) {
    await this.#responder.rejectServerRequest(id, error);
  }

  #resolve(id: AppServerRequestId): void {
    const requestKey = stableRequestId(id);
    this.#settledRequestIds.add(requestKey);
    this.#inFlightRequests.get(requestKey)?.abort();
  }
}

function stableRequestId(id: AppServerRequestId): string {
  return `${typeof id}:${String(id)}`;
}

function serverRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "App Server server request handler failed";
}

function readResolvedNotification(notification: {
  method: string;
  params?: unknown;
}): ServerRequestResolvedNotification | null {
  if (notification.method !== METHOD_SERVER_REQUEST_RESOLVED) {
    return null;
  }
  const params = notification.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const requestId = (params as { requestId?: unknown }).requestId;
  if (typeof requestId !== "string" && typeof requestId !== "number") {
    return null;
  }
  return { requestId };
}
