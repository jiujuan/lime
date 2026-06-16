import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanupAppSidebarTest,
  flushEffects,
  mockListInstalledAgentApps,
  mountSidebarContainer,
  openAccountMenu,
  resetAppSidebarTest,
} from "./AppSidebar.testFixtures";

describe("AppSidebar Agent Apps", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("Agent Apps 聚合入口应常驻主导航并进入管理页", async () => {
    const onNavigate = vi.fn();
    const container = mountSidebarContainer({ onNavigate });
    await flushEffects(2);

    expect(
      Array.from(
        container.querySelectorAll(
          '[data-testid="app-sidebar-main-nav"] button',
        ),
      ).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["新建任务", "专家", "Skills", "Agent Apps"]);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Agent Apps"]')
        ?.click();
    });

    expect(onNavigate).toHaveBeenCalledWith("agent-apps", undefined);
    expect(mockListInstalledAgentApps).not.toHaveBeenCalled();

    await openAccountMenu(container);
    const accountMenu = container.querySelector(
      '[data-testid="app-sidebar-account-menu"]',
    );
    expect(accountMenu?.textContent).not.toContain("Agent Apps");
  });

  it("已安装 Agent App 不应作为左侧独立导航项显示", async () => {
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
    const container = mountSidebarContainer();
    await flushEffects(2);

    const mainNav = container.querySelector(
      '[data-testid="app-sidebar-main-nav"]',
    );
    expect(mainNav?.textContent).toContain("Agent Apps");
    expect(mainNav?.textContent).not.toContain("内容工厂");
    expect(mainNav?.textContent).not.toContain("发布应用");
    expect(
      Array.from(
        container.querySelectorAll(
          '[data-testid="app-sidebar-main-nav"] button',
        ),
      ).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["新建任务", "专家", "Skills", "Agent Apps"]);
    expect(mockListInstalledAgentApps).not.toHaveBeenCalled();
  });

  it("Agent App 变更事件不应影响侧栏聚合入口", async () => {
    const container = mountSidebarContainer();
    await flushEffects(2);

    await act(async () => {
      window.dispatchEvent(new Event("lime:agent-apps-changed"));
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mockListInstalledAgentApps).not.toHaveBeenCalled();
    expect(
      Array.from(
        container.querySelectorAll(
          '[data-testid="app-sidebar-main-nav"] button',
        ),
      ).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["新建任务", "专家", "Skills", "Agent Apps"]);
  });

  it("安装态读取失败不应影响静态 Agent Apps 聚合入口", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const container = mountSidebarContainer();
      await flushEffects(2);

      expect(
        container.querySelector<HTMLButtonElement>(
          'button[aria-label="Agent Apps"]',
        ),
      ).not.toBeNull();
      expect(container.textContent).not.toContain("内容工厂");
      expect(mockListInstalledAgentApps).not.toHaveBeenCalled();
      expect(
        errorSpy.mock.calls.map(([message]) => String(message)),
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("加载 Agent App 导航失败"),
        ]),
      );
      expect(
        warnSpy.mock.calls.map(([message]) => String(message)),
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("加载 Agent App 导航失败"),
        ]),
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
