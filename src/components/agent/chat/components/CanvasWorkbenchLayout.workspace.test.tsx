import { describe, expect, it, vi } from "vitest";
import {
  clickByAriaLabel,
  createArtifact,
  createTaskFile,
  flushEffects,
  mockListDirectory,
  mount,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout workspace tabs", () => {
  it("命中导出结果文件时应将文件树聚焦到当前结果目录", async () => {
    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey:
          "default-preview:exports/x-article-export/latest/index.md",
        title: "index.md",
        content: "# 导出结果\n\n这是正文。",
        filePath: "exports/x-article-export/latest/index.md",
        absolutePath: "/workspace/exports/x-article-export/latest/index.md",
        previousContent: null,
      },
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "# 文件内容",
        isBinary: false,
        size: 128,
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
    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();

    expect(mockListDirectory).toHaveBeenCalledWith(
      "/workspace/exports/x-article-export/latest",
    );
    expect(container.textContent).toContain("结果目录");
    expect(container.textContent).toContain("exports/x-article-export/latest");

    const workspaceButtons = Array.from(
      container.querySelectorAll(
        '[data-testid="canvas-workbench-panel-workspace"] button[aria-label]',
      ),
    ).map((element) => element.getAttribute("aria-label"));

    expect(workspaceButtons).toContain("选择工作区文件-index.md");
    expect(workspaceButtons).toContain("选择工作区文件-Agents.md");
    expect(workspaceButtons).toContain("展开目录-skills");
    expect(workspaceButtons).toContain("展开目录-images");

    const indexButtonPosition =
      workspaceButtons.indexOf("选择工作区文件-index.md");
    const agentsButtonPosition =
      workspaceButtons.indexOf("选择工作区文件-Agents.md");
    const manifestButtonPosition = workspaceButtons.indexOf(
      "选择工作区文件-manifest.json",
    );

    expect(indexButtonPosition).toBeGreaterThanOrEqual(0);
    expect(agentsButtonPosition).toBeGreaterThan(indexButtonPosition);
    expect(manifestButtonPosition).toBeGreaterThan(agentsButtonPosition);
  });

  it("workspaceView 存在时，应优先使用运行时注入的头部语义", async () => {
    const container = mount({
      artifacts: [createArtifact("artifact-1", "draft.md", "标题\n内容", 20)],
      canvasState: null,
      taskFiles: [createTaskFile("task-1", "notes.md", "# notes", 30)],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
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
      workspaceView: {
        eyebrow: "Runtime Workspace",
        tabLabel: "项目文件",
        tabBadge: "已连接",
        tabBadgeTone: "sky",
        title: "工作区文件",
        subtitle: "运行时已经为 workspace 汇总了目录语义。",
        panelCopy: {
          emptyText: "工作区空态来自运行时。",
          unavailableText: "工作区不可用提示来自运行时。",
          sectionEyebrow: "运行时目录",
          loadingText: "目录加载文案来自运行时。",
          emptyDirectoryText: "目录空态来自运行时。",
        },
        badges: [
          {
            key: "workspace-runtime",
            label: "已连接",
            tone: "accent",
          },
        ],
        summaryStats: [
          {
            key: "workspace-runtime-stat",
            label: "目录状态",
            value: "运行时注入",
            detail: "workspace 头部信息不再由布局壳推断。",
            tone: "success",
          },
        ],
      },
    });

    await flushEffects();

    expect(
      container.querySelector('button[aria-label="切换画布标签-项目文件"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "切换画布标签-项目文件");
    await flushEffects();

    expect(container.textContent).toContain("运行时目录");
  });

  it("workspaceView 的 panelCopy 应覆盖空态与不可用提示", async () => {
    const unavailableContainer = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: true,
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
      renderPreview: (target) => <div>{target.title}</div>,
      workspaceView: {
        panelCopy: {
          unavailableText: "工作区不可用提示来自运行时。",
        },
      },
    });

    await flushEffects();

    clickByAriaLabel(unavailableContainer, "切换画布标签-文件");
    await flushEffects();
    expect(unavailableContainer.textContent).toContain(
      "工作区不可用提示来自运行时。",
    );

    const emptyWorkspaceContainer = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: null,
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
      renderPreview: (target) => <div>{target.title}</div>,
      workspaceView: {
        panelCopy: {
          emptyText: "工作区空态来自运行时。",
        },
      },
    });

    await flushEffects();

    clickByAriaLabel(emptyWorkspaceContainer, "切换画布标签-文件");
    await flushEffects();
    expect(emptyWorkspaceContainer.textContent).toContain(
      "工作区空态来自运行时。",
    );
  });

  it("工作区文件为二进制时应在文件标签内显示 unsupported 目标", async () => {
    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: null,
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: null,
        isBinary: true,
        size: 2048,
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

    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();
    clickByAriaLabel(container, "展开目录-src");
    await flushEffects();
    clickByAriaLabel(container, "选择工作区文件-binary.dat");
    await flushEffects();

    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("unsupported:binary.dat");
  });

  it("重新展开结果目录下的 images 时应刷新目录子项，避免沿用空缓存", async () => {
    let imageListingRequestCount = 0;
    mockListDirectory.mockImplementation(async (path: string) => {
      if (path === "/workspace/exports/x-article-export/latest") {
        return {
          path,
          parentPath: "/workspace/exports/x-article-export",
          error: null,
          entries: [
            {
              name: "images",
              path: "/workspace/exports/x-article-export/latest/images",
              isDir: true,
              size: 0,
              modifiedAt: 100,
            },
            {
              name: "index.md",
              path: "/workspace/exports/x-article-export/latest/index.md",
              isDir: false,
              size: 2048,
              modifiedAt: 100,
            },
          ],
        };
      }

      if (path === "/workspace/exports/x-article-export/latest/images") {
        imageListingRequestCount += 1;
        return {
          path,
          parentPath: "/workspace/exports/x-article-export/latest",
          error: null,
          entries:
            imageListingRequestCount === 1
              ? []
              : [
                  {
                    name: "image-1.jpg",
                    path: `${path}/image-1.jpg`,
                    isDir: false,
                    size: 1024,
                    modifiedAt: 100,
                  },
                  {
                    name: "image-2.jpg",
                    path: `${path}/image-2.jpg`,
                    isDir: false,
                    size: 2048,
                    modifiedAt: 100,
                  },
                ],
        };
      }

      return {
        path,
        parentPath: "/workspace",
        error: null,
        entries: [],
      };
    });

    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey:
          "default-preview:exports/x-article-export/latest/index.md",
        title: "index.md",
        content: "# 导出结果\n\n这是正文。",
        filePath: "exports/x-article-export/latest/index.md",
        absolutePath: "/workspace/exports/x-article-export/latest/index.md",
        previousContent: null,
      },
      loadFilePreview: vi.fn(async (path: string) => ({
        path,
        content: "# 文件内容",
        isBinary: false,
        size: 128,
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
    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();

    clickByAriaLabel(container, "展开目录-images");
    await flushEffects();
    expect(container.textContent).not.toContain("image-1.jpg");

    clickByAriaLabel(container, "折叠目录-images");
    await flushEffects();
    clickByAriaLabel(container, "展开目录-images");
    await flushEffects();

    expect(mockListDirectory).toHaveBeenCalledWith(
      "/workspace/exports/x-article-export/latest/images",
    );
    expect(imageListingRequestCount).toBe(2);
    expect(container.textContent).toContain("image-1.jpg");
    expect(container.textContent).toContain("image-2.jpg");
  });
});
