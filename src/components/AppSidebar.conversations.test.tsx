import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SidebarOpenedProjectSummary } from "@/components/app-sidebar/sidebarConversationGroups";
import {
  AppSidebar,
  TASK_CENTER_CREATE_DRAFT_TASK_EVENT,
  TASK_CENTER_OPEN_TASK_EVENT,
  act,
  cleanupAppSidebarTest,
  clickConversationMenuItem,
  flushEffects,
  mockDeleteAgentRuntimeSession,
  mockDeleteProject,
  mockEnsureProjectWorkspace,
  mockCreateProjectGitWorktree,
  mockGetProject,
  mockListAgentRuntimeSessions,
  mockRevealPathInFinder,
  mockRecordAgentUiPerformanceMetric,
  mockScheduleMinimumDelayIdleTask,
  mockToastSuccess,
  mockUpdateProject,
  mockUpdateAgentRuntimeSession,
  mountSidebar,
  mountSidebarContainer,
  openConversationMenu,
  openProjectMenu,
  resetAppSidebarTest,
} from "./AppSidebar.testFixtures";
import type { AgentPageParams } from "./AppSidebar.testFixtures";
import { useAppSidebarProjectActions } from "@/components/app-sidebar/useAppSidebarProjectActions";
import { AGENT_RUNTIME_SESSIONS_CHANGED_EVENT } from "@/lib/api/agentRuntime";

