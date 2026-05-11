import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIME_BRAND_NAME } from "@/lib/branding";
import { changeLimeLocale } from "./createI18n";
import { StartupLoadingScreen } from "./StartupLoadingScreen";

interface MountedScreen {
  container: HTMLDivElement;
  root: Root;
}

const mountedScreens: MountedScreen[] = [];

function renderStartupLoadingScreen(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<StartupLoadingScreen />);
  });

  mountedScreens.push({ container, root });
  return container;
}

describe("StartupLoadingScreen", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    while (mountedScreens.length > 0) {
      const mounted = mountedScreens.pop();
      if (!mounted) {
        continue;
      }
      act(() => mounted.root.unmount());
      mounted.container.remove();
    }
    document.body.replaceChildren();
    await changeLimeLocale("zh-CN");
  });

  it("启动加载屏文案应走 common namespace 英文资源", () => {
    const container = renderStartupLoadingScreen();

    expect(container.textContent).toContain(`Starting ${LIME_BRAND_NAME}`);
    expect(container.textContent).toContain(
      "Preparing language settings and workspace entry. Please wait.",
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      LIME_BRAND_NAME,
    );
    expect(container.textContent).not.toContain("正在启动");
    expect(container.textContent).not.toContain("语言配置");
  });
});
