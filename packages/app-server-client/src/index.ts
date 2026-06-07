import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createInterface,
  type Interface as ReadlineInterface,
} from "node:readline";

import {
  APP_SERVER_METHODS,
  JSONRPC_VERSION,
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  METHOD_AGENT_SESSION_ACTION_RESPOND,
  METHOD_AGENT_SESSION_EVENT,
  METHOD_AGENT_SESSION_LIST,
  METHOD_AGENT_SESSION_READ,
  METHOD_AGENT_SESSION_START,
  METHOD_AGENT_SESSION_TURN_CANCEL,
  METHOD_AGENT_SESSION_TURN_START,
  METHOD_AGENT_SESSION_UPDATE,
  METHOD_ARTIFACT_READ,
  METHOD_AUTOMATION_JOB_LIST,
  METHOD_CAPABILITY_LIST,
  METHOD_CONNECT_CALLBACK_SEND,
  METHOD_CONNECT_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_RELAY_API_KEY_SAVE,
  METHOD_EVIDENCE_EXPORT,
  METHOD_FILE_SYSTEM_LIST_DIRECTORY,
  METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_MODEL_LIST,
  METHOD_MODEL_PREFERENCES_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_LIST,
  METHOD_MODEL_PROVIDER_ALIAS_READ,
  METHOD_MODEL_PROVIDER_CATALOG_LIST,
  METHOD_MODEL_PROVIDER_LIST,
  METHOD_MODEL_SYNC_STATE_READ,
  METHOD_PROJECT_MEMORY_READ,
  METHOD_SKILL_LIST,
  METHOD_SKILL_READ,
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
  METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
  METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
  PROTOCOL_VERSION,
  agentSessionEventNotification,
  decodeMessage,
  encodeMessage,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  notification,
  request,
  type AgentEvent,
  type AgentSessionActionRespondParams,
  type AgentSessionActionRespondResponse,
  type AgentSessionEventNotification,
  type AgentSessionListParams,
  type AgentSessionListResponse,
  type AgentSessionReadParams,
  type AgentSessionReadResponse,
  type AgentSessionStartParams,
  type AgentSessionStartResponse,
  type AgentSessionTurnCancelParams,
  type AgentSessionTurnCancelResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AgentSessionUpdateParams,
  type AgentSessionUpdateResponse,
  type AgentAppInstalledListResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
  type AppServerMethodSpec,
  type AppServerProtocolSchemaManifest,
  type ArtifactReadParams,
  type ArtifactReadResponse,
  type ArtifactSummary,
  type AutomationJobListResponse,
  type CapabilityListParams,
  type CapabilityListResponse,
  type ConnectCallbackSendParams,
  type ConnectCallbackSendResponse,
  type ConnectDeepLinkResolveParams,
  type ConnectDeepLinkResolveResponse,
  type ConnectOpenDeepLinkResolveParams,
  type ConnectOpenDeepLinkResolveResponse,
  type ConnectRelayApiKeySaveParams,
  type ConnectRelayApiKeySaveResponse,
  type EvidenceExportParams,
  type EvidenceExportResponse,
  type FileSystemDirectoryListing,
  type FileSystemFilePreview,
  type FileSystemListDirectoryParams,
  type FileSystemReadFilePreviewParams,
  type InitializeParams,
  type InitializeResponse,
  type JsonRpcErrorResponse,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type KnowledgeListPacksParams,
  type KnowledgeListPacksResponse,
  type ModelListParams,
  type ModelListResponse,
  type ModelPreferencesListResponse,
  type ModelProviderAliasListResponse,
  type ModelProviderAliasReadParams,
  type ModelProviderAliasReadResponse,
  type ModelProviderCatalogListResponse,
  type ModelProviderListResponse,
  type ModelSyncStateReadResponse,
  type ProtocolSchemaFile,
  type ProtocolSchemaGroup,
  type ProjectMemoryReadParams,
  type ProjectMemoryReadResponse,
  type RequestId,
  type SkillListResponse,
  type SkillReadParams,
  type SkillReadResponse,
  type WorkspaceEnsureParams,
  type WorkspaceEnsureReadyResponse,
  type WorkspaceListResponse,
  type WorkspacePathReadParams,
  type WorkspaceProjectPathResolveParams,
  type WorkspaceProjectPathResolveResponse,
  type WorkspaceProjectsRootReadResponse,
  type WorkspaceReadParams,
  type WorkspaceReadResponse,
  type WorkspaceRegisteredSkillsListParams,
  type WorkspaceRegisteredSkillsListResponse,
  type WorkspaceSkillBindingsListParams,
  type WorkspaceSkillBindingsListResponse,
} from "./protocol.js";

export * from "./protocol.js";

export const DEFAULT_LISTEN_URL = "stdio://";
export const DEFAULT_RELEASE_MANIFEST_NAME = "app-server.release.json";
export const DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME = "manifest.json";

export type SidecarLaunchConfig = {
  binaryPath: string;
  listenUrl: string;
  backendMode?: "external" | "mock" | "unavailable";
  backendCommand?: string;
  backendArgs?: string[];
  backendTimeoutMs?: number;
  appPolicyPath?: string;
  expectedSha256?: string;
  artifact?: AppServerReleaseArtifact;
};

export type SidecarBinaryPathSource = "env" | "resources" | "dev";

export type SidecarBinaryPathResolution = {
  binaryPath: string;
  source: SidecarBinaryPathSource;
};

export type ResolveSidecarBinaryPathOptions = {
  env?: NodeJS.ProcessEnv;
  envVarName?: string;
  allowEnvOverride?: boolean;
  resourcesPath?: string;
  resourceRelativePath?: string;
  devBinaryPath?: string;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
};

export type ResolveSidecarFromManifestOptions =
  ResolveSidecarBinaryPathOptions & {
    listenUrl?: string;
    backendMode?: SidecarLaunchConfig["backendMode"];
    backendCommand?: string;
    backendArgs?: string[];
    backendTimeoutMs?: number;
    appPolicyPath?: string;
    expectedProtocolVersion?: string;
  };

export const DEFAULT_STANDALONE_BACKEND_MODE: NonNullable<
  SidecarLaunchConfig["backendMode"]
> = "unavailable";

export type ResolvedSidecarLaunchConfig = {
  config: SidecarLaunchConfig;
  artifact: AppServerReleaseArtifact;
  binaryPathSource: SidecarBinaryPathSource;
};

