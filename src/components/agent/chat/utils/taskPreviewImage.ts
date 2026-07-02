import type {
  ImageStoryboardSlot,
  MessageImageWorkbenchPreview,
} from "../types";
import {
  asRecord,
  parseJsonRecordString,
  readArrayRecords,
  readCommandArgumentValue,
  readMetadataPositiveNumber,
  readMetadataString,
  resolveTaskPreviewPhase,
  resolveTaskPreviewStatus,
  type ToolResultPreviewParams,
} from "./taskPreviewToolResultShared";
import {
  resolveImageTaskFallbackPrompt,
  resolveImageTaskStatusMessage,
} from "./taskPreviewCopy";
import { findImageTaskRecord } from "./imageTaskToolResult";

function extractImageTaskPromptFromToolArguments(
  toolName: string,
  toolArguments: string | undefined,
): {
  prompt?: string;
  size?: string;
  imageCount?: number;
  layoutHint?: string;
} {
  if (!toolArguments) {
    return {};
  }

  try {
    const parsed = JSON.parse(toolArguments) as Record<string, unknown>;
    const prompt = readMetadataString([parsed], ["prompt"]);
    const size = readMetadataString([parsed], ["size", "resolution"]);
    const imageCount = readMetadataPositiveNumber(
      [parsed],
      ["count", "image_count", "imageCount"],
    );
    const layoutHint = readMetadataString(
      [parsed],
      ["layout_hint", "layoutHint"],
    );
    const command =
      typeof parsed.command === "string" ? parsed.command.trim() : undefined;

    if (prompt || size || imageCount || layoutHint || !command) {
      return { prompt, size, imageCount, layoutHint };
    }

    if (
      toolName.trim().toLowerCase() === "bash" &&
      (command.includes("lime media image generate") ||
        command.includes("lime task create image"))
    ) {
      return {
        prompt: readCommandArgumentValue(command, "--prompt"),
        size: readCommandArgumentValue(command, "--size"),
        imageCount: readCommandArgumentValue(command, "--count")
          ? Number.parseInt(
              readCommandArgumentValue(command, "--count") || "",
              10,
            )
          : undefined,
        layoutHint: readCommandArgumentValue(command, "--layout-hint"),
      };
    }
  } catch {
    return {};
  }

  return {};
}

function readImageStoryboardSlots(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): ImageStoryboardSlot[] {
  return readArrayRecords(candidates, keys)
    .map((record, index) => {
      const slotIndex =
        readMetadataPositiveNumber([record], ["slot_index", "slotIndex"]) ||
        index + 1;
      const slotId =
        readMetadataString([record], ["slot_id", "slotId"]) ||
        `storyboard-slot-${slotIndex}`;

      return {
        slotId,
        slotIndex,
        label:
          readMetadataString([record], ["label", "slot_label", "slotLabel"]) ||
          null,
        prompt:
          readMetadataString(
            [record],
            ["prompt", "slot_prompt", "slotPrompt", "revised_prompt"],
          ) || null,
        shotType:
          readMetadataString([record], ["shot_type", "shotType"]) || null,
        status: readMetadataString([record], ["status"]) || null,
      } satisfies ImageStoryboardSlot;
    })
    .sort((left, right) => left.slotIndex - right.slotIndex);
}

function isImageTaskRecord(params: {
  taskFamily?: string;
  taskType?: string;
}): boolean {
  const normalizedTaskType = params.taskType?.trim().toLowerCase() || "";
  const normalizedTaskFamily = params.taskFamily?.trim().toLowerCase() || "";
  return (
    normalizedTaskType.includes("image") ||
    normalizedTaskType.includes("cover") ||
    normalizedTaskFamily === "image" ||
    normalizedTaskFamily === "image_generation" ||
    normalizedTaskFamily.includes("image")
  );
}

function readImageTaskPresentationCaption(
  candidates: Array<Record<string, unknown> | null | undefined>,
  status: MessageImageWorkbenchPreview["status"],
): string | undefined {
  if (status === "running") {
    return undefined;
  }

  const statusKeys =
    status === "complete"
      ? ["completion_caption", "completionCaption", "complete"]
      : status === "partial"
        ? ["partial_caption", "partialCaption", "partial"]
        : status === "failed"
          ? [
              "failed_caption",
              "failedCaption",
              "failure_caption",
              "failureCaption",
              "failed",
              "failure",
            ]
          : status === "cancelled"
            ? ["cancelled_caption", "cancelledCaption", "cancelled"]
            : [];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const presentation = asRecord(candidate.presentation) || candidate;
    const captions = asRecord(presentation.result_captions);
    const caption = readMetadataString(
      [presentation, captions],
      [...statusKeys, "result_caption", "resultCaption", "caption"],
    );
    if (caption) {
      return caption;
    }
  }

  return undefined;
}

