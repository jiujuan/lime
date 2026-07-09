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

  it("首字前启动态 runtimeStatus 应作为轻量等待态展示且不投影为 assistant 正文", () => {
    const message: Message = {
      id: "assistant-startup-note-placeholder",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-06-07T10:00:00.000Z"),
      isThinking: true,
      runtimeStatus: {
        phase: "preparing",
        title: "正在启动处理流程",
        detail: "已接收请求，正在准备上下文。",
        checkpoints: ["等待首个模型事件"],
      },
    };

    const projection = buildProjection(message, null, {
      isSending: true,
      lastAssistantMessageId: message.id,
    });

    expect(projection.shouldRenderFirstTokenRuntimeStatus).toBe(true);
    expect(projection.actionContent).toBe("");
    expect(projection.rendererContent).toBe("");
    expect(projection.rendererRawContent).toBe("");
    expect(projection.rendererContentParts).toBeUndefined();
  });

  it("assistant 正文首字已出现时应保留运行态且不回退到首字前状态", () => {
    const message: Message = {
      id: "assistant-visible-text-still-running",
      role: "assistant",
      content: "第一段正文已经开始输出。",
      timestamp: new Date("2026-06-07T10:00:01.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: "第一段正文已经开始输出。",
        },
      ],
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在输出",
        detail: "模型正在继续生成后续正文。",
      },
    };

    const projection = buildProjection(message, null, {
      isSending: true,
      hasActiveInteractiveRuntime: true,
      lastAssistantMessageId: message.id,
    });

    expect(projection.shouldRenderFirstTokenRuntimeStatus).toBe(false);
    expect(projection.hasAssistantBodyContent).toBe(true);
    expect(projection.actionContent).toBe("第一段正文已经开始输出。");
    expect(projection.rendererContent).toBe("第一段正文已经开始输出。");
    expect(projection.rendererRawContent).toBe("第一段正文已经开始输出。");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(projection.isCurrentInteractiveAssistantMessage).toBe(true);
    expect(projection.shouldReadOnlyInteractiveContent).toBe(false);
  });

  it("failed runtimeStatus 应剥离执行失败诊断并去重已输出正文", () => {
    const visibleText =
      "我先把今天的国际新闻证据抓回来，省得我们俩对着昨天的旧闻开会。";
    const rawError =
      "execution backend error: Agent provider execution failed: Request failed: Resource not found (404): ***NotFoundError: NotFoundError: OpenAIException - {\"detail\":\"Not Found\"}";
    const message: Message = {
      id: "assistant-news-provider-not-found",
      role: "assistant",
      content: [
        `${visibleText}执行失败： ${rawError}`,
        visibleText,
        visibleText,
      ].join("\n\n"),
      timestamp: new Date("2026-06-07T10:00:04.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "text",
          text: [
            `${visibleText}执行失败： ${rawError}`,
            visibleText,
            visibleText,
          ].join("\n\n"),
        },
      ],
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
        detail: rawError,
      },
    };

    const projection = buildProjection(message, null, {
      isSending: false,
      hasActiveInteractiveRuntime: false,
      lastAssistantMessageId: message.id,
    });

    expect(projection.actionContent).toBe(visibleText);
    expect(projection.rendererContent).toBe(visibleText);
    expect(projection.rendererRawContent).toBe(visibleText);
    expect(projection.rendererContentParts).toEqual([
      {
        type: "text",
        text: visibleText,
      },
    ]);
    expect(projection.actionContent).not.toContain("执行失败");
    expect(projection.actionContent).not.toContain("OpenAIException");
  });

  it("completed read model 清运行态时不应丢弃 reasoning/tool/text 结构", () => {
    const finalText = "综合检索与项目文件，结论已经整理完成。";
    const toolCall = {
      id: "tool-read-completed",
      name: "Read",
      arguments: '{"file_path":"/repo/src/index.ts"}',
      status: "completed" as const,
      startTime: new Date("2026-06-07T10:00:02.000Z"),
      endTime: new Date("2026-06-07T10:00:03.000Z"),
      result: {
        success: true,
        output: "export const value = 1;",
      },
    };
    const message: Message = {
      id: "assistant-completed-stale-runtime",
      role: "assistant",
      content: finalText,
      timestamp: new Date("2026-06-07T10:00:04.000Z"),
      isThinking: true,
      contentParts: [
        {
          type: "thinking",
          text: "先确认用户问题，再读取关键文件。",
        },
        {
          type: "tool_use",
          toolCall,
        },
        {
          type: "text",
          text: finalText,
        },
      ],
      runtimeStatus: {
        phase: "synthesizing",
        title: "正在输出",
        detail: "本地流状态尚未清理。",
      },
    };

    const projection = buildProjection(message, null, {
      isSending: false,
      hasActiveInteractiveRuntime: false,
      lastAssistantMessageId: message.id,
    });

    expect(projection.shouldRenderFirstTokenRuntimeStatus).toBe(false);
    expect(projection.isCurrentInteractiveAssistantMessage).toBe(false);
    expect(projection.shouldReadOnlyInteractiveContent).toBe(true);
    expect(projection.actionContent).toBe(finalText);
    expect(projection.rendererContent).toBe(finalText);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
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
