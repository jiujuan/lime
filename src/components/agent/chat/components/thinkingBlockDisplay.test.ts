import { describe, expect, it } from "vitest";

import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";

describe("resolveThinkingDisplayParts", () => {
  it("应过滤内部英文思考和工具调查句，只保留用户可见进展", () => {
    const parts = resolveThinkingDisplayParts(
      [
        "Finding latest news sources.",
        "Investigating tool calls and WebSearch namespace availability.",
        "I'm thinking about whether WebFetch is available.",
        "正在整理今天的国际新闻来源。",
      ].join("\n"),
      false,
    );

    expect(parts.body).toBe("正在整理今天的国际新闻来源。");
    expect(parts.preview).toBe("正在整理今天的国际新闻来源。");
    expect(parts.body).not.toContain("Finding latest news");
    expect(parts.body).not.toContain("tool calls");
    expect(parts.body).not.toContain("I'm thinking");
  });

  it("全部是内部诊断时不应把原文塞进折叠预览", () => {
    const parts = resolveThinkingDisplayParts(
      "Finding latest news.\nToolSearch registry says WebSearch unavailable.",
      false,
    );

    expect(parts.body).toBe("");
    expect(parts.preview).toBe("");
  });
});
