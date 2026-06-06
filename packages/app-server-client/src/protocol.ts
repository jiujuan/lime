export const JSONRPC_VERSION = "2.0";
export const PROTOCOL_VERSION = "appserver.v0";
export const SERVER_NAME = "app-server";

export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_CAPABILITY_LIST = "capability/list";
export const METHOD_ARTIFACT_READ = "artifact/read";
export const METHOD_EVIDENCE_EXPORT = "evidence/export";
export const METHOD_AGENT_SESSION_LIST = "agentSession/list";
export const METHOD_WORKSPACE_LIST = "workspace/list";
export const METHOD_WORKSPACE_READ = "workspace/read";
export const METHOD_WORKSPACE_BY_PATH_READ = "workspace/byPath/read";
export const METHOD_WORKSPACE_DEFAULT_READ = "workspace/default/read";
export const METHOD_WORKSPACE_DEFAULT_ENSURE = "workspace/default/ensure";
export const METHOD_WORKSPACE_PROJECTS_ROOT_READ =
  "workspace/projectsRoot/read";
export const METHOD_WORKSPACE_PROJECT_PATH_RESOLVE =
  "workspace/projectPath/resolve";
export const METHOD_WORKSPACE_ENSURE_READY = "workspace/ensureReady";
export const METHOD_SKILL_LIST = "skill/list";
export const METHOD_SKILL_READ = "skill/read";
export const METHOD_WORKSPACE_SKILL_BINDINGS_LIST =
  "workspaceSkillBindings/list";
export const METHOD_AGENT_APP_INSTALLED_LIST = "agentAppInstalled/list";
export const METHOD_KNOWLEDGE_PACK_LIST = "knowledgePack/list";
export const METHOD_AUTOMATION_JOB_LIST = "automationJob/list";
export const METHOD_PROJECT_MEMORY_READ = "projectMemory/read";
export const METHOD_AGENT_SESSION_START = "agentSession/start";
export const METHOD_AGENT_SESSION_READ = "agentSession/read";
export const METHOD_AGENT_SESSION_TURN_START = "agentSession/turn/start";
export const METHOD_AGENT_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
export const METHOD_AGENT_SESSION_ACTION_RESPOND =
  "agentSession/action/respond";
export const METHOD_AGENT_SESSION_EVENT = "agentSession/event";
export const METHOD_MODEL_LIST = "model/list";
export const METHOD_MODEL_PREFERENCES_LIST = "modelPreferences/list";
export const METHOD_MODEL_SYNC_STATE_READ = "modelSyncState/read";
export const METHOD_MODEL_PROVIDER_LIST = "modelProvider/list";
export const METHOD_MODEL_PROVIDER_CATALOG_LIST = "modelProvider/catalog/list";
export const METHOD_MODEL_PROVIDER_ALIAS_READ = "modelProviderAlias/read";
export const METHOD_MODEL_PROVIDER_ALIAS_LIST = "modelProviderAlias/list";

export type AppServerMethodKind = "request" | "notification";

export type AppServerMethodSpec = {
  method: string;
  kind: AppServerMethodKind;
};

