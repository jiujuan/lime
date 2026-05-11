import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  clearWorkspaceRepairHistory,
  recordWorkspaceRepair,
} from "@/lib/workspaceHealthTelemetry";

import { WorkspaceRepairHistoryCard } from "./WorkspaceRepairHistoryCard";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<WorkspaceRepairHistoryCard />);
  });

  mounted.push({ container, root });
  return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }

  return button as HTMLButtonElement;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  clearWorkspaceRepairHistory();
  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) {
      break;
    }

    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }

  clearWorkspaceRepairHistory();
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("WorkspaceRepairHistoryCard", () => {
  it("应通过 settings namespace 渲染默认空态文案", () => {
    const container = renderComponent();
    const text = container.textContent ?? "";

    expect(text).toContain("Workspace Auto-Repair History");
    expect(text).toContain(
      "Records recent auto-repair and migration actions without interrupting your work.",
    );
    expect(text).toContain("Recent records: 0");
    expect(text).toContain("No auto-repair records yet");
    expect(text).not.toContain("Workspace 自动修复记录");
    expect(text).not.toContain("settings.system.workspaceRepair");
  });

  it("应渲染自愈记录来源并支持复制全部摘要", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    recordWorkspaceRepair({
      workspaceId: "ws-1",
      rootPath: "/tmp/ws-1",
      source: "agent_chat_page",
    });

    const container = renderComponent();
    expect(container.textContent).toContain("Recent records: 1");
    expect(container.textContent).toContain("Source: Creation session page");

    await act(async () => {
      findButton(container, "Copy All").click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain(
      "Workspace ID: ws-1",
    );
    expect(container.textContent).toContain(
      "Copied the latest 1 repair records",
    );
  });

  it("应通过 settings namespace 渲染剪贴板权限失败提示", async () => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });

    recordWorkspaceRepair({
      workspaceId: "ws-1",
      rootPath: "/tmp/ws-1",
      source: "workspace_refresh",
    });

    const container = renderComponent();

    await act(async () => {
      findButton(container, "Copy All").click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Copy failed. Check the window focus or system clipboard permission.",
    );
    expect(container.textContent).not.toContain("复制失败，请检查窗口焦点");
  });
});
