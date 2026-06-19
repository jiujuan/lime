import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseAgentEvent,
  type AgentEvent,
  type AgentThreadItem,
} from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import {
  clearAgentUiProjectionEvents,
  conversationProjectionStore,
  selectAgentUiProjectionEvents,
} from "../projection/conversationProjectionStore";
import { handleTurnStreamEvent } from "./agentStreamRuntimeHandler";
import { AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS } from "./agentStreamTimerController";
import {
  clearAllAgentStreamTextOverlays,
  getAgentStreamTextOverlay,
} from "./agentStreamTextOverlayStore";

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

describe("agentStreamRuntimeHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockToast.info.mockReset();
    mockToast.warning.mockReset();
    clearAgentUiProjectionEvents();
    clearAllAgentStreamTextOverlays();
  });

  it("应在 reducer 边界记录标准 Agent UI projection envelope", () => {
    clearAgentUiProjectionEvents();
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };

    handleTurnStreamEvent({
      data: {
        type: "runtime_status",
        status: {
          phase: "routing",
          title: "选择模型",
          detail: "正在选择可用模型",
        },
      } as AgentEvent,
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    const projectionEvents = selectAgentUiProjectionEvents(
      conversationProjectionStore.getSnapshot(),
    );
    expect(projectionEvents).toEqual([
      expect.objectContaining({
        type: "run.status",
        sourceType: "runtime_status",
        sequence: 1,
        sessionId: "session-1",
        runId: "agent-runtime-test",
        messageId: "assistant-1",
        owner: "runtime",
        scope: "run",
        phase: "routing",
        surface: "runtime_status",
      }),
      expect.objectContaining({
        type: "metric.changed",
        sourceType: "performance_metric",
        sessionId: "session-1",
        owner: "diagnostics",
        scope: "session",
        surface: "diagnostics",
        payload: expect.objectContaining({
          metricPhase: "agentStream.firstRuntimeStatus",
          source: "agent-stream",
          metrics: expect.objectContaining({
            eventName: "agent-runtime-test",
            phase: "routing",
            title: "选择模型",
          }),
        }),
      }),
    ]);
    expect(
      (requestState as { agentUiEventSequence?: number }).agentUiEventSequence,
    ).toBe(1);
  });

  it("应把工具进度和输出增量写入 projection 与运行中工具卡", () => {
    clearAgentUiProjectionEvents();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-09T10:00:00.000Z"),
        toolCalls: [
          {
            id: "tool-1",
            name: "mcp__runner__execute",
            arguments: "{}",
            status: "running",
            startTime: new Date("2026-05-09T10:00:00.000Z"),
          },
        ],
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-1",
              name: "mcp__runner__execute",
              arguments: "{}",
              status: "running",
              startTime: new Date("2026-05-09T10:00:00.000Z"),
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
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_input_delta",
        tool_id: "tool-1",
        tool_name: "mcp__runner__execute",
        delta: '{"command"',
        accumulated_arguments: '{"command"',
        provider: "openai_compatible",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_progress",
        tool_id: "tool-1",
        progress: {
          message: "正在处理第 2 项",
          progress: 2,
          total: 4,
        },
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_output_delta",
        tool_id: "tool-1",
        delta: "partial output",
        output_kind: "log",
      } as AgentEvent,
    });

    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      arguments: '{"command"',
      progress: {
        message: "正在处理第 2 项",
        progress: 2,
        total: 4,
      },
      result: {
        success: true,
        output: "partial output",
        metadata: {
          streaming: true,
          output_kind: "log",
        },
      },
      logs: [
        '正在生成工具输入：{"command"',
        "正在处理第 2 项",
        "partial output",
      ],
    });
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      type: "tool_use",
      toolCall: {
        result: {
          output: "partial output",
        },
      },
    });

    expect(
      selectAgentUiProjectionEvents(conversationProjectionStore.getSnapshot()),
    ).toEqual([
      expect.objectContaining({
        type: "tool.args.delta",
        sourceType: "tool_input_delta",
        sequence: 1,
        toolCallId: "tool-1",
      }),
      expect.objectContaining({
        type: "tool.progress",
        sourceType: "tool_progress",
        sequence: 2,
        toolCallId: "tool-1",
      }),
      expect.objectContaining({
        type: "tool.output.delta",
        sourceType: "tool_output_delta",
        sequence: 3,
        toolCallId: "tool-1",
      }),
    ]);
  });

  it("已有 item lifecycle 时 legacy 工具增量不应新建 message.toolCalls", () => {
    clearAgentUiProjectionEvents();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-19T10:00:00.000Z"),
        runtimeTurnId: "turn-1",
      },
    ];
    let threadItems: AgentThreadItem[] = [
      {
        id: "tool-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 2,
        type: "tool_call",
        status: "in_progress",
        tool_name: "mcp__runner__execute",
        arguments: { command: "npm test" },
        metadata: {
          source: "item_lifecycle",
        },
        started_at: "2026-06-19T10:00:00.000Z",
        updated_at: "2026-06-19T10:00:00.000Z",
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: "turn-1",
      currentTurnId: "turn-1",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-item-first-delta-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>([
        ["tool-1", "mcp__runner__execute"],
      ]),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      getThreadItems: () => threadItems,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_input_delta",
        tool_id: "tool-1",
        tool_name: "mcp__runner__execute",
        turn_id: "turn-1",
        delta: '{"command":"npm test"}',
        accumulated_arguments: '{"command":"npm test"}',
        provider: "openai_compatible",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_progress",
        tool_id: "tool-1",
        turn_id: "turn-1",
        progress: {
          message: "正在执行测试",
          progress: 1,
          total: 2,
        },
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_output_delta",
        tool_id: "tool-1",
        turn_id: "turn-1",
        delta: "partial output",
        output_kind: "log",
      } as AgentEvent,
    });

    expect(messages[0]?.toolCalls).toBeUndefined();
    expect(messages[0]?.contentParts).toBeUndefined();
    expect(threadItems[0]).toMatchObject({
      id: "tool-1",
      type: "tool_call",
      status: "in_progress",
      arguments: { command: "npm test" },
      output: "partial output",
      metadata: expect.objectContaining({
        source: "item_lifecycle",
        output_kind: "log",
        streaming: true,
        progress: {
          message: "正在执行测试",
          progress: 1,
          total: 2,
        },
      }),
    });
    expect(
      selectAgentUiProjectionEvents(conversationProjectionStore.getSnapshot()),
    ).toEqual([
      expect.objectContaining({
        type: "tool.args.delta",
        sourceType: "tool_input_delta",
        toolCallId: "tool-1",
      }),
      expect.objectContaining({
        type: "tool.progress",
        sourceType: "tool_progress",
        toolCallId: "tool-1",
      }),
      expect.objectContaining({
        type: "tool.output.delta",
        sourceType: "tool_output_delta",
        toolCallId: "tool-1",
      }),
    ]);
  });

  it("已有 item lifecycle 时 App Server tool.failed 不应再改 message 层工具卡", () => {
    clearAgentUiProjectionEvents();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-09T10:00:00.000Z"),
        toolCalls: [
          {
            id: "tool-failed-1",
            name: "Bash",
            arguments: "{}",
            status: "running",
            startTime: new Date("2026-05-09T10:00:00.000Z"),
          },
        ],
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-failed-1",
              name: "Bash",
              arguments: "{}",
              status: "running",
              startTime: new Date("2026-05-09T10:00:00.000Z"),
            },
          },
        ],
      },
    ];
    let threadItems: AgentThreadItem[] = [
      {
        id: "tool-failed-1",
        thread_id: "session-1",
        turn_id: "turn-1",
        type: "tool_call",
        sequence: 1,
        status: "in_progress",
        started_at: "2026-05-09T10:00:00.000Z",
        updated_at: "2026-05-09T10:00:00.000Z",
        tool_name: "Bash",
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );
    const parsed = parseAgentEvent({
      type: "tool.failed",
      toolCallId: "tool-failed-1",
      status: "failed",
      error: "exit code 101",
      output: "test failed",
      metadata: {
        failureCategory: "test_failed",
      },
    });

    expect(parsed).toBeTruthy();
    handleTurnStreamEvent({
      data: parsed as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: "turn-1",
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>([["tool-failed-1", "Bash"]]),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      getThreadItems: () => threadItems,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      id: "tool-failed-1",
      status: "running",
    });
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "tool-failed-1",
        status: "running",
      },
    });
    expect(threadItems[0]).toMatchObject({
      id: "tool-failed-1",
      type: "tool_call",
      status: "failed",
      output: "test failed",
      error: "exit code 101",
    });
    expect(
      selectAgentUiProjectionEvents(conversationProjectionStore.getSnapshot()),
    ).toEqual([
      expect.objectContaining({
        type: "tool.failed",
        sourceType: "tool_end",
        toolCallId: "tool-failed-1",
      }),
    ]);
  });

  it("item_completed 应把已有 legacy 工具卡同步为完成态", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-18T08:00:00.000Z"),
        runtimeTurnId: "turn-1",
        toolCalls: [
          {
            id: "tool-search-1",
            name: "web_search",
            arguments: JSON.stringify({ query: "学习机评测" }),
            status: "running",
            startTime: new Date("2026-06-18T08:00:00.000Z"),
          },
        ],
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-search-1",
              name: "web_search",
              arguments: JSON.stringify({ query: "学习机评测" }),
              status: "running",
              startTime: new Date("2026-06-18T08:00:00.000Z"),
            },
          },
        ],
      },
    ];
    let threadItems: AgentThreadItem[] = [];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "item_completed",
        item: {
          id: "tool-search-1",
          thread_id: "session-1",
          turn_id: "turn-1",
          sequence: 4,
          status: "completed",
          started_at: "2026-06-18T08:00:00.000Z",
          updated_at: "2026-06-18T08:00:02.000Z",
          completed_at: "2026-06-18T08:00:02.000Z",
          type: "tool_call",
          tool_name: "web_search",
          arguments: { query: "学习机评测" },
          output: "权威评测摘要",
          success: true,
          metadata: {
            source: "item_lifecycle",
          },
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: "turn-1",
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-item-tool-sync-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      getThreadItems: () => threadItems,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(threadItems[0]).toMatchObject({
      id: "tool-search-1",
      type: "tool_call",
      status: "completed",
      output: "权威评测摘要",
    });
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      id: "tool-search-1",
      status: "completed",
      result: {
        success: true,
        output: "权威评测摘要",
      },
    });
    expect(messages[0]?.contentParts?.[0]).toMatchObject({
      type: "tool_use",
      toolCall: {
        id: "tool-search-1",
        status: "completed",
        result: {
          success: true,
          output: "权威评测摘要",
        },
      },
    });
  });

  it("收到 turn_completed 时应把 usage 写回 assistant 消息", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "图片已经生成完成",
        timestamp: new Date("2026-04-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];

    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
        usage: {
          input_tokens: 12_000,
          output_tokens: 19_000,
          cached_input_tokens: 8_000,
          cache_creation_input_tokens: 1_200,
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "图片已经生成完成",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "图片已经生成完成",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(setMessages).toHaveBeenCalled();
    expect(messages[0]).toMatchObject({
      isThinking: false,
      usage: {
        input_tokens: 12_000,
        output_tokens: 19_000,
        cached_input_tokens: 8_000,
        cache_creation_input_tokens: 1_200,
      },
    });
  });

  it("收到 turn_completed 时应保留已累积正文而不是用终态标记覆盖", () => {
    let messages: Message[] = [
      {
        id: "assistant-turn-completed",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent:
        "我先给出计划，不会直接改代码：\n<proposed_plan>\n- 确认计划模式请求进入 App Server\n- 输出 proposed_plan\n</proposed_plan>",
      queuedTurnId: "queued-news",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();
    const removeQueuedTurnState = vi.fn();
    const setThreadTurns = vi.fn(
      (value: unknown[] | ((prev: unknown[]) => unknown[])) => {
        if (typeof value === "function") {
          value([]);
        }
      },
    );
    const onComplete = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        text: "CLAW_NEWS_FIXTURE_DONE",
        usage: {
          input_tokens: 120,
          output_tokens: 24,
        },
        turn: {
          id: "turn-news",
          thread_id: "thread-news",
          prompt_text: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState,
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      observer: {
        onComplete,
      },
      eventName: "agent-runtime-turn-completed",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-turn-completed",
      activeSessionId: "session-news",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "整理今天的国际新闻",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: setThreadTurns as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(onComplete).toHaveBeenCalledWith(
      "我先给出计划，不会直接改代码：\n<proposed_plan>\n- 确认计划模式请求进入 App Server\n- 输出 proposed_plan\n</proposed_plan>",
    );
    expect(messages[0]).toMatchObject({
      content:
        "我先给出计划，不会直接改代码：\n<proposed_plan>\n- 确认计划模式请求进入 App Server\n- 输出 proposed_plan\n</proposed_plan>",
      isThinking: false,
      usage: {
        input_tokens: 120,
        output_tokens: 24,
      },
    });
    expect(requestState.accumulatedContent).toBe(
      "我先给出计划，不会直接改代码：\n<proposed_plan>\n- 确认计划模式请求进入 App Server\n- 输出 proposed_plan\n</proposed_plan>",
    );
    expect(removeQueuedTurnState).toHaveBeenCalledWith(["queued-news"]);
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("收到空 turn_completed 且没有真实产物信号时也应收起发送态并落失败态", () => {
    let messages: Message[] = [
      {
        id: "assistant-empty-turn-completed",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: "queued-empty-turn",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();
    const removeQueuedTurnState = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-empty",
          thread_id: "thread-empty",
          prompt_text: "整理今天的国际新闻",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState,
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-empty-turn-completed",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-empty-turn-completed",
      activeSessionId: "session-news",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "整理今天的国际新闻",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(messages[0]?.content).toContain("执行失败：");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      title: "当前处理失败",
      detail: "模型未输出最终答复，请重试",
    });
    expect(removeQueuedTurnState).toHaveBeenCalledWith(["queued-empty-turn"]);
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(disposeListener).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith("模型未输出最终答复，请重试");
  });

  it("收到空 turn_completed 但已有真实产物信号时应软完成而不是等待 turn_completed", () => {
    let messages: Message[] = [
      {
        id: "assistant-artifact-turn-completed",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      hasMeaningfulCompletionSignal: true,
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();
    const onComplete = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-artifact",
          thread_id: "thread-artifact",
          prompt_text: "生成代码产物",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      observer: {
        onComplete,
      },
      eventName: "agent-runtime-artifact-turn-completed",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-artifact-turn-completed",
      activeSessionId: "session-artifact",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "生成代码产物",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(onComplete).toHaveBeenCalledWith(
      "本轮执行已完成，详细过程与产物已保留在当前对话中。",
    );
    expect(messages[0]).toMatchObject({
      content: "本轮执行已完成，详细过程与产物已保留在当前对话中。",
      isThinking: false,
    });
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(disposeListener).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("首个事件就是 turn_completed 时也应收起发送态", () => {
    let messages: Message[] = [
      {
        id: "assistant-final-first",
        role: "assistant",
        content: "整理完成",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "整理完成",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-final-first",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-final-first",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "整理今天的国际新闻",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(messages[0]).toMatchObject({
      content: "整理完成",
      isThinking: false,
      runtimeStatus: undefined,
    });
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("收到 turn_canceled 时应收起发送态并保留已输出内容", () => {
    let messages: Message[] = [
      {
        id: "assistant-canceled",
        role: "assistant",
        content: "已经输出的内容",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_canceled",
        turn: {
          id: "turn-canceled",
          thread_id: "thread-news",
          prompt_text: "停止",
          status: "canceled",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "已经输出的内容",
        queuedTurnId: "queued-canceled",
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: vi.fn(),
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-turn-canceled",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-canceled",
      activeSessionId: "session-news",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "停止",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending,
    });

    expect(messages[0]).toMatchObject({
      content: "已经输出的内容",
      isThinking: false,
    });
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("陈旧 stream 的 turn_completed 不应误停新的发送态", () => {
    let messages: Message[] = [
      {
        id: "assistant-stale",
        role: "assistant",
        content: "旧请求完成",
        timestamp: new Date("2026-06-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setIsSending = vi.fn();
    const disposeListener = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "旧请求完成",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => false,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-stale-final",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-stale",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "旧请求",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(messages[0]).toMatchObject({
      content: "旧请求完成",
      isThinking: false,
      runtimeStatus: undefined,
    });
    expect(setIsSending).not.toHaveBeenCalled();
    expect(disposeListener).toHaveBeenCalledTimes(1);
  });

  it("收到完整 message 快照事件时应立即预填首屏文本", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-07T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const activateStream = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "message",
        message: {
          id: "msg-runtime-1",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "完整快照会由后续 text_delta 渲染。",
            },
          ],
          timestamp: 1777284240,
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream,
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-message-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "生成验收矩阵",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(activateStream).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(messages[0]?.content).toBe("完整快照会由后续 text_delta 渲染。");
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "完整快照会由后续 text_delta 渲染。",
      },
    ]);
  });

  it("message 快照已预填正文时后续 text_delta 重放不应重复追加", () => {
    vi.useFakeTimers();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-07T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const onTextDelta = vi.fn();
    const playTypewriterSound = vi.fn();
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound,
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      observer: {
        onTextDelta,
      },
      eventName: "agent-runtime-message-replay-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "生成验收矩阵",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "message",
        message: {
          id: "msg-runtime-1",
          role: "assistant",
          content: [{ type: "text", text: "先显示快照。" }],
          timestamp: 1777284240,
        },
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "先显示" } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "快照。" } as AgentEvent,
    });

    expect(messages[0]?.content).toBe("先显示快照。");
    expect(messages[0]?.contentParts).toEqual([
      { type: "text", text: "先显示快照。" },
    ]);
    expect(onTextDelta).not.toHaveBeenCalled();
    expect(playTypewriterSound).not.toHaveBeenCalled();

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "继续输出。" } as AgentEvent,
    });

    vi.advanceTimersByTime(AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS);

    expect(messages[0]?.content).toBe("先显示快照。");
    expect(messages[0]?.contentParts).toEqual([
      { type: "text", text: "先显示快照。" },
    ]);
    expect(getAgentStreamTextOverlay("assistant-1")?.content).toBe(
      "先显示快照。继续输出。",
    );
    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith(
      "继续输出。",
      "先显示快照。继续输出。",
    );
    expect(playTypewriterSound).toHaveBeenCalledTimes(1);
  });

  it("tool_start 前应先把已渲染文本提交到 contentParts，保持文字和工具顺序", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-29T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-interleave-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "分析一下项目",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "先分析。" } as AgentEvent,
    });
    expect(messages[0]?.contentParts).toEqual([]);

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_start",
        tool_id: "tool-1",
        tool_name: "Bash",
        arguments: JSON.stringify({ command: "pwd" }),
      } as AgentEvent,
    });

    expect(messages[0]?.content).toBe("先分析。");
    expect(messages[0]?.contentParts).toEqual([
      { type: "text", text: "先分析。" },
      expect.objectContaining({
        type: "tool_use",
        toolCall: expect.objectContaining({
          id: "tool-1",
          name: "Bash",
          status: "running",
        }),
      }),
    ]);
  });

  it("thinking 关闭时不应把 reasoning_delta 渲染进助手正文", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-30T10:00:00.000Z"),
        isThinking: true,
        contentParts: [{ type: "thinking", text: "隐藏推理" }],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const activateStream = vi.fn();
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream,
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: () => {
          throw new Error("thinking 关闭时不应追加 thinking part");
        },
      },
      eventName: "agent-runtime-thinking-disabled-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      surfaceThinkingDeltas: false,
      content: "只回复一个字：好",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "thinking_delta",
        text: "我们只：好。",
      } as AgentEvent,
    });

    expect(activateStream).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(messages[0]?.contentParts).toEqual([
      { type: "thinking", text: "隐藏推理" },
    ]);

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "text_delta",
        text: "好",
      } as AgentEvent,
    });

    expect(messages[0]?.content).toBe("");
    expect(messages[0]?.thinkingContent).toBeUndefined();
    expect(messages[0]?.contentParts).toEqual([]);
    expect(getAgentStreamTextOverlay("assistant-1")?.content).toBe("好");
  });

  it("连续 text_delta 应合并到低频渲染，避免每个字符都刷新消息树", () => {
    vi.useFakeTimers();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-30T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-text-batch-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "数数",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "1" } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "2" } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "3" } as AgentEvent,
    });

    expect(setMessages).not.toHaveBeenCalled();
    expect(messages[0]?.content).toBe("");
    expect(getAgentStreamTextOverlay("assistant-1")?.content).toBe("1");

    vi.advanceTimersByTime(AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS);

    expect(setMessages).not.toHaveBeenCalled();
    expect(messages[0]?.content).toBe("");
    expect(messages[0]?.contentParts).toEqual([]);
    expect(getAgentStreamTextOverlay("assistant-1")?.content).toBe("123");
  });

  it("图片生成轻卡应接纳模型自然 text_delta，并保留同一条消息里的预览", () => {
    let messages: Message[] = [
      {
        id: "assistant-image",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-12T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
        imageWorkbenchPreview: {
          taskId: "draft-image-1",
          prompt: "一张广州塔春天照片",
          mode: "generate",
          status: "running",
          modelName: "fal-ai/nano-banana-pro",
        },
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-image-draft-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-image",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      assistantFallbackContent: "",
      content: "@Nanobanana Pro 生成广州塔春天照片",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_start",
        tool_name: "Skill",
        tool_id: "tool-image-generate",
        arguments: JSON.stringify({ skill: "image_generate" }),
      } as AgentEvent,
    });

    expect(requestState.accumulatedContent).toBe("");
    expect(getAgentStreamTextOverlay("assistant-image")).toBeNull();

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "text_delta",
        text: "我来为你生成这张照片。",
      } as AgentEvent,
    });

    expect(requestState.accumulatedContent).toBe("我来为你生成这张照片。");
    expect(getAgentStreamTextOverlay("assistant-image")?.content).toBe(
      "我来为你生成这张照片。",
    );

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
    });

    expect(messages[0]?.content).toBe("我来为你生成这张照片。");
    expect(messages[0]?.content).not.toContain("先获取下工具参数");
    expect(messages[0]?.imageWorkbenchPreview?.taskId).toBe("draft-image-1");
    expect(messages[0]?.isThinking).toBe(false);
  });

  it("text_delta_batch 应先写入 overlay，并在 turn_completed 时一次性 reconcile 回消息", () => {
    vi.useFakeTimers();
    let messages: Message[] = [
      {
        id: "assistant-batch",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-30T10:00:00.000Z"),
        isThinking: true,
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
          parts,
      },
      eventName: "agent-runtime-text-batch-protocol-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-batch",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      content: "批量输出",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "text_delta_batch",
        text: "批量输出\n",
        chunks: ["批量", "输出", "\n"],
        boundary: "newline",
      } as AgentEvent,
    });

    expect(setMessages).not.toHaveBeenCalled();
    expect(messages[0]?.content).toBe("");
    expect(getAgentStreamTextOverlay("assistant-batch")?.content).toBe(
      "批量输出\n",
    );

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
    });

    expect(messages[0]).toMatchObject({
      content: "批量输出",
      contentParts: [{ type: "text", text: "批量输出" }],
      isThinking: false,
    });
    expect(getAgentStreamTextOverlay("assistant-batch")).toBeNull();
  });

  it("text flush 后仍应保留并继续累积 thinkingContent", () => {
    vi.useFakeTimers();
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-06T10:00:00.000Z"),
        isThinking: true,
        thinkingContent: "",
        contentParts: [],
      },
    ];
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: vi.fn(),
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (
          parts: NonNullable<Message["contentParts"]>,
          textDelta: string,
        ) => [...parts, { type: "thinking" as const, text: textDelta }],
      },
      eventName: "agent-runtime-thinking-retain-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      surfaceThinkingDeltas: true,
      content: "继续写正文",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "thinking_delta", text: "先想第一段。" } as AgentEvent,
    });

    expect(messages[0]?.thinkingContent).toBe("先想第一段。");

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "text_delta", text: "正文一" } as AgentEvent,
    });

    expect(messages[0]?.thinkingContent).toBe("先想第一段。");

    vi.advanceTimersByTime(AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS);

    expect(messages[0]?.content).toBe("");
    expect(messages[0]?.thinkingContent).toBe("先想第一段。");
    expect(getAgentStreamTextOverlay("assistant-1")?.content).toBe("正文一");

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "thinking_delta", text: "再想第二段。" } as AgentEvent,
    });

    expect(messages[0]?.thinkingContent).toBe("先想第一段。再想第二段。");
  });

  it("reasoning item_updated 应持续刷新时间线思考内容", () => {
    const setThreadItems = vi.fn();
    const activateStream = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "item_updated",
        item: {
          id: "reasoning-1",
          thread_id: "session-1",
          turn_id: "turn-1",
          sequence: 2,
          type: "reasoning",
          text: "正在持续追加推理文本",
          status: "in_progress",
          started_at: "2026-04-27T10:00:00.000Z",
          updated_at: "2026-04-27T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream,
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-reasoning-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "生成验收矩阵",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(activateStream).toHaveBeenCalledTimes(1);
    expect(setThreadItems).toHaveBeenCalledTimes(1);

    const updater = setThreadItems.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    const nextItems = typeof updater === "function" ? updater([]) : updater;
    expect(nextItems).toEqual([
      expect.objectContaining({
        id: "reasoning-1",
        type: "reasoning",
        text: "正在持续追加推理文本",
        status: "in_progress",
      }),
    ]);
  });

  it("thinking_delta 应同步生成当前 turn 的临时 reasoning 时间线项", () => {
    let threadItems: AgentThreadItem[] = [];
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );

    const requestState = {
      accumulatedContent: "",
      queuedTurnId: "turn-1",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (
          parts: NonNullable<Message["contentParts"]>,
          textDelta: string,
        ) => [...parts, { type: "thinking" as const, text: textDelta }],
      },
      eventName: "agent-runtime-thinking-timeline-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      surfaceThinkingDeltas: true,
      content: "继续",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "thinking_delta", text: "先分析。" } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: { type: "thinking_delta", text: "再查证。" } as AgentEvent,
    });

    expect(threadItems).toEqual([
      expect.objectContaining({
        id: "streamed-reasoning:turn-1:local-1",
        thread_id: "session-1",
        turn_id: "turn-1",
        sequence: 0,
        type: "reasoning",
        status: "in_progress",
        text: "先分析。再查证。",
      }),
    ]);

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "item_updated",
        item: {
          id: "reasoning-actual-1",
          thread_id: "session-1",
          turn_id: "turn-1",
          sequence: 3,
          type: "reasoning",
          text: "后端正式 reasoning。",
          status: "in_progress",
          started_at: "2026-06-17T08:00:00.000Z",
          updated_at: "2026-06-17T08:00:01.000Z",
        },
      } as AgentEvent,
    });

    expect(threadItems).toEqual([
      expect.objectContaining({
        id: "reasoning-actual-1",
        type: "reasoning",
        text: "后端正式 reasoning。",
      }),
    ]);
  });

  it("thinking 与工具交错时应按事件 sequence 分段展示", () => {
    let threadItems: AgentThreadItem[] = [];
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: "turn-ordered",
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    const baseOptions = {
      requestState,
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (
          parts: NonNullable<Message["contentParts"]>,
          textDelta: string,
        ) => [...parts, { type: "thinking" as const, text: textDelta }],
      },
      eventName: "agent-runtime-thinking-ordered-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      surfaceThinkingDeltas: true,
      content: "继续",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    };

    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "thinking_delta",
        text: "先确认目标。",
        sequence: 1,
        timestamp: "2026-06-17T08:00:01.000Z",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "tool_start",
        tool_id: "tool-1",
        tool_name: "web_search",
        arguments: JSON.stringify({ query: "资料" }),
        sequence: 2,
        timestamp: "2026-06-17T08:00:02.000Z",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "thinking_delta",
        text: "再整理结论。",
        sequence: 3,
        timestamp: "2026-06-17T08:00:03.000Z",
      } as AgentEvent,
    });

    expect(threadItems.map((item) => item.id)).toEqual([
      "streamed-reasoning:turn-ordered:1",
      "tool-1",
      "streamed-reasoning:turn-ordered:3",
    ]);
    expect(threadItems).toEqual([
      expect.objectContaining({
        id: "streamed-reasoning:turn-ordered:1",
        sequence: 1,
        status: "completed",
        text: "先确认目标。",
      }),
      expect.objectContaining({
        id: "tool-1",
        sequence: 2,
        type: "tool_call",
      }),
      expect.objectContaining({
        id: "streamed-reasoning:turn-ordered:3",
        sequence: 3,
        status: "in_progress",
        text: "再整理结论。",
      }),
    ]);
  });

  it("action_resolved 应同步收起 pending action 并回显已提交输入", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-17T08:00:00.000Z"),
        actionRequests: [
          {
            requestId: "ask-1",
            actionType: "ask_user",
            prompt: "请选择方向",
            status: "pending",
          },
        ],
        contentParts: [
          {
            type: "action_required",
            actionRequired: {
              requestId: "ask-1",
              actionType: "ask_user",
              prompt: "请选择方向",
              status: "pending",
            },
          },
        ],
      },
    ];
    let pendingActions = [
      {
        requestId: "ask-1",
        actionType: "ask_user" as const,
        prompt: "请选择方向",
        status: "pending" as const,
      },
    ];
    let threadItems: AgentThreadItem[] = [
      {
        id: "ask-1",
        thread_id: "session-1",
        turn_id: "turn-1",
        sequence: 4,
        type: "request_user_input",
        request_id: "ask-1",
        action_type: "ask_user",
        prompt: "请选择方向",
        status: "in_progress",
        started_at: "2026-06-17T08:00:04.000Z",
        updated_at: "2026-06-17T08:00:04.000Z",
      },
    ];
    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );
    const setPendingActions = vi.fn(
      (
        value:
          | typeof pendingActions
          | ((prev: typeof pendingActions) => typeof pendingActions),
      ) => {
        pendingActions =
          typeof value === "function" ? value(pendingActions) : value;
      },
    );
    const setThreadItems = vi.fn(
      (
        value:
          | AgentThreadItem[]
          | ((prev: AgentThreadItem[]) => AgentThreadItem[]),
      ) => {
        threadItems = typeof value === "function" ? value(threadItems) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "action_resolved",
        request_id: "ask-1",
        action_type: "ask_user",
        data: { answer: "极简" },
        scope: {
          session_id: "session-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
        },
        sequence: 5,
        timestamp: "2026-06-17T08:00:05.000Z",
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: "turn-1",
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-action-resolved-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "继续",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: setPendingActions as never,
      setThreadItems: setThreadItems as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(pendingActions).toEqual([]);
    expect(messages[0]?.actionRequests?.[0]).toMatchObject({
      requestId: "ask-1",
      status: "submitted",
      submittedResponse: '{"answer":"极简"}',
      submittedUserData: { answer: "极简" },
    });
    expect(
      messages[0]?.contentParts?.find(
        (part) => part.type === "action_required",
      ),
    ).toMatchObject({
      type: "action_required",
      actionRequired: {
        requestId: "ask-1",
        status: "submitted",
        submittedResponse: '{"answer":"极简"}',
      },
    });
    expect(threadItems[0]).toMatchObject({
      id: "ask-1",
      type: "request_user_input",
      status: "completed",
      response: { answer: "极简" },
    });
  });

  it("收到 turn_completed 时应剥离 assistant 正文中的工具协议残留", () => {
    let messages: Message[] = [
      {
        id: "assistant-2",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];

    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent:
          '<tool_result>{"output":"saved"}</tool_result>\n\n已保存到项目目录。',
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-2",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.content).toBe("已保存到项目目录。");
    expect(messages[0]?.contentParts).toEqual([
      { type: "text", text: "已保存到项目目录。" },
    ]);
  });

  it("收到空 turn_completed 且没有真实产物信号时应落成失败态", () => {
    let messages: Message[] = [
      {
        id: "assistant-3",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];

    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-3",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.content).toContain("执行失败：");
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      title: "当前处理失败",
      detail: "模型未输出最终答复，请重试",
    });
    expect(mockToast.error).toHaveBeenCalledWith("模型未输出最终答复，请重试");
  });

  it("站点导出在 tool_end 已登记结果时，空 turn_completed 不应误报缺少最终答复", () => {
    let messages: Message[] = [
      {
        id: "assistant-site-export",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-07T10:00:00.000Z"),
        isThinking: true,
        toolCalls: [
          {
            id: "tool-site-export-1",
            name: "site_run_adapter",
            status: "running",
            startTime: new Date("2026-04-07T10:00:00.000Z"),
          },
        ],
      },
    ];

    const requestState = {
      accumulatedContent: "",
      hasMeaningfulCompletionSignal: false,
      queuedTurnId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };

    const callbacks = {
      activateStream: () => {},
      isStreamActivated: () => true,
      clearOptimisticItem: () => {},
      clearOptimisticTurn: () => {},
      disposeListener: () => {},
      removeQueuedDraftMessages: () => {},
      clearActiveStreamIfMatch: () => true,
      upsertQueuedTurn: () => {},
      removeQueuedTurnState: () => {},
      playToolcallSound: () => {},
      playTypewriterSound: () => {},
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
    };

    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "tool_end",
        tool_id: "tool-site-export-1",
        result: {
          success: true,
          output: "exports/x-article-export/article/index.md",
          metadata: {
            tool_family: "site",
            saved_content: {
              content_id: "content-site-export-1",
              project_id: "project-site-export-1",
              markdown_relative_path:
                "exports/x-article-export/article/index.md",
            },
          },
        },
      } as AgentEvent,
      requestState,
      callbacks,
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-site-export",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>([
        ["tool-site-export-1", "site_run_adapter"],
      ]),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(requestState.hasMeaningfulCompletionSignal).toBe(true);

    handleTurnStreamEvent({
      data: {
        type: "turn_completed",
        turn: {
          id: "turn-test",
          thread_id: "thread-test",
          prompt_text: "test",
          status: "completed",
          started_at: "2026-06-07T10:00:00.000Z",
          completed_at: "2026-06-07T10:00:01.000Z",
          created_at: "2026-06-07T10:00:00.000Z",
          updated_at: "2026-06-07T10:00:01.000Z",
        },
      } as AgentEvent,
      requestState,
      callbacks,
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-site-export",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.content).toBe(
      "本轮执行已完成，详细过程与产物已保留在当前对话中。",
    );
    expect(mockToast.error).not.toHaveBeenCalledWith(
      "模型未输出最终答复，请重试",
    );
  });

  it("命中空最终答复错误但已有真实产物信号时仍应软完成", () => {
    let messages: Message[] = [
      {
        id: "assistant-site-export-error",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-07T10:00:00.000Z"),
        isThinking: true,
      },
    ];

    const setMessages = vi.fn(
      (value: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof value === "function" ? value(messages) : value;
      },
    );

    handleTurnStreamEvent({
      data: {
        type: "error",
        message:
          "已完成当前回合的工具执行，但模型未输出最终答复。\n尝试记录: site_run_adapter#tool-site-export-2:success",
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        hasMeaningfulCompletionSignal: true,
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-site-export-error",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.content).toBe(
      "本轮执行已完成，详细过程与产物已保留在当前对话中。",
    );
    expect(messages[0]?.runtimeStatus).toBeUndefined();
    expect(mockToast.error).not.toHaveBeenCalledWith(
      "模型未输出最终答复，请重试",
    );
  });

  it("provider stream 失败即使已有工具过程也应落失败态并保留过程卡", () => {
    const providerUnavailableMessage =
      "当前模型通道暂时不可用，请稍后重试；如果持续失败，请检查 Provider 状态或切换到其他可用模型。";
    let messages: Message[] = [
      {
        id: "assistant-provider-error",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-06-01T11:14:20.000Z"),
        isThinking: true,
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-search-1",
              name: "web_search",
              arguments: JSON.stringify({ query: "international news today" }),
              status: "completed",
              startTime: new Date("2026-06-01T11:14:11.000Z"),
              endTime: new Date("2026-06-01T11:14:19.000Z"),
              result: { success: true, output: "results" },
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

    handleTurnStreamEvent({
      data: {
        type: "error",
        message:
          "[AsterAgent][TTFT] provider stream request failed before body: provider=openai, model=gpt-5.5, elapsed_ms=8517, error=Server error: Server error (503 Service Unavailable): Service temporarily unavailable",
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        hasMeaningfulCompletionSignal: true,
        queuedTurnId: "queued-provider-error",
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener: () => {},
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-provider-error",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-provider-error",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(messages[0]?.content).toContain("执行失败：");
    expect(messages[0]?.contentParts).toEqual([
      expect.objectContaining({ type: "tool_use" }),
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("执行失败："),
      }),
    ]);
    expect(messages[0]?.runtimeStatus).toMatchObject({
      phase: "failed",
      detail: providerUnavailableMessage,
    });
    expect(mockToast.error).toHaveBeenCalledWith(providerUnavailableMessage);
    expect(mockToast.error).not.toHaveBeenCalledWith(
      "模型未输出最终答复，请重试",
    );
  });

  it("运行时权限确认等待错误应保留确认卡，不渲染失败正文", () => {
    const clearOptimisticItem = vi.fn();
    const clearActiveStreamIfMatch = vi.fn(() => true);
    const disposeListener = vi.fn();
    const setIsSending = vi.fn();
    let messages: Message[] = [
      {
        id: "assistant-permission-wait",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-05-07T10:00:00.000Z"),
        isThinking: true,
        actionRequests: [
          {
            requestId: "runtime_permission_confirmation:turn-1",
            actionType: "elicitation",
            prompt: "当前执行需要确认运行时权限：web_search。",
            status: "pending",
          },
        ],
        contentParts: [
          {
            type: "action_required",
            actionRequired: {
              requestId: "runtime_permission_confirmation:turn-1",
              actionType: "elicitation",
              prompt: "当前执行需要确认运行时权限：web_search。",
              status: "pending",
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

    handleTurnStreamEvent({
      data: {
        type: "error",
        message:
          "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=not_requested，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。",
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => true,
        clearOptimisticItem,
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages: () => {},
        clearActiveStreamIfMatch,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-permission-wait",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-permission-wait",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: setMessages as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: setIsSending as never,
    });

    expect(clearOptimisticItem).toHaveBeenCalledTimes(1);
    expect(clearActiveStreamIfMatch).toHaveBeenCalledWith(
      "agent-runtime-permission-wait",
    );
    expect(disposeListener).toHaveBeenCalledTimes(1);
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(messages[0]?.content).toBe("");
    expect(messages[0]?.isThinking).toBe(false);
    expect(messages[0]?.runtimeStatus).toBeUndefined();
    expect(messages[0]?.actionRequests?.[0]?.status).toBe("pending");
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("收到 queue_removed 时不应立刻清空当前 assistant 草稿", () => {
    vi.useFakeTimers();
    const disposeListener = vi.fn();
    const removeQueuedDraftMessages = vi.fn();

    handleTurnStreamEvent({
      data: {
        type: "queue_removed",
        queued_turn_id: "queued-1",
      } as AgentEvent,
      requestState: {
        accumulatedContent: "",
        queuedTurnId: "queued-1",
        queuedDraftCleanupTimerId: null,
        requestLogId: null,
        requestStartedAt: 0,
        requestFinished: false,
      },
      callbacks: {
        activateStream: () => {},
        isStreamActivated: () => false,
        clearOptimisticItem: () => {},
        clearOptimisticTurn: () => {},
        disposeListener,
        removeQueuedDraftMessages,
        clearActiveStreamIfMatch: () => true,
        upsertQueuedTurn: () => {},
        removeQueuedTurnState: () => {},
        playToolcallSound: () => {},
        playTypewriterSound: () => {},
        appendThinkingToParts: (parts) => parts,
      },
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-queue-removed",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "继续执行",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    expect(disposeListener).not.toHaveBeenCalled();
    expect(removeQueuedDraftMessages).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1799);
    expect(disposeListener).not.toHaveBeenCalled();
    expect(removeQueuedDraftMessages).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(disposeListener).toHaveBeenCalledTimes(1);
    expect(removeQueuedDraftMessages).toHaveBeenCalledTimes(1);
  });

  it("queue_removed 后若很快收到 turn_started，则不应清空 assistant 草稿", () => {
    vi.useFakeTimers();
    const disposeListener = vi.fn();
    const removeQueuedDraftMessages = vi.fn();
    const requestState = {
      accumulatedContent: "",
      queuedTurnId: "queued-1",
      queuedDraftCleanupTimerId: null,
      requestLogId: null,
      requestStartedAt: 0,
      requestFinished: false,
    };
    let activated = false;

    const baseCallbacks = {
      activateStream: () => {
        activated = true;
      },
      isStreamActivated: () => activated,
      clearOptimisticItem: () => {},
      clearOptimisticTurn: () => {},
      disposeListener,
      removeQueuedDraftMessages,
      clearActiveStreamIfMatch: () => true,
      upsertQueuedTurn: () => {},
      removeQueuedTurnState: () => {},
      playToolcallSound: () => {},
      playTypewriterSound: () => {},
      appendThinkingToParts: (parts: NonNullable<Message["contentParts"]>) =>
        parts,
    };

    handleTurnStreamEvent({
      data: {
        type: "queue_removed",
        queued_turn_id: "queued-1",
      } as AgentEvent,
      requestState,
      callbacks: baseCallbacks,
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-queue-removed",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "继续执行",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    handleTurnStreamEvent({
      data: {
        type: "turn_started",
        turn: {
          id: "turn-1",
          thread_id: "session-1",
          prompt_text: "继续执行",
          status: "running",
          started_at: "2026-04-09T08:00:00.000Z",
          created_at: "2026-04-09T08:00:00.000Z",
          updated_at: "2026-04-09T08:00:00.000Z",
        },
      } as AgentEvent,
      requestState,
      callbacks: baseCallbacks,
      eventName: "agent-runtime-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-queue-removed",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react",
      content: "继续执行",
      runtime: {} as never,
      warnedKeysRef: { current: new Set<string>() },
      actionLoggedKeys: new Set<string>(),
      toolLogIdByToolId: new Map<string, string>(),
      toolStartedAtByToolId: new Map<string, number>(),
      toolNameByToolId: new Map<string, string>(),
      setMessages: vi.fn() as never,
      setPendingActions: vi.fn() as never,
      setThreadItems: vi.fn() as never,
      setThreadTurns: vi.fn() as never,
      setCurrentTurnId: vi.fn() as never,
      setExecutionRuntime: vi.fn() as never,
      setIsSending: vi.fn() as never,
    });

    vi.advanceTimersByTime(5000);
    expect(disposeListener).not.toHaveBeenCalled();
    expect(removeQueuedDraftMessages).not.toHaveBeenCalled();
  });
});
