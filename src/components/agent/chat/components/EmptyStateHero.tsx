import type { CSSProperties, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import styled, { keyframes } from "styled-components";
import { HomeSkinDecorationIcon } from "./HomeComposerDecorations";
import { useHomeSkinPresentation } from "./homeSkinPresentation";

const heroReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.996);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const portraitBreathe = keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 8px) * -0.35),
        0
      )
      scale(var(--home-hero-motion-scale, 1.02));
  }
`;

const foliageSway = keyframes`
  0%,
  100% {
    transform: rotate(calc(var(--home-hero-motion-rotate, 2deg) * -0.35));
  }
  50% {
    transform: translate3d(
        calc(var(--home-hero-motion-distance, 8px) * -0.25),
        0,
        0
      )
      rotate(var(--home-hero-motion-rotate, 2deg));
  }
`;

const cheerBob = keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  42% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 10px) * -1),
        0
      )
      scale(1.01, 0.985);
  }
  54% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 10px) * -0.55),
        0
      )
      scale(0.995, var(--home-hero-motion-scale, 1.02));
  }
`;

const powerPulse = keyframes`
  0%,
  100% {
    transform: scale(1);
    filter: brightness(1) drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: scale(var(--home-hero-motion-scale, 1.035));
    filter: brightness(1.08)
      drop-shadow(
        var(--home-hero-motion-glow, 0 0 16px rgba(73, 222, 255, 0.42))
      );
  }
`;

const silkDrift = keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(
        calc(var(--home-hero-motion-distance, 10px) * -1),
        calc(var(--home-hero-motion-distance, 10px) * -0.3),
        0
      )
      rotate(var(--home-hero-motion-rotate, 0deg));
  }
`;

const stageBeat = keyframes`
  0%,
  58%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  45% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 12px) * -1),
        0
      )
      rotate(calc(var(--home-hero-motion-rotate, 0.8deg) * -1));
  }
  52% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 12px) * -0.4),
        0
      )
      rotate(calc(var(--home-hero-motion-rotate, 0.8deg) * 0.35));
  }
`;

const creativeTilt = keyframes`
  0%,
  100% {
    transform: rotate(calc(var(--home-hero-motion-rotate, 1.4deg) * -0.3));
  }
  50% {
    transform: translate3d(
        calc(var(--home-hero-motion-distance, 9px) * -0.5),
        calc(var(--home-hero-motion-distance, 9px) * -0.6),
        0
      )
      rotate(var(--home-hero-motion-rotate, 1.4deg));
  }
`;

const streetBeat = keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  32% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 11px) * -1),
        0
      )
      rotate(calc(var(--home-hero-motion-rotate, 1.8deg) * -0.8));
  }
  42% {
    transform: translate3d(
        0,
        calc(var(--home-hero-motion-distance, 11px) * -0.3),
        0
      )
      rotate(calc(var(--home-hero-motion-rotate, 1.8deg) * 0.35));
  }
  68% {
    transform: translate3d(
        calc(var(--home-hero-motion-distance, 11px) * -0.45),
        calc(var(--home-hero-motion-distance, 11px) * -0.7),
        0
      )
      rotate(var(--home-hero-motion-rotate, 1.8deg));
  }
`;

const spotlightBreathe = keyframes`
  0%,
  100% {
    transform: scale(1);
    filter: brightness(1) drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: scale(var(--home-hero-motion-scale, 1.018));
    filter: brightness(1.06)
      drop-shadow(
        var(--home-hero-motion-glow, 0 0 14px rgba(255, 220, 176, 0.26))
      );
  }
`;

const portalPulse = keyframes`
  0%,
  100% {
    transform: scale(1);
    filter: brightness(0.96) drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: scale(var(--home-hero-motion-scale, 1.04));
    filter: brightness(1.16)
      drop-shadow(
        var(--home-hero-motion-glow, 0 0 20px rgba(146, 194, 255, 0.46))
      );
  }
`;

const cityGlide = keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    filter: brightness(1) drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: translate3d(
        calc(var(--home-hero-motion-distance, 14px) * -1),
        0,
        0
      )
      scale(var(--home-hero-motion-scale, 1.012));
    filter: brightness(1.06)
      drop-shadow(
        var(--home-hero-motion-glow, 0 0 16px rgba(229, 53, 69, 0.3))
      );
  }
