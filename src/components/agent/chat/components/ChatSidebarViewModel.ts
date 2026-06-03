import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";
import {
  deriveTaskLiveState,
  extractTaskPreviewFromMessages,
  type Topic,
  type TaskStatus,
  type TaskStatusReason,
} from "../hooks/agentChatShared";
import type { Message } from "../types";
import {
  isOnlyRuntimeAttachmentPlaceholderText,
  resolveRuntimeAttachmentTaskDisplayName,
} from "../utils/runtimeAttachmentPlaceholder";
import {
  isAssistantRuntimeErrorDisplayText,
  sanitizeMessageTextForPreview,
} from "../utils/messageDisplaySanitizer";

export const RECENT_TASK_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
export const OLDER_TASKS_INITIAL_COUNT = 8;
export const TEAM_SECTION_INITIAL_CHILD_COUNT = 3;
export const TEAM_SECTION_INITIAL_SIBLING_COUNT = 2;
export const TEAM_SECTION_LABEL = "子任务";

export type TaskSectionKey = "running" | "waiting" | "recent" | "older";
export type ChatSidebarContextVariant = "default" | "task-center";
export type ChatSidebarStatusFilter = "all" | "active";

export interface TaskCardViewModel {
  id: string;
  title: string;
  updatedAt: Date;
  workspaceId?: string | null;
  messagesCount: number;
  status: TaskStatus;
  statusReason?: TaskStatusReason;
  statusLabel: string;
  lastPreview: string;
  isCurrent: boolean;
  isPinned: boolean;
  hasUnread: boolean;
}

export interface TaskSection {
  key: TaskSectionKey;
  title: string;
  items: TaskCardViewModel[];
}

export const CHAT_SIDEBAR_STATUS_META: Record<
  TaskStatus,
  {
    label: string;
    badgeClassName: string;
    dotClassName: string;
  }
> = {
  draft: {
    label: "待补充",
    badgeClassName:
      "border border-slate-200/80 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
    dotClassName: "bg-slate-400",
  },
  running: {
    label: "进行中",
    badgeClassName:
      "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    dotClassName: "bg-sky-500",
  },
  waiting: {
    label: "待处理",
    badgeClassName:
      "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    dotClassName: "bg-amber-500",
  },
  done: {
    label: "已完成",
    badgeClassName:
      "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  failed: {
    label: "执行失败",
    badgeClassName:
      "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    dotClassName: "bg-rose-500",
  },
};

export const SUBAGENT_STATUS_META: Record<
  NonNullable<AsterSubagentSessionInfo["runtime_status"]> | "idle",
  {
    label: string;
    badgeClassName: string;
  }
