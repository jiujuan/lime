import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanupAppSidebarTest,
  flushEffects,
  mockListInstalledAgentApps,
  mountSidebarContainer,
  openAccountMenu,
  resetAppSidebarTest
} from "./AppSidebar.testFixtures";

describe("AppSidebar Agent Apps", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("已安装 Agent App 应作为动态导航项显示并直达默认入口", async () => {
    mockListInstalledAgentApps.mockResolvedValue({
      states: [
        {
          appId: "content-factory-app",
          disabled: false,
          manifest: {
            displayName: "内容工厂",
          },
          projection: {
            app: {
              appId: "content-factory-app",
              displayName: "内容工厂",
            },
            entries: [
              {
                key: "dashboard",
                kind: "page",
                title: "项目首页",
              },
            ],
          },
        },
      ],
      issues: [],
    });
    const onNavigate = vi.fn();
    const container = mountSidebarContainer({ onNavigate });
    await flushEffects(2);

    expect(container.textContent).toContain("内容工厂");
    expect(
      Array.from(
        container.querySelectorAll('[data-testid="app-sidebar-main-nav"] button'),
      ).map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "新建任务",
      "专家",
      "Skills",
      "内容工厂",
      "项目资料",
    ]);

    const appButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("内容工厂"),
    ) as HTMLButtonElement | undefined;
    act(() => {
      appButton?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent-app",
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        launchRequestKey: expect.any(Number),
      }),
    );

    await openAccountMenu(container);
    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).toContain("Agent Apps");
    expect(accountMenu?.textContent).not.toContain("内容工厂");
  });

  it("Agent App Studio 动态导航应使用安装态展示名", async () => {
    mockListInstalledAgentApps.mockResolvedValue({
      states: [
        {
          appId: "lime-agent-app-studio",
          disabled: false,
          manifest: {
            displayName: "发布应用",
          },
          projection: {
            app: {
              appId: "lime-agent-app-studio",
              displayName: "发布应用",
            },
            entries: [
              {
                key: "dashboard",
                kind: "page",
                title: "发布入口",
              },
            ],
          },
        },
      ],
      issues: [],
    });
    const onNavigate = vi.fn();
    const container = mountSidebarContainer({ onNavigate });
    await flushEffects(2);

    const mainNav = container.querySelector(
      '[data-testid="app-sidebar-main-nav"]',
    );
    expect(mainNav?.textContent).toContain("发布应用");
    expect(mainNav?.textContent).not.toContain("Lime Agent App Studio");

    const appButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("发布应用"),
    ) as HTMLButtonElement | undefined;
    expect(appButton).toBeDefined();

    act(() => {
      appButton?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent-app",
      expect.objectContaining({
        appId: "lime-agent-app-studio",
        entryKey: "dashboard",
        launchRequestKey: expect.any(Number),
      }),
    );
  });

  it("Agent App 动态导航加载失败时应降级为静态导航而不输出控制台错误", async () => {
    const navError = new Error("timeout after 5000ms");
    mockListInstalledAgentApps.mockRejectedValueOnce(navError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const container = mountSidebarContainer();
      await flushEffects(2);

      expect(container.textContent).not.toContain("内容工厂");
      expect(
        errorSpy.mock.calls.map(([message]) => String(message)),
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("加载 Agent App 导航失败"),
        ]),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "加载 Agent App 导航失败，将保持静态导航:",
        navError,
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
