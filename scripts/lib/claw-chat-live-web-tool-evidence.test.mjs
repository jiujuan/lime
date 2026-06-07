import { describe, expect, it } from "vitest";

import {
  collectToolCallsFromValue,
  liveWebToolEvidenceFromSession,
  toolCallMatchesTurn,
  toolCallTurnId,
} from "./claw-chat-live-web-tool-evidence.mjs";

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

  it("支持 App Server JSON-RPC agentSession/read 的 result.detail envelope", () => {
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
});
