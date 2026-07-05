import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type {
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
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

const { getModelRegistryMock, setAgentRuntimeObjectiveMock } = vi.hoisted(
  () => ({
    getModelRegistryMock: vi.fn(),
    setAgentRuntimeObjectiveMock: vi.fn(),
  }),
);

vi.mock("@/lib/api/agentRuntime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/agentRuntime")>(
    "@/lib/api/agentRuntime",
  );
  return {
    ...actual,
    setAgentRuntimeObjective: setAgentRuntimeObjectiveMock,
  };
});

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
        removeQueuedTurnState: () => {},
        registerListener,
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
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
          removeQueuedTurnState: () => {},
          registerListener,
        },
        sounds: {
          playToolcallSound: () => {},
          playTypewriterSound: () => {},
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
          noopDispatch<AsterSessionExecutionRuntime | null>(),
      }),
    ).rejects.toThrow(`${MODEL_INPUT_CAPABILITY_GAP_ERROR_PREFIX}:`);

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
        removeQueuedTurnState: () => {},
        registerListener,
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
    });

    expect(submitOp).toHaveBeenCalledTimes(1);
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
        removeQueuedTurnState: () => {},
        registerListener,
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
      },
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
      setMessages: noopDispatch<Message[]>(),
      setIsSending: noopDispatch<boolean>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
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
