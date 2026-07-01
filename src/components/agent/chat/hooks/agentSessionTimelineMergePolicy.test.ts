import { describe, expect, it } from "vitest";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import {
  mergeRuntimeSyncThreadItems,
  resolveAgentSessionTimelineMergeDecision,
} from "./agentSessionTimelineMergePolicy";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? "message-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "默认内容",
    timestamp: overrides.timestamp ?? new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createTurn(overrides: Partial<AgentThreadTurn> = {}): AgentThreadTurn {
  return {
    id: overrides.id ?? "turn-1",
    thread_id: overrides.thread_id ?? "thread-1",
    prompt_text: overrides.prompt_text ?? "继续",
    status: overrides.status ?? "running",
    started_at: overrides.started_at ?? "2026-07-01T00:00:00.000Z",
    created_at: overrides.created_at ?? "2026-07-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-01T00:00:01.000Z",
    ...overrides,
  };
}

function createAgentMessageItem(
  overrides: Partial<AgentThreadItem> = {},
): AgentThreadItem {
  return {
    id: overrides.id ?? "item-1",
    thread_id: overrides.thread_id ?? "thread-1",
    turn_id: overrides.turn_id ?? "turn-1",
    sequence: overrides.sequence ?? 1,
    type: "agent_message",
    text:
      "text" in overrides && typeof overrides.text === "string"
        ? overrides.text
        : "默认 thread item",
    status: overrides.status ?? "in_progress",
    started_at: overrides.started_at ?? "2026-07-01T00:00:00.000Z",
    completed_at: overrides.completed_at,
    updated_at: overrides.updated_at ?? "2026-07-01T00:00:01.000Z",
    ...overrides,
  } as AgentThreadItem;
}

describe("agentSessionTimelineMergePolicy", () => {
  it("history_hydrate 兼容同一会话时应允许保留本地 timeline 状态", () => {
    const decision = resolveAgentSessionTimelineMergeDecision({
      mode: "history_hydrate",
      mayPreserveExistingTimelineBySession: true,
      localMessages: [
        createMessage({
          role: "user",
          content: "帮我整理今天的国际新闻",
        }),
      ],
      hydratedMessagesForCompatibility: [
        createMessage({
          role: "user",
          content: "整理今天的国际新闻",
        }),
      ],
      threadRead: {
        thread_id: "thread-1",
        status: "idle",
      },
      incomingTurns: [],
    });

    expect(decision).toMatchObject({
      mode: "history_hydrate",
      isLocalTimelineCompatible: true,
      shouldPreserveByRuntimeSync: false,
      shouldPreserveBySession: true,
      shouldIgnoreIncompatibleHydratedMessages: false,
    });
  });

  it("history_hydrate 不兼容历史时不应保留本地 timeline", () => {
    const decision = resolveAgentSessionTimelineMergeDecision({
      mode: "history_hydrate",
      mayPreserveExistingTimelineBySession: true,
      localMessages: [
        createMessage({
          role: "user",
          content: "当前会话问题",
        }),
      ],
      hydratedMessagesForCompatibility: [
        createMessage({
          role: "user",
          content: "另一个历史会话问题",
        }),
      ],
      threadRead: {
        thread_id: "thread-1",
        status: "idle",
      },
      incomingTurns: [],
    });

    expect(decision).toMatchObject({
      mode: "history_hydrate",
      isLocalTimelineCompatible: false,
      shouldPreserveByRuntimeSync: false,
      shouldPreserveBySession: false,
      shouldIgnoreIncompatibleHydratedMessages: false,
    });
  });

  it("runtime_sync 非终态且历史不兼容时应保留本地 timeline", () => {
    const decision = resolveAgentSessionTimelineMergeDecision({
      mode: "runtime_sync",
      mayPreserveExistingTimelineBySession: true,
      localMessages: [
        createMessage({
          role: "user",
          content: "当前正在运行的问题",
        }),
      ],
      hydratedMessagesForCompatibility: [
        createMessage({
          role: "user",
          content: "另一条历史问题",
        }),
      ],
      threadRead: {
        thread_id: "thread-1",
        status: "running",
      },
      incomingTurns: [createTurn({ status: "running" })],
    });

    expect(decision).toMatchObject({
      mode: "runtime_sync",
      hasIncomingTerminalTimeline: false,
      isLocalTimelineCompatible: false,
      shouldPreserveByRuntimeSync: true,
      shouldPreserveBySession: true,
      shouldIgnoreIncompatibleHydratedMessages: true,
    });
  });

  it("runtime_sync 终态 detail 应允许服务端 transcript 接管 pending 壳", () => {
    const decision = resolveAgentSessionTimelineMergeDecision({
      mode: "runtime_sync",
      mayPreserveExistingTimelineBySession: true,
      localMessages: [
        createMessage({
          role: "user",
          content: "pending 壳临时问题",
        }),
      ],
      hydratedMessagesForCompatibility: [
        createMessage({
          role: "user",
          content: "最终用户问题",
        }),
      ],
      threadRead: {
        thread_id: "thread-1",
        status: "completed",
      },
      incomingTurns: [createTurn({ status: "completed" })],
    });

    expect(decision).toMatchObject({
      mode: "runtime_sync",
      hasIncomingTerminalTimeline: true,
      isLocalTimelineCompatible: false,
      shouldPreserveByRuntimeSync: false,
      shouldPreserveBySession: false,
      shouldIgnoreIncompatibleHydratedMessages: false,
    });
  });

  it("runtime_sync item 合并不应把本地较长 agent_message 截成旧前缀", () => {
    const result = mergeRuntimeSyncThreadItems(
      [
        createAgentMessageItem({
          text: "已经显示的完整流式回答，包含更多后续内容。",
          status: "in_progress",
        }),
      ],
      [
        createAgentMessageItem({
          text: "已经显示的完整流式回答",
          status: "completed",
          updated_at: "2026-07-01T00:00:05.000Z",
        }),
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "item-1",
      status: "completed",
      text: "已经显示的完整流式回答，包含更多后续内容。",
      updated_at: "2026-07-01T00:00:05.000Z",
    });
  });
});
