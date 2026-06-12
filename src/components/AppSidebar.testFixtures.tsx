/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { AgentPageParams, Page, PageParams } from "@/types/page";
import { SettingsTabs as LimeSettingsTabs } from "@/types/settings";
import { AppSidebar as AppSidebarComponent } from "./AppSidebar";
import { changeLimeLocale as changeLimeLocaleImpl } from "@/i18n/createI18n";
import {
  TASK_CENTER_CREATE_DRAFT_TASK_EVENT as TASK_CENTER_CREATE_DRAFT_TASK_EVENT_VALUE,
  TASK_CENTER_OPEN_TASK_EVENT as TASK_CENTER_OPEN_TASK_EVENT_VALUE,
} from "@/components/agent/chat/taskCenterDraftTaskEvents";
import { LIME_COLOR_SCHEME_STORAGE_KEY as LIME_COLOR_SCHEME_STORAGE_KEY_VALUE } from "@/lib/appearance/colorSchemes";
import { LIME_THEME_STORAGE_KEY as LIME_THEME_STORAGE_KEY_VALUE } from "@/lib/appearance/themeMode";
import {
  getStoredOemCloudSessionState as getStoredOemCloudSessionStateImpl,
  setOemCloudBootstrapSnapshot as setOemCloudBootstrapSnapshotImpl,
  setStoredOemCloudSessionState as setStoredOemCloudSessionStateImpl,
} from "@/lib/oemCloudSession";

export const act = reactAct;
export const AppSidebar = AppSidebarComponent;
export const changeLimeLocale = changeLimeLocaleImpl;
export const SettingsTabs = LimeSettingsTabs;
export const LIME_COLOR_SCHEME_STORAGE_KEY =
  LIME_COLOR_SCHEME_STORAGE_KEY_VALUE;
export const LIME_THEME_STORAGE_KEY = LIME_THEME_STORAGE_KEY_VALUE;
export const TASK_CENTER_CREATE_DRAFT_TASK_EVENT =
  TASK_CENTER_CREATE_DRAFT_TASK_EVENT_VALUE;
export const TASK_CENTER_OPEN_TASK_EVENT = TASK_CENTER_OPEN_TASK_EVENT_VALUE;
export const getStoredOemCloudSessionState = getStoredOemCloudSessionStateImpl;
export const setOemCloudBootstrapSnapshot = setOemCloudBootstrapSnapshotImpl;
export const setStoredOemCloudSessionState = setStoredOemCloudSessionStateImpl;

