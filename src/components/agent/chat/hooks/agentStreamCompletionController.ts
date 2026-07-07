import i18n from "i18next";
import type { Message } from "../types";
import {
  isProcessBoundaryContentPart,
  shouldAppendCompletionSuffixToTextPart,
} from "../utils/contentPartTimeline";
import { isAgentMessageCommentaryPhase } from "../utils/agentMessagePhase";
import {
  containsAssistantProtocolResidue,
  stripAssistantProtocolResidue,
} from "../utils/protocolResidue";

export const AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_HINT = "模型未输出最终答复";
export const AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE =
  "模型未输出最终答复，请重试";
export const AGENT_STREAM_EMPTY_FINAL_REPLY_FALLBACK_CONTENT =
  "本轮执行已完成，详细过程与产物已保留在当前对话中。";
const AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE_KEY =
  "agentChat.emptyFinalReply.errorMessage";
const AGENT_STREAM_EMPTY_FINAL_REPLY_FALLBACK_CONTENT_KEY =
  "agentChat.emptyFinalReply.fallbackContent";

function readAgentStreamCopy(key: string, fallback: string): string {
  if (!i18n.isInitialized) {
    return fallback;
  }

  return String(
    i18n.t(key, {
      ns: "agent",
      defaultValue: fallback,
    }),
  );
}

export function resolveAgentStreamEmptyFinalReplyErrorMessage(): string {
  return readAgentStreamCopy(
    AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE_KEY,
    AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_MESSAGE,
  );
}

export function resolveAgentStreamEmptyFinalReplyFallbackContent(): string {
  return readAgentStreamCopy(
    AGENT_STREAM_EMPTY_FINAL_REPLY_FALLBACK_CONTENT_KEY,
    AGENT_STREAM_EMPTY_FINAL_REPLY_FALLBACK_CONTENT,
  );
}

interface AgentStreamCompletionRequestLogPayload {
  eventType: "chat_request_complete";
  status: "success";
  description: string;
}

interface AgentStreamCompletionErrorRequestLogPayload {
  eventType: "chat_request_error";
  status: "error";
  description?: string;
  error: string;
}

export interface AgentStreamMissingFinalReplyPlan {
  type: "missing_final_reply_failure";
  errorMessage: string;
  queuedTurnIds: string[];
  requestLogPayload: AgentStreamCompletionErrorRequestLogPayload;
  toastMessage: string;
  usage?: Message["usage"];
}

export interface AgentStreamMissingFinalReplyFailureSideEffectPlan {
  errorMessage: string;
  observerErrorMessage: string;
  queuedTurnIds: string[];
  requestLogPayload: AgentStreamCompletionErrorRequestLogPayload;
  shouldClearActiveStream: boolean;
  shouldClearPendingTextRenderTimer: boolean;
  shouldDisposeListener: boolean;
  shouldMarkFailedTimeline: boolean;
  toastMessage: string;
  usage?: Message["usage"];
}

interface AgentStreamCompletionSuccessPlan {
  type: "complete";
  finalContent: string;
  queuedTurnIds: string[];
  requestLogPayload: AgentStreamCompletionRequestLogPayload;
}

export type AgentStreamFinalDonePlan =
  | AgentStreamMissingFinalReplyPlan
  | AgentStreamCompletionSuccessPlan;

export type AgentStreamEmptyFinalErrorPlan =
  | AgentStreamMissingFinalReplyPlan
  | AgentStreamCompletionSuccessPlan;

const resolveQueuedTurnIds = (queuedTurnId?: string | null): string[] =>
  queuedTurnId ? [queuedTurnId] : [];

export function buildAgentStreamMissingFinalReplyFailurePlan(params: {
  errorMessage: string;
  toastMessage?: string;
  queuedTurnId?: string | null;
  usage?: Message["usage"];
}): AgentStreamMissingFinalReplyPlan {
  return {
    type: "missing_final_reply_failure",
    errorMessage: params.errorMessage,
    queuedTurnIds: resolveQueuedTurnIds(params.queuedTurnId),
    requestLogPayload: {
      eventType: "chat_request_error",
      status: "error",
      error: params.errorMessage,
    },
    toastMessage:
      params.toastMessage ?? resolveAgentStreamEmptyFinalReplyErrorMessage(),
    ...(params.usage !== undefined ? { usage: params.usage } : {}),
  };
}

