import React, { useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";
import { HomeSkillGallery } from "../home/HomeSkillGallery";
import type {
  HomeSurfaceChromeCopy,
  HomeSurfaceHeroCopy,
} from "../home/homeSurfaceCopy";
import type { HomeSkillSurfaceItem } from "../home/homeSurfaceTypes";
import { EmptyStateHero } from "./EmptyStateHero";
import {
  EMPTY_STATE_CONTENT_WRAPPER_CLASSNAME,
  EMPTY_STATE_PAGE_CONTAINER_CLASSNAME,
} from "./emptyStateSurfaceTokens";

const contentReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const PageContainer = styled.div.attrs({
  className: EMPTY_STATE_PAGE_CONTAINER_CLASSNAME,
})`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
  isolation: isolate;
  background:
    radial-gradient(
      circle at 8% 12%,
      var(--lime-home-glow-primary, rgba(132, 204, 22, 0.08)),
      transparent 28%
    ),
    radial-gradient(
      circle at 76% 16%,
      var(--lime-home-glow-secondary, rgba(186, 230, 253, 0.16)),
      transparent 30%
    ),
    linear-gradient(
      180deg,
      var(--lime-home-bg-start, #f8fcf7) 0%,
      var(--lime-home-bg-mid, #f9fbf8) 42%,
      var(--lime-home-bg-end, #f5faf7) 100%
    );
`;

const ContentWrapper = styled.div.attrs({
  className: EMPTY_STATE_CONTENT_WRAPPER_CLASSNAME,
})`
  display: flex;
  flex: 0 0 auto;
  min-height: 100%;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  animation: ${contentReveal} 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
  padding: 0.45rem 0.25rem 4.7rem;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ComposerGlowFrame = styled.div`
  position: relative;
  isolation: isolate;

  &::after {
    content: "";
    position: absolute;
    left: clamp(1.5rem, 9vw, 7rem);
    right: clamp(1.5rem, 9vw, 7rem);
    bottom: -1.1rem;
    z-index: 0;
    height: clamp(34px, 5vw, 58px);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(187, 247, 208, 0.18) 16%,
      rgba(110, 231, 183, 0.36) 42%,
      rgba(45, 212, 191, 0.34) 58%,
      rgba(186, 230, 253, 0.18) 84%,
      transparent 100%
    );
    filter: blur(18px);
    opacity: 0.86;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const ScrollCue = styled.a`
  position: absolute;
  left: 50%;
  bottom: clamp(0.7rem, 1.9vh, 1.25rem);
  z-index: 0;
  display: grid;
  width: min(680px, calc(100% - 2rem));
  max-width: calc(100% - 2rem);
  grid-template-columns: minmax(64px, 1fr) auto minmax(64px, 1fr);
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  transform: translateX(-50%);
  padding: 0.35rem 0;
  color: var(--lime-brand-strong, rgb(47 83 60));
  font-size: 13px;
  font-weight: 760;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  pointer-events: none;
  transition:
    color 160ms ease,
    transform 160ms ease;

  &:hover {
    color: var(--lime-text, rgb(71 85 105));
    transform: translateX(-50%) translateY(-1px);
  }
`;

const ScrollCueLine = styled.span`
  display: block;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--lime-surface-border-strong, rgba(203, 213, 225, 0.82)) 18%,
    var(--lime-surface-border-strong, rgba(203, 213, 225, 0.82)) 82%,
    transparent 100%
  );
`;

const ScrollCueText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  border-radius: 999px;
  border: 1px solid rgba(187, 247, 208, 0.86);
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.94),
      rgba(240, 253, 244, 0.88)
    ),
    var(--lime-surface, #fff);
  padding: 0.42rem 0.78rem;
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.055),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
`;

const ScrollCueArrow = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  font-size: 14px;
  line-height: 1;
`;

const SecondScreenSection = styled.section`
  display: flex;
  flex: 0 0 auto;
  min-height: 100%;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  overscroll-behavior: auto;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  padding: clamp(3.5rem, 8vh, 6rem) 0.25rem clamp(3rem, 8vh, 5.5rem);
`;

