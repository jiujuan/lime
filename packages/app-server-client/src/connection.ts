import * as protocol from "./protocol.js";
import { installAppServerConnectionMethods } from "./connection-methods.js";
import { AppServerClient } from "./request-client.js";

export type AppServerMessageTransport = {
  send(message: protocol.JsonRpcMessage): void;
  nextMessage(timeoutMs?: number): Promise<protocol.JsonRpcMessage>;
};

export type AppServerServerMessage =
  | protocol.JsonRpcRequest
  | protocol.JsonRpcNotification;

export type AppServerRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

const APP_SERVER_TRANSPORT_READ_SLICE_MS = 250;

export type AppServerRequestResult<T> = {
  id: protocol.RequestId;
  result: T;
  response: protocol.JsonRpcResponse;
  notifications: protocol.JsonRpcNotification[];
  messages: protocol.JsonRpcMessage[];
};

export type AppServerRequestFirstMessageResult<T> =
  | (AppServerRequestResult<T> & { completed: true })
  | {
      id: protocol.RequestId;
      completed: false;
      notifications: protocol.JsonRpcNotification[];
      messages: protocol.JsonRpcMessage[];
    };

export class AppServerRequestError extends Error {
  readonly id: protocol.RequestId;
  readonly method: string;
  readonly response: protocol.JsonRpcErrorResponse;
  readonly notifications: protocol.JsonRpcNotification[];
  readonly messages: protocol.JsonRpcMessage[];

  constructor(
    method: string,
    response: protocol.JsonRpcErrorResponse,
    notifications: protocol.JsonRpcNotification[],
    messages: protocol.JsonRpcMessage[],
  ) {
    super(`${method} failed: ${response.error.message}`);
    this.name = "AppServerRequestError";
    this.id = response.id;
    this.method = method;
    this.response = response;
    this.notifications = notifications;
    this.messages = messages;
  }
}

export class AppServerRequestAbortedError extends Error {
  readonly id: protocol.RequestId;
  readonly method: string;
  readonly reason?: unknown;

  constructor(method: string, id: protocol.RequestId, reason?: unknown) {
    super("app-server request aborted");
    this.name = "AppServerRequestAbortedError";
    this.id = id;
    this.method = method;
    this.reason = reason;
  }
}

function remainingRequestTimeoutMs(
  timeoutMs: number | undefined,
  startedAt: number,
): number | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= timeoutMs) {
    throw new Error(
      `timed out waiting for app-server message after ${timeoutMs}ms`,
    );
  }
  return Math.max(1, timeoutMs - elapsedMs);
}

export class AppServerConnection {
  readonly client: AppServerClient;
  readonly transport: AppServerMessageTransport;

  #bufferedMessages: protocol.JsonRpcMessage[] = [];
  #mirroredNotifications: protocol.JsonRpcNotification[] = [];
  #detachedRequestIds = new Set<protocol.RequestId>();
  #pendingServerRequestIds = new Set<protocol.RequestId>();
  #resolvedServerRequestIds = new Set<protocol.RequestId>();
  #transportReadLock: Promise<void> = Promise.resolve();

  constructor(
    transport: AppServerMessageTransport,
    client: AppServerClient = new AppServerClient(),
  ) {
    this.transport = transport;
    this.client = client;
  }

  async request<T>(
    requestMessage: protocol.JsonRpcRequest,
    method = requestMessage.method,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    throwIfRequestAborted(options.signal, method, requestMessage.id);
    this.transport.send(requestMessage);
    return await this.waitForResponse<T>(requestMessage.id, method, options);
  }

  async requestUntilFirstNotificationOrResponse<T>(
    requestMessage: protocol.JsonRpcRequest,
    method = requestMessage.method,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestFirstMessageResult<T>> {
    this.transport.send(requestMessage);
    const messages: protocol.JsonRpcMessage[] = [];
    const notifications: protocol.JsonRpcNotification[] = [];

    try {
      const message = await this.#nextMessageForRequest(
        requestMessage.id,
        method,
        options.timeoutMs,
        options.signal,
      );
      messages.push(message);

      if (protocol.isJsonRpcNotification(message)) {
        notifications.push(message);
        this.#mirroredNotifications.push(message);
        this.#detachedRequestIds.add(requestMessage.id);
        return {
          id: requestMessage.id,
          completed: false,
          notifications,
          messages,
        };
      }

      if (
        protocol.isJsonRpcErrorResponse(message) &&
        message.id === requestMessage.id
      ) {
        throw new AppServerRequestError(
          method,
          message,
          [...notifications],
          [...messages],
        );
      }

      if (
        protocol.isJsonRpcResponse(message) &&
        message.id === requestMessage.id
      ) {
        return {
          id: requestMessage.id,
          result: message.result as T,
          response: message,
          notifications,
          messages,
          completed: true,
        };
      }

      this.#detachedRequestIds.add(requestMessage.id);
      return {
        id: requestMessage.id,
        completed: false,
        notifications,
        messages,
      };
    } catch (error) {
      if (
        isAppServerTransportReadTimeoutError(error) ||
        error instanceof AppServerRequestAbortedError
      ) {
        if (error instanceof AppServerRequestAbortedError) {
          this.#sendCancelRequest(requestMessage.id);
        }
        this.#detachedRequestIds.add(requestMessage.id);
      }
      throw error;
    }
  }

