import type { WorkspaceRightSurfaceIntent } from "./rightSurfaceIntentQueue";
import { WORKSPACE_RIGHT_SURFACE_SPECS } from "./rightSurfaceRegistry";
import type {
  WorkspaceRightSurfaceKind,
  WorkspaceRightSurfaceState,
} from "./rightSurfaceTypes";

export interface WorkspaceRightSurfaceToolbarProjectionInput {
  surfaceState: WorkspaceRightSurfaceState;
  pendingIntents: WorkspaceRightSurfaceIntent[];
  availableSurfaces?: ReadonlySet<WorkspaceRightSurfaceKind>;
}

export interface WorkspaceRightSurfaceLauncherProjection {
  kind: WorkspaceRightSurfaceKind;
  active: boolean;
  disabled: boolean;
  pendingCount: number;
  collapseTarget: "topToolbar" | "none";
}

export function buildWorkspaceRightSurfaceLauncherProjections({
  surfaceState,
  pendingIntents,
  availableSurfaces,
}: WorkspaceRightSurfaceToolbarProjectionInput): WorkspaceRightSurfaceLauncherProjection[] {
  return WORKSPACE_RIGHT_SURFACE_SPECS.map((spec) => ({
    kind: spec.kind,
    active: surfaceState.activeSurface === spec.kind,
    disabled: availableSurfaces ? !availableSurfaces.has(spec.kind) : false,
    pendingCount: countPendingIntentsForSurface(pendingIntents, spec.kind),
    collapseTarget: spec.collapseTarget,
  }));
}

function countPendingIntentsForSurface(
  pendingIntents: WorkspaceRightSurfaceIntent[],
  kind: WorkspaceRightSurfaceKind,
): number {
  return pendingIntents.filter(
    (intent) => intent.command.action === "open" && intent.command.kind === kind,
  ).length;
}
