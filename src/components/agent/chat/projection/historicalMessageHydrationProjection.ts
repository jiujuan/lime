import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "./agentUiEventProjection";
import { buildAgentUiHistoricalHydrationEvents } from "@limecloud/agent-runtime-projection";

export interface HistoricalConversationMessageLike {
  id: string;
  role: string;
  content: string;
  isThinking?: boolean;
  thinkingContent?: string;
  toolCalls?: readonly unknown[];
  actionRequests?: readonly unknown[];
  contentParts?: readonly unknown[];
}

export interface HistoricalMessageHydrationState {
  isRestoredHistoryWindow: boolean;
  focusedTimelineItemId?: string | null;
  isSending?: boolean;
  activeCurrentTurnId?: string | null;
}

export interface HistoricalHydrationProjectionInput {
  sessionId?: string | null;
  threadId?: string | null;
  recordReason?: string | null;
  isRestoringSession?: boolean;
  isRestoredHistoryWindow: boolean;
  isHistoricalTimelineReady: boolean;
  canBuildHistoricalTimeline?: boolean;
  shouldDeferHistoricalTimeline?: boolean;
  shouldDeferThreadItemsScan?: boolean;
  shouldDeferTailRuntimeStatusLine?: boolean;
  hiddenHistoryCount: number;
  persistedHiddenHistoryCount: number;
  targetCount: number;
  hydratedHistoricalMarkdownCount: number;
  historicalMarkdownDeferredCount: number;
  historicalContentPartsDeferredCount: number;
  messagesCount: number;
  visibleMessagesCount: number;
  renderedMessagesCount: number;
  renderedTurnsCount?: number;
  threadItemsCount?: number;
  messageListComputeMs?: number;
}

const STRUCTURED_HISTORY_CONTENT_RE = /<a2ui|```\s*a2ui|<write_file|<document/i;

export function hasStructuredHistoricalContentHint(content: string): boolean {
  return STRUCTURED_HISTORY_CONTENT_RE.test(content);
}

function resolveHistoricalMessageHydrationText(
  message: HistoricalConversationMessageLike,
): string {
  const content = message.content.trim();
  if (content) {
    return content;
  }

  for (
    let index = (message.contentParts?.length ?? 0) - 1;
    index >= 0;
    index -= 1
  ) {
    const part = message.contentParts?.[index];
    if (!part || typeof part !== "object") {
      continue;
    }

    const record = part as { type?: unknown; text?: unknown };
    if (record.type !== "text" || typeof record.text !== "string") {
      continue;
    }

    const text = record.text.trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function hasPlainHistoricalContentParts(
  contentParts?: readonly unknown[],
): boolean {
  if ((contentParts?.length ?? 0) === 0) {
    return true;
  }

  return (contentParts || []).every((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }
    return (part as { type?: unknown }).type === "text";
  });
}

export function isHistoricalAssistantMessageHydrationCandidate<
  TMessage extends HistoricalConversationMessageLike,
>(message: TMessage, state: HistoricalMessageHydrationState): boolean {
  return (
    state.isRestoredHistoryWindow &&
    !state.focusedTimelineItemId &&
    !state.isSending &&
    !state.activeCurrentTurnId &&
    message.role === "assistant" &&
    !message.isThinking &&
    !message.thinkingContent &&
    (message.toolCalls?.length ?? 0) === 0 &&
    (message.actionRequests?.length ?? 0) === 0 &&
    hasPlainHistoricalContentParts(message.contentParts)
  );
}

export function buildHistoricalMarkdownHydrationTargets<
  TMessage extends HistoricalConversationMessageLike,
>(params: {
  messages: readonly TMessage[];
  state: HistoricalMessageHydrationState;
}): string[] {
  if (!params.state.isRestoredHistoryWindow) {
    return [];
  }

  const targetIds: string[] = [];
  for (const message of params.messages) {
    const content = resolveHistoricalMessageHydrationText(message);
    if (
      content &&
      !hasStructuredHistoricalContentHint(content) &&
      isHistoricalAssistantMessageHydrationCandidate(message, params.state)
    ) {
      targetIds.push(message.id);
    }
  }
  return targetIds;
}

export function buildHistoricalMarkdownHydrationIndexByMessageId(
  targetIds: readonly string[],
): Map<string, number> {
  const indexed = new Map<string, number>();
  targetIds.forEach((messageId, index) => {
    indexed.set(messageId, index);
  });
  return indexed;
}

export function isHistoricalMarkdownHydrated(params: {
  messageId: string;
  hydrationIndexByMessageId: ReadonlyMap<string, number>;
  hydratedHistoricalMarkdownCount: number;
}): boolean {
  const hydrationIndex = params.hydrationIndexByMessageId.get(params.messageId);
  return (
    hydrationIndex === undefined ||
    hydrationIndex < params.hydratedHistoricalMarkdownCount
  );
}

export function shouldDeferHistoricalAssistantMessageDetails<
  TMessage extends HistoricalConversationMessageLike,
>(params: {
  message: TMessage;
  state: HistoricalMessageHydrationState;
  isHistoricalTimelineReady: boolean;
  hydrationIndexByMessageId: ReadonlyMap<string, number>;
  hydratedHistoricalMarkdownCount: number;
}): boolean {
  return (
    isHistoricalAssistantMessageHydrationCandidate(
      params.message,
      params.state,
    ) &&
    (!params.isHistoricalTimelineReady ||
      !isHistoricalMarkdownHydrated({
        messageId: params.message.id,
        hydrationIndexByMessageId: params.hydrationIndexByMessageId,
        hydratedHistoricalMarkdownCount: params.hydratedHistoricalMarkdownCount,
      }))
  );
}

export function countDeferredHistoricalContentParts<
  TMessage extends HistoricalConversationMessageLike,
>(params: {
  messages: readonly TMessage[];
  state: HistoricalMessageHydrationState;
  isHistoricalTimelineReady: boolean;
  hydrationIndexByMessageId: ReadonlyMap<string, number>;
  hydratedHistoricalMarkdownCount: number;
}): number {
  if (!params.state.isRestoredHistoryWindow) {
    return 0;
  }

  let count = 0;
  for (const message of params.messages) {
    if (
      (message.contentParts?.length ?? 0) > 0 &&
      shouldDeferHistoricalAssistantMessageDetails({
        message,
        state: params.state,
        isHistoricalTimelineReady: params.isHistoricalTimelineReady,
        hydrationIndexByMessageId: params.hydrationIndexByMessageId,
        hydratedHistoricalMarkdownCount: params.hydratedHistoricalMarkdownCount,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

export function countDeferredHistoricalMarkdown(params: {
  isRestoredHistoryWindow: boolean;
  targetCount: number;
  hydratedHistoricalMarkdownCount: number;
}): number {
  if (!params.isRestoredHistoryWindow) {
    return 0;
  }
  return Math.max(
    0,
    params.targetCount - params.hydratedHistoricalMarkdownCount,
  );
}

export function buildHistoricalHydrationProjectionEvents(
  input: HistoricalHydrationProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  return buildAgentUiHistoricalHydrationEvents(input, context);
}
