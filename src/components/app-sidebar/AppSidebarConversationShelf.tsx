import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Check,
  ChevronRight,
  Clock3,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  MessageSquarePlus,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import {
  formatSidebarSessionMeta,
  resolveSidebarSessionTitle,
} from "@/components/app-sidebar/sidebarSessionFormatting";
import { AppSidebarConversationRow } from "@/components/app-sidebar/AppSidebarConversationRow";
import {
  buildSidebarConversationGroups,
  type SidebarOpenedProjectSummary,
} from "@/components/app-sidebar/sidebarConversationGroups";

interface AppSidebarConversationShelfProps {
  openedProjects?: SidebarOpenedProjectSummary[];
  recentSessions: AsterSessionInfo[];
  currentSessionId?: string | null;
  recentLoading: boolean;
  hasMoreRecent: boolean;
  actionSessionId: string | null;
  onCreateConversation: () => void;
  onNavigateToConversation: (session: AsterSessionInfo) => void;
  onRenameConversation?: (session: AsterSessionInfo) => void;
  onDeleteConversation?: (session: AsterSessionInfo) => void;
  onToggleArchive: (session: AsterSessionInfo, archived: boolean) => void;
  onArchiveManyConversations?: (sessions: AsterSessionInfo[]) => void;
  onToggleProjectPin?: (project: SidebarOpenedProjectSummary) => void;
  onRevealProject?: (project: SidebarOpenedProjectSummary) => void;
  onCreateProjectWorktree?: (project: SidebarOpenedProjectSummary) => void;
  onRenameProject?: (project: SidebarOpenedProjectSummary) => void;
  onRemoveProject?: (project: SidebarOpenedProjectSummary) => void;
  onShowMoreRecent: () => void;
}

const FAVORITE_SESSION_IDS_STORAGE_KEY =
  "lime.app-sidebar.favorite-session-ids";
const CONVERSATION_MENU_WIDTH = 188;
const CONVERSATION_MENU_APPROX_HEIGHT = 252;
const CONVERSATION_MENU_VIEWPORT_MARGIN = 12;

type ConversationOrganizeMode =
  | "project"
  | "recent-project"
  | "time"
  | "standalone-first";
type ConversationSortMode = "created" | "updated";
type ShelfMenuSource = "projects" | "conversations";

type ConversationMenuState = {
  session: AsterSessionInfo;
  top: number;
  left: number;
} | null;

type ProjectMenuState = {
  project: SidebarOpenedProjectSummary;
  top: number;
  left: number;
} | null;

type ShelfMenuState = {
  source: ShelfMenuSource;
  top: number;
  left: number;
} | null;

function loadFavoriteSessionIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FAVORITE_SESSION_IDS_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function persistFavoriteSessionIds(sessionIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    FAVORITE_SESSION_IDS_STORAGE_KEY,
    JSON.stringify(sessionIds),
  );
}

function resolveProjectDisplayName(project: SidebarOpenedProjectSummary) {
  return project.name.trim() || project.id;
}

function resolveSessionSortValue(
  session: AsterSessionInfo,
  sortMode: ConversationSortMode,
) {
  return sortMode === "created" ? session.created_at : session.updated_at;
}

function sortSessionsForShelf(
  sessions: AsterSessionInfo[],
  sortMode: ConversationSortMode,
) {
  return [...sessions].sort((left, right) => {
    const valueDiff =
      resolveSessionSortValue(right, sortMode) -
      resolveSessionSortValue(left, sortMode);
    if (valueDiff !== 0) {
      return valueDiff;
    }
    return (
      right.updated_at - left.updated_at || left.id.localeCompare(right.id)
    );
  });
}

