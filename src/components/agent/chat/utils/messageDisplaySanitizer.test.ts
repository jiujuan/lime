import { describe, expect, it } from "vitest";

import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "./messageDisplaySanitizer";
import type { ContentPart } from "../types";

describe("messageDisplaySanitizer", () => {
  it("应清理紧邻工具调用的调度自述文本", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "ToolSearch 只返回了元数据，让我直接调用 WebSearch 进行多组检索。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-narration-strip",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-04-13T09:00:00.000Z"),
        },
      },
      {
        type: "text",
        text: "已经整理出 3 个可信来源。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([contentParts[1], contentParts[2]]);
  });

  it("应清理 StructuredOutput 协议残留并保留最终 Markdown 正文", () => {
    const contentParts: ContentPart[] = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-structured-output",
          name: "StructuredOutput",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-03T09:00:00.000Z"),
        },
      },
      {
        type: "text",
        text: [
          "Final output must be a valid JSON object provided to the StructuredOutput tool.",
          "",
          "## 调研结论",
          "",
          "- 已确认主要风险与下一步。",
        ].join("\n"),
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      contentParts[0],
      {
        ...contentParts[1],
        text: "## 调研结论\n\n- 已确认主要风险与下一步。",
      },
    ]);
  });

  it("应清理紧邻工具调用的页面操作自述", () => {
    const contentParts: ContentPart[] = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-narration-page",
          name: "webReader",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-04-13T09:01:00.000Z"),
        },
      },
      {
        type: "text",
        text: "我已经打开 GitHub 搜索页，接下来开始筛选结果。",
      },
      {
        type: "text",
        text: "筛到两个官方仓库入口。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([contentParts[0], contentParts[2]]);
  });

  it("应清理被思考和工具夹住的检索过渡自述", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "我",
      },
      {
        type: "thinking",
        text: "Searching for current sources.",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-source-search",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:00:00.000Z"),
        },
      },
      {
        type: "text",
        text: "先联网核实可用来源。",
      },
      {
        type: "text",
        text: "调研简报：\n\n- 已确认主要来源。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([contentParts[1], contentParts[2], contentParts[4]]);
  });

  it("应保留面向用户的联网后整理引导语", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "我先联网核实今天的国际新闻，再整理成简报。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-user-facing-lead-in",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:02:00.000Z"),
        },
      },
      {
        type: "text",
        text: "## 国际新闻简报\n\n- 已确认主要来源。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual(contentParts);
  });

  it("应只剔除同段文本中的内部抓取重试状态，保留用户可见引导", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "我会先联网核实 2026-06-02 当天的国际新闻要点，再按地区/主题整理成简明摘要。刚才搜索结果质量不稳定，权威媒体命中不足。我会改为直接抓取几家国际媒体的 World/International 页面，提取今日头条来整理。AP 页面可访问但提取噪声较多，Reuters/BBC 抓取失败。为避免误报，我再用可访问的新闻源交叉核实一轮，重点取今日国际栏目标题。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-news-retry-status",
          name: "WebFetch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:02:00.000Z"),
        },
      },
      {
        type: "text",
        text: "## 国际新闻简报\n\n- 已确认主要来源。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      {
        ...contentParts[0],
        text: "我会先联网核实 2026-06-02 当天的国际新闻要点，再按地区/主题整理成简明摘要。",
      },
      contentParts[1],
      contentParts[2],
    ]);
  });

  it("同一文本片段只应剔除内部过程行，保留后续正文", () => {
    const contentParts: ContentPart[] = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-source-line-strip",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:03:00.000Z"),
        },
      },
      {
        type: "text",
        text: "先搜索相关资料。\n\n- 已确认主要来源。\n- 后续可以继续细化。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      contentParts[0],
      {
        ...contentParts[1],
        text: "- 已确认主要来源。\n- 后续可以继续细化。",
      },
    ]);
  });

  it("同一文本片段中过程自述紧贴正文标题时应保留标题后的正文", () => {
    const contentParts: ContentPart[] = [
      {
        type: "thinking",
        text: "Searching for current sources",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-source-heading-strip",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:04:00.000Z"),
        },
      },
      {
        type: "text",
        text: "我先联网核实可用来源，再按重要性做一版简明整理。第一轮搜索结果质量不高，我继续从更可靠的页面聚合要点，避免把无关结果混进去。\n\n## 调研简报\n\n时间口径：截至当前检索。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      contentParts[0],
      contentParts[1],
      {
        ...contentParts[2],
        text: "## 调研简报\n\n时间口径：截至当前检索。",
      },
    ]);
  });

  it("最终正文中紧邻过程块的来源抓取受限说明应被剥离", () => {
    const contentParts: ContentPart[] = [
      {
        type: "thinking",
        text: "Searching for news",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-news-fetch-limited",
          name: "WebFetch",
          arguments: "{}",
          status: "failed",
          result: { success: false, output: "fetch failed" },
          startTime: new Date("2026-06-02T09:04:00.000Z"),
        },
      },
      {
        type: "text",
        text: "## 今日国际新闻简报\n\n时间口径：2026 年 6 月 2 日；主要依据已核实的公开新闻源。说明：部分媒体站点抓取受限，以下优先采用已能核实的来源，并结合国际议题的重要性整理。\n\n- 中东局势仍是重点。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      contentParts[0],
      contentParts[1],
      {
        ...contentParts[2],
        text: "## 今日国际新闻简报\n\n时间口径：2026 年 6 月 2 日；主要依据已核实的公开新闻源。\n\n- 中东局势仍是重点。",
      },
    ]);
  });

  it("应清理工具之间的短过程状态自述", () => {
    const contentParts: ContentPart[] = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-source-iteration-before",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:05:00.000Z"),
        },
      },
      {
        type: "text",
        text: "第一轮搜索结果质量不高，我继续从更可靠的页面聚合要点，避免把无关结果混进去。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-source-iteration-after",
          name: "WebFetch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:05:01.000Z"),
        },
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([contentParts[0], contentParts[2]]);
  });

  it("工具之间的真实阶段结论不应被误删", () => {
    const contentParts: ContentPart[] = [
      {
        type: "tool_use",
        toolCall: {
          id: "tool-summary-before",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:06:00.000Z"),
        },
      },
      {
        type: "text",
        text: "第一轮结论是主要来源已经足够，后续只需要补充两个官方页面。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-summary-after",
          name: "WebFetch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-06-02T09:06:01.000Z"),
        },
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual(contentParts);
  });

  it("带结论的正常说明不应被误删", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "我用 WebSearch 查到 3 个官方来源，结论是目前只支持桌面端。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-narration-keep",
          name: "WebSearch",
          arguments: "{}",
          status: "completed",
          result: { success: true, output: "ok" },
          startTime: new Date("2026-04-13T09:02:00.000Z"),
        },
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual(contentParts);
  });

  it("不挨着工具调用的普通说明不应被清理", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: "ToolSearch 用于查询当前可用工具，这里是在解释概念。",
      },
      {
        type: "text",
        text: "下面再继续说明使用方式。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual(contentParts);
  });

  it("普通消息文本清洗仍不应误删工具说明", () => {
    const text = "ToolSearch 用于查询当前可用工具，这里是在给用户解释概念。";

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "assistant",
      }),
    ).toBe(text);
  });

  it("应隐藏 assistant 历史里落库的运行时错误包络", () => {
    const text = [
      "Ran into this error: Server error: upstream temporarily unavailable.",
      "",
      "Please retry if you think this is a transient or recoverable error.",
    ].join("\n");

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "assistant",
      }),
    ).toBe("");
  });

  it("应隐藏 assistant 历史里带尾部空白的运行时错误包络", () => {
    const text = [
      "Ran into this error: Request failed: error sending request for url (https://api.example.invalid/v1/chat/completions)",
      "",
      "Please retry if you think this is a transient or recoverable error.  ",
    ].join("\n");

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "assistant",
      }),
    ).toBe("");
  });

  it("不应清理用户消息里引用的运行时错误包络文本", () => {
    const text = [
      "Ran into this error: Server error: upstream temporarily unavailable.",
      "",
      "Please retry if you think this is a transient or recoverable error.",
    ].join("\n");

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "user",
      }),
    ).toBe(text);
  });

  it("应过滤 contentParts 里的 assistant 运行时错误包络", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: [
          "Ran into this error: Server error: upstream temporarily unavailable.",
          "",
          "Please retry if you think this is a transient or recoverable error.",
        ].join("\n"),
      },
      {
        type: "text",
        text: "后续真实正文。",
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      {
        type: "text",
        text: "后续真实正文。",
      },
    ]);
  });

  it("应隐藏纯运行时附件占位符，避免把内部 chip 文本展示给用户", () => {
    expect(
      sanitizeMessageTextForDisplay("[Image #1]", {
        role: "assistant",
      }),
    ).toBe("");
    expect(
      sanitizeMessageTextForDisplay("已收到 [Image #1]", {
        role: "assistant",
      }),
    ).toBe("已收到图片");
  });

  it("应去掉 assistant 消息里的 markdown 阶段结论标题", () => {
    const text = "## 阶段结论\n\n已经找到关键线索。";

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "assistant",
      }),
    ).toBe("已经找到关键线索。");
  });

  it("应去掉 assistant 消息里的行内阶段结论文案", () => {
    const text = "阶段结论：已经找到关键线索。";

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "assistant",
      }),
    ).toBe("已经找到关键线索。");
  });

  it("应把跨会话协作包络清洗成可读文案", () => {
    const text = `<teammate-message teammate_id="researcher" summary="同步结果">
继续验证
</teammate-message>`;

    expect(
      sanitizeMessageTextForDisplay(text, {
        role: "user",
      }),
    ).toBe("协作消息 · researcher · 同步结果\n\n继续验证");
  });

  it("应同步清洗 contentParts 里的协作包络文本", () => {
    const contentParts: ContentPart[] = [
      {
        type: "text",
        text: `<cross-session-message from="uds:session-a">
继续验证
</cross-session-message>`,
      },
    ];

    expect(
      sanitizeContentPartsForDisplay(contentParts, {
        role: "assistant",
      }),
    ).toEqual([
      {
        type: "text",
        text: "跨会话消息 · uds:session-a\n\n继续验证",
      },
    ]);
  });
});