export function buildImageTaskPreviewFromToolResult(
  params: ToolResultPreviewParams,
): MessageImageWorkbenchPreview | null {
  const resultRecord = asRecord(params.toolResult);
  const detectedTaskRecord = findImageTaskRecord(params.toolResult);
  const metadata = asRecord(resultRecord?.metadata);
  const outputRecord = parseJsonRecordString(resultRecord?.output);
  const structuredContentRecord =
    asRecord(resultRecord?.structuredContent) ||
    asRecord(resultRecord?.structured_content);
  const nestedResultRecord = asRecord(resultRecord?.result);
  const responseRecord = asRecord(resultRecord?.response);
  const responseNestedRecord = asRecord(responseRecord?.record);
  const taskRecord =
    asRecord(resultRecord?.record) ||
    asRecord(metadata?.record) ||
    asRecord(outputRecord?.record) ||
    asRecord(structuredContentRecord?.record) ||
    asRecord(nestedResultRecord?.record) ||
    responseNestedRecord ||
    asRecord(detectedTaskRecord?.record) ||
    detectedTaskRecord;
  const payloadRecord =
    asRecord(taskRecord?.payload) ||
    asRecord(resultRecord?.payload) ||
    asRecord(metadata?.payload) ||
    asRecord(outputRecord?.payload) ||
    asRecord(structuredContentRecord?.payload) ||
    asRecord(nestedResultRecord?.payload) ||
    asRecord(responseRecord?.payload) ||
    asRecord(responseNestedRecord?.payload) ||
    asRecord(detectedTaskRecord?.payload);
  const progressRecord =
    asRecord(resultRecord?.progress) ||
    asRecord(metadata?.progress) ||
    asRecord(outputRecord?.progress) ||
    asRecord(structuredContentRecord?.progress) ||
    asRecord(nestedResultRecord?.progress) ||
    asRecord(taskRecord?.progress) ||
    asRecord(responseRecord?.progress) ||
    asRecord(responseNestedRecord?.progress) ||
    asRecord(detectedTaskRecord?.progress);
  const candidates = [
    resultRecord,
    detectedTaskRecord,
    metadata,
    outputRecord,
    structuredContentRecord,
    nestedResultRecord,
    responseRecord,
    responseNestedRecord,
    taskRecord,
    payloadRecord,
  ];
  const taskId = readMetadataString(candidates, ["task_id", "taskId"]);
  const taskType = readMetadataString(candidates, ["task_type", "taskType"]);
  const taskFamily = readMetadataString(candidates, [
    "task_family",
    "taskFamily",
  ]);
  if (!taskId || (!taskType && !taskFamily)) {
    return null;
  }

  if (!isImageTaskRecord({ taskFamily, taskType })) {
    return null;
  }

  const parsedArguments = extractImageTaskPromptFromToolArguments(
    params.toolName,
    params.toolArguments,
  );
  const status = readMetadataString(candidates, [
    "status",
    "normalized_status",
    "normalizedStatus",
  ]);
  const previewStatus = resolveTaskPreviewStatus(status);
  const requestedCount =
    parsedArguments.imageCount ||
    readMetadataPositiveNumber(
      candidates,
      [
        "requested_count",
        "requestedCount",
        "count",
        "image_count",
        "imageCount",
      ],
    );
  const receivedCount = readMetadataPositiveNumber(
    candidates,
    ["received_count", "receivedCount"],
  );
  const layoutHint =
    parsedArguments.layoutHint ||
    readMetadataString(candidates, ["layout_hint", "layoutHint"]) ||
    null;
  const storyboardSlots = readImageStoryboardSlots(
    candidates,
    ["storyboard_slots", "storyboardSlots"],
  );
  const expectedImageCount = Math.max(
    requestedCount || 0,
    storyboardSlots.length,
  );
  const resolvedImageCount =
    previewStatus === "running"
      ? expectedImageCount || requestedCount
      : receivedCount || expectedImageCount || requestedCount;
  const progressStatusMessage = readMetadataString([progressRecord], [
    "message",
  ]);
  const statusMessage =
    progressStatusMessage ||
    resolveImageTaskStatusMessage({
      status: previewStatus,
      layoutHint,
    });

  return {
    taskId,
    prompt:
      parsedArguments.prompt ||
      readMetadataString(candidates, ["prompt", "summary", "title"]) ||
      params.fallbackPrompt.trim() ||
      resolveImageTaskFallbackPrompt(),
    status: previewStatus,
    projectId:
      readMetadataString(candidates, ["project_id", "projectId"]) || null,
    contentId:
      readMetadataString(candidates, ["content_id", "contentId"]) || null,
    providerName:
      readMetadataString(candidates, [
        "provider_name",
        "providerName",
        "provider_id",
        "providerId",
        "provider",
      ]) || null,
    modelName:
      readMetadataString(candidates, [
        "model_name",
        "modelName",
        "model_id",
        "modelId",
        "model",
      ]) || null,
    caption: readImageTaskPresentationCaption(candidates, previewStatus) || null,
    taskFilePath:
      readMetadataString(
        candidates,
        [
          "absolute_path",
          "absolutePath",
          "task_file_path",
          "taskFilePath",
          "path",
        ],
      ) || null,
    artifactPath:
      readMetadataString(
        candidates,
        ["artifact_path", "artifactPath", "path"],
      ) || null,
    imageCount: resolvedImageCount,
    expectedImageCount: expectedImageCount || requestedCount,
    layoutHint,
    storyboardSlots: storyboardSlots.length > 0 ? storyboardSlots : undefined,
    size:
      parsedArguments.size ||
      readMetadataString(candidates, ["size", "resolution"]),
    phase: resolveTaskPreviewPhase(status),
    statusMessage,
  };
}
