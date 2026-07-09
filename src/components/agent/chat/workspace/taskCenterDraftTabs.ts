import { MAX_TASK_CENTER_OPEN_TABS } from "../utils/taskCenterTabs";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";

export type TaskCenterDraftClosePlan =
  | {
      action: "remove";
      remainingDraftTabs: TaskCenterDraftTab[];
    }
  | {
      action: "selectDraft";
      fallbackDraftTabId: string;
      remainingDraftTabs: TaskCenterDraftTab[];
    }
  | {
      action: "switchTopic";
      fallbackTopicId: string;
      remainingDraftTabs: TaskCenterDraftTab[];
    }
  | {
      action: "clearActiveDraft";
      remainingDraftTabs: TaskCenterDraftTab[];
    };

export function buildTaskCenterDraftTab(params: {
  id: string;
  now?: Date;
  title?: string;
}): TaskCenterDraftTab {
  const now = params.now ?? new Date();
  return {
    id: params.id,
    title: params.title ?? "新对话",
    createdAt: now,
    updatedAt: now,
    status: "draft",
  };
}

export function upsertTaskCenterDraftTab(
  current: TaskCenterDraftTab[],
  draftTab: TaskCenterDraftTab,
  maxCount = MAX_TASK_CENTER_OPEN_TABS,
): TaskCenterDraftTab[] {
  const existingIndex = current.findIndex((item) => item.id === draftTab.id);
  if (existingIndex >= 0) {
    return current
      .map((item, index) => (index === existingIndex ? draftTab : item))
      .slice(0, maxCount);
  }

  return [...current, draftTab].slice(-maxCount);
}

export function removeTaskCenterDraftTab(
  current: TaskCenterDraftTab[],
  draftTabId: string,
): TaskCenterDraftTab[] {
  const next = current.filter((tab) => tab.id !== draftTabId);
  return next.length === current.length ? current : next;
}

export function clearActiveTaskCenterDraftTab(
  currentDraftTabId: string | null,
  draftTabId: string,
): string | null {
  return currentDraftTabId === draftTabId ? null : currentDraftTabId;
}

export function markTaskCenterDraftTabFailed(
  current: TaskCenterDraftTab[],
  draftTabId: string,
  updatedAt = new Date(),
): TaskCenterDraftTab[] {
  let changed = false;
  const next = current.map((tab) => {
    if (tab.id !== draftTabId) {
      return tab;
    }

    changed = true;
    return {
      ...tab,
      status: "failed" as const,
      updatedAt,
    };
  });

  return changed ? next : current;
}

export function markTaskCenterDraftTabRunning(params: {
  current: TaskCenterDraftTab[];
  draftTabId: string;
  title: string;
  updatedAt?: Date;
}): TaskCenterDraftTab[] {
  const updatedAt = params.updatedAt ?? new Date();
  let changed = false;
  const next = params.current.map((tab) => {
    if (tab.id !== params.draftTabId) {
      return tab;
    }

    changed = true;
    return {
      ...tab,
      title: params.title,
      status: "running" as const,
      updatedAt,
    };
  });

  return changed ? next : params.current;
}

export function resolveActiveTaskCenterDraftTabId(params: {
  draftTabs: TaskCenterDraftTab[];
  activeDraftTabId?: string | null;
}): string | null {
  const activeDraftTabId = params.activeDraftTabId ?? null;
  return params.draftTabs.some((tab) => tab.id === activeDraftTabId)
    ? activeDraftTabId
    : null;
}

export function shouldWarmupTaskCenterDraftSession(params: {
  agentEntry: string;
  activeDraftTabId?: string | null;
  draftTabs: TaskCenterDraftTab[];
  input?: string;
  isPreparingSend: boolean;
  isSending: boolean;
}): boolean {
  return Boolean(
    params.agentEntry === "claw" &&
      resolveActiveTaskCenterDraftTabId({
        draftTabs: params.draftTabs,
        activeDraftTabId: params.activeDraftTabId,
      }) &&
      Boolean(params.input?.trim()) &&
      !params.isPreparingSend &&
      !params.isSending,
  );
}

export function resolveTaskCenterDraftClosePlan(params: {
  closingDraftTabId: string;
  currentDraftTabs: TaskCenterDraftTab[];
  activeDraftTabId?: string | null;
  openTopicIds: string[];
}): TaskCenterDraftClosePlan {
  const remainingDraftTabs = removeTaskCenterDraftTab(
    params.currentDraftTabs,
    params.closingDraftTabId,
  );
  if (params.activeDraftTabId !== params.closingDraftTabId) {
    return {
      action: "remove",
      remainingDraftTabs,
    };
  }

  const fallbackDraftTabId = remainingDraftTabs[0]?.id ?? null;
  if (fallbackDraftTabId) {
    return {
      action: "selectDraft",
      fallbackDraftTabId,
      remainingDraftTabs,
    };
  }

  const fallbackTopicId = params.openTopicIds[0] ?? null;
  if (fallbackTopicId) {
    return {
      action: "switchTopic",
      fallbackTopicId,
      remainingDraftTabs,
    };
  }

  return {
    action: "clearActiveDraft",
    remainingDraftTabs,
  };
}
