import {
  AppServerSidecarLifecycle,
  decodeMessage,
  defaultReleaseManifestPath,
  encodeMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcErrorResponse,
  type AgentSessionTurnStartParams,
  type AgentSessionTurnStartResponse,
  METHOD_INITIALIZE,
  METHOD_INITIALIZED,
  readReleaseManifest,
  resolveSidecarFromReleaseManifest,
  stdioSidecar,
  type ConnectedAppServerSidecar,
  type InitializeResponse,
  type InitializeParams,
  type JsonRpcRequest,
  type JsonRpcMessage,
  type RequestId,
  type SidecarLaunchConfig,
} from "app-server-client";
import { app } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_APP_SERVER_REQUEST_TIMEOUT_MS = 30_000;
const APP_SERVER_BACKEND_TIMEOUT_GRACE_MS = 30_000;
const APP_SERVER_TURN_START_METHOD = "agentSession/turn/start";
const APP_SERVER_AGENT_APP_UI_RUNTIME_START_METHOD = "agentAppUiRuntime/start";
const APP_SERVER_AGENT_APP_UI_RUNTIME_START_TIMEOUT_MS = 60_000;
const APP_SERVER_STREAMING_TURN_ACK_GRACE_MS = 250;
const APP_SERVER_PROXY_REQUEST_ID_PREFIX = "electron-host";

type ElectronAppServerLaunchConfig = {
  config: SidecarLaunchConfig;
  verifySha256?: boolean;
};

type HandleJsonLinesRequest = {
  lines: string[];
};

type DrainEventsRequest = {
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

  async warmup(): Promise<InitializeResponse> {
    const connected = await this.#connect();
    return connected.initializeResponse;
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    const connected = await this.#connect();
    const request = connected.client.request(method, params ?? {});
    const response = await connected.connection.request<T>(request, method, {
      timeoutMs: resolveAppServerRequestTimeoutMs(method),
    });
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
      if (isJsonRpcRequestLike(message) && message.method === METHOD_INITIALIZE) {
        responses.push(initializeResponseMessage(message, connected.initializeResponse));
        continue;
      }
      if (isJsonRpcRequestLike(message)) {
        const proxiedMessage = this.#proxyRequestMessage(message);
        if (proxiedMessage.message.method === APP_SERVER_TURN_START_METHOD) {
          responses.push(
            ...(await this.#requestStreamingTurnStart(
              connected,
              message,
              proxiedMessage.message,
            )),
          );
          continue;
        }
        const result = await connected.connection.request<unknown>(
          proxiedMessage.message,
          proxiedMessage.message.method,
          {
            timeoutMs: resolveAppServerRequestTimeoutMs(proxiedMessage.message.method),
          },
        );
        responses.push(
          ...result.messages.map((response) =>
            restoreProxyResponseId(response, proxiedMessage.originalId),
          ),
        );
        continue;
      }
      connected.connection.transport.send(message);
    }

    return {
      lines: responses.map(encodeMessage),
    };
  }

  async drainEvents(request: DrainEventsRequest = {}): Promise<{ lines: string[] }> {
    const connected = await this.#connect();
    const limit = Math.max(1, Math.min(100, Math.floor(request.limit ?? 20)));
    const drained: JsonRpcMessage[] = [];

    for (let index = 0; index < limit; index += 1) {
      try {
        drained.push(await connected.connection.nextNotification(25));
      } catch {
        break;
      }
    }

    return {
      lines: drained.map(encodeMessage),
    };
  }

  async stop(): Promise<void> {
    await this.#lifecycle?.stop();
    this.#lifecycle = null;
    this.#connected = null;
    this.#connectPromise = null;
  }

  async #connect(): Promise<ConnectedAppServerSidecar> {
    if (this.#connected) {
      return this.#connected;
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

  async #start(): Promise<ConnectedAppServerSidecar> {
    const launchConfig = await resolveLaunchConfig();
    const initializeParams: InitializeParams = {
      clientInfo: {
        name: "lime_desktop_electron",
        title: "Lime Desktop Electron",
        version: app.getVersion(),
      },
      capabilities: {
        eventMethods: ["agentSession/event"],
        experimental: true,
      },
    };

    this.#lifecycle = new AppServerSidecarLifecycle(launchConfig.config, initializeParams, {
      verifySha256: launchConfig.verifySha256,
      restartPolicy: {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 5_000,
      },
      onExit: (event) => {
        console.warn("[electron-host] app-server exited", event);
      },
      onRestartFailed: (event) => {
        console.warn("[electron-host] app-server restart failed", event);
      },
    });

    return await this.#lifecycle.start();
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
  ): Promise<JsonRpcMessage[]> {
    const requestPromise = connected.connection
      .request<AgentSessionTurnStartResponse>(message, message.method, {
        timeoutMs: resolveAppServerRequestTimeoutMs(message.method),
      });

    const fastResult = await Promise.race<
      { kind: "done"; messages: JsonRpcMessage[] } | { kind: "pending" }
    >([
      requestPromise.then((result) => ({
        kind: "done" as const,
        messages: result.messages.map((response) =>
          restoreProxyResponseId(response, originalMessage.id),
        ),
      })),
      wait(APP_SERVER_STREAMING_TURN_ACK_GRACE_MS).then(() => ({
        kind: "pending" as const,
      })),
    ]);

    if (fastResult.kind === "done") {
      return fastResult.messages;
    }

    requestPromise.catch((error) => {
        console.warn("[electron-host] app-server streaming turn failed", error);
      });

    return [
      streamingTurnStartAcceptedResponse(
        originalMessage,
        message,
      ),
    ];
  }
}

