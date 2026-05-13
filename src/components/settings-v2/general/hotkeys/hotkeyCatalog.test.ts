import { describe, expect, it } from "vitest";
import { buildAuditedHotkeyCatalog } from "./hotkeyCatalog";

describe("hotkey catalog", () => {
  it("应构建 macOS 的完整已审计目录", () => {
    const catalog = buildAuditedHotkeyCatalog({
      platform: "mac",
      voiceConfig: {
        enabled: true,
        shortcut: "CommandOrControl+Shift+V",
      },
      runtimeStatus: {
        voice: {
          shortcut_registered: true,
          registered_shortcut: "CommandOrControl+Shift+V",
          fn_supported: false,
          fn_registered: false,
          fn_fallback_shortcut: "CommandOrControl+Shift+V",
          fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
        },
      },
    });

    expect(catalog.summary).toEqual({
      total: 6,
      ready: 6,
      attention: 0,
      globalReady: 1,
    });
    expect(catalog.sections.map((section) => section.scene)).toEqual([
      "global",
      "workspace",
      "document-editor",
      "document-canvas",
    ]);
  });

  it("应正确标记未注册状态", () => {
    const catalog = buildAuditedHotkeyCatalog({
      platform: "windows",
      voiceConfig: {
        enabled: true,
        shortcut: "CommandOrControl+Shift+V",
      },
      runtimeStatus: {
        voice: {
          shortcut_registered: false,
          registered_shortcut: null,
          fn_supported: false,
          fn_registered: false,
          fn_fallback_shortcut: "CommandOrControl+Shift+V",
          fn_note: "Fn 按住录音当前仅支持 macOS；已使用普通语音快捷键回退。",
        },
      },
    });

    const globalSection = catalog.sections.find(
      (section) => section.scene === "global",
    );

    expect(globalSection?.hotkeys[0]).toEqual(
      expect.objectContaining({
        status: "runtime-error",
        statusLabel: "未注册到系统",
      }),
    );
    expect(catalog.summary.globalReady).toBe(0);
    expect(catalog.summary.total).toBe(6);
  });
});
