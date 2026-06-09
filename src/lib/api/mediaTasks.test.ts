import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CreateAudioGenerationTaskArtifactRequest,
  type CreateImageGenerationTaskArtifactRequest,
  type ListMediaTaskArtifactsRequest,
  type MediaTaskLookupRequest,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
  cancelMediaTaskArtifact,
  completeAudioGenerationTaskArtifact,
  createAudioGenerationTaskArtifact,
  createImageGenerationTaskArtifact,
  getMediaTaskArtifact,
  listMediaTaskArtifacts,
} from "./mediaTasks";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE:
    "mediaTaskArtifact/image/create",
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE:
    "mediaTaskArtifact/audio/create",
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE:
    "mediaTaskArtifact/audio/complete",
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET: "mediaTaskArtifact/get",
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST: "mediaTaskArtifact/list",
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL: "mediaTaskArtifact/cancel",
  createAppServerClient: vi.fn(() => ({
    createImageMediaTaskArtifact: appServerRequestMock,
    createAudioMediaTaskArtifact: appServerRequestMock,
    completeAudioMediaTaskArtifact: appServerRequestMock,
    getMediaTaskArtifact: appServerRequestMock,
    listMediaTaskArtifacts: appServerRequestMock,
    cancelMediaTaskArtifact: appServerRequestMock,
  })),
}));

function buildTaskResult(overrides: Record<string, unknown> = {}) {
  const taskId =
    typeof overrides.task_id === "string" ? overrides.task_id : "task-image-1";
  const taskType =
    typeof overrides.task_type === "string"
      ? overrides.task_type
      : "image_generate";
  const taskFamily =
    typeof overrides.task_family === "string" ? overrides.task_family : "image";
  const normalizedStatus =
    typeof overrides.normalized_status === "string"
      ? overrides.normalized_status
      : "pending";

  return {
    success: true,
    task_id: taskId,
    task_type: taskType,
    task_family: taskFamily,
    status:
      typeof overrides.status === "string"
        ? overrides.status
        : "pending_submit",
    normalized_status: normalizedStatus,
    path: `.lime/tasks/${taskType}/${taskId}.json`,
    absolute_path: `/workspace/.lime/tasks/${taskType}/${taskId}.json`,
    artifact_path: `.lime/tasks/${taskType}/${taskId}.json`,
    absolute_artifact_path: `/workspace/.lime/tasks/${taskType}/${taskId}.json`,
    reused_existing: false,
    record: {
      task_id: taskId,
      task_type: taskType,
      task_family: taskFamily,
      payload: {
        prompt: "未来感青柠实验室",
      },
      status:
        typeof overrides.status === "string"
          ? overrides.status
          : "pending_submit",
      normalized_status: normalizedStatus,
      created_at: "2026-04-04T12:00:00Z",
    },
    ...overrides,
  };
}