const {
  mockGetConfig,
  mockSaveConfig,
  mockSubscribeAppConfigChanged,
  mockListAgentRuntimeSessions,
  mockListInstalledAgentApps,
  mockGetProject,
  mockUpdateProject,
  mockDeleteProject,
  mockEnsureProjectWorkspace,
  mockCreateProjectGitWorktree,
  mockRevealPathInFinder,
  mockUpdateAgentRuntimeSession,
  mockArchiveManyAgentRuntimeSessions,
  mockDeleteAgentRuntimeSession,
  mockSetI18nLanguage,
  mockScheduleMinimumDelayIdleTask,
  mockLogoutClient,
  mockGetConfiguredOemCloudTarget,
  mockBuildOemCloudUserCenterUrl,
  mockCreateExternalBrowserOpenTarget,
  mockOpenExternalUrl,
  mockStartOemCloudLogin,
  mockGetClientReferralDashboard,
  mockClearSiteAdapterCatalogCache,
  mockToastSuccess,
  mockToastError,
  mockToastInfo,
  mockRecordAgentUiPerformanceMetric,
  mockCheckForUpdates,
  mockGetUpdateInstallSession,
  mockListenUpdateInstallSession,
  mockOpenUpdateWindow,
  mockRecordUpdateNotificationAction,
  mockRemindUpdateLater,
  mockStartUpdateInstallSession,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockSubscribeAppConfigChanged: vi.fn(),
  mockListAgentRuntimeSessions: vi.fn(),
  mockListInstalledAgentApps: vi.fn(),
  mockGetProject: vi.fn(),
  mockUpdateProject: vi.fn(),
  mockDeleteProject: vi.fn(),
  mockEnsureProjectWorkspace: vi.fn(),
  mockCreateProjectGitWorktree: vi.fn(),
  mockRevealPathInFinder: vi.fn(),
  mockUpdateAgentRuntimeSession: vi.fn(),
  mockArchiveManyAgentRuntimeSessions: vi.fn(),
  mockDeleteAgentRuntimeSession: vi.fn(),
  mockSetI18nLanguage: vi.fn(),
  mockScheduleMinimumDelayIdleTask: vi.fn((task: () => void) => {
    task();
    return () => undefined;
  }),
  mockLogoutClient: vi.fn(),
  mockGetConfiguredOemCloudTarget: vi.fn(),
  mockBuildOemCloudUserCenterUrl: vi.fn(
    (baseUrl: string, path = "") => `${baseUrl}${path}`,
  ),
  mockCreateExternalBrowserOpenTarget: vi.fn(() => null),
  mockOpenExternalUrl: vi.fn(),
  mockStartOemCloudLogin: vi.fn(),
  mockGetClientReferralDashboard: vi.fn(),
  mockClearSiteAdapterCatalogCache: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockRecordAgentUiPerformanceMetric: vi.fn(),
  mockCheckForUpdates: vi.fn(),
  mockGetUpdateInstallSession: vi.fn(),
  mockListenUpdateInstallSession: vi.fn(),
  mockOpenUpdateWindow: vi.fn(),
  mockRecordUpdateNotificationAction: vi.fn(),
  mockRemindUpdateLater: vi.fn(),
  mockStartUpdateInstallSession: vi.fn(),
}));

export {
  mockBuildOemCloudUserCenterUrl,
  mockClearSiteAdapterCatalogCache,
  mockCheckForUpdates,
  mockCreateExternalBrowserOpenTarget,
  mockArchiveManyAgentRuntimeSessions,
  mockDeleteAgentRuntimeSession,
  mockGetUpdateInstallSession,
  mockGetClientReferralDashboard,
  mockGetConfig,
  mockGetConfiguredOemCloudTarget,
  mockListenUpdateInstallSession,
  mockListAgentRuntimeSessions,
  mockListInstalledAgentApps,
  mockGetProject,
  mockUpdateProject,
  mockDeleteProject,
  mockEnsureProjectWorkspace,
  mockCreateProjectGitWorktree,
  mockRevealPathInFinder,
  mockLogoutClient,
  mockOpenExternalUrl,
  mockOpenUpdateWindow,
  mockRecordUpdateNotificationAction,
  mockRecordAgentUiPerformanceMetric,
  mockRemindUpdateLater,
  mockSaveConfig,
  mockScheduleMinimumDelayIdleTask,
  mockSetI18nLanguage,
  mockStartOemCloudLogin,
  mockStartUpdateInstallSession,
  mockSubscribeAppConfigChanged,
  mockToastError,
  mockToastInfo,
  mockToastSuccess,
  mockUpdateAgentRuntimeSession,
};

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  saveConfig: mockSaveConfig,
  subscribeAppConfigChanged: mockSubscribeAppConfigChanged,
}));

vi.mock("@/i18n/legacy-patch/I18nPatchProvider", () => ({
  useI18nPatch: () => ({
    language: "zh",
    setLanguage: mockSetI18nLanguage,
  }),
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  AGENT_RUNTIME_SESSIONS_CHANGED_EVENT: "lime:agent-runtime-sessions-changed",
  archiveManyAgentRuntimeSessions: mockArchiveManyAgentRuntimeSessions,
  deleteAgentRuntimeSession: mockDeleteAgentRuntimeSession,
  listAgentRuntimeSessions: mockListAgentRuntimeSessions,
  updateAgentRuntimeSession: mockUpdateAgentRuntimeSession,
}));

