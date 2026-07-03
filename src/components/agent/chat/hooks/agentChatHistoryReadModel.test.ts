import { describe, expect, it } from "vitest";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import { hydrateSessionDetailMessagesFromThreadReadToolCalls } from "./agentChatHistoryReadModel";

describe("agentChatHistoryReadModel", () => {
  it("应从 thread_read.turns 恢复工具轨迹消息的 usage", () => {
    const detail = {
      messages: [],
      turns: [],
      items: [],
      thread_read: {
        thread_id: "thread-image",
        turns: [
          {
            turnId: "turn-image",
            status: "completed",
            usage: {
              inputTokens: 31_000,
              outputTokens: 119,
              cachedInputTokens: 0,
            },
          },
        ],
        tool_calls: [
          {
            tool_call_id: "tool-image",
            turn_id: "turn-image",
            tool_name: "lime_create_image_generation_task",
            status: "completed",
            started_at: "2026-07-03T10:00:00.000Z",
            finished_at: "2026-07-03T10:00:01.000Z",
            success: true,
            output: "",
          },
        ],
      },
    } as unknown as AsterSessionDetail;

    const messages = hydrateSessionDetailMessagesFromThreadReadToolCalls(
      detail,
      "session-image",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.runtimeTurnId).toBe("turn-image");
    expect(messages[0]?.usage).toEqual({
      input_tokens: 31_000,
      output_tokens: 119,
      cached_input_tokens: 0,
      cache_creation_input_tokens: undefined,
    });
  });
});
