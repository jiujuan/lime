import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import { logAgentDebug } from "@/lib/agentDebug";
import type { Message } from "../types";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestoreRequest,
} from "./agentStreamInputRestoreTypes";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import {
  removeThreadItemState,
  removeThreadTurnState,
} from "./agentThreadState";
import { rememberLocallyInterruptedAgentStreamBinding } from "./agentStreamResumeBinding";
import { clearAgentStreamTextOverlay } from "./agentStreamTextOverlayStore";
import {
  resolveInterruptedInputRestorePlan,
  resolveQueuedTurnsForRestore,
} from "./agentStreamInputRestorePlan";
import type { ChatRuntimeQueueControlProjection } from "../projection/chatRuntimeQueueControlProjection";
import {
  buildInterruptedMessageContentPatch,
  markInterruptedAgentMessageThreadItems,
} from "./agentInterruptedMessageContent";

export { buildInterruptedMessageContentPatch } from "./agentInterruptedMessageContent";

interface AgentStreamFlowNotify {
  info: (message: string) => void;
  error: (message: string) => void;
}

interface StopAgentStreamOptions {
  activeStream: ActiveStreamState | null;
  sessionIdRef: MutableRefObject<string | null>;
  runtime: AgentRuntimeAdapter;
  removeStreamListener: (eventName: string) => boolean;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getMessages?: () => readonly Message[];
  getThreadItems?: () => readonly AgentThreadItem[];
  getQueuedTurns?: () => readonly QueuedTurnSnapshot[];
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  submittedDraftFallback?: InterruptedInputDraftSnapshot | null;
  onRestoreInterruptedInput?: (request: InterruptedInputRestoreRequest) => void;
  notify: AgentStreamFlowNotify;
  onInterruptError?: (error: unknown) => void;
}

function resolveInterruptTurnId(activeStream: ActiveStreamState | null) {
  const explicitTurnId = activeStream?.turnId?.trim();
  if (explicitTurnId) {
    return explicitTurnId;
  }

  const pendingTurnKey = activeStream?.pendingTurnKey?.trim();
  if (pendingTurnKey && !pendingTurnKey.startsWith("pending-turn:")) {
    return pendingTurnKey;
  }

  return undefined;
}

function normalizeConcreteTurnId(value?: string | null): string | undefined {
  const turnId = value?.trim();
  if (!turnId || turnId.startsWith("pending-turn:")) {
    return undefined;
  }
  return turnId;
}

function isSameSessionItem(
  item: AgentThreadItem,
  sessionId?: string | null,
): boolean {
  const normalizedSessionId = sessionId?.trim();
  return !normalizedSessionId || item.thread_id === normalizedSessionId;
}

function resolveThreadItemInterruptedTurnId(options: {
  activeStream: ActiveStreamState | null;
  activeSessionId?: string | null;
  restoredQueuedTurnId?: string;
  threadItems: readonly AgentThreadItem[];
}): string | undefined {
  const { activeStream, activeSessionId, restoredQueuedTurnId, threadItems } =
    options;
  const activeThreadId = activeStream?.sessionId || activeSessionId;
  const readTurnId = (value?: string | null): string | undefined => {
    const turnId = normalizeConcreteTurnId(value);
    return turnId && turnId !== restoredQueuedTurnId ? turnId : undefined;
  };

  const pendingItemKey = activeStream?.pendingItemKey?.trim();
  if (pendingItemKey) {
    const pendingItemTurnId = readTurnId(
      threadItems.find((item) => item.id === pendingItemKey)?.turn_id,
    );
    if (pendingItemTurnId) {
      return pendingItemTurnId;
    }
  }

  const sameSessionItems = threadItems.filter((item) =>
    isSameSessionItem(item, activeThreadId),
  );
  const findLatestTurnId = (predicate: (item: AgentThreadItem) => boolean) => {
    for (let index = sameSessionItems.length - 1; index >= 0; index -= 1) {
      const item = sameSessionItems[index];
      if (!item || !predicate(item)) {
        continue;
      }
      const turnId = readTurnId(item.turn_id);
      if (turnId) {
        return turnId;
      }
    }
    return undefined;
  };

  return (
    findLatestTurnId(
      (item) => item.status === "in_progress" && item.type === "agent_message",
    ) ?? findLatestTurnId((item) => item.status === "in_progress")
  );
}

