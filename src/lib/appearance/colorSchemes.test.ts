import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIME_COLOR_SCHEME_ID,
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  LIME_COLOR_SCHEMES,
  LIME_COLOR_SCHEME_STORAGE_KEY,
  applyLimeColorScheme,
  persistLimeColorScheme,
  resolveLimeColorSchemeId,
} from "./colorSchemes";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-lime-theme-effective");
  document.documentElement.removeAttribute("data-lime-color-scheme");
  document.documentElement.removeAttribute("data-lime-skin");
  document.documentElement.removeAttribute("style");
});

describe("colorSchemes", () => {
  it("未知皮肤应回退到 Dream Blossom", () => {
    expect(resolveLimeColorSchemeId("unknown")).toBe(
      DEFAULT_LIME_COLOR_SCHEME_ID,
    );
    expect(resolveLimeColorSchemeId(null)).toBe(DEFAULT_LIME_COLOR_SCHEME_ID);
  });

  it("应提供参考图中的完整预设配色矩阵", () => {
    expect(LIME_COLOR_SCHEMES.map((scheme) => scheme.label)).toEqual([
      "梦樱花境",
      "森野秘境",
      "财神打工",
      "奥特曼守护",
      "东方国潮",
      "初音未来",
      "灵感少年",
      "黑金舞台",
      "极简未来",
      "爆燃涂鸦",
      "清透少年",
      "蓝紫星夜",
      "红白未来城",
    ]);
    expect(
      LIME_COLOR_SCHEMES.every((scheme) => scheme.swatches.length === 3),
    ).toBe(true);
  });

  it("应用配色时应写入根节点 dataset 与 CSS 变量", () => {
    const resolvedId = applyLimeColorScheme("lime-sand");

    expect(resolvedId).toBe("lime-sand");
    expect(document.documentElement.dataset.limeColorScheme).toBe("lime-sand");
    expect(
      document.documentElement.style.getPropertyValue("--lime-chrome-rail"),
    ).toBe("#f0ddd0");
    expect(
      document.documentElement.style.getPropertyValue("--lime-stage-surface"),
    ).toContain("#f5e8dc");
    expect(
      document.documentElement.style.getPropertyValue(
        "--lime-chrome-stage-blend",
      ),
    ).toContain("#f5e8dc");
    expect(
      document.documentElement.style.getPropertyValue(
        "--lime-chrome-stage-seam",
      ),
    ).toBe("#c98774");
    expect(
      document.documentElement.style.getPropertyValue("--lime-sidebar-surface"),
    ).toContain("#f0ddd0");
  });

  it("Dream Blossom 应作为默认全局皮肤覆盖应用外壳", () => {
    const resolvedId = applyLimeColorScheme(null);

    expect(resolvedId).toBe("dream-blossom");
    expect(document.documentElement.dataset.limeSkin).toBe("dream-blossom");
    expect(
      document.documentElement.style.getPropertyValue("--lime-app-bg"),
    ).toBe("#fdf3f7");
    expect(
      document.documentElement.style.getPropertyValue("--lime-sidebar-active"),
    ).toBe("#fde7ef");
  });

  it("Dream Blossom 深色模式应使用独立酒红 token", () => {
    applyLimeColorScheme("dream-blossom", { effectiveThemeMode: "dark" });

    expect(
      document.documentElement.style.getPropertyValue("--lime-app-bg"),
    ).toBe("#160f14");
    expect(
      document.documentElement.style.getPropertyValue("--lime-brand"),
    ).toBe("#ec8eae");
  });

  it("深色主题下切换配色时应继续保留深色表面变量", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.limeThemeEffective = "dark";

    const resolvedId = applyLimeColorScheme("lime-ocean");

    expect(resolvedId).toBe("lime-ocean");
    expect(document.documentElement.dataset.limeColorScheme).toBe("lime-ocean");
    expect(
      document.documentElement.style.getPropertyValue("--lime-app-bg"),
    ).toBe("#0b1120");
    expect(
      document.documentElement.style.getPropertyValue("--lime-surface"),
    ).toBe("#0f172a");
    expect(
      document.documentElement.style.getPropertyValue("--lime-brand-strong"),
    ).toBe("#86efac");
  });

  it("持久化配色时应写 localStorage 并派发变更事件", () => {
    const listener = vi.fn();
    window.addEventListener(LIME_COLOR_SCHEME_CHANGED_EVENT, listener);

    const resolvedId = persistLimeColorScheme("lime-luxury");

    expect(resolvedId).toBe("lime-luxury");
    expect(localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "lime-luxury",
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      detail: { colorSchemeId: "lime-luxury" },
    });

    window.removeEventListener(LIME_COLOR_SCHEME_CHANGED_EVENT, listener);
  });
});
