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

function standardPartTypes(container: Element): (string | null)[] {
  return Array.from(container.querySelectorAll(".agent-message-part")).map(
    (node) => node.getAttribute("data-part-type"),
  );
}

function standardActionButton(
  container: Element,
  decision: string,
): HTMLButtonElement | null {
  return container.querySelector(
    `.agent-event-action[data-action-decision="${decision}"]`,
  );
}

describe("AgentRunProjectionPanel", () => {
  it("通过标准 projection 渲染 reasoning / tool / answer，并展示摘要", () => {
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

    expect(standardPartTypes(container)).toEqual(["reasoning", "text"]);
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
    expect(
      container.querySelector('.agent-process-entry[data-entry-kind="tool"]'),
    ).not.toBeNull();
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
      '.agent-message-part[data-part-type="reasoning"]',
    );

    expect(reasoningParts).toHaveLength(1);
    expect(container.textContent).toContain("Call the `article-writer` skill.");
  });

  it("终态保留成稿和工具结果", () => {
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

    expect(standardPartTypes(container)).toContain("text");
    expect(standardPartTypes(container)).toContain("tool-preview");
    expect(
      container.querySelector(
        '.agent-process-entry[data-entry-kind="tool"][data-entry-status="completed"]',
      ),
    ).not.toBeNull();
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
      container.querySelector('.agent-message-part[data-part-type="artifact-card"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.agent-message-part[data-part-type="evidence-citation"]',
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
      container.querySelector('.agent-message-part[data-part-type="diagnostic-ref"]'),
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
    expect(
      container
        .querySelector(".agent-action-required-list")
        ?.getAttribute("aria-label"),
    ).toBe("等待确认");
    expect(container.textContent).toContain("需要确认发布范围");
    expect(container.textContent).toContain("completed");
    expect(
      container
        .querySelector('.agent-action-required-list [data-action-id="approval-1"]')
        ?.getAttribute("data-action-id"),
    ).toBe("approval-1");
    expect(container.querySelector(".agent-event-action")).toBeNull();
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

    const approveButton = standardActionButton(container, "approve");
    const rejectButton = standardActionButton(container, "reject");

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

    const approveButton = standardActionButton(container, "approve");

    expect(approveButton?.textContent).toBe("确认");
    act(() => {
      approveButton?.dispatchEvent(
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