const ConversationShelf = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 2px 0 12px;
`;

const ConversationMultiSelectToolbar = styled.div`
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid var(--sidebar-card-border, var(--sidebar-border));
  background: var(--lime-surface, #ffffff);
  color: var(--lime-text, #1a3b2b);
  box-shadow: var(--sidebar-card-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 8px 0 12px;
  font-size: 12px;
  font-weight: 750;
`;

const ConversationMultiSelectDoneButton = styled.button`
  min-height: 28px;
  border: 1px solid var(--lime-card-subtle-border, #d9eadf);
  border-radius: 10px;
  background: var(--lime-surface-soft, #f8fcf9);
  color: var(--lime-brand-strong, #166534);
  cursor: pointer;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;

  &:hover {
    border-color: var(--lime-brand-soft-border, #bbf7d0);
    background: var(--lime-brand-soft, #ecfdf5);
  }
`;

const ConversationSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 116px;
  max-height: 248px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid var(--sidebar-card-border, var(--sidebar-border));
  background: color-mix(
    in srgb,
    var(--sidebar-search-bg, #ffffff) 88%,
    transparent
  );
  box-shadow: inset 0 1px 0 var(--sidebar-card-highlight);
  overflow: hidden;
`;

const ConversationSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 3px;
  color: var(--sidebar-muted);
`;

const ConversationSectionActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const ConversationSectionTitle = styled.h2`
  display: inline-flex;
  align-items: center;
  padding: 0;
  margin: 0;
  color: inherit;
  font-size: 12px;
  font-weight: 760;
`;

const ConversationActionButton = styled.button`
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: var(--sidebar-hover);
    color: var(--sidebar-foreground);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ConversationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--sidebar-border);
    border-radius: 9999px;
  }
`;

const ProjectGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const ProjectHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ProjectButton = styled.button`
  min-height: 34px;
  min-width: 0;
  flex: 1;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--sidebar-foreground);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    background: var(--sidebar-hover);
  }

  svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: var(--sidebar-muted);
  }
`;

const ProjectChevron = styled.span<{ $collapsed: boolean }>`
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--sidebar-muted);
  transform: rotate(${({ $collapsed }) => ($collapsed ? "0deg" : "90deg")});
  transition:
    transform 0.16s ease,
    color 0.16s ease;
`;

const ProjectName = styled.span`
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
`;

const ProjectMenuButton = styled.button`
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  opacity: 0.76;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;

  &:hover {
    background: var(--sidebar-hover);
    color: var(--sidebar-foreground);
    opacity: 1;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ProjectConversationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 14px;
`;

const ConversationListMoreButton = styled.button`
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--sidebar-card-border, var(--sidebar-border));
  border-radius: 11px;
  background: var(--sidebar-search-bg);
  color: var(--sidebar-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: var(--sidebar-hover);
    border-color: var(--sidebar-search-border-hover);
    color: var(--sidebar-foreground);
  }
`;

const ConversationMenuSurface = styled.div`
  position: fixed;
  z-index: 110;
  width: ${CONVERSATION_MENU_WIDTH}px;
  padding: 8px;
  border-radius: 16px;
  border: 1px solid var(--lime-card-subtle-border, rgba(226, 240, 226, 0.9));
  background: var(--lime-surface, #ffffff);
  color: var(--lime-text-strong, #0f172a);
  box-shadow:
    0 22px 64px rgba(15, 23, 42, 0.18),
    0 1px 0 rgba(255, 255, 255, 0.76) inset;
`;

const ConversationMenuItemLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConversationSubmenuWrap = styled.div`
  position: relative;
`;

const ConversationSubmenuSurface = styled.div`
  position: absolute;
  top: 0;
  left: calc(100% + 8px);
  width: ${CONVERSATION_MENU_WIDTH}px;
  padding: 8px;
  border-radius: 16px;
  border: 1px solid var(--lime-card-subtle-border, rgba(226, 240, 226, 0.9));
  background: var(--lime-surface, #ffffff);
  color: var(--lime-text-strong, #0f172a);
  box-shadow:
    0 22px 64px rgba(15, 23, 42, 0.18),
    0 1px 0 rgba(255, 255, 255, 0.76) inset;
`;

const ConversationMenuItem = styled.button<{ $danger?: boolean }>`
  width: 100%;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: ${({ $danger }) =>
    $danger
      ? "var(--lime-danger, #b91c1c)"
      : "var(--lime-text-strong, #0f172a)"};
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-weight: 650;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    background: ${({ $danger }) =>
      $danger
        ? "var(--lime-danger-soft, #fff1f2)"
        : "var(--lime-surface-hover, #f4fdf4)"};
  }

  &:disabled {
    color: var(--sidebar-muted);
    cursor: not-allowed;
    opacity: 0.52;
  }

  &:disabled:hover {
    background: transparent;
  }

  svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: ${({ $danger }) =>
      $danger ? "var(--lime-danger, #b91c1c)" : "var(--sidebar-muted)"};
  }
`;

const ConversationEmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 42px;
  border-radius: 12px;
  padding: 10px;
  color: var(--sidebar-muted);
  font-size: 12px;
  background: color-mix(
    in srgb,
    var(--sidebar-search-bg, #ffffff) 78%,
    transparent
  );
  text-align: center;
`;

function renderEmptyState(text: string) {
  return (
    <ConversationEmptyState>
      <Clock3 size={14} />
      {text}
    </ConversationEmptyState>
  );
}

export function AppSidebarConversationShelf({
  openedProjects = [],
  recentSessions,
  currentSessionId,
  recentLoading,
  hasMoreRecent,
  actionSessionId,
  onCreateConversation,
  onNavigateToConversation,
  onRenameConversation,
  onDeleteConversation,
  onToggleArchive,
  onArchiveManyConversations,
  onToggleProjectPin,
  onRevealProject,
  onCreateProjectWorktree,
  onRenameProject,
  onRemoveProject,
  onShowMoreRecent,
}: AppSidebarConversationShelfProps) {
  const { t, i18n } = useTranslation("navigation");
  const conversationUntitledLabel = t(
    "navigation.sidebar.conversations.untitled",
    "未命名对话",
  );
  const resolveLocalizedSessionTitle = useCallback(
    (session: AsterSessionInfo) =>
      resolveSidebarSessionTitle(session, conversationUntitledLabel),
    [conversationUntitledLabel],
  );
  const formatLocalizedSessionMeta = useCallback(
    (session: AsterSessionInfo) =>
      formatSidebarSessionMeta(session, {
        locale: i18n.language,
      }),
    [i18n.language],
  );
  const activeConversationGroups = useMemo(
    () =>
      buildSidebarConversationGroups({
        sessions: recentSessions,
        openedProjects,
      }),
    [openedProjects, recentSessions],
  );
  const [menuState, setMenuState] = useState<ConversationMenuState>(null);
  const [projectMenuState, setProjectMenuState] =
    useState<ProjectMenuState>(null);
  const [shelfMenuState, setShelfMenuState] = useState<ShelfMenuState>(null);
  const [activeShelfSubmenu, setActiveShelfSubmenu] = useState<
    "organize" | "sort" | null
  >(null);
  const [organizeMode, setOrganizeMode] =
    useState<ConversationOrganizeMode>("project");
  const [sortMode, setSortMode] = useState<ConversationSortMode>("updated");
  const [favoriteSessionIds, setFavoriteSessionIds] = useState<string[]>(
    loadFavoriteSessionIds,
  );
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const activeProjectIds = new Set(
      activeConversationGroups.projectSections.map(
        (section) => section.project.id,
      ),
    );

    setCollapsedProjectIds((current) => {
      const next = new Set(
        [...current].filter((projectId) => activeProjectIds.has(projectId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [activeConversationGroups.projectSections]);

  useEffect(() => {
    if (!menuState && !projectMenuState && !shelfMenuState) {
      return;
    }

    const closeMenu = () => {
      setMenuState(null);
      setProjectMenuState(null);
      setShelfMenuState(null);
      setActiveShelfSubmenu(null);
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuState, projectMenuState, shelfMenuState]);

  const openConversationMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, session: AsterSessionInfo) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenuState({
        session,
        top: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.bottom + 8,
            window.innerHeight -
              CONVERSATION_MENU_APPROX_HEIGHT -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
        left: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.right - CONVERSATION_MENU_WIDTH,
            window.innerWidth -
              CONVERSATION_MENU_WIDTH -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
      });
    },
    [],
  );

  const openProjectMenu = useCallback(
    (
      event: MouseEvent<HTMLButtonElement>,
      project: SidebarOpenedProjectSummary,
    ) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setProjectMenuState({
        project,
        top: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.bottom + 8,
            window.innerHeight -
              CONVERSATION_MENU_APPROX_HEIGHT -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
        left: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.right - CONVERSATION_MENU_WIDTH,
            window.innerWidth -
              CONVERSATION_MENU_WIDTH -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
      });
    },
    [],
  );

  const openShelfMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, source: ShelfMenuSource) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setShelfMenuState({
        source,
        top: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.bottom + 8,
            window.innerHeight -
              CONVERSATION_MENU_APPROX_HEIGHT -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
        left: Math.max(
          CONVERSATION_MENU_VIEWPORT_MARGIN,
          Math.min(
            rect.right - CONVERSATION_MENU_WIDTH,
            window.innerWidth -
              CONVERSATION_MENU_WIDTH -
              CONVERSATION_MENU_VIEWPORT_MARGIN,
          ),
        ),
      });
      setActiveShelfSubmenu(null);
    },
    [],
  );

  const toggleFavoriteSession = useCallback((session: AsterSessionInfo) => {
    setFavoriteSessionIds((current) => {
      const exists = current.includes(session.id);
      const next = exists
        ? current.filter((sessionId) => sessionId !== session.id)
        : [session.id, ...current];
      persistFavoriteSessionIds(next);
      return next;
    });
  }, []);

  const enterMultiSelectMode = useCallback((session: AsterSessionInfo) => {
    setMultiSelectMode(true);
    setSelectedSessionIds(new Set([session.id]));
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedSessionIds(new Set());
  }, []);

  const toggleSelectedSession = useCallback((session: AsterSessionInfo) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(session.id)) {
        next.delete(session.id);
      } else {
        next.add(session.id);
      }
      return next;
    });
  }, []);

  const toggleProjectCollapsed = useCallback((projectId: string) => {
    setCollapsedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const runMenuAction = useCallback((action: () => void) => {
    setMenuState(null);
    setProjectMenuState(null);
    setShelfMenuState(null);
    setActiveShelfSubmenu(null);
    action();
  }, []);

  const sortedConversationGroups = useMemo(() => {
    const projectSections = activeConversationGroups.projectSections.map(
      (section) => ({
        ...section,
        sessions: sortSessionsForShelf(section.sessions, sortMode),
      }),
    );
    const sortedProjectSections =
      organizeMode === "recent-project"
        ? [...projectSections].sort((left, right) => {
            const leftLatest = Math.max(
              ...left.sessions.map((session) =>
                resolveSessionSortValue(session, sortMode),
              ),
              0,
            );
            const rightLatest = Math.max(
              ...right.sessions.map((session) =>
                resolveSessionSortValue(session, sortMode),
              ),
              0,
            );
            return rightLatest - leftLatest;
          })
        : projectSections;

    return {
      projectSections: sortedProjectSections,
      standaloneSessions: sortSessionsForShelf(
        activeConversationGroups.standaloneSessions,
        sortMode,
      ),
    };
  }, [activeConversationGroups, organizeMode, sortMode]);

  const flatConversationSessions = useMemo(
    () =>
      sortSessionsForShelf(
        [
          ...activeConversationGroups.projectSections.flatMap(
            (section) => section.sessions,
          ),
          ...activeConversationGroups.standaloneSessions,
        ],
        sortMode,
      ),
    [activeConversationGroups, sortMode],
  );

  const visibleArchivableSessions = useMemo(() => {
    const sessions =
      organizeMode === "time"
        ? flatConversationSessions
        : [
            ...sortedConversationGroups.projectSections.flatMap(
              (section) => section.sessions,
            ),
            ...sortedConversationGroups.standaloneSessions,
          ];
    return sessions.filter((session) => !session.archived_at);
  }, [flatConversationSessions, organizeMode, sortedConversationGroups]);

  const projectsTitleLabel = t(
    "navigation.sidebar.conversations.projectsTitle",
    "项目",
  );
  const standaloneTitleLabel = t(
    "navigation.sidebar.conversations.standaloneTitle",
    "对话",
  );
  const newConversationLabel = t(
    "navigation.sidebar.conversations.newConversation",
    "新建对话",
  );
  const shelfMenuOpenLabel = t(
    "navigation.sidebar.conversations.shelfMenu.open",
    "打开对话菜单",
  );
  const archiveAllChatsLabel = t(
    "navigation.sidebar.conversations.shelfMenu.archiveAll",
    "归档所有聊天",
  );
  const archiveAllChatsConfirmLabel = t(
    "navigation.sidebar.conversations.shelfMenu.archiveAll.confirm",
    "确定要归档当前侧边栏里的所有聊天吗？",
  );
  const organizeSidebarLabel = t(
    "navigation.sidebar.conversations.shelfMenu.organize",
    "整理侧边栏",
  );
  const sortByLabel = t(
    "navigation.sidebar.conversations.shelfMenu.sortBy",
    "排序条件",
  );
  const organizeByProjectLabel = t(
    "navigation.sidebar.conversations.shelfMenu.organize.byProject",
    "按项目",
  );
  const organizeRecentProjectLabel = t(
    "navigation.sidebar.conversations.shelfMenu.organize.recentProject",
    "近期项目",
  );
  const organizeByTimeLabel = t(
    "navigation.sidebar.conversations.shelfMenu.organize.byTime",
    "按时间顺序",
  );
  const organizeMoveUpLabel = t(
    "navigation.sidebar.conversations.shelfMenu.organize.moveUp",
    "上移",
  );
  const sortCreatedAtLabel = t(
    "navigation.sidebar.conversations.shelfMenu.sort.createdAt",
    "创建时间",
  );
  const sortUpdatedAtLabel = t(
    "navigation.sidebar.conversations.shelfMenu.sort.updatedAt",
    "更新时间",
  );
  const loadingRecentLabel = t(
    "navigation.sidebar.conversations.loadingRecent",
    "正在加载对话",
  );
  const emptyStandaloneLabel = t(
    "navigation.sidebar.conversations.emptyStandalone",
    "暂无聊天",
  );
  const moreRecentLabel = t(
    "navigation.sidebar.conversations.moreRecent",
    "查看更多对话",
  );
  const favoriteBadgeLabel = t(
    "navigation.sidebar.conversations.favoriteBadge",
    "已收藏",
  );
  const moreActionsLabel = t(
    "navigation.sidebar.conversations.moreActions",
    "更多操作",
  );
  const renameActionLabel = t(
    "navigation.sidebar.conversations.menu.rename",
    "重命名",
  );
  const favoriteActionLabel = t(
    "navigation.sidebar.conversations.menu.favorite",
    "收藏",
  );
  const unfavoriteActionLabel = t(
    "navigation.sidebar.conversations.menu.unfavorite",
    "取消收藏",
  );
  const archiveActionLabel = t(
    "navigation.sidebar.conversations.menu.archive",
    "归档",
  );
  const multiselectActionLabel = t(
    "navigation.sidebar.conversations.menu.multiselect",
    "多选",
  );
  const deleteActionLabel = t(
    "navigation.sidebar.conversations.menu.delete",
    "删除",
  );
  const projectPinActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.pin",
    "置顶项目",
  );
  const projectUnpinActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.unpin",
    "取消置顶",
  );
  const projectRevealActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.reveal",
    "显示位置",
  );
  const projectWorktreeActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.createWorktree",
    "创建永久工作树",
  );
  const projectRenameActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.rename",
    "重命名项目",
  );
  const projectArchiveActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.archiveConversations",
    "归档对话",
  );
  const projectRemoveActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.remove",
    "移除",
  );
  const projectMoreActionsLabel = t(
    "navigation.sidebar.conversations.projectMenu.moreActions",
    "项目操作",
  );
  const doneLabel = t("navigation.sidebar.conversations.done", "完成");

  useEffect(() => {
    if (!multiSelectMode || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitMultiSelectMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [exitMultiSelectMode, multiSelectMode]);

  const renderConversationMenu = () => {
    if (!menuState || typeof document === "undefined") {
      return null;
    }

    const { session, top, left } = menuState;
    const title = resolveLocalizedSessionTitle(session);
    const favorite = favoriteSessionIds.includes(session.id);

    return createPortal(
      <ConversationMenuSurface
        role="menu"
        aria-label={t("navigation.sidebar.conversations.menu.ariaLabel", {
          title,
          defaultValue: "{{title}} 操作菜单",
        })}
        style={{ top, left }}
        data-testid="app-sidebar-conversation-menu"
        onClick={(event) => event.stopPropagation()}
      >
        {onRenameConversation ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            data-testid="app-sidebar-conversation-menu-rename"
            onClick={() => runMenuAction(() => onRenameConversation(session))}
          >
            <Pencil />
            {renameActionLabel}
          </ConversationMenuItem>
        ) : null}
        <ConversationMenuItem
          type="button"
          role="menuitem"
          aria-pressed={favorite}
          data-testid="app-sidebar-conversation-menu-favorite"
          onClick={() => runMenuAction(() => toggleFavoriteSession(session))}
        >
          <Pin />
          {favorite ? unfavoriteActionLabel : favoriteActionLabel}
        </ConversationMenuItem>
        <ConversationMenuItem
          type="button"
          role="menuitem"
          data-testid="app-sidebar-conversation-menu-archive"
          onClick={() => runMenuAction(() => onToggleArchive(session, true))}
        >
          <Archive />
          {archiveActionLabel}
        </ConversationMenuItem>
        <ConversationMenuItem
          type="button"
          role="menuitem"
          data-testid="app-sidebar-conversation-menu-multiselect"
          onClick={() => runMenuAction(() => enterMultiSelectMode(session))}
        >
          <Check />
          {multiselectActionLabel}
        </ConversationMenuItem>
        {onDeleteConversation ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            $danger
            data-testid="app-sidebar-conversation-menu-delete"
            onClick={() => runMenuAction(() => onDeleteConversation(session))}
          >
            <Trash2 />
            {deleteActionLabel}
          </ConversationMenuItem>
        ) : null}
      </ConversationMenuSurface>,
      document.body,
    );
  };

  const renderProjectMenu = () => {
    if (!projectMenuState || typeof document === "undefined") {
      return null;
    }

    const { project, top, left } = projectMenuState;
    const title = resolveProjectDisplayName(project);
    const pinned = Boolean(project.isFavorite);

    return createPortal(
      <ConversationMenuSurface
        role="menu"
        aria-label={t(
          "navigation.sidebar.conversations.projectMenu.ariaLabel",
          {
            title,
            defaultValue: "{{title}} 项目菜单",
          },
        )}
        style={{ top, left }}
        data-testid="app-sidebar-project-menu"
        onClick={(event) => event.stopPropagation()}
      >
        {onToggleProjectPin ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            data-testid="app-sidebar-project-menu-pin"
            onClick={() => runMenuAction(() => onToggleProjectPin(project))}
          >
            <Pin />
            {pinned ? projectUnpinActionLabel : projectPinActionLabel}
          </ConversationMenuItem>
        ) : null}
        {onRevealProject ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            data-testid="app-sidebar-project-menu-reveal"
            onClick={() => runMenuAction(() => onRevealProject(project))}
          >
            <FolderOpen />
            {projectRevealActionLabel}
          </ConversationMenuItem>
        ) : null}
        {onCreateProjectWorktree ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            data-testid="app-sidebar-project-menu-worktree"
            onClick={() =>
              runMenuAction(() => onCreateProjectWorktree(project))
            }
          >
            <FolderPlus />
            {projectWorktreeActionLabel}
          </ConversationMenuItem>
        ) : null}
        {onRenameProject ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            data-testid="app-sidebar-project-menu-rename"
            onClick={() => runMenuAction(() => onRenameProject(project))}
          >
            <Pencil />
            {projectRenameActionLabel}
          </ConversationMenuItem>
        ) : null}
        <ConversationMenuItem
          type="button"
          role="menuitem"
          data-testid="app-sidebar-project-menu-archive"
          disabled
        >
          <Archive />
          {projectArchiveActionLabel}
        </ConversationMenuItem>
        {onRemoveProject ? (
          <ConversationMenuItem
            type="button"
            role="menuitem"
            $danger
            data-testid="app-sidebar-project-menu-remove"
            onClick={() => runMenuAction(() => onRemoveProject(project))}
          >
            <Trash2 />
            {projectRemoveActionLabel}
          </ConversationMenuItem>
        ) : null}
      </ConversationMenuSurface>,
      document.body,
    );
  };

  const renderMenuCheck = (checked: boolean) =>
    checked ? <Check aria-hidden="true" /> : <span aria-hidden="true" />;

  const archiveVisibleConversations = () => {
    if (visibleArchivableSessions.length === 0) {
      return;
    }
    if (!window.confirm(archiveAllChatsConfirmLabel)) {
      return;
    }
    onArchiveManyConversations?.(visibleArchivableSessions);
  };

  const renderShelfMenu = () => {
    if (!shelfMenuState || typeof document === "undefined") {
      return null;
    }

    const title =
      shelfMenuState.source === "projects"
        ? projectsTitleLabel
        : standaloneTitleLabel;

    return createPortal(
      <ConversationMenuSurface
        role="menu"
        aria-label={t("navigation.sidebar.conversations.shelfMenu.ariaLabel", {
          title,
          defaultValue: "{{title}} 菜单",
        })}
        style={{ top: shelfMenuState.top, left: shelfMenuState.left }}
        data-testid={`app-sidebar-${shelfMenuState.source}-shelf-menu`}
        onClick={(event) => event.stopPropagation()}
      >
        <ConversationMenuItem
          type="button"
          role="menuitem"
          disabled={
            !onArchiveManyConversations ||
            visibleArchivableSessions.length === 0
          }
          data-testid="app-sidebar-conversation-shelf-menu-archive-all"
          onClick={() => runMenuAction(archiveVisibleConversations)}
        >
          <Archive />
          <ConversationMenuItemLabel>
            {archiveAllChatsLabel}
          </ConversationMenuItemLabel>
        </ConversationMenuItem>
        <ConversationSubmenuWrap
          onMouseEnter={() => setActiveShelfSubmenu("organize")}
        >
          <ConversationMenuItem
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeShelfSubmenu === "organize"}
            data-testid="app-sidebar-conversation-shelf-menu-organize"
            onClick={() =>
              setActiveShelfSubmenu((current) =>
                current === "organize" ? null : "organize",
              )
            }
          >
            <FolderOpen />
            <ConversationMenuItemLabel>
              {organizeSidebarLabel}
            </ConversationMenuItemLabel>
            <ChevronRight />
          </ConversationMenuItem>
          {activeShelfSubmenu === "organize" ? (
            <ConversationSubmenuSurface
              role="menu"
              data-testid="app-sidebar-conversation-organize-submenu"
            >
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={organizeMode === "project"}
                onClick={() => runMenuAction(() => setOrganizeMode("project"))}
              >
                {renderMenuCheck(organizeMode === "project")}
                <ConversationMenuItemLabel>
                  {organizeByProjectLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={organizeMode === "recent-project"}
                onClick={() =>
                  runMenuAction(() => setOrganizeMode("recent-project"))
                }
              >
                {renderMenuCheck(organizeMode === "recent-project")}
                <ConversationMenuItemLabel>
                  {organizeRecentProjectLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={organizeMode === "time"}
                onClick={() => runMenuAction(() => setOrganizeMode("time"))}
              >
                {renderMenuCheck(organizeMode === "time")}
                <ConversationMenuItemLabel>
                  {organizeByTimeLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={organizeMode === "standalone-first"}
                onClick={() =>
                  runMenuAction(() => setOrganizeMode("standalone-first"))
                }
              >
                {renderMenuCheck(organizeMode === "standalone-first")}
                <ConversationMenuItemLabel>
                  {organizeMoveUpLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
            </ConversationSubmenuSurface>
          ) : null}
        </ConversationSubmenuWrap>
        <ConversationSubmenuWrap
          onMouseEnter={() => setActiveShelfSubmenu("sort")}
        >
          <ConversationMenuItem
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeShelfSubmenu === "sort"}
            data-testid="app-sidebar-conversation-shelf-menu-sort"
            onClick={() =>
              setActiveShelfSubmenu((current) =>
                current === "sort" ? null : "sort",
              )
            }
          >
            <Clock3 />
            <ConversationMenuItemLabel>{sortByLabel}</ConversationMenuItemLabel>
            <ChevronRight />
          </ConversationMenuItem>
          {activeShelfSubmenu === "sort" ? (
            <ConversationSubmenuSurface
              role="menu"
              data-testid="app-sidebar-conversation-sort-submenu"
            >
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={sortMode === "created"}
                onClick={() => runMenuAction(() => setSortMode("created"))}
              >
                {renderMenuCheck(sortMode === "created")}
                <ConversationMenuItemLabel>
                  {sortCreatedAtLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
              <ConversationMenuItem
                type="button"
                role="menuitemradio"
                aria-checked={sortMode === "updated"}
                onClick={() => runMenuAction(() => setSortMode("updated"))}
              >
                {renderMenuCheck(sortMode === "updated")}
                <ConversationMenuItemLabel>
                  {sortUpdatedAtLabel}
                </ConversationMenuItemLabel>
              </ConversationMenuItem>
            </ConversationSubmenuSurface>
          ) : null}
        </ConversationSubmenuWrap>
      </ConversationMenuSurface>,
      document.body,
    );
  };

  const renderConversationRow = (session: AsterSessionInfo) => {
    const active = currentSessionId === session.id;
    const title = resolveLocalizedSessionTitle(session);
    return (
      <AppSidebarConversationRow
        key={session.id}
        session={session}
        title={title}
        meta={formatLocalizedSessionMeta(session)}
        active={active}
        favorite={favoriteSessionIds.includes(session.id)}
        selected={selectedSessionIds.has(session.id)}
        multiSelectMode={multiSelectMode}
        actionDisabled={actionSessionId === session.id}
        favoriteBadgeLabel={favoriteBadgeLabel}
        moreActionsLabel={moreActionsLabel}
        openActionMenuLabel={t(
          "navigation.sidebar.conversations.openActionMenu",
          {
            title,
            defaultValue: "打开 {{title}} 操作菜单",
          },
        )}
        onNavigate={onNavigateToConversation}
        onToggleSelected={toggleSelectedSession}
        onOpenMenu={openConversationMenu}
      />
    );
  };

  const renderProjectGroups = () => {
    const showProjectSessions = organizeMode !== "time";
    return sortedConversationGroups.projectSections.map((section) => {
      const projectName = resolveProjectDisplayName(section.project);
      const collapsed = collapsedProjectIds.has(section.project.id);
      return (
        <ProjectGroup
          key={section.project.id}
          data-testid="app-sidebar-project-conversation-group"
        >
          <ProjectHeader>
            <ProjectButton
              type="button"
              title={projectName}
              aria-expanded={!collapsed}
              onClick={() => toggleProjectCollapsed(section.project.id)}
            >
              <ProjectChevron $collapsed={collapsed}>
                <ChevronRight />
              </ProjectChevron>
              <FolderOpen />
              <ProjectName>{projectName}</ProjectName>
            </ProjectButton>
            <ProjectMenuButton
              type="button"
              aria-label={t(
                "navigation.sidebar.conversations.projectMenu.open",
                {
                  title: projectName,
                  defaultValue: "打开 {{title}} 项目菜单",
                },
              )}
              title={projectMoreActionsLabel}
              data-testid="app-sidebar-project-menu-button"
              onClick={(event) => openProjectMenu(event, section.project)}
            >
              <MoreHorizontal />
            </ProjectMenuButton>
          </ProjectHeader>
          {!collapsed && showProjectSessions && section.sessions.length > 0 ? (
            <ProjectConversationList>
              {section.sessions.map((session) =>
                renderConversationRow(session),
              )}
            </ProjectConversationList>
          ) : null}
        </ProjectGroup>
      );
    });
  };

  const projectsSection = (
    <ConversationSection>
      <ConversationSectionHeader>
        <ConversationSectionTitle>
          {projectsTitleLabel}
        </ConversationSectionTitle>
        <ConversationSectionActions>
          <ConversationActionButton
            type="button"
            onClick={(event) => openShelfMenu(event, "projects")}
            aria-label={t(
              "navigation.sidebar.conversations.shelfMenu.openProjects",
              "打开项目对话菜单",
            )}
            title={moreActionsLabel}
            aria-haspopup="menu"
            aria-expanded={
              shelfMenuState?.source === "projects" ? true : undefined
            }
            data-testid="app-sidebar-projects-shelf-menu-button"
          >
            <MoreHorizontal />
          </ConversationActionButton>
        </ConversationSectionActions>
      </ConversationSectionHeader>
      <ConversationList data-testid="app-sidebar-project-conversations">
        {recentLoading
          ? renderEmptyState(loadingRecentLabel)
          : renderProjectGroups()}
      </ConversationList>
    </ConversationSection>
  );

  const conversationsSection = (
    <ConversationSection>
      <ConversationSectionHeader>
        <ConversationSectionTitle>
          {standaloneTitleLabel}
        </ConversationSectionTitle>
        <ConversationSectionActions>
          <ConversationActionButton
            type="button"
            onClick={(event) => openShelfMenu(event, "conversations")}
            aria-label={shelfMenuOpenLabel}
            title={moreActionsLabel}
            aria-haspopup="menu"
            aria-expanded={
              shelfMenuState?.source === "conversations" ? true : undefined
            }
            data-testid="app-sidebar-conversations-shelf-menu-button"
          >
            <MoreHorizontal />
          </ConversationActionButton>
          <ConversationActionButton
            type="button"
            onClick={onCreateConversation}
            aria-label={newConversationLabel}
            title={newConversationLabel}
            data-testid="app-sidebar-new-conversation-button"
          >
            <MessageSquarePlus />
          </ConversationActionButton>
        </ConversationSectionActions>
      </ConversationSectionHeader>
      <ConversationList data-testid="app-sidebar-recent-conversations">
        {recentLoading
          ? renderEmptyState(loadingRecentLabel)
          : organizeMode === "time"
            ? flatConversationSessions.length > 0
              ? flatConversationSessions.map((session) =>
                  renderConversationRow(session),
                )
              : renderEmptyState(emptyStandaloneLabel)
            : sortedConversationGroups.standaloneSessions.length > 0
              ? sortedConversationGroups.standaloneSessions.map((session) =>
                  renderConversationRow(session),
                )
              : renderEmptyState(emptyStandaloneLabel)}
        {hasMoreRecent ? (
          <ConversationListMoreButton type="button" onClick={onShowMoreRecent}>
            {moreRecentLabel}
          </ConversationListMoreButton>
        ) : null}
      </ConversationList>
    </ConversationSection>
  );

  return (
    <ConversationShelf data-testid="app-sidebar-conversation-shelf">
      {multiSelectMode ? (
        <ConversationMultiSelectToolbar data-testid="app-sidebar-conversation-multiselect-toolbar">
          {t("navigation.sidebar.conversations.selectedCount", {
            count: selectedSessionIds.size,
            defaultValue: "已选择 {{count}} 个对话",
          })}
          <ConversationMultiSelectDoneButton
            type="button"
            onClick={exitMultiSelectMode}
          >
            {doneLabel}
          </ConversationMultiSelectDoneButton>
        </ConversationMultiSelectToolbar>
      ) : null}

      {organizeMode === "standalone-first" ? (
        <>
          {conversationsSection}
          {projectsSection}
        </>
      ) : (
        <>
          {projectsSection}
          {conversationsSection}
        </>
      )}

      {renderConversationMenu()}
      {renderProjectMenu()}
      {renderShelfMenu()}
    </ConversationShelf>
  );
}
