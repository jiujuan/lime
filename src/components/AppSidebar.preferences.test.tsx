import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SIDEBAR_ENABLED_ITEMS_STORAGE_KEY,
  LIME_COLOR_SCHEME_STORAGE_KEY,
  LIME_THEME_STORAGE_KEY,
  SettingsTabs,
  act,
  changeLimeLocale,
  cleanupAppSidebarTest,
  flushEffects,
  mockCheckForUpdates,
  mockGetConfig,
  mockOpenUpdateWindow,
  mountSidebarContainer,
  resetAppSidebarTest,
} from "./AppSidebar.testFixtures";
import type { AgentPageParams } from "./AppSidebar.testFixtures";

describe("AppSidebar preferences", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("检测到新版本时应在账户区显示升级图标并点击打开更新专用窗口", async () => {
    mockCheckForUpdates.mockResolvedValue({
      current: "1.57.0",
      latest: "1.58.0",
      hasUpdate: true,
      downloadUrl: "https://example.com/lime",
      releaseNotesUrl: null,
      releaseNotes: null,
      pubDate: null,
      error: null,
    });

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(3);

    const accountSlot = container.querySelector(
      '[data-testid="app-sidebar-account-slot"]',
    );
    const updateButton = accountSlot?.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-update-button"]',
    );

    expect(updateButton).not.toBeNull();
    expect(updateButton?.textContent).toBe("");
    expect(
      container.querySelector('[data-testid="app-sidebar-update-panel"]'),
    ).toBeNull();

    updateButton!.getBoundingClientRect = vi.fn(
      () =>
        ({
          x: 18,
          y: 816,
          width: 30,
          height: 30,
          top: 816,
          right: 48,
          bottom: 846,
          left: 18,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    await act(async () => {
      updateButton?.click();
      await Promise.resolve();
    });

    expect(mockOpenUpdateWindow).toHaveBeenCalledWith({
      x: 18,
      y: 816,
      width: 30,
      height: 30,
    });
    expect(
      container.querySelector('[data-testid="app-sidebar-update-panel"]'),
    ).toBeNull();
    expect(
      accountSlot?.querySelector('[data-testid="app-sidebar-update-button"]'),
    ).not.toBeNull();
  });

  it("显式开启后应显示可选系统扩展入口", async () => {
    mockGetConfig.mockResolvedValue({
      navigation: {
        schema_version: 3,
        enabled_items: ["companion"],
      },
    });

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).not.toContain("桌宠");

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
    expect(accountMenu?.textContent).toContain("设置");
    expect(accountMenu?.textContent).toContain("持续流程");
    expect(accountMenu?.textContent).toContain("消息渠道");
    expect(accountMenu?.textContent).toContain("桌宠");
  });

  it("配置变更后应重新读取可选入口并刷新侧栏", async () => {
    mockGetConfig
      .mockResolvedValueOnce({
        navigation: {
          schema_version: 3,
          enabled_items: [],
        },
      })
      .mockResolvedValueOnce({
        navigation: {
          schema_version: 3,
          enabled_items: ["companion"],
        },
      });

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).not.toContain("桌宠");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-account-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    let accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("设置");
    expect(accountMenu?.textContent).toContain("持续流程");
    expect(accountMenu?.textContent).toContain("消息渠道");
    expect(accountMenu?.textContent).not.toContain("桌宠");

    await act(async () => {
      (
        globalThis as typeof globalThis & {
          __appConfigListener?: () => void;
        }
      ).__appConfigListener?.();
      await Promise.resolve();
    });
    await flushEffects(2);

    accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("桌宠");
  });

  it("旧 schema 中的桌宠入口不应默认显示", async () => {
    mockGetConfig.mockResolvedValue({
      navigation: {
        schema_version: 2,
        enabled_items: ["companion"],
      },
    });

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
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

    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).not.toContain("桌宠");
  });

  it("点击当前已激活的Skills入口时不应重复导航", async () => {
    const onNavigate = vi.fn();
    const container = mountSidebarContainer({
      currentPage: "skills",
      onNavigate,
    });
    await flushEffects();

    const button = container.querySelector(
      'button[aria-label="Skills"]',
    ) as HTMLButtonElement | null;

    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-current")).toBe("page");

    act(() => {
      button?.click();
    });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("从全局 Skills 入口进入时应带上当前工作区，避免能力草案面板丢上下文", async () => {
    const onNavigate = vi.fn();
    localStorage.setItem("agent_last_project_id", JSON.stringify("project-1"));
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects();

    const button = container.querySelector(
      'button[aria-label="Skills"]',
    ) as HTMLButtonElement | null;

    expect(button).not.toBeNull();

    act(() => {
      button?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith("skills", {
      creationProjectId: "project-1",
    });
  });

  it("旧的 enabled-items 本地缓存不应再复活历史导航", async () => {
    localStorage.setItem(
      APP_SIDEBAR_ENABLED_ITEMS_STORAGE_KEY,
      JSON.stringify(["plugins", "companion", "video"]),
    );
    mockGetConfig.mockImplementation(() => new Promise(() => undefined));

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects();

    expect(container.textContent).not.toContain("插件中心");
    expect(container.textContent).not.toContain("桌宠");
  });

  it("底部外观入口应弹出轻量快捷面板并同步主题与配色", async () => {
    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="快速切换外观"]',
    );

    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
      await Promise.resolve();
    });

    const popover = container.querySelector(
      '[data-testid="app-sidebar-appearance-popover"]',
    );
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("浅色");
    expect(popover?.textContent).toContain("深色");
    expect(popover?.textContent).toContain("跟随系统");
    expect(popover?.textContent).toContain("随机");
    expect(popover?.textContent).toContain("墨绿");
    expect(popover?.textContent).toContain("自然");
    expect(popover?.textContent).toContain("海洋");
    expect(popover?.textContent).toContain("复古");
    expect(popover?.textContent).toContain("霓虹");
    expect(popover?.textContent).toContain("青柠");
    expect(popover?.textContent).toContain("黄昏");
    expect(popover?.textContent).toContain("极简");
    expect(popover?.textContent).toContain("活力");
    expect(popover?.textContent).toContain("文艺");
    expect(popover?.textContent).toContain("奢华");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="切换配色为海洋"]')
        ?.click();
      await Promise.resolve();
    });

    expect(localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "lime-ocean",
    );
    expect(document.documentElement.dataset.limeColorScheme).toBe("lime-ocean");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="切换主题为深色"]')
        ?.click();
      await Promise.resolve();
    });

    expect(localStorage.getItem(LIME_THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.limeTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("外观快捷面板应使用 navigation 命名空间资源", async () => {
    await changeLimeLocale("en-US");
    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Quick appearance switch"]',
    );

    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
      await Promise.resolve();
    });

    const popover = container.querySelector(
      '[data-testid="app-sidebar-appearance-popover"]',
    );
    expect(popover?.textContent).toContain("Appearance");
    expect(popover?.textContent).toContain("Follow system · Ink Green");
    expect(popover?.textContent).toContain("Theme");
    expect(popover?.textContent).toContain("Color");
    expect(popover?.textContent).toContain("Light");
    expect(popover?.textContent).toContain("Dark");
    expect(popover?.textContent).toContain("Follow system");
    expect(popover?.textContent).toContain("Random");
    expect(popover?.textContent).toContain("Ocean");
    expect(
      container.querySelector('button[aria-label="Switch theme to Dark"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'button[aria-label="Switch color scheme to Ocean"]',
      ),
    ).not.toBeNull();
  });

  it("外观弹层的随机配色应持久化到一个真实预设", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const container = mountSidebarContainer({
        currentPage: "agent",
        currentPageParams: {
          agentEntry: "new-task",
        } as AgentPageParams,
      });
      await flushEffects(2);

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[aria-label="快速切换外观"]')
          ?.click();
        await Promise.resolve();
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[aria-label="随机切换配色"]')
          ?.click();
        await Promise.resolve();
      });

      expect(localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY)).toBe(
        "lime-forest",
      );
      expect(document.documentElement.dataset.limeColorScheme).toBe(
        "lime-forest",
      );
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("桌宠入口开启后，进入 companion 视图应高亮桌宠", async () => {
    mockGetConfig.mockResolvedValue({
      navigation: {
        schema_version: 3,
        enabled_items: ["companion"],
      },
    });

    const container = mountSidebarContainer({
      currentPage: "settings",
      currentPageParams: {
        tab: SettingsTabs.Providers,
        providerView: "companion",
      },
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

    expect(
      container.querySelector('button[aria-label="桌宠"][aria-current="page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="设置"][aria-current="page"]'),
    ).toBeNull();
  });
});
