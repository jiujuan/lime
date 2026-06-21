import { describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message, PendingA2UISource } from "../types";

function buildProjection(
  message: Message,
  timelineItems: NonNullable<
    NonNullable<
      Parameters<
        typeof resolveMessageListItemProjection
      >[0]["group"]["timeline"]
    >["items"]
  > | null = null,
  options: {
    activePendingA2UISource?: PendingA2UISource | null;
    hasActiveInteractiveRuntime?: boolean;
    isRestoredHistoryWindow?: boolean;
    isSending?: boolean;
    lastAssistantMessageId?: string | null;
    shouldDeferMessageDetails?: boolean;
    streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
    turnStatus?: "queued" | "running" | "completed" | "failed" | "aborted";
  } = {},
) {
  return resolveMessageListItemProjection({
    activeCurrentTurnId: null,
    activePendingA2UISource: options.activePendingA2UISource ?? null,
    canOpenSavedSiteContent: false,
    expandedHistoricalAssistantMessageIds: new Set(),
    expandedHistoricalTimelineKeys: new Set(),
    expandedLongHistoricalMessageIds: new Set(),
    group: {
      lastAssistantId: message.id,
      timeline: timelineItems
        ? ({
            turn: {
              id: "turn-legacy-unphased-final",
              status: options.turnStatus ?? "completed",
            },
            items: timelineItems,
          } as never)
        : null,
    } as never,
    hasActiveInteractiveRuntime: options.hasActiveInteractiveRuntime ?? true,
    isRestoredHistoryWindow: options.isRestoredHistoryWindow ?? false,
    isSending: options.isSending ?? true,
    lastAssistantMessageId: options.lastAssistantMessageId ?? message.id,
    message,
    shouldDeferHistoricalAssistantMessageDetails: () =>
      options.shouldDeferMessageDetails ?? false,
    shouldDeferThreadItemsScan: false,
    streamingTextOverlay: options.streamingTextOverlay ?? null,
  });
}

