import { describe, expect, it } from "vitest";
import {
  buildFileNameTabTooltip,
  isPathLikeTabTitle,
  resolveFileNameTabLabel,
} from "./tabFileDisplay";

describe("tabFileDisplay", () => {
  it("应把路径型 tab 标题显示为文件名", () => {
    expect(
      resolveFileNameTabLabel(
        "/Users/coso/Documents/other/conversations/conv-1777047467972",
      ),
    ).toBe("conv-1777047467972");
    expect(resolveFileNameTabLabel("C:\\Users\\coso\\workspace\\demo.md")).toBe(
      "demo.md",
    );
  });

  it("普通标题不应按斜杠截断", () => {
    expect(isPathLikeTabTitle("X/TikTok 选题")).toBe(false);
    expect(resolveFileNameTabLabel("X/TikTok 选题")).toBe("X/TikTok 选题");
  });

  it("tooltip 应保留文件名与完整来源", () => {
    expect(
      buildFileNameTabTooltip({
        label: "conv-1777047467972",
        source: "/Users/coso/Documents/other/conversations/conv-1777047467972",
      }),
    ).toBe(
      [
        "conv-1777047467972",
        "/Users/coso/Documents/other/conversations/conv-1777047467972",
      ].join("\n"),
    );
  });
});
