import { describe, expect, it, vi } from "vitest";
import type { CanvasWorkbenchDefaultPreview } from "./CanvasWorkbenchLayout";
import {
  clickByAriaLabel,
  createTaskFile,
  flushEffects,
  mount,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout coding mode", () => {
  it("coding 模式应固定为预览优先标签，并把文件标签收进文件区", async () => {
    const loadFilePreview = vi.fn(async (path: string) => ({
      path,
      content:
        path === "/workspace/README.md"
          ? "README 内容"
          : "<!doctype html><html><body><h1>更新后的页面</h1></body></html>",
      isBinary: false,
      size: 128,
      error: null,
    }));

    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [
        createTaskFile(
          "task-current",
          "index.html",
          "<!doctype html><html><body><h1>页面预览</h1></body></html>",
          30,
        ),
      ],
      selectedFileId: "task-current",
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "index.html",
        content: "<!doctype html><html><body><h1>页面预览</h1></body></html>",
        filePath: "index.html",
        absolutePath: "/workspace/index.html",
        previousContent:
          "<!doctype html><html><body><h1>上一版</h1></body></html>",
      } satisfies CanvasWorkbenchDefaultPreview,
      loadFilePreview,
      onOpenPath: vi.fn(async () => undefined),
      onRevealPath: vi.fn(async () => undefined),
      renderPreview: (target) => (
        <div data-testid="preview-panel">
          {target.kind}:{target.title}
        </div>
      ),
      workbenchMode: "coding",
      outputView: {
        tabBadge: "1",
        leadContent: (
          <div data-testid="output-lead-probe">失败输出修复入口</div>
        ),
        renderPanel: () => <div data-testid="output-view">输出摘要</div>,
      },
      logView: {
        tabBadge: "运行中",
        renderPanel: () => <div data-testid="log-view">运行日志</div>,
      },
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-preview"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("default-canvas:index.html");
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-preview-toolbar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-preview-toolbar"]',
      )?.className,
    ).not.toContain("rounded-[14px]");
    expect(
      container.querySelector('[data-testid="canvas-workbench-preview-region"]')
        ?.className,
    ).not.toContain("rounded-[14px]");
    expect(container.textContent).toContain("静态 HTML");
    expect(container.textContent).toContain("index.html");
    expect(container.querySelector('button[aria-label="后退"]')).toBeNull();
    expect(container.querySelector('button[aria-label="前进"]')).toBeNull();
    clickByAriaLabel(container, "全屏预览");
    await flushEffects();
    expect(
      container
        .querySelector('[data-testid="canvas-workbench-panel-preview"]')
        ?.getAttribute("data-preview-fullscreen"),
    ).toBe("true");
    clickByAriaLabel(container, "退出全屏");
    await flushEffects();
    expect(
      container
        .querySelector('[data-testid="canvas-workbench-panel-preview"]')
        ?.getAttribute("data-preview-fullscreen"),
    ).toBe("false");
    expect(
      container.querySelector(
        'button[aria-label="切换画布标签-预览 · index.html"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-文件"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-变更"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-输出"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-日志"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-index.html"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-结果"]'),
    ).toBeNull();

    clickByAriaLabel(container, "切换画布标签-变更");
    await flushEffects();
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-changes"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("当前文件变更");

    clickByAriaLabel(container, "切换画布标签-输出");
    await flushEffects();
    expect(
      container.querySelector('[data-testid="output-view"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="output-lead-probe"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "切换画布标签-日志");
    await flushEffects();
    expect(container.querySelector('[data-testid="log-view"]')).not.toBeNull();

    clickByAriaLabel(container, "切换画布标签-文件");
    await flushEffects();
    clickByAriaLabel(container, "选择工作区文件-README.md");
    await flushEffects();

    expect(loadFilePreview).toHaveBeenCalledWith("/workspace/README.md");
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-preview"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("default-canvas:README.md");
    expect(
      container.querySelector('button[aria-label="切换画布标签-README.md"]'),
    ).toBeNull();
  });

  it("coding 模式的变更标签应展示本轮多文件变更队列", async () => {
    const openChangedFile = vi.fn(async () => undefined);
    const container = mount({
      artifacts: [],
      canvasState: null,
      taskFiles: [
        createTaskFile(
          "task-current",
          "index.html",
          "<!doctype html><html><body><h1>更新后的页面</h1></body></html>",
          30,
        ),
      ],
      selectedFileId: "task-current",
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "task:task-current",
        title: "index.html",
        content:
          "<!doctype html><html><body><h1>更新后的页面</h1></body></html>",
        filePath: "index.html",
        absolutePath: "/workspace/index.html",
        previousContent:
          "<!doctype html><html><body><h1>上一版</h1></body></html>",
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
      workbenchMode: "coding",
      changeView: {
        checkpointCount: 2,
        latestCheckpointPath: ".lime/artifacts/thread-1/index.v2.html",
        onOpenFile: openChangedFile,
        items: [
          {
            id: "change-index",
            path: "index.html",
            absolutePath: "/workspace/index.html",
            displayName: "index.html",
            source: "runtime",
            status: "completed",
            preview: "<h1>更新后的页面</h1>",
          },
          {
            id: "change-app",
            path: "src/App.tsx",
            absolutePath: "/workspace/src/App.tsx",
            displayName: "App.tsx",
            source: "runtime",
            status: "in_progress",
            preview: "export function App() {}",
          },
        ],
      },
    });

    await flushEffects();

    const changesTab = container.querySelector(
      'button[aria-label="切换画布标签-变更"]',
    );
    expect(changesTab?.textContent).toContain("2");

    clickByAriaLabel(container, "切换画布标签-变更");
    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-changes"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("本轮文件变更");
    expect(container.textContent).toContain("2 个文件，1 个仍在写入");
    expect(container.textContent).toContain("index.html");
    expect(container.textContent).toContain("src/App.tsx");
    expect(container.textContent).toContain("快照 2");
    expect(container.textContent).toContain("已写入");
    expect(container.textContent).toContain("写入中");
    expect(container.textContent).toContain("当前文件");
    expect(container.textContent).toContain("变更");
    expect(container.textContent).toContain("来源：runtime");

    const changeItems = container.querySelectorAll(
      '[data-testid="canvas-workbench-change-item"]',
    );
    expect(changeItems).toHaveLength(2);
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-changes-checkpoints"]',
      ),
    ).not.toBeNull();
    (changeItems[1] as HTMLButtonElement).click();
    await flushEffects();
    expect(openChangedFile).toHaveBeenCalledWith("/workspace/src/App.tsx");
  });
});
