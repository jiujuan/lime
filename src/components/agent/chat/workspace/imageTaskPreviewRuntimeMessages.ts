import type { Message, MessageImageWorkbenchPreview } from "../types";
import { buildImageWorkbenchCaption } from "../utils/imageWorkbenchPresentation";
import {
  isImageWorkbenchStatusOnlyText,
  isImageWorkbenchSubmissionTemplateText,
} from "../utils/imageWorkbenchStatusText";
import { resolveImageWorkbenchAssistantMessageId } from "./imageWorkbenchHelpers";
import {
  contentPartContainsProcess,
  isDraftImageWorkbenchTaskId,
  mergeMessageThinkingContent,
  normalizeImageWorkbenchPreviewIdentityText,
} from "./imageTaskPreviewRuntimeGuards";

function buildRunningImageWorkbenchPreviewFallbackKey(
  preview?: MessageImageWorkbenchPreview,
): string {
  if (!preview || preview.status !== "running") {
    return "";
  }

  const prompt = normalizeImageWorkbenchPreviewIdentityText(preview.prompt);
  if (!prompt) {
    return "";
  }

  return [
    preview.projectId?.trim() || "",
    preview.contentId?.trim() || "",
    preview.mode,
    preview.layoutHint || "",
    preview.size || "",
    String(preview.expectedImageCount ?? preview.imageCount ?? ""),
    prompt,
  ].join("::");
}

function resolveImageWorkbenchPreviewPathKey(
  preview?: MessageImageWorkbenchPreview,
): string {
  const normalizedTaskFilePath = preview?.taskFilePath?.trim();
  if (normalizedTaskFilePath) {
    return normalizedTaskFilePath.toLowerCase();
  }

  const normalizedArtifactPath = preview?.artifactPath?.trim();
  return normalizedArtifactPath ? normalizedArtifactPath.toLowerCase() : "";
}

export function previewsReferToSameImageWorkbenchTask(
  left?: MessageImageWorkbenchPreview,
  right?: MessageImageWorkbenchPreview,
): boolean {
  if (!left || !right) {
    return false;
  }

  const leftTaskId = left.taskId?.trim();
  const rightTaskId = right.taskId?.trim();
  if (leftTaskId && rightTaskId && leftTaskId === rightTaskId) {
    return true;
  }

  const leftPathKey = resolveImageWorkbenchPreviewPathKey(left);
  const rightPathKey = resolveImageWorkbenchPreviewPathKey(right);
  if (leftPathKey && rightPathKey && leftPathKey === rightPathKey) {
    return true;
  }

  const leftRunningKey = buildRunningImageWorkbenchPreviewFallbackKey(left);
  const rightRunningKey = buildRunningImageWorkbenchPreviewFallbackKey(right);
  return Boolean(
    leftRunningKey && rightRunningKey && leftRunningKey === rightRunningKey,
  );
}

function isDraftImageWorkbenchPreview(
  preview?: MessageImageWorkbenchPreview,
): boolean {
  return isDraftImageWorkbenchTaskId(preview?.taskId);
}

function isDraftAndResolvedImageWorkbenchPreviewPair(
  left?: MessageImageWorkbenchPreview,
  right?: MessageImageWorkbenchPreview,
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    isDraftImageWorkbenchPreview(left) !== isDraftImageWorkbenchPreview(right)
  );
}

function resolveImageWorkbenchPreviewIdentityKeys(
  preview?: MessageImageWorkbenchPreview,
): string[] {
  if (!preview || isDraftImageWorkbenchPreview(preview)) {
    return [];
  }

  const keys = new Set<string>();
  const taskId = preview.taskId?.trim();
  if (taskId) {
    keys.add(`task:${taskId}`);
  }

  const pathKey = resolveImageWorkbenchPreviewPathKey(preview);
  if (pathKey) {
    keys.add(`path:${pathKey}`);
  }

  const runningKey = buildRunningImageWorkbenchPreviewFallbackKey(preview);
  if (runningKey) {
    keys.add(`running:${runningKey}`);
  }

  return Array.from(keys);
}

