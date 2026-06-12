import React, { type ComponentProps } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceMainArea } from "./WorkspaceMainArea";
import {
  cleanupMountedRoots,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";

setupReactActEnvironment();

function WorkspaceMainAreaHarness(
  props: Partial<ComponentProps<typeof WorkspaceMainArea>>,
) {
  return (
    <div style={{ width: "1200px", height: "720px" }}>
      <WorkspaceMainArea
        compactChrome={false}
        navbarNode={null}
        contentSyncNoticeNode={null}
        shellBottomInset="0px"
        layoutMode="chat-canvas"
        forceCanvasMode={false}
        chatContent={<div data-testid="workspace-chat-content">chat</div>}
        canvasContent={<div data-testid="workspace-canvas-content">canvas</div>}
        generalWorkbenchDialog={null}
        generalWorkbenchHarnessDialog={null}
        showFloatingInputOverlay={false}
        hasPendingA2UIForm={false}
        inputbarNode={<div data-testid="workspace-inputbar">inputbar</div>}
        {...props}
      />
    </div>
  );
}

describe("WorkspaceMainArea", () => {
  const mountedRoots: MountedRoot[] = [];
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1080,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 720,
    });
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
  });

  it("待处理 A2UI 存在时即使输入区是浮层也应直接回到纯聊天态", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        showFloatingInputOverlay: true,
        hasPendingA2UIForm: true,
      },
      mountedRoots,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="layout-transition-root"]',
      )?.dataset.effectiveMode,
    ).toBe("chat");
    expect(
      container.querySelector<HTMLElement>('[data-testid="layout-chat-panel"]')
        ?.dataset.overlayState,
    ).toBe("inline");
    expect(
      container.querySelector('[data-testid="workspace-inputbar"]'),
    ).not.toBeNull();
  });

  it("浮层输入区应跟随底部工具 inset 上移，避免被 Shell 面板遮挡", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        showFloatingInputOverlay: true,
        shellBottomInset: "calc(0px + 228px)",
      },
      mountedRoots,
    );

    const inputbar = container.querySelector<HTMLElement>(
      '[data-testid="workspace-inputbar"]',
    );
    const overlay = container.querySelector<HTMLElement>(
      '[data-testid="general-workbench-input-overlay"]',
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.dataset.bottomInset).toBe("calc(0px + 228px)");
    expect(overlay?.contains(inputbar)).toBe(true);
  });

  it("没有浮层输入区时待处理 A2UI 也应保持纯聊天态", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        showFloatingInputOverlay: false,
        hasPendingA2UIForm: true,
      },
      mountedRoots,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="layout-transition-root"]',
      )?.dataset.effectiveMode,
    ).toBe("chat");
    expect(
      container.querySelector<HTMLElement>('[data-testid="layout-chat-panel"]')
        ?.dataset.overlayState,
    ).toBe("inline");
  });

  it("待处理 A2UI 存在时应屏蔽主题工作台的强制画布态", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        forceCanvasMode: true,
        hasPendingA2UIForm: true,
      },
      mountedRoots,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="layout-transition-root"]',
      )?.dataset.effectiveMode,
    ).toBe("chat");
  });

  it("任务中心顶栏和会话标签应合并到统一 Chrome 背景中", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
      },
      mountedRoots,
    );

    const shell = container.querySelector<HTMLElement>(
      '[data-testid="task-center-chrome-shell"]',
    );

    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("bg-[color:var(--lime-chrome-rail)]");
    expect(
      shell?.querySelector('[data-testid="workspace-navbar"]'),
    ).not.toBeNull();
    expect(
      shell?.querySelector('[data-testid="task-center-tabs"]'),
    ).not.toBeNull();
  });

  it("任务中心工具栏应占据独立右侧区域，避免覆盖工作台和会话标签", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
        taskCenterUtilityToolbarNode: (
          <div data-testid="task-center-toolbar">toolbar</div>
        ),
      },
      mountedRoots,
    );

    const host = container.querySelector<HTMLElement>(
      '[data-testid="task-center-utility-toolbar-host"]',
    );
    const tabs = container.querySelector<HTMLElement>(
      '[data-testid="task-center-tabs"]',
    );

    expect(host).not.toBeNull();
    expect(host?.className).toContain("shrink-0");
    expect(host?.className).toContain("max-w-[42%]");
    expect(host?.className).toContain("overflow-hidden");
    expect(host?.className).toContain("border-l");
    expect(tabs?.parentElement?.className).toContain("flex-1");
    expect(host?.contains(tabs)).toBe(false);
  });

  it("任务中心自动隐藏顶栏时应通过小图标展开完整顶部工具", () => {
    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        autoHideTaskCenterNavbar: true,
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
      },
      mountedRoots,
    );

    const shell = container.querySelector<HTMLElement>(
      '[data-testid="workspace-navbar-auto-hide-shell"]',
    );
    const panel = container.querySelector<HTMLElement>(
      '[data-testid="workspace-navbar-auto-hide-panel"]',
    );
    const backdrop = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-navbar-backdrop"]',
    );
    expect(shell?.dataset.visible).toBe("false");
    expect(panel?.dataset.visible).toBe("false");
    expect(backdrop?.dataset.visible).toBe("false");

    const currentHandle = container.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-navbar-reveal-handle"]',
    );

    act(() => {
      currentHandle?.click();
    });

    expect(shell?.dataset.visible).toBe("true");
    expect(panel?.dataset.visible).toBe("true");
    expect(backdrop?.dataset.visible).toBe("true");

    act(() => {
      backdrop?.click();
    });

    expect(shell?.dataset.visible).toBe("false");
    expect(panel?.dataset.visible).toBe("false");
    expect(backdrop?.dataset.visible).toBe("false");
  });
});
