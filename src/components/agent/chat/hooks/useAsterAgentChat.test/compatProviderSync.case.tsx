import { act } from "react";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  flushEffects,
  mockGetAgentRuntimeSession,
  mockScheduleMinimumDelayIdleTask,
  mockSubmitAgentRuntimeTurn,
  mockUpdateAgentRuntimeSession,
  mountHook,
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat 兼容接口 - provider sync", () => {
  it("已有 executionRuntime 且 provider/model 未变化时不应重复提交偏好", async () => {
    const workspaceId = "ws-runtime-model-reuse";
    const selectedProvider = "openai";
    const selectedModel = "gpt-5.4-mini";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify(selectedProvider),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(selectedModel),
    );
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "topic-runtime-model-reuse",
      created_at: Date.now(),
      updated_at: Date.now(),
      execution_strategy: "react",
      execution_runtime: {
        session_id: "topic-runtime-model-reuse",
        provider_selector: selectedProvider,
        provider_name: "openai",
        model_name: selectedModel,
        source: "session",
      },
      messages: [],
      turns: [],
      items: [],
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic("topic-runtime-model-reuse");
      });

      await act(async () => {
        await harness
          .getValue()
          .sendMessage(
            "继续沿用当前模型处理",
            [],
            false,
            false,
            false,
            "react",
          );
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBeUndefined();
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBeUndefined();
    } finally {
      harness.unmount();
    }
  });

  it("同 provider 切模型且 session 已同步时不应重复提交 model 偏好", async () => {
    const workspaceId = "ws-runtime-model-switch-same-provider";
    const selectedProvider = "openai";
    const currentModel = "gpt-5.4-mini";
    const nextModel = "gpt-5.4";
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify(selectedProvider),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(currentModel),
    );
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "topic-runtime-model-switch-same-provider",
      created_at: Date.now(),
      updated_at: Date.now(),
      execution_strategy: "react",
      execution_runtime: {
        session_id: "topic-runtime-model-switch-same-provider",
        provider_selector: selectedProvider,
        provider_name: "openai",
        model_name: currentModel,
        source: "session",
      },
      messages: [],
      turns: [],
      items: [],
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness
          .getValue()
          .switchTopic("topic-runtime-model-switch-same-provider");
      });

      act(() => {
        harness.getValue().setModel(nextModel);
      });
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage(
            "切换到同 provider 的另一个模型",
            [],
            false,
            false,
            false,
            "react",
          );
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBeUndefined();
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBeUndefined();
    } finally {
      harness.unmount();
    }
  });

  it("同 provider 切模型但 session 同步未完成时仍应提交 model 偏好", async () => {
    const workspaceId = "ws-runtime-model-switch-pending-sync";
    const selectedProvider = "openai";
    const currentModel = "gpt-5.4-mini";
    const nextModel = "gpt-5.4";
    let resolveProviderSync: (() => void) | null = null;
    localStorage.setItem(
      `agent_pref_provider_${workspaceId}`,
      JSON.stringify(selectedProvider),
    );
    localStorage.setItem(
      `agent_pref_model_${workspaceId}`,
      JSON.stringify(currentModel),
    );
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "topic-runtime-model-switch-pending-sync",
      created_at: Date.now(),
      updated_at: Date.now(),
      execution_strategy: "react",
      execution_runtime: {
        session_id: "topic-runtime-model-switch-pending-sync",
        provider_selector: selectedProvider,
        provider_name: "openai",
        model_name: currentModel,
        source: "session",
      },
      messages: [],
      turns: [],
      items: [],
    });
    mockUpdateAgentRuntimeSession.mockImplementation((request) => {
      if (request?.provider_name || request?.model_name) {
        return new Promise<void>((resolve) => {
          resolveProviderSync = resolve;
        });
      }
      return Promise.resolve();
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness
          .getValue()
          .switchTopic("topic-runtime-model-switch-pending-sync");
      });

      act(() => {
        harness.getValue().setModel(nextModel);
      });
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage(
            "切换到同 provider 的另一个模型，但 session 还没同步完",
            [],
            false,
            false,
            false,
            "react",
          );
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBeUndefined();
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBe(nextModel);
    } finally {
      (resolveProviderSync as (() => void) | null)?.();
      harness.unmount();
    }
  });

  it("execution_runtime 缺失但 session provider/model 已迁移回写后，不应重复随 turn 提交", async () => {
    const workspaceId = "ws-runtime-model-shadow-reuse";
    const topicId = "topic-runtime-model-shadow-reuse";
    localStorage.setItem(
      `agent_topic_model_pref_${workspaceId}_${topicId}`,
      JSON.stringify({
        providerType: "gemini",
        model: "gemini-2.5-pro",
      }),
    );
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: topicId,
      messages: [],
      execution_strategy: "react",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();

      await act(async () => {
        await harness.getValue().switchTopic(topicId);
      });
      await flushEffects();
      mockSubmitAgentRuntimeTurn.mockClear();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage(
            "继续沿用刚迁移回写的模型处理",
            [],
            false,
            false,
            false,
            "react",
          );
      });

      expect(mockSubmitAgentRuntimeTurn).toHaveBeenCalledTimes(1);
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.provider_preference,
      ).toBeUndefined();
      expect(
        mockSubmitAgentRuntimeTurn.mock.calls[0]?.[0]?.turn_config
          ?.model_preference,
      ).toBeUndefined();
    } finally {
      harness.unmount();
    }
  });

  it("execution_runtime 缺失且 session provider/model 回写未完成时，应随 turn 提交偏好", async () => {
    const workspaceId = "ws-runtime-model-shadow-pending-sync";
    const topicId = "topic-runtime-model-shadow-pending-sync";
    const selectedProvider = "custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3";
    const selectedModel = "gpt-5.5";
    const scheduledTasks: Array<() => void> = [];
    localStorage.setItem(
      `agent_topic_model_pref_${workspaceId}_${topicId}`,
      JSON.stringify({
        providerType: selectedProvider,
        model: selectedModel,
      }),
    );
    mockScheduleMinimumDelayIdleTask.mockImplementation((task: () => void) => {
      scheduledTasks.push(task);
      return () => undefined;
    });
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: topicId,
      messages: [],
      execution_strategy: "react",
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();

      await act(async () => {
        await harness.getValue().switchTopic(topicId);
      });
      await flushEffects();
      expect(scheduledTasks.length).toBeGreaterThan(0);
      mockSubmitAgentRuntimeTurn.mockClear();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage(
            "继续沿用本地话题模型处理",
            [],
            false,
            false,
            false,
            "react",
          );
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
});
