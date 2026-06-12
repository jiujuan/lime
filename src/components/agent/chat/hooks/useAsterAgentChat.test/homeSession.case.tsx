import { act } from "react";
import {
  describe,
  expect,
  it
} from "vitest";
import {
  flushEffects,
  mockCreateAgentRuntimeSession,
  mockGetAgentRuntimeSession,
  mockGetDefaultProvider,
  mockInitAsterAgent,
  mockListAgentRuntimeSessions,
  mockResolveClawWorkspaceProviderSelection,
  mockScheduleMinimumDelayIdleTask,
  mockSubmitAgentRuntimeTurn,
  mockUpdateAgentRuntimeSession,
  mountHook,
  seedSession
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat 首页新会话", () => {
  it("无工作区时不应主动初始化 Agent", async () => {
    const harness = mountHook("");

    try {
      await flushEffects();

      expect(mockInitAsterAgent).not.toHaveBeenCalled();
      expect(mockListAgentRuntimeSessions).not.toHaveBeenCalled();
      expect(harness.getValue().processStatus.running).toBe(false);
      expect(harness.getValue().topics).toEqual([]);
    } finally {
      harness.unmount();
    }
  });

  it("clearMessages 后重新进入同工作区不应恢复旧话题", async () => {
    const workspaceId = "ws-home-clear";
    const sessionId = "session-home-clear";
    seedSession(workspaceId, sessionId);

    let harness = mountHook(workspaceId);

    try {
      await flushEffects();
      act(() => {
        harness.getValue().clearMessages({ showToast: false });
      });
      await flushEffects();

      expect(harness.getValue().sessionId).toBeNull();
      expect(harness.getValue().messages).toEqual([]);
      expect(
        sessionStorage.getItem(`aster_curr_sessionId_${workspaceId}`),
      ).toBe("null");
      expect(sessionStorage.getItem(`aster_messages_${workspaceId}`)).toBe(
        "[]",
      );
      expect(localStorage.getItem(`aster_last_sessionId_${workspaceId}`)).toBe(
        "null",
      );
    } finally {
      harness.unmount();
    }

    harness = mountHook(workspaceId);

    try {
      await flushEffects();
      expect(harness.getValue().sessionId).toBeNull();
      expect(harness.getValue().messages).toEqual([]);
    } finally {
      harness.unmount();
    }
  });

  it("加载话题时应后台预热 Agent，但不阻塞话题列表返回", async () => {
    const workspaceId = "ws-topic-lazy-init";
    const sessionId = "session-topic-lazy-init";
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: sessionId,
        name: "任务 C",
        created_at: 1700000020,
        updated_at: 1700000021,
        messages_count: 0,
        workspace_id: workspaceId,
      },
    ]);

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockInitAsterAgent).toHaveBeenCalledTimes(1);
      expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
      expect(mockListAgentRuntimeSessions).toHaveBeenNthCalledWith(1, {
        workspaceId,
        limit: 21,
      });
      expect(harness.getValue().topics.map((topic) => topic.id)).toEqual([
        sessionId,
      ]);
      expect(harness.getValue().processStatus.running).toBe(true);
    } finally {
      harness.unmount();
    }
  });

  it("Agent 初始化返回真实 provider/model 时应回填当前工作区选择", async () => {
    const workspaceId = "ws-init-runtime-model";
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: true,
      provider_name: "openai",
      model_name: "gpt-5.4-mini",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(harness.getValue().providerType).toBe("openai");
      expect(harness.getValue().model).toBe("gpt-5.4-mini");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_provider_${workspaceId}`) || "null",
        ),
      ).toBe("openai");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_model_${workspaceId}`) || "null",
        ),
      ).toBe("gpt-5.4-mini");
    } finally {
      harness.unmount();
    }
  });

  it("已有工作区模型偏好时预热不应被运行时默认模型覆盖", async () => {
    const workspaceId = "ws-init-keep-scoped-model";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify("openai"),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify("gpt-4o"),
    );
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: true,
      provider_name: "openai",
      model_name: "gpt-5.2-pro",
    });
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: "deepseek",
      model: "deepseek-v4-pro",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(harness.getValue().providerType).toBe("openai");
      expect(harness.getValue().model).toBe("gpt-4o");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_model_${workspaceId}`) || "null",
        ),
      ).toBe("gpt-4o");
      expect(mockResolveClawWorkspaceProviderSelection).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("已有有效工作区模型偏好时不应被 legacy init 默认 provider 清空", async () => {
    const workspaceId = "ws-init-retain-explicit-custom-model";
    const selectedProvider = "custom-230cb5bf-3419-4742-8148-e8222423541c";
    const selectedModel = "mimo-v2.5-pro";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify(selectedProvider),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(selectedModel),
    );
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: true,
      provider_name: "openai",
      provider_selector: "deepseek",
      model_name: "deepseek-v4-pro",
    });
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: selectedProvider,
      model: selectedModel,
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: selectedProvider,
        currentModel: selectedModel,
        theme: "general",
        allowProviderFallback: false,
      });
      expect(harness.getValue().providerType).toBe(selectedProvider);
      expect(harness.getValue().model).toBe(selectedModel);

      await act(async () => {
        await harness.getValue().triggerAIGuide("检查 Mimo provider 透传");
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBe(selectedProvider);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBe(selectedModel);
    } finally {
      harness.unmount();
    }
  });

  it("deferred 话题加载模式下应延后 Agent 预热，避免抢占首屏会话恢复", async () => {
    const scheduledTasks: Array<() => void> = [];
    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      scheduledTasks.push(task);
      return () => undefined;
    });

    mountHook("ws-test", {
      initialTopicsLoadMode: "deferred",
      initialTopicsDeferredDelayMs: 12_000,
    });
    await flushEffects();

    expect(mockInitAsterAgent).not.toHaveBeenCalled();
    expect(mockScheduleMinimumDelayIdleTask).toHaveBeenCalled();

    await act(async () => {
      scheduledTasks.forEach((task) => task());
      await Promise.resolve();
    });

    expect(mockInitAsterAgent).toHaveBeenCalledTimes(1);
  });

  it("最近对话可立即加载时仍可单独延后 Agent 预热", async () => {
    const scheduledTasks: Array<() => void> = [];
    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      scheduledTasks.push(task);
      return () => undefined;
    });

    mountHook("ws-test", {
      initialTopicsLoadMode: "immediate",
      initialRuntimeWarmupLoadMode: "deferred",
      initialRuntimeWarmupDeferredDelayMs: 45_000,
    });
    await flushEffects();

    expect(mockListAgentRuntimeSessions).toHaveBeenCalledTimes(1);
    expect(mockInitAsterAgent).not.toHaveBeenCalled();
    expect(mockScheduleMinimumDelayIdleTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      scheduledTasks.forEach((task) => task());
      await Promise.resolve();
    });

    expect(mockInitAsterAgent).toHaveBeenCalledTimes(1);
  });

  it("Agent 初始化返回 provider_selector 时应优先回填真实 provider 标识", async () => {
    const workspaceId = "ws-init-runtime-provider-selector";
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: true,
      provider_name: "anthropic",
      provider_selector: "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
      model_name: "glm-5.1",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(harness.getValue().providerType).toBe(
        "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
      );
      expect(harness.getValue().model).toBe("glm-5.1");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_provider_${workspaceId}`) || "null",
        ),
      ).toBe("custom-a32774c6-6fd0-433b-8b81-e95340e08793");
    } finally {
      harness.unmount();
    }
  });

  it("Agent 初始化返回 current provider 但无模型时不应回流旧 Provider 缓存", async () => {
    const workspaceId = "ws-init-current-provider-without-model";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify("deepseek"),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify("deepseek-v4-pro"),
    );
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: true,
      provider_name: "Lime Hub",
      provider_selector: "lime-hub",
    });
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue(null);

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockGetDefaultProvider).not.toHaveBeenCalled();
      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: "lime-hub",
        currentModel: null,
        theme: "general",
        allowProviderFallback: false,
      });
      expect(harness.getValue().providerType).toBe("lime-hub");
      expect(harness.getValue().model).toBe("");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_provider_${workspaceId}`) || "null",
        ),
      ).toBe("lime-hub");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_model_${workspaceId}`) || "null",
        ),
      ).toBe("");
    } finally {
      harness.unmount();
    }
  });

  it("Agent 初始化未返回模型时应回退到后端默认 provider 解析真实工作区模型", async () => {
    const workspaceId = "ws-init-fallback-runtime-model";
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: false,
    });
    mockGetDefaultProvider.mockResolvedValue("deepseek");
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: "openai",
      model: "gpt-5.4",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockGetDefaultProvider).toHaveBeenCalledTimes(1);
      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: "deepseek",
        currentModel: null,
        theme: "general",
      });
      expect(harness.getValue().providerType).toBe("openai");
      expect(harness.getValue().model).toBe("gpt-5.4");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_provider_${workspaceId}`) || "null",
        ),
      ).toBe("openai");
      expect(
        JSON.parse(
          localStorage.getItem(`agent_pref_model_${workspaceId}`) || "null",
        ),
      ).toBe("gpt-5.4");
    } finally {
      harness.unmount();
    }
  });

  it("已有工作区持久化偏好时应优先按当前偏好解析真实可用模型，不再读取默认 provider", async () => {
    const workspaceId = "ws-init-prefer-persisted-selection";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify("gemini"),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify("gemini-2.5-pro"),
    );
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: false,
    });
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: "gemini",
      model: "gemini-2.5-flash",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockGetDefaultProvider).not.toHaveBeenCalled();
      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: "gemini",
        currentModel: "gemini-2.5-pro",
        theme: "general",
      });
      expect(harness.getValue().providerType).toBe("gemini");
      expect(harness.getValue().model).toBe("gemini-2.5-flash");
    } finally {
      harness.unmount();
    }
  });

  it("话题列表暂时未返回当前执行会话时不应清空本地执行态", async () => {
    const workspaceId = "ws-topic-missing-active-session";
    mockCreateAgentRuntimeSession.mockResolvedValue("session-live-missing");
    mockListAgentRuntimeSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "session-existing",
          name: "既有任务",
          created_at: 1700000100,
          updated_at: 1700000101,
          messages_count: 2,
          workspace_id: workspaceId,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "session-existing",
          name: "既有任务",
          created_at: 1700000100,
          updated_at: 1700000101,
          messages_count: 2,
          workspace_id: workspaceId,
        },
      ]);
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "session-live-missing",
      name: "当前执行任务",
      created_at: 1700000200,
      updated_at: 1700000201,
      workspace_id: workspaceId,
      messages: [],
      turns: [],
      items: [],
      queued_turns: [],
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("继续执行当前任务", [], false, false, false, "react");
      });

      await flushEffects();
      await flushEffects();
      expect(mockGetAgentRuntimeSession).not.toHaveBeenCalledWith(
        "session-live-missing",
        { historyLimit: 40 },
      );

      await act(async () => {
        await harness.getValue().loadTopics();
      });
      await flushEffects();
      await flushEffects();

      expect(harness.getValue().sessionId).toBe("session-live-missing");
      expect(harness.getValue().messages.length).toBeGreaterThan(0);
      expect(
        harness
          .getValue()
          .topics.some((topic) => topic.id === "session-live-missing"),
      ).toBe(true);
      expect(mockUpdateAgentRuntimeSession).not.toHaveBeenCalledWith({
        session_id: "session-live-missing",
        provider_name: harness.getValue().providerType,
        model_name: harness.getValue().model,
      });
      expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith(
        "session-live-missing",
        { historyLimit: 40 },
      );
    } finally {
      harness.unmount();
    }
  });

  it("当前执行会话确认不存在后应清空失效执行态并恢复到有效会话", async () => {
    const workspaceId = "ws-topic-missing-not-found";
    const missingSessionId = "session-live-gone";
    const activeSessionId = "session-existing";

    mockCreateAgentRuntimeSession.mockResolvedValue(missingSessionId);
    mockListAgentRuntimeSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: activeSessionId,
          name: "既有任务",
          created_at: 1700000100,
          updated_at: 1700000101,
          messages_count: 1,
          workspace_id: workspaceId,
        },
      ])
      .mockResolvedValue([
        {
          id: activeSessionId,
          name: "既有任务",
          created_at: 1700000100,
          updated_at: 1700000101,
          messages_count: 1,
          workspace_id: workspaceId,
        },
      ]);
    mockGetAgentRuntimeSession.mockImplementation(async (sessionId: string) => {
      if (sessionId === missingSessionId) {
        throw new Error(`Session not found: ${missingSessionId}`);
      }

      return {
        id: activeSessionId,
        name: "既有任务",
        created_at: 1700000100,
        updated_at: 1700000101,
        workspace_id: workspaceId,
        messages: [],
        turns: [],
        items: [],
        queued_turns: [],
      };
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("继续执行当前任务", [], false, false, false, "react");
      });

      await flushEffects();
      await flushEffects();
      expect(mockGetAgentRuntimeSession).not.toHaveBeenCalledWith(
        missingSessionId,
        { historyLimit: 40 },
      );

      await act(async () => {
        await harness.getValue().loadTopics();
      });
      await flushEffects();
      await flushEffects();

      expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith(
        missingSessionId,
        { historyLimit: 40 },
      );
      expect(harness.getValue().sessionId).toBe(activeSessionId);
      expect(
        harness
          .getValue()
          .topics.some((topic) => topic.id === missingSessionId),
      ).toBe(false);
      expect(harness.getValue().messages).toHaveLength(0);
    } finally {
      harness.unmount();
    }
  });
});
