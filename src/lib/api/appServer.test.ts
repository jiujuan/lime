import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_CAPABILITY_LIST,
  APP_SERVER_METHOD_EVIDENCE_EXPORT,
  APP_SERVER_METHOD_INITIALIZED,
  APP_SERVER_METHOD_INITIALIZE,
  APP_SERVER_PROTOCOL_VERSION,
  AppServerClient,
  AppServerRpcError,
  createAppServerRequest,
  decodeAppServerMessage,
  encodeAppServerMessage,
  expectAppServerResponse,
} from "./appServer";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

describe("App Server API", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
  });

  it("initialize 应通过 App Server JSON-RPC 命令完成握手", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        lines: [
          line({
            id: 1,
            result: {
              serverInfo: {
                name: "app-server",
                version: "1.58.0",
                protocolVersion: APP_SERVER_PROTOCOL_VERSION,
              },
              platform: {
                family: "desktop",
                os: "macos",
              },
              capabilities: {
                agentSession: true,
                capabilityDiscovery: true,
                artifact: true,
                evidence: true,
                workspace: true,
              },
            },
          }),
        ],
      })
      .mockResolvedValueOnce({ lines: [] });

    const client = new AppServerClient();
    const result = await client.initialize({
      clientInfo: {
        name: "content_studio",
        version: "0.1.0",
      },
      capabilities: {
        eventMethods: [APP_SERVER_METHOD_AGENT_SESSION_EVENT],
      },
    });

    expect(result.result.serverInfo.name).toBe("app-server");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "app_server_handle_json_lines",
      {
        request: {
          lines: [
            line({
              id: 1,
              method: APP_SERVER_METHOD_INITIALIZE,
              params: {
                clientInfo: {
                  name: "content_studio",
                  version: "0.1.0",
                },
                capabilities: {
                  eventMethods: [APP_SERVER_METHOD_AGENT_SESSION_EVENT],
                },
              },
            }),
          ],
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "app_server_handle_json_lines",
      {
        request: {
          lines: [
            line({
              method: APP_SERVER_METHOD_INITIALIZED,
              params: {},
            }),
          ],
        },
      },
    );
  });

  it("listCapabilities 应透传 sessionId scope", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 3,
          result: {
            capabilities: [
              {
                id: "session.draft.write",
                title: "Session Draft Write",
                methods: [APP_SERVER_METHOD_AGENT_SESSION_TURN_START],
              },
            ],
            nextCursor: "1",
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 3 });
    const result = await client.listCapabilities({
      appId: "content-studio",
      workspaceId: "default",
      sessionId: "session-1",
      limit: 1,
    });

    expect(result.result.capabilities[0].id).toBe("session.draft.write");
    expect(result.result.nextCursor).toBe("1");
    expect(safeInvoke).toHaveBeenCalledWith("app_server_handle_json_lines", {
      request: {
        lines: [
          line({
            id: 3,
            method: APP_SERVER_METHOD_CAPABILITY_LIST,
            params: {
              appId: "content-studio",
              workspaceId: "default",
              sessionId: "session-1",
              limit: 1,
            },
          }),
        ],
      },
    });
  });

  it("readArtifacts 应通过 App Server JSON-RPC 读取 artifact summary/content", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 5,
          result: {
            artifacts: [
              {
                artifactRef: "artifact-report",
                eventId: "evt-artifact-1",
                sequence: 7,
                turnId: "turn-1",
                artifactId: "artifact-report",
                path: ".app-server/artifacts/report.md",
                title: "Report",
                kind: "markdown",
                status: "ready",
                content: "# Report",
                contentStatus: "available",
                metadata: {
                  version: 2,
                },
              },
            ],
            nextCursor: "1",
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 5 });
    const result = await client.readArtifacts({
      sessionId: "session-1",
      turnId: "turn-1",
      artifactRef: "artifact-report",
      includeContent: true,
      limit: 1,
    });

    expect(result.result.artifacts[0].artifactRef).toBe("artifact-report");
    expect(result.result.artifacts[0].content).toBe("# Report");
    expect(result.result.artifacts[0].contentStatus).toBe("available");
    expect(result.result.artifacts[0].metadata).toEqual({ version: 2 });
    expect(result.result.nextCursor).toBe("1");
    expect(safeInvoke).toHaveBeenCalledWith("app_server_handle_json_lines", {
      request: {
        lines: [
          line({
            id: 5,
            method: APP_SERVER_METHOD_ARTIFACT_READ,
            params: {
              sessionId: "session-1",
              turnId: "turn-1",
              artifactRef: "artifact-report",
              includeContent: true,
              limit: 1,
            },
          }),
        ],
      },
    });
  });

  it("exportEvidence 应通过 App Server JSON-RPC 导出 current evidence snapshot", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 6,
          result: {
            session: {
              sessionId: "session-1",
              threadId: "thread-1",
              appId: "content-studio",
              status: "running",
              createdAt: "2026-06-05T00:00:00.000Z",
              updatedAt: "2026-06-05T00:00:01.000Z",
            },
            turns: [
              {
                turnId: "turn-1",
                sessionId: "session-1",
                threadId: "thread-1",
                status: "accepted",
              },
            ],
            events: [
              {
                eventId: "evt-1",
                sequence: 1,
                sessionId: "session-1",
                threadId: "thread-1",
                turnId: "turn-1",
                type: "message.delta",
                timestamp: "2026-06-05T00:00:01Z",
                payload: {
                  text: "draft",
                },
              },
            ],
            artifacts: [
              {
                artifactRef: "artifact-report",
                eventId: "evt-2",
                sequence: 2,
                turnId: "turn-1",
                artifactId: "artifact-report",
                path: ".app-server/artifacts/report.md",
                contentStatus: "notRequested",
              },
            ],
            exportedAt: "2026-06-05T00:00:02.000Z",
            evidencePack: {
              packRelativeRoot: ".lime/harness/sessions/session-1/evidence",
              packAbsoluteRoot:
                "/workspace/.lime/harness/sessions/session-1/evidence",
              exportedAt: "2026-06-05T00:00:03.000Z",
              threadStatus: "running",
              latestTurnStatus: "accepted",
              turnCount: 1,
              itemCount: 3,
              pendingRequestCount: 0,
              queuedTurnCount: 0,
              recentArtifactCount: 1,
              knownGaps: ["gui_smoke_not_run"],
              observabilitySummary: {
                schema_version: "runtime-evidence-pack.v1",
              },
              completionAuditSummary: {
                decision: "in_progress",
              },
              artifacts: [
                {
                  kind: "summary",
                  title: "Evidence Summary",
                  relativePath:
                    ".lime/harness/sessions/session-1/evidence/summary.md",
                  bytes: 128,
                },
              ],
            },
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 6 });
    const result = await client.exportEvidence({
      sessionId: "session-1",
      turnId: "turn-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });

    expect(result.result.session.sessionId).toBe("session-1");
    expect(result.result.turns[0].turnId).toBe("turn-1");
    expect(result.result.events[0].type).toBe("message.delta");
    expect(result.result.artifacts[0].artifactRef).toBe("artifact-report");
    expect(result.result.artifacts[0].contentStatus).toBe("notRequested");
    expect(result.result.exportedAt).toBe("2026-06-05T00:00:02.000Z");
    expect((result.result as { threadStatus?: string }).threadStatus).toBeUndefined();
    expect(result.result.evidencePack?.threadStatus).toBe("running");
    expect(
      (result.result.evidencePack?.completionAuditSummary as { decision?: string })
        ?.decision,
    ).toBe("in_progress");
    expect(safeInvoke).toHaveBeenCalledWith("app_server_handle_json_lines", {
      request: {
        lines: [
          line({
            id: 6,
            method: APP_SERVER_METHOD_EVIDENCE_EXPORT,
            params: {
              sessionId: "session-1",
              turnId: "turn-1",
              includeEvents: true,
              includeArtifacts: true,
              includeEvidencePack: true,
            },
          }),
        ],
      },
    });
  });

  it("startTurn 应返回同步 result 并保留同批 notification", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 7,
          result: {
            turn: {
              turnId: "turn-1",
              sessionId: "session-1",
              threadId: "thread-1",
              status: "accepted",
            },
          },
        }),
        line({
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-1",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "turn.accepted",
              timestamp: "2026-06-04T00:00:00Z",
              payload: {},
            },
          },
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 7 });
    const result = await client.startTurn({
      sessionId: "session-1",
      turnId: "turn-1",
      input: {
        text: "hello",
      },
      runtimeOptions: {
        stream: true,
        hostOptions: {
          adapter: "desktop",
        },
      },
      queueIfBusy: true,
      skipPreSubmitResume: true,
    });

    expect(result.result.turn.turnId).toBe("turn-1");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].method).toBe(
      APP_SERVER_METHOD_AGENT_SESSION_EVENT,
    );
    expect(safeInvoke).toHaveBeenCalledWith("app_server_handle_json_lines", {
      request: {
        lines: [
          line({
            id: 7,
            method: APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
            params: {
              sessionId: "session-1",
              turnId: "turn-1",
              input: {
                text: "hello",
              },
              runtimeOptions: {
                stream: true,
                hostOptions: {
                  adapter: "desktop",
                },
              },
              queueIfBusy: true,
              skipPreSubmitResume: true,
            },
          }),
        ],
      },
    });
  });

  it("respondAction 应通过 App Server JSON-RPC 响应 action.required", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 9,
          result: {},
        }),
      ],
    });

    const client = new AppServerClient({ initialRequestId: 9 });
    const result = await client.respondAction({
      sessionId: "session-1",
      requestId: "req-confirm-1",
      actionType: "tool_confirmation",
      confirmed: true,
      response: "allow",
      userData: {
        reason: "approved",
      },
      eventName: "agentSession/event/session-1",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });

    expect(result.result).toEqual({});
    expect(safeInvoke).toHaveBeenCalledWith("app_server_handle_json_lines", {
      request: {
        lines: [
          line({
            id: 9,
            method: APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
            params: {
              sessionId: "session-1",
              requestId: "req-confirm-1",
              actionType: "tool_confirmation",
              confirmed: true,
              response: "allow",
              userData: {
                reason: "approved",
              },
              eventName: "agentSession/event/session-1",
              actionScope: {
                sessionId: "session-1",
                threadId: "thread-1",
                turnId: "turn-1",
              },
            },
          }),
        ],
      },
    });
  });

  it("request 遇到 JSON-RPC error 时抛出 AppServerRpcError", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          id: 1,
          error: {
            code: -32010,
            message: "session not found",
            data: {
              sessionId: "missing",
            },
          },
        }),
      ],
    });

    const client = new AppServerClient();
    await expect(client.readSession({ sessionId: "missing" })).rejects.toMatchObject({
      name: "AppServerRpcError",
      code: -32010,
      data: {
        sessionId: "missing",
      },
    });
  });

  it("drainEvents 应走 app_server_drain_events 并解码 notification", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      lines: [
        line({
          method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
          params: {
            event: {
              eventId: "evt-2",
              sequence: 2,
              sessionId: "session-1",
              type: "message.delta",
              timestamp: "2026-06-04T00:00:00Z",
              payload: {
                text: "hi",
              },
            },
          },
        }),
      ],
    });

    const client = new AppServerClient();
    const messages = await client.drainEvents(5);

    expect(messages).toEqual([
      {
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: expect.objectContaining({
            eventId: "evt-2",
            type: "message.delta",
          }),
        },
      },
    ]);
    expect(safeInvoke).toHaveBeenCalledWith("app_server_drain_events", {
      request: { limit: 5 },
    });
  });

  it("JSON-RPC 编解码与 response matcher 保持稳定", () => {
    const request = createAppServerRequest(3, "agentSession/read", {
      sessionId: "session-1",
    });

    expect(decodeAppServerMessage(encodeAppServerMessage(request))).toEqual(
      request,
    );
    expect(
      expectAppServerResponse<{ ok: boolean }>(
        [
          {
            id: 3,
            result: {
              ok: true,
            },
          },
        ],
        3,
        "agentSession/read",
      ).result.ok,
    ).toBe(true);
    expect(() =>
      expectAppServerResponse(
        [
          {
            id: 4,
            error: {
              code: -32601,
              message: "method not found",
            },
          },
        ],
        4,
        "missing",
      ),
    ).toThrow(AppServerRpcError);
  });
});
