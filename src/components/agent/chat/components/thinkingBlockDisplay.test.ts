import { describe, expect, it } from "vitest";

import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";

describe("resolveThinkingDisplayParts", () => {
  it("应保留思考来源文本，不再按短语猜测过滤", () => {
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

    expect(parts.body).toContain("Finding latest source links.");
    expect(parts.body).toContain("Investigating tool calls");
    expect(parts.body).toContain("正在整理今天的国际新闻来源。");
    expect(parts.preview).toBe("Finding latest source links.");
  });

  it("全部是英文诊断时也只做状态包装，不改写内容", () => {
    const parts = resolveThinkingDisplayParts(
      "Finding latest source pages.\nToolSearch registry says WebSearch unavailable.",
      false,
    );

    expect(parts.body).toBe(
      "Finding latest source pages.\nToolSearch registry says WebSearch unavailable.",
    );
    expect(parts.preview).toBe("Finding latest source pages.");
  });

  it("导入来源回放需要保留原始思考文本", () => {
    const parts = resolveThinkingDisplayParts(
      "I need to inspect the test failure first.",
      false,
    );

    expect(parts.statusLabel).toBe("已完成思考");
    expect(parts.body).toBe("I need to inspect the test failure first.");
    expect(parts.preview).toBe("I need to inspect the test failure first.");
  });

  it("运行中的单句英文检索短语不应被文案规则吞掉", () => {
    const parts = resolveThinkingDisplayParts("Searching for news", true);

    expect(parts.statusLabel).toBe("思考中");
    expect(parts.body).toBe("Searching for news");
    expect(parts.preview).toBe("");
  });

  it("流式圆点碎片应规整为可读段落，避免 Markdown 误解析", () => {
    const parts = resolveThinkingDisplayParts(
      [
        "· 用户想要今天",
        "· （202",
        "· 6年6月",
        "· 24日）",
        "· 的国际新闻。",
        "· 我需要使用",
        "· 网络检索。",
      ].join("\n"),
      true,
    );

    expect(parts.statusLabel).toBe("思考中");
    expect(parts.body).toBe(
      "用户想要今天（2026年6月24日）的国际新闻。我需要使用网络检索。",
    );
  });

  it("应把搜索过程里的短碎片段落规整为可读段落", () => {
    const parts = resolveThinkingDisplayParts(
      [
        "搜索",
        "",
        "结果",
        "",
        "还是没有",
        "",
        "直接显示",
        "",
        "今天的",
        "",
        "新闻",
        "",
        "内容",
        "",
        "。我看到",
        "",
        "有一个",
        "",
        "“新闻 早餐（2026 年 6 月 24 日）”的链接，这是一个",
        "",
        "微信",
        "",
        "公众号",
        "",
        "文章",
      ].join("\n"),
      false,
    );

    expect(parts.body).toBe(
      "搜索结果还是没有直接显示今天的新闻内容。我看到有一个“新闻 早餐（2026 年 6 月 24 日）”的链接，这是一个微信公众号文章",
    );
  });

  it("标准 Markdown 结构和 preserve source 不应被碎片规整改写", () => {
    const markdownParts = resolveThinkingDisplayParts(
      ["- 搜索结果", "- 读取网页", "", "```", "搜索", "结果", "```"].join("\n"),
      false,
    );
    const preservedParts = resolveThinkingDisplayParts(
      "搜索\n\n结果\n\n还是没有",
      false,
      { preserveSourceText: true },
    );

    expect(markdownParts.body).toBe(
      ["- 搜索结果", "- 读取网页", "", "```", "搜索", "结果", "```"].join("\n"),
    );
    expect(preservedParts.body).toBe("搜索\n\n结果\n\n还是没有");
  });

  it("应允许 UI 注入本地化状态文案", () => {
    const parts = resolveThinkingDisplayParts("Reasoning details", true, {
      labels: {
        running: "Reasoning",
        completed: "Reasoning completed",
        structuredFallback: "Organizing structured content",
      },
    });

    expect(parts.statusLabel).toBe("Reasoning");
    expect(parts.body).toBe("Reasoning details");
    expect(parts.preview).toBe("");
  });
});
