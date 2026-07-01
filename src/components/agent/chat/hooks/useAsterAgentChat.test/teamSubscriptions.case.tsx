import { act } from "react";
import {
  describe,
  expect,
  it
} from "vitest";
import {
  flushEffects,
  flushRuntimeDetailRefresh,
  mockGetAgentRuntimeSession,
  mockListAgentRuntimeSessions,
  mockSafeListen,
  mountHook
} from "../useAsterAgentChat.testUtils";

describe("useAsterAgentChat team 订阅", () => {
  it("首次还没有 team 图谱时也应订阅当前会话的 subagent 状态事件", async () => {
    const workspaceId = "ws-team-runtime-empty";
    const sessionId = "session-team-runtime-empty";
    const listeners: Array<{
      eventName: string;
      handler: (event: { payload: unknown }) => void;
    }> = [];

    sessionStorage.setItem(
      `aster_curr_sessionId_${workspaceId}`,
      JSON.stringify(sessionId),
    );
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: sessionId,
        name: "团队总览",
        created_at: 1700000400,
        updated_at: 1700000401,
        messages_count: 0,
      },
    ]);
    mockGetAgentRuntimeSession
      .mockResolvedValueOnce({
        id: sessionId,
        messages: [],
        turns: [],
        items: [],
        queued_turns: [],
        child_subagent_sessions: [],
      })
      .mockResolvedValue({
        id: sessionId,
        messages: [],
        turns: [],
        items: [],
        queued_turns: [],
        child_subagent_sessions: [
          {
            id: "child-team-empty-1",
            name: "研究员",
            created_at: 1700000402,
            updated_at: 1700000403,
            session_type: "sub_agent",
            runtime_status: "queued",
            task_summary: "整理竞品资料",
          },
        ],
      });
    mockSafeListen.mockImplementation(async (eventName, handler) => {
      listeners.push({
        eventName,
        handler: handler as (event: { payload: unknown }) => void,
      });
      return () => {};
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(listeners.map((item) => item.eventName)).toContain(
        `agent_subagent_status:${sessionId}`,
      );
      expect(mockGetAgentRuntimeSession).toHaveBeenCalledTimes(1);

      const listener = listeners
        .filter(
          (item) => item.eventName === `agent_subagent_status:${sessionId}`,
        )
        .at(-1);
      expect(listener).toBeTruthy();

      act(() => {
        listener?.handler({
          payload: {
            type: "subagent_status_changed",
            session_id: "child-team-empty-1",
            root_session_id: sessionId,
            status: "queued",
          },
        });
      });
      await flushEffects();
      await flushRuntimeDetailRefresh();

      expect(mockGetAgentRuntimeSession).toHaveBeenCalledTimes(2);
    } finally {
      harness.unmount();
    }
  });

  it("收到 subagent_status_changed 后应刷新当前会话详情", async () => {
    const workspaceId = "ws-team-runtime";
    const sessionId = "session-team-runtime";
    const listeners: Array<{
      eventName: string;
      handler: (event: { payload: unknown }) => void;
    }> = [];

    sessionStorage.setItem(
      `aster_curr_sessionId_${workspaceId}`,
      JSON.stringify(sessionId),
    );
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: sessionId,
        name: "团队总览",
        created_at: 1700000400,
        updated_at: 1700000401,
        messages_count: 0,
      },
    ]);
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: sessionId,
      messages: [],
      turns: [],
      items: [],
      queued_turns: [],
      child_subagent_sessions: [
        {
          id: "child-team-1",
          name: "研究员",
          created_at: 1700000402,
          updated_at: 1700000403,
          session_type: "sub_agent",
          runtime_status: "queued",
          task_summary: "整理竞品资料",
        },
      ],
    });
    mockSafeListen.mockImplementation(async (eventName, handler) => {
      listeners.push({
        eventName,
        handler: handler as (event: { payload: unknown }) => void,
      });
      return () => {};
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await flushEffects();

      expect(listeners.map((item) => item.eventName)).toContain(
        `agent_subagent_status:${sessionId}`,
      );
      expect(mockGetAgentRuntimeSession).toHaveBeenCalledTimes(1);

      const listener = listeners
        .filter(
          (item) => item.eventName === `agent_subagent_status:${sessionId}`,
        )
        .at(-1);
      expect(listener).toBeTruthy();

      act(() => {
        listener?.handler({
          payload: {
            type: "subagent_status_changed",
            session_id: "child-team-1",
            root_session_id: sessionId,
            status: "running",
          },
        });
      });
      await flushEffects();
      await flushRuntimeDetailRefresh();

      expect(mockGetAgentRuntimeSession).toHaveBeenCalledTimes(2);
    } finally {
      harness.unmount();
    }
  });
});
