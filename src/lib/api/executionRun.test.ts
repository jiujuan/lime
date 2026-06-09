import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  executionRunGet,
  executionRunGetGeneralWorkbenchState,
  executionRunList,
  executionRunListGeneralWorkbenchHistory,
  rejectRetiredExecutionRunCommandForTest,
} from "./executionRun";

const { appServerListSessionsMock, appServerReadSessionMock } = vi.hoisted(
  () => ({
    appServerListSessionsMock: vi.fn(),
    appServerReadSessionMock: vi.fn(),
  }),
);

vi.mock("./appServer", () => ({
  createAppServerClient: () => ({
    listSessions: appServerListSessionsMock,
    readSession: appServerReadSessionMock,
  }),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function sessionListResult() {
  return {
    id: 1,
    result: {
      sessions: [
        {
          sessionId: "session-2",
          threadId: "thread-2",
          title: "第二个会话",
          model: "gpt-5.4",
          createdAt: "2026-06-09T10:00:00.000Z",
          updatedAt: "2026-06-09T10:02:00.000Z",
          archivedAt: null,
          workspaceId: "workspace-1",
          workingDir: "/tmp/workspace-1",
          executionStrategy: "react",
          messagesCount: 4,
        },
        {
          sessionId: "session-1",
          threadId: "thread-1",
          title: "第一个会话",
          model: "",
          createdAt: "2026-06-09T09:00:00.000Z",
          updatedAt: "2026-06-09T09:01:00.000Z",
          archivedAt: null,
          messagesCount: 2,
        },
      ],
    },
    response: { id: 1, result: {} },
    notifications: [],
    messages: [],
  };
}

function sessionReadResult() {
  return {
    id: 2,
    result: {
      session: {
        sessionId: "session-1",
        threadId: "thread-1",
        appId: "desktop",
        workspaceId: "workspace-1",
        businessObjectRef: {
          kind: "agent.session",
          id: "agent-session:workspace-1:1",
          title: "内容工作台",
        },
        status: "running",
        createdAt: "2026-06-09T09:00:00.000Z",
        updatedAt: "2026-06-09T09:04:00.000Z",
      },
      turns: [
        {
          turnId: "turn-completed",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "completed",
          startedAt: "2026-06-09T09:00:30.000Z",
          completedAt: "2026-06-09T09:01:10.000Z",
        },
        {
          turnId: "turn-running",
          sessionId: "session-1",
          threadId: "thread-1",
          status: "running",
          startedAt: "2026-06-09T09:03:00.000Z",
        },
      ],
      detail: {
        title: "内容工作台",
        thread_read: {
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

  it("executionRunList 通过 agentSession/list 投影 chat run 列表", async () => {
    appServerListSessionsMock.mockResolvedValueOnce(sessionListResult());

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

    expect(appServerListSessionsMock).toHaveBeenCalledWith({
      includeArchived: true,
      limit: 2,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGet 通过 agentSession/read 投影单个 run", async () => {
    appServerReadSessionMock.mockResolvedValueOnce(sessionReadResult());

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

    expect(appServerReadSessionMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGet 找不到 session 时返回 null，不回退旧 native 命令", async () => {
    appServerReadSessionMock.mockRejectedValueOnce(
      new Error("session not found"),
    );

    await expect(executionRunGet("missing-session")).resolves.toBeNull();
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGetGeneralWorkbenchState 从 agentSession/read detail 投影工作台状态", async () => {
    appServerReadSessionMock.mockResolvedValueOnce(sessionReadResult());

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

    expect(appServerReadSessionMock).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunListGeneralWorkbenchHistory 从 agentSession/read 分页返回终态 runs", async () => {
    appServerReadSessionMock.mockResolvedValueOnce(sessionReadResult());

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

  it("agentSession/read 返回假成功 envelope 时应 fail closed", async () => {
    appServerReadSessionMock.mockResolvedValueOnce({
      id: 2,
      result: { success: true },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });

    await expect(
      executionRunGetGeneralWorkbenchState("session-1"),
    ).rejects.toThrow("agentSession/read did not return session read model");
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
