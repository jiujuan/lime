import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
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
import { resolveInterruptedInputRestorePlan } from "./agentStreamInputRestorePlan";
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
  threadId?: string | null;
  currentTurnId?: string | null;
  runtime: AgentRuntimeAdapter;
  removeStreamListener: (eventName: string) => boolean;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getMessages?: () => readonly Message[];
  getThreadItems?: () => readonly AgentThreadItem[];
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
  threadItems: readonly AgentThreadItem[];
}): string | undefined {
  const { activeStream, activeSessionId, threadItems } = options;
  const activeThreadId = activeStream?.sessionId || activeSessionId;
  const readTurnId = (value?: string | null): string | undefined => {
    const turnId = normalizeConcreteTurnId(value);
    return turnId;
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
  threadItems: readonly AgentThreadItem[];
}): string | undefined {
  const {
    activeStream,
    activeSessionId,
    assistantMessage,
    interruptTurnId,
    threadItems,
  } = options;
  const readTurnId = (value?: string | null): string | undefined => {
    const turnId = normalizeConcreteTurnId(value);
    return turnId;
  };

  return (
    readTurnId(interruptTurnId) ??
    readTurnId(assistantMessage?.runtimeTurnId) ??
    resolveThreadItemInterruptedTurnId({
      activeStream,
      activeSessionId,
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

export async function stopActiveAgentStream(options: StopAgentStreamOptions) {
  const {
    activeStream,
    sessionIdRef,
    threadId,
    currentTurnId,
    runtime,
    removeStreamListener,
    refreshSessionReadModel,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
    setMessages,
    getMessages,
    getThreadItems,
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
  const restorePlan = resolveInterruptedInputRestorePlan({
    submittedDraft: activeStream?.submittedDraft ?? submittedDraftFallback,
    assistantMessage,
  });
  const interruptTurnId = resolveInterruptTurnId(activeStream);
  const interruptedRuntimeTurnId = resolveInterruptedRuntimeTurnId({
    activeStream,
    activeSessionId,
    assistantMessage,
    interruptTurnId,
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
      const turnIdForCancel =
        interruptTurnId ??
        interruptedRuntimeTurnId ??
        normalizeConcreteTurnId(currentTurnId);
      const canonicalThreadId = threadId?.trim();
      if (turnIdForCancel && canonicalThreadId) {
        await runtime.interruptTurn(
          canonicalThreadId,
          turnIdForCancel,
          activeStream?.eventName,
        );
      } else if (turnIdForCancel) {
        onInterruptError?.(
          new Error("缺少 canonical threadId，无法中止当前回合"),
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
      prev.map((msg) =>
        msg.id === activeStream.assistantMsgId
          ? (() => {
              const interruptedMessage = settleInterruptedMessageProcess(msg);
              return {
                ...updateMessageArtifactsStatus(interruptedMessage, "complete"),
                ...buildInterruptedMessageContentPatch(interruptedMessage),
                isThinking: false,
                runtimeTurnId:
                  interruptedRuntimeTurnId ?? interruptedMessage.runtimeTurnId,
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
