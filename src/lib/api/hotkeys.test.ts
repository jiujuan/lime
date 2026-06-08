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

  it("应拒绝 Electron Host voice shortcut degraded 诊断返回", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      shortcut_registered: false,
      registered_shortcut: null,
      fn_supported: true,
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note:
        "Electron current 语音快捷键运行时尚未接入；当前使用普通语音快捷键回退。",
      diagnostic: {
        command: "get_voice_shortcut_runtime_status",
        category: "electron-diagnostic-facade",
      },
    });

    await expect(getVoiceShortcutRuntimeStatus()).rejects.toThrow(
      "get_voice_shortcut_runtime_status 尚未接入真实语音快捷键 current 通道",
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

  it("通用快捷键校验遇到 Electron degraded 诊断返回时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "validate_shortcut",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
      },
    });

    await expect(validateShortcut("CommandOrControl+Shift+V")).rejects.toThrow(
      "validate_shortcut 尚未接入真实快捷键校验 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("通用快捷键校验收到非 boolean 返回时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(validateShortcut("CommandOrControl+Shift+V")).rejects.toThrow(
      "validate_shortcut did not return a boolean",
    );
  });
});
