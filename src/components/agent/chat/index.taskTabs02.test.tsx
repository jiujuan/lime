import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  clickButton,
  createMockAgentChatUnifiedState,
  FIXED_TOPIC_UPDATED_AT,
  flushEffects,
  installMockAgentChatUnifiedState,
  mountPage,
} from "./index.testFixtures";
import { buildHomeAgentParams } from "@/lib/workspace/navigation";
import { notifyTaskCenterTaskOpen } from "./taskCenterDraftTaskEvents";
import { TASK_CENTER_OPEN_TAB_IDS_STORAGE_KEY } from "./utils/taskCenterTabs";

describe("AgentChatPage 任务中心初始会话标签", () => {
  it("切到另一条旧会话后仍应继续新增本地草稿标签", async () => {
    const onNavigate = vi.fn();
    vi.mocked(buildHomeAgentParams).mockClear();
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "旧会话 A",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT - 1_000),
          workspaceId: "workspace-test",
        },
        {
          id: "topic-next",
          title: "旧会话 B",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    state.createFreshSession = vi.fn(async () => "new-topic");
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
      onNavigate,
    });
    await flushEffects();

    clickButton(mounted.container, "task-center-tab-create-button");
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    const firstDraft = mounted.container.querySelector(
      '[data-testid^="task-center-tab-task-draft-"][data-active="true"]',
    );
    expect(firstDraft).not.toBeNull();

    state.sessionId = "topic-next";
    mounted.rerender({ initialSessionId: "topic-next" });
    await flushEffects();

    expect(
      mounted.container
        .querySelector('[data-testid="task-center-tab-topic-next"]')
        ?.getAttribute("data-active"),
    ).toBe("true");

    clickButton(mounted.container, "task-center-tab-create-button");
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    const activeDrafts = mounted.container.querySelectorAll(
      '[data-testid^="task-center-tab-task-draft-"][data-active="true"]',
    );
    expect(activeDrafts).toHaveLength(1);
    expect(state.createFreshSession).not.toHaveBeenCalled();
    expect(buildHomeAgentParams).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      mounted.container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="message-list"]'),
    ).toBeNull();
  });

  it("从任务中心侧栏切到非路由会话时，不应被初始路由抢回", async () => {
    let resolveSwitchTopic: (() => void) | null = null;
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT - 1_000),
          workspaceId: "workspace-test",
        },
        {
          id: "topic-a",
          title: "目标会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    const switchTopic = vi.fn(async (topicId: string) => {
      state.sessionId = topicId;
      return new Promise<void>((resolve) => {
        resolveSwitchTopic = resolve;
      });
    });
    state.switchTopic = switchTopic;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
    });
    await flushEffects();

    clickButton(mounted.container, "toggle-history");
    await flushEffects();

    clickButton(mounted.container, "switch-topic");
    mounted.rerender();
    await flushEffects();

    expect(switchTopic).toHaveBeenCalledWith("topic-a");
    expect(
      mounted.container
        .querySelector('[data-testid="task-center-tab-topic-a"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
    expect(
      mounted.container
        .querySelector('[data-testid="task-center-tab-topic-current"]')
        ?.getAttribute("data-active"),
    ).not.toBe("true");

    act(() => {
      resolveSwitchTopic?.();
    });
    await flushEffects();
  });

  it("外层侧边栏通知打开历史会话后，路由追平不应覆盖已有会话标签", async () => {
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      topics: [
        {
          id: "topic-current",
          title: "旧会话 A",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT - 1_000),
          workspaceId: "workspace-test",
        },
        {
          id: "topic-next",
          title: "旧会话 B",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    const switchTopic = vi.fn(async (topicId: string) => {
      state.sessionId = topicId;
    });
    state.switchTopic = switchTopic;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
    });
    await flushEffects();

    expect(
      notifyTaskCenterTaskOpen({
        sessionId: "topic-next",
        workspaceId: "workspace-test",
        source: "sidebar",
      }),
    ).toBe(true);
    await flushEffects();
    expect(switchTopic).toHaveBeenCalledWith("topic-next");

    mounted.rerender({
      initialSessionId: "topic-next",
    });
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(switchTopic).toHaveBeenCalledTimes(1);
    expect(
      mounted.container
        .querySelector('[data-testid="task-center-tab-topic-next"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
    expect(
      mounted.container.querySelector(
        '[data-testid="task-center-tab-topic-current"]',
      ),
    ).not.toBeNull();
    expect(
      JSON.parse(
        localStorage.getItem(TASK_CENTER_OPEN_TAB_IDS_STORAGE_KEY) ?? "{}",
      )["workspace-test"],
    ).toEqual(["topic-next", "topic-current"]);
  });

  it("打开历史会话时不应先清空当前消息再切换", async () => {
    const setMessages = vi.fn();
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: "topic-current",
      messages: [
        {
          id: "msg-current",
          role: "assistant",
          content: "当前会话已有内容",
          timestamp: new Date(FIXED_TOPIC_UPDATED_AT),
        },
      ],
      topics: [
        {
          id: "topic-current",
          title: "当前会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT - 1_000),
          workspaceId: "workspace-test",
        },
        {
          id: "topic-a",
          title: "历史会话",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
      setMessages,
    });
    const switchTopic = vi.fn(async (topicId: string) => {
      state.sessionId = topicId;
    });
    state.switchTopic = switchTopic;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "claw",
      initialSessionId: "topic-current",
      projectId: "workspace-test",
    });
    await flushEffects();

    clickButton(mounted.container, "toggle-history");
    await flushEffects();
    clickButton(mounted.container, "switch-topic");
    await flushEffects();

    expect(switchTopic).toHaveBeenNthCalledWith(1, "topic-a");
    expect(setMessages).not.toHaveBeenCalledWith([]);
  });

  it("new-task 首页收到外层侧栏打开历史会话时应立即切换会话", async () => {
    const state: Record<string, unknown> = createMockAgentChatUnifiedState({
      sessionId: null,
      topics: [
        {
          id: "topic-next",
          title: "旧会话 B",
          updatedAt: new Date(FIXED_TOPIC_UPDATED_AT),
          workspaceId: "workspace-test",
        },
      ],
    });
    const switchTopic = vi.fn(async (topicId: string) => {
      state.sessionId = topicId;
    });
    state.switchTopic = switchTopic;
    installMockAgentChatUnifiedState(state);

    const mounted = mountPage({
      agentEntry: "new-task",
      projectId: "workspace-test",
    });
    await flushEffects();

    expect(
      notifyTaskCenterTaskOpen({
        sessionId: "topic-next",
        workspaceId: "workspace-test",
        source: "sidebar",
      }),
    ).toBe(true);
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(switchTopic).toHaveBeenCalledWith("topic-next");
    expect(
      mounted.container
        .querySelector('[data-testid="task-center-tab-topic-next"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
  });

});
