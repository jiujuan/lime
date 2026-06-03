import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  clickButton,
  createMockAgentChatUnifiedState,
  flushEffects,
  getIndexTestMocks,
  installMockAgentChatUnifiedState,
  type MockInputbarSendProps,
  mountPage,
  observedWorkspaceIds,
  renderPage,
  sharedSendMessageMock,
  sharedSwitchTopicMock,
  sharedTriggerAIGuideMock,
  WORKSPACE_HARNESS_TITLE,
} from "./index.testFixtures";

const {
  mockInputbar,
  mockSkillsGetAll,
  mockSkillsGetLocal,
  mockUseAgentChatUnified,
} = getIndexTestMocks();

describe("AgentChatPage 通用工作台", { timeout: 20_000 }, () => {
  it("用户手动关闭真实 Team 画布后，同一轮后续成员更新不应再次抢焦点", async () => {
    const runtimeState = {
      childSubagentSessions: [] as Array<{
        id: string;
        name: string;
        created_at: number;
        updated_at: number;
        session_type: "sub_agent";
        runtime_status: "running";
        task_summary: string;
        role_hint: string;
      }>,
    };

    localStorage.setItem(
      "lime.chat.team_selection.v1.general",
      JSON.stringify({
        id: "code-triage-team",
        source: "builtin",
      }),
    );
    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "kiro",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [],
          currentTurnId: null,
          turns: [],
          threadItems: [],
          todoItems: [],
          childSubagentSessions: runtimeState.childSubagentSessions,
          subagentParentContext: null,
          queuedTurns: [],
          isSending: false,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          resumeThread: vi.fn(async () => false),
          promoteQueuedTurn: vi.fn(async () => false),
          removeQueuedTurn: vi.fn(async () => false),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          pendingActions: [],
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-a",
              title: "话题 A",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-1",
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    const mounted = mountPage({
      projectId: "project-team-manual-open",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    let latestInputbarProps = mockInputbar.mock.calls.at(-1)?.[0] as
      | MockInputbarSendProps
      | undefined;

    act(() => {
      latestInputbarProps?.onToolStatesChange?.({
        subagent: true,
      });
    });
    await flushEffects(8);

    latestInputbarProps = mockInputbar.mock.calls.at(-1)?.[0] as
      | MockInputbarSendProps
      | undefined;

    act(() => {
      void latestInputbarProps?.onSend?.({
        images: [],
        textOverride:
          "请组织一个协作团队推进这项修复，先分析根因、复现路径、边界风险，再分别落实修复与回归验证。",
      });
    });
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    runtimeState.childSubagentSessions = [
      {
        id: "child-1",
        name: "执行成员",
        created_at: Date.now(),
        updated_at: Date.now(),
        session_type: "sub_agent",
        runtime_status: "running",
        task_summary: "继续执行修复任务",
        role_hint: "executor",
      },
    ];
    mounted.rerender();
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    clickButton(mounted.container, "toggle-canvas");
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    clickButton(mounted.container, "toggle-canvas");
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    runtimeState.childSubagentSessions = [
      ...runtimeState.childSubagentSessions,
      {
        id: "child-2",
        name: "分析成员",
        created_at: Date.now(),
        updated_at: Date.now(),
        session_type: "sub_agent",
        runtime_status: "running",
        task_summary: "补充定位根因",
        role_hint: "explorer",
      },
    ];
    mounted.rerender();
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
  });

  it("同一会话首次出现真实 Team 成员时，仍应保持聊天态，等待用户手动打开画布", async () => {
    const runtimeState = {
      childSubagentSessions: [] as Array<{
        id: string;
        name: string;
        created_at: number;
        updated_at: number;
        session_type: "sub_agent";
        runtime_status: "running";
        task_summary: string;
        role_hint: string;
      }>,
    };

    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "kiro",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [],
          currentTurnId: null,
          turns: [],
          threadItems: [],
          todoItems: [],
          childSubagentSessions: runtimeState.childSubagentSessions,
          subagentParentContext: null,
          queuedTurns: [],
          isSending: false,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          resumeThread: vi.fn(async () => false),
          promoteQueuedTurn: vi.fn(async () => false),
          removeQueuedTurn: vi.fn(async () => false),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          pendingActions: [],
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-a",
              title: "话题 A",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-1",
          createFreshSession: vi.fn(async () => undefined),
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          updateTopicSnapshot: vi.fn(),
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    const mounted = mountPage({
      projectId: "project-team-real-graph",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    runtimeState.childSubagentSessions = [
      {
        id: "child-1",
        name: "分析成员",
        created_at: 1_710_000_000,
        updated_at: 1_710_000_100,
        session_type: "sub_agent",
        runtime_status: "running",
        task_summary: "分析问题边界",
        role_hint: "explorer",
      },
    ];

    mounted.rerender();
    await flushEffects(10);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
  });

  it("仅有已选 Team 偏好时，顶部展开仍可手动打开画布，且不会凭空展示协作 dock", async () => {
    localStorage.setItem(
      "lime.chat.team_selection.v1.general",
      JSON.stringify({
        id: "code-triage-team",
        source: "builtin",
      }),
    );

    const mounted = mountPage({
      projectId: "project-team-manual-canvas-open",
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    let latestInputbarProps = mockInputbar.mock.calls.at(-1)?.[0] as
      | MockInputbarSendProps
      | undefined;

    act(() => {
      latestInputbarProps?.onToolStatesChange?.({
        subagent: true,
      });
    });
    await flushEffects(8);

    latestInputbarProps = mockInputbar.mock.calls.at(-1)?.[0] as
      | MockInputbarSendProps
      | undefined;

    act(() => {
      void latestInputbarProps?.onSend?.({
        images: [],
        textOverride: "请组织一个协作团队推进这项修复",
      });
    });
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    clickButton(mounted.container, "toggle-canvas");
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");
    expect(
      mounted.container.querySelector(
        '[data-testid="canvas-workbench-layout-mock"]',
      ),
    ).not.toBeNull();

    clickButton(mounted.container, "toggle-canvas");
    await flushEffects(8);

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    expect(
      mounted.container.querySelector(
        '[data-testid="team-workspace-dock-activate"]',
      ),
    ).toBeNull();
  });

  it("已安装 skills 但未显式激活时，通用工作台不应展示技能区块", async () => {
    mockSkillsGetAll.mockResolvedValue([
      {
        key: "research",
        name: "Research",
        description: "检索与整理",
        directory: "research",
        installed: true,
        sourceKind: "builtin",
      },
    ]);
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        isSending: true,
      }),
    );

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    expect(mockSkillsGetLocal).toHaveBeenCalledWith("lime");

    clickButton(container, "toggle-harness");
    await flushEffects();

    expect(document.body.textContent).toContain(WORKSPACE_HARNESS_TITLE);
    expect(document.body.textContent).not.toContain("已激活技能");
    expect(
      document.body.querySelector('button[aria-label="跳转到已激活技能"]'),
    ).toBeNull();
  });

  it("用户消息显式触发 slash skill 后，通用工作台应展示已激活技能", async () => {
    mockSkillsGetAll.mockResolvedValue([
      {
        key: "research",
        name: "Research",
        description: "检索与整理",
        directory: "research",
        installed: true,
        sourceKind: "builtin",
      },
    ]);
    mockUseAgentChatUnified.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) => {
        observedWorkspaceIds.push(workspaceId);
        return {
          providerType: "kiro",
          setProviderType: vi.fn(),
          model: "mock-model",
          setModel: vi.fn(),
          executionStrategy: "react",
          setExecutionStrategy: vi.fn(),
          messages: [
            {
              id: "msg-skill-1",
              role: "user",
              content: "/research 帮我整理当前主题",
            },
          ],
          isSending: true,
          sendMessage: sharedSendMessageMock,
          stopSending: vi.fn(async () => undefined),
          clearMessages: vi.fn(),
          deleteMessage: vi.fn(),
          editMessage: vi.fn(),
          handlePermissionResponse: vi.fn(),
          triggerAIGuide: sharedTriggerAIGuideMock,
          topics: [
            {
              id: "topic-a",
              title: "话题 A",
              updatedAt: Date.now(),
            },
          ],
          sessionId: "session-1",
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
        };
      },
    );

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects(10);

    clickButton(container, "toggle-harness");
    await flushEffects();

    expect(document.body.textContent).toContain("已激活技能");
    expect(document.body.textContent).toContain("research");
  });

});
