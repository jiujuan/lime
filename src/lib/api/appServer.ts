import { safeInvoke } from "@/lib/dev-bridge";
import {
  JSONRPC_VERSION,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_CAPABILITY_LIST,
  METHOD_EVIDENCE_EXPORT,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  PROTOCOL_VERSION,
  SERVER_NAME,
  decodeMessage,
  decodeMessages,
  encodeMessage,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  request as createProtocolRequest,
  notification as createProtocolNotification,
  type AgentAttachment,
  type AgentEvent,
  type AgentInput,
  type AgentSession,
  type AgentSessionActionRespondParams,
  type AgentSessionActionRespondResponse,
  type AgentSessionActionScope,
  type AgentSessionActionType,
  type AgentSessionReadParams,
  type AgentSessionReadResponse,
  type AgentSessionStartParams,
  type AgentSessionStartResponse,
  type AgentSessionStatus,
  type AgentSessionTurnCancelParams,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AgentSessionUpdateParams,
  type AgentSessionUpdateResponse,
  type AgentTurn,
  type AgentTurnStatus,
  type ArtifactContentStatus,
  type ArtifactReadParams,
  type ArtifactReadResponse,
  type ArtifactSummary,
  type BusinessObjectRef,
  type CapabilityDescriptor,
  type CapabilityListParams,
  type CapabilityListResponse,
  type ClientCapabilities,
  type ClientInfo,
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type EvidencePackArtifact,
  type EvidencePackSummary,
  type FileSystemDirectoryListing,
  type FileSystemFileEntry,
  type FileSystemFilePreview,
  type FileSystemListDirectoryParams,
  type FileSystemReadFilePreviewParams,
  type InitializeParams,
  type InitializeResponse,
  type JsonRpcError,
  type JsonRpcErrorResponse,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonValue,
  type RequestId,
  type RuntimeOptions,
} from "../../../packages/app-server-client/src/protocol";

export const APP_SERVER_JSONRPC_VERSION = JSONRPC_VERSION;
export const APP_SERVER_PROTOCOL_VERSION = PROTOCOL_VERSION;
export const APP_SERVER_NAME = SERVER_NAME;

export const APP_SERVER_METHOD_INITIALIZE = METHOD_INITIALIZE;
export const APP_SERVER_METHOD_INITIALIZED = METHOD_INITIALIZED;
export const APP_SERVER_METHOD_CAPABILITY_LIST = METHOD_CAPABILITY_LIST;
export const APP_SERVER_METHOD_ARTIFACT_READ = METHOD_ARTIFACT_READ;
export const APP_SERVER_METHOD_FILE_SYSTEM_LIST_DIRECTORY =
  METHOD_FILE_SYSTEM_LIST_DIRECTORY;
export const APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW =
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
export const APP_SERVER_METHOD_EVIDENCE_EXPORT = METHOD_EVIDENCE_EXPORT;
export const APP_SERVER_METHOD_AGENT_SESSION_START = METHOD_AGENT_SESSION_START;
export const APP_SERVER_METHOD_AGENT_SESSION_READ = METHOD_AGENT_SESSION_READ;
export const APP_SERVER_METHOD_AGENT_SESSION_UPDATE =
  METHOD_AGENT_SESSION_UPDATE;
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_START =
  METHOD_AGENT_SESSION_TURN_START;
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL =
  METHOD_AGENT_SESSION_TURN_CANCEL;
export const APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND =
  METHOD_AGENT_SESSION_ACTION_RESPOND;
export const APP_SERVER_METHOD_AGENT_SESSION_EVENT = METHOD_AGENT_SESSION_EVENT;

export type AppServerHandleJsonLinesRequest = {
  lines: string[];
};

export type AppServerHandleJsonLinesResult = {
  lines: string[];
};

export type AppServerDrainEventsRequest = {
  limit?: number;
};

export type AppServerDrainEventsResult = {
  lines: string[];
};

type AppServerSafeInvokeEnvelope<T> = T | { result?: T };

