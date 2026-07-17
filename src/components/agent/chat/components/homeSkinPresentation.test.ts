import { describe, expect, it } from "vitest";
import { LIME_COLOR_SCHEMES } from "@/lib/appearance/colorSchemes";
import { getHomeSkinPresentation } from "./homeSkinPresentation";

describe("homeSkinPresentation", () => {
  it("梦樱保留当前人物 hero", () => {
    const presentation = getHomeSkinPresentation("dream-blossom");

    expect(presentation.image).toContain("home-hero.webp");
    expect(presentation.tone).toBe("light");
    expect(presentation.artPosition).toBe("58% top");
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
    expect(getHomeSkinPresentation("lime-forest").artBlendLeft).toBe("48%");
    expect(getHomeSkinPresentation("lime-luxury").artBlendWidth).toBe("16%");
    expect(getHomeSkinPresentation("lime-ocean").image).toContain(
      "lime-ocean-hero.png",
    );
    expect(getHomeSkinPresentation("lime-ocean").artFit).toBe("contain");
    expect(getHomeSkinPresentation("lime-sand").image).toContain(
      "lime-sand-hero.png",
    );
    expect(getHomeSkinPresentation("lime-neon").image).toContain(
      "lime-neon-hero.png",
    );
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
  });

  it("每套皮肤都应使用独立 Hero 素材", () => {
    const images = LIME_COLOR_SCHEMES.map(
      (scheme) => getHomeSkinPresentation(scheme.id).image,
    );

    expect(new Set(images).size).toBe(LIME_COLOR_SCHEMES.length);
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
    expect(presentation.image).toContain("home-hero.webp");
  });
});
