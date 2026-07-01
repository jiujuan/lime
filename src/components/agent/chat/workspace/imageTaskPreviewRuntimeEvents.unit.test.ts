import { describe, expect, it } from "vitest";
import {
  buildPendingImageTaskRecordFromEvent,
  buildPendingImageTaskSnapshotFromEvent,
  type CreationTaskSubmittedPayload,
} from "./imageTaskPreviewRuntimeEvents";

function createPayload(
  overrides: Partial<CreationTaskSubmittedPayload> = {},
): CreationTaskSubmittedPayload {
  return {
    status: "pending_submit",
    prompt: "春日咖啡馆插画",
    size: "1024x1024",
    mode: "generate",
    raw_text: "@配图 春日咖啡馆插画",
    provider_id: "openai",
    model: "gpt-image-2",
    count: 2,
    session_id: "session-1",
    thread_id: "turn-1",
    turn_id: "turn-1",
    project_id: "project-1",
    content_id: "content-1",
    entry_source: "article-image-slot",
    requested_target: "generate",
    ...overrides,
  };
}

describe("imageTaskPreviewRuntimeEvents", () => {
  it("应从 creation task event 构造 pending preview snapshot", () => {
    const snapshot = buildPendingImageTaskSnapshotFromEvent({
      taskId: "task-1",
      taskType: "image_generate",
      taskFamily: "image",
      payload: createPayload({
        status: "succeeded",
        slot_id: "hero",
        anchor_section_title: "开头",
        anchor_text: "第一段",
      }),
      projectId: "fallback-project",
      contentId: "fallback-content",
      absolutePath: "/workspace/.lime/tasks/image/task-1.json",
      artifactPath: ".lime/artifacts/image/task-1.json",
      canvasState: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.task).toMatchObject({
      id: "task-1",
      status: "complete",
      expectedCount: 2,
      taskFilePath: "/workspace/.lime/tasks/image/task-1.json",
      artifactPath: ".lime/artifacts/image/task-1.json",
    });
    expect(snapshot?.message.imageWorkbenchPreview).toMatchObject({
      taskId: "task-1",
      status: "complete",
      prompt: "春日咖啡馆插画",
      projectId: "project-1",
      contentId: "content-1",
      expectedImageCount: 2,
      phase: "succeeded",
    });
  });

  it("非 image family 不应构造 pending snapshot", () => {
    expect(
      buildPendingImageTaskSnapshotFromEvent({
        taskId: "task-1",
        taskType: "video_generate",
        taskFamily: "video",
        payload: createPayload(),
        canvasState: null,
      }),
    ).toBeNull();
  });

  it("应为 document-inline slot 构造可同步占位状态的 task record", () => {
    const record = buildPendingImageTaskRecordFromEvent({
      taskId: "task-1",
      taskType: "image_generate",
      payload: createPayload({
        status: "cancelled",
        slot_id: "hero",
        anchor_hint: "section_end",
        anchor_section_title: "开头",
        anchor_text: "第一段",
      }),
    });

    expect(record).toMatchObject({
      task_id: "task-1",
      task_type: "image_generate",
      status: "cancelled",
      normalized_status: "cancelled",
      relationships: {
        slot_id: "hero",
      },
      payload: {
        prompt: "春日咖啡馆插画",
        slot_id: "hero",
        anchor_hint: "section_end",
        anchor_section_title: "开头",
        anchor_text: "第一段",
        usage: "document-inline",
      },
    });
  });
});
