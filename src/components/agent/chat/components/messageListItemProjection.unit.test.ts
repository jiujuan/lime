import { describe, expect, it } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { resolveMessageListItemProjection } from "./messageListItemProjection";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message } from "../types";

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

  it("历史未知动态 MCP 工具应保持工具族顺序并进入渲染内容", () => {
    const message: Message = {
      id: "assistant-dynamic-mcp-history",
      role: "assistant",
      content: "最终结论：动态 MCP 线索已经汇总。",
      timestamp: new Date("2026-06-02T10:03:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-dynamic-mcp-intro",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        phase: "final_answer",
        text: "我先查一下外部系统里的相关线索。",
        status: "completed",
        started_at: "2026-06-02T10:02:00.000Z",
        completed_at: "2026-06-02T10:02:01.000Z",
        updated_at: "2026-06-02T10:02:01.000Z",
      },
      {
        id: "tool-dynamic-mcp-search",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        tool_name: "mcp__github__search_code",
        arguments: { query: "runtime empty final" },
        output: "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:02:02.000Z",
        completed_at: "2026-06-02T10:02:03.000Z",
        updated_at: "2026-06-02T10:02:03.000Z",
      },
      {
        id: "tool-dynamic-mcp-read",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        tool_name: "mcp__docs__read_page",
        arguments: { path: "docs/runtime.md" },
        output: "Runtime notes",
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:02:04.000Z",
        completed_at: "2026-06-02T10:02:05.000Z",
        updated_at: "2026-06-02T10:02:05.000Z",
      },
      {
        id: "assistant-dynamic-mcp-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        phase: "final_answer",
        text: "最终结论：动态 MCP 线索已经汇总。",
        status: "completed",
        started_at: "2026-06-02T10:02:06.000Z",
        completed_at: "2026-06-02T10:02:07.000Z",
        updated_at: "2026-06-02T10:02:07.000Z",
      },
    ] as never);

    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(projection.rendererContentParts?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "mcp__github__search_code",
        status: "completed",
      },
    });
    expect(projection.rendererContentParts?.[2]).toMatchObject({
      type: "tool_use",
      toolCall: {
        name: "mcp__docs__read_page",
        status: "completed",
      },
    });
  });
});
