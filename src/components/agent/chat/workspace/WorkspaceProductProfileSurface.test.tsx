import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceProductProfileSurface } from "./WorkspaceProductProfileSurface";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const copy: Record<string, string> = {
        "workspace.productProfile.title": "产物 Profile",
        "workspace.productProfile.subtitle": `${options?.count ?? 0} 个业务产物`,
        "workspace.productProfile.selectedObject": "当前产物",
        "workspace.productProfile.app": "应用",
        "workspace.productProfile.session": "会话",
        "workspace.productProfile.workspace": "工作区",
        "workspace.productProfile.updatedAt": "更新",
        "workspace.productProfile.sourceArtifacts": `${options?.count ?? 0} 个来源产物`,
        "workspace.productProfile.openPreview": "打开预览",
        "workspace.productProfile.openPreviewAria": `打开「${options?.title ?? ""}」预览`,
        "workspace.productProfile.actionHistory.title": "操作历史",
        "workspace.productProfile.actionHistory.count": `${options?.count ?? 0} 次操作`,
        "workspace.productProfile.actionHistory.latest": "最近操作",
        "workspace.productProfile.actionHistory.status": "状态",
        "workspace.productProfile.actionHistory.turn": "回合",
        "workspace.productProfile.actionHistory.status.completed": "已完成",
        "workspace.productProfile.surface.document": "文章画布",
        "workspace.productProfile.surface.imageGrid": "图片组",
        "workspace.productProfile.preview.document": "文档预览",
        "workspace.productProfile.preview.documentEmpty": "等待文档内容",
        "workspace.productProfile.preview.imageGrid": "图片组",
        "workspace.productProfile.preview.artifactCount": `${options?.count ?? 0} 个产物`,
        "workspace.productProfile.action.revise": "改写",
        "workspace.productProfile.action.regenerate": "重新生成",
        "workspace.productProfile.action.createVariant": "生成变体",
        "workspace.productProfile.action.applyToArticle": "应用到文章",
        "workspace.productProfile.actionPrompt.revise": `请改写「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.regenerate": `请重新生成「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.createVariant": `请生成「${options?.objectTitle ?? ""}」变体`,
        "workspace.productProfile.actionPrompt.applyToArticle": `请应用「${options?.objectTitle ?? ""}」到文章`,
        "workspace.productProfile.status.ready": "已就绪",
        "workspace.productProfile.status.needsReview": "待复核",
      };
      return copy[key] ?? key;
    },
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const profile: WorkspaceProductProfile = {
  schemaVersion: "product-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 2,
  actionHistory: [
    {
      id: "turn-action-1:productProfileAction:regenerate",
      key: "regenerate",
      intent: "regenerate",
      risk: "write",
      status: "completed",
      turnStatus: "completed",
      turnId: "turn-action-1",
      sessionId: "session-main",
      threadId: "thread-main",
      appId: "content-factory-app",
      objectRef: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
      objectTitle: "配图组",
      objectStatus: "needs_review",
      taskKind: "content.image.generate",
      prompt: "请重新生成「配图组」",
      submittedAt: "2026-06-24T00:00:00.000Z",
      completedAt: "2026-06-24T00:00:01.000Z",
    },
  ],
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
      },
      title: "公众号文章草稿",
      status: "ready",
      summary: "已生成首版文章",
      source: {
        markdown: "# 公众号文章草稿\n\n这是可预览的文章正文。",
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
        artifactIds: ["artifact-image-1", "artifact-image-2"],
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
            prompt: "中文内容工厂配图",
          },
          {
            id: "artifact-image-2",
            title: "副图候选",
            url: "https://lime.local/image-2.png",
          },
        ],
      },
    },
  ],
  sourceArtifacts: [{ artifactRef: "artifact-workspace-patch-1" }],
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
  onOpenPreviewArtifact = vi.fn(),
  onSelectedObjectChange,
}: {
  actionsDisabled?: boolean;
  onActionIntent?: React.ComponentProps<
    typeof WorkspaceProductProfileSurface
  >["onActionIntent"];
  onOpenPreviewArtifact?: React.ComponentProps<
    typeof WorkspaceProductProfileSurface
  >["onOpenPreviewArtifact"];
  onSelectedObjectChange?: React.ComponentProps<
    typeof WorkspaceProductProfileSurface
  >["onSelectedObjectChange"];
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkspaceProductProfileSurface
        actionsDisabled={actionsDisabled}
        profile={profile}
        onActionIntent={onActionIntent}
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

describe("WorkspaceProductProfileSurface", () => {
  it("应渲染 Product Profile 的当前对象、对象列表和来源产物计数", () => {
    const container = renderSurface();

    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-surface"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("产物 Profile");
    expect(container.textContent).toContain("配图组");
    expect(container.textContent).toContain("公众号文章草稿");
    expect(container.textContent).toContain("待复核");
    expect(container.textContent).toContain("图片组");
    expect(container.textContent).toContain("操作历史");
    expect(container.textContent).toContain("重新生成");
    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("turn-action-1");
    expect(container.textContent).toContain("主图候选");
    expect(container.textContent).toContain("中文内容工厂配图");
    expect(container.textContent).toContain("1 个来源产物");
  });

  it("应把对象动作转换为 Claw 输入意图", () => {
    const onActionIntent = vi.fn();
    const container = renderSurface({ onActionIntent });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-action-regenerate"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });

    expect(onActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ key: "regenerate" }),
        object: expect.objectContaining({ title: "配图组" }),
        prompt: "请重新生成「配图组」",
      }),
    );
  });

  it("应把当前对象打开为正式预览产物", () => {
    const onOpenPreviewArtifact = vi.fn();
    const container = renderSurface({ onOpenPreviewArtifact });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-open-preview"]',
    );

    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("打开预览");
    act(() => {
      button?.click();
    });

    expect(onOpenPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "主图候选",
        content: "https://lime.local/image-1.png",
        meta: expect.objectContaining({
          previewArtifact: true,
          source: "artifact",
          contentKind: "image",
          renderMode: "media",
          openedFrom: "right_surface_product_profile",
        }),
      }),
    );
  });

  it("Claw 正在发送时应禁用 Product Profile 动作", () => {
    const container = renderSurface({ actionsDisabled: true });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-action-regenerate"]',
    );

    expect(button?.disabled).toBe(true);
  });

  it("点击对象列表应在右侧 Profile 内切换当前产物并上抛选择变化", () => {
    const onSelectedObjectChange = vi.fn();
    const container = renderSurface({ onSelectedObjectChange });
    const articleRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-object-articleDraft"]',
    );

    expect(articleRow).not.toBeNull();
    act(() => {
      articleRow?.click();
    });

    expect(container.textContent).toContain("文章画布");
    expect(container.textContent).toContain("这是可预览的文章正文");
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-document-preview"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-action-revise"]',
      ),
    ).not.toBeNull();
    expect(onSelectedObjectChange).toHaveBeenCalledWith({
      profile,
      object: expect.objectContaining({
        title: "公众号文章草稿",
      }),
    });
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-action-regenerate"]',
      ),
    ).toBeNull();
  });

  it("重新挂载时应恢复最近选择的产物", () => {
    let container = renderSurface();
    const articleRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-object-articleDraft"]',
    );
    act(() => {
      articleRow?.click();
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

    expect(container.textContent).toContain("文章画布");
    expect(container.textContent).toContain("这是可预览的文章正文");
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-action-revise"]',
      ),
    ).not.toBeNull();
  });
});
