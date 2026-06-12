import { useMemo } from "react";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type { Topic } from "../hooks/agentChatShared";
import { TaskCenterTabStrip } from "../components/TaskCenterTabStrip";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import {
  resolveTaskCenterVisibleTabIds,
  shouldHideTaskCenterTabsForDetachedSession,
} from "../utils/taskCenterTabs";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import {
  buildBrowserWorkspaceHomeTabItem,
  buildTaskCenterTabItems,
  shouldRenderTaskCenterTabStrip,
} from "./taskCenterTabProjection";

type AgentEntry = NonNullable<AgentChatWorkspaceProps["agentEntry"]>;

interface UseTaskCenterTabChromeParams {
  agentEntry: AgentEntry;
  sessionId?: string | null;
  normalizedInitialSessionId?: string | null;
  detachedTopicId?: string | null;
  openTabIds: string[];
  topics: Topic[];
  previewTopicId: string | null;
  draftTabs: TaskCenterDraftTab[];
  activeDraftTabId: string | null;
  isDraftTabActive: boolean;
  hasLocalSessionOverride: boolean;
  topicById: ReadonlyMap<string, Topic>;
  untitledTaskLabel: string;
  shouldUseBrowserWorkspaceHomeChrome: boolean;
  newConversationLabel: string;
  newChatAt?: number;
  homeMountedAt: number;
  isThemeWorkbench: boolean;
  layoutMode: LayoutMode;
  onSwitchTaskTopic: (topicId: string) => void | Promise<void>;
  onRenameTaskTopic: (topicId: string) => void | Promise<void>;
  onCloseTaskCenterTab: (topicId: string) => void | Promise<void>;
  onOpenTaskCenterNewTaskPage: () => void;
  onToggleWorkbench: () => void;
}

export function useTaskCenterTabChrome({
  agentEntry,
  sessionId,
  normalizedInitialSessionId,
  detachedTopicId,
  openTabIds,
  topics,
  previewTopicId,
  draftTabs,
  activeDraftTabId,
  isDraftTabActive,
  hasLocalSessionOverride,
  topicById,
  untitledTaskLabel,
  shouldUseBrowserWorkspaceHomeChrome,
  newConversationLabel,
  newChatAt,
  homeMountedAt,
  isThemeWorkbench: _isThemeWorkbench,
  layoutMode,
  onSwitchTaskTopic,
  onRenameTaskTopic,
  onCloseTaskCenterTab,
  onOpenTaskCenterNewTaskPage,
  onToggleWorkbench,
}: UseTaskCenterTabChromeParams) {
  const shouldHideDetachedTabs = useMemo(
    () =>
      shouldHideTaskCenterTabsForDetachedSession({
        sessionId,
        initialSessionId: normalizedInitialSessionId,
        detachedTopicId,
        openTabIds,
      }),
    [detachedTopicId, normalizedInitialSessionId, openTabIds, sessionId],
  );
  const visibleTabIds = useMemo(
    () =>
      shouldHideDetachedTabs
        ? []
        : resolveTaskCenterVisibleTabIds({
            openTabIds,
            topics,
            currentTopicId: previewTopicId,
          }),
    [openTabIds, previewTopicId, shouldHideDetachedTabs, topics],
  );
  const tabItems = useMemo(
    () =>
      buildTaskCenterTabItems({
        draftTabs,
        activeDraftTabId,
        isDraftTabActive,
        sessionId,
        previewTopicId,
        visibleTabIds,
        topicById,
        untitledTaskLabel,
      }),
    [
      activeDraftTabId,
      draftTabs,
      isDraftTabActive,
      previewTopicId,
      sessionId,
      topicById,
      untitledTaskLabel,
      visibleTabIds,
    ],
  );
  const shouldRenderTabs = shouldRenderTaskCenterTabStrip({
    agentEntry,
    hasLocalSessionOverride,
    tabItemCount: tabItems.length,
  });
  const taskCenterTabsNode = useMemo(() => {
    if (!shouldRenderTabs) {
      return null;
    }

    return (
      <TaskCenterTabStrip
        items={tabItems}
        onSelectTask={(topicId) => {
          void onSwitchTaskTopic(topicId);
        }}
        onRenameTask={(topicId) => {
          void onRenameTaskTopic(topicId);
        }}
        onCloseTask={(topicId) => {
          void onCloseTaskCenterTab(topicId);
        }}
        onCreateTask={onOpenTaskCenterNewTaskPage}
        showWorkbenchToggle={false}
        workbenchVisible={layoutMode !== "chat"}
        onWorkbenchToggle={onToggleWorkbench}
        embedded
      />
    );
  }, [
    layoutMode,
    onCloseTaskCenterTab,
    onOpenTaskCenterNewTaskPage,
    onRenameTaskTopic,
    onSwitchTaskTopic,
    onToggleWorkbench,
    shouldRenderTabs,
    tabItems,
  ]);
  const browserWorkspaceHomeTabsNode = useMemo(() => {
    if (!shouldUseBrowserWorkspaceHomeChrome) {
      return null;
    }

    return (
      <TaskCenterTabStrip
        items={[
          buildBrowserWorkspaceHomeTabItem({
            title: newConversationLabel,
            updatedAtMs: newChatAt ?? homeMountedAt,
          }),
        ]}
        onSelectTask={() => undefined}
        onCloseTask={() => undefined}
        onCreateTask={onOpenTaskCenterNewTaskPage}
      />
    );
  }, [
    homeMountedAt,
    newChatAt,
    newConversationLabel,
    onOpenTaskCenterNewTaskPage,
    shouldUseBrowserWorkspaceHomeChrome,
  ]);

  return {
    shouldHideDetachedTaskCenterTabs: shouldHideDetachedTabs,
    taskCenterVisibleTabIds: visibleTabIds,
    shouldRenderTaskCenterTabStrip: shouldRenderTabs,
    taskCenterTabsNode,
    browserWorkspaceHomeTabsNode,
  };
}
