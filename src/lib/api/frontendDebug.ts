import { isDevBridgeAvailable, safeInvoke } from "@/lib/dev-bridge";
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
  if (isDevBridgeAvailable()) {
    throw new Error(
      "report_frontend_debug_log 尚未接入浏览器 DevBridge current 通道，前端调试日志不能静默跳过真实上报。",
    );
  }
  const result = await safeInvoke("report_frontend_debug_log", { report });
  assertNotDiagnosticFacade(
    "report_frontend_debug_log",
    result,
    "真实前端调试日志 current 通道",
  );
}
