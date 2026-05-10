import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { mockUseTranslation } = vi.hoisted(() => {
  const mockTranslate = vi.fn((key: string, options?: unknown) => {
    if (typeof options === "string") return options;

    if (options && typeof options === "object") {
      const values = options as Record<string, unknown>;
      const template =
        typeof values.defaultValue === "string" ? values.defaultValue : key;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values[name] ?? ""),
      );
    }

    return key;
  });

  return {
    mockUseTranslation: vi.fn((_namespace?: string) => ({
      t: mockTranslate,
    })),
  };
});

const { mockOpen } = vi.hoisted(() => ({
  mockOpen: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: mockUseTranslation,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: mockOpen,
}));

import { ClipboardPermissionGuideCard } from "./ClipboardPermissionGuideCard";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderComponent(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });

  act(() => {
    root.render(<ClipboardPermissionGuideCard />);
  });

  return container;
}

function setNavigatorPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "",
  });
}

describe("ClipboardPermissionGuideCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setNavigatorPlatform("MacIntel");
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("应通过 settings namespace 渲染剪贴板权限指引", () => {
    const container = renderComponent();

    expect(mockUseTranslation).toHaveBeenCalledWith("settings");
    expect(container.textContent).toContain("macOS 剪贴板权限指引");
    expect(container.textContent).toContain("打开系统设置");
  });

  it("点击打开系统设置应调用系统设置 URL", async () => {
    const container = renderComponent();
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("打开系统设置"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
  });
});
