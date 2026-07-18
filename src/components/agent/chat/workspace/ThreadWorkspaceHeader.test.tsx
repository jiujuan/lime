import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThreadWorkspaceHeader } from "./ThreadWorkspaceHeader";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ThreadWorkspaceHeader", () => {
  it("应集中展示 active Thread 标题、状态、工作目录和上下文操作", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ThreadWorkspaceHeader
          sessionId="thread-1"
          title="对齐 Codex App GUI"
          status="running"
          workingDirectory="/workspace/lime"
          actions={<button data-testid="header-action">打开位置</button>}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="thread-workspace-header"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="thread-workspace-header-title"]')
        ?.textContent,
    ).toBe("对齐 Codex App GUI");
    expect(
      container.querySelector('[data-testid="thread-workspace-header-status"]')
        ?.textContent,
    ).toContain("处理中");
    expect(
      container.querySelector(
        '[data-testid="thread-workspace-header-directory"]',
      )?.textContent,
    ).toContain("/workspace/lime");
    expect(
      container.querySelector('[data-testid="header-action"]'),
    ).not.toBeNull();

    act(() => root.unmount());
  });
});
