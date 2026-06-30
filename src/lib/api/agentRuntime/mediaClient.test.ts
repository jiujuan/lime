import { describe, expect, it, vi } from "vitest";
import { createMediaClient } from "./mediaClient";

describe("agentRuntime mediaClient", () => {
  it("media task artifact commands 应 fail closed，不再调用 legacy bridge", async () => {
    const bridgeInvoke = vi.fn();
    const client = createMediaClient({ bridgeInvoke });

    await expect(
      client.createImageGenerationTaskArtifact({
        projectRootPath: "/workspace",
        prompt: "未来感青柠实验室",
        mode: "generate",
      }),
    ).rejects.toThrow(
      "create_image_generation_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.createAudioGenerationTaskArtifact({
        projectRootPath: "/workspace",
        sourceText: "请生成温暖旁白",
      }),
    ).rejects.toThrow(
      "create_audio_generation_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.completeAudioGenerationTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-audio-1",
        audioPath: "/workspace/audio.mp3",
      }),
    ).rejects.toThrow(
      "complete_audio_generation_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.completeImageGenerationTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
        images: [{ url: "file:///workspace/image.png" }],
      }),
    ).rejects.toThrow(
      "complete_image_generation_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.getMediaTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
      }),
    ).rejects.toThrow(
      "get_media_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.listMediaTaskArtifacts({
        projectRootPath: "/workspace",
        taskFamily: "image",
        limit: 20,
      }),
    ).rejects.toThrow(
      "list_media_task_artifacts is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );
    await expect(
      client.cancelMediaTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
      }),
    ).rejects.toThrow(
      "cancel_media_task_artifact is retired; use src/lib/api/mediaTasks.ts App Server current methods",
    );

    expect(bridgeInvoke).not.toHaveBeenCalled();
  });
});