function streamingTurnStartAcceptedResponse(
  originalMessage: JsonRpcRequest,
  proxiedMessage: JsonRpcRequest,
): JsonRpcMessage {
  const params = turnStartParams(proxiedMessage);
  const now = new Date().toISOString();
  const sessionId = nonEmptyString(params?.sessionId) || "";
  const turnId = nonEmptyString(params?.turnId) || `turn_${String(proxiedMessage.id)}`;
  return {
    id: originalMessage.id,
    result: {
      turn: {
        turnId,
        sessionId,
        threadId: sessionId,
        status: "accepted",
        startedAt: now,
      },
    },
  } satisfies JsonRpcMessage;
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

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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

async function resolveLaunchConfig(): Promise<ElectronAppServerLaunchConfig> {
  const envBinary = process.env.APP_SERVER_BIN?.trim();
  if (envBinary) {
    return {
      config: stdioSidecarWithRuntimeBackend(
        envBinary,
        process.env.APP_SERVER_POLICY_PATH,
        "unavailable",
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
      "unavailable",
    ),
  };
}

async function resolveResourceLaunchConfig(
  resourcesPath: string,
): Promise<ElectronAppServerLaunchConfig | null> {
  const manifestPath = defaultReleaseManifestPath(resourcesPath);
  try {
    const manifest = await readReleaseManifest(manifestPath);
    const resolved = resolveSidecarFromReleaseManifest(manifest, {
      allowEnvOverride: false,
      resourcesPath,
      appPolicyPath: process.env.APP_SERVER_POLICY_PATH,
      ...resolveRuntimeBackendLaunchOptions("unavailable"),
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
): SidecarLaunchConfig {
  return {
    ...stdioSidecar(binaryPath, appPolicyPath),
    ...resolveRuntimeBackendLaunchOptions(defaultBackendMode),
  };
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
      "Electron App Server host does not allow APP_SERVER_BACKEND_MODE=mock. Use APP_SERVER_BACKEND_MODE=external with APP_SERVER_BACKEND_COMMAND, or leave it unavailable.",
    );
  }
  if (normalized === "unavailable" || normalized === "external") {
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

function resolveAppServerRequestTimeoutMs(method: string): number {
  if (method === APP_SERVER_AGENT_APP_UI_RUNTIME_START_METHOD) {
    return APP_SERVER_AGENT_APP_UI_RUNTIME_START_TIMEOUT_MS;
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
  return isJsonRpcNotification(message) && message.method === METHOD_INITIALIZED;
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
