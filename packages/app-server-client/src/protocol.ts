export const JSONRPC_VERSION = "2.0";
export const PROTOCOL_VERSION = "appserver.v0";
export const SERVER_NAME = "app-server";

export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_CAPABILITY_LIST = "capability/list";
export const METHOD_ARTIFACT_READ = "artifact/read";
export const METHOD_FILE_SYSTEM_LIST_DIRECTORY = "fileSystem/listDirectory";
export const METHOD_FILE_SYSTEM_READ_FILE_PREVIEW =
  "fileSystem/readFilePreview";
export const METHOD_FILE_SYSTEM_CREATE_FILE = "fileSystem/createFile";
export const METHOD_FILE_SYSTEM_CREATE_DIRECTORY = "fileSystem/createDirectory";
export const METHOD_FILE_SYSTEM_RENAME_FILE = "fileSystem/renameFile";
export const METHOD_FILE_SYSTEM_DELETE_FILE = "fileSystem/deleteFile";
export const METHOD_EVIDENCE_EXPORT = "evidence/export";
export const METHOD_AGENT_SESSION_LIST = "agentSession/list";
export const METHOD_AGENT_SESSION_UPDATE = "agentSession/update";
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
export const METHOD_WORKSPACE_REGISTERED_SKILLS_LIST =
  "workspaceRegisteredSkills/list";
export const METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT =
  "agentAppLocalPackage/inspect";
export const METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD =
  "agentAppPackage/fetchCloud";
export const METHOD_AGENT_APP_INSTALLED_SAVE = "agentAppInstalled/save";
export const METHOD_AGENT_APP_INSTALLED_LIST = "agentAppInstalled/list";
export const METHOD_AGENT_APP_INSTALLED_DISABLED_SET =
  "agentAppInstalled/disabled/set";
export const METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL =
  "agentAppInstalled/uninstall/rehearsal";
export const METHOD_AGENT_APP_INSTALLED_UNINSTALL =
  "agentAppInstalled/uninstall";
export const METHOD_AGENT_APP_SHELL_PREPARE = "agentAppShell/prepare";
export const METHOD_AGENT_APP_UI_RUNTIME_START = "agentAppUiRuntime/start";
export const METHOD_AGENT_APP_UI_RUNTIME_STATUS = "agentAppUiRuntime/status";
export const METHOD_AGENT_APP_UI_RUNTIME_STOP = "agentAppUiRuntime/stop";
export const METHOD_KNOWLEDGE_PACK_LIST = "knowledgePack/list";
export const METHOD_KNOWLEDGE_PACK_READ = "knowledgePack/read";
export const METHOD_KNOWLEDGE_SOURCE_IMPORT = "knowledgePack/source/import";
export const METHOD_KNOWLEDGE_PACK_COMPILE = "knowledgePack/compile";
export const METHOD_KNOWLEDGE_PACK_DEFAULT_SET = "knowledgePack/default/set";
export const METHOD_KNOWLEDGE_PACK_STATUS_UPDATE =
  "knowledgePack/status/update";
export const METHOD_KNOWLEDGE_CONTEXT_RESOLVE = "knowledgeContext/resolve";
export const METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE =
  "knowledgeContextRun/validate";
export const METHOD_AUTOMATION_SCHEDULER_CONFIG_READ =
  "automationScheduler/config/read";
export const METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE =
  "automationScheduler/config/update";
export const METHOD_AUTOMATION_SCHEDULER_STATUS = "automationScheduler/status";
export const METHOD_AUTOMATION_JOB_LIST = "automationJob/list";
export const METHOD_AUTOMATION_JOB_READ = "automationJob/read";
export const METHOD_AUTOMATION_JOB_CREATE = "automationJob/create";
export const METHOD_AUTOMATION_JOB_UPDATE = "automationJob/update";
export const METHOD_AUTOMATION_JOB_DELETE = "automationJob/delete";
export const METHOD_AUTOMATION_JOB_RUN_NOW = "automationJob/runNow";
export const METHOD_AUTOMATION_JOB_HEALTH = "automationJob/health";
export const METHOD_AUTOMATION_JOB_RUN_HISTORY = "automationJob/runHistory";
export const METHOD_AUTOMATION_SCHEDULE_PREVIEW = "automationSchedule/preview";
export const METHOD_AUTOMATION_SCHEDULE_VALIDATE =
  "automationSchedule/validate";