function isImageWorkbenchStatusOnlyMessage(message: Message): boolean {
  return isImageWorkbenchStatusOnlyText(message.content);
}

function isImageWorkbenchSubmissionTemplateMessage(message: Message): boolean {
  return isImageWorkbenchSubmissionTemplateText(message.content);
}

function hasReplaceableImageWorkbenchMessageBody(message: Message): boolean {
  return (
    !message.content.trim() ||
    isImageWorkbenchSubmissionTemplateMessage(message) ||
    isImageWorkbenchStatusOnlyMessage(message)
  );
}

function shouldReplaceImageWorkbenchMessageBody(params: {
  existingMessage: Message;
  nextMessage: Message;
}): boolean {
  const nextPreview = params.nextMessage.imageWorkbenchPreview;
  if (!nextPreview) {
    return false;
  }

  const existingPreview = params.existingMessage.imageWorkbenchPreview;
  const shouldPromoteTerminalSnapshot =
    previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview) &&
    isImageWorkbenchSubmissionTemplateMessage(params.existingMessage) &&
    nextPreview.status !== "running";
  const isActiveRuntimeMessage =
    Boolean(params.existingMessage.isThinking) &&
    Boolean(params.existingMessage.runtimeTurnId) &&
    params.existingMessage.runtimeTurnId === params.nextMessage.runtimeTurnId;
  if (
    isActiveRuntimeMessage &&
    !isImageWorkbenchSubmissionTemplateMessage(params.existingMessage) &&
    !isImageWorkbenchStatusOnlyMessage(params.existingMessage)
  ) {
    return false;
  }

  const shouldUseCanonicalImageMessageBody =
    Boolean(nextPreview) &&
    hasReplaceableImageWorkbenchMessageBody(params.existingMessage) &&
    (previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview) ||
      (Boolean(params.existingMessage.runtimeTurnId) &&
        params.existingMessage.runtimeTurnId ===
          params.nextMessage.runtimeTurnId));

  return (
    shouldUseCanonicalImageMessageBody ||
    shouldPromoteTerminalSnapshot ||
    (params.existingMessage.id ===
      resolveImageWorkbenchAssistantMessageId(nextPreview.taskId) &&
      hasReplaceableImageWorkbenchMessageBody(params.existingMessage)) ||
    hasReplaceableImageWorkbenchMessageBody(params.existingMessage)
  );
}

function buildImageWorkbenchMessageStateSignature(
  message: Pick<
    Message,
    | "content"
    | "contentParts"
    | "toolCalls"
    | "timestamp"
    | "isThinking"
    | "thinkingContent"
    | "runtimeStatus"
    | "imageWorkbenchPreview"
  >,
): string {
  return JSON.stringify({
    content: message.content,
    contentParts: message.contentParts ?? null,
    toolCalls: message.toolCalls ?? null,
    timestamp:
      message.timestamp instanceof Date ? message.timestamp.getTime() : null,
    isThinking: message.isThinking,
    thinkingContent: message.thinkingContent ?? null,
    runtimeStatus: message.runtimeStatus ?? null,
    imageWorkbenchPreview: message.imageWorkbenchPreview ?? null,
  });
}

function hasImageWorkbenchProcessContentParts(
  parts: Message["contentParts"] | undefined,
): boolean {
  return Boolean(parts?.some(contentPartContainsProcess));
}

function mergeImageWorkbenchContentParts(params: {
  existingMessage: Message;
  nextMessage: Message;
  replaceBody: boolean;
}): Message["contentParts"] | undefined {
  const existingParts = params.existingMessage.contentParts;
  const nextParts = params.nextMessage.contentParts;
  if (!existingParts?.length) {
    return nextParts;
  }
  if (!nextParts?.length) {
    return existingParts;
  }
  if (!params.replaceBody) {
    return existingParts;
  }
  if (hasImageWorkbenchProcessContentParts(existingParts)) {
    return existingParts;
  }
  return nextParts;
}

