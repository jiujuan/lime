/**
 * @file hotkeys.ts
 * @description 快捷键运行时状态 API
 */

import { safeInvoke } from "@/lib/dev-bridge";

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

export async function getVoiceShortcutRuntimeStatus(): Promise<VoiceShortcutRuntimeStatus> {
  return safeInvoke<VoiceShortcutRuntimeStatus>(
    "get_voice_shortcut_runtime_status",
  );
}

export async function getHotkeyRuntimeStatus(): Promise<HotkeyRuntimeStatus> {
  const voice = await getVoiceShortcutRuntimeStatus();

  return { voice };
}

export async function validateShortcut(shortcut: string): Promise<boolean> {
  return safeInvoke("validate_shortcut", { shortcutStr: shortcut });
}
