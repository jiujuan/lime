import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  flushEffects,
  mockGetAgentRuntimeSession,
  mockGetAgentRuntimeThreadRead,
  mockListAgentRuntimeSessions,
  mockPromoteAgentRuntimeQueuedTurn,
  mockReadAgentRuntimeThread,
  mockRemoveAgentRuntimeQueuedTurn,
  mockResumeAgentRuntimeThread,
  mockSubmitAgentRuntimeTurn,
  mountHook,
} from "../useAgentChat.testUtils";

describe("useAgentChat queue hydration", () => {
  it("恢复态 thread 仍在运行时，发送继续应直接展示排队态而不是伪装成处理中", async () => {
    const workspaceId = "ws-queue-on-restored-running";
    const sessionId = "session-queue-on-restored-running";
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: sessionId,
        name: "恢复中的运行会话",
        created_at: 1,
        updated_at: 2,
        messages_count: 0,
      },
    ]);
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: sessionId,
      messages: [],
      turns: [],
      items: [],
      queued_turns: [],
      thread_read: {
        thread_id: "thread-queue-on-restored-running",
        status: "running",
        active_turn_id: "turn-running-1",
        pending_requests: [],
        incidents: [],
        queued_turns: [],
      },
    });

    const harness = mountHook(workspaceId);

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic(sessionId);
      });
      await flushEffects();

      await act(async () => {
        await harness
          .getValue()
          .sendMessage("请继续分析这个项目", [], false, false, false, "react");
      });

      const assistantMessage = [...harness.getValue().messages]
        .reverse()
        .find((msg) => msg.role === "assistant");

      expect(assistantMessage?.runtimeStatus?.title).toBe("已加入排队列表");
      expect(harness.getValue().isSending).toBe(false);
      expect(harness.getValue().currentTurnId).toBeNull();
    } finally {
      harness.unmount();
    }
  });

  it("切换话题时应恢复后端返回的排队项", async () => {
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: "session-queue",
        name: "带队列的话题",
        created_at: 1,
        updated_at: 2,
      },
    ]);
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "session-queue",
      messages: [],
      turns: [],
      items: [],
      queued_turns: [
        {
          queuedTurnId: "queued-1",
          messagePreview: "继续补充 PRD",
          messageText: "继续补充 PRD，并补一版里程碑拆解",
          createdAt: 1700000000000,
          imageCount: 0,
          position: 1,
        },
      ],
    });

    const harness = mountHook("ws-queue-hydration");

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic("session-queue");
      });
      await flushEffects();

      expect(harness.getValue().queuedTurns).toEqual([
        {
          queued_turn_id: "queued-1",
          message_preview: "继续补充 PRD",
          message_text: "继续补充 PRD，并补一版里程碑拆解",
          created_at: 1700000000000,
          image_count: 0,
          position: 1,
        },
      ]);
      expect(
        harness.getValue().topics.find((topic) => topic.id === "session-queue"),
      ).toMatchObject({
        status: "queued",
      });
      expect(mockResumeAgentRuntimeThread).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it("切换到 running thread_read 时只水合状态，不自动调用 legacy resume", async () => {
    const sessionId = "session-running-auto-resume";
    mockListAgentRuntimeSessions.mockResolvedValue([
      {
        id: sessionId,
        name: "运行中的话题",
        created_at: 1,
        updated_at: 2,
      },
    ]);
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: sessionId,
      messages: [],
      turns: [],
      items: [],
      queued_turns: [],
      thread_read: {
        thread_id: "thread-running-auto-resume",
        status: "running",
        active_turn_id: "turn-running-1",
        pending_requests: [],
        incidents: [],
        queued_turns: [],
      },
    });

    const harness = mountHook("ws-running-auto-resume");

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic(sessionId);
      });
      await flushEffects();

      expect(mockResumeAgentRuntimeThread).not.toHaveBeenCalled();
      expect(mockSubmitAgentRuntimeTurn).not.toHaveBeenCalled();
      expect(harness.getValue().isSending).toBe(false);
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-running-auto-resume",
        status: "running",
        active_turn_id: "turn-running-1",
      });
      expect(
        harness.getValue().topics.find((topic) => topic.id === sessionId),
      ).toMatchObject({
        status: "running",
      });
    } finally {
      harness.unmount();
    }
  });

  it("removeQueuedTurn 后应刷新 thread_read 与队列快照", async () => {
    const sessionId = "session-queue-remove";
    const harness = mountHook("ws-queue-remove");
    let removed = false;
    mockRemoveAgentRuntimeQueuedTurn.mockImplementation(async () => {
      removed = true;
      return true;
    });
    mockGetAgentRuntimeSession.mockImplementation(async () =>
      removed
        ? {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [],
            thread_read: {
              thread_id: "thread-queue-remove",
              status: "idle",
              pending_requests: [],
              incidents: [],
              queued_turns: [],
            },
          }
        : {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续生成周报",
                messageText: "继续生成周报正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
            thread_read: {
              thread_id: "thread-queue-remove",
              status: "queued",
              pending_requests: [],
              incidents: [],
              queued_turns: [
                {
                  queuedTurnId: "queued-1",
                  messagePreview: "继续生成周报",
                  messageText: "继续生成周报正文",
                  createdAt: 1700000000000,
                  imageCount: 0,
                  position: 1,
                },
              ],
            },
          },
    );
    mockGetAgentRuntimeThreadRead.mockImplementation(async () =>
      removed
        ? {
            thread_id: "thread-queue-remove",
            status: "idle",
            pending_requests: [],
            incidents: [],
            queued_turns: [],
          }
        : {
            thread_id: "thread-queue-remove",
            status: "queued",
            pending_requests: [],
            incidents: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续生成周报",
                messageText: "继续生成周报正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
          },
    );
    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic(sessionId);
      });
      await flushEffects();
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-queue-remove",
        status: "queued",
      });

      await act(async () => {
        await harness.getValue().removeQueuedTurn("queued-1");
      });
      await flushEffects();

      expect(mockRemoveAgentRuntimeQueuedTurn).toHaveBeenCalledWith({
        session_id: sessionId,
        queued_turn_id: "queued-1",
      });
      expect(mockGetAgentRuntimeThreadRead).toHaveBeenCalledWith(sessionId);
      expect(harness.getValue().queuedTurns).toEqual([]);
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-queue-remove",
        status: "idle",
      });
    } finally {
      harness.unmount();
    }
  });

  it("promoteQueuedTurn 后应刷新 thread_read 为最新运行态", async () => {
    const sessionId = "session-queue-promote";
    const harness = mountHook("ws-queue-promote");
    let promoted = false;
    mockPromoteAgentRuntimeQueuedTurn.mockImplementation(async () => {
      promoted = true;
      return true;
    });
    mockGetAgentRuntimeSession.mockImplementation(async () =>
      promoted
        ? {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [],
            thread_read: {
              thread_id: "thread-queue-promote",
              status: "running",
              active_turn_id: "turn-running-1",
              pending_requests: [],
              incidents: [],
              queued_turns: [],
            },
          }
        : {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续执行排队任务",
                messageText: "继续执行排队任务正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
            thread_read: {
              thread_id: "thread-queue-promote",
              status: "queued",
              pending_requests: [],
              incidents: [],
              queued_turns: [
                {
                  queuedTurnId: "queued-1",
                  messagePreview: "继续执行排队任务",
                  messageText: "继续执行排队任务正文",
                  createdAt: 1700000000000,
                  imageCount: 0,
                  position: 1,
                },
              ],
            },
          },
    );
    mockGetAgentRuntimeThreadRead.mockImplementation(async () =>
      promoted
        ? {
            thread_id: "thread-queue-promote",
            status: "running",
            active_turn_id: "turn-running-1",
            pending_requests: [],
            incidents: [],
            queued_turns: [],
          }
        : {
            thread_id: "thread-queue-promote",
            status: "queued",
            pending_requests: [],
            incidents: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续执行排队任务",
                messageText: "继续执行排队任务正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
          },
    );
    mockReadAgentRuntimeThread.mockResolvedValue({
      thread: {
        archived: false,
        createdAtMs: 1,
        sessionId,
        status: { type: "active" },
        threadId: "thread-queue-promote",
        turnsView: "full",
        turns: [
          {
            createdAtMs: 1,
            queue: { state: "queued" },
            sessionId,
            status: "inProgress",
            threadId: "thread-queue-promote",
            turnId: "queued-1",
            updatedAtMs: 2,
          },
        ],
        updatedAtMs: 2,
      },
    });

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic(sessionId);
      });
      await flushEffects();
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-queue-promote",
        status: "queued",
      });

      await act(async () => {
        await harness.getValue().promoteQueuedTurn("queued-1");
      });
      await flushEffects();

      expect(mockPromoteAgentRuntimeQueuedTurn).toHaveBeenCalledWith({
        session_id: sessionId,
        queued_turn_id: "queued-1",
      });
      expect(mockReadAgentRuntimeThread).toHaveBeenCalledWith(
        "thread-queue-promote",
      );
      expect(mockGetAgentRuntimeThreadRead).toHaveBeenCalledWith(sessionId);
      expect(harness.getValue().queuedTurns).toEqual([]);
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-queue-promote",
        status: "running",
        active_turn_id: "turn-running-1",
      });
    } finally {
      harness.unmount();
    }
  });

  it("resumeThread 后应刷新 thread_read 为最新运行态", async () => {
    const sessionId = "session-thread-resume";
    const harness = mountHook("ws-thread-resume");
    let resumed = false;
    mockGetAgentRuntimeSession.mockImplementation(async () =>
      resumed
        ? {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [],
            thread_read: {
              thread_id: "thread-thread-resume",
              status: "running",
              active_turn_id: "turn-running-1",
              pending_requests: [],
              incidents: [],
              queued_turns: [],
            },
          }
        : {
            id: sessionId,
            messages: [],
            turns: [],
            items: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续执行排队任务",
                messageText: "继续执行排队任务正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
            thread_read: {
              thread_id: "thread-thread-resume",
              status: "queued",
              pending_requests: [],
              incidents: [],
              queued_turns: [
                {
                  queuedTurnId: "queued-1",
                  messagePreview: "继续执行排队任务",
                  messageText: "继续执行排队任务正文",
                  createdAt: 1700000000000,
                  imageCount: 0,
                  position: 1,
                },
              ],
            },
          },
    );
    mockGetAgentRuntimeThreadRead.mockImplementation(async () =>
      resumed
        ? {
            thread_id: "thread-thread-resume",
            status: "running",
            active_turn_id: "turn-running-1",
            pending_requests: [],
            incidents: [],
            queued_turns: [],
          }
        : {
            thread_id: "thread-thread-resume",
            status: "queued",
            pending_requests: [],
            incidents: [],
            queued_turns: [
              {
                queuedTurnId: "queued-1",
                messagePreview: "继续执行排队任务",
                messageText: "继续执行排队任务正文",
                createdAt: 1700000000000,
                imageCount: 0,
                position: 1,
              },
            ],
          },
    );

    try {
      await flushEffects();
      await act(async () => {
        await harness.getValue().switchTopic(sessionId);
      });
      await flushEffects();
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-thread-resume",
        status: "queued",
      });

      mockResumeAgentRuntimeThread.mockImplementation(async () => {
        resumed = true;
        return true;
      });

      await act(async () => {
        await harness.getValue().resumeThread();
      });
      await flushEffects();

      expect(mockResumeAgentRuntimeThread).toHaveBeenCalledWith({
        session_id: sessionId,
      });
      expect(mockGetAgentRuntimeThreadRead).toHaveBeenCalledWith(sessionId);
      expect(harness.getValue().threadRead).toMatchObject({
        thread_id: "thread-thread-resume",
        status: "running",
        active_turn_id: "turn-running-1",
      });
    } finally {
      harness.unmount();
    }
  });
});