export const APP_SERVER_METHODS = [
  { method: METHOD_INITIALIZE, kind: "request" },
  { method: METHOD_INITIALIZED, kind: "notification" },
  { method: METHOD_CAPABILITY_LIST, kind: "request" },
  { method: METHOD_ARTIFACT_READ, kind: "request" },
  { method: METHOD_EVIDENCE_EXPORT, kind: "request" },
  { method: METHOD_AGENT_SESSION_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_LIST, kind: "request" },
  { method: METHOD_WORKSPACE_READ, kind: "request" },
  { method: METHOD_WORKSPACE_BY_PATH_READ, kind: "request" },
  { method: METHOD_WORKSPACE_DEFAULT_READ, kind: "request" },
  { method: METHOD_WORKSPACE_DEFAULT_ENSURE, kind: "request" },
  { method: METHOD_WORKSPACE_PROJECTS_ROOT_READ, kind: "request" },
  { method: METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, kind: "request" },
  { method: METHOD_WORKSPACE_ENSURE_READY, kind: "request" },
  { method: METHOD_SKILL_LIST, kind: "request" },
  { method: METHOD_SKILL_READ, kind: "request" },
  { method: METHOD_WORKSPACE_SKILL_BINDINGS_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_LIST, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_LIST, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_LIST, kind: "request" },
  { method: METHOD_PROJECT_MEMORY_READ, kind: "request" },
  { method: METHOD_MODEL_LIST, kind: "request" },
  { method: METHOD_MODEL_PREFERENCES_LIST, kind: "request" },
  { method: METHOD_MODEL_SYNC_STATE_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CATALOG_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_LIST, kind: "request" },
  { method: METHOD_AGENT_SESSION_START, kind: "request" },
  { method: METHOD_AGENT_SESSION_READ, kind: "request" },
  { method: METHOD_AGENT_SESSION_TURN_START, kind: "request" },
  { method: METHOD_AGENT_SESSION_TURN_CANCEL, kind: "request" },
  { method: METHOD_AGENT_SESSION_ACTION_RESPOND, kind: "request" },
  { method: METHOD_AGENT_SESSION_EVENT, kind: "notification" },
] as const satisfies readonly AppServerMethodSpec[];

export const ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  runtimeError: -32000,
  notInitialized: -32002,
  alreadyInitialized: -32003,
  sessionNotFound: -32010,
  turnNotActive: -32011,
  sessionAlreadyExists: -32013,
  capabilityDenied: -32020,
} as const;

export type RequestId = number | string;
export type RpcResult = unknown;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRpcRequest = {
  id: RequestId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type JsonRpcResponse<T = RpcResult> = {
  id: RequestId;
  result: T;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcErrorResponse = {
  id: RequestId;
  error: JsonRpcError;
};

export type JsonRpcMessage<T = RpcResult> =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse<T>
  | JsonRpcErrorResponse;

export type ClientInfo = {
  name: string;
  title?: string;
  version?: string;
};

export type ClientCapabilities = {
  eventMethods?: string[];
  experimental?: boolean;
};

export type InitializeParams = {
  clientInfo: ClientInfo;
  capabilities?: ClientCapabilities;
};

export type InitializeResponse = {
  serverInfo: ServerInfo;
  platform: PlatformInfo;
  capabilities: ServerCapabilities;
};

export type ServerInfo = {
  name: string;
  version: string;
  protocolVersion: string;
};

export type PlatformInfo = {
  family: string;
  os: string;
};

export type ServerCapabilities = {
  agentSession: boolean;
  capabilityDiscovery: boolean;
  artifact: boolean;
  evidence: boolean;
  workspace: boolean;
};

export type CapabilityListParams = {
  appId?: string;
  workspaceId?: string;
  sessionId?: string;
  cursor?: string;
  limit?: number;
};

export type CapabilityDescriptor = {
  id: string;
  title: string;
  description?: string;
  methods: string[];
};

export type CapabilityListResponse = {
  capabilities: CapabilityDescriptor[];
  nextCursor?: string;
};

export type ArtifactReadParams = {
  sessionId: string;
  turnId?: string;
  artifactRef?: string;
  includeContent?: boolean;
  cursor?: string;
  limit?: number;
};

export type ArtifactContentStatus =
  | "notRequested"
  | "available"
  | "unavailable";

export type ArtifactSummary = {
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
  contentStatus: ArtifactContentStatus;
  metadata?: unknown;
};

export type ArtifactReadResponse = {
  artifacts: ArtifactSummary[];
  nextCursor?: string;
};

export type EvidenceExportParams = {
  sessionId: string;
  turnId?: string;
  includeEvents?: boolean;
  includeArtifacts?: boolean;
  includeEvidencePack?: boolean;
};

export type EvidenceExportResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  events: AgentEvent[];
  artifacts: ArtifactSummary[];
  exportedAt: string;
  evidencePack?: EvidencePackSummary;
};

export type EvidencePackSummary = {
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
  artifacts: EvidencePackArtifact[];
};

export type EvidencePackArtifact = {
  kind: string;
  title: string;
  relativePath: string;
  absolutePath?: string;
  bytes: number;
};

export type BusinessObjectRef = {
  kind: string;
  id: string;
  title?: string;
  uri?: string;
  metadata?: unknown;
};

export type AgentSessionStartParams = {
  sessionId?: string;
  threadId?: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: BusinessObjectRef;
  locale?: string;
};

export type AgentSessionReadParams = {
  sessionId: string;
  historyLimit?: number;
  historyOffset?: number;
  historyBeforeMessageId?: number;
};

export type AgentSessionListParams = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
  workspaceId?: string;
  limit?: number;
};