export type AppServerRequestId = RequestId;
export type AppServerJsonValue = JsonValue;
export type AppServerJsonRpcRequest = JsonRpcRequest;
export type AppServerJsonRpcNotification = JsonRpcNotification;
export type AppServerJsonRpcResponse<T = unknown> = JsonRpcResponse<T>;
export type AppServerJsonRpcError = JsonRpcError;
export type AppServerJsonRpcErrorResponse = JsonRpcErrorResponse;
export type AppServerJsonRpcMessage<T = unknown> = JsonRpcMessage<T>;
export type AppServerClientInfo = ClientInfo;
export type AppServerClientCapabilities = ClientCapabilities;
export type AppServerInitializeParams = InitializeParams;
export type AppServerInitializeResponse = InitializeResponse;
export type AppServerBusinessObjectRef = BusinessObjectRef;
export type AppServerCapabilityListParams = CapabilityListParams;
export type AppServerCapabilityDescriptor = CapabilityDescriptor;
export type AppServerCapabilityListResponse = CapabilityListResponse;
export type AppServerArtifactReadParams = ArtifactReadParams;
export type AppServerArtifactContentStatus = ArtifactContentStatus;
export type AppServerArtifactSummary = ArtifactSummary;
export type AppServerArtifactReadResponse = ArtifactReadResponse;
export type AppServerFileSystemListDirectoryParams =
  FileSystemListDirectoryParams;
export type AppServerFileSystemReadFilePreviewParams =
  FileSystemReadFilePreviewParams;
export type AppServerFileSystemDirectoryListing = FileSystemDirectoryListing;
export type AppServerFileSystemFileEntry = FileSystemFileEntry;
export type AppServerFileSystemFilePreview = FileSystemFilePreview;
export type AppServerEvidenceExportParams = EvidenceExportParams;
export type AppServerEvidenceExportResponse = EvidenceExportResponse;
export type AppServerEvidencePackSummary = EvidencePackSummary;
export type AppServerEvidencePackArtifact = EvidencePackArtifact;
export type AppServerAgentSessionStartParams = AgentSessionStartParams;
export type AppServerAgentSessionReadParams = AgentSessionReadParams;
export type AppServerAgentInput = AgentInput;
export type AppServerAgentAttachment = AgentAttachment;
export type AppServerRuntimeOptions = RuntimeOptions;
export type AppServerAgentSessionTurnStartParams = AgentSessionTurnStartParams;
export type AppServerAgentSessionTurnCancelParams =
  AgentSessionTurnCancelParams;
export type AppServerAgentSessionActionType = AgentSessionActionType;
export type AppServerAgentSessionActionScope = AgentSessionActionScope;
export type AppServerAgentSessionActionRespondParams =
  AgentSessionActionRespondParams;
export type AppServerAgentSessionStatus = AgentSessionStatus;
export type AppServerAgentSession = AgentSession;
export type AppServerAgentTurnStatus = AgentTurnStatus;
export type AppServerAgentTurn = AgentTurn;
export type AppServerAgentEvent = AgentEvent;
export type AppServerAgentSessionStartResponse = AgentSessionStartResponse;
export type AppServerAgentSessionReadResponse = AgentSessionReadResponse;
export type AppServerAgentSessionUpdateParams = AgentSessionUpdateParams;
export type AppServerAgentSessionUpdateResponse = AgentSessionUpdateResponse;
export type AppServerAgentSessionTurnStartResponse =
  AgentSessionTurnStartResponse;
export type AppServerAgentSessionTurnCancelResponse =
  AgentSessionTurnCancelResponse;
export type AppServerAgentSessionActionRespondResponse =
  AgentSessionActionRespondResponse;

export type AppServerRequestResult<T> = {
  id: AppServerRequestId;
  result: T;
  response: AppServerJsonRpcResponse<T>;
  notifications: AppServerJsonRpcNotification[];
  messages: AppServerJsonRpcMessage[];
};

export class AppServerRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  readonly response: AppServerJsonRpcErrorResponse;
  readonly notifications: AppServerJsonRpcNotification[];
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
    this.messages = messages;
  }
}

export async function handleAppServerJsonLines(
  request: AppServerHandleJsonLinesRequest,
): Promise<AppServerHandleJsonLinesResult> {
  return unwrapAppServerSafeInvokeResult(
    await safeInvoke<
      AppServerSafeInvokeEnvelope<AppServerHandleJsonLinesResult>
    >("app_server_handle_json_lines", { request }),
  );
}

export async function drainAppServerEvents(
  request: AppServerDrainEventsRequest = {},
): Promise<AppServerDrainEventsResult> {
  return unwrapAppServerSafeInvokeResult(
    await safeInvoke<AppServerSafeInvokeEnvelope<AppServerDrainEventsResult>>(
      "app_server_drain_events",
      { request },
    ),
  );
}

function unwrapAppServerSafeInvokeResult<T>(
  payload: AppServerSafeInvokeEnvelope<T>,
): T {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "result" in payload
  ) {
    return (payload as { result?: T }).result as T;
  }
  return payload as T;
}

export function createAppServerRequest(
  id: AppServerRequestId,
  method: string,
  params?: unknown,
): AppServerJsonRpcRequest {
  return createProtocolRequest(id, method, params);
}

