import { describe, expect, it } from "vitest";
import { createInitialDocumentState } from "@/components/workspace/canvas/canvasUtils";
import type { Message } from "../types";
import {
  createInitialSessionImageWorkbenchState,
  type ImageWorkbenchTask,
} from "./imageWorkbenchHelpers";
import {
  collectSeedImageTasks,
  mergeMessageThinkingContent,
  resolvePendingImageCommandRecoverySignature,
  shouldEnableWorkspaceImageTaskPreviewRuntime,
  shouldProbeWorkspaceImageTaskCatalog,
} from "./imageTaskPreviewRuntimeGuards";

function createMessage(
  overrides: Partial<Message> & Pick<Message, "role">,
): Message {
  const { role, ...rest } = overrides;
  return {
    id: rest.id || `${role}-1`,
    role,
    content: rest.content || "",
    timestamp: rest.timestamp || new Date("2026-07-02T00:00:00.000Z"),
    ...rest,
  };
}

function createTask(
  overrides: Partial<ImageWorkbenchTask>,
): ImageWorkbenchTask {
  return {
    id: "task-1",
    sessionId: "session-1",
    mode: "generate",
    status: "running",
    prompt: "缓存任务",
    rawText: "@配图 缓存任务",
    expectedCount: 1,
    outputIds: [],
    hookImageIds: [],
    applyTarget: null,
    createdAt: 1,
    ...overrides,
  };
}

