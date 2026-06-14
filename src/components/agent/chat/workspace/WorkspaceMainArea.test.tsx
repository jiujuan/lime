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

  it("展开工作台时应把对话放在画布前面", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        layoutMode: "chat-canvas",
      },
      mountedRoots,
    );

    const root = container.querySelector<HTMLElement>(
      '[data-testid="layout-transition-root"]',
    );
    const orderedPanels = Array.from(root?.children ?? [])
      .map((node) => node.getAttribute("data-testid"))
      .filter(Boolean);

    expect(orderedPanels).toContain("layout-chat-panel");
    expect(orderedPanels).toContain("layout-canvas-panel");
    expect(
      orderedPanels.indexOf("layout-chat-panel"),
    ).toBeLessThan(orderedPanels.indexOf("layout-canvas-panel"));
    expect(orderedPanels).toContain("layout-chat-canvas-resize-handle");
    expect(
      container.querySelector('[data-testid="workspace-chat-content"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="workspace-canvas-content"]'),
    ).not.toBeNull();
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
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 820,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 600,
    });

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

  it("首页任务中心工具栏在桌面宽度应固定到右上角，而不是挤在标签行中间", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        layoutMode: "chat",
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
        taskCenterUtilityToolbarNode: (
          <div data-testid="task-center-toolbar">toolbar</div>
        ),
      },
      mountedRoots,
    );

    const inlineHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-utility-toolbar-host"]',
    );
    const homeTopHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-home-top-toolbar-host"]',
    );
    const workbenchTopHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-workbench-top-toolbar-host"]',
    );

    expect(inlineHost).toBeNull();
    expect(homeTopHost).not.toBeNull();
    expect(homeTopHost?.className).toContain("right-0");
    expect(homeTopHost?.className).toContain("top-0");
    expect(homeTopHost?.className).toContain("flex");
    expect(homeTopHost?.style.width).toBe("236px");
    expect(
      homeTopHost?.querySelector('[data-testid="task-center-toolbar"]'),
    ).not.toBeNull();
    expect(workbenchTopHost).toBeNull();
  });

  it("关闭工作台时一级任务导航应向左收缩，给右上工具按钮留出独立区域", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        layoutMode: "chat",
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
        taskCenterUtilityToolbarNode: (
          <div data-testid="task-center-toolbar">toolbar</div>
        ),
      },
      mountedRoots,
    );

    const chromeShell = container.querySelector<HTMLElement>(
      '[data-testid="task-center-chrome-shell"]',
    );
    const homeTopHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-home-top-toolbar-host"]',
    );
    const inlineHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-utility-toolbar-host"]',
    );

    expect(chromeShell?.dataset.layout).toBe("detached");
    expect(chromeShell?.dataset.detachedRightReserve).toBe("236px");
    expect(chromeShell?.dataset.detachedLeftWidth).toBe(
      "calc(100% - 236px)",
    );
    expect(homeTopHost?.style.width).toBe("236px");
    expect(inlineHost).toBeNull();
    expect(homeTopHost).not.toBeNull();
    expect(
      homeTopHost?.querySelector('[data-testid="task-center-toolbar"]'),
    ).not.toBeNull();
  });

  it("展开工作台时任务中心顶栏应只占左侧聊天列，工具栏提升到右侧顶层", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        layoutMode: "chat-canvas",
        chatPanelWidth: "min(100%, clamp(640px, 54%, 1180px))",
        chatPanelMinWidth: "560px",
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
        taskCenterUtilityToolbarNode: (
          <div data-testid="task-center-toolbar">toolbar</div>
        ),
      },
      mountedRoots,
    );

    const chromeShell = container.querySelector<HTMLElement>(
      '[data-testid="task-center-chrome-shell"]',
    );
    const toolbarHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-utility-toolbar-host"]',
    );
    const workbenchToolbarHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-workbench-top-toolbar-host"]',
    );
    const chatPanelPlain = container.querySelector<HTMLElement>(
      '[data-testid="layout-chat-panel-plain"]',
    );
    const canvasPanel = container.querySelector<HTMLElement>(
      '[data-testid="layout-canvas-panel"]',
    );

    expect(chromeShell?.dataset.layout).toBe("split");
    expect(chromeShell?.className).toContain("absolute");
    expect(toolbarHost).toBeNull();
    expect(
      chromeShell?.querySelector('[data-testid="task-center-toolbar"]'),
    ).toBeNull();
    expect(workbenchToolbarHost).not.toBeNull();
    expect(
      workbenchToolbarHost?.querySelector(
        '[data-testid="task-center-toolbar"]',
      ),
    ).not.toBeNull();
    expect(workbenchToolbarHost?.className).toContain("top-0");
    expect(workbenchToolbarHost?.className).toContain("h-[42px]");
    expect(workbenchToolbarHost?.className).toContain(
      "[left:var(--task-center-split-left)]",
    );
    expect(workbenchToolbarHost?.style.getPropertyValue(
      "--task-center-split-left",
    )).toBe("min(100%, clamp(640px, 54%, 1180px))");
    expect(workbenchToolbarHost?.style.getPropertyValue(
      "--task-center-split-min-left",
    )).toBe("");
    expect(workbenchToolbarHost?.className).toContain("right-0");
    expect(workbenchToolbarHost?.className).toContain("min-w-0");
    expect(workbenchToolbarHost?.className).toContain("overflow-visible");
    expect(workbenchToolbarHost?.className).not.toContain("[min-width:calc");
    expect(chatPanelPlain?.dataset.topInset).toBe("84px");
    expect(canvasPanel?.dataset.topInset).toBe("42px");
  });

  it("展开工作台默认只应调整中右两列比例，不改变左侧导航", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });

    const { container } = mountHarness(
      WorkspaceMainAreaHarness,
      {
        layoutMode: "chat-canvas",
        navbarNode: <div data-testid="workspace-navbar">navbar</div>,
        taskCenterTabsNode: <div data-testid="task-center-tabs">tabs</div>,
        taskCenterUtilityToolbarNode: (
          <div data-testid="task-center-toolbar">toolbar</div>
        ),
      },
      mountedRoots,
    );

    const chromeShell = container.querySelector<HTMLElement>(
      '[data-testid="task-center-chrome-shell"]',
    );
    const workbenchToolbarHost = container.querySelector<HTMLElement>(
      '[data-testid="task-center-workbench-top-toolbar-host"]',
    );

    expect(chromeShell?.dataset.layout).toBe("split");
    expect(chromeShell?.dataset.splitLeftWidth).toBe(
      "min(100%, clamp(640px, 54%, 1180px))",
    );
    expect(chromeShell?.dataset.splitLeftMinWidth).toBe("560px");
    expect(
      workbenchToolbarHost?.style.getPropertyValue(
        "--task-center-split-left",
      ),
    ).toBe("min(100%, clamp(640px, 54%, 1180px))");
    expect(
      workbenchToolbarHost?.style.getPropertyValue(
        "--task-center-split-min-left",
      ),
    ).toBe("");
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
