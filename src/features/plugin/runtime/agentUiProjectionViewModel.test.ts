import { describe, expect, it } from "vitest";

import { buildPluginAgentUiProjectionEvents } from "./agentUiProjectionBridge";
import { buildAgentRunStandardProjectionStateFromState } from "./agentRunProjectionState";
import {
  buildPluginRunProjectionViewModel,
  buildPluginRunProjectionViewModelFromStandardState,
} from "./agentUiProjectionViewModel";
import { buildSharedProjectionInput } from "../ui/AgentRunHostDrawerProjectionInput";

describe("buildPluginRunProjectionViewModel", () => {
  it("按 AgentUI sequence 保留 reasoning / tool / text 的穿插顺序", () => {
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

    expect(view.orderedParts).toEqual([
      expect.objectContaining({
        kind: "reasoning",
        preview: "Call the `article-writer` skill.",
      }),
    ]);
    expect(view.reasoningText).toBe("Call the `article-writer` skill.");
  });

  it("完成后折叠过程 part，但保持最终成稿可见", () => {
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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
    const projectionEvents = buildPluginAgentUiProjectionEvents({
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

    const view = buildPluginRunProjectionViewModel(projectionEvents);

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

  it("可以从标准 AgentUiProjectionState 派生宿主 view model", () => {
    const standardState = buildAgentRunStandardProjectionStateFromState({
      taskId: "task-standard-view",
      sessionId: "session-standard-view",
      threadId: "thread-standard-view",
      runId: "run-standard-view",
      taskEvents: [
        {
          id: "text-1",
          eventType: "task:partialArtifact",
          status: "streaming",
          payload: { streamKind: "assistant_text_delta", delta: "标准正文。" },
        },
        {
          id: "thinking-1",
          eventType: "task:progress",
          status: "thinking",
          payload: { streamKind: "thinking_delta", delta: "标准思考。" },
        },
        {
          id: "approval-1",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-1",
          message: "需要确认",
        },
        {
          id: "artifact-1",
          eventType: "artifact:created",
          status: "ready",
          artifactRef: ".lime/artifacts/content.json",
          message: "内容产物",
          payload: {
            artifact: {
              artifact_id: "content-artifact",
            },
          },
        },
        {
          id: "metric-1",
          eventType: "task:metricChanged",
          status: "recorded",
          payload: {
            metricName: "usage",
            providerName: "deepseek",
            modelName: "deepseek-v4-flash",
            usage: { totalTokens: 120 },
          },
        },
      ],
    });

    const view = buildPluginRunProjectionViewModelFromStandardState(standardState);

    expect(view.answerText).toBe("标准正文。");
    expect(view.reasoningText).toBe("标准思考。");
    expect(view.actions).toEqual([
      expect.objectContaining({
        actionId: "approval-1",
        sessionId: "session-standard-view",
        threadId: "thread-standard-view",
        runId: "run-standard-view",
        taskId: "task-standard-view",
        status: "pending",
        controls: ["approve", "reject"],
      }),
    ]);
    expect(view.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "content-artifact",
        ref: ".lime/artifacts/content.json",
      }),
    ]);
    expect(view.metrics).toMatchObject({
      providerName: "deepseek",
      modelName: "deepseek-v4-flash",
      tokenText: "120 tokens",
    });
  });

  it("保留 host-managed generation 的翻译后过程说明和 Soul metadata", () => {
    const sharedInput = buildSharedProjectionInput(
      {
        mode: "drawer",
        openedAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:01.000Z",
        appId: "content-factory-app",
        taskId: "task-host-generation",
        bridgeAction: "contentFactoryProduction",
        runtimeProcess: {
          terminal: true,
          timeline: [
            {
              kind: "artifact",
              title: "Host-managed generation",
              statusText: "completed",
              message: "Host-managed generation status updated.",
              displayTitleKey:
                "plugin.apps.runtime.agentRun.hostManagedGeneration.completed.title",
              displayMessageKey:
                "plugin.apps.runtime.agentRun.hostManagedGeneration.completed.message",
              displayValues: {
                provider: "fixture-openai",
                model: "lime-fixture-chat",
                outputCount: 1,
              },
              collapseKey: "plugin:host-managed-generation",
              soulLifecycle: {
                surface: "plugin_host_managed_generation",
                phase: "after_artifact",
                styleLevel: "L2",
                riskLevel: "normal",
                toneVariant: "cheeky_sassy",
                profileId: "cheeky_sassy_executor",
                packId: "com.lime.soul.cheeky-sassy-executor",
              },
              soulSurface: "plugin_host_managed_generation",
              soulPhase: "after_artifact",
              styleLevel: "L2",
              riskLevel: "normal",
              toneVariant: "cheeky_sassy",
              profileId: "cheeky_sassy_executor",
              packId: "com.lime.soul.cheeky-sassy-executor",
              generationBriefBoundary: {
                artifactBodyStyleLevel: "L3",
                formalArtifactVoiceSource: "generation_brief_only",
                productSoulDefault: "interaction_only",
              },
            },
          ],
        },
      },
      (key, params) => {
        if (
          key ===
          "plugin.apps.runtime.agentRun.hostManagedGeneration.completed.title"
        ) {
          return "宿主托管生成已完成";
        }
        if (
          key ===
          "plugin.apps.runtime.agentRun.hostManagedGeneration.completed.message"
        ) {
          return `宿主已用 ${String(params?.provider)} / ${String(params?.model)} 生成 ${String(params?.outputCount)} 个受控产物；正文保持 Generation Brief 边界。`;
        }
        if (key === "plugin.apps.runtime.agentRun.timeline.event") {
          return "运行事件";
        }
        return key;
      },
    );

    const standardState = buildAgentRunStandardProjectionStateFromState(sharedInput);
    const view = buildPluginRunProjectionViewModelFromStandardState(standardState);

    expect(view.orderedParts[0]).toMatchObject({
      kind: "status",
      preview:
        "宿主已用 fixture-openai / lime-fixture-chat 生成 1 个受控产物；正文保持 Generation Brief 边界。",
    });
    expect(standardState.readModel.events[0]?.source.payload).toMatchObject({
      soulLifecycle: {
        surface: "plugin_host_managed_generation",
        phase: "after_artifact",
        styleLevel: "L2",
      },
      generationBriefBoundary: {
        artifactBodyStyleLevel: "L3",
        formalArtifactVoiceSource: "generation_brief_only",
        productSoulDefault: "interaction_only",
      },
    });
  });
});
