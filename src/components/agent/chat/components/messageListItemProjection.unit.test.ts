import { describe, expect, it } from "vitest";

import { buildProjection, type Message } from "./messageListItemProjection.testHarness";

describe("messageListItemProjection basic state", () => {
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
});
