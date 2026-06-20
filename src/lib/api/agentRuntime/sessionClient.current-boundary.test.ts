import { describe, expect, it, vi } from "vitest";
import type { AppServerSessionRpcClient } from "./appServerSessionClient";
import {
  AGENT_RUNTIME_SESSIONS_CHANGED_EVENT,
  createSessionClient,
} from "./sessionClient";

function appServerClientMock(): AppServerSessionRpcClient {
  return {
    startSession: vi.fn(),
    readSession: vi.fn(),
    request: vi.fn(),
    updateSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          archivedAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      },
      response: { id: 1, result: {} },
      notifications: [],
      messages: [],
    }),
    archiveManySessions: vi.fn().mockResolvedValue({
      id: 2,
      result: {
        sessions: [
          {
            sessionId: "session-bulk",
            threadId: "thread-bulk",
            title: "批量归档",
            model: "gpt-5.4",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
            archivedAt: "2026-06-07T00:00:00.000Z",
            messagesCount: 1,
          },
        ],
      },
      response: { id: 2, result: {} },
      notifications: [],
      messages: [],
    }),
    deleteSession: vi.fn().mockResolvedValue({
      id: 3,
      result: {
        sessionId: "session-deleted",
        deleted: true,
      },
      response: { id: 3, result: {} },
      notifications: [],
      messages: [],
    }),
  };
}

describe("agentRuntime sessionClient current App Server boundary", () => {
  it("session archive / restore use agentSession/update and delete uses agentSession/delete", async () => {
    const appServerClient = appServerClientMock();
    const client = createSessionClient({
      appServerClient,
    });

    await expect(
      client.updateAgentRuntimeSession({
        session_id: " session-recent ",
        archived: true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.updateAgentRuntimeSession({
        session_id: "session-archived",
        archived: false,
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.deleteAgentRuntimeSession(" session-deleted "),
    ).resolves.toBeUndefined();

    expect(appServerClient.updateSession).toHaveBeenNthCalledWith(1, {
      sessionId: "session-recent",
      archived: true,
    });
    expect(appServerClient.updateSession).toHaveBeenNthCalledWith(2, {
      sessionId: "session-archived",
      archived: false,
    });
    expect(appServerClient.updateSession).toHaveBeenCalledTimes(2);
    expect(appServerClient.deleteSession).toHaveBeenCalledWith({
      sessionId: "session-deleted",
    });
    expect(appServerClient.request).not.toHaveBeenCalled();
  });

  it("archiveMany projection must use agentSession/archiveMany instead of per-session update", async () => {
    const appServerClient = appServerClientMock();
    const client = createSessionClient({
      appServerClient,
    });

    await expect(
      client.archiveManyAgentRuntimeSessions([
        " session-bulk ",
        "",
        "session-bulk",
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "session-bulk",
      }),
    ]);

    expect(appServerClient.archiveManySessions).toHaveBeenCalledWith({
      sessionIds: ["session-bulk"],
    });
    expect(appServerClient.updateSession).not.toHaveBeenCalled();
    expect(appServerClient.request).not.toHaveBeenCalled();
  });

  it("delete projection must use typed agentSession/delete helper", async () => {
    const appServerClient = appServerClientMock();
    const client = createSessionClient({
      appServerClient,
    });

    await expect(
      client.deleteAgentRuntimeSession(" session-deleted "),
    ).resolves.toBeUndefined();

    expect(appServerClient.deleteSession).toHaveBeenCalledWith({
      sessionId: "session-deleted",
    });
    expect(appServerClient.updateSession).not.toHaveBeenCalled();
    expect(appServerClient.request).not.toHaveBeenCalled();
  });

  it("session mutation should notify current GUI session-list subscribers", async () => {
    const appServerClient = appServerClientMock();
    const sessionStartResult = {
      session: {
        sessionId: "session-created",
        threadId: "thread-created",
        appId: "desktop",
        workspaceId: "workspace-1",
        status: "idle" as const,
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    };
    vi.mocked(appServerClient.startSession).mockResolvedValueOnce({
      id: 1,
      result: sessionStartResult,
      response: { id: 1, result: sessionStartResult },
      notifications: [],
      messages: [],
    });
    const client = createSessionClient({
      appServerClient,
    });
    const listener = vi.fn();
    window.addEventListener(AGENT_RUNTIME_SESSIONS_CHANGED_EVENT, listener);

    try {
      await client.createAgentRuntimeSession("workspace-1", "新会话");
      await client.updateAgentRuntimeSession({
        session_id: "session-created",
        name: "已更新",
      });
      await client.archiveManyAgentRuntimeSessions(["session-created"]);
      await client.deleteAgentRuntimeSession("session-created");
    } finally {
      window.removeEventListener(
        AGENT_RUNTIME_SESSIONS_CHANGED_EVENT,
        listener,
      );
    }

    expect(listener).toHaveBeenCalledTimes(4);
    expect(
      listener.mock.calls.map(([event]) =>
        event instanceof CustomEvent ? event.detail.reason : null,
      ),
    ).toEqual(["created", "updated", "archived", "deleted"]);
  });

  it("cwd-only session create event must not publish an empty legacy workspaceId", async () => {
    const appServerClient = appServerClientMock();
    const sessionStartResult = {
      session: {
        sessionId: "session-cwd",
        threadId: "thread-cwd",
        appId: "desktop",
        status: "idle" as const,
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    };
    vi.mocked(appServerClient.startSession).mockResolvedValueOnce({
      id: 1,
      result: sessionStartResult,
      response: { id: 1, result: sessionStartResult },
      notifications: [],
      messages: [],
    });
    const client = createSessionClient({
      appServerClient,
    });
    const listener = vi.fn();
    window.addEventListener(AGENT_RUNTIME_SESSIONS_CHANGED_EVENT, listener);

    try {
      await client.createAgentRuntimeSession(" ", "空项目对话", undefined, {
        workingDir: "/repo/skill-think",
      });
    } finally {
      window.removeEventListener(
        AGENT_RUNTIME_SESSIONS_CHANGED_EVENT,
        listener,
      );
    }

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      reason: "created",
      sessionId: "session-cwd",
      workspaceId: undefined,
    });
  });
});
