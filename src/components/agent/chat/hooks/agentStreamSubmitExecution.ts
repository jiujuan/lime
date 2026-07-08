import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type {
  AsterExecutionStrategy,
  AgentRuntimeWebSearchMode,
  AsterSessionExecutionRuntime,
  AutoContinueRequestPayload,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { setAgentRuntimeObjective } from "@/lib/api/agentRuntime";
import { modelRegistryApi } from "@/lib/api/modelRegistry";
import type { ModelCapabilitySummary } from "@/lib/model/inferModelCapabilities";
import {
  buildModelCapabilitySendGateInput,
  evaluateModelInputCapability,
  mergeModelInputCapabilityGateMetadata,
  resolveModelCapabilitySummaryForSelection,
} from "@/lib/model/modelCapabilitySendGate";
import {
  mergeModelRequestPolicyMetadata,
  resolveModelRequestPolicyMetadataForSelection,
} from "@/lib/model/modelRequestPolicyMetadata";
import { MODEL_SELECTION_REQUIRED_ERROR_MESSAGE } from "../utils/agentRuntimeErrorPresentation";
import type {
  AssistantDraftState,
  SendMessageObserver,
  SessionModelPreference,
} from "./agentChatShared";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { AgentAccessMode } from "./agentChatStorage";
import type { StreamRequestState } from "./agentStreamSubmissionLifecycle";
import type { ActionRequired, Message, MessageImage } from "../types";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import { runAgentStreamSubmitLifecycle } from "./agentStreamSubmitLifecycleController";
import { buildAgentStreamSubmitOp } from "./agentStreamSubmitOpController";
import { resolveAgentStreamSubmitContext } from "./agentStreamSubmitContext";
import { registerAgentStreamTurnEventBinding } from "./agentStreamTurnEventBinding";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import {
  extractAgentUiPerformanceTraceMetadata,
  mergeAgentUiPerformanceTraceMetadata,
} from "./agentStreamPerformanceMetrics";
import { extractInputbarManagedObjectiveText } from "../components/Inputbar/utils/inputbarModeRequestMetadata";

type MessageParts = NonNullable<Message["contentParts"]>;

interface ExecuteAgentStreamSubmitOptions {
  runtime: AgentRuntimeAdapter;
  ensureSession: (options?: {
    targetSessionId?: string;
    skipSessionRestore?: boolean;
    skipSessionStartHooks?: boolean;
  }) => Promise<string | null>;
  attemptSilentTurnRecovery: (
    sessionId: string,
    requestStartedAt: number,
    promptText: string,
    options?: { requireTerminal?: boolean; turnId?: string | null },
  ) => Promise<boolean>;
  sessionIdRef: MutableRefObject<string | null>;
  getWorkspaceIdForSubmit: () => string | undefined;
  getSyncedSessionExecutionStrategy: (
    sessionId: string,
  ) => AsterExecutionStrategy | null;
  getSyncedSessionRecentPreferences?: (
    sessionId: string,
  ) => ChatToolPreferences | null;
  effectiveAccessMode: AgentAccessMode;
  content: string;
  images: MessageImage[];
  skipUserMessage: boolean;
  expectingQueue: boolean;
  effectiveProviderType: string;
  effectiveModel: string;
  effectiveExecutionStrategy: AsterExecutionStrategy;
  modelOverride?: string;
  reasoningEffort?: string;
  webSearch?: boolean;
  searchMode?: AgentRuntimeWebSearchMode;
  thinking?: boolean;
  explicitToolPreferences?: boolean;
  autoContinue?: AutoContinueRequestPayload;
  systemPrompt?: string;
  requestMetadata?: Record<string, unknown>;
  assistantDraft?: AssistantDraftState;
  targetSessionId?: string;
  skipSessionRestore?: boolean;
  skipSessionStartHooks?: boolean;
  skipPreSubmitResume?: boolean;
  executionRuntime?: AsterSessionExecutionRuntime | null;
  syncedSessionModelPreference?: SessionModelPreference | null;
  eventName: string;
  requestTurnId: string;
  requestState: StreamRequestState;
  assistantMsgId: string;
  pendingTurnKey: string;
  pendingItemKey: string;
  warnedKeysRef: MutableRefObject<Set<string>>;
  actionLoggedKeys: Set<string>;
  toolLogIdByToolId: Map<string, string>;
  toolStartedAtByToolId: Map<string, number>;
  toolNameByToolId: Map<string, string>;
  observer?: SendMessageObserver;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: import("../types").WriteArtifactContext,
  ) => void;
  callbacks: {
    activateStream: (
      activeSessionId: string,
      effectiveWaitingRuntimeStatus: NonNullable<Message["runtimeStatus"]>,
    ) => void;
    isStreamActivated: () => boolean;
    clearOptimisticItem: () => void;
    clearOptimisticTurn: () => void;
    disposeListener: () => void;
    removeQueuedDraftMessages: () => void;
    clearActiveStreamIfMatch: (eventName: string) => boolean;
    upsertQueuedTurn: (queuedTurn: QueuedTurnSnapshot) => void;
    removeQueuedTurnsFromProjection: (queuedTurnIds: string[]) => void;
    registerListener: (unlisten: () => void) => void;
  };
  sounds: {
    playToolcallSound: () => void;
    playTypewriterSound: () => void;
  };
  appendThinkingToParts: (
    parts: MessageParts,
    textDelta: string,
  ) => MessageParts;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  getThreadItems?: () => readonly AgentThreadItem[];
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setExecutionRuntime: Dispatch<
    SetStateAction<AsterSessionExecutionRuntime | null>
  >;
  soulCopy?: SoulInteractionCopy;
}