vi.mock("@/lib/api/agentApps", () => ({
  AGENT_APPS_CHANGED_EVENT: "lime:agent-apps-changed",
  listInstalledAgentApps: mockListInstalledAgentApps,
}));

vi.mock("@/lib/api/project", () => ({
  getProject: mockGetProject,
  updateProject: mockUpdateProject,
  deleteProject: mockDeleteProject,
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
  extractErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("@/lib/api/projectGit", () => ({
  createProjectGitWorktree: mockCreateProjectGitWorktree,
}));

vi.mock("@/lib/api/fileSystem", () => ({
  revealPathInFinder: mockRevealPathInFinder,
}));

vi.mock("@/lib/api/appUpdate", () => ({
  checkForUpdates: mockCheckForUpdates,
  getUpdateInstallSession: mockGetUpdateInstallSession,
  listenUpdateInstallSession: mockListenUpdateInstallSession,
  openUpdateWindow: mockOpenUpdateWindow,
  recordUpdateNotificationAction: mockRecordUpdateNotificationAction,
  remindUpdateLater: mockRemindUpdateLater,
  startUpdateInstallSession: mockStartUpdateInstallSession,
  isUpdateInstallSessionActive: (
    session:
      | {
          stage?: string;
          isActive?: boolean;
        }
      | null
      | undefined,
  ) =>
    Boolean(
      session?.isActive &&
      (
        ["checking", "downloading", "installing", "restarting"] as string[]
      ).includes(session.stage ?? ""),
    ),
}));

vi.mock("@/lib/api/oemCloudControlPlane", () => ({
  logoutClient: mockLogoutClient,
  getConfiguredOemCloudTarget: mockGetConfiguredOemCloudTarget,
  getClientReferralDashboard: mockGetClientReferralDashboard,
}));

vi.mock("@/lib/oemCloudLoginLauncher", () => ({
  buildOemCloudUserCenterUrl: mockBuildOemCloudUserCenterUrl,
  createExternalBrowserOpenTarget: mockCreateExternalBrowserOpenTarget,
  openExternalUrl: mockOpenExternalUrl,
  startOemCloudLogin: mockStartOemCloudLogin,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
  },
}));

vi.mock("@/lib/siteAdapterCatalogBootstrap", () => ({
  clearSiteAdapterCatalogCache: mockClearSiteAdapterCatalogCache,
}));

vi.mock("@/lib/utils/scheduleMinimumDelayIdleTask", () => ({
  scheduleMinimumDelayIdleTask: mockScheduleMinimumDelayIdleTask,
}));

vi.mock("@/lib/agentUiPerformanceMetrics", () => ({
  recordAgentUiPerformanceMetric: mockRecordAgentUiPerformanceMetric,
}));

interface MountedSidebar {
  container: HTMLDivElement;
  root: Root;
}

const mountedSidebars: MountedSidebar[] = [];
export const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "lime.app-sidebar.collapsed";
export const APP_SIDEBAR_ENABLED_ITEMS_STORAGE_KEY =
  "lime.app-sidebar.enabled-items";

export function mountSidebar(options?: {
  currentPage?: Page;
  currentPageParams?: PageParams;
  onNavigate?: (page: Page, params?: PageParams) => void;
}): MountedSidebar {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AppSidebar
        currentPage={options?.currentPage ?? "agent"}
        currentPageParams={options?.currentPageParams}
        onNavigate={options?.onNavigate ?? vi.fn()}
      />,
    );
  });

  const mounted = { container, root };
  mountedSidebars.push(mounted);
  return mounted;
}

export function mountSidebarContainer(options?: {
  currentPage?: Page;
  currentPageParams?: PageParams;
  onNavigate?: (page: Page, params?: PageParams) => void;
}) {
  return mountSidebar(options).container;
}

