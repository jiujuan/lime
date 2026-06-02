/**
 * Aster Agent Chat Hook
 *
 * 当前事实源：
 * useAsterAgentChat -> useAgentContext / useAgentSession / useAgentTools / useAgentStream
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import { getDefaultProvider } from "@/lib/api/appConfig";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import {
  defaultAgentRuntimeAdapter,
  type AgentRuntimeAdapter,
} from "./agentRuntimeAdapter";
import { createAgentChatSendMessage } from "./agentChatSendMessage";
import { useAgentChatStateSnapshotDebug } from "./useAgentChatStateSnapshotDebug";
import { useAgentContext } from "./useAgentContext";
import { useAgentRuntimeSyncEffects } from "./useAgentRuntimeSyncEffects";
import { useAgentSession } from "./useAgentSession";
import { useAgentTools } from "./useAgentTools";
import { useAgentStream } from "./useAgentStream";
import {
  type SendMessageFn,
  type UseAsterAgentChatOptions,
} from "./agentChatShared";
import type { AsterSessionExecutionRuntime } from "@/lib/api/agentRuntime";
import { useAgentTopicSnapshot } from "./useAgentTopicSnapshot";
import { resolveClawWorkspaceProviderSelection } from "../utils/clawWorkspaceProviderSelection";
import {
  applyGeneratedAutoTitleToTopics,
  buildAutoTitleConversationText,
  hasUserTextMessage,
  isAutoTitlePlaceholder,
  shouldGenerateAutoTitle,
} from "./agentChatAutoTitleViewModel";

export type { Topic } from "./agentChatShared";

type UseAsterAgentChatRuntimeOptions = UseAsterAgentChatOptions & {
  runtimeAdapter?: AgentRuntimeAdapter;
  preserveRestoredMessages?: boolean;
};

const AUTO_TITLE_DEFERRED_LOAD_MS = 30_000;
const AUTO_TITLE_IDLE_TIMEOUT_MS = 2_000;

export function useAsterAgentChat(options: UseAsterAgentChatRuntimeOptions) {
  const {
    systemPrompt,
    onWriteFile,
    workspaceId,
    disableSessionRestore = false,
    initialTopicsLoadMode = "immediate",
    initialTopicsDeferredDelayMs,
    initialRuntimeWarmupLoadMode = initialTopicsLoadMode,
    initialRuntimeWarmupDeferredDelayMs = initialTopicsDeferredDelayMs,
    getSyncedSessionRecentPreferences,
    runtimeAdapter,
    preserveRestoredMessages = false,
  } = options;
  const runtime = runtimeAdapter ?? defaultAgentRuntimeAdapter;

  const [isInitialized, setIsInitialized] = useState(false);
  const activeWorkspaceIdRef = useRef(workspaceId.trim());
  activeWorkspaceIdRef.current = workspaceId.trim();
  const runtimeWarmupPromiseRef = useRef<{
    workspaceId: string;
    promise: Promise<void>;
  } | null>(null);
  const runtimeReadyWorkspaceRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentAssistantMsgIdRef = useRef<string | null>(null);
  const currentStreamingSessionIdRef = useRef<string | null>(null);
  const currentStreamingEventNameRef = useRef<string | null>(null);
  const detachStreamBindingsRef = useRef<(() => void) | null>(null);
  const autoTitleInFlightSessionIdRef = useRef<string | null>(null);
  const autoTitleCompletedSessionIdsRef = useRef<Set<string>>(new Set());
  const sendMessageRef = useRef<SendMessageFn | null>(null);
  const resetPendingActionsRef = useRef<(() => void) | null>(null);
  const topicsUpdaterRef = useRef<
    | ((sessionId: string, executionStrategy: AsterExecutionStrategy) => void)
    | null
  >(null);

  const resetPendingActions = useCallback(() => {
    resetPendingActionsRef.current?.();
  }, []);

  const context = useAgentContext({
    workspaceId,
    sessionIdRef,
    topicsUpdaterRef,
    sendMessageRef,
    runtime,
  });

  const session = useAgentSession({
    runtime,
    workspaceId,
    disableSessionRestore,
    initialTopicsLoadMode,
    initialTopicsDeferredDelayMs,
    preserveRestoredMessages,
    executionStrategy: context.executionStrategy,
    accessMode: context.accessMode,
    providerTypeRef: context.providerTypeRef,
    modelRef: context.modelRef,
    sessionIdRef,
    currentAssistantMsgIdRef,
    currentStreamingSessionIdRef,
    currentStreamingEventNameRef,
    detachStreamBindingsRef,
    resetPendingActions,
    persistSessionModelPreference: context.persistSessionModelPreference,
    loadSessionModelPreference: context.loadSessionModelPreference,
    applySessionModelPreference: context.applySessionModelPreference,
    markSessionModelPreferenceSynced: context.markSessionModelPreferenceSynced,
    markSessionExecutionStrategySynced:
      context.markSessionExecutionStrategySynced,
    persistSessionAccessMode: context.persistSessionAccessMode,
    loadSessionAccessMode: context.loadSessionAccessMode,
    filterSessionsByWorkspace: context.filterSessionsByWorkspace,
    setExecutionStrategyState: context.setExecutionStrategyState,
    setAccessModeState: context.setAccessModeState,
  });
  const applyWorkspaceModelPreference = context.applyWorkspaceModelPreference;

  const resolveWarmupWorkspaceModelPreference = useCallback(
    async (
      status?: {
        provider_configured?: boolean;
        provider_name?: string;
        provider_selector?: string;
        model_name?: string;
      },
      targetWorkspaceId?: string,
    ) => {
      const isCurrentWorkspace = () =>
        !targetWorkspaceId ||
        activeWorkspaceIdRef.current === targetWorkspaceId;
      if (!isCurrentWorkspace() || sessionIdRef.current) {
        return;
      }

      const currentProviderType = context.providerTypeRef.current.trim();
      const currentModel = context.modelRef.current.trim();
      const hasPersistedWorkspacePreference = Boolean(
        currentProviderType && currentModel,
      );

      if (
        !hasPersistedWorkspacePreference &&
        status?.provider_configured &&
        (status.provider_selector?.trim() || status.provider_name?.trim()) &&
        status.model_name?.trim()
      ) {
        if (!isCurrentWorkspace()) {
          return;
        }
        applyWorkspaceModelPreference({
          providerType:
            status.provider_selector?.trim() || status.provider_name!.trim(),
          model: status.model_name.trim(),
        });
        return;
      }

      if (status?.provider_configured && hasPersistedWorkspacePreference) {
        return;
      }

      try {
        const defaultProvider = !hasPersistedWorkspacePreference
          ? (await getDefaultProvider()).trim()
          : "";
        if (!isCurrentWorkspace()) {
          return;
        }
        const fallbackProviderType = currentProviderType || defaultProvider;
        const resolvedSelection = await resolveClawWorkspaceProviderSelection({
          currentProviderType: fallbackProviderType || undefined,
          currentModel: currentModel || null,
          theme: "general",
        });

        if (!resolvedSelection || !isCurrentWorkspace()) {
          return;
        }

        applyWorkspaceModelPreference({
          providerType: resolvedSelection.providerType,
          model: resolvedSelection.model,
        });
      } catch (error) {
        console.warn("[AsterChat] 预热阶段解析工作区模型失败:", error);
      }
    },
    [applyWorkspaceModelPreference, context.modelRef, context.providerTypeRef],
  );

  const warmupRuntime = useCallback(async () => {
    const resolvedWorkspaceId = workspaceId.trim();
    if (!resolvedWorkspaceId) {
      runtimeReadyWorkspaceRef.current = null;
      runtimeWarmupPromiseRef.current = null;
      setIsInitialized(false);
      return;
    }

    if (runtimeReadyWorkspaceRef.current === resolvedWorkspaceId) {
      return;
    }

    const activeWarmup = runtimeWarmupPromiseRef.current;
    if (activeWarmup?.workspaceId === resolvedWorkspaceId) {
      await activeWarmup.promise;
      return;
    }

    const warmupPromise = runtime
      .init()
      .then(async (status) => {
        if (activeWorkspaceIdRef.current !== resolvedWorkspaceId) {
          return;
        }
        await resolveWarmupWorkspaceModelPreference(
          status,
          resolvedWorkspaceId,
        );
        if (activeWorkspaceIdRef.current !== resolvedWorkspaceId) {
          return;
        }
        runtimeReadyWorkspaceRef.current = resolvedWorkspaceId;
        setIsInitialized(true);
        console.log("[AsterChat] Agent 初始化成功");
      })
      .catch((err) => {
        if (runtimeReadyWorkspaceRef.current === resolvedWorkspaceId) {
          runtimeReadyWorkspaceRef.current = null;
        }
        setIsInitialized(false);
        console.error("[AsterChat] 初始化失败:", err);
        throw err;
      })
      .finally(() => {
        const active = runtimeWarmupPromiseRef.current;
        if (
          active?.workspaceId === resolvedWorkspaceId &&
          active.promise === warmupPromise
        ) {
          runtimeWarmupPromiseRef.current = null;
        }
      });

    runtimeWarmupPromiseRef.current = {
      workspaceId: resolvedWorkspaceId,
      promise: warmupPromise,
    };
    await warmupPromise;
  }, [resolveWarmupWorkspaceModelPreference, runtime, workspaceId]);

  const tools = useAgentTools({
    runtime,
    sessionIdRef,
    currentStreamingSessionIdRef,
    currentStreamingEventNameRef,
    messages: session.messages,
    setMessages: session.setMessages,
    setThreadItems: session.setThreadItems,
    refreshSessionReadModel: session.refreshSessionReadModel,
  });

  resetPendingActionsRef.current = () => tools.setPendingActions([]);

  const stream = useAgentStream({
    runtime,
    systemPrompt,
    onWriteFile,
    ensureSession: session.ensureSession,
    attemptSilentTurnRecovery: session.attemptSilentTurnRecovery,
    sessionIdRef,
    executionStrategy: context.executionStrategy,
    accessMode: context.accessMode,
    providerTypeRef: context.providerTypeRef,
    modelRef: context.modelRef,
    getSyncedSessionModelPreference: context.getSyncedSessionModelPreference,
    getSyncedSessionExecutionStrategy:
      context.getSyncedSessionExecutionStrategy,
    getSyncedSessionRecentPreferences,
    currentAssistantMsgIdRef,
    currentStreamingSessionIdRef,
    currentStreamingEventNameRef,
    warnedKeysRef: tools.warnedKeysRef,
    getRequiredWorkspaceId: context.getRequiredWorkspaceId,
    setWorkspacePathMissing: context.setWorkspacePathMissing,
    setMessages: session.setMessages,
    setThreadItems: session.setThreadItems,
    setThreadTurns: session.setThreadTurns,
    setCurrentTurnId: session.setCurrentTurnId,
    setExecutionRuntime: session.setExecutionRuntime,
    threadBusy:
      session.threadRead?.status === "running" ||
      session.threadRead?.status === "queued" ||
      session.threadTurns.some((turn) => turn.status === "running"),
    queuedTurns: session.queuedTurns,
    setQueuedTurns: session.setQueuedTurns,
    setPendingActions: tools.setPendingActions,
    refreshSessionReadModel: session.refreshSessionReadModel,
    executionRuntime: session.executionRuntime,
  });
  detachStreamBindingsRef.current = stream.detachStreamBindings;
  const setChatMessages = session.setMessages;
  const clearChatMessages = session.clearMessages;
  const createFreshSession = session.createFreshSession;
  const currentTurnId = session.currentTurnId;
  const activeSessionId = session.sessionId;
  const queuedTurnsCount = session.queuedTurns.length;
  const rawSendMessage = stream.sendMessage;
  const compactCurrentSession = stream.compactSession;
  const isStreamSending = stream.isSending;

  const appendLocalAssistantMessage = useCallback(
    (content: string) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          timestamp: new Date(),
        },
      ]);
    },
    [setChatMessages],
  );

  const sendMessage = useCallback<SendMessageFn>(
    async (...args) => {
      await warmupRuntime();
      const send = createAgentChatSendMessage({
        baseStatusSnapshot: {
          sessionId: activeSessionId,
          currentTurnId,
          providerType: context.providerTypeRef.current,
          model: context.modelRef.current,
          executionStrategy: context.executionStrategy,
          queuedTurnsCount,
          isSending: isStreamSending,
        },
        rawSendMessage,
        compactSession: compactCurrentSession,
        clearMessages: clearChatMessages,
        createFreshSession,
        appendAssistantMessage: appendLocalAssistantMessage,
        notifyInfo: (message) => toast.info(message),
        notifySuccess: (message) => toast.success(message),
      });
      await send(...args);
    },
    [
      appendLocalAssistantMessage,
      activeSessionId,
      clearChatMessages,
      compactCurrentSession,
      context.executionStrategy,
      context.modelRef,
      context.providerTypeRef,
      createFreshSession,
      currentTurnId,
      isStreamSending,
      queuedTurnsCount,
      rawSendMessage,
      warmupRuntime,
    ],
  );

  sendMessageRef.current = sendMessage;
  topicsUpdaterRef.current = session.updateTopicExecutionStrategy;

  const hasActiveTopic = Boolean(
    session.sessionId &&
    session.topics.some((topic) => topic.id === session.sessionId),
  );
  const activeExecutionRuntime =
    useMemo<AsterSessionExecutionRuntime | null>(() => {
      const threadStatus = session.threadRead?.status;
      const shouldPreferRuntime =
        stream.isSending ||
        threadStatus === "running" ||
        threadStatus === "queued";
      return shouldPreferRuntime ? session.executionRuntime : null;
    }, [
      session.executionRuntime,
      session.threadRead?.status,
      stream.isSending,
    ]);

  useAgentRuntimeSyncEffects({
    runtime,
    sessionIdRef,
    sessionId: session.sessionId,
    parentSessionId: session.subagentParentContext?.parent_session_id,
    isSending: stream.isSending,
    threadReadStatus: session.threadRead?.status,
    queuedTurnCount: session.queuedTurns.length,
    threadTurns: session.threadTurns,
    refreshSessionDetail: session.refreshSessionDetail,
  });

  useAgentTopicSnapshot({
    sessionId: session.sessionId,
    hasActiveTopic,
    suppressInactiveTopicWarning:
      session.isDetachedActiveSession === true ||
      session.isSessionHydrating === true,
    messages: session.messages,
    isSending: stream.isSending,
    pendingActionCount: tools.pendingActions.length,
    queuedTurnCount: session.queuedTurns.length,
    threadStatus:
      session.threadRead?.status ?? (session.currentTurnId ? "running" : null),
    workspaceId,
    workspacePathMissing: Boolean(context.workspacePathMissing),
    topicsCount: session.topics.length,
    updateTopicSnapshot: session.updateTopicSnapshot,
  });

  const sessionMessages = session.messages;
  const sessionTopics = session.topics;
  const sessionSetTopics = session.setTopics;
  const currentSessionId = session.sessionId;
  const activeSessionTitle = useMemo(() => {
    const activeSessionId = currentSessionId?.trim();
    if (!activeSessionId) {
      return null;
    }

    const activeTopic = sessionTopics.find(
      (topic) => topic.id === activeSessionId,
    );
    return activeTopic?.title?.trim() ?? null;
  }, [currentSessionId, sessionTopics]);

  useEffect(() => {
    const activeSessionId = currentSessionId?.trim();
    if (!activeSessionId || stream.isSending || !runtime.generateSessionTitle) {
      return;
    }

    if (activeSessionTitle === null) {
      return;
    }
    const shouldAutoGenerateTitle = shouldGenerateAutoTitle({
      activeSessionTitle,
      messages: sessionMessages,
    });
    if (!shouldAutoGenerateTitle) {
      autoTitleCompletedSessionIdsRef.current.add(activeSessionId);
      return;
    }

    if (!hasUserTextMessage(sessionMessages)) {
      return;
    }

    if (
      autoTitleCompletedSessionIdsRef.current.has(activeSessionId) ||
      autoTitleInFlightSessionIdRef.current === activeSessionId
    ) {
      return;
    }

    autoTitleInFlightSessionIdRef.current = activeSessionId;
    let cancelled = false;
    let titleApplied = false;

    const cancelDeferredTitle = scheduleMinimumDelayIdleTask(
      () => {
        void (async () => {
          try {
            const conversationText =
              buildAutoTitleConversationText(sessionMessages);

            const generatedTitle = (
              await runtime.generateSessionTitle?.(
                activeSessionId,
                conversationText,
              )
            )?.trim();
            if (
              cancelled ||
              !generatedTitle ||
              isAutoTitlePlaceholder(generatedTitle)
            ) {
              return;
            }

            await runtime.renameSession(activeSessionId, generatedTitle);
            sessionSetTopics((previous) =>
              applyGeneratedAutoTitleToTopics(
                previous,
                activeSessionId,
                generatedTitle,
              ),
            );
            titleApplied = true;
          } catch (error) {
            console.debug("[AsterChat] 自动生成会话标题失败:", error);
          } finally {
            if (!cancelled && titleApplied) {
              autoTitleCompletedSessionIdsRef.current.add(activeSessionId);
            }
            if (autoTitleInFlightSessionIdRef.current === activeSessionId) {
              autoTitleInFlightSessionIdRef.current = null;
            }
          }
        })();
      },
      {
        minimumDelayMs: AUTO_TITLE_DEFERRED_LOAD_MS,
        idleTimeoutMs: AUTO_TITLE_IDLE_TIMEOUT_MS,
      },
    );

    return () => {
      cancelled = true;
      cancelDeferredTitle();
      if (autoTitleInFlightSessionIdRef.current === activeSessionId) {
        autoTitleInFlightSessionIdRef.current = null;
      }
    };
  }, [
    activeSessionTitle,
    currentSessionId,
    runtime,
    sessionMessages,
    sessionSetTopics,
    stream.isSending,
  ]);

  useAgentChatStateSnapshotDebug({
    hasActiveTopic,
    isSending: stream.isSending,
    messagesCount: session.messages.length,
    pendingActionsCount: tools.pendingActions.length,
    queuedTurnsCount: session.queuedTurns.length,
    sessionId: session.sessionId ?? null,
    threadTurnsCount: session.threadTurns.length,
    topicsCount: session.topics.length,
    workspaceId,
    workspacePathMissing: context.workspacePathMissing,
  });

  useEffect(() => {
    tools.warnedKeysRef.current.clear();
  }, [tools.warnedKeysRef, workspaceId]);

  useEffect(() => {
    const resolvedWorkspaceId = workspaceId.trim();
    if (runtimeReadyWorkspaceRef.current !== resolvedWorkspaceId) {
      setIsInitialized(false);
    }
    if (!resolvedWorkspaceId) {
      runtimeReadyWorkspaceRef.current = null;
      runtimeWarmupPromiseRef.current = null;
      setIsInitialized(false);
      return;
    }

    if (initialRuntimeWarmupLoadMode === "deferred") {
      return scheduleMinimumDelayIdleTask(
        () => {
          void warmupRuntime().catch(() => undefined);
        },
        {
          minimumDelayMs: initialRuntimeWarmupDeferredDelayMs ?? 0,
        },
      );
    }

    void warmupRuntime().catch(() => undefined);
  }, [
    initialRuntimeWarmupDeferredDelayMs,
    initialRuntimeWarmupLoadMode,
    warmupRuntime,
    workspaceId,
  ]);

  const handleStartProcess = async () => {
    try {
      await warmupRuntime();
    } catch {
      return;
    }
  };

  const handleStopProcess = async () => {
    session.clearMessages({ showToast: false });
  };

  return {
    processStatus: { running: isInitialized },
    handleStartProcess,
    handleStopProcess,

    providerType: context.providerType,
    setProviderType: context.setProviderType,
    model: context.model,
    setModel: context.setModel,
    executionStrategy: context.executionStrategy,
    setExecutionStrategy: context.setExecutionStrategy,
    accessMode: context.accessMode,
    setAccessMode: context.setAccessMode,
    providerConfig: {},
    isConfigLoading: false,

    messages: session.messages,
    setMessages: session.setMessages,
    currentThreadId: session.sessionId,
    currentTurnId: session.currentTurnId,
    turns: session.threadTurns,
    threadItems: session.threadItems,
    todoItems: session.todoItems,
    childSubagentSessions: session.childSubagentSessions,
    subagentParentContext: session.subagentParentContext,
    queuedTurns: session.queuedTurns,
    threadRead: session.threadRead,
    executionRuntime: session.executionRuntime,
    activeExecutionRuntime,
    isSending: stream.isSending,
    sendMessage,
    compactSession: stream.compactSession,
    stopSending: stream.stopSending,
    resumeThread: stream.resumeThread,
    replayPendingAction: tools.replayPendingAction,
    promoteQueuedTurn: stream.promoteQueuedTurn,
    removeQueuedTurn: stream.removeQueuedTurn,
    clearMessages: session.clearMessages,
    deleteMessage: session.deleteMessage,
    editMessage: session.editMessage,
    handlePermissionResponse: tools.handlePermissionResponse,
    triggerAIGuide: context.triggerAIGuide,

    topics: session.topics,
    topicsReady: session.topicsReady,
    sessionHistoryWindow: session.sessionHistoryWindow,
    isAutoRestoringSession: session.isAutoRestoringSession,
    isSessionHydrating: session.isSessionHydrating,
    sessionId: session.sessionId,
    createFreshSession: session.createFreshSession,
    ensureSession: session.ensureSession,
    switchTopic: session.switchTopic,
    loadFullSessionHistory: session.loadFullSessionHistory,
    refreshSessionReadModel: session.refreshSessionReadModel,
    deleteTopic: session.deleteTopic,
    renameTopic: session.renameTopic,
    loadTopics: session.loadTopics,
    updateTopicSnapshot: session.updateTopicSnapshot,

    pendingActions: tools.pendingActions,
    submittedActionsInFlight: tools.submittedActionsInFlight,
    confirmAction: tools.confirmAction,

    workspacePathMissing: context.workspacePathMissing,
    fixWorkspacePathAndRetry: context.fixWorkspacePathAndRetry,
    dismissWorkspacePathError: context.dismissWorkspacePathError,
  };
}
