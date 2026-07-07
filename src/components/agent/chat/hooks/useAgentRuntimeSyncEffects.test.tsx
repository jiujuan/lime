import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRuntimeSyncEffectsTestHarness,
  createAppServerThreadClientMock,
  createThreadTurn,
  flushCoalescedRefresh,
  mockHasDesktopHostEventListenerCapability,
  mockHasDevBridgeEventListenerCapability,
  mockIsAppServerBridgeAvailable,
  mountHook,
  runtimeSyncRefreshRequest,
  setupRuntimeSyncEffectsTestHarness,
  terminalRefreshRequest,
} from "./useAgentRuntimeSyncEffects.testHarness";
import { APP_SERVER_METHOD_AGENT_SESSION_EVENT } from "@/lib/api/appServer";
import { listenAgentRuntimeEvent } from "@/lib/api/agentRuntimeEvents";
import { createThreadClient } from "@/lib/api/agentRuntime/threadClient";

describe("useAgentRuntimeSyncEffects", () => {
  beforeEach(() => {
    setupRuntimeSyncEffectsTestHarness();
  });

  afterEach(() => {
    cleanupRuntimeSyncEffectsTestHarness();
  });

  it("发送结束后应刷新当前会话详情", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      isSending: true,
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.sendSettled"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("恢复队列工作时应轮询刷新当前会话详情", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      queuedTurnCount: 1,
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.recoveredPoll"),
      );

      await harness.render({
        queuedTurnCount: 0,
        threadTurns: [createThreadTurn({ status: "running" })],
      });
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).toHaveBeenCalledTimes(2);
    } finally {
      harness.unmount();
    }
  });

  it("仅 thread_read 标记为 running 时也应继续轮询刷新", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      threadReadStatus: "running",
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.recoveredPoll"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("failed read model 下残留 running turn 不应继续 recovered poll", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      threadReadStatus: "failed",
      threadTurns: [createThreadTurn({ status: "running" })],
      refreshSessionDetail,
    });

    try {
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("发送中收到 failed read model 时即使本地 turn 残留 running 也应收起 active stream", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "failed",
      threadTurns: [createThreadTurn({ status: "running" })],
      settleActiveRuntimeStream,
    });

    try {
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("发送中收到 canceled read model 且本地 turn 残留 running 时也应收起 active stream", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "canceled",
      threadTurns: [createThreadTurn({ status: "running" })],
      settleActiveRuntimeStream,
    });

    try {
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("发送中收到 cancelled read model 投影且本地 turn 残留 running 时也应收起 active stream", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "cancelled",
      threadTurns: [createThreadTurn({ status: "running" })],
      settleActiveRuntimeStream,
    });

    try {
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("恢复出的陈旧 running turn 不应持续轮询完整详情", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      threadReadStatus: "running",
      threadTurns: [
        createThreadTurn({
          status: "running",
          started_at: "2026-03-28T22:00:00.000Z",
          created_at: "2026-03-28T22:00:00.000Z",
          updated_at: "2026-03-28T22:05:00.000Z",
        }),
      ],
      refreshSessionDetail,
    });

    try {
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("收到 subagent 状态事件后应刷新当前会话详情", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const runtime = {
      listenToTurnEvents: vi.fn(async () => () => {}),
      listenToTeamEvents: vi.fn(async (eventName, handler) => {
        listeners.set(
          eventName,
          handler as (event: { payload: unknown }) => void,
        );
        return () => {
          listeners.delete(eventName);
        };
      }),
    };
    const harness = await mountHook({
      runtime,
      parentSessionId: "parent-1",
      refreshSessionDetail,
    });

    try {
      expect(runtime.listenToTeamEvents).toHaveBeenCalledTimes(2);
      expect(listeners.has("agent_subagent_status:session-1")).toBe(true);
      expect(listeners.has("agent_subagent_status:parent-1")).toBe(true);

      await act(async () => {
        listeners.get("agent_subagent_status:parent-1")?.({
          payload: {
            type: "subagent_status_changed",
            session_id: "child-1",
            root_session_id: "session-1",
            status: "running",
          },
        });
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.event"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("收到当前 turn 的 App Server runtime event 后应刷新 read model", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const runtime = {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn(async (eventName, handler) => {
        listeners.set(
          eventName,
          handler as (event: { payload: unknown }) => void,
        );
        return () => {
          listeners.delete(eventName);
        };
      }),
    };
    const harness = await mountHook({
      runtime,
      currentTurnEventName: "aster_stream_assistant-1",
      isSending: true,
      refreshSessionDetail,
    });

    try {
      expect(runtime.listenToTurnEvents).toHaveBeenCalledWith(
        "aster_stream_assistant-1",
        expect.any(Function),
      );

      await act(async () => {
        listeners.get("aster_stream_assistant-1")?.({
          payload: {
            type: "runtime_status",
            status: {
              phase: "running",
              title: "处理中",
            },
          },
        });
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        listeners.get("aster_stream_assistant-1")?.({
          payload: {
            type: "turn.completed",
            turn: {
              id: "turn-1",
              thread_id: "thread-1",
              prompt_text: "继续",
              status: "completed",
              started_at: "2026-03-29T00:05:00.000Z",
              completed_at: "2026-03-29T00:05:01.000Z",
              created_at: "2026-03-29T00:05:00.000Z",
              updated_at: "2026-03-29T00:05:01.000Z",
            },
          },
        });
        await Promise.resolve();
      });

      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        listeners.get("aster_stream_assistant-1")?.({
          payload: {
            type: "turn.failed",
            turn: {
              id: "turn-2",
              thread_id: "thread-1",
              prompt_text: "失败",
              status: "failed",
              started_at: "2026-03-29T00:06:00.000Z",
              completed_at: "2026-03-29T00:06:01.000Z",
              created_at: "2026-03-29T00:06:00.000Z",
              updated_at: "2026-03-29T00:06:01.000Z",
              error_message: "失败",
            },
          },
        });
        await Promise.resolve();
      });

      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        listeners.get("aster_stream_assistant-1")?.({
          payload: {
            type: "turn.canceled",
            turn: {
              id: "turn-3",
              thread_id: "thread-1",
              prompt_text: "停止",
              status: "canceled",
              started_at: "2026-03-29T00:05:02.000Z",
              completed_at: "2026-03-29T00:05:03.000Z",
              created_at: "2026-03-29T00:05:02.000Z",
              updated_at: "2026-03-29T00:05:03.000Z",
              error_message: "已停止",
            },
          },
        });
        await Promise.resolve();
      });

      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({
        isSending: false,
        currentTurnEventName: null,
      });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenLastCalledWith(
        "session-1",
        terminalRefreshRequest("runtimeSync.event"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("发送态 read model repair 到终态时应收起当前 runtime stream", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "running",
      threadTurns: [
        createThreadTurn({
          status: "running",
          started_at: "2026-03-29T00:04:55.000Z",
          updated_at: "2026-03-29T00:04:58.000Z",
        }),
      ],
      settleActiveRuntimeStream,
    });

    try {
      expect(settleActiveRuntimeStream).not.toHaveBeenCalled();

      await harness.render({
        isSending: true,
        threadReadStatus: "completed",
        threadTurns: [
          createThreadTurn({
            status: "completed",
            started_at: "2026-03-29T00:04:55.000Z",
            completed_at: "2026-03-29T00:05:01.000Z",
            updated_at: "2026-03-29T00:05:01.000Z",
          }),
        ],
      });

      expect(settleActiveRuntimeStream).toHaveBeenCalledTimes(1);
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("未观察到活跃 read model 前不应因 idle 快照误停新请求", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "idle",
      threadTurns: [],
      settleActiveRuntimeStream,
    });

    try {
      await act(async () => {
        await Promise.resolve();
      });

      expect(settleActiveRuntimeStream).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("未观察到 running 快照时也应在 read model 已完成后收起发送态", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "completed",
      threadTurns: [
        createThreadTurn({
          status: "completed",
          started_at: "2026-03-29T00:04:55.000Z",
          completed_at: "2026-03-29T00:05:01.000Z",
          updated_at: "2026-03-29T00:05:01.000Z",
        }),
      ],
      settleActiveRuntimeStream,
    });

    try {
      await act(async () => {
        await Promise.resolve();
      });

      expect(settleActiveRuntimeStream).toHaveBeenCalledTimes(1);
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("stale queued read model 但 turn 已 terminal 时应收起发送态", async () => {
    const settleActiveRuntimeStream = vi.fn();
    const harness = await mountHook({
      isSending: true,
      threadReadStatus: "queued",
      queuedTurnCount: 0,
      threadTurns: [
        createThreadTurn({
          status: "completed",
          started_at: "2026-03-29T00:04:55.000Z",
          completed_at: "2026-03-29T00:05:01.000Z",
          updated_at: "2026-03-29T00:05:01.000Z",
        }),
      ],
      settleActiveRuntimeStream,
    });

    try {
      await act(async () => {
        await Promise.resolve();
      });

      expect(settleActiveRuntimeStream).toHaveBeenCalledTimes(1);
      expect(settleActiveRuntimeStream).toHaveBeenCalledWith("session-1");
    } finally {
      harness.unmount();
    }
  });

  it("当前 turn 的 text_delta 不应触发完整 read model 刷新", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const runtime = {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn(async (eventName, handler) => {
        listeners.set(
          eventName,
          handler as (event: { payload: unknown }) => void,
        );
        return () => {
          listeners.delete(eventName);
        };
      }),
    };
    const harness = await mountHook({
      runtime,
      currentTurnEventName: "aster_stream_assistant-2",
      isSending: true,
      refreshSessionDetail,
    });

    try {
      await act(async () => {
        listeners.get("aster_stream_assistant-2")?.({
          payload: {
            type: "text_delta",
            text: "增量内容",
          },
        });
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("当前 turn 的连续状态事件应合并为一次会话详情刷新", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const runtime = {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn(async (eventName, handler) => {
        listeners.set(
          eventName,
          handler as (event: { payload: unknown }) => void,
        );
        return () => {
          listeners.delete(eventName);
        };
      }),
    };
    const harness = await mountHook({
      runtime,
      currentTurnEventName: "aster_stream_assistant-coalesced",
      isSending: true,
      refreshSessionDetail,
    });

    try {
      await act(async () => {
        const listener = listeners.get("aster_stream_assistant-coalesced");
        listener?.({
          payload: {
            type: "runtime_status",
            status: { phase: "running" },
          },
        });
        listener?.({
          payload: {
            type: "queue_started",
          },
        });
        listener?.({
          payload: {
            type: "turn.completed",
            turn: {
              id: "turn-completed",
              thread_id: "thread-1",
              prompt_text: "完成",
              status: "completed",
              started_at: "2026-03-29T00:05:00.000Z",
              completed_at: "2026-03-29T00:05:01.000Z",
              created_at: "2026-03-29T00:05:00.000Z",
              updated_at: "2026-03-29T00:05:01.000Z",
            },
          },
        });
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({
        isSending: false,
        currentTurnEventName: null,
      });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        terminalRefreshRequest("runtimeSync.event"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("App Server turn notification 应通过当前 stream event 触发 read model 刷新", async () => {
    const eventName = "aster_stream_app-server-p3-126";
    const refreshSessionDetail = vi.fn(async () => true);
    const appServerClient = createAppServerThreadClientMock();
    vi.mocked(appServerClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: {
        id: 1,
        result: {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        },
      },
      messages: [],
      notifications: [
        {
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-completed-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "turn.completed",
              timestamp: "2026-06-06T00:00:01.000Z",
              payload: {},
            },
          },
        },
      ],
    });
    const threadClient = createThreadClient({
      appServerClient,
      invokeCommand: vi.fn(),
      isAppServerTurnLifecycleAvailable: () => true,
    });
    const runtime = {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn((name, handler) =>
        listenAgentRuntimeEvent(name, handler),
      ),
    };
    const harness = await mountHook({
      runtime,
      currentTurnEventName: eventName,
      isSending: true,
      refreshSessionDetail,
    });

    try {
      await vi.waitFor(() => {
        expect(runtime.listenToTurnEvents).toHaveBeenCalledWith(
          eventName,
          expect.any(Function),
        );
      });

      await act(async () => {
        await threadClient.submitAgentRuntimeTurn({
          message: "继续",
          session_id: "session-1",
          turn_id: "turn-1",
          event_name: eventName,
        });
        await Promise.resolve();
      });

      expect(appServerClient.startTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          turnId: "turn-1",
          runtimeOptions: expect.objectContaining({
            eventName,
          }),
        }),
      );
      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({
        isSending: false,
        currentTurnEventName: null,
      });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        terminalRefreshRequest("runtimeSync.event"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("收到当前 turn 的取消终态后应刷新 read model", async () => {
    const refreshSessionDetail = vi.fn(async () => true);
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const runtime = {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn(async (eventName, handler) => {
        listeners.set(
          eventName,
          handler as (event: { payload: unknown }) => void,
        );
        return () => {
          listeners.delete(eventName);
        };
      }),
    };
    const harness = await mountHook({
      runtime,
      currentTurnEventName: "aster_stream_assistant-cancel",
      isSending: true,
      refreshSessionDetail,
    });

    try {
      await act(async () => {
        listeners.get("aster_stream_assistant-cancel")?.({
          payload: {
            type: "turn.canceled",
            turn: {
              id: "turn-canceled",
              thread_id: "thread-1",
              prompt_text: "停止",
              status: "canceled",
              started_at: "2026-03-29T00:05:00.000Z",
              completed_at: "2026-03-29T00:05:01.000Z",
              created_at: "2026-03-29T00:05:00.000Z",
              updated_at: "2026-03-29T00:05:01.000Z",
            },
          },
        });
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({
        isSending: false,
        currentTurnEventName: null,
      });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        terminalRefreshRequest("runtimeSync.event"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("浏览器 DevBridge 发送中但无原生事件能力时，应轮询刷新当前会话详情", async () => {
    mockIsAppServerBridgeAvailable.mockReturnValue(true);
    mockHasDesktopHostEventListenerCapability.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(false);

    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      isSending: true,
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenLastCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.poll"),
      );

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).toHaveBeenCalledTimes(2);

      await harness.render({ isSending: false });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).toHaveBeenCalledTimes(3);
    } finally {
      harness.unmount();
    }
  });

  it("浏览器 DevBridge 已绑定当前 turn event 时，不应再走轮询刷新", async () => {
    mockIsAppServerBridgeAvailable.mockReturnValue(true);
    mockHasDesktopHostEventListenerCapability.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(false);

    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      currentTurnEventName: "aster_stream_event-bound",
      isSending: true,
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({
        isSending: false,
        currentTurnEventName: null,
      });
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.sendSettled"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("浏览器 DevBridge 已接通事件桥时，不应再轮询刷新当前会话详情", async () => {
    mockIsAppServerBridgeAvailable.mockReturnValue(true);
    mockHasDesktopHostEventListenerCapability.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(true);

    const refreshSessionDetail = vi.fn(async () => true);
    const harness = await mountHook({
      isSending: true,
      refreshSessionDetail,
    });

    try {
      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(refreshSessionDetail).not.toHaveBeenCalled();

      await harness.render({ isSending: false });

      expect(refreshSessionDetail).not.toHaveBeenCalled();
      await flushCoalescedRefresh();

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith(
        "session-1",
        runtimeSyncRefreshRequest("runtimeSync.sendSettled"),
      );
    } finally {
      harness.unmount();
    }
  });

  it("浏览器桥接下无活跃工作时不应订阅 team 事件，避免旧会话占满 SSE 连接", async () => {
    mockHasDesktopHostEventListenerCapability.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(true);
    const runtime = {
      listenToTurnEvents: vi.fn(async () => () => {}),
      listenToTeamEvents: vi.fn(async () => () => {}),
    };
    const harness = await mountHook({
      runtime,
      isSending: false,
      queuedTurnCount: 0,
      threadReadStatus: null,
      threadTurns: [],
    });

    try {
      expect(runtime.listenToTeamEvents).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("浏览器桥接下存在活跃工作时仍应订阅 team 事件", async () => {
    mockHasDesktopHostEventListenerCapability.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(true);
    const runtime = {
      listenToTurnEvents: vi.fn(async () => () => {}),
      listenToTeamEvents: vi.fn(async () => () => {}),
    };
    const harness = await mountHook({
      runtime,
      isSending: true,
    });

    try {
      expect(runtime.listenToTeamEvents).toHaveBeenCalledWith(
        "agent_subagent_status:session-1",
        expect.any(Function),
      );
    } finally {
      harness.unmount();
    }
  });
});