export const METHOD_MCP_SERVER_LIST = "mcpServer/list";
export const METHOD_MCP_SERVER_STATUS_LIST = "mcpServerStatus/list";
export const METHOD_MCP_SERVER_CREATE = "mcpServer/create";
export const METHOD_MCP_SERVER_UPDATE = "mcpServer/update";
export const METHOD_MCP_SERVER_DELETE = "mcpServer/delete";
export const METHOD_MCP_SERVER_ENABLED_SET = "mcpServer/enabled/set";
export const METHOD_MCP_SERVER_IMPORT_FROM_APP = "mcpServer/importFromApp";
export const METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE =
  "mcpServer/syncAllToLive";
export const METHOD_MCP_SERVER_START = "mcpServer/start";
export const METHOD_MCP_SERVER_STOP = "mcpServer/stop";
export const METHOD_MCP_TOOL_LIST = "mcpTool/list";
export const METHOD_MCP_TOOL_LIST_FOR_CONTEXT = "mcpTool/listForContext";
export const METHOD_MCP_TOOL_SEARCH = "mcpTool/search";
export const METHOD_MCP_TOOL_CALL = "mcpTool/call";
export const METHOD_MCP_TOOL_CALL_WITH_CALLER = "mcpTool/callWithCaller";
export const METHOD_MCP_PROMPT_LIST = "mcpPrompt/list";
export const METHOD_MCP_PROMPT_GET = "mcpPrompt/get";
export const METHOD_MCP_RESOURCE_LIST = "mcpResource/list";
export const METHOD_MCP_RESOURCE_READ = "mcpResource/read";
export const METHOD_PROJECT_MEMORY_READ = "projectMemory/read";
export const METHOD_USAGE_STATS_READ = "usageStats/read";
export const METHOD_USAGE_STATS_MODEL_RANKING_LIST =
  "usageStats/modelRanking/list";
export const METHOD_USAGE_STATS_DAILY_TRENDS_LIST =
  "usageStats/dailyTrends/list";
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
export const METHOD_MODEL_PROVIDER_READ = "modelProvider/read";
export const METHOD_MODEL_PROVIDER_CREATE = "modelProvider/create";
export const METHOD_MODEL_PROVIDER_UPDATE = "modelProvider/update";
export const METHOD_MODEL_PROVIDER_DELETE = "modelProvider/delete";
export const METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE =
  "modelProvider/sortOrders/update";
export const METHOD_MODEL_PROVIDER_CONFIG_EXPORT = "modelProviderConfig/export";
export const METHOD_MODEL_PROVIDER_CONFIG_IMPORT = "modelProviderConfig/import";
export const METHOD_MODEL_PROVIDER_TEST_CONNECTION =
  "modelProvider/testConnection";
export const METHOD_MODEL_PROVIDER_TEST_CHAT = "modelProvider/testChat";
export const METHOD_MODEL_PROVIDER_FETCH_MODELS = "modelProvider/fetchModels";
export const METHOD_MODEL_PROVIDER_KEY_CREATE = "modelProviderKey/create";
export const METHOD_MODEL_PROVIDER_KEY_UPDATE = "modelProviderKey/update";
export const METHOD_MODEL_PROVIDER_KEY_DELETE = "modelProviderKey/delete";
export const METHOD_MODEL_PROVIDER_KEY_NEXT = "modelProviderKey/next";
export const METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD =
  "modelProviderKey/usage/record";
export const METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD =
  "modelProviderKey/error/record";
export const METHOD_MODEL_PROVIDER_UI_STATE_READ = "modelProviderUiState/read";
export const METHOD_MODEL_PROVIDER_UI_STATE_WRITE =
  "modelProviderUiState/write";
export const METHOD_MODEL_PROVIDER_ALIAS_READ = "modelProviderAlias/read";
export const METHOD_MODEL_PROVIDER_ALIAS_LIST = "modelProviderAlias/list";
export const METHOD_CONNECT_DEEP_LINK_RESOLVE = "connectDeepLink/resolve";
export const METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE =
  "connectOpenDeepLink/resolve";
