import {
  APP_SERVER_METHOD_LOG_CLEAR,
  APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
  APP_SERVER_METHOD_LOG_LIST,
  APP_SERVER_METHOD_LOG_PERSISTED_TAIL,
  createAppServerClient,
} from "./appServer";

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<LogEntry>;
  return (
    typeof entry.timestamp === "string" &&
    typeof entry.level === "string" &&
    typeof entry.message === "string"
  );
}

function assertLogEntries(command: string, result: unknown): LogEntry[] {
  if (!Array.isArray(result) || !result.every(isLogEntry)) {
    throw new Error(`${command} did not return log entries`);
  }
  return result;
}

function assertLogClearResponse(command: string, result: unknown): void {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    (result as { cleared?: unknown }).cleared !== true
  ) {
    throw new Error(`${command} did not return log clear result`);
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  const response = await createAppServerClient().listLogs();
  return assertLogEntries(APP_SERVER_METHOD_LOG_LIST, response.result.entries);
}

export async function getPersistedLogsTail(lines = 200): Promise<LogEntry[]> {
  const safeLines = Number.isFinite(lines)
    ? Math.min(1000, Math.max(20, Math.floor(lines)))
    : 200;
  const response = await createAppServerClient().readPersistedLogTail({
    lines: safeLines,
  });
  return assertLogEntries(
    APP_SERVER_METHOD_LOG_PERSISTED_TAIL,
    response.result.entries,
  );
}

export async function clearLogs(): Promise<void> {
  const response = await createAppServerClient().clearLogs();
  assertLogClearResponse(APP_SERVER_METHOD_LOG_CLEAR, response.result);
}

export async function clearDiagnosticLogHistory(): Promise<void> {
  const response = await createAppServerClient().clearDiagnosticLogHistory();
  assertLogClearResponse(
    APP_SERVER_METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR,
    response.result,
  );
}
