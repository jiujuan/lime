import { afterEach, describe, expect, it, vi } from "vitest";

import { PluginRuntimeTaskHost } from "./pluginRuntimeTaskHost";

type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

function createHost(request: AppServerRequestMock): PluginRuntimeTaskHost {
  return new PluginRuntimeTaskHost(
    request as ConstructorParameters<typeof PluginRuntimeTaskHost>[0],
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PluginRuntimeTaskHost", () => {
  it("startTask 通过 v2 thread/start 与 turn/start 投影 canonical identity", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "pluginUiRuntime/status") {
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
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-1",
            sessionId: "session-1",
          },
        };
      }
      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-1",
            status: "inProgress",
            startedAt: Date.parse("2026-06-07T00:00:00.000Z") / 1000,
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
          taskId: "task-1",
          taskKind: "content_factory.write",
          title: "写一组发布文案",
          prompt: "生成 3 条可发布文案",
          input: { topic: "Electron current" },
          expectedOutput: { contentFactoryWorkspacePatch: true },
          eventName: "plugin_runtime:content-factory-app:task-1",
          queueIfBusy: true,
          skipPreSubmitResume: false,
          metadata: { source: "host-test" },
          runtimeRequest: {
            providerConfig: { providerName: "anthropic" },
            providerPreference: "anthropic",
            modelPreference: "claude-sonnet-4",
            reasoningEffort: "medium",
            sandboxPolicy: "workspace-write",
            metadata: { turn_source: "plugin" },
          },
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      entryKey: "writer",
      taskId: "task-1",
      taskKind: "content_factory.write",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      eventName: "plugin_runtime:content-factory-app:task-1",
      status: "accepted",
    });

    expect(request).toHaveBeenNthCalledWith(1, "pluginUiRuntime/status", {
      appId: "content-factory-app",
    });
    expect(request).toHaveBeenNthCalledWith(2, "thread/start", {
      historyMode: "paginated",
      model: "claude-sonnet-4",
      modelProvider: "anthropic",
      serviceName: "content_factory.write",
      threadSource: "plugin",
    });
    expect(request).toHaveBeenNthCalledWith(
      3,
      "turn/start",
      expect.objectContaining({
        threadId: "thread-1",
        input: [
          {
            type: "text",
            text: expect.stringContaining("Business Prompt:"),
          },
        ],
        effort: "medium",
        model: "claude-sonnet-4",
        sandboxPolicy: "workspace-write",
        responsesapiClientMetadata: expect.objectContaining({
          eventName: "plugin_runtime:content-factory-app:task-1",
          queuedTurnId: "plugin-queued-task-1",
          taskId: "task-1",
          workspaceId: "workspace-1",
        }),
      }),
    );
  });

  it("startTask 在 runWorker=false 时不查询 UI runtime status", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "thread/start") {
        throw new Error("existing thread must not call thread/start");
      }
      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-1",
            status: "inProgress",
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
          threadId: "thread-1",
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
      "turn/start",
    ]);
  });

  it("startTask 把 manifest worker task 委托给 RuntimeCore", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "pluginUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "ready",
          taskRuntime: {
            enabled: true,
            outputArtifactKind: "content_factory.workspace_patch",
            taskKinds: ["content.article.generate"],
            blockers: [],
            followUps: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
          },
        };
      }
      if (method === "thread/start") {
        throw new Error("existing thread must not call thread/start");
      }
      if (method === "turn/start") {
        const turnParams = params as {
          additionalContext: {
            metadata: { kind: string; value: string };
          };
        };
        expect(turnParams.additionalContext.metadata.kind).toBe("application");
        expect(JSON.parse(turnParams.additionalContext.metadata.value)).toEqual(
          expect.objectContaining({
            plugin: {
              appId: "content-factory-app",
              workspaceId: "workspace-1",
              paneAction: {
                key: "default",
                prompt: "生成文章",
                surfaceKind: "pluginRuntime",
                paneKind: "pluginTask",
                outputArtifactKind: "content_factory.workspace_patch",
                taskKind: "content.article.generate",
              },
            },
          }),
        );
        return {
          turn: {
            id: "turn-1",
            status: "inProgress",
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
          threadId: "thread-1",
          taskId: "task-1",
          taskKind: "content.article.generate",
          prompt: "生成文章",
          input: { topic: "Plugin Host v3" },
          eventName: "plugin_runtime:content-factory-app:task-1",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "accepted",
      worker: {
        status: "delegated",
        owner: "runtime_core",
        outputArtifactKind: "content_factory.workspace_patch",
      },
    });

    expect(request).toHaveBeenNthCalledWith(1, "pluginUiRuntime/status", {
      appId: "content-factory-app",
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "pluginUiRuntime/status",
      "turn/start",
    ]);
  });

  it("startTask 对被阻塞的 worker contract fail closed", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "pluginUiRuntime/status") {
        return {
          appId: "content-factory-app",
          status: "ready",
          taskRuntime: {
            enabled: true,
            outputArtifactKind: "content_factory.workspace_patch",
            taskKinds: ["content.article.generate"],
            blockers: ["TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED"],
            followUps: [],
            directProviderAccess: false,
            directFilesystemAccess: false,
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
          threadId: "thread-1",
          taskId: "task-1",
          taskKind: "content.article.generate",
          prompt: "生成文章",
          input: { topic: "Plugin Host v3" },
          eventName: "plugin_runtime:content-factory-app:task-1",
          turnId: "turn-1",
        },
      }),
    ).rejects.toThrow(
      "Plugin content-factory-app task runtime is blocked: TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("startTask 对已有 canonical thread 直接提交 turn", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "pluginUiRuntime/status") {
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
      if (method === "thread/start") {
        throw new Error("existing thread must not call thread/start");
      }
      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-1",
            status: "inProgress",
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
          threadId: "thread-1",
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
      threadId: "thread-1",
      turnId: "turn-1",
      status: "accepted",
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "pluginUiRuntime/status",
      "turn/start",
    ]);
  });

  it("getTask 从 thread/read 投影 task snapshot 状态", async () => {
    const thread = {
      id: "thread-1",
      sessionId: "session-1",
      status: { type: "active", activeFlags: ["waitingOnUserInput"] },
      archived: false,
      createdAt: Date.parse("2026-06-07T00:00:00.000Z") / 1000,
      updatedAt: Date.parse("2026-06-07T00:00:00.000Z") / 1000,
      turns: [],
    };
    const request = vi.fn(async (method: string) => {
      if (method === "thread/read") {
        return { thread };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(request);

    await expect(
      host.getTask({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          threadId: "thread-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      threadId: "thread-1",
      status: "thread_read_available",
      taskStatus: "blocked",
      taskEvents: [],
      threadRead: thread,
    });
    expect(request).toHaveBeenCalledWith("thread/read", {
      threadId: "thread-1",
      includeTurns: true,
    });
  });

  it("cancelTask 缺少 turnId 时先从 thread/read 查找活动 turn", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "thread/read") {
        const threadId = (params as { threadId?: string }).threadId;
        return {
          thread: {
            id: threadId,
            sessionId:
              threadId === "thread-without-active-turn"
                ? "session-without-active-turn"
                : "session-1",
            status: { type: "active", activeFlags: [] },
            archived: false,
            createdAt: Date.parse("2026-06-07T00:00:00.000Z") / 1000,
            updatedAt: Date.parse("2026-06-07T00:00:00.000Z") / 1000,
            turns:
              threadId === "thread-without-active-turn"
                ? [
                    {
                      id: "turn-completed",
                      status: "completed",
                    },
                  ]
                : [
                    {
                      id: "turn-completed",
                      status: "completed",
                    },
                    {
                      id: "turn-running",
                      status: "inProgress",
                    },
                  ],
          },
        };
      }
      if (method === "turn/interrupt") {
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
          threadId: "thread-without-active-turn",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-without-active-turn",
      threadId: "thread-without-active-turn",
      cancelled: false,
      status: "not_running",
    });
    expect(request).toHaveBeenCalledWith("thread/read", {
      threadId: "thread-without-active-turn",
      includeTurns: true,
    });

    await expect(
      host.cancelTask({
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          threadId: "thread-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      threadId: "thread-1",
      cancelled: true,
      status: "cancelled",
    });
    expect(request).toHaveBeenCalledWith("thread/read", {
      threadId: "thread-1",
      includeTurns: true,
    });
    expect(request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: "thread-1",
      turnId: "turn-running",
    });
  });

  it("submitHostResponse 不再回退 generic action/respond", async () => {
    const request = vi.fn();
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
            event_name: "plugin_runtime:host_response",
            action_scope: {
              session_id: "session-1",
              thread_id: "thread-1",
              turn_id: "turn-1",
            },
          },
        },
      }),
    ).rejects.toThrow(
      "plugin_runtime_submit_host_response is retired; respond through the typed App Server server-request dispatcher.",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
