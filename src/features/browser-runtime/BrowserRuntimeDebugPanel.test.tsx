import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  cleanupMountedBrowserRuntimeDebugPanels,
  clickButtonByText,
  createAttachedChromeBridgeStatus,
  createAttachedBrowserProfile,
  createChromeBridgeStatus,
  createChromeObserver,
  createDefaultRuntimeState,
  createDeferredPromise,
  createSiteAdapter,
  createSiteAdapterRecommendation,
  createSiteAdapterRunResult,
  flushPanelEffects,
  renderPanel,
} from "./browserRuntimeDebugPanelTestFixtures";

const { mockUseBrowserRuntimeDebug } = vi.hoisted(() => ({
  mockUseBrowserRuntimeDebug: vi.fn(),
}));

const {
  mockGetBrowserRuntimeAuditLogs,
  mockListBrowserProfiles,
  mockGetChromeBridgeStatus,
  mockBrowserExecuteAction,
  mockSiteListAdapters,
  mockSiteRecommendAdapters,
  mockSiteGetAdapterCatalogStatus,
  mockSiteRunAdapter,
} = vi.hoisted(() => ({
  mockGetBrowserRuntimeAuditLogs: vi.fn(),
  mockListBrowserProfiles: vi.fn(),
  mockGetChromeBridgeStatus: vi.fn(),
  mockBrowserExecuteAction: vi.fn(),
  mockSiteListAdapters: vi.fn(),
  mockSiteRecommendAdapters: vi.fn(),
  mockSiteGetAdapterCatalogStatus: vi.fn(),
  mockSiteRunAdapter: vi.fn(),
}));

vi.mock("./useBrowserRuntimeDebug", () => ({
  useBrowserRuntimeDebug: mockUseBrowserRuntimeDebug,
}));

vi.mock("./api", () => ({
  browserRuntimeApi: {
    getBrowserRuntimeAuditLogs: mockGetBrowserRuntimeAuditLogs,
    listBrowserProfiles: mockListBrowserProfiles,
    getChromeBridgeStatus: mockGetChromeBridgeStatus,
    browserExecuteAction: mockBrowserExecuteAction,
    siteListAdapters: mockSiteListAdapters,
    siteRecommendAdapters: mockSiteRecommendAdapters,
    siteGetAdapterCatalogStatus: mockSiteGetAdapterCatalogStatus,
    siteRunAdapter: mockSiteRunAdapter,
    openBrowserRuntimeDebuggerWindow: vi.fn(async () => undefined),
    reopenProfileWindow: vi.fn(async () => undefined),
  },
}));

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
  mockUseBrowserRuntimeDebug.mockReturnValue(createDefaultRuntimeState());
  mockGetBrowserRuntimeAuditLogs.mockResolvedValue([]);
  mockListBrowserProfiles.mockResolvedValue([]);
  mockGetChromeBridgeStatus.mockResolvedValue(createChromeBridgeStatus());
  mockBrowserExecuteAction.mockResolvedValue({
    success: true,
    backend: "lime_extension_bridge",
    action: "read_page",
    request_id: "browser-attach-default",
    attempts: [],
    data: {
      page_info: {
        title: "默认页面",
        url: "https://example.com/default",
        markdown: "# 默认页面",
        updated_at: "2026-03-16T10:00:00Z",
      },
    },
  });
  mockSiteListAdapters.mockResolvedValue([createSiteAdapter()]);
  mockSiteRecommendAdapters.mockResolvedValue([
    createSiteAdapterRecommendation(),
  ]);
  mockSiteGetAdapterCatalogStatus.mockResolvedValue({
    exists: false,
    source_kind: "server_synced",
    registry_version: 1,
    catalog_version: "test-catalog",
    tenant_id: "local-test",
    synced_at: "2026-03-16T10:00:00Z",
    adapter_count: 1,
  });
  mockSiteRunAdapter.mockResolvedValue(createSiteAdapterRunResult());
});

afterEach(() => {
  cleanupMountedBrowserRuntimeDebugPanels();
  vi.clearAllMocks();
});

