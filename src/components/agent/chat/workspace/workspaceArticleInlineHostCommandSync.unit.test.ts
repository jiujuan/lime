import { describe, expect, it } from "vitest";
import {
  applyWorkspaceArticleInlineHostCommandSyncResult,
  buildWorkspaceArticleInlineHostCommandSync,
  isFixtureOnlyHostGenerationArticle,
} from "./workspaceArticleInlineHostCommandSync";
import { attachWorkspaceArticleWorkspacePreviewArtifactToMessages } from "./workspaceArticleWorkspaceMessageArtifacts";
import type { WorkspaceArticleWorkspace } from "./workspaceArticleWorkspaceModel";

const articleWorkspace: WorkspaceArticleWorkspace = {
  schemaVersion: "article-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
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
        sessionId: "session-main",
      },
      title: "公众号文章草稿",
      status: "ready",
      source: {
        documentText: [
          "# 标题",
          "",
          "## 花城大道",
          "这里是午后街景段落。",
          "",
          "[@配图 一张广州夏天午后的城市照片，真实摄影 inline-marker]",
        ].join("\n"),
      },
    },
  ],
};

describe("workspaceArticleInlineHostCommandSync", () => {
  it("应在 article workspace 投影层物化 @配图 shortcode 并生成图片 slot intent", () => {
    const result = buildWorkspaceArticleInlineHostCommandSync({
      articleWorkspace,
      editedDraft: null,
    });

    expect(result?.markdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(result?.markdown).not.toContain("[@配图");
    expect(result?.imageSlotIntents).toHaveLength(1);
    expect(result?.imageSlotIntents[0]).toMatchObject({
      anchorSectionTitle: "花城大道",
      anchorText: "这里是午后街景段落。",
      editedMarkdown: expect.stringContaining(
        "<!-- lime:image-task-slot:article-image-slot-1 -->",
      ),
      prompt: "一张广州夏天午后的城市照片，真实摄影 inline-marker",
      slot: expect.objectContaining({
        id: "article-image-slot-1",
      }),
    });
  });

  it("应把物化后的正文同步进 article workspace，使最终文章卡不再展示原始 shortcode", () => {
    const result = buildWorkspaceArticleInlineHostCommandSync({
      articleWorkspace,
      editedDraft: null,
    });
    const materializedWorkspace =
      applyWorkspaceArticleInlineHostCommandSyncResult(
        articleWorkspace,
        result,
      );

    const nextMessages = attachWorkspaceArticleWorkspacePreviewArtifactToMessages({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "文章草稿已生成。",
          timestamp: new Date("2026-07-04T00:00:00.000Z"),
        },
      ],
      articleWorkspace: materializedWorkspace,
      now: 100,
    });
    const artifact = nextMessages[0]?.artifacts?.[0];

    expect(materializedWorkspace?.objects[0]?.source?.documentText).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(artifact?.content).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(artifact?.content).not.toContain("[@配图");
    expect(artifact?.meta.workspacePatch).toMatchObject({
      objects: [
        expect.objectContaining({
          source: expect.objectContaining({
            documentText: expect.stringContaining(
              "<!-- lime:image-task-slot:article-image-slot-1 -->",
            ),
          }),
        }),
      ],
    });
  });

  it("已有 edited draft 时应基于 edited draft 解析，而不是回退 source 正文", () => {
    const result = buildWorkspaceArticleInlineHostCommandSync({
      articleWorkspace,
      editedDraft: {
        objectKey: "content-factory-app:session-main:articleDraft:article-1",
        markdown:
          "# 改写稿\n\n这里是改写段落。\n\n[@配图 一张改写稿配图 edited-marker]",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    });

    expect(result?.markdown).toContain("# 改写稿");
    expect(result?.markdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
    expect(result?.imageSlotIntents[0]?.prompt).toBe(
      "一张改写稿配图 edited-marker",
    );
  });

  it("fixture-only 文章不应触发 host command", () => {
    expect(
      isFixtureOnlyHostGenerationArticle(
        "<!-- fixtureOnlyHostGeneration: true; fixturePromptFingerprint: abc -->",
      ),
    ).toBe(true);

    const result = buildWorkspaceArticleInlineHostCommandSync({
      articleWorkspace: {
        ...articleWorkspace,
        objects: articleWorkspace.objects.map((object) => ({
          ...object,
          source: {
            documentText:
              "<!-- fixtureOnlyHostGeneration: true -->\n\n[@配图 不应触发]",
          },
        })),
      },
      editedDraft: null,
    });

    expect(result).toBeNull();
  });
});
