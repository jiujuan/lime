import { describe, expect, it } from "vitest";
import {
  buildWorkspaceWorkflowCancelParams,
  buildWorkspaceWorkflowControlItems,
  buildWorkspaceWorkflowRespondParams,
  buildWorkspaceWorkflowRetryParams,
} from "./workspaceWorkflowControls";
import type {
  WorkspaceWorkflowRun,
  WorkspaceWorkflowStep,
} from "./workspaceWorkflowReadModel";

function workflowRun(
  overrides: Partial<WorkspaceWorkflowRun>,
): WorkspaceWorkflowRun {
  return {
    workflowRunId: "workflow-run-1",
    workflowKey: "content_article_workflow",
    workflowTitle: "写文章工作流",
    status: "running",
    appId: null,
    sessionId: "session-1",
    workspaceId: null,
    turnId: null,
    taskId: null,
    taskKind: null,
    selectedObjectRef: null,
    primaryArtifactRef: null,
    eventCount: null,
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    completedAt: null,
    failedAt: null,
    stepCounts: null,
    artifactRefs: [],
    evidenceRefs: [],
    failure: null,
    retry: null,
    actions: [],
    steps: [],
    ...overrides,
  };
}

function workflowStep(
  overrides: Partial<WorkspaceWorkflowStep>,
): WorkspaceWorkflowStep {
  return {
    workflowRunId: "workflow-run-1",
    workflowKey: "content_article_workflow",
    id: "review",
    title: "确认内容",
    index: 0,
    stepCount: 1,
    status: "waiting",
    attempt: 1,
    subagent: null,
    skillRefs: [],
    expectedOutput: null,
    progressMessage: null,
    detail: null,
    output: null,
    eventCount: null,
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    completedAt: null,
    failedAt: null,
    toolCallIds: [],
    artifactRefs: [],
    evidenceRefs: [],
    failure: null,
    retry: null,
    response: null,
    requestId: null,
    agentActionType: null,
    ...overrides,
  };
}