describe("BrowserRuntimeDebugPanel", () => {
  it("存在初始附着会话时不应因空 session 列表而退回占位提示", async () => {
    const container = await renderPanel();
    expect(container.textContent).toContain("浏览器实时会话");
    expect(container.textContent).toContain("正在连接浏览器会话");
    expect(container.textContent).not.toContain(
      "还没有运行中的独立 Chrome Profile",
    );
  });

  it("英文界面应使用 workspace namespace 调试面板外壳文案", async () => {
    await changeLimeLocale("en-US");

    const container = await renderPanel();

    expect(container.textContent).toContain("Browser Live Session");
    expect(container.textContent).toContain(
      "View the live browser from the general chat",
    );
    expect(container.textContent).toContain("Standalone window");
    expect(container.textContent).toContain("Advanced debug");
    expect(container.textContent).toContain("No session open");
    expect(container.textContent).toContain("Disconnected");
    expect(container.textContent).toContain("Not attached to a browser");
    expect(container.textContent).toContain("Connecting browser session...");
    expect(container.textContent).toContain("Connect browser");
    expect(container.textContent).toContain("Minimal Manual Control");
    expect(container.textContent).toContain("Disabled");
    expect(
      container.querySelector(
        'input[placeholder="Send text to the current focused element"]',
      ),
    ).toBeInstanceOf(HTMLInputElement);

    const toggleButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Advanced debug"),
    );

    expect(toggleButton).toBeTruthy();
    await clickButtonByText(container, "Advanced debug");

    expect(container.textContent).toContain("Profile session");
    expect(container.textContent).toContain("CDP tab");
    expect(container.textContent).toContain("No tabs found");
    expect(container.textContent).toContain("Refresh tabs");
    expect(container.textContent).toContain("Reattach");
    expect(container.textContent).toContain("Continue in Chrome");
    expect(container.textContent).toContain("Session info");
    expect(container.textContent).toContain("Status:");
    expect(container.textContent).toContain("Control mode:");
    expect(container.textContent).toContain("Last frame:");
    expect(container.textContent).toContain("No Console events");
    expect(container.textContent).toContain("No Network events");
  });

  it("启动浏览器时应展示明确的加载提示", async () => {
    mockUseBrowserRuntimeDebug.mockReturnValue(
      createDefaultRuntimeState({
      openingSession: true,
      refreshingState: false,
      }),
    );

    const container = await renderPanel();

    expect(container.textContent).toContain("正在启动 Chrome、连接调试通道");
    expect(container.textContent).toContain("通常需要 3–8 秒");
  });

  it("展开高级调试后应展示最近启动与动作审计", async () => {
    mockGetBrowserRuntimeAuditLogs.mockResolvedValue([
      {
        id: "audit-launch-1",
        created_at: "2026-03-15T10:00:00Z",
        kind: "launch",
        profile_key: "general_browser_assist",
        profile_id: "browser-profile-1",
        success: true,
        url: "https://example.com",
        environment_preset_name: "美区桌面",
        reused: false,
        open_window: true,
        stream_mode: "both",
        browser_source: "system",
        remote_debugging_port: 13001,
      },
      {
        id: "audit-action-1",
        created_at: "2026-03-15T10:00:03Z",
        kind: "action",
        action: "navigate",
        profile_key: "general_browser_assist",
        success: true,
        attempts: [
          {
            backend: "aster_compat",
            success: true,
            message: "执行成功",
          },
        ],
      },
    ]);

    const container = await renderPanel();
    const toggleButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("高级调试"),
    );

    expect(toggleButton).toBeTruthy();

    await clickButtonByText(container, "高级调试");

    expect(mockGetBrowserRuntimeAuditLogs).toHaveBeenCalledWith(16);
    expect(container.textContent).toContain("最近启动与动作审计");
    expect(container.textContent).toContain("启动成功");
    expect(container.textContent).toContain("美区桌面");
    expect(container.textContent).toContain("动作 · navigate");
  }, 10000);

  it("高级调试中应支持执行站点命令", async () => {
    const container = await renderPanel();

    await clickButtonByText(container, "高级调试");
    await flushPanelEffects();

    expect(container.textContent).toContain("站点命令调试");
    expect(container.textContent).toContain("github/search");

    await clickButtonByText(container, "执行站点命令");
    await flushPanelEffects();

    expect(mockSiteRunAdapter).toHaveBeenCalledWith({
      adapter_name: "github/search",
      args: {
        query: "model context protocol",
        limit: 5,
      },
      profile_key: "general_browser_assist",
    });
    expect(container.textContent).toContain("执行成功");
    expect(container.textContent).toContain("mock repo");
  });

  it("无 CDP 会话但存在附着资料时应展示附着当前 Chrome 调试面板", async () => {
    mockUseBrowserRuntimeDebug.mockReturnValue({
      ...createDefaultRuntimeState(),
      selectedProfileKey: "weibo_attach",
    });
    mockListBrowserProfiles.mockResolvedValue([createAttachedBrowserProfile()]);
    mockGetChromeBridgeStatus.mockResolvedValue(
      createAttachedChromeBridgeStatus(),
    );

    const container = await renderPanel({
      initialProfileKey: "weibo_attach",
      initialSessionId: undefined,
    });
    await clickButtonByText(container, "高级调试");

    expect(container.textContent).toContain("附着当前 Chrome");
    expect(container.textContent).toContain("微博附着");
    expect(container.textContent).toContain("微博首页");
    expect(container.textContent).toContain("当前窗口标签页");
  });

  it("英文界面应使用 workspace namespace 附着 Chrome presentation 文案", async () => {
    await changeLimeLocale("en-US");
    mockUseBrowserRuntimeDebug.mockReturnValue({
      ...createDefaultRuntimeState(),
      selectedProfileKey: "weibo_attach",
    });
    mockListBrowserProfiles.mockResolvedValue([createAttachedBrowserProfile()]);
    mockGetChromeBridgeStatus.mockResolvedValue(
      createAttachedChromeBridgeStatus(),
    );

    const container = await renderPanel({
      initialProfileKey: "weibo_attach",
      initialSessionId: undefined,
    });
    await clickButtonByText(container, "Advanced debug");

    expect(container.textContent).toContain("Attached current Chrome");
    expect(container.textContent).toContain("Read current page");
    expect(container.textContent).toContain("Read tabs");
    expect(container.textContent).toContain("Current window tabs");
  });

  it("existing_session 正在切到 runtime 会话时不应回退附着面板", async () => {
    mockUseBrowserRuntimeDebug.mockReturnValue({
      ...createDefaultRuntimeState(),
      selectedProfileKey: "weibo_attach",
      selectedSession: {
        profile_key: "weibo_attach",
        browser_source: "system",
        browser_path: "",
        profile_dir: "",
        remote_debugging_port: 16666,
        pid: 0,
        started_at: "2026-03-15T00:00:00Z",
        last_url: "https://weibo.com/home",
      },
      openingSession: true,
      selectedProfileTransportKind: "existing_session",
      isExistingSessionProfile: true,
    });
    mockListBrowserProfiles.mockResolvedValue([createAttachedBrowserProfile()]);
    mockGetChromeBridgeStatus.mockResolvedValue(
      createAttachedChromeBridgeStatus(),
    );

    const container = await renderPanel({
      initialProfileKey: "weibo_attach",
      initialSessionId: undefined,
    });

    expect(container.textContent).toContain("正在启动 Chrome、连接调试通道");
    expect(container.textContent).not.toContain("当前窗口标签页");
    expect(container.textContent).not.toContain("附着当前 Chrome");
  });

  it("附着模式应支持读取并切换当前 Chrome 标签页", async () => {
    const onMessage = vi.fn();
    mockUseBrowserRuntimeDebug.mockReturnValue({
      ...createDefaultRuntimeState(),
      selectedProfileKey: "weibo_attach",
    });
    mockListBrowserProfiles.mockResolvedValue([createAttachedBrowserProfile()]);
    mockGetChromeBridgeStatus
      .mockResolvedValueOnce(
        createAttachedChromeBridgeStatus({
          observers: [
            createChromeObserver({
              last_heartbeat_at: "2026-03-15T00:00:02Z",
              last_page_info: {
                title: "微博首页",
                url: "https://weibo.com/home",
                markdown: "# 微博首页",
                updated_at: "2026-03-15T00:00:05Z",
              },
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        createAttachedChromeBridgeStatus({
          observers: [
            createChromeObserver({
              last_heartbeat_at: "2026-03-15T00:00:06Z",
              last_page_info: {
                title: "微博首页",
                url: "https://weibo.com/home",
                markdown: "# 微博首页",
                updated_at: "2026-03-15T00:00:05Z",
              },
            }),
          ],
        }),
      )
      .mockResolvedValue(
        createAttachedChromeBridgeStatus({
          observers: [
            createChromeObserver({
              last_heartbeat_at: "2026-03-15T00:00:06Z",
              last_page_info: {
                title: "微博首页",
                url: "https://weibo.com/home",
                markdown: "# 微博首页",
                updated_at: "2026-03-15T00:00:05Z",
              },
            }),
          ],
        }),
      );
    mockBrowserExecuteAction
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "list_tabs",
        request_id: "browser-tabs-1",
        attempts: [],
        data: {
          data: {
            tabs: [
              {
                id: 101,
                index: 0,
                title: "微博首页",
                url: "https://weibo.com/home",
                active: true,
              },
              {
                id: 202,
                index: 1,
                title: "微博创作中心",
                url: "https://weibo.com/compose",
                active: false,
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "switch_tab",
        request_id: "browser-switch-1",
        attempts: [],
        data: {
          page_info: {
            title: "微博创作中心",
            url: "https://weibo.com/compose",
            markdown: "# 微博创作中心",
            updated_at: "2026-03-15T00:00:08Z",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "list_tabs",
        request_id: "browser-tabs-2",
        attempts: [],
        data: {
          data: {
            tabs: [
              {
                id: 101,
                index: 0,
                title: "微博首页",
                url: "https://weibo.com/home",
                active: false,
              },
              {
                id: 202,
                index: 1,
                title: "微博创作中心",
                url: "https://weibo.com/compose",
                active: true,
              },
            ],
          },
        },
      });

    const container = await renderPanel({
      initialProfileKey: "weibo_attach",
      initialSessionId: undefined,
      onMessage,
    });

    await clickButtonByText(container, "高级调试");
    await clickButtonByText(container, "读取标签页");

    expect(mockBrowserExecuteAction).toHaveBeenNthCalledWith(1, {
      profile_key: "weibo_attach",
      backend: "lime_extension_bridge",
      action: "list_tabs",
      timeout_ms: 30000,
    });
    expect(container.textContent).toContain("微博创作中心");

    await clickButtonByText(container, "切换到此页");

    expect(mockBrowserExecuteAction).toHaveBeenNthCalledWith(2, {
      profile_key: "weibo_attach",
      backend: "lime_extension_bridge",
      action: "switch_tab",
      args: {
        target: "202",
        wait_for_page_info: true,
      },
      timeout_ms: 30000,
    });
    expect(mockBrowserExecuteAction).toHaveBeenNthCalledWith(3, {
      profile_key: "weibo_attach",
      backend: "lime_extension_bridge",
      action: "list_tabs",
      timeout_ms: 30000,
    });
    expect(onMessage).toHaveBeenCalledWith({
      type: "success",
      text: "已切换到标签页：微博创作中心",
    });
    expect(container.textContent).toContain("当前标签页");
    expect(container.textContent).toContain("微博创作中心");
    expect(container.textContent).toContain("https://weibo.com/compose");
  });

  it("附着模式不应让较旧的 read_page 结果覆盖较新的切页结果", async () => {
    const deferredReadPage = createDeferredPromise<{
      success: boolean;
      backend: string;
      action: string;
      request_id: string;
      attempts: unknown[];
      data: {
        page_info: {
          title: string;
          url: string;
          markdown: string;
          updated_at: string;
        };
      };
    }>();

    mockUseBrowserRuntimeDebug.mockReturnValue({
      ...createDefaultRuntimeState(),
      selectedProfileKey: "weibo_attach",
    });
    mockListBrowserProfiles.mockResolvedValue([createAttachedBrowserProfile()]);
    mockGetChromeBridgeStatus.mockResolvedValue(
      createAttachedChromeBridgeStatus({
        observers: [
          createChromeObserver({
            last_page_info: {
              title: "初始页面",
              url: "https://weibo.com/home",
              markdown: "# 初始页面",
              updated_at: "2026-03-15T00:00:05Z",
            },
          }),
        ],
      }),
    );
    mockBrowserExecuteAction
      .mockImplementationOnce(() => deferredReadPage.promise)
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "list_tabs",
        request_id: "browser-tabs-race-1",
        attempts: [],
        data: {
          data: {
            tabs: [
              {
                id: 101,
                index: 0,
                title: "原页面标签",
                url: "https://weibo.com/home",
                active: true,
              },
              {
                id: 202,
                index: 1,
                title: "目标标签",
                url: "https://weibo.com/compose",
                active: false,
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "switch_tab",
        request_id: "browser-switch-race-1",
        attempts: [],
        data: {
          page_info: {
            title: "切换后页面",
            url: "https://weibo.com/compose",
            markdown: "# 切换后页面",
            updated_at: "2026-03-15T00:00:08Z",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        backend: "lime_extension_bridge",
        action: "list_tabs",
        request_id: "browser-tabs-race-2",
        attempts: [],
        data: {
          data: {
            tabs: [
              {
                id: 101,
                index: 0,
                title: "原页面标签",
                url: "https://weibo.com/home",
                active: false,
              },
              {
                id: 202,
                index: 1,
                title: "目标标签",
                url: "https://weibo.com/compose",
                active: true,
              },
            ],
          },
        },
      });

    const container = await renderPanel({
      initialProfileKey: "weibo_attach",
      initialSessionId: undefined,
    });
    await clickButtonByText(container, "高级调试");
    await clickButtonByText(container, "读取当前页面");
    await clickButtonByText(container, "读取标签页");
    await clickButtonByText(container, "切换到此页");

    expect(container.textContent).toContain("切换后页面");
    expect(container.textContent).not.toContain("过期页面");

    await act(async () => {
      deferredReadPage.resolve({
        success: true,
        backend: "lime_extension_bridge",
        action: "read_page",
        request_id: "browser-read-race-1",
        attempts: [],
        data: {
          page_info: {
            title: "过期页面",
            url: "https://weibo.com/stale",
            markdown: "# 过期页面",
            updated_at: "2026-03-15T00:00:06Z",
          },
        },
      });
      await deferredReadPage.promise;
      await Promise.resolve();
    });

    expect(container.textContent).toContain("切换后页面");
    expect(container.textContent).not.toContain("过期页面");
  });
});
