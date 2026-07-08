import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeMessage,
  encodeMessage,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "@limecloud/app-server-client";

const {
  fakeConnection,
  lifecycleConfigs,
  lifecycleOptions,
  enqueueFakeNotifications,
  recordedRequests,
  releaseDelayedStaleError,
  resetFakeConnection,
  setSystemProxyRules,
  setTurnStartRequestMode,
  waitForDelayedStaleErrorReady,
  FakeAppServerSidecarLifecycle,
  resolveProxyMock,
} = vi.hoisted(() => {
  const recordedRequests: JsonRpcRequest[] = [];
  const lifecycleConfigs: Array<{
    binaryPath: string;
    dataDir?: string;
    productDbMigrationCleanup?: string;
  }> = [];
  const lifecycleOptions: Array<{
    env?: Record<string, string | undefined>;
  }> = [];
  const mirroredNotifications: JsonRpcMessage[] = [];
  const delayedStaleErrorReadyResolvers: Array<() => void> = [];
  let systemProxyRules = "DIRECT";
  const resolveProxyMock = vi.fn(async () => systemProxyRules);
  let releaseDelayedStaleError: (() => void) | null = null;
  let turnStartRequestMode:
    | "resolve"
    | "hang"
    | "hang-request"
    | "throw-stale-once"
    | "throw-exited-before-next-message"
    | "throw-exited-before-next-message-after-release" = "resolve";
  function waitForDelayedStaleErrorRelease(): Promise<void> {
    delayedStaleErrorReadyResolvers.splice(0).forEach((resolve) => resolve());
    return new Promise((resolve) => {
      releaseDelayedStaleError = resolve;
    });
  }
  function waitForDelayedStaleErrorReady(): Promise<void> {
    if (releaseDelayedStaleError) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      delayedStaleErrorReadyResolvers.push(resolve);
    });
  }
  const fakeConnection = {
    requestUntilFirstNotificationOrResponse: vi.fn(
      async (request: JsonRpcRequest) => {
        if (turnStartRequestMode === "throw-stale-once") {
          turnStartRequestMode = "resolve";
          throw new Error("app-server sidecar stdin is closed");
        }
        if (turnStartRequestMode === "throw-exited-before-next-message") {
          throw new Error(
            "app-server exited before next message: signal=SIGTERM",
          );
        }
        if (
          turnStartRequestMode ===
          "throw-exited-before-next-message-after-release"
        ) {
          await waitForDelayedStaleErrorRelease();
          throw new Error(
            "app-server exited before next message: signal=SIGTERM",
          );
        }
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
            return {
              id: request.id,
              completed: false,
              notifications: [notification],
              messages: [notification],
            };
          }
        }
        return {
          id: request.id,
          completed: true,
          result: {
            ok: true,
          },
          response: {
            id: request.id,
            result: {
              internalId: request.id,
              method: request.method,
            },
          },
          notifications:
            request.method === "agentSession/turn/start" ? [notification] : [],
          messages: [
            ...(request.method === "agentSession/turn/start"
              ? [notification]
              : []),
            {
              id: request.id,
              result: {
                internalId: request.id,
                method: request.method,
              },
            },
          ],
        };
      },
    ),
    request: vi.fn(async (request: JsonRpcRequest) => {
      if (turnStartRequestMode === "hang-request") {
        recordedRequests.push(request);
        await new Promise(() => undefined);
      }
      if (turnStartRequestMode === "throw-stale-once") {
        turnStartRequestMode = "resolve";
        throw new Error("app-server sidecar stdin is closed");
      }
      if (turnStartRequestMode === "throw-exited-before-next-message") {
        throw new Error(
          "app-server exited before next message: signal=SIGTERM",
        );
      }
      if (
        turnStartRequestMode ===
        "throw-exited-before-next-message-after-release"
      ) {
        await waitForDelayedStaleErrorRelease();
        throw new Error(
          "app-server exited before next message: signal=SIGTERM",
        );
      }
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
          ...(request.method === "agentSession/turn/start"
            ? [notification]
            : []),
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
    transport: {
      send: vi.fn(),
    },
    nextNotification: vi.fn(async () => {
      const notification = mirroredNotifications.shift();
      if (!notification) {
        throw new Error("no notification");
      }
      return notification;
    }),
  };

  function enqueueFakeNotifications(notifications: JsonRpcMessage[]): void {
    mirroredNotifications.push(...notifications);
  }

  class FakeAppServerSidecarLifecycle {
    connected:
      | {
          initializeResponse: {
            serverInfo: {
              name: string;
              version: string;
              protocolVersion: string;
            };
            platform: {
              family: string;
              os: string;
            };
            capabilities: Record<string, unknown>;
          };
          connection: typeof fakeConnection;
        }
      | undefined;

    constructor(
      config: {
        binaryPath: string;
        dataDir?: string;
        productDbMigrationCleanup?: string;
      },
      _initializeParams: unknown,
      options: { env?: Record<string, string | undefined> } = {},
    ) {
      lifecycleConfigs.push(config);
      lifecycleOptions.push(options);
    }

    async start() {
      this.connected = {
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
      return this.connected;
    }

    async stop() {
      this.connected = undefined;
      return undefined;
    }
  }

  return {
    fakeConnection,
    lifecycleConfigs,
    lifecycleOptions,
    enqueueFakeNotifications,
    recordedRequests,
    resetFakeConnection: () => {
      recordedRequests.length = 0;
      lifecycleConfigs.length = 0;
      lifecycleOptions.length = 0;
      mirroredNotifications.length = 0;
      delayedStaleErrorReadyResolvers.length = 0;
      systemProxyRules = "DIRECT";
      resolveProxyMock.mockClear();
      releaseDelayedStaleError = null;
      turnStartRequestMode = "resolve";
      fakeConnection.request.mockClear();
      fakeConnection.requestUntilFirstNotificationOrResponse.mockClear();
      fakeConnection.transport.send.mockClear();
      fakeConnection.nextNotification.mockClear();
    },
    setSystemProxyRules: (rules: string) => {
      systemProxyRules = rules;
    },
    setTurnStartRequestMode: (
      mode:
        | "resolve"
        | "hang"
        | "throw-stale-once"
        | "throw-exited-before-next-message"
        | "throw-exited-before-next-message-after-release",
    ) => {
      turnStartRequestMode = mode;
    },
    waitForDelayedStaleErrorReady,
    releaseDelayedStaleError: () => {
      releaseDelayedStaleError?.();
    },
    FakeAppServerSidecarLifecycle,
    resolveProxyMock,
  };
});

