import { describe, expect, it, vi } from "vitest";
import {
  clickButton,
  createProject,
  flushEffects,
  getHookCallOrderForWorkspace,
  getIndexTestMocks,
  mountPage,
  observedWorkspaceIds,
  renderPage,
} from "./index.testFixtures";
import { notifyTaskCenterTaskOpen } from "./taskCenterDraftTaskEvents";

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

    renderPage();
    await flushEffects();

    expect(
      notifyTaskCenterTaskOpen({
        sessionId: "topic-a",
        source: "conversation_shelf",
      }),
    ).toBe(true);
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(switchTopicMock).toHaveBeenCalledWith("topic-a");

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

    renderPage({ projectId: "locked-project" });
    await flushEffects();

    expect(
      notifyTaskCenterTaskOpen({
        sessionId: "topic-a",
        source: "conversation_shelf",
      }),
    ).toBe(true);
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(switchTopicMock).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      "该任务绑定了其他项目，请先切换到对应项目",
    );
    expect(mockGetOrCreateDefaultProject).not.toHaveBeenCalled();
  });

  it("无可用项目时应自动创建默认项目并继续切换话题", async () => {
    mockGetProject.mockResolvedValue(null);
    mockGetDefaultProject.mockResolvedValue(null);
    mockGetOrCreateDefaultProject.mockResolvedValue(
      createProject("default-new"),
    );

    renderPage();
    await flushEffects();

    expect(
      notifyTaskCenterTaskOpen({
        sessionId: "topic-a",
        source: "conversation_shelf",
      }),
    ).toBe(true);
    await flushEffects();

    const switchTopicMock = mockUseAgentChatUnified.mock.results[0]?.value
      ?.switchTopic as ReturnType<typeof vi.fn>;
    expect(mockGetOrCreateDefaultProject).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(
      "未找到可用项目，已自动创建默认项目",
    );
    expect(switchTopicMock).toHaveBeenCalledWith("topic-a");

    const workspaceHookOrder = getHookCallOrderForWorkspace("default-new");
    const switchTopicOrder = switchTopicMock.mock.invocationCallOrder[0];
    expect(workspaceHookOrder).toBeLessThan(switchTopicOrder);
  });

  it("默认工作区别名应在进入页面时归一为真实项目 ID", async () => {
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

    expect(mockGetOrCreateDefaultProject).toHaveBeenCalledTimes(1);
    expect(mockEnsureWorkspaceReady).toHaveBeenCalledWith(
      "project-default-real",
    );
    expect(observedWorkspaceIds).not.toContain("default");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-default-real",
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

  it("本地记忆项目不存在时不应把 stale 项目 ID 传给 Agent runtime", async () => {
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

    renderPage({ agentEntry: "new-task", showChatPanel: false });
    await flushEffects();

    expect(mockGetProject).toHaveBeenCalledWith("workspace-1");
    expect(mockGetOrCreateDefaultProject).toHaveBeenCalledTimes(1);
    expect(observedWorkspaceIds).not.toContain("workspace-1");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-default-real",
    );
  });

  it("存在 newChatAt 时手动选项目不应被重置", async () => {
    const container = renderPage({ newChatAt: 1234567890 });
    await flushEffects();

    clickButton(container, "set-project");
    await flushEffects();

    expect(observedWorkspaceIds).toContain("project-manual");
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-manual",
    );
  });

  it("收到首页新会话请求时应保留当前工作区上下文", async () => {
    const mounted = mountPage();
    await flushEffects();

    clickButton(mounted.container, "set-project");
    await flushEffects();
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-manual",
    );

    mounted.rerender({ newChatAt: 2233445566 });

    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-manual",
    );

    await flushEffects();
    expect(observedWorkspaceIds[observedWorkspaceIds.length - 1]).toBe(
      "project-manual",
    );
  });
});
