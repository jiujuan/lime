import { describe, expect, it } from "vitest";

import { buildAgentAppAgentUiProjectionEvents } from "./agentUiProjectionBridge";
import { buildAgentAppRunProjectionViewModel } from "./agentUiProjectionViewModel";

describe("buildAgentAppRunProjectionViewModel", () => {
  it("按 AgentUI sequence 保留 reasoning / tool / text 的穿插顺序", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-ordered",
      events: [
        {
          id: "thinking-1",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "先分析素材。" },
        },
        {
          id: "tool-1",
          eventType: "task:toolCall",
          status: "running",
          toolName: "Skill",
          payload: {
            streamKind: "tool_input_delta",
            delta: "{\"skill\":\"article-writer\"}",
            runtimeEvent: { tool_id: "tool-1", toolName: "Skill" },
          },
        },
        {
          id: "text-1",
          eventType: "task:partialArtifact",
          status: "streaming",
          payload: { streamKind: "assistant_text_delta", delta: "第一段成稿。" },
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts.map((part) => part.kind)).toEqual([
      "reasoning",
      "tool",
      "text",
    ]);
    expect(view.reasoningText).toBe("先分析素材。");
    expect(view.answerText).toBe("第一段成稿。");
    expect(view.orderedParts[0]).toMatchObject({
      collapsedByDefault: false,
      label: "reasoning",
    });
    expect(view.orderedParts[1]).toMatchObject({
      collapsedByDefault: false,
      label: "tool",
    });
    expect(view.orderedParts[2]).toMatchObject({
      collapsedByDefault: false,
      label: "answer",
    });
  });

  it("把同一轮 reasoning 流合并到一个思考过程 part", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-reasoning-stream",
      runId: "run-reasoning-stream",
      events: [
        {
          id: "thinking-1",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "Call" },
        },
        {
          id: "thinking-2",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "the" },
        },
        {
          id: "thinking-3",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "`article-writer`" },
        },
        {
          id: "thinking-4",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "skill." },
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts).toEqual([
      expect.objectContaining({
        kind: "reasoning",
        label: "reasoning",
        preview: "Call the `article-writer` skill.",
        collapsedByDefault: false,
      }),
    ]);
    expect(view.reasoningText).toBe("Call the `article-writer` skill.");
  });

  it("兼容累计式 reasoning preview，不重复拼接历史内容", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-reasoning-accumulated",
      runId: "run-reasoning-accumulated",
      events: [
        {
          id: "thinking-1",
          type: "reasoning.delta",
          payload: { preview: "Call" },
        },
        {
          id: "thinking-2",
          type: "reasoning.delta",
          payload: { preview: "Call the" },
        },
        {
          id: "thinking-3",
          type: "reasoning.delta",
          payload: { preview: "Call the `article-writer` skill." },
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts).toEqual([
      expect.objectContaining({
        kind: "reasoning",
        preview: "Call the `article-writer` skill.",
      }),
    ]);
    expect(view.reasoningText).toBe("Call the `article-writer` skill.");
  });

  it("完成后折叠过程 part，但保持最终成稿可见", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-collapse",
      events: [
        {
          id: "text-1",
          eventType: "task:partialArtifact",
          status: "streaming",
          payload: { streamKind: "assistant_text_delta", delta: "最终成稿。" },
        },
        {
          id: "tool-1",
          eventType: "task:toolCall",
          status: "completed",
          toolName: "Skill",
          message: "Skill 已完成",
          payload: {
            runtimeEvent: { tool_id: "tool-1", toolName: "Skill" },
          },
        },
        {
          id: "completed",
          eventType: "task:completed",
          status: "completed",
          message: "完成",
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts.map((part) => part.kind)).toEqual([
      "text",
      "tool",
      "status",
    ]);
    expect(view.orderedParts[0]).toMatchObject({
      label: "answer",
      collapsedByDefault: false,
    });
    expect(view.orderedParts[1]).toMatchObject({
      label: "tool",
      collapsedByDefault: true,
    });
    expect(view.orderedParts[2]).toMatchObject({
      label: "status",
      collapsedByDefault: true,
    });
  });

  it("把 action.required/action.resolved 汇总为最新 HITL 状态", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-hitl",
      events: [
        {
          id: "approval-required",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-1",
          message: "确认发布范围",
        },
        {
          id: "approval-resolved",
          eventType: "task:reviewResolved",
          status: "resolved",
          requestId: "approval-1",
          message: "已确认",
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.actions).toEqual([
      expect.objectContaining({
        actionId: "approval-1",
        status: "resolved",
        label: "actionResolved",
        controls: [],
        preview: "已确认",
      }),
    ]);
    expect(view.task.pendingActionCount).toBe(0);
  });

  it("保留 action.required 的受控响应 control", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-hitl-answer",
      sessionId: "session-hitl",
      threadId: "thread-hitl",
      runId: "run-hitl",
      events: [
        {
          id: "missing-context",
          eventType: "task:missingContextRequested",
          status: "pending",
          requestId: "context-1",
          message: "需要补充品牌资料",
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.actions).toEqual([
      expect.objectContaining({
        actionId: "context-1",
        sessionId: "session-hitl",
        threadId: "thread-hitl",
        runId: "run-hitl",
        taskId: "task-hitl-answer",
        actionType: "ask_user",
        status: "pending",
        control: "answer",
        controls: ["answer"],
      }),
    ]);
  });

  it("建立 artifact / evidence 索引并生成 task summary", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-artifact",
      events: [
        {
          id: "artifact-1",
          eventType: "artifact:created",
          status: "ready",
          artifactRef: ".lime/artifacts/content-batch.json",
          message: "内容批次",
          payload: {
            artifact: {
              artifact_id: "content-batch-artifact",
              file_path: ".lime/artifacts/content-batch.json",
            },
          },
        },
        {
          id: "evidence-1",
          eventType: "evidence:recorded",
          status: "recorded",
          evidenceRef: "evidence://task-artifact/runtime",
          message: "运行证据",
        },
        {
          id: "completed",
          eventType: "task:completed",
          status: "completed",
          message: "完成",
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "content-batch-artifact",
        label: "artifact",
        preview: "内容批次",
        ref: ".lime/artifacts/content-batch.json",
      }),
    ]);
    expect(view.evidence).toEqual([
      expect.objectContaining({
        evidenceId: "evidence://task-artifact/runtime",
        label: "evidence",
        preview: "运行证据",
      }),
    ]);
    expect(view.task).toMatchObject({
      latestRuntimeStatus: "completed",
      terminal: true,
      collapsedByDefault: true,
      artifactCount: 1,
      evidenceCount: 1,
    });
  });

  it("把 queued / failed 状态保留为 task capsule 和终态摘要", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-failed",
      events: [
        {
          id: "queued",
          eventType: "task:queued",
          status: "queued",
          message: "等待执行",
        },
        {
          id: "failed",
          eventType: "task:error",
          status: "failed",
          message: "失败",
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts.map((part) => part.kind)).toEqual([
      "queue",
      "status",
    ]);
    expect(view.task).toMatchObject({
      latestRuntimeStatus: "failed",
      terminal: true,
      queueCount: 1,
    });
  });

  it("把 metric.changed 收集为 diagnostics 索引", () => {
    const projectionEvents = buildAgentAppAgentUiProjectionEvents({
      taskId: "task-metric",
      events: [
        {
          id: "metric-1",
          eventType: "task:metricChanged",
          status: "recorded",
          message: "deepseek-v4-flash · 120 tokens",
          payload: {
            metricName: "usage",
            modelName: "deepseek-v4-flash",
            usage: { totalTokens: 120 },
          },
        },
      ],
    });

    const view = buildAgentAppRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts).toEqual([
      expect.objectContaining({
        kind: "diagnostic",
        label: "diagnostic",
        preview: "deepseek-v4-flash · 120 tokens",
      }),
    ]);
    expect(view.diagnostics).toEqual([
      expect.objectContaining({
        label: "diagnostic",
        preview: "deepseek-v4-flash · 120 tokens",
        status: "completed",
      }),
    ]);
    expect(view.metrics).toMatchObject({
      modelName: "deepseek-v4-flash",
      tokenCount: 120,
      tokenText: "120 tokens",
    });
  });
});
