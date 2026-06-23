import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import {
  closeWorkspaceRightSurface,
  openWorkspaceRightSurface,
} from "./rightSurfaceController";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceLayoutVariant,
  WorkspaceRightSurfaceSource,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export interface ResolveWorkspaceRightSurfaceStateInput {
  layoutMode: LayoutMode;
  expertInfoVisible: boolean;
  hasExpertInfo: boolean;
  currentState?: WorkspaceRightSurfaceState;
  openSurfaces?: readonly WorkspaceRightSurfaceKind[];
  requestedSurface?: WorkspaceRightSurfaceKind | null;
  source?: WorkspaceRightSurfaceSource;
}

export interface ResolveExpertInfoPanelCollapsedInput {
  previousLayoutMode: LayoutMode;
  nextLayoutMode: LayoutMode;
  currentCollapsed: boolean;
}

export function resolveWorkspaceRightSurfaceState({
  layoutMode,
  expertInfoVisible,
  hasExpertInfo,
  currentState,
  openSurfaces,
  requestedSurface,
  source = "user",
}: ResolveWorkspaceRightSurfaceStateInput): WorkspaceRightSurfaceState {
  const current =
    currentState ?? buildRightSurfaceState(null, source, "docked", openSurfaces);
  const layoutVariant = resolveWorkspaceRightSurfaceLayoutVariant(layoutMode);

  if (requestedSurface !== undefined) {
    if (requestedSurface === null) {
      return closeWorkspaceRightSurface(current, { source });
    }

    return openWorkspaceRightSurface(current, {
      kind: requestedSurface,
      source,
      layoutVariant,
    });
  }

  if (layoutMode !== "chat") {
    return openWorkspaceRightSurface(current, {
      kind: "workbench",
      source,
      layoutVariant,
    });
  }

  if (hasExpertInfo && expertInfoVisible) {
    return openWorkspaceRightSurface(current, {
      kind: "expertInfo",
      source,
      layoutVariant,
    });
  }

  return current.activeSurface
    ? closeWorkspaceRightSurface(current, { source })
    : current;
}

export function buildRightSurfaceState(
  activeSurface: WorkspaceRightSurfaceKind | null,
  source: WorkspaceRightSurfaceSource,
  layoutVariant: WorkspaceRightSurfaceLayoutVariant = "docked",
  openSurfaces: readonly WorkspaceRightSurfaceKind[] = [],
): WorkspaceRightSurfaceState {
  return {
    activeSurface,
    previousSurface: null,
    openSurfaces: normalizeOpenSurfaces(openSurfaces, activeSurface),
    source,
    layoutVariant,
  };
}

export function isRightSurfaceOpen(
  state: WorkspaceRightSurfaceState,
): boolean {
  return state.activeSurface !== null;
}

export function resolveWorkspaceRightSurfaceLayoutVariant(
  layoutMode: LayoutMode,
): WorkspaceRightSurfaceLayoutVariant {
  return layoutMode === "canvas" ? "canvasFirst" : "docked";
}

function normalizeOpenSurfaces(
  openSurfaces: readonly WorkspaceRightSurfaceKind[],
  activeSurface: WorkspaceRightSurfaceKind | null,
): readonly WorkspaceRightSurfaceKind[] {
  const next = [...openSurfaces];
  if (activeSurface && !next.includes(activeSurface)) {
    next.push(activeSurface);
  }
  return next;
}

export function resolveExpertInfoPanelCollapsedAfterLayoutChange({
  previousLayoutMode,
  nextLayoutMode,
  currentCollapsed,
}: ResolveExpertInfoPanelCollapsedInput): boolean {
  if (previousLayoutMode === "chat" && nextLayoutMode !== "chat") {
    return true;
  }

  return currentCollapsed;
}
