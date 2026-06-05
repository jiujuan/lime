import {
  AppServerSidecarLifecycle,
  decodeMessage,
  defaultReleaseManifestPath,
  encodeMessage,
  isJsonRpcNotification,
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
  type SidecarLaunchConfig,
} from "app-server-client";
import { app } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";

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

export class ElectronAppServerHost {
  #lifecycle: AppServerSidecarLifecycle | null = null;
  #connected: ConnectedAppServerSidecar | null = null;
  #connectPromise: Promise<ConnectedAppServerSidecar> | null = null;

  async warmup(): Promise<InitializeResponse> {
    const connected = await this.#connect();
    return connected.initializeResponse;
  }

  async request<T>(method: string, params: unknown = {}): Promise<T> {
    const connected = await this.#connect();
    const request = connected.client.request(method, params ?? {});
    const response = await connected.connection.request<T>(request, method);
    return response.result;
  }

  async handleJsonLines(
    request: HandleJsonLinesRequest,
  ): Promise<{ lines: string[] }> {
    const connected = await this.#connect();
    const messages = request.lines.map(decodeMessage);
    const responses: JsonRpcMessage[] = [];
    const passthroughLines: string[] = [];
    const pendingResponseIds = new Set(
      messages
        .filter(isJsonRpcRequestLike)
        .filter((message) => {
          if (message.method === METHOD_INITIALIZE) {
            responses.push(initializeResponseMessage(message, connected.initializeResponse));
            return false;
          }
          return true;
        })
        .map((message) => message.id),
    );

    for (const line of request.lines) {
      const message = decodeMessage(line);
      if (isInitializedNotification(message)) {
        continue;
      }
      if (isJsonRpcRequestLike(message) && message.method === METHOD_INITIALIZE) {
        continue;
      }
      passthroughLines.push(line);
    }

    for (const line of passthroughLines) {
      connected.sidecar.sendLine(ensureLineBreak(line));
    }

    while (pendingResponseIds.size > 0) {
      const message = await connected.sidecar.nextMessage();
      responses.push(message);
      if ("id" in message) {
        pendingResponseIds.delete(message.id);
      }
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
        const message = await connected.sidecar.nextMessage(25);
        if (isJsonRpcNotification(message)) {
          drained.push(message);
        }
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
}

async function resolveLaunchConfig(): Promise<ElectronAppServerLaunchConfig> {
  const envBinary = process.env.APP_SERVER_BIN?.trim();
  if (envBinary) {
    return { config: stdioSidecar(envBinary, process.env.APP_SERVER_POLICY_PATH) };
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
  return { config: stdioSidecar(devBinaryPath, process.env.APP_SERVER_POLICY_PATH) };
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
      backendMode: "mock",
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

function ensureLineBreak(line: string): string {
  return line.endsWith("\n") ? line : `${line}\n`;
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