function resolveInterruptedRuntimeTurnId(options: {
  activeStream: ActiveStreamState | null;
  activeSessionId?: string | null;
  assistantMessage?: Message | null;
  interruptTurnId?: string;
  restoredQueuedTurnId?: string;
  threadItems: readonly AgentThreadItem[];
}): string | undefined {
  const {
    activeStream,
    activeSessionId,
    assistantMessage,
    interruptTurnId,
    restoredQueuedTurnId,
    threadItems,
  } = options;
  const readTurnId = (value?: string | null): string | undefined => {
    const turnId = normalizeConcreteTurnId(value);
    return turnId && turnId !== restoredQueuedTurnId ? turnId : undefined;
  };

  return (
    readTurnId(interruptTurnId) ??
    readTurnId(assistantMessage?.runtimeTurnId) ??
    resolveThreadItemInterruptedTurnId({
      activeStream,
      activeSessionId,
      restoredQueuedTurnId,
      threadItems,
    })
  );
}

const INTERRUPTED_TOOL_RESULT_TEXT = "本轮已中止";

function settleInterruptedToolCall<
  T extends { status: string; result?: unknown; endTime?: Date },
>(toolCall: T): T {
  if (toolCall.status !== "running") {
    return toolCall;
  }

  return {
    ...toolCall,
    status: "failed",
    endTime: new Date(),
    result: {
      success: false,
      output: "",
      error: INTERRUPTED_TOOL_RESULT_TEXT,
    },
  };
}

export function settleInterruptedMessageProcess(message: Message): Message {
  const nextToolCalls = message.toolCalls?.map(settleInterruptedToolCall);
  const nextContentParts = message.contentParts?.map((part) => {
    if (part.type !== "tool_use") {
      return part;
    }

    return {
      ...part,
      toolCall: settleInterruptedToolCall(part.toolCall),
    };
  });

  return {
    ...message,
    toolCalls: nextToolCalls,
    contentParts: nextContentParts,
  };
}

interface QueueActionOptions {
  sessionIdRef: MutableRefObject<string | null>;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  notify: AgentStreamFlowNotify;
}

interface RemoveQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "removeQueuedTurn">;
  queuedTurnId: string;
  onError?: (error: unknown) => void;
}

interface PromoteQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<
    AgentRuntimeAdapter,
    | "getThreadQueueControl"
    | "interruptTurn"
    | "promoteQueuedTurn"
    | "resumeThread"
  >;
  threadId?: string | null;
  queuedTurnId: string;
  activeStream: ActiveStreamState | null;
  removeStreamListener: (eventName: string) => boolean;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  onError?: (error: unknown) => void;
}

interface ResumeThreadOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "resumeThread">;
  onError?: (error: unknown) => void;
}

