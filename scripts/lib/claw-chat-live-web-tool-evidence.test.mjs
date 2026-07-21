import { describe, expect, it } from "vitest";

import {
  collectToolCallsFromValue,
  liveWebToolEvidenceFromSession,
  liveWebToolStreamEvidenceFromEvents,
  toolCallMatchesTurn,
  toolCallTurnId,
} from "./claw-chat-live-web-tool-evidence.mjs";

function appServerEventRecord({
  sessionId = "session-a",
  turnId = "live-turn",
  type,
  sequence,
  payload = {},
  direction = "drain",
}) {
  return {
    direction,
    invokeIndex: sequence,
    messageIndex: 0,
    params: {
      event: {
        eventId: `${turnId}-${sequence}`,
        sequence,
        sessionId,
        turnId,
        type,
        payload,
      },
    },
  };
}

describe("claw-chat-live-web-tool-evidence", () => {
  it("只把本次 turn 的 WebSearch/WebFetch 完成态计入通过条件", () => {
    const session = {
      thread_read: {
        tool_calls: [
          {
            tool_name: "WebSearch",
            status: "completed",
            turn_id: "old-turn",
            output_preview: "old search",
          },
          {
            tool_name: "WebFetch",
            status: "completed",
            turn_id: "old-turn",
            output_preview: "old fetch",
          },
          {
            tool_name: "WebSearch",
            status: "completed",
            turn_id: "live-turn",
            output_preview: "live search",
          },
        ],
      },
    };

    const evidence = liveWebToolEvidenceFromSession(session, {
      turnId: "live-turn",
    });

    expect(evidence.allRequiredCompleted).toBe(true);
    expect(evidence.allRequiredCompletedForTurn).toBe(false);
    expect(evidence.allRequiredOutputPresent).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(false);
    expect(evidence.turnScopedToolCalls.map((call) => call.name)).toEqual([
      "WebSearch",
    ]);
    expect(
      evidence.requiredForTurn.find((item) => item.name === "WebSearch")
        ?.completed,
    ).toBe(true);
    expect(
      evidence.requiredForTurn.find((item) => item.name === "WebFetch")
        ?.completed,
    ).toBe(false);
  });

  it("支持从 turn 容器继承 turn_id，但不跨 turn 混用工具事实", () => {
    const session = {
      turns: [
        {
          turn_id: "old-turn",
          tool_calls: [
            {
              tool_name: "WebSearch",
              status: "completed",
              output_preview: "old search",
            },
            {
              tool_name: "WebFetch",
              status: "completed",
              output_preview: "old fetch",
            },
          ],
        },
        {
          turnId: "live-turn",
          toolCalls: [
            {
              toolName: "WebSearch",
              resultStatus: "success",
              outputPreview: "live search",
            },
            {
              toolName: "WebFetch",
              state: "done",
              outputPreview: "live fetch",
            },
          ],
        },
      ],
    };

    const evidence = liveWebToolEvidenceFromSession(session, {
      turnId: "live-turn",
    });

    expect(evidence.allRequiredCompletedForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(true);
    expect(evidence.turnScopedToolCallCount).toBe(2);
    expect(evidence.turnScopedToolCalls.map((call) => call.turnId)).toEqual([
      "live-turn",
      "live-turn",
    ]);
  });

  it("提取并匹配 App Server read model 的 turn_id / turnId 字段", () => {
    const calls = collectToolCallsFromValue({
      threadRead: {
        toolCalls: [
          {
            name: "WebFetch",
            status: "completed",
            turnId: "turn-a",
            output: "fetched",
          },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(toolCallTurnId(calls[0])).toBe("turn-a");
    expect(toolCallMatchesTurn(calls[0], "turn-a")).toBe(true);
    expect(toolCallMatchesTurn(calls[0], "turn-b")).toBe(false);
  });

  it("支持 App Server JSON-RPC thread/read 的 result.detail envelope", () => {
    const response = {
      id: "smoke-1",
      result: {
        detail: {
          session_id: "session-a",
          thread_read: {
            tool_calls: [
              {
                tool_name: "WebSearch",
                status: "completed",
                turn_id: "live-turn",
                output_preview: "search result",
              },
              {
                tool_name: "WebFetch",
                status: "completed",
                turn_id: "live-turn",
                output_preview: "fetch result",
              },
            ],
          },
        },
      },
    };

    const evidence = liveWebToolEvidenceFromSession(response, {
      turnId: "live-turn",
    });

    expect(evidence.toolCallCount).toBe(2);
    expect(evidence.allRequiredCompletedForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(true);
    expect(evidence.requiredForTurn.map((item) => item.name)).toEqual([
      "WebSearch",
      "WebFetch",
    ]);
  });

  it("完成态 WebSearch/WebFetch 必须有输出证据才算 output present", () => {
    const evidence = liveWebToolEvidenceFromSession(
      {
        thread_read: {
          tool_calls: [
            {
              tool_name: "WebSearch",
              status: "completed",
              turn_id: "live-turn",
              output_preview: "search result",
            },
            {
              tool_name: "WebFetch",
              status: "completed",
              turn_id: "live-turn",
              output_preview: "",
            },
          ],
        },
      },
      { turnId: "live-turn" },
    );

    expect(evidence.allRequiredCompletedForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(false);
    expect(
      evidence.requiredForTurn.find((item) => item.name === "WebFetch")
        ?.outputPresent,
    ).toBe(false);
  });

  it("只把本次 turn 的 WebSearch/WebFetch started/result/output/order 事件计入通过条件", () => {
    const evidence = liveWebToolStreamEvidenceFromEvents(
      [
        appServerEventRecord({
          turnId: "old-turn",
          type: "tool.started",
          sequence: 1,
          payload: { toolName: "WebSearch", toolCallId: "old-search" },
        }),
        appServerEventRecord({
          type: "tool.started",
          sequence: 2,
          payload: { toolName: "WebSearch", toolCallId: "search-1" },
        }),
        appServerEventRecord({
          type: "tool.result",
          sequence: 3,
          payload: {
            toolName: "WebSearch",
            toolCallId: "search-1",
            output: "search result",
          },
        }),
        appServerEventRecord({
          type: "tool.started",
          sequence: 4,
          payload: { tool_name: "WebFetch", tool_call_id: "fetch-1" },
        }),
        appServerEventRecord({
          type: "tool.result",
          sequence: 5,
          payload: {
            tool_name: "WebFetch",
            tool_call_id: "fetch-1",
            result: { text: "fetch result" },
          },
        }),
        appServerEventRecord({
          type: "turn.completed",
          sequence: 6,
          payload: { status: "completed" },
        }),
      ],
      { sessionId: "session-a", turnId: "live-turn" },
    );

    expect(evidence.eventCount).toBe(5);
    expect(evidence.toolEventCount).toBe(4);
    expect(evidence.terminalEventSeen).toBe(true);
    expect(evidence.allRequiredStartedForTurn).toBe(true);
    expect(evidence.allRequiredResultForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(true);
    expect(evidence.allRequiredResultAfterStartForTurn).toBe(true);
    expect(evidence.allRequiredToolEventsForTurn).toBe(true);
    expect(evidence.required.map((item) => item.name)).toEqual([
      "WebSearch",
      "WebFetch",
    ]);
  });

  it("缺少明确 session/turn scope 的工具事件不能让 live Web turn 通过", () => {
    const evidence = liveWebToolStreamEvidenceFromEvents(
      [
        {
          direction: "drain",
          params: {
            event: {
              type: "tool.started",
              payload: { toolName: "WebSearch", toolCallId: "search-1" },
            },
          },
        },
        appServerEventRecord({
          type: "tool.result",
          sequence: 2,
          payload: {
            toolName: "WebSearch",
            toolCallId: "search-1",
            output: "search result",
          },
        }),
      ],
      { sessionId: "session-a", turnId: "live-turn" },
    );

    expect(evidence.toolEventCount).toBe(1);
    expect(
      evidence.required.find((item) => item.name === "WebSearch")?.started,
    ).toBe(false);
    expect(evidence.allRequiredToolEventsForTurn).toBe(false);
  });

  it("tool.result 必须在同一 tool call 的 tool.started 之后才算事件顺序有效", () => {
    const evidence = liveWebToolStreamEvidenceFromEvents(
      [
        appServerEventRecord({
          type: "tool.result",
          sequence: 1,
          payload: {
            toolName: "WebSearch",
            toolCallId: "search-1",
            output: "search result",
          },
        }),
        appServerEventRecord({
          type: "tool.started",
          sequence: 2,
          payload: { toolName: "WebSearch", toolCallId: "search-1" },
        }),
        appServerEventRecord({
          type: "tool.started",
          sequence: 3,
          payload: { toolName: "WebFetch", toolCallId: "fetch-1" },
        }),
        appServerEventRecord({
          type: "tool.result",
          sequence: 4,
          payload: {
            toolName: "WebFetch",
            toolCallId: "fetch-1",
            output: "fetch result",
          },
        }),
      ],
      { sessionId: "session-a", turnId: "live-turn" },
    );

    expect(evidence.allRequiredStartedForTurn).toBe(true);
    expect(evidence.allRequiredResultForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(true);
    expect(evidence.allRequiredResultAfterStartForTurn).toBe(false);
    expect(evidence.allRequiredToolEventsForTurn).toBe(false);
  });

  it("tool.result 没有非空输出时不能让工具事件流通过", () => {
    const evidence = liveWebToolStreamEvidenceFromEvents(
      [
        appServerEventRecord({
          type: "tool.started",
          sequence: 1,
          payload: { toolName: "WebSearch", toolCallId: "search-1" },
        }),
        appServerEventRecord({
          type: "tool.result",
          sequence: 2,
          payload: {
            toolName: "WebSearch",
            toolCallId: "search-1",
            output: "search result",
          },
        }),
        appServerEventRecord({
          type: "tool.started",
          sequence: 3,
          payload: { toolName: "WebFetch", toolCallId: "fetch-1" },
        }),
        appServerEventRecord({
          type: "tool.result",
          sequence: 4,
          payload: {
            toolName: "WebFetch",
            toolCallId: "fetch-1",
            output: "",
          },
        }),
      ],
      { sessionId: "session-a", turnId: "live-turn" },
    );

    expect(evidence.allRequiredStartedForTurn).toBe(true);
    expect(evidence.allRequiredResultForTurn).toBe(true);
    expect(evidence.allRequiredResultAfterStartForTurn).toBe(true);
    expect(evidence.allRequiredOutputPresentForTurn).toBe(false);
    expect(evidence.allRequiredToolEventsForTurn).toBe(false);
  });
});
