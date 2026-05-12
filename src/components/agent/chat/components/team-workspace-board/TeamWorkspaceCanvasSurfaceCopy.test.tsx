import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { TeamWorkspaceCanvasStage } from "./TeamWorkspaceCanvasStage";
import { TeamWorkspaceCanvasToolbar } from "./TeamWorkspaceCanvasToolbar";
import {
  TeamWorkspaceCanvasViewButtons,
  TeamWorkspaceTeamActionButtons,
} from "./TeamWorkspaceTeamOverviewControls";
import { TeamWorkspaceTeamOperationsPanel } from "./TeamWorkspaceTeamOperationsPanel";
import { SelectedSessionInlineDetail } from "./SelectedSessionInlineDetail";

function renderIntoDocument(element: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("TeamWorkspaceCanvasSurfaceCopy", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
  });

  afterEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
  });

  it("应使用当前进口径展示任务布局提示", () => {
    const { container, unmount } = renderIntoDocument(
      <TeamWorkspaceCanvasStage
        canvasBoundsHeight={640}
        canvasBoundsWidth={960}
        canvasStageHeight="640px"
        canvasStageHint="当前任务会按状态持续刷新。"
        expandedSessionId={null}
        isCanvasPanModifierActive={false}
        laneLayouts={{}}
        lanes={[]}
        onCanvasWheel={vi.fn()}
        onSelectLane={vi.fn()}
        onStartCanvasLaneDrag={vi.fn()}
        onStartCanvasLaneResize={vi.fn()}
        onStartCanvasPan={vi.fn()}
        selectedSessionId={null}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportRef={{ current: null }}
      />,
    );

    try {
      expect(container.textContent).toContain("当前进展");
      expect(container.textContent).toContain("拖拽调整任务布局");
      expect(container.textContent).toContain("暂无当前进展");
      expect(container.textContent).not.toContain("暂无任务画布");
    } finally {
      unmount();
    }
  });

  it("画布舞台应读取英文资源", async () => {
    await changeLimeLocale("en-US");

    const { container, unmount } = renderIntoDocument(
      <TeamWorkspaceCanvasStage
        canvasBoundsHeight={640}
        canvasBoundsWidth={960}
        canvasStageHeight="640px"
        canvasStageHint="Stage hint stays runtime copy."
        expandedSessionId={null}
        isCanvasPanModifierActive={false}
        laneLayouts={{}}
        lanes={[]}
        onCanvasWheel={vi.fn()}
        onSelectLane={vi.fn()}
        onStartCanvasLaneDrag={vi.fn()}
        onStartCanvasLaneResize={vi.fn()}
        onStartCanvasPan={vi.fn()}
        selectedSessionId={null}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportRef={{ current: null }}
      />,
    );

    try {
      expect(container.textContent).toContain("Current progress");
      expect(container.textContent).toContain("Drag to arrange tasks");
      expect(container.textContent).toContain("No current progress");
      expect(container.textContent).toContain("Stage hint stays runtime copy.");
      expect(container.textContent).not.toContain("拖拽调整任务布局");
      expect(container.textContent).not.toContain("暂无当前进展");
    } finally {
      unmount();
    }
  });

  it("工具栏应使用当前进展与聚焦进展口径", () => {
    const { container, unmount } = renderIntoDocument(
      <TeamWorkspaceCanvasToolbar
        laneCount={3}
        onAutoArrangeCanvas={vi.fn()}
        onFitCanvasView={vi.fn()}
        onResetCanvasView={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        zoom={1.15}
      />,
    );

    try {
      expect(container.textContent).toContain("当前进展");
      expect(container.textContent).toContain("3 条当前进展");
      expect(container.textContent).toContain("聚焦进展");
      expect(container.textContent).not.toContain("自由画布");
      expect(container.textContent).not.toContain("适应视图");
    } finally {
      unmount();
    }
  });

  it("紧凑控制条也应使用聚焦进展口径", () => {
    const { container, unmount } = renderIntoDocument(
      <TeamWorkspaceCanvasViewButtons
        onAutoArrangeCanvas={vi.fn()}
        onFitCanvasView={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
      />,
    );

    try {
      expect(container.textContent).toContain("整理布局");
      expect(container.textContent).toContain("聚焦进展");
      expect(container.textContent).not.toContain("适应视图");
    } finally {
      unmount();
    }
  });

  it("画布工具栏与团队操作按钮应读取英文资源", async () => {
    await changeLimeLocale("en-US");

    const { container, unmount } = renderIntoDocument(
      <div>
        <TeamWorkspaceCanvasToolbar
          laneCount={3}
          onAutoArrangeCanvas={vi.fn()}
          onFitCanvasView={vi.fn()}
          onResetCanvasView={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          zoom={1.15}
        />
        <TeamWorkspaceTeamActionButtons
          canCloseCompletedTeamSessions
          canWaitAnyActiveTeamSession
          onCloseCompletedTeamSessions={vi.fn()}
          onWaitAnyActiveTeamSessions={vi.fn()}
          pendingTeamAction={null}
        />
      </div>,
    );

    try {
      expect(container.textContent).toContain("Current progress");
      expect(container.textContent).toContain("Zoom 115%");
      expect(container.textContent).toContain("3 active progress lane(s)");
      expect(container.textContent).toContain("Fit progress");
      expect(container.textContent).toContain("Wait for any task result");
      expect(container.textContent).toContain("Close completed tasks");
      expect(container.textContent).not.toContain("聚焦进展");
      expect(container.textContent).not.toContain("等待任一任务结果");
    } finally {
      unmount();
    }
  });

  it("团队操作面板应读取英文资源", async () => {
    await changeLimeLocale("en-US");

    const { container, unmount } = renderIntoDocument(
      <TeamWorkspaceTeamOperationsPanel
        embedded={false}
        onSelectTeamOperationEntry={vi.fn()}
        teamOperationEntries={[
          {
            id: "wait-1",
            title: "Result received",
            detail: "Just received new results from Researcher.",
            badgeClassName:
              "border border-emerald-200 bg-emerald-50 text-emerald-700",
            updatedAt: Date.now(),
            targetSessionId: "child-1",
          },
        ]}
        useCompactCanvasChrome={false}
      />,
    );

    try {
      expect(container.textContent).toContain("Task progress");
      expect(container.textContent).toContain("Latest 1");
      expect(container.textContent).toContain("just now");
      expect(container.textContent).not.toContain("任务进展");
      expect(container.textContent).not.toContain("最近 1 条");
    } finally {
      unmount();
    }
  });

  it("选中任务 inline chrome 应读取英文资源", async () => {
    await changeLimeLocale("en-US");

    const { container, unmount } = renderIntoDocument(
      <SelectedSessionInlineDetail
        canOpenSelectedSession
        canResumeSelectedSession
        canSendSelectedSessionInput
        canStopSelectedSession
        canWaitSelectedSession
        detailDisplay={{
          hasSettings: true,
          metadata: ["session: child-1"],
          outputContract: "Runtime output contract",
          queueReason: null,
          runtimeDetailSummary: "Runtime summary",
          settingBadges: ["executor"],
          skillBadges: [],
        }}
        detailSummary="Runtime task summary"
        formatUpdatedAt={() => "just now"}
        inlineDetailSectionClassName="section"
        inlineTimelineEntryClassName="entry"
        inlineTimelineFeedClassName="feed"
        isChildSession={false}
        onOpenSelectedSession={vi.fn()}
        onSelectedSessionAction={vi.fn()}
        onSelectedSessionInputDraftChange={vi.fn()}
        onSelectedSessionSendInput={vi.fn()}
        pendingAction={null}
        selectedActionPending={false}
        selectedSession={{
          id: "child-1",
          isCurrent: true,
          updatedAt: Date.now(),
        }}
        selectedSessionActivityEntries={[
          {
            id: "entry-1",
            title: "Tool result",
            detail: "Runtime detail",
            statusLabel: "Completed",
            badgeClassName:
              "border border-emerald-200 bg-emerald-50 text-emerald-700",
          },
        ]}
        selectedSessionActivityPreview={{
          entries: [],
          preview: null,
          status: "ready",
        }}
        selectedSessionActivityPreviewText={null}
        selectedSessionActivityShouldPoll
        selectedSessionInputDraft=""
        selectedSessionInputMessage="Continue"
        selectedSessionSupportsActivityPreview
      />,
    );

    try {
      expect(container.textContent).toContain("Current view");
      expect(container.textContent).toContain("Current task");
      expect(container.textContent).toContain("Resume work");
      expect(container.textContent).toContain("Pause work");
      expect(container.textContent).toContain("Open progress");
      expect(container.textContent).toContain("Task split");
      expect(container.textContent).toContain("Continue work");
      expect(container.textContent).toContain("Result can be checked directly");
      expect(container.textContent).toContain("Wait 30 seconds for result");
      expect(container.textContent).toContain("Send note");
      expect(container.textContent).toContain("Insert note now");
      expect(container.textContent).toContain("Full progress");
      expect(container.textContent).toContain("Auto-refresh while running");
      expect(container.textContent).toContain(
        "This task has no new progress to show yet.",
      );
      expect(container.textContent).toContain("Progress log");
      expect(container.textContent).toContain("1 item(s)");
      expect(container.textContent).toContain("Updated just now");
      expect(
        container.querySelector("textarea")?.getAttribute("placeholder"),
      ).toBe(
        "Add instructions, constraints, or ask this task to continue to the next step.",
      );
      expect(container.textContent).not.toContain("继续处理");
      expect(container.textContent).not.toContain("完整进展");
    } finally {
      unmount();
    }
  });
});
