import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceProductProfileSurface } from "./WorkspaceProductProfileSurface";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";

vi.mock("@/lib/api/fileSystem", () => ({
  resolveLocalFilePreviewUrl: (path?: string | null) =>
    path?.startsWith("/") ? `asset://${path}` : null,
}));

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
        "workspace.productProfile.actionHistory.result": "结果产物",
        "workspace.productProfile.actionHistory.resultEmpty": "暂无结果产物",
        "workspace.productProfile.actionHistory.resultCount": `${options?.title ?? ""} 等 ${options?.count ?? 0} 个产物`,
        "workspace.productProfile.actionHistory.error": "错误",
        "workspace.productProfile.actionHistory.status.completed": "已完成",
        "workspace.productProfile.workerEvidence.title": "运行记录",
        "workspace.productProfile.workerEvidence.count": `${options?.count ?? 0} 条记录`,
        "workspace.productProfile.workerEvidence.status": "状态",
        "workspace.productProfile.workerEvidence.task": "任务",
        "workspace.productProfile.workerEvidence.taskKind": "任务类型",
        "workspace.productProfile.workerEvidence.turn": "回合",
        "workspace.productProfile.workerEvidence.artifact": "产物",
        "workspace.productProfile.workerEvidence.event": "事件",
        "workspace.productProfile.workerEvidence.input": "输入",
        "workspace.productProfile.workerEvidence.output": "输出",
        "workspace.productProfile.workerEvidence.entrypoint": "入口",
        "workspace.productProfile.workerEvidence.outputObjectCount": `${options?.count ?? 0} 个对象`,
        "workspace.productProfile.workerEvidence.error": "错误",
        "workspace.productProfile.workerEvidence.failureCategory": "失败类型",
        "workspace.productProfile.workerEvidence.retry": "重试建议",
        "workspace.productProfile.workerEvidence.retryable.yes": "可重试",
        "workspace.productProfile.workerEvidence.retryable.no": "需处理后重试",
        "workspace.productProfile.workerEvidence.status.completed": "已完成",
        "workspace.productProfile.workerEvidence.status.failed": "失败",
        "workspace.productProfile.workerEvidence.status.unknown": "未知",
        "workspace.productProfile.surface.document": "文章画布",
        "workspace.productProfile.surface.imageGrid": "图片组",
        "workspace.productProfile.surface.storyboard": "视频分镜",
        "workspace.productProfile.surface.checklist": "交付检查清单",
        "workspace.productProfile.preview.document": "文档预览",
        "workspace.productProfile.preview.documentEmpty": "等待文档内容",
        "workspace.productProfile.preview.imageGrid": "图片组",
        "workspace.productProfile.preview.artifactCount": `${options?.count ?? 0} 个产物`,
        "workspace.productProfile.preview.storyboard": "视频分镜",
        "workspace.productProfile.preview.storyboardEmpty": "等待分镜内容",
        "workspace.productProfile.preview.checklist": "交付复核",
        "workspace.productProfile.preview.checklistEmpty": "等待复核结果",
        "workspace.productProfile.action.revise": "改写",
        "workspace.productProfile.action.regenerate": "重新生成",
        "workspace.productProfile.action.createVariant": "生成变体",
        "workspace.productProfile.action.applyToArticle": "应用到文章",
        "workspace.productProfile.action.exportMarkdown": "导出 Markdown",
        "workspace.productProfile.action.rewriteShot": "改写镜头",
        "workspace.productProfile.action.exportStoryboard": "导出分镜",
        "workspace.productProfile.action.approve": "通过",
        "workspace.productProfile.action.requestRevision": "要求修改",
        "workspace.productProfile.actionConfirm": `确认 ${options?.action ?? ""}`,
        "workspace.productProfile.actionConfirmAria": `确认执行 ${options?.action ?? ""}`,
        "workspace.productProfile.actionPrompt.revise": `请改写「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.regenerate": `请重新生成「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.createVariant": `请生成「${options?.objectTitle ?? ""}」变体`,
        "workspace.productProfile.actionPrompt.applyToArticle": `请应用「${options?.objectTitle ?? ""}」到文章`,
        "workspace.productProfile.actionPrompt.rewriteShot": `请改写「${options?.objectTitle ?? ""}」镜头`,
        "workspace.productProfile.actionPrompt.exportStoryboard": `请导出「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.approve": `请通过「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.actionPrompt.requestRevision": `请要求修改「${options?.objectTitle ?? ""}」`,
        "workspace.productProfile.status.ready": "已就绪",
        "workspace.productProfile.status.needsReview": "待复核",
        "workspace.productProfile.status.failed": "失败",
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
  objectCount: 4,
  workerEvidence: [
    {
      id: "evt-worker-failed:workerEvidence",
      status: "failed",
      source: "agent_app_task_worker",
      appId: "content-factory-app",
      taskId: "task-image-1",
      taskKind: "content.image.generate",
      turnId: "turn-action-2",
      eventType: "runtime.error",
      workerEntrypoint: "./runtime/content-factory-worker.mjs",
      inputSummary: "prompt=生成图片; inputKeys=topic",
      outputSummary: null,
      outputObjectCount: null,
      artifactRef: null,
      artifactKind: null,
      errorCode: "worker_invalid_json_output",
      errorMessage: "Agent App worker returned invalid JSON",
      failureCategory: "worker_output",
      retryable: false,
      retryAdvice: "inspect_worker_output",
      retryAttempt: 0,
      retryMaxAttempts: 0,
      updatedAt: "2026-06-24T00:00:02.000Z",
    },
    {
      id: "evt-worker-success:workerEvidence",
      status: "completed",
      source: "agent_app_task_worker",
      appId: "content-factory-app",
      taskId: "task-article-1",
      taskKind: "content.article.generate",
      turnId: "turn-action-1",
      eventType: "artifact.snapshot",
      workerEntrypoint: "./runtime/content-factory-worker.mjs",
      inputSummary: "prompt=生成文章; inputKeys=topic",
      outputSummary: "2 objects: 公众号文章草稿, 配图组",
      outputObjectCount: 2,
      artifactRef: "artifact-workspace-patch-1",
      artifactKind: "content_factory.workspace_patch",
      errorCode: null,
      errorMessage: null,
      failureCategory: null,
      retryable: null,
      retryAdvice: null,
      retryAttempt: null,
      retryMaxAttempts: null,
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
  ],
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
      resultArtifacts: [
        {
          artifactRef: "artifact-image-regenerated",
          artifactId: "artifact-document:image-regenerated",
          title: "重新生成配图",
          kind: "artifact_document",
          status: "ready",
        },
      ],
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
            localPath: "/tmp/lime-content-factory/image-2.png",
          },
        ],
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "videoStoryboard",
        id: "storyboard-1",
        sessionId: "session-main",
        artifactIds: ["artifact-video-storyboard"],
      },
      title: "视频分镜",
      status: "ready",
      summary: "3 镜头短视频分镜",
      source: {
        scenes: [
          {
            id: "shot-1",
            title: "厨房开场",
            description: "镜头推近产品",
            visualPrompt: "明亮厨房，自然光",
            duration: "3s",
          },
        ],
      },
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "deliveryChecklist",
        id: "delivery-checklist-1",
        sessionId: "session-main",
        artifactIds: ["artifact-delivery-checklist"],
      },
      title: "交付检查清单",
      status: "ready",
      summary: "发布前检查项",
      source: {
        items: [
          {
            id: "article",
            title: "文章已生成",
            status: "done",
          },
          {
            id: "image-license",
            title: "确认图片授权",
            notes: "发布前需复核",
            status: "todo",
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
    expect(container.textContent).toContain("重新生成配图");
    expect(container.textContent).toContain("运行记录");
    expect(container.textContent).toContain("2 条记录");
    expect(container.textContent).toContain("task-image-1");
    expect(container.textContent).toContain("content.image.generate");
    expect(container.textContent).toContain("runtime.error");
    expect(container.textContent).toContain("prompt=生成图片; inputKeys=topic");
    expect(container.textContent).toContain("./runtime/content-factory-worker.mjs");
    expect(container.textContent).toContain("worker_invalid_json_output");
    expect(container.textContent).toContain("失败类型");
    expect(container.textContent).toContain("worker_output");
    expect(container.textContent).toContain("重试建议");
    expect(container.textContent).toContain(
      "需处理后重试 · inspect_worker_output",
    );
    expect(container.textContent).toContain("主图候选");
    expect(container.textContent).toContain("中文内容工厂配图");
    expect(
      container.querySelector<HTMLImageElement>(
        'img[src="asset:///tmp/lime-content-factory/image-2.png"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("1 个来源产物");
  });

  it("写入动作应二次确认后再转换为 Claw 输入意图", () => {
    const onActionIntent = vi.fn();
    const container = renderSurface({ onActionIntent });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-action-regenerate"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(onActionIntent).not.toHaveBeenCalled();
    expect(button?.dataset.confirmationPending).toBe("true");
    expect(button?.textContent).toContain("确认 重新生成");

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

  it("只读动作应单击后直接转换为 Claw 输入意图", () => {
    const onActionIntent = vi.fn();
    const container = renderSurface({ onActionIntent });
    const articleRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-object-articleDraft"]',
    );
    act(() => {
      articleRow?.click();
    });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-action-export_markdown"]',
    );

    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });

    expect(button?.dataset.confirmationPending).toBe("false");
    expect(onActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ key: "export_markdown" }),
        object: expect.objectContaining({ title: "公众号文章草稿" }),
      }),
    );
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

  it("切换到分镜和清单时应渲染宿主内置预览", () => {
    const container = renderSurface();
    const storyboardRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-object-videoStoryboard"]',
    );
    act(() => {
      storyboardRow?.click();
    });

    expect(container.textContent).toContain("视频分镜");
    expect(container.textContent).toContain("厨房开场");
    expect(container.textContent).toContain("镜头推近产品");
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-storyboard-row"]',
      ),
    ).not.toBeNull();

    const checklistRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-product-profile-object-deliveryChecklist"]',
    );
    act(() => {
      checklistRow?.click();
    });

    expect(container.textContent).toContain("交付检查清单");
    expect(container.textContent).toContain("确认图片授权");
    expect(container.textContent).toContain("发布前需复核");
    expect(
      container.querySelector(
        '[data-testid="workspace-product-profile-checklist-item"]',
      ),
    ).not.toBeNull();
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
