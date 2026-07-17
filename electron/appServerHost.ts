import {
  AppServerRequestError,
  AppServerSidecarLifecycle,
  cancelRequest,
  decodeMessage,
  defaultReleaseManifestPath,
  encodeMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcErrorResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  type AgentSessionReadResponse,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
  readReleaseManifest,
  resolveSidecarFromReleaseManifest,
  stdioSidecar,
  type AppServerRequestOptions,
  type AppServerRequestResult,
  type ConnectedAppServerSidecar,
  type InitializeResponse,
  type InitializeParams,
  type JsonRpcRequest,
  type JsonRpcMessage,
  type RequestId,
  type SidecarLaunchConfig,
} from "@limecloud/app-server-client";
import { app, session } from "./electronRuntime";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_APP_SERVER_REQUEST_TIMEOUT_MS = 30_000;
const APP_SERVER_BACKEND_TIMEOUT_GRACE_MS = 30_000;
const APP_SERVER_TURN_START_METHOD = "agentSession/turn/start";
const APP_SERVER_PLUGIN_UI_RUNTIME_START_METHOD = "pluginUiRuntime/start";
const APP_SERVER_PROJECT_SHELL_DRAIN_EVENTS_METHOD =
  "projectShell/session/drainEvents";
const APP_SERVER_CONVERSATION_IMPORT_THREAD_COMMIT_METHOD =
  "conversationImport/thread/commit";
const APP_SERVER_CONVERSATION_IMPORT_JOB_READ_METHOD =
  "conversationImport/job/read";
const APP_SERVER_PLUGIN_UI_RUNTIME_START_TIMEOUT_MS = 60_000;
const APP_SERVER_PLUGIN_INSTALLED_SAVE_TIMEOUT_MS = 240_000;
const APP_SERVER_PLUGIN_PACKAGE_INSPECT_TIMEOUT_MS = 240_000;
const APP_SERVER_PROJECT_SHELL_DRAIN_EVENTS_TIMEOUT_MS = 3_000;
const APP_SERVER_CONVERSATION_IMPORT_THREAD_COMMIT_TIMEOUT_MS = 180_000;
const APP_SERVER_CONVERSATION_IMPORT_SCAN_TIMEOUT_MS = 120_000;
const APP_SERVER_CONVERSATION_IMPORT_PREVIEW_TIMEOUT_MS = 120_000;
const APP_SERVER_REQUEST_TIMEOUT_OVERRIDE_CEILING_MS = 600_000;
const APP_SERVER_STREAMING_TURN_ACK_GRACE_MS = 250;
const APP_SERVER_STREAMING_TURN_IDENTITY_READ_RETRY_MS = 25;
const APP_SERVER_PROXY_REQUEST_ID_PREFIX = "electron-host";
const APP_SERVER_CANCEL_REQUEST_METHOD = "$/cancelRequest";
const APP_SERVER_DATA_DIR_NAME = "app-server";
const APP_SERVER_CONFIG_FILE_NAME = "config.yaml";
const APP_SERVER_RECENT_NOTIFICATION_LIMIT = 500;
const APP_SERVER_PROXY_PROBE_URL = "https://llm.limeai.run/v1/models";
const APP_SERVER_PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;
const APP_SERVER_NO_PROXY_ENV_KEYS = ["NO_PROXY", "no_proxy"] as const;
const APP_SERVER_LOOPBACK_NO_PROXY_HOSTS = ["127.0.0.1", "localhost", "::1"];
const DEFAULT_APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP: NonNullable<
  SidecarLaunchConfig["productDbMigrationCleanup"]
> = "drop-tables";

type ElectronAppServerLaunchConfig = {
  config: SidecarLaunchConfig;
  verifySha256?: boolean;
};

type HandleJsonLinesRequest = {
  lines: string[];
  timeoutMs?: number;
};

type DrainEventsRequest = {
  includeRecent?: boolean;
  limit?: number;
};

type JsonRpcRequestWithParams = JsonRpcRequest & {
  params?: unknown;
};

export class ElectronAppServerHost {
  #lifecycle: AppServerSidecarLifecycle | null = null;
  #connected: ConnectedAppServerSidecar | null = null;
  #connectPromise: Promise<ConnectedAppServerSidecar> | null = null;
  #nextProxyRequestId = 1;
  #activeProxyRequestIds = new Map<RequestId, RequestId>();
  #recentNotifications: JsonRpcMessage[] = [];
  #stopping = false;

