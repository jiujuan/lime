import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { MediaPlaybackResourceRenderer } from "./MediaPlaybackResourceRenderer";
import type { ResourceManagerItem } from "./types";

const mountedRenderers: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderMedia(item: ResourceManagerItem) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<MediaPlaybackResourceRenderer item={item} />);
  });

  mountedRenderers.push({ root, container });
  return container;
}

describe("MediaPlaybackResourceRenderer", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    for (const item of mountedRenderers.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
    await changeLimeLocale("zh-CN");
    vi.unstubAllGlobals();
  });

  it("音频默认标题、控制说明与不支持提示应走 workspace 英文资源", () => {
    const container = renderMedia({
      id: "audio-default",
      kind: "audio",
      src: "asset://audio-source",
    });

    expect(container.textContent).toContain("Media playback");
    expect(container.textContent).toContain("WebView native audio controls");
    expect(container.textContent).toContain(
      "This environment does not support audio playback.",
    );
    expect(container.textContent).not.toContain("媒体播放");
    expect(container.textContent).not.toContain("WebView 原生音频控制");
    expect(container.textContent).not.toContain("当前环境不支持音频播放");
  });

  it("播放失败空态应走 workspace 英文资源，runtime 标题仍可覆盖", () => {
    const container = renderMedia({
      id: "video-runtime",
      kind: "video",
      title: "Launch Teaser",
      src: "asset://video-source",
    });

    expect(container.textContent).toContain(
      "This environment does not support video playback.",
    );
    const video = container.querySelector(
      '[data-testid="resource-manager-video-player"]',
    );

    act(() => {
      video?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(container.textContent).toContain("Video cannot be played yet");
    expect(container.textContent).toContain(
      "The current media address cannot be read by the WebView native player.",
    );
    expect(container.textContent).not.toContain("视频暂时无法播放");
    expect(container.textContent).not.toContain("当前媒体地址无法被 WebView");
    expect(container.textContent).not.toContain("Launch Teaser");
  });
});
