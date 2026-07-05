import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import type { WorkspaceArticleWorkspace } from "./workspaceArticleWorkspaceModel";
import { buildArticleWorkspaceForArtifactOpen } from "./workspaceArticleWorkspaceArtifactOpen";

const currentArticleWorkspace: WorkspaceArticleWorkspace = {
  schemaVersion: "article-workspace.v1",
  appId: "content-factory-app",
  sessionId: "sess-history",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 1,
  actionHistory: [],
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "sess-history",
        artifactIds: ["artifact-article-1"],
      },
      title: "公众号文章草稿",
      status: "needs_review",
      previewArtifactId: "artifact-article-1",
      source: {
        documentText: "# 公众号文章草稿\n\n正文",
      },
    },
  ],
  primaryObjectRef: {
    appId: "content-factory-app",
    kind: "articleDraft",
    id: "article-1",
    sessionId: "sess-history",
    artifactIds: ["artifact-article-1"],
  },
  selectedObjectRef: {
    appId: "content-factory-app",
    kind: "articleDraft",
    id: "article-1",
    sessionId: "sess-history",
  },
};

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-article-1",
    type: "document",
    title: "公众号文章草稿",
    content: "# 公众号文章草稿\n\n正文",
    status: "complete",
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("buildArticleWorkspaceForArtifactOpen", () => {
  it("历史 artifact 只有对象级 articleWorkspace metadata 时，应复用当前完整 Article Workspace", () => {
    const result = buildArticleWorkspaceForArtifactOpen(
      artifact({
        meta: {
          openedFrom: "app_server_article_workspace",
          artifactSchema: "artifact_document.v1",
          articleWorkspace: {
            appId: "content-factory-app",
            sessionId: "sess-history",
            objectKind: "articleDraft",
            objectId: "article-1",
            artifactIds: ["artifact-article-1"],
            surfaceKind: "document",
          },
        },
      }),
      currentArticleWorkspace,
    );

    expect(result).toBe(currentArticleWorkspace);
  });

  it("对象级 metadata 不匹配当前 workspace 时不应误开右侧 Article Workspace", () => {
    const result = buildArticleWorkspaceForArtifactOpen(
      artifact({
        id: "artifact-other",
        meta: {
          openedFrom: "app_server_article_workspace",
          articleWorkspace: {
            appId: "content-factory-app",
            sessionId: "sess-history",
            objectKind: "articleDraft",
            objectId: "article-other",
          },
        },
      }),
      currentArticleWorkspace,
    );

    expect(result).toBeNull();
  });
});
