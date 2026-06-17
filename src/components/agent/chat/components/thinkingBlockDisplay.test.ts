import { describe, expect, it } from "vitest";

import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";

describe("resolveThinkingDisplayParts", () => {
  it("应过滤内部英文思考和工具调查句，只保留用户可见进展", () => {
    const parts = resolveThinkingDisplayParts(
      [
        "Finding latest source links.",
        "Searching for current source pages.",
        "Searching for reputable source results.",
        "Investigating tool calls and WebSearch namespace availability.",
        "I'm thinking about whether WebFetch is available.",
        "It seems like the search results include enough source material.",
        "Let's get started by checking source pages.",
        "I'm on a task to summarize current source material.",
        "正在整理今天的国际新闻来源。",
      ].join("\n"),
      false,
    );

    expect(parts.body).toBe("正在整理今天的国际新闻来源。");
    expect(parts.preview).toBe("正在整理今天的国际新闻来源。");
    expect(parts.body).not.toContain("Finding latest source");
    expect(parts.body).not.toContain("Searching for current source");
    expect(parts.body).not.toContain("Searching for reputable source");
    expect(parts.body).not.toContain("tool calls");
    expect(parts.body).not.toContain("I'm thinking");
    expect(parts.body).not.toContain("source pages");
  });

  it("全部是内部诊断时不应把原文塞进折叠预览", () => {
    const parts = resolveThinkingDisplayParts(
      "Finding latest source pages.\nToolSearch registry says WebSearch unavailable.",
      false,
    );

    expect(parts.body).toBe("");
    expect(parts.preview).toBe("");
  });

  it("导入来源回放需要保留原始思考文本", () => {
    const parts = resolveThinkingDisplayParts(
      "I need to inspect the test failure first.",
      false,
      { preserveSourceText: true },
    );

    expect(parts.statusLabel).toBe("已完成思考");
    expect(parts.body).toBe("I need to inspect the test failure first.");
    expect(parts.preview).toBe("I need to inspect the test failure first.");
  });

  it("应过滤单句英文检索过程短语", () => {
    const parts = resolveThinkingDisplayParts("Searching for news", true);

    expect(parts.statusLabel).toBe("思考中");
    expect(parts.body).toBe("");
    expect(parts.preview).toBe("");
  });
});