export type AgentInput = {
  text: string;
  attachments?: AgentAttachment[];
};

export type AgentAttachment = {
  kind: string;
  uri?: string;
  metadata?: unknown;
};

export type RuntimeOptions = {
  capabilityId?: string;
  stream?: boolean;
  eventName?: string;
  providerPreference?: string;
  modelPreference?: string;
  metadata?: unknown;
  queuedTurnId?: string;
  hostOptions?: unknown;
};

export type AgentSessionTurnStartParams = {
  sessionId: string;
  turnId?: string;
  input: AgentInput;
  runtimeOptions?: RuntimeOptions;
  queueIfBusy?: boolean;
  skipPreSubmitResume?: boolean;
};

export type AgentSessionTurnCancelParams = {
  sessionId: string;
  turnId: string;
};

export type AgentSessionActionType =
  | "tool_confirmation"
  | "ask_user"
  | "elicitation";

export type AgentSessionActionScope = {
  sessionId?: string;
  threadId?: string;
  turnId?: string;
};

export type AgentSessionActionRespondParams = {
  sessionId: string;
  requestId: string;
  actionType: AgentSessionActionType;
  confirmed: boolean;
  response?: string;
  userData?: unknown;
  metadata?: unknown;
  eventName?: string;
  actionScope?: AgentSessionActionScope;
};