const SecondScreenInner = styled.div`
  width: min(1180px, 100%);
  min-width: 0;
`;

interface UseSecondScreenWheelInput {
  enabled: boolean;
  pageContainerRef: React.RefObject<HTMLDivElement | null>;
  secondScreenSectionRef: React.RefObject<HTMLElement | null>;
}

function useSecondScreenWheelReturnToFirstScreen({
  enabled,
  pageContainerRef,
  secondScreenSectionRef,
}: UseSecondScreenWheelInput) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const secondScreenSection = secondScreenSectionRef.current;
    if (!secondScreenSection) {
      return;
    }

    const handleSecondScreenWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0 || secondScreenSection.scrollTop > 1) {
        return;
      }

      event.preventDefault();
      pageContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    secondScreenSection.addEventListener("wheel", handleSecondScreenWheel, {
      passive: false,
    });

    return () => {
      secondScreenSection.removeEventListener("wheel", handleSecondScreenWheel);
    };
  }, [enabled, pageContainerRef, secondScreenSectionRef]);
}

interface EmptyStateComposerFrameProps {
  children: React.ReactNode;
}

export function EmptyStateComposerFrame({
  children,
}: EmptyStateComposerFrameProps) {
  return <ComposerGlowFrame>{children}</ComposerGlowFrame>;
}

interface EmptyStateLayoutProps {
  heroCopy: HomeSurfaceHeroCopy;
  chromeCopy: HomeSurfaceChromeCopy;
  prioritySlot: React.ReactNode;
  supportingSlot: React.ReactNode;
  isGeneralTheme: boolean;
  galleryItems: HomeSkillSurfaceItem[];
  onSelectGalleryItem: (item: HomeSkillSurfaceItem) => void;
  children?: React.ReactNode;
}

export function EmptyStateLayout({
  heroCopy,
  chromeCopy,
  prioritySlot,
  supportingSlot,
  isGeneralTheme,
  galleryItems,
  onSelectGalleryItem,
  children,
}: EmptyStateLayoutProps) {
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const secondScreenSectionRef = useRef<HTMLElement | null>(null);
  const shouldShowSecondScreen = isGeneralTheme && galleryItems.length > 0;

  useSecondScreenWheelReturnToFirstScreen({
    enabled: shouldShowSecondScreen,
    pageContainerRef,
    secondScreenSectionRef,
  });

  return (
    <PageContainer ref={pageContainerRef}>
      <ContentWrapper>
        <EmptyStateHero
          eyebrow={heroCopy.eyebrow}
          title=""
          slogan={heroCopy.slogan}
          description={heroCopy.description}
          supportingDescription={heroCopy.supportingDescription}
          cards={[]}
          prioritySlot={prioritySlot}
          supportingSlot={supportingSlot}
        />
        {shouldShowSecondScreen ? (
          <ScrollCue
            href="#home-skill-gallery-screen"
            data-testid="home-scroll-cue"
            aria-label={chromeCopy.scrollCueLabel}
          >
            <ScrollCueLine aria-hidden />
            <ScrollCueText>
              {chromeCopy.scrollCueLabel}
              <ScrollCueArrow aria-hidden>↓</ScrollCueArrow>
            </ScrollCueText>
            <ScrollCueLine aria-hidden />
          </ScrollCue>
        ) : null}
      </ContentWrapper>
      {shouldShowSecondScreen ? (
        <SecondScreenSection
          ref={secondScreenSectionRef}
          id="home-skill-gallery-screen"
          aria-label={chromeCopy.secondScreenLabel}
          data-testid="home-second-screen"
        >
          <SecondScreenInner>
            <HomeSkillGallery
              items={galleryItems}
              copy={chromeCopy}
              onSelectItem={onSelectGalleryItem}
            />
          </SecondScreenInner>
        </SecondScreenSection>
      ) : null}
      {children}
    </PageContainer>
  );
}
