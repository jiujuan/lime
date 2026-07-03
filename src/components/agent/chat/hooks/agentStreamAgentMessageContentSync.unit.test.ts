import { describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import {
  mergeAssistantAgentMessageContentPartsFromThreadItems,
  syncAssistantAgentMessageContentPartFromThreadItem,
} from "./agentStreamAgentMessageContentSync";

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

  it("同步 content part 无实际变化时应保留 messages 数组引用", () => {
    const item: AgentThreadItem = {
      id: "agent-message-final",
      thread_id: "thread-1",
      turn_id: "turn-current",
      type: "agent_message",
      status: "completed",
      sequence: 20,
      text: "最终摘要",
      phase: "final_answer",
      started_at: "2026-06-26T10:01:00.000Z",
      updated_at: "2026-06-26T10:01:01.000Z",
      completed_at: "2026-06-26T10:01:01.000Z",
    };
    const messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-26T10:01:01.000Z"),
        contentParts: [
          {
            type: "text",
            text: "最终摘要",
            metadata: {
              itemId: "agent-message-final",
              phase: "final_answer",
              sequence: 20,
              source: "agent_text_delta",
              turnId: "turn-current",
            },
          },
        ],
      },
    ];
    let nextMessages: Message[] | undefined;
    const setMessages: Dispatch<SetStateAction<Message[]>> = vi.fn(
      (value: SetStateAction<Message[]>) => {
        nextMessages =
          typeof value === "function" ? value(messages) : value;
      },
    );

    syncAssistantAgentMessageContentPartFromThreadItem({
      assistantMsgId: "assistant-1",
      item,
      setMessages,
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(nextMessages).toBe(messages);
  });

  it("同步图片任务 agent_message content part 时保留后端原文", () => {
    const item: AgentThreadItem = {
      id: "agent-message-image",
      thread_id: "thread-1",
      turn_id: "turn-image",
      type: "agent_message",
      status: "completed",
      sequence: 20,
      text: "好啊，先来Generate深圳夏day午后的城市照片，阳光明亮，真实摄影Style。",
      phase: "final_answer",
      started_at: "2026-06-26T10:01:00.000Z",
      updated_at: "2026-06-26T10:01:01.000Z",
      completed_at: "2026-06-26T10:01:01.000Z",
    };
    const messages: Message[] = [
      {
        id: "assistant-image",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-26T10:01:01.000Z"),
        contentParts: [],
      },
    ];
    let nextMessages: Message[] | undefined;
    const setMessages: Dispatch<SetStateAction<Message[]>> = vi.fn(
      (value: SetStateAction<Message[]>) => {
        nextMessages =
          typeof value === "function" ? value(messages) : value;
      },
    );

    syncAssistantAgentMessageContentPartFromThreadItem({
      assistantMsgId: "assistant-image",
      item,
      setMessages,
    });

    const textPart = nextMessages?.[0]?.contentParts?.find(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "text" }
      > => part.type === "text",
    );
    expect(textPart?.text).toBe(
      "好啊，先来Generate深圳夏day午后的城市照片，阳光明亮，真实摄影Style。",
    );
  });
});
