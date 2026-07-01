import { describe, expect, it } from "vitest";
import type { Message, MessageImageWorkbenchPreview } from "../types";
import {
  createInitialSessionImageWorkbenchState,
  type ImageWorkbenchOutput,
  type ImageWorkbenchTask,
  type SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import type { ParsedImageTaskSnapshot } from "./imageTaskPreviewRuntimeSnapshot";
import {
  mergeImageTaskSnapshot,
  syncMessagesWithImageWorkbenchState,
} from "./imageTaskPreviewRuntimeState";

const BASE_TIME = Date.parse("2026-07-02T00:00:00.000Z");

function createTask(
  overrides: Partial<ImageWorkbenchTask> = {},
): ImageWorkbenchTask {
  return {
    id: "task-1",
    mode: "generate",
    status: "running",
    prompt: "春日咖啡馆插画",
    rawText: "@配图 春日咖啡馆插画",
    expectedCount: 1,
    outputIds: [],
    createdAt: BASE_TIME,
    sessionId: "session-1",
    hookImageIds: [],
    applyTarget: null,
    ...overrides,
  };
}

function createOutput(
  overrides: Partial<ImageWorkbenchOutput> = {},
): ImageWorkbenchOutput {
  const outputId = overrides.id || "output-1";
  return {
    id: outputId,
    refId: outputId,
    taskId: "task-1",
    hookImageId: `hook-${outputId}`,
    url: "https://cdn.example.com/output-1.png",
    prompt: "春日咖啡馆插画",
    createdAt: BASE_TIME + 1,
    applyTarget: null,
    ...overrides,
  };
}

function createPreview(
  overrides: Partial<MessageImageWorkbenchPreview> = {},
): MessageImageWorkbenchPreview {
  return {
    taskId: "task-1",
    prompt: "春日咖啡馆插画",
    mode: "generate",
    status: "running",
    projectId: "project-1",
    contentId: "content-1",
    ...overrides,
  };
}

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    role: "assistant",
    content: "",
    timestamp: new Date(BASE_TIME),
    ...overrides,
  };
}

