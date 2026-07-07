import type {
  ContentPart,
  Message,
  MessageImage,
  MessageImageWorkbenchPreview,
  MessageTaskPreview,
} from "../types";
import { resolveArtifactProtocolFilePath } from "@/lib/artifact-protocol";
import { normalizeSignatureText } from "./agentChatHistoryPrimitives";

export function resolveMessageTimestampMs(message: Message): number | null {
  const timestampMs = message.timestamp.getTime();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

export function normalizePreviewSignatureValue(value: unknown): string {
  if (typeof value === "string") {
    return normalizeSignatureText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function imageWorkbenchPreviewSignature(
  preview?: MessageImageWorkbenchPreview,
): string {
  if (!preview) {
    return "";
  }

  return [
    preview.taskId,
    preview.prompt,
    preview.mode,
    preview.status,
    preview.projectId,
    preview.contentId,
    preview.taskFilePath,
    preview.artifactPath,
    preview.imageUrl,
    preview.previewImages?.join("|"),
    preview.imageCount,
    preview.expectedImageCount,
    preview.layoutHint,
    preview.storyboardSlots
      ?.map((slot) =>
        [
          slot.slotId,
          slot.slotIndex,
          slot.label,
          slot.prompt,
          slot.shotType,
          slot.status,
        ]
          .map(normalizePreviewSignatureValue)
          .join("|"),
      )
      .join("||"),
    preview.sourceImageUrl,
    preview.sourceImagePrompt,
    preview.sourceImageRef,
    preview.sourceImageCount,
    preview.size,
    preview.phase,
    preview.statusMessage,
    preview.retryable,
    preview.attemptCount,
    preview.placeholderText,
    preview.runtimeContract?.contractKey,
    preview.runtimeContract?.routingSlot,
    preview.runtimeContract?.providerId,
    preview.runtimeContract?.model,
    preview.runtimeContract?.routingEvent,
    preview.runtimeContract?.routingOutcome,
    preview.runtimeContract?.failureCode,
    preview.runtimeContract?.modelCapabilityAssessmentSource,
    preview.runtimeContract?.modelSupportsImageGeneration,
  ]
    .map(normalizePreviewSignatureValue)
    .join(":");
}

export function taskPreviewSignature(preview?: MessageTaskPreview): string {
  if (!preview) {
    return "";
  }

  const videoFields =
    preview.kind === "video_generate"
      ? [
          preview.videoUrl,
          preview.thumbnailUrl,
          preview.durationSeconds,
          preview.aspectRatio,
          preview.resolution,
          preview.progress,
          preview.retryable,
        ]
      : [];
  const metaItems =
    "metaItems" in preview && Array.isArray(preview.metaItems)
      ? preview.metaItems.map((item) => normalizeSignatureText(item)).join("|")
      : "";
  const imageCandidates =
    "imageCandidates" in preview && Array.isArray(preview.imageCandidates)
      ? preview.imageCandidates
          .map((candidate) =>
            [
              candidate.id,
              candidate.thumbnailUrl,
              candidate.contentUrl,
              candidate.hostPageUrl,
              candidate.width,
              candidate.height,
              candidate.name,
            ]
              .map(normalizePreviewSignatureValue)
              .join(":"),
          )
          .join("|")
      : "";
  const audioFields =
    preview.kind === "audio_generate"
      ? [
          preview.taskFilePath,
          preview.audioUrl,
          preview.mimeType,
          preview.durationMs,
          preview.sourceText,
          preview.voice,
        ]
      : [];

  return [
    preview.kind,
    preview.taskId,
    preview.taskType,
    preview.prompt,
    "title" in preview ? preview.title : "",
    preview.status,
    preview.projectId,
    preview.contentId,
    "artifactPath" in preview ? preview.artifactPath : "",
    "providerId" in preview ? preview.providerId : "",
    "model" in preview ? preview.model : "",
    preview.phase,
    preview.statusMessage,
    ...videoFields,
    ...audioFields,
    metaItems,
    imageCandidates,
  ]
    .map(normalizePreviewSignatureValue)
    .join(":");
}

export const hasMessageImages = (message: Message): boolean =>
  Array.isArray(message.images) && message.images.length > 0;

export function hasAssistantThinkingContent(message: Message): boolean {
  return (
    Boolean(message.thinkingContent?.trim()) ||
    (message.contentParts || []).some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    )
  );
}

export function collectMessageToolIds(message: Message): Set<string> {
  const ids = new Set<string>();
  for (const toolCall of message.toolCalls || []) {
    if (toolCall.id) {
      ids.add(toolCall.id);
    }
  }
  for (const part of message.contentParts || []) {
    if (part.type === "tool_use" && part.toolCall.id) {
      ids.add(part.toolCall.id);
    }
  }
  return ids;
}

export function hasSharedValue(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

export const messageImageSignature = (images?: MessageImage[]): string => {
  if (!images || images.length === 0) return "";
  return images
    .map(
      (image) =>
        `${image.mediaType}:${image.sourcePath || ""}:${image.sourceUri || ""}:${image.previewUrl || ""}:${image.data.slice(0, 64)}`,
    )
    .join("|");
};


export const messageToolCallsSignature = (
  toolCalls?: Message["toolCalls"],
): string => {
  if (!toolCalls || toolCalls.length === 0) return "";
  return toolCalls
    .map((toolCall) => {
      const output = toolCall.result?.output
        ? normalizeSignatureText(toolCall.result.output)
        : "";
      const error = toolCall.result?.error
        ? normalizeSignatureText(toolCall.result.error)
        : "";
      return `${toolCall.id}:${toolCall.status}:${toolCall.name}:${output}:${error}`;
    })
    .join("|");
};

export const messageContentPartsSignature = (parts?: ContentPart[]): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .map((part) => {
      if (part.type === "text" || part.type === "thinking") {
        return `${part.type}:${normalizeSignatureText(part.text)}`;
      }
      if (part.type === "tool_use") {
        const output = part.toolCall.result?.output
          ? normalizeSignatureText(part.toolCall.result.output)
          : "";
        const error = part.toolCall.result?.error
          ? normalizeSignatureText(part.toolCall.result.error)
          : "";
        return `tool_use:${part.toolCall.id}:${part.toolCall.status}:${part.toolCall.name}:${output}:${error}`;
      }
      if (part.type === "file_changes_batch") {
        return `file_changes_batch:${part.aggregate.fileCount}:+${part.aggregate.totalAdded}-${part.aggregate.totalRemoved}`;
      }
      if (part.type === "media_reference") {
        return [
          "media_reference",
          part.reference.kind || "",
          part.reference.uri,
          part.reference.mimeType || "",
          part.reference.caption || "",
          part.reference.title || "",
        ].join(":");
      }
      const prompt = part.actionRequired.prompt
        ? normalizeSignatureText(part.actionRequired.prompt)
        : "";
      return `action_required:${part.actionRequired.requestId}:${part.actionRequired.actionType}:${prompt}`;
    })
    .join("|");
};

export const messageArtifactsSignature = (
  artifacts?: Message["artifacts"],
): string => {
  if (!artifacts || artifacts.length === 0) return "";
  return artifacts
    .map((artifact) => {
      const filePath = resolveArtifactProtocolFilePath(artifact);
      return [
        artifact.id,
        artifact.type,
        artifact.status,
        normalizeSignatureText(artifact.title),
        normalizeSignatureText(filePath),
        normalizeSignatureText(artifact.content),
      ].join(":");
    })
    .join("|");
};

export const buildAssistantHydrationSignature = (message: Message): string => {
  const contentSignature = normalizeSignatureText(message.content);
  const imageSignature = messageImageSignature(message.images);
  const imagePreviewSignature = imageWorkbenchPreviewSignature(
    message.imageWorkbenchPreview,
  );
  const nextTaskPreviewSignature = taskPreviewSignature(message.taskPreview);

  if (
    !contentSignature &&
    !imageSignature &&
    !imagePreviewSignature &&
    !nextTaskPreviewSignature
  ) {
    return "";
  }

  return [
    message.role,
    contentSignature,
    imageSignature,
    imagePreviewSignature,
    nextTaskPreviewSignature,
  ].join("::");
};

export const buildHistoryMessageSignature = (message: Message): string => {
  const usageSignature = message.usage
    ? `${message.usage.input_tokens}:${message.usage.output_tokens}:${message.usage.cached_input_tokens ?? ""}:${message.usage.cache_creation_input_tokens ?? ""}`
    : "";
  return [
    message.role,
    normalizeSignatureText(message.content),
    messageImageSignature(message.images),
    messageToolCallsSignature(message.toolCalls),
    messageContentPartsSignature(message.contentParts),
    messageArtifactsSignature(message.artifacts),
    imageWorkbenchPreviewSignature(message.imageWorkbenchPreview),
    taskPreviewSignature(message.taskPreview),
    usageSignature,
  ].join("::");
};

export const dedupeAdjacentHistoryMessages = (
  messages: Message[],
): Message[] => {
  const deduped: Message[] = [];
  let previousSignature: string | null = null;
  let previousTimestampMs: number | null = null;

  for (const message of messages) {
    const signature = buildHistoryMessageSignature(message);
    const timestampMs = message.timestamp.getTime();
    const isDuplicate =
      previousSignature === signature &&
      previousTimestampMs !== null &&
      Math.abs(timestampMs - previousTimestampMs) <= 5000;

    if (!isDuplicate) {
      deduped.push(message);
      previousSignature = signature;
      previousTimestampMs = timestampMs;
    }
  }

  return deduped;
};
