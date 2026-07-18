import { useEffect, useState } from "react";
import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  loadLimeColorSchemeId,
  resolveLimeColorSchemeId,
  type LimeColorSchemeId,
} from "@/lib/appearance/colorSchemes";
import dreamBlossomHero from "@/assets/skins/dream-blossom/home-hero-v3.webp";
import dreamBlossomCharacter from "@/assets/skins/dream-blossom/home-character-v3.png";
import dreamBlossomRose from "@/assets/skins/dream-blossom/composer-rose.png";
import limeClassicHero from "@/assets/skins/home-artwork/lime-classic-hero.png";
import limeClassicForeground from "@/assets/skins/home-artwork/lime-classic-foreground.png";
import limeForestHero from "@/assets/skins/home-artwork/lime-forest-hero.png";
import limeForestForeground from "@/assets/skins/home-artwork/lime-forest-foreground.png";
import limeOceanHero from "@/assets/skins/home-artwork/lime-ocean-hero.png";
import limeOceanForeground from "@/assets/skins/home-artwork/lime-ocean-foreground.png";
import limeSandHero from "@/assets/skins/home-artwork/lime-sand-hero.png";
import limeSandForeground from "@/assets/skins/home-artwork/lime-sand-foreground.png";
import limeNeonHero from "@/assets/skins/home-artwork/lime-neon-hero.png";
import limeNeonForeground from "@/assets/skins/home-artwork/lime-neon-foreground.png";
import limeCitronHero from "@/assets/skins/home-artwork/lime-citron-hero.png";
import limeCitronForeground from "@/assets/skins/home-artwork/lime-citron-foreground.png";
import limeDuskHero from "@/assets/skins/home-artwork/lime-dusk-hero.png";
import limeDuskForeground from "@/assets/skins/home-artwork/lime-dusk-foreground.png";
import limeVividHero from "@/assets/skins/home-artwork/lime-vivid-hero.png";
import limeVividForeground from "@/assets/skins/home-artwork/lime-vivid-foreground.png";
import limeLiteraryHero from "@/assets/skins/home-artwork/lime-literary-hero.png";
import limeLiteraryForeground from "@/assets/skins/home-artwork/lime-literary-foreground.png";
import limeLuxuryHero from "@/assets/skins/home-artwork/lime-luxury-hero.png";
import limeLuxuryForeground from "@/assets/skins/home-artwork/lime-luxury-foreground.png";
import limeFutureHero from "@/assets/skins/home-artwork/lime-future-hero.png";
import limeFutureForeground from "@/assets/skins/home-artwork/lime-future-foreground.png";
import portalHero from "@/assets/skins/home-artwork/portal-hero.png";
import portalForeground from "@/assets/skins/home-artwork/lime-minimal-foreground.png";

export type HomeSkinTone = "light" | "dark";

export type HomeComposerAccentIcon =
  | "heart"
  | "sparkles"
  | "star"
  | "leaf"
  | "coins"
  | "shield"
  | "sun"
  | "music"
  | "lightbulb"
  | "mic"
  | "circle"
  | "palette"
  | "book-open"
  | "gem"
  | "orbit";

export type HomeKeepsakeVariant =
  | "polaroid"
  | "ticket"
  | "badge"
  | "seal"
  | "poster"
  | "medallion"
  | "bookmark";

export type HomeHeroMotionKind =
  | "portrait-breathe"
  | "foliage-sway"
  | "cheer-bob"
  | "power-pulse"
  | "silk-drift"
  | "stage-sway"
  | "creative-tilt"
  | "street-beat"
  | "spotlight-breathe"
  | "portal-pulse"
  | "city-glide";

export interface HomeHeroMotion {
  kind: HomeHeroMotionKind;
  duration: string;
  delay?: string;
  distance?: string;
  rotate?: string;
  scale?: string;
  origin?: string;
  direction?: "normal" | "reverse";
  glow?: string;
}

export interface HomeHeroForeground {
  image: string;
  width: string;
  widthMobile?: string;
  top?: string;
  topMobile?: string;
  right?: string;
  rightMobile?: string;
  left?: string;
  leftMobile?: string;
  bottom?: string;
  bottomMobile?: string;
  transform?: string;
  transformMobile?: string;
  motion?: HomeHeroMotion;
}

