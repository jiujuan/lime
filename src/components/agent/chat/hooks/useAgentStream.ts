import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type {
  AsterExecutionStrategy,
  AsterSessionExecutionRuntime,
  AgentRuntimeThreadReadModel,
  AutoContinueRequestPayload,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import {
  type AgentThreadItem,
  type AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type { ActionRequired, Message, MessageImage } from "../types";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { AgentAccessMode } from "./agentChatStorage";
import { playToolcallSound, playTypewriterSound } from "./agentChatStorage";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import type {
  SendMessageOptions,
  SessionModelPreference,
  WorkspacePathMissingState,
} from "./agentChatShared";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestoreRequest,
} from "./agentStreamInputRestoreTypes";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import {
  createAgentStreamPreparedSendEnv,
  type AgentStreamPreparedSendEnv,
} from "./agentStreamPreparedSendEnv";
import {
  bindRecoveredAgentStreamThread,
  hasBlockingActiveAgentStreamBinding,
  resolveAgentStreamResumeBindingTarget,
} from "./agentStreamResumeBinding";
import { AgentStreamSubmitGate } from "./agentStreamSubmitGate";
import {
  normalizeAgentStreamCompactionError,
  runAgentStreamCompaction,
} from "./agentStreamCompaction";
import {
  promoteQueuedAgentTurn,
  removeQueuedAgentTurn,
  resumeAgentStreamThread,
  stopActiveAgentStream,
} from "./agentStreamFlowControl";
import { sendAgentStreamMessage } from "./agentStreamSend";
import { useAgentStreamController } from "./useAgentStreamController";

function appendThinkingToParts(
  parts: NonNullable<Message["contentParts"]>,
  textDelta: string,
): NonNullable<Message["contentParts"]> {
  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1];

  if (lastPart?.type === "thinking") {
    const base = lastPart.text;
    const chunk = textDelta;
    let merged: string;
    if (!base) {
      merged = chunk;
    } else if (!chunk) {
      merged = base;
    } else if (chunk.startsWith(base)) {
      merged = chunk;
    } else if (base.endsWith(chunk)) {
      merged = base;
    } else {
      const maxOverlap = Math.min(base.length, chunk.length);
      let found = false;
      merged = base + chunk;
      for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
        if (base.slice(-overlap) === chunk.slice(0, overlap)) {
          merged = base + chunk.slice(overlap);
          found = true;
          break;
        }
      }
      void found;
    }
    nextParts[nextParts.length - 1] = { type: "thinking", text: merged };
    return nextParts;
  }

  nextParts.push({ type: "thinking", text: textDelta });
  return nextParts;
}

function cloneInterruptedInputDraft(
  draft: InterruptedInputDraftSnapshot,
): InterruptedInputDraftSnapshot {
  return {
    text: draft.text,
    images: draft.images ? [...draft.images] : [],
    pathReferences: draft.pathReferences ? [...draft.pathReferences] : [],
    textElements: draft.textElements ? [...draft.textElements] : [],
    inputCapabilityRoute: draft.inputCapabilityRoute,
  };
}

interface UseAgentStreamOptions {
  runtime: AgentRuntimeAdapter;
  systemPrompt?: string;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: import("../types").WriteArtifactContext,
  ) => void;
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
  sessionId?: string | null;
  executionStrategy: AsterExecutionStrategy;
  accessMode: AgentAccessMode;
  providerTypeRef: MutableRefObject<string>;
  modelRef: MutableRefObject<string>;
  reasoningEffortRef: MutableRefObject<string>;
  getSyncedSessionModelPreference: (
    sessionId: string,
  ) => SessionModelPreference | null;
  getSyncedSessionExecutionStrategy: (
    sessionId: string,
  ) => AsterExecutionStrategy | null;
  getSyncedSessionRecentPreferences?: (
    sessionId: string,
  ) => ChatToolPreferences | null;
  currentAssistantMsgIdRef: MutableRefObject<string | null>;
  currentStreamingSessionIdRef: MutableRefObject<string | null>;
  currentStreamingEventNameRef: MutableRefObject<string | null>;
  warnedKeysRef: MutableRefObject<Set<string>>;
  getWorkspaceIdForSubmit: () => string | undefined;
  setWorkspacePathMissing: Dispatch<
    SetStateAction<WorkspacePathMissingState | null>
  >;
  getMessages?: () => readonly Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getThreadItems?: () => readonly AgentThreadItem[];
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setExecutionRuntime: Dispatch<
    SetStateAction<AsterSessionExecutionRuntime | null>
  >;
  threadBusy: boolean;
  currentTurnId?: string | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  threadTurns: readonly AgentThreadTurn[];
  queuedTurns: QueuedTurnSnapshot[];
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  onRestoreInterruptedInput?: (request: InterruptedInputRestoreRequest) => void;
  executionRuntime: AsterSessionExecutionRuntime | null;
  clawTraceEnabled?: boolean;
  allowRecoveredStreamBinding?: boolean;
  soulCopy?: SoulInteractionCopy;
}

