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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
          type: "turn.done",
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
      },
    ]);
    expect(streamActivated).toBe(true);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "aster_stream_message-app-server",
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
        removeQueuedTurnState: () => {},
      },
      sounds: {
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
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
