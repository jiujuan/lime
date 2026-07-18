import type { ReactNode } from "react";
import {
  BookOpen,
  Circle,
  Coins,
  Gem,
  Heart,
  Leaf,
  Lightbulb,
  Mic,
  Music2,
  Orbit,
  Palette,
  Shield,
  Sparkles,
  Star,
  Sun,
} from "lucide-react";
import styled from "styled-components";
import {
  useHomeSkinPresentation,
  type HomeComposerAccentIcon,
  type HomeComposerDecorations as HomeComposerDecorationConfig,
  type HomeKeepsakeVariant,
} from "./homeSkinPresentation";

const DecorationFrame = styled.div<{ $hasKeepsake: boolean }>`
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding-right: ${({ $hasKeepsake }) => ($hasKeepsake ? "112px" : "0")};

  @media (max-width: 900px) {
    padding-right: 0;
  }
`;

const DecorationLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
`;

const ComposerOrnament = styled.img`
  position: absolute;
  bottom: 68px;
  left: 42%;
  width: 76px;
  height: auto;
  transform: rotate(-4deg);
  user-select: none;

  @media (max-width: 900px) {
    bottom: 62px;
    left: 40%;
    width: 64px;
  }
`;

const Keepsake = styled.div<{ $variant: HomeKeepsakeVariant }>`
  position: absolute;
  right: 8px;
  bottom: 6px;
  display: grid;
  width: ${({ $variant }) =>
    $variant === "badge" || $variant === "medallion" ? "78px" : "96px"};
  aspect-ratio: ${({ $variant }) =>
    $variant === "badge" || $variant === "medallion" ? "1" : "auto"};
  gap: 6px;
  padding: 6px 6px 10px;
  border: 1px solid
    var(
      --home-hero-border,
      var(--lime-surface-border, rgba(181, 112, 139, 0.3))
    );
  background: var(--lime-surface, #fffdfb);
  box-shadow: 0 12px 22px -16px var(--lime-shadow-color, rgba(91, 43, 62, 0.68));
  border-radius: ${({ $variant }) =>
    $variant === "badge" || $variant === "medallion"
      ? "50%"
      : $variant === "seal"
        ? "12px"
        : "2px"};
  transform: ${({ $variant }) =>
    $variant === "ticket"
      ? "rotate(-4deg)"
      : $variant === "poster"
        ? "rotate(-6deg)"
        : $variant === "bookmark"
          ? "rotate(5deg)"
          : "rotate(6deg)"};

  ${({ $variant }) =>
    $variant === "ticket"
      ? "border-style: dashed;"
      : $variant === "seal"
        ? "border-width: 2px;"
        : ""}

  ${({ $variant }) =>
    $variant === "bookmark"
      ? "clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%);"
      : ""}

  &::before {
    position: absolute;
    top: -10px;
    right: 12px;
    width: 34px;
    height: 17px;
    border: 1px solid var(--lime-brand-muted, rgba(217, 95, 135, 0.2));
    background: var(--lime-brand-soft, rgba(255, 218, 229, 0.84));
    content: ${({ $variant }) => ($variant === "polaroid" ? '""' : "none")};
    transform: rotate(-8deg);
  }

  img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    object-position: 50% 16%;
    border-radius: ${({ $variant }) =>
      $variant === "badge" || $variant === "medallion" ? "50%" : "0"};
  }

  svg {
    justify-self: center;
    width: 15px;
    height: 15px;
    color: var(--lime-brand, #d95f87);
  }

  @media (max-width: 900px) {
    display: none;
  }
`;

const KeepsakeMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  width: 17px;
  height: 17px;
  color: var(--lime-brand, #d95f87);

  svg {
    width: 15px;
    height: 15px;
  }
`;

const Accent = styled.span`
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  margin-left: -0.15rem;
  color: var(--lime-brand-strong, #963958);
  opacity: 0.78;

  svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.8;
  }
`;

function renderAccentIcon(icon: HomeComposerAccentIcon): ReactNode {
  switch (icon) {
    case "heart":
      return <Heart aria-hidden="true" />;
    case "sparkles":
      return <Sparkles aria-hidden="true" />;
    case "leaf":
      return <Leaf aria-hidden="true" />;
    case "star":
      return <Star aria-hidden="true" />;
    case "coins":
      return <Coins aria-hidden="true" />;
    case "shield":
      return <Shield aria-hidden="true" />;
    case "sun":
      return <Sun aria-hidden="true" />;
    case "music":
      return <Music2 aria-hidden="true" />;
    case "lightbulb":
      return <Lightbulb aria-hidden="true" />;
    case "mic":
      return <Mic aria-hidden="true" />;
    case "circle":
      return <Circle aria-hidden="true" />;
    case "palette":
      return <Palette aria-hidden="true" />;
    case "book-open":
      return <BookOpen aria-hidden="true" />;
    case "gem":
      return <Gem aria-hidden="true" />;
    case "orbit":
      return <Orbit aria-hidden="true" />;
  }
}

function AccentIcon({ icon }: { icon: HomeComposerAccentIcon }) {
  return (
    <Accent aria-hidden="true" data-home-skin-decoration-icon={icon}>
      {renderAccentIcon(icon)}
    </Accent>
  );
}

export function HomeSkinDecorationIcon({
  icon,
}: {
  icon: HomeComposerAccentIcon;
}) {
  return <AccentIcon icon={icon} />;
}

export function HomeComposerAccent({
  icon,
}: {
  icon?: HomeComposerAccentIcon;
}) {
  return icon ? <AccentIcon icon={icon} /> : null;
}

function ComposerDecorationLayer({
  decorations,
}: {
  decorations?: HomeComposerDecorationConfig;
}) {
  if (!decorations?.ornamentImage && !decorations?.keepsakeImage) {
    return null;
  }

  return (
    <DecorationLayer aria-hidden="true">
      {decorations.ornamentImage ? (
        <ComposerOrnament src={decorations.ornamentImage} alt="" />
      ) : null}
      {decorations.keepsakeImage ? (
        <Keepsake
          $variant={decorations.keepsakeVariant ?? "polaroid"}
          data-home-keepsake-variant={decorations.keepsakeVariant ?? "polaroid"}
        >
          <img src={decorations.keepsakeImage} alt="" />
          {decorations.accentIcon ? (
            <KeepsakeMark>
              {renderAccentIcon(decorations.accentIcon)}
            </KeepsakeMark>
          ) : null}
        </Keepsake>
      ) : null}
    </DecorationLayer>
  );
}

export function HomeComposerDecorationFrame({
  children,
}: {
  children: ReactNode;
}) {
  const { composerDecorations } = useHomeSkinPresentation();
  const hasKeepsake = Boolean(composerDecorations?.keepsakeImage);

  return (
    <DecorationFrame
      data-testid="home-composer-decoration-frame"
      data-home-composer-decoration-skin={
        composerDecorations ? "configured" : "plain"
      }
      $hasKeepsake={hasKeepsake}
    >
      {children}
      <ComposerDecorationLayer decorations={composerDecorations} />
    </DecorationFrame>
  );
}
