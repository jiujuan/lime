import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import { clearAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import { handleTurnStreamEvent } from "./agentStreamRuntimeHandler";
import { clearAllAgentStreamTextOverlays } from "./agentStreamTextOverlayStore";
import { loadAgentSessionCachedSnapshot } from "./agentSessionScopedStorage";

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

describe("agentStreamRuntimeHandler storage", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockToast.info.mockReset();
    mockToast.warning.mockReset();
    clearAgentUiProjectionEvents();
    clearAllAgentStreamTextOverlays();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("Skill launch 即使未开启全局 thinking，也应保留流式思考证据", () => {
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-04-30T10:00:00.000Z"),
        isThinking: true,
        inlineProcessRetention: "skill",
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
      eventName: "agent-runtime-skill-thinking-retain-test",
      pendingTurnKey: "pending-turn",
      pendingItemKey: "pending-item",
      assistantMsgId: "assistant-1",
      activeSessionId: "session-1",
      resolvedWorkspaceId: "workspace-1",
      effectiveExecutionStrategy: "react" as const,
      surfaceThinkingDeltas: false,
      content: "/brand-product-knowledge-builder 生成资料",
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
        text: "先读取 Skill 约束。",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "text_delta",
        text: "最终回复",
      } as AgentEvent,
    });
    handleTurnStreamEvent({
      ...baseOptions,
      data: {
        type: "final_done",
      } as AgentEvent,
    });

    expect(messages[0]?.thinkingContent).toBe("先读取 Skill 约束。");
    expect(messages[0]?.content).toBe("最终回复");
    expect(messages[0]?.isThinking).toBe(false);
    expect(messages[0]?.contentParts).toEqual([
      { type: "thinking", text: "先读取 Skill 约束。" },
      { type: "text", text: "最终回复" },
    ]);
    expect(
      loadAgentSessionCachedSnapshot("workspace-1", "session-1")?.messages[0],
    ).toMatchObject({
      content: "最终回复",
      thinkingContent: "先读取 Skill 约束。",
      inlineProcessRetention: "skill",
      contentParts: [
        { type: "thinking", text: "先读取 Skill 约束。" },
        { type: "text", text: "最终回复" },
      ],
    });
  });


});
