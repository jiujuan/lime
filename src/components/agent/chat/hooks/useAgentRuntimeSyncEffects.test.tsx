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

const mockIsDevBridgeAvailable = vi.hoisted(() => vi.fn(() => false));
const mockHasDevBridgeEventListenerCapability = vi.hoisted(() =>
  vi.fn(() => false),
);
const mockHasDesktopHostEventListenerCapability = vi.hoisted(() =>
  vi.fn(() => true),
);
const mockSafeInvoke = vi.hoisted(() => vi.fn());
const mockSafeListen = vi.hoisted(() => vi.fn(async () => () => {}));

vi.mock("@/lib/dev-bridge", () => ({
  hasDevBridgeEventListenerCapability: mockHasDevBridgeEventListenerCapability,
  isDevBridgeAvailable: mockIsDevBridgeAvailable,
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
    respondAction: vi.fn().mockResolvedValue({}),
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
    mockIsDevBridgeAvailable.mockReturnValue(false);
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
              eventId: "evt-done-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "turn.done",
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

  it("浏览器 DevBridge 发送中但无原生事件能力时，应轮询刷新当前会话详情", async () => {
    mockIsDevBridgeAvailable.mockReturnValue(true);
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
    mockIsDevBridgeAvailable.mockReturnValue(true);
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
