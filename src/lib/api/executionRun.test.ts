import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  executionRunGet,
  executionRunGetGeneralWorkbenchState,
  executionRunList,
  executionRunListGeneralWorkbenchHistory,
  rejectRetiredExecutionRunCommandForTest,
} from "./executionRun";

const { appServerListThreadsMock, appServerReadThreadMock } = vi.hoisted(
  () => ({
    appServerListThreadsMock: vi.fn(),
    appServerReadThreadMock: vi.fn(),
  }),
);

vi.mock("./appServer", () => ({
  createAppServerClient: () => ({
    listThreads: appServerListThreadsMock,
    readThread: appServerReadThreadMock,
  }),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function sessionListResult() {
  const unixSeconds = (value: string) => Date.parse(value) / 1000;
  return {
    id: 1,
    result: {
      data: [
        {
          id: "thread-2",
          sessionId: "session-2",
          preview: "第二个会话",
          modelProvider: "gpt-5.4",
          cwd: "/tmp/workspace-1",
          createdAt: unixSeconds("2026-06-09T10:00:00.000Z"),
          updatedAt: unixSeconds("2026-06-09T10:02:00.000Z"),
          status: { type: "idle" },
          turns: [
            {
              id: "turn-2",
              status: "completed",
              items: [{ id: "item-2", type: "agentMessage", text: "done" }],
            },
          ],
        },
        {
          id: "thread-1",
          sessionId: "session-1",
          preview: "第一个会话",
          modelProvider: "",
          createdAt: unixSeconds("2026-06-09T09:00:00.000Z"),
          updatedAt: unixSeconds("2026-06-09T09:01:00.000Z"),
          status: { type: "idle" },
          turns: [
            {
              id: "turn-1",
              status: "completed",
              items: [
                { id: "item-1", type: "agentMessage", text: "done" },
                { id: "item-2", type: "agentMessage", text: "done" },
              ],
            },
          ],
        },
      ],
    },
    response: { id: 1, result: {} },
    notifications: [],
    messages: [],
  };
}

function sessionReadResult() {
  const unixSeconds = (value: string) => Date.parse(value) / 1000;
  return {
    id: 2,
    result: {
      thread: {
        id: "thread-1",
        sessionId: "session-1",
        name: "内容工作台",
        modelProvider: "gpt-5.4",
        cwd: "/tmp/workspace-1",
        status: { type: "active", activeFlags: [] },
        createdAt: unixSeconds("2026-06-09T09:00:00.000Z"),
        updatedAt: unixSeconds("2026-06-09T09:04:00.000Z"),
        turns: [
          {
            id: "turn-completed",
            status: "completed",
            startedAt: unixSeconds("2026-06-09T09:00:30.000Z"),
            completedAt: unixSeconds("2026-06-09T09:01:10.000Z"),
          },
          {
            id: "turn-running",
            status: "inProgress",
            startedAt: unixSeconds("2026-06-09T09:03:00.000Z"),
          },
        ],
        execution_runs: [
          {
            run_id: "session-1",
            execution_id: "turn-running",
            session_id: "session-1",
            artifact_paths: ["drafts/article.md"],
            title: "写作中",
            gate_key: "write_mode",
            status: "running",
            source: "chat",
            source_ref: "agent.session",
            started_at: "2026-06-09T09:03:00.000Z",
          },
          {
            run_id: "session-1",
            execution_id: "turn-completed",
            session_id: "session-1",
            artifact_paths: ["drafts/brief.md"],
            title: "选题完成",
            gate_key: "topic_select",
            status: "success",
            source: "chat",
            source_ref: "agent.session",
            started_at: "2026-06-09T09:00:30.000Z",
            finished_at: "2026-06-09T09:01:10.000Z",
          },
        ],
      },
    },
    response: { id: 2, result: {} },
    notifications: [],
    messages: [],
  };
}

describe("executionRun API current read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executionRunList 通过 thread/list 投影 chat run 列表", async () => {
    appServerListThreadsMock.mockResolvedValueOnce(sessionListResult());

    await expect(executionRunList(1, 1)).resolves.toEqual([
      expect.objectContaining({
        id: "session-1",
        source: "chat",
        source_ref: "第一个会话",
        session_id: "session-1",
        status: "success",
        started_at: "2026-06-09T09:00:00.000Z",
        finished_at: "2026-06-09T09:01:00.000Z",
      }),
    ]);

    expect(appServerListThreadsMock).toHaveBeenCalledWith({
      archived: true,
      limit: 2,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGet 通过 thread/read 投影单个 run", async () => {
    appServerReadThreadMock.mockResolvedValueOnce(sessionReadResult());

    await expect(executionRunGet(" session-1 ")).resolves.toEqual(
      expect.objectContaining({
        id: "session-1",
        source: "chat",
        source_ref: "内容工作台",
        status: "running",
        started_at: "2026-06-09T09:03:00.000Z",
        finished_at: null,
      }),
    );

    expect(appServerReadThreadMock).toHaveBeenCalledWith({
      threadId: "session-1",
      includeTurns: true,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGet 找不到 session 时返回 null，不回退旧 native 命令", async () => {
    appServerReadThreadMock.mockRejectedValueOnce(
      new Error("session not found"),
    );

    await expect(executionRunGet("missing-session")).resolves.toBeNull();
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGetGeneralWorkbenchState 从 thread/read detail 投影工作台状态", async () => {
    appServerReadThreadMock.mockResolvedValueOnce(sessionReadResult());

    await expect(
      executionRunGetGeneralWorkbenchState("session-1", 3),
    ).resolves.toEqual({
      run_state: "auto_running",
      current_gate_key: "write_mode",
      queue_items: [
        expect.objectContaining({
          run_id: "session-1",
          execution_id: "turn-running",
          title: "写作中",
          status: "running",
          artifact_paths: ["drafts/article.md"],
        }),
      ],
      latest_terminal: expect.objectContaining({
        run_id: "session-1",
        execution_id: "turn-completed",
        title: "选题完成",
        status: "success",
      }),
      recent_terminals: [
        expect.objectContaining({
          execution_id: "turn-completed",
        }),
      ],
      updated_at: "2026-06-09T09:04:00.000Z",
    });

    expect(appServerReadThreadMock).toHaveBeenCalledWith({
      threadId: "session-1",
      includeTurns: true,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunListGeneralWorkbenchHistory 从 thread/read 分页返回终态 runs", async () => {
    appServerReadThreadMock.mockResolvedValueOnce(sessionReadResult());

    await expect(
      executionRunListGeneralWorkbenchHistory("session-1", 1, 0),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          execution_id: "turn-completed",
          status: "success",
        }),
      ],
      has_more: false,
      next_offset: null,
    });

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("thread/read 返回假成功 envelope 时应 fail closed", async () => {
    appServerReadThreadMock.mockResolvedValueOnce({
      id: 2,
      result: { success: true },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });

    await expect(
      executionRunGetGeneralWorkbenchState("session-1"),
    ).rejects.toThrow("thread/read did not return thread read model");
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("旧 execution_run_* retired helper 只保留给守卫测试，不调用 safeInvoke", () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([]);

    expect(() =>
      rejectRetiredExecutionRunCommandForTest("execution_run_list"),
    ).toThrow(
      "execution_run_list is retired until execution run read models move to App Server current methods",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
