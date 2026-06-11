import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { AgentRuntimeCapabilityHost } from "./agentRuntimeCapabilityHost";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";

function buildDelegateHost() {
  const preview = buildInstalledAppPreview({
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
    const sdk = host.createSdkContext("dashboard");

    await expect(
      sdk.agent.startTask({
        title: "缺少标准 runtime client",
        taskKind: "content.copy.generate",
        sessionId: "session-standard",
        taskId: "task-standard",
        input: { projectId: "project-1" },
      }),
    ).rejects.toThrow(
      "AgentRuntimeCapabilityHost requires a standard AgentRuntimeClient or explicit compat api",
    );
  });

  it("可以直接注入标准 AgentRuntimeClient 驱动 lime.agent task", async () => {
    const runtimeClient: Pick<
      AgentRuntimeClient,
      "startTurn" | "readThread" | "cancelTurn" | "respondAction"
    > = {
      startTurn: vi.fn(async () => ({
        id: 1,
        result: {
          turn: {
            turnId: "turn-standard",
            sessionId: "session-standard",
            threadId: "thread-standard",
            status: "accepted" as const,
            startedAt: "2026-05-15T00:00:00.000Z",
          },
        },
        response: { jsonrpc: "2.0", id: 1, result: {} },
        notifications: [],
        messages: [],
      })),
      readThread: vi.fn(async () => ({
        id: 2,
        result: {
          session: {
            sessionId: "session-standard",
            threadId: "thread-standard",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "completed" as const,
            createdAt: "2026-05-15T00:00:00.000Z",
            updatedAt: "2026-05-15T00:00:02.000Z",
          },
          turns: [
            {
              turnId: "turn-standard",
              sessionId: "session-standard",
              threadId: "thread-standard",
              status: "completed" as const,
            },
          ],
          detail: {
            thread_read: {
              session_id: "session-standard",
              profile_status: "completed",
              artifacts: [
                {
                  item_id: "artifact-standard",
                  path: ".lime/artifacts/standard.json",
                  title: "标准任务产物",
                  status: "completed",
                },
              ],
            },
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
      respondAction: vi.fn(async () => ({
        id: 4,
        result: {},
        response: { jsonrpc: "2.0", id: 4, result: {} },
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
    const sdk = host.createSdkContext("dashboard");

    const started = await sdk.agent.startTask({
      title: "标准 runtime client 任务",
      taskKind: "content.copy.generate",
      sessionId: "session-standard",
      taskId: "task-standard",
      turnId: "turn-standard",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_batch" },
      turnConfig: {
        provider_config: {
          provider_name: "anthropic",
          model_name: "claude-sonnet-4",
        },
        sandbox_policy: "workspace-write",
      },
    });
    const snapshot = await sdk.agent.getTask(started.taskId);
    await sdk.agent.cancelTask(started.taskId);
    await sdk.agent.submitHostResponse({
      taskId: started.taskId,
      requestId: "request-standard",
      actionType: "ask_user",
      response: "继续",
    });

    expect(runtimeClient.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-standard",
        turnId: "turn-standard",
        runtimeOptions: expect.objectContaining({
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              turn_config: expect.objectContaining({
                provider_config: {
                  provider_name: "anthropic",
                  model_name: "claude-sonnet-4",
                },
              }),
            }),
          },
        }),
      }),
    );
    expect(runtimeClient.readThread).toHaveBeenCalledWith({
      sessionId: "session-standard",
    });
    expect(runtimeClient.cancelTurn).toHaveBeenCalledWith({
      sessionId: "session-standard",
      turnId: "turn-standard",
    });
    expect(runtimeClient.respondAction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-standard",
        requestId: "request-standard",
      }),
    );
    expect(started).toMatchObject({
      taskId: "task-standard",
      sessionId: "session-standard",
      turnId: "turn-standard",
    });
    expect(snapshot).toMatchObject({
      status: "succeeded",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "artifact:created",
          refs: [".lime/artifacts/standard.json"],
        }),
      ]),
    });
  });

  it("把 lime.agent start/get/cancel/retry 适配到 Agent App Runtime facade", async () => {
    let startCounter = 0;
    const api = {
      startTask: vi.fn(async (request) => {
        startCounter += 1;
        return {
          appId: request.appId,
          entryKey: request.entryKey,
          taskId: `agent-app-task-${startCounter}`,
          traceId: `agent-app-trace-${startCounter}`,
          taskKind: request.taskKind,
          sessionId: request.sessionId ?? "session-1",
          turnId: `turn-${startCounter}`,
          eventName: `agent_app_runtime:${request.appId}:agent-app-task-${startCounter}`,
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
    const sdk = host.createSdkContext("dashboard");

    const started = await sdk.agent.startTask({
      title: "生成内容场景",
      prompt: "基于项目知识生成内容场景",
      taskId: "agent-app-requested-task",
      turnId: "agent-app-requested-turn",
      eventName:
        "agent_app_runtime:content-factory-app:agent-app-requested-task",
      taskKind: "content.scenario_planning",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      tools: ["image_generation"],
      humanReview: true,
      providerPreference: "deepseek",
      modelPreference: "deepseek-v4-flash",
      turnConfig: {
        provider_config: {
          provider_id: "deepseek",
          provider_name: "deepseek",
          model_name: "deepseek-v4-flash",
        },
        reasoning_effort: "high",
        thinking_enabled: true,
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        execution_strategy: "react",
        web_search: true,
        search_mode: "required",
        system_prompt: "保留 Agent App 的 Claw 运行时提示",
        metadata: {
          harness: {
            source: "agent_app",
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
    });
    const cancelled = await sdk.agent.cancelTask(started.taskId);
    const retried = await sdk.agent.retryTask(started.taskId);

    expect(api.startTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        appId: "content-factory-app",
        entryKey: "dashboard",
        workspaceId: "workspace-1",
        taskId: "agent-app-requested-task",
        turnId: "agent-app-requested-turn",
        eventName:
          "agent_app_runtime:content-factory-app:agent-app-requested-task",
        taskKind: "content.scenario_planning",
        capabilityHints: ["image_generation"],
        humanReview: true,
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-flash",
        turnConfig: expect.objectContaining({
          provider_config: expect.objectContaining({
            provider_id: "deepseek",
            model_name: "deepseek-v4-flash",
          }),
          reasoning_effort: "high",
          thinking_enabled: true,
          approval_policy: "on-request",
          sandbox_policy: "workspace-write",
          execution_strategy: "react",
          web_search: true,
          search_mode: "required",
          system_prompt: "保留 Agent App 的 Claw 运行时提示",
        }),
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runStartHooks: false,
      }),
    );
    expect(started).toMatchObject({
      taskId: "agent-app-task-1",
      traceId: "agent-app-trace-1",
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
      taskId: "agent-app-task-1",
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
      source: "agent_app_runtime_process_estimate",
    });
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "task:missingContextRequested" }),
      ]),
    );
    expect(api.cancelTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-1",
      sessionId: "session-1",
      turnId: "turn-1",
    });
    expect(api.submitHostResponse).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-1",
      runtimeRequest: expect.objectContaining({
        session_id: "session-1",
        request_id: "request-1",
        action_type: "ask_user",
        confirmed: true,
        response: "补充项目定位：高客单价咨询服务。",
        user_data: { segment: "consulting" },
        action_scope: expect.objectContaining({
          session_id: "session-1",
          turn_id: "turn-1",
        }),
      }),
    });
    expect(hostResponse).toEqual({
      taskId: "agent-app-task-1",
      requestId: "request-1",
      status: "submitted",
      submittedAt: "2026-05-15T00:00:03.000Z",
    });
    expect(cancelled).toMatchObject({
      taskId: "agent-app-task-1",
      status: "cancelled",
    });
    expect(api.startTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: "session-1",
        idempotencyKey: "dashboard:content.scenario_planning:retry:1",
      }),
    );
    expect(retried).toMatchObject({
      taskId: "agent-app-task-2",
      retryOfTaskId: "agent-app-task-1",
      retryAttempt: 1,
    });
  });

  it("从 Agent App storage 恢复 runtime task state，支持刷新后继续读取和响应", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "agent-app-task-persisted",
        traceId: "agent-app-trace-persisted",
        taskKind: request.taskKind,
        sessionId: "session-persisted",
        turnId: "turn-persisted",
        eventName: `agent_app_runtime:${request.appId}:agent-app-task-persisted`,
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
      .createSdkContext("dashboard")
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
          (entry) =>
            entry.key === "agent-runtime/tasks/agent-app-task-persisted",
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
    const reloadedSdk = reloadedHost.createSdkContext("dashboard");
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
      taskId: "agent-app-task-persisted",
      sessionId: "session-persisted",
    });
    expect(restored).toMatchObject({
      taskId: "agent-app-task-persisted",
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
        expect.objectContaining({ taskId: "agent-app-task-persisted" }),
      ]),
    );
    expect(api.submitHostResponse).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-persisted",
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
      taskId: "agent-app-task-persisted",
      requestId: "request-1",
      status: "submitted",
      submittedAt: "2026-05-15T00:00:04.000Z",
    });
  });

  it("getTask 携带 sessionId 时可直接 replay 未持久化的 runtime task", async () => {
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
    const sdk = host.createSdkContext("dashboard");

    const restored = await sdk.agent.getTask({
      taskId: "agent-app-task-direct-replay",
      sessionId: "session-direct-replay",
      title: "恢复内容批次",
      taskKind: "content.copy.generate",
      expectedOutput: { artifactKind: "content_batch" },
    });
    const stream = await sdk.agent.streamTask({
      taskId: "agent-app-task-direct-replay",
      sessionId: "session-direct-replay",
    });

    expect(api.getTask).toHaveBeenCalledWith({
      appId: "content-factory-app",
      taskId: "agent-app-task-direct-replay",
      sessionId: "session-direct-replay",
    });
    expect(restored).toMatchObject({
      taskId: "agent-app-task-direct-replay",
      sessionId: "session-direct-replay",
      turnId: "turn-direct-replay",
      workspaceId: "workspace-1",
      title: "恢复内容批次",
      taskKind: "content.copy.generate",
      expectedOutput: { artifactKind: "content_batch" },
      status: "succeeded",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "artifact:created",
          payload: expect.objectContaining({
            contentFactoryWorkspacePatch: expect.objectContaining({
              contentBatch: { count: 20 },
            }),
          }),
        }),
      ]),
    });
    expect(stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "artifact:created" }),
      ]),
    );
  });

  it("在主 App 侧封装 Claw 式运行过程，包含模型、Token、费用和 Skill", async () => {
    const api = {
      startTask: vi.fn(async (request) => ({
        appId: request.appId,
        entryKey: request.entryKey,
        taskId: "agent-app-task-process",
        traceId: "agent-app-trace-process",
        taskKind: request.taskKind,
        sessionId: "session-process",
        turnId: "turn-process",
        eventName: `agent_app_runtime:${request.appId}:agent-app-task-process`,
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
                type: "final_done",
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
    const sdk = host.createSdkContext("dashboard");
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
        taskId: "agent-app-task-artifact-replay",
        traceId: "agent-app-trace-artifact-replay",
        taskKind: request.taskKind,
        sessionId: "session-artifact-replay",
        turnId: "turn-artifact-replay",
        eventName: `agent_app_runtime:${request.appId}:agent-app-task-artifact-replay`,
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
          session_id: request.sessionId,
          profile_status: "completed",
          artifacts: [
            {
              item_id: "artifact-item-1",
              path: ".lime/artifacts/content-batch.json",
              title: "内容批次",
              status: "completed",
              completed_at: "2026-05-15T00:00:03.000Z",
              metadata: {
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
    const sdk = host.createSdkContext("dashboard");
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
            source: "agent_runtime_artifact_replay",
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
        taskId: "agent-app-task-tool-replay",
        traceId: "agent-app-trace-tool-replay",
        taskKind: request.taskKind,
        sessionId: "session-tool-replay",
        turnId: "turn-tool-replay",
        eventName: `agent_app_runtime:${request.appId}:agent-app-task-tool-replay`,
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
          session_id: request.sessionId,
          profile_status: "completed",
          thread_read: {
            tool_calls: [
              {
                id: "web-fetch-call-1",
                tool_name: "WebFetch",
                status: "completed",
                success: true,
                output_preview: "fetched https://example.com",
                turn_id: "turn-tool-replay",
                timestamp: "2026-05-15T00:00:01.000Z",
              },
            ],
          },
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
    const sdk = host.createSdkContext("dashboard");
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
            source: "agent_runtime_tool_call_replay",
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
});
