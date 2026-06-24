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
  appSurfaceAvailable?: boolean;
  hasExpertInfoPanel: boolean;
  objectCanvasAvailable: boolean;
  productProfileAvailable?: boolean;
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
  appSurfaceAvailable = false,
  hasExpertInfoPanel,
  objectCanvasAvailable,
  productProfileAvailable = objectCanvasAvailable,
  shellAvailable,
  showHarnessToggle,
  suppressHomeNavbarUtilityActions,
}: Pick<
  BuildWorkspaceRightSurfaceRuntimeLaunchersParams,
  | "hasExpertInfoPanel"
  | "appSurfaceAvailable"
  | "filesAvailable"
  | "objectCanvasAvailable"
  | "productProfileAvailable"
  | "shellAvailable"
  | "showHarnessToggle"
  | "suppressHomeNavbarUtilityActions"
>): ReadonlySet<WorkspaceRightSurfaceKind> {
  const surfaces: WorkspaceRightSurfaceKind[] = ["workbench"];
  if (appSurfaceAvailable) {
    surfaces.push("appSurface");
  }
  if (productProfileAvailable) {
    surfaces.push("productProfile");
  }
  if (hasExpertInfoPanel) {
    surfaces.push("expertInfo");
  }
  if (objectCanvasAvailable) {
    surfaces.push("objectCanvas");
  }
  surfaces.push("browser");
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
  appSurfaceAvailable,
  hasExpertInfoPanel,
  objectCanvasAvailable,
  productProfileAvailable,
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
      appSurfaceAvailable,
      hasExpertInfoPanel,
      objectCanvasAvailable,
      productProfileAvailable,
      shellAvailable,
      showHarnessToggle,
      suppressHomeNavbarUtilityActions,
    }),
  });
}
