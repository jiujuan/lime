import { describe, expect, it } from "vitest";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import type { AgentThreadItem, Message } from "../types";
import { buildHydratedAgentSessionSnapshot } from "./agentSessionState";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? "message-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "默认内容",
    timestamp: overrides.timestamp ?? new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  };
}

function createAgentMessageItem(
  overrides: Partial<AgentThreadItem> = {},
): AgentThreadItem {
  return {
    id: overrides.id ?? "item-1",
    thread_id: overrides.thread_id ?? "topic-runtime-sync",
    turn_id: overrides.turn_id ?? "turn-runtime-sync",
    sequence: overrides.sequence ?? 1,
    type: "agent_message",
    text:
      "text" in overrides && typeof overrides.text === "string"
        ? overrides.text
        : "默认 thread item",
    status: overrides.status ?? "completed",
    started_at: overrides.started_at ?? "2026-06-30T00:00:00.000Z",
    completed_at: overrides.completed_at ?? "2026-06-30T00:00:02.000Z",
    updated_at: overrides.updated_at ?? "2026-06-30T00:00:02.000Z",
    ...overrides,
  } as AgentThreadItem;
}

describe("agentSessionState runtimeSync detail refresh", () => {
  it("App Server detail 协议形状应能水合出用户与助手消息", () => {
    const detail = {
      id: "topic-app-server-detail",
      thread_id: "thread-app-server-detail",
      created_at: 1783480361000,
      updated_at: 1783480369000,
      messages_count: 2,
      messages: [
        {
          id: "turn-app-server:user",
          role: "user",
          content: [
            {
              type: "text",
              text: "请只回复：收到-CDP正常对话",
            },
          ],
        },
        {
          id: "turn-app-server:assistant",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "收到-CDP正常对话",
            },
          ],
        },
      ],
      items: [
        {
          id: "assistant:chatcmpl-app-server",
          type: "agent_message",
          status: "completed",
          turn_id: "turn-app-server",
          text: "收到-CDP正常对话",
        },
      ],
      turns: [
        {
          completedAt: "2026-07-08T03:12:49.191Z",
          sessionId: "topic-app-server-detail",
          startedAt: "2026-07-08T03:12:41.154Z",
          status: "completed",
          threadId: "thread-app-server-detail",
          turnId: "turn-app-server",
        },
      ],
      queued_turns: [],
      thread_read: {
        thread_id: "thread-app-server-detail",
        status: "completed",
        active_turn_id: null,
      },
    } satisfies AsterSessionDetail;

    const result = buildHydratedAgentSessionSnapshot({
      topicId: "topic-app-server-detail",
      detail,
      currentSessionId: "topic-app-server-detail",
      currentMessages: [],
      currentThreadTurns: [],
      currentThreadItems: [],
      currentExecutionRuntime: null,
      currentExecutionStrategy: "react",
      topics: [
        {
          id: "topic-app-server-detail",
          title: "请只回复：收到-CDP正常对话",
          createdAt: new Date("2026-07-08T03:12:41.154Z"),
          updatedAt: new Date("2026-07-08T03:12:49.191Z"),
          workspaceId: null,
          messagesCount: 2,
          executionStrategy: "react",
          status: "done",
          lastPreview: "收到-CDP正常对话",
          isPinned: false,
          hasUnread: false,
          tag: null,
          sourceSessionId: "topic-app-server-detail",
        },
      ],
    });

    expect(result.snapshot.messages.map((message) => message.content)).toEqual([
      "请只回复：收到-CDP正常对话",
      "收到-CDP正常对话",
    ]);
  });

  it("runtimeSync detail rebase 不应让不兼容历史消息覆盖当前时间线", () => {
    const liveText =
      "这是当前 turn 已经流出来的较长回答，session detail refresh 只能合入元数据，不能把它替换成另一条历史回答。";
    const currentMessages = [
      createMessage({
        id: "local-user-current",
        role: "user",
        content: "当前正在流式输出的问题",
        timestamp: new Date("2026-06-30T10:00:00.000Z"),
      }),
      createMessage({
        id: "local-assistant-current",
        role: "assistant",
        content: liveText,
        timestamp: new Date("2026-06-30T10:00:01.000Z"),
      }),
    ];
    const currentThreadItems = [
      createAgentMessageItem({
        id: "item-live",
        text: liveText,
        status: "in_progress",
      }),
    ];
    const detail = {
      id: "topic-runtime-sync",
      created_at: 1782800000,
      updated_at: 1782800001,
      messages: [
        {
          role: "user",
          timestamp: 1782799000,
          content: [{ type: "text", text: "另一条不兼容的历史问题" }],
        },
        {
          role: "assistant",
          timestamp: 1782799001,
          content: [{ type: "text", text: "另一条历史回答" }],
        },
      ],
      items: [
        createAgentMessageItem({
          id: "item-live",
          text: "这是当前 turn 已经流出来的较长回答",
          status: "completed",
          updated_at: "2026-06-30T10:00:03.000Z",
        }),
      ],
      queued_turns: [
        {
          queued_turn_id: "queued-runtime-sync",
          message_preview: "继续",
          message_text: "继续当前输出",
          created_at: 1782800002000,
          image_count: 0,
          position: 1,
        },
      ],
      thread_read: {
        thread_id: "topic-runtime-sync",
        status: "waiting_request",
        active_turn_id: "turn-runtime-sync",
      },
    } satisfies AsterSessionDetail;

    const result = buildHydratedAgentSessionSnapshot({
      topicId: "topic-runtime-sync",
      detail,
      currentSessionId: "topic-runtime-sync",
      currentMessages,
      currentThreadTurns: [],
      currentThreadItems,
      currentExecutionRuntime: null,
      currentExecutionStrategy: "react",
      topics: [],
      detailMergeMode: "runtime_sync",
    });

    expect(result.snapshot.messages.map((message) => message.content)).toEqual(
      currentMessages.map((message) => message.content),
    );
    expect(result.snapshot.threadItems).toHaveLength(1);
    expect(result.snapshot.threadItems[0]).toMatchObject({
      id: "item-live",
      status: "completed",
      text: liveText,
    });
    expect(result.snapshot.threadRead?.status).toBe("waiting_request");
    expect(result.snapshot.queuedTurns).toEqual([
      {
        queued_turn_id: "queued-runtime-sync",
        message_preview: "继续",
        message_text: "继续当前输出",
        created_at: 1782800002000,
        image_count: 0,
        position: 1,
      },
    ]);
  });

  it("runtimeSync terminal detail 应允许最终 transcript 接管 pending 壳", () => {
    const detail = {
      id: "topic-runtime-sync-terminal",
      created_at: 1782800000,
      updated_at: 1782800001,
      messages: [
        {
          role: "user",
          timestamp: 1782800000,
          content: [{ type: "text", text: "最终用户问题" }],
        },
        {
          role: "assistant",
          timestamp: 1782800001,
          content: [{ type: "text", text: "最终 assistant 总结" }],
        },
      ],
      turns: [
        {
          id: "turn-runtime-sync-terminal",
          thread_id: "topic-runtime-sync-terminal-thread",
          prompt_text: "最终用户问题",
          status: "completed",
          started_at: "2026-06-30T10:00:00.000Z",
          completed_at: "2026-06-30T10:00:02.000Z",
          created_at: "2026-06-30T10:00:00.000Z",
          updated_at: "2026-06-30T10:00:02.000Z",
        },
      ],
      thread_read: {
        thread_id: "topic-runtime-sync-terminal-thread",
        status: "completed",
        active_turn_id: "turn-runtime-sync-terminal",
      },
    } satisfies AsterSessionDetail;

    const result = buildHydratedAgentSessionSnapshot({
      topicId: "topic-runtime-sync-terminal",
      detail,
      currentSessionId: "topic-runtime-sync-terminal",
      currentMessages: [
        createMessage({
          id: "local-pending-user",
          role: "user",
          content: "pending 壳里的临时问题",
        }),
        createMessage({
          id: "local-pending-assistant",
          role: "assistant",
          content: "正在生成回复",
        }),
      ],
      currentThreadTurns: [],
      currentThreadItems: [],
      currentExecutionRuntime: null,
      currentExecutionStrategy: "react",
      topics: [],
      detailMergeMode: "runtime_sync",
    });

    expect(result.snapshot.messages.map((message) => message.content)).toEqual([
      "最终用户问题",
      "最终 assistant 总结",
    ]);
    expect(result.snapshot.currentTurnId).toBe("turn-runtime-sync-terminal");
    expect(result.snapshot.threadRead?.status).toBe("completed");
  });

  it("runtimeSync terminal detail 只有 thread items 时也应替换本地 thinking pending 壳", () => {
    const turnId = "turn-runtime-sync-items-terminal";
    const promptText = "CDP 修复复测 marker";
    const finalText = "收到-CDP 修复复测 marker";
    const detail = {
      id: "topic-runtime-sync-items-terminal",
      created_at: 1782800000,
      updated_at: 1782800001,
      messages: [],
      turns: [
        {
          id: turnId,
          thread_id: "topic-runtime-sync-items-terminal-thread",
          prompt_text: promptText,
          status: "completed",
          started_at: "2026-06-30T10:00:00.000Z",
          completed_at: "2026-06-30T10:00:02.000Z",
          created_at: "2026-06-30T10:00:00.000Z",
          updated_at: "2026-06-30T10:00:02.000Z",
        },
      ],
      items: [
        createAgentMessageItem({
          id: "item-runtime-sync-items-terminal-final",
          thread_id: "topic-runtime-sync-items-terminal-thread",
          turn_id: turnId,
          text: finalText,
          status: "completed",
          sequence: 1,
          started_at: "2026-06-30T10:00:01.000Z",
          completed_at: "2026-06-30T10:00:02.000Z",
          updated_at: "2026-06-30T10:00:02.000Z",
        }),
      ],
      thread_read: {
        thread_id: "topic-runtime-sync-items-terminal-thread",
        status: "completed",
        active_turn_id: turnId,
      },
    } satisfies AsterSessionDetail;

    const result = buildHydratedAgentSessionSnapshot({
      topicId: "topic-runtime-sync-items-terminal",
      detail,
      currentSessionId: "topic-runtime-sync-items-terminal",
      currentMessages: [
        createMessage({
          id: "local-pending-user",
          role: "user",
          content: promptText,
          runtimeTurnId: turnId,
        }),
        createMessage({
          id: "local-pending-assistant",
          role: "assistant",
          content: "正在生成回复",
          isThinking: true,
          runtimeTurnId: turnId,
          runtimeStatus: {
            phase: "generating",
            title: "正在输出",
            detail: "正在等待模型继续输出。",
          },
        }),
      ],
      currentThreadTurns: [
        {
          id: turnId,
          thread_id: "topic-runtime-sync-items-terminal-thread",
          prompt_text: promptText,
          status: "running",
          started_at: "2026-06-30T10:00:00.000Z",
          created_at: "2026-06-30T10:00:00.000Z",
          updated_at: "2026-06-30T10:00:01.000Z",
        },
      ],
      currentThreadItems: [],
      currentExecutionRuntime: null,
      currentExecutionStrategy: "react",
      topics: [],
      detailMergeMode: "runtime_sync",
    });

    expect(result.snapshot.messages.map((message) => message.content)).toEqual([
      promptText,
      finalText,
    ]);
    expect(result.snapshot.messages[1]).toMatchObject({
      role: "assistant",
      isThinking: false,
      runtimeTurnId: turnId,
    });
    expect(result.snapshot.messages[1]?.runtimeStatus).toBeUndefined();
    expect(result.snapshot.currentTurnId).toBe(turnId);
    expect(result.snapshot.threadRead?.status).toBe("completed");
  });
});
