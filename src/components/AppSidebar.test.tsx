import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  AppSidebar,
  TASK_CENTER_CREATE_DRAFT_TASK_EVENT,
  TASK_CENTER_OPEN_TASK_EVENT,
  act,
  cleanupAppSidebarTest,
  flushEffects,
  mockListAgentRuntimeSessions,
  mockScheduleMinimumDelayIdleTask,
  mountSidebar,
  mountSidebarContainer,
  resetAppSidebarTest
} from "./AppSidebar.testFixtures";
import type { AgentPageParams } from "./AppSidebar.testFixtures";

describe("AppSidebar navigation", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("进入任务中心页时应保持导航栏展开，以承接左侧任务导航", async () => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, "false");

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "claw",
      } as AgentPageParams,
    });
    await flushEffects();

    expect(
      container.querySelector('button[aria-label="折叠导航栏"]'),
    ).not.toBeNull();
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );
  });

  it("新建任务页应自动展开导航栏", async () => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, "true");

    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects();

    expect(
      container.querySelector('button[aria-label="折叠导航栏"]'),
    ).not.toBeNull();
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );
  });

  it("新建任务首页应短 idle 加载最近对话，避免列表首屏长时间为空", async () => {
    const scheduledTasks: Array<{
      task: () => void;
      options?: { minimumDelayMs?: number; idleTimeoutMs?: number };
    }> = [];
    mockScheduleMinimumDelayIdleTask.mockImplementation(
      (
        task: () => void,
        options?: { minimumDelayMs?: number; idleTimeoutMs?: number },
      ) => {
        scheduledTasks.push({ task, options });
        return () => undefined;
      },
    );

    mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const deferredSessionLoad = scheduledTasks.find(
      (entry) =>
        entry.options?.minimumDelayMs === 0 &&
        entry.options?.idleTimeoutMs === 0,
    );
    expect(deferredSessionLoad).toBeDefined();

    await act(async () => {
      deferredSessionLoad?.task();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      workspaceId: "project-1",
    });
  });

  it("文件管理器临时折叠导航栏后应恢复用户原始状态", async () => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, "false");

    const container = mountSidebarContainer();
    await flushEffects();

    expect(
      container.querySelector('button[aria-label="折叠导航栏"]'),
    ).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("lime:app-sidebar-collapse", {
          detail: { collapsed: true, source: "file-manager" },
        }),
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('button[aria-label="展开导航栏"]'),
    ).not.toBeNull();
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("lime:app-sidebar-collapse", {
          detail: { collapsed: false, source: "file-manager" },
        }),
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('button[aria-label="折叠导航栏"]'),
    ).not.toBeNull();
  });

  it("进入 Agent App 运行页时应临时折叠导航栏并在离开后恢复", async () => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, "false");
    const onNavigate = vi.fn();
    const mounted = mountSidebar({
      currentPage: "agent-app",
      onNavigate,
    });
    await flushEffects(2);

    expect(
      mounted.container
        .querySelector('[data-testid="app-sidebar"]')
        ?.getAttribute("data-collapsed"),
    ).toBe("true");
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );

    await act(async () => {
      mounted.container
        .querySelector<HTMLButtonElement>('button[aria-label="展开导航栏"]')
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(
      mounted.container
        .querySelector('[data-testid="app-sidebar"]')
        ?.getAttribute("data-collapsed"),
    ).toBe("false");
    expect(localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );

    act(() => {
      mounted.root.render(
        <AppSidebar currentPage="agent" onNavigate={onNavigate} />,
      );
    });
    await flushEffects(2);

    expect(
      mounted.container
        .querySelector('[data-testid="app-sidebar"]')
        ?.getAttribute("data-collapsed"),
    ).toBe("false");
  });

  it("默认应渲染一级主导航，并将系统入口收进用户弹框", async () => {
    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("任务");
    expect(container.textContent).toContain("新建任务");
    expect(container.textContent).not.toContain("工作台");
    expect(container.textContent).not.toContain("生成");
    expect(container.textContent).toContain("专家");
    expect(container.textContent).toContain("Skills");
    expect(container.textContent).not.toContain("Agent Apps");
    expect(container.textContent).not.toContain("灵感");
    expect(container.textContent).toContain("项目资料");
    expect(container.textContent).not.toContain("设置");
    expect(container.textContent).not.toContain("持续流程");
    expect(container.textContent).not.toContain("消息渠道");
    expect(container.textContent).not.toContain("桌宠");
    expect(container.textContent).not.toContain("支撑");
    expect(container.textContent).not.toContain("技能");
    expect(container.textContent).not.toContain("能力");
    expect(container.textContent).not.toContain("系统");

    const mainNavButtons = Array.from(
      container.querySelectorAll('[data-testid="app-sidebar-main-nav"] button'),
    ).map((button) => button.getAttribute("aria-label"));
    const footerArea = container.querySelector(
      '[data-testid="app-sidebar-footer-area"]',
    );

    expect(mainNavButtons).toEqual([
      "新建任务",
      "专家",
      "Skills",
      "项目资料",
    ]);
    expect(
      container.querySelector('[data-testid="app-sidebar-footer-nav"]'),
    ).toBeNull();
    expect(footerArea).not.toBeNull();
    expect(getComputedStyle(footerArea as Element).paddingBottom).toBe("16px");

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
    expect(accountMenu?.textContent).toContain("Agent Apps");
    expect(accountMenu?.textContent).toContain("灵感");
    expect(accountMenu?.textContent).toContain("持续流程");
    expect(accountMenu?.textContent).toContain("消息渠道");
  });

  it("Lime 首页入口应保持在左侧栏顶部，并在 macOS 预留系统按钮安全区", async () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      userAgent: "Mac OS X",
    });

    const onNavigate = vi.fn();
    const container = mountSidebarContainer({
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    const sidebar = container.querySelector('[data-testid="app-sidebar"]');
    const header = container.querySelector(
      '[data-testid="app-sidebar-header"]',
    );
    const homeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="返回 Lime 首页"]',
    );
    const mainNav = container.querySelector(
      '[data-testid="app-sidebar-main-nav"]',
    );

    expect(sidebar?.getAttribute("data-window-controls-reserved")).toBe("true");
    expect(header).not.toBeNull();
    expect(homeButton).not.toBeNull();
    expect(header?.contains(homeButton)).toBe(true);
    expect(
      Boolean(
        header &&
        mainNav &&
        (header.compareDocumentPosition(mainNav) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
      ),
    ).toBe(true);

    await act(async () => {
      homeButton?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toBe("agent");
  });

  it("新建任务页应高亮新建任务入口", async () => {
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(
      container.querySelector(
        'button[aria-label="新建任务"][aria-current="page"]',
      ),
    ).not.toBeNull();
  });

  it("任务中心内点击一级新建任务应交给本地草稿标签，不跳出到新建首页", async () => {
    const onNavigate = vi.fn();
    const receivedDetails: unknown[] = [];
    const listener = (event: Event) => {
      receivedDetails.push(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      event.preventDefault();
    };
    window.addEventListener(TASK_CENTER_CREATE_DRAFT_TASK_EVENT, listener);

    try {
      const container = mountSidebarContainer({
        currentPage: "agent",
        currentPageParams: {
          agentEntry: "claw",
          projectId: "project-1",
          initialSessionId: "session-current",
        } as AgentPageParams,
        onNavigate,
      });
      await flushEffects(2);

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[aria-label="新建任务"]')
          ?.click();
        await Promise.resolve();
      });

      expect(receivedDetails).toEqual([{ source: "sidebar" }]);
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(TASK_CENTER_CREATE_DRAFT_TASK_EVENT, listener);
    }
  });

  it("任务中心内点击已有会话应交给本地标签栏，不重复触发导航", async () => {
    const onNavigate = vi.fn();
    const receivedDetails: unknown[] = [];
    const listener = (event: Event) => {
      receivedDetails.push(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      event.preventDefault();
    };
    window.addEventListener(TASK_CENTER_OPEN_TASK_EVENT, listener);
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-target",
        name: "目标历史会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        messages_count: 3,
      },
    ]);

    try {
      const container = mountSidebarContainer({
        currentPage: "agent",
        currentPageParams: {
          agentEntry: "claw",
          projectId: "project-1",
          initialSessionId: "session-current",
        } as AgentPageParams,
        onNavigate,
      });
      await flushEffects(2);

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[title="目标历史会话"]')
          ?.click();
        await Promise.resolve();
      });

      expect(receivedDetails).toEqual([
        {
          sessionId: "session-target",
          workspaceId: "project-1",
          source: "sidebar",
        },
      ]);
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(TASK_CENTER_OPEN_TASK_EVENT, listener);
    }
  });

  it("新建任务首页点击已有会话应进入对应历史对话", async () => {
    const onNavigate = vi.fn();
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-target",
        name: "目标历史会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        messages_count: 3,
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
        projectId: "project-1",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[title="目标历史会话"]')
        ?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "claw",
        projectId: "project-1",
        initialSessionId: "session-target",
      }),
    );
  });

  it("claw 页面不应再外露左侧工作台一级入口", async () => {
    const onNavigate = vi.fn();
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        messages_count: 3,
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
        initialSessionId: "session-current",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    expect(container.querySelector('button[aria-label="工作台"]')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("生成页不应再展示旧的侧栏生成入口", async () => {
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.querySelector('button[aria-label="生成"]')).toBeNull();
  });
});