export async function stopActiveAgentStream(options: StopAgentStreamOptions) {
  const {
    activeStream,
    sessionIdRef,
    runtime,
    removeStreamListener,
    refreshSessionReadModel,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    getMessages,
    getThreadItems,
    getQueuedTurns,
    setActiveStream,
    submittedDraftFallback,
    onRestoreInterruptedInput,
    notify,
    onInterruptError,
  } = options;

  if (activeStream) {
    removeStreamListener(activeStream.eventName);
  }
  rememberLocallyInterruptedAgentStreamBinding(activeStream);

  const activeSessionId = activeStream?.sessionId || sessionIdRef.current;
  const assistantMessage =
    activeStream?.assistantMsgId && getMessages
      ? (getMessages().find(
          (message) => message.id === activeStream.assistantMsgId,
        ) ?? null)
      : null;
  const currentThreadItems = getThreadItems?.() ?? [];
  const initialQueuedTurns = getQueuedTurns?.() ?? [];
  let restorePlan = resolveInterruptedInputRestorePlan({
    submittedDraft: activeStream?.submittedDraft ?? submittedDraftFallback,
    assistantMessage,
    queuedTurns: initialQueuedTurns,
  });
  const refreshedQueuedTurns = await resolveQueuedTurnsForRestore({
    activeSessionId,
    initialQueuedTurns,
    onError: onInterruptError,
    restorePlan,
    runtime,
  });
  if (refreshedQueuedTurns !== initialQueuedTurns) {
    restorePlan = resolveInterruptedInputRestorePlan({
      submittedDraft: activeStream?.submittedDraft ?? submittedDraftFallback,
      assistantMessage,
      queuedTurns: refreshedQueuedTurns,
    });
  }
  const queuedTurnToRestore =
    onRestoreInterruptedInput &&
    restorePlan.queuedTurnHandling === "restore_first"
      ? restorePlan.queuedTurns[0]
      : null;
  const restoredQueuedTurnId = queuedTurnToRestore?.queued_turn_id?.trim();
  const interruptTurnId = resolveInterruptTurnId(activeStream);
  const interruptedRuntimeTurnId = resolveInterruptedRuntimeTurnId({
    activeStream,
    activeSessionId,
    assistantMessage,
    interruptTurnId,
    restoredQueuedTurnId,
    threadItems: currentThreadItems,
  });
  logAgentDebug("AgentStream", "inputRestorePlan", {
    assistantMessageContentLength:
      assistantMessage?.content?.trim().length ?? 0,
    assistantMessagePartCount: assistantMessage?.contentParts?.length ?? 0,
    draftImageCount: restorePlan.draft?.images?.length ?? 0,
    draftPathReferenceCount: restorePlan.draft?.pathReferences?.length ?? 0,
    draftTextLength: restorePlan.draft?.text.trim().length ?? 0,
    eventName: activeStream?.eventName ?? null,
    hasActiveStream: Boolean(activeStream),
    hasActiveStreamDraft: Boolean(activeStream?.submittedDraft),
    hasSubmittedDraftFallback: Boolean(submittedDraftFallback),
    queuedTurnsAvailableCount: restorePlan.queuedTurns.length,
    queuedTurnsRefreshed: refreshedQueuedTurns !== initialQueuedTurns,
    queuedTurnHandling: restorePlan.queuedTurnHandling,
    queuedTurnToRestoreId: queuedTurnToRestore?.queued_turn_id ?? null,
    reason: restorePlan.reason,
    shouldRestoreComposer: restorePlan.shouldRestoreComposer,
  });
  const restoreInterruptedInput = () => {
    if (!restorePlan.shouldRestoreComposer || !restorePlan.draft) {
      return;
    }
    logAgentDebug("AgentStream", "inputRestoreDispatch", {
      draftImageCount: restorePlan.draft.images?.length ?? 0,
      draftPathReferenceCount: restorePlan.draft.pathReferences?.length ?? 0,
      draftTextLength: restorePlan.draft.text.trim().length,
      eventName: activeStream?.eventName ?? null,
      reason: restorePlan.reason,
    });
    onRestoreInterruptedInput?.({
      requestId: crypto.randomUUID(),
      reason: restorePlan.reason,
      draft: restorePlan.draft,
    });
  };
  const runInterruptAndRefresh = async () => {
    if (!activeSessionId) {
      return;
    }
    try {
      if (queuedTurnToRestore?.queued_turn_id) {
        await runtime.removeQueuedTurn(
          activeSessionId,
          queuedTurnToRestore.queued_turn_id,
        );
      }
    } catch (error) {
      onInterruptError?.(error);
    }
    try {
      const turnIdForCancel = interruptTurnId ?? interruptedRuntimeTurnId;
      if (
        turnIdForCancel &&
        (!restoredQueuedTurnId || turnIdForCancel !== restoredQueuedTurnId)
      ) {
        await runtime.interruptTurn(
          activeSessionId,
          turnIdForCancel,
          activeStream?.eventName,
        );
      }
    } catch (error) {
      onInterruptError?.(error);
    }
    try {
      await refreshSessionReadModel(activeSessionId);
    } catch (error) {
      onInterruptError?.(error);
    }
  };

  if (activeStream?.assistantMsgId) {
    clearAgentStreamTextOverlay(activeStream.assistantMsgId);
    if (activeStream.pendingItemKey || interruptedRuntimeTurnId) {
      setThreadItems((prev) => {
        const nextItems = activeStream.pendingItemKey
          ? removeThreadItemState(prev, activeStream.pendingItemKey)
          : prev;
        return markInterruptedAgentMessageThreadItems(
          nextItems,
          new Set(interruptedRuntimeTurnId ? [interruptedRuntimeTurnId] : []),
        );
      });
    }
    if (activeStream.pendingTurnKey) {
      setThreadTurns((prev) =>
        removeThreadTurnState(prev, activeStream.pendingTurnKey!),
      );
      setCurrentTurnId((prev) =>
        prev === activeStream.pendingTurnKey ? null : prev,
      );
    }
    setMessages((prev) =>
      prev
        .filter(
          (msg) =>
            !restoredQueuedTurnId ||
            msg.runtimeTurnId !== restoredQueuedTurnId,
        )
        .map((msg) =>
          msg.id === activeStream.assistantMsgId
            ? (() => {
                const interruptedMessage = settleInterruptedMessageProcess(msg);
                return {
                  ...updateMessageArtifactsStatus(
                    interruptedMessage,
                    "complete",
                  ),
                  ...buildInterruptedMessageContentPatch(interruptedMessage),
                  isThinking: false,
                  runtimeTurnId:
                    interruptedRuntimeTurnId ??
                    interruptedMessage.runtimeTurnId,
                  runtimeStatus: undefined,
                };
              })()
            : msg,
        ),
    );
    clearAgentStreamTextOverlay(activeStream.assistantMsgId);
  }

  setActiveStream(null);
  restoreInterruptedInput();
  notify.info("已停止生成");
  void runInterruptAndRefresh();
}

