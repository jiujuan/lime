import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import { buildMessageTurnGroups } from "./messageTurnGrouping";

function createMessage(
  id: string,
  role: Message["role"],
  second: number,
  runtimeTurnId?: string,
): Message {
  return {
    id,
    role,
    content: `${role}-${id}`,
    timestamp: new Date(`2026-03-15T09:00:${String(second).padStart(2, "0")}Z`),
    runtimeTurnId,
  };
}

describe("buildMessageTurnGroups", () => {
  it("应按用户消息切分回合，并收拢后续助手回复", () => {
    const groups = buildMessageTurnGroups([
      createMessage("user-1", "user", 0),
      createMessage("assistant-1", "assistant", 1),
      createMessage("assistant-2", "assistant", 2),
      createMessage("user-2", "user", 3),
      createMessage("assistant-3", "assistant", 4),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.userMessage?.id).toBe("user-1");
    expect(groups[0]?.assistantMessages.map((message) => message.id)).toEqual([
      "assistant-1",
      "assistant-2",
    ]);
    expect(groups[1]?.userMessage?.id).toBe("user-2");
    expect(groups[1]?.assistantMessages.map((message) => message.id)).toEqual([
      "assistant-3",
    ]);
  });

  it("应兼容没有前置用户消息的助手回复", () => {
    const groups = buildMessageTurnGroups([
      createMessage("assistant-1", "assistant", 0),
      createMessage("assistant-2", "assistant", 1),
      createMessage("user-1", "user", 2),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.userMessage).toBeNull();
    expect(groups[0]?.assistantMessages.map((message) => message.id)).toEqual([
      "assistant-1",
      "assistant-2",
    ]);
    expect(groups[1]?.userMessage?.id).toBe("user-1");
    expect(groups[1]?.assistantMessages).toEqual([]);
  });

  it("应按 runtimeTurnId 将乱序到达的助手回复回挂到对应用户消息", () => {
    const groups = buildMessageTurnGroups([
      createMessage("user-1", "user", 0, "turn-1"),
      createMessage("user-2", "user", 1, "turn-2"),
      createMessage("assistant-1", "assistant", 2, "turn-1"),
      createMessage("assistant-2", "assistant", 3, "turn-2"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.userMessage?.id).toBe("user-1");
    expect(groups[0]?.assistantMessages.map((message) => message.id)).toEqual([
      "assistant-1",
    ]);
    expect(groups[0]?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(groups[1]?.userMessage?.id).toBe("user-2");
    expect(groups[1]?.assistantMessages.map((message) => message.id)).toEqual([
      "assistant-2",
    ]);
  });

  it("应保留实时乐观消息中只有助手携带 runtimeTurnId 的顺序兜底", () => {
    const groups = buildMessageTurnGroups([
      createMessage("user-1", "user", 0),
      createMessage("assistant-1", "assistant", 1, "pending-turn-1"),
      createMessage("user-2", "user", 2),
      createMessage("assistant-2", "assistant", 3, "pending-turn-2"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(groups[1]?.messages.map((message) => message.id)).toEqual([
      "user-2",
      "assistant-2",
    ]);
  });

  it("应在助手先到达时用后续 user runtimeTurnId 回填同一组", () => {
    const groups = buildMessageTurnGroups([
      createMessage("assistant-1", "assistant", 1, "turn-1"),
      createMessage("user-1", "user", 0, "turn-1"),
      createMessage("user-2", "user", 2, "turn-2"),
      createMessage("assistant-2", "assistant", 3, "turn-2"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.userMessage?.id).toBe("user-1");
    expect(groups[0]?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(groups[0]?.startedAt.toISOString()).toBe(
      "2026-03-15T09:00:00.000Z",
    );
    expect(groups[0]?.endedAt.toISOString()).toBe(
      "2026-03-15T09:00:01.000Z",
    );
    expect(groups[1]?.messages.map((message) => message.id)).toEqual([
      "user-2",
      "assistant-2",
    ]);
  });
});