  async warmup(): Promise<InitializeResponse> {
    const connected = await this.#connect();
    return connected.initializeResponse;
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    const connected = await this.#connect();
    const request = connected.client.request(method, params ?? {});
    const response = await this.#requestAppServer<T>(
      connected,
      request,
      method,
      {
        timeoutMs: resolveAppServerRequestTimeoutMs(method),
      },
    );
    return response.result;
  }

  async handleJsonLines(
    request: HandleJsonLinesRequest,
  ): Promise<{ lines: string[] }> {
    const connected = await this.#connect();
    const messages = request.lines.map(decodeMessage);
    const responses: JsonRpcMessage[] = [];

    for (const message of messages) {
      if (isInitializedNotification(message)) {
        continue;
      }
      if (isCancelRequestNotification(message)) {
        this.#forwardCancelRequest(connected, message);
        continue;
      }
      if (
        isJsonRpcRequestLike(message) &&
        message.method === METHOD_INITIALIZE
      ) {
        responses.push(
          initializeResponseMessage(message, connected.initializeResponse),
        );
        continue;
      }
      if (isJsonRpcRequestLike(message)) {
        const proxiedMessage = this.#proxyRequestMessage(message);
        const timeoutMs = resolveAppServerRequestTimeoutMs(
          proxiedMessage.message.method,
          request.timeoutMs,
        );
        if (proxiedMessage.message.method === APP_SERVER_TURN_START_METHOD) {
          try {
            responses.push(
              ...(await this.#requestStreamingTurnStart(
                connected,
                message,
                proxiedMessage.message,
                timeoutMs,
              )),
            );
          } catch (error) {
            const errorMessages = restoreAppServerRequestError(
              error,
              proxiedMessage.originalId,
            );
            if (!errorMessages) {
              throw error;
            }
            responses.push(...errorMessages);
          }
          continue;
        }
        try {
          const result = await this.#withActiveProxyRequest(
            proxiedMessage.originalId,
            proxiedMessage.message.id,
            () =>
              this.#requestAppServer<unknown>(
                connected,
                proxiedMessage.message,
                proxiedMessage.message.method,
                { timeoutMs },
              ),
          );
          responses.push(
            ...result.messages.map((response) =>
              restoreProxyResponseId(response, proxiedMessage.originalId),
            ),
          );
        } catch (error) {
          const errorMessages = restoreAppServerRequestError(
            error,
            proxiedMessage.originalId,
          );
          if (!errorMessages) {
            throw error;
          }
          responses.push(...errorMessages);
        }
        continue;
      }
      (await this.#connect()).connection.transport.send(message);
    }

    this.#rememberRecentNotifications(responses);
    return {
      lines: responses.map(encodeMessage),
    };
  }

  async drainEvents(
    request: DrainEventsRequest = {},
  ): Promise<{ lines: string[] }> {
    const connected = await this.#connect();
    const limit = normalizeDrainEventsLimit(
      request.limit,
      request.includeRecent === true
        ? APP_SERVER_RECENT_NOTIFICATION_LIMIT
        : 100,
    );
    const drained: JsonRpcMessage[] = [];

    for (let index = 0; index < limit; index += 1) {
      try {
        drained.push(await connected.connection.nextServerMessage(25));
      } catch {
        break;
      }
    }

    this.#rememberRecentNotifications(drained);
    const messages =
      request.includeRecent === true
        ? uniqueJsonRpcMessages([
            ...this.#recentNotifications,
            ...drained,
          ]).slice(-limit)
        : drained;

    return {
      lines: messages.map(encodeMessage),
    };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    await this.#lifecycle?.stop();
    this.#lifecycle = null;
    this.#connected = null;
    this.#connectPromise = null;
  }

  async #connect(): Promise<ConnectedAppServerSidecar> {
    if (this.#stopping) {
      throw appServerHostStoppingError();
    }
    if (this.#connected) {
      const lifecycleConnected = this.#lifecycle?.connected;
      if (lifecycleConnected && lifecycleConnected !== this.#connected) {
        this.#connected = lifecycleConnected;
        return lifecycleConnected;
      }
      if (lifecycleConnected) {
        return this.#connected;
      }
      this.#connected = null;
    }
    if (!this.#connectPromise) {
      this.#connectPromise = this.#start();
    }
    try {
      this.#connected = await this.#connectPromise;
      return this.#connected;
    } finally {
      this.#connectPromise = null;
    }
  }

  #rememberRecentNotifications(messages: JsonRpcMessage[]): void {
    const notifications = messages.filter(isJsonRpcNotification);
    if (notifications.length === 0) {
      return;
    }
    this.#recentNotifications = [
      ...this.#recentNotifications,
      ...notifications,
    ].slice(-APP_SERVER_RECENT_NOTIFICATION_LIMIT);
  }

  async #start(): Promise<ConnectedAppServerSidecar> {
    const launchConfig = await resolveLaunchConfig();
    const sidecarEnv = await resolveAppServerSidecarEnv(
      launchConfig.config.binaryPath,
    );
    const initializeParams: InitializeParams = {
      clientInfo: {
        name: "lime_desktop_electron",
        title: "Lime Desktop Electron",
        version: app.getVersion(),
      },
      capabilities: {
        eventMethods: [
          "agentSession/event",
          METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
        ],
        experimental: true,
      },
    };

    let lifecycle: AppServerSidecarLifecycle;
    lifecycle = new AppServerSidecarLifecycle(
      launchConfig.config,
      initializeParams,
      {
        verifySha256: launchConfig.verifySha256,
        ...(sidecarEnv ? { env: sidecarEnv } : {}),
        restartPolicy: {
          maxAttempts: 3,
          initialDelayMs: 500,
          maxDelayMs: 5_000,
        },
        onExit: (event) => {
          if (this.#lifecycle === lifecycle) {
            this.#connected = null;
            this.#connectPromise = null;
          }
          console.warn("[electron-host] app-server exited", event);
        },
        onRestarted: (connected) => {
          if (this.#lifecycle === lifecycle) {
            this.#connected = connected;
            this.#connectPromise = null;
          }
        },
        onRestartFailed: (event) => {
          if (this.#lifecycle === lifecycle) {
            this.#connected = null;
            this.#connectPromise = null;
          }
          console.warn("[electron-host] app-server restart failed", event);
        },
      },
    );

    this.#lifecycle = lifecycle;
    return await lifecycle.start();
  }

  #proxyRequestMessage(message: JsonRpcRequest): {
    message: JsonRpcRequest;
    originalId: RequestId;
  } {
    const originalId = message.id;
    const id = `${APP_SERVER_PROXY_REQUEST_ID_PREFIX}:${this.#nextProxyRequestId}`;
    this.#nextProxyRequestId += 1;
    return {
      message: {
        ...message,
        id,
      },
      originalId,
    };
  }

  async #requestStreamingTurnStart(
    connected: ConnectedAppServerSidecar,
    originalMessage: JsonRpcRequest,
    message: JsonRpcRequest,
    timeoutMs: number,
  ): Promise<JsonRpcMessage[]> {
    const requestDeadlineAtMs = Date.now() + timeoutMs;
    try {
      const result = await this.#withActiveProxyRequest(
        originalMessage.id,
        message.id,
        () =>
          this.#requestAppServerUntilFirstNotificationOrResponse<AgentSessionTurnStartResponse>(
            connected,
            message,
            message.method,
            {
              timeoutMs: APP_SERVER_STREAMING_TURN_ACK_GRACE_MS,
            },
          ),
      );
      const messages = result.messages.map((response) =>
        restoreProxyResponseId(response, originalMessage.id),
      );
      if (result.completed) {
        return messages;
      }
      const identity = turnEventIdentity(result.messages[0]);
      const acceptedIdentity =
        identity && turnIdentityMatchesStart(identity, originalMessage)
          ? identity
          : await this.#readCanonicalTurnIdentity(
              connected,
              originalMessage,
              requestDeadlineAtMs,
            );
      return [
        streamingTurnStartAcceptedResponse(originalMessage, acceptedIdentity),
      ];
    } catch (error) {
      if (!isAppServerRequestTimeoutError(error)) {
        throw error;
      }
      const identity = await this.#readCanonicalTurnIdentity(
        connected,
        originalMessage,
        requestDeadlineAtMs,
      );
      return [streamingTurnStartAcceptedResponse(originalMessage, identity)];
    }
  }

  async #readCanonicalTurnIdentity(
    connected: ConnectedAppServerSidecar,
    originalMessage: JsonRpcRequest,
    requestDeadlineAtMs: number,
  ): Promise<CanonicalTurnIdentity> {
    const params = turnStartParams(originalMessage);
    const sessionId = nonEmptyString(params?.sessionId);
    const turnId = nonEmptyString(params?.turnId);
    if (!sessionId || !turnId) {
      throw new Error(
        "app-server turn/start timed out before a canonical turn identity event",
      );
    }

    for (;;) {
      const remainingMs = requestDeadlineAtMs - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      const read = await this.#requestAppServer<AgentSessionReadResponse>(
        connected,
        connected.connection.client.readSession({ sessionId }),
        "agentSession/read",
        {
          timeoutMs: remainingMs,
        },
      );
      const identity = turnIdentityFromSessionRead(
        read.result,
        sessionId,
        turnId,
      );
      if (identity) {
        return identity;
      }

      const retryDelayMs = Math.min(
        APP_SERVER_STREAMING_TURN_IDENTITY_READ_RETRY_MS,
        Math.max(0, requestDeadlineAtMs - Date.now()),
      );
      if (retryDelayMs <= 0) {
        break;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs);
      });
    }

    throw new Error(
      "app-server turn/start did not resolve a canonical turn identity",
    );
  }

  async #withActiveProxyRequest<T>(
    originalId: RequestId,
    proxiedId: RequestId,
    run: () => Promise<T>,
  ): Promise<T> {
    this.#activeProxyRequestIds.set(originalId, proxiedId);
    try {
      return await run();
    } finally {
      this.#activeProxyRequestIds.delete(originalId);
    }
  }

  #forwardCancelRequest(
    connected: ConnectedAppServerSidecar,
    message: JsonRpcMessage,
  ): void {
    const originalId = readCancelRequestId(message);
    if (originalId === null) {
      return;
    }
    const proxiedId = this.#activeProxyRequestIds.get(originalId);
    if (proxiedId === undefined) {
      return;
    }
    connected.connection.transport.send(cancelRequest(proxiedId));
  }

  async #requestAppServer<T>(
    connected: ConnectedAppServerSidecar,
    request: JsonRpcRequest,
    method: string,
    options: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<T>> {
    try {
      return await connected.connection.request<T>(request, method, options);
    } catch (error) {
      if (!isStaleSidecarConnectionError(error)) {
        throw error;
      }
      if (this.#stopping) {
        throw appServerHostStoppingError();
      }

      console.warn(
        "[electron-host] app-server stale connection detected; restarting sidecar",
        error,
      );
      await this.#discardStaleSidecar();
      const freshConnected = await this.#connect();
      return await freshConnected.connection.request<T>(
        request,
        method,
        options,
      );
    }
  }

  async #requestAppServerUntilFirstNotificationOrResponse<T>(
    connected: ConnectedAppServerSidecar,
    request: JsonRpcRequest,
    method: string,
    options: AppServerRequestOptions,
  ) {
    try {
      return await connected.connection.requestUntilFirstNotificationOrResponse<T>(
        request,
        method,
        options,
      );
    } catch (error) {
      if (!isStaleSidecarConnectionError(error)) {
        throw error;
      }
      if (this.#stopping) {
        throw appServerHostStoppingError();
      }

      console.warn(
        "[electron-host] app-server stale connection detected; restarting sidecar",
        error,
      );
      await this.#discardStaleSidecar();
      const freshConnected = await this.#connect();
      return await freshConnected.connection.requestUntilFirstNotificationOrResponse<T>(
        request,
        method,
        options,
      );
    }
  }

  async #discardStaleSidecar(): Promise<void> {
    const lifecycle = this.#lifecycle;
    this.#lifecycle = null;
    this.#connected = null;
    this.#connectPromise = null;
    try {
      await lifecycle?.stop();
    } catch (error) {
      console.warn(
        "[electron-host] app-server stale sidecar cleanup failed",
        error,
      );
    }
  }
}

function isStaleSidecarConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("app-server sidecar stdin is closed") ||
      error.message.includes("app-server sidecar is closed") ||
      error.message.includes("app-server exited before next message"))
  );
}

function appServerHostStoppingError(): Error {
  return new Error("app-server host is stopping");
}

function isAppServerRequestTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("timed out waiting for app-server message after")
  );
}

function isCancelRequestNotification(
  message: JsonRpcMessage,
): message is Extract<JsonRpcMessage, { method: string }> {
  return (
    isJsonRpcNotification(message) &&
    message.method === APP_SERVER_CANCEL_REQUEST_METHOD
  );
}

function readCancelRequestId(message: JsonRpcMessage): RequestId | null {
  if (!isCancelRequestNotification(message)) {
    return null;
  }
  const params = message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const id = (params as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function normalizeDrainEventsLimit(value: unknown, maxLimit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(maxLimit, Math.floor(value)));
}

function uniqueJsonRpcMessages(messages: JsonRpcMessage[]): JsonRpcMessage[] {
  const seen = new Set<string>();
  const uniqueMessages: JsonRpcMessage[] = [];

  for (const message of messages) {
    const key = jsonRpcMessageDedupKey(message);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueMessages.push(message);
  }

  return uniqueMessages;
}

function jsonRpcMessageDedupKey(message: JsonRpcMessage): string {
  const eventId = jsonRpcNotificationEventId(message);
  if (eventId) {
    return `event:${eventId}`;
  }
  return `message:${JSON.stringify(message)}`;
}

function jsonRpcNotificationEventId(
  message: JsonRpcMessage,
): string | undefined {
  if (!isJsonRpcNotification(message)) {
    return undefined;
  }
  const params = message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return undefined;
  }
  const event = (params as { event?: unknown }).event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return undefined;
  }
  const eventId =
    (event as { eventId?: unknown; event_id?: unknown }).eventId ??
    (event as { eventId?: unknown; event_id?: unknown }).event_id;
  return typeof eventId === "string" && eventId.trim()
    ? eventId.trim()
    : undefined;
}