describe("messageListItemProjection", () => {
  it("用户图片附件消息应隐藏图片不可达诊断正文", () => {
    const message: Message = {
      id: "user-image-unavailable-diagnostic",
      role: "user",
      content: "[Image #1]",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      images: [
        {
          data: "",
          mediaType: "image/png",
          sourceUri: "asset://missing-image.png",
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.displayContent).toBe("");
    expect(projection.actionContent).toBe("");
  });

  it("用户 markdown 图片旁边重复 alt 文本时不应在 displayContent 里再渲染一遍", () => {
    const message: Message = {
      id: "user-markdown-image-alt-echo",
      role: "user",
      content:
        "![图片附件未加载](asset://missing.png) 图片附件未加载",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
    };

    const projection = buildProjection(message);

    expect(projection.displayContent).toBe(
      "![图片附件未加载](asset://missing.png)",
    );
  });

  it("流式 overlay 应保持当前 assistant 输出态", () => {
    const message: Message = {
      id: "assistant-overlay-current",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(message, null, {
      hasActiveInteractiveRuntime: false,
      isSending: false,
      lastAssistantMessageId: "other-assistant",
      streamingTextOverlay: {
        messageId: message.id,
        eventName: "response.output_text.delta",
        content: "正文已经开始输出。",
        updatedAt: Date.parse("2026-06-02T10:00:02.000Z"),
      },
    });

    expect(projection.isCurrentInteractiveAssistantMessage).toBe(true);
    expect(projection.shouldReadOnlyInteractiveContent).toBe(false);
  });

  it("尾部 pending action 在当前 runtime 活跃时应保持可提交", () => {
    const message: Message = {
      id: "assistant-pending-action-current",
      role: "assistant",
      content: "请选择执行方式。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      actionRequests: [
        {
          requestId: "req-current-action",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行方式",
          questions: [{ question: "请选择执行方式" }],
        },
      ],
    };

    const projection = buildProjection(message, null, {
      hasActiveInteractiveRuntime: true,
      isSending: false,
      lastAssistantMessageId: message.id,
    });

    expect(projection.isCurrentInteractiveAssistantMessage).toBe(true);
    expect(projection.shouldReadOnlyInteractiveContent).toBe(false);
  });

  it("非当前尾部的 pending action 仍应只读回显", () => {
    const message: Message = {
      id: "assistant-pending-action-history",
      role: "assistant",
      content: "请选择执行方式。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      actionRequests: [
        {
          requestId: "req-history-action",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行方式",
          questions: [{ question: "请选择执行方式" }],
        },
      ],
    };

    const projection = buildProjection(message, null, {
      hasActiveInteractiveRuntime: true,
      isSending: false,
      lastAssistantMessageId: "other-assistant",
    });

    expect(projection.isCurrentInteractiveAssistantMessage).toBe(false);
    expect(projection.shouldReadOnlyInteractiveContent).toBe(true);
  });

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

  it("流式正文 overlay 不应把最终正文插到网页搜索过程前", () => {
    const message: Message = {
      id: "assistant-live-overlay-search",
      role: "assistant",
      content: "",
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
              output: "已搜索网页 5 次",
            },
          } as never,
        },
      ],
    };

    const projection = buildProjection(message, null, {
      streamingTextOverlay: {
        messageId: message.id,
        eventName: "response.output_text.delta",
        content: "## 今日国际新闻简报\n\n- 第一条要闻。",
        updatedAt: Date.parse("2026-06-02T10:00:02.000Z"),
      },
    });

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(parts[0]?.type === "text" ? parts[0].text : "").toContain(
      "我先联网核实",
    );
    expect(parts[1]?.type === "tool_use" ? parts[1].toolCall.name : "").toBe(
      "web_search",
    );
    expect(parts[2]?.type === "text" ? parts[2].text : "").toContain(
      "今日国际新闻简报",
    );
    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
  });

  it("网页搜索仍在运行时流式 overlay 不应提前显示成最终正文", () => {
    const message: Message = {
      id: "assistant-running-search-overlay",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
        streamingTextOverlay: {
          messageId: message.id,
          eventName: "response.output_text.delta",
          content: "## 今日 AI 新闻\n\n- 第一条要闻。",
          updatedAt: Date.parse("2026-06-02T10:00:03.000Z"),
        },
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["tool_use"]);
    expect(projection.actionContent).toBe("");
    expect(projection.rendererContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(JSON.stringify(parts)).not.toContain("今日 AI 新闻");
  });

  it("网页搜索状态滞后为 running 时，已到达的 final_answer 应继续穿插显示", () => {
    const message: Message = {
      id: "assistant-running-search-final-item",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-before-final",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-running-final-answer",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("网页搜索 tool_call 状态滞后为 running 时，已到达的 final_answer 应继续穿插显示", () => {
    const message: Message = {
      id: "assistant-running-string-search-final-item",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-string-before-final",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "running",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "今天 AI 行业公开新闻" },
          output: "",
        } as never,
        {
          id: "assistant-final-after-running-string-search",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("网页搜索仍在运行且 message.content 已有正文时也不应显示到工具下方", () => {
    const message: Message = {
      id: "assistant-running-search-message-content",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "我正在继续等待搜索结果。",
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-before-message-content",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["thinking", "tool_use"]);
    expect(projection.actionContent).toBe("");
    expect(projection.rendererContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(JSON.stringify(parts)).not.toContain("今日 AI 新闻");
  });

  it("turn 已完成且不再发送时，旧 running 网页搜索残留不应吞掉最终正文", () => {
    const message: Message = {
      id: "assistant-running-search-final-item-turn-completed",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-still-running-after-turn-completed",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-final-arrived-before-search-terminal",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "completed",
        isSending: false,
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "completed",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("turn 暂标完成且发送态未释放时，final_answer 已到达也不应被 running 搜索残留吞掉", () => {
    const message: Message = {
      id: "assistant-running-search-final-item-still-sending",
      role: "assistant",
      content: "## 今日 AI 新闻\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-still-running-while-sending",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
        {
          id: "assistant-final-arrived-before-search-terminal-sending",
          type: "agent_message",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          phase: "final_answer",
          text: "## 今日 AI 新闻\n\n- 第一条要闻。",
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        } as never,
      ],
      {
        turnStatus: "completed",
        isSending: true,
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    expect(projection.actionContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererContent).toBe("## 今日 AI 新闻\n\n- 第一条要闻。");
    expect(projection.rendererRawContent).toBe(
      "## 今日 AI 新闻\n\n- 第一条要闻。",
    );
    expect(parts[0]?.type === "tool_use" ? parts[0].toolCall.status : "").toBe(
      "running",
    );
    expect(parts[1]?.type === "text" ? parts[1].text : "").toContain(
      "今日 AI 新闻",
    );
  });

  it("无 timeline 的完成态 contentParts running 搜索残留不应吞掉最终正文", () => {
    const message: Message = {
      id: "assistant-stale-running-tool-content-parts",
      role: "assistant",
      content: "根据多源检索结果，以下是主要国际新闻整理。",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: false,
      contentParts: [
        {
          type: "text",
          text: "我来搜索今天的国际新闻。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-web-search-stale-running",
            name: "WebSearch",
            status: "running",
            startTime: new Date("2026-06-02T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "根据多源检索结果，以下是主要国际新闻整理。",
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: false,
    });

    expect(projection.rendererContent).toBe(
      "根据多源检索结果，以下是主要国际新闻整理。",
    );
    expect(projection.actionContent).toBe(
      "根据多源检索结果，以下是主要国际新闻整理。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
  });

  it("运行中的网页搜索应优先保留更完整的本地 thinkingContent", () => {
    const message: Message = {
      id: "assistant-running-search-thinking",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "The search plan is forming.",
      contentParts: [
        {
          type: "thinking",
          text: "The",
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "search-running-thinker",
          thread_id: "thread-running-search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
          type: "web_search",
          action: "web_search",
          query: "今天 AI 行业公开新闻",
        } as never,
      ],
      {
        turnStatus: "running",
      },
    );

    const parts = projection.rendererContentParts || [];
    expect(parts.map((part) => part.type)).toEqual(["thinking", "tool_use"]);
    expect(parts[0]?.type === "thinking" ? parts[0].text : "").toBe(
      "The search plan is forming.",
    );
    expect(projection.actionContent).toBe("");
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

  it("旧 timeline 缺少 phase 时应只把最后一条 agent_message 当作最终正文", () => {
    const message: Message = {
      id: "assistant-history",
      role: "assistant",
      content: "## 今日国际新闻简报\n\n- 第一条要闻。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-process-search",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        text: "我会先做几组中英文检索。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "tool-web-search",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        tool_name: "web_search",
        arguments: { query: "world news headlines" },
        output: "搜索结果摘要",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-process-fetch",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        text: "我再打开几个页面交叉核对。",
        status: "completed",
        started_at: "2026-06-02T10:00:06.000Z",
        completed_at: "2026-06-02T10:00:07.000Z",
        updated_at: "2026-06-02T10:00:07.000Z",
      },
      {
        id: "tool-web-fetch-failed",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 5,
        tool_name: "WebFetch",
        arguments: { url: "https://example.invalid/news" },
        output: "",
        error: "请求失败",
        success: false,
        status: "failed",
        started_at: "2026-06-02T10:00:08.000Z",
        completed_at: "2026-06-02T10:00:09.000Z",
        updated_at: "2026-06-02T10:00:09.000Z",
      },
      {
        id: "assistant-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 6,
        text: "## 今日国际新闻简报\n\n- 第一条要闻。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).toBe(
      "## 今日国际新闻简报\n\n- 第一条要闻。",
    );
    expect(projection.rendererRawContent).not.toContain("中英文检索");
    expect(projection.rendererRawContent).not.toContain("交叉核对");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
  });

  it("timeline 已有工具 item 时不应再把 legacy message.toolCalls 作为第二套过程源", () => {
    const message: Message = {
      id: "assistant-live-thread-items-own-tools",
      role: "assistant",
      content: "## 结论\n\n- 已完成联网核验。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      toolCalls: [
        {
          id: "legacy-web-search",
          name: "web_search",
          arguments: '{"query":"legacy duplicate"}',
          status: "completed",
          result: {
            success: true,
            output: "legacy duplicate output",
          },
          startTime: new Date("2026-06-02T10:00:03.000Z"),
          endTime: new Date("2026-06-02T10:00:05.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "tool-web-search-current",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        tool_name: "web_search",
        arguments: { query: "current thread item" },
        output: "current output",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        phase: "final_answer",
        text: "## 结论\n\n- 已完成联网核验。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
    const toolParts = projection.rendererContentParts?.filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "tool_use" }
      > => part.type === "tool_use",
    );
    expect(toolParts).toHaveLength(1);
    expect(toolParts?.[0]?.toolCall.id).toBe("tool-web-search-current");
    expect(JSON.stringify(projection.rendererContentParts)).not.toContain(
      "legacy duplicate",
    );
  });

  it("无 timeline 时应继续允许 legacy message.toolCalls 作为兼容过程源", () => {
    const message: Message = {
      id: "assistant-legacy-toolcalls-without-timeline",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
      toolCalls: [
        {
          id: "legacy-search-without-timeline",
          name: "web_search",
          arguments: '{"query":"legacy no timeline"}',
          status: "running",
          startTime: new Date("2026-06-02T10:00:03.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: true,
    });

    expect(projection.rendererToolCalls).toEqual([
      expect.objectContaining({ id: "legacy-search-without-timeline" }),
    ]);
    expect(projection.inlineProcessCoverage.hasInlineProcessEntries).toBe(true);
  });

  it("timeline 只有状态摘要时应继续允许 legacy message.toolCalls 兜底旧过程", () => {
    const message: Message = {
      id: "assistant-timeline-summary-blocks-legacy-tools",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
      toolCalls: [
        {
          id: "legacy-tool-while-summary-exists",
          name: "web_search",
          arguments: '{"query":"legacy summary duplicate"}',
          status: "running",
          startTime: new Date("2026-06-02T10:00:03.000Z"),
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "turn-summary-current-source",
          type: "turn_summary",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          text: "正在连接搜索工具。",
          status: "in_progress",
          started_at: "2026-06-02T10:00:01.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
        } as never,
      ],
      {
        isSending: true,
        turnStatus: "running",
      },
    );

    expect(projection.rendererToolCalls).toEqual([
      expect.objectContaining({ id: "legacy-tool-while-summary-exists" }),
    ]);
    expect(
      projection.inlineProcessCoverage.toolNameCounts.get("web_search"),
    ).toBe(1);
  });

  it("timeline 过程项未生成 tool_use part 时仍应禁用 legacy message.toolCalls", () => {
    const message: Message = {
      id: "assistant-context-compaction-blocks-legacy-tools",
      role: "assistant",
      content: "已整理上下文后继续。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: false,
      toolCalls: [
        {
          id: "legacy-tool-while-context-compaction-exists",
          name: "web_search",
          arguments: '{"query":"legacy context duplicate"}',
          status: "completed",
          result: {
            success: true,
            output: "legacy duplicate output",
          },
          startTime: new Date("2026-06-02T10:00:03.000Z"),
          endTime: new Date("2026-06-02T10:00:05.000Z"),
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "context-compaction-current-source",
        type: "context_compaction",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        stage: "completed",
        trigger: "manual",
        detail: "已压缩上下文。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      } as never,
      {
        id: "assistant-final-after-compaction",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        phase: "final_answer",
        text: "已整理上下文后继续。",
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      } as never,
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(JSON.stringify(projection)).not.toContain(
      "legacy context duplicate",
    );
  });

  it("Codex 导入 timeline 应继续保留只读工具过程渲染", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "codex",
    };
    const message: Message = {
      id: "assistant-imported-codex-history",
      role: "assistant",
      content: "已完成导入会话复盘。",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "imported-reasoning",
        type: "reasoning",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        text: "先检查导入记录。",
        summary: ["先检查导入记录。"],
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "imported-command",
        type: "command_execution",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        command: "npm test",
        cwd: "/workspace/imported-codex",
        aggregated_output: "ok",
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:04.000Z",
        updated_at: "2026-06-02T10:00:04.000Z",
      },
      {
        id: "assistant-imported-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        phase: "final_answer",
        text: "已完成导入会话复盘。",
        metadata: importedMetadata,
        status: "completed",
        started_at: "2026-06-02T10:00:28.000Z",
        completed_at: "2026-06-02T10:00:30.000Z",
        updated_at: "2026-06-02T10:00:30.000Z",
      },
    ] as never);

    expect(projection.rendererToolCalls).toBeUndefined();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.primaryTimeline?.items).toBeUndefined();
    expect(projection.shouldRenderCompactPrimaryTimeline).toBe(false);
    expect(projection.actionContent).toBe("已完成导入会话复盘。");
  });

  it("搜索已完成但 active turn 仍在整理最终答复时，应保持过程活跃且不伪造正文", () => {
    const message: Message = {
      id: "assistant-search-synthesizing",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: false,
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在整理最终答复",
        detail: "搜索已经完成，正在组织最终回答。",
      },
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "web-search-synthesizing-completed",
          type: "web_search",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          action: "search",
          query: "学习机 权威评测 对比",
          output: JSON.stringify({
            results: [
              {
                title: "学习机权威评测",
                url: "https://example.com/review",
                snippet: "评测摘要",
              },
            ],
          }),
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:04.000Z",
          updated_at: "2026-06-02T10:00:04.000Z",
        },
      ] as never,
      {
        isSending: false,
        turnStatus: "running",
      },
    );

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.isActiveProcessOnlyOutput).toBe(true);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
    ]);
    expect(projection.primaryTimeline?.items).toBeUndefined();
  });

  it("running 搜索后的 commentary 不应越序成为最终正文", () => {
    const message: Message = {
      id: "assistant-live-search-running",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-02T10:00:30.000Z"),
      isThinking: true,
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-search-plan",
        type: "agent_message",
        turn_id: "turn-live-search-running",
        sequence: 1,
        phase: "commentary",
        text: "我先设计几组搜索查询，并对比权威来源。",
        status: "completed",
        started_at: "2026-06-02T10:00:01.000Z",
        completed_at: "2026-06-02T10:00:02.000Z",
        updated_at: "2026-06-02T10:00:02.000Z",
      },
      {
        id: "web-search-first",
        type: "web_search",
        turn_id: "turn-live-search-running",
        sequence: 2,
        action: "search",
        query: "学习机 权威 评测 对比",
        output: "搜索结果摘要",
        status: "completed",
        started_at: "2026-06-02T10:00:03.000Z",
        completed_at: "2026-06-02T10:00:04.000Z",
        updated_at: "2026-06-02T10:00:04.000Z",
      },
      {
        id: "web-search-running",
        type: "web_search",
        turn_id: "turn-live-search-running",
        sequence: 3,
        action: "search",
        query: "科大讯飞 学习机 评测 竞品",
        output: "",
        status: "in_progress",
        started_at: "2026-06-02T10:00:05.000Z",
        updated_at: "2026-06-02T10:00:05.000Z",
      },
      {
        id: "assistant-search-progress",
        type: "agent_message",
        turn_id: "turn-live-search-running",
        sequence: 4,
        phase: "commentary",
        text: "来帮你搜索和分析一下不同学习机的评测结论。",
        status: "completed",
        started_at: "2026-06-02T10:00:06.000Z",
        completed_at: "2026-06-02T10:00:07.000Z",
        updated_at: "2026-06-02T10:00:07.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_use",
      "thinking",
    ]);
    expect(projection.rendererContentParts?.[3]).toMatchObject({
      type: "thinking",
      text: "来帮你搜索和分析一下不同学习机的评测结论。",
    });
  });

  it("历史 timeline 的审批和问答应按顺序进入交错过程", () => {
    const message: Message = {
      id: "assistant-history-actions",
      role: "assistant",
      content: "最终回答：已按你的选择继续。",
      timestamp: new Date("2026-06-02T10:03:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-before-approval",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 1,
        text: "我需要先确认是否允许联网。",
        status: "completed",
        started_at: "2026-06-02T10:02:01.000Z",
        completed_at: "2026-06-02T10:02:02.000Z",
        updated_at: "2026-06-02T10:02:02.000Z",
      },
      {
        id: "approval-search",
        type: "approval_request",
        turn_id: "turn-action-history",
        sequence: 2,
        request_id: "approval-search",
        action_type: "tool_confirmation",
        prompt: "允许联网搜索今天的国际新闻吗？",
        tool_name: "web_search",
        arguments: { query: "today international news" },
        status: "in_progress",
        started_at: "2026-06-02T10:02:03.000Z",
        updated_at: "2026-06-02T10:02:03.000Z",
      },
      {
        id: "assistant-before-format",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 3,
        text: "确认后我再询问输出格式。",
        status: "completed",
        started_at: "2026-06-02T10:02:04.000Z",
        completed_at: "2026-06-02T10:02:05.000Z",
        updated_at: "2026-06-02T10:02:05.000Z",
      },
      {
        id: "ask-format",
        type: "request_user_input",
        turn_id: "turn-action-history",
        sequence: 4,
        request_id: "ask-format",
        action_type: "ask_user",
        prompt: "请选择输出格式",
        questions: [
          {
            question: "请选择输出格式",
            options: [{ label: "简报" }, { label: "时间线" }],
          },
        ],
        response: { answer: "简报" },
        status: "completed",
        started_at: "2026-06-02T10:02:06.000Z",
        completed_at: "2026-06-02T10:02:07.000Z",
        updated_at: "2026-06-02T10:02:07.000Z",
      },
      {
        id: "assistant-action-final",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 5,
        phase: "final_answer",
        text: "最终回答：已按你的选择继续。",
        status: "completed",
        started_at: "2026-06-02T10:02:58.000Z",
        completed_at: "2026-06-02T10:03:00.000Z",
        updated_at: "2026-06-02T10:03:00.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("最终回答：已按你的选择继续。");
    expect(projection.rendererRawContent).toBe("最终回答：已按你的选择继续。");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "action_required",
      "text",
      "action_required",
      "text",
    ]);

    const actionParts = projection.rendererContentParts?.filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "action_required" }
      > => part.type === "action_required",
    );
    expect(actionParts?.map((part) => part.actionRequired.requestId)).toEqual([
      "approval-search",
      "ask-format",
    ]);
    expect(actionParts?.[0]?.actionRequired.status).toBe("pending");
    expect(actionParts?.[1]?.actionRequired.status).toBe("submitted");
  });

  it("历史图片查看工具应保持 timeline 顺序并保留图片 metadata", () => {
    const message: Message = {
      id: "assistant-history-view-image",
      role: "assistant",
      content: "最终观察：截图里有一个仪表盘。",
      timestamp: new Date("2026-06-02T10:04:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-before-image",
        type: "agent_message",
        turn_id: "turn-image-history",
        sequence: 1,
        text: "我先查看你给的截图。",
        status: "completed",
        started_at: "2026-06-02T10:03:01.000Z",
        completed_at: "2026-06-02T10:03:02.000Z",
        updated_at: "2026-06-02T10:03:02.000Z",
      },
      {
        id: "tool-view-image-history",
        type: "tool_call",
        turn_id: "turn-image-history",
        sequence: 2,
        tool_name: "ViewImageTool",
        arguments: { path: "/workspace/assets/dashboard.png" },
        output:
          "Viewed image: /workspace/assets/dashboard.png\nFormat: image/png\nImage content is attached to this tool result.",
        metadata: {
          model_visible_image: true,
          image_url: "data:image/png;base64,ZGFzaGJvYXJk",
          mime_type: "image/png",
          path: "/workspace/assets/dashboard.png",
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:03:03.000Z",
        completed_at: "2026-06-02T10:03:04.000Z",
        updated_at: "2026-06-02T10:03:04.000Z",
      },
      {
        id: "assistant-after-image",
        type: "agent_message",
        turn_id: "turn-image-history",
        sequence: 3,
        phase: "final_answer",
        text: "最终观察：截图里有一个仪表盘。",
        status: "completed",
        started_at: "2026-06-02T10:03:58.000Z",
        completed_at: "2026-06-02T10:04:00.000Z",
        updated_at: "2026-06-02T10:04:00.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("最终观察：截图里有一个仪表盘。");
    expect(projection.rendererRawContent).toBe(
      "最终观察：截图里有一个仪表盘。",
    );
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);

    const toolPart = projection.rendererContentParts?.find(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "tool_use" }
      > => part.type === "tool_use",
    );
    expect(toolPart?.toolCall.result?.metadata?.image_url).toBe(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
  });

  it("provider 失败正文已有错误卡承载时不应重复作为 assistant 正文", async () => {
    await changeLimeLocale("zh-CN");

    const message: Message = {
      id: "assistant-provider-failed",
      role: "assistant",
      content:
        "执行失败：Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      isThinking: false,
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
        detail:
          "当前模型通道暂时不可用，请稍后重试；如果持续失败，请检查 Provider 状态或切换到其他可用模型。",
      },
      contentParts: [
        {
          type: "text",
          text: "执行失败：Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "turn-error",
        type: "error",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        message:
          "Agent provider execution failed: Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
        status: "failed",
        started_at: "2026-06-02T10:01:01.000Z",
        completed_at: "2026-06-02T10:01:02.000Z",
        updated_at: "2026-06-02T10:01:02.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.hasAssistantBodyContent).toBe(true);
  });

  it("文件变更汇总已展示同一路径时不应再渲染普通 artifact 卡片", () => {
    const message: Message = {
      id: "assistant-file-change-dedup",
      role: "assistant",
      content: "CODE_RUNTIME_DONE",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      contentParts: [
        { type: "text", text: "CODE_RUNTIME_DONE" },
        {
          type: "file_changes_batch",
          aggregate: {
            files: [
              {
                path: "src/greeting.ts",
                kind: "update",
                linesAdded: 1,
                linesRemoved: 1,
                diff: [],
                truncated: false,
                source: "backend",
                status: "completed",
              },
            ],
            totalAdded: 1,
            totalRemoved: 1,
            fileCount: 1,
          },
        },
      ],
      artifacts: [
        {
          id: "artifact-greeting",
          type: "code",
          title: "greeting.ts",
          content:
            "export function greeting() { return 'Hello Lime Runtime'; }",
          status: "complete",
          meta: {
            filePath:
              "/Users/coso/Library/Application Support/lime/projects/demo/src/greeting.ts",
            filename: "greeting.ts",
          },
          position: { start: 0, end: 64 },
          createdAt: Date.parse("2026-06-02T10:01:00.000Z"),
          updatedAt: Date.parse("2026-06-02T10:01:00.000Z"),
        },
      ],
    };

    const projection = buildProjection(message);

    expect(projection.visibleAssistantArtifacts).toHaveLength(0);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "file_changes_batch",
    ]);
  });

  it("文件变更汇总已覆盖同一路径时不应再渲染尾部 file_artifact 时间线卡片", () => {
    const message: Message = {
      id: "assistant-file-change-timeline-dedup",
      role: "assistant",
      content: "CODE_RUNTIME_DONE",
      timestamp: new Date("2026-06-02T10:01:00.000Z"),
      contentParts: [
        { type: "text", text: "CODE_RUNTIME_DONE" },
        {
          type: "file_changes_batch",
          aggregate: {
            files: [
              {
                path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
                kind: "update",
                linesAdded: 3,
                linesRemoved: 1,
                diff: [],
                truncated: false,
                source: "backend",
                status: "completed",
              },
            ],
            totalAdded: 3,
            totalRemoved: 1,
            fileCount: 1,
          },
        },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "artifact-document-card",
        type: "file_artifact",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
        source: "artifact_snapshot",
        content:
          "export function greeting() { return 'Hello Lime Runtime'; }\nexport const runtimeVerified = true;",
        status: "completed",
        started_at: "2026-06-02T10:01:01.000Z",
        completed_at: "2026-06-02T10:01:02.000Z",
        updated_at: "2026-06-02T10:01:02.000Z",
      },
      {
        id: "artifact-absolute-card",
        type: "file_artifact",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        path: "/Users/coso/Library/Application Support/lime/projects/code-runtime-fixture/src/greeting.ts",
        source: "tool_result",
        content: "点击在画布中打开完整内容。",
        status: "completed",
        started_at: "2026-06-02T10:01:03.000Z",
        completed_at: "2026-06-02T10:01:04.000Z",
        updated_at: "2026-06-02T10:01:04.000Z",
      },
    ] as never);

    expect(projection.trailingTimeline).toBeNull();
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "file_changes_batch",
    ]);
  });

  it("搜索后的累计思考不应回写到搜索前的思考块", () => {
    const message: Message = {
      id: "assistant-thinking-after-search",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-20T10:00:00.000Z"),
      isThinking: true,
      thinkingContent: "先确定搜索范围。搜索结果还要筛掉广告。",
      contentParts: [
        {
          type: "thinking",
          text: "先确定搜索范围。",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "tool-search-after-thinking",
            name: "web_search",
            arguments: JSON.stringify({
              query: "五年级 学习机 评测 对比",
            }),
            status: "running",
            startTime: new Date("2026-06-20T10:00:01.000Z"),
          },
        },
      ],
    };

    const projection = buildProjection(message, null, {
      isSending: true,
      turnStatus: "running",
    });

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "thinking",
    ]);
    expect(projection.rendererContentParts?.[0]).toMatchObject({
      type: "thinking",
      text: "先确定搜索范围。",
    });
    expect(projection.rendererContentParts?.[2]).toMatchObject({
      type: "thinking",
      text: "搜索结果还要筛掉广告。",
    });
  });

  it("历史任务板工具应保持时间线穿插顺序且不把任务 JSON 当正文", () => {
    const message: Message = {
      id: "assistant-task-board-history",
      role: "assistant",
      content: "最终结论：任务板已完成。",
      timestamp: new Date("2026-06-02T10:02:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-task-intro",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        phase: "final_answer",
        text: "我先把工作拆成任务板。",
        status: "completed",
        started_at: "2026-06-02T10:01:00.000Z",
        completed_at: "2026-06-02T10:01:01.000Z",
        updated_at: "2026-06-02T10:01:01.000Z",
      },
      {
        id: "tool-task-create-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        tool_name: "TaskCreateTool",
        arguments: {
          subject: "整理国际新闻",
          description: "按来源交叉验证并输出摘要",
        },
        output: JSON.stringify({
          task: { id: "1", subject: "整理国际新闻" },
        }),
        metadata: {
          task: {
            id: "1",
            subject: "整理国际新闻",
            status: "pending",
          },
          task_list_id: "board-main",
          tasks: [
            {
              id: "1",
              subject: "整理国际新闻",
              status: "pending",
            },
          ],
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:02.000Z",
        completed_at: "2026-06-02T10:01:03.000Z",
        updated_at: "2026-06-02T10:01:03.000Z",
      },
      {
        id: "tool-task-get-missing-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        tool_name: "TaskGetTool",
        arguments: { task_id: "missing-task" },
        output: JSON.stringify({ task: null }),
        metadata: {
          task: null,
          task_list_id: "board-main",
          task_list: [],
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:04.000Z",
        completed_at: "2026-06-02T10:01:05.000Z",
        updated_at: "2026-06-02T10:01:05.000Z",
      },
      {
        id: "tool-task-update-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        tool_name: "TaskUpdateTool",
        arguments: {
          task_id: "1",
          status: "completed",
          add_blocked_by: ["0"],
        },
        output: JSON.stringify({
          success: true,
          taskId: "1",
          updatedFields: ["status"],
        }),
        metadata: {
          success: true,
          task_id: "1",
          task_list_id: "board-main",
          status_change: {
            from: "pending",
            to: "completed",
          },
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:06.000Z",
        completed_at: "2026-06-02T10:01:07.000Z",
        updated_at: "2026-06-02T10:01:07.000Z",
      },
      {
        id: "assistant-task-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 5,
        phase: "final_answer",
        text: "最终结论：任务板已完成。",
        status: "completed",
        started_at: "2026-06-02T10:01:58.000Z",
        completed_at: "2026-06-02T10:02:00.000Z",
        updated_at: "2026-06-02T10:02:00.000Z",
      },
    ] as never);

    expect(projection.actionContent).toBe("最终结论：任务板已完成。");
    expect(projection.rendererRawContent).toBe("最终结论：任务板已完成。");
    expect(projection.rendererRawContent).not.toContain("updatedFields");
    expect(projection.rendererRawContent).not.toContain("task_list_id");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.filter(
        (part) => part.type === "tool_use",
      ),
    ).toHaveLength(3);
  });

  it("网页检索工具已在消息内联时应把 timeline 中间 reasoning 合并进同一渲染过程", () => {
    const message: Message = {
      id: "assistant-web-tools-inline",
      role: "assistant",
      content:
        "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。",
      timestamp: new Date("2026-06-20T10:00:00.000Z"),
      isThinking: false,
      runtimeTurnId: "turn-web-tools-inline",
      contentParts: [
        {
          type: "tool_use",
          metadata: { sequence: 2 },
          toolCall: {
            id: "tool-web-search-inline",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "Lime WebSearch rendering" }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                results: [
                  {
                    title: "Lime WebSearch Rendering Source",
                    url: "https://example.com/lime-websearch-rendering",
                    snippet: "Search source used to verify inline rendering",
                  },
                ],
              }),
            },
          } as never,
        },
        {
          type: "tool_use",
          metadata: { sequence: 4 },
          toolCall: {
            id: "tool-web-fetch-inline",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/lime-websearch-rendering",
            }),
            status: "completed",
            result: {
              success: true,
              output: JSON.stringify({
                bytes: 2048,
                code: 200,
                codeText: "OK",
                result: "# 页面正文",
              }),
            },
          } as never,
        },
        {
          type: "text",
          text: "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。",
        },
      ],
    };

    const projection = buildProjection(
      message,
      [
        {
          id: "reasoning-web-tools-inline",
          thread_id: "thread-web-tools-inline",
          turn_id: "turn-web-tools-inline",
          type: "reasoning",
          sequence: 3,
          status: "completed",
          text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
          started_at: "",
          completed_at: "",
          updated_at: "",
        } as never,
        {
          id: "runtime-summary-web-tools-inline",
          thread_id: "thread-web-tools-inline",
          turn_id: "turn-web-tools-inline",
          type: "turn_summary",
          sequence: 5,
          status: "completed",
          text: "已搜索网页 1 次，读取网页 1 次",
          started_at: "2026-06-20T10:00:00.000Z",
          completed_at: "2026-06-20T10:00:01.000Z",
          updated_at: "2026-06-20T10:00:01.000Z",
        } as never,
      ],
      {
        hasActiveInteractiveRuntime: false,
        isSending: false,
        turnStatus: "completed",
      },
    );

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererContentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
    });
  });

});
