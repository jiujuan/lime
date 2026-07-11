import { useCallback, useMemo } from "react";
import { buildClawAgentParams } from "@/lib/workspace/navigation";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import { buildInitialDispatchPreviewMessages } from "./workspaceSendHelpers";
import { useTaskCenterHomePendingPreviewRuntime } from "./useTaskCenterDraftSendRuntime";
import { resolveTaskCenterDraftSurfaceState } from "./taskCenterSurfaceState";

type DraftSurfaceParams = Parameters<
  typeof resolveTaskCenterDraftSurfaceState
>[0];
type HomePendingPreviewParams = Parameters<
  typeof useTaskCenterHomePendingPreviewRuntime
>[0];

interface UseWorkspaceTaskCenterSurfaceRuntimeParams {
  activeTheme: string;
  bootstrapDispatchPreview?:
    | Parameters<typeof buildInitialDispatchPreviewMessages>[0]
    | null;
  draftSurface: DraftSurfaceParams;
  homePendingPreview: HomePendingPreviewParams;
  lockTheme: boolean;
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  taskCenterWorkspaceId?: string | null;
}

/** Task Center 草稿 surface、首页 pending preview 与物化路由统一由此处派生。 */
export function useWorkspaceTaskCenterSurfaceRuntime({
  activeTheme,
  bootstrapDispatchPreview,
  draftSurface,
  homePendingPreview,
  lockTheme,
  onNavigate,
  taskCenterWorkspaceId,
}: UseWorkspaceTaskCenterSurfaceRuntimeParams) {
  const draftSurfaceState = resolveTaskCenterDraftSurfaceState(draftSurface);
  const { homePendingPreviewMessages, isHomePendingPreviewActive } =
    useTaskCenterHomePendingPreviewRuntime(homePendingPreview);
  const bootstrapPendingPreviewMessages = useMemo(
    () =>
      bootstrapDispatchPreview && homePendingPreview.displayMessagesLength === 0
        ? buildInitialDispatchPreviewMessages(bootstrapDispatchPreview)
        : [],
    [bootstrapDispatchPreview, homePendingPreview.displayMessagesLength],
  );
  const persistTaskCenterMaterializedSessionNavigation = useCallback(
    (sessionId: string) => {
      const normalizedSessionId = sessionId.trim();
      if (!onNavigate || !normalizedSessionId) {
        return;
      }

      onNavigate(
        "agent",
        buildClawAgentParams({
          ...(taskCenterWorkspaceId
            ? { projectId: taskCenterWorkspaceId }
            : {}),
          initialSessionId: normalizedSessionId,
          theme: activeTheme,
          lockTheme,
        }),
      );
    },
    [activeTheme, lockTheme, onNavigate, taskCenterWorkspaceId],
  );
  const isHomeSendStarting = Boolean(
    draftSurface.draftSendRequest ||
    homePendingPreview.homePendingPreviewRequest ||
    draftSurface.isPreparingSend ||
    draftSurface.isSending ||
    draftSurface.queuedTurnCount > 0,
  );

  return {
    ...draftSurfaceState,
    bootstrapPendingPreviewMessages,
    homePendingPreviewMessages,
    isHomePendingPreviewActive,
    isHomeSendStarting,
    persistTaskCenterMaterializedSessionNavigation,
  };
}
