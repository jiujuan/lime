import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { AgentRuntimeCapabilityHost } from "./agentRuntimeCapabilityHost";
import { buildWorkflowRuntimeCapabilityProfile } from "../testing/workflowRuntimeCapabilityProfile";

const CONTENT_FACTORY_ENTRY_KEY = "content_factory";

function buildDelegateHost() {
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: "2026-05-15T00:00:00.000Z",
    checkedAt: "2026-05-15T00:00:00.000Z",
    generatedAt: "2026-05-15T00:00:00.000Z",
  });
  return new AdapterCapabilityHost({
    preview,
    now: () => "2026-05-15T00:00:00.000Z",
  });
}

describe("AgentRuntimeCapabilityHost", () => {
  it("没有标准 runtime client 或显式 compat api 时不再隐式回退旧 facade", async () => {
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    await expect(
      sdk.agent.startTask({
        title: "缺少标准 runtime client",
        taskKind: "content.copy.generate",
        sessionId: "session-standard",
        threadId: "thread-standard",
        taskId: "task-standard",
        input: { projectId: "project-1" },
      }),
    ).rejects.toThrow(
      "AgentRuntimeCapabilityHost requires a standard AgentRuntimeClient or explicit compat api",
    );
  });

  it("没有显式 Project/Thread workspace 时不得自动创建默认项目", async () => {
    const api = {
      startTask: vi.fn(),
      getTask: vi.fn(),
      cancelTask: vi.fn(),
      submitHostResponse: vi.fn(),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    await expect(
      sdk.agent.startTask({
        title: "缺少 Project/Thread workspace",
        taskKind: "content.copy.generate",
        input: { projectId: "project-1" },
      }),
    ).rejects.toThrow(
      "Plugin Agent task requires an existing sessionId or explicit Project/Thread workspaceId",
    );
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("已有 sessionId 时复用当前 Thread，不要求默认项目 resolver", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: request.taskId ?? "plugin-task-current-thread",
        traceId: "plugin-trace-current-thread",
        taskKind: request.taskKind,
        sessionId: request.sessionId ?? "session-current",
        threadId: "thread-current",
        turnId: "turn-current",
        eventName: `plugin_runtime:${request.appId}:plugin-task-current-thread`,
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(),
      cancelTask: vi.fn(),
      submitHostResponse: vi.fn(),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    const started = await sdk.agent.startTask({
      title: "复用当前 Thread",
      taskKind: "content.copy.generate",
      sessionId: "session-current",
      threadId: "thread-current",
      input: { projectId: "project-1" },
    });

    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-current",
        threadId: "thread-current",
      }),
    );
    expect(started).toMatchObject({
      sessionId: "session-current",
      turnId: "turn-current",
    });
  });

  it("只为 manifest 声明的 worker task 注入受信任 pane action metadata", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: request.taskId ?? "plugin-task-worker",
        traceId: "plugin-trace-worker",
        taskKind: request.taskKind,
        sessionId: request.sessionId ?? "session-worker",
        threadId: request.threadId ?? "thread-worker",
        turnId: "turn-worker",
        eventName: "plugin_runtime:content-factory-app:plugin-task-worker",
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(),
      cancelTask: vi.fn(),
      submitHostResponse: vi.fn(),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      workspaceId: "workspace-1",
      taskRuntime: {
        enabled: true,
        packageRootPath: null,
        workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
        contractPath: null,
        sampleRequestPath: null,
        outputArtifactKind: "content_factory.workspace_patch",
        taskKinds: ["content.article.generate"],
        directProviderAccess: false,
        directFilesystemAccess: false,
        blockers: [],
        followUps: [],
      },
      api,
    });

    await host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY).agent.startTask({
      title: "生成文章",
      prompt: "写一篇可发布的文章",
      taskKind: "content.article.generate",
      sessionId: "session-worker",
      threadId: "thread-worker",
      taskId: "task-worker",
    });

    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          plugin: {
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            paneAction: {
              key: CONTENT_FACTORY_ENTRY_KEY,
              prompt: "写一篇可发布的文章",
              surfaceKind: "pluginRuntime",
              paneKind: "pluginTask",
              outputArtifactKind: "content_factory.workspace_patch",
              taskKind: "content.article.generate",
            },
          },
        }),
      }),
    );
  });

  it("可以直接注入标准 AgentRuntimeClient 驱动 lime.agent task", async () => {
    const runtimeClient: Pick<
      AgentRuntimeClient,
      "startTurn" | "readThread" | "cancelTurn"
    > = {
      startTurn: vi.fn(async () => ({
        id: 1,
        result: {
          turn: {
            id: "turn-standard",
            items: [],
            itemsView: "full" as const,
            status: "inProgress" as const,
            startedAt: Date.parse("2026-05-15T00:00:00.000Z") / 1_000,
          },
        },
        response: { jsonrpc: "2.0", id: 1, result: {} },
        notifications: [],
        messages: [],
      })),
      readThread: vi.fn(async () => ({
        id: 2,
        result: {
          thread: {
            cliVersion: "0.0.0-test",
            createdAt: 1_747_267_200,
            cwd: "/tmp/plugin-runtime",
            ephemeral: false,
            id: "thread-standard",
            modelProvider: "anthropic",
            preview: "标准 runtime client 任务",
            sessionId: "session-standard",
            source: "plugin",
            status: { type: "active" as const, activeFlags: [] },
            updatedAt: 1_747_267_202,
            turns: [
              {
                id: "turn-standard",
                items: [],
                itemsView: "full" as const,
                startedAt: 1_747_267_200,
                status: "inProgress" as const,
              },
            ],
          },
        },
        response: { jsonrpc: "2.0", id: 2, result: {} },
        notifications: [],
        messages: [],
      })),
      cancelTurn: vi.fn(async () => ({
        id: 3,
        result: {},
        response: { jsonrpc: "2.0", id: 3, result: {} },
        notifications: [],
        messages: [],
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      runtimeClient,
      workspaceIdResolver: async () => "workspace-1",
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    const started = await sdk.agent.startTask({
      title: "标准 runtime client 任务",
      taskKind: "content.copy.generate",
      sessionId: "session-standard",
      threadId: "thread-standard",
      taskId: "task-standard",
      turnId: "turn-standard",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_batch" },
      runtimeRequest: {
        providerConfig: {
          providerName: "anthropic",
          modelName: "claude-sonnet-4",
        },
        sandboxPolicy: "workspace-write",
      },
    });
    const snapshot = await sdk.agent.getTask(started.taskId);
    await sdk.agent.cancelTask(started.taskId);
    await expect(
      sdk.agent.submitHostResponse({
        taskId: started.taskId,
        requestId: "request-standard",
        actionType: "ask_user",
        response: "继续",
      }),
    ).rejects.toThrow(
      "Typed server request is no longer pending; generic agentSession/action/respond is retired.",
    );

    expect(runtimeClient.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-standard",
        input: [expect.objectContaining({ type: "text" })],
        model: "claude-sonnet-4",
        sandboxPolicy: "workspace-write",
      }),
    );
    expect(runtimeClient.readThread).toHaveBeenCalledWith({
      threadId: "thread-standard",
      includeTurns: true,
    });
    expect(runtimeClient.cancelTurn).toHaveBeenCalledWith({
      threadId: "thread-standard",
      turnId: "turn-standard",
    });
    expect(started).toMatchObject({
      taskId: "task-standard",
      sessionId: "session-standard",
      turnId: "turn-standard",
    });
    expect(snapshot).toMatchObject({
      status: "running",
      sessionId: "session-standard",
    });
  });

  it("把 lime.agent start/get/cancel/retry 适配到 Plugin Runtime facade", async () => {
    let startCounter = 0;
    const api = {
      startTask: vi.fn(async (request) => {
        startCounter += 1;
        return {
          appId: request.appId,
          entryKey: request.entryKey,
          taskId: `plugin-task-${startCounter}`,
          traceId: `plugin-trace-${startCounter}`,
          taskKind: request.taskKind,
          sessionId: request.sessionId ?? "session-1",
          threadId: `thread-${startCounter}`,
          turnId: `turn-${startCounter}`,
          eventName: `plugin_runtime:${request.appId}:plugin-task-${startCounter}`,
          status: "accepted" as const,
          submittedAt: "2026-05-15T00:00:00.000Z",
        };
      }),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "blocked",
        taskEvents: [
          {
            id: "task:missingContextRequested:request-1",
            eventType: "task:missingContextRequested",
            status: "pending",
            message: "需要补充项目定位",
            requestId: "request-1",
            occurredAt: "2026-05-15T00:00:01.000Z",
          },
          {
            id: "evidence:recorded:evidence-1",
            eventType: "evidence:recorded",
            status: "recorded",
            message: "运行证据已记录",
            evidenceRef: "evidence-1",
            occurredAt: "2026-05-15T00:00:02.000Z",
          },
          {
            id: "artifact:created:artifact-1",
            eventType: "artifact:created",
            status: "created",
            message: "内容批次已创建",
            artifactRef: ".lime/artifacts/content-batch.json",
            occurredAt: "2026-05-15T00:00:02.500Z",
            payload: {
              contentFactoryWorkspacePatch: {
                kind: "content_batch",
                contentBatch: { count: 20 },
              },
            },
          },
        ],
        threadRead: {
          session_id: request.sessionId,
          profile_status: "blocked",
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: "session-1",
        threadId: request.threadId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    const started = await sdk.agent.startTask({
      title: "生成内容场景",
      prompt: "基于项目知识生成内容场景",
      taskId: "plugin-requested-task",
      turnId: "plugin-requested-turn",
      eventName: "plugin_runtime:content-factory-app:plugin-requested-task",
      taskKind: "content.scenario_planning",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      tools: ["image_generation"],
      humanReview: true,
      runtimeRequest: {
        providerConfig: {
          providerId: "deepseek",
          providerName: "deepseek",
          modelName: "deepseek-v4-flash",
        },
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-flash",
        reasoningEffort: "high",
        thinkingEnabled: true,
        approvalPolicy: "on-request",
        sandboxPolicy: "workspace-write",
        executionStrategy: "react",
        webSearch: true,
        searchMode: "required",
        systemPrompt: "保留 Plugin 的 Claw 运行时提示",
        metadata: {
          harness: {
            source: "plugin",
          },
        },
      },
      queueIfBusy: true,
      skipPreSubmitResume: true,
      runStartHooks: false,
    });
    const snapshot = await sdk.agent.getTask(started.taskId);
    const listedAfterSnapshot = host
      .getTasks({ appId: "content-factory-app" })
      .find((task) => task.taskId === started.taskId);
    const stream = await sdk.agent.streamTask(started.taskId);
    const hostResponse = await sdk.agent.submitHostResponse({
      taskId: started.taskId,
      requestId: "request-1",
      actionType: "ask_user",
      response: "补充项目定位：高客单价咨询服务。",
      userData: { segment: "consulting" },
      workflowRunId: "workflow-run-1",
      workflowKey: "content_article_workflow",
      stepId: "draft",
    });
    const cancelled = await sdk.agent.cancelTask(started.taskId);
    const retried = await sdk.agent.retryTask(started.taskId);

    expect(api.startTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: CONTENT_FACTORY_ENTRY_KEY,
        workspaceId: "workspace-1",
        taskId: "plugin-requested-task",
        turnId: "plugin-requested-turn",
        eventName: "plugin_runtime:content-factory-app:plugin-requested-task",
        taskKind: "content.scenario_planning",
        capabilityHints: ["image_generation"],
        humanReview: true,
        runtimeRequest: expect.objectContaining({
          providerConfig: expect.objectContaining({
            providerId: "deepseek",
            modelName: "deepseek-v4-flash",
          }),
          providerPreference: "deepseek",
          modelPreference: "deepseek-v4-flash",
          reasoningEffort: "high",
          thinkingEnabled: true,
          approvalPolicy: "on-request",
          sandboxPolicy: "workspace-write",
          executionStrategy: "react",
          webSearch: true,
          searchMode: "required",
          systemPrompt: "保留 Plugin 的 Claw 运行时提示",
        }),
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runStartHooks: false,
      }),
    );
    expect(started).toMatchObject({
      taskId: "plugin-task-1",
      traceId: "plugin-trace-1",
      sessionId: "session-1",
      turnId: "turn-1",
      workspaceId: "workspace-1",
      status: "running",
      provenance: expect.objectContaining({
        appVersion: "0.3.0",
        packageHash: "package-hash-1",
        manifestHash: "manifest-hash-1",
      }),
      events: [expect.objectContaining({ type: "task:queued" })],
    });
    expect(snapshot).toMatchObject({
      taskId: "plugin-task-1",
      status: "running",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "task:missingContextRequested",
          message: "需要补充项目定位",
        }),
        expect.objectContaining({
          type: "evidence:recorded",
          refs: ["evidence-1"],
        }),
        expect.objectContaining({
          type: "artifact:created",
          refs: [".lime/artifacts/content-batch.json"],
          payload: expect.objectContaining({
            contentFactoryWorkspacePatch: expect.objectContaining({
              kind: "content_batch",
            }),
          }),
        }),
      ]),
    });
    expect(listedAfterSnapshot?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "evidence:recorded",
          refs: ["evidence-1"],
        }),
        expect.objectContaining({
          type: "artifact:created",
          refs: [".lime/artifacts/content-batch.json"],
        }),
      ]),
    );
    expect(listedAfterSnapshot?.runtimeProcess?.usage).toMatchObject({
      estimated: true,
      source: "plugin_runtime_process_estimate",
    });
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "task:missingContextRequested" }),
      ]),
    );
    expect(api.cancelTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "plugin-task-1",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(api.submitHostResponse).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "plugin-task-1",
      runtimeRequest: expect.objectContaining({
        session_id: "session-1",
        request_id: "request-1",
        action_type: "ask_user",
        confirmed: true,
        response: "补充项目定位：高客单价咨询服务。",
        user_data: { segment: "consulting" },
        metadata: expect.objectContaining({
          workflowResume: {
            workflowRunId: "workflow-run-1",
            workflowKey: "content_article_workflow",
            stepId: "draft",
          },
          plugin_runtime: expect.objectContaining({
            app_id: "content-factory-app",
            task_id: "plugin-task-1",
            source: "plugin_host_bridge",
          }),
        }),
        action_scope: expect.objectContaining({
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      }),
    });
    expect(hostResponse).toEqual({
      taskId: "plugin-task-1",
      requestId: "request-1",
      status: "submitted",
      submittedAt: "2026-05-15T00:00:03.000Z",
    });
    expect(cancelled).toMatchObject({
      taskId: "plugin-task-1",
      status: "cancelled",
    });
    expect(api.startTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: "session-1",
        idempotencyKey: `${CONTENT_FACTORY_ENTRY_KEY}:content.scenario_planning:retry:1`,
      }),
    );
    expect(retried).toMatchObject({
      taskId: "plugin-task-2",
      retryOfTaskId: "plugin-task-1",
      retryAttempt: 1,
    });
  });

  it("从 Plugin storage 恢复 runtime task state，支持刷新后继续读取和响应", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-persisted",
        traceId: "plugin-trace-persisted",
        taskKind: request.taskKind,
        sessionId: "session-persisted",
        threadId: "thread-persisted",
        turnId: "turn-persisted",
        eventName: `plugin_runtime:${request.appId}:plugin-task-persisted`,
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "completed",
        taskEvents: [
          {
            id: "artifact:created:artifact-1",
            eventType: "artifact:created",
            status: "created",
            message: "内容批次已创建",
            artifactRef: ".lime/artifacts/content-batch.json",
            occurredAt: "2026-05-15T00:00:02.000Z",
          },
        ],
        threadRead: {
          session_id: request.sessionId,
          profile_status: "completed",
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const delegate = buildDelegateHost();
    const firstHost = new AgentRuntimeCapabilityHost({
      delegate,
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const started = await firstHost
      .createSdkContext(CONTENT_FACTORY_ENTRY_KEY)
      .agent.startTask({
        title: "生成内容批次",
        taskKind: "content.copy.generate",
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_batch" },
        humanReview: true,
      });

    expect(
      delegate
        .getStorageEntries({ appId: "content-factory-app" })
        .some(
          (entry) => entry.key === "agent-runtime/tasks/plugin-task-persisted",
        ),
    ).toBe(true);

    const reloadedHost = new AgentRuntimeCapabilityHost({
      delegate,
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:04.000Z",
    });
    const reloadedSdk = reloadedHost.createSdkContext(
      CONTENT_FACTORY_ENTRY_KEY,
    );
    const restored = await reloadedSdk.agent.getTask(started.taskId);
    const listed = await reloadedSdk.agent.listTasks();
    const hostResponse = await reloadedSdk.agent.submitHostResponse({
      taskId: started.taskId,
      requestId: "request-1",
      actionType: "ask_user",
      response: "继续执行。",
    });

    expect(api.getTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "plugin-task-persisted",
      threadId: "thread-persisted",
    });
    expect(restored).toMatchObject({
      taskId: "plugin-task-persisted",
      status: "succeeded",
      events: [
        expect.objectContaining({
          type: "artifact:created",
          refs: [".lime/artifacts/content-batch.json"],
        }),
      ],
    });
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: "plugin-task-persisted" }),
      ]),
    );
    expect(api.submitHostResponse).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "plugin-task-persisted",
      runtimeRequest: expect.objectContaining({
        session_id: "session-persisted",
        request_id: "request-1",
        action_scope: expect.objectContaining({
          session_id: "session-persisted",
          turn_id: "turn-persisted",
        }),
      }),
    });
    expect(hostResponse).toEqual({
      taskId: "plugin-task-persisted",
      requestId: "request-1",
      status: "submitted",
      submittedAt: "2026-05-15T00:00:04.000Z",
    });
  });

  it("getTask 缺少 canonical threadId 时 fail closed", async () => {
    const api = {
      startTask: vi.fn(),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "completed",
        taskEvents: [
          {
            id: "task:completed",
            eventType: "task:completed",
            status: "completed",
            message: "任务已完成",
            occurredAt: "2026-05-15T00:00:02.000Z",
          },
        ],
        threadRead: {
          session_id: request.sessionId,
          profile_status: "completed",
          turns: [{ id: "turn-direct-replay" }],
          artifacts: [
            {
              item_id: "artifact-direct-replay",
              path: ".lime/artifacts/content-batch.json",
              title: "内容批次",
              status: "completed",
              metadata: {
                contentFactoryWorkspacePatch: {
                  kind: "content_factory.workspace_patch",
                  artifactKind: "content_batch",
                  contentBatch: { count: 20 },
                },
              },
            },
          ],
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);

    const restored = await sdk.agent.getTask({
      taskId: "plugin-task-direct-replay",
      sessionId: "session-direct-replay",
      title: "恢复内容批次",
      taskKind: "content.copy.generate",
      expectedOutput: { artifactKind: "content_batch" },
    });
    const stream = await sdk.agent.streamTask({
      taskId: "plugin-task-direct-replay",
      sessionId: "session-direct-replay",
    });

    expect(api.getTask).not.toHaveBeenCalled();
    expect(restored).toBeNull();
    expect(stream).toEqual([]);
  });

  it("在主 App 侧封装 Claw 式运行过程，包含模型、Token、费用和 Skill", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-process",
        traceId: "plugin-trace-process",
        taskKind: request.taskKind,
        sessionId: "session-process",
        threadId: "thread-process",
        turnId: "turn-process",
        eventName: `plugin_runtime:${request.appId}:plugin-task-process`,
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "completed",
        taskEvents: [
          {
            id: "runtime:routing:decision",
            eventType: "task:progress",
            status: "routing",
            message: "模型路由已确定：openai/gpt-4.1",
            payload: {
              runtimeEvent: {
                type: "routing_decision_made",
                routing_decision: {
                  candidate_count: 2,
                  selected_provider: "openai",
                  selected_model: "gpt-4.1",
                },
              },
            },
          },
          {
            id: "runtime:thinking",
            eventType: "task:progress",
            status: "thinking",
            message: "先分析内容目标",
            payload: {
              streamKind: "thinking_delta",
              delta: "先分析内容目标",
              runtimeEvent: { type: "thinking_delta", text: "先分析内容目标" },
            },
          },
          {
            id: "runtime:text",
            eventType: "task:partialArtifact",
            status: "streaming",
            message: "第一段输出",
            payload: {
              streamKind: "assistant_text_delta",
              delta: "第一段输出",
              runtimeEvent: { type: "text_delta", text: "第一段输出" },
            },
          },
          {
            id: "runtime:skill",
            eventType: "task:toolCall",
            status: "completed",
            message: "工具 Skill completed",
            toolName: "Skill",
            payload: {
              runtimeEvent: {
                type: "tool_end",
                result: {
                  output: "完成",
                  metadata: { command_name: "knowledge-builder" },
                },
              },
            },
          },
          {
            id: "runtime:cost",
            eventType: "task:runtimeEvent",
            status: "recorded",
            message: "消耗已记录",
            payload: {
              runtimeEvent: {
                type: "cost_recorded",
                cost_state: {
                  estimated_total_cost: 0.0032,
                  currency: "USD",
                },
              },
            },
          },
          {
            id: "runtime:done",
            eventType: "task:completed",
            status: "completed",
            message: "AgentRuntime 本轮输出已结束",
            payload: {
              runtimeEvent: {
                type: "turn.completed",
                usage: { input_tokens: 1200, output_tokens: 340 },
              },
            },
          },
        ],
        threadRead: {
          session_id: request.sessionId,
          profile_status: "completed",
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:04.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);
    const started = await sdk.agent.startTask({
      title: "生成内容批次",
      taskKind: "content.copy.generate",
      input: { projectId: "project-1" },
      expectedOutput: {
        artifactKind: "content_batch",
        requiredSkills: [
          { skill: "knowledge-builder", required: true },
          { skill: "content-reviewer", required: true },
        ],
      },
    });

    const snapshot = await sdk.agent.getTask(started.taskId);

    expect(snapshot?.runtimeProcess).toMatchObject({
      terminal: true,
      collapsedByDefault: true,
      model: { provider: "openai", model: "gpt-4.1", label: "openai/gpt-4.1" },
      usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 },
      cost: { estimatedTotalCost: 0.0032, currency: "USD" },
      skillNames: expect.arrayContaining([
        "knowledge-builder",
        "content-reviewer",
      ]),
      invokedSkillNames: ["knowledge-builder"],
      streamText: "第一段输出",
      thinkingText: "先分析内容目标",
    });
    expect(snapshot?.process).toBe(snapshot?.runtimeProcess);
    expect(snapshot?.runtimeProcess?.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "routing", title: "模型路由" }),
        expect.objectContaining({
          kind: "skill",
          title: "Skill · knowledge-builder",
        }),
        expect.objectContaining({ kind: "metrics", title: "消耗统计" }),
      ]),
    );
  });

  it("从 threadRead artifacts 补投 artifact:created payload，保证 Host Bridge 可 replay 最终产物", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-artifact-replay",
        traceId: "plugin-trace-artifact-replay",
        taskKind: request.taskKind,
        sessionId: "session-artifact-replay",
        threadId: "thread-artifact-replay",
        turnId: "turn-artifact-replay",
        eventName: `plugin_runtime:${request.appId}:plugin-task-artifact-replay`,
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "completed",
        taskEvents: [
          {
            id: "task:completed",
            eventType: "task:completed",
            status: "completed",
            message: "任务已完成",
            occurredAt: "2026-05-15T00:00:02.000Z",
          },
        ],
        threadRead: {
          threadId: "thread-artifact-replay",
          sessionId: request.sessionId,
          turns: [
            {
              items: [
                {
                  itemId: "artifact-item-1",
                  threadId: "thread-artifact-replay",
                  turnId: "turn-artifact-replay",
                  sessionId: request.sessionId,
                  ordinal: 1,
                  sequence: 1,
                  createdAtMs: 1_747_267_200_000,
                  updatedAtMs: 1_747_267_203_000,
                  status: "completed",
                  kind: "extension",
                  metadata: {},
                  payload: {
                    type: "extension",
                    data: {
                      path: ".lime/artifacts/content-batch.json",
                      title: "内容批次",
                      artifactDocument: {
                        blocks: [
                          {
                            content:
                              '```json\n{"contentFactoryWorkspacePatch":{"kind":"content_batch","contentBatch":{"count":20,"items":[{"title":"突出"一擦即净"的视觉感"}]}}}\n```',
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:04.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);
    const started = await sdk.agent.startTask({
      title: "生成内容批次",
      taskKind: "content.copy.generate",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_batch" },
      humanReview: true,
    });

    const snapshot = await sdk.agent.getTask(started.taskId);

    expect(snapshot?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact:created",
          refs: [".lime/artifacts/content-batch.json"],
          payload: expect.objectContaining({
            artifactDocument: expect.objectContaining({
              blocks: expect.any(Array),
            }),
          }),
        }),
        expect.objectContaining({
          type: "evidence:recorded",
          refs: ["evidence:.lime/artifacts/content-batch.json"],
          payload: expect.objectContaining({
            source: "app_server_artifact_replay",
            contentFactoryWorkspacePatch: expect.objectContaining({
              contentBatch: expect.objectContaining({
                items: expect.arrayContaining([
                  expect.objectContaining({
                    title: '突出"一擦即净"的视觉感',
                  }),
                ]),
              }),
            }),
          }),
        }),
      ]),
    );
  });

  it("从 threadRead tool_calls 补投 task:toolCall，保证 Host Bridge 可 replay 工具事实", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-tool-replay",
        traceId: "plugin-trace-tool-replay",
        taskKind: request.taskKind,
        sessionId: "session-tool-replay",
        threadId: "thread-tool-replay",
        turnId: "turn-tool-replay",
        eventName: `plugin_runtime:${request.appId}:plugin-task-tool-replay`,
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available" as const,
        taskStatus: "completed",
        taskEvents: [
          {
            id: "task:completed",
            eventType: "task:completed",
            status: "completed",
            message: "任务已完成",
            occurredAt: "2026-05-15T00:00:02.000Z",
          },
        ],
        threadRead: {
          threadId: "thread-tool-replay",
          sessionId: request.sessionId,
          turns: [
            {
              items: [
                {
                  itemId: "web-fetch-call-1",
                  threadId: "thread-tool-replay",
                  turnId: "turn-tool-replay",
                  sessionId: request.sessionId,
                  ordinal: 1,
                  sequence: 1,
                  createdAtMs: 1_747_267_200_000,
                  updatedAtMs: 1_747_267_201_000,
                  status: "completed",
                  kind: "tool",
                  payload: {
                    type: "tool",
                    call_id: "web-fetch-call-1",
                    name: "WebFetch",
                    output: { text: "fetched https://example.com" },
                  },
                },
              ],
            },
          ],
        },
      })),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        cancelled: true,
        status: "cancelled" as const,
      })),
      submitHostResponse: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted" as const,
      })),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      workspaceIdResolver: async () => "workspace-1",
      api,
      now: () => "2026-05-15T00:00:04.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);
    const started = await sdk.agent.startTask({
      title: "读取资料",
      taskKind: "content.research",
      input: { url: "https://example.com" },
      expectedOutput: { artifactKind: "research_notes" },
    });

    const snapshot = await sdk.agent.getTask(started.taskId);

    expect(snapshot?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "task:toolCall",
          refs: ["tool:web-fetch-call-1"],
          payload: expect.objectContaining({
            source: "app_server_tool_call_replay",
            toolName: "WebFetch",
            outputPreview: "fetched https://example.com",
            success: true,
            runtimeEvent: expect.objectContaining({
              type: "tool.result",
              id: "web-fetch-call-1",
              toolName: "WebFetch",
            }),
          }),
        }),
      ]),
    );
    expect(snapshot?.runtimeProcess?.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          title: "工具 · WebFetch",
          message: "工具 WebFetch 已回写：fetched https://example.com",
        }),
      ]),
    );
  });

  it("持久化 state 与 lookup threadId 冲突时 fail closed", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-conflict",
        traceId: "plugin-trace-conflict",
        taskKind: request.taskKind,
        sessionId: "session-conflict",
        threadId: "thread-canonical",
        turnId: "turn-conflict",
        eventName: "plugin_runtime:conflict",
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(),
      cancelTask: vi.fn(),
      submitHostResponse: vi.fn(),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);
    const started = await sdk.agent.startTask({
      taskKind: "content.copy.generate",
      sessionId: "session-conflict",
      threadId: "thread-conflict",
    });

    await expect(
      sdk.agent.getTask({
        taskId: started.taskId,
        threadId: "thread-other",
      }),
    ).rejects.toThrow("lookup threadId conflicts with persisted state");
    expect(api.getTask).not.toHaveBeenCalled();
  });

  it("cancelTask 遇到 not_running 不伪报取消成功", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "plugin-task-not-running",
        traceId: "plugin-trace-not-running",
        taskKind: request.taskKind,
        sessionId: "session-not-running",
        threadId: "thread-not-running",
        turnId: "turn-not-running",
        eventName: "plugin_runtime:not-running",
        status: "accepted" as const,
        submittedAt: "2026-05-15T00:00:00.000Z",
      })),
      getTask: vi.fn(),
      cancelTask: vi.fn(async (request) => ({
        appId: request.appId,
        taskId: request.taskId,
        sessionId: "session-not-running",
        threadId: "thread-not-running",
        cancelled: false,
        status: "not_running" as const,
      })),
      submitHostResponse: vi.fn(),
    };
    const host = new AgentRuntimeCapabilityHost({
      delegate: buildDelegateHost(),
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: "package-hash-1",
      manifestHash: "manifest-hash-1",
      api,
      now: () => "2026-05-15T00:00:03.000Z",
    });
    const sdk = host.createSdkContext(CONTENT_FACTORY_ENTRY_KEY);
    const started = await sdk.agent.startTask({
      taskKind: "content.copy.generate",
      sessionId: "session-not-running",
      threadId: "thread-not-running",
    });
    const result = await sdk.agent.cancelTask(started.taskId);

    expect(result.status).toBe("running");
    expect(result.cancelledAt).toBeUndefined();
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "task:status", status: "running" }),
      ]),
    );
    expect(result.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "task:cancelled" }),
      ]),
    );
  });
});
