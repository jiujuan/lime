import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpLeft,
  BrainCircuit,
  Bot,
  BookOpen,
  ChevronDown,
  Clock3,
  GitBranch,
  ListTodo,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logAgentDebug } from "@/lib/agentDebug";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import type {
  AsterSubagentParentContext,
  AsterSubagentSessionInfo,
} from "@/lib/api/agentRuntime";
import { type Topic, type TaskStatusReason } from "../hooks/agentChatShared";
import type { Message } from "../types";
import {
  buildChatSidebarTaskItems,
  buildCollapsedTeamSummary,
  buildTaskSections,
  CHAT_SIDEBAR_STATUS_META,
  filterChatSidebarTaskItems,
  formatRelativeTime,
  OLDER_TASKS_INITIAL_COUNT,
  resolveCurrentTaskPreview,
  resolveSidebarDisplayTitle,
  resolveSubagentSessionTypeLabel,
  resolveSubagentStatusMeta,
  resolveUnixDate,
  shouldMarkSubagentAsFocus,
  sortSubagentSessionsByPriority,
  TEAM_SECTION_INITIAL_CHILD_COUNT,
  TEAM_SECTION_INITIAL_SIBLING_COUNT,
  type ChatSidebarContextVariant,
  type ChatSidebarStatusFilter,
  type TaskCardViewModel,
  type TaskSectionKey,
} from "./ChatSidebarViewModel";

const PINNED_TASK_IDS_STORAGE_KEY = "lime_task_sidebar_pinned_ids";
const HISTORY_LOADING_SKELETON_ROWS = 4;

const CHAT_SIDEBAR_PRIMARY_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[18px] border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100";

const CHAT_SIDEBAR_ACTIVE_FILTER_CLASSNAME =
  "border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_52%,rgba(224,242,254,0.95)_100%)] text-slate-800 shadow-sm shadow-emerald-950/10 dark:border-white dark:bg-white dark:text-slate-900";
const RECENT_CONVERSATION_RENDER_LOG_THRESHOLD_MS = 8;

type AgentNamespaceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

interface ChatSidebarProps {
  contextVariant?: ChatSidebarContextVariant;
  onNewChat: () => void;
  onOpenTaskCenterHome?: () => void;
  onOpenSkillsPage?: () => void;
  onOpenKnowledgePage?: () => void;
  onOpenMemoryPage?: () => void;
  topics: Topic[];
  topicsReady?: boolean;
  currentTopicId: string | null;
  onSwitchTopic: (topicId: string) => void | Promise<void>;
  onOpenArchivedTopic?: (topicId: string) => void | Promise<void>;
  onResumeTask?: (
    topicId: string,
    statusReason?: TaskStatusReason,
  ) => void | Promise<void>;
  onDeleteTopic: (topicId: string) => void;
  onRenameTopic?: (topicId: string, newTitle: string) => void;
  currentMessages?: Message[];
  isSending?: boolean;
  pendingActionCount?: number;
  queuedTurnCount?: number;
  threadStatus?: string | null;
  workspaceError?: boolean;
  childSubagentSessions?: AsterSubagentSessionInfo[];
  subagentParentContext?: AsterSubagentParentContext | null;
  onOpenSubagentSession?: (sessionId: string) => void | Promise<void>;
  onReturnToParentSession?: () => void | Promise<void>;
}

interface TaskCenterNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
}

interface TaskCenterNavSection {
  id: string;
  title: string;
  items: TaskCenterNavItem[];
}

function loadPinnedTaskIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(PINNED_TASK_IDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  contextVariant = "default",
  onNewChat,
  onOpenTaskCenterHome,
  onOpenSkillsPage,
  onOpenKnowledgePage,
  onOpenMemoryPage,
  topics,
  topicsReady = true,
  currentTopicId,
  onSwitchTopic,
  onOpenArchivedTopic,
  onResumeTask,
  onDeleteTopic,
  onRenameTopic,
  currentMessages = [],
  isSending = false,
  pendingActionCount = 0,
  queuedTurnCount = 0,
  threadStatus = null,
  workspaceError = false,
  childSubagentSessions = [],
  subagentParentContext = null,
  onOpenSubagentSession,
  onReturnToParentSession,
}) => {
  const { t } = useTranslation("agent");
  const agentT = useMemo(() => t as unknown as AgentNamespaceTranslation, [t]);
  const sidebarText = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(agentT(`agentChat.sidebar.${key}`, options)),
    [agentT],
  );
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ChatSidebarStatusFilter>("all");
  const [showAllOlder, setShowAllOlder] = useState(false);
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>(() =>
    loadPinnedTaskIds(),
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Record<TaskSectionKey, boolean>
  >({
    running: false,
    waiting: false,
    recent: false,
    older: false,
  });
  const [teamSectionCollapsedOverride, setTeamSectionCollapsedOverride] =
    useState<boolean | null>(null);
  const [showAllChildSubagents, setShowAllChildSubagents] = useState(false);
  const [showAllSiblingSubagents, setShowAllSiblingSubagents] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const taskSectionAnchorRef = useRef<HTMLDivElement>(null);

  const currentTaskPreview = useMemo(
    () => resolveCurrentTaskPreview(currentMessages),
    [currentMessages],
  );
  const pinnedTaskIdSet = useMemo(
    () => new Set(pinnedTaskIds),
    [pinnedTaskIds],
  );

  const taskItems = useMemo(() => {
    const startedAt = Date.now();
    const items = buildChatSidebarTaskItems({
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
    });
    const durationMs = Date.now() - startedAt;
    if (
      contextVariant === "task-center" ||
      durationMs >= RECENT_CONVERSATION_RENDER_LOG_THRESHOLD_MS
    ) {
      const statusCounts = items.reduce<Record<string, number>>(
        (counts, item) => {
          counts[item.status] = (counts[item.status] ?? 0) + 1;
          return counts;
        },
        {},
      );
      const metricContext = {
        currentTopicId: currentTopicId ?? null,
        durationMs,
        isTaskCenter: contextVariant === "task-center",
        itemsCount: items.length,
        pinnedCount: items.filter((item) => item.isPinned).length,
        statusCounts: JSON.stringify(statusCounts),
        topicsCount: topics.length,
      };
      recordAgentUiPerformanceMetric(
        "sidebar.recentConversations.taskItemsComputed",
        metricContext,
      );
      logAgentDebug(
        "ChatSidebar",
        "recentConversations.taskItemsComputed",
        metricContext,
        {
          dedupeKey: `recentConversations.taskItemsComputed:${contextVariant}:${topics.length}:${currentTopicId ?? "none"}`,
          throttleMs: 1000,
        },
      );
    }
    return items;
  }, [
    contextVariant,
    currentTaskPreview,
    currentTopicId,
    currentMessages,
    isSending,
    pendingActionCount,
    queuedTurnCount,
    threadStatus,
    pinnedTaskIdSet,
    topics,
    workspaceError,
  ]);
  const currentTaskItem = useMemo(
    () => taskItems.find((item) => item.id === currentTopicId) ?? null,
    [currentTopicId, taskItems],
  );
  const sortedChildSubagentSessions = useMemo(
    () => sortSubagentSessionsByPriority(childSubagentSessions),
    [childSubagentSessions],
  );
  const siblingSubagentSessions = useMemo(
    () =>
      sortSubagentSessionsByPriority(
        subagentParentContext?.sibling_subagent_sessions ?? [],
      ),
    [subagentParentContext?.sibling_subagent_sessions],
  );
  const visibleChildSubagentSessions = useMemo(
    () =>
      showAllChildSubagents
        ? sortedChildSubagentSessions
        : sortedChildSubagentSessions.slice(
            0,
            TEAM_SECTION_INITIAL_CHILD_COUNT,
          ),
    [showAllChildSubagents, sortedChildSubagentSessions],
  );
  const visibleSiblingSubagentSessions = useMemo(
    () =>
      showAllSiblingSubagents
        ? siblingSubagentSessions
        : siblingSubagentSessions.slice(0, TEAM_SECTION_INITIAL_SIBLING_COUNT),
    [showAllSiblingSubagents, siblingSubagentSessions],
  );
  const hiddenChildSubagentCount = Math.max(
    0,
    sortedChildSubagentSessions.length - visibleChildSubagentSessions.length,
  );
  const hiddenSiblingSubagentCount = Math.max(
    0,
    siblingSubagentSessions.length - visibleSiblingSubagentSessions.length,
  );
  const shouldShowTeamSection =
    Boolean(subagentParentContext) || sortedChildSubagentSessions.length > 0;
  const teamSummarySessions = subagentParentContext
    ? siblingSubagentSessions
    : sortedChildSubagentSessions;
  const shouldAutoCollapseTeamSection = subagentParentContext
    ? siblingSubagentSessions.length > TEAM_SECTION_INITIAL_SIBLING_COUNT
    : sortedChildSubagentSessions.length > TEAM_SECTION_INITIAL_CHILD_COUNT;
  const teamSectionIdentity = subagentParentContext
    ? `child:${subagentParentContext.parent_session_id}:${siblingSubagentSessions
        .map((session) => session.id)
        .join(",")}`
    : `parent:${sortedChildSubagentSessions
        .map((session) => session.id)
        .join(",")}`;
  const teamSectionCollapsed =
    teamSectionCollapsedOverride ?? shouldAutoCollapseTeamSection;
  const collapsedTeamSummary = useMemo(
    () =>
      buildCollapsedTeamSummary(
        teamSummarySessions,
        subagentParentContext
          ? sidebarText("team.parallelSubtaskCount", {
              count: siblingSubagentSessions.length,
            })
          : sidebarText("team.subtaskCount", {
              count: sortedChildSubagentSessions.length,
            }),
      ),
    [
      sidebarText,
      siblingSubagentSessions,
      sortedChildSubagentSessions,
      subagentParentContext,
      teamSummarySessions,
    ],
  );

  const filteredTaskItems = useMemo(() => {
    const startedAt = Date.now();
    const items = filterChatSidebarTaskItems({
      taskItems,
      searchKeyword,
      statusFilter,
    });
    const hasKeyword = searchKeyword.trim().length > 0;
    const durationMs = Date.now() - startedAt;
    if (
      contextVariant === "task-center" ||
      durationMs >= RECENT_CONVERSATION_RENDER_LOG_THRESHOLD_MS
    ) {
      const metricContext = {
        durationMs,
        filteredCount: items.length,
        hasKeyword,
        sourceCount: taskItems.length,
        statusFilter,
      };
      recordAgentUiPerformanceMetric(
        "sidebar.recentConversations.filtered",
        metricContext,
      );
      logAgentDebug(
        "ChatSidebar",
        "recentConversations.filtered",
        metricContext,
        {
          dedupeKey: `recentConversations.filtered:${contextVariant}:${taskItems.length}:${items.length}:${statusFilter}:${hasKeyword}`,
          throttleMs: 1000,
        },
      );
    }
    return items;
  }, [contextVariant, searchKeyword, statusFilter, taskItems]);

  const sections = useMemo(() => {
    const startedAt = Date.now();
    const nextSections = buildTaskSections(filteredTaskItems, contextVariant);
    const durationMs = Date.now() - startedAt;
    if (
      contextVariant === "task-center" ||
      durationMs >= RECENT_CONVERSATION_RENDER_LOG_THRESHOLD_MS
    ) {
      const metricContext = {
        durationMs,
        filteredCount: filteredTaskItems.length,
        olderCount:
          nextSections.find((section) => section.key === "older")?.items
            .length ?? 0,
        recentCount:
          nextSections.find((section) => section.key === "recent")?.items
            .length ?? 0,
        runningCount:
          nextSections.find((section) => section.key === "running")?.items
            .length ?? 0,
        waitingCount:
          nextSections.find((section) => section.key === "waiting")?.items
            .length ?? 0,
      };
      recordAgentUiPerformanceMetric(
        "sidebar.recentConversations.sectionsBuilt",
        metricContext,
      );
      logAgentDebug(
        "ChatSidebar",
        "recentConversations.sectionsBuilt",
        metricContext,
        {
          dedupeKey: `recentConversations.sectionsBuilt:${contextVariant}:${filteredTaskItems.length}`,
          throttleMs: 1000,
        },
      );
    }
    return nextSections;
  }, [contextVariant, filteredTaskItems]);
  const isTaskCenter = contextVariant === "task-center";
  const hasAnyTasks = topics.length > 0;
  const hasFilteredResults = filteredTaskItems.length > 0;
  const isInitialHistoryLoading = !topicsReady && topics.length === 0;
  const taskHeadingLabel = sidebarText(
    isTaskCenter ? "heading.recentConversations" : "heading.tasks",
  );
  const taskHeadingHint = isTaskCenter
    ? sidebarText("heading.recentConversationsHint")
    : null;
  const searchPlaceholder = isTaskCenter
    ? sidebarText("search.conversationPlaceholder")
    : sidebarText("search.taskPlaceholder");
  const newChatLabel = isTaskCenter
    ? sidebarText("action.newConversation")
    : sidebarText("action.newTask");
  const allTasksLabel = isTaskCenter
    ? sidebarText("filter.allConversations")
    : sidebarText("filter.allTasks");
  const activeTasksLabel = isTaskCenter
    ? sidebarText("filter.activeConversations")
    : sidebarText("filter.activeTasks");
  const emptyStateTitle = isTaskCenter
    ? sidebarText("empty.noRecentConversationsTitle")
    : sidebarText("empty.noTasksTitle");
  const emptyStateDescription = isTaskCenter
    ? sidebarText("empty.noRecentConversationsDescription")
    : sidebarText("empty.noTasksDescription");
  const noResultsTitle = isTaskCenter
    ? sidebarText("empty.noConversationResultsTitle")
    : sidebarText("empty.noTaskResultsTitle");
  const noResultsDescription = isTaskCenter
    ? sidebarText("empty.noConversationResultsDescription")
    : sidebarText("empty.noTaskResultsDescription");
  const olderSectionMoreLabel = isTaskCenter
    ? sidebarText("action.showMoreArchivedConversations")
    : sidebarText("action.showMoreOlderTasks");
  const historyLoadingTitle = t("agentChat.sidebar.history.loadingTitle");
  const historyLoadingDescription = t(
    "agentChat.sidebar.history.loadingDescription",
  );
  const historyLoadingBadge = t("agentChat.sidebar.history.loadingBadge");
  const handleCreateConversation = isTaskCenter
    ? (onOpenTaskCenterHome ?? onNewChat)
    : onNewChat;
  const taskCountLabel = isInitialHistoryLoading
    ? historyLoadingBadge
    : searchKeyword.trim()
      ? sidebarText("count.results", { count: filteredTaskItems.length })
      : sidebarText(isTaskCenter ? "count.conversations" : "count.tasks", {
          count: topics.length,
        });
  const sidebarShellClassName = isTaskCenter
    ? "w-[308px] shrink-0 overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfcfd_0%,#f3f6f8_100%)] shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-[#111318]"
    : "w-[308px] shrink-0 overflow-hidden rounded-[30px] border border-emerald-200/40 bg-[linear-gradient(180deg,rgba(252,254,252,0.98)_0%,rgba(247,251,248,0.92)_100%)] shadow-sm shadow-slate-950/5 backdrop-blur dark:border-white/10 dark:bg-[#111318]";
  const searchInputClassName = isTaskCenter
    ? "h-11 w-full rounded-[18px] border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm shadow-slate-950/5 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:border-white/20 dark:focus:ring-white/10"
    : "h-11 w-full rounded-[18px] border border-emerald-200/40 bg-white/90 pl-9 pr-3 text-sm text-slate-700 shadow-sm shadow-slate-950/5 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-100/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:border-white/20 dark:focus:ring-white/10";
  const taskCenterHeaderCardClassName =
    "rounded-[24px] border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5";
  const filterGroupClassName = isTaskCenter
    ? "flex flex-wrap items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-2 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
    : "flex flex-wrap items-center gap-2 rounded-[22px] border border-white/85 bg-white/72 p-2 shadow-sm shadow-slate-950/5";
  const inactiveFilterClassName = isTaskCenter
    ? "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
    : "border-slate-200/80 bg-white/90 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
  const taskCenterNavSections = useMemo<TaskCenterNavSection[]>(
    () => [
      {
        id: "tasks",
        title: sidebarText("nav.tasks"),
        items: [
          {
            id: "new-task",
            label: sidebarText("nav.newTask"),
            icon: Plus,
            onClick: onOpenTaskCenterHome ?? onNewChat,
          },
        ],
      },
      {
        id: "capabilities",
        title: sidebarText("nav.capabilities"),
        items: [
          {
            id: "skills",
            label: sidebarText("nav.skills"),
            icon: Sparkles,
            onClick: onOpenSkillsPage,
          },
        ],
      },
      {
        id: "knowledge",
        title: sidebarText("nav.knowledge"),
        items: [
          {
            id: "knowledge",
            label: sidebarText("nav.projectKnowledge"),
            icon: BookOpen,
            onClick: onOpenKnowledgePage,
          },
          {
            id: "memory",
            label: sidebarText("nav.inspirationLibrary"),
            icon: BrainCircuit,
            onClick: onOpenMemoryPage,
          },
        ],
      },
    ],
    [
      onNewChat,
      onOpenKnowledgePage,
      onOpenMemoryPage,
      onOpenSkillsPage,
      onOpenTaskCenterHome,
      sidebarText,
    ],
  );

  useEffect(() => {
    if (editingTopicId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTopicId]);

  useEffect(() => {
    setShowAllOlder(false);
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    setTeamSectionCollapsedOverride(null);
    setShowAllChildSubagents(false);
    setShowAllSiblingSubagents(false);
  }, [teamSectionIdentity]);

  useEffect(() => {
    if (
      sortedChildSubagentSessions.length <= TEAM_SECTION_INITIAL_CHILD_COUNT
    ) {
      setShowAllChildSubagents(false);
    }
  }, [sortedChildSubagentSessions.length]);

  useEffect(() => {
    if (siblingSubagentSessions.length <= TEAM_SECTION_INITIAL_SIBLING_COUNT) {
      setShowAllSiblingSubagents(false);
    }
  }, [siblingSubagentSessions.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PINNED_TASK_IDS_STORAGE_KEY,
      JSON.stringify(pinnedTaskIds),
    );
  }, [pinnedTaskIds]);

  const handleDeleteClick = (topicId: string) => {
    onDeleteTopic(topicId);
  };

  const handleStartEdit = (topicId: string, currentTitle: string) => {
    setEditingTopicId(topicId);
    setEditTitle(currentTitle);
  };

  const handleTogglePinned = (topicId: string) => {
    setPinnedTaskIds((current) =>
      current.includes(topicId)
        ? current.filter((item) => item !== topicId)
        : [...current, topicId],
    );
  };

  const handleResumeTask = (item: TaskCardViewModel) => {
    if (onResumeTask) {
      void onResumeTask(item.id, item.statusReason);
      return;
    }

    void onSwitchTopic(item.id);
  };

  const handleOpenTaskItem = useCallback(
    (item: TaskCardViewModel, sectionKey: TaskSectionKey) => {
      if (
        contextVariant === "task-center" &&
        sectionKey === "older" &&
        onOpenArchivedTopic
      ) {
        void onOpenArchivedTopic(item.id);
        return;
      }

      void onSwitchTopic(item.id);
    },
    [contextVariant, onOpenArchivedTopic, onSwitchTopic],
  );

  const handleJumpToTaskSection = () => {
    setTeamSectionCollapsedOverride(true);
    setShowAllChildSubagents(false);
    setShowAllSiblingSubagents(false);
    taskSectionAnchorRef.current?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  };

  const handleSaveEdit = () => {
    if (editingTopicId && editTitle.trim() && onRenameTopic) {
      onRenameTopic(editingTopicId, editTitle.trim());
    }
    setEditingTopicId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingTopicId(null);
    setEditTitle("");
  };

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  const renderSubagentSessionCard = (
    session: AsterSubagentSessionInfo,
    options?: {
      focusLabel?: string;
      highlightCurrent?: boolean;
      subtitle?: string;
    },
  ) => {
    const statusMeta = resolveSubagentStatusMeta(session.runtime_status);
    const updatedAt = resolveUnixDate(session.updated_at);
    const canOpen = Boolean(onOpenSubagentSession);

    return (
      <button
        key={session.id}
        type="button"
        data-testid={`sidebar-subagent-session-${session.id}`}
        onClick={() => {
          if (!canOpen) {
            return;
          }
          void onOpenSubagentSession?.(session.id);
        }}
        className={cn(
          "w-full rounded-[20px] border px-3.5 py-3 text-left shadow-sm shadow-slate-950/5 transition",
          options?.highlightCurrent || options?.focusLabel
            ? "border-slate-300 bg-white/98 ring-1 ring-slate-100 dark:border-white/15 dark:bg-white/10"
            : "border-slate-200/80 bg-white/86 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
          !canOpen ? "cursor-default" : "",
        )}
        disabled={!canOpen}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {resolveSidebarDisplayTitle(
                  session.name,
                  sidebarText("team.untitledSubtask"),
                )}
              </div>
              {options?.focusLabel ? (
                <Badge className="border border-sky-200 bg-sky-50 text-sky-700">
                  {options.focusLabel}
                </Badge>
              ) : null}
              <Badge className={statusMeta.badgeClassName}>
                {statusMeta.label}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {options?.subtitle ??
                  resolveSubagentSessionTypeLabel(session.session_type)}
              </span>
              {session.role_hint ? (
                <span>
                  {sidebarText("team.roleHint", { role: session.role_hint })}
                </span>
              ) : null}
              {updatedAt ? (
                <span>
                  {sidebarText("team.updatedAt", {
                    time: formatRelativeTime(updatedAt),
                  })}
                </span>
              ) : null}
            </div>
            {session.task_summary ? (
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {session.task_summary}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <aside
      className={sidebarShellClassName}
      data-testid="chat-sidebar"
      aria-busy={isInitialHistoryLoading}
    >
      <div className="flex h-full min-h-0 flex-col gap-4 p-4">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder={searchPlaceholder}
              className={searchInputClassName}
            />
          </div>

          {isTaskCenter ? (
            <>
              <section className={taskCenterHeaderCardClassName}>
                {taskCenterNavSections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    className={cn(
                      sectionIndex > 0
                        ? "mt-3 border-t border-slate-200/80 pt-3 dark:border-white/10"
                        : "",
                    )}
                  >
                    <div className="px-1 text-[11px] font-semibold tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {section.title}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => item.onClick?.()}
                          disabled={!item.onClick}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
                            item.onClick
                              ? "hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-slate-100"
                              : "cursor-default opacity-70",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              <section className={taskCenterHeaderCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {taskHeadingLabel}
                    </div>
                    {taskHeadingHint ? (
                      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {taskHeadingHint}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={newChatLabel}
                    title={newChatLabel}
                    onClick={handleCreateConversation}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className={cn("mt-3", filterGroupClassName)}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={cn(
                      "inline-flex h-9 flex-1 items-center justify-center rounded-2xl border px-2 text-xs font-medium transition",
                      statusFilter === "all"
                        ? CHAT_SIDEBAR_ACTIVE_FILTER_CLASSNAME
                        : inactiveFilterClassName,
                    )}
                  >
                    {allTasksLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("active")}
                    className={cn(
                      "inline-flex h-9 flex-1 items-center justify-center rounded-2xl border px-2 text-xs font-medium transition",
                      statusFilter === "active"
                        ? CHAT_SIDEBAR_ACTIVE_FILTER_CLASSNAME
                        : inactiveFilterClassName,
                    )}
                  >
                    {activeTasksLabel}
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between px-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <span>
                    {statusFilter === "active"
                      ? activeTasksLabel
                      : allTasksLabel}
                  </span>
                  <span>{taskCountLabel}</span>
                </div>
              </section>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCreateConversation}
                className={CHAT_SIDEBAR_PRIMARY_ACTION_BUTTON_CLASSNAME}
              >
                <Plus className="h-4 w-4" />
                {newChatLabel}
              </button>

              <div className={filterGroupClassName}>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center rounded-2xl border px-2 text-xs font-medium transition",
                    statusFilter === "all"
                      ? CHAT_SIDEBAR_ACTIVE_FILTER_CLASSNAME
                      : inactiveFilterClassName,
                  )}
                >
                  {allTasksLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center rounded-2xl border px-2 text-xs font-medium transition",
                    statusFilter === "active"
                      ? CHAT_SIDEBAR_ACTIVE_FILTER_CLASSNAME
                      : inactiveFilterClassName,
                  )}
                >
                  {activeTasksLabel}
                </button>
              </div>
            </>
          )}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]"
          data-testid="chat-sidebar-scroll-area"
        >
          <div className="space-y-4 pb-1">
            {shouldShowTeamSection ? (
              <section
                className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(248,250,252,0.9)_100%)] px-3.5 py-3.5 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
                data-testid="team-runtime-section"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_52%,rgba(224,242,254,0.95)_100%)] text-emerald-700 shadow-sm shadow-emerald-950/10 dark:border-white/10 dark:bg-white dark:text-slate-900">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {sidebarText("team.label")}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {teamSectionCollapsed
                          ? collapsedTeamSummary
                          : subagentParentContext
                            ? sidebarText("team.parentThreadDescription")
                            : sidebarText("team.childThreadDescription")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className="border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                      {subagentParentContext
                        ? sidebarText("team.subtaskThread")
                        : sidebarText("team.subtaskCount", {
                            count: sortedChildSubagentSessions.length,
                          })}
                    </Badge>
                    {hasAnyTasks ? (
                      <button
                        type="button"
                        aria-label={sidebarText("team.jumpToTasks")}
                        title={sidebarText("team.jumpToTasks")}
                        onClick={handleJumpToTaskSection}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 dark:hover:text-slate-100"
                      >
                        <ListTodo className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={
                        teamSectionCollapsed
                          ? sidebarText("team.expand")
                          : sidebarText("team.collapse")
                      }
                      onClick={() =>
                        setTeamSectionCollapsedOverride(
                          (collapsed) =>
                            !(collapsed ?? shouldAutoCollapseTeamSection),
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 dark:hover:text-slate-100"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          teamSectionCollapsed ? "-rotate-90" : "",
                        )}
                      />
                    </button>
                  </div>
                </div>

                {teamSectionCollapsed ? null : subagentParentContext ? (
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        void onReturnToParentSession?.();
                      }}
                      disabled={!onReturnToParentSession}
                      className={cn(
                        "w-full rounded-[20px] border border-slate-200/80 bg-white/88 px-3.5 py-3 text-left shadow-sm shadow-slate-950/5 transition dark:border-white/10 dark:bg-white/5",
                        onReturnToParentSession
                          ? "hover:border-slate-300 hover:bg-white dark:hover:bg-white/10"
                          : "cursor-default",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
                          <ArrowUpLeft className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {subagentParentContext.parent_session_name}
                            </div>
                            <Badge className="border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                              {sidebarText("team.parentSession")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {sidebarText("team.returnToParentDescription")}
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="rounded-[20px] border border-slate-200/80 bg-white/86 px-3.5 py-3 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {resolveSidebarDisplayTitle(
                            currentTaskItem?.title,
                            sidebarText("team.currentSubtask"),
                          )}
                        </div>
                        <Badge className="border border-emerald-200 bg-white/90 text-emerald-700 shadow-sm shadow-emerald-950/10 dark:border-white/10 dark:bg-white/10 dark:text-slate-100">
                          {sidebarText("team.currentSubtask")}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{sidebarText("team.delegatedFromParent")}</span>
                        {subagentParentContext.role_hint ? (
                          <span>
                            {sidebarText("team.roleHint", {
                              role: subagentParentContext.role_hint,
                            })}
                          </span>
                        ) : null}
                        {currentTaskItem?.updatedAt ? (
                          <span>
                            {sidebarText("team.updatedAt", {
                              time: formatRelativeTime(
                                currentTaskItem.updatedAt,
                              ),
                            })}
                          </span>
                        ) : null}
                      </div>
                      {subagentParentContext.task_summary ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {subagentParentContext.task_summary}
                        </p>
                      ) : null}
                    </div>

                    {visibleSiblingSubagentSessions.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                            {sidebarText("team.parallelSubtasks")}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {sidebarText("team.count", {
                              count: siblingSubagentSessions.length,
                            })}
                          </div>
                        </div>
                        {visibleSiblingSubagentSessions.map((session, index) =>
                          renderSubagentSessionCard(session, {
                            focusLabel:
                              index === 0 && shouldMarkSubagentAsFocus(session)
                                ? sidebarText("team.currentFocus")
                                : undefined,
                          }),
                        )}
                        {hiddenSiblingSubagentCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setShowAllSiblingSubagents(true)}
                            className="w-full rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
                          >
                            {sidebarText("team.expandRemainingParallel", {
                              count: hiddenSiblingSubagentCount,
                            })}
                          </button>
                        ) : null}
                        {showAllSiblingSubagents &&
                        siblingSubagentSessions.length >
                          TEAM_SECTION_INITIAL_SIBLING_COUNT ? (
                          <button
                            type="button"
                            onClick={() => setShowAllSiblingSubagents(false)}
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/78 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
                          >
                            {sidebarText("team.collapseParallelList")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {visibleChildSubagentSessions.map((session) =>
                      renderSubagentSessionCard(session, {
                        focusLabel:
                          session.id === sortedChildSubagentSessions[0]?.id &&
                          shouldMarkSubagentAsFocus(session)
                            ? sidebarText("team.currentFocus")
                            : undefined,
                        highlightCurrent: session.id === currentTopicId,
                      }),
                    )}
                    {hiddenChildSubagentCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllChildSubagents(true)}
                        className="w-full rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
                      >
                        {sidebarText("team.expandRemainingSubtasks", {
                          count: hiddenChildSubagentCount,
                        })}
                      </button>
                    ) : null}
                    {showAllChildSubagents &&
                    sortedChildSubagentSessions.length >
                      TEAM_SECTION_INITIAL_CHILD_COUNT ? (
                      <button
                        type="button"
                        onClick={() => setShowAllChildSubagents(false)}
                        className="w-full rounded-2xl border border-slate-200/80 bg-white/78 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
                      >
                        {sidebarText("team.collapseSubtaskList")}
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            <div
              ref={taskSectionAnchorRef}
              className={isTaskCenter ? "sr-only" : "px-1"}
              data-testid="task-section-heading"
            >
              {isTaskCenter ? (
                <span>{taskHeadingLabel}</span>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                      {taskHeadingLabel}
                    </div>
                    {taskHeadingHint ? (
                      <p className="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-400">
                        {taskHeadingHint}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 pt-0.5 text-xs text-slate-400">
                    {taskCountLabel}
                  </div>
                </div>
              )}
            </div>

            {isInitialHistoryLoading ? (
              <div
                className="rounded-[26px] border border-slate-200/90 bg-white/86 px-4 py-5 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
                data-testid="chat-sidebar-history-loading"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {historyLoadingTitle}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {historyLoadingDescription}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5">
                  {Array.from(
                    { length: HISTORY_LOADING_SKELETON_ROWS },
                    (_, index) => (
                      <div
                        key={index}
                        className="rounded-[20px] border border-slate-200/70 bg-white px-3.5 py-3 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-white/20" />
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-slate-200 dark:bg-white/20" />
                            <div className="h-3 w-full animate-pulse rounded-full bg-slate-100 dark:bg-white/10" />
                            <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-100 dark:bg-white/10" />
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : !hasAnyTasks ? (
              <div className="rounded-[26px] border border-dashed border-slate-200/90 bg-white/82 px-4 py-8 text-center shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {emptyStateTitle}
                </div>
                <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {emptyStateDescription}
                </p>
              </div>
            ) : !hasFilteredResults ? (
              <div className="rounded-[26px] border border-dashed border-slate-200/90 bg-white/82 px-4 py-8 text-center shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/5">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {noResultsTitle}
                </div>
                <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {noResultsDescription}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sections.map((section) => {
                  const isOlderSection = section.key === "older";
                  const isSectionCollapsed = collapsedSections[section.key];
                  const visibleItems =
                    isOlderSection && !showAllOlder
                      ? section.items.slice(0, OLDER_TASKS_INITIAL_COUNT)
                      : section.items;

                  if (section.items.length === 0) {
                    return null;
                  }

                  return (
                    <section key={section.key} className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSections((prev) => ({
                            ...prev,
                            [section.key]: !prev[section.key],
                          }))
                        }
                        className="flex w-full items-center justify-between rounded-2xl px-2.5 py-2 text-left transition hover:bg-white/78 dark:hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-emerald-400 transition-transform",
                              isSectionCollapsed ? "-rotate-90" : "",
                            )}
                          />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {section.title}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {section.items.length}
                        </span>
                      </button>

                      {isSectionCollapsed ? null : (
                        <div className="space-y-2">
                          {visibleItems.map((item) => {
                            const statusMeta =
                              CHAT_SIDEBAR_STATUS_META[item.status];
                            const isResumableItem =
                              item.status === "waiting" ||
                              (item.status === "failed" &&
                                item.statusReason === "workspace_error");

                            return (
                              <div
                                key={item.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (editingTopicId !== item.id) {
                                    handleOpenTaskItem(item, section.key);
                                  }
                                }}
                                onDoubleClick={() =>
                                  handleStartEdit(item.id, item.title)
                                }
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    if (editingTopicId !== item.id) {
                                      handleOpenTaskItem(item, section.key);
                                    }
                                  }
                                }}
                                className={cn(
                                  "group rounded-[22px] border p-3.5 text-left shadow-sm shadow-slate-950/5 transition",
                                  isResumableItem
                                    ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.9)_0%,rgba(255,255,255,0.96)_100%)] shadow-sm shadow-amber-950/5 dark:border-amber-500/20 dark:bg-white/10"
                                    : "",
                                  item.isCurrent
                                    ? isTaskCenter
                                      ? "border-slate-300 bg-white ring-1 ring-slate-100 dark:border-white/15 dark:bg-white/10"
                                      : "border-emerald-200/60 bg-white/98 ring-1 ring-emerald-50 dark:border-white/15 dark:bg-white/10"
                                    : isTaskCenter
                                      ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/10 dark:hover:bg-white/5"
                                      : "border-slate-200/60 bg-white/72 hover:border-emerald-200/60 hover:bg-white/92 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/10 dark:hover:bg-white/5",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={cn(
                                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                                      statusMeta.dotClassName,
                                    )}
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-2">
                                      {editingTopicId === item.id ? (
                                        <input
                                          ref={editInputRef}
                                          type="text"
                                          value={editTitle}
                                          onChange={(event) =>
                                            setEditTitle(event.target.value)
                                          }
                                          onKeyDown={handleEditKeyDown}
                                          onBlur={handleSaveEdit}
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          className="h-8 flex-1 rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-[#17191f] dark:text-slate-100"
                                        />
                                      ) : (
                                        <>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              {item.status === "running" ? (
                                                <Loader2
                                                  className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500"
                                                  data-testid={`chat-sidebar-task-title-loading-${item.id}`}
                                                  aria-hidden="true"
                                                />
                                              ) : null}
                                              <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                {item.title ||
                                                  sidebarText("task.untitled")}
                                              </div>
                                              {item.isPinned ? (
                                                <Pin className="h-3.5 w-3.5 text-emerald-400" />
                                              ) : null}
                                              {item.hasUnread ? (
                                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-1 pt-0.5">
                                            <div className="text-[11px] text-slate-400">
                                              {formatRelativeTime(
                                                item.updatedAt,
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              aria-label={sidebarText(
                                                "task.delete",
                                              )}
                                              title={sidebarText("task.delete")}
                                              className={cn(
                                                "inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300",
                                                item.isCurrent
                                                  ? "opacity-100"
                                                  : "opacity-0 group-hover:opacity-100",
                                              )}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleDeleteClick(item.id);
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <button
                                                  type="button"
                                                  aria-label={sidebarText(
                                                    "task.actions",
                                                  )}
                                                  className={cn(
                                                    "inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100",
                                                    item.isCurrent
                                                      ? "opacity-100"
                                                      : "opacity-0 group-hover:opacity-100",
                                                  )}
                                                  onClick={(event) =>
                                                    event.stopPropagation()
                                                  }
                                                >
                                                  <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                  onClick={() =>
                                                    handleStartEdit(
                                                      item.id,
                                                      item.title,
                                                    )
                                                  }
                                                >
                                                  <PencilLine className="h-4 w-4" />
                                                  {sidebarText("task.rename")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() =>
                                                    handleTogglePinned(item.id)
                                                  }
                                                >
                                                  {item.isPinned ? (
                                                    <PinOff className="h-4 w-4" />
                                                  ) : (
                                                    <Pin className="h-4 w-4" />
                                                  )}
                                                  {item.isPinned
                                                    ? sidebarText("task.unpin")
                                                    : sidebarText("task.pin")}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                  className="text-rose-600"
                                                  onClick={() =>
                                                    handleDeleteClick(item.id)
                                                  }
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                  {sidebarText("task.delete")}
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      {item.lastPreview}
                                    </div>

                                    <div className="mt-3 flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "px-2.5 py-1 text-[11px] font-medium",
                                          statusMeta.badgeClassName,
                                        )}
                                      >
                                        {item.status === "running" ? (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        ) : null}
                                        {item.statusLabel}
                                      </Badge>
                                      <span className="text-[11px] text-slate-400">
                                        {item.messagesCount > 0
                                          ? sidebarText("task.messageCount", {
                                              count: item.messagesCount,
                                            })
                                          : sidebarText("task.notStarted")}
                                      </span>
                                      {isResumableItem && onResumeTask ? (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleResumeTask(item);
                                          }}
                                          className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
                                        >
                                          {sidebarText("task.resume")}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {isOlderSection &&
                          section.items.length > OLDER_TASKS_INITIAL_COUNT &&
                          !showAllOlder ? (
                            <button
                              type="button"
                              onClick={() => setShowAllOlder(true)}
                              className="w-full rounded-2xl border border-dashed border-slate-200 bg-white/75 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
                            >
                              {olderSectionMoreLabel}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
