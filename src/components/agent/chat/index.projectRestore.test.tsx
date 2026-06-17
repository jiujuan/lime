import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentChatUnifiedState,
  createProject,
  flushEffects,
  getSendMessageCall,
  getHookCallOrderForWorkspace,
  getIndexTestMocks,
  installMockAgentChatUnifiedState,
  mountPage,
  observedWorkspaceIds,
  renderPage,
} from "./index.testFixtures";

const {
  mockEnsureWorkspaceReady,
  mockGetDefaultProject,
  mockGetOrCreateDefaultProject,
  mockGetProject,
  mockToast,
  mockUseAgentChatUnified,
} = getIndexTestMocks();

describe("AgentChatPage 话题切换项目恢复", () => {
  it("应先切换到话题绑定项目，再执行话题切换", async () => {
    localStorage.setItem(
      "agent_session_workspace_topic-a",
      JSON.stringify("project-topic"),
    );

    const mounted = mountPage();
    await flushEffects();

    mounted.rerender({ initialSessionId: "topic-a" });
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(switchTopicMock).toHaveBeenCalledWith("topic-a", expect.objectContaining({ allowDetachedSession: true }));

    const workspaceHookOrder = getHookCallOrderForWorkspace("project-topic");
    const switchTopicOrder = switchTopicMock.mock.invocationCallOrder[0];
    expect(workspaceHookOrder).toBeLessThan(switchTopicOrder);
    expect(observedWorkspaceIds).toContain("project-topic");
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("外部锁定项目与话题绑定冲突时应阻止切换并提示", async () => {
    localStorage.setItem(
      "agent_session_workspace_topic-a",
      JSON.stringify("topic-project"),
    );

    const mounted = mountPage({ projectId: "locked-project" });
    await flushEffects();

    mounted.rerender({ initialSessionId: "topic-a" });
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(switchTopicMock).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      "该任务绑定了其他项目，请先切换到对应项目",
    );
    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
  });

  it("无可用项目时不应自动创建默认项目或切换话题", async () => {
    mockGetProject.mockImplementation(async (projectId: string) => {
      if (projectId === "default-new") {
        return createProject("default-new");
      }
      return null;
    });
    mockGetDefaultProject.mockResolvedValue(null);
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("default-new"),
    );

    const mounted = mountPage();
    await flushEffects();

    mounted.rerender({ initialSessionId: "topic-a" });
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalledWith(
      "未找到可用项目，已自动创建默认项目",
    );
    expect(switchTopicMock).not.toHaveBeenCalledWith("topic-a", expect.objectContaining({ allowDetachedSession: true }));
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "",
    );
  });

  it("默认工作区别名没有最近项目时应保持未选择项目", async () => {
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("project-default-real"),
    );
    mockEnsureWorkspaceReady.mockResolvedValue({
      workspaceId: "project-default-real",
      rootPath: "/tmp/project-default-real",
      existed: true,
      created: false,
      repaired: false,
      relocated: false,
      previousRootPath: null,
      warning: null,
    });

    renderPage({ projectId: "default" });
    await flushEffects();

    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
    expect(mockEnsureWorkspaceReady).not.toHaveBeenCalledWith(
      "project-default-real",
    );
    expect(observedWorkspaceIds).not.toContain("default");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "",
    );
  });

  it("legacy workspace-default 入口应优先恢复最近项目，而不是继续走默认工作区", async () => {
    localStorage.setItem(
      "agent_last_project_id",
      JSON.stringify("project-remembered"),
    );
    mockEnsureWorkspaceReady.mockResolvedValue({
      workspaceId: "project-remembered",
      rootPath: "/tmp/project-remembered",
      existed: true,
      created: false,
      repaired: false,
      relocated: false,
      previousRootPath: null,
      warning: null,
    });

    renderPage({ projectId: "workspace-default" });
    await flushEffects();

    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
    expect(mockEnsureWorkspaceReady).toHaveBeenCalledWith("project-remembered");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-remembered",
    );
  });

  it("新建对话时不应读取 stale 最近项目或创建默认项目", async () => {
    localStorage.setItem(
      "agent_last_project_id",
      JSON.stringify("workspace-1"),
    );
    mockGetProject.mockImplementation(async (projectId: string) => {
      if (projectId === "workspace-1") {
        return null;
      }
      return createProject(projectId);
    });
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("project-default-real"),
    );
    mockEnsureWorkspaceReady.mockResolvedValue({
      workspaceId: "project-default-real",
      rootPath: "/tmp/project-default-real",
      existed: true,
      created: false,
      repaired: false,
      relocated: false,
      previousRootPath: null,
      warning: null,
    });

    renderPage({
      agentEntry: "new-task",
      showChatPanel: false,
      newChatAt: 1234567890,
    });
    await flushEffects();

    expect(mockGetProject).not.toHaveBeenCalledWith("workspace-1");
    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
    expect(observedWorkspaceIds).not.toContain("workspace-1");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "",
    );
  });

  it("临时 workspace 路径缺失时应切回默认工作区并自动重发", async () => {
    localStorage.setItem("agent_last_project_id", JSON.stringify("temp-ws"));
    mockGetProject.mockImplementation(async (projectId: string) => {
      if (projectId === "temp-ws") {
        return {
          ...createProject("temp-ws"),
          workspaceType: "temporary",
          rootPath: "/var/folders/lime-knowledge-product-e2e-stale",
        };
      }
      return createProject(projectId);
    });
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("project-default-real"),
    );
    mockEnsureWorkspaceReady.mockResolvedValue({
      workspaceId: "project-default-real",
      rootPath: "/tmp/project-default-real",
      existed: true,
      created: false,
      repaired: false,
      relocated: false,
      previousRootPath: null,
      warning: null,
    });
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        workspacePathMissing: {
          content: "只回答一个字：好",
          images: [],
        },
        dismissWorkspacePathError: vi.fn(),
      }),
    );

    renderPage();
    await flushEffects(6);

    expect(mockGetOrCreateDefaultProject).toHaveBeenCalledTimes(1);
    expect(mockEnsureWorkspaceReady).toHaveBeenCalledWith(
      "project-default-real",
    );
    expect(observedWorkspaceIds).toContain("temp-ws");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-default-real",
    );
    expect(getSendMessageCall().content).toBe("只回答一个字：好");
  });

  it("收到首页新会话请求时应清空当前工作区上下文", async () => {
    localStorage.setItem(
      "agent_last_project_id",
      JSON.stringify("project-manual"),
    );

    const mounted = mountPage();
    await flushEffects();

    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-manual",
    );

    mounted.rerender({ newChatAt: 2233445566 });

    await flushEffects();
    expect(observedWorkspaceIds).toContain("");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "",
    );
  });
});
