import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import { activityLogger } from "@/lib/workspace/workbenchRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type {
  AsterSessionExecutionRuntime,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import type { ActionRequired, Message } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { StreamRequestState } from "./agentStreamSubmissionLifecycle";
import { registerAgentStreamTurnEventBinding } from "./agentStreamTurnEventBinding";
import { projectAppServerAgentEventPayload } from "@/lib/api/agentRuntime/threadClient";

function noopDispatch<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

describe("agentStreamTurnEventBinding", () => {
  afterEach(() => {
    vi.useRealTimers();
    activityLogger.clear();
  });

  it("应登记 request start 日志并返回 turn listener", async () => {
    const unlisten = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    const result = await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-1",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      content: "继续生成提纲",
      expectingQueue: false,
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      assistantMsgId: "assistant-1",
      pendingTurnKey: "pending-turn-1",
      pendingItemKey: "pending-item-1",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: noopDispatch<Message[]>(),
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    expect(typeof result).toBe("function");
    expect(runtime.listenToTurnEvents).toHaveBeenCalledWith(
      "event-1",
      expect.any(Function),
    );
    expect(requestState.requestStartedAt).toBeGreaterThan(0);
    expect(requestState.requestLogId).toBeTruthy();
    expect(activityLogger.getLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: requestState.requestLogId,
          eventType: "chat_request_start",
          status: "pending",
          title: "发送请求",
          sessionId: "session-1",
          workspaceId: "workspace-1",
          source: "aster-chat",
        }),
      ]),
    );

    result();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("首个运行时事件超时未到达时，应把助手消息收口为失败态", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-timeout",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const unlisten = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => unlisten),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-timeout",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "anthropic",
      effectiveModel: "glm-5.1",
      effectiveExecutionStrategy: "react",
      content: "帮我分析当前仓库",
      expectingQueue: false,
      activeSessionId: "session-timeout",
      resolvedWorkspaceId: "workspace-timeout",
      assistantMsgId: "assistant-timeout",
      pendingTurnKey: "pending-turn-timeout",
      pendingItemKey: "pending-item-timeout",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    await vi.advanceTimersByTimeAsync(12_100);

    expect(messages[0]?.content).toContain("执行失败");
    expect(messages[0]?.content).toContain("运行时未返回任何进度事件");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      title: "当前处理失败",
      detail: expect.stringContaining("执行已中断"),
    });
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith("event-timeout");
    expect(disposeListener).toHaveBeenCalled();
  });

  it("首个运行时事件静默但后台已有 turn 活动时，应降级切换为快照同步", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-recovery",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const attemptSilentTurnRecovery = vi.fn(async () => true);
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const setIsSending = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => vi.fn()),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-recovery",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "anthropic",
      effectiveModel: "astron-code-latest",
      effectiveExecutionStrategy: "react",
      content: "你好",
      expectingQueue: false,
      activeSessionId: "session-recovery",
      resolvedWorkspaceId: "workspace-recovery",
      assistantMsgId: "assistant-recovery",
      pendingTurnKey: "pending-turn-recovery",
      pendingItemKey: "pending-item-recovery",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: setIsSending as never,
    });

    await vi.advanceTimersByTimeAsync(12_100);

    expect(attemptSilentTurnRecovery).toHaveBeenCalledWith(
      "session-recovery",
      expect.any(Number),
      "你好",
      {
        requireTerminal: false,
        turnId: null,
      },
    );
    expect(messages[0]?.content).toBe("");
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith("event-recovery");
    expect(disposeListener).toHaveBeenCalled();
    expect(setIsSending).toHaveBeenCalledWith(false);
  });

  it("首个运行时事件静默但提交已派发时，应继续等待后续进度", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-dispatched",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => vi.fn()),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-dispatched",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "anthropic",
      effectiveModel: "glm-5.1",
      effectiveExecutionStrategy: "react",
      content: "继续分析当前仓库",
      expectingQueue: false,
      activeSessionId: "session-dispatched",
      resolvedWorkspaceId: "workspace-dispatched",
      assistantMsgId: "assistant-dispatched",
      pendingTurnKey: "pending-turn-dispatched",
      pendingItemKey: "pending-item-dispatched",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    requestState.submissionDispatchedAt = Date.now();

    await vi.advanceTimersByTimeAsync(12_100);

    expect(messages[0]?.content).toBe("");
    expect(streamActivated).toBe(true);
    expect(clearActiveStreamIfMatch).not.toHaveBeenCalled();
    expect(disposeListener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120_100);

    expect(messages[0]?.content).toContain("执行失败");
    expect(messages[0]?.content).toContain("长时间没有返回新进度");
    expect(messages[0]?.runtimeStatus?.detail).toContain("执行已中断");
    expect(messages[0]?.runtimeStatus?.detail).toContain(
      "长时间没有返回新进度",
    );
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith("event-dispatched");
    expect(disposeListener).toHaveBeenCalled();
  });

  it("提交已派发且运行时事件静默时，应通过快照恢复轮询释放发送态", async () => {
    vi.useFakeTimers();

    let streamActivated = false;
    const attemptSilentTurnRecovery = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const setIsSending = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => vi.fn()),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-deferred-recovery",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "anthropic",
      effectiveModel: "gpt-5.5",
      effectiveExecutionStrategy: "react",
      content: "停止后恢复测试",
      expectingQueue: false,
      activeSessionId: "session-deferred-recovery",
      resolvedWorkspaceId: "workspace-deferred-recovery",
      assistantMsgId: "assistant-deferred-recovery",
      pendingTurnKey: "pending-turn-deferred-recovery",
      pendingItemKey: "pending-item-deferred-recovery",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: setIsSending as never,
    });

    requestState.submissionDispatchedAt = Date.now();

    await vi.advanceTimersByTimeAsync(12_100);

    expect(streamActivated).toBe(true);
    expect(clearActiveStreamIfMatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_100);

    expect(attemptSilentTurnRecovery).toHaveBeenCalledTimes(2);
    expect(attemptSilentTurnRecovery).toHaveBeenNthCalledWith(
      1,
      "session-deferred-recovery",
      expect.any(Number),
      "停止后恢复测试",
      {
        requireTerminal: false,
        turnId: null,
      },
    );
    expect(attemptSilentTurnRecovery).toHaveBeenNthCalledWith(
      2,
      "session-deferred-recovery",
      expect.any(Number),
      "停止后恢复测试",
      {
        requireTerminal: true,
        turnId: null,
      },
    );
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "event-deferred-recovery",
    );
    expect(disposeListener).toHaveBeenCalled();
    expect(setIsSending).toHaveBeenCalledWith(false);
  });

  it("提交已接受但首包未到时，只应在 read model 出现真实终态后释放发送态", async () => {
    vi.useFakeTimers();

    let streamActivated = false;
    const attemptSilentTurnRecovery = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const setIsSending = vi.fn();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => vi.fn()),
    } as unknown as AgentRuntimeAdapter;
    const requestState: StreamRequestState = {
      accumulatedContent: "",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
      currentTurnId: "turn-live-fast-complete",
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-submit-accepted-terminal-recovery",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      effectiveExecutionStrategy: "react",
      content: "联网搜索并总结最新信息",
      expectingQueue: false,
      activeSessionId: "session-submit-accepted-terminal-recovery",
      resolvedWorkspaceId: "workspace-submit-accepted-terminal-recovery",
      assistantMsgId: "assistant-submit-accepted-terminal-recovery",
      pendingTurnKey: "pending-turn-submit-accepted-terminal-recovery",
      pendingItemKey: "pending-item-submit-accepted-terminal-recovery",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: setIsSending as never,
    });

    requestState.submissionDispatchedAt = Date.now();
    requestState.submissionAcceptedAt = Date.now();
    requestState.startTerminalRecoveryPoll?.();

    await vi.advanceTimersByTimeAsync(5_100);

    expect(attemptSilentTurnRecovery).toHaveBeenCalledTimes(1);
    expect(attemptSilentTurnRecovery).toHaveBeenNthCalledWith(
      1,
      "session-submit-accepted-terminal-recovery",
      expect.any(Number),
      "联网搜索并总结最新信息",
      {
        requireTerminal: true,
        turnId: "turn-live-fast-complete",
      },
    );
    expect(clearActiveStreamIfMatch).not.toHaveBeenCalled();
    expect(disposeListener).not.toHaveBeenCalled();
    expect(setIsSending).not.toHaveBeenCalledWith(false);

    await vi.advanceTimersByTimeAsync(5_100);

    expect(attemptSilentTurnRecovery).toHaveBeenCalledTimes(2);
    expect(attemptSilentTurnRecovery).toHaveBeenNthCalledWith(
      2,
      "session-submit-accepted-terminal-recovery",
      expect.any(Number),
      "联网搜索并总结最新信息",
      {
        requireTerminal: true,
        turnId: "turn-live-fast-complete",
      },
    );
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "event-submit-accepted-terminal-recovery",
    );
    expect(disposeListener).toHaveBeenCalled();
    expect(setIsSending).toHaveBeenCalledWith(false);
  });

  it("收到未知但结构合法的运行时事件时，应保留流活跃态并继续等待后续进度", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-unknown-event",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-unknown-heartbeat",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      content: "继续处理图片任务",
      expectingQueue: false,
      activeSessionId: "session-unknown-heartbeat",
      resolvedWorkspaceId: "workspace-unknown-heartbeat",
      assistantMsgId: "assistant-unknown-event",
      pendingTurnKey: "pending-turn-unknown-event",
      pendingItemKey: "pending-item-unknown-event",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const activeStreamHandler = streamHandler as (event: {
      payload: unknown;
    }) => void;

    activeStreamHandler({
      payload: {
        type: "runtime_projection_bootstrap",
        detail: "正在准备运行时投影",
      },
    });

    await vi.advanceTimersByTimeAsync(12_100);

    expect(messages[0]?.content).toBe("");
    expect(streamActivated).toBe(true);
    expect(disposeListener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120_100);

    expect(messages[0]?.content).toContain("执行失败");
    expect(messages[0]?.content).toContain("长时间没有返回新进度");
    expect(messages[0]?.runtimeStatus?.detail).toContain("执行已中断");
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "event-unknown-heartbeat",
    );
    expect(disposeListener).toHaveBeenCalled();
  });

  it("收到 App Server runtime.error 时应立即收口失败而不是等待 inactivity watchdog", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-runtime-error",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-28T07:45:00.000Z"),
        isThinking: true,
      },
    ];
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "aster_stream_runtime-error",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      effectiveExecutionStrategy: "react",
      content: "@写文章 写一篇公众号文章",
      expectingQueue: false,
      activeSessionId: "session-runtime-error",
      resolvedWorkspaceId: "workspace-runtime-error",
      assistantMsgId: "assistant-runtime-error",
      pendingTurnKey: "pending-turn-runtime-error",
      pendingItemKey: "pending-item-runtime-error",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
      },
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: (_queuedTurn: QueuedTurnSnapshot) => {},
        removeQueuedTurnsFromProjection: () => {},
      },
      appendThinkingToParts: (parts) => parts,
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending,
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-runtime-error",
          sequence: 1,
          sessionId: "session-runtime-error",
          threadId: "thread-runtime-error",
          turnId: "turn-runtime-error",
          type: "runtime.error",
          timestamp: "2026-06-28T07:45:02.000Z",
          payload: {
            message: "Plugin worker failed",
            errorCode: "PLUGIN_WORKER_PACKAGE_SIGNATURE_UNVERIFIED",
          },
        },
      },
    });

    if (!payload) {
      throw new Error("expected App Server notification to project");
    }
    (streamHandler as (event: { payload: unknown }) => void)({ payload });

    expect(messages[0]?.content).toContain("执行失败");
    expect(messages[0]?.content).toContain("Plugin worker failed");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      title: "当前处理失败",
    });
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "aster_stream_runtime-error",
    );
    expect(disposeListener).toHaveBeenCalled();
    expect(setIsSending).toHaveBeenCalledWith(false);

    await vi.advanceTimersByTimeAsync(120_100);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledTimes(1);
  });

  it("首包后长时间没有新事件时，应把助手消息收口为失败态", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-inactivity",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-inactivity",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "anthropic",
      effectiveModel: "glm-5.1",
      effectiveExecutionStrategy: "react",
      content: "继续分析当前仓库",
      expectingQueue: false,
      activeSessionId: "session-inactivity",
      resolvedWorkspaceId: "workspace-inactivity",
      assistantMsgId: "assistant-inactivity",
      pendingTurnKey: "pending-turn-inactivity",
      pendingItemKey: "pending-item-inactivity",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const activeStreamHandler = streamHandler as (event: {
      payload: unknown;
    }) => void;

    activeStreamHandler({
      payload: {
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "分析中",
          detail: "正在整理仓库结构",
        },
      },
    });

    await vi.advanceTimersByTimeAsync(120_100);

    expect(messages[0]?.content).toContain("执行失败");
    expect(messages[0]?.content).toContain("长时间没有返回新进度");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      title: "当前处理失败",
      detail: expect.stringContaining("执行已中断"),
    });
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith("event-inactivity");
    expect(disposeListener).toHaveBeenCalled();
  });

  it("首包后静默但 read model 仍在运行时，应保留活跃流并继续等待", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-running-read-model",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-06T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const attemptSilentTurnRecovery = vi.fn(
      async (
        _sessionId: string,
        _requestStartedAt: number,
        _promptText: string,
        options?: { requireTerminal?: boolean },
      ) => options?.requireTerminal !== true,
    );
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
      currentTurnId: "turn-running-read-model",
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "aster_stream_running-read-model",
      requestState,
      attemptSilentTurnRecovery,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.5",
      effectiveExecutionStrategy: "react",
      content: "继续输出未完成内容",
      expectingQueue: false,
      activeSessionId: "session-running-read-model",
      resolvedWorkspaceId: "workspace-running-read-model",
      assistantMsgId: "assistant-running-read-model",
      pendingTurnKey: "pending-turn-running-read-model",
      pendingItemKey: "pending-item-running-read-model",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: setIsSending as never,
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-running-read-model-1",
          sequence: 1,
          sessionId: "session-running-read-model",
          threadId: "thread-running-read-model",
          turnId: "turn-running-read-model",
          type: "message.delta",
          timestamp: "2026-06-06T00:00:00.000Z",
          payload: {
            text: "第一段",
          },
        },
      },
    });
    if (!payload) {
      throw new Error("expected App Server notification to project");
    }
    streamHandler({ payload });

    await vi.advanceTimersByTimeAsync(120_100);

    expect(streamActivated).toBe(true);
    expect(messages[0]?.content).not.toContain("执行失败");
    expect(messages[0]?.isThinking).toBe(true);
    expect(attemptSilentTurnRecovery).toHaveBeenCalledWith(
      "session-running-read-model",
      expect.any(Number),
      "继续输出未完成内容",
      {
        requireTerminal: true,
        turnId: "turn-running-read-model",
      },
    );
    expect(attemptSilentTurnRecovery).toHaveBeenCalledWith(
      "session-running-read-model",
      expect.any(Number),
      "继续输出未完成内容",
      {
        requireTerminal: false,
        turnId: "turn-running-read-model",
      },
    );
    expect(clearActiveStreamIfMatch).not.toHaveBeenCalled();
    expect(disposeListener).not.toHaveBeenCalled();
    expect(setIsSending).not.toHaveBeenCalledWith(false);
  });

  it("运行时 keepalive 事件应刷新 inactivity 计时，避免长模型调用被前端误中断", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-keepalive",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-14T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "event-keepalive",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "deepseek",
      effectiveModel: "deepseek-v4-pro",
      effectiveExecutionStrategy: "react",
      content: "帮我整理一下今天的国际新闻",
      expectingQueue: false,
      activeSessionId: "session-keepalive",
      resolvedWorkspaceId: "workspace-keepalive",
      assistantMsgId: "assistant-keepalive",
      pendingTurnKey: "pending-turn-keepalive",
      pendingItemKey: "pending-item-keepalive",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const activeStreamHandler = streamHandler as (event: {
      payload: unknown;
    }) => void;

    activeStreamHandler({
      payload: {
        type: "runtime_status",
        status: {
          phase: "preparing",
          title: "已接收请求，正在准备执行",
          detail:
            "系统正在初始化本轮执行环境并整理上下文，稍后会继续返回更详细进度。",
        },
      },
    });

    await vi.advanceTimersByTimeAsync(80_000);

    activeStreamHandler({
      payload: {
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "仍在执行，等待下一步进度",
          detail: "运行时已连续处理约 80 秒，本轮可能正在等待模型或工具返回。",
          metadata: { keepalive_kind: "runtime_turn_active" },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(80_000);

    expect(messages[0]?.content).toBe("");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "routing",
      title: "仍在执行，等待下一步进度",
    });
    expect(clearActiveStreamIfMatch).not.toHaveBeenCalled();
    expect(disposeListener).not.toHaveBeenCalled();
  });

  it("App Server agentSession/event 投影应驱动现有 GUI stream listener 完成消息收口", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-app-server",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-06T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "aster_stream_message-app-server",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      content: "生成草稿",
      expectingQueue: false,
      activeSessionId: "session-app-server",
      resolvedWorkspaceId: "workspace-app-server",
      assistantMsgId: "assistant-app-server",
      pendingTurnKey: "pending-turn-app-server",
      pendingItemKey: "pending-item-app-server",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const activeStreamHandler = streamHandler as (event: {
      payload: unknown;
    }) => void;
    const project = (notification: AppServerJsonRpcNotification) => {
      const payload = projectAppServerAgentEventPayload(notification);
      if (!payload) {
        throw new Error("expected App Server notification to project");
      }
      activeStreamHandler({ payload });
    };

    project({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-app-server-1",
          sequence: 1,
          sessionId: "session-app-server",
          threadId: "thread-app-server",
          turnId: "turn-app-server",
          type: "message.delta",
          timestamp: "2026-06-06T00:00:00.000Z",
          payload: {
            text: "第一段",
          },
        },
      },
    });

    project({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-app-server-2",
          sequence: 2,
          sessionId: "session-app-server",
          threadId: "thread-app-server",
          turnId: "turn-app-server",
          type: "turn.completed",
          timestamp: "2026-06-06T00:00:01.000Z",
          payload: {},
        },
      },
    });

    expect(messages[0]).toMatchObject({
      content: "第一段",
      isThinking: false,
    });
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "第一段",
        metadata: {
          source: "agent_text_delta",
          sequence: 1,
          turnId: "turn-app-server",
        },
      },
    ]);
    expect(streamActivated).toBe(true);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "aster_stream_message-app-server",
    );
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("App Server WebSearch/WebFetch 中间 reasoning 应进入现有 GUI stream listener", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-app-server-web-tools",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-20T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    let threadItems: AgentThreadItem[] = [];
    let streamActivated = false;
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems =
          typeof value === "function" ? value(threadItems) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "aster_stream_message-app-server-web-tools",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      content: "验证网页搜索渲染",
      expectingQueue: false,
      activeSessionId: "session-app-server-web-tools",
      resolvedWorkspaceId: "workspace-app-server",
      assistantMsgId: "assistant-app-server-web-tools",
      pendingTurnKey: "pending-turn-app-server-web-tools",
      pendingItemKey: "pending-item-app-server-web-tools",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      appendThinkingToParts: (parts, textDelta) => [
        ...parts,
        { type: "thinking" as const, text: textDelta },
      ],
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      getThreadItems: () => threadItems,
      setThreadItems: setThreadItems as never,
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: noopDispatch<string | null>(),
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: noopDispatch<boolean>(),
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const activeStreamHandler = streamHandler as (event: {
      payload: unknown;
    }) => void;
    const project = (
      type: string,
      sequence: number,
      payload: Record<string, unknown>,
    ) => {
      const projected = projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: `evt-web-tools-${sequence}`,
            sequence,
            sessionId: "session-app-server-web-tools",
            threadId: "thread-app-server-web-tools",
            turnId: "turn-app-server-web-tools",
            type,
            timestamp: `2026-06-20T10:00:0${sequence}.000Z`,
            payload,
          },
        },
      });
      if (!projected) {
        throw new Error(`expected App Server ${type} notification to project`);
      }
      activeStreamHandler({ payload: projected });
    };

    project("message.delta", 1, {
      text: "我先联网核实目标页面来源。\n",
      itemId: "agent-message-commentary-turn-app-server-web-tools",
      phase: "commentary",
    });
    project("tool.started", 2, {
      toolCallId: "tool-web-search",
      toolName: "WebSearch",
      arguments: { query: "Lime WebSearch rendering" },
    });
    project("tool.result", 3, {
      toolCallId: "tool-web-search",
      toolName: "WebSearch",
      output: JSON.stringify({
        results: [
          {
            title: "Lime WebSearch Rendering Source",
            url: "https://example.com/lime-websearch-rendering",
          },
        ],
      }),
      success: true,
    });
    project("item.updated", 4, {
      item: {
        id: "reasoning-web-tools",
        thread_id: "thread-app-server-web-tools",
        turn_id: "turn-app-server-web-tools",
        type: "reasoning",
        text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
        sequence: 4,
        status: "in_progress",
        started_at: "2026-06-20T10:00:04.000Z",
        updated_at: "2026-06-20T10:00:04.000Z",
      },
    });
    project("tool.started", 5, {
      toolCallId: "tool-web-fetch",
      toolName: "WebFetch",
      arguments: { url: "https://example.com/lime-websearch-rendering" },
    });
    project("tool.result", 6, {
      toolCallId: "tool-web-fetch",
      toolName: "WebFetch",
      output: JSON.stringify({
        bytes: 2048,
        code: 200,
        codeText: "OK",
        result: "WebFetch 正文摘要。",
      }),
      success: true,
      metadata: {
        url: "https://example.com/lime-websearch-rendering",
      },
    });
    project("item.completed", 7, {
      item: {
        id: "reasoning-web-tools",
        thread_id: "thread-app-server-web-tools",
        turn_id: "turn-app-server-web-tools",
        type: "reasoning",
        text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
        sequence: 4,
        status: "completed",
        started_at: "2026-06-20T10:00:04.000Z",
        completed_at: "2026-06-20T10:00:07.000Z",
        updated_at: "2026-06-20T10:00:07.000Z",
      },
    });
    project("message.delta", 8, {
      text: "网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。",
      itemId: "agent-message-final-turn-app-server-web-tools",
      phase: "final_answer",
    });
    project("turn.completed", 9, {
      turn: {
        id: "turn-app-server-web-tools",
        thread_id: "thread-app-server-web-tools",
        prompt_text: "验证网页搜索渲染",
        status: "completed",
        started_at: "2026-06-20T10:00:00.000Z",
        completed_at: "2026-06-20T10:00:09.000Z",
        created_at: "2026-06-20T10:00:00.000Z",
        updated_at: "2026-06-20T10:00:09.000Z",
      },
    });

    expect(messages[0]?.isThinking).toBe(false);
    expect(messages[0]?.content).toContain("网页搜索渲染结论");
    expect(messages[0]?.contentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      type: "text",
      text: "我先联网核实目标页面来源。",
      metadata: {
        source: "agent_text_delta",
        itemId: "agent-message-commentary-turn-app-server-web-tools",
        phase: "commentary",
        sequence: 1,
        turnId: "turn-app-server-web-tools",
      },
    });
    expect(messages[0]?.contentParts?.[2]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
      metadata: {
        source: "thread_item_reasoning",
        threadItemId: "reasoning-web-tools",
        turnId: "turn-app-server-web-tools",
      },
    });
    expect(threadItems.map((item) => item.type)).toEqual([
      "agent_message",
      "tool_call",
      "reasoning",
      "tool_call",
    ]);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "aster_stream_message-app-server-web-tools",
    );
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("App Server 取消终态应驱动 GUI stream listener 立即收口为已停止", async () => {
    vi.useFakeTimers();

    let messages: Message[] = [
      {
        id: "assistant-app-server-cancel",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-06T00:00:00.000Z"),
        isThinking: true,
        toolCalls: [
          {
            id: "tool-running-1",
            name: "WebFetch",
            status: "running",
            startTime: new Date("2026-06-06T00:00:01.000Z"),
          },
        ],
      },
    ];
    let streamActivated = false;
    let isSending = true;
    let currentTurnId: string | null = "pending-turn-app-server-cancel";
    let streamHandler: ((event: { payload: unknown }) => void) | null = null;
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
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
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
      queuedTurnId: null,
    };

    await registerAgentStreamTurnEventBinding({
      runtime,
      eventName: "aster_stream_message-app-server-cancel",
      requestState,
      skipUserMessage: false,
      effectiveProviderType: "openai",
      effectiveModel: "gpt-5.4",
      effectiveExecutionStrategy: "react",
      content: "整理今天的国际新闻",
      expectingQueue: false,
      activeSessionId: "session-app-server-cancel",
      resolvedWorkspaceId: "workspace-app-server",
      assistantMsgId: "assistant-app-server-cancel",
      pendingTurnKey: "pending-turn-app-server-cancel",
      pendingItemKey: "pending-item-app-server-cancel",
      effectiveWaitingRuntimeStatus: {
        phase: "preparing",
        title: "处理中",
        detail: "正在准备执行上下文",
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
      setMessages: setMessages as never,
      setPendingActions: noopDispatch<ActionRequired[]>(),
      setThreadItems: noopDispatch<AgentThreadItem[]>(),
      setThreadTurns: noopDispatch<AgentThreadTurn[]>(),
      setCurrentTurnId: (value) => {
        currentTurnId =
          typeof value === "function" ? value(currentTurnId) : value;
      },
      setExecutionRuntime: noopDispatch<AsterSessionExecutionRuntime | null>(),
      setIsSending: (value) => {
        isSending = typeof value === "function" ? value(isSending) : value;
      },
    });

    if (!streamHandler) {
      throw new Error("expected stream handler to be registered");
    }

    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "evt-app-server-cancel",
          sequence: 1,
          sessionId: "session-app-server-cancel",
          threadId: "thread-app-server-cancel",
          turnId: "turn-app-server-cancel",
          type: "turn.canceled",
          timestamp: "2026-06-06T00:00:02.000Z",
          payload: {
            reason: "user_cancelled",
          },
        },
      },
    });

    if (!payload) {
      throw new Error("expected App Server notification to project");
    }
    (streamHandler as (event: { payload: unknown }) => void)({ payload });

    expect(messages[0]).toMatchObject({
      content: "(已停止)",
      isThinking: false,
      runtimeStatus: undefined,
    });
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      status: "failed",
      result: {
        success: false,
        output: "",
        error: "本轮已中止",
      },
    });
    expect(currentTurnId).toBe("turn-app-server-cancel");
    expect(isSending).toBe(false);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "aster_stream_message-app-server-cancel",
    );
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });
});
