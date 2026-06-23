import { describe, expect, it } from "vitest";

import {
  buildProjection,
  type Message,
} from "./messageListItemProjection.testHarness";

describe("messageListItemProjection content parts", () => {
  it("工具过程存在时应保留过程前导语和过程后最终正文", () => {
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
      "我先联网核实今天的国际新闻，再整理成简报。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "我先联网核实今天的国际新闻，再整理成简报。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
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
  });

  it("非 web_search 工具过程存在时也应保留过程前导语", () => {
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
      "我先调用外部信息工具核实来源。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "我先调用外部信息工具核实来源。\n\n## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
  });

  it("过程前累计 text 已包含最终正文时不应在工具前后重复显示", () => {
    const finalText =
      "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。 专家 Skills runtime 证据已完成：专家声明 skillRefs 只作为候选提示，实际执行仍经过 skill_search、SKILL.md 按需读取、gate 和 Skill 调用。";
    const message: Message = {
      id: "assistant-duplicated-leading-final",
      role: "assistant",
      content: finalText,
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: finalText,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-skill-search",
            name: "skill_search",
            arguments: '{"query":"capability report"}',
            status: "completed",
            result: {
              success: true,
              output: "selected project:capability-report",
            },
          } as never,
        },
        {
          type: "text",
          text: finalText,
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.actionContent).toBe(finalText);
    expect(projection.rendererRawContent).toBe(finalText);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.filter((part) => part.type === "text"),
    ).toHaveLength(1);
  });

  it("过程前累计 text 只应裁掉与最终正文重叠的尾部", () => {
    const leadingText = "我先读取技能说明，并确认本轮只加载一个 Skill。";
    const finalText = "## 技能验证结果\n\n已完成最小验证。";
    const message: Message = {
      id: "assistant-leading-overlap-final",
      role: "assistant",
      content: `${leadingText}\n\n${finalText}`,
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: `${leadingText}\n\n${finalText}`,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-read-skill",
            name: "Read",
            arguments: '{"file_path":"SKILL.md"}',
            status: "completed",
            result: {
              success: true,
              output: "skill body",
            },
          } as never,
        },
        {
          type: "text",
          text: finalText,
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.actionContent).toBe(`${leadingText}\n\n${finalText}`);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts
        ?.filter((part) => part.type === "text")
        .map((part) => part.text),
    ).toEqual([leadingText, finalText]);
  });

  it("补齐本地 thinking 时不应把已完成思考追加到工具和最终正文之后", () => {
    const finalText = "## 今日国际新闻\n\n已整理主要事件。";
    const message: Message = {
      id: "assistant-thinking-tail-after-final",
      role: "assistant",
      content: finalText,
      timestamp: new Date("2026-06-24T10:00:00.000Z"),
      isThinking: false,
      thinkingContent: "用户想了解今天的国际新闻，需要先搜索并读取可靠来源。",
      contentParts: [
        {
          type: "thinking",
          text: "用户想了解今天的国际新闻，",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-web-search-thinking-tail",
            name: "web_search",
            arguments: '{"query":"2026-06-24 international news"}',
            status: "completed",
            result: {
              success: true,
              output: "ok",
            },
          } as never,
        },
        {
          type: "text",
          text: finalText,
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "thinking",
      text: "用户想了解今天的国际新闻，需要先搜索并读取可靠来源。",
    });
    expect(
      projection.rendererContentParts
        ?.map((part, index) => (part.type === "thinking" ? index : -1))
        .filter((index) => index >= 0),
    ).toEqual([0]);
  });

  it("思考内容已覆盖的过程前 text 不应再作为普通正文显示", () => {
    const duplicatedLead =
      "我先联网核实今天主要国际新闻，再按地区与影响整理成简明摘要。";
    const thinkingText = `${duplicatedLead}初步搜索只拿到栏目页少量结果；继续抓取流媒体的世界提炼可验头条。`;
    const message: Message = {
      id: "assistant-thinking-duplicated-text",
      role: "assistant",
      content: duplicatedLead,
      timestamp: new Date("2026-06-24T10:00:00.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-guardian-search",
            name: "web_search",
            arguments:
              '{"query":"The Guardian June 24 2026 world news Europe heat"}',
            status: "running",
          } as never,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-dw-search",
            name: "web_search",
            arguments:
              '{"query":"DW June 24 2026 world news Europe heatwave Ukraine"}',
            status: "running",
          } as never,
        },
        {
          type: "text",
          text: duplicatedLead,
        },
        {
          type: "thinking",
          text: thinkingText,
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "tool_use",
      "thinking",
    ]);
    expect(
      projection.rendererContentParts?.some(
        (part) => part.type === "text" && part.text === duplicatedLead,
      ),
    ).toBe(false);
    expect(projection.rendererContentParts?.[2]).toMatchObject({
      type: "thinking",
      text: thinkingText,
    });
  });

  it("过程前累计 text 与最终正文只差空白时也不应重复显示", () => {
    const leadingFinalText =
      "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。专家 Skills runtime 证据已完成：专家声明 skillRefs 只作为候选提示，实际执行仍经过 skill_search、SKILL.md 按需读取、gate 和 Skill 调用。";
    const finalText =
      "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。 专家 Skills runtime 证据已完成：专家声明 skillRefs 只作为候选提示，实际执行仍经过 skill_search、SKILL.md 按需读取、gate 和 Skill 调用。";
    const message: Message = {
      id: "assistant-duplicated-leading-final-spacing",
      role: "assistant",
      content: finalText,
      timestamp: new Date("2026-06-22T12:05:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: leadingFinalText,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-skill-search",
            name: "skill_search",
            arguments: '{"query":"capability report"}',
            status: "completed",
            result: {
              success: true,
              output: "selected project:capability-report",
            },
          } as never,
        },
        {
          type: "text",
          text: finalText,
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.actionContent).toBe(finalText);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.filter((part) => part.type === "text"),
    ).toEqual([{ type: "text", text: finalText }]);
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
