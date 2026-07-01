import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceArticleEditorRightSurface } from "./WorkspaceArticleEditorRightSurface";
import type { WorkspaceArticleWorkspace } from "./workspaceArticleWorkspaceModel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const copy: Record<string, string> = {
        "workspace.articleWorkspace.action.revise": "改写",
        "workspace.articleWorkspace.action.generateImages": "生成配图",
        "workspace.articleWorkspace.action.exportMarkdown": "导出 Markdown",
        "workspace.articleWorkspace.actionConfirm": `确认 ${options?.action ?? ""}`,
        "workspace.articleWorkspace.actionConfirmAria": `确认执行 ${options?.action ?? ""}`,
        "workspace.articleWorkspace.actionPrompt.revise": `请改写「${options?.objectTitle ?? ""}」并更新文章编辑器。`,
        "workspace.articleWorkspace.actionPrompt.generateImages": `请基于「${options?.objectTitle ?? ""}」生成配图并更新文章编辑器。`,
        "workspace.articleWorkspace.actionPrompt.exportMarkdown": `请导出「${options?.objectTitle ?? ""}」Markdown。`,
        "workspace.articleWorkspace.status.ready": "已就绪",
        "workspace.articleWorkspace.status.needsReview": "待复核",
        "workspace.articleEditor.title": "文章编辑器",
        "workspace.articleEditor.subtitle": `${options?.count ?? 0} 个来源产物`,
        "workspace.articleEditor.openPreview": "打开预览",
        "workspace.articleEditor.updatedAt": `更新：${options?.value ?? ""}`,
        "workspace.articleEditor.stat.research": "检索",
        "workspace.articleEditor.stat.outline": "提纲",
        "workspace.articleEditor.stat.citations": "引用",
        "workspace.articleEditor.stat.images": "配图",
        "workspace.articleEditor.canvas.title": "正文画布",
        "workspace.articleEditor.canvas.detail": "可编辑草稿",
        "workspace.articleEditor.canvas.empty": "文章正文生成后会出现在这里。",
        "workspace.articleEditor.canvas.status.synced": "已载入产物正文",
        "workspace.articleEditor.canvas.status.edited":
          "已本地编辑，后续动作会带上当前正文",
        "workspace.articleEditor.outline.title": "文章结构",
        "workspace.articleEditor.outline.detail": `${options?.count ?? 0} 个小节`,
        "workspace.articleEditor.outline.empty": "等待结构规划。",
        "workspace.articleEditor.titleCandidates.title": "标题候选",
        "workspace.articleEditor.titleCandidates.detail": `${options?.count ?? 0} 个候选标题`,
        "workspace.articleEditor.titleCandidates.empty": "等待标题候选。",
        "workspace.articleEditor.titleCandidates.score": `评分 ${options?.value ?? ""}`,
        "workspace.articleEditor.takeaways.title": "关键观点",
        "workspace.articleEditor.takeaways.detail": `${options?.count ?? 0} 个观点`,
        "workspace.articleEditor.takeaways.empty": "等待关键观点。",
        "workspace.articleEditor.writingPlan.title": "写作计划",
        "workspace.articleEditor.writingPlan.detail": `${options?.count ?? 0} 个步骤`,
        "workspace.articleEditor.writingPlan.empty": "等待写作计划。",
        "workspace.articleEditor.writingPlan.done": "已完成",
        "workspace.articleEditor.writingPlan.pending": "待处理",
        "workspace.articleEditor.research.title": "资料检索",
        "workspace.articleEditor.research.detail": `${options?.count ?? 0} 轮检索`,
        "workspace.articleEditor.research.empty": "等待检索证据。",
        "workspace.articleEditor.citations.title": "引用来源",
        "workspace.articleEditor.citations.detail": `${options?.count ?? 0} 条引用`,
        "workspace.articleEditor.citations.empty": "等待引用来源。",
        "workspace.articleEditor.images.title": "配图规划",
        "workspace.articleEditor.images.detail": `${options?.count ?? 0} 个配图位`,
        "workspace.articleEditor.images.empty": "等待配图规划。",
        "workspace.articleEditor.review.title": "复核备注",
        "workspace.articleEditor.review.detail": `${options?.count ?? 0} 条备注`,
        "workspace.articleEditor.related.title": "关联产物",
        "workspace.articleEditor.related.detail": `${options?.count ?? 0} 个业务对象`,
        "workspace.articleEditor.toolbar.undo": "撤销",
        "workspace.articleEditor.toolbar.redo": "重做",
        "workspace.articleEditor.toolbar.bold": "加粗",
        "workspace.articleEditor.toolbar.italic": "斜体",
        "workspace.articleEditor.toolbar.heading1": "一级标题",
        "workspace.articleEditor.toolbar.heading2": "二级标题",
        "workspace.articleEditor.toolbar.bulletList": "无序列表",
        "workspace.articleEditor.toolbar.orderedList": "有序列表",
        "workspace.articleEditor.toolbar.blockquote": "引用",
      };
      return copy[key] ?? key;
    },
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const articleWorkspaceFixture: WorkspaceArticleWorkspace = {
  schemaVersion: "article-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 2,
  workerEvidence: [],
  actionHistory: [],
  selectedObjectRef: {
    appId: "content-factory-app",
    kind: "imageGenerationSet",
    id: "image-set-1",
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
      status: "ready",
      summary: "已生成首版文章",
      source: {
        markdown: "# 公众号文章草稿\n\n这是可编辑的文章正文。",
        researchRounds: [
          {
            id: "research-1",
            title: "检索行业背景",
            query: "AI Agent 写作工作流",
            status: "completed",
            summary: "整理内容工厂和子流程编排的行业背景。",
            citations: ["citation-1"],
          },
        ],
        titleCandidates: [
          {
            id: "title-1",
            title: "内容工厂不是聊天框",
            angle: "产品设计复盘",
            score: 0.92,
          },
        ],
        outline: [
          {
            id: "intro",
            title: "开场：为什么要把写作变成工作流",
            purpose: "解释用户目标",
            points: ["从搜索开始", "通过内容框沉淀产物"],
            evidenceIds: ["citation-1"],
          },
        ],
        keyTakeaways: ["写作应该经过检索、提纲、正文、配图和复核"],
        citations: [
          {
            id: "citation-1",
            title: "产品规划文档",
            sourceType: "internal",
            summary: "Writing 路线图要求内容框输出和右侧展开。",
            status: "selected",
          },
        ],
        imageSlots: [
          {
            id: "hero",
            title: "首图",
            sectionId: "intro",
            purpose: "解释内容工厂工作流",
            prompt: "桌面端内容工厂写作流程图，中文标签",
            status: "planned",
          },
        ],
        writingPlan: [
          {
            id: "plan-1",
            title: "先做资料检索",
            owner: "research-writer",
            skillRef: "article-research",
            output: "结构化资料卡",
            done: true,
          },
        ],
        reviewNotes: ["正文需要保留真实引用来源。"],
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
        artifactIds: ["artifact-image-1"],
      },
      title: "配图组",
      status: "needs_review",
      summary: "等待选择主图",
      source: {
        images: [
          {
            id: "artifact-image-1",
            title: "主图候选",
            url: "https://lime.local/image-1.png",
          },
        ],
      },
    },
  ],
  sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
  updatedAt: "2026-06-24T00:00:00.000Z",
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

