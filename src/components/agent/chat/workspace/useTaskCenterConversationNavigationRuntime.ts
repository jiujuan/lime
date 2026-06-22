import { useCallback, useMemo } from "react";
import {
  resolveRecentTopicActionLabel,
  resolveRecentTopicCandidate,
  type Topic,
} from "../hooks/agentChatShared";
import {
  buildEmptyStateProjectConversationGroups,
  type EmptyStateProjectConversationGroupModel,
} from "../components/EmptyStateViewModel";

interface OpenedProjectSummary {
  id: string;
  name: string;
}

interface OpenTaskTopicOptions {
  preferResume?: boolean;
  forceRefresh?: boolean;
  replaceOpenTabs?: boolean;
}

interface UseTaskCenterConversationNavigationRuntimeParams {
  topics: Topic[];
  sessionId?: string | null;
  projectId?: string | null;
  openedProjects: OpenedProjectSummary[];
  onOpenTaskTopic: (
    topicId: string,
    options?: OpenTaskTopicOptions,
  ) => void | Promise<void>;
}

export interface TaskCenterConversationNavigationRuntime {
  recentSessionTopic: Topic | null;
  recentSessionActionLabel: string;
  handleResumeRecentSession: () => void;
  projectConversationGroups: EmptyStateProjectConversationGroupModel[];
  handleOpenProjectConversation: (
    topicId: string,
    statusReason?: string,
  ) => void;
}

export function useTaskCenterConversationNavigationRuntime({
  topics,
  sessionId,
  projectId,
  openedProjects,
  onOpenTaskTopic,
}: UseTaskCenterConversationNavigationRuntimeParams): TaskCenterConversationNavigationRuntime {
  const recentSessionTopic = useMemo(
    () => resolveRecentTopicCandidate(topics, sessionId),
    [sessionId, topics],
  );
  const recentSessionActionLabel = useMemo(
    () =>
      recentSessionTopic
        ? resolveRecentTopicActionLabel(recentSessionTopic)
        : "继续最近会话",
    [recentSessionTopic],
  );
  const handleResumeRecentSession = useCallback(() => {
    if (!recentSessionTopic) {
      return;
    }

    void onOpenTaskTopic(recentSessionTopic.id, {
      preferResume: true,
      forceRefresh: recentSessionTopic.statusReason === "workspace_error",
    });
  }, [onOpenTaskTopic, recentSessionTopic]);
  const projectConversationGroups = useMemo(
    () =>
      buildEmptyStateProjectConversationGroups({
        topics,
        currentProjectId: projectId,
        currentSessionId: sessionId,
        openedProjects,
      }),
    [openedProjects, projectId, sessionId, topics],
  );
  const handleOpenProjectConversation = useCallback(
    (topicId: string, statusReason?: string) => {
      void onOpenTaskTopic(topicId, {
        preferResume: true,
        forceRefresh: statusReason === "workspace_error",
      });
    },
    [onOpenTaskTopic],
  );

  return {
    recentSessionTopic,
    recentSessionActionLabel,
    handleResumeRecentSession,
    projectConversationGroups,
    handleOpenProjectConversation,
  };
}
