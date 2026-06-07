export interface RectangleLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeLike {
  width: number;
  height: number;
}

export interface BuildUpdateNotificationWindowBoundsOptions {
  anchorRect?: RectangleLike | null;
  contentBounds: RectangleLike;
  gap?: number;
  margin?: number;
  updateWindowSize: SizeLike;
  workArea: RectangleLike;
}

const DEFAULT_GAP = 10;
const DEFAULT_MARGIN = 8;
const FALLBACK_ANCHOR_LEFT = 16;
const FALLBACK_ANCHOR_BOTTOM = 46;
const FALLBACK_ANCHOR_SIZE = 30;

export function buildUpdateNotificationWindowBounds({
  anchorRect,
  contentBounds,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  updateWindowSize,
  workArea,
}: BuildUpdateNotificationWindowBoundsOptions): RectangleLike {
  const anchor = isValidRect(anchorRect)
    ? anchorRect
    : buildFallbackAnchorRect(contentBounds);
  const width = Math.max(1, Math.round(updateWindowSize.width));
  const height = Math.max(1, Math.round(updateWindowSize.height));
  const minX = Math.max(workArea.x + margin, contentBounds.x + margin);
  const maxX = Math.min(
    workArea.x + workArea.width - width - margin,
    contentBounds.x + contentBounds.width - width - margin,
  );
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - height - margin;
  const anchorScreenX = contentBounds.x + anchor.x;
  const anchorScreenY = contentBounds.y + anchor.y;
  const preferredX = anchorScreenX;
  const preferredY = anchorScreenY - height - gap;
  const fallbackY = anchorScreenY + anchor.height + gap;
  const y = preferredY >= minY || fallbackY > maxY ? preferredY : fallbackY;

  return {
    x: Math.round(clamp(preferredX, minX, maxX)),
    y: Math.round(clamp(y, minY, maxY)),
    width,
    height,
  };
}

function buildFallbackAnchorRect(contentBounds: RectangleLike): RectangleLike {
  return {
    x: FALLBACK_ANCHOR_LEFT,
    y: Math.max(
      0,
      contentBounds.height - FALLBACK_ANCHOR_BOTTOM - FALLBACK_ANCHOR_SIZE,
    ),
    width: FALLBACK_ANCHOR_SIZE,
    height: FALLBACK_ANCHOR_SIZE,
  };
}

function isValidRect(
  value: RectangleLike | null | undefined,
): value is RectangleLike {
  return Boolean(
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0,
  );
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
