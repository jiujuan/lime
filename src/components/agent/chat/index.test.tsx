import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  clickButton,
  createMockAgentChatUnifiedState,
  FIXED_TOPIC_UPDATED_AT,
  flushEffects,
  getIndexTestMocks,
  getSendMessageCall,
  installMockAgentChatUnifiedState,
  type MockEmptyStateProps,
  mountPage,
  renderPage,
  sharedSendMessageMock,
  waitForElement,
} from "./index.testFixtures";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import { requestTaskCenterDraftTask } from "./taskCenterDraftTaskEvents";

const {
  mockEmptyState,
  mockGetProjectMemory,
  mockMessageList,
  mockSkillsGetLocal,
  mockUseAgentChatUnified,
} = getIndexTestMocks();

describe("AgentChatPage 任务中心初始会话标签", () => {
  it("顶部会话标签应支持重命名当前任务", async () => {
    const renameTopic = vi.fn(async () => undefined);
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
      renameTopic,
    });
    installMockAgentChatUnifiedState(state);
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("重命名后的会话");

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
    });
    await flushEffects();

    const renameButton = mounted.container.querySelector(
      '[data-testid="task-center-tab-rename-topic-current"]',
    ) as HTMLButtonElement | null;
    expect(renameButton).not.toBeNull();

    act(() => {
      renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushEffects();

    expect(promptSpy).toHaveBeenCalledWith(expect.any(String), "当前会话");
    expect(renameTopic).toHaveBeenCalledWith("topic-current", "重命名后的会话");
  });

  it("点击顶部加号应在任务中心新标签内嵌首页起手页", async () => {
    const onNavigate = vi.fn();
    vi.mocked(buildHomeAgentParams).mockClear();
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
        },
      ],
    });
    const createFreshSession = vi.fn(async () => {
      return "new-topic";
    });
    const clearMessages = vi.fn();
    state.createFreshSession = createFreshSession;
    state.clearMessages = clearMessages;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
      onNavigate,
    });
    const { container } = mounted;
    await flushEffects();

    expect(
      await waitForElement(
        container,
        '[data-testid="task-center-tab-create-button"]',
      ),
    ).not.toBeNull();
    clickButton(container, "task-center-tab-create-button");
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(createFreshSession).not.toHaveBeenCalled();
    expect(clearMessages).toHaveBeenCalledWith({ showToast: false });
    expect(buildHomeAgentParams).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="task-center-chrome-shell"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="task-center-tab-strip"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid^="task-center-tab-task-draft-"][data-active="true"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="chat-navbar"]'),
    ).not.toBeNull();
    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;
    expect(navbar?.dataset.showHarnessToggle).toBe("false");
    expect(navbar?.dataset.showSettingsButton).toBe("false");
    expect(navbar?.dataset.showContextCompactionAction).toBe("false");
    expect(
      container.querySelector('[data-testid="toggle-harness"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="toggle-settings"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="message-list"]')).toBeNull();
  });

  it("侧边栏新建任务事件应在任务中心内新增草稿标签，不跳出当前页面", async () => {
    const onNavigate = vi.fn();
    vi.mocked(buildHomeAgentParams).mockClear();
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
        },
      ],
    });
    const createFreshSession = vi.fn(async () => "new-topic");
    const clearMessages = vi.fn();
    state.createFreshSession = createFreshSession;
    state.clearMessages = clearMessages;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
      onNavigate,
    });
    const { container } = mounted;
    await flushEffects();

    expect(requestTaskCenterDraftTask({ source: "sidebar" })).toBe(true);
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(createFreshSession).not.toHaveBeenCalled();
    expect(clearMessages).toHaveBeenCalledWith({ showToast: false });
    expect(buildHomeAgentParams).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      container
        .querySelector('[data-testid^="task-center-tab-task-draft-"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="message-list"]')).toBeNull();
  });

  it("打开旧会话后草稿预热创建新对话时不应继承旧消息快照", async () => {
    mockEmptyState.mockImplementation((props?: MockEmptyStateProps) => (
      <div
        data-testid="empty-state"
        data-active-theme={props?.activeTheme || ""}
        data-input={props?.input || ""}
        data-session-id={props?.sessionId ?? ""}
      >
        {props?.activeTheme === "general" ? (
          <div data-testid="home-start-surface" />
        ) : null}
        <button
          type="button"
          data-testid="mock-empty-type"
          onClick={() => props?.setInput?.("新的独立对话")}
        >
          输入
        </button>
      </div>
    ));

    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      messages: [
        {
          id: "old-user",
          role: "user",
          content: "旧会话问题",
          timestamp: new Date(FIXED_TOPIC_UPDATED_AT),
        },
        {
          id: "old-assistant",
          role: "assistant",
          content: "旧会话回答",
          timestamp: new Date(FIXED_TOPIC_UPDATED_AT + 1_000),
        },
      ],
      topics: [
        {
          id: "topic-current",
          title: "旧会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    const createFreshSession = vi.fn(async () => "new-topic");
    const clearMessages = vi.fn();
    state.createFreshSession = createFreshSession;
    state.clearMessages = clearMessages;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
    });
    await flushEffects();

    expect(
      await waitForElement(
        mounted.container,
        '[data-testid="task-center-tab-create-button"]',
      ),
    ).not.toBeNull();
    mockMessageList.mockClear();
    clickButton(mounted.container, "task-center-tab-create-button");
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(mounted.container.textContent).not.toContain("旧会话问题");
    expect(mounted.container.textContent).not.toContain("旧会话回答");
    expect(clearMessages).toHaveBeenCalledWith({ showToast: false });
    expect(
      mounted.container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="home-start-surface"]'),
    ).not.toBeNull();
    const latestEmptyStateProps = mockEmptyState.mock.calls.at(-1)?.[0] as
      | MockEmptyStateProps
      | undefined;
    expect(latestEmptyStateProps?.activeTheme).toBe("general");
    expect(latestEmptyStateProps?.sessionId).toBeNull();

    clickButton(mounted.container, "mock-empty-type");
    await flushEffects(8);

    expect(createFreshSession).toHaveBeenCalledWith(
      "新对话",
      expect.objectContaining({
        preserveCurrentSnapshot: false,
      }),
    );
  });

  it("草稿标签输入后应预热创建会话，发送时复用同一次创建", async () => {
    const onNavigate = vi.fn();
    vi.mocked(buildHomeAgentParams).mockClear();
    mockEmptyState.mockImplementation((props?: MockEmptyStateProps) => (
      <div
        data-testid="empty-state"
        data-active-theme={props?.activeTheme || ""}
        data-input={props?.input || ""}
        data-session-id={props?.sessionId ?? ""}
      >
        {props?.activeTheme === "general" ? (
          <div data-testid="home-start-surface" />
        ) : null}
        <button
          type="button"
          data-testid="mock-empty-type"
          onClick={() => props?.setInput?.("你好")}
        >
          输入
        </button>
        <button
          type="button"
          data-testid="mock-empty-send"
          onClick={() => props?.onSend?.({ textOverride: "你好" })}
        >
          发送
        </button>
      </div>
    ));

    const creationController: { resolve?: () => void } = {};
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      isAutoRestoringSession: true,
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    const createFreshSession = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          creationController.resolve = () => {
            state.sessionId = "new-topic";
            state.topics = [
              {
                id: "new-topic",
                title: "新对话",
                updatedAt: new Date(FIXED_TOPIC_UPDATED_AT + 1_000),
                workspaceId: "workspace-test",
              },
              ...((state.topics as Array<Record<string, unknown>>) || []),
            ];
            resolve("new-topic");
          };
        }),
    );
    state.createFreshSession = createFreshSession;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
      onNavigate,
    });
    await flushEffects();

    expect(
      await waitForElement(
        mounted.container,
        '[data-testid="task-center-tab-create-button"]',
      ),
    ).not.toBeNull();
    mockMessageList.mockClear();
    clickButton(mounted.container, "task-center-tab-create-button");
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(
      mounted.container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="home-start-surface"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="message-list"]'),
    ).toBeNull();
    const latestEmptyStateProps = mockEmptyState.mock.calls.at(-1)?.[0] as
      | MockEmptyStateProps
      | undefined;
    expect(latestEmptyStateProps?.activeTheme).toBe("general");
    expect(latestEmptyStateProps?.sessionId).toBeNull();
    const latestDraftMessageListProps = mockMessageList.mock.calls.at(
      -1,
    )?.[0] as
      | {
          emptyStateVariant?: string;
          messages?: unknown[];
          sessionId?: string | null;
        }
      | undefined;
    if (latestDraftMessageListProps) {
      expect(latestDraftMessageListProps.emptyStateVariant).toBe("default");
      expect(latestDraftMessageListProps.messages).toEqual([]);
      expect(latestDraftMessageListProps.sessionId).toBeNull();
    }

    clickButton(mounted.container, "mock-empty-type");
    await flushEffects(8);
    expect(createFreshSession).toHaveBeenCalledTimes(1);

    clickButton(mounted.container, "mock-empty-send");
    await flushEffects(2);
    expect(createFreshSession).toHaveBeenCalledTimes(1);
    expect(sharedSendMessageMock).not.toHaveBeenCalled();
    expect(mounted.container.textContent).toContain("你好");
    expect(
      mounted.container.querySelector('[data-testid="empty-state"]'),
    ).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="message-list"]'),
    ).not.toBeNull();

    expect(creationController.resolve).toBeTruthy();
    creationController.resolve?.();
    await flushEffects(10);
    mounted.rerender();
    await flushEffects();

    expect(sharedSendMessageMock).toHaveBeenCalledTimes(1);
    expect(getSendMessageCall().content).toBe("你好");
    expect(
      (
        getSendMessageCall().options?.requestMetadata as
          | Record<string, Record<string, unknown>>
          | undefined
      )?.agentUiPerformanceTrace?.sessionId,
    ).toBe("new-topic");
    expect(createFreshSession).toHaveBeenCalledTimes(1);
    expect(mounted.container.textContent).not.toContain("正在恢复生成会话");
    expect(buildHomeAgentParams).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("从导航栏直达会话时应延后加载 topics，优先恢复目标会话详情", async () => {
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        sessionId: "topic-selected",
        topics: [
          {
            id: "topic-selected",
            title: "目标对话",
            updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          },
        ],
      }),
    );

    renderPage({
      agentEntry: "claw",
      initialSessionId: "topic-selected",
      projectId: "workspace-test",
    });
    await flushEffects(1);

    const workspaceCall = mockUseAgentChatUnified.mock.calls
      .map(
        (call) =>
          call[0] as {
            workspaceId?: string;
            initialTopicsLoadMode?: string;
            initialTopicsDeferredDelayMs?: number;
            initialRuntimeWarmupLoadMode?: string;
            initialRuntimeWarmupDeferredDelayMs?: number;
          },
      )
      .find((options) => options.workspaceId === "workspace-test");
    expect(workspaceCall?.initialTopicsLoadMode).toBe("deferred");
    expect(workspaceCall?.initialTopicsDeferredDelayMs).toBe(0);
    expect(workspaceCall?.initialRuntimeWarmupLoadMode).toBe("deferred");
    expect(workspaceCall?.initialRuntimeWarmupDeferredDelayMs).toBe(45_000);
    expect(mockSkillsGetLocal).not.toHaveBeenCalled();
    expect(mockGetProjectMemory).not.toHaveBeenCalled();
  });

});
