import { describe, expect, it } from "vitest";
import {
  filterWorkspaceArticleWorkspaceActionHistoryForObject,
  readWorkspaceArticleWorkspaceActionHistory,
} from "./workspaceArticleWorkspaceActionHistory";

describe("workspaceArticleWorkspaceActionHistory", () => {
  it("应解析 action history 并按当前对象过滤最近操作", () => {
    const history = readWorkspaceArticleWorkspaceActionHistory([
      {
        key: "revise",
        status: "running",
        turn_id: "turn-action-1",
        session_id: "session-main",
        thread_id: "thread-main",
        app_id: "content-factory-app",
        submitted_at: "2026-06-24T00:00:00.000Z",
        object_ref: {
          app_id: "content-factory-app",
          kind: "articleDraft",
          id: "article-1",
          session_id: "session-main",
        },
      },
      {
        key: "regenerate",
        status: "completed",
        turnId: "turn-action-2",
        sessionId: "session-main",
        threadId: "thread-main",
        appId: "content-factory-app",
        submittedAt: "2026-06-24T00:01:00.000Z",
        resultArtifacts: [
          {
            artifactRef: "artifact-image-regenerated",
            artifactId: "artifact-document:image-regenerated",
            title: "重新生成配图",
            kind: "artifact_document",
            status: "ready",
          },
        ],
        objectRef: {
          appId: "content-factory-app",
          kind: "imageGenerationSet",
          id: "image-set-1",
          sessionId: "session-main",
        },
      },
    ]);

    expect(history.map((item) => item.turnId)).toEqual([
      "turn-action-2",
      "turn-action-1",
    ]);

    const filtered = filterWorkspaceArticleWorkspaceActionHistoryForObject(
      history,
      {
        ref: {
          appId: "content-factory-app",
          kind: "imageGenerationSet",
          id: "image-set-1",
          sessionId: "session-main",
        },
      },
    );

    expect(filtered).toEqual([
      expect.objectContaining({
        key: "regenerate",
        status: "completed",
        turnId: "turn-action-2",
        resultArtifacts: [
          expect.objectContaining({
            artifactRef: "artifact-image-regenerated",
            title: "重新生成配图",
          }),
        ],
      }),
    ]);
  });

  it("应解析失败 action 的错误证据", () => {
    expect(
      readWorkspaceArticleWorkspaceActionHistory([
        {
          key: "regenerate",
          status: "failed",
          turn_id: "turn-action-failed",
          session_id: "session-main",
          app_id: "content-factory-app",
          error_code: "worker_invalid_json_output",
          error_message: "Agent App worker returned invalid JSON",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        errorCode: "worker_invalid_json_output",
        errorMessage: "Agent App worker returned invalid JSON",
      }),
    ]);
  });
});
