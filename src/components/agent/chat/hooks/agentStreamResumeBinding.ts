import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  parseAgentEvent,
  type AgentThreadItem,
  type AgentThreadTurn,
} from "@/lib/api/agentProtocol";
import type {
  AgentRuntimeThreadReadModel,
  AsterExecutionStrategy,
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { ActionRequired, Message } from "../types";
import {
  buildWaitingAgentRuntimeStatus,
  formatAgentRuntimeStatusSummary,
} from "../utils/agentRuntimeStatus";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import { handleTurnStreamEvent } from "./agentStreamRuntimeHandler";
import type { StreamRequestState } from "./agentStreamRuntimeHandlerTypes";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import { hasRunningThreadReadActivity } from "../projection/threadReadActivity";
import {
  upsertThreadItemState,
  upsertThreadTurnState,
} from "./agentThreadState";

type MessageParts = NonNullable<Message["contentParts"]>;

export interface AgentStreamResumeBindingTarget {
  eventName: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  startedAt?: string | null;
}

interface ActiveAgentStreamBindingState {
  activeStreamRef: MutableRefObject<ActiveStreamState | null>;
  listenerMapRef: MutableRefObject<Map<string, () => void>>;
  target?: AgentStreamResumeBindingTarget | null;
}

interface ResolveAgentStreamResumeBindingTargetOptions {
  currentTurnId?: string | null;
  queuedTurns: readonly QueuedTurnSnapshot[];
  sessionId?: string | null;
  threadBusy: boolean;
  threadRead?: AgentRuntimeThreadReadModel | null;
  threadTurns: readonly AgentThreadTurn[];
}

interface BindRecoveredAgentStreamThreadOptions {
  activeStreamRef: MutableRefObject<ActiveStreamState | null>;
  appendThinkingToParts: (
    parts: MessageParts,
    textDelta: string,
  ) => MessageParts;
  clearActiveStreamIfMatch: (eventName: string) => boolean;
  executionStrategy: AsterExecutionStrategy;
  getMessages?: () => readonly Message[];
  getThreadItems?: () => readonly AgentThreadItem[];
  listenerMapRef: MutableRefObject<Map<string, () => void>>;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: import("../types").WriteArtifactContext,
  ) => void;
  playToolcallSound: () => void;
  playTypewriterSound: () => void;
  refreshSessionReadModel: (targetSessionId?: string) => Promise<boolean>;
  runtime: Pick<AgentRuntimeAdapter, "listenToTurnEvents" | "resumeThread">;
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
  setExecutionRuntime: Dispatch<
    SetStateAction<AsterSessionExecutionRuntime | null>
  >;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setPendingActions: Dispatch<SetStateAction<ActionRequired[]>>;
  setQueuedTurns: Dispatch<SetStateAction<QueuedTurnSnapshot[]>>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  soulCopy?: SoulInteractionCopy;
  target: AgentStreamResumeBindingTarget;
  warnedKeysRef: MutableRefObject<Set<string>>;
}