> = {
  idle: {
    label: "待开始",
    badgeClassName:
      "border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  },
  queued: {
    label: "稍后开始",
    badgeClassName:
      "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  },
  running: {
    label: "处理中",
    badgeClassName:
      "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
  },
  completed: {
    label: "已完成",
    badgeClassName:
      "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  },
  failed: {
    label: "失败",
    badgeClassName:
      "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200",
  },
  aborted: {
    label: "已中止",
    badgeClassName:
      "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200",
  },
  closed: {
    label: "已关闭",
    badgeClassName:
      "border border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  },
};

const TEAM_STATUS_SUMMARY_ORDER: Array<
  NonNullable<AsterSubagentSessionInfo["runtime_status"]> | "idle"
> = ["running", "queued", "completed", "failed", "aborted", "closed", "idle"];

const SUBAGENT_TASK_PRIORITY: Record<
  NonNullable<AsterSubagentSessionInfo["runtime_status"]> | "idle",
  number
> = {
  running: 0,
  queued: 1,
  failed: 2,
  aborted: 2,
  completed: 3,
  closed: 4,
  idle: 5,
};

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}天前`;
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export function normalizePreviewText(value: string): string {
  return normalizeSidebarLineText(
    sanitizeMessageTextForPreview(value, {
      role: "assistant",
    }),
  ).slice(0, 72);
}

function normalizeSidebarLineText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function resolveSidebarDisplayTitle(
  value: string | null | undefined,
  fallback: string,
): string {
  if (
    isAssistantRuntimeErrorDisplayText(value || "", {
      allowTruncatedTitle: true,
    })
  ) {
    return fallback;
  }

  const attachmentTitle = isOnlyRuntimeAttachmentPlaceholderText(value || "")
    ? resolveRuntimeAttachmentTaskDisplayName(value)
    : null;
  if (attachmentTitle) {
    return attachmentTitle;
  }

  const title = normalizeSidebarLineText(
    sanitizeMessageTextForPreview(value || "", {
      role: "assistant",
    }),
  );
  return title || fallback;
}

export function resolveCurrentTaskPreview(messages: Message[]): string {
  return extractTaskPreviewFromMessages(messages);
}

export function resolveCurrentStatusPreview(
  status: TaskStatus,
  statusReason: TaskStatusReason | undefined,
  fallbackPreview: string,
  pendingActionCount: number,
  workspaceError: boolean,
): string {
  if (
    (workspaceError || statusReason === "workspace_error") &&
    status === "failed"
  ) {
    return "工作区异常，等待你重新选择本地目录后继续。";
  }
  if (status === "running") {
    return "正在生成回复或执行工具，请稍候。";
  }
  if (status === "waiting" && pendingActionCount > 0) {
    return "等待你确认或补充信息后继续执行。";
  }
  if (status === "draft") {
    return "等待你补充任务需求后开始执行。";
  }
  return fallbackPreview;
}

export function resolveStatusLabel(
  status: TaskStatus,
  statusReason?: TaskStatusReason,
): string {
  if (status === "failed" && statusReason === "workspace_error") {
    return "工作区异常";
  }

  return CHAT_SIDEBAR_STATUS_META[status].label;
}

export function resolveTaskStatus(params: {
  topic: Topic;
  currentTopicId: string | null;
  currentMessages: Message[];
  isSending: boolean;
  pendingActionCount: number;
  queuedTurnCount: number;
  threadStatus?: string | null;
  workspaceError: boolean;
}): { status: TaskStatus; statusReason?: TaskStatusReason } {
  const {
    topic,
    currentTopicId,
    currentMessages,
    isSending,
    pendingActionCount,
    queuedTurnCount,
    threadStatus,
    workspaceError,
  } = params;

  if (topic.id === currentTopicId) {
    return deriveTaskLiveState({
      messages: currentMessages,
      isSending,
      pendingActionCount,
      queuedTurnCount,
      threadStatus,
      workspaceError,
    });
  }

  return {
    status: topic.status,
    statusReason: topic.statusReason ?? "default",
  };
}

export function buildChatSidebarTaskItems({
  topics,
  currentTopicId,
  currentMessages,
  currentTaskPreview,
  isSending,
  pendingActionCount,
  queuedTurnCount,
  threadStatus,
  pinnedTaskIdSet,
  workspaceError,
}: {
  topics: Topic[];
  currentTopicId: string | null;
  currentMessages: Message[];
  currentTaskPreview: string;
  isSending: boolean;
  pendingActionCount: number;
  queuedTurnCount: number;
  threadStatus?: string | null;
  pinnedTaskIdSet: Set<string>;
  workspaceError: boolean;
}): TaskCardViewModel[] {
  return topics.map((topic) => {
    const { status, statusReason } = resolveTaskStatus({
      topic,
      currentTopicId,
      currentMessages,
      isSending,
      pendingActionCount,
      queuedTurnCount,
      threadStatus,
      workspaceError,
    });

    const statusLabel = resolveStatusLabel(status, statusReason);
    const isCurrent = topic.id === currentTopicId;
    const fallbackPreview = normalizePreviewText(topic.lastPreview);
    const preview = isCurrent
      ? resolveCurrentStatusPreview(
          status,
          statusReason,
          currentTaskPreview || fallbackPreview,
          pendingActionCount,
          workspaceError,
        )
      : fallbackPreview;

    return {
      id: topic.id,
      title: resolveSidebarDisplayTitle(topic.title, "未命名任务"),
      updatedAt: topic.updatedAt || topic.createdAt,
      workspaceId: topic.workspaceId ?? null,
      messagesCount: topic.messagesCount,
      status,
      statusReason,
      statusLabel,
      lastPreview: preview || "等待你补充任务需求后开始执行。",
      isCurrent,
      isPinned: topic.isPinned || pinnedTaskIdSet.has(topic.id),
      hasUnread: topic.hasUnread,
    };
  });
}

export function filterChatSidebarTaskItems({
  taskItems,
  searchKeyword,
  statusFilter,
}: {
  taskItems: TaskCardViewModel[];
  searchKeyword: string;
  statusFilter: ChatSidebarStatusFilter;
}): TaskCardViewModel[] {
  const keyword = searchKeyword.trim().toLowerCase();
  return taskItems.filter((item) => {
    if (
      statusFilter === "active" &&
      item.status !== "running" &&
      item.status !== "waiting"
    ) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return `${item.title} ${item.lastPreview} ${item.statusLabel}`
      .toLowerCase()
      .includes(keyword);
  });
}

export function sortTaskItems(items: TaskCardViewModel[]): TaskCardViewModel[] {
  return [...items].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

export function buildTaskSections(
  items: TaskCardViewModel[],
  contextVariant: ChatSidebarContextVariant,
  nowMs = Date.now(),
): TaskSection[] {
  const running: TaskCardViewModel[] = [];
  const waiting: TaskCardViewModel[] = [];
  const recent: TaskCardViewModel[] = [];
  const older: TaskCardViewModel[] = [];

  for (const item of items) {
    if (item.status === "running") {
      running.push(item);
      continue;
    }

    if (
      item.status === "waiting" ||
      item.status === "draft" ||
      item.status === "failed"
    ) {
      waiting.push(item);
      continue;
    }

    if (nowMs - item.updatedAt.getTime() <= RECENT_TASK_WINDOW_MS) {
      recent.push(item);
      continue;
    }

    older.push(item);
  }

  const titleSet =
    contextVariant === "task-center"
      ? {
          running: "进行中",
          waiting: "待继续",
          recent: "最近对话",
          older: "归档",
        }
      : {
          running: "进行中",
          waiting: "待处理",
          recent: "最近完成",
          older: "更早任务",
        };

  return [
    { key: "running", title: titleSet.running, items: sortTaskItems(running) },
    { key: "waiting", title: titleSet.waiting, items: sortTaskItems(waiting) },
    { key: "recent", title: titleSet.recent, items: sortTaskItems(recent) },
    { key: "older", title: titleSet.older, items: sortTaskItems(older) },
  ];
}

export function resolveSubagentStatusMeta(
  status?: AsterSubagentSessionInfo["runtime_status"],
): (typeof SUBAGENT_STATUS_META)[keyof typeof SUBAGENT_STATUS_META] {
  return SUBAGENT_STATUS_META[status ?? "idle"];
}

export function sortSubagentSessionsByPriority(
  sessions: AsterSubagentSessionInfo[],
): AsterSubagentSessionInfo[] {
  return [...sessions].sort((left, right) => {
    const leftPriority =
      SUBAGENT_TASK_PRIORITY[left.runtime_status ?? "idle"] ??
      SUBAGENT_TASK_PRIORITY.idle;
    const rightPriority =
      SUBAGENT_TASK_PRIORITY[right.runtime_status ?? "idle"] ??
      SUBAGENT_TASK_PRIORITY.idle;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.updated_at !== right.updated_at) {
      return right.updated_at - left.updated_at;
    }

    if (left.created_at !== right.created_at) {
      return right.created_at - left.created_at;
    }

    return left.id.localeCompare(right.id);
  });
}

export function shouldMarkSubagentAsFocus(
  session: AsterSubagentSessionInfo | undefined,
): boolean {
  if (!session) {
    return false;
  }

  const status = session.runtime_status ?? "idle";
  return status !== "completed" && status !== "closed";
}

export function resolveSubagentSessionTypeLabel(value?: string): string {
  switch (value) {
    case "sub_agent":
      return "子任务";
    case "fork":
      return "分支会话";
    case "user":
    default:
      return value?.trim() || "会话";
  }
}

export function resolveUnixDate(value?: number): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function buildCollapsedTeamSummary(
  sessions: AsterSubagentSessionInfo[],
  label: string,
): string {
  const counts = new Map<
    NonNullable<AsterSubagentSessionInfo["runtime_status"]> | "idle",
    number
  >();

  for (const session of sessions) {
    const key = session.runtime_status ?? "idle";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const statusSummary = TEAM_STATUS_SUMMARY_ORDER.map((status) => {
    const count = counts.get(status) ?? 0;
    if (count <= 0) {
      return null;
    }

    return `${count} 个${SUBAGENT_STATUS_META[status].label}`;
  }).filter((item): item is string => Boolean(item));

  return ["已收起", label, ...statusSummary].join(" · ");
}
