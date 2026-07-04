import { describe, expect, it } from "vitest";
import {
  buildWorkspaceWorkflowCancelParams,
  buildWorkspaceWorkflowControlItems,
  buildWorkspaceWorkflowRespondParams,
  buildWorkspaceWorkflowRetryParams,
} from "./workspaceWorkflowControls";
import type { WorkspaceWorkflowRun } from "./workspaceWorkflowReadModel";

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

  it("失败 run 应生成 retry 控制项并定位失败 step", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "failed",
        steps: [
          {
            workflowRunId: "workflow-run-1",
            workflowKey: "content_article_workflow",
            id: "draft",
            title: "起草正文",
            index: 0,
            stepCount: 2,
            status: "failed",
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
            failure: { message: "正文为空" },
            retry: null,
            response: null,
            requestId: null,
            agentActionType: null,
          },
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

  it("运行中 run 应生成 cancel 控制项", () => {
    const items = buildWorkspaceWorkflowControlItems([
      workflowRun({
        status: "running",
        steps: [
          {
            workflowRunId: "workflow-run-1",
            workflowKey: "content_article_workflow",
            id: "draft",
            title: "起草正文",
            index: 0,
            stepCount: 1,
            status: "running",
            attempt: null,
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
          },
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