`;

const HeroSection = styled.section`
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  animation: ${heroReveal} 520ms cubic-bezier(0.22, 1, 0.36, 1) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const HeroContent = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0 0.5rem 1rem;
`;

const ArtworkStage = styled.div`
  position: relative;
  isolation: isolate;
  width: min(1180px, 100%);
  margin: var(--home-hero-breakout-space, 0) auto 0;
  min-height: var(--home-hero-stage-height, 310px);
  overflow: var(--home-hero-stage-overflow, hidden);
  border: 1px solid
    var(--home-hero-border, var(--lime-home-hero-border, #efc2d2));
  border-radius: 24px;
  background: var(
    --home-hero-fallback,
    var(--lime-home-hero-fallback, #fbe8ef)
  );
  box-shadow: var(
    --home-hero-shadow,
    0 28px 54px -42px rgba(91, 43, 62, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.82)
  );

  @media (min-width: 1280px) and (min-height: 900px) {
    min-height: var(--home-hero-stage-height-wide, 340px);
  }

  @media (max-width: 760px) {
    margin-top: var(--home-hero-breakout-space-mobile, 0);
    min-height: var(--home-hero-stage-height-mobile, 270px);
    border-radius: 18px;
  }

  @media (max-height: 780px) {
    min-height: var(--home-hero-stage-height-short, 250px);
  }
`;

const ArtworkBackdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  border-radius: inherit;
  background: var(
    --home-hero-fallback,
    var(--lime-home-hero-fallback, #fbe8ef)
  );
`;

const ArtworkImage = styled.img`
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: var(--home-hero-art-fit, cover);
  object-position: var(--home-hero-art-position, 58% top);
  filter: var(--home-hero-art-filter, none);
  user-select: none;
  pointer-events: none;

  @media (max-width: 760px) {
    object-position: var(
      --home-hero-art-position-mobile,
      var(--home-hero-art-position, 66% top)
    );
  }
`;

const ArtworkTint = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: var(
    --home-hero-scrim,
    linear-gradient(
      90deg,
      rgba(255, 251, 252, 0.98) 0%,
      rgba(255, 248, 251, 0.92) 32%,
      rgba(255, 245, 249, 0.62) 48%,
      rgba(255, 245, 249, 0.08) 68%,
      transparent 82%
    ),
    linear-gradient(0deg, rgba(82, 34, 52, 0.12), transparent 38%)
  );

  @media (max-width: 760px) {
    background: var(--home-hero-scrim);
  }
`;

const SkinMetaBar = styled.div`
  position: absolute;
  top: 1rem;
  left: clamp(1.75rem, 4vw, 3.5rem);
  right: clamp(1.25rem, 3vw, 2.5rem);
  z-index: 1;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  pointer-events: none;
  color: var(--home-hero-meta-color, var(--lime-text-muted, #8e6e7a));
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;

  @media (max-width: 760px) {
    left: 1.35rem;
    right: 1rem;
    top: 0.8rem;
    gap: 0.5rem;
    font-size: 9px;
  }
`;

const SkinMetaCopy = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.18rem;
`;

const SkinMetaArtwork = styled.img`
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  object-fit: contain;
`;

const SkinMetaStack = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.18rem;
`;

const SkinMetaActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
`;

const SkinBrand = styled.span`
  overflow: hidden;
  color: var(--home-hero-brand-color, var(--lime-brand-strong, #963958));
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SkinTagline = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SkinStatus = styled.span`
  flex: 0 0 auto;
  border: 1px solid
    var(--home-hero-status-border, var(--lime-surface-border, #efceda));
  border-radius: 999px;
  background: var(--home-hero-status-bg, rgba(255, 255, 255, 0.48));
  padding: 0.34rem 0.58rem;
  color: var(--home-hero-status-color, var(--lime-brand-strong, #963958));
  letter-spacing: 0.04em;
  white-space: nowrap;
`;

const ArtworkBlend = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: var(--home-hero-art-blend-width, 0%);
  background: linear-gradient(
    90deg,
    var(--home-hero-art-blend-color, transparent) 0%,
    var(--home-hero-art-blend-color, transparent) 55%,
    color-mix(
        in srgb,
        var(--home-hero-art-blend-color, transparent) 78%,
        transparent
      )
      72%,
    transparent 100%
  );
  pointer-events: none;
`;

const ArtworkForeground = styled.div`
  position: absolute;
  top: var(--home-hero-foreground-top, auto);
  right: var(--home-hero-foreground-right, auto);
  bottom: var(--home-hero-foreground-bottom, auto);
  left: var(--home-hero-foreground-left, auto);
  z-index: 2;
  width: var(--home-hero-foreground-width, 0);
  overflow: visible;
  pointer-events: none;
  transform-origin: var(--home-hero-motion-origin, 50% 85%);
  will-change: transform, filter;

  &:not([data-home-hero-motion="none"]) {
    animation-duration: var(--home-hero-motion-duration, 8s);
    animation-timing-function: ease-in-out;
    animation-delay: var(--home-hero-motion-delay, 0s);
    animation-iteration-count: infinite;
    animation-direction: var(--home-hero-motion-direction, normal);
    animation-fill-mode: both;
  }

  &[data-home-hero-motion="portrait-breathe"] {
    animation-name: ${portraitBreathe};
  }

  &[data-home-hero-motion="foliage-sway"] {
    animation-name: ${foliageSway};
  }

  &[data-home-hero-motion="cheer-bob"] {
    animation-name: ${cheerBob};
    animation-timing-function: cubic-bezier(0.34, 1.28, 0.64, 1);
  }

  &[data-home-hero-motion="power-pulse"] {
    animation-name: ${powerPulse};
  }

  &[data-home-hero-motion="silk-drift"] {
    animation-name: ${silkDrift};
  }

  &[data-home-hero-motion="stage-beat"] {
    animation-name: ${stageBeat};
    animation-timing-function: cubic-bezier(0.45, 0, 0.2, 1);
  }

  &[data-home-hero-motion="creative-tilt"] {
    animation-name: ${creativeTilt};
  }

  &[data-home-hero-motion="street-beat"] {
    animation-name: ${streetBeat};
    animation-timing-function: cubic-bezier(0.34, 1.12, 0.64, 1);
  }

  &[data-home-hero-motion="spotlight-breathe"] {
    animation-name: ${spotlightBreathe};
  }

  &[data-home-hero-motion="portal-pulse"] {
    animation-name: ${portalPulse};
  }

  &[data-home-hero-motion="city-glide"] {
    animation-name: ${cityGlide};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    will-change: auto;
    filter: none;
  }

  img {
    display: block;
    width: 100%;
    max-width: none;
    height: auto;
    transform: var(--home-hero-foreground-transform, none);
    user-select: none;
    filter: var(--home-hero-foreground-filter, none);
  }

  @media (max-width: 760px) {
    top: var(--home-hero-foreground-top-mobile, auto);
    right: var(--home-hero-foreground-right-mobile, auto);
    bottom: var(--home-hero-foreground-bottom-mobile, auto);
    left: var(--home-hero-foreground-left-mobile, auto);
    width: var(--home-hero-foreground-width-mobile, 0);

    img {
      transform: var(--home-hero-foreground-transform-mobile, none);
    }
  }
`;

const LeadTextGroup = styled.div`
  position: relative;
  display: flex;
  width: min(var(--home-hero-content-width, 48%), 520px);
  min-height: var(--home-hero-stage-height, 310px);
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.9rem;
  padding: 2rem 0 2rem clamp(1.75rem, 4vw, 3.5rem);
  color: var(--home-hero-title-color, var(--lime-text-strong, #402530));
  text-align: left;
  z-index: 3;

  @media (min-width: 1280px) and (min-height: 900px) {
    min-height: var(--home-hero-stage-height-wide, 340px);
  }

  @media (max-width: 760px) {
    width: 58%;
    min-height: var(--home-hero-stage-height-mobile, 270px);
    gap: 0.7rem;
    padding-left: 1.35rem;
  }

  @media (max-height: 780px) {
    min-height: var(--home-hero-stage-height-short, 250px);
  }
`;

const Eyebrow = styled.span`
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--lime-surface-border-strong, #dfafc1);
  border-radius: 999px;
  background: var(--home-hero-badge-bg, var(--lime-surface, #fffafd));
  border-color: var(
    --home-hero-badge-border,
    var(--lime-surface-border-strong, #dfafc1)
  );
  padding: 0.36rem 0.7rem;
  color: var(--home-hero-badge-text, var(--lime-brand-strong, #963958));
  font-size: 12px;
  font-weight: 720;
  line-height: 1;
  box-shadow: 0 8px 20px -18px rgba(91, 43, 62, 0.45);

  svg {
    width: 14px;
    height: 14px;
  }
`;

const SloganText = styled.h1`
  max-width: var(--home-hero-title-max-width, 9ch);
  margin: 0;
  color: var(--home-hero-title-color, var(--lime-text-strong, #402530));
  font-size: 46px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.1;
  text-shadow: var(
    --home-hero-text-shadow,
    0 2px 18px rgba(255, 255, 255, 0.72)
  );

  @media (max-width: 900px) {
    font-size: 38px;
  }

  @media (max-width: 620px) {
    font-size: 30px;
  }
`;

const Description = styled.p`
  max-width: 30rem;
  margin: 0;
  color: var(--home-hero-description-color, var(--lime-text, #654652));
  font-size: 15px;
  font-weight: 520;
  line-height: 1.7;
  text-shadow: var(
    --home-hero-description-shadow,
    0 1px 10px rgba(255, 255, 255, 0.86)
  );

  @media (max-width: 620px) {
    font-size: 13px;
    line-height: 1.55;
  }
`;

const PriorityShell = styled.div`
  position: relative;
  z-index: 2;
  width: min(1180px, 100%);
  margin: 0 auto;

  @media (max-width: 760px) {
    width: 100%;
  }
`;

const SupportingShell = styled.div`
  width: min(1180px, 100%);
  margin: 0 auto;
`;

interface EmptyStateHeroProps {
  eyebrow: string;
  slogan: string;
  description: string;
  skinBrandSubtitle?: string;
  skinTagline?: string;
  skinStatus?: string;
  prioritySlot?: ReactNode;
  supportingSlot?: ReactNode;
}

export function EmptyStateHero({
  eyebrow,
  slogan,
  description,
  skinBrandSubtitle,
  skinTagline,
  skinStatus,
  prioritySlot,
  supportingSlot,
}: EmptyStateHeroProps) {
  const presentation = useHomeSkinPresentation();
  const isDarkArtwork = presentation.tone === "dark";
  const heroDecorations = presentation.heroDecorations;
  const foreground = presentation.foreground;
  const foregroundMotion = foreground?.motion;
  const presentationStyle = {
    "--home-hero-art-position": presentation.artPosition,
    "--home-hero-art-position-mobile": presentation.artPositionMobile,
    "--home-hero-art-fit": presentation.artFit,
    "--home-hero-art-filter": presentation.artFilter,
    "--home-hero-scrim": presentation.scrim,
    "--home-hero-fallback": presentation.fallback,
    "--home-hero-border": presentation.border,
    "--home-hero-shadow": presentation.shadow,
    "--home-hero-content-width": presentation.contentWidth,
    "--home-hero-title-max-width": presentation.titleMaxWidth,
    "--home-hero-title-color": isDarkArtwork
      ? "#f7fbff"
      : "var(--lime-text-strong, #402530)",
    "--home-hero-description-color": isDarkArtwork
      ? "#d9e5e9"
      : "var(--lime-text, #654652)",
    "--home-hero-badge-bg": isDarkArtwork
      ? "rgba(10, 14, 20, 0.48)"
      : "var(--lime-surface, #fffafd)",
    "--home-hero-badge-border": isDarkArtwork
      ? "rgba(232, 244, 247, 0.34)"
      : "var(--lime-surface-border-strong, #dfafc1)",
    "--home-hero-badge-text": isDarkArtwork
      ? "#f1fbf8"
      : "var(--lime-brand-strong, #963958)",
    "--home-hero-text-shadow": isDarkArtwork
      ? "0 2px 18px rgba(0, 0, 0, 0.42)"
      : "0 2px 18px rgba(255, 255, 255, 0.72)",
    "--home-hero-description-shadow": isDarkArtwork
      ? "0 1px 10px rgba(0, 0, 0, 0.4)"
      : "0 1px 10px rgba(255, 255, 255, 0.86)",
    "--home-hero-meta-color": isDarkArtwork
      ? "rgba(232, 244, 247, 0.76)"
      : "var(--lime-text-muted, #8e6e7a)",
    "--home-hero-brand-color": isDarkArtwork
      ? "#f1fbf8"
      : "var(--lime-brand-strong, #963958)",
    "--home-hero-status-bg": isDarkArtwork
      ? "rgba(10, 14, 20, 0.48)"
      : "rgba(255, 255, 255, 0.48)",
    "--home-hero-status-border": isDarkArtwork
      ? "rgba(232, 244, 247, 0.34)"
      : "var(--lime-surface-border, #efceda)",
    "--home-hero-status-color": isDarkArtwork
      ? "#f1fbf8"
      : "var(--lime-brand-strong, #963958)",
    "--home-hero-art-blend-width": presentation.artBlendWidth ?? "0%",
    "--home-hero-art-blend-color": presentation.fallback,
    "--home-hero-stage-height": presentation.stageHeight ?? "310px",
    "--home-hero-stage-height-wide": presentation.stageHeightWide ?? "340px",
    "--home-hero-stage-height-mobile":
      presentation.stageHeightMobile ?? "270px",
    "--home-hero-stage-height-short": presentation.stageHeight ?? "250px",
    "--home-hero-stage-overflow": foreground ? "visible" : "hidden",
    "--home-hero-foreground-width": foreground?.width ?? "0",
    "--home-hero-foreground-width-mobile": foreground?.widthMobile ?? "0",
    "--home-hero-foreground-top": foreground?.top ?? "auto",
    "--home-hero-foreground-top-mobile": foreground?.topMobile ?? "auto",
    "--home-hero-foreground-right": foreground?.right ?? "auto",
    "--home-hero-foreground-right-mobile": foreground?.rightMobile ?? "auto",
    "--home-hero-foreground-bottom": foreground?.bottom ?? "auto",
    "--home-hero-foreground-bottom-mobile": foreground?.bottomMobile ?? "auto",
    "--home-hero-foreground-left": foreground?.left ?? "auto",
    "--home-hero-foreground-left-mobile": foreground?.leftMobile ?? "auto",
    "--home-hero-foreground-transform": foreground?.transform ?? "none",
    "--home-hero-foreground-transform-mobile":
      foreground?.transformMobile ?? "none",
    "--home-hero-motion-duration": foregroundMotion?.duration ?? "8s",
    "--home-hero-motion-delay": foregroundMotion?.delay ?? "0s",
    "--home-hero-motion-distance": foregroundMotion?.distance ?? "12px",
    "--home-hero-motion-rotate": foregroundMotion?.rotate ?? "0deg",
    "--home-hero-motion-scale": foregroundMotion?.scale ?? "1.04",
    "--home-hero-motion-origin": foregroundMotion?.origin ?? "50% 85%",
    "--home-hero-motion-direction": foregroundMotion?.direction ?? "normal",
    "--home-hero-motion-glow": foregroundMotion?.glow ?? "0 0 0 transparent",
    "--home-hero-breakout-space": presentation.breakoutSpace ?? "0",
    "--home-hero-breakout-space-mobile":
      presentation.breakoutSpaceMobile ?? "0",
  } as CSSProperties;

  return (
    <HeroSection>
      <HeroContent>
        <ArtworkStage
          data-testid="dream-blossom-home-artwork"
          data-home-skin-tone={presentation.tone}
          style={presentationStyle}
        >
          <ArtworkBackdrop>
            <ArtworkImage src={presentation.image} alt="" aria-hidden="true" />
            <ArtworkTint aria-hidden="true" />
            <ArtworkBlend aria-hidden="true" />
          </ArtworkBackdrop>
          {foreground ? (
            <ArtworkForeground
              data-testid="home-hero-foreground"
              data-home-hero-foreground-skin={presentation.skinId}
              data-home-hero-motion={foregroundMotion?.kind ?? "none"}
              aria-hidden="true"
            >
              <img src={foreground.image} alt="" />
            </ArtworkForeground>
          ) : null}
          {skinBrandSubtitle || skinTagline || skinStatus ? (
            <SkinMetaBar>
              {skinBrandSubtitle || skinTagline ? (
                <SkinMetaCopy>
                  {heroDecorations?.leadingImage ? (
                    <SkinMetaArtwork
                      src={heroDecorations.leadingImage}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : null}
                  <SkinMetaStack>
                    {skinBrandSubtitle ? (
                      <SkinBrand>{skinBrandSubtitle}</SkinBrand>
                    ) : null}
                    {skinTagline ? (
                      <SkinTagline>{skinTagline}</SkinTagline>
                    ) : null}
                  </SkinMetaStack>
                </SkinMetaCopy>
              ) : (
                <span />
              )}
              <SkinMetaActions>
                {heroDecorations?.trailingIcon ? (
                  <HomeSkinDecorationIcon icon={heroDecorations.trailingIcon} />
                ) : null}
                {skinStatus ? <SkinStatus>{skinStatus}</SkinStatus> : null}
              </SkinMetaActions>
            </SkinMetaBar>
          ) : null}
          <LeadTextGroup>
            <Eyebrow data-testid="empty-state-hero-eyebrow-badge">
              <Sparkles aria-hidden="true" />
              {eyebrow}
            </Eyebrow>
            <SloganText>{slogan}</SloganText>
            <Description>{description}</Description>
          </LeadTextGroup>
        </ArtworkStage>

        {prioritySlot ? <PriorityShell>{prioritySlot}</PriorityShell> : null}
        {supportingSlot ? (
          <SupportingShell>{supportingSlot}</SupportingShell>
        ) : null}
      </HeroContent>
    </HeroSection>
  );
}
