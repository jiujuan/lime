import { describe, expect, it, vi } from "vitest";

import type {
  AppServerAgentSessionActionRespondParams,
  AppServerAgentSessionActionRespondResponse,
  AppServerAgentSessionReadParams,
  AppServerAgentSessionReadResponse,
  AppServerAgentSessionStartParams,
  AppServerAgentSessionStartResponse,
  AppServerAgentSessionTurnCancelParams,
  AppServerAgentSessionTurnCancelResponse,
  AppServerAgentSessionTurnStartParams,
  AppServerAgentSessionTurnStartResponse,
  AppServerRequestResult,
} from "@/lib/api/appServer";
import {
  createAgentAppRuntimeClientFromAppServer,
  createAgentAppRuntimeSessionResolver,
  createDefaultAgentAppRuntimeHostOptions,
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
  return {
    startSession: vi.fn(async (request: AppServerAgentSessionStartParams) =>
      appServerResult<AppServerAgentSessionStartResponse>(1, {
        session: {
          sessionId: "session-app-server",
          threadId: "thread-app-server",
          appId: request.appId,
          workspaceId: request.workspaceId,
          status: "idle" as const,
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
          businessObjectRef: request.businessObjectRef,
        },
      }),
    ),
    startTurn: vi.fn(async (_request: AppServerAgentSessionTurnStartParams) =>
      appServerResult<AppServerAgentSessionTurnStartResponse>(2, {
        turn: {
          turnId: "turn-app-server",
          sessionId: "session-app-server",
          threadId: "thread-app-server",
          status: "accepted" as const,
          startedAt: "2026-05-15T00:00:01.000Z",
        },
      }),
    ),
    readSession: vi.fn(async (_request: AppServerAgentSessionReadParams) =>
      appServerResult<AppServerAgentSessionReadResponse>(3, {
        session: {
          sessionId: "session-app-server",
          threadId: "thread-app-server",
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          status: "running" as const,
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:02.000Z",
        },
        turns: [],
      }),
    ),
    cancelTurn: vi.fn(async (_request: AppServerAgentSessionTurnCancelParams) =>
      appServerResult<AppServerAgentSessionTurnCancelResponse>(4, {}),
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
      createAgentAppRuntimeClientFromAppServer(appServerClient);

    await runtimeClient.startTurn({
      sessionId: "session-app-server",
      input: { text: "开始", attachments: [] },
    });
    await runtimeClient.readThread({ sessionId: "session-app-server" });
    await runtimeClient.cancelTurn({
      sessionId: "session-app-server",
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
      sessionId: "session-app-server",
      input: { text: "开始", attachments: [] },
    });
    expect(appServerClient.readSession).toHaveBeenCalledWith({
      sessionId: "session-app-server",
    });
    expect(appServerClient.cancelTurn).toHaveBeenCalledWith({
      sessionId: "session-app-server",
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

  it("通过 agentSession/start 为 Agent App 默认宿主创建 current session", async () => {
    const appServerClient = buildAppServerClient();
    const ensureSession =
      createAgentAppRuntimeSessionResolver(appServerClient);

    const sessionId = await ensureSession({
      appId: "content-factory-app",
      entryKey: "dashboard",
      workspaceId: "workspace-1",
      taskId: "agent-app-task-1",
      taskKind: "content.scenario_planning",
      title: "生成内容场景",
      prompt: "基于项目知识生成内容场景",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      metadata: {
        agent_app_host_bridge: {
          source: "agent_app_runtime_page",
        },
      },
    });

    expect(sessionId).toBe("session-app-server");
    expect(appServerClient.startSession).toHaveBeenCalledWith({
      appId: "content-factory-app",
      workspaceId: "workspace-1",
      businessObjectRef: expect.objectContaining({
        kind: "agent_app.task",
        id: "content-factory-app:agent-app-task-1",
        title: "生成内容场景",
        metadata: expect.objectContaining({
          source: "agent_app_runtime_page",
          appId: "content-factory-app",
          entryKey: "dashboard",
          taskId: "agent-app-task-1",
          taskKind: "content.scenario_planning",
        }),
      }),
    });
  });

  it("默认 Host options 同时提供 runtime client 与 session resolver，且 session 失败时 fail closed", async () => {
    const appServerClient = buildAppServerClient();
    appServerClient.startSession.mockResolvedValueOnce(
      appServerResult<AppServerAgentSessionStartResponse>(1, {
        session: {
          sessionId: "",
          threadId: "thread-app-server",
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          status: "idle",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
      }),
    );

    const options = createDefaultAgentAppRuntimeHostOptions(appServerClient);

    expect(options.runtimeClient.startTurn).toBeTypeOf("function");
    expect(options.ensureSession).toBeTypeOf("function");
    await expect(
      options.ensureSession({
        appId: "content-factory-app",
        workspaceId: "workspace-1",
        taskKind: "content.scenario_planning",
      }),
    ).rejects.toThrow(
      "agentSession/start did not return an Agent App runtime session",
    );
    expect(appServerClient.startTurn).not.toHaveBeenCalled();
  });
});
