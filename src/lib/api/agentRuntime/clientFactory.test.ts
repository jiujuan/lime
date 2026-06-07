import { describe, expect, it, vi } from "vitest";
import {
  createAgentRuntimeClient,
  type AgentRuntimeAppServerClient,
} from "./clientFactory";

function appServerClientMock(): AgentRuntimeAppServerClient {
  return {
    startSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "desktop",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    readSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "idle",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
        turns: [],
      },
      response: {
        id: 1,
        result: {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "agent-chat",
            status: "idle",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          turns: [],
        },
      },
      messages: [],
      notifications: [],
    }),
    updateSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          title: "新标题",
          model: "gpt-5.4",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:01.000Z",
          messagesCount: 0,
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    request: vi.fn().mockImplementation((method: string) => {
      if (method === "workspaceSkillBindings/list") {
        return Promise.resolve({
          id: 1,
          result: {
            bindings: {
              request: {
                workspace_root: "/tmp/work",
                caller: "assistant",
                surface: {
                  workbench: true,
                  browser_assist: false,
                },
              },
              warnings: [],
              counts: {
                registered_total: 1,
                ready_for_manual_enable_total: 1,
                blocked_total: 0,
                query_loop_visible_total: 0,
                tool_runtime_visible_total: 0,
                launch_enabled_total: 0,
              },
              bindings: [],
            },
          },
          response: {
            id: 1,
            result: {},
          },
          messages: [],
          notifications: [],
        });
      }

      return Promise.resolve({
        id: 1,
        result: {
          sessions: [
            {
              sessionId: "session-1",
              threadId: "thread-1",
              title: "Session 1",
              model: "gpt-5.4",
              createdAt: "2026-06-06T00:00:00.000Z",
              updatedAt: "2026-06-06T00:00:00.000Z",
              messagesCount: 0,
            },
          ],
        },
        response: {
          id: 1,
          result: {},
        },
        messages: [],
        notifications: [],
      });
    }),
    startTurn: vi.fn().mockResolvedValue({}),
    cancelTurn: vi.fn().mockResolvedValue({}),
    respondAction: vi.fn().mockResolvedValue({}),
    exportEvidence: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:03.000Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-06-06T00:00:04.000Z",
        evidencePack: {
          packRelativeRoot: ".lime/harness/sessions/session-1/evidence",
          packAbsoluteRoot:
            "/tmp/work/.lime/harness/sessions/session-1/evidence",
          exportedAt: "2026-06-06T00:00:05.000Z",
          threadStatus: "running",
          latestTurnStatus: "accepted",
          turnCount: 2,
          itemCount: 6,
          pendingRequestCount: 1,
          queuedTurnCount: 0,
          recentArtifactCount: 1,
          knownGaps: [],
          artifacts: [],
        },
      },
      response: {
        id: 1,
        result: {},
      },
      messages: [],
      notifications: [],
    }),
    drainEvents: vi.fn().mockResolvedValue([]),
  };
}

