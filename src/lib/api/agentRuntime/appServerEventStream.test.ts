import { describe, expect, it } from "vitest";
import { APP_SERVER_METHOD_AGENT_SESSION_EVENT } from "@/lib/api/appServer";
import { projectAppServerAgentEventPayload } from "./appServerEventStream";

describe("appServerEventStream", () => {
  it("message.delta 应读取 App Server content.text 增量", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-message-delta",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 10,
          timestamp: "2026-07-02T10:00:00.000Z",
          type: "message.delta",
          payload: {
            role: "assistant",
            visibility: "user_visible",
            content: {
              kind: "inline_text",
              text: "正在准备文章工作区",
            },
            status: "streaming",
            streamPhase: "process",
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "text_delta",
      text: "正在准备文章工作区",
      phase: "process",
    });
  });

  it("artifact.snapshot 应保留 sidecar 读取所需 metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-artifact-sidecar",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 11,
          timestamp: "2026-07-02T10:00:01.000Z",
          type: "artifact.snapshot",
          payload: {
            artifact: {
              artifactId: "task-1:workspace-patch",
              artifactRef: "task-1:workspace-patch",
              filePath: ".lime/artifacts/content-factory/workspace-patch.json",
              contentStatus: "available",
              sidecarRef: {
                kind: "artifact_snapshot",
                relativePath:
                  "sessions/session-1/runtime-artifacts/workspace-patch.json",
              },
              metadata: {
                kind: "content_factory.workspace_patch",
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "artifact_snapshot",
      artifact: {
        artifactId: "task-1:workspace-patch",
        artifactRef: "task-1:workspace-patch",
        filePath: ".lime/artifacts/content-factory/workspace-patch.json",
        metadata: {
          sessionId: "session-1",
          turnId: "turn-1",
          artifactRef: "task-1:workspace-patch",
          appServerArtifactRef: "task-1:workspace-patch",
          contentStatus: "available",
          sidecarRef: {
            relativePath:
              "sessions/session-1/runtime-artifacts/workspace-patch.json",
          },
        },
      },
    });
  });

  it("workflow connector 与 hook 审计事件不进入普通 timeline 投影", () => {
    const baseEvent = {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      timestamp: "2026-07-02T10:00:01.000Z",
      payload: {
        appId: "content-factory-app",
        taskId: "turn-1:content_article_generate",
        taskKind: "content.article.generate",
        workflowRunId: "turn-1:content_article_generate:workflow",
        workflowKey: "content_article_workflow",
        stepId: "research",
        status: "completed",
        auditOnly: true,
      },
    };

    for (const type of [
      "workflow.connector.requested",
      "workflow.connector.completed",
      "workflow.hook.started",
      "workflow.hook.completed",
      "workflow.run.retrying",
      "workflow.step.retrying",
    ]) {
      const payload = projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            ...baseEvent,
            eventId: `event-${type}`,
            sequence: 12,
            type,
          },
        },
      } as never);

      expect(payload).toBeNull();
    }
  });

  it("image_task.created 应从真实 payload 投影为图片任务创建事件", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-image-created",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 11,
          timestamp: "2026-07-02T10:00:00.000Z",
          type: "image_task.created",
          payload: {
            source: "image_command_workflow",
            taskId: "task-image-created-1",
            artifactPath:
              ".lime/tasks/image_generate/task-image-created-1.json",
            response: {
              success: true,
              task_id: "task-image-created-1",
              task_type: "image_generate",
              task_family: "image_generation",
              status: "pending_submit",
              normalized_status: "pending",
              artifact_path:
                ".lime/tasks/image_generate/task-image-created-1.json",
              record: {
                payload: {
                  prompt: "画一张广州夏天的图",
                  session_id: "session-1",
                  turn_id: "turn-1",
                },
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "image_task_created",
      task_id: "task-image-created-1",
      task_type: "image_generate",
      task_family: "image_generation",
      status: "pending_submit",
      normalized_status: "pending",
      artifact_path: ".lime/tasks/image_generate/task-image-created-1.json",
      payload: {
        prompt: "画一张广州夏天的图",
        session_id: "session-1",
        turn_id: "turn-1",
      },
    });
  });

  it("image_task.parameters.required 应投影为 runtime_status 而不是 action_required", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-1",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 12,
          timestamp: "2026-07-02T10:00:00.000Z",
          type: "image_task.parameters.required",
          payload: {
            missing: ["project_root_path"],
            prompt: "图片生成还需要补充必要信息。",
            image_task: {
              prompt: "画一张广州夏天的图",
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "runtime_status",
      status: {
        phase: "routing",
        title: "图片生成需要补充信息",
        detail: "缺少: project_root_path",
        checkpoints: ["project_root_path"],
        metadata: {
          source: "image_command_workflow",
          agentui: {
            workflow_key: "image_command_workflow",
            status_kind: "image_task_parameters_required",
            missing: ["project_root_path"],
            missing_parameters: ["project_root_path"],
            image_task: {
              prompt: "画一张广州夏天的图",
            },
          },
        },
      },
    });
    expect(payload).not.toHaveProperty("action_type");
  });
});