export type SidecarProcessOptions = {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  verifySha256?: boolean;
  spawnOptions?: Omit<SpawnOptionsWithoutStdio, "stdio" | "cwd" | "env">;
};

export type ConnectSidecarOptions = SidecarProcessOptions & {
  client?: AppServerClient;
  initializeTimeoutMs?: number;
  expectedProtocolVersion?: string;
};

export type SidecarRestartPolicy = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

export type SidecarExitEvent = {
  attempt: number;
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrLines: string[];
};

export type SidecarRestartScheduledEvent = SidecarExitEvent & {
  delayMs: number;
};

export type SidecarRestartFailedEvent = {
  attempt: number;
  error: unknown;
};

export type SidecarLifecycleOptions = ConnectSidecarOptions & {
  restartPolicy?: SidecarRestartPolicy;
  sleep?: (delayMs: number) => Promise<void>;
  onExit?: (event: SidecarExitEvent) => void;
  onRestartScheduled?: (event: SidecarRestartScheduledEvent) => void;
  onRestarted?: (connected: ConnectedAppServerSidecar, attempt: number) => void;
  onRestartFailed?: (event: SidecarRestartFailedEvent) => void;
};

export type PackagedSidecarLifecycleOptions = SidecarLifecycleOptions &
  ResolveSidecarFromManifestOptions & {
    resourcesPath: string;
    manifestPath?: string;
    manifestRelativePath?: string;
  };

export type ConnectedAppServerSidecar = {
  client: AppServerClient;
  connection: AppServerConnection;
  sidecar: AppServerSidecar;
  initializeResponse: InitializeResponse;
};

export type StartedPackagedAppServerSidecar = {
  resolved: ResolvedSidecarLaunchConfig;
  lifecycle: AppServerSidecarLifecycle;
  connected: ConnectedAppServerSidecar;
};

export type AppServerMessageTransport = {
  send(message: JsonRpcMessage): void;
  nextMessage(timeoutMs?: number): Promise<JsonRpcMessage>;
};

export type AgentEventListener = (
  event: AgentEvent,
  notification: AgentSessionEventNotification,
) => void | Promise<void>;

export type AppServerRequestOptions = {
  timeoutMs?: number;
};

export type AppServerRequestResult<T> = {
  id: RequestId;
  result: T;
  response: JsonRpcResponse;
  notifications: JsonRpcNotification[];
  messages: JsonRpcMessage[];
};

export class AppServerRequestError extends Error {
  readonly id: RequestId;
  readonly method: string;
  readonly response: JsonRpcErrorResponse;
  readonly notifications: JsonRpcNotification[];
  readonly messages: JsonRpcMessage[];

  constructor(
    method: string,
    response: JsonRpcErrorResponse,
    notifications: JsonRpcNotification[],
    messages: JsonRpcMessage[],
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

export type AppServerArtifactPlatform =
  | "darwin-arm64"
  | "darwin-x64"
  | "win32-x64"
  | "linux-x64"
  | string;

export type AppServerReleaseArtifact = {
  platform: AppServerArtifactPlatform;
  url: string;
  sha256: string;
};

export type AppServerReleaseManifest = {
  version: string;
  protocolVersion: string;
  artifacts: AppServerReleaseArtifact[];
};

export class AppServerClient {
  #nextRequestId: number;

  constructor(options: { initialRequestId?: number } = {}) {
    this.#nextRequestId = options.initialRequestId ?? 1;
  }

  initialize(params: InitializeParams): JsonRpcRequest {
    return this.request(METHOD_INITIALIZE, params);
  }

  initialized(): JsonRpcNotification {
    return notification(METHOD_INITIALIZED, {});
  }

  listCapabilities(params: CapabilityListParams = {}): JsonRpcRequest {
    return this.request(METHOD_CAPABILITY_LIST, params);
  }

  listSessions(params: AgentSessionListParams = {}): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_LIST, params);
  }

