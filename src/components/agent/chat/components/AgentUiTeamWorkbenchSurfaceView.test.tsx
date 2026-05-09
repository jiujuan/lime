import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentUiProjectionEvent } from "../projection/agentUiEventProjection";
import { AgentUiTeamWorkbenchSurfaceView } from "./AgentUiTeamWorkbenchSurfaceView";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

function renderSurfaceView(
  props: Parameters<typeof AgentUiTeamWorkbenchSurfaceView>[0],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AgentUiTeamWorkbenchSurfaceView {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

function buildEvents(): AgentUiProjectionEvent[] {
  return [
    {
      type: "task.changed",
      sourceType: "team_formation_projection",
      sequence: 1,
      sessionId: "session-team-1",
      taskId: "work-1",
      workItemId: "work-1",
      owner: "task",
      scope: "task",
      phase: "acting",
      surface: "work_board",
      persistence: "snapshot",
      control: "assign",
      runtimeEntity: "work_item",
    },
    {
      type: "review.requested",
      sourceType: "team_control_projection",
      sequence: 2,
      sessionId: "session-team-1",
      taskId: "review-1",
      workItemId: "review-1",
      reviewId: "review-1",
      owner: "task",
      scope: "task",
      phase: "reviewing",
      surface: "review_lane",
      persistence: "snapshot",
      control: "request_review",
      runtimeEntity: "work_item",
      payload: {
        decisionStatus: "pending_review",
        riskLevel: "high",
        requestedFixes: ["补齐 evidence pack"],
      },
    },
    {
      type: "agent.changed",
      sourceType: "remote_task_projection",
      sequence: 3,
      sessionId: "session-team-1",
      taskId: "remote-task-1",
      agentId: "remote-agent-1",
      agentName: "远端审校员",
      owner: "agent",
      scope: "agent",
      phase: "waiting",
      surface: "remote_teammate",
      persistence: "snapshot",
      control: "answer",
      runtimeEntity: "external_task",
      runtimeStatus: "needs_input",
      payload: {
        remoteTaskId: "remote-task-1",
        agentCardProvider: "limecloud",
        artifactCount: 1,
        primaryArtifactContentUrl:
          "https://remote.example/artifacts/1?token=hidden",
        primaryArtifactMimeType: "text/markdown",
      },
    },
    {
      type: "tool.started",
      sourceType: "tool_start",
      sequence: 4,
      sessionId: "session-team-1",
      owner: "tool",
      scope: "tool_call",
      phase: "acting",
      surface: "tool_ui",
      persistence: "transcript",
    },
  ];
}

describe("AgentUiTeamWorkbenchSurfaceView", () => {
  it("应展示标准 surface section、注意力计数和操作目标", () => {
    const container = renderSurfaceView({ events: buildEvents() });

    expect(container.textContent).toContain("工作台操作视图");
    expect(container.textContent).toContain("3 items");
    expect(container.textContent).toContain("注意 2");
    expect(container.textContent).toContain("Board");
    expect(container.textContent).toContain("Review");
    expect(container.textContent).toContain("Remote");
    expect(container.textContent).toContain("请求审核 · 目标 review-1");
    expect(container.textContent).toContain("补充输入 · 目标 remote-task-1");
    expect(container.textContent).toContain(
      "内容链接：https://remote.example/artifacts/1",
    );
    expect(container.textContent).toContain("text/markdown");
    expect(container.textContent).not.toContain("token=hidden");
    expect(container.textContent).not.toContain("Tool 开始");
  });

  it("提供 onAction 时应把选中的工作台 item 回传给调用方", () => {
    const onAction = vi.fn();
    const container = renderSurfaceView({
      events: buildEvents(),
      onAction,
    });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="remote-task-1"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0]).toMatchObject({
      title: "远端审校员",
      action: { control: "answer", targetId: "remote-task-1" },
      target: { remoteTaskId: "remote-task-1" },
    });
  });
});
