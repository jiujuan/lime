import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getHotkeyRuntimeStatus,
  validateShortcut,
  getVoiceShortcutRuntimeStatus,
} from "./hotkeys";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("hotkeys API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应代理语音快捷键运行时状态查询", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shortcut_registered: true,
      registered_shortcut: "CommandOrControl+Shift+V",
      fn_supported: false,
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
    });

    await expect(getVoiceShortcutRuntimeStatus()).resolves.toEqual(
      expect.objectContaining({ shortcut_registered: true }),
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "get_voice_shortcut_runtime_status",
    );
  });

  it("应聚合整体快捷键运行时状态", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shortcut_registered: true,
      registered_shortcut: "CommandOrControl+Shift+V",
      fn_supported: false,
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
    });

    await expect(getHotkeyRuntimeStatus()).resolves.toEqual({
      voice: expect.objectContaining({
        fn_supported: false,
      }),
    });

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "get_voice_shortcut_runtime_status",
    );
  });

  it("应代理通用快捷键校验", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(true);

    await expect(validateShortcut("CommandOrControl+Shift+V")).resolves.toBe(
      true,
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "validate_shortcut", {
      shortcutStr: "CommandOrControl+Shift+V",
    });
  });
});
