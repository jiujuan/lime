import { describe, expect, it, vi } from "vitest";
import type { CanvasWorkbenchPreviewTarget } from "./CanvasWorkbenchLayout";
import {
  type CanvasWorkbenchLayoutProps,
  clickByAriaLabel,
  createArtifact,
  flushEffects,
  mount,
  mountHarness,
  resizeWorkbench,
} from "./CanvasWorkbenchLayout.testFixtures";

describe("CanvasWorkbenchLayout team view", () => {
  it("启用 teamView 且有任务进展时应默认落在 team 标签", async () => {
    const onClose = vi.fn();
    const renderPreview = vi.fn((target: CanvasWorkbenchPreviewTarget) => (
      <div data-testid="preview-panel">preview:{target.kind}</div>
    ));
    const renderTeamPanel = vi.fn(() => (
      <div data-testid="team-panel">team-panel</div>
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
      teamView: {
        enabled: true,
        title: "生成",
        preferActiveOnMount: true,
        subtitle: "任务进行时",
        badges: [
          {
            key: "team-runtime",
            label: "生成",
            tone: "accent",
          },
          {
            key: "team-trigger-state",
            label: "处理中",
            tone: "accent",
          },
        ],
        summaryStats: [
          {
            key: "team-status",
            label: "任务状态",
            value: "处理中",
            detail: "2 项处理中，1 项排队中。",
            tone: "accent",
          },
        ],
        renderPreview: () => <div>unused-team-preview</div>,
        renderPanel: renderTeamPanel,
      },
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-team"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="preview-panel"]')?.textContent,
    ).toContain("preview:team-workbench");
    expect(
      container.querySelector('[data-testid="team-panel"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-任务"]'),
    ).not.toBeNull();
    expect(renderPreview).toHaveBeenCalled();
    expect(renderTeamPanel).toHaveBeenCalled();

    await resizeWorkbench(820);
    await flushEffects();

    const headerRow = container.querySelector(
      '[data-testid="canvas-workbench-header-row"]',
    );
    expect(headerRow?.className).not.toContain("flex-col");
    expect(
      headerRow?.querySelector('button[aria-label="切换画布标签-任务"]'),
    ).not.toBeNull();
    expect(
      headerRow?.querySelector('button[aria-label="关闭画布工作台"]'),
    ).not.toBeNull();

    clickByAriaLabel(container, "关闭画布工作台");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("启用 teamView 但没有任务进展时应隐藏任务标签并默认落在文件标签", async () => {
    const renderPreview = vi.fn((target: CanvasWorkbenchPreviewTarget) => (
      <div data-testid="preview-panel">preview:{target.kind}</div>
    ));
    const renderTeamPanel = vi.fn(() => (
      <div data-testid="team-panel">team-panel</div>
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
      onClose: vi.fn(),
      renderPreview,
      teamView: {
        enabled: true,
        title: "生成",
        subtitle: "任务待机",
        renderPreview: () => <div>unused-team-preview</div>,
        renderPanel: renderTeamPanel,
      },
    });

    await flushEffects();

    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-workspace"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="canvas-workbench-panel-team"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="切换画布标签-任务"]'),
    ).toBeNull();
    expect(renderPreview).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "team-workbench" }),
    );
    expect(renderTeamPanel).not.toHaveBeenCalled();
  });

  it("teamView 的 autoFocusToken 变化时应切到 team 标签", async () => {
    const renderPreview = vi.fn((target: CanvasWorkbenchPreviewTarget) => (
      <div data-testid="preview-panel">preview:{target.kind}</div>
    ));

    const baseProps: CanvasWorkbenchLayoutProps = {
      artifacts: [
        createArtifact("artifact-1", "draft.md", "标题\n当前内容", 20),
      ],
      canvasState: null,
      taskFiles: [],
      workspaceRoot: "/workspace",
      workspaceUnavailable: false,
      defaultPreview: {
        selectionKey: "artifact:artifact-1",
        title: "draft.md",
        content: "标题\n当前内容",
        filePath: "draft.md",
        absolutePath: "/workspace/draft.md",
        previousContent: null,
      },
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
      teamView: {
        enabled: true,
        title: "生成",
        subtitle: "任务进行时",
        autoFocusToken: 1,
        renderPreview: () => <div>unused-team-preview</div>,
        renderPanel: () => <div data-testid="team-panel">team-panel</div>,
      },
    };

    const harness = mountHarness(baseProps);
    await flushEffects();

    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-panel-document"]',
      ),
    ).not.toBeNull();

    harness.rerender({
      ...baseProps,
      teamView: {
        ...baseProps.teamView!,
        autoFocusToken: 2,
      },
    });
    await flushEffects();

    expect(
      harness.container.querySelector(
        '[data-testid="canvas-workbench-panel-team"]',
      ),
    ).not.toBeNull();
    expect(
      harness.container.querySelector('[data-testid="team-panel"]'),
    ).not.toBeNull();
    expect(
      harness.container.querySelector('[data-testid="preview-panel"]')
        ?.textContent,
    ).toContain("preview:team-workbench");
  });
});
