import {
  APP_SERVER_METHOD_CANCEL_REQUEST,
  APP_SERVER_METHOD_INITIALIZED,
  APP_SERVER_METHOD_INITIALIZE,
} from "./appServerConstants";
import { installAppServerClientMethods } from "./appServerClientMethods";
import { publishAppServerConfigWarnings } from "./appServerConfigWarnings";
import {
  AppServerRpcError,
  assertAppServerProtocol,
  expectAppServerResponse,
} from "./appServerResponse";
import {
  createAppServerNotification,
  createAppServerRequest,
  decodeAppServerMessages,
  drainAppServerEvents,
  encodeAppServerMessage,
  handleAppServerJsonLines,
} from "./appServerTransport";
import type {
  AppServerDrainEventsRequest,
  AppServerInitializeParams,
  AppServerInitializeResponse,
  AppServerJsonRpcMessage,
  AppServerRequestId,
  AppServerRequestOptions,
  AppServerRequestResult,
} from "./appServerTypes";

export class AppServerRequestAbortedError extends Error {
  readonly method: string;
  readonly requestId?: AppServerRequestId;
  readonly reason?: unknown;

  constructor(
    method: string,
    requestId?: AppServerRequestId,
    reason?: unknown,
  ) {
    super("app-server request aborted");
    this.name = "AppServerRequestAbortedError";
    this.method = method;
    this.requestId = requestId;
    this.reason = reason;
  }
}

export class AppServerClient {
  #nextRequestId: number;

  constructor(options: { initialRequestId?: number } = {}) {
    this.#nextRequestId = options.initialRequestId ?? 1;
  }

  nextId(): AppServerRequestId {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    return id;
  }

  async initialize(
    params: AppServerInitializeParams,
  ): Promise<AppServerRequestResult<AppServerInitializeResponse>> {
    const result = await this.request<AppServerInitializeResponse>(
      APP_SERVER_METHOD_INITIALIZE,
      params,
    );
    assertAppServerProtocol(result.result);
    await this.notify(APP_SERVER_METHOD_INITIALIZED, {});
    return result;
  }

  async request<T>(
    method: string,
    params?: unknown,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    throwIfAppServerRequestAborted(options.signal, method);
    const request = createAppServerRequest(this.nextId(), method, params);
    const messages = await this.exchange([request], options);
    throwIfAppServerRequestAborted(options.signal, method, request.id);
    try {
      const result = expectAppServerResponse<T>(messages, request.id, method);
      publishAppServerConfigWarnings(result.configWarnings, {
        method,
        phase: "response",
        requestId: request.id,
      });
      return result;
    } catch (error) {
      if (error instanceof AppServerRpcError) {
        publishAppServerConfigWarnings(error.configWarnings, {
          method,
          phase: "error",
          requestId: request.id,
        });
      }
      throw error;
    }
  }

  async notify(
    method: string,
    params?: unknown,
  ): Promise<AppServerJsonRpcMessage[]> {
    return await this.exchange([createAppServerNotification(method, params)]);
  }

  async exchange(
    messages: AppServerJsonRpcMessage[],
    options: AppServerRequestOptions = {},
  ): Promise<AppServerJsonRpcMessage[]> {
    const requestMethod = readSingleRequestMethod(messages);
    const requestId = readSingleRequestId(messages);
    const response = await waitForAppServerExchange(
      handleAppServerJsonLines({
        lines: messages.map(encodeAppServerMessage),
      }),
      options.signal,
      requestMethod,
      requestId,
    );
    return decodeAppServerMessages(response.lines);
  }

  async drainEvents(
    request?: number | AppServerDrainEventsRequest,
  ): Promise<AppServerJsonRpcMessage[]> {
    const drainRequest =
      typeof request === "number" ? { limit: request } : (request ?? {});
    const response = await drainAppServerEvents(drainRequest);
    return decodeAppServerMessages(response.lines);
  }
}

installAppServerClientMethods(AppServerClient.prototype);

export function createAppServerClient(options?: {
  initialRequestId?: number;
}): AppServerClient {
  return new AppServerClient(options);
}

function waitForAppServerExchange<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  method: string,
  requestId?: AppServerRequestId,
): Promise<T> {
  throwIfAppServerRequestAborted(signal, method, requestId);
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      sendAppServerCancelRequest(requestId);
      reject(
        new AppServerRequestAbortedError(method, requestId, signal.reason),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function sendAppServerCancelRequest(
  requestId: AppServerRequestId | undefined,
): void {
  if (requestId === undefined) {
    return;
  }
  void handleAppServerJsonLines({
    lines: [
      encodeAppServerMessage(
        createAppServerNotification(APP_SERVER_METHOD_CANCEL_REQUEST, {
          id: requestId,
        }),
      ),
    ],
  }).catch(() => undefined);
}

function throwIfAppServerRequestAborted(
  signal: AbortSignal | undefined,
  method: string,
  requestId?: AppServerRequestId,
): void {
  if (signal?.aborted) {
    throw new AppServerRequestAbortedError(method, requestId, signal.reason);
  }
}

function readSingleRequestMethod(messages: AppServerJsonRpcMessage[]): string {
  const request = messages.find(
    (
      message,
    ): message is Extract<AppServerJsonRpcMessage, { method: string }> =>
      "method" in message && "id" in message,
  );
  return request?.method ?? "app-server exchange";
}

function readSingleRequestId(
  messages: AppServerJsonRpcMessage[],
): AppServerRequestId | undefined {
  const request = messages.find(
    (
      message,
    ): message is Extract<
      AppServerJsonRpcMessage,
      { id: AppServerRequestId }
    > => "id" in message,
  );
  return request?.id;
}
