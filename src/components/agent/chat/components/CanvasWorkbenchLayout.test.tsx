import { describe, expect, it, vi } from "vitest";
import type {
  CanvasWorkbenchDefaultPreview,
  CanvasWorkbenchPreviewTarget,
} from "./CanvasWorkbenchLayout";
import {
  MockArtifactDocumentPreview,
  type CanvasWorkbenchLayoutProps,
  clickByAriaLabel,
  createArtifact,
  createMockArtifactDocumentController,
  createTaskFile,
  flushEffects,
  mockListDirectory,
  mount,
  mountHarness,
  resizeWorkbench,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout", () => {
  it("应以顶部标签式画布承载 session、文件与结果文件标签", async () => {
    const onOpenPath = vi.fn(async () => undefined);
    const onRevealPath = vi.fn(async () => undefined);
    const loadFilePreview = vi.fn(async (path: string) => {
      if (path === "/workspace/README.md") {
        return {
          path,
          content: "README 内容",
          isBinary: false,
          size: 12,
          error: null,
        };
      }

      return {
        path,
        content: null,
        isBinary: true,
        size: 0,
        error: null,
      };
    });

    const container = mount({
      artifacts: [
        createArtifact("artifact-old", "draft.md", "标题\n上一版本", 10),
        createArtifact("artifact-new", "draft.md", "标题\n产物版本", 20),
      ],
      canvasState: null,
      taskFiles: [
        createTaskFile("task-current", "draft.md", "标题\n当前画布正文", 30),
      ],
      selectedFileId: "task-current",
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "draft.md",
        content: "标题\n当前画布正文",
        filePath: "draft.md",
        absolutePath: "/workspace/draft.md",
        previousContent: "标题\n上一版本",
      } satisfies CanvasWorkbenchDefaultPreview,
      loadFilePreview,
      onOpenPath,
      onRevealPath,
      workspaceView: {
        tabBadge: "当前项目",
      },
      renderPreview: (target) => (
        <div data-testid="preview-panel">
          {target.kind}:{target.title}
        </div>
      ),
    });

    await flushEffects();

    expect(mockListDirectory).toHaveBeenCalledWith("/workspace");
    expect(
      container
        .querySelector('[data-testid="canvas-workbench-shell"]')
        ?.getAttribute("data-layout-mode"),
    ).toBe("split");
    expect(
      container.querySelector('[data-testid="canvas-workbench-shell"]')
        ?.className,
    ).toContain("lime-workbench-theme-scope");
    expect(
      container.querySelector('[data-testid="canvas-workbench-shell"]')
        ?.className,
    ).toContain("lime-workbench-surface-scope");
    expect(
      container.querySelector('[data-testid="canvas-workbench-shell"]')
        ?.className,
    ).toContain("bg-[color:var(--lime-surface)]");
    expect(
      container.querySelector('button[aria-label="切换画布标签-结果"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-文件"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-outputs"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-draft.md"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('button[aria-label="切换画布标签-draft.md"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("default-canvas:draft.md");
    const documentPreviewRegion = container.querySelector(
      '[data-testid="canvas-workbench-preview-region"]',
    ) as HTMLElement | null;
    expect(documentPreviewRegion?.className).toContain("bg-white");
    expect(documentPreviewRegion?.className).not.toContain("rounded-[14px]");
    expect(documentPreviewRegion?.className).not.toContain("border");
    expect(
      container.querySelector('[data-testid="canvas-workbench-header-actions"]')
        ?.textContent ?? "",
    ).toBe("");

    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();

    const workspaceTab = container.querySelector(
      'button[aria-label="切换画布标签-文件"]',
    ) as HTMLButtonElement | null;
    expect(workspaceTab?.className).toContain("border-b-2");
    expect(workspaceTab?.className).not.toContain("rounded-[8px]");
    expect(workspaceTab?.textContent).toBe("文件");
    expect(container.textContent).toContain("名称");
    expect(container.textContent).toContain("修改日期");
    expect(container.textContent).toContain("大小");
    expect(container.textContent).not.toContain(".lime");
    expect(container.textContent).toContain("exports");
    expect(container.textContent).not.toContain("output_image.jpg");
    expect(container.textContent).not.toContain(".DS_Store");
    clickByAriaLabel(container, "选择工作区文件-README.md");
    await flushEffects();

    expect(loadFilePreview).toHaveBeenCalledWith("/workspace/README.md");
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("default-canvas:README.md");
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-header-actions"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-header-actions"]')
        ?.textContent ?? "",
    ).toBe("");
    expect(
      container.querySelector('button[aria-label="切换画布标签-README.md"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "复制路径");
    await flushEffects();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "/workspace/README.md",
    );

    clickByAriaLabel(container, "显示位置");
    await flushEffects();
    expect(onRevealPath).toHaveBeenCalledWith("/workspace/README.md");

    clickByAriaLabel(container, "打开");
    await flushEffects();
    expect(onOpenPath).toHaveBeenCalledWith("/workspace/README.md");

    clickByAriaLabel(container, "下载");
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    clickByAriaLabel(container, "关闭文件标签-README.md");
    await flushEffects();
    expect(
      container.querySelector('button[aria-label="切换画布标签-README.md"]'),
    ).toBeNull();
  });

  it("命中文档产物时应在文件标签内提供文稿 inspector", async () => {
    const controller = createMockArtifactDocumentController();

    const container = mount({
      artifacts: [controller.artifact],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: null,
        isBinary: true,
        size: 0,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview: (target, options) => (
        <MockArtifactDocumentPreview
          controller={controller}
          target={target}
          onArtifactDocumentControllerChange={
            options?.onArtifactDocumentControllerChange
          }
        />
      ),
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("artifact:board-review.artifact.json");
    expect(container.textContent).toContain("当前文稿");
    expect(container.textContent).toContain("董事会季度复盘");
    expect(container.textContent).toContain("需要优先补齐来源与版本线索。");
    expect(
      container.querySelector('button[aria-label="展开当前文稿检查器"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "展开当前文稿检查器");
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-document-inspector"]',
      ),
    ).not.toBeNull();
  });

  it("内容发布主链输出应直接打开真实文件标签，同时预览保留语义标题", async () => {
    const artifact = createArtifact(
      "artifact-content-preview",
      "content-posts/demo-preview.md",
      "# 春日咖啡活动\n\n首屏预览",
      60,
    );
    artifact.meta = {
      ...artifact.meta,
      contentPostIntent: "preview",
      contentPostLabel: "渠道预览稿",
      contentPostPlatformLabel: "小红书",
    };

    const container = mount({
      artifacts: [artifact],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: null,
        isBinary: true,
        size: 0,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview: (target) => (
        <div data-testid="preview-panel">
          {target.kind}:{target.title}
        </div>
      ),
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("artifact:渠道预览稿");
    expect(
      container.querySelector(
        'button[aria-label="切换画布标签-demo-preview.md"]',
      ),
    ).not.toBeNull();
  });

  it("sessionView 存在但没有默认主稿时，应回退渲染会话进展面板", async () => {
    const onClose = vi.fn();
    const renderPreview = vi.fn((target: CanvasWorkbenchPreviewTarget) => (
      <div data-testid="preview-panel">
        {target.kind}:{target.title}
      </div>
    ));
    const renderSessionPanel = vi.fn(() => (
      <div data-testid="session-view-panel">session-runtime-panel</div>
    ));

    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "",
        isBinary: false,
        size: 0,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      onClose,
      renderPreview,
      sessionView: {
        eyebrow: "Session Runtime",
        title: "执行过程",
        subtitle: "展示需要你处理的事项。",
        badges: [
          {
            key: "session-status",
            label: "执行中",
            tone: "accent",
          },
        ],
        renderPanel: renderSessionPanel,
      },
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-session"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="session-view-panel"]')
        ?.textContent,
    ).toContain("session-runtime-panel");
    expect(renderSessionPanel).toHaveBeenCalled();
    expect(renderPreview).not.toHaveBeenCalled();

    clickByAriaLabel(container, "关闭画布工作台");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sessionView 存在且有默认主稿时，应优先展示主稿预览", async () => {
    const renderSessionPanel = vi.fn(() => (
      <div data-testid="session-view-panel">session-runtime-panel</div>
    ));
    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [
        createTaskFile("task-current", "draft.md", "# 标题\n\n当前主稿", 30),
      ],
      selectedFileId: "task-current",
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "draft.md",
        content: "# 标题\n\n当前主稿",
        filePath: "draft.md",
        absolutePath: "/workspace/draft.md",
        previousContent: null,
      } satisfies CanvasWorkbenchDefaultPreview,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "",
        isBinary: false,
        size: 0,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview: (target) => (
        <div data-testid="preview-panel">
          {target.kind}:{target.title}
        </div>
      ),
      sessionView: {
        eyebrow: "Session Runtime",
        title: "任务进展",
        subtitle: "统一展示过程与主稿焦点。",
        badges: [
          {
            key: "session-status",
            label: "执行中",
            tone: "accent",
          },
          {
            key: "session-runtime-items",
            label: "轨迹 3",
            tone: "default",
          },
        ],
        renderPanel: renderSessionPanel,
      },
    });

    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-document"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-session"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("default-canvas:draft.md");
    expect(
      container.querySelector('[data-testid="session-view-panel"]'),
    ).toBeNull();
    expect(renderSessionPanel).not.toHaveBeenCalled();
  });

  it("sessionView 首次落在过程页时，后续出现真实主稿应自动切到文件标签", async () => {
    const renderSessionPanel = vi.fn(() => (
      <div data-testid="session-view-panel">session-runtime-panel</div>
    ));
    const renderPreview = vi.fn((target: CanvasWorkbenchPreviewTarget) => (
      <div data-testid="preview-panel">
        {target.kind}:{target.title}
      </div>
    ));

    const baseProps: CanvasWorkbenchLayoutProps = {
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "",
        isBinary: false,
        size: 0,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview,
      sessionView: {
        title: "任务进展",
        renderPanel: renderSessionPanel,
      },
    };

    const harness = mountHarness(baseProps);
    await flushEffects();

    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-panel-session"]',
      ),
    ).not.toBeNull();
    expect(
      harness.container.querySelector('[data-testid="session-view-panel"]'),
    ).not.toBeNull();

    harness.rerender({
      ...baseProps,
      taskFiles: [
        createTaskFile("task-current", "index.md", "# 标题\n\n当前主稿", 30),
      ],
      selectedFileId: "task-current",
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "index.md",
        content: "# 标题\n\n当前主稿",
        filePath: "index.md",
        absolutePath: "/workspace/index.md",
        previousContent: null,
      } satisfies CanvasWorkbenchDefaultPreview,
    });
    await flushEffects();

    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-panel-document"]',
      ),
    ).not.toBeNull();
    expect(
      harness.container.querySelector('[data-testid="session-view-panel"]'),
    ).toBeNull();
    expect(
      harness.container.querySelector('[data-testid="preview-panel"]')
        ?.textContent,
    ).toContain("default-canvas:index.md");
  });

  it("容器变窄时应继续保持顶部标签壳，但 data-layout-mode 切到 stacked", async () => {
    const container = mount({
      artifacts: [
        createArtifact("artifact-new", "draft.md", "标题\n产物版本", 20),
      ],
      canvasState: null,
      taskFiles: [
        createTaskFile("task-current", "draft.md", "标题\n当前画布正文", 30),
      ],
      selectedFileId: "task-current",
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "draft.md",
        content: "标题\n当前画布正文",
        filePath: "draft.md",
        absolutePath: "/workspace/draft.md",
        previousContent: "标题\n上一版本",
      } satisfies CanvasWorkbenchDefaultPreview,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "README 内容",
        isBinary: false,
        size: 12,
        error: null,
      })),
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview: (target) => (
        <div data-testid="preview-panel">
          {target.kind}:{target.title}
        </div>
      ),
    });

    await flushEffects();

    expect(
      container
        .querySelector('[data-testid="canvas-workbench-shell"]')
        ?.getAttribute("data-layout-mode"),
    ).toBe("split");

    await resizeWorkbench(820);
    await flushEffects();

    expect(
      container
        .querySelector('[data-testid="canvas-workbench-shell"]')
        ?.getAttribute("data-layout-mode"),
    ).toBe("stacked");
    expect(
      container.querySelector('button[aria-label="展开画布工作台"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-结果"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-workspace"]',
      ),
    ).not.toBeNull();
  });
});
