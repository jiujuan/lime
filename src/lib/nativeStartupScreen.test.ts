import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasNativeStartupScreen,
  hideNativeStartupOverlayWhenReady,
} from "./nativeStartupScreen";

const desktopRuntimeMock = vi.hoisted(() => ({
  hasDesktopHostInvokeCapability: vi.fn(() => false),
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability:
    desktopRuntimeMock.hasDesktopHostInvokeCapability,
}));

describe("hasNativeStartupScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: (time: number) => void) =>
        window.setTimeout(() => callback(performance.now()), 0),
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-lime-native-startup");
    document.documentElement.removeAttribute("data-lime-native-startup-ready");
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("Electron Desktop Host 可用且 URL 带标记时认为已有原生启动页接管", () => {
    desktopRuntimeMock.hasDesktopHostInvokeCapability.mockReturnValue(true);
    window.history.replaceState(null, "", "/?nativeStartup=1");

    expect(hasNativeStartupScreen()).toBe(true);
  });

  it("Electron Desktop Host 可用但没有 URL 标记时仍保留 React 启动画面", () => {
    desktopRuntimeMock.hasDesktopHostInvokeCapability.mockReturnValue(true);
    window.history.replaceState(null, "", "/");

    expect(hasNativeStartupScreen()).toBe(false);
  });

  it("浏览器模式保留 React 启动画面", () => {
    desktopRuntimeMock.hasDesktopHostInvokeCapability.mockReturnValue(false);
    window.history.replaceState(null, "", "/?nativeStartup=1");

    expect(hasNativeStartupScreen()).toBe(false);
  });

  it("主界面首帧准备后应淡出并移除 index.html 静态启动层", async () => {
    window.history.replaceState(null, "", "/?nativeStartup=1");
    document.documentElement.dataset.limeNativeStartup = "1";
    const overlay = document.createElement("main");
    overlay.setAttribute("data-lime-startup-shell", "");
    document.body.appendChild(overlay);

    hideNativeStartupOverlayWhenReady();

    expect(document.querySelector("[data-lime-startup-shell]")).toBe(overlay);
    expect(document.documentElement.dataset.limeNativeStartupReady).toBe(
      undefined,
    );

    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(document.documentElement.dataset.limeNativeStartupReady).toBe("1");
    expect(document.querySelector("[data-lime-startup-shell]")).toBe(overlay);

    await vi.advanceTimersByTimeAsync(180);

    expect(document.querySelector("[data-lime-startup-shell]")).toBeNull();
    expect(document.documentElement.dataset.limeNativeStartup).toBe(undefined);
    expect(document.documentElement.dataset.limeNativeStartupReady).toBe(
      undefined,
    );
  });
});