type CanonicalTurnIdentity = {
  sessionId: string;
  threadId: string;
  turnId: string;
  timestamp: string;
};

function streamingTurnStartAcceptedResponse(
  originalMessage: JsonRpcRequest,
  identity: CanonicalTurnIdentity,
): JsonRpcMessage {
  const expected = turnStartParams(originalMessage);
  const sessionId = nonEmptyString(expected?.sessionId);
  const requestedTurnId = nonEmptyString(expected?.turnId);
  if (!sessionId || identity.sessionId !== sessionId) {
    throw new Error(
      "app-server turn/start did not emit a canonical turn identity",
    );
  }
  if (requestedTurnId && identity.turnId !== requestedTurnId) {
    throw new Error(
      "app-server turn/start admission turnId does not match the requested turn",
    );
  }
  return {
    id: originalMessage.id,
    result: {
      turn: {
        turnId: identity.turnId,
        sessionId: identity.sessionId,
        threadId: identity.threadId,
        status: "accepted",
        startedAt: identity.timestamp,
      },
    },
  } satisfies JsonRpcMessage;
}

function turnEventIdentity(
  message: JsonRpcMessage | undefined,
): CanonicalTurnIdentity | null {
  if (
    !message ||
    !isJsonRpcNotification(message) ||
    message.method !== "agentSession/event"
  ) {
    return null;
  }
  const params = message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const event = (params as { event?: unknown }).event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return null;
  }
  const record = event as {
    sessionId?: unknown;
    threadId?: unknown;
    timestamp?: unknown;
    turnId?: unknown;
    type?: unknown;
  };
  const sessionId = nonEmptyString(record.sessionId);
  const threadId = nonEmptyString(record.threadId);
  const turnId = nonEmptyString(record.turnId);
  const timestamp = nonEmptyString(record.timestamp);
  if (!sessionId || !threadId || !turnId || !timestamp) {
    return null;
  }
  return { sessionId, threadId, turnId, timestamp };
}

