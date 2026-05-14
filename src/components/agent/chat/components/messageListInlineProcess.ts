import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import { isRetainedSkillProcessMessage } from "../utils/skillInlineProcessRetention";
import {
  isRuntimeStatusDiagnosticsOnly,
  shouldHideTurnSummaryFromConversation,
} from "../utils/turnSummaryPresentation";

export function isDeferredTimelineItem(item: AgentThreadItem): boolean {
  return item.type === "file_artifact" || item.type === "turn_summary";
}

function normalizeDeferredArtifactPath(path?: string | null): string {
  return (path || "").trim().replace(/\\/g, "/").toLowerCase();
}

function scoreDeferredArtifactItem(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
): number {
  const contentScore = (item.content || "").trim().length;
  const completedAt = Date.parse(item.completed_at || item.updated_at || "");
  const timestampScore = Number.isFinite(completedAt) ? completedAt : 0;
  return contentScore * 1_000_000_000 + timestampScore;
}

export function dedupeDeferredTimelineItems(
  items: AgentThreadItem[],
): AgentThreadItem[] {
  const deduped: AgentThreadItem[] = [];
  const artifactIndexByPath = new Map<string, number>();

  for (const item of items) {
    if (item.type !== "file_artifact") {
      deduped.push(item);
      continue;
    }

    const normalizedPath = normalizeDeferredArtifactPath(item.path);
    if (!normalizedPath) {
      deduped.push(item);
      continue;
    }

    const existingIndex = artifactIndexByPath.get(normalizedPath);
    if (existingIndex === undefined) {
      artifactIndexByPath.set(normalizedPath, deduped.length);
      deduped.push(item);
      continue;
    }

    const existingItem = deduped[existingIndex];
    if (
      existingItem?.type !== "file_artifact" ||
      scoreDeferredArtifactItem(item) >= scoreDeferredArtifactItem(existingItem)
    ) {
      deduped[existingIndex] = item;
    }
  }

  return deduped;
}

export function shouldRenderConversationTimelineItem(
  item: AgentThreadItem,
  timelineItems: AgentThreadItem[],
  options?: {
    hasInlineRuntimeStatus?: boolean;
  },
): boolean {
  if (item.type === "user_message" || item.type === "agent_message") {
    return false;
  }

  if (item.type !== "turn_summary") {
    return true;
  }

  if (shouldHideTurnSummaryFromConversation(item)) {
    return false;
  }

  if (item.status === "in_progress" && options?.hasInlineRuntimeStatus) {
    return false;
  }

  if (item.status !== "completed") {
    return true;
  }

  return !timelineItems.some(
    (entry) => entry.id !== item.id && entry.type !== "turn_summary",
  );
}

export function hasTimelineProcessItems(items?: AgentThreadItem[]): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.type === "plan" ||
        item.type === "reasoning" ||
        item.type === "tool_call" ||
        item.type === "command_execution" ||
        item.type === "web_search" ||
        item.type === "context_compaction",
    ),
  );
}

function hasInlineThinkingContent(message: Message): boolean {
  return (
    Boolean(message.thinkingContent?.trim()) ||
    Boolean(
      message.contentParts?.some(
        (part) => part.type === "thinking" && part.text.trim().length > 0,
      ),
    )
  );
}

export function resolveInlineThinkingContent(
  message: Message,
): string | undefined {
  const explicitThinking = message.thinkingContent?.trim()
    ? message.thinkingContent
    : undefined;
  if (explicitThinking) {
    return explicitThinking;
  }

  const thinkingText = (message.contentParts || [])
    .filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "thinking"; text: string }
      > => part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");

  return thinkingText.trim() ? thinkingText : undefined;
}

function hasNonTextInlineProcessPart(message: Message): boolean {
  return Boolean(
    message.contentParts?.some(
      (part) => part.type !== "text" && part.type !== "thinking",
    ),
  );
}

function shouldSuppressAmbientStreamingReasoning(
  message: Message,
  displayContent: string,
): boolean {
  if (
    !hasInlineThinkingContent(message) ||
    displayContent.trim() ||
    !isRuntimeStatusDiagnosticsOnly(message.runtimeStatus)
  ) {
    return false;
  }

  if (
    hasNonTextInlineProcessPart(message) ||
    (message.toolCalls || []).length > 0 ||
    (message.actionRequests || []).length > 0
  ) {
    return false;
  }

  return true;
}

export function shouldKeepInlineProcessForActiveAssistant(
  message: Message,
  isConversationTailAssistant: boolean,
  hasProcessTimelineItems: boolean,
  hasTurnContext: boolean,
  displayContent: string,
  isSending: boolean,
): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (message.isThinking) {
    if (shouldSuppressAmbientStreamingReasoning(message, displayContent)) {
      return false;
    }
    return true;
  }

  if (
    isRetainedSkillProcessMessage(message) &&
    hasInlineThinkingContent(message)
  ) {
    return true;
  }

  if (!isConversationTailAssistant) {
    return false;
  }

  if (
    hasTurnContext &&
    !hasProcessTimelineItems &&
    hasInlineThinkingContent(message)
  ) {
    return true;
  }

  if (
    !hasTurnContext &&
    message.runtimeTurnId?.trim() &&
    hasInlineThinkingContent(message)
  ) {
    return true;
  }

  const hasRunningToolCall =
    (message.toolCalls || []).some(
      (toolCall) => toolCall.status === "running",
    ) ||
    (message.contentParts || []).some(
      (part) => part.type === "tool_use" && part.toolCall.status === "running",
    );
  const hasPendingActionRequest =
    (message.actionRequests || []).some(
      (request) => request.status !== "submitted",
    ) ||
    (message.contentParts || []).some(
      (part) =>
        part.type === "action_required" &&
        part.actionRequired.status !== "submitted",
    );
  const hasActiveRuntimeStatus =
    Boolean(message.runtimeStatus) &&
    (message.isThinking || isSending) &&
    message.runtimeStatus?.phase !== "failed" &&
    message.runtimeStatus?.phase !== "cancelled";

  return (
    hasRunningToolCall || hasPendingActionRequest || hasActiveRuntimeStatus
  );
}

