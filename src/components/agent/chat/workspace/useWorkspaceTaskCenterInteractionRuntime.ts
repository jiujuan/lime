import { useTaskCenterChromeNavigationRuntime } from "./useTaskCenterChromeNavigationRuntime";
import { useTaskCenterDraftMaterializationRuntime } from "./useTaskCenterDraftMaterializationRuntime";
import { useTaskCenterTopicNavigationRuntime } from "./useTaskCenterTopicNavigationRuntime";

type DraftMaterializationParams = Parameters<
  typeof useTaskCenterDraftMaterializationRuntime
>[0];
type TopicNavigationParams = Parameters<
  typeof useTaskCenterTopicNavigationRuntime
>[0];
type ChromeNavigationParams = Parameters<
  typeof useTaskCenterChromeNavigationRuntime
>[0];

interface UseWorkspaceTaskCenterInteractionRuntimeParams {
  chromeNavigation: Omit<
    ChromeNavigationParams,
    | "activeDraftTabId"
    | "draftSurfaceActive"
    | "draftTabActive"
    | "draftTabs"
    | "isTaskCenterDraftSurfaceActive"
    | "isTaskCenterDraftTabActive"
    | "onCloseTaskCenterTab"
    | "onOpenTaskTopic"
    | "onSwitchTaskTopic"
    | "openDraftTab"
  >;
  draftMaterialization: Omit<
    DraftMaterializationParams,
    "persistMaterializedSessionNavigation" | "switchMaterializedSession"
  >;
  persistMaterializedSessionNavigation: NonNullable<
    DraftMaterializationParams["persistMaterializedSessionNavigation"]
  >;
  taskCenterSurface: {
    isTaskCenterDraftSurfaceActive: boolean;
    isTaskCenterDraftTabActive: boolean;
  };
  topicNavigation: Omit<
    TopicNavigationParams,
    | "activeTaskCenterDraftTabIdRef"
    | "openTaskCenterDraftTab"
    | "taskCenterDraftTabsRef"
  >;
  switchTopic: NonNullable<
    DraftMaterializationParams["switchMaterializedSession"]
  >;
}

/** Task Center 草稿物化、切题和 Chrome 共用同一组交互状态。 */
export function useWorkspaceTaskCenterInteractionRuntime({
  chromeNavigation,
  draftMaterialization,
  persistMaterializedSessionNavigation,
  taskCenterSurface,
  topicNavigation,
  switchTopic,
}: UseWorkspaceTaskCenterInteractionRuntimeParams) {
  const materializationRuntime = useTaskCenterDraftMaterializationRuntime({
    ...draftMaterialization,
    persistMaterializedSessionNavigation,
    switchMaterializedSession: switchTopic,
  });
  const topicNavigationRuntime = useTaskCenterTopicNavigationRuntime({
    ...topicNavigation,
    activeTaskCenterDraftTabIdRef:
      materializationRuntime.activeTaskCenterDraftTabIdRef,
    openTaskCenterDraftTab: materializationRuntime.openTaskCenterDraftTab,
    taskCenterDraftTabsRef: materializationRuntime.taskCenterDraftTabsRef,
  });
  const chromeNavigationRuntime = useTaskCenterChromeNavigationRuntime({
    ...chromeNavigation,
    activeDraftTabId: draftMaterialization.activeTaskCenterDraftTabId,
    draftSurfaceActive:
      draftMaterialization.taskCenterDraftSurfaceActiveRef.current,
    draftTabActive: taskCenterSurface.isTaskCenterDraftTabActive,
    draftTabs: draftMaterialization.taskCenterDraftTabs,
    isTaskCenterDraftSurfaceActive:
      taskCenterSurface.isTaskCenterDraftSurfaceActive,
    isTaskCenterDraftTabActive: taskCenterSurface.isTaskCenterDraftTabActive,
    onCloseTaskCenterTab: topicNavigationRuntime.handleCloseTaskCenterTab,
    onOpenTaskTopic: topicNavigationRuntime.handleOpenTaskTopic,
    onSwitchTaskTopic: topicNavigationRuntime.handleSwitchTaskTopic,
    openDraftTab: materializationRuntime.openTaskCenterDraftTab,
  });

  return {
    ...materializationRuntime,
    ...topicNavigationRuntime,
    ...chromeNavigationRuntime,
  };
}
