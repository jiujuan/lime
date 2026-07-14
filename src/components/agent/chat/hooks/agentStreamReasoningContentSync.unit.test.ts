import { describe, expect, it, vi } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import {
  isPersistedReasoningContentPart,
  syncAssistantReasoningContentPartFromThreadItem,
} from "./agentStreamReasoningContentSync";

const toolStartTime = new Date("2026-06-22T10:00:00.000Z");

function buildToolItem(
  id: string,
  sequence: number,
): Extract<AgentThreadItem, { type: "tool_call" }> {
  return {
    id,
    thread_id: "session-1",
    turn_id: "turn-1",
    sequence,
    status: "completed",
    started_at: "2026-06-22T10:00:00.000Z",
    completed_at: "2026-06-22T10:00:01.000Z",
    updated_at: "2026-06-22T10:00:01.000Z",
    type: "tool_call",
    tool_name: id === "tool-search" ? "WebSearch" : "WebFetch",
    output: "完成",
    success: true,
  };
}

function buildReasoningItem(
  patch: Partial<Extract<AgentThreadItem, { type: "reasoning" }>> = {},
): Extract<AgentThreadItem, { type: "reasoning" }> {
  return {
    id: "reasoning-1",
    thread_id: "session-1",
    turn_id: "turn-1",
    sequence: 3,
    status: "completed",
    started_at: "2026-06-22T10:00:01.000Z",
    completed_at: "2026-06-22T10:00:02.000Z",
    updated_at: "2026-06-22T10:00:02.000Z",
    type: "reasoning",
    text: "搜索结果还需要继续筛掉广告软文。",
    ...patch,
  };
}

function applyReasoningSync(params: {
  messages: Message[];
  item?: AgentThreadItem;
  threadItems?: readonly AgentThreadItem[];
}): Message[] {
  let messages = params.messages;
  const setMessages = vi.fn(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      messages = typeof value === "function" ? value(messages) : value;
    },
  );

  syncAssistantReasoningContentPartFromThreadItem({
    assistantMsgId: "assistant-1",
    item: params.item ?? buildReasoningItem(),
    threadItems: params.threadItems,
    setMessages: setMessages as never,
  });

  return messages;
}

describe("agentStreamReasoningContentSync", () => {
  it("应识别持久化 reasoning thinking part", () => {
    expect(
      isPersistedReasoningContentPart({
        type: "thinking",
        text: "思考",
        metadata: {
          source: "thread_item_reasoning",
          threadItemId: "reasoning-1",
        },
      }),
    ).toBe(true);
    expect(
      isPersistedReasoningContentPart({
        type: "thinking",
        text: "临时思考",
      }),
    ).toBe(false);
  });

  it("应按 thread item sequence 把 reasoning 插入 WebSearch 与 WebFetch 之间", () => {
    const messages = applyReasoningSync({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-06-22T10:00:00.000Z"),
          contentParts: [
            {
              type: "tool_use",
              toolCall: {
                id: "tool-search",
                name: "WebSearch",
                arguments: "{}",
                status: "completed",
                startTime: toolStartTime,
              },
            },
            {
              type: "tool_use",
              toolCall: {
                id: "tool-fetch",
                name: "WebFetch",
                arguments: "{}",
                status: "completed",
                startTime: toolStartTime,
              },
            },
            { type: "text", text: "最终正文。" },
          ],
        },
      ],
      threadItems: [
        buildToolItem("tool-search", 2),
        buildReasoningItem(),
        buildToolItem("tool-fetch", 4),
      ],
    });

    expect(messages[0]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      metadata: { sequence: 2 },
    });
    expect(messages[0]?.contentParts?.[1]).toMatchObject({
      type: "thinking",
      text: "搜索结果还需要继续筛掉广告软文。",
      metadata: {
        source: "thread_item_reasoning",
        threadItemId: "reasoning-1",
        sequence: 3,
        turnId: "turn-1",
      },
    });
    expect(messages[0]?.contentParts?.[2]).toMatchObject({
      metadata: { sequence: 4 },
    });
  });

  it("reasoning 完成序号晚于正文时仍应按 canonical ordinal 排在正文前", () => {
    const messages = applyReasoningSync({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-06-22T10:00:00.000Z"),
          contentParts: [
            {
              type: "text",
              text: "最终正文。",
              metadata: { sequence: 48 },
            },
          ],
        },
      ],
      item: buildReasoningItem({ sequence: 85, ordinal: 6 }),
    });

    expect(messages[0]?.contentParts).toEqual([
      expect.objectContaining({
        type: "thinking",
        metadata: expect.objectContaining({ sequence: 6 }),
      }),
      expect.objectContaining({
        type: "text",
        text: "最终正文。",
        metadata: { sequence: 48 },
      }),
    ]);
  });

  it("无可比较 sequence 时应把 reasoning 放在首个正文前", () => {
    const messages = applyReasoningSync({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-06-22T10:00:00.000Z"),
          contentParts: [{ type: "text", text: "最终正文。" }],
        },
      ],
    });

    expect(messages[0]?.contentParts).toEqual([
      expect.objectContaining({
        type: "thinking",
        metadata: expect.objectContaining({
          source: "thread_item_reasoning",
          threadItemId: "reasoning-1",
        }),
      }),
      { type: "text", text: "最终正文。" },
    ]);
  });

  it("应更新已有 reasoning part 文本并保持同一 thread item metadata", () => {
    const messages = applyReasoningSync({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-06-22T10:00:00.000Z"),
          contentParts: [
            {
              type: "thinking",
              text: "旧文本",
              metadata: {
                source: "thread_item_reasoning",
                threadItemId: "reasoning-1",
                turnId: "turn-1",
              },
            },
          ],
        },
      ],
      item: buildReasoningItem({ text: "新文本" }),
    });

    expect(messages[0]?.contentParts).toEqual([
      expect.objectContaining({
        type: "thinking",
        text: "新文本",
        metadata: expect.objectContaining({
          source: "thread_item_reasoning",
          threadItemId: "reasoning-1",
          turnId: "turn-1",
        }),
      }),
    ]);
  });

  it("持久化 reasoning 应接管同轮同文本的临时 thinking part", () => {
    const messages = applyReasoningSync({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-06-22T10:00:00.000Z"),
          runtimeTurnId: "turn-1",
          thinkingContent: "搜索结果还需要继续筛掉广告软文。",
          contentParts: [
            {
              type: "thinking",
              text: "搜索结果还需要继续筛掉广告软文。",
            },
            { type: "text", text: "最终正文。" },
          ],
        },
      ],
    });

    expect(messages[0]?.contentParts).toEqual([
      expect.objectContaining({
        type: "thinking",
        text: "搜索结果还需要继续筛掉广告软文。",
        metadata: expect.objectContaining({
          source: "thread_item_reasoning",
          threadItemId: "reasoning-1",
          sequence: 3,
          turnId: "turn-1",
        }),
      }),
      { type: "text", text: "最终正文。" },
    ]);
    expect(
      messages[0]?.contentParts?.filter((part) => part.type === "thinking"),
    ).toHaveLength(1);
  });
});
