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
    });
    const snapshot = await sdk.agent.getTask(started.taskId);
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
      }),
    );
    expect(started).toMatchObject({
      taskId: "agent-app-task-1",
      traceId: "agent-app-trace-1",
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
      ]),
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
});
