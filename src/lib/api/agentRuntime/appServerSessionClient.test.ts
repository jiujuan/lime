import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAppServerSessionClient,
  type AppServerSessionRpcClient,
} from "./appServerSessionClient";

function appServerClientMock(): AppServerSessionRpcClient {
  const readSessionResult = {
    session: {
      sessionId: "session-1",
      threadId: "thread-1",
      appId: "desktop",
      workspaceId: "workspace-1",
      status: "idle" as const,
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
    },
    turns: [],
  };

  return {
    startSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      },
      response: { id: 1, result: {} },
      notifications: [],
      messages: [],
    }),
    request: vi.fn().mockResolvedValue({
      id: 2,
      result: { sessions: [] },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    }),
    readSession: vi.fn().mockResolvedValue({
      id: 3,
      result: readSessionResult,
      response: { id: 3, result: readSessionResult },
      notifications: [],
      messages: [],
    }),
  };
}

describe("appServerSessionClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("create 应通过 agentSession/start 创建桌面会话", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.createAgentRuntimeSession(" workspace-1 ", "  新会话  ", "react", {
        runStartHooks: false,
        metadata: {
          harness: {
            hiddenFromUserRecents: true,
            source: "unit",
          },
        },
      }),
    ).resolves.toBe("session-1");

    expect(appServerClient.startSession).toHaveBeenCalledWith({
      appId: "desktop",
      workspaceId: "workspace-1",
      businessObjectRef: {
        kind: "agent.session",
        id: "agent-session:workspace-1:1780704000000",
        title: "新会话",
        metadata: {
          harness: {
            hiddenFromUserRecents: true,
            source: "unit",
          },
          title: "新会话",
          executionStrategy: "react",
          runStartHooks: false,
        },
      },
    });
  });

  it("create 缺少 workspaceId 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.createAgentRuntimeSession(" ")).rejects.toThrow(
      "workspaceId 不能为空，请先选择项目工作区",
    );

    expect(appServerClient.startSession).not.toHaveBeenCalled();
  });

  it("list 应通过 agentSession/list 读取并投影 runtime session info", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.request).mockResolvedValueOnce({
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "session-1",
            threadId: "thread-1",
            title: "Runtime Session",
            model: "gpt-5.4",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:02.000Z",
            archivedAt: null,
            workspaceId: "workspace-1",
            workingDir: "/tmp/workspace-1",
            executionStrategy: "react",
            messagesCount: 3,
          },
        ],
      },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.listAgentRuntimeSessions({
        archivedOnly: true,
        includeArchived: true,
        workspaceId: " workspace-1 ",
        limit: 12.8,
      }),
    ).resolves.toEqual([
      {
        id: "session-1",
        thread_id: "thread-1",
        name: "Runtime Session",
        model: "gpt-5.4",
        created_at: 1780704000000,
        updated_at: 1780704002000,
        archived_at: null,
        messages_count: 3,
        workspace_id: "workspace-1",
        working_dir: "/tmp/workspace-1",
        execution_strategy: "react",
      },
    ]);

    expect(appServerClient.request).toHaveBeenCalledWith("agentSession/list", {
      archivedOnly: true,
      includeArchived: true,
      workspaceId: "workspace-1",
      limit: 12,
    });
  });

  it("get 应优先返回 App Server detail 并透传 history 游标", async () => {
    const appServerClient = appServerClientMock();
    const readSessionResult = {
      session: {
        sessionId: "session-1",
        threadId: "thread-1",
        appId: "desktop",
        workspaceId: "workspace-1",
        status: "idle" as const,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:02.000Z",
      },
      turns: [],
      detail: {
        id: "session-1",
        thread_id: "thread-1",
        name: "Runtime Detail",
        created_at: 1780704000000,
        updated_at: 1780704002000,
        workspace_id: "workspace-1",
        messages: [],
      },
    };
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 3,
      result: readSessionResult,
      response: { id: 3, result: readSessionResult },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.getAgentRuntimeSession(" session-1 ", {
        historyLimit: 40.9,
        historyOffset: 2.2,
        historyBeforeMessageId: 100.8,
        resumeSessionStartHooks: true,
      }),
    ).resolves.toEqual({
      id: "session-1",
      thread_id: "thread-1",
      name: "Runtime Detail",
      created_at: 1780704000000,
      updated_at: 1780704002000,
      workspace_id: "workspace-1",
      messages: [],
    });

    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      historyLimit: 40,
      historyOffset: 2,
      historyBeforeMessageId: 100,
    });
  });

  it("get 无 detail 时应从协议 session/turns 构造最小详情", async () => {
    const appServerClient = appServerClientMock();
    const readSessionResult = {
      session: {
        sessionId: "session-2",
        threadId: "thread-2",
        appId: "desktop",
        workspaceId: "workspace-2",
        status: "running" as const,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:03.000Z",
      },
      turns: [
        {
          turnId: "turn-1",
          sessionId: "session-2",
          threadId: "thread-2",
          status: "running" as const,
        },
      ],
    };
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 3,
      result: readSessionResult,
      response: { id: 3, result: readSessionResult },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.getAgentRuntimeSession("session-2")).resolves.toEqual({
      id: "session-2",
      thread_id: "thread-2",
      name: "session-2",
      created_at: 1780704000000,
      updated_at: 1780704003000,
      workspace_id: "workspace-2",
      messages: [],
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-2",
          prompt_text: "",
          status: "running",
          started_at: "2026-06-06T00:00:03.000Z",
          completed_at: undefined,
          created_at: "2026-06-06T00:00:03.000Z",
          updated_at: "2026-06-06T00:00:03.000Z",
        },
      ],
      items: [],
      queued_turns: [],
      thread_read: null,
      todo_items: [],
      child_subagent_sessions: [],
    });
  });

  it("get 缺少 sessionId 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.getAgentRuntimeSession(" ")).rejects.toThrow(
      "sessionId is required to read App Server session",
    );

    expect(appServerClient.readSession).not.toHaveBeenCalled();
  });
});
