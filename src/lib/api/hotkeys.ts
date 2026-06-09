/**
 * @file hotkeys.ts
 * @description 快捷键运行时状态 API
 */

import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface VoiceShortcutRuntimeStatus {
  shortcut_registered: boolean;
  registered_shortcut?: string | null;
  fn_supported: boolean;
  fn_registered: boolean;
  fn_fallback_shortcut?: string | null;
  fn_note: string;
}

export interface HotkeyRuntimeStatus {
  voice: VoiceShortcutRuntimeStatus;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

function assertVoiceShortcutRuntimeStatus(
  command: string,
  value: unknown,
): asserts value is VoiceShortcutRuntimeStatus {
  const status = value as Partial<VoiceShortcutRuntimeStatus>;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof status.shortcut_registered !== "boolean" ||
    typeof status.fn_supported !== "boolean" ||
    typeof status.fn_registered !== "boolean" ||
    !isNullableString(status.registered_shortcut) ||
    !isNullableString(status.fn_fallback_shortcut) ||
    typeof status.fn_note !== "string"
  ) {
    throw new Error(
      `${command} did not return voice shortcut runtime status`,
    );
  }
}

export async function getVoiceShortcutRuntimeStatus(): Promise<VoiceShortcutRuntimeStatus> {
  const result = await safeInvoke<unknown>(
    "get_voice_shortcut_runtime_status",
  );
  assertNotDiagnosticFacade(
    "get_voice_shortcut_runtime_status",
    result,
    "真实语音快捷键 current 通道",
  );
  assertVoiceShortcutRuntimeStatus("get_voice_shortcut_runtime_status", result);
  return result;
}

export async function getHotkeyRuntimeStatus(): Promise<HotkeyRuntimeStatus> {
  const voice = await getVoiceShortcutRuntimeStatus();

  return { voice };
}

export async function validateShortcut(shortcut: string): Promise<boolean> {
  const result = await safeInvoke("validate_shortcut", {
    shortcutStr: shortcut,
  });
  assertNotDiagnosticFacade(
    "validate_shortcut",
    result,
    "真实快捷键校验 current 通道",
  );
  if (typeof result !== "boolean") {
    throw new Error("validate_shortcut did not return a boolean");
  }
  return result;
}
