import { safeInvoke } from "@/lib/dev-bridge";

export const APP_SERVER_JSONRPC_VERSION = "2.0";
export const APP_SERVER_PROTOCOL_VERSION = "appserver.v0";
export const APP_SERVER_NAME = "app-server";

export const APP_SERVER_METHOD_INITIALIZE = "initialize";
export const APP_SERVER_METHOD_INITIALIZED = "initialized";
export const APP_SERVER_METHOD_CAPABILITY_LIST = "capability/list";
export const APP_SERVER_METHOD_ARTIFACT_READ = "artifact/read";
export const APP_SERVER_METHOD_EVIDENCE_EXPORT = "evidence/export";
export const APP_SERVER_METHOD_AGENT_SESSION_START = "agentSession/start";
export const APP_SERVER_METHOD_AGENT_SESSION_READ = "agentSession/read";
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_START =
  "agentSession/turn/start";
export const APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL =
  "agentSession/turn/cancel";
export const APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND =
  "agentSession/action/respond";
export const APP_SERVER_METHOD_AGENT_SESSION_EVENT = "agentSession/event";

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

export type AppServerRequestId = number | string;

export type AppServerJsonValue =
  | null
  | boolean
  | number
  | string
  | AppServerJsonValue[]
  | { [key: string]: AppServerJsonValue };

export type AppServerJsonRpcRequest = {
  id: AppServerRequestId;
  method: string;
  params?: unknown;
};

export type AppServerJsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type AppServerJsonRpcResponse<T = unknown> = {
  id: AppServerRequestId;
  result: T;
};

export type AppServerJsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type AppServerJsonRpcErrorResponse = {
  id: AppServerRequestId;
  error: AppServerJsonRpcError;
};

export type AppServerJsonRpcMessage<T = unknown> =
  | AppServerJsonRpcRequest
  | AppServerJsonRpcNotification
  | AppServerJsonRpcResponse<T>
  | AppServerJsonRpcErrorResponse;

export type AppServerClientInfo = {
  name: string;
  title?: string;
  version?: string;
};

export type AppServerClientCapabilities = {
  eventMethods?: string[];
  experimental?: boolean;
};

export type AppServerInitializeParams = {
  clientInfo: AppServerClientInfo;
  capabilities?: AppServerClientCapabilities;
};

export type AppServerInitializeResponse = {
  serverInfo: {
    name: string;
    version: string;
    protocolVersion: string;
  };
  platform: {
    family: string;
    os: string;
  };
  capabilities: {
    agentSession: boolean;
    capabilityDiscovery: boolean;
    artifact: boolean;
    evidence: boolean;
    workspace: boolean;
  };
};

export type AppServerBusinessObjectRef = {
  kind: string;
  id: string;
  title?: string;
  uri?: string;
  metadata?: unknown;
};

export type AppServerCapabilityListParams = {
  appId?: string;
  workspaceId?: string;
  sessionId?: string;
  cursor?: string;
  limit?: number;
};

export type AppServerCapabilityDescriptor = {
  id: string;
  title: string;
  description?: string;
  methods: string[];
};

export type AppServerCapabilityListResponse = {
  capabilities: AppServerCapabilityDescriptor[];
  nextCursor?: string;
};

export type AppServerArtifactReadParams = {
  sessionId: string;
  turnId?: string;
  artifactRef?: string;
  includeContent?: boolean;
  cursor?: string;
  limit?: number;
};

export type AppServerArtifactContentStatus =
  | "notRequested"
  | "available"
  | "unavailable";

export type AppServerArtifactSummary = {
  artifactRef: string;
  eventId: string;
  sequence: number;
  turnId?: string;
  artifactId?: string;
  path?: string;
  title?: string;
  kind?: string;
  status?: string;
  content?: string;
  contentStatus: AppServerArtifactContentStatus;
  metadata?: unknown;
};

export type AppServerArtifactReadResponse = {
  artifacts: AppServerArtifactSummary[];
  nextCursor?: string;
};

export type AppServerEvidenceExportParams = {
  sessionId: string;
  turnId?: string;
  includeEvents?: boolean;
  includeArtifacts?: boolean;
  includeEvidencePack?: boolean;
};

export type AppServerEvidenceExportResponse = {
  session: AppServerAgentSession;
  turns: AppServerAgentTurn[];
  events: AppServerAgentEvent[];
  artifacts: AppServerArtifactSummary[];
  exportedAt: string;
  evidencePack?: AppServerEvidencePackSummary;
};

export type AppServerEvidencePackSummary = {
  packRelativeRoot: string;
  packAbsoluteRoot?: string;
  exportedAt: string;
  threadStatus: string;
  latestTurnStatus?: string;
  turnCount: number;
  itemCount: number;
  pendingRequestCount: number;
  queuedTurnCount: number;
  recentArtifactCount: number;
  knownGaps: string[];
  observabilitySummary?: unknown;
  completionAuditSummary?: unknown;
  artifacts: AppServerEvidencePackArtifact[];
};

export type AppServerEvidencePackArtifact = {
  kind: string;
  title: string;
  relativePath: string;
  absolutePath?: string;
  bytes: number;
};

export type AppServerAgentSessionStartParams = {
  sessionId?: string;
  threadId?: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: AppServerBusinessObjectRef;
  locale?: string;
};

