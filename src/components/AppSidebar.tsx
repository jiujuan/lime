/**
 * 全局应用侧边栏
 *
 * 当前导航收口为一级主入口 + 底部用户菜单。
 * 默认只暴露主线入口；系统入口统一收进左下角用户弹窗。
 */

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Gift,
  Moon,
  Sun,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AgentPageParams, Page, PageParams } from "@/types/page";
import { SettingsTabs } from "@/types/settings";
import {
  getConfig,
  saveConfig,
  subscribeAppConfigChanged,
} from "@/lib/api/appConfig";
import {
  buildClawAgentParams,
  buildHomeAgentParams,
} from "@/lib/workspace/navigation";
import {
  notifyTaskCenterTaskOpen,
  requestTaskCenterDraftTask,
} from "@/components/agent/chat/taskCenterDraftTaskEvents";
import {
  archiveManyAgentRuntimeSessions,
  deleteAgentRuntimeSession,
  updateAgentRuntimeSession,
  type AsterSessionInfo,
} from "@/lib/api/agentRuntime";
import {
  DEFAULT_ENABLED_SIDEBAR_NAV_ITEM_IDS,
  FOOTER_SIDEBAR_NAV_ITEMS,
  MAIN_SIDEBAR_NAV_ITEMS,
  resolveEnabledSidebarNavItems,
  type SidebarNavItemDefinition,
} from "@/lib/navigation/sidebarNav";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LIME_BRAND_LOGO_SRC, LIME_BRAND_NAME } from "@/lib/branding";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";
import { AppSidebarAccountMenu } from "@/components/app-sidebar/AppSidebarAccountMenu";
import { AppSidebarAppearancePopover } from "@/components/app-sidebar/AppSidebarAppearancePopover";
import { AppSidebarConversationShelf } from "@/components/app-sidebar/AppSidebarConversationShelf";
import { AppSidebarInviteDialog } from "@/components/app-sidebar/AppSidebarInviteDialog";
import { AppSidebarSearchDialog } from "@/components/app-sidebar/AppSidebarSearchDialog";
import { AppUpdateEntry } from "@/components/app-sidebar/AppUpdateEntry";
import { useOpenedProjectSummaries } from "@/components/agent/chat/hooks/useOpenedProjectSummaries";
import { useAppSidebarAppearance } from "@/components/app-sidebar/useAppSidebarAppearance";
import { useAppSidebarProjectActions } from "@/components/app-sidebar/useAppSidebarProjectActions";
import { useAppSidebarSessions } from "@/components/app-sidebar/useAppSidebarSessions";
import {
  AGENT_APP_RUNTIME_SIDEBAR_COLLAPSE_SOURCE,
  APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  APP_SIDEBAR_COLLAPSE_EVENT,
  SIDEBAR_NAV_LABEL_KEYS,
} from "@/components/app-sidebar/AppSidebar.constants";
import {
  Container,
  HeaderArea,
  HeaderTopRow,
  UserButton,
  Avatar,
  UserName,
  SearchButton,
  MenuScroll,
  MainNavList,
  NavButton,
  NavLabel,
  FooterArea,
  ActionRow,
  AppearanceActionSlot,
  IconActionButton,
  HeaderInviteButton,
  AccountActionSlot,
} from "@/components/app-sidebar/AppSidebar.styles";
import {
  formatSidebarSessionMeta,
  resolveSidebarSessionTitle,
} from "@/components/app-sidebar/sidebarSessionFormatting";
import {
  isSameSidebarNavigationTarget,
  resolveSidebarNavigationTarget,
  serializeNavigationParams,
  type SidebarNavigationTarget,
} from "@/components/app-sidebar/sidebarNavigationTarget";
import {
  resolveAccountDisplayName,
  resolveAccountEmail,
  resolveAccountInitial,
  resolveAccountPlanSummary,
  resolveAccountTenantLabel,
  resolveCloudBrandLabel,
} from "@/components/app-sidebar/sidebarAccount";
import { shouldReserveMacWindowControls } from "@/lib/windowControls";
import {
  clearStoredOemCloudSessionState,
  clearOemCloudBootstrapSnapshot,
  getOemCloudBootstrapSnapshot,
  getStoredOemCloudSessionState,
  subscribeOemCloudBootstrapChanged,
  subscribeOemCloudSessionChanged,
  type OemCloudStoredSessionState,
} from "@/lib/oemCloudSession";
import { clearSkillCatalogCache } from "@/lib/api/skillCatalog";
import { clearServiceSkillCatalogCache } from "@/lib/api/serviceSkills";
import {
  getClientReferralDashboard,
  getConfiguredOemCloudTarget,
  logoutClient,
  type OemCloudBootstrapResponse,
  type OemCloudReferralDashboard,
} from "@/lib/api/oemCloudControlPlane";
import { clearSiteAdapterCatalogCache } from "@/lib/siteAdapterCatalogBootstrap";
import {
  buildOemCloudUserCenterUrl,
  createExternalBrowserOpenTarget,
  openExternalUrl,
  startOemCloudLogin,
} from "@/lib/oemCloudLoginLauncher";
import {
  cacheOemCloudReferralDashboard,
  readCachedOemCloudReferralState,
  type OemCloudReferralCachedState,
} from "@/lib/oemCloudReferralCache";
import {
  LAST_PROJECT_ID_KEY,
  loadPersistedProjectId,
  PERSISTED_PROJECT_ID_CHANGED_EVENT,
} from "@/components/agent/chat/hooks/agentProjectStorage";
import { useI18nPatch } from "@/i18n/legacy-patch/I18nPatchProvider";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  normalizeLocalePreference,
  resolveLocaleOptionLabel,
  toLegacyPatchLanguage,
  type LocalePreference,
} from "@/i18n/locales";

interface AppSidebarProps {
  currentPage: Page;
  currentPageParams?: PageParams;
  requestedPage?: Page;
  requestedPageParams?: PageParams;
  onNavigate: (page: Page, params?: PageParams) => void;
  onStartWindowDrag?: (event: ReactMouseEvent<HTMLElement>) => void;
}

type SidebarNavItem = SidebarNavItemDefinition;

