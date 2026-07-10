import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import type { Message } from "../types";
import type { ActiveStreamState } from "./agentStreamSubmissionLifecycle";
import {
  buildInterruptedMessageContentPatch,
  promoteQueuedAgentTurn,
  removeQueuedAgentTurn,
  resumeAgentStreamThread,
  settleInterruptedMessageProcess,
  stopActiveAgentStream,
} from "./agentStreamFlowControl";
import { hasLocallyInterruptedAgentStreamBinding } from "./agentStreamResumeBinding";
import {
  clearAllAgentStreamTextOverlays,
  getAgentStreamTextOverlay,
  upsertAgentStreamTextOverlay,
} from "./agentStreamTextOverlayStore";

function createStateSetter<T>(getValue: () => T, setValue: (value: T) => void) {
  return (next: T | ((prev: T) => T)) => {
    setValue(
      typeof next === "function" ? (next as (prev: T) => T)(getValue()) : next,
    );
  };
}

async function flushMicrotasks(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe("agentStreamFlowControl", () => {
  afterEach(() => {
    clearAllAgentStreamTextOverlays();
  });

  it("stopActiveAgentStream 应清理 optimistic 状态并刷新 read model", async () => {
    let queuedTurns: QueuedTurnSnapshot[] = [
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ];
    let threadItems: AgentThreadItem[] = [
      {
        id: "pending-item:1",
        thread_id: "session-1",
        turn_id: "pending-turn:1",
        sequence: 0,
        status: "in_progress",
        started_at: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
        type: "turn_summary",
        text: "running",
      },
    ];
    let threadTurns: AgentThreadTurn[] = [
      {
        id: "pending-turn:1",
        thread_id: "session-1",
        prompt_text: "继续执行",
        status: "running",
        started_at: "2026-03-29T00:00:00.000Z",
        created_at: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
      },
    ];
    let currentTurnId: string | null = "pending-turn:1";
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
        toolCalls: [
          {
            id: "tool-running-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "python3 news.py" }),
            status: "running",
            startTime: new Date("2026-03-29T00:00:01.000Z"),
          },
        ],
        contentParts: [
          {
            type: "tool_use",
            toolCall: {
              id: "tool-running-1",
              name: "Bash",
              arguments: JSON.stringify({ command: "python3 news.py" }),
              status: "running",
              startTime: new Date("2026-03-29T00:00:01.000Z"),
            },
          },
        ],
      },
    ];
    let activeStream = {
      assistantMsgId: "assistant-1",
      eventName: "stream-1",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
      pendingTurnKey: "pending-turn:1",
      pendingItemKey: "pending-item:1",
    };
    const removeStreamListener = vi.fn();
    const interruptTurn = vi.fn(async () => true);
    const refreshSessionReadModel = vi.fn(async () => true);
    const notify = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn,
      } as never,
      removeStreamListener,
      refreshSessionReadModel,
      setThreadItems: createStateSetter(
        () => threadItems,
        (value) => {
          threadItems = value;
        },
      ),
      setThreadTurns: createStateSetter(
        () => threadTurns,
        (value) => {
          threadTurns = value;
        },
      ),
      setCurrentTurnId: createStateSetter(
        () => currentTurnId,
        (value) => {
          currentTurnId = value;
        },
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setActiveStream: (next) => {
        activeStream = next as never;
      },
      notify,
    });

    expect(removeStreamListener).toHaveBeenCalledWith("stream-1");
    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-runtime-1",
      "stream-1",
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(queuedTurns).toEqual([
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ]);
    expect(threadItems).toEqual([]);
    expect(threadTurns).toEqual([]);
    expect(currentTurnId).toBeNull();
    expect(messages[0]?.content).toBe("(已停止)");
    expect(messages[0]?.isThinking).toBe(false);
    expect(messages[0]?.toolCalls?.[0]).toMatchObject({
      status: "failed",
      result: {
        success: false,
        output: "",
        error: "本轮已中止",
      },
    });
    const interruptedToolPart = messages[0]?.contentParts?.[0];
    expect(interruptedToolPart?.type).toBe("tool_use");
    if (interruptedToolPart?.type === "tool_use") {
      expect(interruptedToolPart.toolCall.status).toBe("failed");
      expect(interruptedToolPart.toolCall.result?.error).toBe("本轮已中止");
    }
    expect(activeStream).toBeNull();
    expect(notify.info).toHaveBeenCalledWith("已停止生成");
  });

  it("stopActiveAgentStream 不应等待 cancel 后端返回才解除 UI 停止态", async () => {
    let resolveInterrupt!: (value: boolean) => void;
    const interruptPromise = new Promise<boolean>((resolve) => {
      resolveInterrupt = resolve;
    });
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-1",
      eventName: "stream-slow-cancel",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
      pendingTurnKey: "pending-turn:1",
      pendingItemKey: "pending-item:1",
    };
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;
    const interruptTurn = vi.fn(() => interruptPromise);
    const refreshSessionReadModel = vi.fn(async () => true);
    const notify = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const stopPromise = stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn,
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel,
      setThreadItems: createStateSetter(
        () => threadItems,
        (value) => {
          threadItems = value;
        },
      ),
      setThreadTurns: createStateSetter(
        () => threadTurns,
        (value) => {
          threadTurns = value;
        },
      ),
      setCurrentTurnId: createStateSetter(
        () => currentTurnId,
        (value) => {
          currentTurnId = value;
        },
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setActiveStream: (next) => {
        activeStream = next;
      },
      notify,
    });

    await stopPromise;

    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-runtime-1",
      "stream-slow-cancel",
    );
    expect(activeStream).toBeNull();
    expect(messages[0]?.content).toBe("(已停止)");
    expect(messages[0]?.isThinking).toBe(false);
    expect(refreshSessionReadModel).not.toHaveBeenCalled();
    expect(notify.info).toHaveBeenCalledWith("已停止生成");

    resolveInterrupt(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
  });

  it("stopActiveAgentStream 对已有部分输出也应追加已停止终态", async () => {
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-partial",
      eventName: "stream-partial-cancel",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
      pendingTurnKey: "pending-turn:1",
      pendingItemKey: "pending-item:1",
    };
    let messages: Message[] = [
      {
        id: "assistant-partial",
        role: "assistant",
        content: "以下是今日国际新闻简要整理：",
        contentParts: [
          {
            type: "text",
            text: "以下是今日国际新闻简要整理：",
          },
        ],
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
      },
    ];

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn: vi.fn(async () => true),
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      setActiveStream: (next) => {
        activeStream = next;
      },
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(messages[0]?.content).toBe(
      "以下是今日国际新闻简要整理：\n\n(已停止)",
    );
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "以下是今日国际新闻简要整理：",
      },
      {
        type: "text",
        text: "(已停止)",
      },
    ]);
    expect(messages[0]?.isThinking).toBe(false);
    expect(activeStream).toBeNull();
  });

  it("stopActiveAgentStream 应清理同一 assistant 的流式正文 overlay", async () => {
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-overlay-partial",
      eventName: "stream-overlay-cancel",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
      pendingTurnKey: "pending-turn:1",
      pendingItemKey: "pending-item:1",
    };
    let messages: Message[] = [
      {
        id: "assistant-overlay-partial",
        role: "assistant",
        content: "",
        contentParts: [],
        timestamp: new Date("2026-07-10T00:00:00.000Z"),
        isThinking: true,
      },
    ];

    upsertAgentStreamTextOverlay({
      messageId: "assistant-overlay-partial",
      eventName: "stream-overlay-cancel",
      content: "以下是今日国际新闻简要整理：",
      phase: "final_answer",
    });

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn: vi.fn(async () => true),
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      setActiveStream: (next) => {
        activeStream = next;
      },
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(messages[0]?.content).toBe("(已停止)");
    expect(messages[0]?.contentParts).toEqual([
      {
        type: "text",
        text: "(已停止)",
      },
    ]);
    expect(getAgentStreamTextOverlay("assistant-overlay-partial")).toBeNull();
  });

  it("stopActiveAgentStream 应把 pending 本地停止标记绑定到真实 runtime turn", async () => {
    let threadItems: AgentThreadItem[] = [
      {
        id: "pending-item:cancel",
        thread_id: "session-1",
        turn_id: "pending-turn:cancel",
        sequence: 0,
        status: "in_progress",
        started_at: "2026-07-10T00:00:00.000Z",
        updated_at: "2026-07-10T00:00:00.000Z",
        type: "turn_summary",
        text: "正在生成回复",
      },
      {
        id: "item-real-cancel",
        thread_id: "session-1",
        turn_id: "turn-real-cancel",
        sequence: 1,
        status: "in_progress",
        started_at: "2026-07-10T00:00:01.000Z",
        updated_at: "2026-07-10T00:00:01.000Z",
        type: "agent_message",
        text: "以下是今日国际新闻简要整理：",
      },
    ];
    let threadTurns: AgentThreadTurn[] = [
      {
        id: "pending-turn:cancel",
        thread_id: "session-1",
        prompt_text: "整理今天的国际新闻",
        status: "running",
        started_at: "2026-07-10T00:00:00.000Z",
        created_at: "2026-07-10T00:00:00.000Z",
        updated_at: "2026-07-10T00:00:00.000Z",
      },
    ];
    let currentTurnId: string | null = "pending-turn:cancel";
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-cancel",
      eventName: "stream-real-turn-cancel",
      sessionId: "session-1",
      pendingTurnKey: "pending-turn:cancel",
      pendingItemKey: "pending-item:cancel",
    };
    let messages: Message[] = [
      {
        id: "assistant-cancel",
        role: "assistant",
        content: "以下是今日国际新闻简要整理：",
        contentParts: [
          {
            type: "text",
            text: "以下是今日国际新闻简要整理：",
          },
        ],
        timestamp: new Date("2026-07-10T00:00:01.000Z"),
        isThinking: true,
        runtimeTurnId: "pending-turn:cancel",
      },
    ];
    const interruptTurn = vi.fn(async () => true);
    upsertAgentStreamTextOverlay({
      messageId: "assistant-cancel",
      eventName: "stream-real-turn-cancel",
      content: "以下是今日国际新闻简要整理：",
      turnId: "turn-real-cancel",
    });

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn,
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => threadItems,
        (value) => {
          threadItems = value;
        },
      ),
      setThreadTurns: createStateSetter(
        () => threadTurns,
        (value) => {
          threadTurns = value;
        },
      ),
      setCurrentTurnId: createStateSetter(
        () => currentTurnId,
        (value) => {
          currentTurnId = value;
        },
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      getThreadItems: () => threadItems,
      setActiveStream: (next) => {
        activeStream = next;
      },
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(getAgentStreamTextOverlay("assistant-cancel")).toBeNull();
    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-real-cancel",
      "stream-real-turn-cancel",
    );
    expect(threadItems.map((item) => item.id)).toEqual(["item-real-cancel"]);
    expect(threadItems[0]).toMatchObject({
      type: "agent_message",
      text: "以下是今日国际新闻简要整理：\n\n(已停止)",
      contentParts: [
        {
          type: "text",
          text: "(已停止)",
        },
      ],
    });
    expect(threadTurns).toEqual([]);
    expect(currentTurnId).toBeNull();
    expect(messages[0]).toMatchObject({
      content: "以下是今日国际新闻简要整理：\n\n(已停止)",
      isThinking: false,
      runtimeTurnId: "turn-real-cancel",
      runtimeStatus: undefined,
    });
    expect(
      messages[0]?.contentParts?.some(
        (part) => part.type === "text" && part.text === "(已停止)",
      ),
    ).toBe(true);
    expect(activeStream).toBeNull();
  });

  it("buildInterruptedMessageContentPatch 已有停止标记时应保持幂等", () => {
    const patch = buildInterruptedMessageContentPatch({
      id: "assistant-already-stopped",
      role: "assistant",
      content: "已输出\n\n(已停止)",
      contentParts: [
        {
          type: "text",
          text: "已输出",
        },
        {
          type: "text",
          text: "(已停止)",
        },
      ],
      timestamp: new Date("2026-03-29T00:00:00.000Z"),
    });

    expect(patch.content).toBe("已输出\n\n(已停止)");
    expect(patch.contentParts).toEqual([
      {
        type: "text",
        text: "已输出",
      },
      {
        type: "text",
        text: "(已停止)",
      },
    ]);
  });

  it("stopActiveAgentStream 应把 output-free 中断输入恢复为富输入请求", async () => {
    const image = {
      data: "image-data",
      mediaType: "image/png",
    };
    const pathReference = {
      id: "file:/tmp/report.md",
      path: "/tmp/report.md",
      name: "report.md",
      isDir: false,
      source: "file_manager" as const,
    };
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-thinking",
      eventName: "stream-restore",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
      submittedDraft: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
    };
    const onRestoreInterruptedInput = vi.fn();
    const restoreOrder: string[] = [];
    let resolveRefresh!: (value: boolean) => void;
    const refreshDone = new Promise<boolean>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshSessionReadModel = vi.fn(() => {
      restoreOrder.push("refresh");
      return refreshDone;
    });
    onRestoreInterruptedInput.mockImplementation(() => {
      restoreOrder.push("restore");
    });

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn: vi.fn(async () => true),
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel,
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => [] as Message[],
        () => undefined,
      ),
      getMessages: () => [
        {
          id: "assistant-thinking",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-03-29T00:00:00.000Z"),
          contentParts: [{ type: "thinking", text: "正在思考" }],
        },
      ],
      setActiveStream: (next) => {
        activeStream = next;
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(activeStream).toBeNull();
    expect(onRestoreInterruptedInput).toHaveBeenCalledWith({
      requestId: expect.any(String),
      reason: "thinking_only_cancelled_turn",
      draft: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        textElements: [],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
    });
    expect(restoreOrder[0]).toBe("restore");

    await flushMicrotasks();
    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(restoreOrder).toEqual(["restore", "refresh"]);

    resolveRefresh(true);
    await flushMicrotasks();

    expect(onRestoreInterruptedInput).toHaveBeenCalledTimes(1);
  });

  it("stopActiveAgentStream 在 active stream 尚无草稿时应使用提交兜底草稿", async () => {
    const image = {
      data: "image-data",
      mediaType: "image/png",
    };
    const pathReference = {
      id: "file:/tmp/report.md",
      path: "/tmp/report.md",
      name: "report.md",
      isDir: false,
      source: "file_manager" as const,
    };
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-thinking",
      eventName: "stream-restore-before-active-draft",
      sessionId: "session-1",
      turnId: "turn-runtime-1",
    };
    const onRestoreInterruptedInput = vi.fn();

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn: vi.fn(async () => true),
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => [] as Message[],
        () => undefined,
      ),
      getMessages: () => [
        {
          id: "assistant-thinking",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-03-29T00:00:00.000Z"),
          isThinking: true,
        },
      ],
      setActiveStream: (next) => {
        activeStream = next;
      },
      submittedDraftFallback: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(activeStream).toBeNull();
    expect(onRestoreInterruptedInput).toHaveBeenCalledWith({
      requestId: expect.any(String),
      reason: "thinking_only_cancelled_turn",
      draft: {
        text: "继续生成提纲",
        images: [image],
        pathReferences: [pathReference],
        textElements: [],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "draft",
          skillName: "起草",
        },
      },
    });
  });

  it("stopActiveAgentStream 只有 provider/runtime 过程态时仍应恢复富输入", async () => {
    const image = {
      data: "image-data",
      mediaType: "image/png",
      sourcePath: "/tmp/rich-restore-fixture.png",
    };
    const pathReference = {
      id: "file:/tmp/clawstream-rich-restore-fixture.md",
      path: "/tmp/clawstream-rich-restore-fixture.md",
      name: "clawstream-rich-restore-fixture.md",
      isDir: false,
      source: "file_manager" as const,
    };
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-runtime-status",
      eventName: "stream-provider-trace-only",
      sessionId: "session-rich-restore",
      turnId: "turn-provider-trace-only",
      pendingTurnKey: "pending-turn:provider-trace-only",
      pendingItemKey: "pending-item:provider-trace-only",
      submittedDraft: {
        text: "请结合这个截图、文件和 Capability Report 技能，先不要输出正文。",
        images: [image],
        pathReferences: [pathReference],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    };
    const onRestoreInterruptedInput = vi.fn();

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-rich-restore" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn: vi.fn(async () => true),
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => "pending-turn:provider-trace-only" as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => [] as Message[],
        () => undefined,
      ),
      getMessages: () => [
        {
          id: "assistant-runtime-status",
          role: "assistant",
          content: "正在生成回复",
          timestamp: new Date("2026-03-29T00:00:00.000Z"),
          isThinking: true,
          contentParts: [],
          runtimeStatus: {
            phase: "preparing",
            title: "正在生成回复",
            detail: "正在输出",
            checkpoints: ["provider.request.started"],
          },
        },
      ],
      setActiveStream: (next) => {
        activeStream = next;
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(activeStream).toBeNull();
    expect(onRestoreInterruptedInput).toHaveBeenCalledWith({
      requestId: expect.any(String),
      reason: "thinking_only_cancelled_turn",
      draft: {
        text: "请结合这个截图、文件和 Capability Report 技能，先不要输出正文。",
        images: [image],
        pathReferences: [pathReference],
        textElements: [],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    });
  });

  it("stopActiveAgentStream 有 active 输出和 queued rich input 时应恢复 queued draft 且不本地裁剪队列", async () => {
    let queuedTurns: QueuedTurnSnapshot[] = [
      {
        queued_turn_id: "queued-rich",
        message_preview: "/capability-report queued",
        message_text: "/capability-report queued",
        created_at: 1,
        image_count: 1,
        position: 1,
        input_attachments: [
          {
            kind: "image",
            uri: "data:image/png;base64,aW1hZ2U=",
            metadata: {
              mediaType: "image/png",
              sourcePath: "/tmp/queued.png",
            },
          },
        ],
        path_references: [
          {
            id: "file:/project/report.md",
            path: "/project/report.md",
            name: "report.md",
            isDir: false,
            source: "file_manager",
          },
        ],
        text_elements: [
          {
            type: "text",
            text: "queued rich prompt",
          },
        ],
        input_capability_route: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    ];
    let messages: Message[] = [
      {
        id: "assistant-visible",
        role: "assistant",
        content: "active output should remain visible",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-visible",
      eventName: "stream-pending-steer",
      sessionId: "session-1",
      turnId: "turn-active",
      submittedDraft: {
        text: "active prompt",
      },
    };
    const interruptTurn = vi.fn(async () => true);
    const removeQueuedTurn = vi.fn(async () => true);
    const onRestoreInterruptedInput = vi.fn();

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn,
        removeQueuedTurn,
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      getQueuedTurns: () => queuedTurns,
      setActiveStream: (next) => {
        activeStream = next;
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(activeStream).toBeNull();
    expect(queuedTurns).toEqual([
      expect.objectContaining({
        queued_turn_id: "queued-rich",
        position: 1,
      }),
    ]);
    expect(messages[0]).toMatchObject({
      content: "active output should remain visible\n\n(已停止)",
      isThinking: false,
      runtimeStatus: undefined,
    });
    expect(onRestoreInterruptedInput).toHaveBeenCalledTimes(1);
    expect(onRestoreInterruptedInput.mock.calls[0]?.[0]).toMatchObject({
      requestId: expect.any(String),
      reason: "queued_turn_restored_after_interrupt",
      draft: {
        text: "queued rich prompt",
        images: [
          {
            data: "aW1hZ2U=",
            mediaType: "image/png",
            sourceUri: "data:image/png;base64,aW1hZ2U=",
            sourcePath: "/tmp/queued.png",
          },
        ],
        pathReferences: [
          {
            id: "file:/project/report.md",
            path: "/project/report.md",
            name: "report.md",
            isDir: false,
            source: "file_manager",
          },
        ],
        textElements: [
          {
            type: "text",
            text: "queued rich prompt",
          },
        ],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    });

    await flushMicrotasks();
    expect(removeQueuedTurn).toHaveBeenCalledWith("session-1", "queued-rich");
    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-active",
      "stream-pending-steer",
    );
  });

  it("stopActiveAgentStream 恢复 queued turn 时不应再把 queued turn 当 active turn 取消", async () => {
    let queuedTurns: QueuedTurnSnapshot[] = [
      {
        queued_turn_id: "queued-rich",
        message_preview: "/capability-report queued rich prompt",
        message_text: "queued rich prompt",
        created_at: Date.now(),
        image_count: 0,
        position: 0,
        text_elements: [
          {
            type: "text",
            text: "queued rich prompt",
          },
        ],
      },
    ];
    let messages: Message[] = [
      {
        id: "assistant-visible",
        role: "assistant",
        content: "active output should remain visible",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-visible",
      eventName: "stream-pending-steer",
      sessionId: "session-1",
      turnId: "queued-rich",
      submittedDraft: {
        text: "active prompt",
      },
    };
    const interruptTurn = vi.fn(async () => true);
    const removeQueuedTurn = vi.fn(async () => true);
    const onRestoreInterruptedInput = vi.fn();

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel: vi.fn(async () => ({ queued_turns: [] })),
        interruptTurn,
        removeQueuedTurn,
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      getQueuedTurns: () => queuedTurns,
      setActiveStream: (next) => {
        activeStream = next;
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    await flushMicrotasks();
    expect(removeQueuedTurn).toHaveBeenCalledWith("session-1", "queued-rich");
    expect(interruptTurn).not.toHaveBeenCalled();
    expect(onRestoreInterruptedInput).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "queued_turn_restored_after_interrupt",
        draft: expect.objectContaining({
          text: "queued rich prompt",
        }),
      }),
    );
  });

  it("stopActiveAgentStream 本地队列未同步时应从 read model 恢复 queued rich draft", async () => {
    let messages: Message[] = [
      {
        id: "assistant-visible",
        role: "assistant",
        content: "active output should remain visible",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
      },
    ];
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-visible",
      eventName: "stream-pending-steer-stale-local",
      sessionId: "session-1",
      turnId: "turn-active",
      submittedDraft: {
        text: "active prompt",
      },
    };
    const interruptTurn = vi.fn(async () => true);
    const removeQueuedTurn = vi.fn(async () => true);
    const getSessionReadModel = vi.fn(async () => ({
      detail: {
        thread_read: {
          queued_turns: [
            {
              queued_turn_id: "queued-rich-read-model",
              message_preview: "/capability-report queued",
              message_text: "/capability-report queued",
              created_at: 1,
              image_count: 1,
              position: 1,
              input_attachments: [
                {
                  kind: "image",
                  uri: "data:image/png;base64,aW1hZ2U=",
                  metadata: {
                    mediaType: "image/png",
                    sourcePath: "/tmp/queued.png",
                  },
                },
              ],
              path_references: [
                {
                  id: "file:/project/report.md",
                  path: "/project/report.md",
                  name: "report.md",
                  isDir: false,
                  source: "file_manager",
                },
              ],
              text_elements: [
                {
                  type: "text",
                  text: "queued rich prompt from read model",
                },
              ],
              input_capability_route: {
                kind: "installed_skill",
                skillKey: "capability-report",
                skillName: "Capability Report",
              },
            },
          ],
        },
      },
    }));
    const onRestoreInterruptedInput = vi.fn();

    await stopActiveAgentStream({
      activeStream,
      sessionIdRef: { current: "session-1" },
      runtime: {
        getSessionReadModel,
        interruptTurn,
        removeQueuedTurn,
      } as never,
      removeStreamListener: vi.fn(),
      refreshSessionReadModel: vi.fn(async () => true),
      setThreadItems: createStateSetter(
        () => [] as AgentThreadItem[],
        () => undefined,
      ),
      setThreadTurns: createStateSetter(
        () => [] as AgentThreadTurn[],
        () => undefined,
      ),
      setCurrentTurnId: createStateSetter(
        () => null as string | null,
        () => undefined,
      ),
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      getMessages: () => messages,
      getQueuedTurns: () => [],
      setActiveStream: (next) => {
        activeStream = next;
      },
      onRestoreInterruptedInput,
      notify: {
        info: vi.fn(),
        error: vi.fn(),
      },
    });

    expect(getSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(activeStream).toBeNull();
    expect(
      hasLocallyInterruptedAgentStreamBinding({
        eventName: "agentSession/event/session-1",
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-active",
      }),
    ).toBe(true);
    expect(onRestoreInterruptedInput).toHaveBeenCalledTimes(1);
    expect(onRestoreInterruptedInput.mock.calls[0]?.[0]).toMatchObject({
      requestId: expect.any(String),
      reason: "queued_turn_restored_after_interrupt",
      draft: {
        text: "queued rich prompt from read model",
        images: [
          {
            data: "aW1hZ2U=",
            mediaType: "image/png",
            sourceUri: "data:image/png;base64,aW1hZ2U=",
            sourcePath: "/tmp/queued.png",
          },
        ],
        pathReferences: [
          {
            id: "file:/project/report.md",
            path: "/project/report.md",
            name: "report.md",
            isDir: false,
            source: "file_manager",
          },
        ],
        textElements: [
          {
            type: "text",
            text: "queued rich prompt from read model",
          },
        ],
        inputCapabilityRoute: {
          kind: "installed_skill",
          skillKey: "capability-report",
          skillName: "Capability Report",
        },
      },
    });

    await flushMicrotasks();
    expect(removeQueuedTurn).toHaveBeenCalledWith(
      "session-1",
      "queued-rich-read-model",
    );
    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-active",
      "stream-pending-steer-stale-local",
    );
  });

  it("settleInterruptedMessageProcess 应把运行中工具标记为本轮已中止", () => {
    const message = settleInterruptedMessageProcess({
      id: "assistant-with-running-tool",
      role: "assistant",
      content: "已完成部分整理",
      timestamp: new Date("2026-03-29T00:00:00.000Z"),
      toolCalls: [
        {
          id: "tool-running-1",
          name: "Bash",
          arguments: JSON.stringify({ command: "python3 news.py" }),
          status: "running",
          startTime: new Date("2026-03-29T00:00:01.000Z"),
        },
        {
          id: "tool-completed-1",
          name: "WebSearch",
          arguments: JSON.stringify({ query: "world news" }),
          status: "completed",
          result: {
            success: true,
            output: "已找到 3 条来源",
          },
          startTime: new Date("2026-03-29T00:00:02.000Z"),
          endTime: new Date("2026-03-29T00:00:03.000Z"),
        },
      ],
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "tool-running-1",
            name: "Bash",
            arguments: JSON.stringify({ command: "python3 news.py" }),
            status: "running",
            startTime: new Date("2026-03-29T00:00:01.000Z"),
          },
        },
      ],
    });

    expect(message.toolCalls?.[0]).toMatchObject({
      id: "tool-running-1",
      status: "failed",
      result: {
        success: false,
        output: "",
        error: "本轮已中止",
      },
    });
    expect(message.toolCalls?.[0]?.endTime).toBeInstanceOf(Date);
    expect(message.toolCalls?.[1]).toMatchObject({
      id: "tool-completed-1",
      status: "completed",
      result: {
        success: true,
        output: "已找到 3 条来源",
      },
    });
    const toolPart = message.contentParts?.[0];
    expect(toolPart?.type).toBe("tool_use");
    if (toolPart?.type === "tool_use") {
      expect(toolPart.toolCall).toMatchObject({
        id: "tool-running-1",
        status: "failed",
        result: {
          error: "本轮已中止",
        },
      });
    }
  });

  it("promoteQueuedAgentTurn 应通过 current promote/cancel/resume 一键切换排队任务", async () => {
    let queuedTurns: QueuedTurnSnapshot[] = [
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ];
    let threadItems: AgentThreadItem[] = [
      {
        id: "pending-item:1",
        thread_id: "session-1",
        turn_id: "pending-turn:1",
        sequence: 0,
        status: "in_progress",
        started_at: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
        type: "turn_summary",
        text: "running",
      },
    ];
    let threadTurns: AgentThreadTurn[] = [
      {
        id: "pending-turn:1",
        thread_id: "session-1",
        prompt_text: "继续执行",
        status: "running",
        started_at: "2026-03-29T00:00:00.000Z",
        created_at: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
      },
    ];
    let currentTurnId: string | null = "pending-turn:1";
    let messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "已有部分输出",
        timestamp: new Date("2026-03-29T00:00:00.000Z"),
        isThinking: true,
        runtimeStatus: {
          phase: "routing",
          title: "处理中",
          detail: "当前前台流仍在执行",
          checkpoints: [],
        },
      },
    ];
    let activeStream: ActiveStreamState | null = {
      assistantMsgId: "assistant-1",
      eventName: "stream-1",
      sessionId: "session-1",
      turnId: "queued-2",
      pendingTurnKey: "pending-turn:1",
      pendingItemKey: "pending-item:1",
    };
    const refreshSessionReadModel = vi.fn(async () => true);
    const getSessionReadModel = vi.fn(async () => ({
      thread_id: "session-1",
      active_turn_id: "queued-2",
      queued_turns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "preview",
          message_text: "text",
          created_at: 1,
          image_count: 0,
          position: 1,
        },
        {
          queued_turn_id: "queued-2",
          message_preview: "second",
          message_text: "second",
          created_at: 2,
          image_count: 0,
          position: 2,
        },
      ],
      turns: [
        {
          turn_id: "turn-active-1",
          status: "running",
          native_status: "running",
        },
        {
          turn_id: "queued-2",
          status: "running",
          native_status: "queued",
        },
      ],
    }));
    const interruptTurn = vi.fn(async () => true);
    const promoteQueuedTurn = vi.fn(async () => true);
    const resumeThread = vi.fn(async () => true);
    const removeStreamListener = vi.fn(() => true);
    const notify = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await expect(
      promoteQueuedAgentTurn({
        runtime: {
          getSessionReadModel,
          interruptTurn,
          promoteQueuedTurn,
          resumeThread,
        },
        queuedTurnId: "queued-1",
        activeStream,
        removeStreamListener,
        sessionIdRef: { current: "session-1" },
        refreshSessionReadModel,
        setThreadItems: createStateSetter(
          () => threadItems,
          (value) => {
            threadItems = value;
          },
        ),
        setThreadTurns: createStateSetter(
          () => threadTurns,
          (value) => {
            threadTurns = value;
          },
        ),
        setCurrentTurnId: createStateSetter(
          () => currentTurnId,
          (value) => {
            currentTurnId = value;
          },
        ),
        setMessages: createStateSetter(
          () => messages,
          (value) => {
            messages = value;
          },
        ),
        setActiveStream: (nextActive) => {
          activeStream = nextActive;
        },
        notify,
      }),
    ).resolves.toBe(true);

    expect(removeStreamListener).toHaveBeenCalledWith("stream-1");
    expect(promoteQueuedTurn).toHaveBeenCalledWith("session-1", "queued-1");
    expect(getSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(interruptTurn).toHaveBeenCalledWith(
      "session-1",
      "turn-active-1",
      undefined,
    );
    expect(resumeThread).toHaveBeenCalledWith("session-1");
    expect(promoteQueuedTurn.mock.invocationCallOrder[0]).toBeLessThan(
      interruptTurn.mock.invocationCallOrder[0],
    );
    expect(interruptTurn.mock.invocationCallOrder[0]).toBeLessThan(
      resumeThread.mock.invocationCallOrder[0],
    );
    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(queuedTurns).toEqual([
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ]);
    expect(threadItems).toEqual([]);
    expect(threadTurns).toEqual([]);
    expect(currentTurnId).toBeNull();
    expect(activeStream).toBeNull();
    expect(messages).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        content: "已有部分输出",
        isThinking: false,
        runtimeStatus: undefined,
      }),
    ]);
    expect(notify.info).toHaveBeenCalledWith("正在切换到该排队任务");
  });

  it("removeQueuedAgentTurn / promoteQueuedAgentTurn / resumeAgentStreamThread 应刷新 read model", async () => {
    let queuedTurns: QueuedTurnSnapshot[] = [
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ];
    const refreshSessionReadModel = vi.fn(async () => true);
    const notify = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const sessionIdRef = { current: "session-1" };

    await expect(
      removeQueuedAgentTurn({
        runtime: {
          removeQueuedTurn: vi.fn(async () => true),
        },
        queuedTurnId: "queued-1",
        sessionIdRef,
        refreshSessionReadModel,
        notify,
      }),
    ).resolves.toBe(true);
    expect(queuedTurns).toEqual([
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ]);

    queuedTurns = [
      {
        queued_turn_id: "queued-1",
        message_preview: "preview",
        message_text: "text",
        created_at: 1,
        image_count: 0,
        position: 1,
      },
    ];
    await expect(
      promoteQueuedAgentTurn({
        runtime: {
          getSessionReadModel: vi.fn(async () => ({
            thread_id: "session-1",
            queued_turns: [
              {
                queued_turn_id: "queued-1",
                message_preview: "preview",
                message_text: "text",
                created_at: 1,
                image_count: 0,
                position: 1,
              },
            ],
            turns: [],
          })),
          interruptTurn: vi.fn(async () => true),
          promoteQueuedTurn: vi.fn(async () => true),
          resumeThread: vi.fn(async () => true),
        },
        queuedTurnId: "queued-1",
        activeStream: null,
        removeStreamListener: vi.fn(() => true),
        sessionIdRef,
        refreshSessionReadModel,
        setThreadItems: createStateSetter(
          () => [] as AgentThreadItem[],
          () => undefined,
        ),
        setThreadTurns: createStateSetter(
          () => [] as AgentThreadTurn[],
          () => undefined,
        ),
        setCurrentTurnId: createStateSetter(
          () => null as string | null,
          () => undefined,
        ),
        setMessages: createStateSetter(
          () => [] as Message[],
          () => undefined,
        ),
        setActiveStream: () => undefined,
        notify,
      }),
    ).resolves.toBe(true);
    expect(notify.info).toHaveBeenCalledWith("正在切换到该排队任务");

    await expect(
      resumeAgentStreamThread({
        runtime: {
          resumeThread: vi.fn(async () => true),
        },
        sessionIdRef,
        refreshSessionReadModel,
        notify,
      }),
    ).resolves.toBe(true);
    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(notify.info).toHaveBeenCalledWith("正在恢复排队执行");
  });
});
