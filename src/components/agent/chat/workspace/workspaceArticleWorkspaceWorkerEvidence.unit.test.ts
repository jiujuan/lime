import { describe, expect, it } from "vitest";
import {
  buildWorkspaceArticleWorkspaceWorkerEvidenceFromThreadRead,
  readWorkspaceArticleWorkspaceWorkerEvidence,
} from "./workspaceArticleWorkspaceWorkerEvidence";

describe("workspaceArticleWorkspaceWorkerEvidence", () => {
  it("应读取 worker 深度详情并按更新时间倒序排列", () => {
    const evidence = readWorkspaceArticleWorkspaceWorkerEvidence([
      {
        id: "evt-success:workerEvidence",
        status: "completed",
        eventType: "artifact.snapshot",
        appId: "content-factory-app",
        taskId: "task-article-1",
        taskKind: "content.article.generate",
        turnId: "turn-1",
        workerEntrypoint: "./runtime/content-factory-worker.mjs",
        inputSummary: "prompt=生成文章; inputKeys=topic",
        outputSummary: "2 objects: 公众号文章草稿, 配图组",
        outputObjectCount: 2,
        artifactRef: "artifact-workspace-patch-1",
        artifactKind: "content_factory.workspace_patch",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
      {
        id: "evt-failed:workerEvidence",
        status: "failed",
        event_type: "runtime.error",
        app_id: "content-factory-app",
        task_id: "task-image-1",
        task_kind: "content.image.generate",
        turn_id: "turn-2",
        worker_entrypoint: "./runtime/content-factory-worker.mjs",
        input_summary: "prompt=生成图片; inputKeys=topic",
        error_code: "worker_invalid_json_output",
        error_message: "Agent App worker returned invalid JSON",
        failure_category: "worker_output",
        retryable: false,
        retry_advice: "inspect_worker_output",
        retry_attempt: 0,
        retry_max_attempts: 0,
        updated_at: "2026-06-24T00:00:02.000Z",
      },
    ]);

    expect(evidence).toEqual([
      expect.objectContaining({
        id: "evt-failed:workerEvidence",
        status: "failed",
        eventType: "runtime.error",
        taskId: "task-image-1",
        workerEntrypoint: "./runtime/content-factory-worker.mjs",
        inputSummary: "prompt=生成图片; inputKeys=topic",
        outputSummary: null,
        outputObjectCount: null,
        errorCode: "worker_invalid_json_output",
        failureCategory: "worker_output",
        retryable: false,
        retryAdvice: "inspect_worker_output",
        retryAttempt: 0,
        retryMaxAttempts: 0,
      }),
      expect.objectContaining({
        id: "evt-success:workerEvidence",
        status: "completed",
        eventType: "artifact.snapshot",
        taskId: "task-article-1",
        inputSummary: "prompt=生成文章; inputKeys=topic",
        outputSummary: "2 objects: 公众号文章草稿, 配图组",
        outputObjectCount: 2,
      }),
    ]);
  });

  it("没有显式 worker evidence 时应保留旧 source artifact fallback", () => {
    const evidence = buildWorkspaceArticleWorkspaceWorkerEvidenceFromThreadRead({
      sourceArtifacts: [
        {
          artifactRef: "artifact-workspace-patch-1",
          kind: "content_factory.workspace_patch",
          turnId: "turn-1",
        },
      ],
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        status: "completed",
        eventType: "artifact.snapshot",
        artifactRef: "artifact-workspace-patch-1",
        inputSummary: null,
        outputSummary: null,
      }),
    ]);
  });
});
