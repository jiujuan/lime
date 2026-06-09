import { describe, expect, it, vi } from "vitest";
import type { AppServerSessionRpcClient } from "./appServerSessionClient";
import { createSessionClient } from "./sessionClient";

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
  };
}

describe("agentRuntime sessionClient current App Server boundary", () => {
  it("session archive / restore / delete projection must use agentSession/update", async () => {
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
    expect(appServerClient.updateSession).toHaveBeenNthCalledWith(3, {
      sessionId: "session-deleted",
      archived: true,
    });
    expect(appServerClient.request).not.toHaveBeenCalled();
  });

  it("delete projection 不应直接请求 App Server 通用 request 或 legacy bridge", async () => {
    const appServerClient = appServerClientMock();
    const client = createSessionClient({
      appServerClient,
    });

    await expect(
      client.deleteAgentRuntimeSession(" session-deleted "),
    ).resolves.toBeUndefined();

    expect(appServerClient.updateSession).toHaveBeenCalledWith({
      sessionId: "session-deleted",
      archived: true,
    });
    expect(appServerClient.request).not.toHaveBeenCalled();
  });
});