function normalizeNonEmpty(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isRunningStatus(value?: string | null): boolean {
  return normalizeNonEmpty(value)?.toLowerCase() === "running";
}

function isExplicitTerminalStatus(value?: string | null): boolean {
  const normalized = normalizeNonEmpty(value)?.toLowerCase();
  return (
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "aborted"
  );
}

function normalizeRealTurnId(value?: string | null): string | null {
  const normalized = normalizeNonEmpty(value);
  if (!normalized || normalized.startsWith("pending-turn:")) {
    return null;
  }
  return normalized;
}

const LOCALLY_STARTED_STREAM_BINDING_TTL_MS = 5 * 60 * 1000;
const LOCALLY_INTERRUPTED_STREAM_BINDING_TTL_MS = 30 * 1000;

interface LocallyStartedAgentStreamBindingRecord {
  eventName: string;
  recordedAt: number;
  sessionId: string;
  turnId: string | null;
}

const locallyStartedAgentStreamBindingRecords = new Map<
  string,
  LocallyStartedAgentStreamBindingRecord
>();
const locallyInterruptedAgentStreamBindingRecords = new Map<
  string,
  LocallyStartedAgentStreamBindingRecord
>();

function pruneAgentStreamBindingRecords(
  records: Map<string, LocallyStartedAgentStreamBindingRecord>,
  ttlMs: number,
  now = Date.now(),
): void {
  for (const [key, record] of records) {
    if (now - record.recordedAt > ttlMs) {
      records.delete(key);
    }
  }
}

function createLocallyStartedAgentStreamBindingKey(
  sessionId: string,
  turnId?: string | null,
): string {
  return `${sessionId}:${turnId || "*"}`;
}

export function rememberLocallyStartedAgentStreamBinding(
  stream: ActiveStreamState | null,
): void {
  const sessionId = normalizeNonEmpty(stream?.sessionId);
  const eventName = normalizeNonEmpty(stream?.eventName);
  if (!sessionId || !eventName?.startsWith("aster_stream_")) {
    return;
  }

  pruneAgentStreamBindingRecords(
    locallyStartedAgentStreamBindingRecords,
    LOCALLY_STARTED_STREAM_BINDING_TTL_MS,
  );
  const turnId = normalizeRealTurnId(stream?.turnId);
  const recordedAt = Date.now();
  const record: LocallyStartedAgentStreamBindingRecord = {
    eventName,
    recordedAt,
    sessionId,
    turnId,
  };
  locallyStartedAgentStreamBindingRecords.set(
    createLocallyStartedAgentStreamBindingKey(sessionId, turnId),
    record,
  );
  locallyStartedAgentStreamBindingRecords.set(
    createLocallyStartedAgentStreamBindingKey(sessionId, null),
    record,
  );
}

export function rememberLocallyInterruptedAgentStreamBinding(
  stream: ActiveStreamState | null,
): void {
  const sessionId = normalizeNonEmpty(stream?.sessionId);
  const eventName = normalizeNonEmpty(stream?.eventName);
  if (!sessionId) {
    return;
  }

  pruneAgentStreamBindingRecords(
    locallyInterruptedAgentStreamBindingRecords,
    LOCALLY_INTERRUPTED_STREAM_BINDING_TTL_MS,
  );
  const turnId = normalizeRealTurnId(stream?.turnId);
  const recordedAt = Date.now();
  const record: LocallyStartedAgentStreamBindingRecord = {
    eventName: eventName ?? "",
    recordedAt,
    sessionId,
    turnId,
  };
  locallyInterruptedAgentStreamBindingRecords.set(
    createLocallyStartedAgentStreamBindingKey(sessionId, turnId),
    record,
  );
  locallyInterruptedAgentStreamBindingRecords.set(
    createLocallyStartedAgentStreamBindingKey(sessionId, null),
    record,
  );
}

export function hasLocallyStartedAgentStreamBinding(
  target?: AgentStreamResumeBindingTarget | null,
): boolean {
  const sessionId = normalizeNonEmpty(target?.sessionId);
  if (!sessionId) {
    return false;
  }

  pruneAgentStreamBindingRecords(
    locallyStartedAgentStreamBindingRecords,
    LOCALLY_STARTED_STREAM_BINDING_TTL_MS,
  );
  const turnId = normalizeRealTurnId(target?.turnId);
  return (
    locallyStartedAgentStreamBindingRecords.has(
      createLocallyStartedAgentStreamBindingKey(sessionId, turnId),
    ) ||
    locallyStartedAgentStreamBindingRecords.has(
      createLocallyStartedAgentStreamBindingKey(sessionId, null),
    )
  );
}

export function hasLocallyInterruptedAgentStreamBinding(
  target?: AgentStreamResumeBindingTarget | null,
): boolean {
  const sessionId = normalizeNonEmpty(target?.sessionId);
  if (!sessionId) {
    return false;
  }

  pruneAgentStreamBindingRecords(
    locallyInterruptedAgentStreamBindingRecords,
    LOCALLY_INTERRUPTED_STREAM_BINDING_TTL_MS,
  );
  const turnId = normalizeRealTurnId(target?.turnId);
  return (
    locallyInterruptedAgentStreamBindingRecords.has(
      createLocallyStartedAgentStreamBindingKey(sessionId, turnId),
    ) ||
    locallyInterruptedAgentStreamBindingRecords.has(
      createLocallyStartedAgentStreamBindingKey(sessionId, null),
    )
  );
}

function findRunningThreadTurn(
  threadTurns: readonly AgentThreadTurn[],
): AgentThreadTurn | null {
  for (let index = threadTurns.length - 1; index >= 0; index -= 1) {
    const turn = threadTurns[index];
    if (turn?.status === "running" && normalizeRealTurnId(turn.id)) {
      return turn;
    }
  }
  return null;
}

function findRunningThreadReadTurnId(
  threadRead?: AgentRuntimeThreadReadModel | null,
): string | null {
  const turns = threadRead?.turns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (isRunningStatus(turn?.status)) {
      return normalizeRealTurnId(turn.turn_id);
    }
  }
  return null;
}

function findExistingAssistantMessageId(
  messages: readonly Message[],
  turnId: string,
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.runtimeTurnId === turnId) {
      return message.id;
    }
  }
  return null;
}

function findExistingTurnSummaryItemId(
  items: readonly AgentThreadItem[],
  turnId: string,
): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.turn_id === turnId && item.type === "turn_summary") {
      return item.id;
    }
  }
  return null;
}