export async function removeQueuedAgentTurn(options: RemoveQueuedTurnOptions) {
  const {
    runtime,
    queuedTurnId,
    sessionIdRef,
    refreshSessionReadModel,
    notify,
    onError,
  } = options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId || !queuedTurnId.trim()) {
    return false;
  }

  try {
    const removed = await runtime.removeQueuedTurn(
      activeSessionId,
      queuedTurnId,
    );
    await refreshSessionReadModel(activeSessionId);
    return removed;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("移除排队消息失败");
    return false;
  }
}

function settleActiveStreamForQueuedPromotion(options: {
  activeStream: ActiveStreamState;
  removeStreamListener: (eventName: string) => boolean;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
}) {
  const {
    activeStream,
    removeStreamListener,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    setActiveStream,
  } = options;

  removeStreamListener(activeStream.eventName);
  if (activeStream.pendingItemKey) {
    setThreadItems((prev) =>
      removeThreadItemState(prev, activeStream.pendingItemKey!),
    );
  }
  if (activeStream.pendingTurnKey) {
    setThreadTurns((prev) =>
      removeThreadTurnState(prev, activeStream.pendingTurnKey!),
    );
    setCurrentTurnId((prev) =>
      prev === activeStream.pendingTurnKey ? null : prev,
    );
  }
  if (activeStream.assistantMsgId) {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === activeStream.assistantMsgId
          ? {
              ...updateMessageArtifactsStatus(msg, "complete"),
              isThinking: false,
              runtimeStatus: undefined,
            }
          : msg,
      ),
    );
  }
  setActiveStream(null);
}

function resolveQueuedPromotionInterruptTurnId(
  projection: ChatRuntimeQueueControlProjection,
) {
  return projection.activeTurnId ?? undefined;
}

