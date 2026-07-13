import { describe, expect, it, vi } from "vitest";

import type { AgentRuntimeClient } from "@limecloud/agent-runtime-client";

import { createPluginRuntimeCapabilityApiFromClient } from "./agentRuntimeClientApi";

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
        thread: {
          archived: false,
          createdAtMs: 1_747_267_200_000,
          sessionId: "session-1",
          status: {
            type: "active" as const,
            activeFlags: ["waitingOnApproval" as const],
          },
          threadId: "thread-1",
          turns: [{
            approval: "pending" as const,
            createdAtMs: 1_747_267_200_000,
            items: [],
            itemsView: "full" as const,
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "inProgress" as const,
            updatedAtMs: 1_747_267_201_000,
          }],
          turnsView: "full" as const,
          updatedAtMs: 1_747_267_201_000,
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

describe("createPluginRuntimeCapabilityApiFromClient", () => {
  it("把 Plugin startTask 投影到标准 AgentRuntimeClient.startTurn", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient, {
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
      eventName: "plugin_runtime:content-factory-app:task-1",
      turnId: "turn-1",
      queueIfBusy: true,
      skipPreSubmitResume: false,
      metadata: { source: "plugin-test" },
      runtimeRequest: {
        providerConfig: {
          providerName: "anthropic",
          modelName: "claude-sonnet-4",
        },
        providerPreference: "anthropic",
        modelPreference: "claude-sonnet-4",
        reasoningEffort: "medium",
        sandboxPolicy: "workspace-write",
        metadata: { turn_source: "plugin" },
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
        eventName: "plugin_runtime:content-factory-app:task-1",
        queuedTurnId: "plugin-queued-task-1",
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
        runtimeRequest: {
          workspaceId: "workspace-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          providerConfig: {
            providerName: "anthropic",
            modelName: "claude-sonnet-4",
          },
          reasoningEffort: "medium",
          sandboxPolicy: "workspace-write",
          metadata: {
            source: "plugin-test",
            turn_source: "plugin",
          },
        },
      }),
      queueIfBusy: true,
      skipPreSubmitResume: false,
    });
    expect(result).toEqual({
      appId: "content-factory-app",
      entryKey: "dashboard",
      taskId: "task-1",
      traceId: "plugin-trace-task-1",
      taskKind: "content.copy.generate",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      eventName: "plugin_runtime:content-factory-app:task-1",
      status: "accepted",
      submittedAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("通过 readThread / cancelTurn / respondAction 承接 get/cancel/host response", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);

    const snapshot = await api.getTask({
      appId: "content-factory-app",
      taskId: "task-1",
      threadId: "thread-1",
    });
    const cancelled = await api.cancelTask({
      appId: "content-factory-app",
      taskId: "task-1",
      threadId: "thread-1",
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
        metadata: {
          workflowResume: {
            workflowRunId: "content-factory-run-1",
            workflowKey: "content_article_workflow",
            stepId: "draft",
          },
        },
        action_scope: {
          session_id: "session-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    });

    expect(runtimeClient.readThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnsView: "full",
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
      metadata: {
        workflowResume: {
          workflowRunId: "content-factory-run-1",
          workflowKey: "content_article_workflow",
          stepId: "draft",
        },
      },
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
        threadId: "thread-1",
        status: {
          type: "active",
          activeFlags: ["waitingOnApproval"],
        },
      },
    });
    expect(cancelled.status).toBe("cancelled");
    expect(submitted.status).toBe("submitted");
  });

  it("没有 sessionId 时 fail closed，不伪造独立 task 协议", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);

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

  it("startTurn 缺少 canonical threadId 时 fail closed", async () => {
    const runtimeClient = buildRuntimeClient();
    vi.mocked(runtimeClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-without-thread",
          sessionId: "session-1",
          threadId: "",
          status: "accepted",
        },
      },
      response: { jsonrpc: "2.0", id: 1, result: {} },
      notifications: [],
      messages: [],
    });
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);

    await expect(
      api.startTask({
        appId: "content-factory-app",
        sessionId: "session-1",
        taskKind: "content.copy.generate",
      }),
    ).rejects.toThrow("did not return a canonical threadId");
  });

  it("startTurn 返回不同 sessionId 时 fail closed", async () => {
    const runtimeClient = buildRuntimeClient();
    vi.mocked(runtimeClient.startTurn).mockResolvedValueOnce({
      id: 1,
      result: {
        turn: {
          turnId: "turn-other-session",
          sessionId: "session-other",
          threadId: "thread-1",
          status: "accepted",
        },
      },
      response: { jsonrpc: "2.0", id: 1, result: {} },
      notifications: [],
      messages: [],
    });
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);

    await expect(
      api.startTask({
        appId: "app",
        sessionId: "session-1",
        taskKind: "content.copy.generate",
      }),
    ).rejects.toThrow("different from the requested session");
  });

  it("readThread 返回错误 threadId 或非 full turns 时 fail closed", async () => {
    const runtimeClient = buildRuntimeClient();
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce({
      id: 2,
      result: {
        thread: {
          ...((await runtimeClient.readThread()).result.thread),
          threadId: "other-thread",
        },
      },
      response: { jsonrpc: "2.0", id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("returned threadId other-thread");

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce({
      id: 2,
      result: {
        thread: {
          ...((await runtimeClient.readThread()).result.thread),
          turnsView: "summary",
        },
      },
      response: { jsonrpc: "2.0", id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("did not return full turns");
  });

  it("readThread 校验 thread/session/turn identity 且 getTask 检测多个 active turn", async () => {
    const runtimeClient = buildRuntimeClient();
    const base = (await runtimeClient.readThread()).result.thread;
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);
    const invalid = (thread: typeof base) => ({
      id: 2,
      result: { thread },
      response: { jsonrpc: "2.0" as const, id: 2, result: {} },
      notifications: [],
      messages: [],
    });

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce(
      invalid({ ...base, sessionId: "" }),
    );
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("no sessionId");

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce(
      invalid({
        ...base,
        turns: [{ ...(base.turns ?? [])[0], turnId: "" }],
      }),
    );
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("invalid turn identity");

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce(
      invalid({
        ...base,
        turns: [
          ...(base.turns ?? []),
          { ...(base.turns ?? [])[0], turnId: "turn-1" },
        ],
      }),
    );
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("invalid turn identity");

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce(
      invalid({
        ...base,
        turns: [{ ...(base.turns ?? [])[0], sessionId: "session-other" }],
      }),
    );
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("mismatched turn identity");

    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce(
      invalid({
        ...base,
        turns: [
          ...(base.turns ?? []),
          { ...(base.turns ?? [])[0], turnId: "turn-2", queue: { state: "running" as const } },
        ],
      }),
    );
    await expect(
      api.getTask({ appId: "app", taskId: "task", threadId: "thread-1" }),
    ).rejects.toThrow("multiple active turns");
  });

  it("显式 turnId 只有匹配唯一 active turn 才允许取消", async () => {
    const runtimeClient = buildRuntimeClient();
    const base = (await runtimeClient.readThread()).result.thread;
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);
    const mismatched = await api.cancelTask({
      appId: "app",
      taskId: "task",
      threadId: "thread-1",
      turnId: "turn-other",
    });
    expect(mismatched.status).toBe("not_running");
    expect(runtimeClient.cancelTurn).not.toHaveBeenCalled();

    vi.mocked(runtimeClient.readThread).mockResolvedValue({
      id: 2,
      result: {
        thread: {
          ...base,
          turns: [{
            ...(base.turns ?? [])[0],
            status: "completed" as const,
          }],
        },
      },
      response: { jsonrpc: "2.0", id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const result = await api.cancelTask({
      appId: "app",
      taskId: "task",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(result.status).toBe("not_running");
    expect(runtimeClient.cancelTurn).not.toHaveBeenCalled();
  });

  it("取消时忽略 queued inProgress turn", async () => {
    const runtimeClient = buildRuntimeClient();
    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce({
      id: 2,
      result: {
        thread: {
          ...((await runtimeClient.readThread()).result.thread),
          turns: [{
            ...((await runtimeClient.readThread()).result.thread.turns ?? [])[0],
            queue: { state: "queued" as const },
          }],
        },
      },
      response: { jsonrpc: "2.0", id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);
    const result = await api.cancelTask({
      appId: "app",
      taskId: "task",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(result.status).toBe("not_running");
    expect(runtimeClient.cancelTurn).not.toHaveBeenCalled();
  });

  it("取消时检测多个 active turn", async () => {
    const runtimeClient = buildRuntimeClient();
    const base = (await runtimeClient.readThread()).result.thread;
    vi.mocked(runtimeClient.readThread).mockResolvedValueOnce({
      id: 2,
      result: {
        thread: {
          ...base,
          turns: [
            ...(base.turns ?? []),
            {
              ...(base.turns ?? [])[0],
              turnId: "turn-2",
              queue: { state: "running" as const },
            },
          ],
        },
      },
      response: { jsonrpc: "2.0", id: 2, result: {} },
      notifications: [],
      messages: [],
    });
    const api = createPluginRuntimeCapabilityApiFromClient(runtimeClient);
    await expect(
      api.cancelTask({
        appId: "app",
        taskId: "task",
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    ).rejects.toThrow("multiple active turns");
  });
});
