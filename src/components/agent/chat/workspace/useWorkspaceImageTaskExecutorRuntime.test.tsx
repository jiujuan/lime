import React, { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaTaskArtifactOutput } from "@/lib/api/agentRuntime/mediaTaskTypes";
import {
  createInitialSessionImageWorkbenchState,
  type SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import { useWorkspaceImageTaskExecutorRuntime } from "./useWorkspaceImageTaskExecutorRuntime";

function createArtifactOutput(
  payload: Record<string, unknown>,
): MediaTaskArtifactOutput {
  return {
    success: true,
    task_id: "task-image-1",
    task_type: "image_generate",
    task_family: "image",
    status: "pending_submit",
    normalized_status: "pending",
    path: ".lime/tasks/image_generate/task-image-1.json",
    absolute_path:
      "/workspace/project-1/.lime/tasks/image_generate/task-image-1.json",
    artifact_path: ".lime/tasks/image_generate/task-image-1.json",
    absolute_artifact_path:
      "/workspace/project-1/.lime/tasks/image_generate/task-image-1.json",
    reused_existing: false,
    record: {
      task_id: "task-image-1",
      task_type: "image_generate",
      task_family: "image",
      payload,
      status: "pending_submit",
      normalized_status: "pending",
      created_at: "2026-07-01T03:00:00Z",
    },
  };
}

function createImageWorkbenchState(): SessionImageWorkbenchState {
  return {
    ...createInitialSessionImageWorkbenchState(),
    tasks: [
      {
        id: "task-image-1",
        sessionId: "task-image-1",
        mode: "generate",
        status: "queued",
        prompt: "生成青柠科技主视觉",
        rawText: "@配图 生成青柠科技主视觉",
        expectedCount: 2,
        outputIds: [],
        hookImageIds: [],
        createdAt: Date.now(),
        applyTarget: null,
        taskFilePath:
          "/workspace/project-1/.lime/tasks/image_generate/task-image-1.json",
        artifactPath: ".lime/tasks/image_generate/task-image-1.json",
      },
    ],
  };
}

function renderHook(props: {
  currentImageWorkbenchState?: SessionImageWorkbenchState;
  getImageTask?: ReturnType<typeof vi.fn>;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultGetImageTask = vi.fn().mockResolvedValue(
    createArtifactOutput({
      prompt: "生成青柠科技主视觉",
      provider_id: "fal",
      model: "fal-ai/nano-banana-pro",
      executor_mode: "images_api",
      count: 2,
      size: "1024x1024",
      reference_images: ["https://example.com/ref.png"],
    }),
  );

  function Probe() {
    const [state] = useState(
      props.currentImageWorkbenchState || createImageWorkbenchState(),
    );
    useWorkspaceImageTaskExecutorRuntime({
      enabled: true,
      projectRootPath: "/workspace/project-1",
      currentImageWorkbenchState: state,
      getImageTask: props.getImageTask || defaultGetImageTask,
    });
    return null;
  }

  return {
    getImageTask: props.getImageTask || defaultGetImageTask,
    render: async () => {
      await act(async () => {
        root.render(<Probe />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useWorkspaceImageTaskExecutorRuntime", () => {
  it("应观察 pending 图片任务并读取后端 task artifact", async () => {
    const harness = renderHook({});

    await harness.render();

    expect(harness.getImageTask).toHaveBeenCalledWith({
      projectRootPath: "/workspace/project-1",
      taskRef:
        "/workspace/project-1/.lime/tasks/image_generate/task-image-1.json",
    });
    harness.cleanup();
  });

  it("同一图片任务重复渲染时只观察一次", async () => {
    const harness = renderHook({});

    await harness.render();
    await harness.render();

    expect(harness.getImageTask).toHaveBeenCalledTimes(1);
    harness.cleanup();
  });
});
