import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  renderBoard,
  getLaneMetrics,
  getViewportMetrics,
  dragMouse,
  pressKey,
  expandLane,
  unmountBoard,
} from "./TeamWorkspaceBoard.testFixtures";

describe("TeamWorkspaceBoard canvas interactions", () => {
  it("拖动角色头部后，应更新对应 lane 的画布坐标", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-drag-1",
      childSubagentSessions: [
        {
          id: "child-drag-1",
          name: "拖拽代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证自由画布拖拽行为",
          role_hint: "explorer",
        },
      ],
    });

    const before = getLaneMetrics(container, "child-drag-1");
    const header = container.querySelector(
      '[data-testid="team-workspace-member-lane-header-child-drag-1"]',
    );
    expect(header).toBeTruthy();

    await dragMouse(header as Element, {
      start: { x: 120, y: 140 },
      end: { x: 220, y: 235 },
    });

    const after = getLaneMetrics(container, "child-drag-1");
    expect(after.x).toBe(before.x + 100);
    expect(after.y).toBe(before.y + 95);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it("点击自动排布后，应将角色面板整理回规则布局并重置视口", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-arrange-1",
      childSubagentSessions: [
        {
          id: "child-arrange-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证自动排布回正",
          role_hint: "explorer",
        },
        {
          id: "child-arrange-2",
          name: "执行代理",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "验证自动排布顺序",
          role_hint: "executor",
        },
      ],
    });

    const firstBefore = getLaneMetrics(container, "child-arrange-1");
    const secondHeader = container.querySelector(
      '[data-testid="team-workspace-member-lane-header-child-arrange-2"]',
    );
    expect(secondHeader).toBeTruthy();

    await dragMouse(secondHeader as Element, {
      start: { x: 420, y: 160 },
      end: { x: 790, y: 430 },
    });

    const secondMoved = getLaneMetrics(container, "child-arrange-2");
    expect(secondMoved.y).toBeGreaterThan(firstBefore.y);

    const autoArrangeButton = container.querySelector(
      '[data-testid="team-workspace-auto-arrange-button"]',
    );
    expect(autoArrangeButton).toBeTruthy();

    act(() => {
      autoArrangeButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const firstAfter = getLaneMetrics(container, "child-arrange-1");
    const secondAfter = getLaneMetrics(container, "child-arrange-2");
    const viewportAfter = getViewportMetrics(container);

    expect(firstAfter.x).toBeGreaterThanOrEqual(64);
    expect(firstAfter.y).toBeGreaterThanOrEqual(64);
    expect(secondAfter.y).toBe(firstAfter.y);
    expect(secondAfter.x).toBeGreaterThan(firstAfter.x);
    expect(secondAfter.x).toBeLessThan(secondMoved.x);
    expect(viewportAfter.x).toBe(56);
    expect(viewportAfter.y).toBe(56);
    expect(viewportAfter.zoom).toBe(1);
  });

  it("按下 A 快捷键时，应触发自动排布；焦点在输入框时不应误触发", async () => {
    const onSendSubagentInput = vi.fn();
    const container = await renderBoard({
      currentSessionId: "parent-shortcut-arrange-1",
      childSubagentSessions: [
        {
          id: "child-shortcut-arrange-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证 A 快捷键",
          role_hint: "explorer",
        },
        {
          id: "child-shortcut-arrange-2",
          name: "执行代理",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "验证输入态不误触发",
          role_hint: "executor",
        },
      ],
      onSendSubagentInput,
    });

    const secondHeader = container.querySelector(
      '[data-testid="team-workspace-member-lane-header-child-shortcut-arrange-2"]',
    );
    expect(secondHeader).toBeTruthy();

    await dragMouse(secondHeader as Element, {
      start: { x: 420, y: 160 },
      end: { x: 760, y: 420 },
    });

    const moved = getLaneMetrics(container, "child-shortcut-arrange-2");
    await expandLane(container, "child-shortcut-arrange-1");
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="team-workspace-send-input-textarea"]',
    );
    expect(textarea).toBeTruthy();

    textarea?.focus();
    await pressKey(textarea as EventTarget, {
      key: "a",
      code: "KeyA",
    });

    const afterTextareaKey = getLaneMetrics(
      container,
      "child-shortcut-arrange-2",
    );
    expect(afterTextareaKey.x).toBe(moved.x);
    expect(afterTextareaKey.y).toBe(moved.y);

    await pressKey(window, {
      key: "a",
      code: "KeyA",
    });

    const arranged = getLaneMetrics(container, "child-shortcut-arrange-2");
    expect(arranged.x).toBeLessThan(moved.x);
    expect(arranged.y).toBeGreaterThanOrEqual(64);
  });

  it("按下方向键时，应平移画布视口；焦点在输入框时不应误触发", async () => {
    const onSendSubagentInput = vi.fn();
    const container = await renderBoard({
      currentSessionId: "parent-shortcut-pan-1",
      childSubagentSessions: [
        {
          id: "child-shortcut-pan-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证方向键平移",
          role_hint: "explorer",
        },
      ],
      onSendSubagentInput,
    });

    const viewportBefore = getViewportMetrics(container);
    await expandLane(container, "child-shortcut-pan-1");
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="team-workspace-send-input-textarea"]',
    );
    expect(textarea).toBeTruthy();

    textarea?.focus();
    await pressKey(textarea as EventTarget, {
      key: "ArrowRight",
      code: "ArrowRight",
    });

    const afterTextareaKey = getViewportMetrics(container);
    expect(afterTextareaKey.x).toBe(viewportBefore.x);
    expect(afterTextareaKey.y).toBe(viewportBefore.y);

    await pressKey(window, {
      key: "ArrowRight",
      code: "ArrowRight",
    });
    await pressKey(window, {
      key: "ArrowDown",
      code: "ArrowDown",
    });

    const afterPan = getViewportMetrics(container);
    expect(afterPan.x).toBe(viewportBefore.x - 72);
    expect(afterPan.y).toBe(viewportBefore.y - 72);

    await pressKey(window, {
      key: "ArrowLeft",
      code: "ArrowLeft",
    });
    await pressKey(window, {
      key: "ArrowUp",
      code: "ArrowUp",
    });

    const afterResetPan = getViewportMetrics(container);
    expect(afterResetPan.x).toBe(viewportBefore.x);
    expect(afterResetPan.y).toBe(viewportBefore.y);
  });

  it("按下 Shift + 方向键时，应使用更大步长平移画布", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-shortcut-fast-pan-1",
      childSubagentSessions: [
        {
          id: "child-shortcut-fast-pan-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证 Shift 方向键快移",
          role_hint: "explorer",
        },
      ],
    });

    const viewportBefore = getViewportMetrics(container);

    await pressKey(window, {
      key: "ArrowRight",
      code: "ArrowRight",
      shiftKey: true,
    });
    await pressKey(window, {
      key: "ArrowDown",
      code: "ArrowDown",
      shiftKey: true,
    });

    const afterFastPan = getViewportMetrics(container);
    expect(afterFastPan.x).toBe(viewportBefore.x - 216);
    expect(afterFastPan.y).toBe(viewportBefore.y - 216);
  });

  it("自由画布应隐藏 minimap 入口，避免占用主视图", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-minimap-1",
      childSubagentSessions: [
        {
          id: "child-minimap-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证 minimap 定位能力",
          role_hint: "explorer",
        },
        {
          id: "child-minimap-2",
          name: "执行代理",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_120,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "验证 minimap 可见区域框",
          role_hint: "executor",
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="team-workspace-minimap"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="team-workspace-toggle-minimap"]'),
    ).toBeNull();
  });

  it("按住 Space 时应进入画布拖拽模式，并允许直接拖动画布视口", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-space-pan-1",
      childSubagentSessions: [
        {
          id: "child-space-pan-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证 Space 拖动画布",
          role_hint: "explorer",
        },
      ],
    });

    const laneBefore = getLaneMetrics(container, "child-space-pan-1");
    const viewportBefore = getViewportMetrics(container);
    const laneElement = container.querySelector(
      '[data-testid="team-workspace-member-lane-child-space-pan-1"]',
    );
    expect(laneElement).toBeTruthy();

    await pressKey(window, {
      key: " ",
      code: "Space",
    });

    const viewportInPanMode = container.querySelector<HTMLElement>(
      '[data-testid="team-workspace-rail-list"]',
    );
    expect(viewportInPanMode?.getAttribute("data-pan-mode")).toBe("active");

    await dragMouse(laneElement as Element, {
      start: { x: 180, y: 180 },
      end: { x: 250, y: 235 },
    });

    const laneAfter = getLaneMetrics(container, "child-space-pan-1");
    const viewportAfter = getViewportMetrics(container);

    expect(laneAfter.x).toBe(laneBefore.x);
    expect(laneAfter.y).toBe(laneBefore.y);
    expect(viewportAfter.x).toBe(viewportBefore.x + 70);
    expect(viewportAfter.y).toBe(viewportBefore.y + 55);

    await pressKey(window, {
      key: " ",
      code: "Space",
      type: "keyup",
    });

    expect(viewportInPanMode?.getAttribute("data-pan-mode")).toBe("idle");
  });

  it("空白画布区域应支持直接拖动画布视口，无需先按住 Space", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-manual-pan-1",
      childSubagentSessions: [
        {
          id: "child-manual-pan-1",
          name: "分析代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证手动拖动画布",
          role_hint: "explorer",
        },
      ],
    });

    const laneBefore = getLaneMetrics(container, "child-manual-pan-1");
    const viewportBefore = getViewportMetrics(container);
    const panSurface = container.querySelector(
      '[data-testid="team-workspace-canvas-pan-surface"]',
    );
    expect(panSurface).toBeTruthy();

    await dragMouse(panSurface as Element, {
      start: { x: 220, y: 220 },
      end: { x: 290, y: 268 },
    });

    const laneAfter = getLaneMetrics(container, "child-manual-pan-1");
    const viewportAfter = getViewportMetrics(container);

    expect(laneAfter.x).toBe(laneBefore.x);
    expect(laneAfter.y).toBe(laneBefore.y);
    expect(viewportAfter.x).toBe(viewportBefore.x + 70);
    expect(viewportAfter.y).toBe(viewportBefore.y + 48);
  });

  it("拖动 resize handle 后，应更新对应 lane 的宽高", async () => {
    const container = await renderBoard({
      currentSessionId: "parent-resize-1",
      childSubagentSessions: [
        {
          id: "child-resize-1",
          name: "缩放代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "验证自由画布改尺寸行为",
          role_hint: "executor",
        },
      ],
    });

    const before = getLaneMetrics(container, "child-resize-1");
    const resizeHandle = container.querySelector(
      '[data-testid="team-workspace-member-lane-resize-child-resize-1-se"]',
    );
    expect(resizeHandle).toBeTruthy();

    await dragMouse(resizeHandle as Element, {
      start: { x: 380, y: 280 },
      end: { x: 455, y: 340 },
    });

    const after = getLaneMetrics(container, "child-resize-1");
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.width).toBe(before.width + 75);
    expect(after.height).toBe(before.height + 60);
  });

  it("同一会话重新挂载后，应恢复上次保存的 lane 布局", async () => {
    const boardProps: Parameters<typeof renderBoard>[0] =
      {
        currentSessionId: "parent-persist-1",
        childSubagentSessions: [
          {
            id: "child-persist-1",
            name: "持久化代理",
            created_at: 1_710_000_000,
            updated_at: 1_710_000_100,
            session_type: "sub_agent",
            runtime_status: "running",
            latest_turn_status: "running",
            task_summary: "验证会话级画布持久化",
            role_hint: "reviewer",
          },
        ],
      };

    const firstContainer = await renderBoard(boardProps);
    const firstHeader = firstContainer.querySelector(
      '[data-testid="team-workspace-member-lane-header-child-persist-1"]',
    );
    expect(firstHeader).toBeTruthy();

    await dragMouse(firstHeader as Element, {
      start: { x: 130, y: 150 },
      end: { x: 290, y: 260 },
    });

    const moved = getLaneMetrics(firstContainer, "child-persist-1");
    await unmountBoard(firstContainer);

    const secondContainer = await renderBoard(boardProps);
    const restored = getLaneMetrics(secondContainer, "child-persist-1");

    expect(restored.x).toBe(moved.x);
    expect(restored.y).toBe(moved.y);
    expect(restored.width).toBe(moved.width);
    expect(restored.height).toBe(moved.height);
  });
});
