import { describe, expect, it } from "vitest";

import type { AgentSessionDetail } from "@/lib/api/agentRuntime/sessionTypes";

import { hydrateSessionDetailMessages } from "./agentChatHistory";
import { mergeThreadItemReasoningIntoMessages } from "./agentChatHistoryReasoning";
import { collectDetailThreadItems } from "./agentChatHistoryThreadItems";
import { orderStreamingContentPartsForDisplay } from "../components/streamingContentPartOrder";

describe("agentChatHistoryThreadItems", () => {
  it("reasoning 的完成 sequence 晚于回答时仍按 canonical ordinal 展示在回答前", () => {
    const detail = {
      id: "canonical-history-order-session",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "canonical-history-order-turn",
          thread_id: "canonical-history-order-thread",
          prompt_text: "请先思考再回答。",
          status: "completed",
          started_at: "2026-07-14T10:00:00.000Z",
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T10:00:05.000Z",
        },
      ],
      items: [],
      thread_read: {
        thread_id: "canonical-history-order-thread",
        status: "completed",
        thread_items: [
          {
            id: "canonical-history-order-user",
            type: "user_message",
            thread_id: "canonical-history-order-thread",
            turn_id: "canonical-history-order-turn",
            ordinal: 1,
            sequence: 1,
            status: "completed",
            content: "请先思考再回答。",
            started_at: "2026-07-14T10:00:00.000Z",
            updated_at: "2026-07-14T10:00:00.000Z",
            completed_at: "2026-07-14T10:00:00.000Z",
          },
          {
            id: "canonical-history-order-reasoning",
            type: "reasoning",
            thread_id: "canonical-history-order-thread",
            turn_id: "canonical-history-order-turn",
            ordinal: 6,
            sequence: 320,
            status: "completed",
            text: "先核对 canonical Item 的首次出现顺序。",
            started_at: "2026-07-14T10:00:01.000Z",
            updated_at: "2026-07-14T10:00:05.000Z",
            completed_at: "2026-07-14T10:00:05.000Z",
          },
          {
            id: "canonical-history-order-answer",
            type: "agent_message",
            thread_id: "canonical-history-order-thread",
            turn_id: "canonical-history-order-turn",
            ordinal: 314,
            sequence: 316,
            status: "in_progress",
            text: "最终回答。",
            started_at: "2026-07-14T10:00:04.000Z",
            updated_at: "2026-07-14T10:00:04.000Z",
          },
        ],
        tool_calls: [],
      },
    } as unknown as AgentSessionDetail;

    const messages = hydrateSessionDetailMessages(
      detail,
      "canonical-history-order-session",
    );
    const assistantMessage = messages.find(
      (message) => message.role === "assistant",
    );

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(assistantMessage?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "text",
    ]);
    expect(
      orderStreamingContentPartsForDisplay(assistantMessage?.contentParts)?.map(
        (part) => part.type,
      ),
    ).toEqual(["thinking", "text"]);
    expect(assistantMessage?.contentParts).toEqual([
      expect.objectContaining({
        type: "thinking",
        metadata: expect.objectContaining({ sequence: 6 }),
      }),
      expect.objectContaining({
        type: "text",
        metadata: expect.objectContaining({ sequence: 314 }),
      }),
    ]);
    expect(assistantMessage?.content).toBe("最终回答。");
  });

  it("历史 read model 的 thread_items 应作为 reasoning/tool owner hydrate，且不回退成重复 legacy process", () => {
    const detail = {
      id: "history-replay-visual-session",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1783550000,
          content: [
            {
              type: "text",
              text: "请结合本地截图和远程参考图，先说明思路再调用 MCP。",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1783550004,
          content: [
            {
              type: "output_text",
              text: "我会先保留 reasoning，再等待 MCP 返回后继续。",
            },
          ],
        },
      ],
      turns: [
        {
          id: "history-replay-visual-turn",
          thread_id: "history-replay-visual-session",
          prompt_text: "请结合本地截图和远程参考图，先说明思路再调用 MCP。",
          status: "running",
          started_at: "2026-07-09T10:00:00.000Z",
          created_at: "2026-07-09T10:00:00.000Z",
          updated_at: "2026-07-09T10:00:04.000Z",
        },
      ],
      items: [],
      thread_read: {
        thread_id: "history-replay-visual-session",
        status: "running",
        active_turn_id: "history-replay-visual-turn",
        thread_items: [
          {
            id: "history-replay-visual-reasoning",
            type: "reasoning",
            thread_id: "history-replay-visual-session",
            turn_id: "history-replay-visual-turn",
            sequence: 3,
            status: "completed",
            text: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
            started_at: "2026-07-09T10:00:02.000Z",
            updated_at: "2026-07-09T10:00:02.000Z",
            completed_at: "2026-07-09T10:00:02.000Z",
            metadata: {
              source: "codex_history_replay_visual",
              source_event_id: "history-replay-visual-reasoning",
            },
          },
          {
            id: "history-replay-visual-mcp-read-file",
            type: "tool_call",
            thread_id: "history-replay-visual-session",
            turn_id: "history-replay-visual-turn",
            sequence: 4,
            status: "in_progress",
            tool_name: "mcp__filesystem__read_file",
            arguments: {
              path: "/workspace/README.md",
            },
            started_at: "2026-07-09T10:00:03.000Z",
            updated_at: "2026-07-09T10:00:03.000Z",
            metadata: {
              owner: "history_replay_visual",
              source_event_id: "history-replay-visual-mcp-read-file",
            },
          },
        ],
        tool_calls: [
          {
            tool_call_id: "history-replay-visual-mcp-read-file",
            turn_id: "history-replay-visual-turn",
            tool_name: "mcp__filesystem__read_file",
            status: "running",
            started_at: "2026-07-09T10:00:03.000Z",
            arguments: {
              path: "/workspace/README.md",
            },
          },
        ],
      },
    } as unknown as AgentSessionDetail;

    const messages = mergeThreadItemReasoningIntoMessages(
      hydrateSessionDetailMessages(detail, "history-replay-visual-session"),
      collectDetailThreadItems(detail),
    );
    const assistantMessage = messages.find(
      (message) => message.role === "assistant",
    );
    const thinkingParts =
      assistantMessage?.contentParts?.filter(
        (part) => part.type === "thinking",
      ) ?? [];
    const toolParts =
      assistantMessage?.contentParts?.filter(
        (part) => part.type === "tool_use",
      ) ?? [];

    expect(thinkingParts).toHaveLength(1);
    expect(thinkingParts[0]).toMatchObject({
      type: "thinking",
      text: "先确认本地图片和远程参考图都应作为结构化输入恢复。",
      metadata: {
        source: "thread_item_reasoning",
        threadItemId: "history-replay-visual-reasoning",
        turnId: "history-replay-visual-turn",
        sequence: 3,
      },
    });
    expect(toolParts).toHaveLength(1);
    expect(toolParts[0]).toMatchObject({
      type: "tool_use",
      metadata: {
        source: "agent_thread_item",
        threadItemId: "history-replay-visual-mcp-read-file",
        turnId: "history-replay-visual-turn",
        sequence: 4,
      },
      toolCall: {
        id: "history-replay-visual-mcp-read-file",
        name: "mcp__filesystem__read_file",
        status: "running",
        metadata: {
          source: "agent_thread_item",
          threadItemId: "history-replay-visual-mcp-read-file",
          turnId: "history-replay-visual-turn",
          sequence: 4,
        },
      },
    });
    expect(assistantMessage?.toolCalls).toHaveLength(1);
  });
});
