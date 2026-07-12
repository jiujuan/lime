import type {
  AgentRuntimeThreadReadModel,
  AgentExecutionStrategy,
  AgentSessionDetail,
} from "@/lib/api/agentRuntime";
import { normalizeLegacyThreadItems } from "@/lib/api/agentTextNormalization";
import { isAuxiliaryAgentSessionId } from "@/lib/api/agentRuntime/sessionIdentity";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import { filterConversationThreadItems } from "../utils/threadTimelineView";
import {
  isLegacyDefaultProjectId,
  normalizeProjectId,
} from "../utils/topicProjectResolution";
import { mapSessionToTopic, type Topic } from "./agentChatShared";

export const ACTIVE_SESSION_TRANSIENT_MESSAGES_LIMIT = 48;
export const ACTIVE_SESSION_TRANSIENT_TURNS_LIMIT = 48;
export const ACTIVE_SESSION_TRANSIENT_ITEMS_LIMIT = 160;

export type RestoreCandidateSanitizationPlan =
  | {
      kind: "accept";
      sessionId: string;
    }
  | {
      kind: "skip_auxiliary";
      candidateSessionId: string;
      workspaceId: string | null;
    }
  | {
      kind: "reject_workspace";
      candidateSessionId: string;
      mappedWorkspaceId: string;
      workspaceId: string | null;
    }
  | {
      kind: "empty";
    };

export function resolveRestoreCandidateSanitizationPlan(options: {
  candidateSessionId: string | null | undefined;
  mappedWorkspaceId: string | null | undefined;
  workspaceId: string | null | undefined;
}): RestoreCandidateSanitizationPlan {
  const normalizedCandidate = options.candidateSessionId?.trim();
  if (!normalizedCandidate) {
    return { kind: "empty" };
  }

  const resolvedWorkspaceId = normalizeProjectId(options.workspaceId);
  if (isAuxiliaryAgentSessionId(normalizedCandidate)) {
    return {
      kind: "skip_auxiliary",
      candidateSessionId: normalizedCandidate,
      workspaceId: resolvedWorkspaceId,
    };
  }

  const mappedWorkspaceId = options.mappedWorkspaceId;
  if (!mappedWorkspaceId) {
    return {
      kind: "accept",
      sessionId: normalizedCandidate,
    };
  }

  if (isLegacyDefaultProjectId(mappedWorkspaceId)) {
    return {
      kind: "reject_workspace",
      candidateSessionId: normalizedCandidate,
      mappedWorkspaceId,
      workspaceId: resolvedWorkspaceId,
    };
  }

  const normalizedMappedWorkspaceId = normalizeProjectId(mappedWorkspaceId);
  if (!normalizedMappedWorkspaceId) {
    return {
      kind: "accept",
      sessionId: normalizedCandidate,
    };
  }

  if (
    resolvedWorkspaceId &&
    normalizedMappedWorkspaceId !== resolvedWorkspaceId
  ) {
    return {
      kind: "reject_workspace",
      candidateSessionId: normalizedCandidate,
      mappedWorkspaceId,
      workspaceId: resolvedWorkspaceId,
    };
  }

  return {
    kind: "accept",
    sessionId: normalizedCandidate,
  };
}

export function shouldAutoResumeHydratedRuntimeThread(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): boolean {
  const status = threadRead?.status?.trim().toLowerCase();
  return (
    status === "queued" ||
    status === "running" ||
    (threadRead?.queued_turns?.length ?? 0) > 0
  );
}

export function resolveRuntimeThreadStatusFromSessionDetail(
  detail: AgentSessionDetail,
): Topic["status"] | null {
  const status = detail.thread_read?.status?.trim().toLowerCase();
  if (
    status === "waitingaction" ||
    status === "waiting_action" ||
    status === "waiting_request" ||
    status === "needs_input" ||
    (detail.thread_read?.pending_requests?.length ?? 0) > 0
  ) {
    return "waiting";
  }

  if (
    status === "queued" ||
    (detail.thread_read?.queued_turns?.length ?? 0) > 0 ||
    (detail.queued_turns?.length ?? 0) > 0
  ) {
    return "queued";
  }

  if (status === "running") {
    return "running";
  }

  if (status === "failed") {
    return "failed";
  }

  return null;
}

