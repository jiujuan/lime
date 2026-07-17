import { useEffect, useState } from "react";
import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  loadLimeColorSchemeId,
  resolveLimeColorSchemeId,
  type LimeColorSchemeId,
} from "@/lib/appearance/colorSchemes";
import dreamBlossomHero from "@/assets/skins/dream-blossom/home-hero.webp";
import limeClassicHero from "@/assets/skins/home-artwork/lime-classic-hero.png";
import limeForestHero from "@/assets/skins/home-artwork/lime-forest-hero.png";
import limeOceanHero from "@/assets/skins/home-artwork/lime-ocean-hero.png";
import limeSandHero from "@/assets/skins/home-artwork/lime-sand-hero.png";
import limeNeonHero from "@/assets/skins/home-artwork/lime-neon-hero.png";
import limeCitronHero from "@/assets/skins/home-artwork/lime-citron-hero.png";
import limeDuskHero from "@/assets/skins/home-artwork/lime-dusk-hero.png";
import limeVividHero from "@/assets/skins/home-artwork/lime-vivid-hero.png";
import limeLiteraryHero from "@/assets/skins/home-artwork/lime-literary-hero.png";
import limeLuxuryHero from "@/assets/skins/home-artwork/lime-luxury-hero.png";
import limeFutureHero from "@/assets/skins/home-artwork/lime-future-hero.png";
import portalHero from "@/assets/skins/home-artwork/portal-hero.png";

export type HomeSkinTone = "light" | "dark";

export interface HomeSkinPresentation {
  skinId: LimeColorSchemeId;
  image: string;
  artFit: "cover" | "contain";
  tone: HomeSkinTone;
  artPosition: string;
  artPositionMobile: string;
  artFilter: string;
  artBlendLeft?: string;
  artBlendWidth?: string;
  scrim: string;
  fallback: string;
  border: string;
  shadow: string;
  contentWidth: string;
  titleMaxWidth: string;
}

type HomeSkinPresentationTokens = Omit<HomeSkinPresentation, "skinId">;

const LIGHT_SCRIM = `linear-gradient(
  90deg,
  rgba(255, 251, 252, 0.98) 0%,
  rgba(255, 248, 251, 0.92) 32%,
  rgba(255, 245, 249, 0.62) 48%,
  rgba(255, 245, 249, 0.08) 68%,
  transparent 82%
), linear-gradient(0deg, rgba(82, 34, 52, 0.12), transparent 38%)`;

const DARK_SCRIM = `linear-gradient(
  90deg,
  rgba(7, 9, 16, 0.92) 0%,
  rgba(7, 9, 16, 0.76) 34%,
  rgba(7, 9, 16, 0.3) 58%,
  rgba(7, 9, 16, 0.04) 82%,
  transparent 100%
), linear-gradient(0deg, rgba(4, 6, 12, 0.32), transparent 42%)`;

const FORTUNE_SCRIM = `linear-gradient(
  90deg,
  rgba(255, 250, 240, 0.86) 0%,
  rgba(255, 248, 235, 0.62) 30%,
  rgba(255, 246, 231, 0.16) 48%,
  transparent 62%
), linear-gradient(0deg, rgba(145, 36, 28, 0.08), transparent 38%)`;

const SOFT_LIGHT_SCRIM = `linear-gradient(
  90deg,
  rgba(255, 255, 255, 0.9) 0%,
  rgba(255, 255, 255, 0.68) 30%,
  rgba(255, 255, 255, 0.16) 48%,
  transparent 62%
), linear-gradient(0deg, rgba(45, 55, 72, 0.06), transparent 38%)`;

const HOME_SKIN_PRESENTATIONS: Record<
  LimeColorSchemeId,
  HomeSkinPresentationTokens