export function buildAgentStreamMissingFinalReplyFailureSideEffectPlan(
  failurePlan: AgentStreamMissingFinalReplyPlan,
): AgentStreamMissingFinalReplyFailureSideEffectPlan {
  return {
    errorMessage: failurePlan.errorMessage,
    observerErrorMessage: failurePlan.errorMessage,
    queuedTurnIds: failurePlan.queuedTurnIds,
    requestLogPayload: failurePlan.requestLogPayload,
    shouldClearActiveStream: true,
    shouldClearPendingTextRenderTimer: true,
    shouldDisposeListener: true,
    shouldMarkFailedTimeline: true,
    toastMessage: failurePlan.toastMessage,
    ...(failurePlan.usage !== undefined ? { usage: failurePlan.usage } : {}),
  };
}

export function isAgentStreamEmptyFinalReplyError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    message.includes(AGENT_STREAM_EMPTY_FINAL_REPLY_ERROR_HINT) ||
    message.includes(resolveAgentStreamEmptyFinalReplyErrorMessage()) ||
    lowerMessage.includes("did not produce a final response") ||
    lowerMessage.includes("did not output a final response") ||
    lowerMessage.includes("empty final response")
  );
}

export function shouldFailAgentStreamMissingFinalReply(params: {
  accumulatedContent: string;
  hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary?: boolean;
  hasFinalAnswerRequiredProcessBoundary?: boolean;
  hasMeaningfulCompletionSignal?: boolean;
}): boolean {
  if (params.hasMeaningfulCompletionSignal) {
    return false;
  }

  const rawFinalContent = params.accumulatedContent.trim();
  const cleanedFinalContent = stripAssistantProtocolResidue(
    params.accumulatedContent,
  );

  return (
    !cleanedFinalContent &&
    (containsAssistantProtocolResidue(params.accumulatedContent) ||
      !rawFinalContent)
  ) || Boolean(
    params.hasFinalAnswerRequiredProcessBoundary &&
      !params.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary,
  );
}

export function resolveAgentStreamGracefulCompletionContent(params: {
  accumulatedContent: string;
  fallbackContent?: string;
}): string {
  const rawFinalContent = params.accumulatedContent.trim();
  const cleanedFinalContent = stripAssistantProtocolResidue(
    params.accumulatedContent,
  );

  if (cleanedFinalContent) {
    return cleanedFinalContent;
  }
  if (
    !containsAssistantProtocolResidue(params.accumulatedContent) &&
    rawFinalContent
  ) {
    return rawFinalContent;
  }
  if (params.fallbackContent !== undefined) {
    return params.fallbackContent;
  }
  return resolveAgentStreamEmptyFinalReplyFallbackContent();
}

function shouldRetainPersistedThinkingContentPart(
  part: NonNullable<Message["contentParts"]>[number],
): boolean {
  if (part.type !== "thinking") {
    return false;
  }
  const metadata = part.metadata;
  return (
    Boolean(metadata?.threadItemId) &&
    (metadata?.source === "thread_item_reasoning" ||
      metadata?.source === "agent_thread_item")
  );
}

type MessageContentPart = NonNullable<Message["contentParts"]>[number];

function isCommentaryTextContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "text" &&
    typeof part.metadata?.phase === "string" &&
    isAgentMessageCommentaryPhase(part.metadata.phase)
  );
}

function isFinalTextContentPart(
  part: MessageContentPart,
): part is Extract<MessageContentPart, { type: "text" }> {
  return part.type === "text" && !isCommentaryTextContentPart(part);
}

