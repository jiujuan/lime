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
  mergeHydratedMessagesWithLocalState,
  normalizeHistoricalTopicSnapshotMessages,
  shouldCompactCompletedSessionHistory,
} from "./agentChatHistory";
import {
  filterConversationThreadItems,
  mergeThreadItems,
  mergeThreadTurns,
} from "../utils/threadTimelineView";
import { createExecutionRuntimeFromSessionDetail } from "../utils/sessionExecutionRuntime";
import { normalizeExecutionStrategy } from "./agentChatCoreUtils";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { isAuxiliaryAgentSessionId } from "@/lib/api/agentRuntime/sessionIdentity";

export interface AgentSessionSnapshot {
  sessionId: string | null;
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

export function createEmptyAgentSessionSnapshot(options?: {
  executionRuntime?: AsterSessionExecutionRuntime | null;
}): AgentSessionSnapshot {
  return {
    sessionId: null,
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

function normalizeConversationText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstUserMessageText(messages: Message[]): string {
  return normalizeConversationText(
    messages.find((message) => message.role === "user")?.content || "",
  );
}

function userMessageTexts(messages: Message[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => normalizeConversationText(message.content || ""));
}

function areConversationTextsCompatible(left: string, right: string): boolean {
  if (!left || !right) {
    return true;
  }

  return left === right || left.includes(right) || right.includes(left);
}

function isLocalTimelineCompatibleWithHydratedMessages(params: {
  hydratedMessages: Message[];
  localMessages: Message[];
}): boolean {
  const hydratedUserTexts = userMessageTexts(params.hydratedMessages);
  const localUserTexts = userMessageTexts(params.localMessages);
  if (hydratedUserTexts.length === 0 || localUserTexts.length === 0) {
    return true;
  }

  const compareCount = Math.min(hydratedUserTexts.length, localUserTexts.length);
  for (let index = 0; index < compareCount; index += 1) {
    if (
      !areConversationTextsCompatible(
        localUserTexts[index] || "",
        hydratedUserTexts[index] || "",
      )
    ) {
      return false;
    }
  }

  return true;
}

function hasAssistantProcessSnapshot(messages: Message[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      (Boolean(message.thinkingContent?.trim()) ||
        Boolean(message.contentParts?.some((part) => part.type !== "text")) ||
        Boolean(message.runtimeTurnId?.trim().startsWith("skill-exec-")) ||
        message.inlineProcessRetention === "skill"),
  );
}

function shouldPreserveDetachedLocalSnapshot(params: {
  hydratedMessages: Message[];
  localMessages: Message[];
  sessionId: string | null;
}): boolean {
  if (
    params.sessionId !== null ||
    !hasAssistantProcessSnapshot(params.localMessages)
  ) {
    return false;
  }

  const localUserText = firstUserMessageText(params.localMessages);
  const hydratedUserText = firstUserMessageText(params.hydratedMessages);
  if (!localUserText || !hydratedUserText) {
    return false;
  }

  return (
    localUserText === hydratedUserText ||
    localUserText.includes(hydratedUserText) ||
    hydratedUserText.includes(localUserText)
  );
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

  const shouldVerifyMissingSession = hasSessionHydrationActivity({
    currentTurnId: options.currentTurnId,
    threadTurnsCount: options.threadTurnsCount,
    threadItemsCount: options.threadItemsCount,
    queuedTurnsCount: options.queuedTurnsCount,
  });

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
  } = options;
  const effectiveCurrentSessionId =
    localSnapshotOverride?.sessionId ?? currentSessionId;
  const effectiveCurrentMessages = localSnapshotOverride
    ? normalizeHistoricalTopicSnapshotMessages(localSnapshotOverride.messages)
    : currentMessages;
  const effectiveCurrentThreadTurns =
    localSnapshotOverride?.threadTurns ?? currentThreadTurns;
  const effectiveCurrentThreadItems =
    localSnapshotOverride?.threadItems ?? currentThreadItems;
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
    mayPreserveExistingTimelineBySession &&
    effectiveCurrentMessages.length > 0
      ? hydrateSessionDetailMessages(detail, topicId, {
          compactCompletedHistory: shouldCompactCompletedSessionHistory(detail),
          includeTimelineFallback: true,
        })
      : hydratedMessagesForCurrentMode;
  const shouldPreserveExistingTimelineBySession =
    mayPreserveExistingTimelineBySession &&
    isLocalTimelineCompatibleWithHydratedMessages({
      hydratedMessages: hydratedMessagesForCompatibility,
      localMessages: effectiveCurrentMessages,
    });
  const hydratedMessages = shouldPreserveExistingTimelineBySession
    ? hydratedMessagesForCurrentMode
    : hydratedMessagesForCompatibility;
  const shouldPreserveExistingTimeline =
    shouldPreserveExistingTimelineBySession ||
    shouldPreserveDetachedLocalSnapshot({
      hydratedMessages,
      localMessages: effectiveCurrentMessages,
      sessionId: effectiveCurrentSessionId,
    });
  const incomingTurns = detail.turns || [];
  const incomingItems = normalizeLegacyThreadItems(detail.items || []);
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
    ? filterConversationThreadItems(
        mergeThreadItems(effectiveCurrentThreadItems, incomingItems),
      )
    : filterConversationThreadItems(incomingItems);
  const nextMessages =
    shouldPreserveExistingTimeline && hydratedMessages.length === 0
      ? effectiveCurrentMessages
      : shouldPreserveExistingTimeline
        ? mergeHydratedMessagesWithLocalState(
            effectiveCurrentMessages,
            hydratedMessages,
          )
        : hydratedMessages;

  return {
    executionStrategy: normalizeExecutionStrategy(nextExecutionStrategy),
    snapshot: {
      sessionId: syncSessionId ? topicId : currentSessionId,
      messages: nextMessages,
      threadTurns: nextThreadTurns,
      threadItems: nextThreadItems,
      currentTurnId:
        nextThreadTurns.length > 0
          ? nextThreadTurns[nextThreadTurns.length - 1]?.id || null
          : null,
      queuedTurns: normalizeQueuedTurnSnapshots(detail.queued_turns),
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