describe("mediaTasks API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("应通过 App Server current 创建图片任务 artifact", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: buildTaskResult(),
    });
    const request = {
      projectRootPath: "/workspace",
      prompt: "未来感青柠实验室",
      titleGenerationResult: {
        title: "未来感青柠实验室",
        sessionId: "session-title-1",
        usedFallback: false,
      },
      mode: "generate",
      count: 1,
    } satisfies CreateImageGenerationTaskArtifactRequest;

    await expect(createImageGenerationTaskArtifact(request)).resolves.toEqual(
      expect.objectContaining({
        task_id: "task-image-1",
        task_type: "image_generate",
      }),
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE).toBe(
      "mediaTaskArtifact/image/create",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(request);
  });

  it("应通过 App Server current 创建音频任务 artifact", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: buildTaskResult({
        task_id: "task-audio-1",
        task_type: "audio_generate",
        task_family: "audio",
      }),
    });
    const request = {
      projectRootPath: "/workspace",
      sourceText: "请生成温暖旁白",
      voice: "warm_narrator",
      entrySource: "at_voice_command",
      modalityContractKey: "voice_generation",
      modality: "audio",
      requiredCapabilities: ["text_generation", "voice_generation"],
      routingSlot: "voice_generation_model",
    } satisfies CreateAudioGenerationTaskArtifactRequest;

    await expect(createAudioGenerationTaskArtifact(request)).resolves.toEqual(
      expect.objectContaining({
        task_id: "task-audio-1",
        task_type: "audio_generate",
      }),
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE).toBe(
      "mediaTaskArtifact/audio/create",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(request);
  });

  it("应通过 App Server current 完成音频任务并回写 audio_output", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: buildTaskResult({
        task_id: "task-audio-2",
        task_type: "audio_generate",
        task_family: "audio",
        status: "succeeded",
        normalized_status: "succeeded",
      }),
    });
    const request = {
      projectRootPath: "/workspace",
      taskRef: "task-audio-2",
      audioPath: ".lime/runtime/audio/task-audio-2.mp3",
      mimeType: "audio/mpeg",
      durationMs: 2400,
      providerId: "limecore",
      model: "voice-pro",
    };

    await expect(completeAudioGenerationTaskArtifact(request)).resolves.toEqual(
      expect.objectContaining({
        task_id: "task-audio-2",
        normalized_status: "succeeded",
      }),
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE).toBe(
      "mediaTaskArtifact/audio/complete",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(request);
  });

  it("应通过 App Server current 读取、列出和取消媒体任务 artifact", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({
        result: buildTaskResult({ task_id: "task-image-2" }),
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          workspace_root: "/workspace",
          artifact_root: "/workspace/.lime/tasks",
          filters: {
            status: "pending",
            task_family: "image",
            task_type: "image_generate",
            modality_contract_key: "image_generation",
            routing_outcome: "accepted",
            limit: 10,
          },
          total: 1,
          modality_runtime_contracts: {
            snapshot_count: 1,
            entry_keys: ["at_image_command"],
            thread_ids: ["thread-image-2"],
            turn_ids: ["turn-image-2"],
            content_ids: ["content-image-2"],
            modalities: ["image"],
            skill_ids: ["image_generate"],
            model_ids: ["gpt-image-1"],
            cost_states: ["estimated"],
            limit_states: ["within_limit"],
            estimated_cost_classes: ["low"],
            limit_event_kinds: ["quota_low"],
            quota_low_count: 1,
            executor_kinds: ["skill"],
            executor_binding_keys: ["image_generate"],
            limecore_policy_refs: [
              "model_catalog",
              "provider_offer",
              "tenant_feature_flags",
            ],
            limecore_policy_evaluation_statuses: [
              { status: "input_gap", count: 1 },
            ],
            limecore_policy_evaluation_pending_refs: [
              "model_catalog",
              "provider_offer",
              "tenant_feature_flags",
            ],
          },
          tasks: [buildTaskResult({ task_id: "task-image-2" })],
        },
      })
      .mockResolvedValueOnce({
        result: buildTaskResult({
          task_id: "task-image-2",
          status: "cancelled",
          normalized_status: "cancelled",
          record: {
            task_id: "task-image-2",
            task_type: "image_generate",
            task_family: "image",
            payload: {
              prompt: "读取任务",
            },
            status: "cancelled",
            normalized_status: "cancelled",
            created_at: "2026-04-04T12:10:00Z",
          },
        }),
      });

    const lookupRequest = {
      projectRootPath: "/workspace",
      taskRef: "task-image-2",
    } satisfies MediaTaskLookupRequest;
    const listRequest = {
      projectRootPath: "/workspace",
      status: "pending",
      taskFamily: "image",
      taskType: "image_generate",
      modalityContractKey: "image_generation",
      routingOutcome: "accepted",
      limit: 10,
    } satisfies ListMediaTaskArtifactsRequest;

    await expect(getMediaTaskArtifact(lookupRequest)).resolves.toEqual(
      expect.objectContaining({ task_id: "task-image-2" }),
    );

    await expect(listMediaTaskArtifacts(listRequest)).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        modality_runtime_contracts: expect.objectContaining({
          snapshot_count: 1,
          entry_keys: ["at_image_command"],
          thread_ids: ["thread-image-2"],
          turn_ids: ["turn-image-2"],
          content_ids: ["content-image-2"],
          modalities: ["image"],
          skill_ids: ["image_generate"],
          model_ids: ["gpt-image-1"],
          cost_states: ["estimated"],
          limit_states: ["within_limit"],
          estimated_cost_classes: ["low"],
          limit_event_kinds: ["quota_low"],
          quota_low_count: 1,
          executor_kinds: ["skill"],
          executor_binding_keys: ["image_generate"],
          limecore_policy_refs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
          limecore_policy_evaluation_statuses: [
            { status: "input_gap", count: 1 },
          ],
          limecore_policy_evaluation_pending_refs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
        }),
      }),
    );

    await expect(cancelMediaTaskArtifact(lookupRequest)).resolves.toEqual(
      expect.objectContaining({ normalized_status: "cancelled" }),
    );

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      lookupRequest,
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      listRequest,
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      lookupRequest,
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET).toBe(
      "mediaTaskArtifact/get",
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST).toBe(
      "mediaTaskArtifact/list",
    );
    expect(APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_CANCEL).toBe(
      "mediaTaskArtifact/cancel",
    );
  });

  it("后端报错时应向上传递异常", async () => {
    appServerRequestMock.mockRejectedValueOnce(new Error("app server down"));

    await expect(
      getMediaTaskArtifact({
        projectRootPath: "/workspace",
        taskRef: "task-image-1",
      }),
    ).rejects.toThrow("app server down");

    expect(appServerRequestMock).toHaveBeenCalledWith({
      projectRootPath: "/workspace",
      taskRef: "task-image-1",
    });
  });
});
