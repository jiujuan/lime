export interface SidebarFloatingMenuPosition {
  top: number;
  left: number;
}

export interface SidebarFloatingMenuPositionOptions {
  menuWidth: number;
  menuApproxHeight: number;
  viewportMargin: number;
}

export function resolveSidebarFloatingMenuPosition(
  rect: Pick<DOMRect, "bottom" | "right">,
  viewport: Pick<Window, "innerHeight" | "innerWidth">,
  options: SidebarFloatingMenuPositionOptions,
): SidebarFloatingMenuPosition {
  return {
    top: Math.max(
      options.viewportMargin,
      Math.min(
        rect.bottom + 8,
        viewport.innerHeight -
          options.menuApproxHeight -
          options.viewportMargin,
      ),
    ),
    left: Math.max(
      options.viewportMargin,
      Math.min(
        rect.right - options.menuWidth,
        viewport.innerWidth - options.menuWidth - options.viewportMargin,
      ),
    ),
  };
}
