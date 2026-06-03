import { describe, expect, it, vi } from "vitest";
import {
  clickButton,
  createMockAgentChatUnifiedState,
  flushEffects,
  getIndexTestMocks,
  installMockAgentChatUnifiedState,
  mountPage,
  observedWorkspaceIds,
  renderPage,
  sharedSendMessageMock,
  sharedSwitchTopicMock,
  sharedTriggerAIGuideMock,
} from "./index.testFixtures";

const {
  mockUseAgentChatUnified,
} = getIndexTestMocks();

describe("AgentChatPage 侧栏显示控制", () => {
  it("Claw 模式有消息时默认收起侧栏，且切换项目不应意外展开", async () => {
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
          messages: [{ id: "msg-1", role: "user", content: "你好" }],
          isSending: false,
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

    const container = renderPage();
    await flushEffects();

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    clickButton(container, "set-project");
    await flushEffects();
    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();
  });

  it("锁定 general 主题进入 Claw 页面时也应默认收起左侧对话列表", async () => {
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
  });

  it("Claw 模式可通过顶栏手动展开侧栏", async () => {
    const container = renderPage();
    await flushEffects();

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    clickButton(container, "toggle-history");
    await flushEffects();
    expect(
      container.querySelector('[data-testid="chat-sidebar"]'),
    ).not.toBeNull();
  });

  it("重新进入新的 Claw 对话页时，不应沿用上一次手动展开的侧栏状态", async () => {
    const mounted = mountPage({
      theme: "general",
      lockTheme: true,
      contentId: "content-a",
    });
    await flushEffects();

    expect(
      mounted.container.querySelector('[data-testid="chat-sidebar"]'),
    ).toBeNull();

    clickButton(mounted.container, "toggle-history");
    await flushEffects();

    expect(
      mounted.container.querySelector('[data-testid="chat-sidebar"]'),
    ).not.toBeNull();

    mounted.rerender({
      contentId: "content-b",
    });
    await flushEffects();

    expect(
      mounted.container.querySelector('[data-testid="chat-sidebar"]'),
    ).toBeNull();
  });

  it("showChatPanel=false 时应保持侧栏隐藏", async () => {
    const consoleErrorSpy = vi.mocked(console.error);
    const container = renderPage({ showChatPanel: false });
    await flushEffects();

    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    clickButton(container, "toggle-history");
    await flushEffects();
    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0] ?? "").includes("Maximum update depth exceeded"),
      ),
    ).toBe(false);
  });

  it("new-task 执行态即使初始 showChatPanel=false 也应允许从顶栏展开对话侧栏", async () => {
    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        messages: [{ id: "msg-new-task", role: "user", content: "继续执行" }],
        isSending: true,
      }),
    );

    const container = renderPage({
      agentEntry: "new-task",
      showChatPanel: false,
      theme: "general",
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="toggle-harness"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-sidebar"]')).toBeNull();

    clickButton(container, "toggle-history");
    await flushEffects();

    expect(
      container.querySelector('[data-testid="chat-sidebar"]'),
    ).not.toBeNull();
  });

  it("Claw 模式无激活任务时应展示任务选择空态", async () => {
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
          isSending: false,
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
              title: "任务 A",
              updatedAt: Date.now(),
            },
          ],
          sessionId: null,
          switchTopic: sharedSwitchTopicMock,
          deleteTopic: vi.fn(),
          renameTopic: vi.fn(),
          pendingActions: [],
          workspacePathMissing: false,
          fixWorkspacePathAndRetry: vi.fn(),
          dismissWorkspacePathError: vi.fn(),
        };
      },
    );

    const container = renderPage({ agentEntry: "claw" });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="claw-empty-state"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="empty-state"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="message-list"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="inputbar"]')).not.toBeNull();
  });
});
