import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetStartupWindowRevealForTest,
  revealStartupWindowWhenReady,
} from "./startupWindowReveal";

const desktopRuntimeMock = vi.hoisted(() => ({
  hasDesktopHostInvokeCapability: vi.fn(() => true),
}));

const currentWindowMock = vi.hoisted(() => ({
  unminimize: vi.fn().mockResolvedValue(undefined),
  maximize: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  setFocus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/desktop-runtime", () => desktopRuntimeMock);

vi.mock("@/lib/desktop-host/window", () => ({
  getCurrentWindow: () => currentWindowMock,
}));

function appendLoadedStartupLogo() {
  const logo = document.createElement("img");
  logo.setAttribute("data-lime-startup-logo", "");
  Object.defineProperty(logo, "complete", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(logo, "naturalWidth", {
    configurable: true,
    value: 512,
  });
  document.body.appendChild(logo);
  return logo;
}

describe("revealStartupWindowWhenReady", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: (time: number) => void) => {
        return window.setTimeout(() => callback(performance.now()), 0);
      },
    );
    desktopRuntimeMock.hasDesktopHostInvokeCapability.mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetStartupWindowRevealForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("启动展示只显示和聚焦已准备窗口，不在可见链路再次触发最大化", async () => {
    appendLoadedStartupLogo();

    revealStartupWindowWhenReady();
    await vi.runAllTimersAsync();

    expect(currentWindowMock.unminimize).toHaveBeenCalledTimes(1);
    expect(currentWindowMock.show).toHaveBeenCalledTimes(1);
    expect(currentWindowMock.setFocus).toHaveBeenCalledTimes(1);
    expect(currentWindowMock.maximize).not.toHaveBeenCalled();
  });

  it("启动展示应等 viewport 尺寸连续稳定后再 show，避免最大化过程中的横向漂移", async () => {
    appendLoadedStartupLogo();

    let viewportWidth = 1200;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: () => viewportWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    revealStartupWindowWhenReady();

    await vi.advanceTimersByTimeAsync(0);
    expect(currentWindowMock.show).not.toHaveBeenCalled();

    viewportWidth = 1440;
    await vi.advanceTimersByTimeAsync(0);
    expect(currentWindowMock.show).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(currentWindowMock.show).toHaveBeenCalledTimes(1);
  });
});
