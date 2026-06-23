import {
  APP_SERVER_METHOD_INITIALIZED,
  APP_SERVER_METHOD_INITIALIZE,
} from "./appServerConstants";
import { installAppServerClientMethods } from "./appServerClientMethods";
import {
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
  AppServerInitializeParams,
  AppServerInitializeResponse,
  AppServerJsonRpcMessage,
  AppServerRequestId,
  AppServerRequestResult,
} from "./appServerTypes";

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
  ): Promise<AppServerRequestResult<T>> {
    const request = createAppServerRequest(this.nextId(), method, params);
    const messages = await this.exchange([request]);
    return expectAppServerResponse<T>(messages, request.id, method);
  }

  async notify(
    method: string,
    params?: unknown,
  ): Promise<AppServerJsonRpcMessage[]> {
    return await this.exchange([createAppServerNotification(method, params)]);
  }

  async exchange(
    messages: AppServerJsonRpcMessage[],
  ): Promise<AppServerJsonRpcMessage[]> {
    const response = await handleAppServerJsonLines({
      lines: messages.map(encodeAppServerMessage),
    });
    return decodeAppServerMessages(response.lines);
  }

  async drainEvents(limit?: number): Promise<AppServerJsonRpcMessage[]> {
    const response = await drainAppServerEvents({ limit });
    return decodeAppServerMessages(response.lines);
  }
}

installAppServerClientMethods(AppServerClient.prototype);

export function createAppServerClient(options?: {
  initialRequestId?: number;
}): AppServerClient {
  return new AppServerClient(options);
}