export function AppSidebar({
  currentPage,
  currentPageParams,
  requestedPage,
  requestedPageParams,
  onNavigate,
  onStartWindowDrag,
}: AppSidebarProps) {
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
  const renameConversationPromptLabel = t(
    "navigation.sidebar.conversations.rename.prompt",
    "重命名对话",
  );
  const renameConversationSuccessLabel = t(
    "navigation.sidebar.conversations.rename.success",
    "已重命名对话",
  );
  const renameConversationErrorLabel = t(
    "navigation.sidebar.conversations.rename.error",
    "重命名失败，请稍后重试",
  );
  const formatDeleteConversationConfirm = useCallback(
    (title: string) =>
      t("navigation.sidebar.conversations.delete.confirm", {
        title,
        defaultValue: "确定要删除“{{title}}”吗？删除后无法恢复。",
      }),
    [t],
  );
  const deleteConversationSuccessLabel = t(
    "navigation.sidebar.conversations.delete.success",
    "已删除对话",
  );
  const deleteConversationErrorLabel = t(
    "navigation.sidebar.conversations.delete.error",
    "删除失败，请稍后重试",
  );
  const accountFreePlanLabel = t(
    "navigation.sidebar.account.freePlan",
    "免费版",
  );
  const accountOpenSourceTitleLabel = t(
    "navigation.sidebar.account.openSource.title",
    "开源使用",
  );
  const accountDefaultCloudBrandLabel = t(
    "navigation.sidebar.account.defaultCloudBrand",
    "Lime 云端",
  );
  const accountCloudSuffixLabel = t(
    "navigation.sidebar.account.cloudSuffix",
    "云端",
  );
  const inviteLoadErrorLabel = t(
    "navigation.sidebar.invite.feedback.loadFailed",
    "加载邀请信息失败",
  );
  const activePage = requestedPage ?? currentPage;
  const activePageParams = requestedPageParams ?? currentPageParams;
  const activeNavigationTarget = {
    page: activePage,
    rawParams: activePageParams,
    paramsKey: serializeNavigationParams(activePageParams),
  } satisfies SidebarNavigationTarget;
  const requestedNavigationTargetRef = useRef<SidebarNavigationTarget>({
    ...activeNavigationTarget,
  });
  const agentEntry = (activePageParams as AgentPageParams | undefined)
    ?.agentEntry;
  const activeAgentPageParams = activePageParams as AgentPageParams | undefined;
  const isAgentWorkspace = activePage === "agent";
  const isAgentAppRuntime = activePage === "agent-app";
  const isClawTaskCenter = isAgentWorkspace && agentEntry === "claw";
  const isNewTaskHome = activePage === "agent" && agentEntry === "new-task";
  const [rememberedProjectId, setRememberedProjectId] = useState<string | null>(
    () =>
      typeof window === "undefined"
        ? null
        : loadPersistedProjectId(LAST_PROJECT_ID_KEY),
  );
  const activeAgentProjectId = isAgentWorkspace
    ? activeAgentPageParams?.projectId?.trim() || null
    : null;
  const currentProjectId = activeAgentProjectId || rememberedProjectId;
  const openedProjects = useOpenedProjectSummaries(
    activeAgentProjectId
      ? {
          id: activeAgentProjectId,
          name: "",
        }
      : null,
  );
  const openedProjectIds = useMemo(
    () => openedProjects.map((project) => project.id),
    [openedProjects],
  );
  const currentSessionId =
    activeAgentPageParams?.initialSessionId?.trim() || null;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  });
  const collapsedRef = useRef(collapsed);
  const collapseRestoreBySourceRef = useRef<Record<string, boolean>>({});
  const agentAppRuntimeSidebarManualOverrideRef = useRef(false);
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCollapseRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<{ collapsed?: boolean; source?: string }>
      ).detail;
      const source = detail?.source?.trim();
      if (source) {
        if (detail?.collapsed === false) {
          const previous = collapseRestoreBySourceRef.current[source];
          delete collapseRestoreBySourceRef.current[source];
          if (typeof previous === "boolean") {
            setCollapsed(previous);
          }
          return;
        }

        if (!(source in collapseRestoreBySourceRef.current)) {
          collapseRestoreBySourceRef.current[source] = collapsedRef.current;
        }
        setCollapsed(true);
        return;
      }

      setCollapsed(detail?.collapsed ?? true);
    };

    window.addEventListener(APP_SIDEBAR_COLLAPSE_EVENT, handleCollapseRequest);
    return () => {
      window.removeEventListener(
        APP_SIDEBAR_COLLAPSE_EVENT,
        handleCollapseRequest,
      );
    };
  }, []);
  const {
    appearanceColorSchemes,
    appearanceControlRef,
    appearancePopoverOpen,
    appearanceThemeOptions,
    colorSchemeId,
    handleColorSchemeChange,
    handleRandomColorScheme,
    handleThemeModeChange,
    setAppearancePopoverOpen,
    themeState,
    copy: appearanceCopy,
  } = useAppSidebarAppearance();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [language, setLanguageState] = useState<LocalePreference>("zh-CN");
  const [cloudSessionState, setCloudSessionState] =
    useState<OemCloudStoredSessionState | null>(() =>
      typeof window === "undefined" ? null : getStoredOemCloudSessionState(),
    );
  const [cloudBootstrapState, setCloudBootstrapState] =
    useState<OemCloudBootstrapResponse | null>(() =>
      typeof window === "undefined"
        ? null
        : getOemCloudBootstrapSnapshot<OemCloudBootstrapResponse>(),
    );
  const [cachedReferralState, setCachedReferralState] =
    useState<OemCloudReferralCachedState | null>(() =>
      typeof window === "undefined" ? null : readCachedOemCloudReferralState(),
    );
  const [accountLogoutPending, setAccountLogoutPending] = useState(false);
  const [accountLoginPending, setAccountLoginPending] = useState(false);
  const [accountLoginError, setAccountLoginError] = useState<string | null>(
    null,
  );
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteDashboard, setInviteDashboard] =
    useState<OemCloudReferralDashboard | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteReloadKey, setInviteReloadKey] = useState(0);
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const { setLanguage: setI18nLanguage } = useI18nPatch();

  const [enabledNavItems, setEnabledNavItems] = useState<string[]>(
    DEFAULT_ENABLED_SIDEBAR_NAV_ITEM_IDS,
  );
  const sidebarSearchInputRef = useRef<HTMLInputElement | null>(null);
  const accountControlRef = useRef<HTMLDivElement | null>(null);
  const reserveWindowControls = shouldReserveMacWindowControls();

  const openSidebarSearchDialog = useCallback(() => {
    setAccountMenuOpen(false);
    setLanguageMenuOpen(false);
    setAppearancePopoverOpen(false);
    setSidebarSearchOpen(true);
  }, [setAppearancePopoverOpen]);

  const closeSidebarSearchDialog = useCallback(() => {
    setSidebarSearchOpen(false);
    setSidebarSearchQuery("");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      openSidebarSearchDialog();
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => {
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, [openSidebarSearchDialog]);

  useEffect(() => {
    if (!sidebarSearchOpen || typeof window === "undefined") {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      sidebarSearchInputRef.current?.focus();
      sidebarSearchInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [sidebarSearchOpen]);

  useEffect(() => {
    const loadNavConfig = async () => {
      try {
        const config = await getConfig();
        const resolvedItems = resolveEnabledSidebarNavItems(
          config.navigation?.enabled_items,
          config.navigation?.schema_version,
        );
        setEnabledNavItems(resolvedItems);
        setLanguageState(normalizeLocalePreference(config.language));
      } catch (error) {
        console.error("加载配置失败:", error);
      }
    };

    loadNavConfig();

    return subscribeAppConfigChanged(() => {
      void loadNavConfig();
    });
  }, []);

  const localizeSidebarNavItem = useCallback(
    (item: SidebarNavItem): SidebarNavItem => {
      const key = SIDEBAR_NAV_LABEL_KEYS[item.id];
      if (!key) {
        return item;
      }

      return {
        ...item,
        label: t(key, item.label),
      };
    },
    [t],
  );

  const filteredMainNavItems = useMemo<SidebarNavItem[]>(() => {
    return MAIN_SIDEBAR_NAV_ITEMS.filter(
      (item) =>
        item.configurable === false || enabledNavItems.includes(item.id),
    ).map(localizeSidebarNavItem);
  }, [enabledNavItems, localizeSidebarNavItem]);

  const filteredFooterNavItems = useMemo<SidebarNavItem[]>(() => {
    return FOOTER_SIDEBAR_NAV_ITEMS.filter(
      (item) =>
        item.configurable === false || enabledNavItems.includes(item.id),
    ).map(localizeSidebarNavItem);
  }, [enabledNavItems, localizeSidebarNavItem]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentSession = getStoredOemCloudSessionState();
    setCloudSessionState(currentSession);
    setCachedReferralState(
      readCachedOemCloudReferralState(currentSession?.session.tenant.id),
    );
    return subscribeOemCloudSessionChanged((state) => {
      setCloudSessionState(state);
      setCachedReferralState(
        readCachedOemCloudReferralState(state?.session.tenant.id),
      );
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentBootstrap =
      getOemCloudBootstrapSnapshot<OemCloudBootstrapResponse>();
    setCloudBootstrapState(currentBootstrap);
    setCachedReferralState(
      readCachedOemCloudReferralState(currentBootstrap?.session?.tenant.id),
    );
    return subscribeOemCloudBootstrapChanged((payload) => {
      const nextBootstrap = (payload as OemCloudBootstrapResponse) ?? null;
      setCloudBootstrapState(nextBootstrap);
      setCachedReferralState(
        readCachedOemCloudReferralState(nextBootstrap?.session?.tenant.id),
      );
    });
  }, []);

  const inviteTenantId = cloudSessionState?.session.tenant.id;
  const cachedInviteDashboard =
    cloudBootstrapState?.referral ?? cachedReferralState?.dashboard ?? null;
  const inviteFeatureEnabled =
    cloudBootstrapState?.features?.referralEnabled ??
    cachedReferralState?.referralEnabled ??
    true;
  const canLoadReferralDashboard =
    Boolean(cloudSessionState) && inviteFeatureEnabled;

  useEffect(() => {
    if (!inviteDialogOpen || !inviteTenantId || !canLoadReferralDashboard) {
      return;
    }

    if (cachedInviteDashboard) {
      setInviteDashboard(cachedInviteDashboard);
      setInviteError(null);
      setInviteLoading(false);
      return;
    }

    let cancelled = false;
    setInviteLoading(true);
    setInviteError(null);

    getClientReferralDashboard(inviteTenantId)
      .then((dashboard) => {
        if (!cancelled) {
          setCachedReferralState(
            cacheOemCloudReferralDashboard(inviteTenantId, dashboard),
          );
          setInviteDashboard(dashboard);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : inviteLoadErrorLabel;
        setInviteError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setInviteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    inviteDialogOpen,
    inviteReloadKey,
    inviteTenantId,
    canLoadReferralDashboard,
    cachedInviteDashboard,
    inviteLoadErrorLabel,
  ]);

  useEffect(() => {
    if (inviteFeatureEnabled === false && inviteDialogOpen) {
      setInviteDialogOpen(false);
    }
  }, [inviteFeatureEnabled, inviteDialogOpen]);

  useEffect(() => {
    if (!accountMenuOpen || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        accountControlRef.current?.contains(target)
      ) {
        return;
      }

      setAccountMenuOpen(false);
      setLanguageMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setLanguageMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) {
      setLanguageMenuOpen(false);
    }
  }, [accountMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshRememberedProjectId = () => {
      setRememberedProjectId(loadPersistedProjectId(LAST_PROJECT_ID_KEY));
    };

    const handlePersistedProjectChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key && detail.key !== LAST_PROJECT_ID_KEY) {
        return;
      }
      refreshRememberedProjectId();
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== LAST_PROJECT_ID_KEY) {
        return;
      }
      refreshRememberedProjectId();
    };

    window.addEventListener(
      PERSISTED_PROJECT_ID_CHANGED_EVENT,
      handlePersistedProjectChanged,
    );
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        PERSISTED_PROJECT_ID_CHANGED_EVENT,
        handlePersistedProjectChanged,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    requestedNavigationTargetRef.current = activeNavigationTarget;
  }, [activeNavigationTarget]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (Object.keys(collapseRestoreBySourceRef.current).length > 0) {
      return;
    }

    window.localStorage.setItem(
      APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  }, [collapsed]);

  useEffect(() => {
    if (isNewTaskHome) {
      setCollapsed(false);
      return;
    }

    if (!isClawTaskCenter) {
      return;
    }

    setCollapsed(false);
  }, [isClawTaskCenter, isNewTaskHome]);

  useEffect(() => {
    const source = AGENT_APP_RUNTIME_SIDEBAR_COLLAPSE_SOURCE;
    if (isAgentAppRuntime) {
      if (!(source in collapseRestoreBySourceRef.current)) {
        collapseRestoreBySourceRef.current[source] = collapsedRef.current;
        agentAppRuntimeSidebarManualOverrideRef.current = false;
      }
      if (!agentAppRuntimeSidebarManualOverrideRef.current) {
        setCollapsed(true);
      }
      return;
    }

    agentAppRuntimeSidebarManualOverrideRef.current = false;
    const previous = collapseRestoreBySourceRef.current[source];
    delete collapseRestoreBySourceRef.current[source];
    if (typeof previous === "boolean") {
      setCollapsed(previous);
    }
  }, [isAgentAppRuntime]);

  const toggleSidebarCollapsed = useCallback(() => {
    if (isAgentAppRuntime) {
      agentAppRuntimeSidebarManualOverrideRef.current = true;
    }
    setCollapsed((value) => !value);
  }, [isAgentAppRuntime]);

  const shouldShowConversationList =
    !collapsed &&
    !(activePage === "agent" && activeAgentPageParams?.immersiveHome);
  const {
    beginSidebarSessionAction,
    clearSidebarSessionAction,
    deferConversationNavigation,
    fallbackSessionId,
    hasMoreRecentSidebarSessions,
    moveSidebarSessionArchiveStateOptimistically,
    recentSessionsLoading,
    refreshSidebarSessions,
    removeSidebarSessionOptimistically,
    renameSidebarSessionOptimistically,
    shouldShowSessionLoadingState,
    showMoreRecentSessions,
    sidebarSearchHasMoreResults,
    sidebarSearchHasQuery,
    sidebarSearchResultSessions,
    sidebarSessionActionId,
    visibleRecentSidebarSessions,
  } = useAppSidebarSessions({
    currentSessionId,
    openedProjectIds,
    shouldShowConversationList,
    sidebarSearchOpen,
    sidebarSearchQuery,
    isNewTaskHome,
    isClawTaskCenter,
    conversationUntitledLabel,
  });

  const isActive = (item: SidebarNavItem): boolean => {
    if (!item.page) {
      return false;
    }

    if (item.isActive) {
      return item.isActive(activePage, activePageParams);
    }

    return activePage === item.page;
  };

  const tryOpenTaskCenterDraftFromSidebar = useCallback(() => {
    return (
      isAgentWorkspace && requestTaskCenterDraftTask({ source: "sidebar" })
    );
  }, [isAgentWorkspace]);

  const handleNavigate = (item: SidebarNavItem) => {
    if (item.id === "home-general") {
      if (tryOpenTaskCenterDraftFromSidebar()) {
        return;
      }

      const targetParams = buildHomeAgentParams({
        projectId: currentProjectId ?? undefined,
      });
      const target = {
        page: "agent" as Page,
        rawParams: targetParams,
        paramsKey: serializeNavigationParams(targetParams),
      } satisfies SidebarNavigationTarget;

      if (
        isSameSidebarNavigationTarget(
          target,
          requestedNavigationTargetRef.current.page,
          requestedNavigationTargetRef.current.rawParams,
        )
      ) {
        return;
      }

      requestedNavigationTargetRef.current = target;
      onNavigate(target.page, target.rawParams);
      return;
    }

    if (item.id === "workbench") {
      const targetSessionId =
        currentSessionId ?? fallbackSessionId ?? undefined;
      const targetParams = buildClawAgentParams({
        projectId: currentProjectId ?? undefined,
        initialSessionId: targetSessionId,
      });
      const target = {
        page: "agent" as Page,
        rawParams: targetParams,
        paramsKey: serializeNavigationParams(targetParams),
      } satisfies SidebarNavigationTarget;

      if (
        isSameSidebarNavigationTarget(
          target,
          requestedNavigationTargetRef.current.page,
          requestedNavigationTargetRef.current.rawParams,
        )
      ) {
        return;
      }

      requestedNavigationTargetRef.current = target;
      onNavigate(target.page, target.rawParams);
      return;
    }

    if (item.id === "skills") {
      const targetParams = currentProjectId
        ? { creationProjectId: currentProjectId }
        : undefined;
      const target = {
        page: "skills" as Page,
        rawParams: targetParams,
        paramsKey: serializeNavigationParams(targetParams),
      } satisfies SidebarNavigationTarget;

      if (
        isSameSidebarNavigationTarget(
          target,
          requestedNavigationTargetRef.current.page,
          requestedNavigationTargetRef.current.rawParams,
        )
      ) {
        return;
      }

      requestedNavigationTargetRef.current = target;
      onNavigate(target.page, target.rawParams);
      return;
    }

    const target = resolveSidebarNavigationTarget(item);

    if (!target) {
      return;
    }

    if (
      isSameSidebarNavigationTarget(
        target,
        requestedNavigationTargetRef.current.page,
        requestedNavigationTargetRef.current.rawParams,
      )
    ) {
      return;
    }

    requestedNavigationTargetRef.current = target;
    onNavigate(target.page, target.rawParams);
  };

  const maybeWrapWithTooltip = (node: ReactElement, label: string) => {
    if (!collapsed) {
      return node;
    }

    return (
      <Tooltip key={node.key ?? label}>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const renderNavItem = (item: SidebarNavItem) => {
    const active = isActive(item);
    const button = (
      <NavButton
        key={item.id}
        $active={active}
        $collapsed={collapsed}
        onClick={() => handleNavigate(item)}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        data-testid={`app-sidebar-nav-${item.id}`}
      >
        <item.icon />
        <NavLabel $collapsed={collapsed}>{item.label}</NavLabel>
      </NavButton>
    );

    return maybeWrapWithTooltip(button, item.label);
  };

  const handleNavigateToConversation = useCallback(
    (session: AsterSessionInfo) => {
      deferConversationNavigation();

      if (isClawTaskCenter) {
        notifyTaskCenterTaskOpen({
          sessionId: session.id,
          workspaceId: session.workspace_id ?? currentProjectId ?? null,
          source: "sidebar",
        });
        return;
      }

      const targetParams = buildClawAgentParams({
        projectId: session.workspace_id ?? currentProjectId ?? undefined,
        initialSessionId: session.id,
      });
      const target = {
        page: "agent" as Page,
        rawParams: targetParams,
        paramsKey: serializeNavigationParams(targetParams),
      } satisfies SidebarNavigationTarget;

      if (
        isSameSidebarNavigationTarget(
          target,
          requestedNavigationTargetRef.current.page,
          requestedNavigationTargetRef.current.rawParams,
        )
      ) {
        return;
      }

      requestedNavigationTargetRef.current = target;
      onNavigate(target.page, target.rawParams);
    },
    [
      currentProjectId,
      deferConversationNavigation,
      isClawTaskCenter,
      onNavigate,
    ],
  );

  const handleNavigateToNewTask = useCallback(() => {
    if (tryOpenTaskCenterDraftFromSidebar()) {
      return;
    }

    const targetParams = buildHomeAgentParams({
      projectId: currentProjectId ?? undefined,
    });
    const target = {
      page: "agent" as Page,
      rawParams: targetParams,
      paramsKey: serializeNavigationParams(targetParams),
    } satisfies SidebarNavigationTarget;

    if (
      isSameSidebarNavigationTarget(
        target,
        requestedNavigationTargetRef.current.page,
        requestedNavigationTargetRef.current.rawParams,
      )
    ) {
      return;
    }

    requestedNavigationTargetRef.current = target;
    onNavigate(target.page, target.rawParams);
  }, [currentProjectId, onNavigate, tryOpenTaskCenterDraftFromSidebar]);

  const projectActions = useAppSidebarProjectActions({
    currentProjectId,
    onNavigate,
    refreshSidebarSessions,
  });

  const handleSidebarSearchCreateConversation = () => {
    closeSidebarSearchDialog();
    handleNavigateToNewTask();
  };

  const handleSidebarSearchNavigateToConversation = useCallback(
    (session: AsterSessionInfo) => {
      closeSidebarSearchDialog();
      recordAgentUiPerformanceMetric("sidebar.conversation.click", {
        sessionId: session.id,
        source: "sidebar_search",
        workspaceId: session.workspace_id ?? currentProjectId ?? null,
      });
      handleNavigateToConversation(session);
    },
    [closeSidebarSearchDialog, currentProjectId, handleNavigateToConversation],
  );

  const handleSidebarSearchResultClick = useCallback(
    (session: AsterSessionInfo) => {
      handleSidebarSearchNavigateToConversation(session);
    },
    [handleSidebarSearchNavigateToConversation],
  );

  const handleRenameConversation = useCallback(
    async (session: AsterSessionInfo) => {
      const currentTitle = resolveLocalizedSessionTitle(session);
      const nextTitle = window
        .prompt(renameConversationPromptLabel, currentTitle)
        ?.trim();
      if (!nextTitle || nextTitle === currentTitle) {
        return;
      }

      const nextUpdatedAt = Math.floor(Date.now() / 1000);
      const nextSession = {
        ...session,
        name: nextTitle,
        updated_at: nextUpdatedAt,
      } satisfies AsterSessionInfo;
      beginSidebarSessionAction(session.id);
      renameSidebarSessionOptimistically(nextSession);

      try {
        await updateAgentRuntimeSession({
          session_id: session.id,
          name: nextTitle,
        });
        toast.success(renameConversationSuccessLabel);
        await refreshSidebarSessions();
      } catch (error) {
        console.error("重命名会话失败:", error);
        toast.error(renameConversationErrorLabel);
        await refreshSidebarSessions();
      } finally {
        clearSidebarSessionAction(session.id);
      }
    },
    [
      beginSidebarSessionAction,
      clearSidebarSessionAction,
      refreshSidebarSessions,
      renameConversationErrorLabel,
      renameConversationPromptLabel,
      renameConversationSuccessLabel,
      renameSidebarSessionOptimistically,
      resolveLocalizedSessionTitle,
    ],
  );

  const handleToggleSessionArchive = useCallback(
    async (session: AsterSessionInfo, archived: boolean) => {
      const nextUpdatedAt = Math.floor(Date.now() / 1000);
      const nextSession = {
        ...session,
        updated_at: nextUpdatedAt,
        archived_at: archived ? nextUpdatedAt : null,
      } satisfies AsterSessionInfo;
      beginSidebarSessionAction(session.id);
      moveSidebarSessionArchiveStateOptimistically(nextSession);

      try {
        await updateAgentRuntimeSession({
          session_id: session.id,
          archived,
        });
        await refreshSidebarSessions();
      } catch (error) {
        console.error(archived ? "归档会话失败:" : "恢复会话失败:", error);
        await refreshSidebarSessions();
      } finally {
        clearSidebarSessionAction(session.id);
      }
    },
    [
      beginSidebarSessionAction,
      clearSidebarSessionAction,
      moveSidebarSessionArchiveStateOptimistically,
      refreshSidebarSessions,
    ],
  );

  const handleArchiveManyConversations = useCallback(
    async (sessions: AsterSessionInfo[]) => {
      const sessionIds = sessions
        .map((session) => session.id.trim())
        .filter(Boolean);
      if (sessionIds.length === 0) {
        return;
      }

      try {
        await archiveManyAgentRuntimeSessions(sessionIds);
        await refreshSidebarSessions();
      } catch (error) {
        console.error("批量归档会话失败:", error);
        await refreshSidebarSessions();
      }
    },
    [refreshSidebarSessions],
  );

  const handleDeleteConversation = useCallback(
    async (session: AsterSessionInfo) => {
      const title = resolveLocalizedSessionTitle(session);
      const confirmed = window.confirm(formatDeleteConversationConfirm(title));
      if (!confirmed) {
        return;
      }

      beginSidebarSessionAction(session.id);
      removeSidebarSessionOptimistically(session.id);

      try {
        await deleteAgentRuntimeSession(session.id);
        toast.success(deleteConversationSuccessLabel);
        if (currentSessionId === session.id) {
          handleNavigateToNewTask();
        } else {
          await refreshSidebarSessions();
        }
      } catch (error) {
        console.error("删除会话失败:", error);
        toast.error(deleteConversationErrorLabel);
        await refreshSidebarSessions();
      } finally {
        clearSidebarSessionAction(session.id);
      }
    },
    [
      beginSidebarSessionAction,
      clearSidebarSessionAction,
      currentSessionId,
      deleteConversationErrorLabel,
      deleteConversationSuccessLabel,
      formatDeleteConversationConfirm,
      handleNavigateToNewTask,
      removeSidebarSessionOptimistically,
      refreshSidebarSessions,
      resolveLocalizedSessionTitle,
    ],
  );

  const currentLanguageLabel = resolveLocaleOptionLabel(language);
  const accountDisplayName = resolveAccountDisplayName(
    cloudSessionState,
    accountOpenSourceTitleLabel,
  );
  const accountEmail = resolveAccountEmail(cloudSessionState);
  const accountTenantLabel = resolveAccountTenantLabel(cloudSessionState);
  const accountPlanSummary = resolveAccountPlanSummary(
    cloudBootstrapState,
    accountFreePlanLabel,
  );
  const cloudBrandLabel = resolveCloudBrandLabel(
    cloudBootstrapState,
    accountDefaultCloudBrandLabel,
    accountCloudSuffixLabel,
  );
  const accountAvatarUrl = cloudSessionState?.session.user.avatarUrl?.trim();
  const accountInitial = resolveAccountInitial(accountDisplayName);
  const hasCloudAccount = Boolean(cloudSessionState);
  const accountMetaLine =
    [accountEmail, accountTenantLabel].filter(Boolean).join(" · ") ||
    accountDisplayName;
  const inviteEntryVisible = inviteFeatureEnabled;
  const homeLabel = t("navigation.sidebar.home.label", "Lime 首页");
  const homeAriaLabel = t(
    "navigation.sidebar.home.ariaLabel",
    "返回 Lime 首页",
  );
  const collapseNavigationLabel = t(
    "navigation.sidebar.actions.collapse",
    "折叠导航栏",
  );
  const expandNavigationLabel = t(
    "navigation.sidebar.actions.expand",
    "展开导航栏",
  );
  const navigationToggleLabel = collapsed
    ? expandNavigationLabel
    : collapseNavigationLabel;
  const searchTaskLabel = t("navigation.sidebar.search.label", "搜索任务");
  const searchConversationTitleLabel = t(
    "navigation.sidebar.search.inputLabel",
    "搜索对话标题",
  );
  const closeSearchDialogLabel = t(
    "navigation.sidebar.search.close",
    "关闭搜索弹窗",
  );
  const createConversationLabel = t(
    "navigation.sidebar.search.createConversation",
    "新建对话",
  );
  const searchMatchesLabel = t(
    "navigation.sidebar.search.section.matches",
    "匹配结果",
  );
  const searchRecentLabel = t(
    "navigation.sidebar.search.section.recent",
    "最近",
  );
  const searchLoadingLabel = t(
    "navigation.sidebar.search.loading",
    "正在加载对话",
  );
  const searchSelectProjectFirstLabel = t(
    "navigation.sidebar.search.selectProjectFirst",
    "请先选择项目工作区",
  );
  const searchEmptyMatchesLabel = t(
    "navigation.sidebar.search.emptyMatches",
    "没有匹配的对话标题",
  );
  const searchEmptyRecentLabel = t(
    "navigation.sidebar.search.emptyRecent",
    "还没有最近对话",
  );
  const searchLoadingMoreLabel = t(
    "navigation.sidebar.search.loadingMore",
    "正在加载...",
  );
  const searchMoreMatchesLabel = t(
    "navigation.sidebar.search.moreMatches",
    "查看更多匹配结果",
  );
  const searchMoreRecentLabel = t(
    "navigation.sidebar.search.moreRecent",
    "查看更多对话",
  );
  const interfaceLanguageLabel = t(
    "navigation.sidebar.account.interfaceLanguage",
    "界面语言",
  );
  const selectLanguageLabel = t(
    "navigation.sidebar.account.selectLanguage",
    "选择界面语言",
  );
  const languageMenuLabel = interfaceLanguageLabel;
  const accountOpenUserMenuLabel = t(
    "navigation.sidebar.account.openMenu",
    "打开用户菜单",
  );
  const accountMenuLabel = t("navigation.sidebar.account.menu", "用户菜单");
  const accountCloudStateLabel = t(
    "navigation.sidebar.account.state.cloud",
    "云端",
  );
  const accountLocalStateLabel = t(
    "navigation.sidebar.account.state.local",
    "本地可用",
  );
  const accountLocalTooltipLabel = t(
    "navigation.sidebar.account.localTooltip",
    "开源使用 · 本地可用",
  );
  const connectCloudLabel = t("navigation.sidebar.account.connectCloud", {
    brand: cloudBrandLabel,
    defaultValue: "连接 {{brand}}",
  });
  const accountLoginPendingLabel = t(
    "navigation.sidebar.account.login.opening",
    "正在打开...",
  );
  const accountLoginOpenedLabel = t("navigation.sidebar.account.login.opened", {
    brand: cloudBrandLabel,
    defaultValue: "已打开 {{brand}} 登录页，请在浏览器完成授权",
  });
  const accountLoginFailedFallbackLabel = t(
    "navigation.sidebar.account.login.failed",
    {
      brand: cloudBrandLabel,
      defaultValue: "打开 {{brand}} 登录页失败",
    },
  );
  const accountUserCenterLabel = t(
    "navigation.sidebar.account.userCenter",
    "用户中心",
  );
  const accountUserCenterOpenedLabel = t(
    "navigation.sidebar.account.userCenterOpened",
    {
      brand: cloudBrandLabel,
      defaultValue: "已打开 {{brand}} 用户中心",
    },
  );
  const accountUserCenterFailedFallbackLabel = t(
    "navigation.sidebar.account.userCenterFailed",
    {
      brand: cloudBrandLabel,
      defaultValue: "打开 {{brand}} 用户中心失败",
    },
  );
  const accountModelSettingsLabel = t(
    "navigation.sidebar.account.modelSettings",
    "模型设置",
  );
  const accountAboutLabel = t("navigation.sidebar.account.about", "关于");
  const accountLogoutLabel = t("navigation.sidebar.account.logout", "退出登录");
  const accountLogoutPendingLabel = t(
    "navigation.sidebar.account.logoutPending",
    "退出中...",
  );
  const accountViewPlanDetailsLabel = t(
    "navigation.sidebar.account.viewPlanDetails",
    "查看套餐详情",
  );
  const accountViewDetailsLabel = t(
    "navigation.sidebar.account.viewDetails",
    "查看详情",
  );
  const accountOpenSourceInfoLabel = t(
    "navigation.sidebar.account.openSource.info",
    "开源使用说明",
  );
  const accountOpenSourceDescriptionLabel = t(
    "navigation.sidebar.account.openSource.description",
    {
      brand: cloudBrandLabel,
      defaultValue:
        "本地开源功能可直接使用；你可以先进入模型设置配置本地渠道，也可以按需连接 {{brand}} 同步账号、积分、套餐和商业化能力。",
    },
  );
  const accountNoLoginAvailableLabel = t(
    "navigation.sidebar.account.openSource.noLogin",
    "不登录也可用",
  );
  const accountLocalModelConfigurableLabel = t(
    "navigation.sidebar.account.openSource.localModel",
    "本地模型可配置",
  );
  const accountButtonTooltip = hasCloudAccount
    ? `${accountDisplayName}${accountEmail ? ` · ${accountEmail}` : ""}`
    : accountLocalTooltipLabel;
  const inviteShare = inviteDashboard?.share;
  const inviteEntryLabel = t(
    "navigation.sidebar.invite.entry.label",
    "邀请好友",
  );
  const inviteCloseDialogLabel = t(
    "navigation.sidebar.invite.dialog.close",
    "关闭邀请弹窗",
  );
  const inviteBrandName =
    inviteShare?.brandName ?? accountTenantLabel ?? "Lime";
  const inviteEyebrowLabel = t("navigation.sidebar.invite.dialog.eyebrow", {
    brand: inviteBrandName,
    defaultValue: "{{brand}} 邀请",
  });
  const inviteDialogTitleLabel = t(
    "navigation.sidebar.invite.dialog.title",
    "邀请好友",
  );
  const inviteHeadline =
    inviteShare?.headline?.trim() ||
    t("navigation.sidebar.invite.dialog.headlineFallback", "邀请好友加入内测");
  const inviteRules =
    inviteShare?.rules?.trim() ||
    t(
      "navigation.sidebar.invite.dialog.rulesFallback",
      "通过云端邀请策略自动发放奖励，具体到账以当前品牌云端配置为准。",
    );
  const inviteDescriptionLabel =
    !inviteLoading && !inviteError
      ? t("navigation.sidebar.invite.dialog.descriptionWithRules", {
          headline: inviteHeadline,
          rules: inviteRules,
          defaultValue: "{{headline}}。{{rules}}",
        })
      : inviteHeadline;
  const inviteDisconnectedLabel = t(
    "navigation.sidebar.invite.status.disconnected",
    {
      brand: cloudBrandLabel,
      defaultValue:
        "连接 {{brand}} 后会生成专属邀请码，并自动读取当前品牌云端的域名和奖励策略。",
    },
  );
  const inviteConnectAccountLabel = t(
    "navigation.sidebar.invite.actions.connectCloudAccount",
    "连接云端账号",
  );
  const inviteLoadingLabel = t(
    "navigation.sidebar.invite.status.loading",
    "正在从云端同步邀请信息...",
  );
  const inviteRetryLabel = t("navigation.sidebar.invite.actions.retry", "重试");
  const inviteCodeLabel = t("navigation.sidebar.invite.fields.code", "邀请码");
  const inviteCopyLabel = t("navigation.sidebar.invite.actions.copy", "复制");
  const inviteDownloadUrlLabel = t(
    "navigation.sidebar.invite.fields.downloadUrl",
    "下载地址",
  );
  const inviteLandingUrlLabel = t(
    "navigation.sidebar.invite.fields.landingUrl",
    "邀请链接",
  );
  const inviteReferrerRewardLabel = t(
    "navigation.sidebar.invite.fields.referrerReward",
    "邀请人奖励",
  );
  const inviteInviteeRewardLabel = t(
    "navigation.sidebar.invite.fields.inviteeReward",
    "被邀请人奖励",
  );
  const inviteCopyShareTextLabel = t(
    "navigation.sidebar.invite.actions.copyShareText",
    "复制邀请文案",
  );
  const inviteCopyLandingUrlLabel = t(
    "navigation.sidebar.invite.actions.copyLandingUrl",
    "复制邀请链接",
  );
  const inviteCopyCodeSuccessLabel = t(
    "navigation.sidebar.invite.feedback.codeCopied",
    "已复制邀请码",
  );
  const inviteCopyShareTextSuccessLabel = t(
    "navigation.sidebar.invite.feedback.shareTextCopied",
    "已复制邀请文案",
  );
  const inviteCopyLandingUrlSuccessLabel = t(
    "navigation.sidebar.invite.feedback.landingUrlCopied",
    "已复制邀请链接",
  );
  const inviteCopyEmptyLabel = t(
    "navigation.sidebar.invite.feedback.emptyCopy",
    "暂无可复制内容",
  );
  const inviteCopyFailedLabel = t(
    "navigation.sidebar.invite.feedback.copyFailed",
    "复制失败，请检查剪贴板权限",
  );
  const inviteRewardCurrentPolicyLabel = t(
    "navigation.sidebar.invite.reward.currentPolicy",
    "按当前策略发放",
  );
  const formatInviteReferralCredits = useCallback(
    (value: number | undefined): string => {
      if (typeof value !== "number" || value <= 0) {
        return inviteRewardCurrentPolicyLabel;
      }

      return t("navigation.sidebar.invite.reward.credits", {
        amount: value.toLocaleString(i18n.language),
        defaultValue: "{{amount}} 积分",
      });
    },
    [i18n.language, inviteRewardCurrentPolicyLabel, t],
  );

  const handleAccountMenuNavigate = useCallback(
    (params: PageParams) => {
      setAccountMenuOpen(false);
      setLanguageMenuOpen(false);
      onNavigate("settings", params);
    },
    [onNavigate],
  );

  const handleAccountLogin = useCallback(async () => {
    setAccountLoginPending(true);
    setAccountLoginError(null);
    const browserTarget = createExternalBrowserOpenTarget();
    try {
      await startOemCloudLogin(undefined, {
        browserTarget,
        waitForCompletion: false,
      });
      toast.success(accountLoginOpenedLabel);
      setAccountMenuOpen(false);
      setLanguageMenuOpen(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : accountLoginFailedFallbackLabel;
      setAccountLoginError(message);
      toast.error(message);
    } finally {
      setAccountLoginPending(false);
    }
  }, [accountLoginFailedFallbackLabel, accountLoginOpenedLabel]);

  const handleOpenAccountUserCenter = useCallback(
    async (path = "/welcome") => {
      setAccountMenuOpen(false);
      setLanguageMenuOpen(false);

      try {
        const target = getConfiguredOemCloudTarget();
        const browserTarget = createExternalBrowserOpenTarget();
        await openExternalUrl(
          buildOemCloudUserCenterUrl(target.baseUrl, path),
          {
            browserTarget,
          },
        );
        toast.success(accountUserCenterOpenedLabel);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : accountUserCenterFailedFallbackLabel;
        toast.error(message);
      }
    },
    [accountUserCenterFailedFallbackLabel, accountUserCenterOpenedLabel],
  );

  const handleAccountLogout = useCallback(async () => {
    const tenantId = cloudSessionState?.session.tenant.id;
    setAccountLogoutPending(true);
    try {
      if (tenantId) {
        await logoutClient(tenantId);
      }
    } catch (error) {
      console.error("云端退出登录失败，已清理本地会话:", error);
    } finally {
      clearStoredOemCloudSessionState();
      clearOemCloudBootstrapSnapshot();
      clearSkillCatalogCache();
      clearServiceSkillCatalogCache();
      void clearSiteAdapterCatalogCache();
      setAccountMenuOpen(false);
      setLanguageMenuOpen(false);
      setAccountLogoutPending(false);
    }
  }, [cloudSessionState?.session.tenant.id]);

  const handleCopyInviteText = useCallback(
    async (value: string | undefined, successMessage: string) => {
      const text = value?.trim();
      if (!text) {
        toast.info(inviteCopyEmptyLabel);
        return;
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("clipboard unavailable");
        }
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
      } catch {
        toast.error(inviteCopyFailedLabel);
      }
    },
    [inviteCopyEmptyLabel, inviteCopyFailedLabel],
  );

  const handleLanguageChange = useCallback(
    async (nextLanguage: LocalePreference) => {
      const previousLanguage = language;
      if (nextLanguage === previousLanguage) {
        setLanguageMenuOpen(false);
        return;
      }

      setLanguageState(nextLanguage);
      setI18nLanguage(toLegacyPatchLanguage(nextLanguage));
      setLanguageMenuOpen(false);

      try {
        await changeLimeLocale(nextLanguage);
        const config = await getConfig();
        await saveConfig({
          ...config,
          language: nextLanguage,
        });
      } catch (error) {
        console.error("保存语言设置失败:", error);
        setLanguageState(previousLanguage);
        setI18nLanguage(toLegacyPatchLanguage(previousLanguage));
        await changeLimeLocale(previousLanguage);
      }
    },
    [language, setI18nLanguage],
  );

  return (
    <TooltipProvider>
      <Container
        $collapsed={collapsed}
        $themeMode={themeState.effectiveThemeMode}
        $reserveWindowControls={reserveWindowControls}
        data-testid="app-sidebar"
        data-collapsed={String(collapsed)}
        data-lime-window-drag-region
        data-window-controls-reserved={String(reserveWindowControls)}
        onMouseDown={onStartWindowDrag}
      >
        <HeaderArea $collapsed={collapsed} data-testid="app-sidebar-header">
          <HeaderTopRow $collapsed={collapsed}>
            {maybeWrapWithTooltip(
              <UserButton
                $collapsed={collapsed}
                onClick={() =>
                  onNavigate(
                    "agent",
                    buildHomeAgentParams({
                      projectId: currentProjectId ?? undefined,
                    }),
                  )
                }
                aria-label={homeAriaLabel}
                title={homeAriaLabel}
              >
                <Avatar>
                  <img src={LIME_BRAND_LOGO_SRC} alt={LIME_BRAND_NAME} />
                </Avatar>
                <UserName $collapsed={collapsed}>{LIME_BRAND_NAME}</UserName>
              </UserButton>,
              homeLabel,
            )}

            {inviteEntryVisible
              ? maybeWrapWithTooltip(
                  <HeaderInviteButton
                    $collapsed={collapsed}
                    $active={inviteDialogOpen}
                    onClick={() => {
                      setInviteDashboard(cachedInviteDashboard);
                      setInviteDialogOpen(true);
                    }}
                    title={inviteEntryLabel}
                    aria-label={inviteEntryLabel}
                    data-testid="app-sidebar-invite-button"
                  >
                    <Gift />
                    <span>{inviteEntryLabel}</span>
                  </HeaderInviteButton>,
                  inviteEntryLabel,
                )
              : null}

            {maybeWrapWithTooltip(
              <IconActionButton
                onClick={toggleSidebarCollapsed}
                title={navigationToggleLabel}
                aria-label={navigationToggleLabel}
              >
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </IconActionButton>,
              navigationToggleLabel,
            )}
          </HeaderTopRow>

          {maybeWrapWithTooltip(
            <SearchButton
              $collapsed={collapsed}
              onClick={openSidebarSearchDialog}
              title={searchTaskLabel}
              aria-label={searchTaskLabel}
              aria-haspopup="dialog"
              aria-expanded={sidebarSearchOpen ? true : undefined}
              data-testid="app-sidebar-search-button"
            >
              <Search size={14} />
              <span>{searchTaskLabel}</span>
            </SearchButton>,
            searchTaskLabel,
          )}
        </HeaderArea>

        <MenuScroll>
          <MainNavList data-testid="app-sidebar-main-nav">
            {filteredMainNavItems.map((item) => renderNavItem(item))}
          </MainNavList>

          {shouldShowConversationList ? (
            <AppSidebarConversationShelf
              openedProjects={openedProjects}
              recentSessions={visibleRecentSidebarSessions}
              currentSessionId={currentSessionId}
              recentLoading={shouldShowSessionLoadingState}
              hasMoreRecent={hasMoreRecentSidebarSessions}
              actionSessionId={sidebarSessionActionId}
              onCreateConversation={handleNavigateToNewTask}
              onNavigateToConversation={handleNavigateToConversation}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
              onToggleArchive={(session, archived) => {
                void handleToggleSessionArchive(session, archived);
              }}
              onArchiveManyConversations={(sessions) => {
                void handleArchiveManyConversations(sessions);
              }}
              onToggleProjectPin={(project) => {
                void projectActions.handleToggleProjectPin(project);
              }}
              onRevealProject={(project) => {
                void projectActions.handleRevealProject(project);
              }}
              onCreateProjectWorktree={(project) => {
                void projectActions.handleCreateProjectWorktree(project);
              }}
              onRenameProject={(project) => {
                void projectActions.handleRenameProject(project);
              }}
              onRemoveProject={(project) => {
                void projectActions.handleRemoveProject(project);
              }}
              onShowMoreRecent={showMoreRecentSessions}
            />
          ) : null}
        </MenuScroll>

        <FooterArea
          $collapsed={collapsed}
          data-testid="app-sidebar-footer-area"
        >
          <ActionRow $collapsed={collapsed}>
            {!collapsed ? <div /> : null}
            <AppearanceActionSlot
              $collapsed={collapsed}
              ref={appearanceControlRef}
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconActionButton
                      $active={appearancePopoverOpen}
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setLanguageMenuOpen(false);
                        setAppearancePopoverOpen((current) => !current);
                      }}
                      title={appearanceCopy.entryLabel}
                      aria-label={appearanceCopy.entryLabel}
                      aria-expanded={appearancePopoverOpen}
                      aria-haspopup="dialog"
                    >
                      {themeState.effectiveThemeMode === "dark" ? (
                        <Moon />
                      ) : (
                        <Sun />
                      )}
                    </IconActionButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {appearanceCopy.entryLabel}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <IconActionButton
                  $active={appearancePopoverOpen}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setLanguageMenuOpen(false);
                    setAppearancePopoverOpen((current) => !current);
                  }}
                  title={appearanceCopy.entryLabel}
                  aria-label={appearanceCopy.entryLabel}
                  aria-expanded={appearancePopoverOpen}
                  aria-haspopup="dialog"
                >
                  {themeState.effectiveThemeMode === "dark" ? (
                    <Moon />
                  ) : (
                    <Sun />
                  )}
                </IconActionButton>
              )}

              {appearancePopoverOpen ? (
                <AppSidebarAppearancePopover
                  themeMode={themeState.themeMode}
                  colorSchemeId={colorSchemeId}
                  themeOptions={appearanceThemeOptions}
                  colorSchemes={appearanceColorSchemes}
                  copy={appearanceCopy}
                  onThemeModeChange={handleThemeModeChange}
                  onColorSchemeChange={handleColorSchemeChange}
                  onRandomColorScheme={handleRandomColorScheme}
                />
              ) : null}
            </AppearanceActionSlot>
          </ActionRow>

          <AccountActionSlot
            $collapsed={collapsed}
            ref={accountControlRef}
            data-testid="app-sidebar-account-slot"
          >
            <AppUpdateEntry
              collapsed={collapsed}
              onOpenPanel={() => {
                setAppearancePopoverOpen(false);
                setLanguageMenuOpen(false);
                setAccountMenuOpen(false);
              }}
            />

            <AppSidebarAccountMenu
              collapsed={collapsed}
              accountMenuOpen={accountMenuOpen}
              languageMenuOpen={languageMenuOpen}
              accountDisplayName={accountDisplayName}
              accountAvatarUrl={accountAvatarUrl}
              accountInitial={accountInitial}
              accountMetaLine={accountMetaLine}
              hasCloudAccount={hasCloudAccount}
              accountPlanSummary={accountPlanSummary}
              accountLoginPending={accountLoginPending}
              accountLoginError={accountLoginError}
              accountLogoutPending={accountLogoutPending}
              language={language}
              navItems={filteredFooterNavItems}
              copy={{
                openUserMenuLabel: accountOpenUserMenuLabel,
                buttonTooltip: accountButtonTooltip,
                menuLabel: accountMenuLabel,
                cloudStateLabel: accountCloudStateLabel,
                localStateLabel: accountLocalStateLabel,
                viewPlanDetailsLabel: accountViewPlanDetailsLabel,
                viewDetailsLabel: accountViewDetailsLabel,
                openSourceTitleLabel: accountOpenSourceTitleLabel,
                openSourceInfoLabel: accountOpenSourceInfoLabel,
                openSourceDescriptionLabel: accountOpenSourceDescriptionLabel,
                freePlanLabel: accountFreePlanLabel,
                noLoginAvailableLabel: accountNoLoginAvailableLabel,
                localModelConfigurableLabel: accountLocalModelConfigurableLabel,
                connectCloudLabel,
                loginPendingLabel: accountLoginPendingLabel,
                modelSettingsLabel: accountModelSettingsLabel,
                interfaceLanguageLabel,
                selectLanguageLabel,
                languageMenuLabel,
                currentLanguageLabel,
                userCenterLabel: accountUserCenterLabel,
                cloudBrandLabel,
                aboutLabel: accountAboutLabel,
                logoutLabel: accountLogoutLabel,
                logoutPendingLabel: accountLogoutPendingLabel,
                formatSwitchLanguageAria: (languageLabel) =>
                  t("navigation.sidebar.account.switchLanguage", {
                    language: languageLabel,
                    defaultValue: "切换界面语言为{{language}}",
                  }),
              }}
              isNavItemActive={isActive}
              onToggleAccountMenu={() => {
                setAppearancePopoverOpen(false);
                setLanguageMenuOpen(false);
                setAccountMenuOpen((current) => !current);
              }}
              onNavigateItem={(item) => {
                setAccountMenuOpen(false);
                handleNavigate(item);
              }}
              onToggleLanguageMenu={() =>
                setLanguageMenuOpen((current) => !current)
              }
              onLanguageChange={(nextLanguage) => {
                void handleLanguageChange(nextLanguage);
              }}
              onOpenBilling={() =>
                void handleOpenAccountUserCenter("/billing?tab=usage")
              }
              onLogin={() => void handleAccountLogin()}
              onOpenModelSettings={() =>
                handleAccountMenuNavigate({
                  tab: SettingsTabs.Providers,
                  providerView: "settings",
                })
              }
              onOpenUserCenter={() =>
                void handleOpenAccountUserCenter("/welcome")
              }
              onOpenAbout={() =>
                handleAccountMenuNavigate({ tab: SettingsTabs.About })
              }
              onLogout={() => void handleAccountLogout()}
            />
          </AccountActionSlot>
        </FooterArea>
      </Container>
      <AppSidebarSearchDialog
        isOpen={sidebarSearchOpen}
        query={sidebarSearchQuery}
        inputRef={sidebarSearchInputRef}
        copy={{
          inputLabel: searchConversationTitleLabel,
          closeLabel: closeSearchDialogLabel,
          createConversationLabel,
          matchesLabel: searchMatchesLabel,
          recentLabel: searchRecentLabel,
          loadingLabel: searchLoadingLabel,
          selectProjectFirstLabel: searchSelectProjectFirstLabel,
          emptyMatchesLabel: searchEmptyMatchesLabel,
          emptyRecentLabel: searchEmptyRecentLabel,
          loadingMoreLabel: searchLoadingMoreLabel,
          moreMatchesLabel: searchMoreMatchesLabel,
          moreRecentLabel: searchMoreRecentLabel,
        }}
        sessions={sidebarSearchResultSessions}
        currentProjectId={currentProjectId}
        currentSessionId={currentSessionId}
        hasQuery={sidebarSearchHasQuery}
        hasMoreResults={sidebarSearchHasMoreResults}
        loading={shouldShowSessionLoadingState}
        loadingMore={recentSessionsLoading}
        resolveSessionTitle={resolveLocalizedSessionTitle}
        formatSessionMeta={formatLocalizedSessionMeta}
        onClose={closeSidebarSearchDialog}
        onQueryChange={setSidebarSearchQuery}
        onCreateConversation={handleSidebarSearchCreateConversation}
        onResultClick={handleSidebarSearchResultClick}
        onShowMore={showMoreRecentSessions}
      />
      <AppSidebarInviteDialog
        isOpen={inviteDialogOpen}
        hasCloudAccount={hasCloudAccount}
        loading={inviteLoading}
        error={inviteError}
        dashboard={inviteDashboard}
        copy={{
          closeLabel: inviteCloseDialogLabel,
          eyebrowLabel: inviteEyebrowLabel,
          titleLabel: inviteDialogTitleLabel,
          descriptionLabel: inviteDescriptionLabel,
          disconnectedLabel: inviteDisconnectedLabel,
          connectAccountLabel: inviteConnectAccountLabel,
          loadingLabel: inviteLoadingLabel,
          retryLabel: inviteRetryLabel,
          codeLabel: inviteCodeLabel,
          copyLabel: inviteCopyLabel,
          downloadUrlLabel: inviteDownloadUrlLabel,
          landingUrlLabel: inviteLandingUrlLabel,
          referrerRewardLabel: inviteReferrerRewardLabel,
          inviteeRewardLabel: inviteInviteeRewardLabel,
          copyShareTextLabel: inviteCopyShareTextLabel,
          copyLandingUrlLabel: inviteCopyLandingUrlLabel,
          copyCodeSuccessLabel: inviteCopyCodeSuccessLabel,
          copyShareTextSuccessLabel: inviteCopyShareTextSuccessLabel,
          copyLandingUrlSuccessLabel: inviteCopyLandingUrlSuccessLabel,
        }}
        formatReferralCredits={formatInviteReferralCredits}
        onClose={() => setInviteDialogOpen(false)}
        onConnectAccount={() => {
          setInviteDialogOpen(false);
          void handleAccountLogin();
        }}
        onRetry={() => setInviteReloadKey((value) => value + 1)}
        onCopyText={(value, successMessage) =>
          void handleCopyInviteText(value, successMessage)
        }
      />
    </TooltipProvider>
  );
}
