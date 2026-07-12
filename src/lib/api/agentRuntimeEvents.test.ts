import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeListen } from "@/lib/dev-bridge";
import {
  createAgentRuntimeEventListener,
  createAgentRuntimeEventSource,
  dedupeAgentRuntimeEventNames,
  defaultAgentRuntimeEventSource,
  getAgentSubagentStatusEventName,
  getAgentSubagentStreamEventName,
  listenAgentRuntimeEvent,
  listenAgentSubagentStatus,
  listenAgentSubagentStream,
  publishAgentRuntimeEvent,
} from "./agentRuntimeEvents";
import { resetAgentRuntimeEventSequenceGatesForTests } from "./agentRuntime/eventSequenceGate";

vi.mock("@/lib/dev-bridge", () => ({
  safeListen: vi.fn(),
}));

describe("agentRuntimeEvents API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAgentRuntimeEventSequenceGatesForTests();
  });

  it("应生成并去重子代理运行时事件名", () => {
    expect(getAgentSubagentStatusEventName("session-1")).toBe(
      "agent_subagent_status:session-1",
    );
    expect(getAgentSubagentStreamEventName("session-1")).toBe(
      "agent_subagent_stream:session-1",
    );
    expect(
      dedupeAgentRuntimeEventNames([
        "agent_subagent_status:session-1",
        null,
        "agent_subagent_status:session-1",
        undefined,
        "agent_subagent_status:session-2",
      ]),
    ).toEqual([
      "agent_subagent_status:session-1",
      "agent_subagent_status:session-2",
    ]);
  });

  it("应代理子代理状态与流事件监听", async () => {
    vi.mocked(safeListen)
      .mockImplementationOnce(async (_event, handler) => {
        handler({
          payload: {
            type: "subagent_status_changed",
            session_id: "session-1",
            status: "running",
          },
        });
        return vi.fn();
      })
      .mockImplementationOnce(async (_event, handler) => {
        handler({
          payload: {
            type: "tool_start",
            tool_id: "tool-1",
            tool_name: "browser_snapshot",
          },
        });
        return vi.fn();
      });

    const statusListener = vi.fn();
    const streamListener = vi.fn();

    await listenAgentSubagentStatus("session-1", statusListener);
    await listenAgentSubagentStream("session-1", streamListener);

    expect(safeListen).toHaveBeenNthCalledWith(
      1,
      "agent_subagent_status:session-1",
      expect.any(Function),
    );
    expect(safeListen).toHaveBeenNthCalledWith(
      2,
      "agent_subagent_stream:session-1",
      expect.any(Function),
    );
    expect(statusListener).toHaveBeenCalledTimes(1);
    expect(streamListener).toHaveBeenCalledTimes(1);
  });

  it("应代理通用 runtime 事件监听", async () => {
    vi.mocked(safeListen).mockImplementationOnce(async (_event, handler) => {
      handler({
        payload: {
          type: "text_delta",
          text: "hello",
        },
      });
      return vi.fn();
    });

    const listener = vi.fn();
    await listenAgentRuntimeEvent("agent_turn_stream:session-1", listener);

    expect(safeListen).toHaveBeenCalledWith(
      "agent_turn_stream:session-1",
      expect.any(Function),
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("应把本地发布的 App Server runtime 事件投递给现有 listener", async () => {
    vi.mocked(safeListen).mockResolvedValueOnce(vi.fn());

    const listener = vi.fn();
    const unlisten = await listenAgentRuntimeEvent(
      "agent_stream_message-1",
      listener,
    );

    publishAgentRuntimeEvent("agent_stream_message-1", {
      type: "text_delta",
      text: "App Server delta",
    });

    expect(listener).toHaveBeenCalledWith({
      payload: {
        type: "text_delta",
        text: "App Server delta",
      },
    });

    unlisten();
    publishAgentRuntimeEvent("agent_stream_message-1", {
      type: "text_delta",
      text: "ignored",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("应在 Lime runtime event 网关阻断未配对的 App Server tool.result", async () => {
    vi.mocked(safeListen).mockResolvedValueOnce(vi.fn());

    const listener = vi.fn();
    await listenAgentRuntimeEvent("agentSession/event/session-1", listener);

    publishAgentRuntimeEvent("agentSession/event/session-1", {
      type: "tool_end",
      event_id: "evt-tool-result",
      sequence: 1,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      timestamp: "2026-06-12T00:00:00.000Z",
      tool_id: "tool-orphan",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("应允许 App Server message.delta 由 turn_completed 收口后进入现有 listener", async () => {
    vi.mocked(safeListen).mockResolvedValueOnce(vi.fn());

    const listener = vi.fn();
    await listenAgentRuntimeEvent("agentSession/event/session-1", listener);

    publishAgentRuntimeEvent("agentSession/event/session-1", {
      type: "text_delta",
      event_id: "evt-message-delta",
      sequence: 1,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      timestamp: "2026-06-12T00:00:00.000Z",
      text: "hello",
    });
    publishAgentRuntimeEvent("agentSession/event/session-1", {
      type: "turn_completed",
      event_id: "evt-turn-completed",
      sequence: 2,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      timestamp: "2026-06-12T00:00:01.000Z",
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => event.payload.type)).toEqual([
      "text_delta",
      "turn_completed",
    ]);
  });

  it("应在本地 runtime event 网关消费 pipeline fan-out 输出", async () => {
    vi.mocked(safeListen).mockResolvedValueOnce(vi.fn());

    const listener = vi.fn();
    await listenAgentRuntimeEvent("agentSession/event/session-1", listener);

    publishAgentRuntimeEvent("agentSession/event/session-1", {
      type: "tool_completed",
      event_id: "evt-tool-completed",
      sequence: 1,
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      timestamp: "2026-06-12T00:00:00.000Z",
      tool_id: "tool-fanout",
      tool_name: "search",
      output: "done",
    });

    expect(listener.mock.calls.map(([event]) => event.payload.type)).toEqual([
      "tool_start",
      "tool_end",
    ]);
    expect(
      listener.mock.calls.map(([event]) => event.payload.toolCallId),
    ).toEqual(["tool-fanout", "tool-fanout"]);
  });

  it("应支持注入自定义 listen transport 与 event source", async () => {
    const listen = vi.fn().mockResolvedValue(vi.fn());
    const listenEvent = createAgentRuntimeEventListener({ listen });
    const eventSource = createAgentRuntimeEventSource({ listenEvent });
    const handler = vi.fn();

    await eventSource.listenSubagentStatus("session-9", handler);
    await eventSource.listenSubagentStream("session-9", handler);

    expect(listen).toHaveBeenNthCalledWith(
      1,
      "agent_subagent_status:session-9",
      expect.any(Function),
    );
    expect(listen).toHaveBeenNthCalledWith(
      2,
      "agent_subagent_stream:session-9",
      expect.any(Function),
    );
    expect(defaultAgentRuntimeEventSource.listenRuntimeEvent).toBeTypeOf(
      "function",
    );
  });
});
