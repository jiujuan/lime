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
import { resolveSidebarFloatingMenuPosition } from "@/components/app-sidebar/sidebarFloatingMenuPosition";

interface AppSidebarConversationShelfProps {
  openedProjects?: SidebarOpenedProjectSummary[];
  recentSessions: AsterSessionInfo[];
  currentSessionId?: string | null;
  recentLoading: boolean;
  hasMoreRecent: boolean;
  actionSessionId: string | null;
  onCreateConversation: (project?: SidebarOpenedProjectSummary) => void;
  onNavigateToConversation: (session: AsterSessionInfo) => void;
  onRenameConversation?: (session: AsterSessionInfo) => void;
  onDeleteConversation?: (session: AsterSessionInfo) => void;
  onToggleArchive: (session: AsterSessionInfo, archived: boolean) => void;
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

function sortSessionsForShelf(sessions: AsterSessionInfo[]) {
  return [...sessions].sort((left, right) => {
    const valueDiff = right.updated_at - left.updated_at;
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
  const [favoriteSessionIds, setFavoriteSessionIds] = useState<string[]>(
    loadFavoriteSessionIds,
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
    if (!menuState && !projectMenuState) {
      return;
    }

    const closeMenu = () => {
      setMenuState(null);
      setProjectMenuState(null);
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuState, projectMenuState]);

  const openConversationMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, session: AsterSessionInfo) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenuState({
        session,
        ...resolveSidebarFloatingMenuPosition(rect, window, {
          menuWidth: CONVERSATION_MENU_WIDTH,
          menuApproxHeight: CONVERSATION_MENU_APPROX_HEIGHT,
          viewportMargin: CONVERSATION_MENU_VIEWPORT_MARGIN,
        }),
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
        ...resolveSidebarFloatingMenuPosition(rect, window, {
          menuWidth: CONVERSATION_MENU_WIDTH,
          menuApproxHeight: CONVERSATION_MENU_APPROX_HEIGHT,
          viewportMargin: CONVERSATION_MENU_VIEWPORT_MARGIN,
        }),
      });
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
    action();
  }, []);

  const sortedConversationGroups = useMemo(() => {
    return {
      projectSections: activeConversationGroups.projectSections.map(
        (section) => ({
          ...section,
          sessions: sortSessionsForShelf(section.sessions),
        }),
      ),
      standaloneSessions: sortSessionsForShelf(
        activeConversationGroups.standaloneSessions,
      ),
    };
  }, [activeConversationGroups]);

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
  const newProjectConversationLabel = t(
    "navigation.sidebar.conversations.newProjectConversation",
    "在此项目新建对话",
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
  const projectRemoveActionLabel = t(
    "navigation.sidebar.conversations.projectMenu.remove",
    "移除",
  );
  const projectMoreActionsLabel = t(
    "navigation.sidebar.conversations.projectMenu.moreActions",
    "项目操作",
  );

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
        onOpenMenu={openConversationMenu}
      />
    );
  };

  const renderProjectGroups = () => {
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
                "navigation.sidebar.conversations.newProjectConversationFor",
                {
                  title: projectName,
                  defaultValue: "在 {{title}} 新建对话",
                },
              )}
              title={newProjectConversationLabel}
              data-testid="app-sidebar-project-new-conversation"
              onClick={() => onCreateConversation(section.project)}
            >
              <MessageSquarePlus />
            </ProjectMenuButton>
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
          {!collapsed ? (
            <ProjectConversationList>
              {section.sessions.length > 0
                ? section.sessions.map((session) => renderConversationRow(session))
                : null}
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
            onClick={() => onCreateConversation()}
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
      {projectsSection}
      {conversationsSection}

      {renderConversationMenu()}
      {renderProjectMenu()}
    </ConversationShelf>
  );
}
