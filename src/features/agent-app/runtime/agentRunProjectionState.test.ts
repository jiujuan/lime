import { describe, expect, it } from "vitest";

import {
  buildAgentRunStandardProjectionStateFromState,
  buildAgentRunProjectionViewModelFromState,
  collectAgentRunProjectionSourceEvents,
} from "./agentRunProjectionState";

describe("agentRunProjectionState", () => {
  it("聚合 root / task / snapshot / runtimeFacts 的 events 与 taskEvents", () => {
    const state = {
      events: [{ id: "root-event", eventType: "task:progress" }],
      taskEvents: [{ id: "root-task-event", eventType: "task:queued" }],
      agentUiEvents: [{ id: "root-agent-ui-event", type: "action.required" }],
      projectionEvents: [{ id: "root-projection-event", type: "metric.changed" }],
      runtimeFacts: {
        taskEvents: [{ id: "runtime-fact-event", eventType: "evidence:recorded" }],
        agentUiEvents: [{ id: "runtime-agent-ui-event", type: "tool.result" }],
      },
      task: {
        events: [{ id: "task-event", eventType: "task:toolCall" }],
      },
      snapshot: {
        taskEvents: [{ id: "snapshot-event", eventType: "artifact:created" }],
      },
    };

    expect(
      collectAgentRunProjectionSourceEvents(state).map((event) =>
        (event as { id: string }).id,
      ),
    ).toEqual([
      "root-event",
      "root-task-event",
      "root-agent-ui-event",
      "root-projection-event",
      "runtime-fact-event",
      "runtime-agent-ui-event",
      "task-event",
      "snapshot-event",
    ]);
  });

  it("从现有 Host Run state 生成 projection view model，并补齐 top-level taskEvents", () => {
    const view = buildAgentRunProjectionViewModelFromState(
      {
        appId: "content-factory-app",
        taskId: "task-1",
        sessionId: "session-1",
        threadId: "thread-1",
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
            id: "runtime:approval:1",
            eventType: "task:reviewRequested",
            status: "pending",
            requestId: "approval-1",
            message: "需要确认",
          },
        ],
        snapshot: {
          taskEvents: [
            {
              id: "runtime:artifact:1",
              eventType: "artifact:created",
              status: "ready",
              artifactRef: ".lime/artifacts/content.json",
              payload: { artifact: { artifact_id: "artifact-1" } },
            },
          ],
        },
      },
      { startSequence: 10 },
    );

    expect(view.orderedParts.map((part) => [part.sequence, part.kind])).toEqual([
      [10, "text"],
      [11, "action"],
      [12, "artifact"],
    ]);
    expect(view.answerText).toBe("第一段");
    expect(view.task.pendingActionCount).toBe(1);
    expect(view.task.artifactCount).toBe(1);
    expect(view.artifacts[0]).toMatchObject({
      artifactId: "artifact-1",
      ref: ".lime/artifacts/content.json",
    });
  });

  it("从 Host Run state 生成标准 AgentUiProjectionState", () => {
    const state = buildAgentRunStandardProjectionStateFromState({
      taskId: "task-standard",
      sessionId: "session-standard",
      threadId: "thread-standard",
      taskEvents: [
        {
          id: "runtime:text:standard",
          eventType: "task:partialArtifact",
          status: "streaming",
          message: "第一段",
          payload: {
            streamKind: "assistant_text_delta",
            delta: "第一段",
          },
        },
        {
          id: "runtime:approval:standard",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-standard",
          message: "需要确认",
        },
      ],
    });

    expect(state.runtime.status).toBe("waiting");
    expect(state.messages[0]).toMatchObject({
      type: "text",
      text: "第一段",
      sourceEventId: "runtime:text:standard",
    });
    expect(state.actions[0]).toMatchObject({
      actionId: "approval-standard",
      displayStatusKey: "agent.status.actionRequired",
    });
    expect(state.timeline.map((entry) => entry.sourceEventId)).toEqual([
      "runtime:text:standard",
      "runtime:approval:standard",
    ]);
  });

  it("Lime Agent App state 通过共享 projection 消费 state.delta", () => {
    const state = buildAgentRunStandardProjectionStateFromState(
      {
        taskId: "task-delta",
        sessionId: "session-delta",
        agentUiEvents: [
          {
            id: "direct-artifact",
            type: "artifact.created",
            artifactId: "artifact-delta",
            payload: {
              preview: "旧预览",
            },
          },
          {
            id: "direct-delta",
            type: "state.delta",
            payload: {
              target: "projection.artifacts",
              patch: [
                {
                  op: "replace",
                  path: "/0/preview",
                  value: "修复后的预览",
                },
              ],
            },
          },
        ],
      },
      { startSequence: 30 },
    );

    expect(state.artifacts[0]).toMatchObject({
      id: "artifact-delta",
      preview: "修复后的预览",
    });
    expect(state.hydration.status).toBe("live");
  });

  it("展开 task:runtimeEvent.taskEvents 并继承 wrapper 上的 session/thread/task 上下文", () => {
    const view = buildAgentRunProjectionViewModelFromState({
      taskId: "task-wrapper",
      sessionId: "session-wrapper",
      threadId: "thread-wrapper",
      events: [
        {
          eventType: "task:runtimeEvent",
          taskEvents: [
            {
              id: "runtime:tool:1",
              eventType: "task:toolCall",
              status: "running",
              toolName: "Skill",
              payload: {
                streamKind: "tool_input_delta",
                delta: "{\"skill\":\"content-reviewer\"}",
                runtimeEvent: { tool_id: "tool-1", toolName: "Skill" },
              },
            },
          ],
        },
      ],
    });

    expect(view.orderedParts).toEqual([
      expect.objectContaining({
        kind: "tool",
        toolCallId: "tool-1",
        runtimeStatus: "running",
      }),
    ]);
    expect(view.task.toolCallCount).toBe(1);
  });

  it("把 Host Run runtimeProcess.timeline 投影成 AgentUI 过程事件", () => {
    const view = buildAgentRunProjectionViewModelFromState({
      taskId: "task-timeline",
      sessionId: "session-timeline",
      runtimeProcess: {
        timeline: [
          {
            kind: "skill",
            title: "Skill · article-writer",
            message: "正在执行写作 Skill。",
            statusText: "running",
          },
          {
            kind: "tool",
            title: "Tool · browser_snapshot",
            message: "已读取页面上下文。",
            statusText: "completed",
          },
          {
            kind: "output",
            title: "成稿流式输出",
            message: "第一段文案。",
            statusText: "streaming",
          },
          {
            kind: "thinking",
            title: "思考中",
            message: "先确认项目资料。",
          },
        ],
      },
    });

    expect(view.orderedParts.map((part) => part.kind)).toEqual([
      "tool",
      "tool",
      "text",
      "reasoning",
    ]);
    expect(view.orderedParts[0]).toMatchObject({
      displayName: "Skill(article-writer)",
      toolCallId: "root:timeline:0",
    });
    expect(view.orderedParts[1]).toMatchObject({
      displayName: "browser_snapshot",
      toolCallId: "root:timeline:1",
    });
    expect(view.answerText).toBe("第一段文案。");
    expect(view.reasoningText).toBe("先确认项目资料。");
    expect(view.task.toolCallCount).toBe(2);
  });

  it("legacy final_done 不应作为 Agent App runtime 完成终态", () => {
    const view = buildAgentRunProjectionViewModelFromState({
      taskId: "task-legacy-final-done",
      sessionId: "session-legacy-final-done",
      events: [
        {
          id: "legacy-final-done",
          eventType: "final_done",
          message: "legacy final_done",
        },
      ],
    });

    expect(view.task.terminal).not.toBe(true);
    expect(view.orderedParts).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          runtimeStatus: "completed",
        }),
      ]),
    );
  });

  it("从 runtimeFacts / runtimeProcess 补齐模型、Token 和费用摘要", () => {
    const view = buildAgentRunProjectionViewModelFromState({
      runtimeFacts: {
        modelRouting: {
          routes: [
            {
              model: {
                provider: "deepseek",
                model: "deepseek-v4-flash",
              },
            },
          ],
        },
        tokenUsage: {
          totals: {
            inputTokens: 80,
            outputTokens: 40,
            totalTokens: 120,
          },
        },
        costSummary: {
          cost: {
            currency: "USD",
            estimatedTotalCost: 0.0042,
          },
        },
      },
      runtimeProcess: {
        timeline: [{ kind: "thinking", message: "读取资料" }],
      },
    });

    expect(view.metrics).toMatchObject({
      providerName: "deepseek",
      modelName: "deepseek-v4-flash",
      modelLabel: "deepseek / deepseek-v4-flash",
      tokenCount: 120,
      tokenText: "120 tokens",
      costText: "USD 0.0042",
    });
    expect(view.diagnostics).toEqual([
      expect.objectContaining({
        preview: "deepseek-v4-flash · 120 tokens · 0.0042",
      }),
    ]);
  });

  it("从 agentUiEvents / projectionEvents 直接生成 projection view model", () => {
    const view = buildAgentRunProjectionViewModelFromState(
      {
        taskId: "task-direct",
        sessionId: "session-direct",
        agentUiEvents: [
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
        ],
        projectionEvents: [
          {
            id: "direct-metric",
            type: "metric.changed",
            payload: {
              metricName: "usage",
              preview: "120 tokens",
            },
          },
        ],
      },
      { startSequence: 20 },
    );

    expect(view.orderedParts.map((part) => [part.sequence, part.kind])).toEqual([
      [20, "action"],
      [21, "diagnostic"],
    ]);
    expect(view.actions).toEqual([
      expect.objectContaining({
        actionId: "approval-1",
        sessionId: "session-direct",
        taskId: "task-direct",
        controls: ["approve", "reject"],
      }),
    ]);
    expect(view.diagnostics).toEqual([
      expect.objectContaining({
        preview: "120 tokens",
      }),
    ]);
    expect(view.metrics.tokenText).toBeUndefined();
  });
});
