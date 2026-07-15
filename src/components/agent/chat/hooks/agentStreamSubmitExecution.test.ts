import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { AgentSessionExecutionRuntime } from "@/lib/api/agentExecutionRuntime";
import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import type { EnhancedModelMetadata } from "@/lib/types/modelRegistry";
import { MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX } from "@/lib/model/modelCapabilitySendGate";
import { buildModelNativeToolPolicy } from "@/lib/model/modelNativeToolPolicy";
import { buildModelResponsesPolicy } from "@/lib/model/modelResponsesPolicy";
import { buildModelToolCallPolicy } from "@/lib/model/modelToolCallPolicy";
import { buildModelTruncationPolicy } from "@/lib/model/modelTruncationPolicy";
import type { ActionRequired, Message } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { StreamRequestState } from "./agentStreamSubmissionLifecycle";
import { executeAgentStreamSubmit } from "./agentStreamSubmitExecution";
import { MODEL_SELECTION_REQUIRED_ERROR_MESSAGE } from "../utils/agentRuntimeErrorPresentation";

const { getModelRegistryMock, setAgentRuntimeObjectiveMock } = vi.hoisted(
  () => ({
    getModelRegistryMock: vi.fn(),
    setAgentRuntimeObjectiveMock: vi.fn(),
  }),
);

vi.mock("@/lib/api/agentRuntime/objectiveClient", () => ({
  setAgentRuntimeObjective: setAgentRuntimeObjectiveMock,
}));

vi.mock("@/lib/api/modelRegistry", () => ({
  modelRegistryApi: {
    getModelRegistry: getModelRegistryMock,
  },
}));

function noopDispatch<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

