import type { AgentSessionDetail } from "@/lib/api/agentRuntime/sessionTypes";
import type { ContentPart, Message } from "../types";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import { extractThinkingContentFromParts } from "./agentChatHistoryPrimitives";
import {
  hasRenderableAssistantTextContent,
  settleCompletedAssistantRunningToolState,
} from "./agentChatHistoryProcess";

export const normalizeHistoryMessage = (message: Message): Message | null => {
  if (message.role !== "user") {
    return settleCompletedAssistantRunningToolState(message);
  }

  const text = message.content.trim();
  const hasImages = Array.isArray(message.images) && message.images.length > 0;
  if (text.length > 0 || hasImages) return message;

  const hasToolCalls =
    Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
  const hasOnlyToolUseParts =
    Array.isArray(message.contentParts) &&
    message.contentParts.length > 0 &&
    message.contentParts.every((part) => part.type === "tool_use");

  if (hasToolCalls || hasOnlyToolUseParts) {
    return {
      ...message,
      role: "assistant",
    };
  }

  return null;
};

export const normalizeHistoryMessages = (messages: Message[]): Message[] =>
  messages
    .map((msg) => normalizeHistoryMessage(msg))
    .filter((msg): msg is Message => msg !== null);

export const hasLegacyFallbackToolNames = (messages: Message[]): boolean =>
  messages.some((message) =>
    (message.toolCalls || []).some((toolCall) =>
      /^工具调用\s+call_[0-9a-z]+$/i.test(toolCall.name.trim()),
    ),
  );

export const resolveHistoryToolName = (
  toolId: string,
  nameById: Map<string, string>,
): string => {
  const existing = nameById.get(toolId);
  if (existing && existing.trim()) {
    return existing.trim();
  }
  const shortId = toolId.trim().slice(0, 8);
  return shortId ? `工具调用 ${shortId}` : "工具调用";
};

export function normalizeHistoricalTopicSnapshotMessage(
  message: Message,
): Message {
  if (
    message.role !== "assistant" ||
    message.isThinking ||
    !hasRenderableAssistantTextContent(message)
  ) {
    return message;
  }

  if (isRetainedSkillProcessMessage(message)) {
    return {
      ...message,
      thinkingContent:
        message.thinkingContent ??
        extractThinkingContentFromParts(message.contentParts),
    };
  }

  const visibleContentParts = (message.contentParts || []).filter(
    (part) => part.type === "text" || part.type === "action_required",
  );
  const contentText = message.content.trim();
  const contentParts =
    visibleContentParts.length > 0
      ? visibleContentParts
      : contentText
        ? [{ type: "text", text: contentText } satisfies ContentPart]
        : undefined;

  return {
    ...message,
    thinkingContent: undefined,
    contentParts,
  };
}

export const normalizeHistoricalTopicSnapshotMessages = (
  messages: Message[],
): Message[] => messages.map(normalizeHistoricalTopicSnapshotMessage);

export function compactHistoricalRestoreMessage(message: Message): Message {
  const normalized = normalizeHistoricalTopicSnapshotMessage(message);
  if (normalized.role !== "assistant") {
    return normalized;
  }

  return {
    ...normalized,
    toolCalls: undefined,
    actionRequests: undefined,
    contextTrace: undefined,
  };
}

export const compactHistoricalRestoreMessages = (
  messages: Message[],
): Message[] =>
  normalizeHistoryMessages(messages)
    .map(compactHistoricalRestoreMessage)
    .filter((message) => {
      if (message.role !== "assistant") {
        return true;
      }

      if (hasRenderableAssistantTextContent(message)) {
        return true;
      }

      return (
        (message.images?.length || 0) > 0 ||
        (message.artifacts?.length || 0) > 0 ||
        Boolean(message.imageWorkbenchPreview) ||
        Boolean(message.taskPreview)
      );
    });

export const shouldCompactCompletedSessionHistory = (
  detail: AgentSessionDetail,
): boolean => {
  const historyLimit =
    typeof detail.history_limit === "number" &&
    Number.isFinite(detail.history_limit) &&
    detail.history_limit > 0
      ? Math.trunc(detail.history_limit)
      : null;

  if (historyLimit === null) {
    return false;
  }

  const hasActiveTurn = (detail.turns || []).some(
    (turn) => turn.status === "running",
  );
  const hasActiveItem = (detail.items || []).some(
    (item) => item.status === "in_progress",
  );
  const hasQueuedTurn = (detail.queued_turns || []).length > 0;

  return !hasActiveTurn && !hasActiveItem && !hasQueuedTurn;
};
