import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";
import { buildWorkspaceProductProfileFromThreadRead } from "./workspaceProductProfileModel";
import {
  attachWorkspaceProductProfilePreviewArtifactToMessages,
  buildWorkspaceProductProfileFromMessageArtifacts,
} from "./workspaceProductProfileMessageArtifacts";
import { isWorkspaceProductProfilePreviewArtifact } from "./workspaceProductProfilePreviewArtifact";

vi.mock("@/lib/api/fileSystem", () => ({
  convertLocalFileSrc: (path: string) => `asset://${path}`,
  resolveLocalFilePreviewUrl: (path?: string | null) =>
    path?.startsWith("/") ? `asset://${path}` : null,
}));

const profile: WorkspaceProductProfile = {
  schemaVersion: "product-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 1,
  actionHistory: [],
  selectedObjectRef: {
    appId: "content-factory-app",
    kind: "articleDraft",
    id: "article-1",
    sessionId: "session-main",
  },
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
        version: "2",
        artifactIds: ["artifact-article-1"],
        sourceTurnId: "turn-article-1",
        sourceTaskId: "task-article-1",
      },
      title: "公众号文章草稿",
      status: "ready",
      source: {
        taskKind: "content.article.generate",
        taskId: "task-article-1",
        markdown: "# 公众号文章草稿\n\n这是正文。",
      },
    },
  ],
};

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? "assistant-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "已整理文章草稿。",
    timestamp: overrides.timestamp ?? new Date("2026-06-28T10:00:00.000Z"),
    ...overrides,
  };
}

