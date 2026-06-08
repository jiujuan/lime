import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export async function reportFrontendCrash(report: unknown): Promise<void> {
  const result = await safeInvoke("report_frontend_crash", { report });
  assertNotDiagnosticFacade(
    "report_frontend_crash",
    result,
    "真实前端崩溃诊断 current 通道",
  );
}
