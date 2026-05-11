import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { mockOpen } = vi.hoisted(() => ({
  mockOpen: vi.fn(),
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
  beforeEach(async () => {
    vi.clearAllMocks();
    setNavigatorPlatform("MacIntel");
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }

    vi.restoreAllMocks();
    await changeLimeLocale("zh-CN");
  });

  it("应通过 settings namespace 渲染剪贴板权限指引", () => {
    const container = renderComponent();

    expect(container.textContent).toContain("macOS Clipboard Permission Guide");
    expect(container.textContent).toContain("Open System Settings");
    expect(container.textContent).toContain(
      "Click anywhere in the Lime window, then try copying again.",
    );
    expect(container.textContent).not.toContain("macOS 剪贴板权限指引");
    expect(container.textContent).not.toContain(
      "settings.system.clipboardPermission",
    );
  });

  it("点击打开系统设置应调用系统设置 URL", async () => {
    const container = renderComponent();
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("Open System Settings"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
  });

  it("打开系统设置失败时应显示可翻译错误", async () => {
    mockOpen.mockRejectedValueOnce(new Error("denied"));
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("blocked");
    });

    const container = renderComponent();
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("Open System Settings"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Failed to open system settings: denied",
    );
    expect(container.textContent).not.toContain("打开系统设置失败");
  });
});
