import type {
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";

import { definedString } from "./normalization.js";

export interface AgentUiHistoricalHydrationProjectionInput {
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

const HISTORICAL_HYDRATION_STALE_DIAGNOSTIC_KEY =
  "historical_hydration_stale_window";

export function buildAgentUiHistoricalHydrationEvents(
  input: AgentUiHistoricalHydrationProjectionInput,
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

  const phase = resolveAgentUiHistoricalHydrationPhase(input);
  const payload = buildAgentUiHistoricalHydrationPayload(input);
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
        diagnosticKey: HISTORICAL_HYDRATION_STALE_DIAGNOSTIC_KEY,
        stale: true,
      },
      refs: {
        diagnosticKeys: [HISTORICAL_HYDRATION_STALE_DIAGNOSTIC_KEY],
      },
    });
  }

  return events;
}

export function resolveAgentUiHistoricalHydrationPhase(
  input: AgentUiHistoricalHydrationProjectionInput,
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

export function buildAgentUiHistoricalHydrationPayload(
  input: AgentUiHistoricalHydrationProjectionInput,
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
