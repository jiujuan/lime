import { describe, expect, it } from "vitest";
import { buildAuditedHotkeyCatalog } from "./hotkeyCatalog";

describe("hotkey catalog", () => {
  it("应构建 macOS 的完整已审计目录", () => {
    const catalog = buildAuditedHotkeyCatalog({
      platform: "mac",
    });

    expect(catalog.summary).toEqual({
      total: 5,
      ready: 5,
      attention: 0,
      globalReady: 0,
    });
    expect(catalog.sections.map((section) => section.scene)).toEqual([
      "workspace",
      "document-editor",
      "document-canvas",
    ]);
  });

  it("不应把 retired 语音全局快捷键重新放回生产目录", () => {
    const catalog = buildAuditedHotkeyCatalog({
      platform: "windows",
    });

    expect(catalog.sections.some((section) => section.scene === "global")).toBe(
      false,
    );
    expect(
      catalog.sections.flatMap((section) =>
        section.hotkeys.map((hotkey) => hotkey.id),
      ),
    ).not.toContain("voice-input");
    expect(catalog.summary.globalReady).toBe(0);
    expect(catalog.summary.total).toBe(5);
  });
});
