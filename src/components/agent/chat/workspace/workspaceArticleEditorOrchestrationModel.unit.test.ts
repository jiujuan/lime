import { describe, expect, it } from "vitest";
import {
  buildWorkspaceArticleEditorOrchestrationModel,
  buildWorkspacePluginOrchestrationModel,
} from "./workspaceArticleEditorOrchestrationModel";
import type {
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceStructuredPreview,
} from "./workspaceArticleWorkspaceModel";
import type { WorkspaceArticleWorkspaceWorkerEvidenceItem } from "./workspaceArticleWorkspaceWorkerEvidence";

describe("workspaceArticleEditorOrchestrationModel", () => {
  it("应优先使用完整 worker evidence 并保留插件编排能力", () => {
    const model = buildWorkspaceArticleEditorOrchestrationModel(
      articleWorkspaceWithEvidence([
        workerEvidence({
          taskKind: "content.image.generate",
          workflowKey: "image_workflow",
          connectorRefs: ["media-generation"],
        }),
        workerEvidence({
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          subagents: ["content-researcher", "article-writer"],
          skillRefs: ["article-research", "article-writing"],
          cliRefs: ["content-factory"],
          connectorRefs: ["lime-knowledge", "web-research"],
          hookPolicy: {
            prompt: ["prompt-submit"],
            task: ["task-complete"],
          },
          orchestration: [
            {
              id: "research",
              title: "资料检索",
              subagent: "content-researcher",
              skillRefs: ["article-research"],
              status: "completed",
              summary: "整理资料",
              expectedOutput: "写作依据",
            },
            {
              id: "draft",
              title: "文章起草",
              subagent: "article-writer",
              skillRefs: ["article-writing"],
              status: "queued",
              summary: null,
              expectedOutput: "首版文章",
            },
          ],
        }),
      ]),
      structuredPreview(),
    );

    expect(model).toMatchObject({
      workflowKey: "content_article_workflow",
      subagentRefs: ["content-researcher", "article-writer"],
      skillRefs: ["article-research", "article-writing"],
      cliRefs: ["content-factory"],
      connectorRefs: ["lime-knowledge", "web-research"],
      hookLabels: ["prompt:prompt-submit", "task:task-complete"],
    });
    expect(model?.steps).toEqual([
      expect.objectContaining({
        id: "research",
        subagent: "content-researcher",
        skillRefs: ["article-research"],
        done: true,
      }),
      expect.objectContaining({
        id: "draft",
        subagent: "article-writer",
        skillRefs: ["article-writing"],
        summary: "首版文章",
        done: false,
      }),
    ]);
  });

  it("应优先使用宿主 workflow facts 而不是旧 worker evidence 步骤", () => {
    const model = buildWorkspaceArticleEditorOrchestrationModel(
      {
        ...articleWorkspaceWithEvidence([
          workerEvidence({
            workflowKey: "legacy_worker_workflow",
            orchestration: [
              {
                id: "legacy",
                title: "旧 worker 过程",
                subagent: "legacy-agent",
                skillRefs: ["legacy-skill"],
                status: "completed",
                summary: "旧过程",
                expectedOutput: "旧输出",
              },
            ],
          }),
          workerEvidence({
            workflowKey: "content_article_workflow",
            connectorRefs: ["web-research"],
            hookPolicy: { task: ["task-complete"] },
          }),
        ]),
        workflowRuns: [
          {
            workflowRunId: "task-article:workflow",
            workflowKey: "content_article_workflow",
            workflowTitle: "写文章工作流",
            status: "running",
            appId: "content-factory-app",
            sessionId: "session-main",
            workspaceId: null,
            turnId: "turn-action-1",
            taskId: "task-article",
            taskKind: "content.article.generate",
            selectedObjectRef: null,
            primaryArtifactRef: null,
            eventCount: 3,
            startedAt: null,
            updatedAt: null,
            completedAt: null,
            failedAt: null,
            steps: [
              {
                workflowRunId: "task-article:workflow",
                workflowKey: "content_article_workflow",
                id: "research",
                title: "资料检索",
                index: 0,
                stepCount: 2,
                status: "completed",
                subagent: "content-researcher",
                skillRefs: ["article-research"],
                expectedOutput: "素材摘要",
                progressMessage: "已完成资料检索",
                detail: null,
                output: null,
                eventCount: 2,
                startedAt: null,
                updatedAt: null,
                completedAt: null,
                failedAt: null,
              },
              {
                workflowRunId: "task-article:workflow",
                workflowKey: "content_article_workflow",
                id: "draft",
                title: "正文写作",
                index: 1,
                stepCount: 2,
                status: "running",
                subagent: "article-writer",
                skillRefs: ["article-writing"],
                expectedOutput: "首版文章",
                progressMessage: null,
                detail: null,
                output: null,
                eventCount: 1,
                startedAt: null,
                updatedAt: null,
                completedAt: null,
                failedAt: null,
              },
            ],
          },
        ],
      },
      structuredPreview(),
    );

    expect(model).toMatchObject({
      workflowKey: "content_article_workflow",
      subagentRefs: ["content-researcher", "article-writer"],
      skillRefs: ["article-research", "article-writing"],
      connectorRefs: ["web-research"],
      hookLabels: ["task:task-complete"],
    });
    expect(model?.steps).toEqual([
      expect.objectContaining({
        id: "research",
        title: "资料检索",
        summary: "已完成资料检索",
        done: true,
      }),
      expect.objectContaining({
        id: "draft",
        title: "正文写作",
        summary: "首版文章",
        done: null,
      }),
    ]);
    expect(model?.steps.some((step) => step.id === "legacy")).toBe(false);
  });

  it("没有 worker evidence 时应回退到 writing plan", () => {
    const model = buildWorkspaceArticleEditorOrchestrationModel(
      articleWorkspaceWithEvidence([]),
      structuredPreview({
        writingPlan: [
          {
            id: "outline",
            title: "整理大纲",
            owner: "content-strategist",
            skillRef: "article-outline",
            goal: "确认文章结构",
            done: true,
          },
        ],
      }),
    );

    expect(model).toEqual({
      workflowKey: null,
      steps: [
        {
          id: "outline",
          title: "整理大纲",
          subagent: "content-strategist",
          skillRefs: ["article-outline"],
          status: null,
          summary: "确认文章结构",
          done: true,
        },
      ],
      subagentRefs: ["content-strategist"],
      skillRefs: ["article-outline"],
      cliRefs: [],
      connectorRefs: [],
      hookLabels: [],
    });
  });

  it("应优先使用完成态 artifact.snapshot 并跳过 hook 事件", () => {
    const model = buildWorkspacePluginOrchestrationModel(
      articleWorkspaceWithEvidence([
        workerEvidence({
          status: "completed",
          eventType: "plugin_worker.hook",
          taskKind: "content.article.generate",
          workflowKey: "hook_workflow",
          subagents: ["hook-subagent"],
          skillRefs: ["hook-skill"],
          cliRefs: ["hook-cli"],
          connectorRefs: ["hook-connector"],
          orchestration: [
            {
              id: "hook-step",
              title: "Hook step",
              subagent: "hook-subagent",
              skillRefs: ["hook-skill"],
              status: "completed",
              summary: "hook",
              expectedOutput: "hook",
            },
          ],
        }),
        workerEvidence({
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          subagents: ["content-researcher", "article-writer"],
          skillRefs: ["article-research", "article-writing"],
          cliRefs: ["content-factory"],
          connectorRefs: ["lime-knowledge", "web-research"],
          hookPolicy: {
            prompt: ["prompt-submit"],
            task: ["task-complete"],
          },
          orchestration: [
            {
              id: "research",
              title: "资料检索",
              subagent: "content-researcher",
              skillRefs: ["article-research"],
              status: "completed",
              summary: "整理资料",
              expectedOutput: "写作依据",
            },
          ],
        }),
      ]),
      structuredPreview(),
    );

    expect(model).toMatchObject({
      workflowKey: "content_article_workflow",
      subagentRefs: ["content-researcher", "article-writer"],
      skillRefs: ["article-research", "article-writing"],
      cliRefs: ["content-factory"],
      connectorRefs: ["lime-knowledge", "web-research"],
      hookLabels: ["prompt:prompt-submit", "task:task-complete"],
    });
    expect(model?.steps).toEqual([
      expect.objectContaining({
        id: "research",
        subagent: "content-researcher",
        skillRefs: ["article-research"],
        done: true,
      }),
    ]);
  });
});

