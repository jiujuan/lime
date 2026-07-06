import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type {
  InterruptedInputDraftSnapshot,
  InterruptedInputRestorePlan,
  InterruptedInputRestoreRequest,
} from "./agentStreamInputRestoreTypes";
import { updateMessageArtifactsStatus } from "../utils/messageArtifacts";
import {
  removeThreadItemState,
  removeThreadTurnState,
} from "./agentThreadState";

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
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getMessages?: () => readonly Message[];
  getQueuedTurns?: () => readonly QueuedTurnSnapshot[];
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
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

const INTERRUPTED_TOOL_RESULT_TEXT = "本轮已中止";

function hasDraftPayload(draft: InterruptedInputDraftSnapshot): boolean {
  return (
    draft.text.trim().length > 0 ||
    (draft.images?.length ?? 0) > 0 ||
    (draft.pathReferences?.length ?? 0) > 0 ||
    (draft.textElements?.length ?? 0) > 0 ||
    Boolean(draft.inputCapabilityRoute)
  );
}

function normalizeInterruptedInputDraft(
  draft: InterruptedInputDraftSnapshot | null | undefined,
): InterruptedInputDraftSnapshot | null {
  if (!draft || !hasDraftPayload(draft)) {
    return null;
  }

  return {
    text: draft.text,
    images: draft.images ? [...draft.images] : [],
    pathReferences: draft.pathReferences ? [...draft.pathReferences] : [],
    textElements: draft.textElements ? [...draft.textElements] : [],
    inputCapabilityRoute: draft.inputCapabilityRoute,
  };
}

function sortQueuedTurnsForRestore(
  queuedTurns: readonly QueuedTurnSnapshot[] | null | undefined,
): readonly QueuedTurnSnapshot[] {
  return [...(queuedTurns ?? [])].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.created_at - right.created_at;
  });
}

function messageHasVisibleText(message: Message | null | undefined): boolean {
  if (!message) {
    return false;
  }
  if (message.content.trim().length > 0) {
    return true;
  }
  return (
    message.contentParts?.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    ) ?? false
  );
}

function messageHasThinkingOnlySignal(
  message: Message | null | undefined,
): boolean {
  if (!message) {
    return false;
  }
  return Boolean(
    message.isThinking ||
    message.thinkingContent?.trim() ||
    message.contentParts?.some(
      (part) => part.type === "thinking" && part.text.trim().length > 0,
    ),
  );
}

function messageHasSideEffectActivity(
  message: Message | null | undefined,
): boolean {
  if (!message) {
    return false;
  }
  return Boolean(
    (message.toolCalls?.length ?? 0) > 0 ||
    (message.actionRequests?.length ?? 0) > 0 ||
    (message.artifacts?.length ?? 0) > 0 ||
    message.imageWorkbenchPreview ||
    message.taskPreview ||
    message.contentParts?.some(
      (part) =>
        part.type === "tool_use" ||
        part.type === "action_required" ||
        part.type === "file_changes_batch",
    ),
  );
}

