import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasWorkbenchDefaultPreview } from "./CanvasWorkbenchLayout";
import {
  type CanvasWorkbenchLayoutProps,
  clickByAriaLabel,
  clickNewWorkbenchTool,
  clickPreviewMode,
  createArtifact,
  createTaskFile,
  expectNewWorkbenchToolInMenu,
  expectWorkbenchTabNotInNewMenu,
  flushEffects,
  mockListDirectory,
  mount,
  mountHarness,
  resizeWorkbench,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout", () => {
  it("应以 Codex 风格顶部标签承载审查、文件与 Markdown/HTML/Code 模式", async () => {
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
      container.querySelector('[data-testid="canvas-workbench-shell"]')
        ?.className,
    ).not.toContain("rounded-[12px]");
    expect(
      container.querySelector('[data-testid="canvas-workbench-top-tabs-slot"]')
        ?.className,
    ).toContain("overflow-visible");
    expect(
      container.querySelector('button[aria-label="切换画布标签-审查"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-direct-tabs"] [aria-label="切换画布标签-文件"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-direct-tabs"] [aria-label="切换画布标签-Markdown"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-direct-tabs"] [aria-label="切换画布标签-HTML"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-direct-tabs"] [aria-label="切换画布标签-Code"]',
      ),
    ).toBeNull();
    expectNewWorkbenchToolInMenu(container, "终端");
    expectNewWorkbenchToolInMenu(container, "浏览器");
    expectNewWorkbenchToolInMenu(container, "文件");
    expectWorkbenchTabNotInNewMenu(container, "文件");
    expectWorkbenchTabNotInNewMenu(container, "Markdown");
    expectWorkbenchTabNotInNewMenu(container, "HTML");
    expectWorkbenchTabNotInNewMenu(container, "Code");
    expect(
      container.querySelector('button[aria-label="切换画布标签-draft.md"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-changes"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-changes-file-list"]',
      ),
    ).toBeNull();
    clickByAriaLabel(container, "显示文件");
    await flushEffects();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-changes-file-list"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-changes-files-resizer"]',
      ),
    ).not.toBeNull();
    clickByAriaLabel(container, "隐藏文件");
    await flushEffects();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-changes-file-list"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-header-actions"]')
        ?.textContent ?? "",
    ).toBe("");

    clickNewWorkbenchTool(container, "文件");
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-header-actions"]',
      ),
    ).toBeNull();
    const projectFilesTab = container.querySelector(
      '[data-testid="canvas-workbench-direct-tabs"] [aria-label="切换画布标签-打开文件"]',
    ) as HTMLButtonElement | null;
    const projectFilesTabFrame = projectFilesTab?.closest(
      '[data-canvas-tab-kind="project-files"]',
    );
    expect(projectFilesTabFrame?.className).toContain("rounded-[7px]");
    expect(projectFilesTabFrame?.className).toContain("bg-white");
    expect(projectFilesTab?.textContent).toBe("打开文件");
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
      container.querySelector(
        '[data-testid="canvas-workbench-markdown-preview"]',
      ),
    ).not.toBeNull();
    clickPreviewMode(container, "Code");
    await flushEffects();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-project-files"] [data-testid="canvas-workbench-code-preview"]',
      ),
    ).not.toBeNull();
    const documentPreviewRegion = container.querySelector(
      '[data-testid="canvas-workbench-preview-mode-panel"]',
    ) as HTMLElement | null;
    expect(documentPreviewRegion?.className).toContain("bg-white");
    expect(documentPreviewRegion?.className).not.toContain("rounded-[14px]");
    expect(documentPreviewRegion?.className).not.toContain("border");
    expect(container.textContent).toContain("README.md");
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
    ).toBeNull();

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
  });

  it("连续新增工具时应创建独立可关闭 tab，而不是替换同类 tab", async () => {
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
      workbenchMode: "coding",
    });

    await flushEffects();
    clickNewWorkbenchTool(container, "浏览器");
    await flushEffects();
    clickNewWorkbenchTool(container, "浏览器");
    await flushEffects();

    const browserTabs = container.querySelectorAll(
      '[data-testid="canvas-workbench-direct-tabs"] [data-canvas-tab-kind="browser"]',
    );
    expect(browserTabs).toHaveLength(2);
    expect(browserTabs[0]?.textContent).toContain("新选项卡");
    expect(browserTabs[1]?.textContent).toContain("新选项卡 2");

    const secondBrowserClose = container.querySelector(
      '[aria-label="关闭工作台标签-新选项卡 2"]',
    ) as HTMLButtonElement | null;
    expect(secondBrowserClose).not.toBeNull();
    act(() => {
      secondBrowserClose?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushEffects();

    expect(
      container.querySelectorAll(
        '[data-testid="canvas-workbench-direct-tabs"] [data-canvas-tab-kind="browser"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-browser"]'),
    ).not.toBeNull();
  });

  it("命中文档产物时应使用 Markdown 与 Code 模式预览，不再走旧文稿 inspector", async () => {
    const artifact = createArtifact(
      "artifact-doc",
      ".lime/artifacts/thread-1/board-review.artifact.json",
      "# 董事会季度复盘\n\n需要优先补齐来源与版本线索。",
      40,
    );
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
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-code-preview"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("董事会季度复盘");
    expect(container.textContent).toContain("需要优先补齐来源与版本线索。");
    expect(
      container.querySelector('button[aria-label="展开当前文稿检查器"]'),
    ).toBeNull();
    clickPreviewMode(container, "Code");
    await flushEffects();
    expect(
      container.querySelector('[data-testid="canvas-workbench-code-preview"]'),
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
    });

    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-markdown-preview"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).toContain("渠道预览稿");
    expect(
      container.querySelector(
        'button[aria-label="切换画布标签-demo-preview.md"]',
      ),
    ).toBeNull();
  });

  it("sessionView 存在但没有默认主稿时，应回退渲染会话进展面板", async () => {
    const onClose = vi.fn();
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
      container.querySelector('[data-testid="canvas-workbench-panel-outputs"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="session-view-panel"]')
        ?.textContent,
    ).toContain("session-runtime-panel");
    expect(renderSessionPanel).toHaveBeenCalled();

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
        '[data-testid="canvas-workbench-markdown-preview"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-outputs"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-preview-mode-panel"]',
      )?.textContent,
    ).toContain("draft.md");
    expect(
      container.querySelector('[data-testid="session-view-panel"]'),
    ).toBeNull();
    expect(renderSessionPanel).not.toHaveBeenCalled();
  });

  it("sessionView 首次落在过程页时，后续出现真实主稿应自动切到文件标签", async () => {
    const renderSessionPanel = vi.fn(() => (
      <div data-testid="session-view-panel">session-runtime-panel</div>
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
      sessionView: {
        title: "任务进展",
        renderPanel: renderSessionPanel,
      },
    };

    const harness = mountHarness(baseProps);
    await flushEffects();

    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-panel-outputs"]',
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
        '[data-testid="canvas-workbench-markdown-preview"]',
      ),
    ).not.toBeNull();
    expect(
      harness.container.querySelector('[data-testid="session-view-panel"]'),
    ).toBeNull();
    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-preview-mode-panel"]',
      )?.textContent,
    ).toContain("index.md");
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
      container.querySelector('button[aria-label="切换画布标签-审查"]'),
    ).not.toBeNull();

    clickNewWorkbenchTool(container, "文件");
    await flushEffects();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-project-files"]',
      ),
    ).not.toBeNull();
  });
});
