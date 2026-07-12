import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { FileInput, MessageSquarePlus } from "lucide-react";
import type { AgentSessionInfo } from "@/lib/api/agentRuntime";
import type { AgentBackgroundSessionRuntimeSnapshot } from "@/components/agent/chat";
import {
  resolveUnfinishedSessionProjection,
  type AgentUnfinishedSessionStatus,
} from "@/components/agent/chat/projection/unfinishedSessionProjection";
import {
  formatSidebarSessionMeta,
  resolveSidebarSessionTitle,
} from "@/components/app-sidebar/sidebarSessionFormatting";
import { AppSidebarConversationRow } from "@/components/app-sidebar/AppSidebarConversationRow";
import { AppSidebarConversationEmptyState } from "@/components/app-sidebar/AppSidebarConversationEmptyState";
import { AppSidebarProjectConversationGroups } from "@/components/app-sidebar/AppSidebarProjectConversationGroups";
import {
  AppSidebarConversationMenus,
  CONVERSATION_MENU_APPROX_HEIGHT,
  CONVERSATION_MENU_VIEWPORT_MARGIN,
  CONVERSATION_MENU_WIDTH,
  type ConversationMenuState,
  type ProjectMenuState,
} from "@/components/app-sidebar/AppSidebarConversationMenus";
import {
  buildSidebarConversationGroups,
  type SidebarOpenedProjectSummary,
} from "@/components/app-sidebar/sidebarConversationGroups";
import { resolveSidebarFloatingMenuPosition } from "@/components/app-sidebar/sidebarFloatingMenuPosition";

interface AppSidebarConversationShelfProps {
  openedProjects?: SidebarOpenedProjectSummary[];
  recentSessions: AgentSessionInfo[];
  currentSessionId?: string | null;
  activeAgentStreaming?: boolean;
  backgroundAgentSessionRuntime?: AgentBackgroundSessionRuntimeSnapshot | null;
  recentLoading: boolean;
  hasMoreRecent: boolean;
  actionSessionId: string | null;
  onCreateConversation: (project?: SidebarOpenedProjectSummary) => void;
  onImportConversation?: (project?: SidebarOpenedProjectSummary) => void;
  onNavigateToConversation: (session: AgentSessionInfo) => void;
  onRenameConversation?: (session: AgentSessionInfo) => void;
  onDeleteConversation?: (session: AgentSessionInfo) => void;
  onToggleArchive: (session: AgentSessionInfo, archived: boolean) => void;
  onToggleProjectPin?: (project: SidebarOpenedProjectSummary) => void;
  onRevealProject?: (project: SidebarOpenedProjectSummary) => void;
  onCreateProjectWorktree?: (project: SidebarOpenedProjectSummary) => void;
  onRenameProject?: (project: SidebarOpenedProjectSummary) => void;
  onRemoveProject?: (project: SidebarOpenedProjectSummary) => void;
  onShowMoreRecent: () => void;
}

const FAVORITE_SESSION_IDS_STORAGE_KEY =
  "lime.app-sidebar.favorite-session-ids";

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

const TERMINAL_SIDEBAR_SESSION_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "aborted",
]);

function normalizeSidebarRuntimeStatus(value?: string | null): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) {
    return null;
  }
  return normalized === "cancelled" ? "canceled" : normalized;
}

function hasTerminalSidebarRuntimeStatus(session: AgentSessionInfo): boolean {
  const threadStatus = normalizeSidebarRuntimeStatus(session.thread_status);
  const latestTurnStatus = normalizeSidebarRuntimeStatus(
    session.latest_turn_status,
  );
  return Boolean(
    (threadStatus && TERMINAL_SIDEBAR_SESSION_STATUSES.has(threadStatus)) ||
    (latestTurnStatus &&
      TERMINAL_SIDEBAR_SESSION_STATUSES.has(latestTurnStatus)),
  );
}