export function useAgentStream(options: UseAgentStreamOptions) {
  const {
    runtime,
    systemPrompt,
    onWriteFile,
    ensureSession,
    attemptSilentTurnRecovery,
    sessionIdRef,
    sessionId,
    executionStrategy,
    accessMode,
    providerTypeRef,
    modelRef,
    reasoningEffortRef,
    getSyncedSessionModelPreference,
    getSyncedSessionExecutionStrategy,
    getSyncedSessionRecentPreferences,
    currentAssistantMsgIdRef,
    currentStreamingSessionIdRef,
    currentStreamingEventNameRef,
    warnedKeysRef,
    getWorkspaceIdForSubmit,
    setWorkspacePathMissing,
    getMessages,
    setMessages,
    getThreadItems,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setExecutionRuntime,
    threadBusy,
    currentTurnId,
    threadRead,
    threadTurns,
    queuedTurns,
    setQueuedTurns,
    setPendingActions,
    refreshSessionReadModel,
    onRestoreInterruptedInput,
    executionRuntime,
    clawTraceEnabled = false,
    allowRecoveredStreamBinding = false,
    soulCopy,
  } = options;

  const {
    isSending,
    setIsSending,
    listenerMapRef,
    activeStreamRef,
    setActiveStream,
    clearActiveStreamIfMatch,
    replaceStreamListener,
    removeStreamListener,
    clearStreamBindings,
  } = useAgentStreamController({
    currentAssistantMsgIdRef,
    currentStreamingSessionIdRef,
    currentStreamingEventNameRef,
  });
  const preparedSubmitGateRef = useRef(new AgentStreamSubmitGate());
  const submittedDraftFallbackRef =
    useRef<InterruptedInputDraftSnapshot | null>(null);
  const recoveredBindingAttemptKeyRef = useRef<string | null>(null);
  const getMessagesRef = useRef(getMessages);
  const getThreadItemsRef = useRef(getThreadItems);
  const queuedTurnsRef = useRef(queuedTurns);
  getMessagesRef.current = getMessages;
  getThreadItemsRef.current = getThreadItems;
  queuedTurnsRef.current = queuedTurns;

  const preparedSendEnv = useMemo<AgentStreamPreparedSendEnv>(
    () =>
      createAgentStreamPreparedSendEnv({
        queuedTurnsCount: queuedTurns.length,
        threadBusy,
        runtime,
        ensureSession,
        attemptSilentTurnRecovery,
        executionStrategy,
        accessMode,
        providerTypeRef,
        modelRef,
        reasoningEffortRef,
        sessionIdRef,
        hasPendingPreparedSubmit: () =>
          preparedSubmitGateRef.current.hasPending(),
        runPreparedSubmit: (task) => preparedSubmitGateRef.current.run(task),
        getWorkspaceIdForSubmit,
        getSyncedSessionModelPreference,
        getSyncedSessionExecutionStrategy,
        getSyncedSessionRecentPreferences,
        listenerMapRef,
        activeStreamRef,
        warnedKeysRef,
        onWriteFile,
        executionRuntime,
        clawTraceEnabled,
        soulCopy,
        setActiveStream,
        clearActiveStreamIfMatch,
        setMessages,
        getThreadItems,
        setThreadItems,
        setThreadTurns,
        setCurrentTurnId,
        setExecutionRuntime,
        setQueuedTurns,
        setPendingActions,
        setWorkspacePathMissing,
        setIsSending,
        playToolcallSound,
        playTypewriterSound,
        appendThinkingToParts,
      }),
    [
      activeStreamRef,
      accessMode,
      attemptSilentTurnRecovery,
      clearActiveStreamIfMatch,
      executionStrategy,
      ensureSession,
      executionRuntime,
      clawTraceEnabled,
      soulCopy,
      getWorkspaceIdForSubmit,
      getSyncedSessionModelPreference,
      getSyncedSessionExecutionStrategy,
      getSyncedSessionRecentPreferences,
      getThreadItems,
      listenerMapRef,
      modelRef,
      onWriteFile,
      providerTypeRef,
      reasoningEffortRef,
      queuedTurns.length,
      runtime,
      sessionIdRef,
      threadBusy,
      setActiveStream,
      setCurrentTurnId,
      setExecutionRuntime,
      setIsSending,
      setMessages,
      setPendingActions,
      setQueuedTurns,
      setThreadItems,
      setThreadTurns,
      setWorkspacePathMissing,
      warnedKeysRef,
    ],
  );

  const recoveredBindingTarget = useMemo(
    () =>
      resolveAgentStreamResumeBindingTarget({
        currentTurnId,
        queuedTurns,
        sessionId: sessionId ?? sessionIdRef.current,
        threadBusy,
        threadRead,
        threadTurns,
      }),
    [
      currentTurnId,
      queuedTurns,
      sessionId,
      sessionIdRef,
      threadBusy,
      threadRead,
      threadTurns,
    ],
  );
  const recoveredBindingKey = recoveredBindingTarget
    ? `${recoveredBindingTarget.sessionId}:${recoveredBindingTarget.turnId}`
    : null;
  const recoveredBindingTargetRef = useRef(recoveredBindingTarget);
  recoveredBindingTargetRef.current = recoveredBindingTarget;

  useEffect(() => {
    const target = recoveredBindingTargetRef.current;
    if (!allowRecoveredStreamBinding || !target || !recoveredBindingKey) {
      recoveredBindingAttemptKeyRef.current = null;
      return;
    }
    if (
      hasBlockingActiveAgentStreamBinding({
        activeStreamRef,
        listenerMapRef,
        target,
      })
    ) {
      return;
    }
    if (recoveredBindingAttemptKeyRef.current === recoveredBindingKey) {
      return;
    }

    recoveredBindingAttemptKeyRef.current = recoveredBindingKey;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void bindRecoveredAgentStreamThread({
      activeStreamRef,
      appendThinkingToParts,
      clearActiveStreamIfMatch,
      executionStrategy,
      getMessages: () => getMessagesRef.current?.() ?? [],
      getThreadItems: () => getThreadItemsRef.current?.() ?? [],
      listenerMapRef,
      onWriteFile,
      playToolcallSound,
      playTypewriterSound,
      refreshSessionReadModel,
      runtime,
      setActiveStream,
      setCurrentTurnId,
      setExecutionRuntime,
      setIsSending,
      setMessages,
      setPendingActions,
      setQueuedTurns,
      setThreadItems,
      setThreadTurns,
      soulCopy,
      target,
      warnedKeysRef,
    })
      .then((nextCleanup) => {
        if (disposed) {
          nextCleanup?.();
          return;
        }
        cleanup = nextCleanup;
        if (!nextCleanup) {
          recoveredBindingAttemptKeyRef.current = null;
        }
      })
      .catch((error) => {
        recoveredBindingAttemptKeyRef.current = null;
        console.error("[AsterChat] 绑定运行中会话失败:", error);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [
    activeStreamRef,
    allowRecoveredStreamBinding,
    clearActiveStreamIfMatch,
    executionStrategy,
    getMessagesRef,
    getThreadItemsRef,
    listenerMapRef,
    onWriteFile,
    recoveredBindingKey,
    recoveredBindingTargetRef,
    refreshSessionReadModel,
    runtime,
    setActiveStream,
    setCurrentTurnId,
    setExecutionRuntime,
    setIsSending,
    setMessages,
    setPendingActions,
    setQueuedTurns,
    setThreadItems,
    setThreadTurns,
    soulCopy,
    warnedKeysRef,
  ]);

  const sendMessage = useCallback(
    async (
      content: string,
      images: MessageImage[],
      webSearch?: boolean,
      _thinking?: boolean,
      skipUserMessage = false,
      executionStrategyOverride?: AsterExecutionStrategy,
      modelOverride?: string,
      autoContinue?: AutoContinueRequestPayload,
      options?: SendMessageOptions,
    ) => {
      submittedDraftFallbackRef.current = cloneInterruptedInputDraft(
        options?.inputRestoreDraft ?? {
          text: options?.displayContent ?? content,
          images,
          textElements: (options?.displayContent ?? content).trim()
            ? [{ type: "text", text: options?.displayContent ?? content }]
            : [],
          inputCapabilityRoute: options?.capabilityRoute,
        },
      );
      await sendAgentStreamMessage({
        content,
        images,
        webSearch,
        thinking: _thinking,
        skipUserMessage,
        executionStrategyOverride,
        modelOverride,
        autoContinue,
        systemPrompt,
        options,
        env: preparedSendEnv,
      });
    },
    [preparedSendEnv, systemPrompt],
  );

  const stopSending = useCallback(async () => {
    await stopActiveAgentStream({
      activeStream: activeStreamRef.current,
      sessionIdRef,
      runtime,
      removeStreamListener,
      refreshSessionReadModel,
      setThreadItems,
      setThreadTurns,
      setCurrentTurnId,
      setMessages,
      getMessages: () => getMessagesRef.current?.() ?? [],
      getQueuedTurns: () => queuedTurnsRef.current,
      setActiveStream,
      submittedDraftFallback: submittedDraftFallbackRef.current,
      onRestoreInterruptedInput,
      notify: {
        info: (message) => toast.info(message),
        error: () => undefined,
      },
      onInterruptError: (error) => {
        console.error("[AsterChat] 停止失败:", error);
      },
    });
    submittedDraftFallbackRef.current = null;
  }, [
    refreshSessionReadModel,
    runtime,
    sessionIdRef,
    onRestoreInterruptedInput,
    setActiveStream,
    setCurrentTurnId,
    setMessages,
    setThreadItems,
    setThreadTurns,
    removeStreamListener,
    activeStreamRef,
    queuedTurnsRef,
  ]);

  const removeQueuedTurn = useCallback(
    async (queuedTurnId: string) => {
      return removeQueuedAgentTurn({
        runtime,
        queuedTurnId,
        sessionIdRef,
        refreshSessionReadModel,
        notify: {
          info: () => undefined,
          error: (message) => toast.error(message),
        },
        onError: (error) => {
          console.error("[AsterChat] 移除排队消息失败:", error);
        },
      });
    },
    [refreshSessionReadModel, runtime, sessionIdRef],
  );

  const compactSession = useCallback(async () => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      toast.error("当前没有可压缩的会话");
      return;
    }

    if (activeStreamRef.current) {
      toast.info("当前仍有任务执行中，稍后再压缩上下文");
      return;
    }

    try {
      await runAgentStreamCompaction({
        runtime,
        sessionId: activeSessionId,
        warnedKeysRef,
        setActiveStream,
        clearActiveStreamIfMatch,
        replaceStreamListener,
        removeStreamListener,
        setIsSending,
        setCurrentTurnId,
        setThreadItems,
        setThreadTurns,
        notify: {
          info: (message) => toast.info(message),
          warning: (message) => toast.warning(message),
          error: (message) => toast.error(message),
        },
      });
    } catch (error) {
      const compactionError = normalizeAgentStreamCompactionError(error);
      console.error("[AsterChat] 压缩上下文失败:", compactionError);
      if (!compactionError.alreadyNotified) {
        toast.error(compactionError.message);
      }
    }
  }, [
    clearActiveStreamIfMatch,
    removeStreamListener,
    replaceStreamListener,
    runtime,
    sessionIdRef,
    setActiveStream,
    setIsSending,
    setCurrentTurnId,
    setThreadItems,
    setThreadTurns,
    warnedKeysRef,
    activeStreamRef,
  ]);

  const resumeThread = useCallback(async () => {
    return resumeAgentStreamThread({
      runtime,
      sessionIdRef,
      refreshSessionReadModel,
      notify: {
        info: (message) => toast.info(message),
        error: (message) => toast.error(message),
      },
      onError: (error) => {
        console.error("[AsterChat] 恢复线程执行失败:", error);
      },
    });
  }, [refreshSessionReadModel, runtime, sessionIdRef]);

  const promoteQueuedTurn = useCallback(
    async (queuedTurnId: string) => {
      return promoteQueuedAgentTurn({
        runtime,
        queuedTurnId,
        activeStream: activeStreamRef.current,
        removeStreamListener,
        sessionIdRef,
        refreshSessionReadModel,
        setThreadItems,
        setThreadTurns,
        setCurrentTurnId,
        setMessages,
        setActiveStream,
        notify: {
          info: (message) => toast.info(message),
          error: (message) => toast.error(message),
        },
        onError: (error) => {
          console.error("[AsterChat] 立即执行排队消息失败:", error);
        },
      });
    },
    [
      activeStreamRef,
      refreshSessionReadModel,
      removeStreamListener,
      runtime,
      sessionIdRef,
      setActiveStream,
      setCurrentTurnId,
      setMessages,
      setThreadItems,
      setThreadTurns,
    ],
  );

  return {
    isSending,
    sendMessage,
    compactSession,
    stopSending,
    resumeThread,
    promoteQueuedTurn,
    removeQueuedTurn,
    detachStreamBindings: clearStreamBindings,
  };
}
