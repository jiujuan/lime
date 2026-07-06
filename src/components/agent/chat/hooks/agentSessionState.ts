import type {
  AsterExecutionStrategy,
  AsterSessionExecutionRuntime,
  AsterSubagentParentContext,
  AsterSubagentSessionInfo,
  AgentRuntimeThreadReadModel,
  AsterTodoItem,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { normalizeQueuedTurnSnapshots } from "@/lib/api/queuedTurn";
import { resolveRestorableSessionId } from "@/lib/asterSessionRecovery";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import type { Topic } from "./agentChatShared";
import type { AgentSessionCachedSnapshot } from "./agentSessionScopedStorage";
import { normalizeLegacyThreadItems } from "@/lib/api/agentTextNormalization";
import {
  hydrateSessionDetailMessages,
  mergeThreadItemReasoningIntoMessages,
  mergeHydratedMessagesWithLocalState,
  normalizeHistoricalTopicSnapshotMessages,
  shouldCompactCompletedSessionHistory,
} from "./agentChatHistory";
import {
  filterConversationThreadItems,
  mergeThreadItems,
  mergeThreadTurns,
} from "../utils/threadTimelineView";
import {
  mergeRuntimeSyncThreadItems,
  normalizeAgentSessionDetailMergeMode,
  resolveAgentSessionTimelineMergeDecision,
  shouldPreserveDetachedLocalSnapshot,
  type AgentSessionDetailMergeMode,
} from "./agentSessionTimelineMergePolicy";
import { collectDetailThreadItems } from "./agentChatHistoryThreadItems";
import { createExecutionRuntimeFromSessionDetail } from "../utils/sessionExecutionRuntime";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { isAuxiliaryAgentSessionId } from "@/lib/api/agentRuntime/sessionIdentity";

export interface AgentSessionSnapshot {
  sessionId: string | null;
  workingDir: string | null;
  messages: Message[];
  threadTurns: AgentThreadTurn[];
  threadItems: AgentThreadItem[];
  currentTurnId: string | null;
  queuedTurns: QueuedTurnSnapshot[];
  threadRead: AgentRuntimeThreadReadModel | null;
  executionRuntime: AsterSessionExecutionRuntime | null;
  todoItems: AsterTodoItem[];
  childSubagentSessions: AsterSubagentSessionInfo[];
  subagentParentContext: AsterSubagentParentContext | null;
}

export type { AgentSessionDetailMergeMode } from "./agentSessionTimelineMergePolicy";

export function createEmptyAgentSessionSnapshot(options?: {
  executionRuntime?: AsterSessionExecutionRuntime | null;
  workingDir?: string | null;
}): AgentSessionSnapshot {
  return {
    sessionId: null,
    workingDir: options?.workingDir?.trim() || null,
    messages: [],
    threadTurns: [],
    threadItems: [],
    currentTurnId: null,
    queuedTurns: [],
    threadRead: null,
    executionRuntime: options?.executionRuntime ?? null,
    todoItems: [],
    childSubagentSessions: [],
    subagentParentContext: null,
  };
}

function resolveCurrentTurnIdFromTimeline(params: {
  turns: AgentThreadTurn[];
  items: AgentThreadItem[];
  preferredTurns?: AgentThreadTurn[];
  preferredItems?: AgentThreadItem[];
}): string | null {
  for (
    let index = (params.preferredTurns?.length ?? 0) - 1;
    index >= 0;
    index -= 1
  ) {
    const turnId = params.preferredTurns?.[index]?.id;
    if (typeof turnId === "string" && turnId.trim().length > 0) {
      return turnId;
    }
  }
  for (
    let index = (params.preferredItems?.length ?? 0) - 1;
    index >= 0;
    index -= 1
  ) {
    const turnId = params.preferredItems?.[index]?.turn_id;
    if (typeof turnId === "string" && turnId.trim().length > 0) {
      return turnId;
    }
  }
  for (let index = params.items.length - 1; index >= 0; index -= 1) {
    const turnId = params.items[index]?.turn_id;
    if (typeof turnId === "string" && turnId.trim().length > 0) {
      return turnId;
    }
  }
  for (let index = params.turns.length - 1; index >= 0; index -= 1) {
    const turnId = params.turns[index]?.id;
    if (typeof turnId === "string" && turnId.trim().length > 0) {
      return turnId;
    }
  }
  return null;
}

export function hasSessionHydrationActivity(options: {
  currentTurnId: string | null;
  threadTurnsCount: number;
  threadItemsCount: number;
  queuedTurnsCount: number;
}) {
  return (
    options.currentTurnId !== null ||
    options.threadTurnsCount > 0 ||
    options.threadItemsCount > 0 ||
    options.queuedTurnsCount > 0
  );
}

export function hasActiveRuntimeTurn(options: {
  currentTurnId?: string | null;
  queuedTurnsCount: number;
  threadRead?: AgentRuntimeThreadReadModel | null;
  threadReadStatus?: string | null;
  turns: readonly AgentThreadTurn[];
}): boolean {
  if (options.queuedTurnsCount > 0) {
    return true;
  }

  const normalizedThreadReadStatus =
    options.threadReadStatus?.trim().toLowerCase() ?? null;
  const normalizedProfileStatus =
    options.threadRead?.profile_status?.trim().toLowerCase() ?? null;
  if (
    normalizedThreadReadStatus === "running" ||
    normalizedProfileStatus === "running"
  ) {
    return true;
  }

  if (
    options.threadRead?.turns?.some(
      (turn) => turn?.status?.trim().toLowerCase() === "running",
    )
  ) {
    return true;
  }

  if (options.turns.some((turn) => turn.status === "running")) {
    return true;
  }

  return false;
}

export function shouldDeferSessionDetailHydration(options: {
  currentSessionId: string | null;
  topicId: string;
  forceRefresh?: boolean;
  resumeSessionStartHooks?: boolean;
  cachedSnapshot?: AgentSessionCachedSnapshot | null;
}) {
  const {
    currentSessionId,
    topicId,
    forceRefresh = false,
    resumeSessionStartHooks = false,
    cachedSnapshot,
  } = options;

  if (
    forceRefresh ||
    resumeSessionStartHooks ||
    !cachedSnapshot ||
    currentSessionId === topicId
  ) {
    return false;
  }

  return (
    cachedSnapshot.messages.length > 0 ||
    hasSessionHydrationActivity({
      currentTurnId: cachedSnapshot.currentTurnId,
      threadTurnsCount: cachedSnapshot.threadTurns.length,
      threadItemsCount: cachedSnapshot.threadItems.length,
      queuedTurnsCount: 0,
    })
  );
}

export function shouldSkipAlreadyHydratedSession(options: {
  hydratedSessionId: string | null;
  sessionId: string;
  currentTurnId: string | null;
  messagesCount: number;
  queuedTurnsCount: number;
  threadReadStatus?: string | null;
  threadItemsCount: number;
  threadTurnsCount: number;
  selectedTopic?: Pick<Topic, "messagesCount" | "status"> | null;
}): boolean {
  if (options.hydratedSessionId !== options.sessionId) {
    return false;
  }

  const hasLocalSessionContent =
    options.messagesCount > 0 ||
    hasSessionHydrationActivity({
      currentTurnId: options.currentTurnId,
      queuedTurnsCount: options.queuedTurnsCount,
      threadItemsCount: options.threadItemsCount,
      threadTurnsCount: options.threadTurnsCount,
    });
  const normalizedThreadReadStatus = (options.threadReadStatus || "")
    .trim()
    .toLowerCase();
  const hasRuntimeReadModelActivity =
    normalizedThreadReadStatus === "queued" ||
    normalizedThreadReadStatus === "running" ||
    normalizedThreadReadStatus === "waiting_request";
  if (hasLocalSessionContent || hasRuntimeReadModelActivity) {
    return true;
  }

  const topicMessagesCount = options.selectedTopic?.messagesCount ?? 0;
  const topicStatus = options.selectedTopic?.status ?? "draft";
  const topicExpectsRemoteDetail =
    topicMessagesCount > 0 || topicStatus !== "draft";

  return !topicExpectsRemoteDetail;
}

export type MissingSessionFromTopicsAction =
  | {
      kind: "none";
    }
  | {
      kind: "skip_detached";
    }
  | {
      kind: "clear_auxiliary";
    }
  | {
      kind: "clear_inactive";
    }
  | {
      kind: "verify_remote";
    };

export function resolveMissingSessionFromTopicsAction(options: {
  currentTurnId: string | null;
  detachedSessionId: string | null | undefined;
  queuedTurnsCount: number;
  remoteConfirmed?: boolean;
  restoreCandidateMayLagTopics?: boolean;
  sessionId: string | null | undefined;
  threadItemsCount: number;
  threadTurnsCount: number;
  topicsCount: number;
  topicsReady: boolean;
  topicExists: boolean;
}): MissingSessionFromTopicsAction {
  const sessionId = options.sessionId?.trim();
  if (
    !options.topicsReady ||
    !sessionId ||
    options.topicsCount === 0 ||
    options.topicExists
  ) {
    return { kind: "none" };
  }

  if (options.detachedSessionId === sessionId) {
    return { kind: "skip_detached" };
  }

  if (isAuxiliaryAgentSessionId(sessionId)) {
    return { kind: "clear_auxiliary" };
  }

  const shouldVerifyMissingSession =
    hasSessionHydrationActivity({
      currentTurnId: options.currentTurnId,
      threadTurnsCount: options.threadTurnsCount,
      threadItemsCount: options.threadItemsCount,
      queuedTurnsCount: options.queuedTurnsCount,
    }) ||
    options.remoteConfirmed === true ||
    options.restoreCandidateMayLagTopics === true;

  return shouldVerifyMissingSession
    ? { kind: "verify_remote" }
    : { kind: "clear_inactive" };
}

export function resolveRestorableTopicSessionId(
  candidateSessionId: string | null | undefined,
  topics: Topic[],
  options?: {
    allowDetachedCandidate?: boolean;
  },
): string | null {
  const normalizedCandidate = candidateSessionId?.trim();
  if (topics.length === 0) {
    return normalizedCandidate ?? null;
  }

  if (
    normalizedCandidate &&
    options?.allowDetachedCandidate === true &&
    !topics.some((topic) => topic.id === normalizedCandidate)
  ) {
    return normalizedCandidate;
  }

  return resolveRestorableSessionId({
    candidateSessionId: normalizedCandidate,
    sessions: topics.map((topic) => ({
      id: topic.id,
      createdAt: Math.floor(topic.createdAt.getTime() / 1000),
      updatedAt: Math.floor(topic.updatedAt.getTime() / 1000),
    })),
  });
}

interface BuildHydratedAgentSessionSnapshotOptions {
  topicId: string;
  detail: Awaited<ReturnType<AgentRuntimeAdapter["getSession"]>>;
  currentSessionId: string | null;
  currentMessages: Message[];
  currentThreadTurns: AgentThreadTurn[];
  currentThreadItems: AgentThreadItem[];
  currentExecutionRuntime: AsterSessionExecutionRuntime | null;
  currentExecutionStrategy: AsterExecutionStrategy;
  topics: Topic[];
  localSnapshotOverride?: {
    sessionId: string;
    messages: Message[];
    threadTurns: AgentThreadTurn[];
    threadItems: AgentThreadItem[];
  } | null;
  syncSessionId?: boolean;
  executionStrategyOverride?: AsterExecutionStrategy;
  preserveExecutionStrategyOnMissingDetail?: boolean;
  detailMergeMode?: AgentSessionDetailMergeMode;
}

export function buildHydratedAgentSessionSnapshot(
  options: BuildHydratedAgentSessionSnapshotOptions,
): {
  executionStrategy: AsterExecutionStrategy;
  snapshot: AgentSessionSnapshot;
} {
  const {
    topicId,
    detail,
    currentSessionId,
    currentMessages,
    currentThreadTurns,
    currentThreadItems,
    currentExecutionRuntime,
    currentExecutionStrategy,
    topics,
    localSnapshotOverride,
    syncSessionId = false,
    executionStrategyOverride,
    preserveExecutionStrategyOnMissingDetail = false,
    detailMergeMode,
  } = options;
  const normalizedDetailMergeMode =
    normalizeAgentSessionDetailMergeMode(detailMergeMode);
  const effectiveCurrentSessionId =
    localSnapshotOverride?.sessionId ?? currentSessionId;
  const effectiveCurrentMessages = localSnapshotOverride
    ? normalizeHistoricalTopicSnapshotMessages(localSnapshotOverride.messages)
    : currentMessages;
  const effectiveCurrentThreadTurns =
    localSnapshotOverride?.threadTurns ?? currentThreadTurns;
  const effectiveCurrentThreadItems =
    localSnapshotOverride?.threadItems ?? currentThreadItems;
  const incomingTurns = detail.turns || [];
  const incomingItems = normalizeLegacyThreadItems(
    collectDetailThreadItems(detail),
  );
  const mayPreserveExistingTimelineBySession =
    effectiveCurrentSessionId === topicId ||
    (effectiveCurrentSessionId === null &&
      syncSessionId &&
      (effectiveCurrentMessages.length > 0 ||
        effectiveCurrentThreadTurns.length > 0 ||
        effectiveCurrentThreadItems.length > 0));
  const hydratedMessagesForCurrentMode = hydrateSessionDetailMessages(
    detail,
    topicId,
    {
      compactCompletedHistory: shouldCompactCompletedSessionHistory(detail),
      includeTimelineFallback:
        !mayPreserveExistingTimelineBySession ||
        effectiveCurrentMessages.length === 0,
    },
  );
  const hydratedMessagesForCompatibility =
    mayPreserveExistingTimelineBySession && effectiveCurrentMessages.length > 0
      ? hydrateSessionDetailMessages(detail, topicId, {
          compactCompletedHistory: shouldCompactCompletedSessionHistory(detail),
          includeTimelineFallback: true,
        })
      : hydratedMessagesForCurrentMode;
  const timelineMergeDecision = resolveAgentSessionTimelineMergeDecision({
    mode: normalizedDetailMergeMode,
    mayPreserveExistingTimelineBySession,
    hydratedMessagesForCompatibility,
    localMessages: effectiveCurrentMessages,
    threadRead: detail.thread_read,
    incomingTurns,
  });
  const hydratedMessages =
    timelineMergeDecision.shouldIgnoreIncompatibleHydratedMessages
      ? []
      : timelineMergeDecision.shouldPreserveBySession
        ? hydratedMessagesForCurrentMode
        : hydratedMessagesForCompatibility;
  const shouldPreserveExistingTimeline =
    timelineMergeDecision.shouldPreserveBySession ||
    shouldPreserveDetachedLocalSnapshot({
      hydratedMessages,
      localMessages: effectiveCurrentMessages,
      sessionId: effectiveCurrentSessionId,
    });
  const shouldPreserveExecutionRuntimeOnMissingDetail =
    shouldPreserveExistingTimeline;
  const nextExecutionRuntime = createExecutionRuntimeFromSessionDetail(detail);
  const selectedTopic = topics.find((topic) => topic.id === topicId);
  const nextExecutionStrategy =
    executionStrategyOverride ||
    detail.execution_strategy ||
    selectedTopic?.executionStrategy ||
    (preserveExecutionStrategyOnMissingDetail
      ? currentExecutionStrategy
      : null);
  const nextThreadTurns = shouldPreserveExistingTimeline
    ? mergeThreadTurns(effectiveCurrentThreadTurns, incomingTurns)
    : mergeThreadTurns(incomingTurns);
  const nextThreadItems = shouldPreserveExistingTimeline
    ? timelineMergeDecision.shouldPreserveByRuntimeSync
      ? mergeRuntimeSyncThreadItems(effectiveCurrentThreadItems, incomingItems)
      : filterConversationThreadItems(
          mergeThreadItems(effectiveCurrentThreadItems, incomingItems),
        )
    : filterConversationThreadItems(incomingItems);
  const visibleIncomingTurns = mergeThreadTurns(incomingTurns);
  const visibleIncomingItems = mergeThreadItems(incomingItems);
  const nextMessages =
    shouldPreserveExistingTimeline && hydratedMessages.length === 0
      ? effectiveCurrentMessages
      : shouldPreserveExistingTimeline
        ? mergeHydratedMessagesWithLocalState(
            effectiveCurrentMessages,
            hydratedMessages,
          )
        : hydratedMessages;
  const nextMessagesWithThreadReasoning = mergeThreadItemReasoningIntoMessages(
    nextMessages,
    nextThreadItems,
  );

  return {
    executionStrategy: normalizeExecutionStrategy(nextExecutionStrategy),
    snapshot: {
      sessionId: syncSessionId ? topicId : currentSessionId,
      workingDir: detail.working_dir?.trim() || null,
      messages: nextMessagesWithThreadReasoning,
      threadTurns: nextThreadTurns,
      threadItems: nextThreadItems,
      currentTurnId: resolveCurrentTurnIdFromTimeline({
        turns: nextThreadTurns,
        items: nextThreadItems,
        preferredTurns: visibleIncomingTurns,
        preferredItems: visibleIncomingItems,
      }),
      queuedTurns: normalizeQueuedTurnSnapshots(
        detail.queued_turns ?? detail.thread_read?.queued_turns,
      ),
      threadRead: detail.thread_read ?? null,
      executionRuntime:
        shouldPreserveExecutionRuntimeOnMissingDetail && !nextExecutionRuntime
          ? currentExecutionRuntime
          : nextExecutionRuntime,
      todoItems: detail.todo_items ?? [],
      childSubagentSessions: detail.child_subagent_sessions ?? [],
      subagentParentContext: detail.subagent_parent_context ?? null,
    },
  };
}
