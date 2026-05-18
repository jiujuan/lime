import { describe, expect, it, vi } from "vitest";
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
      taskKind: "content.scenario_planning",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      tools: ["image_generation"],
      humanReview: true,
      providerPreference: "deepseek",
      modelPreference: "deepseek-v4-flash",
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
        taskKind: "content.scenario_planning",
        capabilityHints: ["image_generation"],
        humanReview: true,
        providerPreference: "deepseek",
        modelPreference: "deepseek-v4-flash",
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
            entry.key ===
            "agent-runtime/tasks/agent-app-task-persisted",
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
                result: { output: "完成", metadata: { command_name: "knowledge-builder" } },
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
      skillNames: expect.arrayContaining(["knowledge-builder", "content-reviewer"]),
      invokedSkillNames: ["knowledge-builder"],
      streamText: "第一段输出",
      thinkingText: "先分析内容目标",
    });
    expect(snapshot?.process).toBe(snapshot?.runtimeProcess);
    expect(snapshot?.runtimeProcess?.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "routing", title: "模型路由" }),
        expect.objectContaining({ kind: "skill", title: "Skill · knowledge-builder" }),
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
                        "```json\n{\"contentFactoryWorkspacePatch\":{\"kind\":\"content_batch\",\"contentBatch\":{\"count\":20,\"items\":[{\"title\":\"突出\"一擦即净\"的视觉感\"}]}}}\n```",
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
});
