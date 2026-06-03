import { describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message } from "../types";

function buildProjection(
  message: Message,
  timelineItems: NonNullable<
    NonNullable<Parameters<typeof resolveMessageListItemProjection>[0]["group"]["timeline"]>["items"]
  > | null = null,
  options: {
    streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
  } = {},
) {
  return resolveMessageListItemProjection({
    activeCurrentTurnId: null,
    activePendingA2UISource: null,
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
              status: "completed",
            },
            items: timelineItems,
          } as never)
        : null,
    } as never,
    hasActiveInteractiveRuntime: true,
    isRestoredHistoryWindow: false,
    isSending: true,
    lastAssistantMessageId: message.id,
    message,
    shouldDeferHistoricalAssistantMessageDetails: () => false,
    shouldDeferThreadItemsScan: false,
    streamingTextOverlay: options.streamingTextOverlay ?? null,
  });
}

describe("messageListItemProjection", () => {
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
            arguments: "{\"query\":\"2026-06-02 international news\"}",
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
            arguments: "{\"query\":\"2026-06-02 international news\"}",
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
          content: "export function greeting() { return 'Hello Lime Runtime'; }",
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
});
