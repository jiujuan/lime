import { normalizeLegacyThreadItems } from "@/lib/api/agentTextNormalization";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import { filterConversationThreadItems } from "../utils/threadTimelineView";
import { mergeHydratedMessagesWithLocalState } from "./agentChatHistory";
import type { AgentSessionCachedSnapshot } from "./agentSessionScopedStorage";
import type { Topic } from "./agentChatShared";

export interface AgentSessionRestoreHistoryWindow {
  loadedMessages: number;
  totalMessages: number;
  isLoadingFull: boolean;
  error: string | null;
}

export interface AgentSessionRestoreViewModelInput {
  cachedSnapshot: AgentSessionCachedSnapshot | null;
  scopedCurrentTurnId: string | null;
  scopedItems: AgentThreadItem[];
  scopedMessages: Message[];
  scopedSessionCandidate: string | null;
  scopedTurns: AgentThreadTurn[];
}

export interface AgentSessionRestoreViewModel {
  currentTurnId: string | null;
  historyWindow: AgentSessionRestoreHistoryWindow | null;
  messages: Message[];
  sessionId: string | null;
  threadItems: AgentThreadItem[];
  threadTurns: AgentThreadTurn[];
}

export interface CachedTopicSnapshotViewModelInput {
  cachedSnapshot: AgentSessionCachedSnapshot;
  selectedTopic: Topic | undefined;
  topicId: string;
}

export interface CachedTopicSnapshotViewModel {
  currentTurnId: string | null;
  historyWindow: AgentSessionRestoreHistoryWindow | null;
  metricContext: {
    cacheFreshness: string | null;
    cacheStorageKind: string | null;
    cachedMessagesCount: number;
    cachedThreadItemsCount: number;
    cachedTurnsCount: number;
    topicId: string;
  };
  messages: Message[];
  sessionId: string;
  threadItems: AgentThreadItem[];
  threadTurns: AgentThreadTurn[];
}

export function buildAgentSessionRestoreViewModel(
  input: AgentSessionRestoreViewModelInput,
): AgentSessionRestoreViewModel {
  const {
    cachedSnapshot,
    scopedCurrentTurnId,
    scopedItems,
    scopedMessages,
    scopedSessionCandidate,
    scopedTurns,
  } = input;
  const shouldUseCachedSnapshot =
    scopedMessages.length === 0 && Boolean(cachedSnapshot);
  const shouldMergeCachedSnapshot =
    scopedMessages.length > 0 && Boolean(cachedSnapshot);
  const mergedScopedMessages =
    shouldMergeCachedSnapshot && cachedSnapshot
      ? mergeHydratedMessagesWithLocalState(
          cachedSnapshot.messages,
          scopedMessages,
        )
      : scopedMessages;
  const messages = shouldUseCachedSnapshot
    ? cachedSnapshot?.messages || []
    : mergedScopedMessages;
  const threadTurns = shouldUseCachedSnapshot
    ? cachedSnapshot?.threadTurns || []
    : scopedTurns.length > 0
      ? scopedTurns
      : cachedSnapshot?.threadTurns || [];
  const threadItems = shouldUseCachedSnapshot
    ? cachedSnapshot?.threadItems || []
    : scopedItems.length > 0
      ? filterConversationThreadItems(normalizeLegacyThreadItems(scopedItems))
      : cachedSnapshot?.threadItems || [];
  const currentTurnId = shouldUseCachedSnapshot
    ? cachedSnapshot?.currentTurnId || null
    : scopedCurrentTurnId || cachedSnapshot?.currentTurnId || null;
  const cachedTotalMessages =
    cachedSnapshot?.cacheMetadata?.messagesCount ??
    cachedSnapshot?.messages.length ??
    0;
  const historyWindow =
    shouldUseCachedSnapshot &&
    (cachedSnapshot?.cacheMetadata?.historyTruncated === true ||
      cachedTotalMessages > messages.length)
      ? {
          loadedMessages: messages.length,
          totalMessages: Math.max(cachedTotalMessages, messages.length),
          isLoadingFull: false,
          error: null,
        }
      : null;

  return {
    currentTurnId,
    historyWindow,
    messages,
    sessionId: scopedSessionCandidate,
    threadItems,
    threadTurns,
  };
}

export function buildCachedTopicSnapshotViewModel({
  cachedSnapshot,
  selectedTopic,
  topicId,
}: CachedTopicSnapshotViewModelInput): CachedTopicSnapshotViewModel {
  const metadata = cachedSnapshot.cacheMetadata;
  const totalMessages =
    metadata?.messagesCount ??
    selectedTopic?.messagesCount ??
    cachedSnapshot.messages.length;
  const historyWindow =
    metadata?.historyTruncated === true ||
    totalMessages > cachedSnapshot.messages.length
      ? {
          loadedMessages: cachedSnapshot.messages.length,
          totalMessages: Math.max(totalMessages, cachedSnapshot.messages.length),
          isLoadingFull: false,
          error: null,
        }
      : null;

  return {
    currentTurnId: cachedSnapshot.currentTurnId,
    historyWindow,
    metricContext: {
      cacheFreshness: metadata?.freshness ?? null,
      cacheStorageKind: metadata?.storageKind ?? null,
      cachedMessagesCount: cachedSnapshot.messages.length,
      cachedThreadItemsCount: cachedSnapshot.threadItems.length,
      cachedTurnsCount: cachedSnapshot.threadTurns.length,
      topicId,
    },
    messages: cachedSnapshot.messages,
    sessionId: topicId,
    threadItems: cachedSnapshot.threadItems,
    threadTurns: cachedSnapshot.threadTurns,
  };
}
