import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

export const JSONRPC_VERSION = "2.0";
export const PROTOCOL_VERSION = "appserver.v0";
export const SERVER_NAME = "app-server";
export const DEFAULT_LISTEN_URL = "stdio://";
export const DEFAULT_RELEASE_MANIFEST_NAME = "app-server.release.json";

export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_CAPABILITY_LIST = "capability/list";
export const METHOD_ARTIFACT_READ = "artifact/read";
export const METHOD_EVIDENCE_EXPORT = "evidence/export";
export const METHOD_AGENT_SESSION_START = "agentSession/start";
export const METHOD_AGENT_SESSION_READ = "agentSession/read";
export const METHOD_AGENT_SESSION_TURN_START = "agentSession/turn/start";
export const METHOD_AGENT_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
export const METHOD_AGENT_SESSION_ACTION_RESPOND = "agentSession/action/respond";
export const METHOD_AGENT_SESSION_EVENT = "agentSession/event";

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

export type JsonRpcResponse = {
  id: RequestId;
  result: RpcResult;
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

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse
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

export type AgentSessionReadResponse = {
  session: AgentSession;
  turns: AgentTurn[];
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

export type ResolveSidecarFromManifestOptions = ResolveSidecarBinaryPathOptions & {
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

  readArtifacts(params: ArtifactReadParams): JsonRpcRequest {
    return this.request(METHOD_ARTIFACT_READ, params);
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
    const deferredMessages: JsonRpcMessage[] = [];

    try {
      for (;;) {
        const message = await this.nextMessage(options.timeoutMs);
        messages.push(message);

        if (isJsonRpcNotification(message)) {
          notifications.push(message);
          continue;
        }

        if (isJsonRpcErrorResponse(message) && message.id === id) {
          throw new Error(`${method} failed: ${message.error.message}`);
        }

        if (isJsonRpcResponse(message) && message.id === id) {
          this.#prependBufferedMessages(deferredMessages);
          return {
            id,
            result: message.result as T,
            response: message,
            notifications,
            messages,
          };
        }

        deferredMessages.push(message);
      }
    } catch (error) {
      this.#prependBufferedMessages(deferredMessages);
      throw error;
    }
  }

  async nextNotification(timeoutMs?: number): Promise<JsonRpcNotification> {
    for (;;) {
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

  #prependBufferedMessages(messages: JsonRpcMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    this.#bufferedMessages = [...messages, ...this.#bufferedMessages];
  }

  #shiftBufferedNotification(): JsonRpcNotification | undefined {
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

export function request(id: RequestId, method: string, params?: unknown): JsonRpcRequest {
  return compactParams({ id, method, params });
}

export function notification(method: string, params?: unknown): JsonRpcNotification {
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

export function sidecarBinaryName(platform: NodeJS.Platform | string = process.platform): string {
  return platform === "win32" ? "app-server.exe" : "app-server";
}

export function defaultPackagedSidecarRelativePath(
  platform: NodeJS.Platform | string = process.platform,
  arch: NodeJS.Architecture | string = process.arch,
): string {
  return path.join("app-server", platformKey(platform, arch), sidecarBinaryName(platform));
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

export function stdioSidecar(binaryPath: string, appPolicyPath?: string): SidecarLaunchConfig {
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
  for (const backendArg of config.backendMode === "external" ? config.backendArgs ?? [] : []) {
    args.push("--backend-arg", backendArg);
  }
  if (config.backendMode === "external" && config.backendTimeoutMs !== undefined) {
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
  assertCompatibleManifest(manifest, options.expectedProtocolVersion ?? PROTOCOL_VERSION);
  const artifact = findReleaseArtifact(manifest, platformKey(options.platform, options.arch));
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
      ...(options.backendCommand ? { backendCommand: options.backendCommand } : {}),
      ...(options.backendArgs ? { backendArgs: options.backendArgs } : {}),
      ...(options.backendTimeoutMs !== undefined ? { backendTimeoutMs: options.backendTimeoutMs } : {}),
      ...(options.appPolicyPath ? { appPolicyPath: options.appPolicyPath } : {}),
      expectedSha256: binaryPath.source === "resources" ? artifact.sha256 : undefined,
      artifact,
    },
    artifact,
    binaryPathSource: binaryPath.source,
  };
}

export async function readReleaseManifest(path: string): Promise<AppServerReleaseManifest> {
  return JSON.parse(await readFile(path, "utf8")) as AppServerReleaseManifest;
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

export function sha256Hex(content: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256Hex(await readFile(path));
}

export function assertSha256(actualSha256: string, expectedSha256: string): void {
  if (normalizeSha256(actualSha256) !== normalizeSha256(expectedSha256)) {
    throw new Error("app-server sha256 mismatch");
  }
}

export async function assertSidecarFileSha256(config: SidecarLaunchConfig): Promise<void> {
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
    const initializeMessage = await sidecar.nextMessage(options.initializeTimeoutMs);
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
    defaultReleaseManifestPath(options.resourcesPath, options.manifestRelativePath);
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
      if (this.#stopped || !shouldRestartSidecar(retryAttempt, this.#options.restartPolicy)) {
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
    const delayMs = sidecarRestartDelayMs(event.attempt, this.#options.restartPolicy);
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
        this.#rejectWaiters(new Error(`app-server exited before next message: code=${code}, signal=${signal}`));
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
        this.#waiters = this.#waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error(`timed out waiting for app-server message after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#waiters.push({ resolve, reject, timer });
    });
  }

  async waitForExit(timeoutMs = 5_000): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    await withTimeout(once(this.child, "exit"), timeoutMs, "timed out waiting for app-server exit");
  }

  async close(signal: NodeJS.Signals = "SIGTERM", timeoutMs = 5_000): Promise<void> {
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
      this.#rejectWaiters(error instanceof Error ? error : new Error(String(error)));
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

function compactParams<T extends { params?: unknown }>(value: T): T {
  if (value.params === undefined) {
    const { params: _params, ...rest } = value;
    return rest as T;
  }
  return value;
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
  if (!isJsonRpcNotification(message) || message.method !== METHOD_AGENT_SESSION_EVENT) {
    return undefined;
  }
  const params = message.params as Partial<AgentSessionEventParams> | undefined;
  if (!params || !params.event) {
    return undefined;
  }
  return message as AgentSessionEventNotification;
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "id" in message && "result" in message;
}

export function isJsonRpcErrorResponse(
  message: JsonRpcMessage,
): message is JsonRpcErrorResponse {
  return "id" in message && "error" in message;
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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
