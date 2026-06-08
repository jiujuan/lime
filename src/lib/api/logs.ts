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

export async function getLogs(): Promise<LogEntry[]> {
  return invokeLogCommand<LogEntry[]>("get_logs");
}

export async function getPersistedLogsTail(lines = 200): Promise<LogEntry[]> {
  const safeLines = Number.isFinite(lines)
    ? Math.min(1000, Math.max(20, Math.floor(lines)))
    : 200;
  return invokeLogCommand<LogEntry[]>("get_persisted_logs_tail", {
    lines: safeLines,
  });
}

export async function clearLogs(): Promise<void> {
  await invokeLogCommand<void>("clear_logs");
}

export async function clearDiagnosticLogHistory(): Promise<void> {
  await invokeLogCommand<void>("clear_diagnostic_log_history");
}