export function hasBlockingActiveAgentStreamBinding(
  options: ActiveAgentStreamBindingState,
): boolean {
  if (options.activeStreamRef.current) {
    return true;
  }
  if (options.listenerMapRef.current.size > 0) {
    return true;
  }
  return (
    hasLocallyStartedAgentStreamBinding(options.target) ||
    hasLocallyInterruptedAgentStreamBinding(options.target)
  );
}

export function resolveAgentStreamResumeBindingTarget(
  options: ResolveAgentStreamResumeBindingTargetOptions,
): AgentStreamResumeBindingTarget | null {
  const sessionId = normalizeNonEmpty(options.sessionId);
  if (!sessionId || !options.threadBusy) {
    return null;
  }
  if (
    isExplicitTerminalStatus(options.threadRead?.status) ||
    isExplicitTerminalStatus(options.threadRead?.profile_status)
  ) {
    return null;
  }

  const runningThreadTurn = findRunningThreadTurn(options.threadTurns);
  const hasRunningReadModel = hasRunningThreadReadActivity(options.threadRead);
  if (!runningThreadTurn && !hasRunningReadModel) {
    return null;
  }

  const turnId =
    normalizeRealTurnId(options.threadRead?.active_turn_id) ??
    findRunningThreadReadTurnId(options.threadRead) ??
    normalizeRealTurnId(runningThreadTurn?.id) ??
    normalizeRealTurnId(options.currentTurnId);
  if (!turnId) {
    return null;
  }

  return {
    eventName: `agentSession/event/${sessionId}`,
    sessionId,
    threadId:
      normalizeNonEmpty(runningThreadTurn?.thread_id) ??
      normalizeNonEmpty(options.threadRead?.thread_id) ??
      sessionId,
    turnId,
    startedAt: runningThreadTurn?.started_at ?? null,
  };
}

function upsertRecoveredAssistantMessage(options: {
  assistantMsgId: string;
  runtimeStatus: NonNullable<Message["runtimeStatus"]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  target: AgentStreamResumeBindingTarget;
}): void {
  const { assistantMsgId, runtimeStatus, setMessages, target } = options;
  setMessages((prev) => {
    const existingIndex = prev.findIndex(
      (message) => message.id === assistantMsgId,
    );
    if (existingIndex >= 0) {
      return prev.map((message) =>
        message.id === assistantMsgId
          ? {
              ...message,
              isThinking: true,
              runtimeStatus: message.runtimeStatus ?? runtimeStatus,
              runtimeTurnId: message.runtimeTurnId ?? target.turnId,
            }
          : message,
      );
    }

    return [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isThinking: true,
        runtimeStatus,
        runtimeTurnId: target.turnId,
      },
    ];
  });
}

function upsertRecoveredRunningTurn(options: {
  pendingItemKey: string;
  runtimeStatus: NonNullable<Message["runtimeStatus"]>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  target: AgentStreamResumeBindingTarget;
}): void {
  const {
    pendingItemKey,
    runtimeStatus,
    setThreadItems,
    setThreadTurns,
    target,
  } = options;
  const now = new Date().toISOString();
  const startedAt = target.startedAt || now;

  setThreadTurns((prev) => {
    const existing = prev.find((turn) => turn.id === target.turnId);
    if (existing) {
      return existing.status === "running"
        ? prev
        : upsertThreadTurnState(prev, {
            ...existing,
            status: "running",
            updated_at: now,
          });
    }

    return upsertThreadTurnState(prev, {
      id: target.turnId,
      thread_id: target.threadId,
      prompt_text: "",
      status: "running",
      started_at: startedAt,
      created_at: startedAt,
      updated_at: now,
    });
  });

  setThreadItems((prev) => {
    if (prev.some((item) => item.id === pendingItemKey)) {
      return prev;
    }
    return upsertThreadItemState(prev, {
      id: pendingItemKey,
      thread_id: target.threadId,
      turn_id: target.turnId,
      sequence: 0,
      status: "in_progress",
      started_at: startedAt,
      updated_at: now,
      type: "turn_summary",
      text: formatAgentRuntimeStatusSummary(runtimeStatus),
    });
  });
}