export function resolveRuntimePreviewFromSessionDetail(
  detail: AgentSessionDetail,
): string | null {
  const queuedPreview =
    detail.queued_turns?.[0]?.message_preview ||
    detail.thread_read?.queued_turns?.[0]?.message_preview;
  if (queuedPreview?.trim()) {
    return queuedPreview.trim();
  }

  return null;
}

export function mapSessionDetailToTopic(
  sessionId: string,
  detail: AgentSessionDetail,
  fallbackWorkspaceId: string | null,
): Topic {
  const topic = mapSessionToTopic({
    id: sessionId,
    name: detail.name,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    model: detail.model,
    messages_count: detail.messages_count ?? detail.messages.length,
    execution_strategy: detail.execution_strategy,
    workspace_id: detail.workspace_id ?? fallbackWorkspaceId ?? undefined,
    working_dir: detail.working_dir,
  });
  const runtimeStatus = resolveRuntimeThreadStatusFromSessionDetail(detail);
  if (!runtimeStatus) {
    return topic;
  }

  return {
    ...topic,
    status: runtimeStatus,
    statusReason: runtimeStatus === "waiting" ? "user_action" : "default",
    lastPreview:
      resolveRuntimePreviewFromSessionDetail(detail) ?? topic.lastPreview,
  };
}

export function sortTopicsByRecentActivity(
  topics: Topic[],
  options: { workspaceId?: string | null } = {},
): Topic[] {
  const currentWorkspaceId = normalizeProjectId(options.workspaceId);
  return topics
    .map((topic, index) => ({ index, topic }))
    .sort((left, right) => {
      if (currentWorkspaceId) {
        const leftWorkspaceId = normalizeProjectId(left.topic.workspaceId);
        const rightWorkspaceId = normalizeProjectId(right.topic.workspaceId);
        const leftRank = leftWorkspaceId === currentWorkspaceId ? 0 : 1;
        const rightRank = rightWorkspaceId === currentWorkspaceId ? 0 : 1;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
      }

      const updatedDiff =
        right.topic.updatedAt.getTime() - left.topic.updatedAt.getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }

      const createdDiff =
        right.topic.createdAt.getTime() - left.topic.createdAt.getTime();
      if (createdDiff !== 0) {
        return createdDiff;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.topic);
}

export function upsertTopicFromSessionDetail(
  topics: Topic[],
  detailTopic: Topic,
  options: { workspaceId?: string | null } = {},
): Topic[] {
  const existingTopic = topics.find((topic) => topic.id === detailTopic.id);
  const mergedTopic = existingTopic
    ? {
        ...detailTopic,
        title: shouldPreserveExistingTopicTitle(existingTopic, detailTopic)
          ? existingTopic.title
          : detailTopic.title,
        workspaceId: detailTopic.workspaceId ?? existingTopic.workspaceId,
        workingDir: detailTopic.workingDir ?? existingTopic.workingDir,
        isPinned: existingTopic.isPinned,
        hasUnread: existingTopic.hasUnread,
        tag: existingTopic.tag,
      }
    : detailTopic;
  const nextTopics = existingTopic
    ? topics.map((topic) => (topic.id === detailTopic.id ? mergedTopic : topic))
    : [mergedTopic, ...topics];

  return sortTopicsByRecentActivity(nextTopics, options);
}

function shouldPreserveExistingTopicTitle(
  existingTopic: Topic,
  detailTopic: Topic,
): boolean {
  const existingTitle = existingTopic.title.trim();
  const detailTitle = detailTopic.title.trim();
  if (!existingTitle || existingTitle === detailTitle) {
    return false;
  }
  if (existingTitle === "新任务") {
    return false;
  }
  return (
    detailTitle === "新任务" ||
    /^任务 \d{4}\/\d{1,2}\/\d{1,2}$/.test(detailTitle)
  );
}

export function upsertFreshSessionDraftTopic(
  topics: Topic[],
  params: {
    createdAt: Date;
    executionStrategy: AgentExecutionStrategy;
    sessionId: string;
    sessionName?: string | null;
    workspaceId: string | null | undefined;
    workingDir?: string | null;
  },
): Topic[] {
  const title = params.sessionName?.trim() || "新任务";
  const topic: Topic = {
    id: params.sessionId,
    title,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    workspaceId: params.workspaceId,
    workingDir: params.workingDir ?? null,
    messagesCount: 0,
    executionStrategy: params.executionStrategy,
    status: "draft",
    lastPreview: "等待你补充任务需求后开始执行。",
    isPinned: false,
    hasUnread: false,
    tag: null,
    sourceSessionId: params.sessionId,
  };

  return [topic, ...topics.filter((item) => item.id !== params.sessionId)];
}

export function prependVerifiedSessionTopicFromDetail(
  topics: Topic[],
  sessionId: string,
  detail: AgentSessionDetail,
  options: { workspaceId?: string | null } = {},
): Topic[] {
  if (topics.some((topic) => topic.id === sessionId)) {
    return topics;
  }

  return sortTopicsByRecentActivity(
    [
      mapSessionToTopic({
        id: sessionId,
        name: detail.name,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        model: detail.model,
        messages_count: detail.messages.length,
        execution_strategy: detail.execution_strategy,
        workspace_id: detail.workspace_id,
        working_dir: detail.working_dir,
      }),
      ...topics,
    ],
    options,
  );
}

export function applyTopicExecutionStrategyToTopics(
  topics: Topic[],
  targetSessionId: string,
  nextExecutionStrategy: AgentExecutionStrategy,
): Topic[] {
  return topics.map((topic) =>
    topic.id === targetSessionId
      ? { ...topic, executionStrategy: nextExecutionStrategy }
      : topic,
  );
}

export type TopicSnapshotPatch = Partial<
  Pick<
    Topic,
    | "updatedAt"
    | "messagesCount"
    | "status"
    | "statusReason"
    | "lastPreview"
    | "hasUnread"
  >
>;

export function applyTopicSnapshotToTopics(
  topics: Topic[],
  targetSessionId: string,
  snapshot: TopicSnapshotPatch,
): Topic[] {
  let changed = false;
  const nextTopics = topics.map((topic) => {
    if (topic.id !== targetSessionId) {
      return topic;
    }

    const { updatedAt, ...restSnapshot } = snapshot;
    const nextTopic = {
      ...topic,
      ...restSnapshot,
      ...(updatedAt ? { updatedAt } : {}),
    };

    const unchanged =
      nextTopic.messagesCount === topic.messagesCount &&
      nextTopic.status === topic.status &&
      nextTopic.statusReason === topic.statusReason &&
      nextTopic.lastPreview === topic.lastPreview &&
      nextTopic.hasUnread === topic.hasUnread &&
      nextTopic.updatedAt?.getTime() === topic.updatedAt?.getTime();

    if (unchanged) {
      return topic;
    }

    changed = true;
    return nextTopic;
  });

  return changed ? sortTopicsByRecentActivity(nextTopics) : topics;
}

function takeTail<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }

  return items.slice(-limit);
}

