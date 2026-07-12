import { useMemo } from "react";
import type {
  AgentSubagentParentContext,
  AgentSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import { useTeamWorkspaceRuntime } from "../hooks";
import {
  deriveCurrentSessionRuntimeStatus,
  deriveLatestTurnRuntimeStatus,
} from "../agentChatWorkspaceShared";

interface WorkspaceSessionTopicSummary {
  id: string;
  title: string;
}

interface UseWorkspaceTeamSessionRuntimeParams {
  sessionId?: string | null;
  threadId?: string | null;
  currentTurnId?: string | null;
  topics: WorkspaceSessionTopicSummary[];
  turns: Array<{ status: string }>;
  queuedTurnCount: number;
  isSending: boolean;
  subagentEnabled: boolean;
  childSubagentSessions: AgentSubagentSessionInfo[];
  subagentParentContext: AgentSubagentParentContext | null;
}

export function useWorkspaceTeamSessionRuntime({
  sessionId,
  threadId,
  currentTurnId,
  topics,
  turns,
  queuedTurnCount,
  isSending,
  subagentEnabled,
  childSubagentSessions,
  subagentParentContext,
}: UseWorkspaceTeamSessionRuntimeParams) {
  const currentSessionTitle = useMemo(
    () => topics.find((topic) => topic.id === sessionId)?.title ?? null,
    [sessionId, topics],
  );

  const hasRuntimeSessions =
    childSubagentSessions.length > 0 || Boolean(subagentParentContext);
  const subagentsRuntimeVisible = subagentEnabled || hasRuntimeSessions;

  const currentSessionRuntimeStatus = useMemo(
    () =>
      deriveCurrentSessionRuntimeStatus({
        isSending,
        queuedTurnCount,
        turns,
      }),
    [isSending, queuedTurnCount, turns],
  );
  const currentSessionLatestTurnStatus = useMemo(
    () => deriveLatestTurnRuntimeStatus(turns),
    [turns],
  );

  const liveTeamWorkspaceRuntime = useTeamWorkspaceRuntime({
    currentSessionId: sessionId,
    currentThreadId: threadId,
    currentTurnId,
    currentSessionRuntimeStatus,
    currentSessionLatestTurnStatus,
    currentSessionQueuedTurnCount: queuedTurnCount,
    childSubagentSessions,
    subagentParentContext,
  });

  return {
    currentSessionTitle,
    hasRuntimeSessions,
    subagentsRuntimeVisible,
    currentSessionRuntimeStatus,
    currentSessionLatestTurnStatus,
    ...liveTeamWorkspaceRuntime,
  };
}