export async function bindRecoveredAgentStreamThread(
  options: BindRecoveredAgentStreamThreadOptions,
): Promise<(() => void) | null> {
  const {
    activeStreamRef,
    appendThinkingToParts,
    clearActiveStreamIfMatch,
    executionStrategy,
    getMessages,
    getThreadItems,
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
  } = options;

  if (
    hasBlockingActiveAgentStreamBinding({
      activeStreamRef,
      listenerMapRef,
      target,
    })
  ) {
    return null;
  }

  const assistantMsgId =
    findExistingAssistantMessageId(getMessages?.() ?? [], target.turnId) ??
    `recovered-assistant:${target.turnId}`;
  const pendingTurnKey = target.turnId;
  const pendingItemKey =
    findExistingTurnSummaryItemId(getThreadItems?.() ?? [], target.turnId) ??
    `recovered-turn-summary:${target.turnId}`;
  const runtimeStatus = buildWaitingAgentRuntimeStatus({
    executionStrategy,
    soulCopy,
  });
  const requestState: StreamRequestState = {
    accumulatedContent: "",
    hasMeaningfulCompletionSignal: false,
    hasFinalAnswerRequiredProcessBoundary: false,
    hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: false,
    queuedTurnId: null,
    requestLogId: null,
    requestStartedAt: Date.now(),
    requestFinished: false,
    currentTurnId: target.turnId,
    renderedContent: "",
  };
  const toolLogIdByToolId = new Map<string, string>();
  const toolStartedAtByToolId = new Map<string, number>();
  const toolNameByToolId = new Map<string, string>();
  const actionLoggedKeys = new Set<string>();
  let unlisten: (() => void) | null = null;

  const disposeListener = () => {
    const registered = listenerMapRef.current.get(target.eventName);
    if (registered) {
      listenerMapRef.current.delete(target.eventName);
      registered();
    } else if (unlisten) {
      unlisten();
    }
    unlisten = null;
  };
  const activateStream = () => {
    if (activeStreamRef.current?.eventName === target.eventName) {
      return;
    }
    setActiveStream({
      assistantMsgId,
      eventName: target.eventName,
      sessionId: target.sessionId,
      turnId: target.turnId,
      pendingTurnKey,
      pendingItemKey,
    });
  };
  const upsertQueuedTurn = (queuedTurn: QueuedTurnSnapshot) => {
    setQueuedTurns((prev) =>
      [
        ...prev.filter(
          (item) => item.queued_turn_id !== queuedTurn.queued_turn_id,
        ),
        queuedTurn,
      ].sort((left, right) => {
        if (left.position !== right.position) {
          return left.position - right.position;
        }
        return left.created_at - right.created_at;
      }),
    );
  };
  const removeQueuedTurnState = (queuedTurnIds: string[]) => {
    if (queuedTurnIds.length === 0) {
      return;
    }
    setQueuedTurns((prev) => {
      const idSet = new Set(queuedTurnIds);
      return prev
        .filter((item) => !idSet.has(item.queued_turn_id))
        .map((item, index) => ({
          ...item,
          position: index + 1,
        }));
    });
  };

  setActiveStream({
    assistantMsgId,
    eventName: target.eventName,
    sessionId: target.sessionId,
    turnId: target.turnId,
    pendingTurnKey,
    pendingItemKey,
  });
  setCurrentTurnId(target.turnId);
  upsertRecoveredAssistantMessage({
    assistantMsgId,
    runtimeStatus,
    setMessages,
    target,
  });
  upsertRecoveredRunningTurn({
    pendingItemKey,
    runtimeStatus,
    setThreadItems,
    setThreadTurns,
    target,
  });

  try {
    unlisten = await runtime.listenToTurnEvents(target.eventName, (event) => {
      const data = parseAgentEvent(event.payload);
      if (!data) {
        return;
      }
      requestState.firstEventReceivedAt ??= Date.now();
      handleTurnStreamEvent({
        data,
        requestState,
        callbacks: {
          activateStream,
          isStreamActivated: () =>
            activeStreamRef.current?.eventName === target.eventName,
          clearOptimisticItem: () => undefined,
          clearOptimisticTurn: () => undefined,
          disposeListener,
          removeQueuedDraftMessages: () => undefined,
          clearActiveStreamIfMatch,
          upsertQueuedTurn,
          removeQueuedTurnState,
          playToolcallSound,
          playTypewriterSound,
          appendThinkingToParts,
        },
        eventName: target.eventName,
        pendingTurnKey,
        pendingItemKey,
        assistantMsgId,
        activeSessionId: target.sessionId,
        resolvedWorkspaceId: "",
        effectiveExecutionStrategy: executionStrategy,
        surfaceThinkingDeltas: true,
        content: "",
        runtime: runtime as AgentRuntimeAdapter,
        warnedKeysRef,
        actionLoggedKeys,
        toolLogIdByToolId,
        toolStartedAtByToolId,
        toolNameByToolId,
        onWriteFile,
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
    });
  } catch (error) {
    console.error("[AsterChat] 恢复运行中会话事件监听失败:", error);
    clearActiveStreamIfMatch(target.eventName);
    return null;
  }

  listenerMapRef.current.set(target.eventName, unlisten);
  void runtime
    .resumeThread(target.sessionId, target.turnId)
    .catch((error) => {
      console.error("[AsterChat] 恢复运行中会话执行失败:", error);
    })
    .finally(() => {
      void refreshSessionReadModel(target.sessionId);
    });

  return disposeListener;
}
