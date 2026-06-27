import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import { mergeAssistantAgentMessageContentPartsFromThreadItems } from "./agentStreamAgentMessageContentSync";

describe("agentStreamAgentMessageContentSync", () => {
  it("完成态合并 agent_message content part 时不应跨 runtime turn 串线", () => {
    const previousTurnItem: AgentThreadItem = {
      id: "agent-message-final-turn-old",
      thread_id: "thread-1",
      turn_id: "turn-old",
      type: "agent_message",
      status: "completed",
      sequence: 10,
      text: "上一轮专家 Skills runtime 证据已完成",
      phase: "final_answer",
      started_at: "2026-06-26T10:00:00.000Z",
      updated_at: "2026-06-26T10:00:01.000Z",
      completed_at: "2026-06-26T10:00:01.000Z",
    };
    const currentTurnItem: AgentThreadItem = {
      id: "agent-message-final-turn-current",
      thread_id: "thread-1",
      turn_id: "turn-current",
      type: "agent_message",
      status: "completed",
      sequence: 20,
      text: "当前轮专家面板新增 Skill 后的下一轮 runtime 证据已完成",
      phase: "final_answer",
      started_at: "2026-06-26T10:01:00.000Z",
      updated_at: "2026-06-26T10:01:01.000Z",
      completed_at: "2026-06-26T10:01:01.000Z",
    };

    const parts = mergeAssistantAgentMessageContentPartsFromThreadItems({
      items: [previousTurnItem, currentTurnItem],
      turnId: "turn-current",
    });

    expect(parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "当前轮专家面板新增 Skill 后的下一轮 runtime 证据已完成",
        metadata: expect.objectContaining({
          itemId: "agent-message-final-turn-current",
          phase: "final_answer",
          turnId: "turn-current",
        }),
      }),
    ]);
  });
});
