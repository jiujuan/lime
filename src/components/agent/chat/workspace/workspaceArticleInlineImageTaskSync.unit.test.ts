import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import {
  applyWorkspaceArticleInlineImageTaskSyncResult,
  buildWorkspaceArticleInlineImageTaskSync,
  selectWorkspaceArticleInlineImageTaskIds,
  suppressWorkspaceArticleInlineImageTaskPreviewMessages,
} from "./workspaceArticleInlineImageTaskSync";
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
          "## 核心观点",
          "核心观点段落",
          "",
          "<!-- lime:image-task-slot:article-image-slot-1 -->",
        ].join("\n"),
      },
    },
  ],
};

function imageWorkbenchState(
  status: SessionImageWorkbenchState["tasks"][number]["status"],
): SessionImageWorkbenchState {
  return {
    active: false,
    viewport: { x: 0, y: 0, scale: 1 },
    selectedTaskId: "task-inline",
    selectedOutputId: null,
    nextOutputIndex: 1,
    tasks: [
      {
        id: "task-inline",
        mode: "generate",
        status,
        prompt: "广州夏天午后街景",
        rawText: "@配图 广州夏天午后街景",
        expectedCount: 1,
        outputIds: ["output-1"],
        createdAt: 1,
        sessionId: "session-main",
        hookImageIds: [],
        applyTarget: {
          kind: "canvas-insert",
          canvasType: "document",
          anchorHint: "section_end",
          slotId: "article-image-slot-1",
          sectionTitle: "核心观点",
          anchorText: "核心观点段落",
          actionLabel: "插入文稿",
          dispatchLabel: "正在插入图片",
        },
      },
    ],
    outputs:
      status === "complete"
        ? [
            {
              id: "output-1",
              refId: "I1",
              taskId: "task-inline",
              url: "https://example.com/guangzhou.png",
              prompt: "广州夏天午后街景",
              slotId: "article-image-slot-1",
              createdAt: 2,
              hookImageId: "hook-image-1",
              applyTarget: null,
            },
          ]
        : [],
  };
}

describe("workspaceArticleInlineImageTaskSync", () => {
  it("应把 running document-inline 图片任务写成文章 pending 占位", () => {
    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace,
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("running"),
    });

    expect(result?.object.title).toBe("公众号文章草稿");
    expect(result?.markdown).toContain("pending-image-task://task-inline");
    expect(result?.markdown).toContain(
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    );
  });

  it("应把 completed document-inline 图片任务替换成真实图片 URL", () => {
    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace,
      editedDraft: {
        objectKey: "content-factory-app:session-main:articleDraft:article-1",
        markdown: [
          "# 标题",
          "",
          "![广州夏天午后街景](pending-image-task://task-inline?status=running&prompt=%E5%B9%BF%E5%B7%9E)",
          "<!-- lime:image-task-slot:article-image-slot-1 -->",
        ].join("\n"),
        updatedAt: "2026-07-03T00:00:00.000Z",
      },
      imageWorkbenchState: imageWorkbenchState("complete"),
    });

    expect(result?.markdown).toContain(
      "![广州夏天午后街景](https://example.com/guangzhou.png)",
    );
    expect(result?.markdown).not.toContain("pending-image-task://");
    expect(result?.consumedTaskIds).toEqual(["task-inline"]);
  });

  it("文章没有对应 slot marker 时不应误同步普通 document-inline 任务", () => {
    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace: {
        ...articleWorkspace,
        objects: articleWorkspace.objects.map((object) => ({
          ...object,
          source: {
            documentText: "# 标题\n\n正文没有配图占位。",
          },
        })),
      },
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("running"),
    });

    expect(result).toBeNull();
  });

  it("应识别 inline 图片任务，供文章卡吸收并隐藏独立图片卡", () => {
    expect(
      selectWorkspaceArticleInlineImageTaskIds({
        articleWorkspace,
        editedDraft: null,
        imageWorkbenchState: imageWorkbenchState("running"),
      }),
    ).toEqual(["task-inline"]);
  });

  it("应把同步后的 markdown 应用回文章 workspace preview 数据", () => {
    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace,
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("complete"),
    });
    const nextWorkspace = applyWorkspaceArticleInlineImageTaskSyncResult(
      articleWorkspace,
      result,
    );

    expect(nextWorkspace?.objects[0]?.source?.documentText).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(nextWorkspace?.objects[0]?.source?.finalMarkdown).toContain(
      "https://example.com/guangzhou.png",
    );
  });

  it("任务运行中也应隐藏只服务文章 inline slot 的独立图片结果消息", () => {
    const messages: Message[] = [
      {
        id: "msg-tool-process",
        role: "assistant",
        content: "图片工具已执行，继续生成文章产物。",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "task-inline",
          prompt: "广州夏天午后街景",
          status: "complete",
          imageUrl: "https://example.com/guangzhou.png",
        },
      },
      {
        id: "image-workbench:task-inline:assistant",
        role: "assistant",
        content: "图片正在生成。",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "task-inline",
          prompt: "广州夏天午后街景",
          status: "running",
        },
      },
      {
        id: "image-workbench:standalone:assistant",
        role: "assistant",
        content: "",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "standalone",
          prompt: "普通图片任务",
          status: "complete",
          imageUrl: "https://example.com/standalone.png",
        },
      },
    ];

    const nextMessages = suppressWorkspaceArticleInlineImageTaskPreviewMessages(
      messages,
      ["task-inline"],
    );

    expect(nextMessages.map((message) => message.id)).toEqual([
      "msg-tool-process",
      "image-workbench:standalone:assistant",
    ]);
    expect(nextMessages[0]?.content).toContain("图片工具已执行");
    expect(nextMessages[0]?.imageWorkbenchPreview).toBeUndefined();
    expect(nextMessages[1]?.imageWorkbenchPreview?.taskId).toBe("standalone");
  });

  it("最终文章 artifact 应吸收 inline 图片结果，而不是继续显示独立图片卡", () => {
    const syncResult = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace,
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("complete"),
    });
    const articleWorkspaceWithImage =
      applyWorkspaceArticleInlineImageTaskSyncResult(
        articleWorkspace,
        syncResult,
      );
    const messages: Message[] = [
      {
        id: "assistant-process",
        role: "assistant",
        content: "已生成文章配图，继续整理最终文章。",
        timestamp: new Date(),
        imageWorkbenchPreview: {
          taskId: "task-inline",
          prompt: "广州夏天午后街景",
          status: "complete",
          imageUrl: "https://example.com/guangzhou.png",
        },
      },
    ];

    const displayMessages =
      attachWorkspaceArticleWorkspacePreviewArtifactToMessages({
        messages: suppressWorkspaceArticleInlineImageTaskPreviewMessages(
          messages,
          syncResult?.consumedTaskIds ?? [],
        ),
        articleWorkspace: articleWorkspaceWithImage,
        now: 100,
      });

    expect(displayMessages).toHaveLength(1);
    expect(displayMessages[0]?.imageWorkbenchPreview).toBeUndefined();
    expect(displayMessages[0]?.content).toContain("已生成文章配图");
    expect(displayMessages[0]?.artifacts).toHaveLength(1);
    expect(displayMessages[0]?.artifacts?.[0]?.content).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(displayMessages[0]?.artifacts?.[0]?.content).not.toContain(
      "pending-image-task://",
    );
  });
});