  updateSession(params: AgentSessionUpdateParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_UPDATE, params);
  }

  listWorkspaces(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_LIST, {});
  }

  readWorkspace(params: WorkspaceReadParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_READ, params);
  }

  readWorkspaceByPath(params: WorkspacePathReadParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_BY_PATH_READ, params);
  }

  readDefaultWorkspace(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_DEFAULT_READ, {});
  }

  ensureDefaultWorkspace(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_DEFAULT_ENSURE, {});
  }

  readWorkspaceProjectsRoot(): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_PROJECTS_ROOT_READ, {});
  }

  resolveWorkspaceProjectPath(
    params: WorkspaceProjectPathResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_PROJECT_PATH_RESOLVE, params);
  }

  ensureWorkspaceReady(params: WorkspaceEnsureParams): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_ENSURE_READY, params);
  }

  listSkills(): JsonRpcRequest {
    return this.request(METHOD_SKILL_LIST, {});
  }

  readSkill(params: SkillReadParams): JsonRpcRequest {
    return this.request(METHOD_SKILL_READ, params);
  }

  listWorkspaceSkillBindings(
    params: WorkspaceSkillBindingsListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_SKILL_BINDINGS_LIST, params);
  }

  listWorkspaceRegisteredSkills(
    params: WorkspaceRegisteredSkillsListParams,
  ): JsonRpcRequest {
    return this.request(METHOD_WORKSPACE_REGISTERED_SKILLS_LIST, params);
  }

  listAgentAppInstalled(): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_INSTALLED_LIST, {});
  }

  startAgentAppUiRuntime(params: AgentAppUiRuntimeStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_START, params);
  }

  getAgentAppUiRuntimeStatus(
    params: AgentAppUiRuntimeStatusParams,
  ): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_STATUS, params);
  }

  stopAgentAppUiRuntime(params: AgentAppUiRuntimeStopParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_APP_UI_RUNTIME_STOP, params);
  }

  listKnowledgePacks(params: KnowledgeListPacksParams): JsonRpcRequest {
    return this.request(METHOD_KNOWLEDGE_PACK_LIST, params);
  }

  listAutomationJobs(): JsonRpcRequest {
    return this.request(METHOD_AUTOMATION_JOB_LIST, {});
  }

  readProjectMemory(params: ProjectMemoryReadParams): JsonRpcRequest {
    return this.request(METHOD_PROJECT_MEMORY_READ, params);
  }

  readArtifacts(params: ArtifactReadParams): JsonRpcRequest {
    return this.request(METHOD_ARTIFACT_READ, params);
  }

  listDirectory(params: FileSystemListDirectoryParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_LIST_DIRECTORY, params);
  }

  readFilePreview(params: FileSystemReadFilePreviewParams): JsonRpcRequest {
    return this.request(METHOD_FILE_SYSTEM_READ_FILE_PREVIEW, params);
  }

  exportEvidence(params: EvidenceExportParams): JsonRpcRequest {
    return this.request(METHOD_EVIDENCE_EXPORT, params);
  }

  startSession(params: AgentSessionStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_START, params);
  }

  readSession(params: AgentSessionReadParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_READ, params);
  }

  listModels(params: ModelListParams = {}): JsonRpcRequest {
    return this.request(METHOD_MODEL_LIST, params);
  }

  listModelPreferences(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PREFERENCES_LIST, {});
  }

  readModelSyncState(): JsonRpcRequest {
    return this.request(METHOD_MODEL_SYNC_STATE_READ, {});
  }

  listModelProviders(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_LIST, {});
  }

  listModelProviderCatalog(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_CATALOG_LIST, {});
  }

  readModelProviderAlias(params: ModelProviderAliasReadParams): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_ALIAS_READ, params);
  }

  listModelProviderAliases(): JsonRpcRequest {
    return this.request(METHOD_MODEL_PROVIDER_ALIAS_LIST, {});
  }

  resolveConnectDeepLink(
    params: ConnectDeepLinkResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONNECT_DEEP_LINK_RESOLVE, params);
  }

  resolveConnectOpenDeepLink(
    params: ConnectOpenDeepLinkResolveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE, params);
  }

  saveConnectRelayApiKey(
    params: ConnectRelayApiKeySaveParams,
  ): JsonRpcRequest {
    return this.request(METHOD_CONNECT_RELAY_API_KEY_SAVE, params);
  }

  sendConnectCallback(params: ConnectCallbackSendParams): JsonRpcRequest {
    return this.request(METHOD_CONNECT_CALLBACK_SEND, params);
  }

  startTurn(params: AgentSessionTurnStartParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_TURN_START, params);
  }

  cancelTurn(params: AgentSessionTurnCancelParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_TURN_CANCEL, params);
  }

  respondAction(params: AgentSessionActionRespondParams): JsonRpcRequest {
    return this.request(METHOD_AGENT_SESSION_ACTION_RESPOND, params);
  }

  request(method: string, params: unknown): JsonRpcRequest {
    return request(this.nextId(), method, params);
  }

  nextId(): RequestId {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    return id;
  }
}

export class AppServerConnection {
  readonly client: AppServerClient;
  readonly transport: AppServerMessageTransport;

  #bufferedMessages: JsonRpcMessage[] = [];
  #mirroredNotifications: JsonRpcNotification[] = [];
  #transportReadLock: Promise<void> = Promise.resolve();

  constructor(
    transport: AppServerMessageTransport,
    client: AppServerClient = new AppServerClient(),
  ) {
    this.transport = transport;
    this.client = client;
  }