function completeRunningToolCallOnFinalDone(
  toolCall: NonNullable<Message["toolCalls"]>[number],
  completedAt: Date,
): NonNullable<Message["toolCalls"]>[number] {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "completed",
    endTime: completedAt,
    result: toolCall.result ?? {
      success: true,
      output: "",
    },
  };
}

function completeRunningToolCallsOnFinalDone(
  parts: Message["contentParts"],
  completedAt: Date,
): Message["contentParts"] {
  if (!parts) {
    return parts;
  }

  return parts.map((part) =>
    part.type === "tool_use"
      ? {
          ...part,
          toolCall: completeRunningToolCallOnFinalDone(
            part.toolCall,
            completedAt,
          ),
        }
      : part,
  );
}

export function reconcileAgentStreamFinalContentParts(params: {
  parts: Message["contentParts"];
  finalContent: string;
  finalTextPartMetadata?: Record<string, unknown>;
  rawContent: string;
  surfaceThinkingDeltas: boolean;
}): Message["contentParts"] {
  if (!params.parts?.length) {
    return params.finalContent
      ? [
          {
            type: "text",
            text: params.finalContent,
            ...(params.finalTextPartMetadata
              ? { metadata: params.finalTextPartMetadata }
              : {}),
          },
        ]
      : params.parts;
  }

  const visibleParts = params.surfaceThinkingDeltas
    ? params.parts
    : params.parts.filter(
        (part) =>
          part.type !== "thinking" ||
          shouldRetainPersistedThinkingContentPart(part),
      );
  if (visibleParts.length === 0) {
    return undefined;
  }

  const textContent = visibleParts
    .filter(isFinalTextContentPart)
    .map((part) => part.text)
    .join("");
  if (!textContent && params.finalContent) {
    return [
      ...visibleParts,
      {
        type: "text",
        text: params.finalContent,
        ...(params.finalTextPartMetadata
          ? { metadata: params.finalTextPartMetadata }
          : {}),
      },
    ];
  }
  const finalTextChanged =
    params.finalContent !== params.rawContent ||
    (textContent.length > 0 && textContent !== params.finalContent);

  if (!finalTextChanged) {
    return visibleParts;
  }

  if (!params.finalContent) {
    const processParts = visibleParts.filter(
      (part) => part.type !== "text" || isCommentaryTextContentPart(part),
    );
    return processParts.length > 0 ? processParts : undefined;
  }

  const textPartIndexes = visibleParts.flatMap((part, index) =>
    isFinalTextContentPart(part) ? [index] : [],
  );
  if (textPartIndexes.length === 0) {
    return [
      ...visibleParts,
      {
        type: "text",
        text: params.finalContent,
        ...(params.finalTextPartMetadata
          ? { metadata: params.finalTextPartMetadata }
          : {}),
      },
    ];
  }

  const nextParts = [...visibleParts];
  const processBoundaryIndex = visibleParts.findIndex(
    isProcessBoundaryContentPart,
  );
  const lastTextAfterProcessIndex =
    processBoundaryIndex >= 0
      ? textPartIndexes
          .slice()
          .reverse()
          .find((index) => index > processBoundaryIndex)
      : undefined;
  if (params.finalContent.startsWith(textContent)) {
    const suffix = params.finalContent.slice(textContent.length);
    if (!suffix) {
      return visibleParts;
    }
    const lastPartIndex = nextParts.length - 1;
    const lastPart = nextParts[lastPartIndex];
    if (lastPart?.type === "text") {
      if (!shouldAppendCompletionSuffixToTextPart(nextParts, lastPartIndex)) {
        return [
          ...nextParts,
          {
            type: "text",
            text: suffix,
            ...(params.finalTextPartMetadata
              ? { metadata: params.finalTextPartMetadata }
              : {}),
          },
        ];
      }
      nextParts[lastPartIndex] = {
        ...lastPart,
        type: "text",
        text: `${lastPart.text}${suffix}`,
      };
      return nextParts;
    }
    return [
      ...nextParts,
      {
        type: "text",
        text: suffix,
        ...(params.finalTextPartMetadata
          ? { metadata: params.finalTextPartMetadata }
          : {}),
      },
    ];
  }

  if (processBoundaryIndex >= 0) {
    if (lastTextAfterProcessIndex !== undefined) {
      const prefixBeforeLast = textPartIndexes
        .filter((index) => index < lastTextAfterProcessIndex)
        .map((index) => {
          const part = visibleParts[index];
          return part?.type === "text" ? part.text : "";
        })
        .join("");
      const nextText =
        prefixBeforeLast && params.finalContent.startsWith(prefixBeforeLast)
          ? params.finalContent.slice(prefixBeforeLast.length)
          : params.finalContent;
      nextParts[lastTextAfterProcessIndex] = {
        type: "text",
        text: nextText,
        ...(params.finalTextPartMetadata
          ? { metadata: params.finalTextPartMetadata }
          : {}),
      };
      return nextParts;
    }

    return [
      ...nextParts,
      {
        type: "text",
        text: params.finalContent,
        ...(params.finalTextPartMetadata
          ? { metadata: params.finalTextPartMetadata }
          : {}),
      },
    ];
  }

  if (textPartIndexes.length === 1) {
    nextParts[textPartIndexes[0]!] = {
      type: "text",
      text: params.finalContent,
    };
    return nextParts;
  }

  const textParts = textPartIndexes.map((index) => {
    const part = visibleParts[index];
    return part?.type === "text" ? part.text : "";
  });
  const prefixBeforeLast = textParts.slice(0, -1).join("");
  if (params.finalContent.startsWith(prefixBeforeLast)) {
    const lastTextIndex = textPartIndexes[textPartIndexes.length - 1]!;
    nextParts[lastTextIndex] = {
      type: "text",
      text: params.finalContent.slice(prefixBeforeLast.length),
    };
    return nextParts;
  }

  const firstTextIndex = textPartIndexes[0]!;
  const indexesToDrop = new Set(textPartIndexes.slice(1));
  return nextParts.flatMap((part, index) => {
    if (index === firstTextIndex) {
      return [{ type: "text" as const, text: params.finalContent }];
    }
    return indexesToDrop.has(index) ? [] : [part];
  });
}

