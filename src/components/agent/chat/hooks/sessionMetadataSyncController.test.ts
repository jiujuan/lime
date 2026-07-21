import { describe, expect, it, vi } from "vitest";
import {
  applyFallbackExecutionStrategyToTopics,
  buildSessionFinalizeLocalStatePlan,
  buildSessionMetadataSyncInputPlan,
  buildSessionMetadataSyncPlan,
  buildSessionMetadataSyncSuccessApplyPlan,
  buildSessionSwitchSuccessMetricContext,
  executeSessionMetadataSync,
  resolveSessionExecutionStrategySource,
} from "./sessionMetadataSyncController";

describe("sessionMetadataSyncController", () => {
  it("应在 metadata sync 输入阶段优先使用 runtime provider preference", () => {
    expect(
      buildSessionMetadataSyncInputPlan({
        runtimeAccessMode: "current",
        runtimePreference: {
          providerType: "deepseek",
          model: "deepseek-chat",
        },
        shadowAccessMode: "full-access",
        shadowExecutionStrategyFallback: "react",
        storedPreference: {
          providerType: "openai",
          model: "gpt-5",
        },
        workspaceDefaultAccessMode: "read-only",
      }),
    ).toEqual({
      runtimeAccessMode: "current",
      runtimePreference: {
        providerType: "deepseek",
        model: "deepseek-chat",
      },
      shadowAccessMode: "full-access",
      shadowExecutionStrategyFallback: "react",
      topicPreference: {
        providerType: "deepseek",
        model: "deepseek-chat",
      },
      workspaceDefaultAccessMode: "read-only",
    });
  });

  it("runtime provider preference 缺失时应使用 session storage preference", () => {
    expect(
      buildSessionMetadataSyncInputPlan({
        runtimeAccessMode: null,
        runtimePreference: null,
        storedPreference: {
          providerType: "openai",
          model: "gpt-5",
        },
        workspaceDefaultAccessMode: "full-access",
      }),
    ).toMatchObject({
      runtimePreference: null,
      topicPreference: {
        providerType: "openai",
        model: "gpt-5",
      },
    });
  });

  it("runtime accessMode 与 runtime preference 不应生成回填 patch", () => {
    const plan = buildSessionMetadataSyncPlan({
      runtimeAccessMode: "current",
      runtimePreference: {
        providerType: "deepseek",
        model: "deepseek-chat",
      },
      shadowAccessMode: "full-access",
      topicPreference: {
        providerType: "openai",
        model: "gpt-5",
      },
      workspaceDefaultAccessMode: "read-only",
    });

    expect(plan).toMatchObject({
      accessMode: "current",
      accessModeSource: "execution_runtime",
      fallbackExecutionStrategy: null,
      fallbackProviderPreference: null,
      hasPatch: false,
      modelPreferenceSource: "execution_runtime",
      patch: {},
      providerPreferenceToApply: {
        providerType: "openai",
        model: "gpt-5",
      },
      shouldPersistAccessMode: true,
    });
  });

  it("session storage fallback 应生成 accessMode 与 provider patch，并把 legacy 策略归一到 react", () => {
    const plan = buildSessionMetadataSyncPlan({
      runtimeAccessMode: null,
      runtimePreference: null,
      shadowAccessMode: "full-access",
      shadowExecutionStrategyFallback: "code_orchestrated" as never,
      topicPreference: {
        providerType: "openai",
        model: "gpt-5",
      },
      workspaceDefaultAccessMode: "read-only",
    });

    expect(plan).toMatchObject({
      accessMode: "full-access",
      accessModeSource: "session_storage",
      fallbackExecutionStrategy: "react",
      fallbackProviderPreference: {
        providerType: "openai",
        model: "gpt-5",
      },
      hasPatch: true,
      modelPreferenceSource: "session_storage",
      patch: {
        accessMode: "full-access",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
      },
      shouldPersistAccessMode: false,
    });
  });

  it("缺少 session accessMode 时应使用 workspace default 并生成 patch", () => {
    const plan = buildSessionMetadataSyncPlan({
      runtimeAccessMode: null,
      runtimePreference: null,
      shadowAccessMode: null,
      topicPreference: null,
      workspaceDefaultAccessMode: "read-only",
    });

    expect(plan).toMatchObject({
      accessMode: "read-only",
      accessModeSource: "workspace_default",
      hasPatch: true,
      patch: {
        accessMode: "read-only",
      },
      shouldPersistAccessMode: true,
    });
  });

  it("应稳定构造 switch success metric context 与 execution strategy source", () => {
    expect(
      resolveSessionExecutionStrategySource({
        runtimeExecutionStrategy: null,
        topicExecutionStrategy: null,
        shadowExecutionStrategyFallback: "react",
      }),
    ).toBe("shadow_cache");
    expect(
      buildSessionSwitchSuccessMetricContext({
        accessModeSource: "workspace_default",
        durationMs: 120,
        executionStrategySource: "shadow_cache",
        itemsCount: 3,
        messagesCount: 4,
        modelPreferenceSource: null,
        topicId: "topic-a",
        turnsCount: 2,
        workspaceId: "workspace-a",
      }),
    ).toEqual({
      accessModeSource: "workspace_default",
      durationMs: 120,
      executionStrategySource: "shadow_cache",
      itemsCount: 3,
      messagesCount: 4,
      modelPreferenceSource: null,
      sessionId: "topic-a",
      topicId: "topic-a",
      turnsCount: 2,
      workspaceId: "workspace-a",
    });
  });

  it("应构造 finalize 成功后的本地状态应用计划", () => {
    expect(
      buildSessionFinalizeLocalStatePlan({
        durationMs: 250,
        itemsCount: 5,
        messagesCount: 6,
        metadataSyncPlan: {
          accessMode: "current",
          accessModeSource: "execution_runtime",
          modelPreferenceSource: "execution_runtime",
          shouldPersistAccessMode: true,
        },
        runtimeExecutionStrategy: "react",
        shadowExecutionStrategyFallback: "react",
        topicExecutionStrategy: "react",
        topicId: "topic-a",
        turnsCount: 2,
        workspaceId: "workspace-a",
      }),
    ).toEqual({
      accessModeToApply: "current",
      accessModeToPersist: "current",
      runtimeExecutionStrategyToMarkSynced: "react",
      switchSuccessMetricContext: {
        accessModeSource: "execution_runtime",
        durationMs: 250,
        executionStrategySource: "session_detail",
        itemsCount: 5,
        messagesCount: 6,
        modelPreferenceSource: "execution_runtime",
        sessionId: "topic-a",
        topicId: "topic-a",
        turnsCount: 2,
        workspaceId: "workspace-a",
      },
    });
  });

  it("图片模型偏好不应生成聊天会话 metadata 回填 patch", () => {
    const plan = buildSessionMetadataSyncPlan({
      runtimeAccessMode: null,
      runtimePreference: {
        providerType: "custom-image-provider",
        model: "gpt-image-1",
      },
      shadowAccessMode: "full-access",
      topicPreference: {
        providerType: "custom-image-provider",
        model: "gpt-image-1",
      },
      workspaceDefaultAccessMode: "read-only",
    });

    expect(plan).toMatchObject({
      accessMode: "full-access",
      accessModeSource: "session_storage",
      fallbackExecutionStrategy: null,
      fallbackProviderPreference: null,
      hasPatch: true,
      modelPreferenceSource: null,
      patch: {
        accessMode: "full-access",
      },
      providerPreferenceToApply: null,
      shouldPersistAccessMode: false,
    });
  });

  it("未从 runtime 恢复执行策略且 accessMode 来自 storage 时不持久化本地副本", () => {
    expect(
      buildSessionFinalizeLocalStatePlan({
        durationMs: 80,
        itemsCount: 0,
        messagesCount: 1,
        metadataSyncPlan: {
          accessMode: "full-access",
          accessModeSource: "session_storage",
          modelPreferenceSource: "session_storage",
          shouldPersistAccessMode: false,
        },
        runtimeExecutionStrategy: null,
        shadowExecutionStrategyFallback: "react",
        topicExecutionStrategy: null,
        topicId: "topic-b",
        turnsCount: 1,
      }),
    ).toMatchObject({
      accessModeToApply: "full-access",
      accessModeToPersist: null,
      runtimeExecutionStrategyToMarkSynced: null,
      switchSuccessMetricContext: {
        executionStrategySource: "shadow_cache",
        topicId: "topic-b",
      },
    });
  });

  it("应构造 metadata sync 成功后的本地同步标记计划", () => {
    expect(
      buildSessionMetadataSyncSuccessApplyPlan({
        fallbackExecutionStrategy: "react",
        fallbackProviderPreference: {
          providerType: "openai",
          model: "gpt-5",
        },
      }),
    ).toEqual({
      executionStrategyToApplyToTopic: "react",
      executionStrategyToMarkSynced: "react",
      providerPreferenceToMarkSynced: {
        providerType: "openai",
        model: "gpt-5",
      },
    });

    expect(buildSessionMetadataSyncSuccessApplyPlan({})).toEqual({
      executionStrategyToApplyToTopic: null,
      executionStrategyToMarkSynced: null,
      providerPreferenceToMarkSynced: null,
    });
  });

  it("应把 fallback execution strategy 回填到目标 topic", () => {
    const topics = [
      { id: "topic-a", executionStrategy: "react" as const, name: "A" },
      { id: "topic-b", executionStrategy: "react" as const, name: "B" },
    ];

    expect(
      applyFallbackExecutionStrategyToTopics(topics, {
        topicId: "topic-b",
        executionStrategyToApplyToTopic: "react",
      }),
    ).toEqual([
      { id: "topic-a", executionStrategy: "react", name: "A" },
      {
        id: "topic-b",
        executionStrategy: "react",
        name: "B",
      },
    ]);

    expect(
      applyFallbackExecutionStrategyToTopics(topics, {
        topicId: "topic-b",
        executionStrategyToApplyToTopic: null,
      }),
    ).toBe(topics);
  });

  it("优先使用批量 updateSessionMetadata", async () => {
    const runtime = {
      updateSessionMetadata: vi.fn().mockResolvedValue(undefined),
      setSessionAccessMode: vi.fn(),
      setSessionExecutionStrategy: vi.fn(),
      setSessionProviderSelection: vi.fn(),
    };

    await executeSessionMetadataSync({
      fallbackExecutionStrategy: "react",
      fallbackProviderPreference: {
        providerType: "openai",
        model: "gpt-5",
      },
      patch: {
        accessMode: "current",
        providerType: "openai",
        model: "gpt-5",
        executionStrategy: "react",
      },
      runtime,
      sessionId: "topic-a",
    });

    expect(runtime.updateSessionMetadata).toHaveBeenCalledWith("topic-a", {
      accessMode: "current",
      providerType: "openai",
      model: "gpt-5",
      executionStrategy: "react",
    });
    expect(runtime.setSessionAccessMode).not.toHaveBeenCalled();
    expect(runtime.setSessionProviderSelection).not.toHaveBeenCalled();
    expect(runtime.setSessionExecutionStrategy).not.toHaveBeenCalled();
  });

  it("缺少批量命令时应回退到分散 metadata 命令", async () => {
    const runtime = {
      setSessionAccessMode: vi.fn().mockResolvedValue(undefined),
      setSessionExecutionStrategy: vi.fn().mockResolvedValue(undefined),
      setSessionProviderSelection: vi.fn().mockResolvedValue(undefined),
    };

    await executeSessionMetadataSync({
      fallbackExecutionStrategy: "react",
      fallbackProviderPreference: {
        providerType: "deepseek",
        model: "deepseek-chat",
      },
      patch: {
        accessMode: "full-access",
        providerType: "deepseek",
        model: "deepseek-chat",
        executionStrategy: "react",
      },
      runtime,
      sessionId: "topic-a",
    });

    expect(runtime.setSessionAccessMode).toHaveBeenCalledWith(
      "topic-a",
      "full-access",
    );
    expect(runtime.setSessionProviderSelection).toHaveBeenCalledWith(
      "topic-a",
      "deepseek",
      "deepseek-chat",
    );
    expect(runtime.setSessionExecutionStrategy).toHaveBeenCalledWith(
      "topic-a",
      "react",
    );
  });
});
