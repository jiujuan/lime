import { describe, expect, it, vi } from "vitest";

import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";

import { createAgentAppRuntimeCapabilityApiFromClient } from "./agentRuntimeClientApi";

function buildRuntimeClient(): Pick<
  AgentRuntimeClient,
  "startTurn" | "readThread" | "cancelTurn" | "respondAction"
> {
  return {
    startTurn: vi.fn(async () => ({
      id: 1,
      result: {
        turn: {
          turnId: "turn-1",
          sessionId: "session-1",
          threadId: "thread-1",
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
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          status: "waitingAction" as const,
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:01.000Z",
        },
        turns: [
          {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "waitingAction" as const,
          },
        ],
        detail: {
          thread_read: {
            session_id: "session-1",
            profile_status: "blocked",
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
}

describe("createAgentAppRuntimeCapabilityApiFromClient", () => {
  it("把 Agent App startTask 投影到标准 AgentRuntimeClient.startTurn", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createAgentAppRuntimeCapabilityApiFromClient(runtimeClient, {
      now: () => "2026-05-15T00:00:02.000Z",
    });

    const result = await api.startTask({
      appId: "content-factory-app",
      entryKey: "dashboard",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      taskId: "task-1",
      taskKind: "content.copy.generate",
      title: "生成内容批次",
      prompt: "生成 20 条发布内容",
      input: { projectId: "project-1" },
      expectedOutput: {
        artifactKind: "content_batch",
        outputFormat: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
              },
            },
            required: ["items"],
          },
          maxValidationRetries: 2,
        },
      },
      eventName: "agent_app_runtime:content-factory-app:task-1",
      turnId: "turn-1",
      providerPreference: "anthropic",
      modelPreference: "claude-sonnet-4",
      queueIfBusy: true,
      skipPreSubmitResume: false,
      metadata: { source: "agent-app-test" },
      turnConfig: {
        provider_config: {
          provider_name: "anthropic",
          model_name: "claude-sonnet-4",
        },
        reasoning_effort: "medium",
        sandbox_policy: "workspace-write",
        metadata: { turn_source: "agent-app" },
      },
    });

    expect(runtimeClient.startTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      input: {
        text: expect.stringContaining("Business Prompt:"),
        attachments: [],
      },
      runtimeOptions: expect.objectContaining({
        stream: true,
        eventName: "agent_app_runtime:content-factory-app:task-1",
        providerPreference: "anthropic",
        modelPreference: "claude-sonnet-4",
        queuedTurnId: "agent-app-queued-task-1",
        expectedOutput: {
          artifactKind: "content_batch",
          outputFormat: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                },
              },
              required: ["items"],
            },
            maxValidationRetries: 2,
          },
        },
        structuredOutput: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
              },
            },
            required: ["items"],
          },
          maxValidationRetries: 2,
        },
        outputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
            },
          },
          required: ["items"],
        },
        metadata: {
          source: "agent-app-test",
          turn_source: "agent-app",
        },
        hostOptions: {
          asterChatRequest: expect.objectContaining({
            session_id: "session-1",
            turn_id: "turn-1",
            workspace_id: "workspace-1",
            provider_preference: "anthropic",
            model_preference: "claude-sonnet-4",
            provider_config: {
              provider_name: "anthropic",
              model_name: "claude-sonnet-4",
            },
            queued_turn_id: "agent-app-queued-task-1",
            expected_output: {
              artifactKind: "content_batch",
              outputFormat: {
                type: "json_schema",
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                    },
                  },
                  required: ["items"],
                },
                maxValidationRetries: 2,
              },
            },
            structured_output: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                  },
                },
                required: ["items"],
              },
              maxValidationRetries: 2,
            },
            output_schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                },
              },
              required: ["items"],
            },
            turn_config: expect.objectContaining({
              provider_config: {
                provider_name: "anthropic",
                model_name: "claude-sonnet-4",
              },
            }),
          }),
        },
      }),
      queueIfBusy: true,
      skipPreSubmitResume: false,
    });
    expect(result).toEqual({
      appId: "content-factory-app",
      entryKey: "dashboard",
      taskId: "task-1",
      traceId: "agent-app-trace-task-1",
      taskKind: "content.copy.generate",
      sessionId: "session-1",
      turnId: "turn-1",
      eventName: "agent_app_runtime:content-factory-app:task-1",
      status: "accepted",
      submittedAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("通过 readThread / cancelTurn / respondAction 承接 get/cancel/host response", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createAgentAppRuntimeCapabilityApiFromClient(runtimeClient);

    const snapshot = await api.getTask({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
    });
    const cancelled = await api.cancelTask({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
    });
    const submitted = await api.submitHostResponse({
      appId: "content-factory-app",
      taskId: "task-1",
      runtimeRequest: {
        session_id: "session-1",
        request_id: "request-1",
        action_type: "ask_user",
        confirmed: true,
        response: "继续执行",
        action_scope: {
          session_id: "session-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    });

    expect(runtimeClient.readThread).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(runtimeClient.cancelTurn).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
    });
    expect(runtimeClient.respondAction).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续执行",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
    expect(snapshot).toMatchObject({
      status: "thread_read_available",
      taskStatus: "blocked",
      threadRead: {
        session_id: "session-1",
        profile_status: "blocked",
      },
    });
    expect(cancelled.status).toBe("cancelled");
    expect(submitted.status).toBe("submitted");
  });

  it("没有 sessionId 时 fail closed，不伪造独立 task 协议", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createAgentAppRuntimeCapabilityApiFromClient(runtimeClient);

    await expect(
      api.startTask({
        appId: "content-factory-app",
        taskKind: "content.copy.generate",
      }),
    ).rejects.toThrow(
      "AgentRuntimeClient adapter requires an existing sessionId",
    );
    expect(runtimeClient.startTurn).not.toHaveBeenCalled();
  });
});