function mergeImageWorkbenchToolCalls(params: {
  existingMessage: Message;
  nextMessage: Message;
  replaceBody: boolean;
}): Message["toolCalls"] | undefined {
  const existingToolCalls = params.existingMessage.toolCalls;
  const nextToolCalls = params.nextMessage.toolCalls;
  if (!existingToolCalls?.length) {
    return nextToolCalls;
  }
  if (!nextToolCalls?.length) {
    return existingToolCalls;
  }
  if (!params.replaceBody) {
    return existingToolCalls;
  }

  const merged = new Map<string, NonNullable<Message["toolCalls"]>[number]>();
  for (const toolCall of [...existingToolCalls, ...nextToolCalls]) {
    merged.set(toolCall.id, toolCall);
  }
  return Array.from(merged.values());
}

function resolveImageWorkbenchPreviewProgressScore(
  preview?: MessageImageWorkbenchPreview,
): number {
  switch (preview?.status) {
    case "complete":
    case "failed":
    case "cancelled":
      return 3;
    case "partial":
      return 2;
    case "running":
      return 1;
    default:
      return 0;
  }
}

function mergeImageWorkbenchPreviewByProgress(
  existingPreview?: MessageImageWorkbenchPreview,
  nextPreview?: MessageImageWorkbenchPreview,
): MessageImageWorkbenchPreview | undefined {
  if (!existingPreview) {
    return nextPreview;
  }
  if (
    !nextPreview ||
    !previewsReferToSameImageWorkbenchTask(existingPreview, nextPreview)
  ) {
    if (
      isDraftAndResolvedImageWorkbenchPreviewPair(existingPreview, nextPreview)
    ) {
      return isDraftImageWorkbenchPreview(existingPreview)
        ? nextPreview
        : existingPreview;
    }
    return nextPreview || existingPreview;
  }

  const nextIsAtLeastAsFresh =
    resolveImageWorkbenchPreviewProgressScore(nextPreview) >=
    resolveImageWorkbenchPreviewProgressScore(existingPreview);
  return nextIsAtLeastAsFresh
    ? {
        ...existingPreview,
        ...nextPreview,
        caption: nextPreview.caption ?? existingPreview.caption ?? null,
      }
    : {
        ...nextPreview,
        ...existingPreview,
        caption: existingPreview.caption ?? nextPreview.caption ?? null,
      };
}

export function mergeImageWorkbenchPreviewMessage(params: {
  existingMessage: Message;
  nextMessage: Message;
}): Message {
  const existingPreview = params.existingMessage.imageWorkbenchPreview;
  const nextPreview = params.nextMessage.imageWorkbenchPreview;
  const mergedPreview = mergeImageWorkbenchPreviewByProgress(
    existingPreview,
    nextPreview,
  );
  const replaceBody = shouldReplaceImageWorkbenchMessageBody(params);
  const mergedMessage: Message = {
    ...params.existingMessage,
    content:
      replaceBody || !params.existingMessage.content.trim()
        ? params.nextMessage.content
        : params.existingMessage.content,
    contentParts: mergeImageWorkbenchContentParts({
      existingMessage: params.existingMessage,
      nextMessage: params.nextMessage,
      replaceBody,
    }),
    toolCalls: mergeImageWorkbenchToolCalls({
      existingMessage: params.existingMessage,
      nextMessage: params.nextMessage,
      replaceBody,
    }),
    timestamp: replaceBody
      ? params.nextMessage.timestamp
      : params.existingMessage.timestamp,
    isThinking: replaceBody
      ? params.nextMessage.isThinking
      : mergedPreview?.status === "running"
        ? params.existingMessage.isThinking
        : false,
    thinkingContent: mergeMessageThinkingContent(params),
    runtimeStatus: params.nextMessage.runtimeStatus,
    imageWorkbenchPreview: mergedPreview,
  };

  return buildImageWorkbenchMessageStateSignature(mergedMessage) ===
    buildImageWorkbenchMessageStateSignature(params.existingMessage)
    ? params.existingMessage
    : mergedMessage;
}

