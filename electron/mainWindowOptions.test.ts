import { describe, expect, it } from "vitest";

import {
  buildMainWindowChromeOptions,
  buildMainWindowStartupDataUrl,
  buildMainWindowStartupHtml,
  buildMainWindowStartupOptions,
} from "./mainWindowOptions";

describe("main window chrome options", () => {
  it("主窗口应先隐藏并使用稳定底色，等待启动页首帧后再显示", () => {
    expect(buildMainWindowStartupOptions()).toEqual({
      backgroundColor: "#f7fbf4",
      show: false,
    });
  });

  it("启动页应在 renderer 加载前展示与 React Splash 一致的 Logo 和文案", () => {
    const html = buildMainWindowStartupHtml({
      appName: "Lime",
      iconDataUrl: "data:image/png;base64,abc",
    });

    expect(html).toContain('data-lime-startup-shell');
    expect(html).toContain('class="startup-logo"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).toContain("青柠一下，灵感即来");
    expect(html).toContain("从一句想法，到成稿、成图、成片、成事");
    expect(html).toContain("startup-progress-track");
    expect(html).toContain("#f7fbf4");
  });

  it("启动页 HTML 应转义动态字段并能转换成 data URL", () => {
    const html = buildMainWindowStartupHtml({
      appName: 'Lime <Dev> "Fast"',
      iconDataUrl: null,
    });
    const dataUrl = buildMainWindowStartupDataUrl(html);

    expect(html).toContain("Lime &lt;Dev&gt; &quot;Fast&quot;");
    expect(html).not.toContain('Lime <Dev> "Fast"');
    expect(html).toContain("startup-logo-fallback");
    expect(dataUrl.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(dataUrl.split(",", 2)[1] ?? "")).toBe(html);
  });

  it("启动页文案应支持 Electron 侧五语言选择", () => {
    const html = buildMainWindowStartupHtml({
      appName: "Lime",
      iconDataUrl: null,
      locale: "en-US",
    });

    expect(html).toContain("Tap Lime, inspiration arrives");
    expect(html).toContain(
      "From one thought to polished copy, images, videos, and finished work",
    );
  });

  it("macOS 主窗口隐藏系统标题栏并保留红绿灯按钮", () => {
    expect(buildMainWindowChromeOptions("darwin")).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 18, y: 18 },
    });
  });

  it("非 macOS 平台沿用系统默认窗口 chrome", () => {
    expect(buildMainWindowChromeOptions("win32")).toEqual({});
    expect(buildMainWindowChromeOptions("linux")).toEqual({});
  });
});
