import {
  buildWorkspaceRightSurfaceFilePreviewIntents,
  buildWorkspaceRightSurfaceHarnessPendingIntents,
  buildWorkspaceRightSurfaceLauncherProjections,
  buildWorkspaceRightSurfaceObjectCanvasCandidateIntents,
  type WorkspaceRightSurfaceIntent,
  type WorkspaceRightSurfaceKind,
  type WorkspaceRightSurfaceLauncherProjection,
  type WorkspaceRightSurfaceState,
} from "./right-surface";

export interface BuildWorkspaceRightSurfaceRuntimePendingIntentsParams {
  createdAt: number;
  harnessPendingCount: number;
  objectCanvasCandidateId?: string | null;
  preferredServiceSkillResultFileTargetRelativePath?: string | null;
  showHarnessToggle: boolean;
  suppressHomeNavbarUtilityActions: boolean;
}

export interface BuildWorkspaceRightSurfaceRuntimeLaunchersParams {
  filesAvailable: boolean;
  hasExpertInfoPanel: boolean;
  pendingIntents: WorkspaceRightSurfaceIntent[];
  shellAvailable: boolean;
  showHarnessToggle: boolean;
  suppressHomeNavbarUtilityActions: boolean;
  surfaceState: WorkspaceRightSurfaceState;
}

export function buildWorkspaceRightSurfaceRuntimePendingIntents({
  createdAt,
  harnessPendingCount,
  objectCanvasCandidateId,
  preferredServiceSkillResultFileTargetRelativePath,
  showHarnessToggle,
  suppressHomeNavbarUtilityActions,
}: BuildWorkspaceRightSurfaceRuntimePendingIntentsParams): WorkspaceRightSurfaceIntent[] {
  return [
    ...buildWorkspaceRightSurfaceHarnessPendingIntents({
      enabled: !suppressHomeNavbarUtilityActions && showHarnessToggle,
      pendingCount: harnessPendingCount,
      createdAt,
    }),
    ...buildWorkspaceRightSurfaceFilePreviewIntents({
      enabled: Boolean(preferredServiceSkillResultFileTargetRelativePath),
      relativePath: preferredServiceSkillResultFileTargetRelativePath,
      createdAt,
    }),
    ...buildWorkspaceRightSurfaceObjectCanvasCandidateIntents({
      enabled: Boolean(objectCanvasCandidateId),
      candidateId: objectCanvasCandidateId,
      createdAt,
    }),
  ];
}

export function buildWorkspaceRightSurfaceRuntimeAvailableSurfaces({
  filesAvailable,
  hasExpertInfoPanel,
  shellAvailable,
  showHarnessToggle,
  suppressHomeNavbarUtilityActions,
}: Pick<
  BuildWorkspaceRightSurfaceRuntimeLaunchersParams,
  | "hasExpertInfoPanel"
  | "filesAvailable"
  | "shellAvailable"
  | "showHarnessToggle"
  | "suppressHomeNavbarUtilityActions"
>): ReadonlySet<WorkspaceRightSurfaceKind> {
  const surfaces: WorkspaceRightSurfaceKind[] = ["workbench"];
  if (hasExpertInfoPanel) {
    surfaces.push("expertInfo");
  }
  if (filesAvailable) {
    surfaces.push("files");
  }
  if (!suppressHomeNavbarUtilityActions && shellAvailable) {
    surfaces.push("shell");
  }
  if (!suppressHomeNavbarUtilityActions && showHarnessToggle) {
    surfaces.push("harness");
  }
  return new Set(surfaces);
}

export function buildWorkspaceRightSurfaceRuntimeLaunchers({
  filesAvailable,
  hasExpertInfoPanel,
  pendingIntents,
  shellAvailable,
  showHarnessToggle,
  suppressHomeNavbarUtilityActions,
  surfaceState,
}: BuildWorkspaceRightSurfaceRuntimeLaunchersParams): WorkspaceRightSurfaceLauncherProjection[] {
  return buildWorkspaceRightSurfaceLauncherProjections({
    surfaceState,
    pendingIntents,
    availableSurfaces: buildWorkspaceRightSurfaceRuntimeAvailableSurfaces({
      filesAvailable,
      hasExpertInfoPanel,
      shellAvailable,
      showHarnessToggle,
      suppressHomeNavbarUtilityActions,
    }),
  });
}