export async function flushEffects(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(input) as HTMLInputElement;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function openConversationMenu(title: string) {
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="打开 ${title} 操作菜单"]`,
      )
      ?.click();
    await Promise.resolve();
  });

  return document.body.querySelector<HTMLElement>(
    '[data-testid="app-sidebar-conversation-menu"]',
  );
}

export async function openProjectMenu(title: string) {
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="打开 ${title} 项目菜单"]`,
      )
      ?.click();
    await Promise.resolve();
  });

  return document.body.querySelector<HTMLElement>(
    '[data-testid="app-sidebar-project-menu"]',
  );
}

export async function clickConversationMenuItem(testId: string) {
  await act(async () => {
    document.body
      .querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
      ?.click();
    await Promise.resolve();
  });
}

export async function openAccountMenu(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="app-sidebar-account-button"]',
      )
      ?.click();
    await Promise.resolve();
  });
}

export async function clickAccountMenuItem(
  container: HTMLElement,
  label: string,
) {
  await openAccountMenu(container);

  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      ?.click();
    await Promise.resolve();
  });
}

export function buildMockReferralDashboard() {
  return {
    code: {
      id: "refcode-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      code: "LIME-2026",
      landingUrl: "https://limeai.run/invite?code=LIME-2026",
      status: "active",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    policy: {
      enabled: true,
      rewardCredits: 600,
      referrerRewardCredits: 480,
      inviteeRewardCredits: 120,
      claimWindowDays: 30,
      autoClaimEnabled: true,
      allowManualClaimFallback: true,
      riskReviewEnabled: false,
    },
    summary: {
      totalInvites: 0,
      successfulInvites: 0,
      totalRewardCredits: 0,
      referrerRewardCreditsTotal: 0,
      inviteeRewardCreditsTotal: 0,
    },
    events: [],
    rewards: [],
    invitedBy: {},
    share: {
      brandName: "Lime",
      code: "LIME-2026",
      landingUrl: "https://limeai.run/invite?code=LIME-2026",
      downloadUrl: "https://limeai.run",
      shareText:
        "邀请你体验Lime，让AI做牛做马，我们来做牛人！前往 https://limeai.run 下载客户端，复制邀请码 LIME-2026 激活并注册账号参与内测",
      headline: "登录后自动领取奖励",
      rules: "复制邀请码后完成注册即可参与内测。",
    },
  };
}

export function seedCloudSessionWithReferral(options?: {
  referralEnabled?: boolean;
  referral?: ReturnType<typeof buildMockReferralDashboard> | null;
}) {
  setStoredOemCloudSessionState({
    token: "session-token",
    tenant: { id: "tenant-0001", name: "Lime Cloud" },
    user: {
      id: "user-001",
      displayName: "晚风",
      email: "wanfeng@example.com",
    },
    session: { id: "session-001", provider: "google" },
  });
  setOemCloudBootstrapSnapshot({
    session: {
      tenant: { id: "tenant-0001", name: "Lime Cloud" },
    },
    features: {
      referralEnabled: options?.referralEnabled ?? true,
    },
    ...(options?.referral !== null
      ? { referral: options?.referral ?? buildMockReferralDashboard() }
      : {}),
  });
}

export type { AgentPageParams, Page, PageParams };

export async function resetAppSidebarTest() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await changeLimeLocale("zh-CN");
  localStorage.clear();
  delete window.__LIME_BOOTSTRAP__;
  delete window.__LIME_OEM_CLOUD__;
  delete window.__LIME_SESSION_TOKEN__;
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-lime-theme");
  document.documentElement.removeAttribute("data-lime-color-scheme");
  document.documentElement.removeAttribute("style");
  mockGetConfig.mockResolvedValue({});
  mockSaveConfig.mockResolvedValue(undefined);
  mockListAgentRuntimeSessions.mockResolvedValue([]);
  mockListInstalledAgentApps.mockResolvedValue({ states: [], issues: [] });
  mockGetProject.mockResolvedValue(null);
  mockUpdateProject.mockResolvedValue({});
  mockDeleteProject.mockResolvedValue(true);
  mockArchiveManyAgentRuntimeSessions.mockResolvedValue([]);
  mockEnsureProjectWorkspace.mockResolvedValue({
    id: "project-worktree",
    name: "project-worktree",
    rootPath: "/tmp/project-worktree",
  });
  mockCreateProjectGitWorktree.mockResolvedValue({
    worktreePath: "/tmp/project-worktree",
    branch: "worktree",
    status: {
      rootPath: "/tmp/project",
      hasGitRepository: true,
      currentBranch: "main",
      branches: ["main"],
      uncommittedFileCount: 0,
    },
  });
  mockRevealPathInFinder.mockResolvedValue(undefined);
  mockUpdateAgentRuntimeSession.mockResolvedValue(undefined);
  mockDeleteAgentRuntimeSession.mockResolvedValue(undefined);
  mockCheckForUpdates.mockResolvedValue({
    current: "1.57.0",
    latest: null,
    hasUpdate: false,
    downloadUrl: null,
    releaseNotesUrl: null,
    releaseNotes: null,
    pubDate: null,
    error: null,
  });
  mockGetUpdateInstallSession.mockResolvedValue({
    sessionId: "idle",
    stage: "idle",
    currentVersion: "1.57.0",
    latestVersion: null,
    downloadUrl: null,
    downloadedBytes: 0,
    totalBytes: null,
    percent: 0,
    message: "idle",
    error: null,
    startedAt: 0,
    updatedAt: 0,
    completedAt: null,
    canCloseWindow: true,
    isActive: false,
  });
  mockListenUpdateInstallSession.mockResolvedValue(() => undefined);
  mockOpenUpdateWindow.mockResolvedValue(undefined);
  mockRecordUpdateNotificationAction.mockResolvedValue(undefined);
  mockRemindUpdateLater.mockResolvedValue(0);
  mockStartUpdateInstallSession.mockResolvedValue({
    sessionId: "installing",
    stage: "downloading",
    currentVersion: "1.57.0",
    latestVersion: "1.58.0",
    downloadUrl: "https://example.com/lime",
    downloadedBytes: 20,
    totalBytes: 100,
    percent: 0.2,
    message: "downloading",
    error: null,
    startedAt: 0,
    updatedAt: 0,
    completedAt: null,
    canCloseWindow: true,
    isActive: true,
  });
  mockLogoutClient.mockResolvedValue(undefined);
  mockGetConfiguredOemCloudTarget.mockReturnValue({
    baseUrl: "https://user.limeai.run",
    tenantId: "tenant-0001",
  });
  mockBuildOemCloudUserCenterUrl.mockImplementation(
    (baseUrl: string, path = "") => `${baseUrl}${path}`,
  );
  mockOpenExternalUrl.mockResolvedValue(undefined);
  mockStartOemCloudLogin.mockResolvedValue({
    mode: "login_url",
    openedUrl: "https://user.limeai.run/login",
  });
  mockGetClientReferralDashboard.mockResolvedValue(
    buildMockReferralDashboard(),
  );
  mockClearSiteAdapterCatalogCache.mockResolvedValue(null);
  mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
    task();
    return () => undefined;
  });
  mockSubscribeAppConfigChanged.mockImplementation((listener: () => void) => {
    (
      globalThis as typeof globalThis & { __appConfigListener?: () => void }
    ).__appConfigListener = listener;
    return () => {
      (
        globalThis as typeof globalThis & {
          __appConfigListener?: () => void;
        }
      ).__appConfigListener = undefined;
    };
  });
}

export function cleanupAppSidebarTest() {
  while (mountedSidebars.length > 0) {
    const mounted = mountedSidebars.pop();
    if (!mounted) {
      continue;
    }

    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete window.__LIME_BOOTSTRAP__;
  delete window.__LIME_OEM_CLOUD__;
  delete window.__LIME_SESSION_TOKEN__;
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-lime-theme");
  document.documentElement.removeAttribute("data-lime-color-scheme");
  document.documentElement.removeAttribute("style");
  (
    globalThis as typeof globalThis & {
      __appConfigListener?: () => void;
    }
  ).__appConfigListener = undefined;
}