function resolveBackgroundSidebarRuntimeStatus(
  session: AgentSessionInfo,
  backgroundAgentSessionRuntime?: AgentBackgroundSessionRuntimeSnapshot | null,
): AgentUnfinishedSessionStatus | null {
  const backgroundSessionId = backgroundAgentSessionRuntime?.sessionId.trim();
  if (
    !backgroundAgentSessionRuntime ||
    !backgroundSessionId ||
    backgroundSessionId !== session.id ||
    hasTerminalSidebarRuntimeStatus(session)
  ) {
    return null;
  }

  switch (backgroundAgentSessionRuntime.status) {
    case "waiting":
      return "waitingAction";
    case "queued":
      return "queued";
    case "running":
      return "running";
  }
}

function compareSessionTimeDesc(left?: number, right?: number): number {
  const leftValue =
    typeof left === "number" && Number.isFinite(left) ? left : 0;
  const rightValue =
    typeof right === "number" && Number.isFinite(right) ? right : 0;
  return rightValue - leftValue;
}

function sortSessionsForShelf(sessions: AgentSessionInfo[]) {
  return [...sessions].sort((left, right) => {
    const updatedAtComparison = compareSessionTimeDesc(
      left.updated_at,
      right.updated_at,
    );
    if (updatedAtComparison !== 0) {
      return updatedAtComparison;
    }

    return String(left.id || "").localeCompare(String(right.id || ""));
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

export function AppSidebarConversationShelf({
  openedProjects = [],
  recentSessions,
  currentSessionId,
  activeAgentStreaming = false,
  backgroundAgentSessionRuntime = null,
  recentLoading,
  hasMoreRecent,
  actionSessionId,
  onCreateConversation,
  onImportConversation,
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
    (session: AgentSessionInfo) =>
      resolveSidebarSessionTitle(session, conversationUntitledLabel),
    [conversationUntitledLabel],
  );
  const formatLocalizedSessionMeta = useCallback(
    (session: AgentSessionInfo) =>
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
  const activeProjectIdKey = useMemo(
    () =>
      activeConversationGroups.projectSections
        .map((section) => section.project.id)
        .join("\u0000"),
    [activeConversationGroups.projectSections],
  );

  useEffect(() => {
    const activeProjectIds = new Set(
      activeProjectIdKey ? activeProjectIdKey.split("\u0000") : [],
    );

    setCollapsedProjectIds((current) => {
      const next = new Set(
        [...current].filter((projectId) => activeProjectIds.has(projectId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [activeProjectIdKey]);

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
    (event: MouseEvent<HTMLButtonElement>, session: AgentSessionInfo) => {
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

  const toggleFavoriteSession = useCallback((session: AgentSessionInfo) => {
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

  const closeMenus = useCallback(() => {
    setMenuState(null);
    setProjectMenuState(null);
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
  const importConversationLabel = t(
    "navigation.sidebar.conversations.importConversation",
    "Import Conversation",
  );
  const importProjectConversationLabel = t(
    "navigation.sidebar.conversations.importProjectConversation",
    "Import Conversation",
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
  const runtimeStatusLabels: Record<AgentUnfinishedSessionStatus, string> = {
    running: t("navigation.sidebar.conversations.status.running", "正在输出"),
    queued: t("navigation.sidebar.conversations.status.queued", "排队中"),
    waitingAction: t(
      "navigation.sidebar.conversations.status.waitingAction",
      "等待确认",
    ),
  };

  const renderConversationRow = (session: AgentSessionInfo) => {
    const active = currentSessionId === session.id;
    const title = resolveLocalizedSessionTitle(session);
    const runtimeProjection = resolveUnfinishedSessionProjection(session);
    const terminalRuntimeStatus = hasTerminalSidebarRuntimeStatus(session);
    const backgroundRuntimeStatus = resolveBackgroundSidebarRuntimeStatus(
      session,
      backgroundAgentSessionRuntime,
    );
    const activeRuntimeStatus: AgentUnfinishedSessionStatus | null =
      active && activeAgentStreaming && !terminalRuntimeStatus
        ? "running"
        : null;
    const runtimeStatus: AgentUnfinishedSessionStatus | null =
      runtimeProjection?.status ??
      backgroundRuntimeStatus ??
      activeRuntimeStatus;
    return (
      <AppSidebarConversationRow
        key={session.id}
        session={session}
        title={title}
        meta={formatLocalizedSessionMeta(session)}
        active={active}
        runtimeStatus={runtimeStatus}
        runtimeStatusLabel={
          runtimeStatus ? runtimeStatusLabels[runtimeStatus] : null
        }
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

  const projectsSection = (
    <ConversationSection>
      <ConversationSectionHeader>
        <ConversationSectionTitle>
          {projectsTitleLabel}
        </ConversationSectionTitle>
      </ConversationSectionHeader>
      <ConversationList data-testid="app-sidebar-project-conversations">
        {recentLoading ? (
          <AppSidebarConversationEmptyState text={loadingRecentLabel} />
        ) : (
          <AppSidebarProjectConversationGroups
            projectSections={sortedConversationGroups.projectSections}
            collapsedProjectIds={collapsedProjectIds}
            newProjectConversationLabel={newProjectConversationLabel}
            projectMoreActionsLabel={projectMoreActionsLabel}
            formatNewProjectConversationForLabel={(projectName) =>
              t("navigation.sidebar.conversations.newProjectConversationFor", {
                title: projectName,
                defaultValue: "在 {{title}} 新建对话",
              })
            }
            formatOpenProjectMenuLabel={(projectName) =>
              t("navigation.sidebar.conversations.projectMenu.open", {
                title: projectName,
                defaultValue: "打开 {{title}} 项目菜单",
              })
            }
            renderConversationRow={renderConversationRow}
            onCreateConversation={onCreateConversation}
            onToggleProjectCollapsed={toggleProjectCollapsed}
            onOpenProjectMenu={openProjectMenu}
          />
        )}
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
          {onImportConversation ? (
            <ConversationActionButton
              type="button"
              onClick={() => onImportConversation()}
              aria-label={importConversationLabel}
              title={importConversationLabel}
              data-testid="app-sidebar-import-conversation-button"
            >
              <FileInput />
            </ConversationActionButton>
          ) : null}
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
        {recentLoading ? (
          <AppSidebarConversationEmptyState text={loadingRecentLabel} />
        ) : sortedConversationGroups.standaloneSessions.length > 0 ? (
          sortedConversationGroups.standaloneSessions.map((session) =>
            renderConversationRow(session),
          )
        ) : (
          <AppSidebarConversationEmptyState text={emptyStandaloneLabel} />
        )}
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

      <AppSidebarConversationMenus
        conversationMenuState={menuState}
        projectMenuState={projectMenuState}
        favoriteSessionIds={favoriteSessionIds}
        resolveSessionTitle={resolveLocalizedSessionTitle}
        onCloseMenus={closeMenus}
        onToggleFavoriteSession={toggleFavoriteSession}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        onToggleArchive={onToggleArchive}
        onToggleProjectPin={onToggleProjectPin}
        onRevealProject={onRevealProject}
        onCreateProjectWorktree={onCreateProjectWorktree}
        onRenameProject={onRenameProject}
        onRemoveProject={onRemoveProject}
        onImportConversation={onImportConversation}
        conversationLabels={{
          ariaLabel: (title) =>
            t("navigation.sidebar.conversations.menu.ariaLabel", {
              title,
              defaultValue: "{{title}} 操作菜单",
            }),
          rename: renameActionLabel,
          favorite: favoriteActionLabel,
          unfavorite: unfavoriteActionLabel,
          archive: archiveActionLabel,
          delete: deleteActionLabel,
        }}
        projectLabels={{
          ariaLabel: (title) =>
            t("navigation.sidebar.conversations.projectMenu.ariaLabel", {
              title,
              defaultValue: "{{title}} 项目菜单",
            }),
          pin: projectPinActionLabel,
          unpin: projectUnpinActionLabel,
          reveal: projectRevealActionLabel,
          createWorktree: projectWorktreeActionLabel,
          importConversation: importProjectConversationLabel,
          importConversationFor: (title) =>
            t("navigation.sidebar.conversations.importProjectConversationFor", {
              title,
              defaultValue: "Import local history to {{title}}",
            }),
          rename: projectRenameActionLabel,
          remove: projectRemoveActionLabel,
        }}
      />
    </ConversationShelf>
  );
}
