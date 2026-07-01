import { describe, expect, it } from "vitest";
import { buildWorkspaceArticleEditorOrchestrationModel } from "./workspaceArticleEditorOrchestrationModel";
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
    source: "agent_app_task_worker",
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
    hookPolicy: null,
    runtimeRegistries: null,
    orchestration: [],
    updatedAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}