async function resolveSubmitModelPolicy(options: {
  images: readonly MessageImage[];
  providerType: string;
  model: string;
}): Promise<{
  modelCapabilitySummary: ModelCapabilitySummary | null | undefined;
  modelRequestPolicyMetadata: ReturnType<
    typeof resolveModelRequestPolicyMetadataForSelection
  >;
}> {
  try {
    const shouldResolveMediaCapability = options.images.length > 0;
    const models = await modelRegistryApi.getModelRegistry(
      shouldResolveMediaCapability ? { forceRefresh: true } : undefined,
    );
    const selection = {
      models,
      providerType: options.providerType,
      model: options.model,
    };

    return {
      modelCapabilitySummary:
        !shouldResolveMediaCapability
          ? undefined
          : resolveModelCapabilitySummaryForSelection(selection),
      modelRequestPolicyMetadata:
        resolveModelRequestPolicyMetadataForSelection(selection),
    };
  } catch {
    return {
      modelCapabilitySummary: options.images.length === 0 ? undefined : null,
      modelRequestPolicyMetadata: undefined,
    };
  }
}

export async function executeAgentStreamSubmit(
  options: ExecuteAgentStreamSubmitOptions,
) {
  const {
    runtime,
    ensureSession,
    attemptSilentTurnRecovery,
    sessionIdRef,
    getWorkspaceIdForSubmit,
    getSyncedSessionExecutionStrategy,
    getSyncedSessionRecentPreferences,
    effectiveAccessMode,
    content,
    images,
    skipUserMessage,
    expectingQueue,
    effectiveProviderType,
    effectiveModel,
    effectiveExecutionStrategy,
    modelOverride,
    reasoningEffort,
    webSearch,
    searchMode,
    thinking,
    explicitToolPreferences,
    autoContinue,
    systemPrompt,
    requestMetadata,
    assistantDraft,
    targetSessionId,
    skipSessionRestore,
    skipSessionStartHooks,
    skipPreSubmitResume,
    executionRuntime,
    syncedSessionModelPreference,
    eventName,
    requestTurnId,
    requestState,
    assistantMsgId,
    pendingTurnKey,
    pendingItemKey,
    warnedKeysRef,
    actionLoggedKeys,
    toolLogIdByToolId,
    toolStartedAtByToolId,
    toolNameByToolId,
    observer,
    onWriteFile,
    callbacks,
    sounds,
    appendThinkingToParts,
    setMessages,
    setIsSending,
    setPendingActions,
    getThreadItems,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setExecutionRuntime,
    soulCopy,
  } = options;

  if (!effectiveProviderType.trim() || !effectiveModel.trim()) {
    throw new Error(MODEL_SELECTION_REQUIRED_ERROR_MESSAGE);
  }

  let resolvedRequestMetadata = requestMetadata;
  let performanceTrace =
    extractAgentUiPerformanceTraceMetadata(requestMetadata);
  requestState.performanceTrace = performanceTrace;

  const {
    activeSessionId,
    resolvedWorkspaceId,
    submitWorkspaceId,
    syncedRecentPreferences,
    syncedExecutionStrategy,
    effectiveWaitingRuntimeStatus,
  } = await resolveAgentStreamSubmitContext({
    ensureSession,
    sessionIdRef,
    getWorkspaceIdForSubmit,
    getSyncedSessionRecentPreferences,
    getSyncedSessionExecutionStrategy,
    effectiveExecutionStrategy,
    assistantDraft,
    expectingQueue,
    targetSessionId,
    skipSessionRestore,
    skipSessionStartHooks,
    performanceTrace,
    soulCopy,
    activateStream: callbacks.activateStream,
  });
  const resolvedActiveSessionId = activeSessionId?.trim();
  if (!resolvedActiveSessionId) {
    throw new Error("缺少会话 ID，无法启动流式任务");
  }
  if (performanceTrace) {
    resolvedRequestMetadata = mergeAgentUiPerformanceTraceMetadata(
      requestMetadata,
      {
        ...performanceTrace,
        sessionId: resolvedActiveSessionId,
        workspaceId: resolvedWorkspaceId ?? performanceTrace.workspaceId,
      },
    );
    performanceTrace = extractAgentUiPerformanceTraceMetadata(
      resolvedRequestMetadata,
    );
    requestState.performanceTrace = performanceTrace;
  }
  const preserveAssistantContent =
    assistantDraft?.preserveContent === true
      ? assistantDraft.content?.trim() || null
      : null;
  const assistantFallbackContent =
    assistantDraft?.fallbackContent === undefined
      ? null
      : assistantDraft.fallbackContent.trim();
  const managedObjectiveText = extractInputbarManagedObjectiveText(
    resolvedRequestMetadata,
  );
  const eventBindingWorkspaceId = resolvedWorkspaceId ?? "";

  const unlisten = await registerAgentStreamTurnEventBinding({
    runtime,
    eventName,
    requestState,
    attemptSilentTurnRecovery,
    skipUserMessage,
    effectiveProviderType,
    effectiveModel,
    effectiveExecutionStrategy,
    systemPrompt,
    thinking,
    content,
    webSearch,
    autoContinue,
    expectingQueue,
    activeSessionId: resolvedActiveSessionId,
    resolvedWorkspaceId: eventBindingWorkspaceId,
    assistantMsgId,
    pendingTurnKey,
    pendingItemKey,
    effectiveWaitingRuntimeStatus,
    preserveAssistantContent,
    assistantFallbackContent,
    warnedKeysRef,
    actionLoggedKeys,
    toolLogIdByToolId,
    toolStartedAtByToolId,
    toolNameByToolId,
    observer,
    onWriteFile,
    callbacks: {
      activateStream: callbacks.activateStream,
      isStreamActivated: callbacks.isStreamActivated,
      clearOptimisticItem: callbacks.clearOptimisticItem,
      clearOptimisticTurn: callbacks.clearOptimisticTurn,
      disposeListener: callbacks.disposeListener,
      removeQueuedDraftMessages: callbacks.removeQueuedDraftMessages,
      clearActiveStreamIfMatch: callbacks.clearActiveStreamIfMatch,
      upsertQueuedTurn: callbacks.upsertQueuedTurn,
      removeQueuedTurnsFromProjection: callbacks.removeQueuedTurnsFromProjection,
    },
    sounds,
    appendThinkingToParts,
    setMessages,
    setPendingActions,
    getThreadItems,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setExecutionRuntime,
    setIsSending,
    soulCopy,
  });

  callbacks.registerListener(unlisten);

  await runAgentStreamSubmitLifecycle({
    activeSessionId: resolvedActiveSessionId,
    effectiveModel,
    effectiveProviderType,
    eventName,
    expectingQueue,
    onSubmitAccepted: () => {
      requestState.startTerminalRecoveryPoll?.();
    },
    requestState,
    submit: async () => {
      const { modelCapabilitySummary, modelRequestPolicyMetadata } =
        await resolveSubmitModelPolicy({
          images,
          providerType: effectiveProviderType,
          model: effectiveModel,
        });
      resolvedRequestMetadata = mergeModelRequestPolicyMetadata(
        resolvedRequestMetadata,
        modelRequestPolicyMetadata,
      );
      if (modelCapabilitySummary !== undefined) {
        resolvedRequestMetadata = mergeModelInputCapabilityGateMetadata(
          resolvedRequestMetadata,
          evaluateModelInputCapability(
            modelCapabilitySummary,
            buildModelCapabilitySendGateInput({
              text: content,
              imageCount: images.length,
            }),
          ),
        );
      }
      const submitOp = buildAgentStreamSubmitOp({
        content,
        images,
        activeSessionId: resolvedActiveSessionId,
        eventName,
        submitWorkspaceId,
        requestTurnId,
        systemPrompt,
        skipPreSubmitResume,
        requestMetadata: resolvedRequestMetadata,
        executionRuntime,
        syncedRecentPreferences,
        syncedSessionModelPreference,
        syncedExecutionStrategy,
        effectiveExecutionStrategy,
        effectiveAccessMode,
        effectiveProviderType,
        effectiveModel,
        modelOverride,
        reasoningEffort,
        webSearch,
        searchMode,
        thinking,
        explicitToolPreferences,
        autoContinue,
        modelCapabilitySummary,
      });

      if (managedObjectiveText) {
        try {
          await setAgentRuntimeObjective({
            sessionId: resolvedActiveSessionId,
            workspaceId: resolvedWorkspaceId,
            objectiveText: managedObjectiveText,
            successCriteria: [],
          });
        } catch (error) {
          console.warn("[AgentStream] 写入追求目标失败，继续发送消息:", error);
        }
      }
      await runtime.submitOp(submitOp);
    },
  });
}
