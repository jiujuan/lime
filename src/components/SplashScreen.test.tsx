import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { SplashScreen } from "./SplashScreen";

const startupWindowRevealMock = vi.hoisted(() => ({
  revealStartupWindowWhenReady: vi.fn(),
}));

vi.mock("@/lib/startupWindowReveal", () => startupWindowRevealMock);

interface MountedSplash {
  container: HTMLDivElement;
  root: Root;
}

const mountedSplashes: MountedSplash[] = [];

function renderSplash() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<SplashScreen onComplete={() => {}} duration={10_000} />);
  });

  const mounted = { container, root };
  mountedSplashes.push(mounted);
  return mounted;
}

describe("SplashScreen", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    for (const item of mountedSplashes.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
    startupWindowRevealMock.revealStartupWindowWhenReady.mockClear();
    await changeLimeLocale("zh-CN");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("首帧应内联关键居中样式，避免样式注入前 Logo 闪到左上角", () => {
    const { container } = renderSplash();

    const splash = container.querySelector(
      '[data-testid="splash-screen"]',
    ) as HTMLDivElement | null;
    const logo = container.querySelector(
      'img[alt="Lime"]',
    ) as HTMLImageElement | null;
    const logoStack = logo?.parentElement as HTMLDivElement | null;
    const stage = logoStack?.parentElement as HTMLDivElement | null;

    expect(splash?.style.position).toBe("fixed");
    expect(splash?.style.display).toBe("flex");
    expect(splash?.style.alignItems).toBe("center");
    expect(splash?.style.justifyContent).toBe("center");
    expect(stage?.style.alignItems).toBe("center");
    expect(stage?.style.justifyContent).toBe("center");
    expect(logoStack?.style.display).toBe("flex");
    expect(logoStack?.style.alignItems).toBe("center");
    expect(logoStack?.style.justifyContent).toBe("center");
    expect(logo?.hasAttribute("data-lime-startup-logo")).toBe(true);
    expect(logo?.style.objectFit).toBe("contain");
  });

  it("启动画面文案应走 common namespace 英文资源", () => {
    const { container } = renderSplash();

    expect(container.textContent).toContain("Tap Lime, inspiration arrives");
    expect(container.textContent).toContain(
      "From one thought to polished copy, images, videos, and finished work",
    );
    expect(container.textContent).not.toContain("青柠一下");
    expect(container.textContent).not.toContain("成稿、成图");
  });

  it("首帧布局完成后应请求展示隐藏的 Tauri 主窗口", () => {
    renderSplash();

    expect(
      startupWindowRevealMock.revealStartupWindowWhenReady,
    ).toHaveBeenCalledTimes(1);
  });
});