function turnIdentityMatchesStart(
  identity: CanonicalTurnIdentity,
  originalMessage: JsonRpcRequest,
): boolean {
  const params = turnStartParams(originalMessage);
  const sessionId = nonEmptyString(params?.sessionId);
  const turnId = nonEmptyString(params?.turnId);
  return (
    (!sessionId || identity.sessionId === sessionId) &&
    (!turnId || identity.turnId === turnId)
  );
}

function turnIdentityFromSessionRead(
  response: AgentSessionReadResponse,
  sessionId: string,
  turnId: string,
): CanonicalTurnIdentity | null {
  if (response.session.sessionId !== sessionId) {
    return null;
  }
  const threadId = nonEmptyString(response.session.threadId);
  const turn = response.turns?.find((candidate) => candidate.turnId === turnId);
  if (
    !threadId ||
    !turn ||
    turn.sessionId !== sessionId ||
    turn.threadId !== threadId
  ) {
    return null;
  }
  return {
    sessionId,
    threadId,
    turnId,
    timestamp: nonEmptyString(turn.startedAt) ?? response.session.updatedAt,
  };
}

function turnStartParams(
  message: JsonRpcRequest,
): AgentSessionTurnStartParams | undefined {
  const params = (message as JsonRpcRequestWithParams).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return undefined;
  }
  return params as AgentSessionTurnStartParams;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function restoreProxyResponseId(
  message: JsonRpcMessage,
  originalId: RequestId,
): JsonRpcMessage {
  if (isJsonRpcResponse(message) || isJsonRpcErrorResponse(message)) {
    return {
      ...message,
      id: originalId,
    };
  }
  return message;
}

function restoreAppServerRequestError(
  error: unknown,
  originalId: RequestId,
): JsonRpcMessage[] | null {
  if (!(error instanceof AppServerRequestError)) {
    return null;
  }
  const messages =
    error.messages.length > 0 ? error.messages : [error.response];
  return messages.map((message) => restoreProxyResponseId(message, originalId));
}