function dedupeImageWorkbenchPreviewMessages(messages: Message[]): Message[] {
  const dedupedMessages: Message[] = [];
  const previewMessageIndex = new Map<string, number>();

  messages.forEach((message) => {
    const preview = message.imageWorkbenchPreview;
    const previewKeys = resolveImageWorkbenchPreviewIdentityKeys(preview);
    if (previewKeys.length === 0) {
      dedupedMessages.push(message);
      return;
    }

    const existingIndex = previewKeys.reduce<number | undefined>(
      (matchedIndex, key) => matchedIndex ?? previewMessageIndex.get(key),
      undefined,
    );
    if (existingIndex === undefined) {
      const nextIndex = dedupedMessages.length;
      dedupedMessages.push(message);
      previewKeys.forEach((key) => {
        previewMessageIndex.set(key, nextIndex);
      });
      return;
    }

    dedupedMessages[existingIndex] = mergeImageWorkbenchPreviewMessage({
      existingMessage: dedupedMessages[existingIndex],
      nextMessage: message,
    });
    resolveImageWorkbenchPreviewIdentityKeys(
      dedupedMessages[existingIndex].imageWorkbenchPreview,
    ).forEach((key) => {
      previewMessageIndex.set(key, existingIndex);
    });
  });

  return dedupedMessages;
}

function shouldMergeImageWorkbenchPreviewIntoPreviousMessage(
  previous: Message | undefined,
  current: Message,
): boolean {
  if (
    !previous ||
    previous.role !== "assistant" ||
    current.role !== "assistant" ||
    !current.imageWorkbenchPreview
  ) {
    return false;
  }

  if (
    previous.runtimeTurnId &&
    current.runtimeTurnId &&
    previous.runtimeTurnId === current.runtimeTurnId
  ) {
    return true;
  }

  if (
    isDraftAndResolvedImageWorkbenchPreviewPair(
      previous.imageWorkbenchPreview,
      current.imageWorkbenchPreview,
    )
  ) {
    return true;
  }

  return isImageWorkbenchSubmissionTemplateMessage(previous);
}

function mergeAdjacentImageWorkbenchPreviewMessages(
  messages: Message[],
): Message[] {
  const mergedMessages: Message[] = [];

  messages.forEach((message) => {
    const previous = mergedMessages.at(-1);
    if (
      shouldMergeImageWorkbenchPreviewIntoPreviousMessage(previous, message)
    ) {
      mergedMessages[mergedMessages.length - 1] =
        mergeImageWorkbenchPreviewMessage({
          existingMessage: previous!,
          nextMessage: message,
        });
      return;
    }

    mergedMessages.push(message);
  });

  return mergedMessages;
}

function isImageWorkbenchSkillFailureText(value?: string | null): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("skill_execute_failed") ||
    normalized.includes("skill 执行失败") ||
    (normalized.includes("execute_skill") &&
      (normalized.includes("failed") || normalized.includes("失败")))
  );
}

function normalizeImageWorkbenchRuntimeFailureMessage(
  message: Message,
): Message {
  const preview = message.imageWorkbenchPreview;
  if (
    message.role !== "assistant" ||
    !preview ||
    preview.status !== "running" ||
    !isImageWorkbenchSkillFailureText(message.content)
  ) {
    return message;
  }

  const retainedContentParts = (message.contentParts || []).filter(
    (part) => part.type !== "text",
  );
  if (isDraftImageWorkbenchPreview(preview)) {
    const nextMessage: Message = {
      ...message,
      content: "",
      contentParts:
        retainedContentParts.length > 0 ? retainedContentParts : undefined,
      isThinking: false,
      runtimeStatus: undefined,
      imageWorkbenchPreview: undefined,
    };

    return buildImageWorkbenchMessageStateSignature(nextMessage) ===
      buildImageWorkbenchMessageStateSignature(message)
      ? message
      : nextMessage;
  }

  const nextPreview: MessageImageWorkbenchPreview = {
    ...preview,
    status: "failed",
    phase: "failed",
    statusMessage: null,
    caption:
      preview.caption ??
      buildImageWorkbenchCaption({
        prompt: preview.prompt,
        status: "failed",
        imageCount: preview.imageCount,
        statusMessage: null,
      }),
    retryable: true,
  };
  const nextMessage: Message = {
    ...message,
    content: "",
    contentParts:
      retainedContentParts.length > 0 ? retainedContentParts : undefined,
    isThinking: false,
    runtimeStatus: undefined,
    imageWorkbenchPreview: nextPreview,
  };

  return buildImageWorkbenchMessageStateSignature(nextMessage) ===
    buildImageWorkbenchMessageStateSignature(message)
    ? message
    : nextMessage;
}

