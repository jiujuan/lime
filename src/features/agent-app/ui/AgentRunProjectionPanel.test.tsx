import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { buildAgentAppAgentUiProjectionEvents } from "../runtime/agentUiProjectionBridge";
import {
  buildAgentRunStandardProjectionStateFromState,
} from "../runtime/agentRunProjectionState";
import { buildAgentAppRunProjectionViewModel } from "../runtime/agentUiProjectionViewModel";
import {
  AgentRunProjectionPanel,
  type AgentRunProjectionPanelLabels,
  type AgentRunProjectionPanelProps,
} from "./AgentRunProjectionPanel";

const labels: AgentRunProjectionPanelLabels = {
  parts: {
    status: "运行状态",
    queue: "排队任务",
    answer: "成稿输出",
    reasoning: "思考过程",
    tool: "工具调用",
    actionRequired: "等待确认",
    actionResolved: "确认已处理",
    artifact: "交付物",
    evidence: "运行证据",
    diagnostic: "诊断",
  },
  actionControls: {
    approve: "确认",
    reject: "拒绝",
    answer: "回答",
  },
  summary: {
    status: "状态",
    pendingActions: "待确认",
    tools: "工具",
    artifacts: "交付物",
    evidence: "证据",
    queue: "队列",
  },
  empty: "暂无运行过程",
};

const mountedRoots: Root[] = [];

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
});

function renderPanel(
  events: unknown[],
  props: Partial<Pick<AgentRunProjectionPanelProps, "onAction">> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const projectionEvents = buildAgentAppAgentUiProjectionEvents({
    taskId: "task-panel",
    events,
  });
  const view = buildAgentAppRunProjectionViewModel(projectionEvents);
  const standardState = buildAgentRunStandardProjectionStateFromState({
    taskId: "task-panel",
    taskEvents: events,
  });

  act(() => {
    root.render(
      <AgentRunProjectionPanel
        view={view}
        standardState={standardState}
        labels={labels}
        {...props}
      />,
    );
  });

  return container;
}

