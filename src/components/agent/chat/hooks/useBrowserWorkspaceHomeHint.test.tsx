import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY } from "../workspace/agentChatWorkspaceHelpers";
import {
  useBrowserWorkspaceHomeHint,
  type BrowserWorkspaceHomeHintController,
} from "./useBrowserWorkspaceHomeHint";

let latest: BrowserWorkspaceHomeHintController | null = null;

function Harness({
  enabled,
  projectId,
  entryBannerMessage,
}: {
  enabled: boolean;
  projectId: string | null;
  entryBannerMessage?: string;
}) {
  latest = useBrowserWorkspaceHomeHint({
    enabled,
    projectId,
    entryBannerMessage,
  });
  return null;
}

describe("useBrowserWorkspaceHomeHint", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    latest = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    localStorage.clear();
    latest = null;
  });

  function renderHook(props: {
    enabled: boolean;
    projectId: string | null;
    entryBannerMessage?: string;
  }) {
    act(() => {
      root.render(<Harness {...props} />);
    });
    if (!latest) {
      throw new Error("hook 尚未初始化");
    }
    return latest;
  }

  it("满足条件时首次展示，并写入已展示标记", () => {
    const controller = renderHook({ enabled: true, projectId: "project-1" });

    expect(controller.browserWorkspaceHintVisible).toBe(true);
    expect(localStorage.getItem(BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY)).toBe(
      "true",
    );
  });

  it("已展示过时不再展示", () => {
    localStorage.setItem(BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY, "true");

    const controller = renderHook({ enabled: true, projectId: "project-1" });

    expect(controller.browserWorkspaceHintVisible).toBe(false);
  });

  it("未启用、缺少项目或 entry banner 存在时不展示", () => {
    expect(
      renderHook({ enabled: false, projectId: "project-1" })
        .browserWorkspaceHintVisible,
    ).toBe(false);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(renderHook({ enabled: true, projectId: null }).browserWorkspaceHintVisible).toBe(
      false,
    );

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(
      renderHook({
        enabled: true,
        projectId: "project-1",
        entryBannerMessage: "欢迎回来",
      }).browserWorkspaceHintVisible,
    ).toBe(false);
  });

  it("支持手动关闭提示", () => {
    const controller = renderHook({ enabled: true, projectId: "project-1" });

    act(() => controller.dismissBrowserWorkspaceHint());

    expect(latest?.browserWorkspaceHintVisible).toBe(false);
  });

  it("会在超时后自动隐藏提示", () => {
    vi.useFakeTimers();
    renderHook({ enabled: true, projectId: "project-1" });

    expect(latest?.browserWorkspaceHintVisible).toBe(true);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(latest?.browserWorkspaceHintVisible).toBe(false);
  });
});