export function createAppServerNotification(
  method: string,
  params?: unknown,
): AppServerJsonRpcNotification {
  return createProtocolNotification(method, params);
}

export function encodeAppServerMessage(
  message: AppServerJsonRpcMessage,
): string {
  return encodeMessage(message);
}

export function decodeAppServerMessage(line: string): AppServerJsonRpcMessage {
  return decodeMessage(line);
}

export function decodeAppServerMessages(
  lines: string[],
): AppServerJsonRpcMessage[] {
  return decodeMessages(lines);
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

  async startSession(
    params: AppServerAgentSessionStartParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionStartResponse>> {
    return await this.request<AppServerAgentSessionStartResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_START,
      params,
    );
  }

  async listCapabilities(
    params: AppServerCapabilityListParams = {},
  ): Promise<AppServerRequestResult<AppServerCapabilityListResponse>> {
    return await this.request<AppServerCapabilityListResponse>(
      APP_SERVER_METHOD_CAPABILITY_LIST,
      params,
    );
  }

  async readArtifacts(
    params: AppServerArtifactReadParams,
  ): Promise<AppServerRequestResult<AppServerArtifactReadResponse>> {
    return await this.request<AppServerArtifactReadResponse>(
      APP_SERVER_METHOD_ARTIFACT_READ,
      params,
    );
  }

  async listDirectory(
    params: AppServerFileSystemListDirectoryParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemDirectoryListing>> {
    return await this.request<AppServerFileSystemDirectoryListing>(
      APP_SERVER_METHOD_FILE_SYSTEM_LIST_DIRECTORY,
      params,
    );
  }

  async readFilePreview(
    params: AppServerFileSystemReadFilePreviewParams,
  ): Promise<AppServerRequestResult<AppServerFileSystemFilePreview>> {
    return await this.request<AppServerFileSystemFilePreview>(
      APP_SERVER_METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
      params,
    );
  }

  async exportEvidence(
    params: AppServerEvidenceExportParams,
  ): Promise<AppServerRequestResult<AppServerEvidenceExportResponse>> {
    return await this.request<AppServerEvidenceExportResponse>(
      APP_SERVER_METHOD_EVIDENCE_EXPORT,
      params,
    );
  }

  async readSession(
    params: AppServerAgentSessionReadParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionReadResponse>> {
    return await this.request<AppServerAgentSessionReadResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_READ,
      params,
    );
  }

  async updateSession(
    params: AppServerAgentSessionUpdateParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionUpdateResponse>> {
    return await this.request<AppServerAgentSessionUpdateResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_UPDATE,
      params,
    );
  }

  async startTurn(
    params: AppServerAgentSessionTurnStartParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionTurnStartResponse>> {
    return await this.request<AppServerAgentSessionTurnStartResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
      params,
    );
  }

  async cancelTurn(
    params: AppServerAgentSessionTurnCancelParams,
  ): Promise<AppServerRequestResult<AppServerAgentSessionTurnCancelResponse>> {
    return await this.request<AppServerAgentSessionTurnCancelResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL,
      params,
    );
  }

  async respondAction(
    params: AppServerAgentSessionActionRespondParams,
  ): Promise<
    AppServerRequestResult<AppServerAgentSessionActionRespondResponse>
  > {
    return await this.request<AppServerAgentSessionActionRespondResponse>(
      APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      params,
    );
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

export function createAppServerClient(options?: {
  initialRequestId?: number;
}): AppServerClient {
  return new AppServerClient(options);
}

export function expectAppServerResponse<T>(
  messages: AppServerJsonRpcMessage[],
  id: AppServerRequestId,
  method: string,
): AppServerRequestResult<T> {
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
      notifications: messages.filter(isAppServerJsonRpcNotification),
      messages,
    };
  }

  const error = messages.find(
    (message): message is AppServerJsonRpcErrorResponse => {
      return isAppServerJsonRpcErrorResponse(message) && message.id === id;
    },
  );
  if (error) {
    throw new AppServerRpcError(
      error,
      messages.filter(isAppServerJsonRpcNotification),
      messages,
    );
  }

  throw new Error(
    `expected ${method} response for App Server request ${String(id)}`,
  );
}

export function isAppServerJsonRpcNotification(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcNotification {
  return isJsonRpcNotification(message);
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

function assertAppServerProtocol(response: AppServerInitializeResponse): void {
  if (response.serverInfo.protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw new Error(
      `unsupported app-server protocol: expected ${APP_SERVER_PROTOCOL_VERSION}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}
