import type { CSSProperties, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import styled, { keyframes } from "styled-components";
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
  min-height: 310px;
  margin: 0 auto;
  overflow: hidden;
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
    min-height: 340px;
  }

  @media (max-width: 760px) {
    min-height: 270px;
    border-radius: 18px;
  }

  @media (max-height: 780px) {
    min-height: 250px;
  }
`;

const ArtworkImage = styled.img`
  position: absolute;
  inset: 0;
  z-index: -2;
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
  z-index: -1;
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
  flex-direction: column;
  gap: 0.18rem;
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
  left: var(--home-hero-art-blend-left, 100%);
  z-index: 0;
  width: var(--home-hero-art-blend-width, 0%);
  background: linear-gradient(
    90deg,
    var(--home-hero-art-blend-color, transparent) 0%,
    color-mix(
        in srgb,
        var(--home-hero-art-blend-color, transparent) 72%,
        transparent
      )
      38%,
    transparent 100%
  );
  pointer-events: none;
`;

const LeadTextGroup = styled.div`
  position: relative;
  display: flex;
  width: min(var(--home-hero-content-width, 48%), 520px);
  min-height: 310px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.9rem;
  padding: 2rem 0 2rem clamp(1.75rem, 4vw, 3.5rem);
  color: var(--home-hero-title-color, var(--lime-text-strong, #402530));
  text-align: left;
  z-index: 1;

  @media (min-width: 1280px) and (min-height: 900px) {
    min-height: 340px;
  }

  @media (max-width: 760px) {
    width: 58%;
    min-height: 270px;
    gap: 0.7rem;
    padding-left: 1.35rem;
  }

  @media (max-height: 780px) {
    min-height: 250px;
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
    "--home-hero-art-blend-left": presentation.artBlendLeft ?? "100%",
    "--home-hero-art-blend-width": presentation.artBlendWidth ?? "0%",
    "--home-hero-art-blend-color": presentation.fallback,
  } as CSSProperties;

  return (
    <HeroSection>
      <HeroContent>
        <ArtworkStage
          data-testid="dream-blossom-home-artwork"
          data-home-skin-tone={presentation.tone}
          style={presentationStyle}
        >
          <ArtworkImage src={presentation.image} alt="" aria-hidden="true" />
          <ArtworkTint aria-hidden="true" />
          <ArtworkBlend aria-hidden="true" />
          {skinBrandSubtitle || skinTagline || skinStatus ? (
            <SkinMetaBar>
              {skinBrandSubtitle || skinTagline ? (
                <SkinMetaCopy>
                  {skinBrandSubtitle ? (
                    <SkinBrand>{skinBrandSubtitle}</SkinBrand>
                  ) : null}
                  {skinTagline ? (
                    <SkinTagline>{skinTagline}</SkinTagline>
                  ) : null}
                </SkinMetaCopy>
              ) : (
                <span />
              )}
              {skinStatus ? <SkinStatus>{skinStatus}</SkinStatus> : null}
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
