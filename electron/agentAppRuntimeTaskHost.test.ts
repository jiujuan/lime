import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppServerRequestError } from "@limecloud/app-server-client";
import { AgentAppRuntimeTaskHost } from "./agentAppRuntimeTaskHost";

const tempDirs: string[] = [];

type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

function createHost(request: AppServerRequestMock): AgentAppRuntimeTaskHost {
  return new AgentAppRuntimeTaskHost(
    request as ConstructorParameters<typeof AgentAppRuntimeTaskHost>[0],
  );
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lime-agent-app-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function sessionAlreadyExistsError(sessionId: string) {
  return new AppServerRequestError(
    "agentSession/start",
    {
      id: "test-session-start",
      error: {
        code: -32013,
        message: `session already exists: ${sessionId}`,
      },
    },
    [],
    [],
  );
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

describe("AgentAppRuntimeTaskHost", () => {
  it("startTask 通过 App Server session start 与 turn start 投影", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "agentAppUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "stopped",
          taskRuntime: {
            enabled: false,
            blockers: [],
            followUps: [],
            taskKinds: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
          },
        };
      }
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.startTask({
        request: {
          appId: "content-factory-app",
          entryKey: "writer",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          title: "写一组发布文案",
          prompt: "生成 3 条可发布文案",
          input: { topic: "Electron current" },
          expectedOutput: { contentFactoryWorkspacePatch: true },
          eventName: "agent_app_runtime:content-factory-app:task-1",
          turnId: "turn-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queueIfBusy: true,
          skipPreSubmitResume: false,
          metadata: { source: "host-test" },
          turnConfig: {
            provider_config: { provider_name: "anthropic" },
            reasoning_effort: "medium",
            sandbox_policy: "workspace-write",
            metadata: { turn_source: "agent-app" },
          },
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      entryKey: "writer",
      taskId: "task-1",
      taskKind: "content_factory.write",
      sessionId: "session-1",
      turnId: "turn-1",
      eventName: "agent_app_runtime:content-factory-app:task-1",
      status: "accepted",
    });

    expect(request).toHaveBeenNthCalledWith(1, "agentAppUiRuntime/status", {
      appId: "content-factory-app",
    });
    expect(request).toHaveBeenNthCalledWith(2, "agentSession/start", {
      sessionId: "session-1",
      appId: "content-factory-app",
      workspaceId: "workspace-1",
    });
    expect(request).toHaveBeenNthCalledWith(
      3,
      "agentSession/turn/start",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        input: {
          text: expect.stringContaining("Business Prompt:"),
          attachments: [],
        },
        queueIfBusy: true,
        skipPreSubmitResume: false,
        runtimeOptions: expect.objectContaining({
          stream: true,
          eventName: "agent_app_runtime:content-factory-app:task-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queuedTurnId: "agent-app-queued-task-1",
          metadata: {
            source: "host-test",
            turn_source: "agent-app",
          },
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              session_id: "session-1",
              turn_id: "turn-1",
              workspace_id: "workspace-1",
              provider_preference: "anthropic",
              model_preference: "claude-sonnet-4",
              provider_config: { provider_name: "anthropic" },
              queued_turn_id: "agent-app-queued-task-1",
              turn_config: expect.objectContaining({
                provider_config: { provider_name: "anthropic" },
              }),
            }),
          },
        }),
      }),
    );
  });

  it("startTask 在 runWorker=false 时不查询 UI runtime status", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.startTask({
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          prompt: "跳过 worker",
          turnId: "turn-1",
          runWorker: false,
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "accepted",
      worker: {
        status: "skipped",
      },
    });

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "agentSession/start",
      "agentSession/turn/start",
    ]);
  });

  it("startTask 执行 task worker 并写回 App Server runtime event", async () => {
    const packageRoot = await createTempDir();
    await mkdir(path.join(packageRoot, "runtime"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "runtime", "worker.mjs"),
      [
        "let input = '';",
        "for await (const chunk of process.stdin) input += chunk;",
        "const request = JSON.parse(input);",
        "process.stdout.write(JSON.stringify({",
        "  artifactKind: 'content_factory.workspace_patch',",
        "  appId: request.appId,",
        "  taskKind: request.taskKind,",
        "  patch: {",
        "    appId: request.appId,",
        "    sessionId: request.sessionId,",
        "    objects: [{",
        "      ref: { appId: request.appId, kind: 'articleDraft', id: 'draft-1', sessionId: request.sessionId },",
        "      title: '文章草稿',",
        "      source: { markdown: '# 草稿' }",
        "    }]",
        "  }",
        "}));",
      ].join("\n"),
      "utf8",
    );
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentAppUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "ready",
          taskRuntime: {
            enabled: true,
            packageRootPath: packageRoot,
            workerEntrypoint: "./runtime/worker.mjs",
            outputArtifactKind: "content_factory.workspace_patch",
            taskKinds: ["content.article.generate"],
            blockers: [],
            followUps: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
          },
        };
      }
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      if (method === "agentSession/runtimeEvents/append") {
        const appendParams = params as {
          sessionId: string;
          turnId: string;
          runtimeEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
          }>;
        };
        expect(appendParams.sessionId).toBe("session-1");
        expect(appendParams.turnId).toBe("turn-1");
        expect(appendParams.runtimeEvents[0].type).toBe("artifact.snapshot");
        expect(appendParams.runtimeEvents[0].payload.kind).toBe(
          "content_factory.workspace_patch",
        );
        expect(
          (
            appendParams.runtimeEvents[0].payload.metadata as Record<
              string,
              unknown
            >
          ).contentFactoryWorkspacePatch,
        ).toBeTruthy();
        expect(
          (
            appendParams.runtimeEvents[0].payload.metadata as Record<
              string,
              Record<string, unknown>
            >
          ).agentAppWorker,
        ).toEqual(
          expect.objectContaining({
            workerEntrypoint: "./runtime/worker.mjs",
            status: "completed",
            inputSummary: "prompt=生成文章; inputKeys=topic",
            outputSummary: "1 objects: 文章草稿",
            outputObjectCount: 1,
          }),
        );
        return {
          events: [
            {
              eventId: "evt-worker",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "artifact.snapshot",
              timestamp: "2026-06-07T00:00:00.000Z",
              payload: appendParams.runtimeEvents[0].payload,
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.startTask({
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content.article.generate",
          prompt: "生成文章",
          input: { topic: "Agent App Host v3" },
          eventName: "agent_app_runtime:content-factory-app:task-1",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "accepted",
      worker: {
        status: "completed",
        artifactKind: "content_factory.workspace_patch",
        runtimeEventCount: 1,
        appendedEventCount: 1,
      },
    });

    expect(request).toHaveBeenNthCalledWith(1, "agentAppUiRuntime/status", {
      appId: "content-factory-app",
    });
    expect(request).toHaveBeenNthCalledWith(
      4,
      "agentSession/runtimeEvents/append",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
      }),
    );
  });

  it("startTask 在 worker 失败时写回 runtime.error evidence", async () => {
    const packageRoot = await createTempDir();
    await mkdir(path.join(packageRoot, "runtime"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "runtime", "worker.mjs"),
      "process.stdout.write('{');\n",
      "utf8",
    );
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentAppUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "ready",
          taskRuntime: {
            enabled: true,
            packageRootPath: packageRoot,
            workerEntrypoint: "./runtime/worker.mjs",
            outputArtifactKind: "content_factory.workspace_patch",
            taskKinds: ["content.article.generate"],
            blockers: [],
            followUps: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
          },
        };
      }
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      if (method === "agentSession/runtimeEvents/append") {
        const appendParams = params as {
          sessionId: string;
          turnId: string;
          runtimeEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
          }>;
        };
        expect(appendParams.sessionId).toBe("session-1");
        expect(appendParams.turnId).toBe("turn-1");
        expect(appendParams.runtimeEvents[0].type).toBe("runtime.error");
        expect(appendParams.runtimeEvents[0].payload).toEqual(
          expect.objectContaining({
            source: "agent_app_task_worker",
            appId: "content-factory-app",
            taskId: "task-1",
            taskKind: "content.article.generate",
            errorCode: "worker_invalid_json_output",
            status: "failed",
          }),
        );
        expect(appendParams.runtimeEvents[0].payload.message).toEqual(
          expect.stringContaining("Agent App task worker failed:"),
        );
        expect(
          (
            appendParams.runtimeEvents[0].payload.metadata as Record<
              string,
              Record<string, unknown>
            >
          ).agentAppWorker.inputSummary,
        ).toBe("prompt=生成文章; inputKeys=topic");
        return {
          events: [
            {
              eventId: "evt-worker-failed",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "runtime.error",
              timestamp: "2026-06-07T00:00:00.000Z",
              payload: appendParams.runtimeEvents[0].payload,
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.startTask({
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content.article.generate",
          prompt: "生成文章",
          input: { topic: "Agent App Host v3" },
          eventName: "agent_app_runtime:content-factory-app:task-1",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "accepted",
      worker: {
        status: "failed",
        errorCode: "worker_invalid_json_output",
        runtimeEventCount: 1,
        appendedEventCount: 1,
      },
    });
  });

  it("startTask 对已存在 session 做幂等投影并继续提交 turn", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "agentAppUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "stopped",
          taskRuntime: {
            enabled: false,
            blockers: [],
            followUps: [],
            taskKinds: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
          },
        };
      }
      if (method === "agentSession/start") {
        throw sessionAlreadyExistsError("session-1");
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.startTask({
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          prompt: "继续同一个 App task",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      turnId: "turn-1",
      status: "accepted",
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "agentAppUiRuntime/status",
      "agentSession/start",
      "agentSession/turn/start",
    ]);
  });

  it("getTask 从 agentSession/read 投影 task snapshot 状态", async () => {
    const detail = { thread_id: "thread-1", pending_requests: [] };
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "waitingAction",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns: [],
          detail,
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.getTask({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      status: "thread_read_available",
      taskStatus: "blocked",
      taskEvents: [],
      threadRead: detail,
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
  });

  it("cancelTask 缺少 turnId 时先从 agentSession/read 查找活动 turn", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "running",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns:
            (params as { sessionId?: string }).sessionId ===
            "session-without-active-turn"
              ? [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-without-active-turn",
                    threadId: "thread-1",
                    status: "completed",
                  },
                ]
              : [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "completed",
                  },
                  {
                    turnId: "turn-running",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "running",
                  },
                ],
        };
      }
      if (method === "agentSession/turn/cancel") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.cancelTask({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-without-active-turn",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-without-active-turn",
      cancelled: false,
      status: "not_running",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-without-active-turn",
    });

    await expect(
      host.cancelTask({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      cancelled: true,
      status: "cancelled",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
    expect(request).toHaveBeenCalledWith("agentSession/turn/cancel", {
      sessionId: "session-1",
      turnId: "turn-running",
    });
  });

  it("submitHostResponse 投影 snake_case runtime request 到 action/respond", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/action/respond") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.submitHostResponse({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          runtimeRequest: {
            session_id: "session-1",
            request_id: "request-1",
            action_type: "ask_user",
            confirmed: true,
            response: "继续",
            user_data: { note: "ok" },
            metadata: { source: "host-test" },
            event_name: "agent_app_runtime:host_response",
            action_scope: {
              session_id: "session-1",
              thread_id: "thread-1",
              turn_id: "turn-1",
            },
          },
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "submitted",
    });
    expect(request).toHaveBeenCalledWith("agentSession/action/respond", {
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
      userData: { note: "ok" },
      metadata: { source: "host-test" },
      eventName: "agent_app_runtime:host_response",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
  });
});
