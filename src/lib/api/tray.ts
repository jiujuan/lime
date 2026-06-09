import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const TRAY_MODEL_SELECTED_EVENT = "tray-model-selected";

export interface TrayQuickModelItem {
  provider_type: string;
  provider_label: string;
  model: string;
}

export interface TrayQuickModelGroup {
  provider_type: string;
  provider_label: string;
  models: TrayQuickModelItem[];
}

export interface TrayModelSelectedPayload {
  providerType: string;
  model: string;
}

export interface SyncTrayModelShortcutsPayload {
  current_model_provider_type: string;
  current_model_provider_label: string;
  current_model: string;
  current_theme_label: string;
  quick_model_groups: TrayQuickModelGroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  if (isRecord(value) && "error" in value) {
    throw new Error(`${command} returned an error envelope`);
  }
}

export async function syncTrayModelShortcuts(
  payload: SyncTrayModelShortcutsPayload,
): Promise<void> {
  const result = await safeInvoke<unknown>("sync_tray_model_shortcuts", {
    currentModelProviderType: payload.current_model_provider_type,
    currentModelProviderLabel: payload.current_model_provider_label,
    currentModel: payload.current_model,
    currentThemeLabel: payload.current_theme_label,
    quickModelGroups: payload.quick_model_groups,
  });
  assertNotDiagnosticFacade(
    "sync_tray_model_shortcuts",
    result,
    "真实托盘 current 通道",
  );
  assertNotErrorEnvelope("sync_tray_model_shortcuts", result);
  if (result !== null && result !== undefined) {
    throw new Error(
      "sync_tray_model_shortcuts did not return tray sync result",
    );
  }
}

export const trayApi = {
  syncTrayModelShortcuts,
};
