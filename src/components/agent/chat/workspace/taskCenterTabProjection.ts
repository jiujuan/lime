import type { Topic } from "../hooks/agentChatShared";
import type { TaskCenterTabItem } from "../components/TaskCenterTabStrip";
import { resolveInternalImageTaskDisplayName } from "../utils/internalImagePlaceholder";
import { MAX_TASK_CENTER_OPEN_TABS } from "../utils/taskCenterTabs";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";

export const TASK_CENTER_HOME_TAB_ID = "new-task-home";

interface BuildTaskCenterTabItemsParams {
  draftTabs: TaskCenterDraftTab[];
  activeDraftTabId: string | null;
  isDraftTabActive: boolean;
  sessionId?: string | null;
  previewTopicId: string | null;
  visibleTabIds: string[];
  topicById: ReadonlyMap<string, Topic>;
  untitledTaskLabel: string;
  maxCount?: number;
}

interface BuildBrowserWorkspaceHomeTabItemParams {
  title: string;
  updatedAtMs: number;
}

interface ShouldRenderTaskCenterTabStripParams {
  agentEntry: "claw" | "new-task";
  hasLocalSessionOverride: boolean;
  tabItemCount: number;
}

function resolveTopicUpdatedAt(topic: Topic): Date {
  return topic.updatedAt instanceof Date
    ? topic.updatedAt
    : new Date(topic.updatedAt ?? topic.createdAt ?? Date.now());
}

export function buildTaskCenterTabItems({
  draftTabs,
  activeDraftTabId,
  isDraftTabActive,
  sessionId,
  previewTopicId,
  visibleTabIds,
  topicById,
  untitledTaskLabel,
  maxCount = MAX_TASK_CENTER_OPEN_TABS,
}: BuildTaskCenterTabItemsParams): TaskCenterTabItem[] {
  const draftItems = draftTabs.map((draft) => ({
    id: draft.id,
    title: draft.title,
    status: draft.status,
    updatedAt: draft.updatedAt,
    isActive: draft.id === activeDraftTabId,
    hasUnread: false,
    isPinned: false,
    renamable: false,
  }));
  const topicItems = visibleTabIds
    .map((topicId) => topicById.get(topicId))
    .filter((topic): topic is Topic => Boolean(topic))
    .map((topic) => ({
      id: topic.id,
      title:
        resolveInternalImageTaskDisplayName(topic.title) || untitledTaskLabel,
      status: topic.status ?? "done",
      updatedAt: resolveTopicUpdatedAt(topic),
      isActive: !isDraftTabActive && topic.id === (previewTopicId ?? sessionId),
      hasUnread: Boolean(topic.hasUnread),
      isPinned: Boolean(topic.isPinned),
      renamable: true,
    }));

  return [...draftItems, ...topicItems].slice(0, maxCount);
}

export function buildBrowserWorkspaceHomeTabItem({
  title,
  updatedAtMs,
}: BuildBrowserWorkspaceHomeTabItemParams): TaskCenterTabItem {
  return {
    id: TASK_CENTER_HOME_TAB_ID,
    title,
    status: "draft",
    updatedAt: new Date(updatedAtMs),
    isActive: true,
    hasUnread: false,
    isPinned: false,
    renamable: false,
    closable: false,
  };
}

export function shouldRenderTaskCenterTabStrip({
  agentEntry,
  hasLocalSessionOverride,
  tabItemCount,
}: ShouldRenderTaskCenterTabStripParams): boolean {
  return (
    agentEntry === "claw" ||
    (agentEntry === "new-task" && hasLocalSessionOverride && tabItemCount > 0)
  );
}