async function resolveLaunchConfig(): Promise<ElectronAppServerLaunchConfig> {
  const dataDir = resolveAppServerDataDir();
  const envBinary = process.env.APP_SERVER_BIN?.trim();
  if (envBinary) {
    return {
      config: stdioSidecarWithRuntimeBackend(
        envBinary,
        process.env.APP_SERVER_POLICY_PATH,
        "runtime",
        dataDir,
      ),
    };
  }

  const resourcesPath = process.resourcesPath;
  const resourceRoots = [
    resourcesPath,
    path.resolve(app.getAppPath(), "dist-electron"),
  ];
  for (const resourceRoot of resourceRoots) {
    const config = await resolveResourceLaunchConfig(resourceRoot);
    if (config) {
      return config;
    }
  }

  const devBinaryPath = resolveDevAppServerBinaryPath(app.getAppPath());
  return {
    config: stdioSidecarWithRuntimeBackend(
      devBinaryPath,
      process.env.APP_SERVER_POLICY_PATH,
      "runtime",
      dataDir,
    ),
  };
}

async function resolveAppServerSidecarEnv(
  binaryPath: string,
): Promise<NodeJS.ProcessEnv | undefined> {
  const env: NodeJS.ProcessEnv = resolveAppServerRuntimeLibraryEnv(binaryPath);
  const currentNoProxy = APP_SERVER_NO_PROXY_ENV_KEYS.map(
    (key) => process.env[key],
  ).find((value) => Boolean(value?.trim()));
  const noProxy = mergeLoopbackNoProxy(currentNoProxy);
  if (noProxy && noProxy !== process.env.NO_PROXY) {
    env.NO_PROXY = noProxy;
  }
  if (noProxy && noProxy !== process.env.no_proxy) {
    env.no_proxy = noProxy;
  }

  if (!hasExplicitProxyEnv(process.env)) {
    const proxyUrl = await resolveElectronSystemProxyUrl();
    if (proxyUrl) {
      for (const key of APP_SERVER_PROXY_ENV_KEYS) {
        env[key] = proxyUrl;
      }
    }
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

function resolveAppServerRuntimeLibraryEnv(
  binaryPath: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    LIME_CONFIG_PATH: resolveAppServerConfigPath(),
  };
  const binaryDir = path.dirname(binaryPath);
  if (!binaryDir || binaryDir === ".") {
    return env;
  }

  if (process.platform === "darwin") {
    return {
      ...env,
      DYLD_FALLBACK_LIBRARY_PATH: prependPathEnv(
        process.env.DYLD_FALLBACK_LIBRARY_PATH,
        [binaryDir],
      ),
      DYLD_LIBRARY_PATH: prependPathEnv(process.env.DYLD_LIBRARY_PATH, [
        binaryDir,
      ]),
    };
  }

  if (process.platform === "linux") {
    return {
      ...env,
      LD_LIBRARY_PATH: prependPathEnv(process.env.LD_LIBRARY_PATH, [binaryDir]),
    };
  }

  if (process.platform === "win32") {
    return {
      ...env,
      PATH: prependPathEnv(process.env.PATH, [binaryDir]),
    };
  }

  return env;
}

function prependPathEnv(
  currentValue: string | undefined,
  entries: string[],
): string {
  const result: string[] = [];
  const seen = new Set<string>();
  const remember = (entry: string | undefined) => {
    const trimmed = entry?.trim();
    if (!trimmed) {
      return;
    }
    const key = process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  };

  for (const entry of entries) {
    remember(entry);
  }
  for (const entry of currentValue?.split(path.delimiter) ?? []) {
    remember(entry);
  }
  return result.join(path.delimiter);
}

function hasExplicitProxyEnv(env: NodeJS.ProcessEnv): boolean {
  return APP_SERVER_PROXY_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
}

async function resolveElectronSystemProxyUrl(): Promise<string | undefined> {
  if (process.platform !== "darwin") {
    return undefined;
  }

  try {
    const rules = await session.defaultSession.resolveProxy(
      APP_SERVER_PROXY_PROBE_URL,
    );
    return firstProxyRuleToUrl(rules);
  } catch (error) {
    console.warn(
      "[electron-host] failed to resolve system proxy for app-server",
      error,
    );
    return undefined;
  }
}

function firstProxyRuleToUrl(rules: string): string | undefined {
  for (const rawRule of rules.split(";")) {
    const rule = rawRule.trim();
    if (!rule || rule.toUpperCase() === "DIRECT") {
      continue;
    }
    const [kind = "", address = ""] = rule.split(/\s+/, 2);
    const normalizedAddress = address.trim();
    if (!normalizedAddress || normalizedAddress.includes("://")) {
      continue;
    }
    switch (kind.toUpperCase()) {
      case "PROXY":
        return `http://${normalizedAddress}`;
      case "HTTPS":
        return `https://${normalizedAddress}`;
      case "SOCKS":
      case "SOCKS5":
        return `socks5://${normalizedAddress}`;
      default:
        continue;
    }
  }
  return undefined;
}

function mergeLoopbackNoProxy(value: string | undefined): string {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalized = new Set(entries.map((entry) => entry.toLowerCase()));
  for (const host of APP_SERVER_LOOPBACK_NO_PROXY_HOSTS) {
    if (!normalized.has(host.toLowerCase())) {
      entries.push(host);
      normalized.add(host.toLowerCase());
    }
  }
  return entries.join(",");
}

async function resolveResourceLaunchConfig(
  resourcesPath: string,
): Promise<ElectronAppServerLaunchConfig | null> {
  const dataDir = resolveAppServerDataDir();
  const manifestPath = defaultReleaseManifestPath(resourcesPath);
  try {
    const manifest = await readReleaseManifest(manifestPath);
    const resolved = resolveSidecarFromReleaseManifest(manifest, {
      allowEnvOverride: false,
      resourcesPath,
      appPolicyPath: process.env.APP_SERVER_POLICY_PATH,
      dataDir,
      productDbMigrationCleanup: resolveProductDbMigrationCleanup(),
      ...resolveRuntimeBackendLaunchOptions("runtime"),
    });
    if (resolved) {
      return {
        config: resolved.config,
        verifySha256: shouldVerifyResourceSha256(resourcesPath),
      };
    }
  } catch {
    // 开发态或未执行资源准备时可以没有 packaged manifest。
  }
  return null;
}

function shouldVerifyResourceSha256(resourcesPath: string): boolean {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return true;
  }

  return path.resolve(resourcesPath) !== path.resolve(process.resourcesPath);
}

