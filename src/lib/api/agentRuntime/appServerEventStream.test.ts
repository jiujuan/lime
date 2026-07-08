import { describe, expect, it } from "vitest";
import { LEGACY_RUNTIME_TURN_TERMINAL_EVENT_CLASSES } from "@limecloud/agent-ui-contracts";
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

  it("reasoning.delta 应保留 App Server metadata 作为 providerMetadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-reasoning-visible-summary",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 11,
          timestamp: "2026-07-02T10:00:00.000Z",
          type: "reasoning.delta",
          payload: {
            text: "先确认图片的光线和构图。",
            metadata: {
              presentation: "visible_process_summary",
              source: "image_command_workflow",
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "reasoning_delta",
      text: "先确认图片的光线和构图。",
      providerMetadata: {
        presentation: "visible_process_summary",
        source: "image_command_workflow",
      },
    });
  });

  it("provider trace 应透传 runtime provider handle metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-provider-trace",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 12,
          timestamp: "2026-07-05T10:00:00.000Z",
          type: "provider.first_text_delta.received",
          payload: {
            stage: "first_text_delta_received",
            provider: "openai",
            model: "gpt-5.3-codex",
            attempt: 1,
            elapsed_ms: 1400,
            text_chars: 12,
            status: "running",
            runtime_provider_backend: "aster_compat",
            runtime_provider_selector: "codex",
            runtime_provider_protocol: "responses",
            runtime_provider_active_model: "gpt-5.3-codex",
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "provider_trace",
      runtime_event_type: "provider.first_text_delta.received",
      stage: "first_text_delta_received",
      provider: "openai",
      model: "gpt-5.3-codex",
      runtime_provider_backend: "aster_compat",
      runtime_provider_selector: "codex",
      runtime_provider_protocol: "responses",
      runtime_provider_active_model: "gpt-5.3-codex",
    });
  });

  it("legacy terminal 事件不应投影成 current turn terminal payload", () => {
    for (const type of LEGACY_RUNTIME_TURN_TERMINAL_EVENT_CLASSES) {
      const payload = projectAppServerAgentEventPayload({
        method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
        params: {
          event: {
            eventId: `event-legacy-${type}`,
            sessionId: "session-1",
            threadId: "thread-1",
            turnId: "turn-legacy",
            sequence: 13,
            timestamp: "2026-07-05T10:00:00.000Z",
            type,
            payload: {
              text: "旧终态不应成为最终正文",
            },
          },
        },
      } as never);

      expect(payload).toBeNull();
    }
  });

  it("tool.started 应保留 runtime 产出的过程摘要 metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-tool-start",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 13,
          timestamp: "2026-07-05T10:00:01.000Z",
          type: "tool.started",
          payload: {
            toolCallId: "tool-search-start",
            tool_name: "web_search",
            arguments: { query: "runtime facts" },
            metadata: {
              tool_process_summary: {
                source: "runtime_facts",
                pre: {
                  key: "toolCall.processSummary.webSearch.searchFirstWithQuery",
                  values: { query: "runtime facts" },
                },
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "tool_start",
      tool_id: "tool-search-start",
      tool_name: "web_search",
      metadata: {
        tool_process_summary: {
          source: "runtime_facts",
        },
      },
    });
  });

  it("tool.progress 应保留 App Server 产出的 lifecycle metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-tool-progress",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 14,
          timestamp: "2026-07-05T10:00:01.500Z",
          type: "tool.progress",
          payload: {
            toolCallId: "tool-search-progress",
            message: "reading response",
            metadata: {
              soul_lifecycle: {
                surface: "tool_lifecycle",
                phase: "tool_progress",
                status: "progress",
                styleLevel: "L1",
                riskLevel: "normal",
              },
              tool_process_facts: {
                status: "progress",
                phase: "tool_progress",
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "tool_progress",
      tool_id: "tool-search-progress",
      progress: {
        message: "reading response",
        metadata: {
          soul_lifecycle: {
            phase: "tool_progress",
            status: "progress",
          },
          tool_process_facts: {
            status: "progress",
          },
        },
      },
    });
  });

  it("tool.output.delta 应保留 App Server 产出的 lifecycle metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-tool-output-delta",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 15,
          timestamp: "2026-07-05T10:00:01.750Z",
          type: "tool.output.delta",
          payload: {
            toolCallId: "tool-search-progress",
            delta: "partial output",
            metadata: {
              soul_lifecycle: {
                surface: "tool_lifecycle",
                phase: "tool_progress",
                status: "output_delta",
                styleLevel: "L1",
                riskLevel: "normal",
              },
              tool_process_facts: {
                status: "output_delta",
                phase: "tool_progress",
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "tool_output_delta",
      tool_id: "tool-search-progress",
      delta: "partial output",
      metadata: {
        soul_lifecycle: {
          phase: "tool_progress",
          status: "output_delta",
        },
        tool_process_facts: {
          status: "output_delta",
        },
      },
    });
  });

  it("tool.result 应保留 structuredContent 供工具过程展示正文", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-tool-result-structured-content",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 16,
          timestamp: "2026-07-05T10:00:02.000Z",
          type: "tool.result",
          payload: {
            toolCallId: "tool-mcp-structured",
            result: {
              success: true,
              output: JSON.stringify({
                request_metadata: {
                  event: "agentSession/turn/start",
                },
                diagnostics: {
                  projection: "mcp_tool_result_projection",
                },
              }),
              structuredContent: {
                answer: "MCP structuredContent 展示验证完成",
                ids: ["doc-structured-1"],
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "tool_end",
      tool_id: "tool-mcp-structured",
      result: {
        success: true,
        structuredContent: {
          answer: "MCP structuredContent 展示验证完成",
          ids: ["doc-structured-1"],
        },
        structured_content: {
          answer: "MCP structuredContent 展示验证完成",
          ids: ["doc-structured-1"],
        },
      },
    });
  });

  it("tool.failed 应按工具终态投影并保留失败过程摘要 metadata", () => {
    const payload = projectAppServerAgentEventPayload({
      method: APP_SERVER_METHOD_AGENT_SESSION_EVENT,
      params: {
        event: {
          eventId: "event-tool-failed",
          sessionId: "session-1",
          threadId: "thread-1",
          turnId: "turn-1",
          sequence: 14,
          timestamp: "2026-07-05T10:00:02.000Z",
          type: "tool.failed",
          payload: {
            toolCallId: "tool-failed",
            result: {
              success: false,
              output: "test failed",
              error: "exit code 101",
              metadata: {
                tool_process_summary: {
                  source: "runtime_facts",
                  failed: {
                    key: "toolCall.processSummary.error.failed",
                    values: { message: "exit code 101" },
                  },
                },
              },
            },
          },
        },
      },
    } as never);

    expect(payload).toMatchObject({
      type: "tool_end",
      tool_id: "tool-failed",
      result: {
        success: false,
        output: "test failed",
        error: "exit code 101",
        metadata: {
          tool_process_summary: {
            source: "runtime_facts",
          },
        },
      },
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

  it("workflow 审计事件应触发 read model refresh 且不进入普通 item timeline", () => {
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
      "workflow.run.canceled",
      "workflow.step.canceled",
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

      expect(payload).toMatchObject({
        type: "runtime_status",
        runtime_event_type: type,
        workflow_run_id: "turn-1:content_article_generate:workflow",
        step_id: "research",
        status: {
          phase: "routing",
          metadata: {
            source: "workflow_read_model_refresh",
            visibility: "diagnostics",
            persistence: "transient",
            agentui: {
              status_kind: "workflow_read_model_refresh",
              runtime_event_type: type,
            },
          },
        },
      });
      expect(payload).not.toHaveProperty("item");
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
