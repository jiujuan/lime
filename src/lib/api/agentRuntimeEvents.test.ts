import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeListen } from "@/lib/dev-bridge";
import {
  createAgentRuntimeEventListener,
  createAgentRuntimeEventSource,
  defaultAgentRuntimeEventSource,
  listenAgentRuntimeEvent,
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

  it("不应让缺少 canonical Item lifecycle 的 raw message/turn 事件进入 listener", async () => {
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

    expect(listener).not.toHaveBeenCalled();
  });

  it("不应为 raw tool.completed 合成 legacy tool fan-out", async () => {
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

    expect(listener).not.toHaveBeenCalled();
  });

  it("应支持注入自定义 listen transport 与 event source", async () => {
    const listen = vi.fn().mockResolvedValue(vi.fn());
    const listenEvent = createAgentRuntimeEventListener({ listen });
    const eventSource = createAgentRuntimeEventSource({ listenEvent });
    const handler = vi.fn();

    await eventSource.listenRuntimeEvent(
      "agentSession/event/session-9",
      handler,
    );

    expect(listen).toHaveBeenCalledWith(
      "agentSession/event/session-9",
      expect.any(Function),
    );
    expect(defaultAgentRuntimeEventSource.listenRuntimeEvent).toBeTypeOf(
      "function",
    );
  });
});
