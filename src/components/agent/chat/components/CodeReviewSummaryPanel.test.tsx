import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { CodeReviewSummaryPanel } from "./CodeReviewSummaryPanel";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createEmptyHarnessState(): ComponentProps<
  typeof CodeReviewSummaryPanel
>["harnessState"] {
  return {
    runtimeStatus: null,
    pendingApprovals: [],
    latestContextTrace: [],
    plan: {
      phase: "idle",
      items: [],
    },
    activity: {
      planning: 0,
      filesystem: 0,
      execution: 0,
      web: 0,
      skills: 0,
      delegation: 0,
    },
    delegatedTasks: [],
    outputSignals: [],
    activeFileWrites: [],
    recentFileEvents: [],
    hasSignals: false,
  };
}

function renderPanel(
  overrides: Partial<ComponentProps<typeof CodeReviewSummaryPanel>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenSection = vi.fn<
    ComponentProps<typeof CodeReviewSummaryPanel>["onOpenSection"]
  >();
  const onOpenFileCheckpoints = vi.fn();

  act(() => {
    root.render(
      <CodeReviewSummaryPanel
        harnessState={{
          ...createEmptyHarnessState(),
          outputSignals: [
            {
              id: "signal-test",
              toolCallId: "tool-test",
              toolName: "bash",
              title: "回归测试结果",
              summary: "vitest passed",
              preview: "1 test passed",
              exitCode: 0,
            },
          ],
          recentFileEvents: [
            {
              id: "event-code",
              toolCallId: "tool-write",
              path: "/tmp/workspace/src/ImageCard.tsx",
              displayName: "ImageCard.tsx",
              kind: "code",
              action: "write",
              sourceToolName: "write_file",
              clickable: true,
            },
          ],
          hasSignals: true,
        }}
        fileCheckpointSummary={{
          count: 1,
          latest_checkpoint: {
            checkpoint_id: "checkpoint-1",
            turn_id: "turn-1",
            path: "src/ImageCard.tsx",
            source: "tool_result",
            updated_at: "2026-05-27T01:00:00.000Z",
            validation_issue_count: 0,
          },
        }}
        onOpenSection={onOpenSection}
        onOpenFileCheckpoints={onOpenFileCheckpoints}
        {...overrides}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return { container, onOpenSection, onOpenFileCheckpoints };
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(async () => {
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
  await changeLimeLocale("en-US");
});

describe("CodeReviewSummaryPanel", () => {
  it("应聚合文件变更、测试输出和快照入口", () => {
    const { container, onOpenSection, onOpenFileCheckpoints } = renderPanel();

    const panel = container.querySelector(
      '[data-testid="code-review-summary-panel"]',
    ) as HTMLElement | null;
    const primaryAction = container.querySelector(
      '[data-testid="code-review-summary-primary-action"]',
    ) as HTMLButtonElement | null;
    const checkpointAction = container.querySelector(
      '[data-testid="code-review-summary-checkpoints"]',
    ) as HTMLButtonElement | null;

    expect(panel?.textContent).toContain("代码审阅摘要");
    expect(panel?.textContent).toContain("文件变更 1");
    expect(panel?.textContent).toContain("测试输出 1");
    expect(panel?.textContent).toContain("快照 1");
    expect(panel?.textContent).toContain("ImageCard.tsx");

    act(() => {
      primaryAction?.click();
    });
    expect(onOpenSection).toHaveBeenCalledWith("file_review");

    act(() => {
      checkpointAction?.click();
    });
    expect(onOpenFileCheckpoints).toHaveBeenCalledTimes(1);
  });

  it("英文界面应使用 agent namespace 文案", async () => {
    await changeLimeLocale("en-US");

    const { container } = renderPanel();

    const panel = container.querySelector(
      '[data-testid="code-review-summary-panel"]',
    ) as HTMLElement | null;

    expect(panel?.textContent).toContain("Code review summary");
    expect(panel?.textContent).toContain("File changes 1");
    expect(panel?.textContent).toContain("Test output 1");
    expect(panel?.textContent).toContain("Snapshots 1");
    expect(panel?.textContent).toContain("Review result");
  });

  it("失败输出应在输出入口提示需要处理", () => {
    const { container } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        outputSignals: [
          {
            id: "signal-failed",
            toolCallId: "tool-test",
            toolName: "bash",
            title: "测试失败",
            summary: "vitest failed",
            preview: "1 test failed",
            exitCode: 1,
          },
        ],
        recentFileEvents: [
          {
            id: "event-code",
            toolCallId: "tool-write",
            path: "/tmp/workspace/src/ImageCard.tsx",
            displayName: "ImageCard.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            clickable: true,
          },
        ],
        hasSignals: true,
      },
    });

    const outputs = container.querySelector(
      '[data-testid="code-review-summary-outputs"]',
    ) as HTMLElement | null;

    expect(outputs?.textContent).toContain("测试输出 1");
    expect(outputs?.textContent).toContain("测试失败");
    expect(container.textContent).toContain("1 条输出需要处理");
  });

  it("存在失败输出时主按钮应优先打开输出区块", () => {
    const { container, onOpenSection } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        outputSignals: [
          {
            id: "signal-failed",
            toolCallId: "tool-test",
            toolName: "bash",
            title: "回归测试失败",
            summary: "vitest failed",
            preview: "1 test failed",
            exitCode: 1,
          },
        ],
        recentFileEvents: [
          {
            id: "event-code",
            toolCallId: "tool-write",
            path: "/tmp/workspace/src/ImageCard.tsx",
            displayName: "ImageCard.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            clickable: true,
          },
        ],
        hasSignals: true,
      },
      fileCheckpointSummary: null,
    });

    const primaryAction = container.querySelector(
      '[data-testid="code-review-summary-primary-action"]',
    ) as HTMLButtonElement | null;

    expect(primaryAction?.textContent).toContain("查看失败输出");

    act(() => {
      primaryAction?.click();
    });

    expect(onOpenSection).toHaveBeenCalledWith("outputs");
  });

  it("多条输出混合时应优先展示失败输出详情", () => {
    const { container } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        outputSignals: [
          {
            id: "signal-pass",
            toolCallId: "tool-pass",
            toolName: "bash",
            title: "类型检查通过",
            summary: "typecheck passed",
            preview: "tsc --noEmit",
            exitCode: 0,
          },
          {
            id: "signal-failed",
            toolCallId: "tool-failed",
            toolName: "bash",
            title: "回归测试失败",
            summary: "vitest failed",
            preview: "ImageCard.test.tsx failed",
            exitCode: 1,
          },
        ],
        recentFileEvents: [
          {
            id: "event-code",
            toolCallId: "tool-write",
            path: "/tmp/workspace/src/ImageCard.tsx",
            displayName: "ImageCard.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            clickable: true,
          },
        ],
        hasSignals: true,
      },
      fileCheckpointSummary: null,
    });

    const outputs = container.querySelector(
      '[data-testid="code-review-summary-outputs"]',
    ) as HTMLElement | null;

    expect(outputs?.textContent).toContain("回归测试失败");
    expect(outputs?.textContent).not.toContain("类型检查通过");
  });

  it("文件变更超过三条时应提示剩余数量", () => {
    const { container } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        recentFileEvents: [
          {
            id: "event-code-1",
            toolCallId: "tool-write-1",
            path: "/tmp/workspace/src/App.tsx",
            displayName: "App.tsx",
            kind: "code",
            action: "write",
            sourceToolName: "write_file",
            clickable: true,
          },
          {
            id: "event-code-2",
            toolCallId: "tool-write-2",
            path: "/tmp/workspace/src/App.test.tsx",
            displayName: "App.test.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            clickable: true,
          },
          {
            id: "event-code-3",
            toolCallId: "tool-write-3",
            path: "/tmp/workspace/src/styles.css",
            displayName: "styles.css",
            kind: "code",
            action: "edit",
            sourceToolName: "edit_file",
            clickable: true,
          },
          {
            id: "event-code-4",
            toolCallId: "tool-write-4",
            path: "/tmp/workspace/src/routes.ts",
            displayName: "routes.ts",
            kind: "code",
            action: "write",
            sourceToolName: "write_file",
            clickable: true,
          },
        ],
        hasSignals: true,
      },
      fileCheckpointSummary: null,
    });

    const files = container.querySelector(
      '[data-testid="code-review-summary-files"]',
    ) as HTMLElement | null;

    expect(files?.textContent).toContain("App.tsx");
    expect(files?.textContent).toContain("App.test.tsx");
    expect(files?.textContent).toContain("styles.css");
    expect(files?.textContent).not.toContain("routes.ts");
    expect(files?.textContent).toContain("另有 1 个文件");
  });

  it("只有输出时主按钮应打开输出区块", () => {
    const { container, onOpenSection, onOpenFileCheckpoints } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        outputSignals: [
          {
            id: "signal-only",
            toolCallId: "tool-test",
            toolName: "bash",
            title: "类型检查",
            summary: "typecheck passed",
            preview: "tsc --noEmit",
            exitCode: 0,
          },
        ],
        hasSignals: true,
      },
      fileCheckpointSummary: null,
    });

    const primaryAction = container.querySelector(
      '[data-testid="code-review-summary-primary-action"]',
    ) as HTMLButtonElement | null;

    act(() => {
      primaryAction?.click();
    });

    expect(primaryAction?.textContent).toContain("查看输出");
    expect(onOpenSection).toHaveBeenCalledWith("outputs");
    expect(onOpenFileCheckpoints).not.toHaveBeenCalled();
  });

  it("没有快照时只展示空态入口", () => {
    const { container } = renderPanel({
      harnessState: {
        ...createEmptyHarnessState(),
        outputSignals: [
          {
            id: "signal-pass",
            toolCallId: "tool-test",
            toolName: "bash",
            title: "测试通过",
            summary: "vitest passed",
            preview: "1 test passed",
            exitCode: 0,
          },
        ],
        hasSignals: true,
      },
      fileCheckpointSummary: null,
    });

    const checkpoints = container.querySelector(
      '[data-testid="code-review-summary-checkpoints"]',
    ) as HTMLButtonElement | null;

    expect(checkpoints?.disabled).toBe(true);
    expect(checkpoints?.textContent).toContain("暂无可回滚快照");
  });

  it("只有快照时主按钮应直接打开快照入口", () => {
    const { container, onOpenSection, onOpenFileCheckpoints } = renderPanel({
      harnessState: createEmptyHarnessState(),
      fileCheckpointSummary: {
        count: 1,
        latest_checkpoint: {
          checkpoint_id: "checkpoint-only",
          turn_id: "turn-only",
          path: "src/App.tsx",
          source: "tool_result",
          updated_at: "2026-05-27T02:00:00.000Z",
          validation_issue_count: 0,
        },
      },
    });

    const primaryAction = container.querySelector(
      '[data-testid="code-review-summary-primary-action"]',
    ) as HTMLButtonElement | null;
    const files = container.querySelector(
      '[data-testid="code-review-summary-files"]',
    ) as HTMLButtonElement | null;
    const outputs = container.querySelector(
      '[data-testid="code-review-summary-outputs"]',
    ) as HTMLButtonElement | null;

    act(() => {
      primaryAction?.click();
    });

    expect(primaryAction?.textContent).toContain("查看快照");
    expect(files?.disabled).toBe(true);
    expect(outputs?.disabled).toBe(true);
    expect(onOpenSection).not.toHaveBeenCalled();
    expect(onOpenFileCheckpoints).toHaveBeenCalledTimes(1);
  });

  it("没有审阅事实时不渲染", () => {
    const { container } = renderPanel({
      harnessState: createEmptyHarnessState(),
      fileCheckpointSummary: null,
    });

    expect(
      container.querySelector('[data-testid="code-review-summary-panel"]'),
    ).toBeNull();
  });
});