describe("imageTaskPreviewRuntimeGuards", () => {
  it("应从历史 assistant 预览收集真实图片任务 seed，并忽略草稿与重复项", () => {
    const tasks = collectSeedImageTasks([
      createMessage({ role: "user", content: "@配图 春日咖啡馆" }),
      createMessage({
        role: "assistant",
        id: "assistant-draft",
        imageWorkbenchPreview: {
          taskId: "draft-image-local",
          prompt: "草稿任务",
          status: "running",
        },
      }),
      createMessage({
        role: "assistant",
        id: "assistant-task-1",
        imageWorkbenchPreview: {
          taskId: "task-1",
          prompt: "春日咖啡馆",
          status: "running",
          taskFilePath: ".lime/tasks/image/task-1.json",
          artifactPath: ".lime/artifacts/image/task-1.json",
        },
      }),
      createMessage({
        role: "assistant",
        id: "assistant-task-1-duplicate",
        imageWorkbenchPreview: {
          taskId: "task-1",
          prompt: "重复任务",
          status: "complete",
        },
      }),
    ]);

    expect(tasks).toEqual([
      {
        taskId: "task-1",
        taskFilePath: ".lime/tasks/image/task-1.json",
        artifactPath: ".lime/artifacts/image/task-1.json",
      },
    ]);
  });

  it("应识别图片命令后只有过程态的恢复签名，并排除已失败或已有终态图片的回合", () => {
    const userMessage = createMessage({
      role: "user",
      id: "user-image-command",
      content: "@配图 生成 春日咖啡馆插画",
    });

    expect(
      resolvePendingImageCommandRecoverySignature([
        userMessage,
        createMessage({
          role: "assistant",
          id: "assistant-process",
          content: "正在准备图片任务",
          isThinking: true,
        }),
      ]),
    ).toBe(
      `user-image-command::${userMessage.timestamp.getTime()}::@配图 生成 春日咖啡馆插画`,
    );

    expect(
      resolvePendingImageCommandRecoverySignature([
        userMessage,
        createMessage({
          role: "assistant",
          id: "assistant-failed",
          content: "任务失败",
          runtimeStatus: {
            phase: "failed",
            title: "失败",
            detail: "没有创建图片任务",
          },
        }),
      ]),
    ).toBeNull();

    expect(
      resolvePendingImageCommandRecoverySignature([
        userMessage,
        createMessage({
          role: "assistant",
          id: "assistant-preview-running",
          imageWorkbenchPreview: {
            taskId: "task-1",
            prompt: "春日咖啡馆插画",
            status: "running",
          },
        }),
      ]),
    ).toBe(
      `user-image-command::${userMessage.timestamp.getTime()}::@配图 生成 春日咖啡馆插画`,
    );

    expect(
      resolvePendingImageCommandRecoverySignature([
        userMessage,
        createMessage({
          role: "assistant",
          id: "assistant-preview-with-image",
          imageWorkbenchPreview: {
            taskId: "task-1",
            prompt: "春日咖啡馆插画",
            status: "running",
            imageUrl: "https://cdn.example.com/spring.png",
          },
        }),
      ]),
    ).toBeNull();

    expect(
      resolvePendingImageCommandRecoverySignature([
        userMessage,
        createMessage({
          role: "assistant",
          id: "assistant-preview-complete",
          imageWorkbenchPreview: {
            taskId: "task-1",
            prompt: "春日咖啡馆插画",
            status: "complete",
          },
        }),
      ]),
    ).toBeNull();
  });

  it("应把 document-inline 占位、缓存任务和 pending 命令作为 workspace catalog 探测信号", () => {
    const documentCanvas = createInitialDocumentState(`# 标题

![首图](pending-image-task://task-1?status=running&prompt=%E9%A6%96%E5%9B%BE)
<!-- lime:image-task-slot:hero -->`);
    const imageWorkbenchState = {
      ...createInitialSessionImageWorkbenchState(),
      tasks: [
        createTask({
          id: "task-cache",
          prompt: "缓存任务",
        }),
      ],
    };

    expect(
      shouldProbeWorkspaceImageTaskCatalog({
        canvasState: documentCanvas,
      }),
    ).toBe(true);
    expect(
      shouldProbeWorkspaceImageTaskCatalog({
        documentMarkdowns: [
          "![首图](pending-image-task://task-1?status=running)\n<!-- lime:image-task-slot:hero -->",
        ],
      }),
    ).toBe(true);
    expect(
      shouldProbeWorkspaceImageTaskCatalog({
        imageWorkbenchState,
      }),
    ).toBe(true);
    expect(
      shouldProbeWorkspaceImageTaskCatalog({
        messages: [
          createMessage({
            role: "user",
            id: "user-image-command",
            content: "@配图 生成 春日咖啡馆插画",
          }),
          createMessage({
            role: "assistant",
            id: "assistant-process",
            content: "正在准备图片任务",
            contentParts: [
              {
                type: "thinking",
                text: "准备中",
              },
            ],
          }),
        ],
      }),
    ).toBe(true);
    expect(
      shouldProbeWorkspaceImageTaskCatalog({
        imageWorkbenchState: {
          ...createInitialSessionImageWorkbenchState(),
          tasks: [
            createTask({
              id: "draft-image-local",
              prompt: "草稿",
            }),
          ],
        },
      }),
    ).toBe(false);
  });

  it("应在 deferred auxiliary loads 下只为可恢复图片任务启用 runtime", () => {
    expect(
      shouldEnableWorkspaceImageTaskPreviewRuntime({
        shouldDeferWorkspaceAuxiliaryLoads: false,
      }),
    ).toBe(true);
    expect(
      shouldEnableWorkspaceImageTaskPreviewRuntime({
        shouldDeferWorkspaceAuxiliaryLoads: true,
        restoreFromWorkspace: false,
      }),
    ).toBe(false);
    expect(
      shouldEnableWorkspaceImageTaskPreviewRuntime({
        shouldDeferWorkspaceAuxiliaryLoads: true,
        messages: [
          createMessage({
            role: "assistant",
            imageWorkbenchPreview: {
              taskId: "task-1",
              prompt: "已有预览",
              status: "running",
            },
          }),
        ],
      }),
    ).toBe(true);
    expect(
      shouldEnableWorkspaceImageTaskPreviewRuntime({
        shouldDeferWorkspaceAuxiliaryLoads: true,
        restoreFromWorkspace: true,
        canvasState: createInitialDocumentState(
          "![首图](pending-image-task://task-1?status=running)\n<!-- lime:image-task-slot:hero -->",
        ),
      }),
    ).toBe(true);
    expect(
      shouldEnableWorkspaceImageTaskPreviewRuntime({
        shouldDeferWorkspaceAuxiliaryLoads: true,
        restoreFromWorkspace: true,
        documentMarkdowns: [
          "![首图](pending-image-task://task-1?status=running)\n<!-- lime:image-task-slot:hero -->",
        ],
      }),
    ).toBe(true);
  });

  it("应合并 message thinking 内容并避免重复追加", () => {
    const repeatedThinking = "构图将聚焦于阳光穿透绿树洒在高楼间的自然光影。";

    expect(
      mergeMessageThinkingContent({
        existingMessage: createMessage({
          role: "assistant",
          thinkingContent: "第一步",
        }),
        nextMessage: createMessage({
          role: "assistant",
          contentParts: [
            {
              type: "thinking",
              text: "第一步\n第二步",
            },
          ],
        }),
      }),
    ).toBe("第一步\n第二步");

    expect(
      mergeMessageThinkingContent({
        existingMessage: createMessage({
          role: "assistant",
          thinkingContent: "第一步",
        }),
        nextMessage: createMessage({
          role: "assistant",
          thinkingContent: "第三步",
        }),
      }),
    ).toBe("第一步\n\n第三步");

    expect(
      mergeMessageThinkingContent({
        existingMessage: createMessage({ role: "assistant" }),
        nextMessage: createMessage({
          role: "assistant",
          contentParts: [
            {
              type: "thinking",
              text: repeatedThinking,
            },
            {
              type: "thinking",
              text: repeatedThinking,
            },
            {
              type: "thinking",
              text: repeatedThinking,
            },
          ],
        }),
      }),
    ).toBe(repeatedThinking);
  });
});
