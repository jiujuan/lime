import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { videoGenerationApi } from "./videoGeneration";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("videoGeneration API retired fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("创建视频任务应在调用旧 native 命令前 fail closed", async () => {
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
      "create_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("列表视频任务应在调用旧 native 命令前 fail closed", async () => {
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
      "list_video_generation_tasks is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("查询和取消视频任务应在调用旧 native 命令前 fail closed", async () => {
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
      "get_video_generation_task is retired until video generation tasks move to App Server current methods",
    );
    await expect(videoGenerationApi.cancelTask("task-1")).rejects.toThrow(
      "cancel_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("创建视频任务不接受旧 native 假成功返回", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({ success: true });

    await expect(
      videoGenerationApi.createTask({
        projectId: "project-1",
        providerId: "doubao",
        model: "seedance-1-5-pro",
        prompt: "城市夜景",
      }),
    ).rejects.toThrow(
      "create_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("列表视频任务不接受旧 native 错误元素返回", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        id: "task-1",
        status: "processing",
      },
    ]);

    await expect(videoGenerationApi.listTasks("project-1")).rejects.toThrow(
      "list_video_generation_tasks is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("查询和取消视频任务不接受旧 native 错误对象返回", async () => {
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
      "get_video_generation_task is retired until video generation tasks move to App Server current methods",
    );
    await expect(videoGenerationApi.cancelTask("task-2")).rejects.toThrow(
      "cancel_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
