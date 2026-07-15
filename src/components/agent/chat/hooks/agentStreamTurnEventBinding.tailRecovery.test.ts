import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import type { AgentSessionExecutionRuntime } from "@/lib/api/agentExecutionRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { QueuedTurnSnapshot } from "@/lib/api/queuedTurn";
import { projectAppServerAgentEventPayload } from "@/lib/api/agentRuntime/appServerEventPayloadProjection";
import type { ActionRequired, Message } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { StreamRequestState } from "./agentStreamSubmissionLifecycle";
import { registerAgentStreamTurnEventBinding } from "./agentStreamTurnEventBinding";

function noopDispatch<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

function projectEvent(event: AppServerJsonRpcNotification["params"]["event"]) {
  const eventPayload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {};
  const updatedAtMs = Date.parse(event.timestamp);
  const projected = projectAppServerAgentEventPayload({
    method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    params: {
      event,
      canonicalEvent: {
        method: "item/updated",
        params: {
          sessionId: event.sessionId,
          threadId: event.threadId,
          turnId: event.turnId,
          itemId: `agent-message-${event.eventId}`,
          sequence: event.sequence,
          ordinal: event.sequence,
          kind: "agentMessage",
          status: "inProgress",
          createdAtMs: updatedAtMs,
          updatedAtMs,
          payload: {
            type: "agentMessage",
            text:
              typeof eventPayload.text === "string" ? eventPayload.text : "",
            phase: "final_answer",
          },
        },
      },
    },
  });
  if (!projected) {
    throw new Error("expected App Server notification to project");
  }
  return projected;
}

describe("agentStreamTurnEventBinding tail recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("收到正文 delta 后即使尾部 terminal 事件丢失，也应通过终态 read model 收口", async () => {
    vi.useFakeTimers();

    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const attemptSilentTurnRecovery = vi.fn(
      async (
        _sessionId: string,
        _requestStartedAt: number,
        _promptText: string,
        options?: { requireTerminal?: boolean; turnId?: string | null },
      ) =>
        options?.requireTerminal === true &&
        options.turnId === "turn-tail-recovery",
    );
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const setIsSending = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async (_eventName, handler) => {
        streamHandler = handler;
        return vi.fn();
      }),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      currentTurnId: "pending-turn-tail-recovery",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "agent_stream_tail-recovery",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "fixture-provider",
      effectiveModel: "fixture-model",
      effectiveExecutionStrategy: "react",
      content: "继续输出",
      expectingQueue: false,
      activeSessionId: "session-tail-recovery",
      resolvedWorkspaceId: "workspace-tail-recovery",
      assistantMsgId: "assistant-tail-recovery",
      pendingTurnKey: "pending-turn-tail-recovery",
      pendingItemKey: "pending-item-tail-recovery",
      effectiveWaitingRuntimeStatus: {
        phase: "streaming",
        title: "正在生成回复",
        detail: "正在接收模型输出",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {
          streamActivated = true;
        },
        isStreamActivated: () => streamActivated,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: noopDispatch<Message[]>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
      setIsSending: setIsSending as never,
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    streamHandler({
      payload: projectEvent({
        eventId: "evt-tail-recovery-1",
        sequence: 1,
        sessionId: "session-tail-recovery",
        threadId: "thread-tail-recovery",
        turnId: "turn-tail-recovery",
        type: "message.delta",
        timestamp: "2026-07-08T13:32:02.000Z",
        payload: {
          text: "继续输出已恢复",
        },
      }),
    });

    await vi.advanceTimersByTimeAsync(5_100);

    expect(streamActivated).toBe(true);
    expect(attemptSilentTurnRecovery).toHaveBeenCalledWith(
      "session-tail-recovery",
      expect.any(Number),
      "继续输出",
      {
        requireTerminal: true,
        turnId: "turn-tail-recovery",
      },
    );
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "agent_stream_tail-recovery",
    );
    expect(disposeListener).toHaveBeenCalled();
    expect(setIsSending).toHaveBeenCalledWith(false);
  });

  it("收到正文 delta 时应重排已启动的终态恢复轮询", async () => {
    vi.useFakeTimers();

    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const attemptSilentTurnRecovery = vi.fn(async () => true);
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async (_eventName, handler) => {
        streamHandler = handler;
        return vi.fn();
      }),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      currentTurnId: "turn-tail-recovery-rearm",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "agent_stream_tail-recovery-rearm",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "fixture-provider",
      effectiveModel: "fixture-model",
      effectiveExecutionStrategy: "react",
      content: "继续输出",
      expectingQueue: false,
      activeSessionId: "session-tail-recovery-rearm",
      resolvedWorkspaceId: "workspace-tail-recovery-rearm",
      assistantMsgId: "assistant-tail-recovery-rearm",
      pendingTurnKey: "pending-turn-tail-recovery-rearm",
      pendingItemKey: "pending-item-tail-recovery-rearm",
      effectiveWaitingRuntimeStatus: {
        phase: "streaming",
        title: "正在生成回复",
        detail: "正在接收模型输出",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {
          streamActivated = true;
        },
        isStreamActivated: () => streamActivated,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: noopDispatch<Message[]>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AgentSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    requestState.startTerminalRecoveryPoll?.();
    await vi.advanceTimersByTimeAsync(3_000);

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }
    streamHandler({
      payload: projectEvent({
        eventId: "evt-tail-recovery-rearm-1",
        sequence: 1,
        sessionId: "session-tail-recovery-rearm",
        threadId: "thread-tail-recovery-rearm",
        turnId: "turn-tail-recovery-rearm",
        type: "message.delta",
        timestamp: "2026-07-08T13:32:02.000Z",
        payload: {
          text: "继续输出已恢复",
        },
      }),
    });

    await vi.advanceTimersByTimeAsync(2_100);
    expect(attemptSilentTurnRecovery).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(attemptSilentTurnRecovery).toHaveBeenCalledTimes(1);
    expect(attemptSilentTurnRecovery).toHaveBeenCalledWith(
      "session-tail-recovery-rearm",
      expect.any(Number),
      "继续输出",
      {
        requireTerminal: true,
        turnId: "turn-tail-recovery-rearm",
      },
    );
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "agent_stream_tail-recovery-rearm",
    );
    expect(disposeListener).toHaveBeenCalled();
  });
});