  async waitForResponse<T>(
    id: protocol.RequestId,
    method: string,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    const messages: protocol.JsonRpcMessage[] = [];
    const notifications: protocol.JsonRpcNotification[] = [];
    const startedAt = Date.now();

    try {
      for (;;) {
        throwIfRequestAborted(options.signal, method, id);
        const remainingTimeoutMs = remainingRequestTimeoutMs(
          options.timeoutMs,
          startedAt,
        );
        let message: protocol.JsonRpcMessage;
        try {
          message = await this.#nextMessageForRequest(
            id,
            method,
            remainingTimeoutMs,
            options.signal,
          );
        } catch (error) {
          if (
            !isAppServerTransportReadTimeoutError(error) ||
            options.timeoutMs === undefined
          ) {
            throw error;
          }
          if (Date.now() - startedAt >= options.timeoutMs) {
            throw new Error(
              `timed out waiting for app-server message after ${options.timeoutMs}ms`,
            );
          }
          await this.#yieldReadTurn();
          continue;
        }
        throwIfRequestAborted(options.signal, method, id);
        messages.push(message);

        if (protocol.isJsonRpcNotification(message)) {
          notifications.push(message);
          this.#mirroredNotifications.push(message);
          await this.#yieldReadTurn();
          continue;
        }

        if (protocol.isJsonRpcErrorResponse(message) && message.id === id) {
          throw new AppServerRequestError(
            method,
            message,
            [...notifications],
            [...messages],
          );
        }

        if (protocol.isJsonRpcResponse(message) && message.id === id) {
          return {
            id,
            result: message.result as T,
            response: message,
            notifications,
            messages,
          };
        }
      }
    } catch (error) {
      if (error instanceof AppServerRequestAbortedError) {
        this.#sendCancelRequest(id);
        this.#detachedRequestIds.add(id);
      }
      throw error;
    }
  }

  async nextNotification(
    timeoutMs?: number,
  ): Promise<protocol.JsonRpcNotification> {
    for (;;) {
      const buffered = this.#shiftBufferedNotification();
      if (buffered) {
        this.#observeServerMessage(buffered);
        return buffered;
      }
      const notification = await this.#withTransportRead(
        timeoutMs,
        () => this.#shiftBufferedNotification(),
        (message) => {
          this.#observeServerMessage(message);
          if (this.#consumeDetachedRequestMessage(message)) {
            return undefined;
          }
          if (protocol.isJsonRpcNotification(message)) {
            return message;
          }
          this.#prependBufferedMessages([message]);
          return undefined;
        },
      );
      if (notification) {
        return notification;
      }
    }
  }

  async nextServerMessage(timeoutMs?: number): Promise<AppServerServerMessage> {
    for (;;) {
      const buffered = this.#shiftBufferedServerMessage();
      if (buffered) {
        return buffered;
      }
      const message = await this.#withTransportRead<
        AppServerServerMessage | undefined
      >(
        timeoutMs,
        () => this.#shiftBufferedServerMessage(),
        (incoming) => {
          if (this.#consumeDetachedRequestMessage(incoming)) {
            return undefined;
          }
          if (
            protocol.isJsonRpcNotification(incoming) ||
            protocol.isJsonRpcRequest(incoming)
          ) {
            this.#observeServerMessage(incoming);
            return incoming;
          }
          this.#prependBufferedMessages([incoming]);
          return undefined;
        },
      );
      if (message) {
        return message;
      }
    }
  }

  async nextMessage(timeoutMs?: number): Promise<protocol.JsonRpcMessage> {
    for (;;) {
      const buffered = this.#shiftBufferedMessage();
      if (buffered) {
        return buffered;
      }
      const message = await this.#withTransportRead<
        protocol.JsonRpcMessage | undefined
      >(
        timeoutMs,
        () => this.#shiftBufferedMessage(),
        (incoming) => {
          if (this.#consumeDetachedRequestMessage(incoming)) {
            return undefined;
          }
          this.#observeServerMessage(incoming);
          return incoming;
        },
      );
      if (message) {
        return message;
      }
    }
  }

  /**
   * Sends a response for an App Server initiated (typed server) request.
   * The request id is the only routing key; callers must not infer identity
   * from thread, turn, or action metadata.
   */
  respondServerRequest<T>(id: protocol.RequestId, result: T): void {
    this.#consumeServerRequestId(id);
    this.transport.send(protocol.response(id, result));
  }

  /** Sends a JSON-RPC error for an App Server initiated request. */
  rejectServerRequest(
    id: protocol.RequestId,
    error: protocol.JsonRpcError,
  ): void {
    this.#consumeServerRequestId(id);
    this.transport.send(protocol.errorResponse(id, error));
  }

  async #nextMessageForRequest(
    id: protocol.RequestId,
    method: string,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<protocol.JsonRpcMessage> {
    const startedAt = Date.now();

    for (;;) {
      throwIfRequestAborted(signal, method, id);
      const buffered = this.#shiftBufferedRequestMessage(id);
      if (buffered) {
        this.#observeServerMessage(buffered);
        throwIfRequestAborted(signal, method, id);
        return buffered;
      }

      const remainingTimeoutMs =
        timeoutMs === undefined
          ? undefined
          : Math.max(1, timeoutMs - (Date.now() - startedAt));
      const readTimeoutMs =
        remainingTimeoutMs === undefined
          ? APP_SERVER_TRANSPORT_READ_SLICE_MS
          : Math.min(remainingTimeoutMs, APP_SERVER_TRANSPORT_READ_SLICE_MS);
      let message: protocol.JsonRpcMessage | undefined;
      try {
        message = await this.#withTransportRead<
          protocol.JsonRpcMessage | undefined
        >(
          readTimeoutMs,
          () => this.#shiftBufferedRequestMessage(id),
          (incoming) => {
            this.#observeServerMessage(incoming);
            if (this.#consumeDetachedRequestMessage(incoming)) {
              return undefined;
            }
            if (protocol.isJsonRpcNotification(incoming)) {
              return incoming;
            }
            if (protocol.isJsonRpcResponse(incoming) && incoming.id === id) {
              return incoming;
            }
            if (
              protocol.isJsonRpcErrorResponse(incoming) &&
              incoming.id === id
            ) {
              return incoming;
            }
            this.#prependBufferedMessages([incoming]);
            return undefined;
          },
        );
      } catch (error) {
        if (!isAppServerTransportReadTimeoutError(error)) {
          throw error;
        }
        throwIfRequestAborted(signal, method, id);
        if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
          throw new Error(
            `timed out waiting for app-server message after ${timeoutMs}ms`,
          );
        }
        await this.#yieldReadTurn();
        continue;
      }

      if (message) {
        throwIfRequestAborted(signal, method, id);
        return message;
      }

      throwIfRequestAborted(signal, method, id);
      await this.#yieldReadTurn();
    }
  }

  #prependBufferedMessages(messages: protocol.JsonRpcMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    const retained = messages.filter(
      (message) => !this.#consumeDetachedRequestMessage(message),
    );
    if (retained.length === 0) {
      return;
    }
    this.#bufferedMessages = [...retained, ...this.#bufferedMessages];
  }

  #shiftBufferedMessage(): protocol.JsonRpcMessage | undefined {
    while (this.#bufferedMessages.length > 0) {
      const message = this.#bufferedMessages.shift();
      if (message && !this.#consumeDetachedRequestMessage(message)) {
        this.#observeServerMessage(message);
        return message;
      }
    }
    return undefined;
  }

  #shiftBufferedRequestMessage(
    id: protocol.RequestId,
  ): protocol.JsonRpcMessage | undefined {
    this.#dropDetachedBufferedRequestMessages();

    const notificationIndex = this.#bufferedMessages.findIndex(
      protocol.isJsonRpcNotification,
    );
    if (notificationIndex >= 0) {
      const [message] = this.#bufferedMessages.splice(notificationIndex, 1);
      return message;
    }

    const responseIndex = this.#bufferedMessages.findIndex((message) => {
      return (
        (protocol.isJsonRpcResponse(message) ||
          protocol.isJsonRpcErrorResponse(message)) &&
        message.id === id
      );
    });
    if (responseIndex < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(responseIndex, 1);
    return message;
  }

  #shiftBufferedNotification(): protocol.JsonRpcNotification | undefined {
    const mirrored = this.#mirroredNotifications.shift();
    if (mirrored) {
      return mirrored;
    }
    this.#dropDetachedBufferedRequestMessages();
    const index = this.#bufferedMessages.findIndex(
      protocol.isJsonRpcNotification,
    );
    if (index < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(index, 1);
    this.#observeServerMessage(message);
    return message as protocol.JsonRpcNotification;
  }

  #shiftBufferedServerMessage(): AppServerServerMessage | undefined {
    const mirrored = this.#mirroredNotifications.shift();
    if (mirrored) {
      this.#observeServerMessage(mirrored);
      return mirrored;
    }
    this.#dropDetachedBufferedRequestMessages();
    const index = this.#bufferedMessages.findIndex(
      (message) =>
        protocol.isJsonRpcNotification(message) ||
        protocol.isJsonRpcRequest(message),
    );
    if (index < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(index, 1);
    this.#observeServerMessage(message);
    return message as AppServerServerMessage;
  }

  #observeServerMessage(message: protocol.JsonRpcMessage): void {
    if (protocol.isJsonRpcRequest(message)) {
      if (this.#resolvedServerRequestIds.has(message.id)) {
        return;
      }
      this.#pendingServerRequestIds.add(message.id);
      return;
    }
    if (
      protocol.isJsonRpcNotification(message) &&
      message.method === protocol.METHOD_SERVER_REQUEST_RESOLVED
    ) {
      const params = message.params;
      if (
        params &&
        typeof params === "object" &&
        !Array.isArray(params) &&
        (typeof (params as { requestId?: unknown }).requestId === "string" ||
          typeof (params as { requestId?: unknown }).requestId === "number")
      ) {
        const requestId = (params as { requestId: protocol.RequestId })
          .requestId;
        this.#pendingServerRequestIds.delete(requestId);
        this.#resolvedServerRequestIds.add(requestId);
        while (this.#resolvedServerRequestIds.size > 2_048) {
          const oldest = this.#resolvedServerRequestIds.values().next().value;
          if (oldest === undefined) {
            break;
          }
          this.#resolvedServerRequestIds.delete(oldest);
        }
      }
    }
  }

  #consumeServerRequestId(id: protocol.RequestId): void {
    if (this.#pendingServerRequestIds.delete(id)) {
      return;
    }
    throw new Error(
      `unknown or already resolved server request id: ${String(id)}`,
    );
  }

  #dropDetachedBufferedRequestMessages(): void {
    this.#bufferedMessages = this.#bufferedMessages.filter(
      (message) => !this.#consumeDetachedRequestMessage(message),
    );
  }

  #consumeDetachedRequestMessage(message: protocol.JsonRpcMessage): boolean {
    if (
      (protocol.isJsonRpcResponse(message) ||
        protocol.isJsonRpcErrorResponse(message)) &&
      this.#detachedRequestIds.has(message.id)
    ) {
      this.#detachedRequestIds.delete(message.id);
      return true;
    }
    return false;
  }

  async #withTransportRead<T>(
    timeoutMs?: number,
    beforeRead?: () => T | undefined,
    afterRead?: (message: protocol.JsonRpcMessage) => T,
  ): Promise<T> {
    const previousRead = this.#transportReadLock;
    let releaseRead: () => void = () => undefined;
    this.#transportReadLock = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await previousRead;
    try {
      const buffered = beforeRead?.();
      if (buffered) {
        return buffered;
      }
      const message = await this.transport.nextMessage(timeoutMs);
      return afterRead ? afterRead(message) : (message as T);
    } finally {
      releaseRead();
    }
  }

  async #yieldReadTurn(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  #sendCancelRequest(id: protocol.RequestId): void {
    this.transport.send(protocol.cancelRequest(id));
  }
}

installAppServerConnectionMethods(AppServerConnection.prototype);

function isAppServerTransportReadTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("timed out waiting for app-server message after")
  );
}

function throwIfRequestAborted(
  signal: AbortSignal | undefined,
  method: string,
  id: protocol.RequestId,
): void {
  if (signal?.aborted) {
    throw new AppServerRequestAbortedError(method, id, signal.reason);
  }
}
