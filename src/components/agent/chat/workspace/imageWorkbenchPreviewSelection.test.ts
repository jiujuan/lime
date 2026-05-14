import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { resolveImageWorkbenchStateForPreviewSelection } from "./imageWorkbenchPreviewSelection";

describe("resolveImageWorkbenchStateForPreviewSelection", () => {
  it("点击同一消息里的后续图片时应按图片 URL 选中对应输出", () => {
    const message: Message = {
      id: "msg-image-preview",
      role: "assistant",
      content: "已生成章节配图。",
      timestamp: new Date("2026-05-14T00:00:00.000Z"),
      imageWorkbenchPreview: {
        taskId: "task-chapters",
        prompt: "章节配图",
        status: "complete",
        imageUrl: "https://example.com/chapter-1.png",
        previewImages: [
          "https://example.com/chapter-1.png",
          "https://example.com/chapter-2.png",
          "https://example.com/chapter-3.png",
        ],
      },
    };

    const nextState = resolveImageWorkbenchStateForPreviewSelection({
      current: createInitialSessionImageWorkbenchState(),
      messages: [message],
      preview: message.imageWorkbenchPreview!,
      selection: {
        imageUrl: "https://example.com/chapter-2.png",
        imageIndex: 1,
      },
    });

    expect(nextState.active).toBe(true);
    expect(nextState.selectedTaskId).toBe("task-chapters");
    expect(
      nextState.outputs.find((output) => output.id === nextState.selectedOutputId)
        ?.url,
    ).toBe("https://example.com/chapter-2.png");
  });

  it("选中无输出失败任务时应保留任务焦点且不回退到旧成功图", () => {
    const current = createInitialSessionImageWorkbenchState();
    current.tasks = [
      {
        sessionId: "task-success",
        id: "task-success",
        mode: "generate",
        status: "complete",
        prompt: "第一张图",
        rawText: "第一张图",
        expectedCount: 1,
        outputIds: ["task-success:output:1"],
        createdAt: 1,
        hookImageIds: ["task-success:hook:1"],
        applyTarget: null,
      },
    ];
    current.outputs = [
      {
        id: "task-success:output:1",
        hookImageId: "task-success:hook:1",
        refId: "img-success",
        taskId: "task-success",
        url: "https://example.com/first.png",
        prompt: "第一张图",
        createdAt: 1,
        applyTarget: null,
      },
    ];
    current.selectedTaskId = "task-success";
    current.selectedOutputId = "task-success:output:1";

    const failedMessage: Message = {
      id: "msg-failed-preview",
      role: "assistant",
      content: "这次没有生成成功",
      timestamp: new Date("2026-05-14T00:01:00.000Z"),
      imageWorkbenchPreview: {
        taskId: "task-failed",
        prompt: "第二张图",
        status: "failed",
      },
    };

    const nextState = resolveImageWorkbenchStateForPreviewSelection({
      current,
      messages: [failedMessage],
      preview: failedMessage.imageWorkbenchPreview!,
    });

    expect(nextState.active).toBe(true);
    expect(nextState.selectedTaskId).toBe("task-failed");
    expect(nextState.selectedOutputId).toBeNull();
  });

  it("消息轻卡已失败但当前状态仍是运行中时，应以消息状态打开查看器", () => {
    const current = createInitialSessionImageWorkbenchState();
    current.tasks = [
      {
        sessionId: "task-running",
        id: "task-running",
        mode: "generate",
        status: "running",
        prompt: "运行中草稿图",
        rawText: "运行中草稿图",
        expectedCount: 1,
        outputIds: [],
        createdAt: 1,
        hookImageIds: [],
        applyTarget: null,
      },
    ];

    const failedMessage: Message = {
      id: "msg-running-now-failed",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-05-14T00:02:00.000Z"),
      imageWorkbenchPreview: {
        taskId: "task-running",
        prompt: "运行中草稿图",
        status: "failed",
      },
    };

    const nextState = resolveImageWorkbenchStateForPreviewSelection({
      current,
      messages: [failedMessage],
      preview: failedMessage.imageWorkbenchPreview!,
    });

    expect(nextState.selectedTaskId).toBe("task-running");
    expect(nextState.tasks.find((task) => task.id === "task-running")?.status).toBe(
      "error",
    );
    expect(nextState.selectedOutputId).toBeNull();
  });
});