export function resolveInterruptedInputRestorePlan(params: {
  submittedDraft?: InterruptedInputDraftSnapshot | null;
  assistantMessage?: Message | null;
  queuedTurns?: readonly QueuedTurnSnapshot[] | null;
}): InterruptedInputRestorePlan {
  const draft = normalizeInterruptedInputDraft(params.submittedDraft);
  const queuedTurns = sortQueuedTurnsForRestore(params.queuedTurns);
  const queuedTurnHandling = queuedTurns.length > 0 ? "preserve" : "none";

  if (!draft) {
    return {
      shouldRestoreComposer: false,
      reason: "no_submitted_draft",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  if (messageHasSideEffectActivity(params.assistantMessage)) {
    return {
      shouldRestoreComposer: false,
      reason: "side_effect_activity_present",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  if (messageHasVisibleText(params.assistantMessage)) {
    return {
      shouldRestoreComposer: false,
      reason: "visible_output_present",
      draft: null,
      queuedTurnHandling,
      queuedTurns,
    };
  }

  return {
    shouldRestoreComposer: true,
    reason: messageHasThinkingOnlySignal(params.assistantMessage)
      ? "thinking_only_cancelled_turn"
      : "output_free_interrupted_turn",
    draft,
    queuedTurnHandling,
    queuedTurns,
  };
}

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
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  notify: AgentStreamFlowNotify;
}

interface RemoveQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "removeQueuedTurn">;
  queuedTurnId: string;
  onError?: (error: unknown) => void;
}

interface PromoteQueuedTurnOptions extends QueueActionOptions {
  runtime: Pick<AgentRuntimeAdapter, "promoteQueuedTurn">;
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

interface ResumeThreadOptions extends Omit<
  QueueActionOptions,
  "setQueuedTurns"
> {
  runtime: Pick<AgentRuntimeAdapter, "resumeThread">;
  onError?: (error: unknown) => void;
}

export function removeQueuedTurnFromState(
  queuedTurns: QueuedTurnSnapshot[],
  queuedTurnId: string,
) {
  return queuedTurns
    .filter((item) => item.queued_turn_id !== queuedTurnId)
    .map((item, index) => ({
      ...item,
      position: index + 1,
    }));
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
    getQueuedTurns,
    setActiveStream,
    onRestoreInterruptedInput,
    notify,
    onInterruptError,
  } = options;

  if (activeStream) {
    removeStreamListener(activeStream.eventName);
  }

  const activeSessionId = activeStream?.sessionId || sessionIdRef.current;
  const assistantMessage =
    activeStream?.assistantMsgId && getMessages
      ? (getMessages().find(
          (message) => message.id === activeStream.assistantMsgId,
        ) ?? null)
      : null;
  const restorePlan = resolveInterruptedInputRestorePlan({
    submittedDraft: activeStream?.submittedDraft,
    assistantMessage,
    queuedTurns: getQueuedTurns?.(),
  });
  const runInterruptAndRefresh = async () => {
    if (!activeSessionId) {
      return;
    }
    try {
      await runtime.interruptTurn(
        activeSessionId,
        resolveInterruptTurnId(activeStream),
        activeStream?.eventName,
      );
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
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === activeStream.assistantMsgId
          ? {
              ...updateMessageArtifactsStatus(
                settleInterruptedMessageProcess(msg),
                "complete",
              ),
              isThinking: false,
              content: msg.content || "(已停止)",
              runtimeStatus: undefined,
            }
          : msg,
      ),
    );
  }

  setActiveStream(null);
  if (restorePlan.shouldRestoreComposer && restorePlan.draft) {
    onRestoreInterruptedInput?.({
      requestId: crypto.randomUUID(),
      reason: restorePlan.reason,
      draft: restorePlan.draft,
    });
  }
  notify.info("已停止生成");
  void runInterruptAndRefresh();
}

export async function removeQueuedAgentTurn(options: RemoveQueuedTurnOptions) {
  const {
    runtime,
    queuedTurnId,
    sessionIdRef,
    refreshSessionReadModel,
    setQueuedTurns,
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
    if (removed) {
      setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));
    }
    await refreshSessionReadModel(activeSessionId);
    return removed;
  } catch (error) {
    onError?.(error);
    await refreshSessionReadModel(activeSessionId);
    notify.error("移除排队消息失败");
    return false;
  }
}

export async function promoteQueuedAgentTurn(
  options: PromoteQueuedTurnOptions,
) {
  const {
    runtime,
    queuedTurnId,
    activeStream,
    removeStreamListener,
    sessionIdRef,
    refreshSessionReadModel,
    setQueuedTurns,
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
    return false;
  }

  if (activeStream) {
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

  setQueuedTurns((prev) => removeQueuedTurnFromState(prev, queuedTurnId));

  try {
    const promoted = await runtime.promoteQueuedTurn(
      activeSessionId,
      queuedTurnId,
    );
    await refreshSessionReadModel(activeSessionId);
    if (!promoted) {
      return false;
    }

    notify.info("正在切换到该排队任务");
    return true;
  } catch (error) {
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
