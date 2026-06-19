import { describe, expect, it } from "vitest";

import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import {
  appendTextToParts,
  extractThinkingContentFromParts,
  hydrateSessionDetailMessages,
  mergeHydratedMessagesWithLocalState,
  normalizeHistoryMessages,
  shouldCompactCompletedSessionHistory,
} from "./agentChatHistory";

describe("agentChatHistory", () => {
  it("追加累计 text_delta 时不应重复吐字", () => {
    expect(
      appendTextToParts([{ type: "text", text: "你好" }], "你好！我是 Lime"),
    ).toEqual([{ type: "text", text: "你好！我是 Lime" }]);
  });

  it("历史 output_text 以累计快照存储时应恢复为单份正文", () => {
    const detail: AsterSessionDetail = {
      id: "session-cumulative-text",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000201,
          content: [
            { type: "output_text", text: "你好" } as never,
            { type: "output_text", text: "你好！我是 Lime 助手。" } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-cumulative-text",
    );

    expect(messages[0]?.content).toBe("你好！我是 Lime 助手。");
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "你好！我是 Lime 助手。",
      },
    ]);
  });

  it("hydrate 合并短正文片段时不应把 renderer 最终 text part 截断", () => {
    const fullAnswer =
      "根据我的搜索结果，T30 Pro 更偏向高阶学习规划，T90 更偏向基础学科覆盖和价格平衡。";
    const localMessages = [
      {
        id: "local-user-learning-device",
        role: "user" as const,
        content: "科大讯飞学习机怎么选",
        timestamp: new Date("2026-06-18T08:30:00.000Z"),
      },
      {
        id: "local-assistant-learning-device",
        role: "assistant" as const,
        content: fullAnswer,
        timestamp: new Date("2026-06-18T08:30:20.000Z"),
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-websearch-learning-device",
              name: "WebSearch",
              arguments: '{"query":"科大讯飞 T30 Pro T90 区别"}',
              status: "completed" as const,
              startTime: new Date("2026-06-18T08:30:02.000Z"),
              endTime: new Date("2026-06-18T08:30:06.000Z"),
              result: {
                success: true,
                output: "搜索完成",
              },
            },
          },
          {
            type: "text" as const,
            text: fullAnswer,
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "session-learning-device-0",
        role: "user" as const,
        content: "科大讯飞学习机怎么选",
        timestamp: new Date("2026-06-18T08:30:00.000Z"),
      },
      {
        id: "session-learning-device-1",
        role: "assistant" as const,
        content: "根据我",
        timestamp: new Date("2026-06-18T08:30:20.000Z"),
        contentParts: [
          {
            type: "text" as const,
            text: "根据我",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );
    const assistantTextParts = mergedMessages[1]?.contentParts?.filter(
      (part) => part.type === "text",
    );

    expect(mergedMessages[1]?.content).toBe(fullAnswer);
    expect(assistantTextParts?.at(-1)).toMatchObject({ text: fullAnswer });
    expect(assistantTextParts?.map((part) => part.text)).not.toContain(
      "根据我",
    );
  });

  it("已完成 assistant 历史消息不应保留 running 工具状态", () => {
    const timestamp = new Date("2026-06-07T10:34:45.000Z");
    const messages = normalizeHistoryMessages([
      {
        id: "history-assistant-news-complete",
        role: "assistant",
        content: "根据多源检索结果，以下是 2026年6月7日 的主要国际新闻整理。",
        timestamp,
        isThinking: false,
        contentParts: [
          {
            type: "text",
            text: "我来搜索今天（2026年6月7日）的国际新闻。",
          },
          {
            type: "tool_use",
            toolCall: {
              id: "tool-web-search-stale-running",
              name: "WebSearch",
              arguments: '{"query":"2026年6月7日 国际新闻"}',
              status: "running",
              startTime: timestamp,
            },
          },
          {
            type: "text",
            text: "根据多源检索结果，以下是 2026年6月7日 的主要国际新闻整理。",
          },
        ],
        toolCalls: [
          {
            id: "tool-web-search-stale-running",
            name: "WebSearch",
            arguments: '{"query":"2026年6月7日 国际新闻"}',
            status: "running",
            startTime: timestamp,
          },
        ],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      id: "tool-web-search-stale-running",
      status: "completed",
      result: {
        success: true,
        output: "",
      },
    });
    const toolPart = messages[0]?.contentParts?.find(
      (part) => part.type === "tool_use",
    );
    expect(toolPart?.type).toBe("tool_use");
    if (toolPart?.type === "tool_use") {
      expect(toolPart.toolCall.status).toBe("completed");
    }
  });

  it("App Server read detail.messages 当前形状应直接恢复用户与助手消息", () => {
    const detail: AsterSessionDetail = {
      id: "session-app-server-messages",
      created_at: 1,
      updated_at: 2,
      messages_count: 2,
      history_limit: 2,
      history_offset: 0,
      history_cursor: {
        oldest_message_id: null,
        start_index: 0,
        loaded_count: 2,
      },
      history_truncated: false,
      messages: [
        {
          role: "user",
          timestamp: 1780704000,
          runtimeTurnId: "turn-app-server-message-user",
          content: [
            {
              type: "text",
              text: "请整理 App Server 对话历史",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1780704002,
          runtime_turn_id: "turn-app-server-message-assistant",
          content: [
            {
              type: "text",
              text: "已从 App Server detail.messages 读取。",
            },
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-app-server-messages",
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "session-app-server-messages-0",
      "session-app-server-messages-1",
    ]);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "请整理 App Server 对话历史",
      contentParts: [
        {
          type: "text",
          text: "请整理 App Server 对话历史",
        },
      ],
      runtimeTurnId: "turn-app-server-message-user",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "已从 App Server detail.messages 读取。",
      contentParts: [
        {
          type: "text",
          text: "已从 App Server detail.messages 读取。",
        },
      ],
      runtimeTurnId: "turn-app-server-message-assistant",
    });
  });

  it("App Server read detail.messages 错序时应按 runtime turn 恢复 user -> assistant", () => {
    const detail: AsterSessionDetail = {
      id: "session-app-server-messages-out-of-order",
      created_at: 1,
      updated_at: 2,
      messages_count: 4,
      history_limit: 4,
      history_offset: 0,
      history_cursor: {
        oldest_message_id: null,
        start_index: 0,
        loaded_count: 4,
      },
      history_truncated: false,
      messages: [
        {
          role: "user",
          timestamp: 1780704000,
          runtimeTurnId: "turn-native-1",
          content: [{ type: "text", text: "第一轮问题" }],
        },
        {
          role: "user",
          timestamp: 1780704002,
          runtimeTurnId: "turn-native-2",
          content: [{ type: "text", text: "第二轮问题" }],
        },
        {
          role: "assistant",
          timestamp: 1780704001,
          runtime_turn_id: "turn-native-1",
          usage: {
            input_tokens: 8,
            output_tokens: 13,
          },
          content: [
            {
              type: "thinking",
              text: "先分析第一轮。",
            },
            {
              type: "text",
              text: "第一轮回答",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1780704003,
          runtime_turn_id: "turn-native-2",
          content: [
            {
              type: "tool_request",
              id: "call-native-2",
              tool_name: "read_file",
              arguments: { path: "/tmp/native-2.txt" },
            } as never,
            {
              type: "tool_response",
              id: "call-native-2",
              success: true,
              output: "第二轮工具输出",
            } as never,
            {
              type: "text",
              text: "第二轮回答",
            },
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-app-server-messages-out-of-order",
    );

    expect(messages.map((message) => message.content)).toEqual([
      "第一轮问题",
      "第一轮回答",
      "第二轮问题",
      "第二轮回答",
    ]);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      runtimeTurnId: "turn-native-1",
      usage: {
        input_tokens: 8,
        output_tokens: 13,
      },
      thinkingContent: "先分析第一轮。",
    });
    expect(messages[3]).toMatchObject({
      role: "assistant",
      runtimeTurnId: "turn-native-2",
    });
    expect(
      messages[3]?.toolCalls?.some(
        (toolCall) =>
          toolCall.id === "call-native-2" &&
          toolCall.name === "read_file" &&
          toolCall.status === "completed",
      ),
    ).toBe(true);
  });

  it("历史 tool_response 应继承同一工具请求参数以恢复文件预览入口", () => {
    const detail: AsterSessionDetail = {
      id: "session-history-tool-response-arguments",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1780704050,
          content: [
            {
              type: "tool_request",
              id: "call-read-imported-preview",
              tool_name: "read_file",
              arguments: {
                path: "/workspace/imported-local-history/docs/imported-preview.md",
              },
            } as never,
            {
              type: "tool_response",
              id: "call-read-imported-preview",
              success: true,
              output: "导入会话 Markdown 预览内容",
            } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-history-tool-response-arguments",
    );

    const completedToolPart = messages[0]?.contentParts?.find(
      (part) =>
        part.type === "tool_use" &&
        part.toolCall.id === "call-read-imported-preview" &&
        part.toolCall.status === "completed",
    );
    expect(completedToolPart?.type).toBe("tool_use");
    if (completedToolPart?.type === "tool_use") {
      expect(completedToolPart.toolCall.arguments).toBe(
        '{"path":"/workspace/imported-local-history/docs/imported-preview.md"}',
      );
    }
  });

  it("App Server thread_read.tool_calls 应合入已恢复助手消息", () => {
    const detail: AsterSessionDetail = {
      id: "session-app-server-tool-calls",
      thread_id: "thread-app-server-tool-calls",
      created_at: 1,
      updated_at: 2,
      messages_count: 2,
      history_limit: 2,
      history_offset: 0,
      history_cursor: {
        oldest_message_id: null,
        start_index: 0,
        loaded_count: 2,
      },
      history_truncated: false,
      messages: [
        {
          role: "user",
          timestamp: 1780704100,
          content: [
            {
              type: "text",
              text: "生成 TypeScript greeting 代码产物",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1780704102,
          content: [
            {
              type: "text",
              text: "已生成代码产物，可在工作台查看。",
            },
          ],
        },
      ],
      turns: [
        {
          id: "turn-tool-read",
          thread_id: "thread-app-server-tool-calls",
          prompt_text: "生成 TypeScript greeting 代码产物",
          status: "completed",
          started_at: "2026-06-07T10:41:40.000Z",
          completed_at: "2026-06-07T10:41:42.000Z",
          created_at: "2026-06-07T10:41:40.000Z",
          updated_at: "2026-06-07T10:41:42.000Z",
        },
      ],
      thread_read: {
        thread_id: "thread-app-server-tool-calls",
        status: "completed",
        profile_status: "completed",
        turns: [
          {
            turn_id: "turn-tool-read",
            status: "completed",
            native_status: "completed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        tool_calls: [
          {
            tool_call_id: "tool-webfetch-read",
            turn_id: "turn-tool-read",
            tool_name: "WebFetch",
            status: "completed",
            started_at: "2026-06-07T10:41:41.000Z",
            finished_at: "2026-06-07T10:41:42.000Z",
            arguments: {
              url: "https://example.com/lime-workbench-tool",
            },
            output_preview:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
            output:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
            success: true,
          },
        ],
      },
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-app-server-tool-calls",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "已生成代码产物，可在工作台查看。",
      runtimeTurnId: "turn-tool-read",
      toolCalls: [
        {
          id: "tool-webfetch-read",
          name: "WebFetch",
          status: "completed",
          result: {
            success: true,
            output:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
          },
        },
      ],
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);

    const messagesWithoutTimelineFallback = hydrateSessionDetailMessages(
      detail,
      "session-app-server-tool-calls",
      { includeTimelineFallback: false },
    );

    expect(messagesWithoutTimelineFallback).toHaveLength(2);
    expect(messagesWithoutTimelineFallback[1]).toMatchObject({
      role: "assistant",
      content: "已生成代码产物，可在工作台查看。",
      runtimeTurnId: "turn-tool-read",
      toolCalls: [
        {
          id: "tool-webfetch-read",
          name: "WebFetch",
          status: "completed",
          result: {
            success: true,
            output:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
          },
        },
      ],
    });
    expect(
      messagesWithoutTimelineFallback[1]?.contentParts?.map(
        (part) => part.type,
      ),
    ).toEqual(["tool_use", "text"]);

    const compactMessagesWithoutTimelineFallback = hydrateSessionDetailMessages(
      detail,
      "session-app-server-tool-calls",
      {
        compactCompletedHistory: true,
        includeTimelineFallback: false,
      },
    );

    expect(compactMessagesWithoutTimelineFallback).toHaveLength(2);
    expect(compactMessagesWithoutTimelineFallback[1]).toMatchObject({
      role: "assistant",
      content: "已生成代码产物，可在工作台查看。",
      runtimeTurnId: "turn-tool-read",
      toolCalls: [
        {
          id: "tool-webfetch-read",
          name: "WebFetch",
          status: "completed",
          result: {
            success: true,
            output:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
          },
        },
      ],
    });
    expect(
      compactMessagesWithoutTimelineFallback[1]?.contentParts?.map(
        (part) => part.type,
      ),
    ).toEqual(["tool_use", "text"]);
  });

  it("本地历史导入的 detail.items 应按 turn 合入已恢复助手消息", () => {
    const detail: AsterSessionDetail = {
      id: "session-codex-import-timeline",
      thread_id: "thread-codex-import-timeline",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          id: "turn-codex:user",
          role: "user",
          timestamp: 1_781_000_001,
          content: [{ type: "text", text: "run it" }] as never,
        },
        {
          id: "turn-codex:assistant",
          role: "assistant",
          timestamp: 1_781_000_004,
          runtimeTurnId: "turn-codex",
          content: [{ type: "text", text: "done" }] as never,
        } as never,
      ],
      turns: [
        {
          id: "turn-codex",
          thread_id: "thread-codex-import-timeline",
          prompt_text: "run it",
          status: "completed",
          started_at: "2026-06-16T00:00:01.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          created_at: "2026-06-16T00:00:01.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        },
      ],
      items: [
        {
          id: "reasoning-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 1,
          type: "reasoning",
          status: "completed",
          text: "I need to run the tests first.",
          started_at: "2026-06-16T00:00:01.150Z",
          completed_at: "2026-06-16T00:00:01.150Z",
          updated_at: "2026-06-16T00:00:01.150Z",
        } as never,
        {
          id: "command-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 2,
          type: "command_execution",
          status: "completed",
          command: "npm test",
          cwd: "/workspace/app",
          aggregated_output: "Exit code: 0\nOutput:\nok",
          exit_code: 0,
          metadata: {
            imported: true,
            source_client: "codex",
          },
          started_at: "2026-06-16T00:00:02.000Z",
          completed_at: "2026-06-16T00:00:03.000Z",
          updated_at: "2026-06-16T00:00:03.000Z",
        } as never,
        {
          id: "assistant-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 6,
          type: "agent_message",
          status: "completed",
          text: "done",
          started_at: "2026-06-16T00:00:04.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        } as never,
        {
          id: "patch-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 3,
          type: "patch",
          status: "completed",
          text: "Patch changed /workspace/app/src/lib.rs",
          paths: ["/workspace/app/src/lib.rs"],
          summary: ["/workspace/app/src/lib.rs"],
          success: true,
          stdout: "Success. Updated files",
          started_at: "2026-06-16T00:00:03.100Z",
          completed_at: "2026-06-16T00:00:03.100Z",
          updated_at: "2026-06-16T00:00:03.100Z",
        } as never,
        {
          id: "search-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 4,
          type: "web_search",
          status: "completed",
          query: "npm test failure",
          action: "search_query",
          output: "search result summary",
          started_at: "2026-06-16T00:00:03.200Z",
          completed_at: "2026-06-16T00:00:03.300Z",
          updated_at: "2026-06-16T00:00:03.300Z",
        } as never,
        {
          id: "approval-codex",
          thread_id: "thread-codex-import-timeline",
          turn_id: "turn-codex",
          sequence: 5,
          type: "approval_request",
          status: "completed",
          request_id: "approval-codex",
          action_type: "tool_confirmation",
          tool_name: "exec_command",
          prompt: "Approve imported command: npm test",
          response: { decision: "imported_read_only" },
          started_at: "2026-06-16T00:00:03.400Z",
          completed_at: "2026-06-16T00:00:03.500Z",
          updated_at: "2026-06-16T00:00:03.500Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-codex-import-timeline",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "done",
      runtimeTurnId: "turn-codex",
      toolCalls: [
        {
          id: "command-codex",
          name: "exec_command",
          status: "completed",
          result: {
            success: true,
            output: "Exit code: 0\nOutput:\nok",
            metadata: {
              imported: true,
              source_client: "codex",
              exit_code: 0,
              cwd: "/workspace/app",
            },
          },
        },
        {
          id: "patch-codex",
          name: "apply_patch",
          status: "completed",
        },
        {
          id: "search-codex",
          name: "web_search",
          status: "completed",
        },
      ],
      actionRequests: [
        {
          requestId: "approval-codex",
          status: "submitted",
        },
      ],
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "tool_use",
      "tool_use",
      "action_required",
      "text",
    ]);
    expect(messages[1]?.contentParts?.[1]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "command-codex",
        result: {
          metadata: {
            imported: true,
            source_client: "codex",
            exit_code: 0,
            cwd: "/workspace/app",
          },
        },
      },
    });
  });

  it("timeline 已有工具过程时不应再注入 thread_read.tool_calls 兼容摘要", () => {
    const detail: AsterSessionDetail = {
      id: "session-timeline-tool-read-summary",
      thread_id: "thread-timeline-tool-read-summary",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          id: "turn-current:user",
          role: "user",
          timestamp: 1_781_000_001,
          content: [{ type: "text", text: "搜索最新评测" }] as never,
        },
        {
          id: "turn-current:assistant",
          role: "assistant",
          timestamp: 1_781_000_004,
          runtimeTurnId: "turn-current",
          content: [{ type: "text", text: "已完成搜索。" }] as never,
        } as never,
      ],
      turns: [
        {
          id: "turn-current",
          thread_id: "thread-timeline-tool-read-summary",
          prompt_text: "搜索最新评测",
          status: "completed",
          started_at: "2026-06-16T00:00:01.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          created_at: "2026-06-16T00:00:01.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        },
      ],
      items: [
        {
          id: "tool-current-search",
          thread_id: "thread-timeline-tool-read-summary",
          turn_id: "turn-current",
          sequence: 1,
          type: "tool_call",
          status: "completed",
          tool_name: "search_query",
          arguments: { q: "学习机 权威评测" },
          output: "timeline search result",
          success: true,
          started_at: "2026-06-16T00:00:02.000Z",
          completed_at: "2026-06-16T00:00:03.000Z",
          updated_at: "2026-06-16T00:00:03.000Z",
        } as never,
        {
          id: "assistant-current",
          thread_id: "thread-timeline-tool-read-summary",
          turn_id: "turn-current",
          sequence: 2,
          type: "agent_message",
          status: "completed",
          text: "已完成搜索。",
          started_at: "2026-06-16T00:00:04.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        } as never,
      ],
      thread_read: {
        thread_id: "thread-timeline-tool-read-summary",
        status: "completed",
        profile_status: "completed",
        turns: [
          {
            turn_id: "turn-current",
            status: "completed",
          },
        ],
        tool_calls: [
          {
            id: "tool-current-search",
            turn_id: "turn-current",
            tool_name: "search_query",
            status: "completed",
            output_preview: "read model duplicate summary",
            output: "read model duplicate summary",
            success: true,
            started_at: "2026-06-16T00:00:02.000Z",
            completed_at: "2026-06-16T00:00:03.000Z",
          },
        ],
      } as never,
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-timeline-tool-read-summary",
    );
    const assistant = messages.find((message) => message.role === "assistant");
    const toolParts =
      assistant?.contentParts?.filter((part) => part.type === "tool_use") || [];

    expect(messages).toHaveLength(2);
    expect(assistant?.runtimeTurnId).toBe("turn-current");
    expect(toolParts).toHaveLength(1);
    expect(assistant?.toolCalls).toHaveLength(1);
    expect(assistant?.toolCalls?.[0]).toMatchObject({
      id: "tool-current-search",
      name: "search_query",
      result: {
        output: "timeline search result",
      },
    });
  });

  it("本地历史导入的 reasoning 不应被 thread_read 工具摘要覆盖", () => {
    const detail: AsterSessionDetail = {
      id: "session-codex-import-thread-read",
      thread_id: "thread-codex-import-thread-read",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          id: "turn-codex:user",
          role: "user",
          timestamp: 1_781_000_001,
          content: [{ type: "text", text: "run it" }] as never,
        },
        {
          id: "turn-codex:assistant",
          role: "assistant",
          timestamp: 1_781_000_004,
          runtimeTurnId: "turn-codex",
          content: [{ type: "text", text: "done" }] as never,
        } as never,
      ],
      turns: [
        {
          id: "turn-codex",
          thread_id: "thread-codex-import-thread-read",
          prompt_text: "run it",
          status: "completed",
          started_at: "2026-06-16T00:00:01.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          created_at: "2026-06-16T00:00:01.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        },
      ],
      items: [
        {
          id: "reasoning-codex",
          thread_id: "thread-codex-import-thread-read",
          turn_id: "turn-codex",
          sequence: 1,
          type: "reasoning",
          status: "completed",
          text: "I need to inspect the test failure first.",
          metadata: {
            imported: true,
            source_client: "codex",
          },
          started_at: "2026-06-16T00:00:01.150Z",
          completed_at: "2026-06-16T00:00:01.150Z",
          updated_at: "2026-06-16T00:00:01.150Z",
        } as never,
        {
          id: "command-codex",
          thread_id: "thread-codex-import-thread-read",
          turn_id: "turn-codex",
          sequence: 2,
          type: "command_execution",
          status: "completed",
          command: "npm test",
          cwd: "/workspace/app",
          aggregated_output: "Exit code: 0\nOutput:\nok",
          exit_code: 0,
          metadata: {
            imported: true,
            source_client: "codex",
          },
          started_at: "2026-06-16T00:00:02.000Z",
          completed_at: "2026-06-16T00:00:03.000Z",
          updated_at: "2026-06-16T00:00:03.000Z",
        } as never,
        {
          id: "assistant-codex",
          thread_id: "thread-codex-import-thread-read",
          turn_id: "turn-codex",
          sequence: 3,
          type: "agent_message",
          status: "completed",
          text: "done",
          started_at: "2026-06-16T00:00:04.000Z",
          completed_at: "2026-06-16T00:00:04.000Z",
          updated_at: "2026-06-16T00:00:04.000Z",
        } as never,
      ],
      thread_read: {
        thread_id: "thread-codex-import-thread-read",
        status: "completed",
        profile_status: "completed",
        turns: [
          {
            turn_id: "turn-codex",
            status: "completed",
          },
        ],
        tool_calls: [
          {
            id: "command-codex",
            turn_id: "turn-codex",
            tool_name: "exec_command",
            status: "completed",
            output_preview: "ok",
            started_at: "2026-06-16T00:00:02.000Z",
            completed_at: "2026-06-16T00:00:03.000Z",
          },
        ],
      } as never,
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-codex-import-thread-read",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(messages[1]?.contentParts?.[0]).toEqual({
      type: "thinking",
      text: "I need to inspect the test failure first.",
      metadata: {
        imported: true,
        source_client: "codex",
      },
    });
  });

  it("本地历史导入会话不应把旧失败 turn 冒充为当前处理失败", () => {
    const detail: AsterSessionDetail = {
      id: "session-imported-failed-history",
      thread_id: "thread-imported-failed-history",
      created_at: 1,
      updated_at: 2,
      execution_runtime: {
        session_id: "session-imported-failed-history",
        source: "session",
        source_client: "codex",
        imported_continuation: {
          cwd: "/workspace/app",
        },
      } as never,
      messages: [
        {
          id: "turn-imported-failed:user",
          role: "user",
          timestamp: 1_781_000_001,
          runtimeTurnId: "turn-imported-failed",
          content: [{ type: "text", text: "run failed command" }] as never,
        },
        {
          id: "turn-imported-failed:assistant",
          role: "assistant",
          timestamp: 1_781_000_002,
          runtimeTurnId: "turn-imported-failed",
          content: [{ type: "text", text: "历史中这次命令失败了。" }] as never,
        },
      ],
      turns: [
        {
          id: "turn-imported-failed",
          thread_id: "thread-imported-failed-history",
          prompt_text: "run failed command",
          status: "failed",
          started_at: "2026-06-16T00:00:01.000Z",
          completed_at: "2026-06-16T00:00:02.000Z",
          created_at: "2026-06-16T00:00:01.000Z",
          updated_at: "2026-06-16T00:00:02.000Z",
        },
      ],
      thread_read: {
        thread_id: "thread-imported-failed-history",
        status: "failed",
        profile_status: "failed",
        turns: [
          {
            turn_id: "turn-imported-failed",
            status: "failed",
            native_status: "failed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        tool_calls: [],
        diagnostics: {
          latest_turn_status: "failed",
          latest_turn_error_message: "Exit code: 1",
          latest_turn_completed_at: "2026-06-16T00:00:02.000Z",
        },
      } as never,
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-imported-failed-history",
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.content)).toEqual([
      "run failed command",
      "历史中这次命令失败了。",
    ]);
    expect(messages.some((message) => message.runtimeStatus)).toBe(false);
    expect(messages.map((message) => message.content).join("\n")).not.toContain(
      "当前处理失败",
    );
  });

  it("camelCase 本地历史导入会话同样不应把旧失败 turn 冒充为当前处理失败", () => {
    const detail: AsterSessionDetail = {
      id: "session-imported-failed-history-camel",
      thread_id: "thread-imported-failed-history-camel",
      created_at: 1,
      updated_at: 2,
      execution_runtime: {
        session_id: "session-imported-failed-history-camel",
        source: "session",
        sourceClient: "codex",
        importedContinuation: {
          cwd: "/workspace/app",
        },
      } as never,
      messages: [
        {
          id: "turn-imported-failed-camel:user",
          role: "user",
          timestamp: 1_781_000_001,
          runtimeTurnId: "turn-imported-failed-camel",
          content: [{ type: "text", text: "run failed command" }] as never,
        },
        {
          id: "turn-imported-failed-camel:assistant",
          role: "assistant",
          timestamp: 1_781_000_002,
          runtimeTurnId: "turn-imported-failed-camel",
          content: [{ type: "text", text: "历史中这次命令失败了。" }] as never,
        },
      ],
      turns: [
        {
          id: "turn-imported-failed-camel",
          thread_id: "thread-imported-failed-history-camel",
          prompt_text: "run failed command",
          status: "failed",
          started_at: "2026-06-16T00:00:01.000Z",
          completed_at: "2026-06-16T00:00:02.000Z",
          created_at: "2026-06-16T00:00:01.000Z",
          updated_at: "2026-06-16T00:00:02.000Z",
        },
      ],
      thread_read: {
        thread_id: "thread-imported-failed-history-camel",
        status: "failed",
        profile_status: "failed",
        turns: [
          {
            turn_id: "turn-imported-failed-camel",
            status: "failed",
            native_status: "failed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        tool_calls: [],
        diagnostics: {
          latest_turn_status: "failed",
          latest_turn_error_message: "Exit code: 1",
          latest_turn_completed_at: "2026-06-16T00:00:02.000Z",
        },
      } as never,
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-imported-failed-history-camel",
    );

    expect(messages.map((message) => message.content)).toEqual([
      "run failed command",
      "历史中这次命令失败了。",
    ]);
    expect(messages.some((message) => message.runtimeStatus)).toBe(false);
    expect(messages.map((message) => message.content).join("\n")).not.toContain(
      "当前处理失败",
    );
  });

  it("App Server thread_read.tool_calls 与 artifact summary 同时存在时仍应保留工具过程", () => {
    const detail: AsterSessionDetail = {
      id: "session-app-server-tool-artifact",
      thread_id: "thread-app-server-tool-artifact",
      created_at: 1,
      updated_at: 2,
      messages_count: 2,
      history_limit: 40,
      history_offset: 0,
      history_cursor: {
        oldest_message_id: null,
        start_index: 0,
        loaded_count: 2,
      },
      history_truncated: false,
      messages: [
        {
          role: "user",
          timestamp: 1780704100,
          content: [
            {
              type: "text",
              text: "生成 TypeScript greeting 代码产物",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1780704102,
          content: [
            {
              type: "text",
              text: "已生成代码产物，可在工作台查看。",
            },
          ],
        },
      ],
      turns: [
        {
          id: "turn-tool-artifact",
          thread_id: "thread-app-server-tool-artifact",
          prompt_text: "生成 TypeScript greeting 代码产物",
          status: "completed",
          started_at: "2026-06-07T10:41:40.000Z",
          completed_at: "2026-06-07T10:41:42.000Z",
          created_at: "2026-06-07T10:41:40.000Z",
          updated_at: "2026-06-07T10:41:42.000Z",
        },
      ],
      thread_read: {
        thread_id: "thread-app-server-tool-artifact",
        status: "completed",
        profile_status: "completed",
        turns: [
          {
            turn_id: "turn-tool-artifact",
            status: "completed",
            native_status: "completed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        tool_calls: [
          {
            tool_call_id: "tool-webfetch-artifact",
            turn_id: "turn-tool-artifact",
            tool_name: "WebFetch",
            status: "completed",
            started_at: "2026-06-07T10:41:41.000Z",
            finished_at: "2026-06-07T10:41:42.000Z",
            arguments: {
              url: "https://example.com/lime-workbench-tool",
            },
            output_preview:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
            output:
              "已获取 fixture 工具事实: https://example.com/lime-workbench-tool",
            success: true,
          },
        ],
        artifacts: [
          {
            artifactRef: "artifact-ref-tool-artifact",
            eventId: "event-artifact-tool-artifact",
            sequence: 1,
            turnId: "turn-tool-artifact",
            artifactId: "code-artifact:greeting",
            path: ".lime/qc/code-artifact-workbench/src/greeting.ts",
            title: "greeting.ts",
            kind: "code",
            status: "complete",
            contentStatus: "available",
            metadata: {
              language: "typescript",
              previewText: "export const greeting = 'hello';",
            },
          },
        ],
      },
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-app-server-tool-artifact",
      {
        compactCompletedHistory: true,
        includeTimelineFallback: true,
      },
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "已生成代码产物，可在工作台查看。",
      runtimeTurnId: "turn-tool-artifact",
      toolCalls: [
        {
          id: "tool-webfetch-artifact",
          name: "WebFetch",
          status: "completed",
        },
      ],
      artifacts: [
        {
          id: "code-artifact:greeting",
          title: "greeting.ts",
        },
      ],
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
  });

  it("应清理仅用于内部展示的图片占位文本", () => {
    const detail: AsterSessionDetail = {
      id: "session-image-placeholder",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000200,
          content: [
            { type: "input_text", text: "[Image #1]" } as never,
            {
              type: "input_image",
              image_url: "data:image/png;base64,aGVsbG8=",
            } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000201,
          content: [{ type: "output_text", text: "已收到图片" } as never],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-image-placeholder",
    );

    expect(messages[0]).toMatchObject({
      role: "user",
      content: "",
      images: [
        {
          mediaType: "image/png",
          data: "aGVsbG8=",
        },
      ],
    });
    expect(messages[1]?.content).toBe("已收到图片");
  });

  it("应从本地历史导入消息的顶层附件恢复图片并保留用户文本", () => {
    const detail: AsterSessionDetail = {
      id: "session-imported-attachment",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000200,
          content: [
            {
              type: "text",
              text: "请运行测试并修复失败",
            },
          ],
          attachments: [
            {
              kind: "image",
              uri: "data:image/png;base64,aGVsbG8=",
              metadata: {
                mediaType: "image/png",
                index: 0,
                detail: "low",
              },
            },
          ],
        } as never,
        {
          role: "assistant",
          timestamp: 1710000201,
          content: [{ type: "output_text", text: "已收到导入图片。" } as never],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-imported-attachment",
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "请运行测试并修复失败",
      images: [
        {
          mediaType: "image/png",
          data: "aGVsbG8=",
          sourceUri: "data:image/png;base64,aGVsbG8=",
          previewUrl: "data:image/png;base64,aGVsbG8=",
          metadata: {
            mediaType: "image/png",
            index: 0,
            detail: "low",
          },
          index: 0,
        },
      ],
    });
    expect(messages[1]?.content).toBe("已收到导入图片。");
  });

  it("本地历史导入消息同时包含 content image 和 attachment 时不应重复展示图片", () => {
    const detail: AsterSessionDetail = {
      id: "session-imported-attachment-dedupe",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000200,
          content: [
            {
              type: "text",
              text: "请运行测试并修复失败",
            },
            {
              type: "image",
              uri: "data:image/png;base64,aGVsbG8=",
              metadata: {
                mediaType: "image/png",
                index: 0,
              },
            },
          ],
          attachments: [
            {
              kind: "image",
              uri: "data:image/png;base64,aGVsbG8=",
              metadata: {
                mediaType: "image/png",
                index: 0,
              },
            },
          ],
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-imported-attachment-dedupe",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("请运行测试并修复失败");
    expect(messages[0]?.images).toHaveLength(1);
    expect(messages[0]?.images?.[0]).toMatchObject({
      mediaType: "image/png",
      data: "aGVsbG8=",
      sourceUri: "data:image/png;base64,aGVsbG8=",
      previewUrl: "data:image/png;base64,aGVsbG8=",
    });
  });

  it("应从历史消息的 thinking 字段恢复完整思考过程", () => {
    const detail: AsterSessionDetail = {
      id: "session-1",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000000,
          content: [
            { type: "text", text: "请给我一版可直接使用的图片 Prompt" },
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            { type: "thinking", thinking: "先理解主题" } as never,
            { type: "thinking", thinking: "，再组织结构。\n" } as never,
            { type: "output_text", text: "下面是整理好的 Prompt。" } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(detail, "session-1");
    const assistantMessage = messages.find(
      (message) => message.role === "assistant",
    );

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).toBe("下面是整理好的 Prompt。");
    expect(assistantMessage?.thinkingContent).toBe(
      "先理解主题，再组织结构。\n",
    );
    expect(assistantMessage?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先理解主题，再组织结构。\n",
      },
      {
        type: "text",
        text: "下面是整理好的 Prompt。",
      },
    ]);
  });

  it("后端 detail.messages 为空但 timeline 有用户与助手消息时应恢复对话", () => {
    const detail: AsterSessionDetail = {
      id: "session-timeline-only",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "turn-timeline-only",
          thread_id: "session-timeline-only",
          prompt_text: "我来帮你搜索 OpenAI 最新模型",
          status: "completed",
          started_at: "2026-05-06T10:00:00.000Z",
          completed_at: "2026-05-06T10:00:03.000Z",
          created_at: "2026-05-06T10:00:00.000Z",
          updated_at: "2026-05-06T10:00:03.000Z",
        },
      ],
      items: [
        {
          id: "item-user",
          thread_id: "session-timeline-only",
          turn_id: "turn-timeline-only",
          sequence: 1,
          type: "user_message",
          content: "我来帮你搜索 OpenAI 最新模型",
          status: "completed",
          started_at: "2026-05-06T10:00:00.000Z",
          completed_at: "2026-05-06T10:00:00.000Z",
          updated_at: "2026-05-06T10:00:00.000Z",
        } as never,
        {
          id: "item-assistant",
          thread_id: "session-timeline-only",
          turn_id: "turn-timeline-only",
          sequence: 2,
          type: "agent_message",
          text: "已找到最新模型信息。",
          status: "completed",
          started_at: "2026-05-06T10:00:02.000Z",
          completed_at: "2026-05-06T10:00:03.000Z",
          updated_at: "2026-05-06T10:00:03.000Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-timeline-only",
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "session-timeline-only-timeline-item-user",
      role: "user",
      content: "我来帮你搜索 OpenAI 最新模型",
    });
    expect(messages[1]).toMatchObject({
      id: "session-timeline-only-timeline-item-assistant",
      role: "assistant",
      content: "已找到最新模型信息。",
      contentParts: [
        {
          type: "text",
          text: "已找到最新模型信息。",
        },
      ],
    });
  });

  it("历史 timeline agent_message 只有 content 字段时仍应恢复最终正文", () => {
    const detail: AsterSessionDetail = {
      id: "session-timeline-content-final",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "turn-timeline-content-final",
          thread_id: "session-timeline-content-final",
          prompt_text:
            "读取 internal/roadmap/agent-workspace/README.md 并总结一下",
          status: "completed",
          started_at: "2026-06-08T10:00:00.000Z",
          completed_at: "2026-06-08T10:00:06.000Z",
          created_at: "2026-06-08T10:00:00.000Z",
          updated_at: "2026-06-08T10:00:06.000Z",
        },
      ],
      items: [
        {
          id: "item-user-content-final",
          thread_id: "session-timeline-content-final",
          turn_id: "turn-timeline-content-final",
          sequence: 1,
          type: "user_message",
          content: "读取 internal/roadmap/agent-workspace/README.md 并总结一下",
          status: "completed",
          started_at: "2026-06-08T10:00:00.000Z",
          completed_at: "2026-06-08T10:00:00.000Z",
          updated_at: "2026-06-08T10:00:00.000Z",
        } as never,
        {
          id: "item-read-file-content-final",
          thread_id: "session-timeline-content-final",
          turn_id: "turn-timeline-content-final",
          sequence: 2,
          type: "tool_call",
          tool_name: "Read",
          arguments: {
            file_path: "internal/roadmap/agent-workspace/README.md",
          },
          output: "# Agent Workspace\n\n主线说明。",
          success: true,
          status: "completed",
          started_at: "2026-06-08T10:00:01.000Z",
          completed_at: "2026-06-08T10:00:02.000Z",
          updated_at: "2026-06-08T10:00:02.000Z",
        } as never,
        {
          id: "item-assistant-content-final",
          thread_id: "session-timeline-content-final",
          turn_id: "turn-timeline-content-final",
          sequence: 3,
          type: "agent_message",
          content:
            "这个 README 主要说明 Agent Workspace 的目标、阶段和当前交付边界。",
          phase: "final_answer",
          status: "completed",
          started_at: "2026-06-08T10:00:05.000Z",
          completed_at: "2026-06-08T10:00:06.000Z",
          updated_at: "2026-06-08T10:00:06.000Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-timeline-content-final",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content:
        "这个 README 主要说明 Agent Workspace 的目标、阶段和当前交付边界。",
      toolCalls: [
        {
          id: "item-read-file-content-final",
          name: "Read",
          status: "completed",
        },
      ],
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "text",
    ]);
  });

  it("App Server 历史 turn 缺少旧 prompt_text 字段时不应中断会话恢复", () => {
    const detail: AsterSessionDetail = {
      id: "session-missing-legacy-text",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "turn-missing-prompt",
          thread_id: "session-missing-legacy-text",
          status: "failed",
          started_at: "2026-06-07T04:39:20.100Z",
          completed_at: "2026-06-07T04:42:05.905Z",
          created_at: "2026-06-07T04:39:20.100Z",
          updated_at: "2026-06-07T04:42:05.905Z",
        } as never,
      ],
      items: [
        {
          id: "item-user-missing-content",
          thread_id: "session-missing-legacy-text",
          turn_id: "turn-missing-prompt",
          sequence: 1,
          type: "user_message",
          status: "completed",
          started_at: "2026-06-07T04:39:20.100Z",
          updated_at: "2026-06-07T04:39:20.100Z",
        } as never,
        {
          id: "item-agent-missing-text",
          thread_id: "session-missing-legacy-text",
          turn_id: "turn-missing-prompt",
          sequence: 2,
          type: "agent_message",
          status: "failed",
          started_at: "2026-06-07T04:42:05.905Z",
          updated_at: "2026-06-07T04:42:05.905Z",
        } as never,
      ],
    };

    expect(() =>
      hydrateSessionDetailMessages(detail, "session-missing-legacy-text"),
    ).not.toThrow();
    expect(
      hydrateSessionDetailMessages(detail, "session-missing-legacy-text"),
    ).toEqual([]);
  });

  it("App Server 历史只有 artifact summary 时应恢复产物消息", () => {
    const detail: AsterSessionDetail = {
      id: "session-artifact-only",
      thread_id: "session-artifact-only-thread",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "turn-artifact-only",
          thread_id: "session-artifact-only-thread",
          prompt_text: "",
          status: "completed",
          started_at: "2026-06-07T06:17:13.000Z",
          completed_at: "2026-06-07T06:17:14.000Z",
          created_at: "2026-06-07T06:17:13.000Z",
          updated_at: "2026-06-07T06:17:14.000Z",
        },
      ],
      items: [],
      artifacts: [
        {
          artifactRef: "artifact-ref-1",
          eventId: "event-artifact-1",
          sequence: 1,
          turnId: "turn-artifact-only",
          artifactId: "code-artifact:greeting",
          path: ".lime/qc/code-artifact-workbench/src/greeting.ts",
          title: "greeting.ts",
          kind: "code",
          status: "complete",
          contentStatus: "available",
          metadata: {
            language: "typescript",
            previewText: "export const greeting = 'hello';",
          },
        },
      ],
      thread_read: {
        thread_id: "session-artifact-only-thread",
        status: "completed",
        profile_status: "completed",
        turns: [
          {
            turn_id: "turn-artifact-only",
            status: "completed",
            native_status: "completed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        artifacts: [
          {
            artifactRef: "artifact-ref-1",
            eventId: "event-artifact-1",
            sequence: 1,
            turnId: "turn-artifact-only",
            artifactId: "code-artifact:greeting",
            path: ".lime/qc/code-artifact-workbench/src/greeting.ts",
            title: "greeting.ts",
            kind: "code",
            status: "complete",
            contentStatus: "available",
            metadata: {
              language: "typescript",
              previewText: "export const greeting = 'hello';",
            },
          },
        ],
      } as never,
    } as AsterSessionDetail & { artifacts: unknown[] };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-artifact-only",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "session-artifact-only-app-server-artifacts",
      role: "assistant",
      content: "已生成代码产物，可在工作台查看。",
      runtimeTurnId: "turn-artifact-only",
      artifacts: [
        {
          id: "code-artifact:greeting",
          type: "code",
          title: "greeting.ts",
          status: "complete",
          content: "export const greeting = 'hello';",
          meta: {
            filePath: ".lime/qc/code-artifact-workbench/src/greeting.ts",
            artifactPath: ".lime/qc/code-artifact-workbench/src/greeting.ts",
            previewText: "export const greeting = 'hello';",
          },
        },
      ],
    });
  });

  it("历史恢复不应把 commentary 阶段消息合并进最终正文", () => {
    const detail: AsterSessionDetail = {
      id: "session-commentary-final",
      created_at: 1,
      updated_at: 2,
      history_limit: 40,
      messages: [],
      turns: [
        {
          id: "turn-commentary-final",
          thread_id: "session-commentary-final",
          prompt_text: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T10:00:00.000Z",
          completed_at: "2026-06-02T10:00:20.000Z",
          created_at: "2026-06-02T10:00:00.000Z",
          updated_at: "2026-06-02T10:00:20.000Z",
        },
      ],
      items: [
        {
          id: "user-commentary-final",
          thread_id: "session-commentary-final",
          turn_id: "turn-commentary-final",
          sequence: 1,
          type: "user_message",
          content: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T10:00:00.000Z",
          completed_at: "2026-06-02T10:00:00.000Z",
          updated_at: "2026-06-02T10:00:00.000Z",
        } as never,
        {
          id: "assistant-commentary",
          thread_id: "session-commentary-final",
          turn_id: "turn-commentary-final",
          sequence: 2,
          type: "agent_message",
          text: "我会先检索多组来源并交叉核对。",
          phase: "commentary",
          status: "completed",
          started_at: "2026-06-02T10:00:01.000Z",
          completed_at: "2026-06-02T10:00:02.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
        } as never,
        {
          id: "assistant-final",
          thread_id: "session-commentary-final",
          turn_id: "turn-commentary-final",
          sequence: 3,
          type: "agent_message",
          text: "## 今日国际新闻简报\n\n- 第一条要闻。",
          phase: "final_answer",
          status: "completed",
          started_at: "2026-06-02T10:00:18.000Z",
          completed_at: "2026-06-02T10:00:20.000Z",
          updated_at: "2026-06-02T10:00:20.000Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-commentary-final",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "## 今日国际新闻简报\n\n- 第一条要闻。",
      contentParts: [
        {
          type: "text",
          text: "## 今日国际新闻简报\n\n- 第一条要闻。",
        },
      ],
    });
    expect(messages[1]?.content).not.toContain("我会先检索");
    expect(
      messages[1]?.contentParts
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n"),
    ).not.toContain("我会先检索");
  });

  it("历史恢复应把旧无 phase turn 中最后一条 agent_message 作为最终正文", () => {
    const detail: AsterSessionDetail = {
      id: "session-legacy-unphased-final",
      created_at: 1,
      updated_at: 2,
      history_limit: 40,
      messages: [],
      turns: [
        {
          id: "turn-legacy-unphased-final",
          thread_id: "session-legacy-unphased-final",
          prompt_text: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T10:00:00.000Z",
          completed_at: "2026-06-02T10:00:30.000Z",
          created_at: "2026-06-02T10:00:00.000Z",
          updated_at: "2026-06-02T10:00:30.000Z",
        },
      ],
      items: [
        {
          id: "user-legacy-unphased-final",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 1,
          type: "user_message",
          content: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-02T10:00:00.000Z",
          completed_at: "2026-06-02T10:00:00.000Z",
          updated_at: "2026-06-02T10:00:00.000Z",
        } as never,
        {
          id: "assistant-process-search",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 2,
          type: "agent_message",
          text: "我会先做几组中英文检索，覆盖多个新闻源。",
          status: "completed",
          started_at: "2026-06-02T10:00:01.000Z",
          completed_at: "2026-06-02T10:00:02.000Z",
          updated_at: "2026-06-02T10:00:02.000Z",
        } as never,
        {
          id: "tool-web-search",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 3,
          type: "tool_call",
          tool_name: "WebSearch",
          arguments: { query: "world news headlines" },
          output: "搜索结果摘要",
          success: true,
          status: "completed",
          started_at: "2026-06-02T10:00:03.000Z",
          completed_at: "2026-06-02T10:00:05.000Z",
          updated_at: "2026-06-02T10:00:05.000Z",
        } as never,
        {
          id: "assistant-process-fetch",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 4,
          type: "agent_message",
          text: "搜索结果里噪声较多，我再打开几个页面交叉核对。",
          status: "completed",
          started_at: "2026-06-02T10:00:06.000Z",
          completed_at: "2026-06-02T10:00:07.000Z",
          updated_at: "2026-06-02T10:00:07.000Z",
        } as never,
        {
          id: "tool-web-fetch-failed",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 5,
          type: "tool_call",
          tool_name: "WebFetch",
          arguments: { url: "https://example.invalid/news" },
          output: "",
          error: "请求失败",
          success: false,
          status: "failed",
          started_at: "2026-06-02T10:00:08.000Z",
          completed_at: "2026-06-02T10:00:09.000Z",
          updated_at: "2026-06-02T10:00:09.000Z",
        } as never,
        {
          id: "assistant-final-news",
          thread_id: "session-legacy-unphased-final",
          turn_id: "turn-legacy-unphased-final",
          sequence: 6,
          type: "agent_message",
          text: "## 今日国际新闻简报\n\n- 重点一：附来源。",
          status: "completed",
          started_at: "2026-06-02T10:00:28.000Z",
          completed_at: "2026-06-02T10:00:30.000Z",
          updated_at: "2026-06-02T10:00:30.000Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-legacy-unphased-final",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "## 今日国际新闻简报\n\n- 重点一：附来源。",
    });
    expect(messages[1]?.content).not.toContain("我会先做");
    expect(messages[1]?.content).not.toContain("噪声较多");
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(messages[1]?.toolCalls?.map((tool) => tool.status)).toEqual([
      "completed",
      "failed",
    ]);
  });

  it("后端 detail.messages 有正文时仍应从 timeline 恢复 Skill、思考与用户输入", () => {
    const detail: AsterSessionDetail = {
      id: "session-skill-timeline-process",
      created_at: 1,
      updated_at: 2,
      history_limit: 40,
      messages: [
        {
          role: "user",
          timestamp: 1778730438,
          content: [
            {
              type: "text",
              text: "@analysis 请只用一句话分析：E2E_SKILL_TRACE_1778730404446。",
            },
          ],
        },
        {
          role: "assistant",
          timestamp: 1778730447,
          content: [
            {
              type: "text",
              text: "该跟踪ID无上下文，无法判断具体含义。",
            },
          ],
        },
      ],
      turns: [
        {
          id: "turn-skill-process",
          thread_id: "session-skill-timeline-process",
          prompt_text:
            "@analysis 请只用一句话分析：E2E_SKILL_TRACE_1778730404446。",
          status: "completed",
          started_at: "2026-05-14T03:47:19.000Z",
          completed_at: "2026-05-14T03:47:27.000Z",
          created_at: "2026-05-14T03:47:19.000Z",
          updated_at: "2026-05-14T03:47:27.000Z",
        },
      ],
      items: [
        {
          id: "user:turn-skill-process",
          thread_id: "session-skill-timeline-process",
          turn_id: "turn-skill-process",
          sequence: 1,
          type: "user_message",
          content:
            "@analysis 请只用一句话分析：E2E_SKILL_TRACE_1778730404446。",
          status: "completed",
          started_at: "2026-05-14T03:47:19.000Z",
          completed_at: "2026-05-14T03:47:19.000Z",
          updated_at: "2026-05-14T03:47:19.000Z",
        } as never,
        {
          id: "skill:turn-skill-process",
          thread_id: "session-skill-timeline-process",
          turn_id: "turn-skill-process",
          sequence: 2,
          type: "tool_call",
          tool_name: "Skill",
          arguments: {
            skill: "analysis",
            source: "SKILL.md",
            version: "1.0.1",
          },
          output: "已从 SKILL.md 读取并执行 Skill：analysis",
          success: true,
          metadata: {
            tool_family: "skill",
            skill_source: "SKILL.md",
            markdown_content_bytes: 1633,
            skill_markdown_content:
              "---\nname: analysis\n---\n\n# Analysis Skill\n\n执行前必须读取本文件。",
          },
          status: "completed",
          started_at: "2026-05-14T03:47:19.100Z",
          completed_at: "2026-05-14T03:47:27.000Z",
          updated_at: "2026-05-14T03:47:27.000Z",
        } as never,
        {
          id: "reasoning:turn-skill-process",
          thread_id: "session-skill-timeline-process",
          turn_id: "turn-skill-process",
          sequence: 3,
          type: "reasoning",
          text: "先确认 Skill 指令，再基于可见上下文回答。",
          summary: ["先确认 Skill 指令，再基于可见上下文回答。"],
          status: "completed",
          started_at: "2026-05-14T03:47:20.000Z",
          completed_at: "2026-05-14T03:47:27.000Z",
          updated_at: "2026-05-14T03:47:27.000Z",
        } as never,
        {
          id: "assistant:turn-skill-process",
          thread_id: "session-skill-timeline-process",
          turn_id: "turn-skill-process",
          sequence: 4,
          type: "agent_message",
          text: "该跟踪ID无上下文，无法判断具体含义。",
          status: "completed",
          started_at: "2026-05-14T03:47:27.000Z",
          completed_at: "2026-05-14T03:47:27.000Z",
          updated_at: "2026-05-14T03:47:27.000Z",
        } as never,
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-skill-timeline-process",
      { compactCompletedHistory: true },
    );

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages[0]?.content).toBe(
      "@analysis 请只用一句话分析：E2E_SKILL_TRACE_1778730404446。",
    );
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "该跟踪ID无上下文，无法判断具体含义。",
      inlineProcessRetention: "skill",
      thinkingContent: "先确认 Skill 指令，再基于可见上下文回答。",
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "tool_use",
      "thinking",
      "text",
    ]);
    expect(messages[1]?.toolCalls?.[0]).toMatchObject({
      name: "Skill",
      status: "completed",
      result: expect.objectContaining({
        output: "已从 SKILL.md 读取并执行 Skill：analysis",
        metadata: expect.objectContaining({
          skill_markdown_content: expect.stringContaining("Analysis Skill"),
        }),
      }),
    });
  });

  it("后端 detail.messages 和 timeline 消息都为空时应从真实 turn 恢复用户请求", () => {
    const detail: AsterSessionDetail = {
      id: "session-turn-only",
      created_at: 1,
      updated_at: 2,
      messages: [],
      turns: [
        {
          id: "turn-search",
          thread_id: "session-turn-only",
          prompt_text: "@搜索 OpenAI 最新模型公告，给我 3 条要点，并附来源。",
          status: "failed",
          error_message:
            "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=not_requested，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。",
          started_at: "2026-05-06T19:29:06.522Z",
          completed_at: "2026-05-06T19:29:06.862Z",
          created_at: "2026-05-06T19:29:06.522Z",
          updated_at: "2026-05-06T19:29:06.862Z",
        },
        {
          id: "auxiliary-runtime-projection-title",
          thread_id: "session-turn-only",
          prompt_text: "辅助标题生成 · 我来帮你搜索 OpenAI 最新模型...",
          status: "completed",
          started_at: "2026-05-06T19:29:55.849Z",
          completed_at: "2026-05-06T19:29:55.896Z",
          created_at: "2026-05-06T19:29:55.849Z",
          updated_at: "2026-05-06T19:29:55.896Z",
        },
      ],
      items: [
        {
          id: "permission-error",
          thread_id: "session-turn-only",
          turn_id: "turn-search",
          sequence: 3,
          status: "failed",
          type: "error",
          message:
            "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=not_requested，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。",
          started_at: "2026-05-06T19:29:06.862Z",
          completed_at: "2026-05-06T19:29:06.862Z",
          updated_at: "2026-05-06T19:29:06.862Z",
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(detail, "session-turn-only");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "session-turn-only-turn-turn-search-prompt",
      role: "user",
      content: "@搜索 OpenAI 最新模型公告，给我 3 条要点，并附来源。",
    });
    expect(messages[0]?.content).not.toContain("confirmationStatus");
    expect(messages[0]?.content).not.toContain("askProfileKeys");
    expect(messages[0]?.content).not.toContain("辅助标题生成");
  });

  it("App Server failed read model 应恢复用户请求并追加失败助手消息", () => {
    const detail: AsterSessionDetail = {
      id: "session-app-server-failed-read",
      thread_id: "thread-app-server-failed-read",
      created_at: 1,
      updated_at: 2,
      messages_count: 1,
      history_limit: 80,
      history_offset: 0,
      history_cursor: {
        oldest_message_id: null,
        start_index: 0,
        loaded_count: 1,
      },
      history_truncated: false,
      messages: [
        {
          role: "user",
          timestamp: 1780834200,
          content: [
            {
              type: "text",
              text: "整理今天的国际新闻",
            },
          ],
        },
      ],
      turns: [
        {
          id: "turn-news-failed",
          thread_id: "thread-app-server-failed-read",
          prompt_text: "整理今天的国际新闻",
          status: "failed",
          error_message:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          started_at: "2026-06-07T09:30:00.000Z",
          completed_at: "2026-06-07T09:30:12.000Z",
          created_at: "2026-06-07T09:30:00.000Z",
          updated_at: "2026-06-07T09:30:12.000Z",
        },
      ],
      items: [
        {
          id: "item-news-error",
          thread_id: "thread-app-server-failed-read",
          turn_id: "turn-news-failed",
          sequence: 3,
          type: "error",
          status: "failed",
          message:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          started_at: "2026-06-07T09:30:12.000Z",
          completed_at: "2026-06-07T09:30:12.000Z",
          updated_at: "2026-06-07T09:30:12.000Z",
        } as never,
      ],
      thread_read: {
        thread_id: "thread-app-server-failed-read",
        status: "failed",
        profile_status: "failed",
        active_turn_id: undefined,
        turns: [
          {
            turn_id: "turn-news-failed",
            status: "failed",
            native_status: "failed",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        diagnostics: {
          latest_turn_status: "failed",
          latest_turn_started_at: "2026-06-07T09:30:00.000Z",
          latest_turn_completed_at: "2026-06-07T09:30:12.000Z",
          latest_turn_updated_at: "2026-06-07T09:30:12.000Z",
          latest_turn_error_message:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          warning_count: 0,
          context_compaction_count: 0,
          failed_tool_call_count: 0,
          failed_command_count: 0,
          pending_request_count: 0,
        },
      },
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-app-server-failed-read",
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "整理今天的国际新闻",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("执行失败："),
      isThinking: false,
      runtimeTurnId: "turn-news-failed",
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
        detail: expect.stringContaining("token-plan-cn.xiaomimimo.com"),
      },
    });
    expect(messages[1]?.content).toContain("token-plan-cn.xiaomimimo.com");
    expect(messages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: messages[1]?.content,
      },
    ]);
  });

  it("后端 messages 只有助手图片轨迹时应从真实 turn 补回用户指令", () => {
    const detail: AsterSessionDetail = {
      id: "session-image-history-user-fallback",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            {
              type: "output_text",
              text: "好啊，生成：画一张三国主要人物的群像海报",
            } as never,
            {
              type: "tool_request",
              id: "tool-image-history-user-fallback",
              tool_name: "lime_create_image_generation_task",
              arguments: {
                prompt: "画一张三国主要人物的群像海报，电影感，国风，高清",
                size: "1024x1024",
              },
            } as never,
            {
              type: "tool_response",
              id: "tool-image-history-user-fallback",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-user-fallback",
                task_type: "image_generate",
                status: "succeeded",
                requested_count: 1,
                received_count: 1,
              },
            } as never,
          ],
        },
      ],
      turns: [
        {
          id: "turn-image-history-user-fallback",
          thread_id: "session-image-history-user-fallback",
          prompt_text: "@配图 画一张三国主要人物的群像海报，电影感，国风，高清",
          status: "completed",
          started_at: "2026-05-06T10:00:00.000Z",
          completed_at: "2026-05-06T10:00:05.000Z",
          created_at: "2026-05-06T10:00:00.000Z",
          updated_at: "2026-05-06T10:00:05.000Z",
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-image-history-user-fallback",
    );

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "@配图 画一张三国主要人物的群像海报，电影感，国风，高清",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      imageWorkbenchPreview: {
        taskId: "task-image-history-user-fallback",
        prompt: "画一张三国主要人物的群像海报，电影感，国风，高清",
        status: "complete",
      },
    });
  });

  it("后端连续两轮只有助手图片轨迹时应按 turn 顺序补回各自用户指令", () => {
    const detail: AsterSessionDetail = {
      id: "session-image-history-two-turns",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            {
              type: "output_text",
              text: "好啊，生成：广州塔春天照片",
            } as never,
            {
              type: "tool_response",
              id: "tool-image-history-two-turns-1",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-two-turns-1",
                task_type: "image_generate",
                status: "succeeded",
                received_count: 1,
              },
            } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000015,
          content: [
            {
              type: "output_text",
              text: "好啊，生成：青柠极简插画",
            } as never,
            {
              type: "tool_response",
              id: "tool-image-history-two-turns-2",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-two-turns-2",
                task_type: "image_generate",
                status: "succeeded",
                received_count: 1,
              },
            } as never,
          ],
        },
      ],
      turns: [
        {
          id: "turn-image-history-two-turns-1",
          thread_id: "session-image-history-two-turns",
          prompt_text: "@配图 生成一张广州塔春天照片",
          status: "completed",
          started_at: "2026-05-06T10:00:00.000Z",
          completed_at: "2026-05-06T10:00:05.000Z",
          created_at: "2026-05-06T10:00:00.000Z",
          updated_at: "2026-05-06T10:00:05.000Z",
        },
        {
          id: "turn-image-history-two-turns-2",
          thread_id: "session-image-history-two-turns",
          prompt_text: "@配图 再生成一张青柠极简插画",
          status: "completed",
          started_at: "2026-05-06T10:00:10.000Z",
          completed_at: "2026-05-06T10:00:15.000Z",
          created_at: "2026-05-06T10:00:10.000Z",
          updated_at: "2026-05-06T10:00:15.000Z",
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-image-history-two-turns",
    );

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages[0]?.content).toBe("@配图 生成一张广州塔春天照片");
    expect(messages[2]?.content).toBe("@配图 再生成一张青柠极简插画");
    expect(messages[1]?.imageWorkbenchPreview?.taskId).toBe(
      "task-image-history-two-turns-1",
    );
    expect(messages[3]?.imageWorkbenchPreview?.taskId).toBe(
      "task-image-history-two-turns-2",
    );
  });

  it("后端只缺部分用户图片指令时也应按时间补回缺失轮次", () => {
    const detail: AsterSessionDetail = {
      id: "session-image-history-partial-user-gap",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000000,
          content: [
            {
              type: "input_text",
              text: "@配图 生成一张广州塔春天照片",
            } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            {
              type: "output_text",
              text: "好啊，生成：广州塔春天照片",
            } as never,
            {
              type: "tool_response",
              id: "tool-image-history-partial-user-gap-1",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-partial-user-gap-1",
                task_type: "image_generate",
                status: "succeeded",
                received_count: 1,
              },
            } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000015,
          content: [
            {
              type: "output_text",
              text: "好啊，生成：青柠极简插画",
            } as never,
            {
              type: "tool_response",
              id: "tool-image-history-partial-user-gap-2",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-partial-user-gap-2",
                task_type: "image_generate",
                status: "succeeded",
                received_count: 1,
              },
            } as never,
          ],
        },
      ],
      turns: [
        {
          id: "turn-image-history-partial-user-gap-1",
          thread_id: "session-image-history-partial-user-gap",
          prompt_text: "@配图 生成一张广州塔春天照片",
          status: "completed",
          started_at: "2024-03-09T16:00:00.000Z",
          completed_at: "2024-03-09T16:00:05.000Z",
          created_at: "2024-03-09T16:00:00.000Z",
          updated_at: "2024-03-09T16:00:05.000Z",
        },
        {
          id: "turn-image-history-partial-user-gap-2",
          thread_id: "session-image-history-partial-user-gap",
          prompt_text: "@配图 再生成一张青柠极简插画",
          status: "completed",
          started_at: "2024-03-09T16:00:10.000Z",
          completed_at: "2024-03-09T16:00:15.000Z",
          created_at: "2024-03-09T16:00:10.000Z",
          updated_at: "2024-03-09T16:00:15.000Z",
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-image-history-partial-user-gap",
    );

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages[0]?.content).toBe("@配图 生成一张广州塔春天照片");
    expect(messages[2]?.content).toBe("@配图 再生成一张青柠极简插画");
    expect(messages[1]?.imageWorkbenchPreview?.taskId).toBe(
      "task-image-history-partial-user-gap-1",
    );
    expect(messages[3]?.imageWorkbenchPreview?.taskId).toBe(
      "task-image-history-partial-user-gap-2",
    );
  });

  it("已完成旧会话压缩水合时应保留工具过程并让最终正文接在工具之后", () => {
    const detail: AsterSessionDetail = {
      id: "session-compact-history",
      created_at: 1,
      updated_at: 2,
      history_limit: 40,
      turns: [
        {
          id: "turn-compact-history",
          thread_id: "session-compact-history",
          prompt_text: "恢复旧会话",
          status: "completed",
          started_at: "2026-04-30T10:00:00.000Z",
          completed_at: "2026-04-30T10:00:05.000Z",
          created_at: "2026-04-30T10:00:00.000Z",
          updated_at: "2026-04-30T10:00:05.000Z",
        },
      ],
      items: [
        {
          id: "thinking-compact-history",
          thread_id: "session-compact-history",
          turn_id: "turn-compact-history",
          sequence: 1,
          type: "reasoning",
          text: "大量思考过程",
          status: "completed",
          started_at: "2026-04-30T10:00:00.500Z",
          completed_at: "2026-04-30T10:00:01.000Z",
          updated_at: "2026-04-30T10:00:01.000Z",
        } as never,
        {
          id: "item-compact-history",
          thread_id: "session-compact-history",
          turn_id: "turn-compact-history",
          sequence: 2,
          type: "tool_call",
          tool_name: "Bash",
          arguments: { command: "printf slow" },
          output: "x".repeat(12_000),
          status: "completed",
          started_at: "2026-04-30T10:00:01.000Z",
          completed_at: "2026-04-30T10:00:02.000Z",
          updated_at: "2026-04-30T10:00:02.000Z",
        } as never,
      ],
      messages: [
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            { type: "thinking", thinking: "大量思考过程" } as never,
            {
              type: "tool_request",
              id: "call-heavy",
              tool_name: "Bash",
              arguments: { command: "printf slow" },
            } as never,
            {
              type: "tool_response",
              id: "call-heavy",
              output: "x".repeat(12_000),
              success: true,
            } as never,
            { type: "output_text", text: "最终回复正文" } as never,
          ],
        },
      ],
    };

    expect(shouldCompactCompletedSessionHistory(detail)).toBe(true);

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-compact-history",
      { compactCompletedHistory: true },
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "恢复旧会话",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "最终回复正文",
      thinkingContent: "大量思考过程",
    });
    expect(messages[1]?.toolCalls?.[0]).toMatchObject({
      id: "item-compact-history",
      name: "Bash",
      status: "completed",
    });
    expect(messages[1]?.contentParts?.map((part) => part.type)).toEqual([
      "thinking",
      "tool_use",
      "text",
    ]);
    expect(messages[1]?.contentParts?.at(-1)).toEqual({
      type: "text",
      text: "最终回复正文",
    });
  });

  it("仍在运行的会话即使请求压缩水合，也应保留工具过程", () => {
    const detail: AsterSessionDetail = {
      id: "session-running-history",
      created_at: 1,
      updated_at: 2,
      history_limit: 40,
      turns: [
        {
          id: "turn-running-history",
          thread_id: "session-running-history",
          prompt_text: "继续执行",
          status: "running",
          started_at: "2026-04-30T10:00:00.000Z",
          created_at: "2026-04-30T10:00:00.000Z",
          updated_at: "2026-04-30T10:00:01.000Z",
        },
      ],
      messages: [
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [
            {
              type: "tool_request",
              id: "call-running",
              tool_name: "Bash",
              arguments: { command: "sleep 1" },
            } as never,
          ],
        },
      ],
    };

    expect(shouldCompactCompletedSessionHistory(detail)).toBe(false);

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-running-history",
      { compactCompletedHistory: true },
    );

    const assistantMessage = messages.find(
      (message) => message.role === "assistant",
    );
    expect(assistantMessage?.toolCalls?.[0]).toMatchObject({
      id: "call-running",
      status: "running",
    });
    expect(
      assistantMessage?.contentParts?.some((part) => part.type === "tool_use"),
    ).toBe(true);
  });

  it("水合历史时应在保留本地可见文本的同时收敛同一工具调用的终态", () => {
    const localMessages = [
      {
        id: "local-user-tool-state",
        role: "user" as const,
        content: "请继续整理结果",
        timestamp: new Date("2026-05-12T10:00:00.000Z"),
      },
      {
        id: "local-assistant-tool-state",
        role: "assistant" as const,
        content: "本地仍在整理结果",
        contentParts: [
          {
            type: "text" as const,
            text: "本地仍在整理结果",
          },
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-state-1",
              name: "WebFetch",
              arguments: JSON.stringify({
                url: "https://example.com/article",
              }),
              status: "running" as const,
              startTime: new Date("2026-05-12T10:00:01.000Z"),
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-state-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/article",
            }),
            status: "running" as const,
            startTime: new Date("2026-05-12T10:00:01.000Z"),
          },
        ],
        timestamp: new Date("2026-05-12T10:00:02.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-tool-state",
        role: "user" as const,
        content: "请继续整理结果",
        timestamp: new Date("2026-05-12T10:00:01.000Z"),
      },
      {
        id: "local-assistant-tool-state",
        role: "assistant" as const,
        content:
          "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。",
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-state-1",
              name: "WebFetch",
              arguments: JSON.stringify({
                url: "https://example.com/article",
              }),
              status: "completed" as const,
              startTime: new Date("2026-05-12T10:00:01.000Z"),
              endTime: new Date("2026-05-12T10:00:03.000Z"),
              result: {
                success: true,
                output: "已整理完毕",
              },
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-state-1",
            name: "WebFetch",
            arguments: JSON.stringify({
              url: "https://example.com/article",
            }),
            status: "completed" as const,
            startTime: new Date("2026-05-12T10:00:01.000Z"),
            endTime: new Date("2026-05-12T10:00:03.000Z"),
            result: {
              success: true,
              output: "已整理完毕",
            },
          },
        ],
        timestamp: new Date("2026-05-12T10:00:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]?.content).toBe("本地仍在整理结果");
    expect(mergedMessages[1]?.toolCalls?.[0]).toMatchObject({
      id: "tool-state-1",
      status: "completed",
    });
    expect(mergedMessages[1]?.contentParts?.[0]).toEqual({
      type: "text",
      text: "本地仍在整理结果",
    });
    expect(
      mergedMessages[1]?.contentParts?.find(
        (part) =>
          part.type === "tool_use" && part.toolCall.id === "tool-state-1",
      ),
    ).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "tool-state-1",
        status: "completed",
      },
    });
  });

  it("分页历史消息应使用历史窗口绝对位置生成稳定 ID", () => {
    const detail: AsterSessionDetail = {
      id: "session-page",
      created_at: 1,
      updated_at: 2,
      messages_count: 100,
      history_limit: 2,
      history_offset: 40,
      history_truncated: true,
      messages: [
        {
          role: "user",
          timestamp: 1710000000,
          content: [{ type: "text", text: "更早问题" }],
        },
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [{ type: "text", text: "更早回答" }],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(detail, "session-page");

    expect(messages.map((message) => message.id)).toEqual([
      "session-page-58",
      "session-page-59",
    ]);
  });

  it("Cursor 分页历史消息应优先使用游标起始位置生成稳定 ID", () => {
    const detail: AsterSessionDetail = {
      id: "session-cursor-page",
      created_at: 1,
      updated_at: 2,
      messages_count: 100,
      history_limit: 2,
      history_offset: 40,
      history_cursor: {
        oldest_message_id: 21,
        start_index: 20,
        loaded_count: 2,
      },
      history_truncated: true,
      messages: [
        {
          role: "user",
          timestamp: 1710000000,
          content: [{ type: "text", text: "Cursor 更早问题" }],
        },
        {
          role: "assistant",
          timestamp: 1710000005,
          content: [{ type: "text", text: "Cursor 更早回答" }],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-cursor-page",
    );

    expect(messages.map((message) => message.id)).toEqual([
      "session-cursor-page-20",
      "session-cursor-page-21",
    ]);
  });

  it("应兼容 reasoning 字段的历史恢复格式", () => {
    const detail: AsterSessionDetail = {
      id: "session-2",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000100,
          content: [
            { type: "reasoning", reasoning: "先列提纲" } as never,
            { type: "reasoning", reasoning: "，再展开正文" } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(detail, "session-2");

    expect(messages[0]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先列提纲，再展开正文",
      },
    ]);
    expect(messages[0]?.thinkingContent).toBe("先列提纲，再展开正文");
  });

  it("应在历史恢复时清理 assistant 正文中的工具协议残留", () => {
    const detail: AsterSessionDetail = {
      id: "session-protocol-cleanup",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000150,
          content: [
            {
              type: "output_text",
              text: '<tool_result>{"output":"saved"}</tool_result>\n\n文章已保存为 Markdown。',
            } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-protocol-cleanup",
    );

    expect(messages[0]?.content).toBe("文章已保存为 Markdown。");
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "文章已保存为 Markdown。",
      },
    ]);
  });

  it("压缩水合时应从历史纯 JSON 图片工具输出恢复轻卡并清理提交摘要", () => {
    const imageTaskOutput = JSON.stringify({
      success: true,
      task_id: "task-history-json-image-1",
      task_type: "image_generate",
      task_family: "image",
      status: "pending_submit",
      normalized_status: "pending",
      path: ".lime/tasks/image_generate/task-history-json-image-1.json",
      absolute_path:
        "/workspace/.lime/tasks/image_generate/task-history-json-image-1.json",
      artifact_path:
        ".lime/tasks/image_generate/task-history-json-image-1.json",
      progress: {
        phase: "pending_submit",
        message: "任务已创建，等待进入队列",
      },
      record: {
        payload: {
          prompt: "青柠插画",
          count: 1,
          size: "1024x1024",
          session_id: "session-history-json-image",
        },
      },
    });
    const detail: AsterSessionDetail = {
      id: "session-history-json-image",
      created_at: 1,
      updated_at: 2,
      history_limit: 80,
      messages: [
        {
          role: "user",
          timestamp: 1710000300,
          content: [{ type: "text", text: "@配图 青柠插画" } as never],
        },
        {
          role: "assistant",
          timestamp: 1710000301,
          content: [
            {
              type: "tool_request",
              id: "tool-image-json-1",
              tool_name: "lime_create_image_generation_task",
              arguments: {
                prompt: "青柠插画",
                count: 1,
                size: "1024x1024",
              },
            } as never,
          ],
        },
        {
          role: "user",
          timestamp: 1710000302,
          content: [
            {
              type: "tool_response",
              id: "tool-image-json-1",
              output: imageTaskOutput,
              success: true,
            } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000303,
          content: [
            {
              type: "output_text",
              text: [
                "青柠插画配图任务已提交！",
                "任务类型：image_generate",
                "任务 ID：task-history-json-image-1",
                "任务文件：.lime/tasks/image_generate/task-history-json-image-1.json",
                "状态：pending_submit",
              ].join("\n"),
            } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-history-json-image",
      { compactCompletedHistory: true },
    );
    const assistant = messages.find((message) => message.role === "assistant");

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "@配图 青柠插画",
    });
    expect(assistant?.content).not.toContain("任务 ID");
    expect(assistant?.content).not.toContain("pending_submit");
    expect(assistant?.imageWorkbenchPreview).toMatchObject({
      taskId: "task-history-json-image-1",
      prompt: "青柠插画",
      status: "running",
      taskFilePath:
        "/workspace/.lime/tasks/image_generate/task-history-json-image-1.json",
      artifactPath: ".lime/tasks/image_generate/task-history-json-image-1.json",
    });
  });

  it("应从历史 assistant 消息恢复 token usage", () => {
    const detail: AsterSessionDetail = {
      id: "session-usage",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000300,
          content: [{ type: "output_text", text: "图片已经生成完成" } as never],
          usage: {
            input_tokens: 12000,
            output_tokens: 19000,
            cached_input_tokens: 4000,
            cache_creation_input_tokens: 1200,
          },
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(detail, "session-usage");

    expect(messages[0]?.usage).toEqual({
      input_tokens: 12000,
      output_tokens: 19000,
      cached_input_tokens: 4000,
      cache_creation_input_tokens: 1200,
    });
  });

  it("合并相邻 assistant 历史消息时也应保留最后一条 usage", () => {
    const detail: AsterSessionDetail = {
      id: "session-adjacent-usage",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000300,
          content: [{ type: "text", text: "帮我分析这个仓库" } as never],
        },
        {
          role: "assistant",
          timestamp: 1710000301,
          content: [
            { type: "output_text", text: "我先做一次轻量侦查。" } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000302,
          content: [
            {
              type: "output_text",
              text: "## 阶段结论\n\n已经找到关键线索。",
            } as never,
          ],
          usage: {
            input_tokens: 38483,
            output_tokens: 2406,
            cached_input_tokens: 36976,
            cache_creation_input_tokens: 0,
          },
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-adjacent-usage",
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toContain("我先做一次轻量侦查。");
    expect(messages[1]?.content).toContain("已经找到关键线索。");
    expect(messages[1]?.content).not.toContain("阶段结论");
    expect(messages[1]?.usage).toEqual({
      input_tokens: 38483,
      output_tokens: 2406,
      cached_input_tokens: 36976,
      cache_creation_input_tokens: 0,
    });
  });

  it("相邻 assistant 都带 thinking 时不应盲合并，避免跨轮思考串味", () => {
    const detail: AsterSessionDetail = {
      id: "session-adjacent-thinking",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "user",
          timestamp: 1710000300,
          content: [{ type: "text", text: "整理会议纪要" } as never],
        },
        {
          role: "assistant",
          timestamp: 1710000301,
          content: [
            { type: "thinking", text: "先整理会议纪要。" } as never,
            { type: "output_text", text: "会议纪要已整理。" } as never,
          ],
        },
        {
          role: "assistant",
          timestamp: 1710000302,
          content: [
            { type: "thinking", text: "只计算 2+2。" } as never,
            { type: "output_text", text: "2+2 等于 4。" } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-adjacent-thinking",
    );

    expect(messages).toHaveLength(3);
    expect(messages[1]?.thinkingContent).toBe("先整理会议纪要。");
    expect(messages[1]?.content).toBe("会议纪要已整理。");
    expect(messages[2]?.thinkingContent).toBe("只计算 2+2。");
    expect(messages[2]?.content).toBe("2+2 等于 4。");
  });

  it("应从历史 tool_response 恢复图片任务预览，并保留同一任务的连续 assistant 轨迹", () => {
    const detail: AsterSessionDetail = {
      id: "session-history-image-task-preview",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000400,
          content: [
            { type: "text", text: "正在生成广州塔夜景海报" } as never,
            {
              type: "tool_request",
              id: "tool-image-history-1",
              tool_name: "bash",
              arguments: {
                command:
                  'lime media image generate --prompt "广州塔夜景海报" --size 1536x1024 --count 1',
              },
            } as never,
          ],
        },
        {
          role: "tool",
          timestamp: 1710000401,
          content: [
            {
              type: "tool_response",
              id: "tool-image-history-1",
              success: true,
              output: "图片任务已提交",
              metadata: {
                task_id: "task-image-history-1",
                task_type: "image_generate",
                status: "succeeded",
                project_id: "project-history-1",
                content_id: "content-history-1",
                requested_count: 1,
                received_count: 1,
              },
            } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-history-image-task-preview",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      imageWorkbenchPreview: {
        taskId: "task-image-history-1",
        prompt: "广州塔夜景海报",
        status: "complete",
        size: "1536x1024",
        imageCount: 1,
        projectId: "project-history-1",
        contentId: "content-history-1",
      },
    });
    expect(messages[0]?.contentParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "tool_use",
          toolCall: expect.objectContaining({
            id: "tool-image-history-1",
            status: "completed",
          }),
        }),
      ]),
    );
  });

  it("应从历史 tool_response 恢复视频任务预览，并保留视频结果地址与时长信息", () => {
    const detail: AsterSessionDetail = {
      id: "session-history-video-task-preview",
      created_at: 1,
      updated_at: 2,
      messages: [
        {
          role: "assistant",
          timestamp: 1710000500,
          content: [
            { type: "text", text: "正在生成广州塔城市短片" } as never,
            {
              type: "tool_request",
              id: "tool-video-history-1",
              tool_name: "bash",
              arguments: {
                command:
                  'lime media video generate --prompt "广州塔城市短片" --duration 15 --aspect-ratio 16:9 --resolution 720p',
              },
            } as never,
          ],
        },
        {
          role: "tool",
          timestamp: 1710000501,
          content: [
            {
              type: "tool_response",
              id: "tool-video-history-1",
              success: true,
              output: "视频任务已完成",
              metadata: {
                task_id: "task-video-history-1",
                task_type: "video_generate",
                status: "succeeded",
                project_id: "project-video-history-1",
                content_id: "content-video-history-1",
                result: {
                  videos: [
                    {
                      url: "https://example.com/history-video.mp4",
                      duration_ms: 15000,
                    },
                  ],
                },
              },
            } as never,
          ],
        },
      ],
    };

    const messages = hydrateSessionDetailMessages(
      detail,
      "session-history-video-task-preview",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      taskPreview: {
        kind: "video_generate",
        taskId: "task-video-history-1",
        status: "complete",
        prompt: "广州塔城市短片",
        durationSeconds: 15,
        aspectRatio: "16:9",
        resolution: "720p",
        projectId: "project-video-history-1",
        contentId: "content-video-history-1",
        videoUrl: "https://example.com/history-video.mp4",
      },
    });
  });

  it("应从内容片段中提取合并后的 thinkingContent", () => {
    expect(
      extractThinkingContentFromParts([
        { type: "text", text: "正文" },
        { type: "thinking", text: "先想" },
        { type: "thinking", text: "后写" },
      ]),
    ).toBe("先想后写");
  });

  it("刷新会话详情时应保留本地用户消息里的图片", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "请参考这张图继续分析",
        images: [
          {
            mediaType: "image/png",
            data: "local-image-base64",
          },
        ],
        timestamp: new Date("2026-03-19T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "已收到，正在分析。",
        timestamp: new Date("2026-03-19T00:00:01.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "请参考这张图继续分析",
        timestamp: new Date("2026-03-19T00:00:02.000Z"),
      },
      {
        id: "history-assistant-1",
        role: "assistant" as const,
        content: "已收到，正在分析。",
        timestamp: new Date("2026-03-19T00:00:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]?.images).toEqual(localMessages[0]?.images);
    expect(mergedMessages[0]?.id).toBe("local-user-1");
    expect(mergedMessages[1]?.id).toBe("local-assistant-1");
    expect(mergedMessages[1]?.images).toBeUndefined();
  });

  it("刷新会话详情合并本地状态后应继续按 runtime turn 归位", () => {
    const localMessages = [
      {
        id: "local-user-turn-1",
        role: "user" as const,
        content: "第一轮问题",
        timestamp: new Date("2026-06-18T08:00:00.000Z"),
        runtimeTurnId: "turn-merge-1",
      },
      {
        id: "local-user-turn-2",
        role: "user" as const,
        content: "第二轮问题",
        images: [
          {
            mediaType: "image/png",
            data: "image-turn-2",
            sourcePath: "/tmp/turn-2.png",
          },
        ],
        timestamp: new Date("2026-06-18T08:00:02.000Z"),
        runtimeTurnId: "turn-merge-2",
      },
      {
        id: "local-assistant-turn-1",
        role: "assistant" as const,
        content: "第一轮本地过程",
        timestamp: new Date("2026-06-18T08:00:01.000Z"),
        runtimeTurnId: "turn-merge-1",
        thinkingContent: "第一轮思考",
        contentParts: [
          {
            type: "thinking" as const,
            text: "第一轮思考",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-turn-1",
        role: "user" as const,
        content: "第一轮问题",
        timestamp: new Date("2026-06-18T08:00:00.500Z"),
        runtimeTurnId: "turn-merge-1",
      },
      {
        id: "history-user-turn-2",
        role: "user" as const,
        content: "第二轮问题",
        timestamp: new Date("2026-06-18T08:00:02.500Z"),
        runtimeTurnId: "turn-merge-2",
      },
      {
        id: "history-assistant-turn-1",
        role: "assistant" as const,
        content: "第一轮回答",
        timestamp: new Date("2026-06-18T08:00:01.000Z"),
        runtimeTurnId: "turn-merge-1",
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        contentParts: [
          {
            type: "text" as const,
            text: "第一轮回答",
          },
        ],
      },
      {
        id: "history-assistant-turn-2",
        role: "assistant" as const,
        content: "第二轮回答",
        timestamp: new Date("2026-06-18T08:00:03.000Z"),
        runtimeTurnId: "turn-merge-2",
        toolCalls: [
          {
            id: "tool-turn-2",
            name: "read_file",
            arguments: '{"path":"/tmp/turn-2.png"}',
            status: "completed" as const,
            startTime: new Date("2026-06-18T08:00:02.600Z"),
            endTime: new Date("2026-06-18T08:00:02.900Z"),
            result: {
              success: true,
              output: "已读取图片",
            },
          },
        ],
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-turn-2",
              name: "read_file",
              arguments: '{"path":"/tmp/turn-2.png"}',
              status: "completed" as const,
              startTime: new Date("2026-06-18T08:00:02.600Z"),
              endTime: new Date("2026-06-18T08:00:02.900Z"),
              result: {
                success: true,
                output: "已读取图片",
              },
            },
          },
          {
            type: "text" as const,
            text: "第二轮回答",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages.map((message) => message.content)).toEqual([
      "第一轮问题",
      "第一轮本地过程",
      "第二轮问题",
      "第二轮回答",
    ]);
    expect(mergedMessages[1]).toMatchObject({
      role: "assistant",
      runtimeTurnId: "turn-merge-1",
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
      thinkingContent: "第一轮思考",
    });
    expect(mergedMessages[2]?.images?.[0]?.sourcePath).toBe("/tmp/turn-2.png");
    expect(mergedMessages[3]?.toolCalls?.[0]?.name).toBe("read_file");
  });

  it("刷新会话详情时不应把已完成输出替换成后端历史投影", () => {
    const localMessages = [
      {
        id: "local-user-output",
        role: "user" as const,
        content: "请识别这张截图",
        timestamp: new Date("2026-05-12T10:00:00.000Z"),
      },
      {
        id: "local-assistant-output",
        role: "assistant" as const,
        content: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
        contentParts: [
          {
            type: "text" as const,
            text: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
          },
        ],
        timestamp: new Date("2026-05-12T10:00:02.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-output",
        role: "user" as const,
        content: "请识别这张截图",
        timestamp: new Date("2026-05-12T10:00:03.000Z"),
      },
      {
        id: "history-assistant-output",
        role: "assistant" as const,
        content:
          "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。",
        contentParts: [
          {
            type: "text" as const,
            text: "历史消息内容过大，首屏已省略完整内容；需要时可加载完整历史查看。",
          },
        ],
        timestamp: new Date("2026-05-12T10:00:04.000Z"),
        usage: {
          input_tokens: 1200,
          output_tokens: 80,
        },
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[0]?.id).toBe("local-user-output");
    expect(mergedMessages[1]?.id).toBe("local-assistant-output");
    expect(mergedMessages[1]?.content).toBe(
      "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
    );
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: "这张截图展示了 Lime 聊天区把图片恢复成了可见缩略图。",
      },
    ]);
    expect(mergedMessages[1]?.usage).toEqual({
      input_tokens: 1200,
      output_tokens: 80,
    });
  });

  it("远端 failed runtimeStatus 应覆盖本地正在输出状态", () => {
    const localMessages = [
      {
        id: "local-user-news",
        role: "user" as const,
        content: "整理今天的国际新闻",
        timestamp: new Date("2026-06-07T09:30:00.000Z"),
      },
      {
        id: "local-assistant-news",
        role: "assistant" as const,
        content: "我会先检索多组来源并交叉核对。",
        contentParts: [
          {
            type: "text" as const,
            text: "我会先检索多组来源并交叉核对。",
          },
        ],
        toolCalls: [
          {
            id: "tool-web-search-running",
            name: "WebSearch",
            arguments: '{"query":"2026年6月7日 国际新闻"}',
            status: "running" as const,
            startTime: new Date("2026-06-07T09:30:02.000Z"),
          },
        ],
        timestamp: new Date("2026-06-07T09:30:01.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "routing" as const,
          title: "正在输出",
          detail: "正在等待模型继续输出。",
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-news",
        role: "user" as const,
        content: "整理今天的国际新闻",
        timestamp: new Date("2026-06-07T09:30:00.000Z"),
      },
      {
        id: "history-assistant-news-failed",
        role: "assistant" as const,
        content:
          "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        contentParts: [
          {
            type: "text" as const,
            text: "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
          },
        ],
        timestamp: new Date("2026-06-07T09:30:12.000Z"),
        isThinking: false,
        runtimeTurnId: "turn-news-failed",
        runtimeStatus: {
          phase: "failed" as const,
          title: "当前处理失败",
          detail:
            "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
        },
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]).toMatchObject({
      id: "local-assistant-news",
      content:
        "执行失败：Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
      isThinking: false,
      runtimeTurnId: "turn-news-failed",
      runtimeStatus: {
        phase: "failed",
        title: "当前处理失败",
      },
    });
    expect(mergedMessages[1]?.content).not.toContain("我会先检索");
    expect(mergedMessages[1]?.runtimeStatus?.detail).toContain(
      "token-plan-cn.xiaomimimo.com",
    );
    expect(mergedMessages[1]?.toolCalls?.[0]).toMatchObject({
      id: "tool-web-search-running",
      status: "failed",
      result: {
        success: false,
        error:
          "Request failed: failed to connect to token-plan-cn.xiaomimimo.com",
      },
    });
  });

  it("刷新会话详情时应保留本地用户消息的输入能力标签", () => {
    const localMessages = [
      {
        id: "local-user-skill",
        role: "user" as const,
        content: "请说明 Minimal API 的测试策略",
        timestamp: new Date("2026-05-13T03:20:00.000Z"),
        inputCapabilityRoute: {
          kind: "installed_skill" as const,
          skillKey: "aspnet-core",
          skillName: "aspnet-core",
        },
      },
      {
        id: "local-assistant-skill",
        role: "assistant" as const,
        content: "",
        timestamp: new Date("2026-05-13T03:20:01.000Z"),
        runtimeStatus: {
          phase: "preparing" as const,
          title: "正在准备回复",
          detail: "正在准备回复",
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-skill",
        role: "user" as const,
        content: "请说明 Minimal API 的测试策略",
        timestamp: new Date("2026-05-13T03:20:02.000Z"),
      },
      {
        id: "history-assistant-skill",
        role: "assistant" as const,
        content: "可以从单元测试和集成测试两层设计。",
        timestamp: new Date("2026-05-13T03:20:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]).toMatchObject({
      id: "local-user-skill",
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "aspnet-core",
        skillName: "aspnet-core",
      },
    });
  });

  it("远端只返回助手正文时仍应保留本地用户输入与 Skill 思考过程", () => {
    const localMessages = [
      {
        id: "local-analysis-user",
        role: "user" as const,
        content: "@analysis 帮我分析一下今天的国际形势",
        timestamp: new Date("2026-05-13T17:51:40.000Z"),
      },
      {
        id: "local-analysis-assistant",
        role: "assistant" as const,
        content: "# 分析结果\n\n## 结论\n国际形势分析结果。",
        timestamp: new Date("2026-05-13T17:51:42.000Z"),
        runtimeTurnId: "skill-exec-local-analysis-assistant",
        inlineProcessRetention: "skill" as const,
        thinkingContent: "先识别 analysis Skill，再组织结论。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先识别 analysis Skill，再组织结论。",
          },
          {
            type: "text" as const,
            text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-analysis-assistant",
        role: "assistant" as const,
        content: "# 分析结果\n\n## 结论\n国际形势分析结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
          },
        ],
        timestamp: new Date("2026-05-13T17:51:45.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[0]).toMatchObject({
      id: "local-analysis-user",
      role: "user",
      content: "@analysis 帮我分析一下今天的国际形势",
    });
    expect(mergedMessages[1]).toMatchObject({
      id: "local-analysis-assistant",
      role: "assistant",
      runtimeTurnId: "skill-exec-local-analysis-assistant",
      inlineProcessRetention: "skill",
      thinkingContent: "先识别 analysis Skill，再组织结论。",
    });
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先识别 analysis Skill，再组织结论。",
      },
      {
        type: "text",
        text: "# 分析结果\n\n## 结论\n国际形势分析结果。",
      },
    ]);
  });

  it("远端详情返回更新的 assistant 正文时应替换本地快照", () => {
    const localMessages = [
      {
        id: "local-user-topic",
        role: "user" as const,
        content: "继续完善上一个方案",
        timestamp: new Date("2026-04-24T10:00:00.000Z"),
      },
      {
        id: "local-assistant-topic",
        role: "assistant" as const,
        content: "这是本地快照里的最近结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "这是本地快照里的最近结果。",
          },
        ],
        timestamp: new Date("2026-04-24T10:00:02.000Z"),
      },
    ];
    const hydratedMessages = [
      {
        id: "remote-user-topic",
        role: "user" as const,
        content: "继续完善上一个方案",
        timestamp: new Date("2026-04-24T10:00:01.000Z"),
      },
      {
        id: "remote-assistant-topic",
        role: "assistant" as const,
        content: "这是远端补全后的最终结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "这是远端补全后的最终结果。",
          },
        ],
        timestamp: new Date("2026-04-24T10:00:05.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[0]?.id).toBe("local-user-topic");
    expect(mergedMessages[1]?.id).toBe("local-assistant-topic");
    expect(mergedMessages[1]?.content).toBe("这是远端补全后的最终结果。");
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: "这是远端补全后的最终结果。",
      },
    ]);
  });

  it("后端暂未返回历史时应保留本地消息，避免刷新后界面空白", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "继续刚才的任务",
        timestamp: new Date("2026-03-19T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "这是刚刚停止后的对话内容",
        timestamp: new Date("2026-03-19T00:00:01.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      [],
    );

    expect(mergedMessages).toEqual(localMessages);
  });

  it("同会话刷新详情时应保留本地 assistant 的 token usage", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "请整理成可继续编辑的文稿",
        timestamp: new Date("2026-04-07T00:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "已同步到工作区，可继续在画布里阅读、编辑和定位到对应区块。",
        timestamp: new Date("2026-04-07T00:00:01.000Z"),
        usage: {
          input_tokens: 20480,
          output_tokens: 10240,
          cached_input_tokens: 8192,
          cache_creation_input_tokens: 2048,
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "请整理成可继续编辑的文稿",
        timestamp: new Date("2026-04-07T00:00:02.000Z"),
      },
      {
        id: "history-assistant-1",
        role: "assistant" as const,
        content: "已同步到工作区，可继续在画布里阅读、编辑和定位到对应区块。",
        timestamp: new Date("2026-04-07T00:00:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]?.usage).toEqual({
      input_tokens: 20480,
      output_tokens: 10240,
      cached_input_tokens: 8192,
      cache_creation_input_tokens: 2048,
    });
  });

  it("同会话 hydrate 时远端缺失过程字段也应保留本地 assistant 执行轨迹", () => {
    const now = new Date("2026-04-08T10:00:00.000Z");
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "把文章保存到项目里",
        timestamp: new Date("2026-04-08T09:59:59.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "内容已保存到项目目录。",
        timestamp: now,
        thinkingContent: "先打开页面，再抓取正文和图片。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先打开页面，再抓取正文和图片。",
          },
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-site-1",
              name: "site_run_adapter",
              arguments: '{"url":"https://x.com/example/article/1"}',
              status: "completed" as const,
              startTime: now,
              endTime: now,
              result: {
                success: true,
                output: "saved: articles/google-cloud-tech.md",
              },
            },
          },
          {
            type: "text" as const,
            text: "内容已保存到项目目录。",
          },
        ],
        toolCalls: [
          {
            id: "tool-site-1",
            name: "site_run_adapter",
            arguments: '{"url":"https://x.com/example/article/1"}',
            status: "completed" as const,
            startTime: now,
            endTime: now,
            result: {
              success: true,
              output: "saved: articles/google-cloud-tech.md",
            },
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "把文章保存到项目里",
        timestamp: new Date("2026-04-08T10:00:01.000Z"),
      },
      {
        id: "history-assistant-1",
        role: "assistant" as const,
        content: "内容已保存到项目目录。",
        timestamp: new Date("2026-04-08T10:00:02.000Z"),
        contentParts: [
          {
            type: "text" as const,
            text: "内容已保存到项目目录。",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]?.thinkingContent).toBe(
      "先打开页面，再抓取正文和图片。",
    );
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先打开页面，再抓取正文和图片。",
      },
      {
        type: "tool_use",
        toolCall: {
          id: "tool-site-1",
          name: "site_run_adapter",
          arguments: '{"url":"https://x.com/example/article/1"}',
          status: "completed",
          startTime: now,
          endTime: now,
          result: {
            success: true,
            output: "saved: articles/google-cloud-tech.md",
          },
        },
      },
      {
        type: "text",
        text: "内容已保存到项目目录。",
      },
    ]);
    expect(mergedMessages[1]?.toolCalls?.[0]).toMatchObject({
      id: "tool-site-1",
      status: "completed",
    });
  });

  it("刷新会话详情时不应把当前流式 assistant 输出替换成远端纯正文快照", () => {
    const localMessages = [
      {
        id: "local-user-live",
        role: "user" as const,
        content: "整理 Lime 产品知识库",
        timestamp: new Date("2026-05-13T03:36:00.000Z"),
      },
      {
        id: "local-assistant-live",
        role: "assistant" as const,
        content: "这是用户已经看到的流式输出。",
        timestamp: new Date("2026-05-13T03:36:01.000Z"),
        isThinking: true,
        thinkingContent: "先盘点产品资料，再整理知识库。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先盘点产品资料，再整理知识库。",
          },
          {
            type: "text" as const,
            text: "这是用户已经看到的流式输出。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-live",
        role: "user" as const,
        content: "整理 Lime 产品知识库",
        timestamp: new Date("2026-05-13T03:36:02.000Z"),
      },
      {
        id: "history-assistant-live",
        role: "assistant" as const,
        content: "这是后端水合返回的纯正文快照。",
        contentParts: [
          {
            type: "text" as const,
            text: "这是后端水合返回的纯正文快照。",
          },
        ],
        timestamp: new Date("2026-05-13T03:36:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]).toMatchObject({
      id: "local-assistant-live",
      content: "这是用户已经看到的流式输出。",
      thinkingContent: "先盘点产品资料，再整理知识库。",
    });
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先盘点产品资料，再整理知识库。",
      },
      {
        type: "text",
        text: "这是用户已经看到的流式输出。",
      },
    ]);
  });

  it("同轮本地 assistant 已带过程时不应被远端纯正文刷新掉已显示结果", () => {
    const localMessages = [
      {
        id: "local-user-skill-output",
        role: "user" as const,
        content:
          "/brand-product-knowledge-builder 请根据现有资料整理 Lime 产品知识库并保留边界说明",
        timestamp: new Date("2026-05-13T03:37:00.000Z"),
      },
      {
        id: "local-assistant-skill-output",
        role: "assistant" as const,
        content: "本地流式完成后的产品知识库结果。",
        timestamp: new Date("2026-05-13T03:37:01.000Z"),
        isThinking: false,
        runtimeTurnId: "skill-exec-local-assistant-skill-output",
        thinkingContent: "先识别产品卖点，再输出知识库。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先识别产品卖点，再输出知识库。",
          },
          {
            type: "text" as const,
            text: "本地流式完成后的产品知识库结果。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-skill-output",
        role: "user" as const,
        content: "请根据现有资料整理 Lime 产品知识库并保留边界说明",
        timestamp: new Date("2026-05-13T03:37:02.000Z"),
      },
      {
        id: "history-assistant-skill-output",
        role: "assistant" as const,
        content: "远端会话详情里的纯正文结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "远端会话详情里的纯正文结果。",
          },
        ],
        timestamp: new Date("2026-05-13T03:37:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]).toMatchObject({
      id: "local-assistant-skill-output",
      content: "本地流式完成后的产品知识库结果。",
      runtimeTurnId: "skill-exec-local-assistant-skill-output",
      thinkingContent: "先识别产品卖点，再输出知识库。",
    });
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先识别产品卖点，再输出知识库。",
      },
      {
        type: "text",
        text: "本地流式完成后的产品知识库结果。",
      },
    ]);
  });

  it("服务型 Skill 本地过程不应被远端纯正文刷新掉", () => {
    const localMessages = [
      {
        id: "local-user-service-skill-output",
        role: "user" as const,
        content: "整理 Lime 产品知识库",
        timestamp: new Date("2026-05-13T03:38:00.000Z"),
      },
      {
        id: "local-assistant-service-skill-output",
        role: "assistant" as const,
        content: "本地服务型 Skill 完成后的产品知识库结果。",
        timestamp: new Date("2026-05-13T03:38:01.000Z"),
        isThinking: false,
        runtimeTurnId: "turn-service-skill-output",
        inlineProcessRetention: "skill" as const,
        thinkingContent: "先读取服务型 Skill，再输出知识库。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "先读取服务型 Skill，再输出知识库。",
          },
          {
            type: "text" as const,
            text: "本地服务型 Skill 完成后的产品知识库结果。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-service-skill-output",
        role: "user" as const,
        content: "整理 Lime 产品知识库",
        timestamp: new Date("2026-05-13T03:38:02.000Z"),
      },
      {
        id: "history-assistant-service-skill-output",
        role: "assistant" as const,
        content: "远端服务型 Skill 纯正文结果。",
        contentParts: [
          {
            type: "text" as const,
            text: "远端服务型 Skill 纯正文结果。",
          },
        ],
        timestamp: new Date("2026-05-13T03:38:03.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages[1]).toMatchObject({
      id: "local-assistant-service-skill-output",
      content: "本地服务型 Skill 完成后的产品知识库结果。",
      runtimeTurnId: "turn-service-skill-output",
      inlineProcessRetention: "skill",
      thinkingContent: "先读取服务型 Skill，再输出知识库。",
    });
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "thinking",
        text: "先读取服务型 Skill，再输出知识库。",
      },
      {
        type: "text",
        text: "本地服务型 Skill 完成后的产品知识库结果。",
      },
    ]);
  });

  it("hydrate 宽松匹配不应把本地 thinking 兜底到远端纯正文 assistant", () => {
    const localMessages = [
      {
        id: "local-user-thinking",
        role: "user" as const,
        content: "整理会议纪要",
        timestamp: new Date("2026-05-06T10:00:00.000Z"),
      },
      {
        id: "local-assistant-thinking",
        role: "assistant" as const,
        content: "已完成。",
        timestamp: new Date("2026-05-06T10:00:02.000Z"),
        thinkingContent: "上一轮会议纪要思考。",
        contentParts: [
          {
            type: "thinking" as const,
            text: "上一轮会议纪要思考。",
          },
          {
            type: "text" as const,
            text: "已完成。",
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-thinking",
        role: "user" as const,
        content: "另一个问题",
        timestamp: new Date("2026-05-06T10:00:03.000Z"),
      },
      {
        id: "history-assistant-thinking",
        role: "assistant" as const,
        content: "已完成。",
        timestamp: new Date("2026-05-06T10:00:04.000Z"),
        contentParts: [
          {
            type: "text" as const,
            text: "已完成。",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]?.thinkingContent).toBeUndefined();
    expect(mergedMessages[1]?.contentParts).toEqual([
      {
        type: "text",
        text: "已完成。",
      },
    ]);
  });

  it("同会话 hydrate 时远端暂未返回最新 assistant 消息也应保留本地尾部过程", () => {
    const localMessages = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "把文章保存到项目里",
        timestamp: new Date("2026-04-08T10:00:00.000Z"),
      },
      {
        id: "local-assistant-1",
        role: "assistant" as const,
        content: "内容已保存到项目目录。",
        timestamp: new Date("2026-04-08T10:00:02.000Z"),
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-site-2",
              name: "site_run_adapter",
              arguments: '{"url":"https://x.com/example/article/2"}',
              status: "completed" as const,
              startTime: new Date("2026-04-08T10:00:01.000Z"),
              endTime: new Date("2026-04-08T10:00:02.000Z"),
              result: {
                success: true,
                output: "saved: articles/google-cloud-tech-2.md",
              },
            },
          },
          {
            type: "text" as const,
            text: "内容已保存到项目目录。",
          },
        ],
        toolCalls: [
          {
            id: "tool-site-2",
            name: "site_run_adapter",
            arguments: '{"url":"https://x.com/example/article/2"}',
            status: "completed" as const,
            startTime: new Date("2026-04-08T10:00:01.000Z"),
            endTime: new Date("2026-04-08T10:00:02.000Z"),
            result: {
              success: true,
              output: "saved: articles/google-cloud-tech-2.md",
            },
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-1",
        role: "user" as const,
        content: "把文章保存到项目里",
        timestamp: new Date("2026-04-08T10:00:01.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]?.role).toBe("assistant");
    expect(
      mergedMessages[1]?.contentParts?.some(
        (part) =>
          part.type === "tool_use" && part.toolCall.id === "tool-site-2",
      ),
    ).toBe(true);
  });

  it("远端最后停在 user 且时间戳略晚时，也应保留本地 assistant 尾部", () => {
    const localMessages = [
      {
        id: "local-user-early",
        role: "user" as const,
        content: "导出这篇文章",
        timestamp: new Date("2026-04-08T10:00:00.000Z"),
      },
      {
        id: "local-assistant-early",
        role: "assistant" as const,
        content: "",
        timestamp: new Date("2026-04-08T10:00:00.500Z"),
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-site-early",
              name: "site_run_adapter",
              arguments: '{"url":"https://x.com/example/article/early"}',
              status: "completed" as const,
              startTime: new Date("2026-04-08T10:00:00.100Z"),
              endTime: new Date("2026-04-08T10:00:00.500Z"),
              result: {
                success: true,
                output: "saved: articles/example-early.md",
              },
            },
          },
        ],
        toolCalls: [
          {
            id: "tool-site-early",
            name: "site_run_adapter",
            arguments: '{"url":"https://x.com/example/article/early"}',
            status: "completed" as const,
            startTime: new Date("2026-04-08T10:00:00.100Z"),
            endTime: new Date("2026-04-08T10:00:00.500Z"),
            result: {
              success: true,
              output: "saved: articles/example-early.md",
            },
          },
        ],
      },
    ];
    const hydratedMessages = [
      {
        id: "history-user-early",
        role: "user" as const,
        content: "导出这篇文章",
        timestamp: new Date("2026-04-08T10:00:01.000Z"),
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(mergedMessages[1]?.role).toBe("assistant");
    expect(mergedMessages[1]?.toolCalls?.[0]?.id).toBe("tool-site-early");
  });

  it("同一条 hydrate assistant 缺失本地图片预览时，不应重复追加同 id 消息", () => {
    const assistantTimestamp = new Date("2026-04-23T12:00:02.000Z");
    const localMessages = [
      {
        id: "session-image-dup-0",
        role: "user" as const,
        content: "@配图 生成一张三国群像",
        timestamp: new Date("2026-04-23T12:00:00.000Z"),
      },
      {
        id: "session-image-dup-1",
        role: "assistant" as const,
        content: "图片任务已完成，共生成 1 张。",
        timestamp: assistantTimestamp,
        contentParts: [
          {
            type: "tool_use" as const,
            toolCall: {
              id: "tool-image-dup-1",
              name: "lime_create_image_generation_task",
              arguments: '{"prompt":"三国群像"}',
              status: "completed" as const,
              startTime: assistantTimestamp,
              endTime: assistantTimestamp,
              result: {
                success: true,
                output: "图片任务已完成，共生成 1 张。",
              },
            },
          },
          {
            type: "text" as const,
            text: "图片任务已完成，共生成 1 张。",
          },
        ],
        toolCalls: [
          {
            id: "tool-image-dup-1",
            name: "lime_create_image_generation_task",
            arguments: '{"prompt":"三国群像"}',
            status: "completed" as const,
            startTime: assistantTimestamp,
            endTime: assistantTimestamp,
            result: {
              success: true,
              output: "图片任务已完成，共生成 1 张。",
            },
          },
        ],
        imageWorkbenchPreview: {
          taskId: "task-image-dup-1",
          prompt: "三国群像",
          mode: "generate" as const,
          status: "complete" as const,
          imageUrl: "data:image/png;base64,dup-preview",
          imageCount: 1,
          projectId: "project-image-dup-1",
          contentId: "content-image-dup-1",
        },
      },
    ];
    const hydratedMessages = [
      {
        id: "session-image-dup-0",
        role: "user" as const,
        content: "@配图 生成一张三国群像",
        timestamp: new Date("2026-04-23T12:00:01.000Z"),
      },
      {
        id: "session-image-dup-1",
        role: "assistant" as const,
        content: "图片任务已完成，共生成 1 张。",
        timestamp: new Date("2026-04-23T12:00:03.000Z"),
        contentParts: [
          {
            type: "text" as const,
            text: "图片任务已完成，共生成 1 张。",
          },
        ],
      },
    ];

    const mergedMessages = mergeHydratedMessagesWithLocalState(
      localMessages,
      hydratedMessages,
    );

    expect(mergedMessages).toHaveLength(2);
    expect(
      mergedMessages.filter((message) => message.id === "session-image-dup-1"),
    ).toHaveLength(1);
    expect(mergedMessages[1]?.imageWorkbenchPreview).toMatchObject({
      taskId: "task-image-dup-1",
      imageUrl: "data:image/png;base64,dup-preview",
      status: "complete",
    });
  });
});
