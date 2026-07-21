import { describe, expect, it } from "vitest";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import { buildWaitingAgentRuntimeStatus } from "../utils/agentRuntimeStatus";
import {
  createAgentStreamSubmissionLifecycle,
  type ActiveStreamState,
} from "./agentStreamSubmissionLifecycle";

function createStateSetter<T>(getValue: () => T, setValue: (value: T) => void) {
  return (next: T | ((prev: T) => T)) => {
    setValue(
      typeof next === "function" ? (next as (prev: T) => T)(getValue()) : next,
    );
  };
}

describe("agentStreamSubmissionLifecycle", () => {
  it("应在 canonical start 判定后注入 optimistic turn/item", () => {
    const assistantMsg: Message = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
    };

    let activeStream: ActiveStreamState | null = null;
    let messages: Message[] = [assistantMsg];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;

    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: "user-1",
      content: "继续生成",
      listenerMapRef: { current: new Map() },
      setActiveStream: (next) => {
        activeStream = next;
      },
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    expect(threadTurns).toHaveLength(0);
    expect(threadItems).toHaveLength(0);
    expect(currentTurnId).toBeNull();

    const runtimeStatus = buildWaitingAgentRuntimeStatus({
      executionStrategy: "react",
    });
    lifecycle.activateStream("session-1", runtimeStatus, "thread-1");

    expect(activeStream).toEqual({
      assistantMsgId: "assistant-1",
      eventName: lifecycle.eventName,
      sessionId: "session-1",
      pendingTurnKey: lifecycle.pendingTurnKey,
      pendingItemKey: lifecycle.pendingItemKey,
      submittedDraft: null,
    });
    expect(messages[0]?.runtimeStatus).toEqual(runtimeStatus);
    expect(threadTurns[0]?.thread_id).toBe("thread-1");
    expect(threadItems[0]?.thread_id).toBe("thread-1");
    expect(currentTurnId).toBe(lifecycle.pendingTurnKey);
  });

  it("markOptimisticFailure 应标记 pending turn/item 为 failed", () => {
    const assistantMsg: Message = {
      id: "assistant-2",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
    };

    let messages: Message[] = [assistantMsg];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;

    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: null,
      content: "继续生成",
      listenerMapRef: { current: new Map() },
      setActiveStream: () => {},
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    lifecycle.activateStream(
      "session-2",
      buildWaitingAgentRuntimeStatus({ executionStrategy: "react" }),
      "thread-2",
    );
    lifecycle.markOptimisticFailure("发送失败");

    expect(threadTurns[0]?.status).toBe("failed");
    expect(threadTurns[0]?.error_message).toBe("发送失败");
    expect(threadItems[0]?.status).toBe("failed");
    expect(threadItems[0]?.type).toBe("turn_summary");
    if (threadItems[0]?.type !== "turn_summary") {
      throw new Error("缺少 optimistic turn summary");
    }
    expect(threadItems[0].text).toContain("失败");
  });

  it("canonical disposition 判定前不应绑定 optimistic turn identity", () => {
    const userMsg: Message = {
      id: "user-queued-binding",
      role: "user",
      content: "queued rich prompt",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
    };
    const assistantMsg: Message = {
      id: "assistant-queued-binding",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
      isThinking: false,
      contentParts: [],
    };
    let messages = [userMsg, assistantMsg];

    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsg,
      userMsgId: userMsg.id,
      content: userMsg.content,
      listenerMapRef: { current: new Map() },
      setActiveStream: () => {},
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
      setThreadItems: () => {},
      setThreadTurns: () => {},
      setCurrentTurnId: () => {},
    });

    expect(messages.map((message) => message.runtimeTurnId)).toEqual([
      undefined,
      undefined,
    ]);
    expect(lifecycle.isStreamActivated()).toBe(false);
  });

  it("所有回合只创建一条稳定的运行摘要投影", () => {
    const assistantMsg: Message = {
      id: "assistant-fast",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
    };

    let activeStream: ActiveStreamState | null = null;
    let messages: Message[] = [assistantMsg];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;

    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: "user-fast",
      content: "只回答 OK",
      listenerMapRef: { current: new Map() },
      setActiveStream: (next) => {
        activeStream = next;
      },
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    expect(threadTurns).toHaveLength(0);
    expect(threadItems).toHaveLength(0);

    const runtimeStatus = buildWaitingAgentRuntimeStatus({
      executionStrategy: "react",
    });
    lifecycle.activateStream("session-fast", runtimeStatus, "thread-fast");

    expect(activeStream).toEqual(
      expect.objectContaining({ sessionId: "session-fast" }),
    );
    expect(messages[0]?.runtimeStatus).toEqual(runtimeStatus);
    expect(threadTurns[0]?.thread_id).toBe("thread-fast");
    expect(threadItems).toHaveLength(1);
    expect(threadItems[0]?.thread_id).toBe("thread-fast");
  });

  it("activateStream 应恢复首轮建会话时被快照覆盖的本地用户与助手草稿", () => {
    const userMsg: Message = {
      id: "user-image",
      role: "user",
      content: "@Nanobanana Pro 生成一张城市春日照片",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
    };
    const assistantMsg: Message = {
      id: "assistant-image",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:01.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
      imageWorkbenchPreview: {
        taskId: "draft-image-1",
        prompt: "一张城市春日照片",
        mode: "generate",
        status: "running",
        imageCount: 1,
        expectedImageCount: 1,
        caption: null,
        phase: "preparing",
        statusMessage: null,
      },
    };

    let messages: Message[] = [];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;
    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: userMsg.id,
      userMsg,
      content: userMsg.content,
      listenerMapRef: { current: new Map() },
      setActiveStream: () => {},
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    messages = [];

    const runtimeStatus = buildWaitingAgentRuntimeStatus({
      executionStrategy: "react",
    });
    lifecycle.activateStream("session-image", runtimeStatus);

    expect(messages.map((message) => message.id)).toEqual([
      "user-image",
      "assistant-image",
    ]);
    expect(messages[0]?.runtimeTurnId).toBe(lifecycle.pendingTurnKey);
    expect(messages[1]?.runtimeStatus).toEqual(runtimeStatus);
    expect(messages[1]?.runtimeTurnId).toBe(lifecycle.pendingTurnKey);
    expect(messages[1]?.imageWorkbenchPreview?.taskId).toBe("draft-image-1");
    expect(threadTurns[0]?.thread_id).toBe("session-image");
    expect(threadItems[0]?.thread_id).toBe("session-image");
  });

  it("activateStream 不应在已有同内容 pending 用户消息后重复插入用户气泡", () => {
    const existingUserMsg: Message = {
      id: "snapshot-user-image",
      role: "user",
      content: "@配图 生成 一张春日咖啡馆插画",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
    };
    const userMsg: Message = {
      id: "optimistic-user-image",
      role: "user",
      content: "@配图 生成 一张春日咖啡馆插画",
      timestamp: new Date("2026-03-27T01:00:01.000Z"),
    };
    const assistantMsg: Message = {
      id: "assistant-image-dedupe",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:02.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
    };

    let messages: Message[] = [existingUserMsg];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;
    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: userMsg.id,
      userMsg,
      content: userMsg.content,
      listenerMapRef: { current: new Map() },
      setActiveStream: () => {},
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    const runtimeStatus = buildWaitingAgentRuntimeStatus({
      executionStrategy: "react",
    });
    lifecycle.activateStream("session-image", runtimeStatus);

    expect(messages.filter((message) => message.role === "user")).toHaveLength(
      1,
    );
    expect(messages.map((message) => message.id)).toEqual([
      "snapshot-user-image",
      "assistant-image-dedupe",
    ]);
    expect(messages[0]?.runtimeTurnId).toBe(lifecycle.pendingTurnKey);
    expect(messages[1]?.runtimeTurnId).toBe(lifecycle.pendingTurnKey);
    expect(messages[1]?.runtimeStatus).toEqual(runtimeStatus);
  });

  it("activateStream 不应合并同文本但附件不同的用户消息", () => {
    const existingUserMsg: Message = {
      id: "snapshot-user-without-image",
      role: "user",
      content: "@配图 生成 一张春日咖啡馆插画",
      timestamp: new Date("2026-03-27T01:00:00.000Z"),
    };
    const userMsg: Message = {
      id: "optimistic-user-with-image",
      role: "user",
      content: "@配图 生成 一张春日咖啡馆插画",
      images: [{ data: "data:image/png;base64,AAAA", mediaType: "image/png" }],
      timestamp: new Date("2026-03-27T01:00:01.000Z"),
    };
    const assistantMsg: Message = {
      id: "assistant-image-attachment",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-03-27T01:00:02.000Z"),
      isThinking: true,
      contentParts: [],
      runtimeStatus: buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
      }),
    };

    let messages: Message[] = [existingUserMsg];
    let threadItems: AgentThreadItem[] = [];
    let threadTurns: AgentThreadTurn[] = [];
    let currentTurnId: string | null = null;
    const lifecycle = createAgentStreamSubmissionLifecycle({
      assistantMsg,
      assistantMsgId: assistantMsg.id,
      userMsgId: userMsg.id,
      userMsg,
      content: userMsg.content,
      listenerMapRef: { current: new Map() },
      setActiveStream: () => {},
      setMessages: createStateSetter(
        () => messages,
        (value) => {
          messages = value;
        },
      ),
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
    });

    lifecycle.activateStream(
      "session-image",
      buildWaitingAgentRuntimeStatus({ executionStrategy: "react" }),
    );

    expect(messages.filter((message) => message.role === "user")).toHaveLength(
      2,
    );
    expect(messages.map((message) => message.id)).toEqual([
      "snapshot-user-without-image",
      "optimistic-user-with-image",
      "assistant-image-attachment",
    ]);
  });
});