> = {
  "dream-blossom": {
    image: dreamBlossomHero,
    artFit: "cover",
    tone: "light",
    artPosition: "58% top",
    artPositionMobile: "66% top",
    artFilter: "none",
    scrim: LIGHT_SCRIM,
    fallback: "#fbe8ef",
    border: "rgba(239, 194, 210, 0.96)",
    shadow:
      "0 28px 54px -42px rgba(91, 43, 62, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "9ch",
  },
  "lime-classic": {
    image: limeClassicHero,
    artFit: "cover",
    tone: "dark",
    artPosition: "64% center",
    artPositionMobile: "70% center",
    artFilter: "hue-rotate(12deg) saturate(0.88) brightness(1.08)",
    scrim: DARK_SCRIM,
    fallback: "#10251c",
    border: "rgba(127, 209, 185, 0.38)",
    shadow:
      "0 28px 54px -42px rgba(4, 25, 19, 0.72), inset 0 1px 0 rgba(232, 245, 238, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-forest": {
    image: limeForestHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.06) brightness(1.02)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: FORTUNE_SCRIM,
    fallback: "#f7ecd8",
    border: "rgba(196, 60, 47, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(111, 47, 25, 0.42), inset 0 1px 0 rgba(255, 249, 235, 0.84)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
  "lime-ocean": {
    image: limeOceanHero,
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.06) brightness(1.02)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: DARK_SCRIM,
    fallback: "#0a1426",
    border: "rgba(45, 225, 194, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(3, 19, 35, 0.76), inset 0 1px 0 rgba(234, 244, 255, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-sand": {
    image: limeSandHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) contrast(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f5e8dc",
    border: "rgba(255, 179, 71, 0.46)",
    shadow:
      "0 28px 54px -42px rgba(38, 22, 10, 0.78), inset 0 1px 0 rgba(255, 243, 230, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-neon": {
    image: limeNeonHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f0fbfd",
    border: "rgba(22, 224, 255, 0.48)",
    shadow:
      "0 28px 54px -42px rgba(9, 3, 24, 0.8), inset 0 1px 0 rgba(234, 252, 255, 0.16)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-citron": {
    image: limeCitronHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) brightness(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f6fbdc",
    border: "rgba(132, 204, 22, 0.46)",
    shadow:
      "0 28px 54px -42px rgba(22, 35, 10, 0.72), inset 0 1px 0 rgba(247, 255, 220, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-dusk": {
    image: limeDuskHero,
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) contrast(1.02)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: DARK_SCRIM,
    fallback: "#20170f",
    border: "rgba(224, 157, 92, 0.44)",
    shadow:
      "0 28px 54px -42px rgba(42, 24, 14, 0.78), inset 0 1px 0 rgba(255, 243, 230, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
  },
  "lime-minimal": {
    image: portalHero,
    artFit: "cover",
    tone: "light",
    artPosition: "68% center",
    artPositionMobile: "78% center",
    artFilter: "grayscale(0.82) contrast(0.9) brightness(1.04)",
    scrim: LIGHT_SCRIM,
    fallback: "#edf1f4",
    border: "rgba(148, 163, 184, 0.6)",
    shadow:
      "0 28px 54px -42px rgba(15, 23, 42, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
  "lime-vivid": {
    image: limeVividHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#fff3ef",
    border: "rgba(240, 96, 122, 0.5)",
    shadow:
      "0 28px 54px -42px rgba(126, 45, 72, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
  "lime-literary": {
    image: limeLiteraryHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(0.96) contrast(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f4f7f5",
    border: "rgba(139, 122, 184, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(61, 55, 91, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
  "lime-luxury": {
    image: limeLuxuryHero,
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.02)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: DARK_SCRIM,
    fallback: "#0e1128",
    border: "rgba(134, 105, 246, 0.48)",
    shadow:
      "0 28px 54px -42px rgba(56, 43, 17, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
  "lime-future": {
    image: limeFutureHero,
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.03) contrast(1.01)",
    artBlendLeft: "48%",
    artBlendWidth: "16%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f1f2f4",
    border: "rgba(213, 47, 61, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(89, 30, 38, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.86)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
  },
};

export function getHomeSkinPresentation(
  skinId: string | null | undefined,
): HomeSkinPresentation {
  const resolvedSkinId = resolveLimeColorSchemeId(skinId);
  return {
    skinId: resolvedSkinId,
    ...(HOME_SKIN_PRESENTATIONS[resolvedSkinId] ??
      HOME_SKIN_PRESENTATIONS["dream-blossom"]),
  };
}

export function useHomeSkinPresentation(): HomeSkinPresentation {
  const [presentation, setPresentation] = useState<HomeSkinPresentation>(() =>
    getHomeSkinPresentation(loadLimeColorSchemeId()),
  );

  useEffect(() => {
    const handleSkinChange = (event: Event) => {
      const detail = (event as CustomEvent<{ colorSchemeId?: string }>).detail;
      setPresentation(
        getHomeSkinPresentation(
          detail?.colorSchemeId ?? loadLimeColorSchemeId(),
        ),
      );
    };
    window.addEventListener(LIME_COLOR_SCHEME_CHANGED_EVENT, handleSkinChange);
    return () =>
      window.removeEventListener(
        LIME_COLOR_SCHEME_CHANGED_EVENT,
        handleSkinChange,
      );
  }, []);

  return presentation;
}
