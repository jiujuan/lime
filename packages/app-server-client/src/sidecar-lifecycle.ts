import type { InitializeParams } from "./protocol.js";
import {
  defaultReleaseManifestPath,
  resolveSidecarFromReleaseManifestFile,
} from "./sidecar-manifest.js";
import { connectAppServerSidecar } from "./sidecar-process.js";
import type {
  ConnectedAppServerSidecar,
  PackagedSidecarLifecycleOptions,
  SidecarExitEvent,
  SidecarLifecycleOptions,
  SidecarLaunchConfig,
  SidecarRestartPolicy,
  StartedPackagedAppServerSidecar,
} from "./sidecar-types.js";

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
      const stderrLines =
        error instanceof Error &&
        Array.isArray((error as Error & { stderrLines?: unknown }).stderrLines)
          ? ((error as Error & { stderrLines: string[] }).stderrLines ?? [])
          : [];
      const retryAttempt = attempt + 1;
      this.#options.onRestartFailed?.({
        attempt: retryAttempt,
        error,
        stderrLines,
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
        stderrLines: event.stderrLines,
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

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
