import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface FrontendDebugLogReport {
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  category?: string;
  context?: unknown;
}

export async function reportFrontendDebugLog(
  report: FrontendDebugLogReport,
): Promise<void> {
  const result = await safeInvoke<unknown>("report_frontend_debug_log", {
    report,
  });
  assertNotDiagnosticFacade(
    "report_frontend_debug_log",
    result,
    "前端调试日志 Electron Host current 通道",
  );
  if (result !== null && result !== undefined) {
    throw new Error(
      "report_frontend_debug_log did not return debug log result",
    );
  }
}
