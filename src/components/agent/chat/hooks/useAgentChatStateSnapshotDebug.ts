import { useEffect } from "react";
import type { WorkspacePathMissingState } from "./agentChatShared";
import { logAgentDebug } from "@/lib/agentDebug";

interface UseAgentChatStateSnapshotDebugOptions {
  hasActiveTopic: boolean;
  isSending: boolean;
  messagesCount: number;
  pendingActionsCount: number;
  sessionId: string | null;
  threadTurnsCount: number;
  topicsCount: number;
  workspaceId: string;
  workspacePathMissing: WorkspacePathMissingState | null;
}

export function useAgentChatStateSnapshotDebug(
  options: UseAgentChatStateSnapshotDebugOptions,
) {
  const {
    hasActiveTopic,
    isSending,
    messagesCount,
    pendingActionsCount,
    sessionId,
    threadTurnsCount,
    topicsCount,
    workspaceId,
    workspacePathMissing,
  } = options;

  useEffect(() => {
    const context = {
      hasActiveTopic,
      isSending,
      messagesCount,
      pendingActionsCount,
      sessionId,
      threadTurnsCount,
      topicsCount,
      workspaceId,
      workspacePathMissing,
    };

    logAgentDebug("useAgentChatStateSnapshotDebug", "stateSnapshot", context, {
      dedupeKey: JSON.stringify(context),
      throttleMs: 800,
    });
  }, [
    hasActiveTopic,
    isSending,
    messagesCount,
    pendingActionsCount,
    sessionId,
    threadTurnsCount,
    topicsCount,
    workspaceId,
    workspacePathMissing,
  ]);
}
