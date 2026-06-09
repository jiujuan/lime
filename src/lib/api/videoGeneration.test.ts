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

  it("创建视频生成任务默认 fail closed，不能回到旧 native 命令", async () => {
    const request = {
      projectId: "project-1",
      providerId: "doubao",
      model: "seedance-1-5-pro",
      prompt: "城市夜景",
      aspectRatio: "16:9",
      duration: 5,
    };

    await expect(videoGenerationApi.createTask(request)).rejects.toThrow(
      "create_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("查询、列表和取消视频任务默认 fail closed，不能回到旧 native 命令", async () => {
    await expect(
      videoGenerationApi.getTask("task-2", { refreshStatus: false }),
    ).rejects.toThrow(
      "get_video_generation_task is retired until video generation tasks move to App Server current methods",
    );
    await expect(
      videoGenerationApi.listTasks("project-1", { limit: 12 }),
    ).rejects.toThrow(
      "list_video_generation_tasks is retired until video generation tasks move to App Server current methods",
    );
    await expect(videoGenerationApi.cancelTask("task-2")).rejects.toThrow(
      "cancel_video_generation_task is retired until video generation tasks move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
