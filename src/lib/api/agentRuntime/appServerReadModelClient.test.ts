import { describe, expect, it, vi } from "vitest";
import { createAppServerReadModelClient } from "./appServerReadModelClient";
import type { AppServerSessionReadClient } from "./appServerReadModelClient";

function appServerClientMock(): AppServerSessionReadClient {
  return {
    readSession: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "agent-chat",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:02.000Z",
        },
        turns: [
          {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "running",
          },
        ],
      },
      response: {
        id: 1,
        result: {},
      },
      notifications: [],
      messages: [],
    }),
  };
}

describe("appServerReadModelClient", () => {
  it("应通过 agentSession/read 读取并投影 thread read model", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerReadModelClient({ appServerClient });

    await expect(
      client.getAgentRuntimeThreadRead(" session-1 "),
    ).resolves.toMatchObject({
      thread_id: "thread-1",
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
    });

    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("缺少 sessionId 时应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const client = createAppServerReadModelClient({ appServerClient });

    await expect(client.getAgentRuntimeThreadRead(" ")).rejects.toThrow(
      "sessionId is required to read App Server session",
    );

    expect(appServerClient.readSession).not.toHaveBeenCalled();
  });
});
