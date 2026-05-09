import { afterEach, describe, expect, it } from "vitest";

import {
  clearAgentUiProjectionEvents,
  conversationProjectionStore,
  selectAgentUiProjectionEvents,
  selectAgentUiProjectionEventsBySurface,
} from "./conversationProjectionStore";
import {
  buildAgentUiRemoteTaskProjectionEventsFromAgentRun,
  buildAgentUiRemoteTaskProjectionEvents,
  buildRemoteTaskAgentUiProjectionInputFromAgentRun,
  recordRemoteTaskAgentUiProjection,
  recordRemoteTaskAgentUiProjectionFromAgentRun,
} from "./remoteTaskAgentUiProjection";
import type { AgentRun } from "@/lib/api/executionRun";

function buildAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-remote-1",
    source: "chat",
    source_ref: "agent.run",
    session_id: "session-remote-run",
    status: "running",
    started_at: "2026-05-09T10:00:00.000Z",
    finished_at: null,
    duration_ms: null,
    error_code: null,
    error_message: null,
    metadata: null,
    created_at: "2026-05-09T10:00:00.000Z",
    updated_at: "2026-05-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("remoteTaskAgentUiProjection", () => {
  afterEach(() => {
    clearAgentUiProjectionEvents();
  });

  it("应把结构化 remote task 映射为 external_task / remote_teammate", () => {
    const events = buildAgentUiRemoteTaskProjectionEvents(
      {
        remoteTaskId: "remote-task-1",
        event: "needs_input",
        title: "远端资料审核",
        inputSummary: "请远端 reviewer 核对证据",
        authRequired: true,
        authStatus: "needs_oauth",
        agentCard: {
          id: "agent-card-reviewer",
          name: "Remote Reviewer",
          provider: "a2a",
          url: "https://agents.example/card.json",
        },
        artifacts: [
          {
            artifactId: "remote-artifact-1",
            artifactPath: "remote/review.md",
            title: "远端审核稿",
            status: "updated",
          },
        ],
      },
      {
        sessionId: "session-remote-1",
        threadId: "thread-remote-1",
        sequence: 10,
        timestamp: "2026-05-09T10:00:00.000Z",
      },
    );

    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      type: "agent.changed",
      sourceType: "remote_task_projection",
      sequence: 10,
      sessionId: "session-remote-1",
      threadId: "thread-remote-1",
      taskId: "remote-task-1",
      agentId: "agent-card-reviewer",
      agentName: "Remote Reviewer",
      surface: "remote_teammate",
      control: "answer",
      topology: "remote_teammate",
      runtimeEntity: "external_task",
      runtimeStatus: "needs_input",
      payload: expect.objectContaining({
        remoteEvent: "needs_input",
        remoteTaskId: "remote-task-1",
        inputSummary: "请远端 reviewer 核对证据",
        agentCardProvider: "a2a",
        authRequired: true,
        authStatus: "needs_oauth",
        artifactCount: 1,
      }),
      refs: {
        artifactIds: ["remote-artifact-1"],
        artifactPaths: ["remote/review.md"],
      },
    });
    expect(events[1]).toMatchObject({
      type: "task.changed",
      sequence: 11,
      surface: "remote_teammate",
      runtimeEntity: "external_task",
      runtimeStatus: "needs_input",
    });
    expect(events[2]).toMatchObject({
      type: "action.required",
      sequence: 12,
      actionId: "remote-task-1:auth",
      surface: "remote_teammate",
      control: "answer",
      runtimeEntity: "external_task",
      runtimeStatus: "needs_input",
      payload: expect.objectContaining({
        actionKind: "remote_task_auth_required",
        remoteEvent: "needs_input",
        authRequired: true,
      }),
    });
    expect(events[3]).toMatchObject({
      type: "artifact.updated",
      sequence: 13,
      artifactId: "remote-artifact-1",
      surface: "artifact_workspace",
      runtimeEntity: "external_task",
      payload: expect.objectContaining({
        artifactPath: "remote/review.md",
        artifactTitle: "远端审核稿",
      }),
    });
  });

  it("应只在真实 terminal remote status 时输出 worker notification", () => {
    const runningEvents = buildAgentUiRemoteTaskProjectionEvents({
      remoteTaskId: "remote-task-running",
      event: "updated",
    });
    expect(
      runningEvents.some((event) => event.type === "worker.notification"),
    ).toBe(false);

    const completedEvents = buildAgentUiRemoteTaskProjectionEvents({
      remoteTaskId: "remote-task-done",
      event: "completed",
    });
    expect(completedEvents).toContainEqual(
      expect.objectContaining({
        type: "worker.notification",
        workerNotificationId: "remote-task-done:completed",
        surface: "worker_notifications",
        runtimeEntity: "external_task",
        payload: expect.objectContaining({
          notificationKind: "remote_task_terminal",
        }),
      }),
    );
  });

  it("应把 auth_required 映射为待输入控制，不从 heartbeat 猜测状态", () => {
    const events = buildAgentUiRemoteTaskProjectionEvents({
      remoteTaskId: "remote-task-auth",
      event: "auth_required",
      agentCard: {
        provider: "a2a",
      },
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.changed",
        remoteTaskId: "remote-task-auth",
        surface: "remote_teammate",
        control: "answer",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: expect.objectContaining({
          remoteEvent: "auth_required",
          provider: "a2a",
          inputRequired: true,
          authRequired: true,
          authStatus: "auth_required",
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "action.required",
        actionId: "remote-task-auth:auth",
        remoteTaskId: "remote-task-auth",
        surface: "remote_teammate",
        control: "answer",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: expect.objectContaining({
          actionKind: "remote_task_auth_required",
          authRequired: true,
        }),
      }),
    );
    expect(
      events.some((event) => event.type === "worker.notification"),
    ).toBe(false);
  });

  it("应写入 conversationProjectionStore.agentUi 供 Team Workbench 消费", () => {
    const recorded = recordRemoteTaskAgentUiProjection(
      {
        remoteTaskId: "remote-task-store",
        event: "updated",
        agentCard: {
          name: "A2A Remote",
        },
      },
      { sessionId: "session-remote-store" },
    );

    expect(recorded).toHaveLength(2);
    const snapshot = conversationProjectionStore.getSnapshot();
    expect(selectAgentUiProjectionEvents(snapshot)).toHaveLength(2);
    expect(
      selectAgentUiProjectionEventsBySurface(snapshot, "remote_teammate"),
    ).toEqual([
      expect.objectContaining({
        sourceType: "remote_task_projection",
        taskId: "remote-task-store",
        agentName: "A2A Remote",
        runtimeEntity: "external_task",
      }),
      expect.objectContaining({
        sourceType: "remote_task_projection",
        taskId: "remote-task-store",
        runtimeEntity: "external_task",
      }),
    ]);
  });

  it("应从 agent_runs.metadata 的 remote_task provenance 构造 Agent UI projection", () => {
    const run = buildAgentRun({
      id: "run-gateway-telegram-1",
      session_id: "session-gateway-telegram",
      status: "success",
      finished_at: "2026-05-09T10:01:00.000Z",
      updated_at: "2026-05-09T10:01:00.000Z",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            source: "gateway_channel",
            channel: "telegram",
            accountId: "default",
            remoteTaskId: "gateway:telegram:default:message-1",
            agentCard: {
              id: "telegram:default",
              name: "Telegram Remote",
              provider: "telegram",
            },
            artifacts: [
              {
                artifactId: "remote-result-1",
                artifactPath: "remote/telegram/result.md",
                title: "远程结果",
                status: "completed",
              },
            ],
          },
        },
        result: {
          artifacts: [
            {
              id: "remote-terminal-artifact-1",
              path: "remote/telegram/terminal.json",
              title: "终态结果",
              status: "completed",
            },
          ],
        },
        content: "远程任务已完成",
      }),
    });

    const input = buildRemoteTaskAgentUiProjectionInputFromAgentRun(run);
    expect(input).toMatchObject({
      remoteTaskId: "gateway:telegram:default:message-1",
      event: "completed",
      status: "completed",
      source: "gateway_channel",
      channel: "telegram",
      accountId: "default",
      inboundMessageId: undefined,
      sessionId: "session-gateway-telegram",
      runId: "run-gateway-telegram-1",
      agentCard: {
        id: "telegram:default",
        name: "Telegram Remote",
        provider: "telegram",
      },
      artifacts: [
        {
          artifactId: "remote-result-1",
          artifactPath: "remote/telegram/result.md",
        },
        {
          artifactId: "remote-terminal-artifact-1",
          artifactPath: "remote/telegram/terminal.json",
        },
      ],
    });

    const events = buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "artifact.updated",
        artifactId: "remote-terminal-artifact-1",
        surface: "artifact_workspace",
        runId: "run-gateway-telegram-1",
        sessionId: "session-gateway-telegram",
        runtimeEntity: "external_task",
        payload: expect.objectContaining({
          remoteEvent: "completed",
          artifactPath: "remote/telegram/terminal.json",
          artifactTitle: "终态结果",
          artifactStatus: "completed",
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "worker.notification",
        workerNotificationId:
          "gateway:telegram:default:message-1:completed",
        surface: "worker_notifications",
        runId: "run-gateway-telegram-1",
        sessionId: "session-gateway-telegram",
        runtimeEntity: "external_task",
        runtimeStatus: "completed",
        payload: expect.objectContaining({
          source: "gateway_channel",
          channel: "telegram",
          accountId: "default",
        }),
      }),
    );
  });

  it("应从 agent run remote_task metadata 消费待输入与鉴权 source", () => {
    const inputRun = buildAgentRun({
      id: "run-gateway-input-1",
      status: "running",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "discord",
            accountId: "default",
            remoteTaskId: "gateway:discord:default:message-1",
            inputRequired: true,
            inputSummary: "需要远端用户补充订单号",
          },
        },
      }),
    });
    const authRun = buildAgentRun({
      id: "run-gateway-auth-1",
      status: "running",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "feishu",
            accountId: "default",
            remoteTaskId: "gateway:feishu:default:message-auth",
            authStatus: "needs_oauth",
          },
        },
      }),
    });

    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(inputRun))
      .toMatchObject({
        remoteTaskId: "gateway:discord:default:message-1",
        event: "needs_input",
        status: "needs_input",
        inputRequired: true,
        authRequired: undefined,
        authStatus: undefined,
      });
    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(authRun))
      .toMatchObject({
        remoteTaskId: "gateway:feishu:default:message-auth",
        event: "auth_required",
        status: "needs_input",
        inputRequired: undefined,
        authRequired: undefined,
        authStatus: "needs_oauth",
      });

    const events = buildAgentUiRemoteTaskProjectionEventsFromAgentRun(authRun);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.changed",
        sourceType: "remote_task_projection",
        remoteTaskId: "gateway:feishu:default:message-auth",
        control: "answer",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: expect.objectContaining({
          remoteEvent: "auth_required",
          inputRequired: true,
          authRequired: true,
          authStatus: "needs_oauth",
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "action.required",
        actionId: "gateway:feishu:default:message-auth:auth",
        sourceType: "remote_task_projection",
        remoteTaskId: "gateway:feishu:default:message-auth",
        surface: "remote_teammate",
        control: "answer",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: expect.objectContaining({
          actionKind: "remote_task_auth_required",
          authStatus: "needs_oauth",
        }),
      }),
    );
    expect(
      events.some((event) => event.type === "worker.notification"),
    ).toBe(false);
  });

  it("应从 remote_task status 与 artifact update metadata 消费非终态 A2A lifecycle", () => {
    const run = buildAgentRun({
      id: "run-a2a-artifact-1",
      status: "running",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "a2a",
            remoteTaskId: "a2a-task-artifact-1",
            event: "artifact.updated",
            taskStatus: "working",
            a2aTask: {
              artifacts: [
                {
                  artifact_id: "a2a-artifact-1",
                  artifact_path: "remote/a2a/report.md",
                  content_ref: "remote-blob://a2a/artifact-1",
                  content_url: "https://remote.example/artifacts/1",
                  mime_type: "text/markdown",
                  size_bytes: 4096,
                  sha256: "sha256:a2a-artifact-1",
                  preview: "远端报告预览",
                  title: "A2A 远端报告",
                  status: "updated",
                },
              ],
            },
          },
        },
      }),
    });

    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(run))
      .toMatchObject({
        remoteTaskId: "a2a-task-artifact-1",
        event: "artifact_updated",
        status: "running",
        artifacts: [
          {
            artifactId: "a2a-artifact-1",
            artifactPath: "remote/a2a/report.md",
            contentRef: "remote-blob://a2a/artifact-1",
            contentUrl: "https://remote.example/artifacts/1",
            mimeType: "text/markdown",
            byteSize: "4096",
            digest: "sha256:a2a-artifact-1",
            preview: "远端报告预览",
          },
        ],
      });

    const events = buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.changed",
        surface: "remote_teammate",
        runtimeEntity: "external_task",
        runtimeStatus: "running",
        payload: expect.objectContaining({
          remoteEvent: "artifact_updated",
          artifactCount: 1,
          primaryArtifactContentRef: "remote-blob://a2a/artifact-1",
          primaryArtifactContentUrl: "https://remote.example/artifacts/1",
          primaryArtifactMimeType: "text/markdown",
          primaryArtifactDigest: "sha256:a2a-artifact-1",
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "artifact.updated",
        artifactId: "a2a-artifact-1",
        surface: "artifact_workspace",
        runtimeEntity: "external_task",
        runtimeStatus: "running",
        payload: expect.objectContaining({
          remoteEvent: "artifact_updated",
          artifactContentRef: "remote-blob://a2a/artifact-1",
          artifactContentUrl: "https://remote.example/artifacts/1",
          artifactMimeType: "text/markdown",
          artifactByteSize: "4096",
          artifactDigest: "sha256:a2a-artifact-1",
          artifactPreview: "远端报告预览",
          artifactTitle: "A2A 远端报告",
        }),
      }),
    );
  });

  it("应从 remote_task status 消费待输入 A2A lifecycle 并输出 action.required", () => {
    const run = buildAgentRun({
      id: "run-a2a-waiting",
      status: "running",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "a2a",
            remoteTaskId: "a2a-task-waiting",
            taskStatus: "waiting",
          },
        },
      }),
    });

    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(run))
      .toMatchObject({
        remoteTaskId: "a2a-task-waiting",
        event: "needs_input",
        status: "needs_input",
        remoteStatus: "waiting",
      });
    expect(buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run))
      .toContainEqual(
        expect.objectContaining({
          type: "action.required",
          actionId: "a2a-task-waiting:input",
          surface: "remote_teammate",
          control: "answer",
          runtimeEntity: "external_task",
          runtimeStatus: "needs_input",
          payload: expect.objectContaining({
            actionKind: "remote_task_input_required",
            remoteEvent: "needs_input",
            remoteStatus: "waiting",
          }),
        }),
      );
  });

  it("应从 remote_task status 消费终态 A2A lifecycle", () => {
    const run = buildAgentRun({
      id: "run-a2a-terminal",
      status: "running",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "a2a",
            remoteTaskId: "a2a-task-terminal",
            taskStatus: "completed",
          },
        },
      }),
    });

    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(run))
      .toMatchObject({
        remoteTaskId: "a2a-task-terminal",
        event: "completed",
        status: "completed",
        remoteStatus: "completed",
      });
    expect(buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run))
      .toContainEqual(
        expect.objectContaining({
          type: "worker.notification",
          workerNotificationId: "a2a-task-terminal:completed",
          surface: "worker_notifications",
          runtimeEntity: "external_task",
          runtimeStatus: "completed",
        }),
      );
  });

  it("应让 terminal AgentRun status 优先于 stale remote_task status", () => {
    const run = buildAgentRun({
      id: "run-a2a-terminal-priority",
      status: "success",
      finished_at: "2026-05-09T10:02:00.000Z",
      metadata: JSON.stringify({
        source_metadata: {
          remote_task: {
            channel: "a2a",
            remoteTaskId: "a2a-task-terminal-priority",
            inputRequired: true,
            taskStatus: "running",
          },
        },
      }),
    });

    expect(buildRemoteTaskAgentUiProjectionInputFromAgentRun(run))
      .toMatchObject({
        remoteTaskId: "a2a-task-terminal-priority",
        event: "completed",
        status: "completed",
        inputRequired: true,
        remoteStatus: "running",
      });
    const events = buildAgentUiRemoteTaskProjectionEventsFromAgentRun(run);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "worker.notification",
        workerNotificationId: "a2a-task-terminal-priority:completed",
        runtimeStatus: "completed",
      }),
    );
    expect(events.some((event) => event.type === "action.required")).toBe(false);
  });

  it("应忽略没有 remote_task provenance 的 agent run", () => {
    expect(
      buildRemoteTaskAgentUiProjectionInputFromAgentRun(
        buildAgentRun({
          metadata: JSON.stringify({
            trigger: "websocket_rpc",
          }),
        }),
      ),
    ).toBeNull();
    expect(
      buildRemoteTaskAgentUiProjectionInputFromAgentRun(
        buildAgentRun({
          metadata: "{not-json",
        }),
      ),
    ).toBeNull();
  });

  it("应把 agent run remote projection 写入 store", () => {
    const recorded = recordRemoteTaskAgentUiProjectionFromAgentRun(
      buildAgentRun({
        id: "run-gateway-feishu-1",
        status: "running",
        metadata: JSON.stringify({
          sourceMetadata: {
            remoteTask: {
              channel: "feishu",
              accountId: "default",
              remoteTaskId: "gateway:feishu:default:message-1",
            },
          },
        }),
      }),
    );

    expect(recorded).toHaveLength(2);
    expect(
      selectAgentUiProjectionEvents(conversationProjectionStore.getSnapshot()),
    ).toContainEqual(
      expect.objectContaining({
        sourceType: "remote_task_projection",
        remoteTaskId: "gateway:feishu:default:message-1",
        agentId: "feishu:default",
        runtimeStatus: "running",
      }),
    );
  });
});