export type AgentSessionStatus =
  | "idle"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AgentSession = {
  sessionId: string;
  threadId: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: BusinessObjectRef;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentTurnStatus =
  | "accepted"
  | "queued"
  | "running"
  | "waitingAction"
  | "completed"
  | "failed"
  | "canceled";

export type AgentTurn = {
  turnId: string;
  sessionId: string;
  threadId: string;
  status: AgentTurnStatus;
  startedAt?: string;
  completedAt?: string;
};

export type AgentEvent = {
  eventId: string;
  sequence: number;
  sessionId: string;
  threadId?: string;
  turnId?: string;
  type: string;
  timestamp: string;
  payload: unknown;
};

export type AgentSessionStartResponse = {
  session: AgentSession;
};

export type AgentSessionOverview = {
  sessionId: string;
  threadId?: string;
  title?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  workspaceId?: string;
  workingDir?: string;
  executionStrategy?: string;
  messagesCount: number;
};

export type AgentSessionListResponse = {
  sessions: AgentSessionOverview[];
};

export type WorkspaceReadParams = {
  id: string;
};

export type WorkspacePathReadParams = {
  rootPath: string;
};

export type WorkspaceProjectPathResolveParams = {
  name: string;
  parentRootPath?: string;
};

export type WorkspaceEnsureParams = {
  id: string;
};

export type WorkspaceListResponse = {
  workspaces: unknown[];
};

export type WorkspaceReadResponse = {
  workspace?: unknown;
};

export type WorkspaceProjectsRootReadResponse = {
  rootPath: string;
};

export type WorkspaceProjectPathResolveResponse = {
  rootPath: string;
};

export type WorkspaceEnsureReadyResponse = {
  result: unknown;
};

export type SkillReadParams = {
  skillName: string;
};

export type SkillListResponse = {
  skills: unknown[];
};

export type SkillReadResponse = {
  skill: unknown;
};

export type WorkspaceSkillBindingsListParams = {
  workspaceRoot: string;
  caller?: string;
  workbench?: boolean;
  browserAssist?: boolean;
};

export type WorkspaceSkillBindingsListResponse = {
  bindings: unknown;
};

export type AgentAppInstalledListResponse = {
  states: unknown[];
  issues: unknown[];
};

export type KnowledgeListPacksParams = {
  workingDir: string;
  includeArchived?: boolean;
};

export type KnowledgeListPacksResponse = {
  workingDir: string;
  rootPath: string;
  packs: unknown[];
};

export type AutomationJobListResponse = {
  jobs: unknown[];
};

export type ProjectMemoryReadParams = {
  projectId: string;
};

export type ProjectMemoryReadResponse = {
  memory: unknown;
};

export type AgentSessionReadResponse = {
  session: AgentSession;
  turns: AgentTurn[];
  detail?: unknown;
};

export type AgentSessionTurnStartResponse = {
  turn: AgentTurn;
};

export type AgentSessionTurnCancelResponse = Record<string, never>;
export type AgentSessionActionRespondResponse = Record<string, never>;

export type AgentSessionEventParams = {
  event: AgentEvent;
};

export type AgentSessionEventNotification = JsonRpcNotification & {
  method: typeof METHOD_AGENT_SESSION_EVENT;
  params: AgentSessionEventParams;
};

export type ModelListParams = {
  providerId?: string;
  tier?: string;
};

export type ModelListResponse = {
  models: unknown[];
};

export type ModelPreferencesListResponse = {
  preferences: unknown[];
};

export type ModelSyncStateReadResponse = {
  syncState: unknown;
};

export type ModelProviderListResponse = {
  providers: unknown[];
};

export type ModelProviderCatalogListResponse = {
  providers: unknown[];
};

export type ModelProviderAliasReadParams = {
  provider: string;
};

export type ModelProviderAliasReadResponse = {
  config?: unknown;
};

export type ModelProviderAliasListResponse = {
  configs: Record<string, unknown>;
};

export type ProtocolSchemaGroup = "jsonrpc" | "v0";

export type AppServerProtocolSchemaManifest = {
  protocolVersion: string;
  methods: AppServerMethodSpec[];
  jsonRpc: {
    version: string;
    sendsJsonRpcVersionField: boolean;
    envelopes: string[];
  };
  schemas: Record<ProtocolSchemaGroup, string[]>;
};

export type ProtocolSchemaFile = {
  group: ProtocolSchemaGroup;
  typeName: string;
  path: string;
};

export function request(
  id: RequestId,
  method: string,
  params?: unknown,
): JsonRpcRequest {
  return compactParams({ id, method, params });
}

export function notification(
  method: string,
  params?: unknown,
): JsonRpcNotification {
  return compactParams({ method, params });
}

export function isAppServerRequestMethod(method: string): boolean {
  return APP_SERVER_METHODS.some(
    (spec) => spec.kind === "request" && spec.method === method,
  );
}

export function isAppServerNotificationMethod(method: string): boolean {
  return APP_SERVER_METHODS.some(
    (spec) => spec.kind === "notification" && spec.method === method,
  );
}

export function encodeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function decodeMessage(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new Error("empty JSON-RPC line");
  }
  return JSON.parse(trimmed) as JsonRpcMessage;
}

export function decodeMessages(lines: string[]): JsonRpcMessage[] {
  return lines.map(decodeMessage);
}

export function isJsonRpcNotification(
  message: JsonRpcMessage,
): message is JsonRpcNotification {
  return "method" in message && !("id" in message);
}

export function isAgentSessionEventNotification(
  message: JsonRpcMessage,
): message is AgentSessionEventNotification {
  return Boolean(agentSessionEventNotification(message));
}

export function agentSessionEventNotification(
  message: JsonRpcMessage,
): AgentSessionEventNotification | undefined {
  if (
    !isJsonRpcNotification(message) ||
    message.method !== METHOD_AGENT_SESSION_EVENT
  ) {
    return undefined;
  }
  const params = message.params as Partial<AgentSessionEventParams> | undefined;
  if (!params || !params.event) {
    return undefined;
  }
  return message as AgentSessionEventNotification;
}

export function isJsonRpcResponse<T = RpcResult>(
  message: JsonRpcMessage,
): message is JsonRpcResponse<T> {
  return "id" in message && "result" in message;
}

export function isJsonRpcErrorResponse(
  message: JsonRpcMessage,
): message is JsonRpcErrorResponse {
  return "id" in message && "error" in message;
}

function compactParams<T extends { params?: unknown }>(value: T): T {
  if (value.params === undefined) {
    const { params: _params, ...rest } = value;
    return rest as T;
  }
  return value;
}