function createState(
  overrides: Partial<SessionImageWorkbenchState> = {},
): SessionImageWorkbenchState {
  return {
    ...createInitialSessionImageWorkbenchState(),
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<ParsedImageTaskSnapshot> & {
    task?: ImageWorkbenchTask;
    outputs?: ImageWorkbenchOutput[];
  } = {},
): ParsedImageTaskSnapshot {
  const task = overrides.task || createTask();
  const outputs = overrides.outputs || [];
  const preview = createPreview({
    taskId: task.id,
    prompt: task.prompt,
    mode: task.mode,
    status: task.status === "complete" ? "complete" : "running",
    imageUrl: outputs[0]?.url || null,
    previewImages: outputs.map((output) => output.url),
    imageCount: outputs.length || task.expectedCount,
    expectedImageCount: task.expectedCount,
  });

  return {
    taskId: task.id,
    task,
    outputs,
    terminal: task.status === "complete",
    updatedAt: task.createdAt,
    message: createMessage({
      id: `image-workbench:${task.id}:assistant`,
      imageWorkbenchPreview: preview,
    }),
    ...overrides,
  };
}

describe("imageTaskPreviewRuntimeState", () => {
  it("不应用更旧的任务进度覆盖已完成的 workbench state", () => {
    const current = createState({
      tasks: [
        createTask({
          status: "complete",
          outputIds: ["output-complete"],
        }),
      ],
      outputs: [createOutput({ id: "output-complete" })],
      selectedTaskId: "task-1",
      selectedOutputId: "output-complete",
    });

    const next = mergeImageTaskSnapshot(
      current,
      createSnapshot({
        task: createTask({
          status: "queued",
          outputIds: [],
          createdAt: BASE_TIME - 1000,
        }),
        outputs: [],
      }),
    );

    expect(next).toBe(current);
  });

  it("应在输出 id 改变时按 URL 延续 selected output", () => {
    const current = createState({
      tasks: [
        createTask({
          status: "partial",
          outputIds: ["old-a", "old-selected"],
        }),
      ],
      outputs: [
        createOutput({
          id: "old-a",
          url: "https://cdn.example.com/a.png",
        }),
        createOutput({
          id: "old-selected",
          url: "https://cdn.example.com/selected.png",
        }),
      ],
      selectedTaskId: "task-1",
      selectedOutputId: "old-selected",
    });

    const next = mergeImageTaskSnapshot(
      current,
      createSnapshot({
        task: createTask({
          status: "complete",
          outputIds: ["new-a", "new-selected"],
        }),
        outputs: [
          createOutput({
            id: "new-a",
            url: "https://cdn.example.com/a.png",
          }),
          createOutput({
            id: "new-selected",
            url: "https://cdn.example.com/selected.png",
          }),
        ],
      }),
    );

    expect(next.selectedTaskId).toBe("task-1");
    expect(next.selectedOutputId).toBe("new-selected");
  });

  it("应使用 workbench outputs 补全已有 preview 消息", () => {
    const messages = [
      createMessage({
        id: "user-1",
        role: "user",
        content: "@配图 春日咖啡馆插画",
      }),
      createMessage({
        id: "assistant-preview",
        imageWorkbenchPreview: createPreview({
          status: "running",
          imageUrl: null,
          previewImages: [],
        }),
      }),
    ];
    const state = createState({
      tasks: [
        createTask({
          status: "complete",
          outputIds: ["output-1", "output-2"],
        }),
      ],
      outputs: [
        createOutput({
          id: "output-1",
          url: "https://cdn.example.com/output-1.png",
          providerName: "openai",
          modelName: "gpt-image-2",
        }),
        createOutput({
          id: "output-2",
          url: "https://cdn.example.com/output-2.png",
        }),
      ],
    });

    const nextMessages = syncMessagesWithImageWorkbenchState({
      messages,
      imageWorkbenchState: state,
      projectId: "project-1",
      contentId: "content-1",
    });

    expect(nextMessages).toHaveLength(2);
    expect(nextMessages[1].imageWorkbenchPreview).toMatchObject({
      taskId: "task-1",
      status: "complete",
      imageUrl: "https://cdn.example.com/output-1.png",
      previewImages: [
        "https://cdn.example.com/output-1.png",
        "https://cdn.example.com/output-2.png",
      ],
      imageCount: 2,
      providerName: "openai",
      modelName: "gpt-image-2",
      phase: "succeeded",
    });
  });

  it("应在空历史恢复时追加用户消息和 cached preview", () => {
    const state = createState({
      tasks: [
        createTask({
          status: "complete",
          outputIds: ["output-1"],
        }),
      ],
      outputs: [createOutput()],
    });

    const nextMessages = syncMessagesWithImageWorkbenchState({
      messages: [],
      imageWorkbenchState: state,
      projectId: "project-1",
      contentId: "content-1",
      allowAppendCachedPreviewMessages: true,
    });

    expect(nextMessages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(nextMessages[0]).toMatchObject({
      id: "image-workbench:task-1:user",
      content: "@配图 春日咖啡馆插画",
    });
    expect(nextMessages[1].imageWorkbenchPreview).toMatchObject({
      taskId: "task-1",
      status: "complete",
      imageUrl: "https://cdn.example.com/output-1.png",
    });
  });

  it("应把 cached preview 挂到匹配的历史用户消息后面", () => {
    const messages = [
      createMessage({
        id: "user-1",
        role: "user",
        content: "@配图 春日咖啡馆插画",
      }),
      createMessage({
        id: "assistant-text",
        content: "我来处理",
      }),
      createMessage({
        id: "user-2",
        role: "user",
        content: "下一轮普通对话",
      }),
    ];
    const state = createState({
      tasks: [
        createTask({
          status: "complete",
          outputIds: ["output-1"],
        }),
      ],
      outputs: [createOutput()],
    });

    const nextMessages = syncMessagesWithImageWorkbenchState({
      messages,
      imageWorkbenchState: state,
      projectId: "project-1",
      contentId: "content-1",
      allowAppendCachedPreviewMessages: true,
    });

    expect(nextMessages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-text",
      "user-2",
    ]);
    expect(nextMessages[1].imageWorkbenchPreview).toMatchObject({
      taskId: "task-1",
      status: "complete",
    });
    expect(nextMessages[2].imageWorkbenchPreview).toBeUndefined();
  });
});
