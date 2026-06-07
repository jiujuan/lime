import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeMessage,
  encodeMessage,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "app-server-client";

const {
  fakeConnection,
  recordedRequests,
  resetFakeConnection,
  setTurnStartRequestMode,
  FakeAppServerSidecarLifecycle,
} = vi.hoisted(() => {
  const recordedRequests: JsonRpcRequest[] = [];
  const mirroredNotifications: JsonRpcMessage[] = [];
  let turnStartRequestMode: "resolve" | "hang" = "resolve";
  const fakeConnection = {
    request: vi.fn(async (request: JsonRpcRequest) => {
      recordedRequests.push(request);
      const notification = {
        method: "agentSession/event",
        params: {
          event: {
            eventId: `evt-${request.id}`,
            sequence: 1,
            sessionId: "session-b",
            turnId: "turn-b",
            type: "message.delta",
            timestamp: "2026-06-06T00:00:00.000Z",
            payload: { text: "第一段" },
          },
        },
      };
      if (request.method === "agentSession/turn/start") {
        mirroredNotifications.push(notification);
        if (turnStartRequestMode === "hang") {
          await new Promise(() => undefined);
        }
      }
      return {
        result: {
          ok: true,
        },
        messages: [
          ...(request.method === "agentSession/turn/start" ? [notification] : []),
          {
            id: request.id,
            result: {
              internalId: request.id,
              method: request.method,
            },
          },
        ],
      };
    }),
    nextNotification: vi.fn(async () => {
      const notification = mirroredNotifications.shift();
      if (!notification) {
        throw new Error("no notification");
      }
      return notification;
    }),
  };

  class FakeAppServerSidecarLifecycle {
    async start() {
      return {
        initializeResponse: {
          serverInfo: {
            name: "app-server",
            version: "0.0.0-test",
            protocolVersion: "appserver.v0",
          },
          platform: {
            family: "desktop",
            os: "macos",
          },
          capabilities: {},
        },
        connection: fakeConnection,
      };
    }

    async stop() {
      return undefined;
    }
  }

  return {
    fakeConnection,
    recordedRequests,
    resetFakeConnection: () => {
      recordedRequests.length = 0;
      mirroredNotifications.length = 0;
      turnStartRequestMode = "resolve";
      fakeConnection.request.mockClear();
      fakeConnection.nextNotification.mockClear();
    },
    setTurnStartRequestMode: (mode: "resolve" | "hang") => {
      turnStartRequestMode = mode;
    },
    FakeAppServerSidecarLifecycle,
  };
});

vi.mock("electron", () => ({
  app: {
    getAppPath: () => process.cwd(),
    getVersion: () => "0.0.0-test",
    isPackaged: false,
  },
}));

Object.defineProperty(process, "resourcesPath", {
  configurable: true,
  value: process.cwd(),
});

vi.mock("app-server-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("app-server-client")>();
  return {
    ...actual,
    AppServerSidecarLifecycle: FakeAppServerSidecarLifecycle,
    readReleaseManifest: vi.fn(async () => {
      throw new Error("no packaged manifest");
    }),
  };
});

describe("ElectronAppServerHost", () => {
  beforeEach(() => {
    resetFakeConnection();
  });

  it("转发 JSON-RPC 时隔离并发前端 request id，并在返回前还原原 id", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    const first = host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 1,
          method: "agentSession/read",
          params: { sessionId: "session-a" },
        }),
      ],
    });
    const second = host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 1,
          method: "agentSession/turn/start",
          params: { sessionId: "session-b" },
        }),
      ],
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const firstMessages = firstResult.lines.map(decodeMessage);
    const secondMessages = secondResult.lines.map(decodeMessage);
    const firstMessage = firstMessages.find((message) => "id" in message);
    const secondMessage = secondMessages.find((message) => "id" in message);

    expect(recordedRequests).toHaveLength(2);
    expect(recordedRequests[0]?.id).not.toBe(recordedRequests[1]?.id);
    expect(recordedRequests.map((request) => request.id)).toEqual([
      "electron-host:1",
      "electron-host:2",
    ]);
    expect(firstMessage).toMatchObject({
      id: 1,
      result: {
        internalId: "electron-host:1",
        method: "agentSession/read",
      },
    });
    expect(secondMessage).toMatchObject({
      id: 1,
      result: {
        internalId: "electron-host:2",
        method: "agentSession/turn/start",
      },
    });
  });

  it("drainEvents 应能读取被长 turn/start 请求镜像的流式 notification", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 1,
          method: "agentSession/turn/start",
          params: {
            sessionId: "session-b",
            turnId: "turn-b",
            input: { text: "生成草稿" },
          },
        }),
      ],
    });

    const drained = await host.drainEvents({ limit: 1 });
    const message = decodeMessage(drained.lines[0] ?? "");

    expect(message).toMatchObject({
      method: "agentSession/event",
      params: {
        event: {
          eventId: expect.stringMatching(/^evt-electron-host:\d+$/),
          sessionId: "session-b",
          turnId: "turn-b",
          type: "message.delta",
          payload: { text: "第一段" },
        },
      },
    });
    expect(fakeConnection.nextNotification).toHaveBeenCalled();
  });

  it("长 turn/start 未返回时应先回 accepted，避免阻塞后续前端提交", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    setTurnStartRequestMode("hang");
    const host = new ElectronAppServerHost();

    const result = await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 1,
          method: "agentSession/turn/start",
          params: {
            sessionId: "session-b",
            turnId: "turn-b",
            input: { text: "生成长内容" },
          },
        }),
      ],
    });
    const messages = result.lines.map(decodeMessage);

    expect(recordedRequests).toHaveLength(1);
    expect(recordedRequests[0]).toMatchObject({
      id: "electron-host:1",
      method: "agentSession/turn/start",
    });
    expect(messages).toEqual([
      {
        id: 1,
        result: {
          turn: expect.objectContaining({
            turnId: "turn-b",
            sessionId: "session-b",
            threadId: "session-b",
            status: "accepted",
          }),
        },
      },
    ]);

    const drained = await host.drainEvents({ limit: 1 });
    expect(decodeMessage(drained.lines[0] ?? "")).toMatchObject({
      method: "agentSession/event",
      params: {
        event: {
          sessionId: "session-b",
          turnId: "turn-b",
          type: "message.delta",
        },
      },
    });
  });

  it("current Agent App UI runtime start 应覆盖 App Server readiness 等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: "ui-runtime-start",
          method: "agentAppUiRuntime/start",
          params: {
            appId: "content-factory-sdk-fixture-app",
            entryKey: "dashboard",
          },
        }),
      ],
    });

    const requestCalls = fakeConnection.request.mock.calls as unknown as Array<
      [JsonRpcRequest, string, { timeoutMs?: number }]
    >;
    expect(recordedRequests).toHaveLength(1);
    expect(recordedRequests[0]).toMatchObject({
      id: "electron-host:1",
      method: "agentAppUiRuntime/start",
    });
    expect(requestCalls[0]?.[1]).toBe("agentAppUiRuntime/start");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 60000 });
  });
});