export function selectActiveSessionTransientTurns(
  turns: AgentThreadTurn[],
): AgentThreadTurn[] {
  return takeTail(turns, ACTIVE_SESSION_TRANSIENT_TURNS_LIMIT);
}

export function selectActiveSessionTransientMessages(
  messages: Message[],
): Message[] {
  return takeTail(messages, ACTIVE_SESSION_TRANSIENT_MESSAGES_LIMIT);
}

export function selectActiveSessionTransientItems(
  items: AgentThreadItem[],
  turns: AgentThreadTurn[],
): AgentThreadItem[] {
  const retainedTurnIds = new Set(
    selectActiveSessionTransientTurns(turns)
      .map((turn) => (typeof turn.id === "string" ? turn.id.trim() : ""))
      .filter(Boolean),
  );
  if (retainedTurnIds.size === 0) {
    return filterConversationThreadItems(
      normalizeLegacyThreadItems(
        takeTail(items, ACTIVE_SESSION_TRANSIENT_ITEMS_LIMIT),
      ),
    );
  }

  const scopedItems: AgentThreadItem[] = [];
  for (
    let index = items.length - 1;
    index >= 0 && scopedItems.length < ACTIVE_SESSION_TRANSIENT_ITEMS_LIMIT;
    index -= 1
  ) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const turnId = typeof item.turn_id === "string" ? item.turn_id.trim() : "";
    if (!turnId || retainedTurnIds.has(turnId)) {
      scopedItems.push(item);
    }
  }
  scopedItems.reverse();

  return filterConversationThreadItems(normalizeLegacyThreadItems(scopedItems));
}
