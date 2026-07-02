import { describe, expect, it } from "vitest";
import { readWorkspaceArticleWorkflowRunsFromUnknown } from "./workspaceArticleWorkspaceWorkflowFacts";

describe("workspaceArticleWorkspaceWorkflowFacts", () => {
  it("应从 thread_read workflow facts 恢复 run 和 steps", () => {
    const runs = readWorkspaceArticleWorkflowRunsFromUnknown({
      workflow_runs: [
        {
          workflow_run_id: "task-article:workflow",
          workflow_key: "content_article_workflow",
          workflow_title: "写文章工作流",
          status: "running",
          task_id: "task-article",
          task_kind: "content.article.generate",
          steps: [
            {
              workflow_run_id: "task-article:workflow",
              step_id: "research",
              step_title: "资料检索",
              step_index: 0,
              status: "running",
              expected_output: "写作依据",
            },
          ],
        },
      ],
      workflow_steps: [
        {
          workflow_run_id: "task-article:workflow",
          workflow_key: "content_article_workflow",
          step_id: "research",
          step_title: "资料检索",
          step_index: 0,
          status: "completed",
          progress_message: "资料检索完成",
          skill_refs: ["article-research"],
        },
        {
          workflow_run_id: "task-article:workflow",
          workflow_key: "content_article_workflow",
          step_id: "draft",
          step_title: "正文写作",
          step_index: 1,
          status: "pending",
        },
      ],
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      workflowRunId: "task-article:workflow",
      workflowKey: "content_article_workflow",
      workflowTitle: "写文章工作流",
      taskId: "task-article",
      taskKind: "content.article.generate",
    });
    expect(runs[0]?.steps).toEqual([
      expect.objectContaining({
        id: "research",
        title: "资料检索",
        status: "completed",
        progressMessage: "资料检索完成",
        skillRefs: ["article-research"],
      }),
      expect.objectContaining({
        id: "draft",
        title: "正文写作",
        status: "pending",
      }),
    ]);
  });

  it("没有 run 时应按 workflow_steps 归组，避免历史恢复丢过程", () => {
    const runs = readWorkspaceArticleWorkflowRunsFromUnknown({
      workflowSteps: [
        {
          workflowRunId: "task-image:workflow",
          workflowKey: "image_workflow",
          stepId: "generate",
          stepTitle: "生成图片",
          status: "completed",
        },
      ],
    });

    expect(runs).toEqual([
      expect.objectContaining({
        workflowRunId: "task-image:workflow",
        workflowKey: "image_workflow",
        steps: [
          expect.objectContaining({
            id: "generate",
            title: "生成图片",
            status: "completed",
          }),
        ],
      }),
    ]);
  });
});
