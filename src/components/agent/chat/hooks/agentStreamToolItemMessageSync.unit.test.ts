import { describe, expect, it, vi } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import {
  mergeToolCallStateFromItem,
  stringifyThreadItemToolArguments,
  syncExistingMessageToolCallFromThreadItem,
  toolCallStateFromThreadItem,
} from "./agentStreamToolItemMessageSync";

function buildToolItem(
  patch: Partial<Extract<AgentThreadItem, { type: "tool_call" }>> = {},
): Extract<AgentThreadItem, { type: "tool_call" }> {
  return {
    id: "tool-1",
    thread_id: "session-1",
    turn_id: "turn-1",
    sequence: 2,
    status: "completed",
    started_at: "2026-06-22T10:00:00.000Z",
    completed_at: "2026-06-22T10:00:03.000Z",
    updated_at: "2026-06-22T10:00:03.000Z",
    type: "tool_call",
    tool_name: "web_search",
    arguments: { query: "Codex skills" },
    output: "搜索完成",
    success: true,
    metadata: { source: "item_lifecycle" },
    ...patch,
  };
}

describe("agentStreamToolItemMessageSync", () => {
  it("应稳定序列化 thread item 工具参数", () => {
    expect(stringifyThreadItemToolArguments(undefined)).toBeUndefined();
    expect(stringifyThreadItemToolArguments("raw")).toBe("raw");
    expect(stringifyThreadItemToolArguments({ query: "Codex skills" })).toBe(
      '{"query":"Codex skills"}',
    );
  });

  it("应从 completed thread item 构造 message tool call 状态", () => {
    const state = toolCallStateFromThreadItem(buildToolItem());

    expect(state).toMatchObject({
      id: "tool-1",
      name: "web_search",
      arguments: '{"query":"Codex skills"}',
      status: "completed",
      result: {
        success: true,
        output: "搜索完成",
        metadata: { source: "item_lifecycle" },
      },
      metadata: { source: "item_lifecycle" },
    });
    expect(state.startTime.toISOString()).toBe("2026-06-22T10:00:00.000Z");
    expect(state.endTime?.toISOString()).toBe("2026-06-22T10:00:03.000Z");
  });

  it("合并 thread item 时应保留已有日志，并在完成后清理进度", () => {
    const merged = mergeToolCallStateFromItem(
      {
        id: "tool-1",
        name: "web_search",
        arguments: "{}",
        status: "running",
        progress: {
          message: "正在搜索",
          progress: 1,
          total: 2,
        },
        logs: ["开始搜索"],
        startTime: new Date("2026-06-22T10:00:00.000Z"),
      },
      buildToolItem(),
    );

    expect(merged).toMatchObject({
      id: "tool-1",
      status: "completed",
      arguments: '{"query":"Codex skills"}',
      logs: ["开始搜索"],
      result: {
        success: true,
        output: "搜索完成",
      },
    });
    expect(merged.progress).toBeUndefined();
  });

  it("应只同步已有工具卡，不从 thread item 隐式新建 message 工具卡", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-22T10:00:00.000Z"),
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    syncExistingMessageToolCallFromThreadItem({
      assistantMsgId: "assistant-1",
      item: buildToolItem(),
      setMessages: setMessages as never,
    });

    expect(messages[0]?.toolCalls).toBeUndefined();
    expect(messages[0]?.contentParts).toBeUndefined();
  });

  it("应同步已有 toolCalls 与 contentParts 中的工具卡", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-22T10:00:00.000Z"),
        toolCalls: [
          {
            id: "tool-1",
            name: "web_search",
            arguments: "{}",
            status: "running",
            logs: ["开始搜索"],
            startTime: new Date("2026-06-22T10:00:00.000Z"),
          },
        ],
        contentParts: [
          {
            type: "tool_use",
            metadata: { source: "ui" },
            toolCall: {
              id: "tool-1",
              name: "web_search",
              arguments: "{}",
              status: "running",
              logs: ["开始搜索"],
              startTime: new Date("2026-06-22T10:00:00.000Z"),
            },
          },
        ],
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    syncExistingMessageToolCallFromThreadItem({
      assistantMsgId: "assistant-1",
      item: buildToolItem({ sequence: 5 }),
      setMessages: setMessages as never,
    });

    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      id: "tool-1",
      status: "completed",
      logs: ["开始搜索"],
      result: {
        success: true,
        output: "搜索完成",
      },
    });
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      type: "tool_use",
      metadata: {
        source: "ui",
        sequence: 5,
        turnId: "turn-1",
      },
      toolCall: {
        id: "tool-1",
        status: "completed",
        logs: ["开始搜索"],
      },
    });
  });
});