export interface HomeComposerDecorations {
  accentIcon?: HomeComposerAccentIcon;
  ornamentImage?: string;
  keepsakeImage?: string;
  keepsakeVariant?: HomeKeepsakeVariant;
}

export interface HomeHeroDecorations {
  leadingImage?: string;
  trailingIcon?: HomeComposerAccentIcon;
}

export interface HomeSkinPresentation {
  skinId: LimeColorSchemeId;
  image: string;
  foreground?: HomeHeroForeground;
  heroDecorations?: HomeHeroDecorations;
  composerDecorations?: HomeComposerDecorations;
  artFit: "cover" | "contain";
  tone: HomeSkinTone;
  artPosition: string;
  artPositionMobile: string;
  artFilter: string;
  artBlendWidth?: string;
  scrim: string;
  fallback: string;
  border: string;
  shadow: string;
  contentWidth: string;
  titleMaxWidth: string;
  stageHeight?: string;
  stageHeightWide?: string;
  stageHeightMobile?: string;
  breakoutSpace?: string;
  breakoutSpaceMobile?: string;
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
    foreground: {
      image: dreamBlossomCharacter,
      width: "47%",
      widthMobile: "58%",
      top: "auto",
      topMobile: "auto",
      right: "4%",
      rightMobile: "1%",
      bottom: "-1px",
      bottomMobile: "-1px",
      motion: {
        kind: "portrait-breathe",
        duration: "4.8s",
        delay: "-1.2s",
        distance: "8px",
        scale: "1.025",
        origin: "65% 88%",
      },
    },
    heroDecorations: {
      leadingImage: dreamBlossomRose,
      trailingIcon: "sparkles",
    },
    composerDecorations: {
      accentIcon: "heart",
      ornamentImage: dreamBlossomRose,
      keepsakeImage: dreamBlossomCharacter,
      keepsakeVariant: "polaroid",
    },
    artFit: "cover",
    tone: "light",
    artPosition: "50% center",
    artPositionMobile: "56% center",
    artFilter: "none",
    scrim: LIGHT_SCRIM,
    fallback: "#fbe8ef",
    border: "rgba(239, 194, 210, 0.96)",
    shadow:
      "0 28px 54px -42px rgba(91, 43, 62, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "46%",
    titleMaxWidth: "12ch",
    stageHeight: "380px",
    stageHeightWide: "430px",
    stageHeightMobile: "350px",
    breakoutSpace: "30px",
    breakoutSpaceMobile: "20px",
  },
  "lime-classic": {
    image: limeClassicHero,
    foreground: {
      image: limeClassicForeground,
      width: "43%",
      widthMobile: "56%",
      top: "-58px",
      topMobile: "-34px",
      right: "-4%",
      rightMobile: "-10%",
      transform: "translate(2%, 2%) scale(0.94)",
      transformMobile: "translate(2%, 2%) scale(1.02)",
      motion: {
        kind: "foliage-sway",
        duration: "5.8s",
        distance: "8px",
        rotate: "2.4deg",
        origin: "44% 100%",
      },
    },
    heroDecorations: { trailingIcon: "leaf" },
    composerDecorations: {
      accentIcon: "leaf",
      keepsakeImage: limeClassicForeground,
      keepsakeVariant: "bookmark",
    },
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
    stageHeight: "360px",
    stageHeightWide: "400px",
    stageHeightMobile: "320px",
    breakoutSpace: "24px",
    breakoutSpaceMobile: "16px",
  },
  "lime-forest": {
    image: limeForestHero,
    foreground: {
      image: limeForestForeground,
      width: "46%",
      widthMobile: "61%",
      top: "auto",
      topMobile: "auto",
      right: "-2%",
      rightMobile: "-9%",
      bottom: "-2px",
      bottomMobile: "-1px",
      transform: "scale(1.04)",
      transformMobile: "scale(1.08)",
      motion: {
        kind: "cheer-bob",
        duration: "3.6s",
        delay: "-2.4s",
        distance: "11px",
        scale: "1.025",
        origin: "55% 100%",
      },
    },
    heroDecorations: { trailingIcon: "coins" },
    composerDecorations: {
      accentIcon: "coins",
      keepsakeImage: limeForestForeground,
      keepsakeVariant: "seal",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.06) brightness(1.02)",
    artBlendWidth: "68%",
    scrim: FORTUNE_SCRIM,
    fallback: "#f7ecd8",
    border: "rgba(196, 60, 47, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(111, 47, 25, 0.42), inset 0 1px 0 rgba(255, 249, 235, 0.84)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
    stageHeight: "340px",
    stageHeightWide: "380px",
    stageHeightMobile: "300px",
    breakoutSpace: "24px",
    breakoutSpaceMobile: "18px",
  },
  "lime-ocean": {
    image: limeOceanHero,
    foreground: {
      image: limeOceanForeground,
      width: "47%",
      widthMobile: "62%",
      top: "auto",
      topMobile: "auto",
      right: "-3%",
      rightMobile: "-10%",
      bottom: "-2px",
      bottomMobile: "-1px",
      transform: "translate(2%, 0) scale(0.98)",
      transformMobile: "translate(2%, 0) scale(1.02)",
      motion: {
        kind: "power-pulse",
        duration: "4.6s",
        scale: "1.035",
        origin: "50% 86%",
        glow: "0 0 18px rgba(50, 238, 255, 0.48)",
      },
    },
    heroDecorations: { trailingIcon: "shield" },
    composerDecorations: {
      accentIcon: "shield",
      keepsakeImage: limeOceanForeground,
      keepsakeVariant: "badge",
    },
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.06) brightness(1.02)",
    artBlendWidth: "68%",
    scrim: DARK_SCRIM,
    fallback: "#0a1426",
    border: "rgba(45, 225, 194, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(3, 19, 35, 0.76), inset 0 1px 0 rgba(234, 244, 255, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
    stageHeight: "370px",
    stageHeightWide: "410px",
    stageHeightMobile: "330px",
    breakoutSpace: "28px",
    breakoutSpaceMobile: "18px",
  },
  "lime-sand": {
    image: limeSandHero,
    foreground: {
      image: limeSandForeground,
      width: "46%",
      widthMobile: "62%",
      top: "auto",
      topMobile: "auto",
      right: "-1%",
      rightMobile: "-9%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.04)",
      transformMobile: "scale(1.1)",
      motion: {
        kind: "silk-drift",
        duration: "6.8s",
        delay: "-2.1s",
        distance: "10px",
        rotate: "0.7deg",
        origin: "60% 92%",
      },
    },
    heroDecorations: { trailingIcon: "sun" },
    composerDecorations: {
      accentIcon: "sun",
      keepsakeImage: limeSandForeground,
      keepsakeVariant: "poster",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) contrast(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f5e8dc",
    border: "rgba(255, 179, 71, 0.46)",
    shadow:
      "0 28px 54px -42px rgba(38, 22, 10, 0.78), inset 0 1px 0 rgba(255, 243, 230, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
    stageHeight: "370px",
    stageHeightWide: "420px",
    stageHeightMobile: "340px",
    breakoutSpace: "30px",
    breakoutSpaceMobile: "20px",
  },
  "lime-neon": {
    image: limeNeonHero,
    foreground: {
      image: limeNeonForeground,
      width: "51%",
      widthMobile: "64%",
      top: "auto",
      topMobile: "auto",
      right: "-2%",
      rightMobile: "-12%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.05)",
      transformMobile: "scale(1.14)",
      motion: {
        kind: "stage-sway",
        duration: "5.2s",
        delay: "-0.8s",
        distance: "8px",
        rotate: "0.4deg",
        origin: "50% 100%",
      },
    },
    heroDecorations: { trailingIcon: "music" },
    composerDecorations: {
      accentIcon: "music",
      keepsakeImage: limeNeonForeground,
      keepsakeVariant: "ticket",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f0fbfd",
    border: "rgba(22, 224, 255, 0.48)",
    shadow:
      "0 28px 54px -42px rgba(9, 3, 24, 0.8), inset 0 1px 0 rgba(234, 252, 255, 0.16)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
    stageHeight: "390px",
    stageHeightWide: "440px",
    stageHeightMobile: "350px",
    breakoutSpace: "30px",
    breakoutSpaceMobile: "18px",
  },
  "lime-citron": {
    image: limeCitronHero,
    foreground: {
      image: limeCitronForeground,
      width: "46%",
      widthMobile: "61%",
      top: "auto",
      topMobile: "auto",
      right: "0%",
      rightMobile: "-9%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.04)",
      transformMobile: "scale(1.12)",
      motion: {
        kind: "creative-tilt",
        duration: "4.6s",
        delay: "-1.7s",
        distance: "9px",
        rotate: "1.5deg",
        origin: "55% 95%",
      },
    },
    heroDecorations: { trailingIcon: "lightbulb" },
    composerDecorations: {
      accentIcon: "lightbulb",
      keepsakeImage: limeCitronForeground,
      keepsakeVariant: "badge",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) brightness(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f6fbdc",
    border: "rgba(132, 204, 22, 0.46)",
    shadow:
      "0 28px 54px -42px rgba(22, 35, 10, 0.72), inset 0 1px 0 rgba(247, 255, 220, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
    stageHeight: "360px",
    stageHeightWide: "400px",
    stageHeightMobile: "330px",
    breakoutSpace: "28px",
    breakoutSpaceMobile: "18px",
  },
  "lime-dusk": {
    image: limeDuskHero,
    foreground: {
      image: limeDuskForeground,
      width: "46%",
      widthMobile: "60%",
      top: "auto",
      topMobile: "auto",
      right: "3%",
      rightMobile: "-4%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.08)",
      transformMobile: "scale(1.14)",
      motion: {
        kind: "spotlight-breathe",
        duration: "6s",
        delay: "-3.1s",
        scale: "1.018",
        origin: "50% 90%",
        glow: "0 0 16px rgba(232, 185, 116, 0.3)",
      },
    },
    heroDecorations: { trailingIcon: "mic" },
    composerDecorations: {
      accentIcon: "mic",
      keepsakeImage: limeDuskForeground,
      keepsakeVariant: "medallion",
    },
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.02) contrast(1.02)",
    artBlendWidth: "68%",
    scrim: DARK_SCRIM,
    fallback: "#20170f",
    border: "rgba(224, 157, 92, 0.44)",
    shadow:
      "0 28px 54px -42px rgba(42, 24, 14, 0.78), inset 0 1px 0 rgba(255, 243, 230, 0.14)",
    contentWidth: "52%",
    titleMaxWidth: "12ch",
    stageHeight: "360px",
    stageHeightWide: "400px",
    stageHeightMobile: "320px",
    breakoutSpace: "30px",
    breakoutSpaceMobile: "18px",
  },
  "lime-minimal": {
    image: portalHero,
    foreground: {
      image: portalForeground,
      width: "44%",
      widthMobile: "58%",
      top: "-70px",
      topMobile: "-44px",
      right: "-2%",
      rightMobile: "-9%",
      transform: "translate(3%, 2%) scale(0.94)",
      transformMobile: "translate(3%, 2%) scale(1.04)",
      motion: {
        kind: "portal-pulse",
        duration: "5.4s",
        delay: "-2.8s",
        scale: "1.04",
        origin: "50% 58%",
        glow: "0 0 20px rgba(146, 194, 255, 0.48)",
      },
    },
    heroDecorations: { trailingIcon: "circle" },
    composerDecorations: {
      accentIcon: "circle",
      keepsakeImage: portalForeground,
      keepsakeVariant: "seal",
    },
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
    stageHeight: "340px",
    stageHeightWide: "380px",
    stageHeightMobile: "310px",
    breakoutSpace: "20px",
    breakoutSpaceMobile: "14px",
  },
  "lime-vivid": {
    image: limeVividHero,
    foreground: {
      image: limeVividForeground,
      width: "47%",
      widthMobile: "62%",
      top: "auto",
      topMobile: "auto",
      right: "0%",
      rightMobile: "-10%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.05)",
      transformMobile: "scale(1.14)",
      motion: {
        kind: "street-beat",
        duration: "3.7s",
        delay: "-1.5s",
        distance: "11px",
        rotate: "1.8deg",
        origin: "50% 100%",
      },
    },
    heroDecorations: { trailingIcon: "palette" },
    composerDecorations: {
      accentIcon: "palette",
      keepsakeImage: limeVividForeground,
      keepsakeVariant: "ticket",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#fff3ef",
    border: "rgba(240, 96, 122, 0.5)",
    shadow:
      "0 28px 54px -42px rgba(126, 45, 72, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
    stageHeight: "370px",
    stageHeightWide: "420px",
    stageHeightMobile: "340px",
    breakoutSpace: "28px",
    breakoutSpaceMobile: "18px",
  },
  "lime-literary": {
    image: limeLiteraryHero,
    foreground: {
      image: limeLiteraryForeground,
      width: "45%",
      widthMobile: "60%",
      top: "auto",
      topMobile: "auto",
      right: "4%",
      rightMobile: "-6%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "scale(1.06)",
      transformMobile: "scale(1.12)",
      motion: {
        kind: "portrait-breathe",
        duration: "6.2s",
        delay: "-4s",
        distance: "5px",
        scale: "1.012",
        origin: "55% 100%",
      },
    },
    heroDecorations: { trailingIcon: "book-open" },
    composerDecorations: {
      accentIcon: "book-open",
      keepsakeImage: limeLiteraryForeground,
      keepsakeVariant: "bookmark",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(0.96) contrast(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f4f7f5",
    border: "rgba(139, 122, 184, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(61, 55, 91, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
    stageHeight: "350px",
    stageHeightWide: "390px",
    stageHeightMobile: "320px",
    breakoutSpace: "28px",
    breakoutSpaceMobile: "18px",
  },
  "lime-luxury": {
    image: limeLuxuryHero,
    foreground: {
      image: limeLuxuryForeground,
      width: "48%",
      widthMobile: "63%",
      top: "auto",
      topMobile: "auto",
      right: "-2%",
      rightMobile: "-10%",
      bottom: "-1px",
      bottomMobile: "-1px",
      transform: "translate(1%, 0) scale(1)",
      transformMobile: "translate(1%, 0) scale(1.02)",
      motion: {
        kind: "spotlight-breathe",
        duration: "6.6s",
        delay: "-2.6s",
        scale: "1.02",
        origin: "50% 100%",
        glow: "0 0 18px rgba(131, 117, 255, 0.34)",
      },
    },
    heroDecorations: { trailingIcon: "gem" },
    composerDecorations: {
      accentIcon: "gem",
      keepsakeImage: limeLuxuryForeground,
      keepsakeVariant: "medallion",
    },
    artFit: "contain",
    tone: "dark",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.04) contrast(1.02)",
    artBlendWidth: "68%",
    scrim: DARK_SCRIM,
    fallback: "#0e1128",
    border: "rgba(134, 105, 246, 0.48)",
    shadow:
      "0 28px 54px -42px rgba(56, 43, 17, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
    stageHeight: "400px",
    stageHeightWide: "440px",
    stageHeightMobile: "360px",
    breakoutSpace: "28px",
    breakoutSpaceMobile: "18px",
  },
  "lime-future": {
    image: limeFutureHero,
    foreground: {
      image: limeFutureForeground,
      width: "45%",
      widthMobile: "60%",
      top: "-90px",
      topMobile: "-56px",
      right: "2%",
      rightMobile: "-8%",
      transform: "translate(-1%, 3%) scale(0.92)",
      transformMobile: "translate(-1%, 3%) scale(1.02)",
      motion: {
        kind: "city-glide",
        duration: "8s",
        delay: "-1.9s",
        distance: "14px",
        scale: "1.012",
        origin: "50% 80%",
        glow: "0 0 16px rgba(229, 53, 69, 0.3)",
      },
    },
    heroDecorations: { trailingIcon: "orbit" },
    composerDecorations: {
      accentIcon: "orbit",
      keepsakeImage: limeFutureForeground,
      keepsakeVariant: "poster",
    },
    artFit: "contain",
    tone: "light",
    artPosition: "100% center",
    artPositionMobile: "86% center",
    artFilter: "saturate(1.03) contrast(1.01)",
    artBlendWidth: "68%",
    scrim: SOFT_LIGHT_SCRIM,
    fallback: "#f1f2f4",
    border: "rgba(213, 47, 61, 0.42)",
    shadow:
      "0 28px 54px -42px rgba(89, 30, 38, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.86)",
    contentWidth: "48%",
    titleMaxWidth: "12ch",
    stageHeight: "340px",
    stageHeightWide: "380px",
    stageHeightMobile: "310px",
    breakoutSpace: "18px",
    breakoutSpaceMobile: "12px",
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
