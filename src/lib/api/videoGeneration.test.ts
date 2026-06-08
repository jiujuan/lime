import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { videoGenerationApi } from "./videoGeneration";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("videoGeneration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 native 命令创建视频生成任务", async () => {
    const request = {
      projectId: "project-1",
      providerId: "doubao",
      model: "seedance-1-5-pro",
      prompt: "城市夜景",
      aspectRatio: "16:9",
      duration: 5,
    };
    const task = {
      id: "task-1",
      projectId: "project-1",
      providerId: "doubao",
      model: "seedance-1-5-pro",
      prompt: "城市夜景",
      status: "processing" as const,
      createdAt: 1,
      updatedAt: 2,
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(task);

    await expect(videoGenerationApi.createTask(request)).resolves.toEqual(task);

    expect(safeInvoke).toHaveBeenCalledWith("create_video_generation_task", {
      request,
    });
  });

  it("应通过 native 命令查询、列表和取消视频任务", async () => {
    const task = {
      id: "task-2",
      projectId: "project-1",
      providerId: "doubao",
      model: "seedance-1-5-pro",
      prompt: "城市夜景",
      status: "success" as const,
      createdAt: 1,
      updatedAt: 2,
    };
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce([task])
      .mockResolvedValueOnce({ ...task, status: "cancelled" });

    await expect(
      videoGenerationApi.getTask("task-2", { refreshStatus: false }),
    ).resolves.toEqual(task);
    await expect(
      videoGenerationApi.listTasks("project-1", { limit: 12 }),
    ).resolves.toEqual([task]);
    await expect(videoGenerationApi.cancelTask("task-2")).resolves.toEqual(
      expect.objectContaining({ status: "cancelled" }),
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_video_generation_task", {
      request: {
        taskId: "task-2",
        refreshStatus: false,
      },
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "list_video_generation_tasks",
      {
        request: {
          projectId: "project-1",
          limit: 12,
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "cancel_video_generation_task",
      {
        request: {
          taskId: "task-2",
        },
      },
    );
  });
});
