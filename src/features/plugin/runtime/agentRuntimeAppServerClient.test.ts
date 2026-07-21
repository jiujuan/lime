import { describe, expect, it, vi } from "vitest";

import type {
  AppServerAgentSessionActionRespondParams,
  AppServerAgentSessionActionRespondResponse,
  AppServerRequestResult,
  AppServerThread,
  AppServerThreadStartParams,
  AppServerThreadStartResponse,
  AppServerThreadReadParams,
  AppServerThreadReadResponse,
  AppServerTurnSteerParams,
  AppServerTurnSteerResponse,
} from "@/lib/api/appServer";
import type {
  AgentRuntimeLifecycleNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@limecloud/app-server-client";
import {
  createPluginRuntimeClientFromAppServer,
  createPluginRuntimeSessionResolver,
  createDefaultPluginRuntimeHostOptions,
} from "./agentRuntimeAppServerClient";

function appServerResult<T>(id: number, result: T): AppServerRequestResult<T> {
  const response = { jsonrpc: "2.0" as const, id, result };
  return {
    id,
    result,
    response,
    notifications: [],
    messages: [response],
  };
}

function buildAppServerClient() {
  const thread: AppServerThread = {
    cliVersion: "0.0.0-test",
    createdAt: 1_747_267_200,
    cwd: "",
    ephemeral: false,
    id: "thread-app-server",
    modelProvider: "openai",
    preview: "Plugin runtime task",
    sessionId: "session-app-server",
    source: "plugin",
    status: { type: "idle" },
    turns: [],
    updatedAt: 1_747_267_200,
  };
  return {
    startSession: vi.fn(async (request: AppServerThreadStartParams) =>
      appServerResult<AppServerThreadStartResponse>(1, {
        approvalPolicy: null,
        approvalsReviewer: null,
        cwd: request.cwd ?? "",
        model: request.model ?? "unknown",
        modelProvider: request.modelProvider ?? "unknown",
        sandbox: null,
        thread: {
          ...thread,
          cwd: request.cwd ?? "",
          name: request.serviceName,
          preview: request.serviceName ?? thread.preview,
          source: request.threadSource ?? thread.source,
          threadSource: request.threadSource,
        },
      }),
    ),
    startTurn: vi.fn(async (_request: TurnStartParams) =>
      appServerResult<TurnStartResponse>(2, {
        turn: {
          id: "turn-app-server",
          items: [],
          itemsView: "full" as const,
          status: "inProgress" as const,
          startedAt: Date.parse("2026-05-15T00:00:01.000Z") / 1_000,
        },
      }),
    ),
    steerTurn: vi.fn(async (_request: AppServerTurnSteerParams) =>
      appServerResult<AppServerTurnSteerResponse>(3, {
        turnId: "turn-app-server",
      }),
    ),
    readThread: vi.fn(async (request: AppServerThreadReadParams) =>
      appServerResult<AppServerThreadReadResponse>(3, {
        thread: {
          cliVersion: "0.0.0-test",
          createdAt: 1_747_267_200,
          cwd: "/tmp/plugin-runtime",
          ephemeral: false,
          id: request.threadId,
          modelProvider: "openai",
          preview: "Plugin runtime task",
          sessionId: "session-app-server",
          source: "appServer",
          status: { type: "active" as const },
          turns: [],
          updatedAt: 1_747_267_202,
        },
      }),
    ),
    cancelTurn: vi.fn(async (_request: TurnInterruptParams) =>
      appServerResult<TurnInterruptResponse>(4, {}),
    ),
    respondAction: vi.fn(
      async (_request: AppServerAgentSessionActionRespondParams) =>
        appServerResult<AppServerAgentSessionActionRespondResponse>(5, {}),
    ),
  };
}

describe("agentRuntimeAppServerClient", () => {
  it("把前端 AppServerClient 映射为标准 AgentRuntimeClient lifecycle surface", async () => {
    const appServerClient = buildAppServerClient();
    const runtimeClient =
      createPluginRuntimeClientFromAppServer(appServerClient);

    await runtimeClient.startTurn({
      threadId: "thread-app-server",
      input: [{ type: "text", text: "开始" }],
    });
    await runtimeClient.steerTurn({
      threadId: "thread-app-server",
      expectedTurnId: "turn-app-server",
      input: [{ type: "text", text: "补充要求" }],
    });
    await runtimeClient.readThread({
      threadId: "thread-app-server",
      includeTurns: true,
    });
    await runtimeClient.cancelTurn({
      threadId: "thread-app-server",
      turnId: "turn-app-server",
    });
    await runtimeClient.respondAction({
      sessionId: "session-app-server",
      requestId: "request-app-server",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
    });

    expect(appServerClient.startTurn).toHaveBeenCalledWith({
      threadId: "thread-app-server",
      input: [{ type: "text", text: "开始" }],
    });
    expect(appServerClient.steerTurn).toHaveBeenCalledWith({
      threadId: "thread-app-server",
      expectedTurnId: "turn-app-server",
      input: [{ type: "text", text: "补充要求" }],
    });
    expect(appServerClient.readThread).toHaveBeenCalledWith({
      threadId: "thread-app-server",
      includeTurns: true,
    });
    expect(appServerClient.cancelTurn).toHaveBeenCalledWith({
      threadId: "thread-app-server",
      turnId: "turn-app-server",
    });
    expect(appServerClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-app-server",
      requestId: "request-app-server",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
    });
  });

  it("拒绝 Plugin synthetic event，并用 direct v2 lifecycle 保留 pipeline 配置", async () => {
    const appServerClient = buildAppServerClient();
    const runtimeClient = createPluginRuntimeClientFromAppServer(
      appServerClient,
      {
        sequenceVerifierMode: "off",
        adapters: [
          ({ event }) => {
            if (event.method !== "item/started") {
              return;
            }
            return [
              event,
              {
                method: "item/completed" as const,
                params: {
                  threadId: event.params.threadId,
                  turnId: event.params.turnId,
                  completedAtMs: 2,
                  item: {
                    ...event.params.item,
                    text: "AB",
                  },
                },
              },
            ];
          },
        ],
      },
    ) as ReturnType<typeof createPluginRuntimeClientFromAppServer> & {
      dispatchEvent(message: unknown): Promise<boolean>;
      subscribeLifecycleEvents(
        listener: (event: AgentRuntimeLifecycleNotification) => void,
      ): {
        unsubscribe(): void;
      };
    };
    const received: string[] = [];
    const subscription = runtimeClient.subscribeLifecycleEvents((event) => {
      received.push(event.method);
    });

    await expect(
      runtimeClient.dispatchEvent({
        method: "plugin/synthetic",
        params: {},
      }),
    ).resolves.toBe(false);
    await expect(
      runtimeClient.dispatchEvent({
        method: "item/started",
        params: {
          threadId: "thread-app-server",
          turnId: "turn-app-server",
          startedAtMs: 1,
          item: {
            id: "msg-plugin",
            type: "agentMessage",
            text: "A",
          },
        },
      }),
    ).resolves.toBe(true);

    expect(received).toEqual(["item/started", "item/completed"]);
    subscription.unsubscribe();
  });

  it("通过 thread/start 为 Plugin 默认宿主创建 current session", async () => {
    const appServerClient = buildAppServerClient();
    const ensureSession = createPluginRuntimeSessionResolver(appServerClient);

    const identity = await ensureSession({
      appId: "content-factory-app",
      entryKey: "dashboard",
      workspaceId: "workspace-1",
      taskId: "plugin-task-1",
      taskKind: "content.scenario_planning",
      title: "生成内容场景",
      prompt: "基于项目知识生成内容场景",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      metadata: {
        plugin_host_bridge: {
          source: "plugin_runtime_page",
        },
      },
    });

    expect(identity).toEqual({
      sessionId: "session-app-server",
      threadId: "thread-app-server",
    });
    expect(appServerClient.startSession).toHaveBeenCalledWith({
      serviceName: "生成内容场景",
      threadSource: "plugin",
      historyMode: "paginated",
    });
  });

  it("默认 Host options 同时提供 runtime client 与 session resolver，且 session 失败时 fail closed", async () => {
    const appServerClient = buildAppServerClient();
    appServerClient.startSession.mockResolvedValueOnce(
      appServerResult<AppServerThreadStartResponse>(1, {
        approvalPolicy: null,
        approvalsReviewer: null,
        cwd: "",
        model: "unknown",
        modelProvider: "unknown",
        sandbox: null,
        thread: {
          cliVersion: "0.0.0-test",
          createdAt: 1_747_267_200,
          cwd: "",
          ephemeral: false,
          id: "",
          modelProvider: "unknown",
          preview: "",
          sessionId: "session-app-server",
          source: "plugin",
          status: { type: "idle" },
          turns: [],
          updatedAt: 1_747_267_200,
        },
      }),
    );

    const options = createDefaultPluginRuntimeHostOptions(appServerClient);

    expect(options.runtimeClient.startTurn).toBeTypeOf("function");
    expect(options.ensureSession).toBeTypeOf("function");
    await expect(
      options.ensureSession({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content.scenario_planning",
      }),
    ).rejects.toThrow(
      "thread/start did not return a valid Plugin runtime identity",
    );
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
  });
});
