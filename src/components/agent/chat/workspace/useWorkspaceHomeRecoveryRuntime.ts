import { useCallback, useEffect, useMemo } from "react";
import { buildClawAgentParams } from "@/lib/workspace/navigation";
import type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
} from "../agentChatWorkspaceContract";
import type { Topic } from "../hooks/agentChatShared";
import type {
  HomeRecoverySession,
  HomeRecoverySessionStatus,
} from "../home/homeSurfaceTypes";

interface OpenTaskTopicOptions {
  preferResume?: boolean;
  forceRefresh?: boolean;
  replaceOpenTabs?: boolean;
}

interface UseWorkspaceHomeRecoveryRuntimeParams {
  onBackgroundSessionRuntimeChange?: AgentChatWorkspaceProps["onBackgroundSessionRuntimeChange"];
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  onOpenTaskTopic: (
    topicId: string,
    options?: OpenTaskTopicOptions,
  ) => void | Promise<void>;
  onResumeRecentSession: () => void;
  projectId?: string | null;
  recentSessionTopic: Topic | null;
}

interface WorkspaceHomeRecoveryRuntime {
  homeRecoverySession: HomeRecoverySession | null;
  handleResumeHomeRecoverySession: () => void;
}

const HOME_RECOVERY_SESSION_STATUSES: ReadonlySet<Topic["status"]> = new Set([
  "running",
  "queued",
  "waiting",
]);

function isHomeRecoverySessionStatus(
  status: Topic["status"],
): status is HomeRecoverySessionStatus {
  return HOME_RECOVERY_SESSION_STATUSES.has(status);
}

export function resolveWorkspaceHomeRecoverySession(
  recentSessionTopic: Topic | null,
): HomeRecoverySession | null {
  if (
    !recentSessionTopic ||
    !isHomeRecoverySessionStatus(recentSessionTopic.status)
  ) {
    return null;
  }

  const title = recentSessionTopic.title.trim();
  if (!title) {
    return null;
  }

  const summary = recentSessionTopic.lastPreview.trim();
  return {
    sessionId: recentSessionTopic.sourceSessionId || recentSessionTopic.id,
    title,
    summary: summary || undefined,
    status: recentSessionTopic.status,
  };
}

function resolveBackgroundSessionRuntimeSnapshot(
  homeRecoverySession: HomeRecoverySession | null,
): AgentBackgroundSessionRuntimeSnapshot | null {
  return homeRecoverySession
    ? {
        sessionId: homeRecoverySession.sessionId,
        status: homeRecoverySession.status,
      }
    : null;
}

export function useWorkspaceHomeRecoveryRuntime({
  onBackgroundSessionRuntimeChange,
  onNavigate,
  onOpenTaskTopic,
  onResumeRecentSession,
  projectId,
  recentSessionTopic,
}: UseWorkspaceHomeRecoveryRuntimeParams): WorkspaceHomeRecoveryRuntime {
  const homeRecoverySession = useMemo(
    () => resolveWorkspaceHomeRecoverySession(recentSessionTopic),
    [recentSessionTopic],
  );
  const backgroundSessionRuntime = useMemo(
    () => resolveBackgroundSessionRuntimeSnapshot(homeRecoverySession),
    [homeRecoverySession],
  );

  useEffect(() => {
    onBackgroundSessionRuntimeChange?.(backgroundSessionRuntime);
  }, [backgroundSessionRuntime, onBackgroundSessionRuntimeChange]);

  const handleResumeHomeRecoverySession = useCallback(() => {
    if (!homeRecoverySession) {
      onResumeRecentSession();
      return;
    }

    if (onNavigate) {
      const recoveryProjectId =
        recentSessionTopic?.workspaceId ?? projectId ?? undefined;
      onNavigate(
        "agent",
        buildClawAgentParams({
          initialSessionId: homeRecoverySession.sessionId,
          projectId: recoveryProjectId ?? undefined,
        }),
      );
      return;
    }

    void onOpenTaskTopic(homeRecoverySession.sessionId, {
      preferResume: true,
      forceRefresh: true,
      replaceOpenTabs: true,
    });
  }, [
    homeRecoverySession,
    onNavigate,
    onOpenTaskTopic,
    onResumeRecentSession,
    projectId,
    recentSessionTopic?.workspaceId,
  ]);

  return {
    homeRecoverySession,
    handleResumeHomeRecoverySession,
  };
}
