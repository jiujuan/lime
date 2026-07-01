import { describe, expect, it, vi } from "vitest";
import {
  findStreamingRendererCallByContent,
  mockStreamingRenderer,
  render,
} from "./MessageList.testHarness";
import type {
  Message,
} from "./MessageList.testHarness";

describe("MessageList inline actions", () => {
  it("assistant 消息应把 URL 预览入口透传给流式渲染器", () => {
    const now = new Date();
    const onOpenUrlPreview = vi.fn();
    const messages: Message[] = [
      {
        id: "msg-assistant-url-preview",
        role: "assistant",
        content: "已完成搜索。",
        timestamp: now,
        toolCalls: [
          {
            id: "tool-search-inline",
            name: "WebSearch",
            arguments: JSON.stringify({ query: "AI Agent 最新热点" }),
            status: "completed",
            startTime: now,
            result: {
              success: true,
              output:
                "Example result\nhttps://example.com/result\n搜索摘要。",
            },
          },
        ],
      },
    ];

    const container = render(messages, { onOpenUrlPreview });

    expect(container.querySelector('[data-testid="streaming-renderer"]')).not
      .toBeNull();
    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        onOpenUrlPreview,
      }),
    );
  });

  it("当前活动 assistant A2UI 应继续在消息正文里内联渲染", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-active-a2ui",
        role: "assistant",
        content: "```a2ui\n{}\n```",
        timestamp: now,
      },
    ];

    render(messages, {
      activePendingA2UISource: {
        kind: "assistant_message",
        messageId: "msg-assistant-active-a2ui",
      },
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ renderA2UIInline: true }),
    );
  });

  it("当前活动 action_request 不应再被底部面板抑制", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-action",
        role: "assistant",
        content: "请先确认执行方式。",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-action-1",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [{ question: "请选择执行方式" }],
          },
        ],
      },
    ];

    render(messages, {
      activePendingA2UISource: {
        kind: "action_request",
        requestId: "req-action-1",
      },
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ suppressedActionRequestId: null }),
    );
  });

  it("非活动历史 assistant A2UI 与 action_request 应只读回显，不能再次提交", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-history-a2ui",
        role: "assistant",
        content: "```a2ui\n{}\n```",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-history-ask",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [
              {
                question: "请选择执行方式",
                options: [{ label: "直接执行" }, { label: "稍后处理" }],
              },
            ],
          },
        ],
      },
    ];

    render(messages);

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnlyA2UI: true,
        readOnlyActionRequests: true,
      }),
    );
  });

  it("当前活动 assistant action_request 仍保持可提交，不降级为历史只读", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-current-action",
        role: "assistant",
        content: "请先确认执行方式。",
        timestamp: now,
        actionRequests: [
          {
            requestId: "req-current-ask",
            actionType: "ask_user",
            status: "pending",
            prompt: "请选择执行方式",
            questions: [{ question: "请选择执行方式" }],
          },
        ],
      },
    ];

    render(messages, {
      pendingActions: [
        {
          requestId: "req-current-ask",
          actionType: "ask_user",
          status: "pending",
          prompt: "请选择执行方式",
          questions: [{ question: "请选择执行方式" }],
        },
      ],
    });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnlyA2UI: false,
        readOnlyActionRequests: false,
      }),
    );
  });

  it("应向助手消息正文透传已保存站点内容打开回调", () => {
    const onOpenSavedSiteContent = vi.fn();
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-site-open",
        role: "assistant",
        content: "已保存站点结果。",
        timestamp: now,
      },
    ];

    render(messages, { onOpenSavedSiteContent });

    expect(mockStreamingRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenSavedSiteContent }),
    );
  });

  it("已完成 assistant 消息有内联工具序列时应交给正文按顺序渲染", () => {
    const now = new Date();
    const messages: Message[] = [
      {
        id: "msg-assistant-process-suppressed",
        role: "assistant",
        content: "最终说明",
        timestamp: now,
        thinkingContent: "这段思考应只留在执行轨迹中。",
        contentParts: [
          {
            type: "thinking",
            text: "这段思考应只留在执行轨迹中。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-process-suppressed-1",
              name: "functions.exec_command",
              arguments: JSON.stringify({ cmd: "rg -n process src" }),
              status: "completed",
              result: { success: true, output: "ok" },
              startTime: now,
              endTime: now,
            },
          },
          {
            type: "text",
            text: "最终说明",
          },
        ],
        toolCalls: [
          {
            id: "tool-process-suppressed-1",
            name: "functions.exec_command",
            arguments: JSON.stringify({ cmd: "rg -n process src" }),
            status: "completed",
            result: { success: true, output: "ok" },
            startTime: now,
            endTime: now,
          },
        ],
      },
    ];

    render(messages, {
      currentTurnId: "turn-process-suppressed",
      turns: [
        {
          id: "turn-process-suppressed",
          thread_id: "thread-1",
          prompt_text: "继续执行",
          status: "running",
          started_at: "2026-03-28T12:00:00Z",
          created_at: "2026-03-28T12:00:00Z",
          updated_at: "2026-03-28T12:00:01Z",
        },
      ],
      threadItems: [
        {
          id: "item-process-suppressed",
          thread_id: "thread-1",
          turn_id: "turn-process-suppressed",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-28T12:00:01Z",
          completed_at: "2026-03-28T12:00:02Z",
          updated_at: "2026-03-28T12:00:02Z",
          type: "tool_call",
          tool_name: "functions.exec_command",
          arguments: { cmd: "rg -n process src" },
        },
      ],
    });

    const rendererCall = findStreamingRendererCallByContent("最终说明");
    expect(rendererCall).toMatchObject({
      suppressProcessFlow: false,
      thinkingContent: "这段思考应只留在执行轨迹中。",
      toolCalls: undefined,
    });
    const contentParts = rendererCall?.contentParts || [];
    expect(contentParts[0]).toEqual({
      type: "thinking",
      text: "这段思考应只留在执行轨迹中。",
    });
    expect(contentParts[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "tool-process-suppressed-1",
        name: "functions.exec_command",
        status: "completed",
      },
    });
    expect(contentParts[2]).toEqual({ type: "text", text: "最终说明" });
  });

});
