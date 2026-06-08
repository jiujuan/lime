import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { videoGenerationApi } from "./videoGeneration";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("videoGeneration API diagnostic fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("创建视频任务收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "create_video_generation_task",
        source: "electron-host",
      },
    });

    await expect(
      videoGenerationApi.createTask({
        projectId: "project-1",
        providerId: "doubao",
        model: "seedance-1-5-pro",
        prompt: "城市夜景",
      }),
    ).rejects.toThrow(
      "create_video_generation_task 尚未接入真实视频生成 current 通道",
    );
  });

  it("列表视频任务收到数组级 diagnostic facade 时应 fail closed", async () => {
    const diagnosticList = [] as unknown[] & {
      __diagnostic?: Record<string, unknown>;
    };
    diagnosticList.__diagnostic = {
      command: "list_video_generation_tasks",
      source: "electron-host",
    };
    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(
      videoGenerationApi.listTasks("project-1"),
    ).rejects.toThrow(
      "list_video_generation_tasks 尚未接入真实视频生成 current 通道",
    );
  });

  it("查询和取消视频任务收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          command: "get_video_generation_task",
          source: "electron-host",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          command: "cancel_video_generation_task",
          source: "electron-host",
        },
      });

    await expect(videoGenerationApi.getTask("task-1")).rejects.toThrow(
      "get_video_generation_task 尚未接入真实视频生成 current 通道",
    );
    await expect(videoGenerationApi.cancelTask("task-1")).rejects.toThrow(
      "cancel_video_generation_task 尚未接入真实视频生成 current 通道",
    );
  });

  it("查询和取消视频任务允许真实 null 结果", async () => {
    vi.mocked(safeInvoke).mockResolvedValue(null);

    await expect(videoGenerationApi.getTask("missing-task")).resolves.toBeNull();
    await expect(
      videoGenerationApi.cancelTask("missing-task"),
    ).resolves.toBeNull();
  });

  it("创建视频任务收到非任务形状时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      videoGenerationApi.createTask({
        projectId: "project-1",
        providerId: "doubao",
        model: "seedance-1-5-pro",
        prompt: "城市夜景",
      }),
    ).rejects.toThrow(
      "create_video_generation_task did not return video generation task",
    );
  });

  it("列表视频任务收到错误元素形状时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        id: "task-1",
        status: "processing",
      },
    ]);

    await expect(videoGenerationApi.listTasks("project-1")).rejects.toThrow(
      "list_video_generation_tasks did not return video generation task list",
    );
  });

  it("查询和取消视频任务收到错误对象时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      })
      .mockResolvedValueOnce({
        id: "task-2",
        projectId: "project-1",
        providerId: "doubao",
        model: "seedance-1-5-pro",
        prompt: "城市夜景",
        status: "cancelled",
        createdAt: 1,
      });

    await expect(videoGenerationApi.getTask("task-1")).rejects.toThrow(
      "get_video_generation_task did not return video generation task",
    );
    await expect(videoGenerationApi.cancelTask("task-2")).rejects.toThrow(
      "cancel_video_generation_task did not return video generation task",
    );
  });
});
