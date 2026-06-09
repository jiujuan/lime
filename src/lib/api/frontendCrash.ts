import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

function isSuccessRecord(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { success?: unknown }).success === true
  );
}

export async function reportFrontendCrash(report: unknown): Promise<void> {
  const result = await safeInvoke<unknown>("report_frontend_crash", { report });
  assertNotDiagnosticFacade(
    "report_frontend_crash",
    result,
    "前端崩溃诊断 Electron Host current 通道",
  );
  if (result === null || result === undefined || isSuccessRecord(result)) {
    return;
  }

  throw new Error("report_frontend_crash did not return crash report result");
}
