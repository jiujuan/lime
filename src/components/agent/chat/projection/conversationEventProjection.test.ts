import { describe, expect, it } from "vitest";
import { buildConversationProjectionEvents } from "./conversationEventProjection";

const baseContext = {
  sequence: 10,
  timestamp: "2026-05-09T00:00:00.000Z",
  sessionId: "session-1",
  runId: "agent_turn_stream:session-1",
  messageId: "assistant-1",
};

describe("conversationEventProjection", () => {
  it("应由 conversation owner 统一分发 message snapshot", () => {
    const events = buildConversationProjectionEvents(
      {
        type: "message",
        message: {
          id: "assistant-1",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "最终答案",
            },
          ],
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "messages.snapshot",
      sourceType: "message",
      sessionId: "session-1",
      runId: "agent_turn_stream:session-1",
      messageId: "assistant-1",
      owner: "session",
      scope: "message",
      phase: "hydrating",
      surface: "conversation",
      persistence: "snapshot",
      payload: {
        role: "assistant",
        partCount: 1,
      },
    });
  });

  it("应由 conversation owner 统一分发 text delta batch", () => {
    const events = buildConversationProjectionEvents(
      {
        type: "text_delta_batch",
        text: "第一段\n第二段",
        chunks: ["第一段", "第二段"],
        boundary: "newline",
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "text.delta",
      sourceType: "text_delta_batch",
      owner: "model",
      scope: "part",
      phase: "producing",
      surface: "conversation",
      persistence: "transcript",
      payload: {
        textLength: 7,
        preview: "第一段\n第二段",
        chunkCount: 2,
        boundary: "newline",
      },
    });
  });

  it("应由 conversation owner 统一分发 reasoning final", () => {
    const events = buildConversationProjectionEvents(
      {
        type: "reasoning_final",
        reasoningId: "reasoning-1",
        text: "先分析完整过程",
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "reasoning.delta",
      sourceType: "reasoning_final",
      owner: "model",
      scope: "part",
      phase: "reasoning",
      surface: "inline_process",
      persistence: "ephemeral_live",
      payload: {
        textLength: 7,
        preview: "先分析完整过程",
      },
    });
  });

  it("应只把 Codex reasoning summary delta 投影到可见 reasoning surface", () => {
    expect(
      buildConversationProjectionEvents(
        {
          type: "reasoning_summary_delta",
          itemId: "reasoning-1",
          reasoningId: "reasoning-1",
          summaryIndex: 2,
          text: "先核对事实",
          delta: "先核对事实",
        },
        baseContext,
      ),
    ).toEqual([
      expect.objectContaining({
        type: "reasoning.delta",
        sourceType: "reasoning_summary_delta",
        partId: "reasoning-1",
        surface: "inline_process",
        payload: {
          textLength: 5,
          preview: "先核对事实",
          streamKind: "summary",
          summaryIndex: 2,
        },
      }),
    ]);
  });

  it("应保留 summary part/raw content 语义但不投影为用户可见文本", () => {
    expect(
      buildConversationProjectionEvents(
        {
          type: "reasoning_summary_part_added",
          itemId: "reasoning-1",
          reasoningId: "reasoning-1",
          summaryIndex: 1,
        },
        baseContext,
      ),
    ).toEqual([]);
    expect(
      buildConversationProjectionEvents(
        {
          type: "reasoning_content_delta",
          itemId: "reasoning-1",
          reasoningId: "reasoning-1",
          contentIndex: 0,
          text: "raw chain of thought",
          delta: "raw chain of thought",
        },
        baseContext,
      ),
    ).toEqual([]);
  });

  it("应把 reasoning lifecycle 事件保留为空投影", () => {
    expect(
      buildConversationProjectionEvents(
        {
          type: "reasoning_started",
          reasoningId: "reasoning-1",
        },
        baseContext,
      ),
    ).toEqual([]);
    expect(
      buildConversationProjectionEvents(
        {
          type: "reasoning_ended",
          reasoningId: "reasoning-1",
          status: "completed",
        },
        baseContext,
      ),
    ).toEqual([]);
  });
});
