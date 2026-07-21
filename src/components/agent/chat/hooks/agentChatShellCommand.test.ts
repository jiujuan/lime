import { describe, expect, it, vi } from "vitest";
import { runAgentChatShellCommand } from "./agentChatShellCommand";

function commandItem(status: "in_progress" | "completed") {
  return {
    id: "shell-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: status === "in_progress" ? 1 : 2,
    status,
    started_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:01.000Z",
    type: "command_execution",
    command: "printf ready",
    cwd: "/workspace",
    source: "userShell",
  };
}

describe("runAgentChatShellCommand", () => {
  it("应确保会话、解析 canonical thread 并刷新命令 Item", async () => {
    let threadId: string | undefined;
    let eventHandler: ((event: { payload: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    const refreshSessionDetail = vi.fn(async () => true);
    const runtime = {
      listenToTurnEvents: vi.fn(async (_eventName, handler) => {
        eventHandler = handler;
        return unlisten;
      }),
      runUserShellCommand: vi.fn(async () => undefined),
    };
    const refreshSessionReadModel = vi.fn(async () => {
      threadId = "thread-1";
      return true;
    });

    await expect(
      runAgentChatShellCommand({
        command: " printf ready ",
        ensureSession: vi.fn(async () => "session-1"),
        getThreadId: () => threadId,
        refreshSessionDetail,
        refreshSessionReadModel,
        runtime,
      }),
    ).resolves.toBe(true);

    expect(refreshSessionReadModel).toHaveBeenCalledWith("session-1");
    expect(runtime.listenToTurnEvents).toHaveBeenCalledWith(
      "agentSession/event/session-1",
      expect.any(Function),
    );
    expect(runtime.runUserShellCommand).toHaveBeenCalledWith(
      "thread-1",
      "printf ready",
      "agentSession/event/session-1",
    );
    expect(refreshSessionDetail).toHaveBeenCalledWith("session-1", {
      source: "userShell.event",
      detailMergeMode: "runtime_sync",
    });

    eventHandler?.({
      payload: { type: "item_completed", item: commandItem("completed") },
    });
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("空命令不应创建会话或订阅事件", async () => {
    const ensureSession = vi.fn(async () => "session-1");
    const runtime = {
      listenToTurnEvents: vi.fn(),
      runUserShellCommand: vi.fn(),
    };

    await expect(
      runAgentChatShellCommand({
        command: "   ",
        ensureSession,
        getThreadId: () => "thread-1",
        refreshSessionDetail: vi.fn(),
        refreshSessionReadModel: vi.fn(),
        runtime,
      }),
    ).resolves.toBe(false);

    expect(ensureSession).not.toHaveBeenCalled();
    expect(runtime.listenToTurnEvents).not.toHaveBeenCalled();
    expect(runtime.runUserShellCommand).not.toHaveBeenCalled();
  });
});
