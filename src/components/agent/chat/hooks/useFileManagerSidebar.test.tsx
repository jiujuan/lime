import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SIDEBAR_COLLAPSE_EVENT } from "../workspace/agentChatWorkspaceHelpers";
import {
  useFileManagerSidebar,
  type FileManagerSidebarController,
} from "./useFileManagerSidebar";

const FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY =
  "lime.file-manager.sidebar-open";

let latest: FileManagerSidebarController | null = null;

function Harness({
  onCollapseTopicSidebar,
}: {
  onCollapseTopicSidebar: () => void;
}) {
  latest = useFileManagerSidebar({ onCollapseTopicSidebar });
  return null;
}

describe("useFileManagerSidebar", () => {
  let container: HTMLDivElement;
  let root: Root;
  let rootMounted = false;
  const collapseHandler = vi.fn();
  const sidebarEvents: Array<{ collapsed: boolean; source: string }> = [];

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rootMounted = true;
    localStorage.clear();
    collapseHandler.mockReset();
    sidebarEvents.length = 0;
    window.addEventListener(APP_SIDEBAR_COLLAPSE_EVENT, handleSidebarEvent);
    setWindowWidth(1280);
  });

  afterEach(() => {
    unmountRoot();
    window.removeEventListener(APP_SIDEBAR_COLLAPSE_EVENT, handleSidebarEvent);
    container.remove();
    vi.restoreAllMocks();
    localStorage.clear();
    latest = null;
  });

  function handleSidebarEvent(event: Event) {
    sidebarEvents.push(
      (event as CustomEvent<{ collapsed: boolean; source: string }>).detail,
    );
  }

  function setWindowWidth(value: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value,
    });
  }

  function mount() {
    act(() => {
      root.render(<Harness onCollapseTopicSidebar={collapseHandler} />);
    });
    if (!latest) {
      throw new Error("hook 尚未初始化");
    }
    return latest;
  }

  function unmountRoot() {
    if (!rootMounted) {
      return;
    }
    act(() => {
      root.unmount();
    });
    rootMounted = false;
  }

  it("从本地状态初始化并可切换/关闭", () => {
    const controller = mount();

    expect(controller.fileManagerAvailable).toBe(true);
    expect(controller.fileManagerSidebarOpen).toBe(false);
    expect(controller.fileManagerOpen).toBe(false);

    act(() => controller.toggleFileManagerSidebar());
    expect(latest?.fileManagerSidebarOpen).toBe(true);
    expect(latest?.fileManagerOpen).toBe(true);
    expect(localStorage.getItem(FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY)).toBe(
      null,
    );
    expect(sidebarEvents).toEqual([{ collapsed: true, source: "file-manager" }]);

    act(() => latest?.closeFileManagerSidebar());
    expect(latest?.fileManagerSidebarOpen).toBe(false);
    expect(localStorage.getItem(FILE_MANAGER_SIDEBAR_OPEN_STORAGE_KEY)).toBe(
      "false",
    );
    expect(sidebarEvents).toEqual([
      { collapsed: true, source: "file-manager" },
      { collapsed: false, source: "file-manager" },
    ]);
  });

  it("窄屏打开时收起话题侧栏", () => {
    setWindowWidth(980);
    const controller = mount();

    act(() => controller.setFileManagerSidebarOpen(true));

    expect(collapseHandler).toHaveBeenCalledTimes(1);
    expect(sidebarEvents).toEqual([{ collapsed: true, source: "file-manager" }]);
  });

  it("打开后卸载会还原 AppSidebar collapse 状态", () => {
    const controller = mount();
    act(() => controller.setFileManagerSidebarOpen(true));

    unmountRoot();

    expect(sidebarEvents).toEqual([
      { collapsed: true, source: "file-manager" },
      { collapsed: false, source: "file-manager" },
    ]);
  });
});