describe("workspaceWorkflowControls", () => {
  it("应从 waiting action 生成 respond 控制项和 App Server payload", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "waiting",
        actions: [
          {
            workflowRunId: "workflow-run-1",
            actionType: "respond",
            stepId: "review",
            requestId: "request-1",
            agentActionType: "ask_user",
          },
        ],
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        kind: "respond",
        workflowRunId: "workflow-run-1",
        stepId: "review",
        requestId: "request-1",
        actionType: "ask_user",
        labelKey: "generalWorkbench.workflow.control.respond",
        ariaLabelKey: "generalWorkbench.workflow.control.respondAria",
      }),
      expect.objectContaining({
        kind: "cancel",
        workflowRunId: "workflow-run-1",
      }),
    ]);
    expect(buildWorkspaceWorkflowRespondParams(items[0]!, "session-1")).toEqual(
      {
        sessionId: "session-1",
        workflowRunId: "workflow-run-1",
        stepId: "review",
        requestId: "request-1",
        actionType: "ask_user",
        confirmed: true,
        response: {
          decision: "confirmed",
          source: "general_workbench_sidebar",
        },
      },
    );
  });

  it("应为工具确认等待点生成明确的 respond 文案键", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "waiting",
        actions: [
          {
            workflowRunId: "workflow-run-1",
            actionType: "respond",
            stepId: "tool-approval",
            requestId: "request-tool-1",
            agentActionType: "tool_confirmation",
          },
        ],
      }),
    ]);

    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: "respond",
        workflowRunId: "workflow-run-1",
        stepId: "tool-approval",
        requestId: "request-tool-1",
        actionType: "tool_confirmation",
        labelKey: "generalWorkbench.workflow.control.respondToolConfirmation",
        ariaLabelKey:
          "generalWorkbench.workflow.control.respondToolConfirmationAria",
      }),
    );
    expect(buildWorkspaceWorkflowRespondParams(items[0]!, "session-1")).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        workflowRunId: "workflow-run-1",
        stepId: "tool-approval",
        requestId: "request-tool-1",
        actionType: "tool_confirmation",
        confirmed: true,
      }),
    );
  });

  it("应从 waiting step 生成 elicitation respond 控制项", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "running",
        steps: [
          workflowStep({
            id: "collect-input",
            title: "补充信息",
            status: "waiting_permission",
            requestId: "request-elicitation-1",
            agentActionType: "elicitation",
          }),
        ],
      }),
    ]);

    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: "respond",
        workflowRunId: "workflow-run-1",
        stepId: "collect-input",
        requestId: "request-elicitation-1",
        actionType: "elicitation",
        labelKey: "generalWorkbench.workflow.control.respondElicitation",
        ariaLabelKey: "generalWorkbench.workflow.control.respondElicitationAria",
      }),
    );
    expect(buildWorkspaceWorkflowRespondParams(items[0]!, "session-1")).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        workflowRunId: "workflow-run-1",
        stepId: "collect-input",
        requestId: "request-elicitation-1",
        actionType: "elicitation",
        confirmed: true,
      }),
    );
  });

  it("应为多个 waiting respond action 生成多个控制项并去重 step 投影", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "waiting",
        actions: [
          {
            workflowRunId: "workflow-run-1",
            actionType: "respond",
            stepId: "review-copy",
            requestId: "request-review-1",
            agentActionType: "ask_user",
          },
          {
            workflowRunId: "workflow-run-1",
            actionType: "respond",
            stepId: "approve-tool",
            requestId: "request-tool-1",
            agentActionType: "tool_confirmation",
          },
        ],
        steps: [
          workflowStep({
            id: "review-copy",
            status: "waiting",
            requestId: "request-review-1",
            agentActionType: "ask_user",
          }),
          workflowStep({
            id: "approve-tool",
            status: "waiting_permission",
            requestId: "request-tool-1",
            agentActionType: "tool_confirmation",
          }),
        ],
      }),
    ]);

    expect(items.filter((item) => item.kind === "respond")).toEqual([
      expect.objectContaining({
        kind: "respond",
        stepId: "review-copy",
        requestId: "request-review-1",
        actionType: "ask_user",
      }),
      expect.objectContaining({
        kind: "respond",
        stepId: "approve-tool",
        requestId: "request-tool-1",
        actionType: "tool_confirmation",
      }),
    ]);
  });

  it("不应把 retry action 的 stepId 误转成 respond 控制项", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "failed",
        actions: [
          {
            workflowRunId: "workflow-run-1",
            actionType: "retry",
            stepId: "draft",
            requestId: null,
            agentActionType: null,
          },
        ],
        steps: [
          workflowStep({
            id: "draft",
            status: "failed",
          }),
        ],
      }),
    ]);

    expect(items.some((item) => item.kind === "respond")).toBe(false);
    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: "retry",
        stepId: "draft",
      }),
    );
  });

  it("失败 run 应生成 retry 控制项并定位失败 step", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "failed",
        steps: [
          workflowStep({
            id: "draft",
            title: "起草正文",
            status: "failed",
            failure: { message: "正文为空" },
          }),
        ],
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        kind: "retry",
        workflowRunId: "workflow-run-1",
        stepId: "draft",
      }),
    ]);
    expect(buildWorkspaceWorkflowRetryParams(items[0]!, "session-1")).toEqual({
      sessionId: "session-1",
      workflowRunId: "workflow-run-1",
      stepId: "draft",
      reasonCode: "user_retry_from_general_workbench",
      reason: "Retried from General Workbench workflow controls.",
    });
  });

  it("skipped run 应生成 retry 控制项", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "skipped",
        steps: [
          workflowStep({
            id: "publish",
            title: "发布检查",
            status: "skipped",
          }),
        ],
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        kind: "retry",
        workflowRunId: "workflow-run-1",
        stepId: "publish",
      }),
    ]);
  });

  it("运行中 run 应生成 cancel 控制项", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "running",
        steps: [
          workflowStep({
            id: "draft",
            title: "起草正文",
            status: "running",
            attempt: null,
          }),
        ],
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        kind: "cancel",
        workflowRunId: "workflow-run-1",
        stepId: "draft",
      }),
    ]);
    expect(buildWorkspaceWorkflowCancelParams(items[0]!, "session-1")).toEqual({
      sessionId: "session-1",
      workflowRunId: "workflow-run-1",
      stepId: "draft",
      reasonCode: "user_cancelled_from_general_workbench",
      reason: "Canceled from General Workbench workflow controls.",
    });
  });
});
