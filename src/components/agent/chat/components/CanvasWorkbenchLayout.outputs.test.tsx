import { describe, expect, it, vi } from "vitest";
import {
  clickNewWorkbenchTool,
  clickWorkbenchTab,
  flushEffects,
  mount,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout outputs tab", () => {
  it("coding 模式从文件工具标签切回输出时，应保留输出面板", async () => {
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
      outputView: {
        title: "输出",
        renderPanel: () => (
          <div data-testid="coding-output-view">
            PASS coding-target.test.ts: codingWorkbenchSmoke is true
          </div>
        ),
      },
    });

    await flushEffects();

    clickNewWorkbenchTool(container, "文件");
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-project-files"]',
      ),
    ).not.toBeNull();

    clickWorkbenchTab(container, "输出");
    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-outputs"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="canvas-workbench-panel-project-files"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="coding-output-view"]')
        ?.textContent,
    ).toContain("PASS coding-target.test.ts");
  });
});