function renderSurface({
  actionsDisabled = false,
  onActionIntent = vi.fn(),
  onArticleMarkdownChange,
  onOpenPreviewArtifact = vi.fn(),
  onSelectedObjectChange,
  surfaceArticleWorkspace = articleWorkspaceFixture,
}: {
  actionsDisabled?: boolean;
  onActionIntent?: React.ComponentProps<
    typeof WorkspaceArticleEditorRightSurface
  >["onActionIntent"];
  onArticleMarkdownChange?: React.ComponentProps<
    typeof WorkspaceArticleEditorRightSurface
  >["onArticleMarkdownChange"];
  onOpenPreviewArtifact?: React.ComponentProps<
    typeof WorkspaceArticleEditorRightSurface
  >["onOpenPreviewArtifact"];
  onSelectedObjectChange?: React.ComponentProps<
    typeof WorkspaceArticleEditorRightSurface
  >["onSelectedObjectChange"];
  surfaceArticleWorkspace?: WorkspaceArticleWorkspace;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkspaceArticleEditorRightSurface
        actionsDisabled={actionsDisabled}
        articleWorkspace={surfaceArticleWorkspace}
        onActionIntent={onActionIntent}
        onArticleMarkdownChange={onArticleMarkdownChange}
        onOpenPreviewArtifact={onOpenPreviewArtifact}
        onSelectedObjectChange={onSelectedObjectChange}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("WorkspaceArticleEditorRightSurface", () => {
  it("Article Workspace surface 应直接进入 Article Editor", () => {
    const container = renderSurface();

    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-surface"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-article-workspace-surface"]',
      ),
    ).toBeNull();
    expect(container.textContent).toContain("文章编辑器");
    expect(container.textContent).toContain("公众号文章草稿");
    expect(container.textContent).toContain("正文画布");
    expect(container.textContent).toContain("已载入产物正文");
    expect(container.textContent).toContain("这是可编辑的文章正文");
    expect(container.textContent).toContain("文章结构");
    expect(container.textContent).toContain("检索行业背景");
    expect(container.textContent).toContain("内容工厂不是聊天框");
    expect(container.textContent).toContain(
      "写作应该经过检索、提纲、正文、配图和复核",
    );
    expect(container.textContent).toContain("产品规划文档");
    expect(container.textContent).toContain(
      "桌面端内容工厂写作流程图，中文标签",
    );
    expect(container.textContent).toContain("先做资料检索");
    expect(container.textContent).toContain("正文需要保留真实引用来源。");
  });

  it("即使历史选择是图片组，也应默认回到文章编辑器主稿", () => {
    const container = renderSurface();

    expect(container.textContent).toContain("公众号文章草稿");
    expect(container.textContent).not.toContain("等待选择主图");
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-workbench"]',
      ),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="workspace-article-editor-surface"]')
        ?.getAttribute("data-compact-layout"),
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="workspace-article-editor-stats"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("2 个来源产物");
    expect(container.textContent).not.toContain("2026-06-24T00:00:00.000Z");
    expect(container.textContent).toContain("更新：06/24");
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-main-canvas"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-side-panel"]',
      ),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="workspace-article-editor-surface"]')
        ?.getAttribute("data-layout"),
    ).toBe("responsive");
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-action-revise"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-article-workspace-action-regenerate"]',
      ),
    ).toBeNull();
  });

  it("多个文章草稿并存时，右侧编辑器应默认打开多轮检索最终稿", () => {
    const oldArticle = articleWorkspaceFixture.objects[0];
    const finalArticleWorkspace: WorkspaceArticleWorkspace = {
      ...articleWorkspaceFixture,
      selectedObjectRef: oldArticle.ref,
      primaryObjectRef: oldArticle.ref,
      objects: [
        ...articleWorkspaceFixture.objects,
        {
          ref: {
            appId: "content-factory-app",
            kind: "articleDraft",
            id: "article-final",
            sessionId: "session-main",
            version: "v3",
            artifactIds: ["artifact-article-final"],
            sourceTaskId: "content-factory-worker-task",
          },
          title: "多轮检索后的公众号文章草稿",
          status: "needs_review",
          summary: "已完成 3 轮资料检索、3 个配图位和完整正文。",
          previewArtifactId: "artifact-article-final",
          source: {
            taskKind: "content.article.generate",
            taskId: "content-factory-worker-task",
            markdown: [
              "# 多轮检索后的公众号文章草稿",
              "",
              "## 三轮资料检索",
              "",
              "- 第一轮：确认用户目标。",
              "- 第二轮：整理场景痛点。",
              "- 第三轮：收敛结构和发布检查。",
              "",
              "## 正文草稿",
              "",
              "这是经过多轮检索后写出的完整正文。",
            ].join("\n"),
            researchRounds: [
              { id: "research-1", title: "确认用户目标" },
              { id: "research-2", title: "整理场景痛点" },
              { id: "research-3", title: "收敛结构" },
            ],
            titleCandidates: [
              { id: "title-1", title: "内容工厂不是聊天框" },
              { id: "title-2", title: "写作应该先搜索再成文" },
            ],
            outline: [
              { id: "intro", title: "开场", points: [], evidenceIds: [] },
              { id: "research", title: "检索", points: [], evidenceIds: [] },
              { id: "draft", title: "正文", points: [], evidenceIds: [] },
            ],
            keyTakeaways: ["先搜索再写作", "产物框承载完整正文"],
            citations: [
              { id: "citation-1", title: "用户反馈" },
              { id: "citation-2", title: "Writing 路线图" },
            ],
            imageSlots: [
              { id: "hero", title: "首图" },
              { id: "workflow", title: "流程图" },
              { id: "canvas", title: "画布图" },
            ],
            writingPlan: [
              { id: "plan-1", title: "资料检索", done: true },
              { id: "plan-2", title: "正文写作", done: true },
            ],
            reviewNotes: ["引用和配图位需要人工复核。"],
          },
        },
      ],
      objectCount: 3,
    };

    const container = renderSurface({
      surfaceArticleWorkspace: finalArticleWorkspace,
    });

    expect(container.textContent).toContain("多轮检索后的公众号文章草稿");
    expect(container.textContent).toContain("这是经过多轮检索后写出的完整正文");
    expect(container.textContent).toContain("确认用户目标");
    expect(container.textContent).toContain("流程图");
    expect(container.textContent).not.toContain("这是可编辑的文章正文");
  });

  it("写入动作应二次确认后再转换为 Claw 输入意图", () => {
    const onActionIntent = vi.fn();
    const container = renderSurface({ onActionIntent });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-action-revise"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(onActionIntent).not.toHaveBeenCalled();
    expect(button?.dataset.confirmationPending).toBe("true");
    expect(button?.textContent).toContain("确认 改写");

    act(() => {
      button?.click();
    });

    expect(onActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ key: "revise" }),
        editedMarkdown: expect.stringContaining("这是可编辑的文章正文"),
        object: expect.objectContaining({ title: "公众号文章草稿" }),
        prompt: "请改写「公众号文章草稿」并更新文章编辑器。",
      }),
    );
  });

  it("只读动作应单击后直接转换为 Claw 输入意图", () => {
    const onActionIntent = vi.fn();
    const container = renderSurface({ onActionIntent });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-action-export_markdown"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });

    expect(button?.dataset.confirmationPending).toBe("false");
    expect(onActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ key: "export_markdown" }),
        editedMarkdown: expect.stringContaining("这是可编辑的文章正文"),
        object: expect.objectContaining({ title: "公众号文章草稿" }),
        prompt: "请导出「公众号文章草稿」Markdown。",
      }),
    );
  });

  it("应把文章草稿打开为正式预览产物", () => {
    const onOpenPreviewArtifact = vi.fn();
    const container = renderSurface({ onOpenPreviewArtifact });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-open-preview"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });

    expect(onOpenPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "公众号文章草稿",
        content: expect.stringContaining("这是可编辑的文章正文"),
        meta: expect.objectContaining({
          previewArtifact: true,
          openedFrom: "right_surface_article_workspace",
        }),
      }),
    );
  });

  it("Claw 正在发送时应禁用 Article Editor 动作", () => {
    const container = renderSurface({ actionsDisabled: true });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-action-revise"]',
    );

    expect(button?.disabled).toBe(true);
  });

  it("点击关联对象只在 Article Editor 内切换，不离开文章编辑器", () => {
    const onSelectedObjectChange = vi.fn();
    const container = renderSurface({ onSelectedObjectChange });
    const imageRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-related-imageGenerationSet"]',
    );

    expect(imageRow).not.toBeNull();
    act(() => {
      imageRow?.click();
    });

    expect(container.textContent).toContain("公众号文章草稿");
    expect(container.textContent).toContain("配图组");
    expect(container.textContent).toContain("正文画布");
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-surface"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-article-workspace-surface"]',
      ),
    ).toBeNull();
    expect(onSelectedObjectChange).toHaveBeenCalledWith({
      articleWorkspace: expect.objectContaining({
        appId: "content-factory-app",
        schemaVersion: "article-workspace.v1",
      }),
      object: expect.objectContaining({
        title: "配图组",
      }),
    });
  });

  it("重新挂载时应恢复最近选择，但仍只渲染 Article Editor", () => {
    let container = renderSurface();
    const imageRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-article-editor-related-imageGenerationSet"]',
    );
    act(() => {
      imageRow?.click();
    });

    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }

    container = renderSurface();

    expect(container.textContent).toContain("配图组");
    expect(
      container.querySelector(
        '[data-testid="workspace-article-editor-surface"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-article-workspace-surface"]',
      ),
    ).toBeNull();
  });
});