  async startSession(
    params: AgentSessionStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionStartResponse>> {
    return await this.request<AgentSessionStartResponse>(
      this.client.startSession(params),
      METHOD_AGENT_SESSION_START,
      options,
    );
  }

  async listCapabilities(
    params: CapabilityListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<CapabilityListResponse>> {
    return await this.request<CapabilityListResponse>(
      this.client.listCapabilities(params),
      METHOD_CAPABILITY_LIST,
      options,
    );
  }

  async listSessions(
    params: AgentSessionListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionListResponse>> {
    return await this.request<AgentSessionListResponse>(
      this.client.listSessions(params),
      METHOD_AGENT_SESSION_LIST,
      options,
    );
  }

  async updateSession(
    params: AgentSessionUpdateParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionUpdateResponse>> {
    return await this.request<AgentSessionUpdateResponse>(
      this.client.updateSession(params),
      METHOD_AGENT_SESSION_UPDATE,
      options,
    );
  }

  async listWorkspaces(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceListResponse>> {
    return await this.request<WorkspaceListResponse>(
      this.client.listWorkspaces(),
      METHOD_WORKSPACE_LIST,
      options,
    );
  }

  async readWorkspace(
    params: WorkspaceReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readWorkspace(params),
      METHOD_WORKSPACE_READ,
      options,
    );
  }

  async readWorkspaceByPath(
    params: WorkspacePathReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readWorkspaceByPath(params),
      METHOD_WORKSPACE_BY_PATH_READ,
      options,
    );
  }

  async readDefaultWorkspace(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.readDefaultWorkspace(),
      METHOD_WORKSPACE_DEFAULT_READ,
      options,
    );
  }

  async ensureDefaultWorkspace(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceReadResponse>> {
    return await this.request<WorkspaceReadResponse>(
      this.client.ensureDefaultWorkspace(),
      METHOD_WORKSPACE_DEFAULT_ENSURE,
      options,
    );
  }

  async readWorkspaceProjectsRoot(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceProjectsRootReadResponse>> {
    return await this.request<WorkspaceProjectsRootReadResponse>(
      this.client.readWorkspaceProjectsRoot(),
      METHOD_WORKSPACE_PROJECTS_ROOT_READ,
      options,
    );
  }

  async resolveWorkspaceProjectPath(
    params: WorkspaceProjectPathResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceProjectPathResolveResponse>> {
    return await this.request<WorkspaceProjectPathResolveResponse>(
      this.client.resolveWorkspaceProjectPath(params),
      METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
      options,
    );
  }

  async ensureWorkspaceReady(
    params: WorkspaceEnsureParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceEnsureReadyResponse>> {
    return await this.request<WorkspaceEnsureReadyResponse>(
      this.client.ensureWorkspaceReady(params),
      METHOD_WORKSPACE_ENSURE_READY,
      options,
    );
  }

  async listSkills(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillListResponse>> {
    return await this.request<SkillListResponse>(
      this.client.listSkills(),
      METHOD_SKILL_LIST,
      options,
    );
  }

  async readSkill(
    params: SkillReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<SkillReadResponse>> {
    return await this.request<SkillReadResponse>(
      this.client.readSkill(params),
      METHOD_SKILL_READ,
      options,
    );
  }

  async listWorkspaceSkillBindings(
    params: WorkspaceSkillBindingsListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceSkillBindingsListResponse>> {
    return await this.request<WorkspaceSkillBindingsListResponse>(
      this.client.listWorkspaceSkillBindings(params),
      METHOD_WORKSPACE_SKILL_BINDINGS_LIST,
      options,
    );
  }

  async listWorkspaceRegisteredSkills(
    params: WorkspaceRegisteredSkillsListParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<WorkspaceRegisteredSkillsListResponse>> {
    return await this.request<WorkspaceRegisteredSkillsListResponse>(
      this.client.listWorkspaceRegisteredSkills(params),
      METHOD_WORKSPACE_REGISTERED_SKILLS_LIST,
      options,
    );
  }

  async listAgentAppInstalled(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppInstalledListResponse>> {
    return await this.request<AgentAppInstalledListResponse>(
      this.client.listAgentAppInstalled(),
      METHOD_AGENT_APP_INSTALLED_LIST,
      options,
    );
  }

  async startAgentAppUiRuntime(
    params: AgentAppUiRuntimeStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.startAgentAppUiRuntime(params),
      METHOD_AGENT_APP_UI_RUNTIME_START,
      options,
    );
  }

  async getAgentAppUiRuntimeStatus(
    params: AgentAppUiRuntimeStatusParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.getAgentAppUiRuntimeStatus(params),
      METHOD_AGENT_APP_UI_RUNTIME_STATUS,
      options,
    );
  }

  async stopAgentAppUiRuntime(
    params: AgentAppUiRuntimeStopParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentAppUiRuntimeStatusResponse>> {
    return await this.request<AgentAppUiRuntimeStatusResponse>(
      this.client.stopAgentAppUiRuntime(params),
      METHOD_AGENT_APP_UI_RUNTIME_STOP,
      options,
    );
  }

  async listKnowledgePacks(
    params: KnowledgeListPacksParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<KnowledgeListPacksResponse>> {
    return await this.request<KnowledgeListPacksResponse>(
      this.client.listKnowledgePacks(params),
      METHOD_KNOWLEDGE_PACK_LIST,
      options,
    );
  }

  async listAutomationJobs(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AutomationJobListResponse>> {
    return await this.request<AutomationJobListResponse>(
      this.client.listAutomationJobs(),
      METHOD_AUTOMATION_JOB_LIST,
      options,
    );
  }

  async readProjectMemory(
    params: ProjectMemoryReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ProjectMemoryReadResponse>> {
    return await this.request<ProjectMemoryReadResponse>(
      this.client.readProjectMemory(params),
      METHOD_PROJECT_MEMORY_READ,
      options,
    );
  }

  async readArtifacts(
    params: ArtifactReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ArtifactReadResponse>> {
    return await this.request<ArtifactReadResponse>(
      this.client.readArtifacts(params),
      METHOD_ARTIFACT_READ,
      options,
    );
  }

  async listDirectory(
    params: FileSystemListDirectoryParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemDirectoryListing>> {
    return await this.request<FileSystemDirectoryListing>(
      this.client.listDirectory(params),
      METHOD_FILE_SYSTEM_LIST_DIRECTORY,
      options,
    );
  }

  async readFilePreview(
    params: FileSystemReadFilePreviewParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<FileSystemFilePreview>> {
    return await this.request<FileSystemFilePreview>(
      this.client.readFilePreview(params),
      METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
      options,
    );
  }

  async exportEvidence(
    params: EvidenceExportParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<EvidenceExportResponse>> {
    return await this.request<EvidenceExportResponse>(
      this.client.exportEvidence(params),
      METHOD_EVIDENCE_EXPORT,
      options,
    );
  }

  async readSession(
    params: AgentSessionReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionReadResponse>> {
    return await this.request<AgentSessionReadResponse>(
      this.client.readSession(params),
      METHOD_AGENT_SESSION_READ,
      options,
    );
  }

  async listModels(
    params: ModelListParams = {},
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelListResponse>> {
    return await this.request<ModelListResponse>(
      this.client.listModels(params),
      METHOD_MODEL_LIST,
      options,
    );
  }

  async listModelPreferences(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelPreferencesListResponse>> {
    return await this.request<ModelPreferencesListResponse>(
      this.client.listModelPreferences(),
      METHOD_MODEL_PREFERENCES_LIST,
      options,
    );
  }

  async readModelSyncState(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelSyncStateReadResponse>> {
    return await this.request<ModelSyncStateReadResponse>(
      this.client.readModelSyncState(),
      METHOD_MODEL_SYNC_STATE_READ,
      options,
    );
  }

  async listModelProviders(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderListResponse>> {
    return await this.request<ModelProviderListResponse>(
      this.client.listModelProviders(),
      METHOD_MODEL_PROVIDER_LIST,
      options,
    );
  }

  async listModelProviderCatalog(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderCatalogListResponse>> {
    return await this.request<ModelProviderCatalogListResponse>(
      this.client.listModelProviderCatalog(),
      METHOD_MODEL_PROVIDER_CATALOG_LIST,
      options,
    );
  }

  async readModelProviderAlias(
    params: ModelProviderAliasReadParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderAliasReadResponse>> {
    return await this.request<ModelProviderAliasReadResponse>(
      this.client.readModelProviderAlias(params),
      METHOD_MODEL_PROVIDER_ALIAS_READ,
      options,
    );
  }

  async listModelProviderAliases(
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ModelProviderAliasListResponse>> {
    return await this.request<ModelProviderAliasListResponse>(
      this.client.listModelProviderAliases(),
      METHOD_MODEL_PROVIDER_ALIAS_LIST,
      options,
    );
  }

  async resolveConnectDeepLink(
    params: ConnectDeepLinkResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectDeepLinkResolveResponse>> {
    return await this.request<ConnectDeepLinkResolveResponse>(
      this.client.resolveConnectDeepLink(params),
      METHOD_CONNECT_DEEP_LINK_RESOLVE,
      options,
    );
  }

  async resolveConnectOpenDeepLink(
    params: ConnectOpenDeepLinkResolveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectOpenDeepLinkResolveResponse>> {
    return await this.request<ConnectOpenDeepLinkResolveResponse>(
      this.client.resolveConnectOpenDeepLink(params),
      METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
      options,
    );
  }

  async saveConnectRelayApiKey(
    params: ConnectRelayApiKeySaveParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectRelayApiKeySaveResponse>> {
    return await this.request<ConnectRelayApiKeySaveResponse>(
      this.client.saveConnectRelayApiKey(params),
      METHOD_CONNECT_RELAY_API_KEY_SAVE,
      options,
    );
  }

  async sendConnectCallback(
    params: ConnectCallbackSendParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<ConnectCallbackSendResponse>> {
    return await this.request<ConnectCallbackSendResponse>(
      this.client.sendConnectCallback(params),
      METHOD_CONNECT_CALLBACK_SEND,
      options,
    );
  }

  async startTurn(
    params: AgentSessionTurnStartParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnStartResponse>> {
    return await this.request<AgentSessionTurnStartResponse>(
      this.client.startTurn(params),
      METHOD_AGENT_SESSION_TURN_START,
      options,
    );
  }

  async cancelTurn(
    params: AgentSessionTurnCancelParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionTurnCancelResponse>> {
    return await this.request<AgentSessionTurnCancelResponse>(
      this.client.cancelTurn(params),
      METHOD_AGENT_SESSION_TURN_CANCEL,
      options,
    );
  }

  async respondAction(
    params: AgentSessionActionRespondParams,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<AgentSessionActionRespondResponse>> {
    return await this.request<AgentSessionActionRespondResponse>(
      this.client.respondAction(params),
      METHOD_AGENT_SESSION_ACTION_RESPOND,
      options,
    );
  }

  async request<T>(
    requestMessage: JsonRpcRequest,
    method = requestMessage.method,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    this.transport.send(requestMessage);
    return await this.waitForResponse<T>(requestMessage.id, method, options);
  }

  async waitForResponse<T>(
    id: RequestId,
    method: string,
    options: AppServerRequestOptions = {},
  ): Promise<AppServerRequestResult<T>> {
    const messages: JsonRpcMessage[] = [];
    const notifications: JsonRpcNotification[] = [];

    try {
      for (;;) {
        const message = await this.#nextMessageForRequest(
          id,
          options.timeoutMs,
        );
        messages.push(message);

        if (isJsonRpcNotification(message)) {
          notifications.push(message);
          this.#mirroredNotifications.push(message);
          await this.#yieldReadTurn();
          continue;
        }

        if (isJsonRpcErrorResponse(message) && message.id === id) {
          throw new AppServerRequestError(
            method,
            message,
            [...notifications],
            [...messages],
          );
        }

        if (isJsonRpcResponse(message) && message.id === id) {
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
      throw error;
    }
  }

  async nextNotification(timeoutMs?: number): Promise<JsonRpcNotification> {
    for (;;) {
      const buffered = this.#shiftBufferedNotification();
      if (buffered) {
        return buffered;
      }
      const notification = await this.#withTransportRead(
        timeoutMs,
        () => this.#shiftBufferedNotification(),
        (message) => {
          if (isJsonRpcNotification(message)) {
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

  async nextMessage(timeoutMs?: number): Promise<JsonRpcMessage> {
    const buffered = this.#bufferedMessages.shift();
    if (buffered) {
      return buffered;
    }
    return await this.#withTransportRead(
      timeoutMs,
      () => this.#bufferedMessages.shift(),
      (message) => message,
    );
  }

  async #nextMessageForRequest(
    id: RequestId,
    timeoutMs?: number,
  ): Promise<JsonRpcMessage> {
    const startedAt = Date.now();

    for (;;) {
      const buffered = this.#shiftBufferedRequestMessage(id);
      if (buffered) {
        return buffered;
      }

      const remainingTimeoutMs =
        timeoutMs === undefined
          ? undefined
          : Math.max(1, timeoutMs - (Date.now() - startedAt));
      const message = await this.#withTransportRead<JsonRpcMessage | undefined>(
        remainingTimeoutMs,
        () => this.#shiftBufferedRequestMessage(id),
        (incoming) => {
          if (
            isJsonRpcNotification(incoming) ||
            (isJsonRpcResponse(incoming) && incoming.id === id) ||
            (isJsonRpcErrorResponse(incoming) && incoming.id === id)
          ) {
            return incoming;
          }
          this.#prependBufferedMessages([incoming]);
          return undefined;
        },
      );

      if (message) {
        return message;
      }

      await this.#yieldReadTurn();
    }
  }

  #prependBufferedMessages(messages: JsonRpcMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    this.#bufferedMessages = [...messages, ...this.#bufferedMessages];
  }

  #shiftBufferedRequestMessage(id: RequestId): JsonRpcMessage | undefined {
    const notificationIndex = this.#bufferedMessages.findIndex(
      isJsonRpcNotification,
    );
    if (notificationIndex >= 0) {
      const [message] = this.#bufferedMessages.splice(notificationIndex, 1);
      return message;
    }

    const responseIndex = this.#bufferedMessages.findIndex((message) => {
      return (
        (isJsonRpcResponse(message) || isJsonRpcErrorResponse(message)) &&
        message.id === id
      );
    });
    if (responseIndex < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(responseIndex, 1);
    return message;
  }

  #shiftBufferedNotification(): JsonRpcNotification | undefined {
    const mirrored = this.#mirroredNotifications.shift();
    if (mirrored) {
      return mirrored;
    }
    const index = this.#bufferedMessages.findIndex(isJsonRpcNotification);
    if (index < 0) {
      return undefined;
    }
    const [message] = this.#bufferedMessages.splice(index, 1);
    return message as JsonRpcNotification;
  }

  async #withTransportRead<T>(
    timeoutMs?: number,
    beforeRead?: () => T | undefined,
    afterRead?: (message: JsonRpcMessage) => T,
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
}

export class AppServerAgentEventRouter {
  #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async dispatch(message: JsonRpcMessage): Promise<boolean> {
    const notification = agentSessionEventNotification(message);
    if (!notification) {
      return false;
    }
    for (const listener of this.#listeners) {
      await listener(notification.params.event, notification);
    }
    return true;
  }
}

function normalizeMethodSpecs(
  methods: readonly AppServerMethodSpec[],
): string[] {
  return methods
    .map((spec) => `${spec.kind}:${spec.method}`)
    .sort((left, right) => left.localeCompare(right));
}

export function sidecarBinaryName(
  platform: NodeJS.Platform | string = process.platform,
): string {
  return platform === "win32" ? "app-server.exe" : "app-server";
}

export function defaultPackagedSidecarRelativePath(
  platform: NodeJS.Platform | string = process.platform,
  arch: NodeJS.Architecture | string = process.arch,
): string {
  return path.join(
    "app-server",
    platformKey(platform, arch),
    sidecarBinaryName(platform),
  );
}

export function resolveSidecarBinaryPath(
  options: ResolveSidecarBinaryPathOptions = {},
): SidecarBinaryPathResolution | undefined {
  const env = options.env ?? process.env;
  const envVarName = options.envVarName ?? "APP_SERVER_BIN";
  if (options.allowEnvOverride ?? true) {
    const envBinaryPath = env[envVarName]?.trim();
    if (envBinaryPath) {
      return {
        binaryPath: envBinaryPath,
        source: "env",
      };
    }
  }

  if (options.resourcesPath?.trim()) {
    return {
      binaryPath: path.join(
        options.resourcesPath,
        options.resourceRelativePath ??
          defaultPackagedSidecarRelativePath(options.platform, options.arch),
      ),
      source: "resources",
    };
  }

  if (options.devBinaryPath?.trim()) {
    return {
      binaryPath: options.devBinaryPath,
      source: "dev",
    };
  }

  return undefined;
}

export function stdioSidecar(
  binaryPath: string,
  appPolicyPath?: string,
): SidecarLaunchConfig {
  return {
    binaryPath,
    listenUrl: DEFAULT_LISTEN_URL,
    backendMode: DEFAULT_STANDALONE_BACKEND_MODE,
    ...(appPolicyPath ? { appPolicyPath } : {}),
  };
}

export function sidecarFromReleaseArtifact(
  binaryPath: string,
  artifact: AppServerReleaseArtifact,
  listenUrl = DEFAULT_LISTEN_URL,
  backendMode: SidecarLaunchConfig["backendMode"] = DEFAULT_STANDALONE_BACKEND_MODE,
  appPolicyPath?: string,
): SidecarLaunchConfig {
  return {
    binaryPath,
    listenUrl,
    backendMode,
    ...(appPolicyPath ? { appPolicyPath } : {}),
    expectedSha256: artifact.sha256,
    artifact,
  };
}

export function sidecarArgs(config: SidecarLaunchConfig): string[] {
  const args =
    config.listenUrl === DEFAULT_LISTEN_URL
      ? ["--stdio"]
      : ["--listen", config.listenUrl];
  args.push("--backend", config.backendMode ?? DEFAULT_STANDALONE_BACKEND_MODE);
  if (config.backendMode === "external" && config.backendCommand) {
    args.push("--backend-command", config.backendCommand);
  }
  for (const backendArg of config.backendMode === "external"
    ? (config.backendArgs ?? [])
    : []) {
    args.push("--backend-arg", backendArg);
  }
  if (
    config.backendMode === "external" &&
    config.backendTimeoutMs !== undefined
  ) {
    args.push("--backend-timeout-ms", String(config.backendTimeoutMs));
  }
  if (config.appPolicyPath) {
    args.push("--app-policy", config.appPolicyPath);
  }
  return args;
}

export function platformKey(
  platform: NodeJS.Platform | string = process.platform,
  arch: NodeJS.Architecture | string = process.arch,
): AppServerArtifactPlatform {
  if (platform === "win32") {
    return "win32-x64";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "darwin-arm64";
  }
  if (platform === "darwin") {
    return "darwin-x64";
  }
  if (platform === "linux") {
    return "linux-x64";
  }
  return `${platform}-${arch}`;
}

export function findReleaseArtifact(
  manifest: AppServerReleaseManifest,
  platform: AppServerArtifactPlatform = platformKey(),
): AppServerReleaseArtifact | undefined {
  return manifest.artifacts.find((artifact) => artifact.platform === platform);
}

export function resolveSidecarFromReleaseManifest(
  manifest: AppServerReleaseManifest,
  options: ResolveSidecarFromManifestOptions = {},
): ResolvedSidecarLaunchConfig | undefined {
  assertCompatibleManifest(
    manifest,
    options.expectedProtocolVersion ?? PROTOCOL_VERSION,
  );
  const artifact = findReleaseArtifact(
    manifest,
    platformKey(options.platform, options.arch),
  );
  if (!artifact) {
    return undefined;
  }

  const binaryPath = resolveSidecarBinaryPath(options);
  if (!binaryPath) {
    return undefined;
  }

  return {
    config: {
      binaryPath: binaryPath.binaryPath,
      listenUrl: options.listenUrl ?? DEFAULT_LISTEN_URL,
      backendMode: options.backendMode ?? DEFAULT_STANDALONE_BACKEND_MODE,
      ...(options.backendCommand
        ? { backendCommand: options.backendCommand }
        : {}),
      ...(options.backendArgs ? { backendArgs: options.backendArgs } : {}),
      ...(options.backendTimeoutMs !== undefined
        ? { backendTimeoutMs: options.backendTimeoutMs }
        : {}),
      ...(options.appPolicyPath
        ? { appPolicyPath: options.appPolicyPath }
        : {}),
      expectedSha256:
        binaryPath.source === "resources" ? artifact.sha256 : undefined,
      artifact,
    },
    artifact,
    binaryPathSource: binaryPath.source,
  };
}

export async function readReleaseManifest(
  path: string,
): Promise<AppServerReleaseManifest> {
  return JSON.parse(await readFile(path, "utf8")) as AppServerReleaseManifest;
}

export async function readProtocolSchemaManifest(
  manifestPath: string,
): Promise<AppServerProtocolSchemaManifest> {
  return JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as AppServerProtocolSchemaManifest;
}

export async function resolveSidecarFromReleaseManifestFile(
  manifestPath: string,
  options: ResolveSidecarFromManifestOptions = {},
): Promise<ResolvedSidecarLaunchConfig | undefined> {
  return resolveSidecarFromReleaseManifest(
    await readReleaseManifest(manifestPath),
    options,
  );
}

export function defaultReleaseManifestPath(
  resourcesPath: string,
  manifestRelativePath = DEFAULT_RELEASE_MANIFEST_NAME,
): string {
  return path.join(resourcesPath, manifestRelativePath);
}

export function defaultProtocolSchemaManifestPath(
  schemaJsonRoot: string,
  manifestRelativePath = DEFAULT_PROTOCOL_SCHEMA_MANIFEST_NAME,
): string {
  return path.join(schemaJsonRoot, manifestRelativePath);
}

export function assertCompatibleManifest(
  manifest: AppServerReleaseManifest,
  expectedProtocolVersion = PROTOCOL_VERSION,
): void {
  if (manifest.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server protocol: expected ${expectedProtocolVersion}, got ${manifest.protocolVersion}`,
    );
  }
}

export function assertCompatibleProtocolSchemaManifest(
  manifest: AppServerProtocolSchemaManifest,
  expectedProtocolVersion = PROTOCOL_VERSION,
  expectedMethods: readonly AppServerMethodSpec[] = APP_SERVER_METHODS,
): void {
  if (manifest.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server schema protocol: expected ${expectedProtocolVersion}, got ${manifest.protocolVersion}`,
    );
  }
  if (manifest.jsonRpc.version !== JSONRPC_VERSION) {
    throw new Error(
      `unsupported JSON-RPC schema version: expected ${JSONRPC_VERSION}, got ${manifest.jsonRpc.version}`,
    );
  }
  const actualMethods = normalizeMethodSpecs(manifest.methods);
  const expectedMethodList = normalizeMethodSpecs(expectedMethods);
  if (actualMethods.join("\n") !== expectedMethodList.join("\n")) {
    throw new Error("app-server schema method catalog mismatch");
  }
}

export function protocolSchemaFilePath(
  schemaJsonRoot: string,
  group: ProtocolSchemaGroup,
  typeName: string,
): string {
  return path.join(schemaJsonRoot, group, `${typeName}.json`);
}

export function listProtocolSchemaFiles(
  manifest: AppServerProtocolSchemaManifest,
  schemaJsonRoot: string,
): ProtocolSchemaFile[] {
  return (["jsonrpc", "v0"] as const).flatMap((group) =>
    (manifest.schemas[group] ?? []).map((typeName) => ({
      group,
      typeName,
      path: protocolSchemaFilePath(schemaJsonRoot, group, typeName),
    })),
  );
}

export function sha256Hex(content: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256Hex(await readFile(path));
}

export function assertSha256(
  actualSha256: string,
  expectedSha256: string,
): void {
  if (normalizeSha256(actualSha256) !== normalizeSha256(expectedSha256)) {
    throw new Error("app-server sha256 mismatch");
  }
}

export async function assertSidecarFileSha256(
  config: SidecarLaunchConfig,
): Promise<void> {
  if (!config.expectedSha256) {
    throw new Error("sidecar expectedSha256 is required");
  }
  assertSha256(await sha256File(config.binaryPath), config.expectedSha256);
}

export async function spawnAppServerSidecar(
  config: SidecarLaunchConfig,
  options: SidecarProcessOptions = {},
): Promise<AppServerSidecar> {
  if (options.verifySha256 ?? Boolean(config.expectedSha256)) {
    await assertSidecarFileSha256(config);
  }

  const child = spawn(config.binaryPath, options.args ?? sidecarArgs(config), {
    ...options.spawnOptions,
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: "pipe",
  });

  return new AppServerSidecar(child);
}

export async function connectAppServerSidecar(
  config: SidecarLaunchConfig,
  initializeParams: InitializeParams,
  options: ConnectSidecarOptions = {},
): Promise<ConnectedAppServerSidecar> {
  const client = options.client ?? new AppServerClient();
  const sidecar = await spawnAppServerSidecar(config, options);

  try {
    const initializeRequest = client.initialize(initializeParams);
    sidecar.send(initializeRequest);
    const initializeMessage = await sidecar.nextMessage(
      options.initializeTimeoutMs,
    );
    const initializeResponse = expectResponseResult<InitializeResponse>(
      initializeMessage,
      initializeRequest.id,
      METHOD_INITIALIZE,
    );
    assertInitializeResponseProtocol(
      initializeResponse,
      options.expectedProtocolVersion ?? PROTOCOL_VERSION,
    );
    sidecar.send(client.initialized());

    return {
      client,
      connection: new AppServerConnection(sidecar, client),
      sidecar,
      initializeResponse,
    };
  } catch (error) {
    await sidecar.close().catch(() => undefined);
    throw error;
  }
}

export async function startPackagedAppServerSidecar(
  initializeParams: InitializeParams,
  options: PackagedSidecarLifecycleOptions,
): Promise<StartedPackagedAppServerSidecar> {
  const manifestPath =
    options.manifestPath ??
    defaultReleaseManifestPath(
      options.resourcesPath,
      options.manifestRelativePath,
    );
  const resolved = await resolveSidecarFromReleaseManifestFile(manifestPath, {
    ...options,
    allowEnvOverride: options.allowEnvOverride ?? false,
    resourcesPath: options.resourcesPath,
  });
  if (!resolved) {
    throw new Error("app-server sidecar artifact is not available");
  }

  const lifecycle = new AppServerSidecarLifecycle(
    resolved.config,
    initializeParams,
    options,
  );
  const connected = await lifecycle.start();
  return {
    resolved,
    lifecycle,
    connected,
  };
}

export function sidecarRestartDelayMs(
  attempt: number,
  policy: SidecarRestartPolicy = {},
): number {
  const initialDelayMs = policy.initialDelayMs ?? 500;
  const maxDelayMs = policy.maxDelayMs ?? 30_000;
  const factor = policy.factor ?? 2;
  const exponent = Math.max(0, attempt - 1);
  return Math.max(
    0,
    Math.min(maxDelayMs, Math.round(initialDelayMs * factor ** exponent)),
  );
}

export function shouldRestartSidecar(
  attempt: number,
  policy: SidecarRestartPolicy = {},
): boolean {
  const maxAttempts = policy.maxAttempts ?? 3;
  return maxAttempts < 0 || attempt <= maxAttempts;
}

export class AppServerSidecarLifecycle {
  readonly config: SidecarLaunchConfig;
  readonly initializeParams: InitializeParams;

  #options: SidecarLifecycleOptions;
  #connected: ConnectedAppServerSidecar | undefined;
  #stopped = true;

  constructor(
    config: SidecarLaunchConfig,
    initializeParams: InitializeParams,
    options: SidecarLifecycleOptions = {},
  ) {
    this.config = config;
    this.initializeParams = initializeParams;
    this.#options = options;
  }

  get connected(): ConnectedAppServerSidecar | undefined {
    return this.#connected;
  }

  async start(): Promise<ConnectedAppServerSidecar> {
    this.#stopped = false;
    return await this.#connectWithRetry(0);
  }

  async restart(): Promise<ConnectedAppServerSidecar> {
    await this.#closeCurrent();
    this.#stopped = false;
    return await this.#connectWithRetry(0);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#closeCurrent();
  }

  async #connect(attempt: number): Promise<ConnectedAppServerSidecar> {
    const connected = await connectAppServerSidecar(
      this.config,
      this.initializeParams,
      this.#options,
    );
    this.#connected = connected;
    connected.sidecar.child.once("exit", (code, signal) => {
      void this.#handleExit(connected, attempt + 1, code, signal);
    });
    return connected;
  }

  async #connectWithRetry(attempt: number): Promise<ConnectedAppServerSidecar> {
    try {
      return await this.#connect(attempt);
    } catch (error) {
      const retryAttempt = attempt + 1;
      this.#options.onRestartFailed?.({
        attempt: retryAttempt,
        error,
      });
      if (
        this.#stopped ||
        !shouldRestartSidecar(retryAttempt, this.#options.restartPolicy)
      ) {
        throw error;
      }
      await this.#waitBeforeRestart({
        attempt: retryAttempt,
        code: null,
        signal: null,
        stderrLines: [],
      });
      return await this.#connectWithRetry(retryAttempt);
    }
  }

  async #handleExit(
    connected: ConnectedAppServerSidecar,
    attempt: number,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (this.#stopped || this.#connected !== connected) {
      return;
    }
    this.#connected = undefined;

    const event: SidecarExitEvent = {
      attempt,
      code,
      signal,
      stderrLines: [...connected.sidecar.stderrLines],
    };
    this.#options.onExit?.(event);
    await this.#restartAfterDelay(event);
  }

  async #restartAfterDelay(event: SidecarExitEvent): Promise<void> {
    if (!shouldRestartSidecar(event.attempt, this.#options.restartPolicy)) {
      return;
    }

    await this.#waitBeforeRestart(event);

    if (this.#stopped) {
      return;
    }

    try {
      const connected = await this.#connect(event.attempt);
      this.#options.onRestarted?.(connected, event.attempt);
    } catch (error) {
      this.#options.onRestartFailed?.({
        attempt: event.attempt,
        error,
      });
      await this.#restartAfterDelay({
        ...event,
        attempt: event.attempt + 1,
      });
    }
  }

  async #waitBeforeRestart(event: SidecarExitEvent): Promise<void> {
    const delayMs = sidecarRestartDelayMs(
      event.attempt,
      this.#options.restartPolicy,
    );
    this.#options.onRestartScheduled?.({ ...event, delayMs });
    await (this.#options.sleep ?? sleep)(delayMs);
  }

  async #closeCurrent(): Promise<void> {
    const connected = this.#connected;
    this.#connected = undefined;
    if (connected) {
      await connected.sidecar.close();
    }
  }
}

export class AppServerSidecar {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stderrLines: string[] = [];

  #stdout: ReadlineInterface;
  #stderr: ReadlineInterface;
  #messages: JsonRpcMessage[] = [];
  #waiters: Array<{
    resolve: (message: JsonRpcMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  #closed = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    this.#stdout = createInterface({ input: child.stdout });
    this.#stderr = createInterface({ input: child.stderr });

    this.#stdout.on("line", (line) => this.#receiveLine(line));
    this.#stderr.on("line", (line) => this.stderrLines.push(line));
    child.once("error", (error) => this.#rejectWaiters(error));
    child.once("exit", (code, signal) => {
      this.#closed = true;
      if (this.#waiters.length > 0) {
        this.#rejectWaiters(
          new Error(
            `app-server exited before next message: code=${code}, signal=${signal}`,
          ),
        );
      }
    });
  }

  send(message: JsonRpcMessage): void {
    this.sendLine(encodeMessage(message));
  }

  sendLine(line: string): void {
    if (this.#closed || this.child.stdin.destroyed) {
      throw new Error("app-server sidecar stdin is closed");
    }
    this.child.stdin.write(line);
  }

  nextMessage(timeoutMs = 30_000): Promise<JsonRpcMessage> {
    const message = this.#messages.shift();
    if (message) {
      return Promise.resolve(message);
    }
    if (this.#closed) {
      return Promise.reject(new Error("app-server sidecar is closed"));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter(
          (waiter) => waiter.timer !== timer,
        );
        reject(
          new Error(
            `timed out waiting for app-server message after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.#waiters.push({ resolve, reject, timer });
    });
  }

  async waitForExit(timeoutMs = 5_000): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    await withTimeout(
      once(this.child, "exit"),
      timeoutMs,
      "timed out waiting for app-server exit",
    );
  }

  async close(
    signal: NodeJS.Signals = "SIGTERM",
    timeoutMs = 5_000,
  ): Promise<void> {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill(signal);
      try {
        await this.waitForExit(timeoutMs);
      } catch (error) {
        this.child.kill("SIGKILL");
        await this.waitForExit(timeoutMs);
        throw error;
      }
    }

    this.#stdout.close();
    this.#stderr.close();
  }

  #receiveLine(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = decodeMessage(line);
    } catch (error) {
      this.#rejectWaiters(
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    const waiter = this.#waiters.shift();
    if (!waiter) {
      this.#messages.push(message);
      return;
    }
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  #rejectWaiters(error: Error): void {
    for (const waiter of this.#waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

function expectResponseResult<T>(
  message: JsonRpcMessage,
  id: RequestId,
  method: string,
): T {
  if (isJsonRpcErrorResponse(message)) {
    throw new Error(`${method} failed: ${message.error.message}`);
  }
  if (!isJsonRpcResponse(message) || message.id !== id) {
    throw new Error(`expected ${method} response for request ${String(id)}`);
  }
  return message.result as T;
}

function assertInitializeResponseProtocol(
  response: InitializeResponse,
  expectedProtocolVersion: string,
): void {
  if (response.serverInfo.protocolVersion !== expectedProtocolVersion) {
    throw new Error(
      `unsupported app-server protocol: expected ${expectedProtocolVersion}, got ${response.serverInfo.protocolVersion}`,
    );
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
