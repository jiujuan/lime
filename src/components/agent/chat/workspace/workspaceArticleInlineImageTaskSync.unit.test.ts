import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import {
  applyWorkspaceArticleInlineImageTaskSyncResult,
  buildWorkspaceArticleInlineImageTaskSync,
  collectWorkspaceArticleInlineImageTaskRecoveryMarkdowns,
  collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages,
  selectWorkspaceArticleInlineImageTaskIds,
  suppressWorkspaceArticleInlineImageTaskPreviewMessages,
  syncWorkspaceArticleInlineImageTaskMessageArtifacts,
} from "./workspaceArticleInlineImageTaskSync";
import { attachWorkspaceArticleWorkspacePreviewArtifactToMessages } from "./workspaceArticleWorkspaceMessageArtifacts";
import { buildParsedImageTaskSnapshot } from "./imageTaskPreviewRuntimeSnapshot";
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

  it("刷新后的 snake_case 正文也应参与 inline 配图恢复", () => {
    const pendingMarkdown = [
      "# Inline 配图恢复验证",
      "",
      "## 核心观点",
      "核心观点段落",
      "",
      "![广州夏天午后街景](pending-image-task://content-factory-inline-image-task?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");
    const refreshedWorkspace: WorkspaceArticleWorkspace = {
      ...articleWorkspace,
      objects: [
        {
          ...articleWorkspace.objects[0]!,
          source: {
            document_text: pendingMarkdown,
            final_markdown: pendingMarkdown,
          },
        },
      ],
    };

    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdowns({
        articleWorkspace: refreshedWorkspace,
        editedDraft: null,
      }),
    ).toEqual([pendingMarkdown]);

    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace: refreshedWorkspace,
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("complete"),
    });

    expect(result?.markdown).toContain(
      "![广州夏天午后街景](https://example.com/guangzhou.png)",
    );
    expect(result?.markdown).not.toContain("pending-image-task://");
    expect(result?.consumedTaskIds).toEqual(["task-inline"]);
  });

  it("存在多个 articleDraft 时应替换实际包含 slot 的文章对象", () => {
    const secondaryMarkdown = [
      "# 真实待替换稿",
      "",
      "![广州夏天午后街景](pending-image-task://content-factory-inline-image-task?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");
    const multiDraftWorkspace: WorkspaceArticleWorkspace = {
      ...articleWorkspace,
      objectCount: 2,
      objects: [
        {
          ...articleWorkspace.objects[0],
          ref: {
            ...articleWorkspace.objects[0]!.ref,
            id: "article-preferred-without-slot",
          },
          source: {
            documentText: "# 另一个更完整的旧稿\n\n正文没有 inline slot。",
            researchRounds: [{ id: "research-1", title: "资料检索" }],
          },
        },
        {
          ...articleWorkspace.objects[0],
          ref: {
            ...articleWorkspace.objects[0]!.ref,
            id: "article-inline-slot-target",
          },
          title: "真实待替换稿",
          source: {
            documentText: secondaryMarkdown,
            finalMarkdown: secondaryMarkdown,
          },
        },
      ],
    };

    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace: multiDraftWorkspace,
      editedDraft: null,
      imageWorkbenchState: imageWorkbenchState("complete"),
    });
    const nextWorkspace = applyWorkspaceArticleInlineImageTaskSyncResult(
      multiDraftWorkspace,
      result,
    );

    expect(result?.object.ref.id).toBe("article-inline-slot-target");
    expect(result?.markdown).toContain("https://example.com/guangzhou.png");
    expect(nextWorkspace?.objects[0]?.source?.documentText).not.toContain(
      "https://example.com/guangzhou.png",
    );
    expect(nextWorkspace?.objects[1]?.source?.documentText).toContain(
      "https://example.com/guangzhou.png",
    );
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

  it("应把文章正文里的 inline 配图占位作为 task catalog 恢复信号", () => {
    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdowns({
        articleWorkspace: {
          ...articleWorkspace,
          objects: articleWorkspace.objects.map((object) => ({
            ...object,
            source: {
              documentText: [
                "# 标题",
                "",
                "![广州夏天午后街景](pending-image-task://task-inline?status=running)",
                "<!-- lime:image-task-slot:article-image-slot-1 -->",
              ].join("\n"),
            },
          })),
        },
        editedDraft: null,
      }),
    ).toHaveLength(1);
  });

  it("应从旧文章 artifact 内容里收集 inline 配图恢复信号", () => {
    const markdown = [
      "# 标题",
      "",
      "![广州夏天午后街景](pending-image-task://task-inline?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");

    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages([
        {
          id: "assistant-article",
          role: "assistant",
          content: "文章草稿已生成。",
          timestamp: new Date(),
          artifacts: [
            {
              id: "article-preview",
              type: "document",
              title: "公众号文章草稿",
              content: markdown,
              status: "complete",
              meta: {
                openedFrom: "right_surface_article_workspace",
              },
              position: { start: 0, end: markdown.length },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ]),
    ).toEqual([markdown]);
  });

  it("应从文章 artifact 的 workspacePatch 里收集 inline 配图恢复信号", () => {
    const markdown = [
      "# 标题",
      "",
      "![广州夏天午后街景](pending-image-task://task-inline?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");

    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages([
        {
          id: "assistant-article",
          role: "assistant",
          content: "文章草稿已生成。",
          timestamp: new Date(),
          artifacts: [
            {
              id: "article-preview",
              type: "document",
              title: "公众号文章草稿",
              content: "",
              status: "complete",
              meta: {
                openedFrom: "right_surface_article_workspace",
                workspacePatch: {
                  ...articleWorkspace,
                  objects: articleWorkspace.objects.map((object) => ({
                    ...object,
                    source: {
                      document_text: markdown,
                      final_markdown: markdown,
                    },
                  })),
                },
              },
              position: { start: 0, end: 0 },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ]),
    ).toEqual([markdown]);
  });

  it("应从文章 artifactDocument blocks 里收集 inline 配图恢复信号", () => {
    const markdown = [
      "# 标题",
      "",
      "![广州夏天午后街景](pending-image-task://task-inline?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");

    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages([
        {
          id: "assistant-article",
          role: "assistant",
          content: "文章草稿已生成。",
          timestamp: new Date(),
          artifacts: [
            {
              id: "article-preview",
              type: "document",
              title: "公众号文章草稿",
              content: "",
              status: "complete",
              meta: {
                openedFrom: "right_surface_article_workspace",
                artifactDocument: {
                  blocks: [
                    {
                      id: "body",
                      type: "rich_text",
                      contentFormat: "markdown",
                      markdown,
                    },
                  ],
                },
              },
              position: { start: 0, end: 0 },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ]),
    ).toEqual([markdown]);
  });

  it("应把完成的 inline 图片任务同步回旧文章 artifact 内容和 workspacePatch", () => {
    const markdown = [
      "# 标题",
      "",
      "![广州夏天午后街景](pending-image-task://legacy-inline-task?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");
    const messages: Message[] = [
      {
        id: "assistant-article",
        role: "assistant",
        content: "文章草稿已生成。",
        timestamp: new Date(),
        artifacts: [
          {
            id: "article-preview",
            type: "document",
            title: "公众号文章草稿",
            content: markdown,
            status: "complete",
            meta: {
              openedFrom: "right_surface_article_workspace",
              artifactDocument: {
                blocks: [
                  {
                    id: "body-markdown",
                    type: "rich_text",
                    contentFormat: "markdown",
                    markdown,
                  },
                  {
                    id: "body-content",
                    type: "rich_text",
                    contentFormat: "markdown",
                    content: markdown,
                  },
                ],
              },
              workspacePatch: {
                ...articleWorkspace,
                objects: articleWorkspace.objects.map((object) => ({
                  ...object,
                  source: {
                    documentText: markdown,
                    finalMarkdown: markdown,
                  },
                })),
              },
            },
            position: { start: 0, end: markdown.length },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    ];

    const nextMessages = syncWorkspaceArticleInlineImageTaskMessageArtifacts(
      messages,
      {
        taskId: "task-inline",
        taskRecord: {
          status: "completed",
          payload: {
            usage: "document-inline",
            prompt: "广州夏天午后街景",
          },
          relationships: {
            slot_id: "article-image-slot-1",
          },
        },
        outputs: [
          {
            url: "https://example.com/guangzhou.png",
            prompt: "广州夏天午后街景",
            slotId: "article-image-slot-1",
          },
        ],
      },
    );

    const artifact = nextMessages[0]?.artifacts?.[0];
    expect(artifact?.content).toContain("https://example.com/guangzhou.png");
    expect(artifact?.content).not.toContain("pending-image-task://");
    const workspacePatch = artifact?.meta.workspacePatch as
      | WorkspaceArticleWorkspace
      | undefined;
    expect(workspacePatch?.objects[0]?.source?.documentText).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(workspacePatch?.objects[0]?.source?.documentText).not.toContain(
      "pending-image-task://",
    );
    const artifactDocument = artifact?.meta.artifactDocument as
      | { blocks?: Array<{ markdown?: string; content?: string }> }
      | undefined;
    expect(artifactDocument?.blocks?.[0]?.markdown).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(artifactDocument?.blocks?.[0]?.markdown).not.toContain(
      "pending-image-task://",
    );
    expect(artifactDocument?.blocks?.[1]?.content).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(artifactDocument?.blocks?.[1]?.content).not.toContain(
      "pending-image-task://",
    );
  });

  it("应把完成的 inline 图片任务同步回消息正文和 text contentParts", () => {
    const markdown = [
      "# 标题",
      "",
      "![广州夏天午后街景](pending-image-task://task-inline?status=running)",
      "<!-- lime:image-task-slot:article-image-slot-1 -->",
    ].join("\n");
    const messages: Message[] = [
      {
        id: "assistant-content",
        role: "assistant",
        content: markdown,
        contentParts: [
          {
            type: "text",
            text: markdown,
          },
        ],
        timestamp: new Date("2026-07-03T00:00:00.000Z"),
      },
    ];

    expect(
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages(
        messages,
      ),
    ).toEqual([markdown]);

    const nextMessages = syncWorkspaceArticleInlineImageTaskMessageArtifacts(
      messages,
      {
        taskId: "task-inline",
        taskRecord: {
          status: "completed",
          payload: {
            usage: "document-inline",
            prompt: "广州夏天午后街景",
          },
          relationships: {
            slot_id: "article-image-slot-1",
          },
        },
        outputs: [
          {
            url: "https://example.com/guangzhou.png",
            prompt: "广州夏天午后街景",
            slotId: "article-image-slot-1",
          },
        ],
      },
    );

    expect(nextMessages[0]?.content).toContain(
      "https://example.com/guangzhou.png",
    );
    expect(nextMessages[0]?.content).not.toContain("pending-image-task://");
    expect(nextMessages[0]?.contentParts?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("https://example.com/guangzhou.png"),
    });
    expect(JSON.stringify(nextMessages[0]?.contentParts)).not.toContain(
      "pending-image-task://",
    );
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

  it("刷新恢复时应从 task file relationships.slot_id 重建 Article Workspace 原位替换目标", () => {
    const snapshot = buildParsedImageTaskSnapshot({
      taskId: "task-inline-restored",
      taskType: "image_generate",
      projectId: "project-main",
      contentId: "content-main",
      taskFilePath: ".lime/tasks/image_generate/task-inline-restored.json",
      artifactPath: ".lime/artifacts/task-inline-restored.json",
      canvasState: null,
      taskRecord: {
        task_id: "task-inline-restored",
        task_type: "image_generate",
        task_family: "image",
        status: "completed",
        normalized_status: "succeeded",
        created_at: "2026-07-04T00:00:00.000Z",
        relationships: {
          slot_id: "article-image-slot-1",
        },
        payload: {
          usage: "document-inline",
          prompt: "广州夏天午后街景",
          anchor_section_title: "核心观点",
          anchor_text: "核心观点段落",
          project_id: "project-main",
          content_id: "content-main",
        },
        result: {
          images: [
            {
              url: "https://example.com/guangzhou-restored.png",
              prompt: "广州夏天午后街景",
            },
          ],
        },
      },
    });

    expect(snapshot?.task.applyTarget).toMatchObject({
      kind: "canvas-insert",
      canvasType: "document",
      slotId: "article-image-slot-1",
      sectionTitle: "核心观点",
      anchorText: "核心观点段落",
      projectId: "project-main",
      contentId: "content-main",
    });

    const result = buildWorkspaceArticleInlineImageTaskSync({
      articleWorkspace,
      editedDraft: {
        objectKey: "content-factory-app:session-main:articleDraft:article-1",
        markdown: [
          "# 标题",
          "",
          "## 核心观点",
          "核心观点段落",
          "",
          "![广州夏天午后街景](pending-image-task://task-inline-restored?status=running)",
          "<!-- lime:image-task-slot:article-image-slot-1 -->",
        ].join("\n"),
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
      imageWorkbenchState: {
        active: false,
        viewport: { x: 0, y: 0, scale: 1 },
        selectedTaskId: snapshot?.task.id ?? null,
        selectedOutputId: snapshot?.outputs[0]?.id ?? null,
        nextOutputIndex: 2,
        tasks: snapshot ? [snapshot.task] : [],
        outputs: snapshot?.outputs ?? [],
      },
    });

    expect(result?.consumedTaskIds).toEqual(["task-inline-restored"]);
    expect(result?.markdown).toContain(
      "![广州夏天午后街景](https://example.com/guangzhou-restored.png)",
    );
    expect(result?.markdown).not.toContain("pending-image-task://");
  });
});