export function finalizePreviewMessages(
  previousMessages: Message[],
  nextMessages: Message[],
): Message[] {
  const normalizedMessages = nextMessages
    .map(normalizeImageWorkbenchRuntimeFailureMessage)
    .map((message) =>
      isDraftImageWorkbenchPreview(message.imageWorkbenchPreview)
        ? { ...message, imageWorkbenchPreview: undefined }
        : message,
    );
  const dedupedMessages = mergeAdjacentImageWorkbenchPreviewMessages(
    dedupeImageWorkbenchPreviewMessages(normalizedMessages),
  );
  if (
    dedupedMessages.length === previousMessages.length &&
    dedupedMessages.every(
      (message, index) => message === previousMessages[index],
    )
  ) {
    return previousMessages;
  }

  return dedupedMessages;
}

function normalizeTaskRef(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function upsertPreviewMessage(
  messages: Message[],
  nextMessage: Message,
  options?: {
    runtimeTurnId?: string | null;
  },
): Message[] {
  const nextMessages = [...messages];
  const nextPreview = nextMessage.imageWorkbenchPreview;
  const normalizedRuntimeTurnId = normalizeTaskRef(options?.runtimeTurnId);
  if (nextPreview && normalizedRuntimeTurnId) {
    const turnMatchedIndex = nextMessages.findIndex(
      (message) =>
        message.role === "assistant" &&
        message.runtimeTurnId === normalizedRuntimeTurnId,
    );
    if (turnMatchedIndex >= 0) {
      const existingTurnMessage = nextMessages[turnMatchedIndex];
      const runtimeBoundNextMessage = {
        ...nextMessage,
        runtimeTurnId:
          nextMessage.runtimeTurnId || existingTurnMessage.runtimeTurnId,
      };
      const mergedMessage = mergeImageWorkbenchPreviewMessage({
        existingMessage: existingTurnMessage,
        nextMessage: runtimeBoundNextMessage,
      });
      nextMessages[turnMatchedIndex] = mergedMessage;
      const withoutDuplicatePreviewMessages = nextMessages.filter(
        (message, index) =>
          index === turnMatchedIndex ||
          message.role !== "assistant" ||
          !previewsReferToSameImageWorkbenchTask(
            message.imageWorkbenchPreview,
            nextPreview,
          ),
      );
      if (
        mergedMessage === existingTurnMessage &&
        withoutDuplicatePreviewMessages.length === messages.length
      ) {
        return messages;
      }
      return finalizePreviewMessages(messages, withoutDuplicatePreviewMessages);
    }
  }

  const existingIndex = nextMessages.findIndex(
    (message) => message.id === nextMessage.id,
  );
  if (existingIndex >= 0) {
    const mergedMessage = mergeImageWorkbenchPreviewMessage({
      existingMessage: nextMessages[existingIndex],
      nextMessage,
    });
    if (mergedMessage === nextMessages[existingIndex]) {
      return messages;
    }
    nextMessages[existingIndex] = mergedMessage;
    return finalizePreviewMessages(messages, nextMessages);
  }

  if (nextPreview) {
    const taskMatchedIndex = nextMessages.findIndex(
      (message) =>
        message.role === "assistant" &&
        previewsReferToSameImageWorkbenchTask(
          message.imageWorkbenchPreview,
          nextPreview,
        ),
    );
    if (taskMatchedIndex >= 0) {
      const mergedMessage = mergeImageWorkbenchPreviewMessage({
        existingMessage: nextMessages[taskMatchedIndex],
        nextMessage,
      });
      if (mergedMessage === nextMessages[taskMatchedIndex]) {
        return messages;
      }
      nextMessages[taskMatchedIndex] = mergedMessage;
      return finalizePreviewMessages(messages, nextMessages);
    }
  }

  nextMessages.push(nextMessage);
  return finalizePreviewMessages(messages, nextMessages);
}
