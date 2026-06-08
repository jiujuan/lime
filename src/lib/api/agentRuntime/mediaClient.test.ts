import { describe, expect, it, vi } from "vitest";
import { createMediaClient } from "./mediaClient";
import type {
  ListMediaTaskArtifactsOutput,
  MediaTaskArtifactOutput,
} from "./types";

const artifactOutput: MediaTaskArtifactOutput = {
  success: true,
  task_id: "task-image-1",
  task_type: "image_generate",
  task_family: "image",
  status: "pending_submit",
  normalized_status: "pending",
  path: ".lime/tasks/image_generate/task-image-1.json",
  absolute_path: "/workspace/.lime/tasks/image_generate/task-image-1.json",
  artifact_path: ".lime/tasks/image_generate/task-image-1.json",
  absolute_artifact_path:
    "/workspace/.lime/tasks/image_generate/task-image-1.json",
  reused_existing: false,
  record: {
    task_id: "task-image-1",
    task_type: "image_generate",
    task_family: "image",
    payload: {
      prompt: "未来感青柠实验室",
    },
    status: "pending_submit",
    normalized_status: "pending",
    created_at: "2026-04-04T12:00:00Z",
  },
};

const listOutput: ListMediaTaskArtifactsOutput = {
  success: true,
  workspace_root: "/workspace",
  artifact_root: "/workspace/.lime/tasks",
  filters: {
    status: null,
    task_family: "image",
    task_type: null,
    modality_contract_key: null,
    routing_outcome: null,
    limit: 20,
  },
  total: 1,
  modality_runtime_contracts: {
    snapshot_count: 1,
    contract_keys: ["image_generation"],
    execution_profile_keys: ["default"],
    executor_adapter_keys: ["image-runtime"],
    limecore_policy_refs: [],
    limecore_policy_snapshot_count: 0,
    limecore_policy_snapshot_statuses: [],
    limecore_policy_decisions: [],
    blocked_count: 0,
    routing_outcomes: [{ outcome: "accepted", count: 1 }],
    model_registry_assessment_count: 0,
    audio_output_count: 0,
    audio_output_statuses: [],
    audio_output_error_codes: [],
    transcript_count: 0,
    transcript_statuses: [],
    transcript_error_codes: [],
    snapshots: [
      {
        task_id: "task-image-1",
        task_type: "image_generate",
        normalized_status: "pending",
        limecore_policy_refs: [],
        routing_event: "accepted",
        routing_outcome: "accepted",
      },
    ],
  },
  tasks: [artifactOutput],
};

describe("agentRuntime mediaClient", () => {
  it("应通过 bridge 创建图片任务 artifact 并校验返回形态", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce(artifactOutput);
    const client = createMediaClient({ bridgeInvoke });

    await expect(
      client.createImageGenerationTaskArtifact({
        projectRootPath: "/workspace",
        prompt: "未来感青柠实验室",
        mode: "generate",
      }),
    ).resolves.toEqual(artifactOutput);

    expect(bridgeInvoke).toHaveBeenCalledWith(
      "create_image_generation_task_artifact",
      {
        request: {
          projectRootPath: "/workspace",
          prompt: "未来感青柠实验室",
          mode: "generate",
        },
      },
    );
  });

  it("应通过 bridge 列出媒体任务 artifacts 并校验列表形态", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce(listOutput);
    const client = createMediaClient({ bridgeInvoke });

    await expect(
      client.listMediaTaskArtifacts({
        projectRootPath: "/workspace",
        taskFamily: "image",
        limit: 20,
      }),
    ).resolves.toEqual(listOutput);

    expect(bridgeInvoke).toHaveBeenCalledWith("list_media_task_artifacts", {
      request: {
        projectRootPath: "/workspace",
        taskFamily: "image",
        limit: 20,
      },
    });
  });

  it("create / complete / get / cancel 收到错误 artifact 形状时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ ...artifactOutput, record: { task_id: "task-1" } })
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      })
      .mockResolvedValueOnce({
        ...artifactOutput,
        absolute_artifact_path: undefined,
      });
    const client = createMediaClient({ bridgeInvoke });

    await expect(
      client.createAudioGenerationTaskArtifact({
        projectRootPath: "/workspace",
        sourceText: "请生成温暖旁白",
      }),
    ).rejects.toThrow(
      "create_audio_generation_task_artifact did not return media task artifact output",
    );
    await expect(
      client.completeAudioGenerationTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-audio-1",
        audioPath: "/workspace/audio.mp3",
      }),
    ).rejects.toThrow(
      "complete_audio_generation_task_artifact did not return media task artifact output",
    );
    await expect(
      client.getMediaTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
      }),
    ).rejects.toThrow(
      "get_media_task_artifact did not return media task artifact output",
    );
    await expect(
      client.cancelMediaTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
      }),
    ).rejects.toThrow(
      "cancel_media_task_artifact did not return media task artifact output",
    );
  });

  it("list 收到错误列表形状时应 fail closed", async () => {
    const bridgeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ ...listOutput, tasks: [{ success: true }] })
      .mockResolvedValueOnce({
        ...listOutput,
        modality_runtime_contracts: {
          ...listOutput.modality_runtime_contracts,
          snapshots: [{ task_id: "task-image-1" }],
        },
      });
    const client = createMediaClient({ bridgeInvoke });

    await expect(
      client.listMediaTaskArtifacts({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "list_media_task_artifacts did not return media task artifacts list output",
    );
    await expect(
      client.listMediaTaskArtifacts({ projectRootPath: "/workspace" }),
    ).rejects.toThrow(
      "list_media_task_artifacts did not return media task artifacts list output",
    );
  });
});
