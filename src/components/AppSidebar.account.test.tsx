import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  changeLimeLocale,
  cleanupAppSidebarTest,
  clickConversationMenuItem,
  flushEffects,
  getStoredOemCloudSessionState,
  mockBuildOemCloudUserCenterUrl,
  mockGetClientReferralDashboard,
  mockListAgentRuntimeSessions,
  mockLogoutClient,
  mockOpenExternalUrl,
  mockStartOemCloudLogin,
  mockToastSuccess,
  mountSidebarContainer,
  openAccountMenu,
  resetAppSidebarTest,
  seedCloudSessionWithReferral,
  setOemCloudBootstrapSnapshot,
  setStoredOemCloudSessionState,
} from "./AppSidebar.testFixtures";
import type { AgentPageParams } from "./AppSidebar.testFixtures";

describe("AppSidebar account menu", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("底部设置入口应打开紧凑账号与积分弹窗", async () => {
    const onNavigate = vi.fn();
    setStoredOemCloudSessionState({
      token: "session-token",
      tenant: { id: "tenant-0001" },
      user: {
        id: "user-001",
        displayName: "zhong feng shan",
        email: "user@example.com",
      },
      session: { id: "session-001" },
    });

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    const accountButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-account-button"]',
    );
    expect(accountButton).not.toBeNull();
    expect(accountButton?.textContent).toContain("设置");
    expect(container.textContent).not.toContain("zhong feng shan");
    expect(container.textContent).not.toContain("云端");

    await act(async () => {
      accountButton?.click();
      await Promise.resolve();
    });

    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu).not.toBeNull();
    expect(accountMenu?.textContent).toContain("user@example.com");
    expect(accountMenu?.textContent).toContain("免费版");
    expect(accountMenu?.textContent).toContain("查看详情");
    expect(accountMenu?.textContent).not.toContain("云端已连接");
    expect(accountMenu?.textContent).not.toContain("套餐、积分和模型目录");
    expect(accountMenu?.textContent).not.toContain("登录方式：");
    expect(accountMenu?.textContent).not.toContain("默认服务：");
    expect(accountMenu?.textContent).toContain("用户中心");
    expect(accountMenu?.textContent).toContain("退出登录");
    expect(accountMenu?.textContent).toContain("界面语言");
    expect(accountMenu?.textContent).toContain("项目资料");
    expect(accountMenu?.textContent).toContain("模型设置");
    expect(accountMenu?.textContent).toContain("关于");
    expect(accountMenu?.textContent).not.toContain("登录 Lime 云端");
    expect(accountMenu?.textContent).not.toContain("开源");
    expect(accountMenu?.textContent).not.toContain("主题");
    expect(accountMenu?.textContent).not.toContain("帮助中心");
  });

  it("已登录账号弹框应展示真实套餐摘要并跳出到用户中心详情", async () => {
    const onNavigate = vi.fn();
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
      features: {
        referralEnabled: false,
      },
      providerPreference: {
        providerKey: "lime-hub",
      },
      providerOffersSummary: [
        {
          providerKey: "lime-hub",
          currentPlan: "免费版",
          creditsSummary: "0 / 20 积分 已用0%",
        },
      ],
    });

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);
    await openAccountMenu(container);

    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("免费版");
    expect(accountMenu?.textContent).toContain("0 / 20 积分 已用0%");
    expect(accountMenu?.textContent).toContain("查看详情");
    expect(accountMenu?.textContent).toContain("wanfeng@example.com");
    expect(accountMenu?.textContent).toContain("Lime Cloud");
    expect(accountMenu?.textContent).not.toContain("登录方式：Google");

    await act(async () => {
      accountMenu
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-cloud-account-card"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(mockBuildOemCloudUserCenterUrl).toHaveBeenCalledWith(
      "https://user.limeai.run",
      "/billing?tab=usage",
    );
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://user.limeai.run/billing?tab=usage",
      { browserTarget: null },
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("已打开 Lime 云端 用户中心");
  });

  it("云端开启邀请时应在头部展示入口并读取 share 事实源", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    seedCloudSessionWithReferral();

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const header = container.querySelector(
      '[data-testid="app-sidebar-header"]',
    );
    const inviteButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-invite-button"]',
    );
    expect(inviteButton).not.toBeNull();
    expect(header?.contains(inviteButton)).toBe(true);

    await act(async () => {
      inviteButton?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(mockGetClientReferralDashboard).not.toHaveBeenCalled();
    const dialog = document.body.querySelector(
      '[data-testid="app-sidebar-invite-dialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("LIME-2026");
    expect(dialog?.textContent).toContain("https://limeai.run");
    expect(dialog?.textContent).toContain("480 积分");
    expect(dialog?.textContent).toContain("120 积分");

    const copyShareButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("复制邀请文案"));

    await act(async () => {
      copyShareButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(
      "邀请你体验Lime，让AI做牛做马，我们来做牛人！前往 https://limeai.run 下载客户端，复制邀请码 LIME-2026 激活并注册账号参与内测",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("已复制邀请文案");
  });

  it("邀请入口应使用 navigation 命名空间资源", async () => {
    await changeLimeLocale("en-US");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    seedCloudSessionWithReferral();

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const inviteButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-invite-button"]',
    );
    expect(inviteButton?.textContent).toContain("Invite friends");

    await act(async () => {
      inviteButton?.click();
      await Promise.resolve();
    });
    await flushEffects(4);

    const dialog = document.body.querySelector(
      '[data-testid="app-sidebar-invite-dialog"]',
    );
    expect(dialog?.textContent).toContain("Lime Invite");
    expect(dialog?.textContent).toContain("Invite code");
    expect(dialog?.textContent).toContain("480 credits");
    expect(dialog?.textContent).toContain("120 credits");

    const copyShareButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Copy invite message"));

    await act(async () => {
      copyShareButton?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(
      "邀请你体验Lime，让AI做牛做马，我们来做牛人！前往 https://limeai.run 下载客户端，复制邀请码 LIME-2026 激活并注册账号参与内测",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Invite message copied");
  });

  it("缓存的云端邀请开关关闭时不应展示头部邀请入口", async () => {
    seedCloudSessionWithReferral({
      referralEnabled: false,
      referral: null,
    });

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(
      container.querySelector('[data-testid="app-sidebar-invite-button"]'),
    ).toBeNull();
    expect(mockGetClientReferralDashboard).not.toHaveBeenCalled();
  });

  it("未连接 Lime 云端时应只提示登录并保留登录入口", async () => {
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("设置");
    expect(container.textContent).not.toContain("登录 Lime 云端");
    expect(container.textContent).not.toContain("未登录");
    expect(container.textContent).not.toContain("开源");
    expect(container.textContent).not.toContain("升级");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-account-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("登录 Lime 云端");
    expect(accountMenu?.textContent).toContain(
      "登录 Lime 云端 后同步账号、积分和套餐信息。",
    );
    expect(accountMenu?.textContent).toContain("项目资料");
    expect(accountMenu?.textContent).toContain("界面语言");
    expect(accountMenu?.textContent).toContain("模型设置");
    expect(accountMenu?.textContent).toContain("关于");
    expect(accountMenu?.textContent).not.toContain("开源");
    expect(accountMenu?.textContent).not.toContain("退出登录");
    expect(
      accountMenu?.querySelector('button[aria-label="Lime 云端"]'),
    ).toBeNull();

    await act(async () => {
      accountMenu
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="登录 Lime 云端"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(mockStartOemCloudLogin).toHaveBeenCalledTimes(1);
    expect(mockStartOemCloudLogin).toHaveBeenCalledWith(undefined, {
      browserTarget: null,
      waitForCompletion: false,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "已打开 Lime 云端 登录页，请在浏览器完成授权",
    );
  });

  it("登录入口启动桌面 OAuth 后只等待登录页打开，不应显示已同步", async () => {
    mockStartOemCloudLogin.mockResolvedValueOnce({
      mode: "desktop_auth",
      openedUrl: "https://user.limeai.run/oauth/desktop/device-001/signin",
    });
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);
    await openAccountMenu(container);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="登录 Lime 云端"]')
        ?.click();
      await Promise.resolve();
    });

    expect(mockStartOemCloudLogin).toHaveBeenCalledWith(undefined, {
      browserTarget: null,
      waitForCompletion: false,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "已打开 Lime 云端 登录页，请在浏览器完成授权",
    );
    expect(mockToastSuccess).not.toHaveBeenCalledWith("Lime 云端 登录已同步");
    expect(container.textContent).not.toContain("正在打开...");
  });

  it("英文界面下未连接账号菜单应展示本地化云端入口", async () => {
    await changeLimeLocale("en-US");

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("Settings");
    expect(container.textContent).not.toContain("Log in to Lime Cloud");
    expect(container.textContent).not.toContain("Signed out");
    expect(container.textContent).not.toContain("Open Source");
    expect(container.textContent).not.toContain("开源");

    await openAccountMenu(container);

    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("Log in to Lime Cloud");
    expect(accountMenu?.textContent).toContain(
      "Log in to Lime Cloud to sync your account, credits, and plan.",
    );
    expect(accountMenu?.textContent).toContain("Interface Language");
    expect(accountMenu?.textContent).toContain("Model Settings");
    expect(accountMenu?.textContent).toContain("About");
    expect(accountMenu?.textContent).not.toContain("Open Source");

    await act(async () => {
      accountMenu
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="Log in to Lime Cloud"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Opened the Lime Cloud login page. Finish authorization in your browser.",
    );
  });

  it("Lime 云端登录完成后侧边栏应从未登录态刷新为账号信息", async () => {
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("设置");
    expect(container.textContent).not.toContain("登录 Lime 云端");
    expect(container.textContent).not.toContain("开源");

    await act(async () => {
      setStoredOemCloudSessionState({
        token: "session-token",
        tenant: {
          id: "tenant-0001",
          name: "Lime Cloud",
        },
        user: {
          id: "user-001",
          displayName: "晚风",
          email: "wanfeng@example.com",
          avatarUrl: "https://example.com/avatar.png",
        },
        session: {
          id: "session-001",
          provider: "google",
        },
      });
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(container.textContent).not.toContain("晚风");
    expect(container.textContent).not.toContain("云端");

    await openAccountMenu(container);
    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("wanfeng@example.com");
    expect(accountMenu?.textContent).toContain("Lime Cloud");
    expect(accountMenu?.textContent).toContain("免费版");
    expect(accountMenu?.textContent).not.toContain("登录方式：Google");
  });

  it("英文界面下会话兜底标题与时间 meta 应跟随当前 locale", async () => {
    const nowMs = Date.UTC(2026, 4, 10, 12, 0, 0);
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      await changeLimeLocale("en-US");
      mockListAgentRuntimeSessions.mockResolvedValue([
        {
          id: "session-untitled",
          name: "   ",
          created_at: Math.floor(nowMs / 1000),
          updated_at: Math.floor((nowMs - 2 * 60 * 1000) / 1000),
          archived_at: null,
          workspace_id: "project-1",
        },
      ]);

      const container = mountSidebarContainer({
        currentPage: "agent",
        currentPageParams: {
          agentEntry: "claw",
          projectId: "project-1",
        } as AgentPageParams,
      });
      await flushEffects(2);

      expect(container.textContent).toContain("Untitled conversation");
      expect(container.textContent).toContain("2m ago");
      expect(container.textContent).not.toContain("未命名对话");

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Open Untitled conversation action menu"]',
          )
          ?.click();
        await Promise.resolve();
      });

      const menu = document.body.querySelector(
        '[data-testid="app-sidebar-conversation-menu"]',
      );
      expect(menu?.textContent).toContain("Delete");

      await clickConversationMenuItem("app-sidebar-conversation-menu-delete");
      await flushEffects();

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete "Untitled conversation"? This cannot be undone.',
      );
    } finally {
      dateNowSpy.mockRestore();
      confirmSpy.mockRestore();
    }
  });

  it("底部设置入口应打开账号弹窗，用户中心仍跳到真实页面", async () => {
    const onNavigate = vi.fn();
    setStoredOemCloudSessionState({
      token: "session-token",
      tenant: { id: "tenant-0001" },
      user: {
        id: "user-001",
        displayName: "zhong feng shan",
      },
      session: { id: "session-001" },
    });
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-account-button"]',
        )
        ?.click();
      await Promise.resolve();
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="app-sidebar-account-menu"]')
        ?.textContent,
    ).not.toContain("Plugins");
    expect(
      container.querySelector('[data-testid="app-sidebar-account-menu"]')
        ?.textContent,
    ).toContain("模型设置");

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("用户中心"))
        ?.click();
      await Promise.resolve();
    });
    expect(mockBuildOemCloudUserCenterUrl).toHaveBeenLastCalledWith(
      "https://user.limeai.run",
      "/welcome",
    );
    expect(mockOpenExternalUrl).toHaveBeenLastCalledWith(
      "https://user.limeai.run/welcome",
      { browserTarget: null },
    );
  });

  it("用户弹框退出登录应清理个人中心会话", async () => {
    setStoredOemCloudSessionState({
      token: "session-token",
      tenant: { id: "tenant-0001" },
      user: {
        id: "user-001",
        displayName: "zhong feng shan",
      },
      session: { id: "session-001" },
    });

    const container = mountSidebarContainer();
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-account-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    const logoutButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("退出登录"),
    );

    await act(async () => {
      logoutButton?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mockLogoutClient).toHaveBeenCalledWith("tenant-0001");
    expect(getStoredOemCloudSessionState()).toBeNull();
    expect(
      container.querySelector('[data-testid="app-sidebar-account-menu"]'),
    ).toBeNull();
  });
});
