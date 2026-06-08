import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

async function invokeLogCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实日志诊断 current 通道");
  return result as T;
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

async function invokeLogListCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<LogEntry[]> {
  const result = await invokeLogCommand<unknown>(command, args);
  if (!Array.isArray(result) || !result.every(isLogEntry)) {
    throw new Error(`${command} did not return log entries`);
  }
  return result;
}

export async function getLogs(): Promise<LogEntry[]> {
  return invokeLogListCommand("get_logs");
}

export async function getPersistedLogsTail(lines = 200): Promise<LogEntry[]> {
  const safeLines = Number.isFinite(lines)
    ? Math.min(1000, Math.max(20, Math.floor(lines)))
    : 200;
  return invokeLogListCommand("get_persisted_logs_tail", {
    lines: safeLines,
  });
}

export async function clearLogs(): Promise<void> {
  await invokeLogCommand<void>("clear_logs");
}

export async function clearDiagnosticLogHistory(): Promise<void> {
  await invokeLogCommand<void>("clear_diagnostic_log_history");
}
