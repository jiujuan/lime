import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIME_COLOR_SCHEME_CHANGED_EVENT } from "@/lib/appearance/colorSchemes";
import { EmptyStateLayout } from "./EmptyStateLayout";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const heroCopy = {
  eyebrow: "创作",
  slogan: "青柠一下，灵感即来",
  description: "",
  supportingDescription: "",
};

const chromeCopy = {
  starterRowLabel: "起手",
  starterManagerLabel: "管理",
  guideCardsLabel: "引导",
  moreSkillsDrawerLabel: "更多",
  galleryTitle: "更多做法",
  secondScreenLabel: "更多做法",
  projectConversationsMoreLabel: (count: number) => `更多 ${count} 个对话`,
  recentSessionDefaultActionLabel: "继续",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
});

function renderLayout() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <EmptyStateLayout
        heroCopy={heroCopy}
        chromeCopy={chromeCopy}
        prioritySlot={<div data-testid="priority-slot">输入区</div>}
        isGeneralTheme
        galleryItems={[]}
        onSelectGalleryItem={vi.fn()}
      />,
    );
  });

  return host;
}

describe("EmptyStateLayout", () => {
  it("首屏应展示 Dream Blossom 主视觉并保留原生输入区", () => {
    const container = renderLayout();
    const firstScreen = container.querySelector(
      '[data-testid="empty-state-first-screen"]',
    ) as HTMLElement | null;
    const artwork = container.querySelector(
      '[data-testid="dream-blossom-home-artwork"]',
    );
    const prioritySlot = container.querySelector(
      '[data-testid="priority-slot"]',
    );

    expect(firstScreen).toBeTruthy();
    expect(artwork).toBeTruthy();
    expect(firstScreen?.textContent).toContain("青柠一下，灵感即来");
    expect(firstScreen?.contains(prioritySlot)).toBe(true);
    expect(artwork?.querySelector("img")?.getAttribute("src")).toContain(
      "home-hero-v3.webp",
    );
  });

  it("切换皮肤时应实时更换首页 hero 图片", () => {
    const container = renderLayout();
    const artworkStage = container.querySelector(
      '[data-testid="dream-blossom-home-artwork"]',
    ) as HTMLElement | null;
    const artwork = artworkStage?.querySelector("img");

    expect(artwork?.getAttribute("src")).toContain("home-hero-v3.webp");
    expect(
      artworkStage
        ?.querySelector('[data-testid="home-hero-foreground"] img')
        ?.getAttribute("src"),
    ).toContain("home-character-v3.png");
    expect(
      artworkStage
        ?.querySelector('[data-testid="home-hero-foreground"]')
        ?.getAttribute("data-home-hero-motion"),
    ).toBe("portrait-breathe");
    expect(
      artworkStage?.style.getPropertyValue("--home-hero-motion-duration"),
    ).toBe("4.8s");
    expect(
      artworkStage?.style.getPropertyValue("--home-hero-stage-height-wide"),
    ).toBe("430px");
    expect(
      artworkStage?.style.getPropertyValue("--home-hero-foreground-top"),
    ).toBe("-56px");

    act(() => {
      window.dispatchEvent(
        new CustomEvent(LIME_COLOR_SCHEME_CHANGED_EVENT, {
          detail: { colorSchemeId: "lime-ocean" },
        }),
      );
    });

    expect(artwork?.getAttribute("src")).toContain("lime-ocean-hero.png");
    expect(
      artworkStage?.querySelector(
        '[data-testid="home-hero-foreground"] img[src*="lime-ocean-foreground.png"]',
      ),
    ).toBeTruthy();
    expect(artworkStage?.getAttribute("data-home-skin-tone")).toBe("dark");
    expect(
      artworkStage
        ?.querySelector('[data-testid="home-hero-foreground"]')
        ?.getAttribute("data-home-hero-foreground-skin"),
    ).toBe("lime-ocean");
    expect(
      artworkStage
        ?.querySelector('[data-testid="home-hero-foreground"]')
        ?.getAttribute("data-home-hero-motion"),
    ).toBe("power-pulse");
    expect(
      artworkStage?.style.getPropertyValue("--home-hero-art-blend-width"),
    ).toBe("68%");
    expect(
      artworkStage?.style.getPropertyValue("--home-hero-art-blend-left"),
    ).toBe("");
  });
});
