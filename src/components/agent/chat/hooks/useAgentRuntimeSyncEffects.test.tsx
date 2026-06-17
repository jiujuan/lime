import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_SERVER_METHOD_AGENT_SESSION_EVENT } from "@/lib/api/appServer";
import { listenAgentRuntimeEvent } from "@/lib/api/agentRuntimeEvents";
import {
  createThreadClient,
  type AgentRuntimeAppServerClient,
} from "@/lib/api/agentRuntime/threadClient";
import type { AgentThreadTurn } from "../types";
import { useAgentRuntimeSyncEffects } from "./useAgentRuntimeSyncEffects";

const mockIsAppServerBridgeAvailable = vi.hoisted(() => vi.fn(() => false));
const mockHasDevBridgeEventListenerCapability = vi.hoisted(() =>
  vi.fn(() => false),
);
const mockHasDesktopHostEventListenerCapability = vi.hoisted(() =>
  vi.fn(() => true),
);
const mockSafeInvoke = vi.hoisted(() => vi.fn());
const mockSafeListen = vi.hoisted(() => vi.fn(async () => () => {}));

vi.mock("@/lib/api/appServerBridgeAvailability", () => ({
  isAppServerBridgeAvailable: mockIsAppServerBridgeAvailable,
}));

vi.mock("@/lib/dev-bridge", () => ({
  hasDevBridgeEventListenerCapability: mockHasDevBridgeEventListenerCapability,
  safeInvoke: mockSafeInvoke,
  safeListen: mockSafeListen,
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostEventListenerCapability:
    mockHasDesktopHostEventListenerCapability,
}));

type HookProps = Parameters<typeof useAgentRuntimeSyncEffects>[0];

interface HookHarness {
  render: (nextProps?: Partial<HookProps>) => Promise<void>;
  unmount: () => void;
}

const mountedRoots: Array<{
  container: HTMLDivElement;
  root: ReturnType<typeof createRoot>;
}> = [];

function createThreadTurn(
  overrides?: Partial<AgentThreadTurn>,
): AgentThreadTurn {
  return {
    id: "turn-1",
    thread_id: "thread-1",
    prompt_text: "继续执行",
    status: "completed",
    started_at: "2026-03-29T00:00:00.000Z",
    created_at: "2026-03-29T00:00:00.000Z",
    updated_at: "2026-03-29T00:00:00.000Z",
    ...overrides,
  };
}

function createAppServerThreadClientMock(): AgentRuntimeAppServerClient {
  return {
    readSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
      },
      response: {
        id: 1,
        result: {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "agent-chat",
            status: "idle",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          turns: [],
        },
      },
      messages: [],
      notifications: [],
    }),
    startTurn: vi.fn().mockResolvedValue({}),
    cancelTurn: vi.fn().mockResolvedValue({}),
    replayAction: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        action: null,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    compactAgentSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        compacted: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    resumeAgentSessionThread: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        resumed: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    removeAgentSessionQueuedTurn: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        queuedTurnId: "queued-1",
        removed: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    promoteAgentSessionQueuedTurn: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
        queuedTurnId: "queued-1",
        promoted: true,
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    respondAction: vi.fn().mockResolvedValue({}),
    listAgentSessionFileCheckpoints: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpointCount: 0,
        checkpoints: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    getAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: {
          checkpointId: "checkpoint-1",
          turnId: "turn-1",
          path: "src/App.tsx",
          source: "tool_result",
          updatedAt: "2026-06-06T00:00:00.000Z",
          validationIssueCount: 0,
        },
        livePath: "/tmp/work/src/App.tsx",
        snapshotPath: "/tmp/work/.lime/checkpoints/checkpoint-1/App.tsx",
        versionHistory: [],
        validationIssues: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    diffAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: {
          checkpointId: "checkpoint-1",
          turnId: "turn-1",
          path: "src/App.tsx",
          source: "tool_result",
          updatedAt: "2026-06-06T00:00:00.000Z",
          validationIssueCount: 0,
        },
        diff: [],
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    restoreAgentSessionFileCheckpoint: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: {
          checkpointId: "checkpoint-1",
          turnId: "turn-1",
          path: "src/App.tsx",
          source: "tool_result",
          updatedAt: "2026-06-06T00:00:00.000Z",
          validationIssueCount: 0,
        },
        livePath: "src/App.tsx",
        snapshotPath: ".lime/checkpoints/checkpoint-1/App.tsx",
        backupPath: null,
        restoredAt: "2026-06-06T00:00:01.000Z",
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    listCapabilities: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        capabilities: [],
        runtimeCapabilityManifest: {
          schemaVersion: "lime-runtime-capability-manifest/v0.1",
          runtimeId: "app-server",
          generatedAt: "2026-06-12T00:00:00.000Z",
          capabilities: [],
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    drainEvents: vi.fn().mockResolvedValue([]),
  };
}

async function mountHook(props?: Partial<HookProps>): Promise<HookHarness> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: HookProps = {
    runtime: {
      listenToTeamEvents: vi.fn(async () => () => {}),
      listenToTurnEvents: vi.fn(async () => () => {}),
    },
    sessionIdRef: { current: "session-1" },
    sessionId: "session-1",
    parentSessionId: null,
    currentTurnEventName: null,
    isSending: false,
    threadReadStatus: null,
    queuedTurnCount: 0,
    threadTurns: [],
    refreshSessionDetail: vi.fn(async () => true),
  };

  function TestComponent(currentProps: HookProps) {
    useAgentRuntimeSyncEffects(currentProps);
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    const mergedProps = {
      ...defaultProps,
      ...props,
      ...nextProps,
    };
    await act(async () => {
      root.render(<TestComponent {...mergedProps} />);
      await Promise.resolve();
    });
  };

  await render();
  const mounted = { container, root };
  mountedRoots.push(mounted);

  return {
    render,
    unmount: () => {
      const index = mountedRoots.indexOf(mounted);
      if (index >= 0) {
        mountedRoots.splice(index, 1);
      }
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useAgentRuntimeSyncEffects", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T00:05:00.000Z"));
    mockIsAppServerBridgeAvailable.mockReturnValue(false);
    mockHasDevBridgeEventListenerCapability.mockReturnValue(false);
    mockHasDesktopHostEventListenerCapability.mockReturnValue(true);
    mockSafeListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        break;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");

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
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");

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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(2);
      expect(refreshSessionDetail).toHaveBeenLastCalledWith("session-1");

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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(3);
      expect(refreshSessionDetail).toHaveBeenLastCalledWith("session-1");

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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(4);
      expect(refreshSessionDetail).toHaveBeenLastCalledWith("session-1");
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
      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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
      expect(refreshSessionDetail).toHaveBeenLastCalledWith("session-1");

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

      expect(refreshSessionDetail).toHaveBeenCalledTimes(1);
      expect(refreshSessionDetail).toHaveBeenCalledWith("session-1");
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