function normalizeCompletionTextSignature(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function mergeVisibleCompletionText(base: string, chunk: string): string {
  if (!base) return chunk;
  if (!chunk) return base;
  if (chunk.startsWith(base)) return chunk;
  if (base.endsWith(chunk)) return base;

  const maxOverlap = Math.min(base.length, chunk.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (base.slice(-length) === chunk.slice(0, length)) {
      return `${base}${chunk.slice(length)}`;
    }
  }

  return `${base}\n\n${chunk}`;
}

export function resolveAgentStreamCompletedVisibleContent(params: {
  finalContent: string;
  previousContent?: string;
}): string {
  const previousContent = params.previousContent?.trim() || "";
  const finalContent = params.finalContent.trim();
  if (!previousContent) {
    return finalContent;
  }
  if (!finalContent) {
    return previousContent;
  }

  const previousSignature = normalizeCompletionTextSignature(previousContent);
  const finalSignature = normalizeCompletionTextSignature(finalContent);
  if (!previousSignature) {
    return finalContent;
  }
  if (!finalSignature) {
    return previousContent;
  }
  if (previousSignature === finalSignature) {
    return finalContent;
  }
  if (finalSignature.includes(previousSignature)) {
    return finalContent;
  }
  if (previousSignature.includes(finalSignature)) {
    return previousContent;
  }

  return mergeVisibleCompletionText(previousContent, finalContent);
}

export function buildAgentStreamCompletedAssistantMessagePatch(params: {
  finalContent: string;
  finalTextPartMetadata?: Record<string, unknown>;
  parts: Message["contentParts"];
  previousContent?: string;
  preserveThinkingContent?: boolean;
  rawContent: string;
  surfaceThinkingDeltas: boolean;
  thinkingContent?: string;
  toolCalls?: Message["toolCalls"];
  usage?: Message["usage"];
}): Pick<Message, "content" | "contentParts" | "isThinking" | "runtimeStatus"> &
  Partial<Pick<Message, "thinkingContent">> &
  Partial<Pick<Message, "toolCalls" | "usage">> {
  const shouldRetainThinkingContent =
    params.surfaceThinkingDeltas || params.preserveThinkingContent === true;
  const retainedThinkingContent = shouldRetainThinkingContent
    ? params.thinkingContent?.trim() || undefined
    : undefined;
  const finalContent = resolveAgentStreamCompletedVisibleContent({
    finalContent: params.finalContent,
    previousContent: params.previousContent,
  });
  const completedAt = new Date();

  return {
    isThinking: false,
    content: finalContent,
    thinkingContent: retainedThinkingContent,
    contentParts: completeRunningToolCallsOnFinalDone(
      reconcileAgentStreamFinalContentParts({
        parts: params.parts,
        finalContent,
        finalTextPartMetadata: params.finalTextPartMetadata,
        rawContent: params.rawContent,
        surfaceThinkingDeltas: shouldRetainThinkingContent,
      }),
      completedAt,
    ),
    toolCalls: params.toolCalls?.map((toolCall) =>
      completeRunningToolCallOnFinalDone(toolCall, completedAt),
    ),
    runtimeStatus: undefined,
    ...(params.usage !== undefined ? { usage: params.usage } : {}),
  };
}

export function buildAgentStreamFinalDonePlan(params: {
  accumulatedContent: string;
  fallbackContent?: string | null;
  hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary?: boolean;
  hasFinalAnswerRequiredProcessBoundary?: boolean;
  hasMeaningfulCompletionSignal?: boolean;
  queuedTurnId?: string | null;
  toolCallCount: number;
  usage?: Message["usage"];
}): AgentStreamFinalDonePlan {
  if (
    shouldFailAgentStreamMissingFinalReply({
      accumulatedContent: params.accumulatedContent,
      hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary:
        params.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary,
      hasFinalAnswerRequiredProcessBoundary:
        params.hasFinalAnswerRequiredProcessBoundary,
      hasMeaningfulCompletionSignal: params.hasMeaningfulCompletionSignal,
    })
  ) {
    return buildAgentStreamMissingFinalReplyFailurePlan({
      errorMessage: resolveAgentStreamEmptyFinalReplyErrorMessage(),
      queuedTurnId: params.queuedTurnId,
      usage: params.usage,
    });
  }

  return {
    type: "complete",
    finalContent: resolveAgentStreamGracefulCompletionContent({
      accumulatedContent: params.accumulatedContent,
      fallbackContent: params.fallbackContent ?? undefined,
    }),
    queuedTurnIds: resolveQueuedTurnIds(params.queuedTurnId),
    requestLogPayload: {
      eventType: "chat_request_complete",
      status: "success",
      description: `请求完成，工具调用 ${params.toolCallCount} 次`,
    },
  };
}

export function buildAgentStreamEmptyFinalErrorPlan(params: {
  errorMessage: string;
  accumulatedContent: string;
  fallbackContent?: string | null;
  hasMeaningfulCompletionSignal?: boolean;
  queuedTurnId?: string | null;
}): AgentStreamEmptyFinalErrorPlan {
  if (!params.hasMeaningfulCompletionSignal) {
    return buildAgentStreamMissingFinalReplyFailurePlan({
      errorMessage: params.errorMessage,
      queuedTurnId: params.queuedTurnId,
    });
  }

  return {
    type: "complete",
    finalContent: resolveAgentStreamGracefulCompletionContent({
      accumulatedContent: params.accumulatedContent,
      fallbackContent: params.fallbackContent ?? undefined,
    }),
    queuedTurnIds: resolveQueuedTurnIds(params.queuedTurnId),
    requestLogPayload: {
      eventType: "chat_request_complete",
      status: "success",
      description: "请求完成，模型未补充最终总结，已降级保留当前过程结果",
    },
  };
}
