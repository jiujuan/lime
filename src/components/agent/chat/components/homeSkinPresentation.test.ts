import { describe, expect, it } from "vitest";
import { LIME_COLOR_SCHEMES } from "@/lib/appearance/colorSchemes";
import { getHomeSkinPresentation } from "./homeSkinPresentation";

describe("homeSkinPresentation", () => {
  it("梦樱应使用独立背景和破框人物层", () => {
    const presentation = getHomeSkinPresentation("dream-blossom");

    expect(presentation.image).toContain("home-hero-v3.webp");
    expect(presentation.foreground?.image).toContain("home-character-v3.png");
    expect(presentation.heroDecorations?.leadingImage).toContain(
      "composer-rose.png",
    );
    expect(presentation.heroDecorations?.trailingIcon).toBe("sparkles");
    expect(presentation.composerDecorations?.accentIcon).toBe("heart");
    expect(presentation.composerDecorations?.ornamentImage).toContain(
      "composer-rose.png",
    );
    expect(presentation.composerDecorations?.keepsakeImage).toContain(
      "home-character-v3.png",
    );
    expect(presentation.tone).toBe("light");
    expect(presentation.artPosition).toBe("50% center");
    expect(presentation.stageHeightWide).toBe("430px");
    expect(presentation.foreground?.top).toBe("auto");
    expect(presentation.foreground?.bottom).toBe("-1px");
    expect(presentation.breakoutSpace).toBe("30px");
    expect(presentation.foreground?.motion?.kind).toBe("portrait-breathe");
    expect(presentation.foreground?.motion?.duration).toBe("4.8s");
  });

  it("不同皮肤应使用对应的图片族和明暗构图", () => {
    expect(getHomeSkinPresentation("lime-classic").image).toContain(
      "lime-classic-hero.png",
    );
    expect(getHomeSkinPresentation("lime-forest").image).toContain(
      "lime-forest-hero.png",
    );
    expect(getHomeSkinPresentation("lime-forest").scrim).toContain(
      "255, 250, 240",
    );
    expect(getHomeSkinPresentation("lime-forest").artPosition).toBe(
      "100% center",
    );
    expect(getHomeSkinPresentation("lime-forest").artFit).toBe("contain");
    expect(getHomeSkinPresentation("lime-forest").foreground?.width).toBe(
      "46%",
    );
    expect(getHomeSkinPresentation("lime-forest").foreground?.bottom).toBe(
      "-2px",
    );
    expect(getHomeSkinPresentation("lime-forest").artBlendWidth).toBe("68%");
    expect(getHomeSkinPresentation("lime-luxury").artBlendWidth).toBe("68%");
    expect(getHomeSkinPresentation("lime-ocean").image).toContain(
      "lime-ocean-hero.png",
    );
    expect(
      getHomeSkinPresentation("lime-ocean").heroDecorations?.trailingIcon,
    ).toBe("shield");
    expect(
      getHomeSkinPresentation("lime-ocean").composerDecorations?.keepsakeImage,
    ).toContain("lime-ocean-foreground.png");
    expect(getHomeSkinPresentation("lime-ocean").artFit).toBe("contain");
    expect(getHomeSkinPresentation("lime-ocean").foreground?.width).toBe("47%");
    expect(getHomeSkinPresentation("lime-ocean").foreground?.bottom).toBe(
      "-2px",
    );
    expect(getHomeSkinPresentation("lime-sand").image).toContain(
      "lime-sand-hero.png",
    );
    expect(getHomeSkinPresentation("lime-neon").image).toContain(
      "lime-neon-hero.png",
    );
    expect(getHomeSkinPresentation("lime-neon").foreground?.motion?.kind).toBe(
      "stage-sway",
    );
    expect(
      getHomeSkinPresentation("lime-neon").foreground?.motion?.duration,
    ).toBe("5.2s");
    expect(getHomeSkinPresentation("lime-citron").image).toContain(
      "lime-citron-hero.png",
    );
    expect(getHomeSkinPresentation("lime-dusk").image).toContain(
      "lime-dusk-hero.png",
    );
    expect(getHomeSkinPresentation("lime-literary").image).toContain(
      "lime-literary-hero.png",
    );
    expect(getHomeSkinPresentation("lime-minimal").image).toContain(
      "portal-hero.png",
    );
    expect(getHomeSkinPresentation("lime-forest").tone).toBe("light");
    expect(getHomeSkinPresentation("lime-vivid").tone).toBe("light");
    expect(getHomeSkinPresentation("lime-vivid").image).toContain(
      "lime-vivid-hero.png",
    );
    expect(getHomeSkinPresentation("lime-future").image).toContain(
      "lime-future-hero.png",
    );
    expect(getHomeSkinPresentation("lime-luxury").image).toContain(
      "lime-luxury-hero.png",
    );
    expect(getHomeSkinPresentation("lime-luxury").foreground?.width).toBe(
      "48%",
    );
    expect(getHomeSkinPresentation("lime-luxury").foreground?.bottom).toBe(
      "-1px",
    );
  });

  it("每套皮肤都应使用独立 Hero 素材", () => {
    const images = LIME_COLOR_SCHEMES.map(
      (scheme) => getHomeSkinPresentation(scheme.id).image,
    );

    expect(new Set(images).size).toBe(LIME_COLOR_SCHEMES.length);
  });

  it("每套皮肤都应声明独立的首页装饰组合", () => {
    const decorations = LIME_COLOR_SCHEMES.map((scheme) =>
      getHomeSkinPresentation(scheme.id),
    );

    expect(
      decorations.every(
        (presentation) =>
          Boolean(presentation.heroDecorations?.trailingIcon) &&
          Boolean(presentation.composerDecorations?.accentIcon) &&
          Boolean(presentation.foreground?.image) &&
          Boolean(presentation.composerDecorations?.keepsakeImage) &&
          Boolean(presentation.composerDecorations?.keepsakeVariant),
      ),
    ).toBe(true);
    expect(
      new Set(
        decorations.map(
          (presentation) => presentation.composerDecorations?.keepsakeImage,
        ),
      ).size,
    ).toBe(LIME_COLOR_SCHEMES.length);
    expect(
      new Set(
        decorations.map(
          (presentation) => presentation.heroDecorations?.trailingIcon,
        ),
      ).size,
    ).toBe(LIME_COLOR_SCHEMES.length);
  });

  it("每套皮肤都应声明可破框的独立前景布局", () => {
    const foregrounds = LIME_COLOR_SCHEMES.map(
      (scheme) => getHomeSkinPresentation(scheme.id).foreground,
    );

    expect(foregrounds.every((foreground) => Boolean(foreground?.image))).toBe(
      true,
    );
    expect(
      new Set(foregrounds.map((foreground) => foreground?.image)).size,
    ).toBe(LIME_COLOR_SCHEMES.length);
    expect(
      foregrounds.every(
        (foreground) =>
          Boolean(foreground?.top) &&
          Boolean(foreground?.topMobile) &&
          Boolean(foreground?.width) &&
          Boolean(foreground?.widthMobile),
      ),
    ).toBe(true);
    expect(
      foregrounds.every(
        (foreground) =>
          Boolean(foreground?.motion?.kind) &&
          /^\d+(\.\d+)?s$/.test(foreground?.motion?.duration ?? ""),
      ),
    ).toBe(true);
    expect(
      new Set(foregrounds.map((foreground) => foreground?.motion?.kind)).size,
    ).toBe(11);
  });

  it("人物类前景应使用底边锚定避免身体切面悬空", () => {
    const characterSkins = [
      "dream-blossom",
      "lime-forest",
      "lime-ocean",
      "lime-sand",
      "lime-neon",
      "lime-citron",
      "lime-dusk",
      "lime-vivid",
      "lime-literary",
      "lime-luxury",
    ] as const;

    expect(
      characterSkins.every((skinId) => {
        const foreground = getHomeSkinPresentation(skinId).foreground;
        return (
          foreground?.top === "auto" &&
          foreground.topMobile === "auto" &&
          Boolean(foreground.bottom) &&
          Boolean(foreground.bottomMobile)
        );
      }),
    ).toBe(true);
  });

  it("hero 外框和阴影应跟随皮肤色调", () => {
    const dream = getHomeSkinPresentation("dream-blossom");
    const ocean = getHomeSkinPresentation("lime-ocean");
    const luxury = getHomeSkinPresentation("lime-luxury");

    expect(dream.border).toContain("239, 194, 210");
    expect(ocean.border).toContain("45, 225, 194");
    expect(luxury.border).toContain("134, 105, 246");
    expect(new Set([dream.shadow, ocean.shadow, luxury.shadow]).size).toBe(3);
  });

  it("未知皮肤应回退到梦樱构图", () => {
    const presentation = getHomeSkinPresentation("unknown");
    expect(presentation.skinId).toBe("dream-blossom");
    expect(presentation.image).toContain("home-hero-v3.webp");
    expect(presentation.foreground?.image).toContain("home-character-v3.png");
  });
});