export type AppServerAgentSessionReadParams = {
  sessionId: string;
};

export type AppServerAgentInput = {
  text: string;
  attachments?: AppServerAgentAttachment[];
};

export type AppServerAgentAttachment = {
  kind: string;
  uri?: string;
  metadata?: unknown;
};

export type AppServerRuntimeOptions = {
  capabilityId?: string;
  stream?: boolean;
  eventName?: string;
  providerPreference?: string;
  modelPreference?: string;
  metadata?: unknown;
  queuedTurnId?: string;
  hostOptions?: unknown;
};

export type AppServerAgentSessionTurnStartParams = {
  sessionId: string;
  turnId?: string;
  input: AppServerAgentInput;
  runtimeOptions?: AppServerRuntimeOptions;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
};

export type AppServerAgentSessionTurnCancelParams = {
  sessionId: string;
  turnId: string;
};

export type AppServerAgentSessionActionType =
  | "tool_confirmation"
  | "ask_user"
  | "elicitation";

export type AppServerAgentSessionActionScope = {
  sessionId?: string;
  threadId?: string;
  turnId?: string;
};

export type AppServerAgentSessionActionRespondParams = {
  sessionId: string;
  requestId: string;
  actionType: AppServerAgentSessionActionType;
  confirmed: boolean;
  response?: string;
  userData?: unknown;
  metadata?: unknown;
  eventName?: string;
  actionScope?: AppServerAgentSessionActionScope;
};

export type AppServerAgentSessionStatus =
  | "idle"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AppServerAgentSession = {
  sessionId: string;
  threadId: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: AppServerBusinessObjectRef;
  status: AppServerAgentSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppServerAgentTurnStatus =
  | "accepted"
  | "queued"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AppServerAgentTurn = {
  turnId: string;
  sessionId: string;
  threadId: string;
  status: AppServerAgentTurnStatus;
  startedAt?: string;
  completedAt?: string;
};

export type AppServerAgentEvent = {
  eventId: string;
  sequence: number;
  sessionId: string;
  threadId?: string;
  turnId?: string;
  type: string;
  timestamp: string;
  payload: unknown;
};

export type AppServerAgentSessionStartResponse = {
  session: AppServerAgentSession;
};

export type AppServerAgentSessionReadResponse = {
  session: AppServerAgentSession;
  turns: AppServerAgentTurn[];
};

export type AppServerAgentSessionTurnStartResponse = {
  turn: AppServerAgentTurn;
};

export type AppServerAgentSessionTurnCancelResponse = Record<string, never>;
export type AppServerAgentSessionActionRespondResponse = Record<string, never>;

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

  constructor(error: AppServerJsonRpcError) {
    super(error.message);
    this.name = "AppServerRpcError";
    this.code = error.code;
    this.data = error.data;
  }
}

export async function handleAppServerJsonLines(
  request: AppServerHandleJsonLinesRequest,
): Promise<AppServerHandleJsonLinesResult> {
  return await safeInvoke<AppServerHandleJsonLinesResult>(
    "app_server_handle_json_lines",
    { request },
  );
}

export async function drainAppServerEvents(
  request: AppServerDrainEventsRequest = {},
): Promise<AppServerDrainEventsResult> {
  return await safeInvoke<AppServerDrainEventsResult>(
    "app_server_drain_events",
    { request },
  );
}

export function createAppServerRequest(
  id: AppServerRequestId,
  method: string,
  params?: unknown,
): AppServerJsonRpcRequest {
  return compactParams({ id, method, params });
}

export function createAppServerNotification(
  method: string,
  params?: unknown,
): AppServerJsonRpcNotification {
  return compactParams({ method, params });
}

export function encodeAppServerMessage(
  message: AppServerJsonRpcMessage,
): string {
  return `${JSON.stringify(message)}\n`;
}

export function decodeAppServerMessage(line: string): AppServerJsonRpcMessage {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("empty App Server JSON-RPC line");
  }
  return JSON.parse(trimmed) as AppServerJsonRpcMessage;
}

export function decodeAppServerMessages(
  lines: string[],
): AppServerJsonRpcMessage[] {
  return lines.map(decodeAppServerMessage);
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
  ): Promise<AppServerRequestResult<AppServerAgentSessionActionRespondResponse>> {
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
    throw new AppServerRpcError(error.error);
  }

  throw new Error(
    `expected ${method} response for App Server request ${String(id)}`,
  );
}

export function isAppServerJsonRpcNotification(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcNotification {
  return "method" in message && !("id" in message);
}

export function isAppServerJsonRpcResponse<T = unknown>(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcResponse<T> {
  return "id" in message && "result" in message;
}

export function isAppServerJsonRpcErrorResponse(
  message: AppServerJsonRpcMessage,
): message is AppServerJsonRpcErrorResponse {
  return "id" in message && "error" in message;
}

function assertAppServerProtocol(response: AppServerInitializeResponse): void {
  if (response.serverInfo.protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw new Error(
      `unsupported app-server protocol: expected ${APP_SERVER_PROTOCOL_VERSION}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}

function compactParams<T extends { params?: unknown }>(value: T): T {
  if (value.params === undefined) {
    const { params: _params, ...rest } = value;
    return rest as T;
  }
  return value;
}
