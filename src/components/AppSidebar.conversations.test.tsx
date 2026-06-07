import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppSidebar,
  act,
  cleanupAppSidebarTest,
  clickConversationMenuItem,
  flushEffects,
  mockDeleteAgentRuntimeSession,
  mockListAgentRuntimeSessions,
  mockRecordAgentUiPerformanceMetric,
  mockScheduleMinimumDelayIdleTask,
  mockToastSuccess,
  mockUpdateAgentRuntimeSession,
  mountSidebar,
  mountSidebarContainer,
  openConversationMenu,
  resetAppSidebarTest,
} from "./AppSidebar.testFixtures";
import type { AgentPageParams } from "./AppSidebar.testFixtures";

describe("AppSidebar conversations", () => {
  beforeEach(resetAppSidebarTest);
  afterEach(cleanupAppSidebarTest);

  it("任务中心内悬停已有会话不应再触发旧会话预取", async () => {
    vi.useFakeTimers();
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-prefetch",
        name: "可预取历史会话",
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
      });
      await flushEffects(2);

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[title="可预取历史会话"]')
          ?.focus();
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(920);
      });

      expect(mockRecordAgentUiPerformanceMetric).not.toHaveBeenCalledWith(
        "sidebar.conversation.prefetchFired",
        expect.anything(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("点击已有会话时不应再触发旧会话预取抢占切换链路", async () => {
    vi.useFakeTimers();
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-click",
        name: "立即打开历史会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        messages_count: 3,
      },
    ]);

    try {
      const onNavigate = vi.fn();
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

      const button = container.querySelector<HTMLButtonElement>(
        'button[title="立即打开历史会话"]',
      );

      await act(async () => {
        button?.focus();
        button?.click();
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(mockRecordAgentUiPerformanceMetric).not.toHaveBeenCalledWith(
        "sidebar.conversation.prefetchFired",
        expect.anything(),
      );
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("一级导航下方应继续展示最近对话与归档，记忆项目不应作为 App Server 过滤参数", async () => {
    localStorage.setItem(
      "agent_last_project_id",
      JSON.stringify("stale-project"),
    );
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: {
        archivedOnly?: boolean;
        includeArchived?: boolean;
        limit?: number;
        workspaceId?: string;
      }) =>
        options?.archivedOnly
          ? [
              {
                id: "session-archived",
                name: "归档会话",
                created_at: 1713000000,
                updated_at: 1713000600,
                archived_at: 1713003600,
                workspace_id: "project-1",
              },
            ]
          : [
              {
                id: "session-recent",
                name: "最近会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
              },
            ],
    );

    const container = mountSidebarContainer({
      currentPage: "settings",
    });
    await flushEffects(2);

    expect(container.textContent).toContain("最近对话");
    expect(container.textContent).toContain("归档");
    expect(container.textContent).toContain("最近会话");
    expect(container.textContent).not.toContain("归档会话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
    });
    expect(mockRecordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "appSidebar.recentConversations.loadBreakdown",
      expect.objectContaining({
        limit: 11,
        sessionsCount: 1,
        workspaceId: null,
      }),
    );

    const mainNav = container.querySelector(
      '[data-testid="app-sidebar-main-nav"]',
    );
    const conversationShelf = container.querySelector(
      '[data-testid="app-sidebar-conversation-shelf"]',
    );
    const recentConversationList = container.querySelector(
      '[data-testid="app-sidebar-recent-conversations"]',
    );
    const archivedToggle = conversationShelf?.querySelector(
      'button[aria-expanded="false"]',
    ) as HTMLButtonElement | null;

    expect(mainNav).not.toBeNull();
    expect(conversationShelf).not.toBeNull();
    expect(recentConversationList).not.toBeNull();
    expect(getComputedStyle(recentConversationList as Element).overflowY).toBe(
      "auto",
    );
    expect(archivedToggle).not.toBeNull();
    expect(
      Boolean(
        mainNav &&
        conversationShelf &&
        (mainNav.compareDocumentPosition(conversationShelf) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ),
    ).toBe(true);

    await act(async () => {
      archivedToggle?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    const archivedConversationList = container.querySelector(
      '[data-testid="app-sidebar-archived-conversations"]',
    );
    expect(archivedConversationList).not.toBeNull();
    expect(container.textContent).toContain("归档会话");
    expect(
      getComputedStyle(archivedConversationList as Element).overflowY,
    ).toBe("auto");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      archivedOnly: true,
      limit: 9,
    });
  });

  it("最近对话不应把运行时错误包络展示成会话标题", async () => {
    localStorage.setItem("agent_last_project_id", JSON.stringify("project-1"));
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-provider-error",
        name: "Ran into this erro...",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: "project-1",
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "settings",
    });
    await flushEffects(2);

    const recentConversationList = container.querySelector(
      '[data-testid="app-sidebar-recent-conversations"]',
    );

    expect(recentConversationList?.textContent).toContain("未命名对话");
    expect(recentConversationList?.textContent).not.toContain("Ran into");
  });

  it("最近对话和归档加载失败时不应让记忆项目污染 App Server 查询参数", async () => {
    localStorage.setItem("agent_last_project_id", JSON.stringify("project-1"));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: {
        archivedOnly?: boolean;
        includeArchived?: boolean;
        limit?: number;
        workspaceId?: string;
      }) => {
        throw new Error(
          options?.archivedOnly ? "archived failed" : "recent failed",
        );
      },
    );

    try {
      const container = mountSidebarContainer({
        currentPage: "settings",
      });
      await flushEffects(3);

      const recentConversationList = container.querySelector(
        '[data-testid="app-sidebar-recent-conversations"]',
      );
      expect(recentConversationList?.textContent).not.toContain("正在加载对话");
      expect(recentConversationList?.textContent).toContain("还没有开始对话");
      expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
        limit: 11,
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
          ?.click();
        await Promise.resolve();
      });
      await flushEffects(3);

      const archivedConversationList = container.querySelector(
        '[data-testid="app-sidebar-archived-conversations"]',
      );
      expect(archivedConversationList?.textContent).not.toContain(
        "正在加载归档",
      );
      expect(archivedConversationList?.textContent).toContain("暂无归档内容");
      expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
        archivedOnly: true,
        limit: 9,
      });
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("没有当前工作区时不应加载全局最近对话", async () => {
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("最近对话");
    expect(container.textContent).toContain("还没有开始对话");
    expect(mockListAgentRuntimeSessions).not.toHaveBeenCalled();
  });

  it("窗口重新聚焦时应低优先级刷新会话列表", async () => {
    localStorage.setItem("agent_last_project_id", JSON.stringify("project-1"));
    const cancelFocusRefresh = vi.fn();
    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      task();
      return cancelFocusRefresh;
    });

    mountSidebarContainer({
      currentPage: "settings",
    });
    await flushEffects(2);
    mockScheduleMinimumDelayIdleTask.mockClear();
    mockListAgentRuntimeSessions.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mockScheduleMinimumDelayIdleTask).toHaveBeenCalledTimes(1);
    expect(mockScheduleMinimumDelayIdleTask).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        minimumDelayMs: expect.any(Number),
        idleTimeoutMs: expect.any(Number),
      }),
    );
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
    });
  });

  it("最近对话应限制初始渲染数量，并保留当前会话可见", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => {
        const order = index + 1;
        return {
          id: `session-${order}`,
          name: `会话 ${order}`,
          created_at: 1714000000 - order,
          updated_at: 1714000600 - order,
          archived_at: null,
          workspace_id: "project-1",
        };
      }),
    );

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
        initialSessionId: "session-25",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.querySelector('button[title="会话 1"]')).not.toBeNull();
    expect(container.querySelector('button[title="会话 25"]')).not.toBeNull();
    expect(container.querySelector('button[title="会话 24"]')).toBeNull();
    expect(container.textContent).toContain("查看更多对话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      workspaceId: "project-1",
    });

    const targetButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("查看更多对话"),
    );

    expect(targetButton).not.toBeUndefined();

    await act(async () => {
      (targetButton as HTMLButtonElement | undefined)?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(container.querySelector('button[title="会话 19"]')).not.toBeNull();
  });

  it("切换人物或项目上下文时不应把已有最近对话重置成加载态", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: null,
      },
    ]);

    const mounted = mountSidebar({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(mounted.container.textContent).toContain("最近会话");
    expect(mounted.container.textContent).not.toContain("正在加载对话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      workspaceId: "project-1",
    });

    await act(async () => {
      mounted.root.render(
        <AppSidebar
          currentPage="agent"
          currentPageParams={
            {
              agentEntry: "claw",
              projectId: "project-2",
            } as AgentPageParams
          }
          onNavigate={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mounted.container.textContent).toContain("最近会话");
    expect(mounted.container.textContent).not.toContain("正在加载对话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(2);
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      workspaceId: "project-2",
    });
  });

  it("打开已有会话时若导航已有缓存任务，不应立即刷新最近对话列表", async () => {
    const scheduledTasks: Array<() => void> = [];
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-current",
        name: "最近会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        messages_count: 3,
      },
    ]);

    const mounted = mountSidebar({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);

    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      scheduledTasks.push(task);
      return () => undefined;
    });

    act(() => {
      mounted.root.render(
        <AppSidebar
          currentPage="agent"
          currentPageParams={
            {
              agentEntry: "claw",
              projectId: "project-1",
              initialSessionId: "session-current",
            } as AgentPageParams
          }
          onNavigate={vi.fn()}
        />,
      );
    });
    await flushEffects(2);

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(scheduledTasks).toHaveLength(1);

    await act(async () => {
      scheduledTasks[0]?.();
      await Promise.resolve();
    });

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(2);
    expect(mockListAgentRuntimeSessions).toHaveBeenLastCalledWith({
      limit: 11,
      workspaceId: "project-1",
    });
  });

  it("点击会话菜单归档动作时应走统一 session update 命令", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: "project-1",
      },
    ]);

    mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    const menu = await openConversationMenu("最近会话");
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("重命名");
    expect(menu?.textContent).toContain("收藏");
    expect(menu?.textContent).toContain("归档");
    expect(menu?.textContent).toContain("多选");
    expect(menu?.textContent).toContain("删除");
    const archiveMenuItem = document.body.querySelector<HTMLElement>(
      '[data-testid="app-sidebar-conversation-menu-archive"]',
    );
    expect(archiveMenuItem).not.toBeNull();
    expect(getComputedStyle(archiveMenuItem as Element).fontSize).toBe("13px");
    expect(getComputedStyle(archiveMenuItem as Element).minHeight).toBe("36px");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      workspaceId: "project-1",
    });

    await clickConversationMenuItem("app-sidebar-conversation-menu-archive");

    expect(mockUpdateAgentRuntimeSession).toHaveBeenCalledWith({
      session_id: "session-recent",
      archived: true,
    });
  });

  it("归档会话菜单应展示恢复动作并走统一 session update 命令", async () => {
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: {
        archivedOnly?: boolean;
        includeArchived?: boolean;
        limit?: number;
        workspaceId?: string;
      }) =>
        options?.archivedOnly
          ? [
              {
                id: "session-archived",
                name: "归档会话",
                created_at: 1713000000,
                updated_at: 1713000600,
                archived_at: 1713003600,
                workspace_id: "project-1",
              },
            ]
          : [],
    );

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
        ?.click();
      await Promise.resolve();
    });
    await flushEffects(2);

    const menu = await openConversationMenu("归档会话");
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("重命名");
    expect(menu?.textContent).toContain("收藏");
    expect(menu?.textContent).toContain("恢复");
    expect(menu?.textContent).toContain("多选");
    expect(menu?.textContent).toContain("删除");
    expect(menu?.textContent).not.toContain("归档");

    await clickConversationMenuItem("app-sidebar-conversation-menu-archive");

    expect(mockUpdateAgentRuntimeSession).toHaveBeenCalledWith({
      session_id: "session-archived",
      archived: false,
    });
  });

  it("会话菜单应支持重命名并同步更新 session 名称", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("重命名后的会话");
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: "project-1",
      },
    ]);

    mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    await openConversationMenu("最近会话");
    await clickConversationMenuItem("app-sidebar-conversation-menu-rename");
    await flushEffects(2);

    expect(window.prompt).toHaveBeenCalledWith("重命名对话", "最近会话");
    expect(mockUpdateAgentRuntimeSession).toHaveBeenCalledWith({
      session_id: "session-recent",
      name: "重命名后的会话",
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("已重命名对话");
  });

  it("会话菜单应支持删除并在执行前要求确认", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: "project-1",
      },
    ]);

    mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    await openConversationMenu("最近会话");
    await clickConversationMenuItem("app-sidebar-conversation-menu-delete");
    await flushEffects(2);

    expect(window.confirm).toHaveBeenCalledWith(
      "确定要删除“最近会话”吗？删除后无法恢复。",
    );
    expect(mockDeleteAgentRuntimeSession).toHaveBeenCalledWith(
      "session-recent",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("已删除对话");
  });

  it("会话菜单的收藏与多选应提供即时反馈", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
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

    await openConversationMenu("最近会话");
    await clickConversationMenuItem("app-sidebar-conversation-menu-favorite");

    expect(
      container.querySelector(
        '[data-testid="app-sidebar-conversation-favorite-badge"]',
      ),
    ).not.toBeNull();

    const favoriteMenu = await openConversationMenu("最近会话");
    expect(favoriteMenu?.textContent).toContain("取消收藏");

    await clickConversationMenuItem(
      "app-sidebar-conversation-menu-multiselect",
    );

    expect(
      container.querySelector(
        '[data-testid="app-sidebar-conversation-multiselect-toolbar"]',
      )?.textContent,
    ).toContain("已选择 1 个对话");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[title="最近会话"]')
        ?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector(
        '[data-testid="app-sidebar-conversation-multiselect-toolbar"]',
      )?.textContent,
    ).toContain("已选择 0 个对话");
  });
});
