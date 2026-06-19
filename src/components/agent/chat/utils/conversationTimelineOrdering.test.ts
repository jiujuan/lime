import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import { projectConversationMessagesByRuntimeTurn } from "./conversationTimelineOrdering";

function createMessage(
  id: string,
  role: Message["role"],
  second: number,
  runtimeTurnId?: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    role,
    content: `${role}-${id}`,
    timestamp: new Date(`2026-06-18T08:00:${String(second).padStart(2, "0")}Z`),
    runtimeTurnId,
    ...overrides,
  };
}

describe("projectConversationMessagesByRuntimeTurn", () => {
  it("应把按来源错序的回合投影为 user -> assistant 顺序", () => {
    const projected = projectConversationMessagesByRuntimeTurn([
      createMessage("user-1", "user", 0, "turn-1"),
      createMessage("user-2", "user", 2, "turn-2"),
      createMessage("assistant-1", "assistant", 1, "turn-1"),
      createMessage("assistant-2", "assistant", 3, "turn-2"),
    ]);

    expect(projected.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
  });

  it("应以来源锚点排序回合，避免后续回合因时间戳更早压到首句前面", () => {
    const projected = projectConversationMessagesByRuntimeTurn([
      createMessage("user-first", "user", 10, "turn-first"),
      createMessage("user-second", "user", 0, "turn-second"),
      createMessage("assistant-first", "assistant", 11, "turn-first"),
      createMessage("assistant-second", "assistant", 1, "turn-second"),
    ]);

    expect(projected.map((message) => message.id)).toEqual([
      "user-first",
      "assistant-first",
      "user-second",
      "assistant-second",
    ]);
  });

  it("应去掉同一 runtime turn 内排序后相邻的重复消息", () => {
    const firstAssistant = createMessage(
      "assistant-duplicate-a",
      "assistant",
      1,
      "turn-duplicate",
      {
        content: "重复回答",
        contentParts: [{ type: "text", text: "重复回答" }],
      },
    );
    const duplicatedAssistant = createMessage(
      "assistant-duplicate-b",
      "assistant",
      2,
      "turn-duplicate",
      {
        content: "重复回答",
        contentParts: [{ type: "text", text: "重复回答" }],
      },
    );

    const projected = projectConversationMessagesByRuntimeTurn([
      createMessage("user-duplicate", "user", 0, "turn-duplicate"),
      createMessage("user-next", "user", 3, "turn-next"),
      duplicatedAssistant,
      firstAssistant,
      createMessage("assistant-next", "assistant", 4, "turn-next"),
    ]);

    expect(projected.map((message) => message.id)).toEqual([
      "user-duplicate",
      "assistant-duplicate-a",
      "user-next",
      "assistant-next",
    ]);
  });

  it("应保留多模态附件、多模型 usage 与工具过程负载", () => {
    const imageMessage = createMessage("user-image", "user", 0, "turn-image", {
      content: "分析图片",
      images: [
        {
          data: "data:image/png;base64,AAAA",
          mediaType: "image/png",
          sourcePath: "/tmp/input.png",
        },
      ],
    });
    const assistantMessage = createMessage(
      "assistant-image",
      "assistant",
      1,
      "turn-image",
      {
        usage: {
          input_tokens: 12,
          output_tokens: 34,
        },
        toolCalls: [
          {
            id: "tool-read-image",
            name: "read_file",
            arguments: '{"path":"/tmp/input.png"}',
            status: "completed",
            result: {
              success: true,
              output: "image bytes",
            },
          },
        ],
        contentParts: [
          {
            type: "thinking",
            text: "先识别图片。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-read-image",
              name: "read_file",
              arguments: '{"path":"/tmp/input.png"}',
              status: "completed",
              result: {
                success: true,
                output: "image bytes",
              },
            },
          },
        ],
      },
    );

    const projected = projectConversationMessagesByRuntimeTurn([
      assistantMessage,
      imageMessage,
    ]);

    expect(projected.map((message) => message.id)).toEqual([
      "user-image",
      "assistant-image",
    ]);
    expect(projected[0]).toBe(imageMessage);
    expect(projected[1]).toBe(assistantMessage);
    expect(projected[0]?.images?.[0]?.sourcePath).toBe("/tmp/input.png");
    expect(projected[1]?.usage).toEqual({
      input_tokens: 12,
      output_tokens: 34,
    });
    expect(projected[1]?.toolCalls?.[0]?.name).toBe("read_file");
    expect(projected[1]?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
    ]);
  });

  it("没有 runtimeTurnId 的消息应保持原始顺序", () => {
    const messages = [
      createMessage("assistant-standalone", "assistant", 0),
      createMessage("user-standalone", "user", 1),
    ];

    expect(projectConversationMessagesByRuntimeTurn(messages)).toEqual(
      messages,
    );
  });
});