describe("AppSidebar conversations", () => {
  beforeEach(async () => {
    await resetAppSidebarTest();
    mockGetProject.mockImplementation(async (projectId: string) => ({
      id: projectId,
      name: projectId,
      rootPath: `/repo/${projectId}`,
      isFavorite: false,
    }));
  });
  afterEach(cleanupAppSidebarTest);

  type ProjectActions = ReturnType<typeof useAppSidebarProjectActions>;

  async function mountProjectActionsHarness(options?: {
    currentProjectId?: string | null;
  }) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const refreshSidebarSessions = vi.fn(async () => undefined);
    const onNavigate = vi.fn();
    const actionsRef: { current?: ProjectActions } = {};

    function Harness() {
      actionsRef.current = useAppSidebarProjectActions({
        currentProjectId: options?.currentProjectId ?? "project-1",
        onNavigate,
        refreshSidebarSessions,
      });
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    const mountedActions = actionsRef.current;
    if (!mountedActions) {
      throw new Error("Project actions harness did not mount");
    }

    return {
      actions: mountedActions,
      onNavigate,
      refreshSidebarSessions,
      cleanup: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  async function mountProjectMenuScenario() {
    mockGetProject.mockResolvedValue({
      id: "project-1",
      name: "示例项目",
      rootPath: "/repo/example",
      isFavorite: false,
    });
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: { limit?: number; cwd?: string | string[] }) =>
        options?.cwd === "/repo/example"
          ? [
              {
                id: "session-project",
                name: "项目内会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
                working_dir: "/repo/example",
              },
            ]
          : [],
    );

    const onNavigate = vi.fn();
    mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(3);

    return { onNavigate };
  }

  function captureTaskCenterDraftRequests() {
    const receivedDetails: unknown[] = [];
    const listener = (event: Event) => {
      receivedDetails.push(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      event.preventDefault();
    };
    window.addEventListener(TASK_CENTER_CREATE_DRAFT_TASK_EVENT, listener);

    return {
      receivedDetails,
      dispose: () => {
        window.removeEventListener(
          TASK_CENTER_CREATE_DRAFT_TASK_EVENT,
          listener,
        );
      },
    };
  }

  function captureTaskCenterOpenTaskRequests() {
    const receivedDetails: unknown[] = [];
    const listener = (event: Event) => {
      receivedDetails.push(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      event.preventDefault();
    };
    window.addEventListener(TASK_CENTER_OPEN_TASK_EVENT, listener);

    return {
      receivedDetails,
      dispose: () => {
        window.removeEventListener(TASK_CENTER_OPEN_TASK_EVENT, listener);
      },
    };
  }

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
        working_dir: "/repo/project-1",
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
        working_dir: "/repo/project-1",
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
      expect(onNavigate).toHaveBeenCalledWith(
        "agent",
        expect.objectContaining({
          agentEntry: "claw",
          projectId: "project-1",
          initialSessionId: "session-click",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("任务中心内点击项目会话应交给本地打开事件，不跳到最近对话壳", async () => {
    const taskCenterRequests = captureTaskCenterOpenTaskRequests();
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-click",
        name: "立即打开历史会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: "project-1",
        working_dir: "/repo/project-1",
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

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>('button[title="立即打开历史会话"]')
          ?.click();
        await Promise.resolve();
      });

      expect(taskCenterRequests.receivedDetails).toEqual([
        {
          sessionId: "session-click",
          workspaceId: "project-1",
          source: "sidebar",
        },
      ]);
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      taskCenterRequests.dispose();
    }
  });

  it("从项目会话切到无项目对话时不应继承当前项目 ID", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-standalone",
        name: "无项目历史对话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: null,
        workspace_id: null,
        messages_count: 2,
      },
    ]);

    const onNavigate = vi.fn();
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
        initialSessionId: "session-project-current",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    const button = container.querySelector<HTMLButtonElement>(
      'button[title="无项目历史对话"]',
    );

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "claw",
        initialSessionId: "session-standalone",
      }),
    );
    expect((onNavigate.mock.calls[0]?.[1] as AgentPageParams).projectId).toBe(
      undefined,
    );
  });

  it("一级导航下方只展示已打开项目和非项目对话，归档不再作为左侧分区加载", async () => {
    localStorage.setItem(
      "agent_last_project_id",
      JSON.stringify("stale-project"),
    );
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-standalone",
        name: "非项目会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: null,
      },
      {
        id: "session-hidden-project",
        name: "未打开项目会话",
        created_at: 1713900000,
        updated_at: 1713900600,
        archived_at: null,
        workspace_id: "project-hidden",
      },
      {
        id: "session-archived",
        name: "归档会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: 1713003600,
        workspace_id: null,
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "settings",
    });
    await flushEffects(2);

    expect(container.textContent).toContain("项目");
    expect(container.textContent).toContain("对话");
    expect(container.textContent).toContain("非项目会话");
    expect(container.textContent).not.toContain("未打开项目会话");
    expect(container.textContent).not.toContain("归档会话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
    });
    expect(mockListAgentRuntimeSessions).not.toHaveBeenCalledWith(
      expect.objectContaining({
        archivedOnly: true,
      }),
    );
    expect(mockRecordAgentUiPerformanceMetric).toHaveBeenCalledWith(
      "appSidebar.recentConversations.loadBreakdown",
      expect.objectContaining({
        limit: 11,
        projectCwds: [],
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

    expect(mainNav).not.toBeNull();
    expect(conversationShelf).not.toBeNull();
    expect(recentConversationList).not.toBeNull();
    expect(getComputedStyle(recentConversationList as Element).overflowY).toBe(
      "auto",
    );
    expect(
      conversationShelf?.querySelector(
        '[data-testid="app-sidebar-archived-conversations"]',
      ),
    ).toBeNull();
    expect(
      conversationShelf?.querySelector('button[aria-expanded="false"]'),
    ).toBeNull();
    expect(
      Boolean(
        mainNav &&
        conversationShelf &&
        (mainNav.compareDocumentPosition(conversationShelf) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ),
    ).toBe(true);
  });

  it("点击项目标题行应折叠并重新展开项目下的对话列表", async () => {
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: { limit?: number; cwd?: string | string[] }) =>
        options?.cwd === "/repo/project-1"
          ? [
              {
                id: "session-project",
                name: "项目内会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
                working_dir: "/repo/project-1",
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

    const projectGroup = container.querySelector<HTMLElement>(
      '[data-testid="app-sidebar-project-conversation-group"]',
    );
    const projectButton = projectGroup?.querySelector<HTMLButtonElement>(
      'button[title="project-1"]',
    );

    expect(projectGroup).not.toBeNull();
    expect(projectButton).not.toBeNull();
    expect(projectButton?.getAttribute("aria-expanded")).toBe("true");
    expect(projectGroup?.textContent).toContain("项目内会话");

    await act(async () => {
      projectButton?.click();
      await Promise.resolve();
    });

    expect(projectButton?.getAttribute("aria-expanded")).toBe("false");
    expect(projectGroup?.textContent).toContain("project-1");
    expect(projectGroup?.textContent).not.toContain("项目内会话");

    await act(async () => {
      projectButton?.click();
      await Promise.resolve();
    });

    expect(projectButton?.getAttribute("aria-expanded")).toBe("true");
    expect(projectGroup?.textContent).toContain("项目内会话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      cwd: "/repo/project-1",
    });
  });

  it("项目标题行应提供项目菜单", async () => {
    await mountProjectMenuScenario();

    const menu = await openProjectMenu("示例项目");
    expect(menu?.textContent).toContain("置顶项目");
    expect(menu?.textContent).toContain("显示位置");
    expect(menu?.textContent).toContain("创建永久工作树");
    expect(menu?.textContent).toContain("重命名项目");
    expect(menu?.textContent).not.toContain("归档对话");
    expect(menu?.textContent).toContain("移除");
  });

  it("项目菜单应支持置顶项目", async () => {
    await mountProjectMenuScenario();

    await openProjectMenu("示例项目");
    await clickConversationMenuItem("app-sidebar-project-menu-pin");
    await flushEffects(1);

    expect(mockUpdateProject).toHaveBeenCalledWith("project-1", {
      isFavorite: true,
    });
  });

  it("项目菜单应支持显示项目位置", async () => {
    await mountProjectMenuScenario();

    await openProjectMenu("示例项目");
    await clickConversationMenuItem("app-sidebar-project-menu-reveal");

    expect(mockRevealPathInFinder).toHaveBeenCalledWith("/repo/example");
  });

  it("项目动作应支持创建永久工作树", async () => {
    mockCreateProjectGitWorktree.mockResolvedValue({
      worktreePath: "/repo/example-worktree",
      branch: "main",
      status: {
        rootPath: "/repo/example",
        hasGitRepository: true,
        currentBranch: "main",
        branches: ["main"],
        uncommittedFileCount: 0,
      },
    });
    mockEnsureProjectWorkspace.mockResolvedValue({
      id: "project-worktree",
      name: "example-worktree",
      rootPath: "/repo/example-worktree",
      workspaceType: "general",
    });
    const harness = await mountProjectActionsHarness();
    const project: SidebarOpenedProjectSummary = {
      id: "project-1",
      name: "示例项目",
      rootPath: "/repo/example",
      isFavorite: false,
    };

    try {
      await act(async () => {
        await harness.actions.handleCreateProjectWorktree(project);
      });

      expect(mockCreateProjectGitWorktree).toHaveBeenCalledWith(
        "/repo/example",
      );
      expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
        name: "example-worktree",
        rootPath: "/repo/example-worktree",
        workspaceType: "general",
      });
      expect(harness.onNavigate).toHaveBeenCalledWith("agent", {
        agentEntry: "claw",
        projectId: "project-worktree",
      });
    } finally {
      harness.cleanup();
    }
  });

  it("项目动作应支持重命名项目", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("重命名项目");
    const harness = await mountProjectActionsHarness();
    const project: SidebarOpenedProjectSummary = {
      id: "project-1",
      name: "示例项目",
      rootPath: "/repo/example",
      isFavorite: false,
    };

    try {
      await act(async () => {
        await harness.actions.handleRenameProject(project);
      });

      expect(window.prompt).toHaveBeenCalledWith("重命名项目", "示例项目");
      expect(mockUpdateProject).toHaveBeenCalledWith("project-1", {
        name: "重命名项目",
      });
      expect(harness.refreshSidebarSessions).toHaveBeenCalledTimes(1);
    } finally {
      harness.cleanup();
    }
  });

  it("项目菜单应支持移除项目记录", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await mountProjectMenuScenario();

    await openProjectMenu("示例项目");
    await clickConversationMenuItem("app-sidebar-project-menu-remove");
    await flushEffects(1);

    expect(window.confirm).toHaveBeenCalledWith(
      "确定要移除“示例项目”吗？本地目录不会被删除，后续仍可重新打开。",
    );
    expect(mockDeleteProject).toHaveBeenCalledWith("project-1", false);
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
        workspace_id: null,
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

  it("对话加载失败时不应让记忆项目污染 App Server 查询参数", async () => {
    localStorage.setItem("agent_last_project_id", JSON.stringify("project-1"));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockListAgentRuntimeSessions.mockImplementation(
      async (_options?: {
        includeArchived?: boolean;
        limit?: number;
        workspaceId?: string;
      }) => {
        throw new Error("recent failed");
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
      expect(recentConversationList?.textContent).toContain("暂无聊天");
      expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
        limit: 11,
      });
      expect(mockListAgentRuntimeSessions).not.toHaveBeenCalledWith(
        expect.objectContaining({
          archivedOnly: true,
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("没有当前工作区时应加载全局非项目对话", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-standalone",
        name: "全局对话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: null,
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(container.textContent).toContain("对话");
    expect(container.textContent).toContain("全局对话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
    });
  });

  it("新任务首页空侧栏应短 idle 加载最近对话", async () => {
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
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-new-task",
        name: "Claw fixture 会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: null,
      },
    ]);

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
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
    });
    expect(container.textContent).toContain("Claw fixture 会话");
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

  it("会话列表变更事件应立即刷新最近对话", async () => {
    mockListAgentRuntimeSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "session-external",
          name: "外部创建的会话",
          created_at: 1714000000,
          updated_at: 1714000600,
          archived_at: null,
          workspace_id: null,
        },
      ]);

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "new-task",
      } as AgentPageParams,
    });
    await flushEffects(2);
    mockListAgentRuntimeSessions.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(AGENT_RUNTIME_SESSIONS_CHANGED_EVENT, {
          detail: {
            reason: "external",
            sessionId: "session-external",
          },
        }),
      );
      await Promise.resolve();
    });
    await flushEffects(2);

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
    });
    expect(container.textContent).toContain("外部创建的会话");
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
          working_dir: "/repo/project-1",
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
      cwd: "/repo/project-1",
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
        workspace_id: "project-1",
        working_dir: "/repo/project-1",
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
      cwd: "/repo/project-1",
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

    expect(mounted.container.textContent).not.toContain("最近会话");
    expect(mounted.container.textContent).toContain("暂无聊天");
    expect(mounted.container.textContent).not.toContain("正在加载对话");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(2);
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      cwd: "/repo/project-2",
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
        working_dir: "/repo/project-1",
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
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      cwd: "/repo/project-1",
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
        working_dir: "/repo/project-1",
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
    expect(menu?.textContent).not.toContain("多选");
    expect(menu?.textContent).toContain("删除");
    const archiveMenuItem = document.body.querySelector<HTMLElement>(
      '[data-testid="app-sidebar-conversation-menu-archive"]',
    );
    expect(archiveMenuItem).not.toBeNull();
    expect(getComputedStyle(archiveMenuItem as Element).fontSize).toBe("13px");
    expect(getComputedStyle(archiveMenuItem as Element).minHeight).toBe("36px");
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      cwd: "/repo/project-1",
    });

    await clickConversationMenuItem("app-sidebar-conversation-menu-archive");

    expect(mockUpdateAgentRuntimeSession).toHaveBeenCalledWith({
      session_id: "session-recent",
      archived: true,
    });
  });

  it("项目上下文只展示项目会话，对话区保留新建入口", async () => {
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: { limit?: number; cwd?: string | string[] }) =>
        options?.cwd === "/repo/project-1"
          ? [
              {
                id: "session-project",
                name: "项目内会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
                working_dir: "/repo/project-1",
              },
            ]
          : [
              {
                id: "session-standalone",
                name: "独立会话",
                created_at: 1713900000,
                updated_at: 1713900600,
                archived_at: null,
                workspace_id: null,
              },
            ],
    );

    const onNavigate = vi.fn();
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    const shelf = container.querySelector(
      '[data-testid="app-sidebar-conversation-shelf"]',
    );
    const projectSection = container.querySelector(
      '[data-testid="app-sidebar-project-conversations"]',
    );
    const conversationSection = container.querySelector(
      '[data-testid="app-sidebar-recent-conversations"]',
    );
    const projectMenuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-project-menu-button"]',
    );
    const newConversationButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-sidebar-new-conversation-button"]',
    );

    expect(shelf?.textContent).toContain("项目");
    expect(shelf?.textContent).toContain("对话");
    expect(projectSection?.textContent).toContain("项目内会话");
    expect(conversationSection?.textContent).not.toContain("独立会话");
    expect(mockListAgentRuntimeSessions).not.toHaveBeenCalledWith({
      limit: 11,
    });
    expect(mockListAgentRuntimeSessions).toHaveBeenCalledWith({
      limit: 11,
      cwd: "/repo/project-1",
    });
    expect(projectMenuButton).not.toBeNull();
    expect(newConversationButton).not.toBeNull();
  });

  it("项目上下文里的顶部新建任务应显式创建项目内对话", async () => {
    const taskCenterRequests = captureTaskCenterDraftRequests();

    try {
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
          .querySelector<HTMLButtonElement>(
            '[data-testid="app-sidebar-nav-home-general"]',
          )
          ?.click();
        await Promise.resolve();
      });

      expect(taskCenterRequests.receivedDetails).toEqual([
        { source: "sidebar", projectId: "project-1" },
      ]);
    } finally {
      taskCenterRequests.dispose();
    }
  });

  it("项目上下文里的对话加号应显式创建无项目对话", async () => {
    const taskCenterRequests = captureTaskCenterDraftRequests();

    try {
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
          .querySelector<HTMLButtonElement>(
            '[data-testid="app-sidebar-new-conversation-button"]',
          )
          ?.click();
        await Promise.resolve();
      });

      expect(taskCenterRequests.receivedDetails).toEqual([
        { source: "sidebar", projectId: null },
      ]);
    } finally {
      taskCenterRequests.dispose();
    }
  });

  it("任务中心不可拦截时，对话加号 fallback 也不应继承当前项目 ID", async () => {
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: { limit?: number; cwd?: string | string[] }) =>
        options?.cwd === "/repo/project-1"
          ? [
              {
                id: "session-project",
                name: "项目内会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
                working_dir: "/repo/project-1",
              },
            ]
          : [],
    );

    const onNavigate = vi.fn();
    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
      onNavigate,
    });
    await flushEffects(2);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-new-conversation-button"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        agentEntry: "new-task",
      }),
    );
    expect((onNavigate.mock.calls[0]?.[1] as AgentPageParams).projectId).toBe(
      undefined,
    );
  });

  it("项目分组的新建对话入口应显式创建项目内对话", async () => {
    const taskCenterRequests = captureTaskCenterDraftRequests();

    try {
      await mountProjectMenuScenario();
      const projectNewConversationButton =
        document.body.querySelector<HTMLButtonElement>(
          '[data-testid="app-sidebar-project-new-conversation"]',
        );

      await act(async () => {
        projectNewConversationButton?.click();
        await Promise.resolve();
      });

      expect(taskCenterRequests.receivedDetails).toEqual([
        { source: "sidebar", projectId: "project-1" },
      ]);
    } finally {
      taskCenterRequests.dispose();
    }
  });

  it("侧边栏不再暴露旧区块菜单、多选和批量归档入口", async () => {
    mockListAgentRuntimeSessions.mockImplementation(
      async (options?: { limit?: number; cwd?: string | string[] }) =>
        options?.cwd === "/repo/project-1"
          ? [
              {
                id: "session-project",
                name: "项目内会话",
                created_at: 1714000000,
                updated_at: 1714000600,
                archived_at: null,
                workspace_id: "project-1",
                working_dir: "/repo/project-1",
              },
            ]
          : [
              {
                id: "session-standalone",
                name: "独立会话",
                created_at: 1713900000,
                updated_at: 1713900600,
                archived_at: null,
                workspace_id: null,
              },
            ],
    );

    const container = mountSidebarContainer({
      currentPage: "agent",
      currentPageParams: {
        agentEntry: "claw",
        projectId: "project-1",
      } as AgentPageParams,
    });
    await flushEffects(2);

    expect(
      container.querySelector(
        '[data-testid="app-sidebar-projects-shelf-menu-button"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="app-sidebar-conversations-shelf-menu-button"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="app-sidebar-conversation-shelf-menu-archive-all"]',
      ),
    ).toBeNull();

    expect(container.textContent).not.toContain("独立会话");
    expect(await openConversationMenu("独立会话")).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="app-sidebar-conversation-menu-multiselect"]',
      ),
    ).toBeNull();
    expect(mockUpdateAgentRuntimeSession).not.toHaveBeenCalled();
  });

  it("归档会话不应出现在左侧导航恢复菜单中", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-archived",
        name: "归档会话",
        created_at: 1713000000,
        updated_at: 1713000600,
        archived_at: 1713003600,
        workspace_id: "project-1",
        working_dir: "/repo/project-1",
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

    expect(container.textContent).not.toContain("归档会话");
    expect(
      container.querySelector(
        '[data-testid="app-sidebar-archived-conversations"]',
      ),
    ).toBeNull();
    expect(mockListAgentRuntimeSessions).not.toHaveBeenCalledWith(
      expect.objectContaining({
        archivedOnly: true,
      }),
    );
    expect(await openConversationMenu("归档会话")).toBeNull();
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
        working_dir: "/repo/project-1",
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
        working_dir: "/repo/project-1",
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

  it("会话菜单收藏应提供即时反馈", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-recent",
        name: "最近会话",
        created_at: 1714000000,
        updated_at: 1714000600,
        archived_at: null,
        workspace_id: "project-1",
        working_dir: "/repo/project-1",
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
    expect(
      container.querySelector(
        '[data-testid="app-sidebar-conversation-multiselect-toolbar"]',
      ),
    ).toBeNull();
  });
});
