import { describe, expect, it } from "vitest";

import type { AgentSessionDetail } from "@/lib/api/agentRuntime/sessionTypes";
import type { Message } from "../types";
import { buildHydratedAgentSessionSnapshot } from "./agentSessionState";

describe("agentSessionState canonical messages", () => {
  it("history hydrate 应以 canonical items 补全本地和 legacy messages 缺失的 final", () => {
    const currentMessages: Message[] = [
      {
        id: "local-user",
        role: "user",
        content: "继续",
        timestamp: new Date("2026-07-16T08:00:00.000Z"),
        runtimeTurnId: "turn-1",
      },
      {
        id: "local-assistant",
        role: "assistant",
        content: "第一段最终答复",
        contentParts: [
          {
            type: "text",
            text: "第一段最终答复",
            metadata: {
              threadItemId: "final-1",
              turnId: "turn-1",
              phase: "final_answer",
            },
          },
        ],
        timestamp: new Date("2026-07-16T08:00:01.000Z"),
        runtimeTurnId: "turn-1",
      },
    ];
    const detail = {
      id: "topic-1",
      thread_id: "thread-1",
      created_at: 1784188800,
      updated_at: 1784188802,
      messages: [
        {
          role: "user",
          runtime_turn_id: "turn-1",
          timestamp: 1784188800,
          content: [{ type: "text", text: "继续" }],
        },
        {
          role: "assistant",
          runtime_turn_id: "turn-1",
          timestamp: 1784188801,
          content: [{ type: "output_text", text: "第一段最终答复" }],
        },
      ],
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          status: "completed",
          prompt_text: "继续",
          started_at: "2026-07-16T08:00:00.000Z",
          completed_at: "2026-07-16T08:00:02.000Z",
          created_at: "2026-07-16T08:00:00.000Z",
          updated_at: "2026-07-16T08:00:02.000Z",
        },
      ],
      items: [
        {
          id: "user-1",
          type: "user_message",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "completed",
          content: "继续",
          started_at: "2026-07-16T08:00:00.000Z",
          completed_at: "2026-07-16T08:00:00.000Z",
          updated_at: "2026-07-16T08:00:00.000Z",
        },
        {
          id: "final-1",
          type: "agent_message",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 2,
          phase: "final_answer",
          status: "completed",
          text: "第一段最终答复",
          started_at: "2026-07-16T08:00:01.000Z",
          completed_at: "2026-07-16T08:00:01.000Z",
          updated_at: "2026-07-16T08:00:01.000Z",
        },
        {
          id: "final-2",
          type: "agent_message",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 3,
          phase: "final_answer",
          status: "completed",
          text: "第二段最终答复",
          started_at: "2026-07-16T08:00:02.000Z",
          completed_at: "2026-07-16T08:00:02.000Z",
          updated_at: "2026-07-16T08:00:02.000Z",
        },
      ],
    } as unknown as AgentSessionDetail;

    const result = buildHydratedAgentSessionSnapshot({
      topicId: "topic-1",
      detail,
      currentSessionId: "topic-1",
      currentMessages,
      currentThreadTurns: [],
      currentThreadItems: [],
      currentExecutionRuntime: null,
      currentExecutionStrategy: "react",
      topics: [],
      detailMergeMode: "history_hydrate",
    });

    const assistant = result.snapshot.messages.find(
      (message) => message.role === "assistant",
    );
    expect(assistant?.id).toBe("local-assistant");
    expect(
      assistant?.contentParts
        ?.filter((part) => part.type === "text")
        .map((part) => ({
          text: part.text,
          threadItemId: part.metadata?.threadItemId,
          phase: part.metadata?.phase,
        })),
    ).toEqual([
      {
        text: "第一段最终答复",
        threadItemId: "final-1",
        phase: "final_answer",
      },
      {
        text: "第二段最终答复",
        threadItemId: "final-2",
        phase: "final_answer",
      },
    ]);
  });
});
