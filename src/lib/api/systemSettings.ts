import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import { assertEmptyElectronHostResult } from "./electronHostResult";

const SYSTEM_SETTINGS_CURRENT_SURFACE = "真实系统设置壳 current 通道";

export async function openSystemSettingsUrl(url: string): Promise<void> {
  const result = await safeInvoke("open_system_settings_url", { url });
  assertNotDiagnosticFacade(
    "open_system_settings_url",
    result,
    SYSTEM_SETTINGS_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("open_system_settings_url", result);
}
