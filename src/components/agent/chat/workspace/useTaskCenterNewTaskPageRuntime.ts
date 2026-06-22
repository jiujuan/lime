import { useCallback, useEffect } from "react";
import { logAgentDebug } from "@/lib/agentDebug";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import {
  subscribeTaskCenterDraftTaskRequests,
  type TaskCenterCreateDraftTaskDetail,
} from "../taskCenterDraftTaskEvents";
import { normalizeProjectId } from "../utils/topicProjectResolution";

interface ResolveTaskCenterNewTaskPageRequestPlanParams {
  agentEntry: string;
  requestedProjectId?: string | null;
  externalProjectId?: string | null;
  normalizedInitialSessionId?: string | null;
}

type TaskCenterNewTaskPageRequestPlan =
  | {
      action: "skip";
      reason: "unsupported-entry";
    }
  | {
      action: "ignore";
      reason: "route-session-project-mismatch";
      agentEntry: string;
      initialSessionId: string;
      requestedProjectId: string | null;
      externalProjectId: string | null;
    }
  | {
      action: "navigate";
      projectId: string | null;
    }
  | {
      action: "open-draft";
      projectId: string | null;
    };

interface UseTaskCenterNewTaskPageRuntimeParams {
  agentEntry: string;
  externalProjectId?: string | null;
  normalizedInitialSessionId?: string | null;
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  applyProjectSelection: (projectId: string) => void;
  resetProjectSelection: () => void;
  openTaskCenterDraftTab: () => string;
}

export function resolveTaskCenterNewTaskPageRequestPlan({
  agentEntry,
  requestedProjectId,
  externalProjectId,
  normalizedInitialSessionId,
}: ResolveTaskCenterNewTaskPageRequestPlanParams): TaskCenterNewTaskPageRequestPlan {
  if (agentEntry !== "claw" && agentEntry !== "new-task") {
    return {
      action: "skip",
      reason: "unsupported-entry",
    };
  }

  const normalizedRequestedProjectId =
    requestedProjectId === undefined
      ? normalizeProjectId(externalProjectId)
      : normalizeProjectId(requestedProjectId);
  const normalizedExternalProjectId = normalizeProjectId(externalProjectId);

  if (
    normalizedInitialSessionId &&
    requestedProjectId !== undefined &&
    normalizedRequestedProjectId !== normalizedExternalProjectId
  ) {
    return {
      action: "ignore",
      reason: "route-session-project-mismatch",
      agentEntry,
      initialSessionId: normalizedInitialSessionId,
      requestedProjectId: requestedProjectId ?? null,
      externalProjectId: normalizedExternalProjectId,
    };
  }

  if (normalizedRequestedProjectId !== normalizedExternalProjectId) {
    return {
      action: "navigate",
      projectId: normalizedRequestedProjectId,
    };
  }

  return {
    action: "open-draft",
    projectId: normalizedRequestedProjectId,
  };
}

export function useTaskCenterNewTaskPageRuntime({
  agentEntry,
  externalProjectId,
  normalizedInitialSessionId,
  onNavigate,
  applyProjectSelection,
  resetProjectSelection,
  openTaskCenterDraftTab,
}: UseTaskCenterNewTaskPageRuntimeParams): (
  requestedProjectId?: string | null,
) => void {
  const handleOpenTaskCenterNewTaskPage = useCallback(
    (requestedProjectId?: string | null) => {
      const plan = resolveTaskCenterNewTaskPageRequestPlan({
        agentEntry,
        requestedProjectId,
        externalProjectId,
        normalizedInitialSessionId,
      });

      if (plan.action === "skip") {
        return;
      }

      if (plan.action === "ignore") {
        logAgentDebug(
          "AgentChatPage",
          "taskCenter.draftRequestIgnoredForRouteSession",
          {
            agentEntry: plan.agentEntry,
            initialSessionId: plan.initialSessionId,
            requestedProjectId: plan.requestedProjectId,
            externalProjectId: plan.externalProjectId,
          },
        );
        return;
      }

      if (plan.action === "navigate") {
        onNavigate?.(
          "agent",
          buildHomeAgentParams({
            projectId: plan.projectId ?? undefined,
          }),
        );
        return;
      }

      if (plan.projectId) {
        applyProjectSelection(plan.projectId);
      } else {
        resetProjectSelection();
      }

      openTaskCenterDraftTab();
    },
    [
      agentEntry,
      applyProjectSelection,
      externalProjectId,
      normalizedInitialSessionId,
      onNavigate,
      openTaskCenterDraftTab,
      resetProjectSelection,
    ],
  );

  useEffect(() => {
    if (agentEntry !== "claw" && agentEntry !== "new-task") {
      return;
    }

    return subscribeTaskCenterDraftTaskRequests(
      (detail: TaskCenterCreateDraftTaskDetail) => {
        handleOpenTaskCenterNewTaskPage(detail.projectId);
      },
    );
  }, [agentEntry, handleOpenTaskCenterNewTaskPage]);

  return handleOpenTaskCenterNewTaskPage;
}
