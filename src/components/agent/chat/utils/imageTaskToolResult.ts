import { resolveImageTaskStatusMessage } from "./taskPreviewCopy";
import {
  asRecord,
  parseJsonRecordString,
  readMetadataString,
  resolveTaskPreviewStatus,
} from "./taskPreviewToolResultShared";
import { normalizeToolNameKey } from "./toolDisplayInfo";

const IMAGE_TASK_TOOL_NAME_KEYS = new Set([
  "limecreateimagegenerationtask",
  "limecreateimagegenerationtasktool",
  "mediataskartifactimagecreate",
  "mediataskartifactimagecreatetool",
]);

const IMAGE_TASK_NESTED_KEYS = [
  "metadata",
  "result",
  "response",
  "record",
  "payload",
  "output",
  "structuredContent",
  "structured_content",
  "data",
] as const;

export function isImageTaskCreationToolName(toolName?: string | null): boolean {
  if (!toolName) {
    return false;
  }
  return IMAGE_TASK_TOOL_NAME_KEYS.has(normalizeToolNameKey(toolName));
}

export function findImageTaskRecord(
  value: unknown,
  visited = new Set<unknown>(),
): Record<string, unknown> | null {
  if (typeof value === "string") {
    const parsed = parseJsonRecordString(value);
    return parsed ? findImageTaskRecord(parsed, visited) : null;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return null;
    }
    visited.add(value);
    for (const item of value) {
      const record = findImageTaskRecord(item, visited);
      if (record) {
        return record;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (!record || visited.has(record)) {
    return null;
  }
  visited.add(record);

  const taskId = readMetadataString([record], ["task_id", "taskId", "id"]);
  const taskType = readMetadataString([record], ["task_type", "taskType"]);
  const taskFamily = readMetadataString(record ? [record] : [], [
    "task_family",
    "taskFamily",
  ]);
  const normalizedTaskFamily = taskFamily?.trim().toLowerCase();
  const isImageTask =
    Boolean(taskId) &&
    (normalizedTaskFamily === "image" ||
      normalizedTaskFamily === "image_generation" ||
      Boolean(normalizedTaskFamily?.includes("image")) ||
      Boolean(taskType?.trim().toLowerCase().includes("image")));
  if (isImageTask) {
    return record;
  }

  for (const key of IMAGE_TASK_NESTED_KEYS) {
    const nested = findImageTaskRecord(record[key], visited);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function isImageTaskToolResultLike(params: {
  toolName?: string | null;
  output?: unknown;
  metadata?: unknown;
  result?: unknown;
  toolResult?: unknown;
}): boolean {
  return Boolean(
    findImageTaskRecord(params.toolResult) ||
    findImageTaskRecord(params.metadata) ||
    findImageTaskRecord(params.result) ||
    findImageTaskRecord(params.output),
  );
}

export function resolveImageTaskToolResultSummary(params: {
  toolName?: string | null;
  output?: unknown;
  metadata?: unknown;
  result?: unknown;
}): string | null {
  const record =
    findImageTaskRecord(params.metadata) ||
    findImageTaskRecord(params.result) ||
    findImageTaskRecord(params.output);
  if (!record) {
    return null;
  }

  const status = readMetadataString(
    [record],
    ["status", "normalized_status", "normalizedStatus"],
  );
  const layoutHint =
    readMetadataString([record], ["layout_hint", "layoutHint"]) || null;
  return resolveImageTaskStatusMessage({
    status: resolveTaskPreviewStatus(status),
    layoutHint,
  });
}
