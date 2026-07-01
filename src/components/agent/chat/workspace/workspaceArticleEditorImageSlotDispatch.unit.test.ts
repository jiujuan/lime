import { describe, expect, it } from "vitest";
import { buildWorkspaceArticleEditorImageSlotCommand } from "./workspaceArticleEditorImageSlotDispatch";
import type { WorkspaceArticleWorkspaceImageSlotIntent } from "./workspaceArticleWorkspaceModel";

const intent: WorkspaceArticleWorkspaceImageSlotIntent = {
  anchorSectionTitle: "开场：为什么要把写作变成工作流",
  anchorText: "首图",
  articleWorkspace: {
    schemaVersion: "article-workspace.v1",
    appId: "content-factory-app",
    sessionId: "session-main",
    workspaceId: "workspace-main",
    source: "threadRead",
    objectCount: 1,
    actionHistory: [],
    objects: [],
  },
  editedMarkdown: "# 当前正文\n\n这是用户在 Article Editor 里编辑过的正文。",
  object: {
    ref: {
      appId: "content-factory-app",
      kind: "articleDraft",
      id: "article-1",
      sessionId: "session-main",
    },
    title: "公众号文章草稿",
    status: "ready",
    summary: "已生成首版文章",
    source: {},
  },
  prompt: "桌面端内容工厂写作流程图，中文标签",
  slot: {
    id: "hero",
    title: "首图",
    sectionId: "intro",
    purpose: "解释内容工厂工作流",
    prompt: "桌面端内容工厂写作流程图，中文标签",
    status: "planned",
  },
};

describe("workspaceArticleEditorImageSlotDispatch", () => {
  it("应把 Article Editor 配图位转换成文稿 inline 图片主链参数", () => {
    const command = buildWorkspaceArticleEditorImageSlotCommand({
      intent,
      projectId: "project-1",
      contentId: "content-1",
      actionLabel: "插入文稿",
      dispatchLabel: "已切回文稿，正在插入图片",
    });

    expect(command).toMatchObject({
      rawText: "@配图 生成 桌面端内容工厂写作流程图，中文标签",
      parsedCommand: {
        mode: "generate",
        prompt: "桌面端内容工厂写作流程图，中文标签",
      },
      images: [],
      applyTarget: {
        kind: "canvas-insert",
        canvasType: "document",
        anchorHint: "section_end",
        slotId: "hero",
        sectionTitle: "开场：为什么要把写作变成工作流",
        anchorText: "首图",
        projectId: "project-1",
        contentId: "content-1",
        actionLabel: "插入文稿",
        dispatchLabel: "已切回文稿，正在插入图片",
      },
    });
  });
});