export const METHOD_CONNECT_RELAY_API_KEY_SAVE = "connectRelayApiKey/save";
export const METHOD_CONNECT_CALLBACK_SEND = "connectCallback/send";

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
  { method: METHOD_FILE_SYSTEM_LIST_DIRECTORY, kind: "request" },
  { method: METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, kind: "request" },
  { method: METHOD_FILE_SYSTEM_CREATE_FILE, kind: "request" },
  { method: METHOD_FILE_SYSTEM_CREATE_DIRECTORY, kind: "request" },
  { method: METHOD_FILE_SYSTEM_RENAME_FILE, kind: "request" },
  { method: METHOD_FILE_SYSTEM_DELETE_FILE, kind: "request" },
  { method: METHOD_EVIDENCE_EXPORT, kind: "request" },
  { method: METHOD_AGENT_SESSION_LIST, kind: "request" },
  { method: METHOD_AGENT_SESSION_UPDATE, kind: "request" },
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
  { method: METHOD_WORKSPACE_REGISTERED_SKILLS_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT, kind: "request" },
  { method: METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_SAVE, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_LIST, kind: "request" },
  { method: METHOD_AGENT_APP_INSTALLED_DISABLED_SET, kind: "request" },
  {
    method: METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
    kind: "request",
  },
  { method: METHOD_AGENT_APP_INSTALLED_UNINSTALL, kind: "request" },
  { method: METHOD_AGENT_APP_SHELL_PREPARE, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_START, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_STATUS, kind: "request" },
  { method: METHOD_AGENT_APP_UI_RUNTIME_STOP, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_LIST, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_READ, kind: "request" },
  { method: METHOD_KNOWLEDGE_SOURCE_IMPORT, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_COMPILE, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_DEFAULT_SET, kind: "request" },
  { method: METHOD_KNOWLEDGE_PACK_STATUS_UPDATE, kind: "request" },
  { method: METHOD_KNOWLEDGE_CONTEXT_RESOLVE, kind: "request" },
  { method: METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_CONFIG_READ, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULER_STATUS, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_LIST, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_READ, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_CREATE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_UPDATE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_DELETE, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_RUN_NOW, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_HEALTH, kind: "request" },
  { method: METHOD_AUTOMATION_JOB_RUN_HISTORY, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULE_PREVIEW, kind: "request" },
  { method: METHOD_AUTOMATION_SCHEDULE_VALIDATE, kind: "request" },
  { method: METHOD_MCP_SERVER_LIST, kind: "request" },
  { method: METHOD_MCP_SERVER_STATUS_LIST, kind: "request" },
  { method: METHOD_MCP_SERVER_CREATE, kind: "request" },
  { method: METHOD_MCP_SERVER_UPDATE, kind: "request" },
  { method: METHOD_MCP_SERVER_DELETE, kind: "request" },
  { method: METHOD_MCP_SERVER_ENABLED_SET, kind: "request" },
  { method: METHOD_MCP_SERVER_IMPORT_FROM_APP, kind: "request" },
  { method: METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE, kind: "request" },
  { method: METHOD_MCP_SERVER_START, kind: "request" },
  { method: METHOD_MCP_SERVER_STOP, kind: "request" },
  { method: METHOD_MCP_TOOL_LIST, kind: "request" },
  { method: METHOD_MCP_TOOL_LIST_FOR_CONTEXT, kind: "request" },
  { method: METHOD_MCP_TOOL_SEARCH, kind: "request" },
  { method: METHOD_MCP_TOOL_CALL, kind: "request" },
  { method: METHOD_MCP_TOOL_CALL_WITH_CALLER, kind: "request" },
  { method: METHOD_MCP_PROMPT_LIST, kind: "request" },
  { method: METHOD_MCP_PROMPT_GET, kind: "request" },
  { method: METHOD_MCP_RESOURCE_LIST, kind: "request" },
  { method: METHOD_MCP_RESOURCE_READ, kind: "request" },
  { method: METHOD_PROJECT_MEMORY_READ, kind: "request" },
  { method: METHOD_USAGE_STATS_READ, kind: "request" },
  { method: METHOD_USAGE_STATS_MODEL_RANKING_LIST, kind: "request" },
  { method: METHOD_USAGE_STATS_DAILY_TRENDS_LIST, kind: "request" },
  { method: METHOD_MODEL_LIST, kind: "request" },
  { method: METHOD_MODEL_PREFERENCES_LIST, kind: "request" },
  { method: METHOD_MODEL_SYNC_STATE_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CATALOG_LIST, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CREATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_DELETE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CONFIG_EXPORT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_CONFIG_IMPORT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_TEST_CONNECTION, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_TEST_CHAT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_FETCH_MODELS, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_CREATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_UPDATE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_DELETE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_NEXT, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UI_STATE_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_UI_STATE_WRITE, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_READ, kind: "request" },
  { method: METHOD_MODEL_PROVIDER_ALIAS_LIST, kind: "request" },
  { method: METHOD_CONNECT_DEEP_LINK_RESOLVE, kind: "request" },
  { method: METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE, kind: "request" },
  { method: METHOD_CONNECT_RELAY_API_KEY_SAVE, kind: "request" },
  { method: METHOD_CONNECT_CALLBACK_SEND, kind: "request" },
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