describe("AgentRunProjectionPanel", () => {
  it("按 ordered parts 渲染 reasoning / tool / answer，并展示摘要", () => {
    const container = renderPanel([
      {
        id: "thinking",
        eventType: "task:progress",
        status: "thinking",
        payload: { streamKind: "thinking_delta", delta: "先分析。" },
      },
      {
        id: "tool",
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
        id: "text",
        eventType: "task:partialArtifact",
        status: "streaming",
        payload: { streamKind: "assistant_text_delta", delta: "第一段。" },
      },
    ]);

    const kinds = Array.from(
      container.querySelectorAll("[data-agent-run-projection-part-kind]"),
    ).map((node) =>
      node.getAttribute("data-agent-run-projection-part-kind"),
    );

    expect(kinds).toEqual(["reasoning", "tool", "text"]);
    expect(container.textContent).toContain("思考过程");
    expect(container.textContent).toContain("Skill");
    expect(container.textContent).toContain("成稿输出");
    expect(container.textContent).toContain("工具");
    expect(
      container.querySelector("[data-testid='agent-run-standard-projection']"),
    ).not.toBeNull();
    expect(container.querySelector(".agent-ui-projection")).not.toBeNull();
    expect(container.querySelector(".agent-ui-main")).not.toBeNull();
    expect(container.querySelector(".agent-ui-sidecar")).not.toBeNull();
    expect(container.querySelector(".agent-message-parts")).not.toBeNull();
    expect(container.querySelector(".agent-process-timeline")).not.toBeNull();
    expect(container.querySelector(".agent-execution-graph")).not.toBeNull();
    const details = Array.from(container.querySelectorAll("details"));
    expect(details.map((detail) => detail.open)).toEqual([true, true, true]);
  });

  it("同一 reasoning 流只渲染一个思考过程卡片", () => {
    const container = renderPanel([
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
    ]);

    const reasoningParts = container.querySelectorAll(
      "[data-agent-run-projection-part-kind='reasoning']",
    );

    expect(reasoningParts).toHaveLength(1);
    expect(container.textContent).toContain("Call the `article-writer` skill.");
  });

  it("终态折叠工具过程，但保留成稿默认展开", () => {
    const container = renderPanel([
      {
        id: "text",
        eventType: "task:partialArtifact",
        status: "streaming",
        payload: { streamKind: "assistant_text_delta", delta: "最终成稿。" },
      },
      {
        id: "tool",
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
    ]);

    const details = Array.from(container.querySelectorAll("details"));

    expect(
      details.map((detail) =>
        detail.getAttribute("data-agent-run-projection-part-kind"),
      ),
    ).toEqual(["text", "tool", "status"]);
    expect(details.map((detail) => detail.open)).toEqual([true, false, false]);
    expect(container.textContent).toContain("最终成稿。");
    expect(container.textContent).toContain("Skill 已完成");
  });

  it("把 Artifact 和 Evidence refs 渲染为独立卡片", () => {
    const container = renderPanel([
      {
        id: "artifact",
        eventType: "artifact:created",
        status: "ready",
        artifactRef: ".lime/artifacts/content-batch.json",
        message: "内容批次",
        payload: {
          artifact: {
            artifact_id: "artifact-1",
            file_path: ".lime/artifacts/content-batch.json",
          },
        },
      },
      {
        id: "evidence",
        eventType: "evidence:recorded",
        status: "recorded",
        evidenceRef: "evidence://task-panel/runtime",
        message: "运行证据",
      },
    ]);

    expect(
      container.querySelector(
        "[data-agent-run-projection-artifact-id='artifact-1']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-agent-run-projection-evidence-id='evidence://task-panel/runtime']",
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("内容批次");
    expect(container.textContent).toContain(".lime/artifacts/content-batch.json");
    expect(container.textContent).toContain("运行证据");
  });

  it("把模型、Token、费用指标渲染为 diagnostics 卡片", () => {
    const container = renderPanel([
      {
        id: "metric",
        eventType: "task:metricChanged",
        status: "recorded",
        message: "deepseek-v4-flash · 120 tokens",
        payload: {
          metricName: "usage",
          modelName: "deepseek-v4-flash",
          usage: { totalTokens: 120 },
          cost: { estimatedTotalCost: 0.02, currency: "USD" },
        },
      },
    ]);

    expect(
      container.querySelector(
        "[data-agent-run-projection-diagnostic-id='metric:metric.changed:1']",
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("诊断");
    expect(container.textContent).toContain("deepseek-v4-flash · 120 tokens");
  });

  it("渲染 HITL 最新状态和 terminal summary", () => {
    const container = renderPanel([
      {
        id: "approval-required",
        eventType: "task:reviewRequested",
        status: "pending",
        requestId: "approval-1",
        message: "需要确认发布范围",
      },
      {
        id: "completed",
        eventType: "task:completed",
        status: "completed",
        message: "完成",
      },
    ]);

    expect(
      container
        .querySelector("[data-testid='agent-run-projection-panel']")
        ?.getAttribute("data-agent-run-projection-terminal"),
    ).toBe("true");
    expect(container.textContent).toContain("等待确认");
    expect(container.textContent).toContain("需要确认发布范围");
    expect(container.textContent).toContain("completed");
    expect(
      container
        .querySelector("[data-agent-run-projection-action-status='pending']")
        ?.getAttribute("data-agent-run-projection-action-control"),
    ).toBe("approve");
    expect(
      container
        .querySelector("[data-agent-run-projection-action-status='pending']")
        ?.getAttribute("data-agent-run-projection-action-id"),
    ).toBe("approval-1");
    expect(
      container
        .querySelector("[data-agent-run-projection-action-status='pending']")
        ?.getAttribute("data-agent-run-projection-action-task-id"),
    ).toBe("task-panel");
  });

  it("通过外部回调提交受控 HITL action", () => {
    let submitted:
      | { actionId: string; taskId?: string; control: string }
      | null = null;
    const container = renderPanel(
      [
        {
          id: "approval-required",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-1",
          message: "需要确认发布范围",
        },
      ],
      {
        onAction: (action, control) => {
          submitted = {
            actionId: action.actionId,
            taskId: action.taskId,
            control,
          };
        },
      },
    );

    const approveButton = container.querySelector(
      "[data-agent-run-projection-action-control-button='approve']",
    );
    const rejectButton = container.querySelector(
      "[data-agent-run-projection-action-control-button='reject']",
    );

    expect(approveButton?.textContent).toBe("确认");
    expect(rejectButton?.textContent).toBe("拒绝");
    act(() => {
      rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(submitted).toEqual({
      actionId: "approval-1",
      taskId: "task-panel",
      control: "reject",
    });
  });

  it("标准 AgentUiProjectionView action 也回到宿主 action callback", () => {
    let submitted:
      | { actionId: string; taskId?: string; control: string }
      | null = null;
    const container = renderPanel(
      [
        {
          id: "approval-required",
          eventType: "task:reviewRequested",
          status: "pending",
          requestId: "approval-1",
          message: "需要确认发布范围",
        },
      ],
      {
        onAction: (action, control) => {
          submitted = {
            actionId: action.actionId,
            taskId: action.taskId,
            control,
          };
        },
      },
    );

    const standardActionButton = container.querySelector(".agent-event-action");

    expect(standardActionButton?.textContent).toBe("处理");
    act(() => {
      standardActionButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(submitted).toEqual({
      actionId: "approval-1",
      taskId: "task-panel",
      control: "approve",
    });
  });

  it("无过程时使用外部注入的空态文案", () => {
    const container = renderPanel([]);

    expect(container.textContent).toContain("暂无运行过程");
  });
});