export async function promoteQueuedAgentTurn(
  options: PromoteQueuedTurnOptions,
) {
  const {
    runtime,
    threadId,
    queuedTurnId,
    activeStream,
    removeStreamListener,
    sessionIdRef,
    refreshSessionReadModel,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    setActiveStream,
    notify,
    onError,
  } = options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId || !queuedTurnId.trim()) {
    logAgentDebug("AgentStream", "queuedPromotion.skipped", {
      hasSessionId: Boolean(activeSessionId),
      queuedTurnId,
    });
    return false;
  }

  try {
    logAgentDebug("AgentStream", "queuedPromotion.start", {
      activeStreamEventName: activeStream?.eventName ?? null,
      activeStreamTurnId: resolveInterruptTurnId(activeStream) ?? null,
      queuedTurnId,
      sessionId: activeSessionId,
    });
    const canonicalThreadId = threadId?.trim();
    if (!canonicalThreadId) {
      await refreshSessionReadModel(activeSessionId);
      return false;
    }
    const queueProjection =
      await runtime.getThreadQueueControl(canonicalThreadId);
    const queuedTurnIdsBeforePromote = new Set(queueProjection.queuedTurnIds);
    if (!queuedTurnIdsBeforePromote.has(queuedTurnId.trim())) {
      await refreshSessionReadModel(activeSessionId);
      return false;
    }
    const interruptTurnId =
      resolveQueuedPromotionInterruptTurnId(queueProjection);
    logAgentDebug("AgentStream", "queuedPromotion.readModelResolved", {
      interruptTurnId: interruptTurnId ?? null,
      queuedTurnIds: Array.from(queuedTurnIdsBeforePromote),
      readModelRunningTurnId: queueProjection.activeTurnId,
      sessionId: activeSessionId,
    });
    const promoted = await runtime.promoteQueuedTurn(
      activeSessionId,
      queuedTurnId,
    );
    logAgentDebug("AgentStream", "queuedPromotion.promoteResult", {
      promoted,
      queuedTurnId,
      sessionId: activeSessionId,
    });
    if (!promoted) {
      await refreshSessionReadModel(activeSessionId);
      return false;
    }

    if (interruptTurnId) {
      const localInterruptTurnId = resolveInterruptTurnId(activeStream);
      const interrupted = await runtime.interruptTurn(
        activeSessionId,
        interruptTurnId,
        localInterruptTurnId === interruptTurnId
          ? activeStream?.eventName
          : undefined,
      );
      logAgentDebug("AgentStream", "queuedPromotion.interruptResult", {
        interrupted,
        interruptTurnId,
        passedEventName:
          localInterruptTurnId === interruptTurnId
            ? (activeStream?.eventName ?? null)
            : null,
        sessionId: activeSessionId,
      });
      if (!interrupted) {
        await refreshSessionReadModel(activeSessionId);
        notify.error("立即执行排队消息失败");
        return false;
      }
    }

    if (activeStream) {
      settleActiveStreamForQueuedPromotion({
        activeStream,
        removeStreamListener,
        setThreadItems,
        setThreadTurns,
        setCurrentTurnId,
        setMessages,
        setActiveStream,
      });
    }

    const resumed = await runtime.resumeThread(activeSessionId);
    await refreshSessionReadModel(activeSessionId);
    logAgentDebug("AgentStream", "queuedPromotion.resumeResult", {
      resumed,
      sessionId: activeSessionId,
    });
    if (!resumed) {
      notify.error("立即执行排队消息失败");
      return false;
    }

    notify.info("正在切换到该排队任务");
    return true;
  } catch (error) {
    logAgentDebug(
      "AgentStream",
      "queuedPromotion.failed",
      {
        error,
        queuedTurnId,
        sessionId: activeSessionId,
      },
      { level: "error" },
    );
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("立即执行排队消息失败");
    return false;
  }
}

export async function resumeAgentStreamThread(options: ResumeThreadOptions) {
  const { runtime, sessionIdRef, refreshSessionReadModel, notify, onError } =
    options;
  const activeSessionId = sessionIdRef.current;
  if (!activeSessionId) {
    return false;
  }

  try {
    const resumed = await runtime.resumeThread(activeSessionId);
    await refreshSessionReadModel(activeSessionId);
    if (resumed) {
      notify.info("正在恢复排队执行");
    }
    return resumed;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("恢复线程执行失败");
    return false;
  }
}
