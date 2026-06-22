import { getWorkspaceRightSurfaceSpec } from "./rightSurfaceRegistry";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceLayoutVariant,
  WorkspaceRightSurfaceSource,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export interface WorkspaceRightSurfaceOpenRequest {
  kind: WorkspaceRightSurfaceKind;
  source: WorkspaceRightSurfaceSource;
  layoutVariant?: WorkspaceRightSurfaceLayoutVariant;
}

export interface WorkspaceRightSurfaceCloseRequest {
  source: WorkspaceRightSurfaceSource;
}

export function canOpenWorkspaceRightSurface(
  kind: WorkspaceRightSurfaceKind,
  source: WorkspaceRightSurfaceSource,
): boolean {
  const spec = getWorkspaceRightSurfaceSpec(kind);
  return Boolean(spec?.openSources.includes(source));
}

export function openWorkspaceRightSurface(
  current: WorkspaceRightSurfaceState,
  request: WorkspaceRightSurfaceOpenRequest,
): WorkspaceRightSurfaceState {
  if (!canOpenWorkspaceRightSurface(request.kind, request.source)) {
    return current;
  }

  return {
    activeSurface: request.kind,
    previousSurface:
      current.activeSurface === request.kind
        ? current.previousSurface
        : current.activeSurface,
    source: request.source,
    layoutVariant: request.layoutVariant ?? current.layoutVariant,
  };
}

export function closeWorkspaceRightSurface(
  current: WorkspaceRightSurfaceState,
  request: WorkspaceRightSurfaceCloseRequest,
): WorkspaceRightSurfaceState {
  return {
    activeSurface: null,
    previousSurface: current.activeSurface,
    source: request.source,
    layoutVariant: current.layoutVariant,
  };
}
