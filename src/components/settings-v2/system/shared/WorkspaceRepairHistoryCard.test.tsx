import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceRepairHistory,
  recordWorkspaceRepair,
} from "@/lib/workspaceHealthTelemetry";

const { mockUseTranslation } = vi.hoisted(() => ({
  mockUseTranslation: vi.fn((_namespace?: string) => ({
    i18n: { language: "zh-CN" },
    t: (key: string, options?: unknown) => {
      if (typeof options === "string") {
        return options;
      }

      if (options && typeof options === "object") {
        const values = options as Record<string, unknown>;
        const template =
          typeof values.defaultValue === "string" ? values.defaultValue : key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
          String(values[name] ?? ""),
        );
      }

      return key;
    },
  })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  clearWorkspaceRepairHistory();
});

afterEach(() => {
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
});

describe("WorkspaceRepairHistoryCard", () => {
  it("应通过 settings namespace 渲染默认空态文案", () => {
    const container = renderComponent();
    const text = container.textContent ?? "";

    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(text).toContain("Workspace 自动修复记录");
    expect(text).toContain("记录最近自动修复/迁移（不打断用户操作）");
    expect(text).toContain("最近记录：0 条");
    expect(text).toContain("暂无自动修复记录");
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
    expect(container.textContent).toContain("最近记录：1 条");
    expect(container.textContent).toContain("来源：创作会话页");

    await act(async () => {
      findButton(container, "复制全部").click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain(
      "Workspace ID: ws-1",
    );
    expect(container.textContent).toContain("已复制最近 1 条自愈记录");
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
      findButton(container, "复制全部").click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "复制失败，请检查窗口焦点或系统剪贴板权限",
    );
  });
});
