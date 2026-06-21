import { describe, expect, it } from "vitest";

import { buildProjection, type Message } from "./messageListItemProjection.testHarness";

describe("messageListItemProjection content parts", () => {
  it("工具过程存在时应只把最后的 text part 作为最终正文", () => {
    const message: Message = {
      id: "assistant-live",
      role: "assistant",
      content:
        "我先联网核实今天的国际新闻。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: "我先联网核实今天的国际新闻，再整理成简报。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-web-search",
            name: "web_search",
            arguments: '{"query":"2026-06-02 international news"}',
            status: "completed",
            result: {
              success: true,
              output: "已搜索网页 2 次",
            },
          } as never,
        },
        {
          type: "text",
          text: "## 今日国际新闻简报\n\n- 第一条要闻。",
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n"),
    ).toContain("我先联网核实");
    expect(projection.rendererRawContent).not.toContain("我先联网核实");
  });

  it("非 web_search 工具过程存在时也应只把最后 text part 作为最终正文", () => {
    const message: Message = {
      id: "assistant-live-generic-tool",
      role: "assistant",
      content:
        "我先调用外部信息工具核实来源。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: "我先调用外部信息工具核实来源。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-query",
            name: "SearchQuery",
            arguments: '{"query":"2026-06-02 international news"}',
            status: "completed",
            result: {
              success: true,
              output: "已搜索网页 3 次",
            },
          } as never,
        },
        {
          type: "text",
          text: "## 今日国际新闻简报\n\n- 第一条要闻。",
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererRawContent).not.toContain("外部信息工具");
  });

  it("历史细节延迟时 content 为空也应从 contentParts 保留最终正文首帧", () => {
    const message: Message = {
      id: "assistant-history-deferred-text-parts",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      contentParts: [
        {
          type: "text",
          text: "我先查看关键文件，再整理评分卡。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-read-scorecard",
            name: "Read",
            arguments: '{"file_path":"/repo/scorecard.md"}',
            status: "completed",
            result: {
              success: true,
              output: "file contents",
            },
          } as never,
        },
        {
          type: "text",
          text: "## 文件总结\n\n这是一份 Agent Workspace 工具 UI 评分卡。",
        },
      ],
    };

    const projection = buildProjection(message, null, {
      hasActiveInteractiveRuntime: false,
      isRestoredHistoryWindow: true,
      isSending: false,
      shouldDeferMessageDetails: true,
    });

    expect(projection.hasAssistantBodyContent).toBe(true);
    expect(projection.actionContent).toBe(
      "## 文件总结\n\n这是一份 Agent Workspace 工具 UI 评分卡。",
    );
    expect(projection.shouldDeferHistoricalMarkdownRender).toBe(true);
    expect(projection.rendererContent).toBe(
      "## 文件总结\n\n这是一份 Agent Workspace 工具 UI 评分卡。",
    );
    expect(projection.rendererContentParts).toBeUndefined();
    expect(projection.rendererRawContent).not.toContain("我先查看关键文件");
    expect(projection.rendererRawContent).not.toContain("file contents");
  });
});