vi.mock("./electronRuntime", () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: (name: string) =>
      name === "userData" ? "/tmp/lime-electron-user-data" : "/tmp/lime",
    getVersion: () => "0.0.0-test",
    isPackaged: false,
  },
  session: {
    defaultSession: {
      resolveProxy: resolveProxyMock,
    },
  },
}));

Object.defineProperty(process, "resourcesPath", {
  configurable: true,
  value: process.cwd(),
});

const originalPlatform = process.platform;
const proxyEnvKeys = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
] as const;

function setProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
}

vi.mock("@limecloud/app-server-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@limecloud/app-server-client")>();
  return {
    ...actual,
    AppServerSidecarLifecycle: FakeAppServerSidecarLifecycle,
    readReleaseManifest: vi.fn(async () => {
      throw new Error("no packaged manifest");
    }),
  };
});

function agentSessionEventMessage(options: {
  eventId: string;
  sequence: number;
  type: string;
}): JsonRpcMessage {
  return {
    method: "agentSession/event",
    params: {
      event: {
        eventId: options.eventId,
        sequence: options.sequence,
        sessionId: "session-b",
        turnId: "turn-b",
        type: options.type,
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: {},
      },
    },
  };
}

describe("ElectronAppServerHost", () => {
  beforeEach(() => {
    resetFakeConnection();
    delete process.env.APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP;
    for (const key of proxyEnvKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    setProcessPlatform(originalPlatform);
    for (const key of proxyEnvKeys) {
      delete process.env[key];
    }
  });

  it("启动 App Server 时应显式传入 Electron userData 下的 dataDir", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.warmup();

    expect(lifecycleConfigs).toHaveLength(1);
    expect(lifecycleConfigs[0]).toMatchObject({
      dataDir: "/tmp/lime-electron-user-data/app-server",
      productDbMigrationCleanup: "drop-tables",
    });
  });

  it("macOS 系统代理存在时应传给 App Server sidecar", async () => {
    setProcessPlatform("darwin");
    setSystemProxyRules("PROXY 127.0.0.1:7890; DIRECT");
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.warmup();

    expect(lifecycleOptions).toHaveLength(1);
    expect(lifecycleOptions[0].env).toMatchObject({
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      ALL_PROXY: "http://127.0.0.1:7890",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://127.0.0.1:7890",
      all_proxy: "http://127.0.0.1:7890",
    });
    expect(lifecycleOptions[0].env?.NO_PROXY).toContain("127.0.0.1");
    expect(lifecycleOptions[0].env?.NO_PROXY).toContain("localhost");
    expect(lifecycleOptions[0].env?.NO_PROXY).toContain("::1");
  });

  it("显式代理环境变量存在时不应被系统代理覆盖", async () => {
    setProcessPlatform("darwin");
    process.env.HTTPS_PROXY = "http://explicit.proxy:8080";
    setSystemProxyRules("PROXY 127.0.0.1:7890; DIRECT");
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.warmup();

    expect(lifecycleOptions).toHaveLength(1);
    expect(lifecycleOptions[0].env?.HTTPS_PROXY).toBeUndefined();
    expect(lifecycleOptions[0].env?.NO_PROXY).toContain("127.0.0.1");
  });

  it("支持通过环境变量配置迁移后旧 Product DB 清理策略", async () => {
    process.env.APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP = "delete-file";
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.warmup();

    expect(lifecycleConfigs).toHaveLength(1);
    expect(lifecycleConfigs[0]).toMatchObject({
      productDbMigrationCleanup: "delete-file",
    });
  });

  it("旧 Product DB 清理策略配置非法时应 fail fast", async () => {
    process.env.APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP = "truncate-all";
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await expect(host.warmup()).rejects.toThrow(
      "APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP must be one of retain, clear-rows, drop-tables, delete-file",
    );
    expect(lifecycleConfigs).toHaveLength(0);
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

  it("取消 JSON-RPC request 时应把 renderer id 映射成 sidecar 内部 id", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();
    setTurnStartRequestMode("hang-request");

    const pending = host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 7,
          method: "agentSession/read",
          params: { sessionId: "session-cancel" },
        }),
      ],
    });
    await vi.waitFor(() => {
      expect(recordedRequests).toHaveLength(1);
    });

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          method: "$/cancelRequest",
          params: { id: 7 },
        }),
      ],
    });

    expect(fakeConnection.transport.send).toHaveBeenCalledWith({
      method: "$/cancelRequest",
      params: { id: "electron-host:1" },
    });
    await expect(
      Promise.race([pending, Promise.resolve("still-pending")]),
    ).resolves.toBe("still-pending");
  });

  it("发现 stale sidecar stdin 已关闭时应丢弃旧连接并重启后重试当前请求", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setTurnStartRequestMode("throw-stale-once");

    try {
      const result = await host.handleJsonLines({
        lines: [
          encodeMessage({
            id: 1,
            method: "agentSession/read",
            params: { sessionId: "session-stale" },
          }),
        ],
      });
      const messages = result.lines.map(decodeMessage);

      expect(lifecycleConfigs).toHaveLength(2);
      expect(fakeConnection.request).toHaveBeenCalledTimes(2);
      expect(recordedRequests).toHaveLength(1);
      expect(recordedRequests[0]).toMatchObject({
        id: "electron-host:1",
        method: "agentSession/read",
      });
      expect(messages).toEqual([
        {
          id: 1,
          result: {
            internalId: "electron-host:1",
            method: "agentSession/read",
          },
        },
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        "[electron-host] app-server stale connection detected; restarting sidecar",
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("停止期间遇到 sidecar 退出等待错误时不应重启 App Server", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.warmup();
    setTurnStartRequestMode("throw-exited-before-next-message-after-release");
    const request = host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 1,
          method: "agentSession/read",
          params: { sessionId: "session-closing" },
        }),
      ],
    });
    await waitForDelayedStaleErrorReady();
    await host.stop();
    releaseDelayedStaleError();

    await expect(request).rejects.toThrow("app-server host is stopping");
    expect(lifecycleConfigs).toHaveLength(1);
    expect(fakeConnection.request).toHaveBeenCalledTimes(1);
    expect(recordedRequests).toHaveLength(0);
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

  it("drainEvents includeRecent 应允许第二观察者读取最近已消费 notification", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();
    enqueueFakeNotifications([
      agentSessionEventMessage({
        eventId: "evt-tool-started",
        sequence: 2,
        type: "tool.started",
      }),
    ]);

    const consumed = await host.drainEvents({ limit: 1 });
    expect(decodeMessage(consumed.lines[0] ?? "")).toMatchObject({
      method: "agentSession/event",
      params: {
        event: {
          eventId: "evt-tool-started",
          type: "tool.started",
        },
      },
    });

    const replayed = await host.drainEvents({
      includeRecent: true,
      limit: 5,
    });
    const replayedMessages = replayed.lines.map(decodeMessage);

    expect(replayedMessages).toEqual([
      expect.objectContaining({
        method: "agentSession/event",
        params: {
          event: expect.objectContaining({
            eventId: "evt-tool-started",
            type: "tool.started",
          }),
        },
      }),
    ]);
  });

  it("drainEvents includeRecent 应按 eventId 去重并保留工具生命周期终态", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();
    enqueueFakeNotifications([
      agentSessionEventMessage({
        eventId: "evt-tool-started",
        sequence: 2,
        type: "tool.started",
      }),
      agentSessionEventMessage({
        eventId: "evt-tool-result",
        sequence: 3,
        type: "tool.result",
      }),
      agentSessionEventMessage({
        eventId: "evt-turn-completed",
        sequence: 4,
        type: "turn.completed",
      }),
      agentSessionEventMessage({
        eventId: "evt-tool-result",
        sequence: 3,
        type: "tool.result",
      }),
    ]);

    await host.drainEvents({ limit: 4 });

    const replayed = await host.drainEvents({
      includeRecent: true,
      limit: 3,
    });
    const events = replayed.lines
      .map(decodeMessage)
      .map((message) =>
        "params" in message &&
        message.params &&
        typeof message.params === "object" &&
        !Array.isArray(message.params)
          ? (message.params as { event?: unknown }).event
          : null,
      )
      .filter(Boolean) as Array<{ eventId: string; type: string }>;

    expect(events.map((event) => event.eventId)).toEqual([
      "evt-tool-started",
      "evt-tool-result",
      "evt-turn-completed",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.result",
      "turn.completed",
    ]);
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

  it("长 turn/start 返回 accepted 后不应阻塞后续读模型请求", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    setTurnStartRequestMode("hang");
    const host = new ElectronAppServerHost();

    const turnResult = await host.handleJsonLines({
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
    const turnMessages = turnResult.lines.map(decodeMessage);
    expect(turnMessages).toEqual([
      {
        id: 1,
        result: {
          turn: expect.objectContaining({
            turnId: "turn-b",
            sessionId: "session-b",
            status: "accepted",
          }),
        },
      },
    ]);

    setTurnStartRequestMode("resolve");
    const listResult = await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: 2,
          method: "agentSession/list",
          params: { limit: 20 },
        }),
      ],
    });
    const listMessages = listResult.lines.map(decodeMessage);

    expect(recordedRequests.map((request) => request.method)).toEqual([
      "agentSession/turn/start",
      "agentSession/list",
    ]);
    expect(listMessages).toEqual([
      {
        id: 2,
        result: {
          internalId: "electron-host:2",
          method: "agentSession/list",
        },
      },
    ]);
  });

  it("current Plugin UI runtime start 应覆盖 App Server readiness 等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: "ui-runtime-start",
          method: "pluginUiRuntime/start",
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
      method: "pluginUiRuntime/start",
    });
    expect(requestCalls[0]?.[1]).toBe("pluginUiRuntime/start");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 60000 });
  });

  it("current Plugin local package inspect 应覆盖包检查等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: "local-package-inspect",
          method: "pluginLocalPackage/inspect",
          params: {
            appDir:
              "/Users/coso/Documents/dev/ai/limecloud/content-factory-app",
          },
        }),
      ],
    });

    const requestCalls = fakeConnection.request.mock.calls as unknown as Array<
      [JsonRpcRequest, string, { timeoutMs?: number }]
    >;
    expect(recordedRequests).toHaveLength(1);
    expect(requestCalls[0]?.[1]).toBe("pluginLocalPackage/inspect");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 240000 });
  });

  it("current Plugin installed save 应覆盖本地安装写入等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: "installed-save",
          method: "pluginInstalled/save",
          params: {
            state: {
              appId: "content-factory-app",
            },
          },
        }),
      ],
    });

    const requestCalls = fakeConnection.request.mock.calls as unknown as Array<
      [JsonRpcRequest, string, { timeoutMs?: number }]
    >;
    expect(recordedRequests).toHaveLength(1);
    expect(requestCalls[0]?.[1]).toBe("pluginInstalled/save");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 240000 });
  });

  it("current conversation import commit 应覆盖大样本导入等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      lines: [
        encodeMessage({
          id: "conversation-import-commit",
          method: "conversationImport/thread/commit",
          params: {
            sourceClient: "codex",
            sourceThreadId: "thread-1",
            confirmed: true,
          },
        }),
      ],
    });

    const requestCalls = fakeConnection.request.mock.calls as unknown as Array<
      [JsonRpcRequest, string, { timeoutMs?: number }]
    >;
    expect(requestCalls[0]?.[1]).toBe("conversationImport/thread/commit");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 180000 });
  });

  it("current conversation import commit 支持 request 级长导入等待窗口", async () => {
    const { ElectronAppServerHost } = await import("./appServerHost");
    const host = new ElectronAppServerHost();

    await host.handleJsonLines({
      timeoutMs: 240000,
      lines: [
        encodeMessage({
          id: "conversation-import-commit-long-sample",
          method: "conversationImport/thread/commit",
          params: {
            sourceClient: "codex",
            sourceThreadId: "thread-1",
            confirmed: true,
          },
        }),
      ],
    });

    const requestCalls = fakeConnection.request.mock.calls as unknown as Array<
      [JsonRpcRequest, string, { timeoutMs?: number }]
    >;
    expect(requestCalls[0]?.[1]).toBe("conversationImport/thread/commit");
    expect(requestCalls[0]?.[2]).toMatchObject({ timeoutMs: 240000 });
  });
});