function stdioSidecarWithRuntimeBackend(
  binaryPath: string,
  appPolicyPath: string | undefined,
  defaultBackendMode: NonNullable<SidecarLaunchConfig["backendMode"]>,
  dataDir: string,
): SidecarLaunchConfig {
  return {
    ...stdioSidecar(
      binaryPath,
      appPolicyPath,
      dataDir,
      resolveProductDbMigrationCleanup(),
    ),
    ...resolveRuntimeBackendLaunchOptions(defaultBackendMode),
  };
}

function resolveAppServerDataDir(): string {
  return path.join(app.getPath("userData"), APP_SERVER_DATA_DIR_NAME);
}

function resolveAppServerConfigPath(): string {
  return path.join(app.getPath("userData"), APP_SERVER_CONFIG_FILE_NAME);
}

function resolveProductDbMigrationCleanup(): NonNullable<
  SidecarLaunchConfig["productDbMigrationCleanup"]
> {
  const value = process.env.APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP?.trim();
  if (!value) {
    return DEFAULT_APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP;
  }

  if (
    value === "retain" ||
    value === "clear-rows" ||
    value === "drop-tables" ||
    value === "delete-file"
  ) {
    return value;
  }

  throw new Error(
    "APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP must be one of retain, clear-rows, drop-tables, delete-file",
  );
}

function resolveRuntimeBackendLaunchOptions(
  defaultBackendMode: NonNullable<SidecarLaunchConfig["backendMode"]>,
): Pick<
  SidecarLaunchConfig,
  "backendMode" | "backendCommand" | "backendArgs" | "backendTimeoutMs"
> {
  const backendMode = resolveBackendMode(
    process.env.APP_SERVER_BACKEND_MODE,
    defaultBackendMode,
  );
  const config: Pick<
    SidecarLaunchConfig,
    "backendMode" | "backendCommand" | "backendArgs" | "backendTimeoutMs"
  > = {
    backendMode,
  };

  if (backendMode === "external") {
    const backendCommand = process.env.APP_SERVER_BACKEND_COMMAND?.trim();
    if (backendCommand) {
      config.backendCommand = backendCommand;
    }
    const backendArgs = parseBackendArgs(process.env.APP_SERVER_BACKEND_ARGS);
    if (backendArgs.length > 0) {
      config.backendArgs = backendArgs;
    }
    const backendTimeoutMs = parsePositiveInteger(
      process.env.APP_SERVER_BACKEND_TIMEOUT_MS,
    );
    if (backendTimeoutMs !== undefined) {
      config.backendTimeoutMs = backendTimeoutMs;
    }
  }

  return config;
}