function articleWorkspaceWithEvidence(
  workerEvidence: WorkspaceArticleWorkspaceWorkerEvidenceItem[],
): WorkspaceArticleWorkspace {
  return {
    schemaVersion: "article-workspace.v1",
    appId: "content-factory-app",
    sessionId: "session-main",
    source: "threadRead",
    objects: [],
    objectCount: 0,
    actionHistory: [],
    workerEvidence,
  };
}

function structuredPreview(
  overrides: Partial<WorkspaceArticleWorkspaceStructuredPreview> = {},
): WorkspaceArticleWorkspaceStructuredPreview {
  return {
    processMarkdown: null,
    documentText: null,
    images: [],
    storyboard: [],
    checklist: [],
    briefFields: [],
    researchRounds: [],
    titleCandidates: [],
    outline: [],
    keyTakeaways: [],
    imageSlots: [],
    citations: [],
    writingPlan: [],
    reviewNotes: [],
    ...overrides,
  };
}

function workerEvidence(
  overrides: Partial<WorkspaceArticleWorkspaceWorkerEvidenceItem> = {},
): WorkspaceArticleWorkspaceWorkerEvidenceItem {
  return {
    id: "evt-worker-success:workerEvidence",
    status: "completed",
    source: "plugin_task_worker",
    eventType: "artifact.snapshot",
    appId: "content-factory-app",
    taskId: "task-article-1",
    taskKind: "content.article.generate",
    turnId: "turn-action-1",
    workerEntrypoint: "./runtime/content-factory-worker.mjs",
    inputSummary: null,
    outputSummary: null,
    outputObjectCount: null,
    artifactRef: "artifact-workspace-patch-1",
    artifactKind: "content_factory.workspace_patch",
    errorCode: null,
    errorMessage: null,
    failureCategory: null,
    retryable: null,
    retryAdvice: null,
    retryAttempt: null,
    retryMaxAttempts: null,
    hookKey: null,
    hookEvent: null,
    hookScope: null,
    hookEntrypoint: null,
    hookRequired: null,
    reasonCode: null,
    resultSummary: null,
    workflowKey: null,
    subagents: [],
    skillRefs: [],
    cliRefs: [],
    connectorRefs: [],
    hookRefs: [],
    hookPolicy: null,
    runtimeRegistries: null,
    orchestration: [],
    updatedAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}