function modelFixture(
  overrides: Partial<EnhancedModelMetadata>,
): EnhancedModelMetadata {
  return {
    id: "gpt-4.1",
    display_name: "GPT 4.1",
    provider_id: "openai",
    provider_name: "OpenAI",
    family: "gpt-4",
    tier: "pro",
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      json_mode: true,
      function_calling: true,
      reasoning: false,
    },
    task_families: ["chat"],
    input_modalities: ["text"],
    output_modalities: ["text"],
    runtime_features: ["streaming", "tool_calling"],
    deployment_source: "user_cloud",
    management_plane: "local_settings",
    canonical_model_id: null,
    provider_model_id: null,
    alias_source: null,
    pricing: null,
    limits: {
      context_length: 128000,
      max_output_tokens: 4096,
      requests_per_minute: null,
      tokens_per_minute: null,
    },
    status: "active",
    release_date: null,
    is_latest: true,
    description: null,
    source: "api",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("agentStreamSubmitExecution", () => {
  afterEach(() => {
    activityLogger.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("provider/model 不完整时应在创建会话和 turn/start 前直接失败", async () => {
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-should-not-create");
    const runtime = {
      listenToTurnEvents: vi.fn(async () => vi.fn()),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await expect(
      executeAgentStreamSubmit({
        runtime,
        ensureSession,
        attemptSilentTurnRecovery: async () => false,
        refreshSessionReadModel: async () => true,
        sessionIdRef: { current: null } as MutableRefObject<string | null>,
        getWorkspaceIdForSubmit: () => "workspace-1",
        getSyncedSessionExecutionStrategy: () => "react",
        getSyncedSessionRecentPreferences: () => null,
        effectiveAccessMode: "current",
        content: "只回答绿灯",
        images: [],
        skipUserMessage: false,
        expectingQueue: false,
        effectiveProviderType: "lime-hub",
        effectiveModel: "",
        effectiveExecutionStrategy: "react",
        eventName: "event-missing-model",
        requestTurnId: "turn-missing-model",
        requestState,
        assistantMsgId: "assistant-missing-model",
        pendingTurnKey: "pending-turn-missing-model",
        pendingItemKey: "pending-item-missing-model",
        warnedKeysRef: { current: new Set<string>() },
        actionLoggedKeys: new Set<string>(),
        toolLogIdByToolId: new Map<string, string>(),
        toolStartedAtByToolId: new Map<string, number>(),
        toolNameByToolId: new Map<string, string>(),
        callbacks: {
          activateStream: vi.fn(),
          isStreamActivated: () => false,
          clearOptimisticItem: () => {},
          clearOptimisticTurn: () => {},
          disposeListener: () => {},
          removeQueuedDraftMessages: () => {},
          clearActiveStreamIfMatch: () => false,
          upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
          removeQueuedTurnsFromProjection: () => {},
          registerListener: vi.fn(),
        },
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
        setMessages: noopDispatch<Message[]>(),
        setIsSending: noopDispatch<boolean>(),
        setPendingActions: noopDispatch<ActionRequired[]>(),
        setThreadItems: noopDispatch<AgentThreadItem[]>(),
        setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
        setCurrentTurnId: noopDispatch<string | null>(),
        setExecutionRuntime:
          noopDispatch<AgentSessionExecutionRuntime | null>(),
      }),
    ).rejects.toThrow(MODEL_SELECTION_REQUIRED_ERROR_MESSAGE);

    expect(ensureSession).not.toHaveBeenCalled();
    expect(runtime.listenToTurnEvents).not.toHaveBeenCalled();
    expect(submitOp).not.toHaveBeenCalled();
  });

  it("应串起 submit context、listener 绑定与 submitOp", async () => {
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel: async () => true,
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: true,
        thinking: true,
        task: false,
        subagent: true,
      }),
      effectiveAccessMode: "read-only",
      content: "继续生成提纲",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      webSearch: true,
      thinking: true,
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      requestMetadata: {
        harness: {
          managed_objective: {
            objective_text: "持续推进真实 E2E 目标",
            source: "inputbar",
          },
          thread_goal: {
            enabled: true,
            set: {
              threadId: "draft-send-1",
              objective: "持续推进真实 E2E 目标",
            },
          },
        },
      },
      eventName: "event-1",
      requestTurnId: "turn-1",
      requestState,
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener,
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(registerListener).toHaveBeenCalledTimes(1);
    const registeredUnlisten = registerListener.mock.calls[0]?.[0];
    expect(registeredUnlisten).toEqual(expect.any(Function));
    registeredUnlisten?.();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(submitOp).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user_input",
        sessionId: "session-1",
        eventName: "event-1",
        workspaceId: "workspace-1",
        turnId: "turn-1",
        text: "继续生成提纲",
        skipPreSubmitResume: true,
        preferences: expect.objectContaining({
          approvalPolicy: "on-request",
          sandboxPolicy: "read-only",
        }),
      }),
    );
    expect(ensureSession).toHaveBeenCalledWith({
      skipSessionRestore: true,
      skipSessionStartHooks: true,
    });
    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      objectiveText: "持续推进真实 E2E 目标",
      successCriteria: [],
    });
    expect(activateStream).toHaveBeenCalled();
    expect(requestState.requestLogId).toBeTruthy();
  });

  it("queued submit accepted 后应释放 listener、刷新 read model 且不覆盖 active stream", async () => {
    getModelRegistryMock.mockResolvedValueOnce([]);
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const refreshSessionReadModel = vi.fn(async () => true);
    const disposeListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession: async () => "session-queued",
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel,
      sessionIdRef: {
        current: "session-queued",
      } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => null,
      effectiveAccessMode: "current",
      content: "排队处理",
      images: [],
      skipUserMessage: false,
      expectingQueue: true,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      eventName: "event-queued",
      requestTurnId: "turn-queued",
      requestState,
      assistantMsgId: "assistant-queued",
      pendingTurnKey: "pending-turn-queued",
      pendingItemKey: "pending-item-queued",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener: vi.fn(),
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(submitOp).toHaveBeenCalledTimes(1);
    expect(activateStream).not.toHaveBeenCalled();
    expect(disposeListener).toHaveBeenCalledTimes(1);
    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-queued");
  });

  it("存在 targetSessionId 时应把 submit 绑定到指定会话", async () => {
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-materialized");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel: async () => true,
      sessionIdRef: {
        current: "session-previous",
      } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => null,
      effectiveAccessMode: "read-only",
      content: "从草稿进入正式会话",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      targetSessionId: "session-materialized",
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      eventName: "event-materialized",
      requestTurnId: "turn-materialized",
      requestState,
      assistantMsgId: "assistant-materialized",
      pendingTurnKey: "pending-turn-materialized",
      pendingItemKey: "pending-item-materialized",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener,
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(ensureSession).toHaveBeenCalledWith({
      targetSessionId: "session-materialized",
      skipSessionRestore: true,
      skipSessionStartHooks: true,
    });
    expect(runtime.listenToTurnEvents).toHaveBeenCalledWith(
      "event-materialized",
      expect.any(Function),
    );
    expect(submitOp).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-materialized",
        eventName: "event-materialized",
        turnId: "turn-materialized",
        text: "从草稿进入正式会话",
      }),
    );
    expect(activateStream).toHaveBeenCalledWith(
      "session-materialized",
      expect.anything(),
    );
  });

  it("图片输入不满足 selected model input_modalities 时不应调用 runtime submitOp", async () => {
    getModelRegistryMock.mockResolvedValueOnce([
      modelFixture({
        id: "gpt-4.1-text",
        input_modalities: ["text"],
      }),
    ]);

    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await expect(
      executeAgentStreamSubmit({
        runtime,
        ensureSession,
        attemptSilentTurnRecovery: async () => false,
        refreshSessionReadModel: async () => true,
        sessionIdRef: { current: null } as MutableRefObject<string | null>,
        getWorkspaceIdForSubmit: () => "workspace-1",
        getSyncedSessionExecutionStrategy: () => "react",
        getSyncedSessionRecentPreferences: () => ({
          webSearch: false,
          thinking: false,
          task: false,
          subagent: false,
        }),
        effectiveAccessMode: "read-only",
        content: "描述这张图",
        images: [{ data: "base64-image", mediaType: "image/png" }],
        skipUserMessage: false,
        expectingQueue: false,
        effectiveProviderType: "openai",
        effectiveModel: "gpt-4.1-text",
        effectiveExecutionStrategy: "react",
        skipSessionRestore: true,
        skipSessionStartHooks: true,
        skipPreSubmitResume: true,
        requestMetadata: {
          harness: {
            managed_objective: {
              objective_text: "不要在 capability gap 时写入目标",
              source: "inputbar",
            },
          },
        },
        eventName: "event-image-1",
        requestTurnId: "turn-image-1",
        requestState,
        assistantMsgId: "assistant-1",
        pendingTurnKey: "pending-turn-1",
        pendingItemKey: "pending-item-1",
        warnedKeysRef: { current: new Set<string>() },
        actionLoggedKeys: new Set<string>(),
        toolLogIdByToolId: new Map<string, string>(),
        toolStartedAtByToolId: new Map<string, number>(),
        toolNameByToolId: new Map<string, string>(),
        callbacks: {
          activateStream,
          isStreamActivated: () => false,
          clearOptimisticItem: () => {},
          clearOptimisticTurn: () => {},
          disposeListener: () => {},
          removeQueuedDraftMessages: () => {},
          clearActiveStreamIfMatch: () => false,
          upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
          removeQueuedTurnsFromProjection: () => {},
          registerListener,
        },
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
        setMessages: noopDispatch<Message[]>(),
        setIsSending: noopDispatch<boolean>(),
        setPendingActions: noopDispatch<ActionRequired[]>(),
        setThreadItems: noopDispatch<AgentThreadItem[]>(),
        setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
        setCurrentTurnId: noopDispatch<string | null>(),
        setExecutionRuntime:
          noopDispatch<AgentSessionExecutionRuntime | null>(),
      }),
    ).rejects.toThrow(`${MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX}:`);

    expect(getModelRegistryMock).toHaveBeenCalledWith({ forceRefresh: true });
    expect(setAgentRuntimeObjectiveMock).not.toHaveBeenCalled();
    expect(submitOp).not.toHaveBeenCalled();
  });

  it("图片输入满足 selected model input_modalities 时应把最终 gate 写入 submit metadata", async () => {
    getModelRegistryMock.mockResolvedValueOnce([
      modelFixture({
        id: "gpt-4.1-vision",
        capabilities: {
          vision: true,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: false,
        },
        input_modalities: ["text", "image"],
        task_families: ["chat", "vision_understanding"],
        responses_policy: buildModelResponsesPolicy({
          use_responses_lite: true,
        }),
        tool_call_policy: buildModelToolCallPolicy({
          supports_parallel_tool_calls: true,
        }),
        truncation_policy: buildModelTruncationPolicy({
          truncation_policy: {
            mode: "tokens",
            limit: 4096,
          },
        }),
        native_tool_policy: buildModelNativeToolPolicy({
          shell_type: "unified_exec",
          apply_patch_tool_type: "freeform",
        }),
      }),
    ]);

    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel: async () => true,
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      }),
      effectiveAccessMode: "read-only",
      content: "描述这张图",
      images: [{ data: "base64-image", mediaType: "image/png" }],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-4.1-vision",
      effectiveExecutionStrategy: "react",
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      requestMetadata: {
        source: "prepare",
        harness: {
          existing_signal: true,
          model_input_capability_gate: {
            status: "unknown",
            reason: "missing_capability_summary",
          },
        },
      },
      eventName: "event-image-allowed",
      requestTurnId: "turn-image-allowed",
      requestState,
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener,
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(submitOp).toHaveBeenCalledTimes(1);
    expect(getModelRegistryMock).toHaveBeenCalledWith({ forceRefresh: true });
    expect(submitOp.mock.calls[0]?.[0]).toMatchObject({
      type: "user_input",
      metadata: {
        source: "prepare",
        harness: {
          existing_signal: true,
          model_input_capability_gate: {
            status: "allowed",
            requiredInputModalities: ["text", "image"],
            supportedInputModalities: ["text", "image"],
            missingInputModalities: [],
            requiresMediaInput: true,
            reason: null,
          },
          model_request_policy: {
            source: "model_registry",
            provider_id: "openai",
            model_id: "gpt-4.1-vision",
            responses_policy: {
              request_mode: "responses_lite",
              requires_responses_lite_header: true,
            },
            tool_call_policy: {
              supports_parallel_tool_calls: true,
              parallel_tool_calls: true,
            },
            truncation_policy: {
              mode: "tokens",
              limit: 4096,
            },
            native_tool_policy: {
              preferred_shell_surface: "unified_exec",
              apply_patch_tool_enabled: true,
            },
          },
        },
      },
    });
    expect(setAgentRuntimeObjectiveMock).not.toHaveBeenCalled();
  });

  it("当前模型只有最小 registry metadata 时也应覆盖旧 model_request_policy", async () => {
    getModelRegistryMock.mockResolvedValue([
      modelFixture({
        id: "gpt-5.2-pro",
        display_name: "gpt-5.2-pro",
        provider_id: "lime-hub",
        provider_name: "Lime Hub",
        responses_policy: buildModelResponsesPolicy({
          use_responses_lite: true,
        }),
      }),
      modelFixture({
        id: "gpt-5.4-mini",
        display_name: "gpt-5.4-mini",
        provider_id: "lime-hub",
        provider_name: "Lime Hub",
        capabilities: {
          vision: true,
          tools: true,
          streaming: true,
          json_mode: true,
          function_calling: true,
          reasoning: false,
        },
        input_modalities: ["text", "image"],
        task_families: ["chat", "vision_understanding"],
      }),
    ]);

    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession: vi.fn(async () => "session-target"),
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel: async () => true,
      sessionIdRef: { current: "session-target" } as MutableRefObject<
        string | null
      >,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      }),
      effectiveAccessMode: "current",
      content: "GateB gpt-5.4-mini reasoning dedupe",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "lime-hub",
      effectiveModel: "gpt-5.4-mini",
      effectiveExecutionStrategy: "react",
      executionRuntime: {
        session_id: "session-target",
        source: "runtime_snapshot",
        provider_selector: "lime-hub",
        model_name: "gpt-5.2-pro",
        execution_strategy: "react",
      },
      syncedSessionModelPreference: {
        providerType: "lime-hub",
        model: "gpt-5.4-mini",
      },
      requestMetadata: {
        source: "prepare",
        harness: {
          existing_signal: true,
          model_request_policy: {
            source: "model_registry",
            provider_id: "lime-hub",
            model_id: "gpt-5.2-pro",
          },
        },
      },
      eventName: "event-target-model",
      requestTurnId: "turn-target-model",
      requestState,
      assistantMsgId: "assistant-target-model",
      pendingTurnKey: "pending-turn-target-model",
      pendingItemKey: "pending-item-target-model",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener: vi.fn(),
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(submitOp).toHaveBeenCalledTimes(1);
    expect(submitOp.mock.calls[0]?.[0]).toMatchObject({
      type: "user_input",
      preferences: {
        providerPreference: undefined,
        modelPreference: undefined,
      },
      metadata: {
        source: "prepare",
        harness: {
          existing_signal: true,
          model_request_policy: {
            source: "model_registry",
            provider_id: "lime-hub",
            model_id: "gpt-5.4-mini",
          },
        },
      },
    });
  });

  it("追求目标写入失败不应阻断消息提交", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unlisten = vi.fn();
    const submitOp = vi.fn(async () => {});
    const ensureSession = vi.fn(async () => "session-1");
    const registerListener = vi.fn();
    const activateStream = vi.fn();
    setAgentRuntimeObjectiveMock.mockRejectedValueOnce(
      new Error("bridge timeout"),
    );
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
      submitOp,
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await executeAgentStreamSubmit({
      runtime,
      ensureSession,
      attemptSilentTurnRecovery: async () => false,
      refreshSessionReadModel: async () => true,
      sessionIdRef: { current: null } as MutableRefObject<string | null>,
      getWorkspaceIdForSubmit: () => "workspace-1",
      getSyncedSessionExecutionStrategy: () => "react",
      getSyncedSessionRecentPreferences: () => ({
        webSearch: false,
        thinking: false,
        task: false,
        subagent: false,
      }),
      effectiveAccessMode: "read-only",
      content: "继续生成提纲",
      images: [],
      skipUserMessage: false,
      expectingQueue: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      webSearch: false,
      thinking: false,
      skipSessionRestore: true,
      skipSessionStartHooks: true,
      skipPreSubmitResume: true,
      requestMetadata: {
        harness: {
          managed_objective: {
            objective_text: "持续推进真实 E2E 目标",
            source: "inputbar",
          },
        },
      },
      eventName: "event-1",
      requestTurnId: "turn-1",
      requestState,
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream,
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
        registerListener,
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
    });

    expect(setAgentRuntimeObjectiveMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[AgentStream] 写入追求目标失败，继续发送消息:",
      expect.any(Error),
    );
    expect(submitOp).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user_input",
        sessionId: "session-1",
      }),
    );
    expect(activateStream).toHaveBeenCalled();
  });
});