describe("agentRuntime clientFactory", () => {
  it("传入 invoke 时应同时驱动 command 与 bridge client", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([{ id: "adapter-1" }]);
    const client = createAgentRuntimeClient({ invoke });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
      }),
    ).resolves.toBe(true);
    await expect(client.siteListAdapters()).resolves.toEqual([
      { id: "adapter-1" },
    ]);

    expect(invoke).toHaveBeenNthCalledWith(1, "agent_runtime_resume_thread", {
      request: {
        session_id: "session-1",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "site_list_adapters");
  });

  it("仅注入 bridgeInvoke 时非 lifecycle command client 也应复用同一桥接函数", async () => {
    const bridgeInvoke = vi.fn().mockResolvedValueOnce(true);
    const client = createAgentRuntimeClient({ bridgeInvoke });

    await expect(
      client.resumeAgentRuntimeThread({
        session_id: "session-1",
      }),
    ).resolves.toBe(true);

    expect(bridgeInvoke).toHaveBeenCalledWith("agent_runtime_resume_thread", {
      request: {
        session_id: "session-1",
      },
    });
  });

  it("session create/list/get 应走同一个 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.createAgentRuntimeSession("workspace-1", "新会话", "react"),
    ).resolves.toBe("session-1");
    await expect(
      client.listAgentRuntimeSessions({ workspaceId: "workspace-1" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "session-1",
        thread_id: "thread-1",
        name: "Session 1",
      }),
    ]);
    await expect(client.getAgentRuntimeSession("session-1")).resolves.toEqual(
      expect.objectContaining({
        id: "session-1",
        thread_id: "thread-1",
      }),
    );
    await expect(
      client.updateAgentRuntimeSession({
        session_id: "session-1",
        name: "新标题",
        archived: true,
      }),
    ).resolves.toBeUndefined();
    await expect(client.deleteAgentRuntimeSession("session-1")).resolves.toBe(
      undefined,
    );

    expect(appServerClient.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "desktop",
        workspaceId: "workspace-1",
      }),
    );
    expect(appServerClient.request).toHaveBeenCalledWith("agentSession/list", {
      workspaceId: "workspace-1",
    });
    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      title: "新标题",
      archived: true,
    });
    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      archived: true,
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("App Server detail 缺省旧数组字段时 get session 应补齐为可 hydrate 结构", async () => {
    const appServerClient = appServerClientMock();
    vi.mocked(appServerClient.readSession).mockResolvedValueOnce({
      id: 1,
      result: {
        session: {
          sessionId: "session-failed",
          threadId: "thread-failed",
          appId: "agent-chat",
          status: "failed",
          createdAt: "2026-06-07T04:39:20.025Z",
          updatedAt: "2026-06-07T04:42:05.905Z",
        },
        turns: [
          {
            turnId: "turn-failed",
            sessionId: "session-failed",
            threadId: "thread-failed",
            status: "failed",
            startedAt: "2026-06-07T04:39:20.100Z",
            completedAt: "2026-06-07T04:42:05.905Z",
          },
        ],
        detail: {
          id: "session-failed",
          thread_id: "thread-failed",
          created_at: 1780807160025,
          updated_at: 1780807325905,
          thread_read: {
            thread_id: "thread-failed",
            status: "failed",
          },
        },
      },
      response: {
        id: 1,
        result: {
          session: {
            sessionId: "session-failed",
            threadId: "thread-failed",
            appId: "agent-chat",
            status: "failed",
            createdAt: "2026-06-07T04:39:20.025Z",
            updatedAt: "2026-06-07T04:42:05.905Z",
          },
          turns: [
            {
              turnId: "turn-failed",
              sessionId: "session-failed",
              threadId: "thread-failed",
              status: "failed",
              startedAt: "2026-06-07T04:39:20.100Z",
              completedAt: "2026-06-07T04:42:05.905Z",
            },
          ],
          detail: {
            id: "session-failed",
            thread_id: "thread-failed",
            created_at: 1780807160025,
            updated_at: 1780807325905,
            thread_read: {
              thread_id: "thread-failed",
              status: "failed",
            },
          },
        },
      },
      messages: [],
      notifications: [],
    });
    const client = createAgentRuntimeClient({
      appServerClient,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.getAgentRuntimeSession("session-failed"),
    ).resolves.toMatchObject({
      id: "session-failed",
      messages: [],
      turns: [],
      items: [],
      queued_turns: [],
      todo_items: [],
      child_subagent_sessions: [],
      thread_read: {
        status: "failed",
      },
    });
  });

  it("turn lifecycle 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await client.submitAgentRuntimeTurn({
      message: "继续",
      session_id: "session-1",
      event_name: "event-1",
      workspace_id: "workspace-1",
    });

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      input: {
        text: "继续",
      },
      runtimeOptions: {
        stream: true,
        eventName: "event-1",
        hostOptions: {
          asterChatRequest: {
            message: "继续",
            session_id: "session-1",
            event_name: "event-1",
            workspace_id: "workspace-1",
          },
        },
      },
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("evidence pack export 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.exportAgentRuntimeEvidencePack("session-1"),
    ).resolves.toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      pack_relative_root: ".lime/harness/sessions/session-1/evidence",
    });

    expect(appServerClient.exportEvidence).toHaveBeenCalledWith({
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });

  it("workspace skill bindings 应走 App Server client，不复用 legacy bridgeInvoke", async () => {
    const appServerClient = appServerClientMock();
    const bridgeInvoke = vi.fn();
    const client = createAgentRuntimeClient({
      appServerClient,
      bridgeInvoke,
      isAppServerTurnLifecycleAvailable: () => true,
    });

    await expect(
      client.listWorkspaceSkillBindings({
        workspaceRoot: "/tmp/work",
        caller: "assistant",
        workbench: true,
      }),
    ).resolves.toMatchObject({
      counts: {
        registered_total: 1,
        ready_for_manual_enable_total: 1,
      },
    });

    expect(appServerClient.request).toHaveBeenCalledWith(
      "workspaceSkillBindings/list",
      {
        workspaceRoot: "/tmp/work",
        caller: "assistant",
        workbench: true,
      },
    );
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });
});
