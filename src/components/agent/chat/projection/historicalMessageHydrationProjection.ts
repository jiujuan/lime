import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "./agentUiEventProjection";

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
    (message.actionRequests?.length ?? 0) === 0
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
    const content = message.content.trim();
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

function definedString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveHistoricalHydrationPhase(
  input: HistoricalHydrationProjectionInput,
): AgentUiPhase {
  if (
    input.isHistoricalTimelineReady &&
    input.historicalMarkdownDeferredCount === 0 &&
    input.historicalContentPartsDeferredCount === 0 &&
    !input.shouldDeferThreadItemsScan &&
    !input.shouldDeferTailRuntimeStatusLine
  ) {
    return "completed";
  }

  return "hydrating";
}

function buildHydrationPayload(
  input: HistoricalHydrationProjectionInput,
): Record<string, unknown> {
  return {
    recordReason: definedString(input.recordReason),
    isRestoringSession: Boolean(input.isRestoringSession),
    isRestoredHistoryWindow: input.isRestoredHistoryWindow,
    isHistoricalTimelineReady: input.isHistoricalTimelineReady,
    canBuildHistoricalTimeline: Boolean(input.canBuildHistoricalTimeline),
    shouldDeferHistoricalTimeline: Boolean(input.shouldDeferHistoricalTimeline),
    shouldDeferThreadItemsScan: Boolean(input.shouldDeferThreadItemsScan),
    shouldDeferTailRuntimeStatusLine: Boolean(
      input.shouldDeferTailRuntimeStatusLine,
    ),
    hiddenHistoryCount: input.hiddenHistoryCount,
    persistedHiddenHistoryCount: input.persistedHiddenHistoryCount,
    targetCount: input.targetCount,
    hydratedHistoricalMarkdownCount: input.hydratedHistoricalMarkdownCount,
    historicalMarkdownDeferredCount: input.historicalMarkdownDeferredCount,
    historicalContentPartsDeferredCount:
      input.historicalContentPartsDeferredCount,
    messagesCount: input.messagesCount,
    visibleMessagesCount: input.visibleMessagesCount,
    renderedMessagesCount: input.renderedMessagesCount,
    renderedTurnsCount: input.renderedTurnsCount ?? 0,
    threadItemsCount: input.threadItemsCount ?? 0,
    messageListComputeMs: input.messageListComputeMs ?? 0,
  };
}

export function buildHistoricalHydrationProjectionEvents(
  input: HistoricalHydrationProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const shouldProject =
    input.isRestoringSession ||
    input.isRestoredHistoryWindow ||
    input.hiddenHistoryCount > 0 ||
    input.persistedHiddenHistoryCount > 0;
  if (!shouldProject) {
    return [];
  }

  const phase = resolveHistoricalHydrationPhase(input);
  const payload = buildHydrationPayload(input);
  const base = {
    sourceType: "hydration_projection" as const,
    timestamp: context.timestamp,
    sessionId: definedString(input.sessionId ?? context.sessionId ?? undefined),
    threadId: definedString(input.threadId ?? context.threadId ?? undefined),
  };
  const events: AgentUiProjectionEvent[] = [
    {
      ...base,
      sequence: context.sequence,
      type: "session.hydrated",
      owner: "session",
      scope: "session",
      phase,
      surface: "session_tabs",
      persistence: "snapshot",
      payload,
    },
    {
      ...base,
      sequence:
        typeof context.sequence === "number" ? context.sequence + 1 : undefined,
      type: "messages.snapshot",
      owner: "session",
      scope: "thread",
      phase,
      surface: "conversation",
      persistence: "snapshot",
      payload,
    },
  ];

  if (phase === "hydrating") {
    events.push({
      ...base,
      sequence:
        typeof context.sequence === "number" ? context.sequence + 2 : undefined,
      type: "diagnostic.changed",
      owner: "diagnostics",
      scope: "session",
      phase: "hydrating",
      surface: "diagnostics",
      persistence: "diagnostics_log",
      payload: {
        ...payload,
        diagnosticKey: "historical_hydration_stale_window",
        stale: true,
      },
      refs: {
        diagnosticKeys: ["historical_hydration_stale_window"],
      },
    });
  }

  return events;
}
