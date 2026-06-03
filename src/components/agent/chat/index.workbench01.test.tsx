import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  clickButton,
  createMockAgentChatUnifiedState,
  createMockThemeContextWorkspaceState,
  createProject,
  flushEffects,
  GENERAL_ASSISTANT_TITLE,
  getIndexTestMocks,
  getSendMessageCall,
  installMockAgentChatUnifiedState,
  type MockInputbarSendPayload,
  type MockInputbarSendProps,
  mountPage,
  renderPage,
  sharedSendMessageMock,
  waitForElement,
  WORKSPACE_HARNESS_DESCRIPTION,
  WORKSPACE_HARNESS_TITLE,
} from "./index.testFixtures";

const {
  mockCanvasWorkbenchLayout,
  mockCanvasWorkbenchLayoutState,
  mockEmptyState,
  mockGetAgentRuntimeToolInventory,
  mockGetProject,
  mockInputbar,
  mockIsSpecializedWorkbenchTheme,
  mockMessageList,
  mockUseDeveloperFeatureFlags,
  mockUseThemeContextWorkspace,
} = getIndexTestMocks();

describe("AgentChatPage 通用工作台", { timeout: 20_000 }, () => {
  it("空白新建任务首页应保留浏览器式工作区顶栏与新对话标签", async () => {
    const container = renderPage({
      agentEntry: "new-task",
      showChatPanel: false,
      theme: "general",
      projectId: "project-home",
    });
    await flushEffects(10);

    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;

    expect(navbar?.dataset.contextVariant).toBe("task-center");
    expect(navbar?.dataset.showHarnessToggle).toBe("false");
    expect(navbar?.dataset.showSettingsButton).toBe("false");
    expect(navbar?.dataset.showContextCompactionAction).toBe("false");
    expect(
      container.querySelector('[data-testid="task-center-tab-strip"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="task-center-tab-new-task-home"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="task-center-tab-close-new-task-home"]',
      ),
    ).toBeNull();
    expect(container.textContent).toContain("新对话");
    expect(
      container.querySelector('[data-testid="toggle-harness"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="toggle-settings"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
  });

  it("空白新建任务发送后应立即展示轻量对话预览", async () => {
    type MockEmptyStateProps = {
      input?: string;
      setInput?: (value: string) => void;
      onSend?: (payload?: MockInputbarSendPayload) => void;
    };
    mockEmptyState.mockImplementation((props?: MockEmptyStateProps) => (
      <div data-testid="empty-state" data-input={props?.input || ""}>
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
          onClick={() =>
            props?.onSend?.({ textOverride: props.input || "你好" })
          }
        >
          发送
        </button>
      </div>
    ));
    sharedSendMessageMock.mockImplementationOnce(
      () => new Promise<void>(() => undefined),
    );
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        sessionId: null,
        topics: [],
      }),
    );

    const mounted = mountPage({
      agentEntry: "new-task",
      showChatPanel: false,
      theme: "general",
      projectId: "project-home",
    });
    await flushEffects();

    expect(
      await waitForElement(
        mounted.container,
        '[data-testid="mock-empty-type"]',
      ),
    ).not.toBeNull();
    clickButton(mounted.container, "mock-empty-type");
    await flushEffects(1);
    clickButton(mounted.container, "mock-empty-send");

    const latestMessageListProps = mockMessageList.mock.calls.at(-1)?.[0] as
      | { messages?: Array<{ content?: string; role?: string }> }
      | undefined;
    expect(
      mounted.container.querySelector('[data-testid="message-list"]'),
    ).not.toBeNull();
    expect(latestMessageListProps?.messages?.[0]).toMatchObject({
      content: "你好",
      role: "user",
    });
    expect(latestMessageListProps?.messages?.[1]).toMatchObject({
      role: "assistant",
    });
  });

  it("空白新建任务发送派发完成但真实消息未接管前应继续保留轻量预览", async () => {
    type MockEmptyStateProps = {
      input?: string;
      setInput?: (value: string) => void;
      onSend?: (payload?: MockInputbarSendPayload) => void;
    };
    mockEmptyState.mockImplementation((props?: MockEmptyStateProps) => (
      <div data-testid="empty-state" data-input={props?.input || ""}>
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
          onClick={() =>
            props?.onSend?.({ textOverride: props.input || "你好" })
          }
        >
          发送
        </button>
      </div>
    ));
    sharedSendMessageMock.mockResolvedValueOnce(undefined);
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        sessionId: null,
        topics: [],
      }),
    );

    const mounted = mountPage({
      agentEntry: "new-task",
      showChatPanel: false,
      theme: "general",
      projectId: "project-home",
    });
    await flushEffects();

    expect(
      await waitForElement(
        mounted.container,
        '[data-testid="mock-empty-type"]',
      ),
    ).not.toBeNull();
    clickButton(mounted.container, "mock-empty-type");
    await flushEffects(1);
    clickButton(mounted.container, "mock-empty-send");
    await flushEffects(12);
    mounted.rerender();
    await flushEffects(4);

    expect(
      mounted.container.querySelector('[data-testid="empty-state"]'),
    ).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="message-list"]'),
    ).not.toBeNull();
    const latestMessageListProps = mockMessageList.mock.calls.at(-1)?.[0] as
      | { messages?: Array<{ content?: string; role?: string }> }
      | undefined;
    expect(latestMessageListProps?.messages?.[0]).toMatchObject({
      content: "你好",
      role: "user",
    });
  });

  it("新建任务首页即使记住了文档项目也应保留真实首页", async () => {
    mockIsSpecializedWorkbenchTheme.mockImplementation(
      (theme?: string) => theme !== "general",
    );
    mockUseThemeContextWorkspace.mockImplementation(
      ({ activeTheme }: { activeTheme?: string }) =>
        createMockThemeContextWorkspaceState({
          enabled: activeTheme !== "general",
        }),
    );
    mockGetProject.mockResolvedValue({
      ...createProject("project-document-home"),
      workspaceType: "general",
    });

    const container = renderPage({
      agentEntry: "new-task",
      projectId: "project-document-home",
      theme: "general",
    });
    await flushEffects(10);

    expect(
      container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-layout-mock"]'),
    ).toBeNull();
  });

  it("聊天态应通过顶栏按钮展开画布，并支持在展开后再次折叠", async () => {
    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;
    const toggleCanvasButton = container.querySelector(
      '[data-testid="toggle-canvas"]',
    ) as HTMLButtonElement | null;

    expect(navbar?.dataset.showCanvasToggle).toBe("true");
    expect(navbar?.dataset.canvasOpen).toBe("false");
    expect(toggleCanvasButton?.textContent).toContain("展开画布");
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    act(() => {
      toggleCanvasButton?.click();
    });
    await flushEffects();

    expect(
      (
        container.querySelector(
          '[data-testid="chat-navbar"]',
        ) as HTMLDivElement | null
      )?.dataset.canvasOpen,
    ).toBe("true");
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat-canvas");

    act(() => {
      (
        container.querySelector(
          '[data-testid="toggle-canvas"]',
        ) as HTMLButtonElement | null
      )?.click();
    });
    await flushEffects();

    expect(
      (
        container.querySelector(
          '[data-testid="chat-navbar"]',
        ) as HTMLDivElement | null
      )?.dataset.canvasOpen,
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
  });

  it("普通画布应将工作台触发按钮并入头部工具栏，避免覆盖关闭区", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    clickButton(container, "toggle-canvas");
    await flushEffects(4);

    const toolbar = container.querySelector(
      '[data-testid="general-canvas-toolbar"]',
    ) as HTMLDivElement | null;
    const triggers = container.querySelectorAll(
      '[data-testid="stacked-workbench-trigger"]',
    );

    expect(
      container.querySelector('[data-testid="general-canvas"]'),
    ).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(triggers).toHaveLength(1);
    expect(
      toolbar?.querySelector('[data-testid="stacked-workbench-trigger"]'),
    ).not.toBeNull();
  });

  it("通用模式空闲时应保留顶部 Harness 入口", async () => {
    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;
    expect(navbar?.dataset.showHarnessToggle).toBe("true");
    expect(navbar?.dataset.harnessToggleLabel).toBe("Harness");
    expect(document.body.textContent).not.toContain(WORKSPACE_HARNESS_TITLE);
    expect(document.body.textContent).not.toContain(GENERAL_ASSISTANT_TITLE);

    clickButton(container, "toggle-harness");
    await flushEffects();

    expect(document.body.textContent).toContain(WORKSPACE_HARNESS_TITLE);
    expect(document.body.textContent).toContain(GENERAL_ASSISTANT_TITLE);
  });

  it("通用模式有处理活动时应通过顶部 Harness 按钮打开弹窗，而不是常驻右侧占位", async () => {
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        isSending: true,
      }),
    );

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;
    expect(navbar?.dataset.showHarnessToggle).toBe("true");
    expect(navbar?.dataset.harnessToggleLabel).toBe("Harness");
    expect(document.body.textContent).not.toContain(WORKSPACE_HARNESS_TITLE);
    expect(document.body.textContent).not.toContain(GENERAL_ASSISTANT_TITLE);

    clickButton(container, "toggle-harness");
    await flushEffects();

    expect(document.body.textContent).toContain(WORKSPACE_HARNESS_TITLE);
    expect(document.body.textContent).toContain(GENERAL_ASSISTANT_TITLE);
    expect(document.body.textContent).toContain(WORKSPACE_HARNESS_DESCRIPTION);
  });

  it("处理工作台调试信息开关关闭时仍应保留入口，但不触发工具库存读取", async () => {
    mockUseDeveloperFeatureFlags.mockReturnValue({
      workspaceHarnessEnabled: false,
    });

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    const navbar = container.querySelector(
      '[data-testid="chat-navbar"]',
    ) as HTMLDivElement | null;
    expect(navbar?.dataset.showHarnessToggle).toBe("true");
    expect(navbar?.dataset.harnessToggleLabel).toBe("Harness");
    expect(document.body.textContent).not.toContain(WORKSPACE_HARNESS_TITLE);
    expect(mockGetAgentRuntimeToolInventory).not.toHaveBeenCalled();

    clickButton(container, "toggle-harness");
    await flushEffects();

    expect(document.body.textContent).toContain(WORKSPACE_HARNESS_TITLE);
    expect(mockGetAgentRuntimeToolInventory).not.toHaveBeenCalled();
  });

  it("窄屏工作台在手动展开侧栏后切到 stacked 时应自动收起，恢复 split 也不应自动重开", async () => {
    mockCanvasWorkbenchLayoutState.renderPreview = true;

    const container = renderPage({
      theme: "general",
      lockTheme: true,
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    clickButton(container, "toggle-history");
    await flushEffects();

    expect(
      container.querySelector('[data-testid="chat-sidebar"]'),
    ).not.toBeNull();

    clickButton(container, "toggle-canvas");
    await flushEffects(4);

    const getWorkbenchProps = () =>
      (mockCanvasWorkbenchLayout.mock.calls.at(-1)?.[0] || null) as {
        onLayoutModeChange?: (mode: "split" | "stacked") => void;
      } | null;

    expect(
      container.querySelector('[data-testid="canvas-workbench-layout-mock"]'),
    ).not.toBeNull();

    act(() => {
      getWorkbenchProps()?.onLayoutModeChange?.("stacked");
    });
    await flushEffects(4);

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    act(() => {
      getWorkbenchProps()?.onLayoutModeChange?.("split");
    });
    await flushEffects(4);

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();
  });

  it("发送时不再先调用本地 Team 规划模型，而是直接发送并透传已选 Team 约束", async () => {
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        executionStrategy: "react",
      }),
    );
    localStorage.setItem(
      "lime.chat.team_selection.v1.general",
      JSON.stringify({
        id: "code-triage-team",
        source: "builtin",
      }),
    );

    const mounted = mountPage({
      projectId: "project-team-runtime",
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
        textOverride: "请帮我拆解并推进这个修复任务",
      });
    });
    await flushEffects(8);

    expect(sharedSendMessageMock).toHaveBeenCalledTimes(1);
    const sendCall = getSendMessageCall();
    expect(sendCall.content).toBe("请帮我拆解并推进这个修复任务");
    expect(sendCall.images).toEqual([]);
    expect(sendCall.webSearch).toBeUndefined();
    expect(sendCall.thinking).toBeUndefined();
    expect(sendCall.skipUserMessage).toBe(false);
    expect(sendCall.executionStrategy).toBe("react");
    expect(sendCall.modelOverride).toBeUndefined();
    expect(sendCall.autoContinue).toBeUndefined();
    const sendOptions = sendCall.options;
    expect(sendOptions?.requestMetadata?.harness).toMatchObject({
      preferred_team_preset_id: "code-triage-team",
      selected_team_id: "code-triage-team",
      selected_team_source: "builtin",
      selected_team_label: "代码排障团队",
      selected_team_roles: expect.arrayContaining([
        expect.objectContaining({
          id: "explorer",
          label: "分析",
          profile_id: "code-explorer",
        }),
        expect.objectContaining({
          id: "executor",
          label: "执行",
          profile_id: "code-executor",
        }),
      ]),
    });
    expect(
      sendOptions?.requestMetadata?.harness?.turn_team_decision,
    ).toBeUndefined();
    expect(
      sendOptions?.requestMetadata?.harness?.turn_team_blueprint,
    ).toBeUndefined();
    expect(sendOptions?.assistantDraft).toBeUndefined();

    expect(
      mounted.container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");
    const formedRuntimeDock = mounted.container.querySelector(
      '[data-testid="team-workspace-dock"]',
    );
    if (formedRuntimeDock) {
      expect(formedRuntimeDock.getAttribute("data-runtime-status")).not.toBe(
        "forming",
      );
    }
  });

});