function resolveBackendMode(
  value: string | undefined,
  fallback: NonNullable<SidecarLaunchConfig["backendMode"]>,
): NonNullable<SidecarLaunchConfig["backendMode"]> {
  const normalized = value?.trim();
  if (normalized === "mock") {
    throw new Error(
      "Electron App Server host does not allow APP_SERVER_BACKEND_MODE=mock. Use APP_SERVER_BACKEND_MODE=runtime, APP_SERVER_BACKEND_MODE=external with APP_SERVER_BACKEND_COMMAND, or APP_SERVER_BACKEND_MODE=unavailable.",
    );
  }
  if (
    normalized === "runtime" ||
    normalized === "unavailable" ||
    normalized === "external"
  ) {
    return normalized;
  }
  return fallback;
}

function parseBackendArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveAppServerRequestTimeoutMs(
  method: string,
  requestedTimeoutMs?: unknown,
): number {
  const defaultTimeoutMs = resolveDefaultAppServerRequestTimeoutMs(method);
  const overrideTimeoutMs = parsePositiveIntegerValue(requestedTimeoutMs);
  if (!overrideTimeoutMs) {
    return defaultTimeoutMs;
  }
  return Math.min(
    Math.max(defaultTimeoutMs, overrideTimeoutMs),
    APP_SERVER_REQUEST_TIMEOUT_OVERRIDE_CEILING_MS,
  );
}

function resolveDefaultAppServerRequestTimeoutMs(method: string): number {
  if (method === APP_SERVER_PLUGIN_UI_RUNTIME_START_METHOD) {
    return APP_SERVER_PLUGIN_UI_RUNTIME_START_TIMEOUT_MS;
  }
  if (method === "pluginInstalled/save") {
    return APP_SERVER_PLUGIN_INSTALLED_SAVE_TIMEOUT_MS;
  }
  if (method === "pluginLocalPackage/inspect") {
    return APP_SERVER_PLUGIN_PACKAGE_INSPECT_TIMEOUT_MS;
  }
  if (method === APP_SERVER_PROJECT_SHELL_DRAIN_EVENTS_METHOD) {
    return APP_SERVER_PROJECT_SHELL_DRAIN_EVENTS_TIMEOUT_MS;
  }
  if (method === APP_SERVER_CONVERSATION_IMPORT_THREAD_COMMIT_METHOD) {
    return APP_SERVER_CONVERSATION_IMPORT_THREAD_COMMIT_TIMEOUT_MS;
  }
  if (method === APP_SERVER_CONVERSATION_IMPORT_JOB_READ_METHOD) {
    return APP_SERVER_CONVERSATION_IMPORT_SCAN_TIMEOUT_MS;
  }
  if (method === "conversationImport/source/scan") {
    return APP_SERVER_CONVERSATION_IMPORT_SCAN_TIMEOUT_MS;
  }
  if (method === "conversationImport/thread/preview") {
    return APP_SERVER_CONVERSATION_IMPORT_PREVIEW_TIMEOUT_MS;
  }
  if (method !== APP_SERVER_TURN_START_METHOD) {
    return DEFAULT_APP_SERVER_REQUEST_TIMEOUT_MS;
  }
  const backendTimeoutMs = parsePositiveInteger(
    process.env.APP_SERVER_BACKEND_TIMEOUT_MS,
  );
  return backendTimeoutMs
    ? backendTimeoutMs + APP_SERVER_BACKEND_TIMEOUT_GRACE_MS
    : DEFAULT_APP_SERVER_REQUEST_TIMEOUT_MS;
}

function parsePositiveIntegerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function resolveDevAppServerBinaryPath(appPath: string): string {
  return path.join(
    resolveCargoTargetDirectory(appPath),
    "debug",
    process.platform === "win32" ? "app-server.exe" : "app-server",
  );
}

function resolveCargoTargetDirectory(appPath: string): string {
  const fallback = path.resolve(appPath, "lime-rs", "target");
  try {
    const config = readFileSync(
      path.resolve(appPath, ".cargo", "config.toml"),
      "utf8",
    );
    const match = config.match(/^\s*target-dir\s*=\s*["']([^"']+)["']/m);
    if (!match?.[1]?.trim()) {
      return fallback;
    }
    return path.resolve(appPath, match[1].trim());
  } catch {
    return fallback;
  }
}

function isJsonRpcRequestLike(
  message: JsonRpcMessage,
): message is JsonRpcRequest {
  return "id" in message && "method" in message;
}

function isInitializedNotification(message: JsonRpcMessage): boolean {
  return (
    isJsonRpcNotification(message) && message.method === METHOD_INITIALIZED
  );
}

function initializeResponseMessage(
  request: JsonRpcRequest,
  response: InitializeResponse,
): JsonRpcMessage {
  return {
    id: request.id,
    result: response,
  };
}
