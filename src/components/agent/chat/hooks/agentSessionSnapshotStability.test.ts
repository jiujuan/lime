import { describe, expect, it } from "vitest";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import {
  createEmptyAgentSessionSnapshot,
  type AgentSessionSnapshot,
} from "./agentSessionState";
import { reuseStableAgentSessionSnapshotReferences } from "./agentSessionSnapshotStability";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? "message-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "已完成",
    timestamp: overrides.timestamp ?? new Date("2026-07-09T12:00:00.000Z"),
    runtimeTurnId: overrides.runtimeTurnId ?? "turn-1",
    ...overrides,
  };
}

function createTurn(overrides: Partial<AgentThreadTurn> = {}): AgentThreadTurn {
  return {
    id: overrides.id ?? "turn-1",
    thread_id: overrides.thread_id ?? "thread-1",
    prompt_text: overrides.prompt_text ?? "你好",
    status: overrides.status ?? "completed",
    started_at: overrides.started_at ?? "2026-07-09T12:00:00.000Z",
    completed_at: overrides.completed_at ?? "2026-07-09T12:00:01.000Z",
    created_at: overrides.created_at ?? "2026-07-09T12:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-09T12:00:01.000Z",
    ...overrides,
  };
}

function createItem(overrides: Partial<AgentThreadItem> = {}): AgentThreadItem {
  return {
    id: overrides.id ?? "item-1",
    thread_id: overrides.thread_id ?? "thread-1",
    turn_id: overrides.turn_id ?? "turn-1",
    sequence: overrides.sequence ?? 1,
    type: "agent_message",
    text:
      "text" in overrides && typeof overrides.text === "string"
        ? overrides.text
        : "已完成",
    status: overrides.status ?? "completed",
    started_at: overrides.started_at ?? "2026-07-09T12:00:00.000Z",
    completed_at: overrides.completed_at ?? "2026-07-09T12:00:01.000Z",
    updated_at: overrides.updated_at ?? "2026-07-09T12:00:01.000Z",
    ...overrides,
  } as AgentThreadItem;
}

function createSnapshot(
  overrides: Partial<AgentSessionSnapshot> = {},
): AgentSessionSnapshot {
  return {
    ...createEmptyAgentSessionSnapshot(),
    sessionId: "session-1",
    messages: [createMessage()],
    threadTurns: [createTurn()],
    threadItems: [createItem()],
    currentTurnId: "turn-1",
    ...overrides,
  };
}

describe("reuseStableAgentSessionSnapshotReferences", () => {
  it("同内容终态 hydrate 应复用当前 timeline 引用，避免完成后无意义重绘", () => {
    const currentMessages = [createMessage()];
    const currentThreadTurns = [createTurn()];
    const currentThreadItems = [createItem()];
    const snapshot = createSnapshot({
      messages: [createMessage()],
      threadTurns: [createTurn()],
      threadItems: [createItem()],
      threadRead: {
        thread_id: "thread-1",
        status: "completed",
      },
    });

    const result = reuseStableAgentSessionSnapshotReferences(snapshot, {
      messages: currentMessages,
      threadTurns: currentThreadTurns,
      threadItems: currentThreadItems,
    });

    expect(result).not.toBe(snapshot);
    expect(result.messages).toBe(currentMessages);
    expect(result.threadTurns).toBe(currentThreadTurns);
    expect(result.threadItems).toBe(currentThreadItems);
    expect(result.threadRead).toBe(snapshot.threadRead);
  });

  it("真实内容变化时不复用旧 messages 引用", () => {
    const currentMessages = [createMessage({ content: "旧回复" })];
    const snapshot = createSnapshot({
      messages: [createMessage({ content: "新回复" })],
    });

    const result = reuseStableAgentSessionSnapshotReferences(snapshot, {
      messages: currentMessages,
      threadTurns: snapshot.threadTurns,
      threadItems: snapshot.threadItems,
    });

    expect(result.messages).toBe(snapshot.messages);
  });

  it("真实 turn/item 状态变化时不复用对应引用", () => {
    const currentThreadTurns = [createTurn({ status: "running" })];
    const currentThreadItems = [createItem({ status: "in_progress" })];
    const snapshot = createSnapshot({
      threadTurns: [createTurn({ status: "completed" })],
      threadItems: [createItem({ status: "completed" })],
    });

    const result = reuseStableAgentSessionSnapshotReferences(snapshot, {
      messages: snapshot.messages,
      threadTurns: currentThreadTurns,
      threadItems: currentThreadItems,
    });

    expect(result.threadTurns).toBe(snapshot.threadTurns);
    expect(result.threadItems).toBe(snapshot.threadItems);
  });
});