function isPreAnswerThinkingTimelineItem(item: AgentThreadItem): boolean {
  if (item.status === "failed") {
    return false;
  }

  return (
    item.type === "plan" ||
    item.type === "reasoning" ||
    item.type === "turn_summary" ||
    item.type === "context_compaction"
  );
}

export function shouldSuppressPreAnswerThinkingTimeline(params: {
  message: Message;
  turn: AgentThreadTurn;
  items: AgentThreadItem[];
  displayContent: string;
}): boolean {
  if (
    !params.message.isThinking ||
    params.turn.status === "completed" ||
    params.displayContent.trim() ||
    params.items.length === 0
  ) {
    return false;
  }

  return params.items.every(isPreAnswerThinkingTimelineItem);
}

export interface InlineProcessCoverage {
  hasInlineProcessEntries: boolean;
  thinking: boolean;
  toolNameCounts: Map<string, number>;
  actionRequestCounts: Map<string, number>;
}

function normalizeInlineCoverageKey(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function incrementInlineCoverageCount(
  counts: Map<string, number>,
  key: string | null,
) {
  if (!key) {
    return;
  }
  counts.set(key, (counts.get(key) || 0) + 1);
}

function consumeInlineCoverageCount(
  counts: Map<string, number>,
  key: string | null,
): boolean {
  if (!key) {
    return false;
  }
  const current = counts.get(key) || 0;
  if (current <= 0) {
    return false;
  }
  if (current === 1) {
    counts.delete(key);
  } else {
    counts.set(key, current - 1);
  }
  return true;
}

export function createInlineCoverageMatcher(coverage: InlineProcessCoverage) {
  const remainingToolNameCounts = new Map(coverage.toolNameCounts);
  const remainingActionRequestCounts = new Map(coverage.actionRequestCounts);

  return (item: AgentThreadItem): boolean => {
    switch (item.type) {
      case "reasoning":
        return coverage.thinking;
      case "tool_call":
        return consumeInlineCoverageCount(
          remainingToolNameCounts,
          normalizeInlineCoverageKey(item.tool_name),
        );
      case "approval_request":
      case "request_user_input":
        return consumeInlineCoverageCount(
          remainingActionRequestCounts,
          normalizeInlineCoverageKey(item.request_id),
        );
      default:
        return false;
    }
  };
}

export function resolveInlineProcessCoverage(params: {
  contentParts?: Message["contentParts"];
  thinkingContent?: string;
  toolCalls?: Message["toolCalls"];
  actionRequests?: Message["actionRequests"];
}): InlineProcessCoverage {
  const contentParts = params.contentParts || [];
  const toolNameCounts = new Map<string, number>();
  const actionRequestCounts = new Map<string, number>();
  let thinking = false;

  if (contentParts.length > 0) {
    thinking = contentParts.some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    );
    contentParts.forEach((part) => {
      if (part.type === "tool_use") {
        incrementInlineCoverageCount(
          toolNameCounts,
          normalizeInlineCoverageKey(part.toolCall.name),
        );
        return;
      }
      if (part.type === "action_required") {
        incrementInlineCoverageCount(
          actionRequestCounts,
          normalizeInlineCoverageKey(part.actionRequired.requestId),
        );
      }
    });
  } else {
    thinking = Boolean(params.thinkingContent?.trim());
    (params.toolCalls || []).forEach((toolCall) => {
      incrementInlineCoverageCount(
        toolNameCounts,
        normalizeInlineCoverageKey(toolCall.name),
      );
    });
  }

  (params.actionRequests || []).forEach((actionRequest) => {
    const actionKey = normalizeInlineCoverageKey(actionRequest.requestId);
    if (actionKey && !actionRequestCounts.has(actionKey)) {
      incrementInlineCoverageCount(actionRequestCounts, actionKey);
    }
  });

  return {
    hasInlineProcessEntries:
      thinking || toolNameCounts.size > 0 || actionRequestCounts.size > 0,
    thinking,
    toolNameCounts,
    actionRequestCounts,
  };
}

export function filterConversationDisplayContentParts(
  parts: Message["contentParts"] | undefined,
  options: {
    includeProcessFlow: boolean;
    preserveToolUseParts: boolean;
  },
): Message["contentParts"] | undefined {
  if (!parts || parts.length === 0 || options.includeProcessFlow) {
    return parts;
  }

  const filtered = parts.filter((part) => {
    if (part.type === "thinking") {
      return false;
    }

    if (part.type === "tool_use") {
      return options.preserveToolUseParts;
    }

    return true;
  });
  return filtered.length > 0 ? filtered : undefined;
}

export function mergeStreamingOverlayContentParts(
  parts: Message["contentParts"] | undefined,
  overlayContent: string | null,
): Message["contentParts"] | undefined {
  if (!overlayContent) {
    return parts;
  }

  const textPart: NonNullable<Message["contentParts"]>[number] = {
    type: "text",
    text: overlayContent,
  };
  if (!parts?.length) {
    return [textPart];
  }

  const firstTextIndex = parts.findIndex((part) => part.type === "text");
  if (firstTextIndex < 0) {
    return [...parts, textPart];
  }

  return parts.flatMap<NonNullable<Message["contentParts"]>[number]>(
    (part, index) => {
      if (part.type !== "text") {
        return [part];
      }
      return index === firstTextIndex ? [textPart] : [];
    },
  );
}
