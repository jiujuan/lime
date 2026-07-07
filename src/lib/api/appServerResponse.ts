import {
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
} from "../../../packages/app-server-client/src/protocol";
import {
  APP_SERVER_METHOD_CONFIG_WARNING,
  APP_SERVER_PROTOCOL_VERSION,
} from "./appServerConstants";
import type {
  AppServerConfigWarningJsonRpcNotification,
  AppServerConfigWarningNotification,
  AppServerInitializeResponse,
  AppServerJsonRpcErrorResponse,
  AppServerJsonRpcMessage,
  AppServerJsonRpcNotification,
  AppServerJsonRpcResponse,
  AppServerRequestId,
  AppServerRequestResult,
} from "./appServerTypes";

export class AppServerRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  readonly response: AppServerJsonRpcErrorResponse;
  readonly notifications: AppServerJsonRpcNotification[];
  readonly configWarnings: AppServerConfigWarningNotification[];
  readonly messages: AppServerJsonRpcMessage[];

  constructor(
    response: AppServerJsonRpcErrorResponse,
    notifications: AppServerJsonRpcNotification[] = [],
    messages: AppServerJsonRpcMessage[] = [],
  ) {
    super(response.error.message);
    this.name = "AppServerRpcError";
    this.code = response.error.code;
    this.data = response.error.data;
    this.response = response;
    this.notifications = notifications;
    this.configWarnings = readAppServerConfigWarnings(notifications);
    this.messages = messages;
  }
}

export function expectAppServerResponse<T>(
  messages: AppServerJsonRpcMessage[],
  id: AppServerRequestId,
  method: string,
): AppServerRequestResult<T> {
  const notifications = messages.filter(isAppServerJsonRpcNotification);
  const response = messages.find(
    (message): message is AppServerJsonRpcResponse<T> => {
      return isAppServerJsonRpcResponse(message) && message.id === id;
    },
  );
  if (response) {
    return {
      id,
      result: response.result,
      response,
      notifications,
      configWarnings: readAppServerConfigWarnings(notifications),
      messages,
    };
  }

  const error = messages.find(
    (message): message is AppServerJsonRpcErrorResponse => {
      return isAppServerJsonRpcErrorResponse(message) && message.id === id;
    },
  );
  if (error) {
    throw new AppServerRpcError(error, notifications, messages);
  }

  throw new Error(
    `expected ${method} response for App Server request ${String(id)}`,
  );
}

export function isAppServerJsonRpcNotification(
  message: unknown,
): message is AppServerJsonRpcNotification {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  if (!("method" in message) || "id" in message) {
    return false;
  }
  return isJsonRpcNotification(message as AppServerJsonRpcMessage);
}

export function isAppServerConfigWarningNotification(
  message: unknown,
): message is AppServerConfigWarningJsonRpcNotification {
  if (!isAppServerJsonRpcNotification(message)) {
    return false;
  }
  if (message.method !== APP_SERVER_METHOD_CONFIG_WARNING) {
    return false;
  }
  return isConfigWarningParams(message.params);
}

export function readAppServerConfigWarnings(
  notifications: AppServerJsonRpcNotification[] | undefined,
): AppServerConfigWarningNotification[] {
  if (!notifications?.length) {
    return [];
  }
  return notifications
    .filter(isAppServerConfigWarningNotification)
    .map((notification) => notification.params);
}

function isConfigWarningParams(
  params: unknown,
): params is AppServerConfigWarningNotification {
  return (
    !!params &&
    typeof params === "object" &&
    !Array.isArray(params) &&
    typeof (params as { summary?: unknown }).summary === "string"
  );
}

export function isAppServerJsonRpcResponse<T = unknown>(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcResponse<T> {
  return isJsonRpcResponse<T>(message);
}

export function isAppServerJsonRpcErrorResponse(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcErrorResponse {
  return isJsonRpcErrorResponse(message);
}

export function assertAppServerProtocol(
  response: AppServerInitializeResponse,
): void {
  if (response.serverInfo.protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw new Error(
      `unsupported app-server protocol: expected ${APP_SERVER_PROTOCOL_VERSION}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}
