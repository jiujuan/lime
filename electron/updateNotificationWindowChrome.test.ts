import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readElectronMainSource(): string {
  return readFileSync("electron/main.ts", "utf8");
}

describe("update notification window chrome", () => {
  it("更新提醒独立窗口应保持透明且不叠加系统窗口阴影", () => {
    const source = readElectronMainSource();
    const windowBlockStart = source.indexOf(
      "updateNotificationWindow = new BrowserWindow({",
    );
    expect(windowBlockStart).toBeGreaterThanOrEqual(0);
    const windowBlockEnd = source.indexOf("webPreferences:", windowBlockStart);
    expect(windowBlockEnd).toBeGreaterThan(windowBlockStart);
    const windowBlock = source.slice(windowBlockStart, windowBlockEnd);

    expect(windowBlock).toContain("frame: false");
    expect(windowBlock).toContain("transparent: true");
    expect(windowBlock).toContain("hasShadow: false");
    expect(windowBlock).toContain('backgroundColor: "#00000000"');
  });
});
