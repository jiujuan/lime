import { describe, expect, it } from "vitest";
import type { WorkspaceArticleWorkspace } from "./workspaceArticleWorkspaceModel";
import {
  applyWorkspaceArticleEditedDraft,
  buildWorkspaceArticleEditedDraftFromChange,
  buildWorkspaceArticleEditedDraftKey,
  buildWorkspaceArticleEditedDraftUpdateRequest,
} from "./workspaceArticleWorkspaceEditedDraft";

const articleWorkspace: WorkspaceArticleWorkspace = {
  schemaVersion: "article-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 2,
  actionHistory: [],
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
        artifactIds: ["artifact-article-1"],
      },
      title: "公众号文章草稿",
      status: "needs_review",
      source: {
        documentText: "# 旧正文\n\n这是旧正文。",
        finalMarkdown: "# 旧正文\n\n这是旧正文。",
        researchRounds: [{ id: "research-1", title: "资料检索" }],
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "images-1",
        sessionId: "session-main",
      },
      title: "配图组",
      status: "ready",
      source: {
        images: [{ id: "image-1", title: "主图" }],
      },
    },
  ],
};

describe("workspaceArticleWorkspaceEditedDraft", () => {
  it("应把 Article Editor 本地编辑正文覆盖回对应 articleDraft", () => {
    const articleObject = articleWorkspace.objects[0]!;
    const editedDraft = buildWorkspaceArticleEditedDraftFromChange(
      {
        articleWorkspace,
        object: articleObject,
        markdown: "# 新正文\n\n这是用户编辑后的正文。",
      },
      () => new Date("2026-06-29T10:00:00.000Z"),
    );

    const nextWorkspace = applyWorkspaceArticleEditedDraft(
      articleWorkspace,
      editedDraft,
    );

    expect(editedDraft).toEqual({
      objectKey: buildWorkspaceArticleEditedDraftKey(articleObject),
      markdown: "# 新正文\n\n这是用户编辑后的正文。",
      updatedAt: "2026-06-29T10:00:00.000Z",
    });
    expect(nextWorkspace).not.toBe(articleWorkspace);
    expect(nextWorkspace?.updatedAt).toBe("2026-06-29T10:00:00.000Z");
    expect(nextWorkspace?.objects[0]).toMatchObject({
      source: expect.objectContaining({
        documentText: "# 新正文\n\n这是用户编辑后的正文。",
        finalMarkdown: "# 新正文\n\n这是用户编辑后的正文。",
        updatedAt: "2026-06-29T10:00:00.000Z",
        researchRounds: [{ id: "research-1", title: "资料检索" }],
      }),
    });
    expect(nextWorkspace?.objects[1]).toBe(articleWorkspace.objects[1]);
  });

  it("应把 Article Editor 编辑正文投影为 agentSession/update request", () => {
    const articleObject = articleWorkspace.objects[0]!;
    const change = {
      articleWorkspace,
      object: articleObject,
      markdown: "# 新正文\n\n这是用户编辑后的正文。",
    };
    const editedDraft = buildWorkspaceArticleEditedDraftFromChange(
      change,
      () => new Date("2026-06-29T10:00:00.000Z"),
    );

    expect(
      buildWorkspaceArticleEditedDraftUpdateRequest(change, editedDraft),
    ).toEqual({
      session_id: "session-main",
      article_workspace_edited_draft: {
        objectKey: buildWorkspaceArticleEditedDraftKey(articleObject),
        objectRef: {
          appId: "content-factory-app",
          kind: "articleDraft",
          id: "article-1",
          sessionId: "session-main",
          artifactIds: ["artifact-article-1"],
        },
        markdown: "# 新正文\n\n这是用户编辑后的正文。",
        documentText: "# 新正文\n\n这是用户编辑后的正文。",
        finalMarkdown: "# 新正文\n\n这是用户编辑后的正文。",
        updatedAt: "2026-06-29T10:00:00.000Z",
      },
    });
  });

  it("非 articleDraft 对象不应生成编辑写回", () => {
    const imageObject = articleWorkspace.objects[1]!;

    expect(
      buildWorkspaceArticleEditedDraftFromChange({
        articleWorkspace,
        object: imageObject,
        markdown: "# 不应写回",
      }),
    ).toBeNull();
  });

  it("空正文不应覆盖现有草稿", () => {
    const articleObject = articleWorkspace.objects[0]!;

    expect(
      buildWorkspaceArticleEditedDraftFromChange({
        articleWorkspace,
        object: articleObject,
        markdown: "   ",
      }),
    ).toBeNull();
    expect(applyWorkspaceArticleEditedDraft(articleWorkspace, null)).toBe(
      articleWorkspace,
    );
  });
});
