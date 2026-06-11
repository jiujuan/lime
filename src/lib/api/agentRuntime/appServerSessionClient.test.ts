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
      response: { id: 1, result: {} as never },
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
    updateSession: vi.fn().mockResolvedValue({
      id: 4,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          title: "新标题",
          model: "gpt-5.4",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:02.000Z",
          archivedAt: null,
          messagesCount: 3,
        },
      },
      response: { id: 4, result: {} },
      notifications: [],
      messages: [],
    }),
    archiveManySessions: vi.fn().mockResolvedValue({
      id: 5,
      result: {
        sessions: [
          {
            sessionId: "session-1",
            threadId: "thread-1",
            title: "归档会话",
            model: "gpt-5.4",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:02.000Z",
            archivedAt: "2026-06-06T00:00:03.000Z",
            messagesCount: 3,
          },
        ],
      },
      response: { id: 5, result: {} },
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

  it("create 收到半截 App Server session 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.startSession).mockResolvedValueOnce({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      } as never,
      response: { id: 1, result: {} as never },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.createAgentRuntimeSession("workspace-1"),
    ).rejects.toThrow(
      "agentSession/start did not return an App Server session",
    );
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

  it("list 收到 mock-like envelope 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.request).mockResolvedValueOnce({
      id: 2,
      result: { success: true } as never,
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.listAgentRuntimeSessions()).rejects.toThrow(
      "agentSession/list did not return session list",
    );
  });

  it("list 收到半截 session overview 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.request).mockResolvedValueOnce({
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "session-1",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:02.000Z",
          },
        ],
      } as never,
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.listAgentRuntimeSessions()).rejects.toThrow(
      "agentSession/list did not return session list",
    );
  });

  it("list 应接受 App Server current 的空 model 字符串", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.request).mockResolvedValueOnce({
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "session-empty-model",
            model: "",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:02.000Z",
            messagesCount: 0,
          },
        ],
      },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.listAgentRuntimeSessions()).resolves.toEqual([
      expect.objectContaining({
        id: "session-empty-model",
        model: "",
        messages_count: 0,
      }),
    ]);
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
            content: [
              {
                type: "text",
                text: "已从 App Server detail.messages 读取。",
              },
            ],
          },
        ],
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
          content: [
            {
              type: "text",
              text: "已从 App Server detail.messages 读取。",
            },
          ],
        },
      ],
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
        businessObjectRef: {
          kind: "agent.session",
          id: "agent-session:workspace-2:1780704000000",
          title: "协议会话标题",
        },
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
      name: "协议会话标题",
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
      thread_read: {
        thread_id: "thread-2",
        status: "running",
        profile_status: "running",
        active_turn_id: "turn-1",
        turns: [
          {
            turn_id: "turn-1",
            status: "running",
            native_status: "running",
          },
        ],
        pending_requests: [],
        incidents: [],
        queued_turns: [],
        updated_at: "2026-06-06T00:00:03.000Z",
      },
      todo_items: [],
      child_subagent_sessions: [],
    });
  });

  it("get 无 detail 时应保留 App Server canceled turn current 状态", async () => {
    const appServerClient = appServerClientMock();
    const readSessionResult = {
      session: {
        sessionId: "session-cancel",
        threadId: "thread-cancel",
        appId: "desktop",
        workspaceId: "workspace-2",
        status: "canceled" as const,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:04.000Z",
      },
      turns: [
        {
          turnId: "turn-cancel",
          sessionId: "session-cancel",
          threadId: "thread-cancel",
          status: "canceled" as const,
          completedAt: "2026-06-06T00:00:04.000Z",
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

    await expect(
      client.getAgentRuntimeSession("session-cancel"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "session-cancel",
        thread_id: "thread-cancel",
        turns: [
          expect.objectContaining({
            id: "turn-cancel",
            status: "canceled",
            completed_at: "2026-06-06T00:00:04.000Z",
          }),
        ],
        thread_read: expect.objectContaining({
          status: "cancelled",
          profile_status: "cancelled",
          turns: [
            {
              turn_id: "turn-cancel",
              status: "cancelled",
              native_status: "canceled",
            },
          ],
        }),
      }),
    );
  });

  it("get 缺少 sessionId 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.getAgentRuntimeSession(" ")).rejects.toThrow(
      "sessionId is required to read App Server session",
    );

    expect(appServerClient.readSession).not.toHaveBeenCalled();
  });

  it("get 收到错误 turn status 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 3,
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
        turns: [
          {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "done",
          },
        ],
      } as never,
      response: { id: 3, result: {} as never },
      notifications: [],
      messages: [],
    });
    const client = createAppServerSessionClient({ appServerClient });

    await expect(client.getAgentRuntimeSession("session-1")).rejects.toThrow(
      "agentSession/read did not return session detail",
    );
  });

  it("update 应通过 agentSession/update 写 current session 状态", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.updateAgentRuntimeSession({
        session_id: " session-1 ",
        name: "  新标题  ",
        archived: true,
        provider_selector: " custom-provider ",
        provider_name: " OpenAI Compatible ",
        model_name: " gpt-5.4 ",
        execution_strategy: "react",
        recent_access_mode: "full-access",
        recent_preferences: {
          task: true,
          subagent: false,
        },
        recent_team_selection: {
          disabled: true,
        },
      }),
    ).resolves.toBeUndefined();

    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      title: "新标题",
      archived: true,
      providerSelector: "custom-provider",
      providerName: "OpenAI Compatible",
      modelName: "gpt-5.4",
      executionStrategy: "react",
      recentAccessMode: "full-access",
      recentPreferences: {
        task: true,
        subagent: false,
      },
      recentTeamSelection: {
        disabled: true,
      },
    });
  });

  it("archiveMany 应通过 agentSession/archiveMany 批量归档 current sessions", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.archiveManyAgentRuntimeSessions([
        " session-1 ",
        "",
        "session-1",
        " session-2 ",
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "session-1",
        archived_at: Date.parse("2026-06-06T00:00:03.000Z"),
      }),
    ]);

    expect(appServerClient.archiveManySessions).toHaveBeenCalledWith({
      sessionIds: ["session-1", "session-2"],
    });
    expect(appServerClient.updateSession).not.toHaveBeenCalled();
  });

  it("archiveMany 返回形状漂移时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.archiveManySessions).mockResolvedValueOnce({
      id: 5,
      result: { sessions: [{ sessionId: "" }] },
      response: { id: 5, result: {} },
      notifications: [],
      messages: [],
    } as never);
    const client = createAppServerSessionClient({ appServerClient });

    await expect(
      client.archiveManyAgentRuntimeSessions(["session-1"]),
    ).rejects.toThrow(
      "agentSession/archiveMany did not return archived sessions",
    );
  });
});
