import { act } from "react";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  flushEffects,
  mockGetDefaultProvider,
  mockInitAsterAgent,
  mockResolveClawWorkspaceProviderSelection,
  mockScheduleMinimumDelayIdleTask,
  mockSubmitAgentRuntimeTurn,
  mountHook,
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat 兼容接口 - guide / provider", () => {
  it("triggerAIGuide 应仅生成 assistant 占位消息", async () => {
    const harness = mountHook("ws-guide");

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().triggerAIGuide();
      });

      const value = harness.getValue();
      expect(value.messages).toHaveLength(1);
      expect(value.messages[0]?.role).toBe("assistant");
      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]).toMatchObject({
        message: "",
      });
    } finally {
      harness.unmount();
    }
  });

  it("triggerAIGuide 传入引导词时应发送该引导词", async () => {
    const harness = mountHook("ws-guide-social");
    const prompt = "请先确认社媒平台和目标受众。";

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().triggerAIGuide(prompt);
      });

      const value = harness.getValue();
      expect(value.messages).toHaveLength(1);
      expect(value.messages[0]?.role).toBe("assistant");
      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]).toMatchObject({
        message: prompt,
      });
    } finally {
      harness.unmount();
    }
  });

  it("发送请求时应透传 provider 偏好，避免 custom provider 类型丢失", async () => {
    const harness = mountHook("ws-provider-id");
    const providerId = "custom-a32774c6-6fd0-433b-8b81-e95340e08793";
    const model = "gpt-5.3-codex";

    try {
      await flushEffects();
      act(() => {
        harness.getValue().setProviderType(providerId);
        harness.getValue().setModel(model);
      });
      await flushEffects();

      await act(async () => {
        await harness.getValue().triggerAIGuide("检查 provider_id 透传");
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBe(providerId);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBe(model);
    } finally {
      harness.unmount();
    }
  });

  it("triggerAIGuide 应使用工作区已选模型发送请求", async () => {
    const workspaceId = "ws-guide-selected-model";
    const selectedProvider = "gemini";
    const selectedModel = "gemini-2.5-pro";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify(selectedProvider),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(selectedModel),
    );

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().triggerAIGuide("请输出一版社媒主稿");
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

  it("发送前应等待 runtime warmup 修复只有模型没有 provider 的工作区缓存", async () => {
    const workspaceId = "ws-guide-heal-model-only-cache";
    const selectedProvider = "openai";
    const selectedModel = "gpt-5.5";
    const scheduledTasks: Array<() => void> = [];
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(selectedModel),
    );
    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      scheduledTasks.push(task);
      return () => undefined;
    });
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: false,
    });
    mockGetDefaultProvider.mockResolvedValue(selectedProvider);
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: selectedProvider,
      model: selectedModel,
    });

    const harness = mountHook(workspaceId, {
      initialRuntimeWarmupLoadMode: "deferred",
      initialRuntimeWarmupDeferredDelayMs: 60_000,
    });

    try {
      await flushEffects();
      expect(scheduledTasks).toHaveLength(1);
      expect(mockInitAsterAgent).not.toHaveBeenCalled();

      await act(async () => {
        await harness.getValue().triggerAIGuide("分析这个文件夹");
      });

      expect(mockInitAsterAgent).toHaveBeenCalledTimes(1);
      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: selectedProvider,
        currentModel: selectedModel,
        theme: "general",
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

      await act(async () => {
        scheduledTasks.forEach((task) => task());
        await Promise.resolve();
      });

      expect(mockInitAsterAgent).toHaveBeenCalledTimes(1);
    } finally {
      harness.unmount();
    }
  });

  it("Agent 初始化未恢复 provider 配置时应自愈已缓存的失效 provider 选择", async () => {
    const workspaceId = "ws-init-heal-stale-provider";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify("anthropic"),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify("glm-5.1"),
    );
    mockInitAsterAgent.mockResolvedValue({
      initialized: true,
      provider_configured: false,
    });
    mockResolveClawWorkspaceProviderSelection.mockResolvedValue({
      providerType: "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
      model: "glm-5.1",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(mockGetDefaultProvider).not.toHaveBeenCalled();
      expect(mockResolveClawWorkspaceProviderSelection).toHaveBeenCalledWith({
        currentProviderType: "anthropic",
        currentModel: "glm-5.1",
        theme: "general",
      });
      expect(harness.getValue().providerType).toBe(
        "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
      );
      expect(harness.getValue().model).toBe("glm-5.1");
    } finally {
      harness.unmount();
    }
  });
});
