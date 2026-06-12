import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import { assertEmptyElectronHostResult } from "./electronHostResult";

const PROJECT_SHELL_CURRENT_SURFACE = "真实项目 Shell current 通道";
export const PROJECT_SHELL_SESSION_EVENT = "project-shell-session-event";

export interface ProjectShellCommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ProjectShellSessionStartResult {
  sessionId: string;
  cwd: string;
  shell: string;
  title: string;
  localEcho: boolean;
  tty: boolean;
  pid: number | null;
}

export type ProjectShellSessionEvent =
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertProjectShellCommandResult(
  value: unknown,
): asserts value is ProjectShellCommandResult {
  if (
    !isRecord(value) ||
    typeof value.command !== "string" ||
    typeof value.cwd !== "string" ||
    !(typeof value.exitCode === "number" || value.exitCode === null) ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string" ||
    typeof value.durationMs !== "number" ||
    typeof value.timedOut !== "boolean"
  ) {
    throw new Error("run_project_shell_command did not return shell result");
  }
}

function assertProjectShellSessionStartResult(
  value: unknown,
): asserts value is ProjectShellSessionStartResult {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.shell !== "string" ||
    typeof value.title !== "string" ||
    typeof value.localEcho !== "boolean" ||
    typeof value.tty !== "boolean" ||
    !(typeof value.pid === "number" || value.pid === null)
  ) {
    throw new Error("project_shell_session_start did not return shell session");
  }
}

function readProjectShellSessionId(
  value: Record<string, unknown>,
): string | null {
  const sessionId = value.sessionId ?? value.session_id;
  return typeof sessionId === "string" ? sessionId : null;
}

function normalizeProjectShellSessionEvent(
  value: unknown,
): ProjectShellSessionEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const sessionId = readProjectShellSessionId(value);
  if (!sessionId) {
    return null;
  }
  if (value.type === "data") {
    if (
      (value.stream === "stdout" || value.stream === "stderr") &&
      typeof value.data === "string"
    ) {
      return {
        type: "data",
        sessionId,
        stream: value.stream,
        data: value.data,
      };
    }
    return null;
  }
  if (value.type === "exit") {
    const exitCode = value.exitCode ?? value.exit_code ?? null;
    const signal = value.signal ?? null;
    if (
      (typeof exitCode === "number" || exitCode === null) &&
      (typeof signal === "string" || signal === null)
    ) {
      return {
        type: "exit",
        sessionId,
        exitCode,
        signal,
      };
    }
    return null;
  }
  if (value.type === "error") {
    return typeof value.message === "string"
      ? { type: "error", sessionId, message: value.message }
      : null;
  }
  return null;
}

export async function runProjectShellCommand(params: {
  rootPath: string;
  command: string;
  timeoutMs?: number;
}): Promise<ProjectShellCommandResult> {
  const result = await safeInvoke("run_project_shell_command", params);
  assertNotDiagnosticFacade(
    "run_project_shell_command",
    result,
    PROJECT_SHELL_CURRENT_SURFACE,
  );
  assertProjectShellCommandResult(result);
  return result;
}

export async function startProjectShellSession(params: {
  rootPath: string;
  cols?: number;
  rows?: number;
}): Promise<ProjectShellSessionStartResult> {
  const result = await safeInvoke("project_shell_session_start", params);
  assertNotDiagnosticFacade(
    "project_shell_session_start",
    result,
    PROJECT_SHELL_CURRENT_SURFACE,
  );
  assertProjectShellSessionStartResult(result);
  return result;
}

export async function writeProjectShellSession(params: {
  sessionId: string;
  data: string;
}): Promise<void> {
  const result = await safeInvoke("project_shell_session_write", params);
  assertNotDiagnosticFacade(
    "project_shell_session_write",
    result,
    PROJECT_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("project_shell_session_write", result);
}

export async function resizeProjectShellSession(params: {
  sessionId: string;
  cols: number;
  rows: number;
}): Promise<void> {
  const result = await safeInvoke("project_shell_session_resize", params);
  assertNotDiagnosticFacade(
    "project_shell_session_resize",
    result,
    PROJECT_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("project_shell_session_resize", result);
}

export async function killProjectShellSession(params: {
  sessionId: string;
}): Promise<void> {
  const result = await safeInvoke("project_shell_session_kill", params);
  assertNotDiagnosticFacade(
    "project_shell_session_kill",
    result,
    PROJECT_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("project_shell_session_kill", result);
}

export async function listenProjectShellSessionEvents(
  handler: (event: ProjectShellSessionEvent) => void,
): Promise<() => void> {
  return await safeListen<ProjectShellSessionEvent>(
    PROJECT_SHELL_SESSION_EVENT,
    (event) => {
      const payload = normalizeProjectShellSessionEvent(event.payload);
      if (payload) {
        handler(payload);
      }
    },
  );
}
