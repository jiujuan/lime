import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/local-history-import-visual-audit-smoke.mjs",
    "utf8",
  );
}

describe("local history import visual audit smoke guard", () => {
  it("reuses the real Electron click-through fixture instead of direct API import", () => {
    const content = readSmokeScript();

    expect(content).toContain("spawnSync(process.execPath");
    expect(content).toContain(
      "scripts/electron/codex-import-click-through-fixture-smoke.mjs",
    );
    expect(content).toContain("--evidence-dir");
    expect(content).toContain("--prefix");
    expect(content).toContain("CLICK_THROUGH_PREFIX");
    expect(content).not.toContain("conversationImport/thread/commit");
    expect(content).not.toContain("APP_SERVER_BACKEND_MODE");
  });

  it("fails when visible GUI text leaks source brand outside allowed evidence contexts", () => {
    const content = readSmokeScript();

    expect(content).toContain("VISIBLE_TEXT_KEYS");
    expect(content).toContain("SOURCE_BRAND_PATTERN");
    expect(content).toContain("collectVisibleTextLeaks");
    expect(content).toContain("pickVisibleRawSnapshots");
    expect(content).toContain("GUI 可见文本仍泄漏来源品牌");
    expect(content).toContain("bodyText");
    expect(content).toContain("popoverText");
    expect(content).toContain("taskRailText");
    expect(content).toContain("shelfText");
    expect(content).toContain("recentText");
  });

  it("keeps the product visual contract for imported long history sessions", () => {
    const content = readSmokeScript();

    expect(content).toContain("assertVisualAudit");
    expect(content).toContain("视觉审计缺少 desktop / compact / narrow");
    expect(content).toContain("inputbarVisible");
    expect(content).toContain("messageListVisible");
    expect(content).toContain("historicalOperationalDetailsHidden");
    expect(content).toContain("operationalTimelineDetailsCount");
    expect(content).toContain("hasPatchText");
    expect(content).toContain("deferredHistoricalPreviewCount");
    expect(content).toContain("historicalTimelinePreviewCount");
    expect(content).toContain("hidesSourceBrandText");
    expect(content).toContain("importedBannerVisible");
    expect(content).toContain("importedRunControlVisible");
  });
});