export type FileSystemListDirectoryParams = {
  path: string;
};

export type FileSystemReadFilePreviewParams = {
  path: string;
  maxSize?: number;
};

export type FileSystemCreateFileParams = {
  path: string;
};

export type FileSystemCreateDirectoryParams = {
  path: string;
};

export type FileSystemRenameFileParams = {
  oldPath: string;
  newPath: string;
};

export type FileSystemDeleteFileParams = {
  path: string;
  recursive?: boolean;
};

export type FileSystemMutationResponse = Record<string, never>;

export type FileSystemDirectoryListing = {
  path: string;
  parentPath: string | null;
  entries: FileSystemFileEntry[];
  error: string | null;
};

export type FileSystemFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  fileType?: string;
  isHidden: boolean;
  modeStr?: string;
  mode?: number;
  mimeType?: string;
  isSymlink: boolean;
  iconDataUrl?: string;
};

export type FileSystemFilePreview = {
  path: string;
  content: string | null;
  isBinary: boolean;
  size: number;
  error: string | null;
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

export type AgentSessionUpdateParams = {
  sessionId: string;
  title?: string;
  archived?: boolean;
  providerSelector?: string;
  providerName?: string;
  modelName?: string;
  executionStrategy?: string;
  recentAccessMode?: string;
  recentPreferences?: unknown;
  recentTeamSelection?: unknown;
};

export type AgentSessionUpdateResponse = {
  session: AgentSessionOverview;
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

export type WorkspaceRegisteredSkillsListParams = {
  workspaceRoot: string;
};

export type WorkspaceRegisteredSkillsListResponse = {
  skills: unknown[];
};

export type AgentAppLocalPackageInspectParams = {
  appDir: string;
};

export type AgentAppLocalPackageInspectResponse = {
  sourceKind: "local_folder" | string;
  sourceUri: string;
  appDir: string;
  appMarkdown: string;
  manifest: unknown;
  manifestHash: string;
  packageHash: string;
  inspectedAt: string;
};

export type AgentAppCloudReleaseDescriptor = {
  sourceUri: string;
  appId: string;
  version: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  signatureRef?: string;
  loadedAt: string;
};

export type AgentAppFetchCloudPackageParams = {
  descriptor: AgentAppCloudReleaseDescriptor;
};

export type AgentAppPackageIdentity = {
  sourceKind: string;
  sourceUri: string;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  loadedAt: string;
  releaseId?: string;
  tenantId?: string;
  tenantEnablementRef?: string;
  channel?: string;
  signatureRef?: string;
};

export type AgentAppPackageCacheEntry = {
  appId: string;
  identity: AgentAppPackageIdentity;
  manifestSnapshot: unknown;
  packageHash: string;
  manifestHash: string;
  cachePath: string;
  cachedAt: string;
};

export type AgentAppInstalledSaveParams = {
  state: unknown;
};

export type AgentAppInstalledDisabledSetParams = {
  appId: string;
  disabled: boolean;
  updatedAt?: string;
};

export type AgentAppInstalledListResponse = {
  states: unknown[];
  issues: unknown[];
};

export type AgentAppUninstallRehearsalParams = {
  appId: string;
  mode: "keep-data" | "delete-data" | string;
};

export type AgentAppUninstallRehearsalTarget = {
  kind: string;
  value: string;
  safeToDelete: boolean;
  action: "delete" | "retain" | "blocked" | string;
  reason: string;
};

export type AgentAppUninstallRehearsalResponse = {
  appId: string;
  packageHash?: string;
  mode: "keep-data" | "delete-data" | string;
  generatedAt: string;
  deletedTargetCount: number;
  retainedTargetCount: number;
  targets: AgentAppUninstallRehearsalTarget[];
  warnings: string[];
};

export type AgentAppUninstallParams = {
  appId: string;
  mode: "keep-data" | "delete-data" | string;
  confirmationPhrase?: string;
};

export type AgentAppDeleteDataTargetEvidence = {
  kind: string;
  value: string;
  action: string;
  reason: string;
  status: string;
  blockerCodes: string[];
  error?: string | null;
};

export type AgentAppDeleteDataExecutionEvidence = {
  status: string;
  generatedAt: string;
  dataRoot: string;
  removedTargets: AgentAppDeleteDataTargetEvidence[];
  missingTargets: AgentAppDeleteDataTargetEvidence[];
  retainedTargets: AgentAppDeleteDataTargetEvidence[];
  blockedTargets: AgentAppDeleteDataTargetEvidence[];
  failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  blockerCodes: string[];
  postDeleteResidualAudit?: {
    status: string;
    checkedAt: string;
    checkedTargetCount: number;
    remainingTargetCount: number;
    remainingTargets: AgentAppDeleteDataTargetEvidence[];
    failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  };
};

export type AgentAppUninstallResponse = {
  status: string;
  rehearsal: AgentAppUninstallRehearsalResponse;
  list: AgentAppInstalledListResponse;
  removedTargetCount: number;
  missingTargetCount: number;
  blockerCodes: string[];
  deleteEvidence?: AgentAppDeleteDataExecutionEvidence | null;
};

export type AgentAppShellPrepareParams = {
  descriptor: unknown;
};

export type AgentAppShellPackageMount = {
  kind: string;
  path: string;
  readOnly: boolean;
  packageHash: string;
  manifestHash: string;
};

export type AgentAppShellPrepareResponse = {
  appId?: string;
  status: string;
  installMode?: string;
  shellKind?: string;
  descriptorVersion?: number;
  devShell: boolean;
  blockerCodes: string[];
  message?: string;
  packageMount?: AgentAppShellPackageMount;
  entryKey?: string;
  windowTitle?: string;
  preparedAt: string;
};

export type AgentAppUiRuntimeStartParams = {
  appId: string;
  entryKey?: string;
};

export type AgentAppUiRuntimeStatusParams = {
  appId: string;
};

export type AgentAppUiRuntimeStopParams = {
  appId: string;
};

export type AgentAppUiRuntimeStatusResponse = {
  appId: string;
  status: "starting" | "running" | "stopped" | "failed" | string;
  baseUrl?: string;
  entryUrl?: string;
  port?: number;
  pid?: number;
  message?: string;
  entryKey?: string;
  route?: string;
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

export type KnowledgeReadPackParams = {
  workingDir: string;
  name: string;
};

export type KnowledgeReadPackResponse = {
  pack: unknown;
};

export type KnowledgeImportSourceParams = {
  workingDir: string;
  packName: string;
  description?: string;
  packType?: string;
  language?: string;
  sourceFileName?: string;
  sourceText?: string;
};

export type KnowledgeImportSourceResponse = {
  pack: unknown;
  source: unknown;
};

export type KnowledgeCompilePackParams = {
  workingDir: string;
  name: string;
  builderRuntime?: unknown;
};

export type KnowledgeCompilePackResponse = {
  pack: unknown;
  selectedSourceCount: number;
  compiledView: unknown;
  run: unknown;
  warnings: string[];
};

export type KnowledgeSetDefaultPackParams = {
  workingDir: string;
  name: string;
};

export type KnowledgeSetDefaultPackResponse = {
  defaultPackName: string;
  defaultMarkerPath: string;
};

export type KnowledgeUpdatePackStatusParams = {
  workingDir: string;
  name: string;
  status: string;
};

export type KnowledgeUpdatePackStatusResponse = {
  pack: unknown;
  previousStatus: string;
  clearedDefault: boolean;
};

export type KnowledgeResolveContextPackParams = {
  name: string;
  activation?: string;
};

export type KnowledgeResolveContextParams = {
  workingDir: string;
  name: string;
  packs?: KnowledgeResolveContextPackParams[];
  task?: string;
  maxChars?: number;
  activation?: string;
  writeRun?: boolean;
  runReason?: string;
};

export type KnowledgeContextResolutionResponse = {
  packName: string;
  status: string;
  grounding?: string;
  selectedViews: unknown[];
  selectedFiles: string[];
  sourceAnchors: string[];
  warnings: unknown[];
  missing: string[];
  tokenEstimate: number;
  fencedContext: string;
  runId?: string;
  runPath?: string;
};

export type KnowledgeValidateContextRunParams = {
  workingDir: string;
  name: string;
  runPath: string;
};

export type KnowledgeValidateContextRunResponse = {
  valid: boolean;
  runId?: string;
  status?: string;
  errors: string[];
  warnings: string[];
};

export type AutomationJobListResponse = {
  jobs: unknown[];
};

export type AutomationSchedulerConfigReadResponse = {
  config: unknown;
};

export type AutomationSchedulerConfigUpdateParams = {
  config: unknown;
};

export type AutomationSchedulerConfigUpdateResponse = {
  config: unknown;
};

export type AutomationSchedulerStatusResponse = {
  status: unknown;
};

export type AutomationJobIdParams = {
  id: string;
};

export type AutomationJobReadResponse = {
  job?: unknown;
};

export type AutomationJobCreateParams = {
  request: unknown;
};

export type AutomationJobWriteResponse = {
  job: unknown;
};

export type AutomationJobUpdateParams = {
  id: string;
  request: unknown;
};

export type AutomationJobDeleteResponse = {
  deleted: boolean;
};

export type AutomationJobRunNowResponse = {
  result: unknown;
};

export type AutomationJobHealthParams = {
  query?: unknown;
};

export type AutomationJobHealthResponse = {
  health: unknown;
};

export type AutomationJobRunHistoryParams = {
  id: string;
  limit?: number;
};

export type AutomationJobRunHistoryResponse = {
  runs: unknown[];
};

export type AutomationScheduleParams = {
  schedule: unknown;
};

export type AutomationSchedulePreviewResponse = {
  nextRunAt?: string;
};

export type AutomationScheduleValidateResponse = {
  valid: boolean;
  error?: string;
};

export type McpServerListResponse = {
  servers: unknown[];
};

export type McpServerStatusListResponse = {
  servers: unknown[];
};

export type McpServerCreateParams = {
  server: unknown;
};

export type McpServerUpdateParams = {
  server: unknown;
};

export type McpServerDeleteParams = {
  id: string;
};

export type McpServerEnabledSetParams = {
  id: string;
  appType: string;
  enabled: boolean;
};

export type McpServerImportFromAppParams = {
  appType: string;
};

export type McpServerImportFromAppResponse = {
  importedCount: number;
  servers: unknown[];
};

export type McpServerStartParams = {
  name: string;
};

export type McpServerStopParams = {
  name: string;
};

export type McpServerLifecycleResponse = Record<string, never>;

export type McpToolListResponse = {
  tools: unknown[];
};

export type McpToolListForContextParams = {
  caller?: string;
  includeDeferred?: boolean;
};

export type McpToolSearchParams = {
  query: string;
  caller?: string;
  limit?: number;
};

export type McpToolCallParams = {
  toolName: string;
  arguments: unknown;
};

export type McpToolCallWithCallerParams = McpToolCallParams & {
  caller?: string;
};

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "resource"; uri: string; text?: string; blob?: string };

export type McpToolCallResponse = {
  content: McpContent[];
  is_error: boolean;
};

export type McpPromptListResponse = {
  prompts: unknown[];
};

export type McpPromptGetParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type McpPromptMessage = {
  role: string;
  content: McpContent;
};

export type McpPromptGetResponse = {
  description?: string;
  messages: McpPromptMessage[];
};

export type McpResourceListResponse = {
  resources: unknown[];
};

export type McpResourceReadParams = {
  uri: string;
};

export type McpResourceReadResponse = {
  uri: string;
  mime_type?: string;
  text?: string;
  blob?: string;
};

export type ProjectMemoryReadParams = {
  projectId: string;
};

export type ProjectMemoryReadResponse = {
  memory: unknown;
};

export type UsageStatsRangeParams = {
  timeRange: string;
};

export type UsageStatsSummary = {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalTimeMinutes: number;
  monthlyConversations: number;
  monthlyMessages: number;
  monthlyTokens: number;
  todayConversations: number;
  todayMessages: number;
  todayTokens: number;
};

export type UsageStatsReadResponse = {
  stats: UsageStatsSummary;
};

export type UsageStatsModelUsage = {
  model: string;
  conversations: number;
  tokens: number;
  percentage: number;
};

export type UsageStatsModelRankingListResponse = {
  ranking: UsageStatsModelUsage[];
};

export type UsageStatsDailyUsage = {
  date: string;
  conversations: number;
  tokens: number;
};

export type UsageStatsDailyTrendsListResponse = {
  trends: UsageStatsDailyUsage[];
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

export type ModelProviderReadParams = {
  providerId: string;
};

export type ModelProviderReadResponse = {
  provider?: unknown;
};

export type ModelProviderCreateParams = {
  provider: unknown;
};

export type ModelProviderWriteResponse = {
  provider: unknown;
};

export type ModelProviderUpdateParams = {
  providerId: string;
  patch: unknown;
};

export type ModelProviderDeleteParams = {
  providerId: string;
};

export type ModelProviderDeleteResponse = {
  deleted: boolean;
};

export type ModelProviderSortOrderItem = {
  providerId: string;
  sortOrder: number;
};

export type ModelProviderSortOrdersUpdateParams = {
  sortOrders: ModelProviderSortOrderItem[];
};

export type ModelProviderMutationResponse = Record<string, never>;

export type ModelProviderConfigExportParams = {
  includeKeys?: boolean;
};

export type ModelProviderConfigExportResponse = {
  configJson: string;
};

export type ModelProviderConfigImportParams = {
  configJson: string;
};

export type ModelProviderConfigImportResponse = {
  success: boolean;
  importedProviders: number;
  importedApiKeys: number;
  skippedProviders: number;
  errors: string[];
};

export type ModelProviderTestConnectionParams = {
  providerId: string;
  modelName?: string;
};

export type ModelProviderTestConnectionResponse = {
  success: boolean;
  latencyMs?: number;
  error?: string;
  models?: string[];
};

export type ModelProviderTestChatParams = {
  providerId: string;
  modelName?: string;
  prompt: string;
};

export type ModelProviderTestChatResponse = {
  success: boolean;
  latencyMs?: number;
  error?: string;
  content?: string;
  raw?: string;
};

export type ModelProviderFetchModelsParams = {
  providerId: string;
};

export type ModelProviderFetchModelsResponse = {
  models: unknown[];
  source: string;
  error?: string | null;
  requestUrl?: string | null;
  diagnosticHint?: string | null;
  errorKind?: string | null;
  shouldPromptError?: boolean;
  fromCache?: boolean;
};

export type ModelProviderKeyCreateParams = {
  providerId: string;
  apiKey: string;
  alias?: string;
  replaceExisting?: boolean;
};

export type ModelProviderKeyWriteResponse = {
  key: unknown;
};

export type ModelProviderKeyUpdateParams = {
  keyId: string;
  enabled?: boolean;
  alias?: string;
};

export type ModelProviderKeyDeleteParams = {
  keyId: string;
};

export type ModelProviderKeyDeleteResponse = {
  deleted: boolean;
};

export type ModelProviderKeyNextParams = {
  providerId: string;
};

export type ModelProviderKeyNextResponse = {
  apiKey?: string;
  keyId?: string;
};

export type ModelProviderKeyEventParams = {
  keyId: string;
};

export type ModelProviderUiStateReadParams = {
  key: string;
};

export type ModelProviderUiStateReadResponse = {
  value?: string;
};

export type ModelProviderUiStateWriteParams = {
  key: string;
  value: string;
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

export type ConnectDeepLinkResolveParams = {
  url: string;
};

export type ConnectPayload = {
  relay: string;
  key: string;
  name?: string;
  refCode?: string;
};

export type ConnectDeepLinkResolveResponse = {
  payload: ConnectPayload;
  relayInfo?: unknown;
  isVerified: boolean;
};

export type ConnectOpenDeepLinkResolveParams = {
  url: string;
};

export type OpenDeepLinkPayload = {
  kind: string;
  slug: string;
  source?: string;
  version?: string;
  action?: string;
};

export type ConnectOpenDeepLinkResolveResponse = {
  payload: OpenDeepLinkPayload;
};

export type ConnectRelayApiKeySaveParams = {
  relayId: string;
  apiKey: string;
  name?: string;
};

export type ConnectRelayApiKeySaveResponse = {
  providerId: string;
  keyId: string;
  providerName: string;
  isNewProvider: boolean;
};

export type ConnectCallbackStatus = "success" | "cancelled" | "error";

export type ConnectCallbackSendParams = {
  relayId: string;
  apiKey: string;
  status: ConnectCallbackStatus;
  refCode?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type ConnectCallbackSendResponse = {
  delivered: boolean;
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
