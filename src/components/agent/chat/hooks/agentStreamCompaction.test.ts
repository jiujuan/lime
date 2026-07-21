import { describe, expect, it, vi } from "vitest";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import { runAgentStreamCompaction } from "./agentStreamCompaction";

function createStateSetter<T>(getValue: () => T, setValue: (value: T) => void) {
  return (next: T | ((prev: T) => T)) => {
    setValue(
      typeof next === "function" ? (next as (prev: T) => T)(getValue()) : next,
    );
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("runAgentStreamCompaction", () => {
  it("应监听 compaction 事件并同步 turn/item 状态", async () => {
    let activeStream: ActiveStreamState | null = null;
    let currentTurnId: string | null = null;
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    const setIsSending = vi.fn();
    const listeners = new Map<string, () => void>();
    const notify = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    let handler: ((event: { payload: unknown }) => void) | null = null;
    const deferredCompaction = createDeferred<void>();

    const runtime: AgentRuntimeAdapter = {
      getRuntimeProviderSelection: vi.fn(),
      createSession: vi.fn(),
      listSessions: vi.fn(),
      getSession: vi.fn(),
      getSessionReadModel: vi.fn(),
      getThreadTurnControl: vi.fn(),
      replayRequest: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      setSessionExecutionStrategy: vi.fn(),
      setSessionProviderSelection: vi.fn(),
      submitOp: vi.fn(),
      steerTurn: vi.fn(),
      compactSession: vi.fn(() => deferredCompaction.promise),
      interruptTurn: vi.fn(),
      resumeThread: vi.fn(),
      runUserShellCommand: vi.fn(),
      respondToAction: vi.fn(),
      listenToTurnEvents: vi.fn(async (_eventName, nextHandler) => {
        handler = nextHandler;
        return vi.fn();
      }),
    };

    const compactionPromise = runAgentStreamCompaction({
      runtime,
      sessionId: "session-1",
      warnedKeysRef: { current: new Set() },
      setActiveStream: (next) => {
        activeStream = next;
      },
      clearActiveStreamIfMatch: (eventName) => {
        if (activeStream?.eventName !== eventName) {
          return false;
        }
        activeStream = null;
        return true;
      },
      replaceStreamListener: (eventName, nextUnlisten) => {
        if (nextUnlisten) {
          listeners.set(eventName, nextUnlisten);
        }
      },
      removeStreamListener: (eventName) => listeners.delete(eventName),
      setIsSending,
      setCurrentTurnId: createStateSetter(
        () => currentTurnId,
        (value) => {
          currentTurnId = value;
        },
      ),
      setThreadItems: createStateSetter(
        () => threadItems,
        (value) => {
          threadItems = value;
        },
      ),
      setThreadTurns: createStateSetter(
        () => threadTurns,
        (value) => {
          threadTurns = value;
        },
      ),
      notify,
      createEventName: () => "compaction-event-1",
      createAssistantMessageId: () => "context_compaction:test",
    });
    await Promise.resolve();

    expect(runtime.compactSession).toHaveBeenCalledWith(
      "session-1",
      "compaction-event-1",
    );
    expect(activeStream).toEqual({
      assistantMsgId: "context_compaction:test",
      eventName: "compaction-event-1",
      sessionId: "session-1",
    });

    if (!handler) {
      throw new Error("缺少 compaction listener");
    }
    const emit: (event: { payload: unknown }) => void = handler;

    emit({
      payload: {
        type: "turn_started",
        turn: {
          id: "turn-1",
          thread_id: "session-1",
          prompt_text: "压缩上下文",
          status: "running",
          started_at: "2026-03-29T00:00:00.000Z",
          created_at: "2026-03-29T00:00:00.000Z",
          updated_at: "2026-03-29T00:00:00.000Z",
        },
      },
    });
    emit({
      payload: {
        type: "item_completed",
        item: {
          id: "item-1",
          thread_id: "session-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "completed",
          started_at: "2026-03-29T00:00:01.000Z",
          completed_at: "2026-03-29T00:00:02.000Z",
          updated_at: "2026-03-29T00:00:02.000Z",
          type: "context_compaction",
          stage: "completed",
          detail: "已完成压缩",
        },
      },
    });
    emit({
      payload: {
        type: "warning",
        code: "context_compaction_accuracy",
        message: "注意摘要精度",
      },
    });
    emit({
      payload: {
        type: "turn_completed",
        turn: {
          id: "turn-1",
          thread_id: "session-1",
          prompt_text: "压缩上下文",
          status: "completed",
          started_at: "2026-03-29T00:00:00.000Z",
          completed_at: "2026-03-29T00:00:03.000Z",
          created_at: "2026-03-29T00:00:00.000Z",
          updated_at: "2026-03-29T00:00:03.000Z",
        },
      },
    });

    expect(currentTurnId).toBe("turn-1");
    expect(threadTurns).toEqual([
      expect.objectContaining({
        id: "turn-1",
        status: "completed",
      }),
    ]);
    expect(threadItems).toEqual([
      expect.objectContaining({
        id: "item-1",
        type: "context_compaction",
        status: "completed",
      }),
    ]);
    expect(notify.warning).toHaveBeenCalledWith("注意摘要精度");
    expect(activeStream).toBeNull();
    expect(setIsSending).toHaveBeenCalledWith(false);

    deferredCompaction.resolve();
    await compactionPromise;
    expect(listeners.has("compaction-event-1")).toBe(false);
  });

  it("收到 error 事件时应报错并清理 active stream", async () => {
    let activeStream: ActiveStreamState | null = null;
    const setIsSending = vi.fn();
    const notify = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    const listeners = new Map<string, () => void>();
    let handler: ((event: { payload: unknown }) => void) | null = null;

    const runtime = {
      compactSession: vi.fn(async () => undefined),
      listenToTurnEvents: vi.fn(async (_eventName, nextHandler) => {
        handler = nextHandler;
        return vi.fn();
      }),
    } as unknown as AgentRuntimeAdapter;

    await runAgentStreamCompaction({
      runtime,
      sessionId: "session-1",
      warnedKeysRef: { current: new Set() },
      setActiveStream: (next) => {
        activeStream = next;
      },
      clearActiveStreamIfMatch: (eventName) => {
        if (activeStream?.eventName !== eventName) {
          return false;
        }
        activeStream = null;
        return true;
      },
      replaceStreamListener: (eventName, nextUnlisten) => {
        if (nextUnlisten) {
          listeners.set(eventName, nextUnlisten);
        }
      },
      removeStreamListener: (eventName) => listeners.delete(eventName),
      setIsSending,
      setCurrentTurnId: vi.fn(),
      setThreadItems: vi.fn(),
      setThreadTurns: vi.fn(),
      notify,
      createEventName: () => "compaction-event-2",
      createAssistantMessageId: () => "context_compaction:test",
    });

    if (!handler) {
      throw new Error("缺少 compaction listener");
    }
    const emit: (event: { payload: unknown }) => void = handler;

    emit({
      payload: {
        type: "error",
        message: "模型异常",
      },
    });

    expect(notify.error).toHaveBeenCalledWith("压缩上下文失败: 模型异常");
    expect(activeStream).toBeNull();
    expect(listeners.has("compaction-event-2")).toBe(false);
  });
});
