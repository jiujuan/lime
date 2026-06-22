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
  requestedSurface,
  source = "user",
}: ResolveWorkspaceRightSurfaceStateInput): WorkspaceRightSurfaceState {
  const current = currentState ?? buildRightSurfaceState(null, source);
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
): WorkspaceRightSurfaceState {
  return {
    activeSurface,
    previousSurface: null,
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