describe("workspaceProductProfileMessageArtifacts", () => {
  it("应把 Product Profile preview artifact 挂到最后一条助手消息", () => {
    const messages = [
      createMessage({ id: "user-1", role: "user", content: "写文章" }),
      createMessage({ id: "assistant-1" }),
    ];

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile,
      now: 100,
    });

    expect(nextMessages).toHaveLength(2);
    expect(nextMessages[0]).toBe(messages[0]);
    expect(nextMessages[1]).not.toBe(messages[1]);
    expect(nextMessages[1]?.artifacts).toHaveLength(1);
    expect(nextMessages[1]?.artifacts?.[0]).toMatchObject({
      title: "公众号文章草稿",
      content: expect.stringContaining("这是正文"),
      status: "complete",
      meta: expect.objectContaining({
        openedFrom: "right_surface_product_profile",
        artifactKind: "report",
        productProfile: expect.objectContaining({
          appId: "content-factory-app",
          objectKind: "articleDraft",
          objectId: "article-1",
          surfaceKind: "document",
        }),
      }),
    });
    expect(
      isWorkspaceProductProfilePreviewArtifact(
        nextMessages[1]!.artifacts![0]!,
      ),
    ).toBe(true);
  });

  it("没有 Product Profile 时不改动消息引用", () => {
    const messages = [createMessage()];

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile: null,
      now: 100,
    });

    expect(nextMessages).toBe(messages);
  });

  it("重复投影同一个 Product Profile 时不重复插入小卡", () => {
    const firstMessages = attachWorkspaceProductProfilePreviewArtifactToMessages(
      {
        messages: [createMessage()],
        profile,
        now: 100,
      },
    );
    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages: firstMessages,
      profile,
      now: 200,
    });

    expect(nextMessages[0]?.artifacts).toHaveLength(1);
    expect(nextMessages[0]?.artifacts?.[0]?.updatedAt).toBe(200);
  });

  it("正在流式输出的助手消息不应被 Product Profile 小卡替换或追加", () => {
    const messages = [
      createMessage({ id: "user-1", role: "user", content: "继续写" }),
      createMessage({
        id: "assistant-streaming",
        content: "正在整理",
        isThinking: true,
        runtimeStatus: {
          phase: "preparing",
          title: "准备执行",
          detail: "正在连接运行时",
        },
      }),
    ];

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile,
      now: 100,
    });

    expect(nextMessages).toBe(messages);
    expect(nextMessages[1]?.artifacts).toBeUndefined();
  });

  it("没有助手消息时应补一条只包含小卡的助手消息", () => {
    const messages = [
      createMessage({ id: "user-1", role: "user", content: "写文章" }),
    ];

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile,
      now: 100,
    });

    expect(nextMessages).toHaveLength(2);
    expect(nextMessages[1]).toMatchObject({
      id: expect.stringMatching(/^product-profile-preview:/),
      role: "assistant",
      content: "",
      timestamp: new Date(100),
    });
    expect(nextMessages[1]?.artifacts).toHaveLength(1);
  });

  it("Product Profile 无可选对象时应 fail closed", () => {
    const invalidProfile: WorkspaceProductProfile = {
      ...profile,
      objectCount: 0,
      objects: [],
    };
    const messages = [createMessage()];

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile: invalidProfile,
      now: 100,
    });

    expect(nextMessages).toBe(messages);
  });

  it("应把 worker read model 中的文章 Markdown 投影成聊天小框", () => {
    const productProfile = buildWorkspaceProductProfileFromThreadRead({
      thread_id: "thread-main",
      product_workspace: {
        schemaVersion: "product-workspace.v1",
        appId: "content-factory-app",
        sessionId: "session-main",
        selectedObjectRef: {
          appId: "content-factory-app",
          kind: "articleDraft",
          id: "article-1",
          sessionId: "session-main",
        },
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
              taskKind: "content.article.generate",
              markdown:
                "# 公众号文章草稿\n\n点击小框后展开右侧 Product Profile，再继续处理配图。",
            },
          },
        ],
      },
    });
    expect(productProfile).not.toBeNull();

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages: [
        createMessage({ id: "user-1", role: "user", content: "@写文章 写一篇公众号文章" }),
        createMessage({ id: "assistant-1", content: "文章草稿已生成。" }),
      ],
      profile: productProfile,
      now: 100,
    });

    expect(nextMessages[1]?.artifacts?.[0]).toMatchObject({
      title: "公众号文章草稿",
      content: expect.stringContaining("点击小框后展开右侧 Product Profile"),
      meta: expect.objectContaining({
        openedFrom: "right_surface_product_profile",
        productProfile: expect.objectContaining({
          objectKind: "articleDraft",
          artifactIds: ["artifact-article-1"],
        }),
      }),
    });
  });

  it("应从消息 artifact 的内容工厂 workspace patch 生成 Product Profile 小框", () => {
    const messages = [
      createMessage({ id: "user-1", role: "user", content: "@写文章 写一篇公众号文章" }),
      createMessage({
        id: "assistant-1",
        content: "文章草稿已生成。",
        artifacts: [
          {
            id: "artifact-workspace-patch",
            type: "document",
            title: "Content Factory workspace patch",
            content: JSON.stringify({
              schemaVersion: "product-workspace.v1",
              appId: "content-factory-app",
              sessionId: "session-main",
              selectedObjectRef: {
                appId: "content-factory-app",
                kind: "articleDraft",
                id: "article-1",
                sessionId: "session-main",
              },
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
                  summary: "首版文章草稿已生成。",
                  source: {
                    taskKind: "content.article.generate",
                    markdown: "# 公众号文章草稿\n\n这是小框展开后的正文。",
                  },
                },
              ],
            }),
            status: "complete",
            meta: {
              artifactKind: "content_factory.workspace_patch",
            },
            position: { start: 0, end: 0 },
            createdAt: 100,
            updatedAt: 100,
          },
        ],
      }),
    ] satisfies Message[];

    const productProfile = buildWorkspaceProductProfileFromMessageArtifacts(messages);
    expect(productProfile).toMatchObject({
      appId: "content-factory-app",
      sessionId: "session-main",
      selectedObjectRef: {
        kind: "articleDraft",
        id: "article-1",
      },
    });

    const nextMessages = attachWorkspaceProductProfilePreviewArtifactToMessages({
      messages,
      profile: productProfile,
      now: 200,
    });

    expect(nextMessages[1]?.artifacts).toHaveLength(2);
    expect(nextMessages[1]?.artifacts?.[1]).toMatchObject({
      title: "公众号文章草稿",
      content: expect.stringContaining("这是小框展开后的正文"),
      meta: expect.objectContaining({
        openedFrom: "right_surface_product_profile",
        productProfile: expect.objectContaining({
          objectKind: "articleDraft",
          objectId: "article-1",
        }),
      }),
    });
  });
});
