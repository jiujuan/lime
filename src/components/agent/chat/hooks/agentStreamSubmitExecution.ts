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
import { extractAgentUiPerformanceTraceMetadata } from "./agentStreamPerformanceMetrics";
import { extractInputbarManagedObjectiveText } from "../components/Inputbar/utils/inputbarModeRequestMetadata";

type MessageParts = NonNullable<Message["contentParts"]>;

interface ExecuteAgentStreamSubmitOptions {
  runtime: AgentRuntimeAdapter;
  ensureSession: (options?: {
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
    removeQueuedTurnState: (queuedTurnIds: string[]) => void;
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
  } = options;

  const performanceTrace =
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
    skipSessionRestore,
    skipSessionStartHooks,
    performanceTrace,
    activateStream: callbacks.activateStream,
  });
  const resolvedActiveSessionId = activeSessionId?.trim();
  if (!resolvedActiveSessionId) {
    throw new Error("缺少会话 ID，无法启动流式任务");
  }
  const preserveAssistantContent =
    assistantDraft?.preserveContent === true
      ? assistantDraft.content?.trim() || null
      : null;
  const assistantFallbackContent =
    assistantDraft?.fallbackContent?.trim() || null;
  const managedObjectiveText =
    extractInputbarManagedObjectiveText(requestMetadata);
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
      removeQueuedTurnState: callbacks.removeQueuedTurnState,
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
      await runtime.submitOp(
        buildAgentStreamSubmitOp({
          content,
          images,
          activeSessionId: resolvedActiveSessionId,
          eventName,
          submitWorkspaceId,
          requestTurnId,
          systemPrompt,
          skipPreSubmitResume,
          requestMetadata,
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
        }),
      );
    },
  });
}
