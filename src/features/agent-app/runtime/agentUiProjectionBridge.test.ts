import { describe, expect, it } from "vitest";

import { buildAgentAppAgentUiProjectionEvents } from "./agentUiProjectionBridge";

describe("buildAgentAppAgentUiProjectionEvents", () => {
  it("把 Agent App runtime projection payload 展开为有序 AgentUI text / tool events", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      threadId: "thread-1",
      runId: "agent_app_runtime:content-factory-app:task-1",
      startSequence: 7,
      events: [
        {
          eventType: "task:runtimeEvent",
          emittedAt: "2026-05-17T01:00:00.000Z",
          taskEvents: [
            {
              id: "runtime:text:1",
              eventType: "task:partialArtifact",
              status: "streaming",
              message: "第一段",
              payload: {
                streamKind: "assistant_text_delta",
                delta: "第一段",
              },
            },
            {
              id: "runtime:tool:1",
              eventType: "task:toolCall",
              status: "running",
              toolName: "Skill",
              payload: {
                streamKind: "tool_input_delta",
                delta: "{\"skill\":\"article-writer\"}",
                runtimeEvent: { tool_id: "tool-1", toolName: "Skill" },
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.sequence)).toEqual([7, 8]);
    expect(events[0]).toMatchObject({
      type: "text.delta",
      sourceType: "text_delta",
      owner: "model",
      scope: "part",
      surface: "conversation",
      sessionId: "session-1",
      threadId: "thread-1",
      taskId: "task-1",
      runtimeEntity: "agent_turn",
      runtimeStatus: "running",
      partId: "runtime:text:1",
      payload: {
        appId: "content-factory-app",
        preview: "第一段",
        streamKind: "assistant_text_delta",
      },
    });
    expect(events[1]).toMatchObject({
      type: "tool.args.delta",
      sourceType: "tool_input_delta",
      owner: "tool",
      scope: "tool_call",
      surface: "tool_ui",
      toolCallId: "tool-1",
      runtimeStatus: "running",
      payload: {
        toolName: "Skill",
        streamKind: "tool_input_delta",
      },
    });
  });

  it("把 HITL request 和 resolved 事件映射为 action.required / action.resolved", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-approval",
      events: [
        {
          id: "task:reviewRequested:approval-1",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-1",
          message: "需要确认发布范围",
        },
        {
          id: "task:reviewResolved:approval-1",
          eventType: "task:reviewResolved",
          status: "resolved",
          requestId: "approval-1",
          message: "已确认",
        },
      ],
    });

    expect(events.map((event) => event.type)).toEqual([
      "action.required",
      "action.resolved",
    ]);
    expect(events[0]).toMatchObject({
      actionId: "approval-1",
      surface: "hitl",
      runtimeStatus: "needs_input",
      control: "approve",
      payload: expect.objectContaining({
        actionType: "ask_user",
        controls: ["approve", "reject"],
      }),
    });
    expect(events[1]).toMatchObject({
      actionId: "approval-1",
      surface: "hitl",
      runtimeStatus: "completed",
      control: "none",
    });
  });

  it("把 artifact 和 evidence 事件投影到独立 surface，不混入最终文本", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-artifact",
      events: [
        {
          id: "artifact:created:artifact-1",
          eventType: "artifact:created",
          status: "ready",
          artifactRef: ".lime/artifacts/content-batch.json",
          message: "内容批次已创建",
          payload: {
            artifact: {
              artifact_id: "artifact-1",
              file_path: ".lime/artifacts/content-batch.json",
            },
            contentFactoryWorkspacePatch: { contentBatch: { count: 20 } },
          },
        },
        {
          id: "evidence:recorded:evidence-1",
          eventType: "evidence:recorded",
          status: "recorded",
          evidenceRef: "evidence://task-artifact/runtime",
          message: "运行证据已记录",
        },
      ],
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "artifact.created",
        sourceType: "artifact_snapshot",
        owner: "artifact",
        scope: "artifact",
        surface: "artifact_workspace",
        artifactId: "artifact-1",
        refs: { artifactPaths: [".lime/artifacts/content-batch.json"] },
      }),
      expect.objectContaining({
        type: "evidence.changed",
        sourceType: "evidence_projection",
        owner: "evidence",
        scope: "evidence",
        surface: "timeline_evidence",
        evidenceId: "evidence://task-artifact/runtime",
      }),
    ]);
  });

  it("artifact 事件缺少 message 时使用 artifact title 作为 projection preview", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-artifact-title",
      events: [
        {
          id: "artifact:created:artifact-title",
          eventType: "artifact:created",
          status: "ready",
          artifactRef: ".lime/artifacts/content-batch.json",
          payload: {
            artifact: {
              artifact_id: "artifact-title",
              title: "内容批次 JSON",
            },
          },
        },
      ],
    });

    expect(events[0]).toMatchObject({
      type: "artifact.created",
      artifactId: "artifact-title",
      payload: expect.objectContaining({
        preview: "内容批次 JSON",
      }),
    });
  });

  it("把 queued / completed / failed task 状态映射为 queue 和 runtime status", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-status",
      events: [
        {
          id: "task:queued:1",
          eventType: "task:queued",
          status: "queued",
          message: "等待执行",
        },
        {
          id: "task:completed:1",
          eventType: "task:completed",
          status: "completed",
          message: "完成",
        },
        {
          id: "task:error:1",
          eventType: "task:error",
          status: "failed",
          message: "失败",
        },
      ],
    });

    expect(events.map((event) => [event.type, event.runtimeStatus])).toEqual([
      ["queue.changed", "queued"],
      ["run.finished", "completed"],
      ["run.failed", "failed"],
    ]);
    expect(events[0]).toMatchObject({
      surface: "task_capsule",
      control: "queue",
    });
  });

  it("把模型、Token 和费用类事件映射为 metric.changed diagnostics", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-metric",
      events: [
        {
          id: "metric-1",
          eventType: "task:metricChanged",
          status: "recorded",
          message: "deepseek-v4-flash · 120 tokens",
          payload: {
            metricName: "usage",
            providerName: "deepseek",
            modelName: "deepseek-v4-flash",
            usage: { inputTokens: 50, outputTokens: 70, totalTokens: 120 },
            cost: { estimatedTotalCost: 0.02, currency: "USD" },
          },
        },
      ],
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "metric.changed",
        sourceType: "performance_metric",
        owner: "diagnostics",
        scope: "run",
        surface: "diagnostics",
        runtimeStatus: "completed",
        payload: expect.objectContaining({
          metricName: "usage",
          providerName: "deepseek",
          modelName: "deepseek-v4-flash",
          preview: "deepseek-v4-flash · 120 tokens",
        }),
      }),
    ]);
  });

  it("保留已经标准化的 AgentUI action / tool / metric events", () => {
    const events = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-direct",
      sessionId: "session-direct",
      events: [
        {
          id: "direct-action",
          type: "action.required",
          actionId: "approval-1",
          control: "approve",
          payload: {
            controls: ["approve", "reject"],
            preview: "确认执行计划",
          },
        },
        {
          id: "direct-tool",
          type: "tool.result",
          toolCallId: "tool-1",
          payload: {
            toolName: "Skill(article-writer)",
            preview: "已生成文案",
          },
        },
        {
          id: "direct-metric",
          type: "metric.changed",
          payload: {
            metricName: "usage",
            preview: "120 tokens",
          },
        },
      ],
    });

    expect(events.map((event) => event.type)).toEqual([
      "action.required",
      "tool.result",
      "metric.changed",
    ]);
    expect(events[0]).toMatchObject({
      sourceType: "action_required",
      sessionId: "session-direct",
      taskId: "task-direct",
      actionId: "approval-1",
      control: "approve",
      runtimeStatus: "needs_input",
      payload: expect.objectContaining({
        controls: ["approve", "reject"],
        preview: "确认执行计划",
      }),
    });
    expect(events[1]).toMatchObject({
      sourceType: "tool_end",
      toolCallId: "tool-1",
      runtimeStatus: "completed",
    });
    expect(events[2]).toMatchObject({
      sourceType: "performance_metric",
      surface: "diagnostics",
      payload: expect.objectContaining({
        metricName: "usage",
        preview: "120 tokens",
      }),
    });
  });
});
