import { describe, expect, it } from "vitest";
import type { Message, MessageImageWorkbenchPreview } from "../types";
import {
  finalizePreviewMessages,
  mergeImageWorkbenchPreviewMessage,
  previewsReferToSameImageWorkbenchTask,
  upsertPreviewMessage,
} from "./imageTaskPreviewRuntimeMessages";

function createPreview(
  overrides: Partial<MessageImageWorkbenchPreview>,
): MessageImageWorkbenchPreview {
  return {
    taskId: "task-1",
    prompt: "春日咖啡馆插画",
    status: "running",
    projectId: "project-1",
    contentId: "content-1",
    ...overrides,
  };
}

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: "message-1",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("imageTaskPreviewRuntimeMessages", () => {
  it("应按 task/path/running fallback 判断同一个图片任务 preview", () => {
    expect(
      previewsReferToSameImageWorkbenchTask(
        createPreview({ taskId: "task-a" }),
        createPreview({ taskId: "task-a" }),
      ),
    ).toBe(true);
    expect(
      previewsReferToSameImageWorkbenchTask(
        createPreview({
          taskId: "task-a",
          taskFilePath: "/workspace/.lime/tasks/image/task-a.json",
        }),
        createPreview({
          taskId: "task-b",
          taskFilePath: "/workspace/.lime/tasks/image/task-a.json",
        }),
      ),
    ).toBe(true);
    expect(
      previewsReferToSameImageWorkbenchTask(
        createPreview({
          taskId: "task-a",
          prompt: "  春日咖啡馆插画  ",
          mode: "generate",
          expectedImageCount: 2,
          status: "running",
        }),
        createPreview({
          taskId: "task-b",
          prompt: "春日咖啡馆插画",
          mode: "generate",
          expectedImageCount: 2,
          status: "running",
        }),
      ),
    ).toBe(true);
  });

  it("应把同一 runtime turn 的占位消息替换成图片任务预览并移除重复 preview", () => {
    const runtimeMessage = createMessage({
      id: "assistant-runtime",
      runtimeTurnId: "turn-1",
      isThinking: true,
    });
    const duplicatePreviewMessage = createMessage({
      id: "duplicate-preview",
      imageWorkbenchPreview: createPreview({
        taskId: "task-1",
        status: "running",
      }),
    });
    const completedPreviewMessage = createMessage({
      id: "image-workbench:task-1:assistant",
      content: "图片已完成",
      imageWorkbenchPreview: createPreview({
        taskId: "task-1",
        status: "complete",
        imageUrl: "https://cdn.example.com/result.png",
      }),
    });

    const messages = upsertPreviewMessage(
      [runtimeMessage, duplicatePreviewMessage],
      completedPreviewMessage,
      { runtimeTurnId: "turn-1" },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "assistant-runtime",
      content: "图片已完成",
      runtimeTurnId: "turn-1",
      imageWorkbenchPreview: {
        taskId: "task-1",
        status: "complete",
        imageUrl: "https://cdn.example.com/result.png",
      },
    });
    expect(messages[0].isThinking).not.toBe(true);
  });

  it("恢复 snapshot 自带 runtime turn 时应合并回原 assistant 消息", () => {
    const runtimeMessage = createMessage({
      id: "assistant-runtime",
      runtimeTurnId: "turn-restore",
      usage: {
        input_tokens: 31_000,
        output_tokens: 0,
      },
    });
    const restoredPreviewMessage = createMessage({
      id: "image-workbench:task-restore:assistant",
      runtimeTurnId: "turn-restore",
      imageWorkbenchPreview: createPreview({
        taskId: "task-restore",
        status: "complete",
      }),
    });

    const messages = upsertPreviewMessage(
      [runtimeMessage],
      restoredPreviewMessage,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "assistant-runtime",
      runtimeTurnId: "turn-restore",
      usage: {
        input_tokens: 31_000,
        output_tokens: 0,
      },
      imageWorkbenchPreview: {
        taskId: "task-restore",
        status: "complete",
      },
    });
  });

  it("应保留已有过程 content parts，并合并 thinking 与 tool calls", () => {
    const existingMessage = createMessage({
      id: "assistant-runtime",
      content: "",
      thinkingContent: "第一步",
      contentParts: [
        {
          type: "thinking",
          text: "第一步",
        },
      ],
      toolCalls: [
        {
          id: "tool-1",
          name: "lime_create_image_generation_task",
          status: "running",
          startTime: new Date("2026-07-02T00:00:00.000Z"),
        },
      ],
      imageWorkbenchPreview: createPreview({
        status: "running",
      }),
    });
    const nextMessage = createMessage({
      id: "image-workbench:task-1:assistant",
      content: "图片已完成",
      thinkingContent: "第二步",
      contentParts: [
        {
          type: "text",
          text: "图片已完成",
        },
      ],
      toolCalls: [
        {
          id: "tool-1",
          name: "lime_create_image_generation_task",
          status: "completed",
          startTime: new Date("2026-07-02T00:00:00.000Z"),
        },
      ],
      imageWorkbenchPreview: createPreview({
        status: "complete",
      }),
    });

    const merged = mergeImageWorkbenchPreviewMessage({
      existingMessage,
      nextMessage,
    });

    expect(merged.content).toBe("图片已完成");
    expect(merged.contentParts).toEqual(existingMessage.contentParts);
    expect(merged.toolCalls).toMatchObject([
      {
        id: "tool-1",
        name: "lime_create_image_generation_task",
        status: "completed",
      },
    ]);
    expect(merged.thinkingContent).toBe("第一步\n\n第二步");
    expect(merged.imageWorkbenchPreview?.status).toBe("complete");
  });

  it("preview shell 与 runtime 消息合并时应保留后到的 token usage", () => {
    const previewShell = createMessage({
      id: "image-workbench:task-1:assistant",
      imageWorkbenchPreview: createPreview({ status: "complete" }),
    });
    const runtimeMessage = createMessage({
      id: "assistant-runtime",
      runtimeTurnId: "turn-1",
      usage: {
        input_tokens: 31_000,
        output_tokens: 0,
      },
      imageWorkbenchPreview: createPreview({ status: "complete" }),
    });

    const merged = mergeImageWorkbenchPreviewMessage({
      existingMessage: previewShell,
      nextMessage: runtimeMessage,
    });

    expect(merged.usage).toEqual({
      input_tokens: 31_000,
      output_tokens: 0,
    });
  });

  it("preview shell 与 runtime snapshot 合并时应保留后到的 runtime turn", () => {
    const previewShell = createMessage({
      id: "image-workbench:task-1:assistant",
      imageWorkbenchPreview: createPreview({
        status: "complete",
        caption: null,
      }),
    });
    const runtimeSnapshot = createMessage({
      id: "image-workbench:task-1:assistant",
      runtimeTurnId: "turn-1",
      imageWorkbenchPreview: createPreview({
        status: "complete",
        caption: null,
      }),
    });

    const merged = mergeImageWorkbenchPreviewMessage({
      existingMessage: previewShell,
      nextMessage: runtimeSnapshot,
    });

    expect(merged.runtimeTurnId).toBe("turn-1");
  });

  it("完成态 preview 没有 caption 时应保留 presentation 生成的结果描述", () => {
    const existingMessage = createMessage({
      id: "assistant-runtime",
      content: "好啊，我来生成这张春天照片。",
      imageWorkbenchPreview: createPreview({
        status: "running",
        caption: "完成了，春天照片已经生成，可以继续调光线。",
      }),
    });
    const nextMessage = createMessage({
      id: "image-workbench:task-1:assistant",
      content: "",
      imageWorkbenchPreview: createPreview({
        status: "complete",
        imageUrl: "https://cdn.example.com/spring.png",
        caption: null,
      }),
    });

    const merged = mergeImageWorkbenchPreviewMessage({
      existingMessage,
      nextMessage,
    });

    expect(merged.content).toBe("好啊，我来生成这张春天照片。");
    expect(merged.imageWorkbenchPreview).toMatchObject({
      status: "complete",
      imageUrl: "https://cdn.example.com/spring.png",
      caption: "完成了，春天照片已经生成，可以继续调光线。",
    });
  });

  it("合并图片 preview 时不应在前端改写已有 content 与 caption 语义", () => {
    const existingMessage = createMessage({
      id: "assistant-runtime",
      content:
        "好啊，先来Generate深圳夏day午后的城市照片，阳光明亮，真实摄影Style。",
      imageWorkbenchPreview: createPreview({
        prompt: "用 Agnes 生成一张深圳夏天午后的城市照片，真实摄影风格",
        status: "running",
        caption: "搞定，深圳夏day午后的城市照片，真实摄影Style 已经做好了。",
      }),
    });
    const nextMessage = createMessage({
      id: "image-workbench:task-1:assistant",
      content: "",
      imageWorkbenchPreview: createPreview({
        prompt: "用 Agnes 生成一张深圳夏天午后的城市照片，真实摄影风格",
        status: "complete",
        imageUrl: "https://cdn.example.com/shenzhen.png",
        caption: null,
      }),
    });

    const merged = mergeImageWorkbenchPreviewMessage({
      existingMessage,
      nextMessage,
    });

    expect(merged.content).toContain("Generate深圳夏day午后");
    expect(merged.content).toContain("真实摄影Style");
    expect(merged.imageWorkbenchPreview?.caption).toContain("深圳夏day");
    expect(merged.imageWorkbenchPreview?.caption).toContain("真实摄影Style");
  });

  it("应清理草稿 preview，并把 skill 执行失败归一成可重试失败态", () => {
    const draftMessage = createMessage({
      id: "draft",
      imageWorkbenchPreview: createPreview({
        taskId: "draft-image-local",
        status: "running",
      }),
    });
    const failedMessage = createMessage({
      id: "failed",
      content: "skill_execute_failed: execute_skill failed",
      imageWorkbenchPreview: createPreview({
        taskId: "task-failed",
        status: "running",
      }),
    });

    const messages = finalizePreviewMessages([], [draftMessage, failedMessage]);

    expect(messages[0].imageWorkbenchPreview).toBeUndefined();
    expect(messages[1].imageWorkbenchPreview).toMatchObject({
      taskId: "task-failed",
      status: "failed",
      phase: "failed",
      retryable: true,
    });
    expect(messages[1].content).toBe("");
  });
});
