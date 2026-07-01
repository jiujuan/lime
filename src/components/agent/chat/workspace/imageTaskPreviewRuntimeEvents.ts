import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import {
  buildPendingImageTaskSnapshot,
  normalizeTaskStatus,
  type ParsedImageTaskSnapshot,
} from "./imageTaskPreviewRuntimeSnapshot";

export interface CreationTaskSubmittedPayload {
  task_id?: string;
  task_type?: string;
  task_family?: string;
  status?: string;
  current_attempt_id?: string;
  path?: string;
  absolute_path?: string;
  prompt?: string;
  size?: string;
  mode?: string;
  layout_hint?: string;
  raw_text?: string;
  persona_context?: Record<string, unknown>;
  presentation?: Record<string, unknown>;
  taste_context?: Record<string, unknown>;
  provider?: string;
  provider_id?: string;
  model?: string;
  count?: number;
  reused_existing?: boolean;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
  project_id?: string;
  content_id?: string;
  entry_source?: string;
  requested_target?: string;
  slot_id?: string;
  anchor_hint?: string;
  anchor_section_title?: string;
  anchor_text?: string;
}

function resolveImageTaskEventProgressMessage(
  payload: CreationTaskSubmittedPayload,
): string {
  const normalizedEventStatus = normalizeTaskStatus(payload.status);
  if (payload.reused_existing) {
    return "正在生成图片。";
  }
  switch (normalizedEventStatus) {
    case "succeeded":
      return "图片生成完成。";
    case "partial":
      return "图片返回部分结果。";
    case "failed":
      return "图片生成失败。";
    case "cancelled":
      return "图片生成已取消。";
    default:
      return "正在生成图片。";
  }
}

function buildImageTaskEventPayload(
  payload: CreationTaskSubmittedPayload,
): Record<string, unknown> {
  return {
    prompt: payload.prompt,
    size: payload.size,
    mode: payload.mode,
    layout_hint: payload.layout_hint,
    raw_text: payload.raw_text,
    persona_context: payload.persona_context,
    presentation: payload.presentation,
    taste_context: payload.taste_context,
    provider: payload.provider,
    provider_id: payload.provider_id,
    model: payload.model,
    count: typeof payload.count === "number" ? payload.count : undefined,
    session_id: payload.session_id,
    thread_id: payload.thread_id,
    turn_id: payload.turn_id,
    project_id: payload.project_id,
    content_id: payload.content_id,
    entry_source: payload.entry_source,
    requested_target: payload.requested_target,
    slot_id: payload.slot_id,
    anchor_hint: payload.anchor_hint,
    anchor_section_title: payload.anchor_section_title,
    anchor_text: payload.anchor_text,
  };
}

export function buildPendingImageTaskSnapshotFromEvent(params: {
  taskId?: string;
  taskType?: string;
  taskFamily?: string;
  payload: CreationTaskSubmittedPayload;
  projectId?: string | null;
  contentId?: string | null;
  absolutePath?: string | null;
  artifactPath?: string | null;
  canvasState: CanvasStateUnion | null;
}): ParsedImageTaskSnapshot | null {
  if (!params.taskId || !params.taskType || params.taskFamily !== "image") {
    return null;
  }

  return buildPendingImageTaskSnapshot({
    taskId: params.taskId,
    taskType: params.taskType,
    status: params.payload.status,
    payload: buildImageTaskEventPayload(params.payload),
    progressMessage: resolveImageTaskEventProgressMessage(params.payload),
    projectId: params.payload.project_id || params.projectId,
    contentId: params.payload.content_id || params.contentId,
    taskFilePath: params.absolutePath,
    artifactPath: params.artifactPath,
    canvasState: params.canvasState,
  });
}

export function buildPendingImageTaskRecordFromEvent(params: {
  taskId: string;
  taskType: string;
  payload: CreationTaskSubmittedPayload;
}): Record<string, unknown> {
  return {
    task_id: params.taskId,
    task_type: params.taskType,
    status: params.payload.status || "pending_submit",
    normalized_status: normalizeTaskStatus(params.payload.status),
    relationships: params.payload.slot_id
      ? {
          slot_id: params.payload.slot_id,
        }
      : undefined,
    payload: {
      ...buildImageTaskEventPayload(params.payload),
      usage: params.payload.slot_id ? "document-inline" : undefined,
    },
  };
}
