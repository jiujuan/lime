import {
  METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
  METHOD_PROJECT_SHELL_SESSION_KILL,
  METHOD_PROJECT_SHELL_SESSION_RESIZE,
  METHOD_PROJECT_SHELL_SESSION_START,
  METHOD_PROJECT_SHELL_SESSION_WRITE,
} from "@limecloud/app-server-client";
import path from "node:path";
import {
  normalizeProjectShellTimeout,
  runProjectShellCommand,
  type ProjectShellCommandResult,
} from "./projectToolsHost";

type HostArgs = Record<string, unknown> | null | undefined;
type AppServerParams = Record<string, unknown>;
type AppServerRequest = <T>(
  method: string,
  params?: AppServerParams,
) => Promise<T>;
type HostEventEmitter = (event: string, payload?: unknown) => void;

type ProjectShellSessionStartResult = {
  sessionId: string;
  cwd: string;
  shell: string;
  title: string;
  localEcho: boolean;
  tty: boolean;
  pid: number | null;
};
type ProjectShellSessionEvent =
  | {
      type: "data";
      sessionId: string;
      stream: "stdout" | "stderr";
      data: string;
    }
  | {
      type: "exit";
      sessionId: string;
      exitCode: number | null;
      signal: string | null;
    }
  | {
      type: "error";
      sessionId: string;
      message: string;
    };
type ProjectShellSessionDrainEventsResponse = {
  events: ProjectShellSessionEvent[];
};

const PROJECT_SHELL_SESSION_EVENT = "project-shell-session-event";
const PROJECT_SHELL_EVENT_POLL_INTERVAL_MS = 80;
const PROJECT_SHELL_EVENT_DRAIN_LIMIT = 200;

export class ProjectShellHost {
  readonly #appServerRequest: AppServerRequest;
  readonly #emit: HostEventEmitter;
  readonly #sessions = new Set<string>();
  #eventPoller: ReturnType<typeof setInterval> | null = null;
  #eventDrainInFlight = false;

  constructor(
    appServerRequest: AppServerRequest,
    emit: HostEventEmitter = () => undefined,
  ) {
    this.#appServerRequest = appServerRequest;
    this.#emit = emit;
  }

  async runCommand(args: HostArgs): Promise<ProjectShellCommandResult> {
    const request = readRequest(args);
    const rootPath = readRequiredAbsolutePath(request, "rootPath");
    const command = readRequiredRawString(request, "command").trim();
    if (!command) {
      throw new Error("Shell 命令不能为空");
    }
    return await runProjectShellCommand({
      cwd: rootPath,
      command,
      timeoutMs: normalizeProjectShellTimeout(readNumber(request, "timeoutMs")),
    });
  }

  async startSession(args: HostArgs): Promise<ProjectShellSessionStartResult> {
    const request = readRequest(args);
    const response =
      await this.#appServerRequest<ProjectShellSessionStartResult>(
        METHOD_PROJECT_SHELL_SESSION_START,
        {
          rootPath: readRequiredAbsolutePath(request, "rootPath"),
          cols: readNumber(request, "cols") ?? 120,
          rows: readNumber(request, "rows") ?? 16,
        },
      );
    this.#sessions.add(response.sessionId);
    this.#ensureEventPoller();
    void this.#drainEvents();
    return response;
  }

  async writeSession(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_WRITE, {
      sessionId: readRequiredString(request, "sessionId"),
      data: readRequiredRawString(request, "data"),
    });
    void this.#drainEvents();
    setTimeout(() => {
      void this.#drainEvents();
    }, 30);
    setTimeout(() => {
      void this.#drainEvents();
    }, 120);
    return {};
  }

  async resizeSession(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_RESIZE, {
      sessionId: readRequiredString(request, "sessionId"),
      cols: readNumber(request, "cols") ?? 120,
      rows: readNumber(request, "rows") ?? 16,
    });
    return {};
  }

  async killSession(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const sessionId = readRequiredString(request, "sessionId");
    await this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_KILL, {
      sessionId,
    });
    this.#sessions.delete(sessionId);
    this.#stopEventPollerIfIdle();
    return {};
  }

  disposeForShutdown(): void {
    if (this.#eventPoller) {
      clearInterval(this.#eventPoller);
      this.#eventPoller = null;
    }
    const sessionIds = Array.from(this.#sessions);
    this.#sessions.clear();
    for (const sessionId of sessionIds) {
      void this.#appServerRequest(METHOD_PROJECT_SHELL_SESSION_KILL, {
        sessionId,
      }).catch(() => undefined);
    }
  }

  #ensureEventPoller(): void {
    if (this.#eventPoller) {
      return;
    }
    this.#eventPoller = setInterval(() => {
      void this.#drainEvents();
    }, PROJECT_SHELL_EVENT_POLL_INTERVAL_MS);
  }

  #stopEventPollerIfIdle(): void {
    if (this.#sessions.size > 0 || !this.#eventPoller) {
      return;
    }
    clearInterval(this.#eventPoller);
    this.#eventPoller = null;
  }

  async #drainEvents(): Promise<void> {
    if (this.#eventDrainInFlight) {
      return;
    }
    if (this.#sessions.size === 0) {
      this.#stopEventPollerIfIdle();
      return;
    }
    this.#eventDrainInFlight = true;
    try {
      for (const sessionId of Array.from(this.#sessions)) {
        const response =
          await this.#appServerRequest<ProjectShellSessionDrainEventsResponse>(
            METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
            { sessionId, limit: PROJECT_SHELL_EVENT_DRAIN_LIMIT },
          );
        for (const event of response.events ?? []) {
          if (event.type === "exit" || event.type === "error") {
            this.#sessions.delete(event.sessionId);
          }
          this.#emit(PROJECT_SHELL_SESSION_EVENT, event);
        }
      }
    } catch (error) {
      console.warn("[electron-host] project shell event drain failed", error);
    } finally {
      this.#eventDrainInFlight = false;
      this.#stopEventPollerIfIdle();
    }
  }
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const next = record[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : null;
}

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readRequiredRawString(value: unknown, key: string): string {
  const record = toRecord(value);
  const next = record?.[key];
  if (typeof next !== "string") {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readRequiredAbsolutePath(value: unknown, key: string): string {
  const next = readRequiredString(value, key);
  if (!path.isAbsolute(next)) {
    throw new Error(`${key} 必须是绝对路径`);
  }
  return next;
}

function readString(value: unknown, key: string): string | null {
  const record = toRecord(value);
  const next = record?.[key];
  if (typeof next !== "string") {
    return null;
  }
  const trimmed = next.trim();
  return trimmed || null;
}

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
