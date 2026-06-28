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
import type {
  PluginActivationContext,
  PluginContract,
} from "@/features/plugin";
import { buildWorkspacePluginRightSurfaceIntents } from "./workspacePluginRightSurfaceProjection";

export interface BuildWorkspaceRightSurfaceRuntimePendingIntentsParams {
  createdAt: number;
  harnessPendingCount: number;
  objectCanvasCandidateId?: string | null;
  pluginActivationContext?: PluginActivationContext | null;
  pluginContracts?: readonly PluginContract[];
  pluginRightSurfaceIntentTtlMs?: number;
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
  traceAvailable?: boolean;
  suppressHomeNavbarUtilityActions: boolean;
  surfaceState: WorkspaceRightSurfaceState;
}

export function buildWorkspaceRightSurfaceRuntimePendingIntents({
  createdAt,
  harnessPendingCount,
  objectCanvasCandidateId,
  pluginActivationContext,
  pluginContracts = [],
  pluginRightSurfaceIntentTtlMs,
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
    ...buildWorkspacePluginRightSurfaceIntents({
      activationContext: pluginActivationContext,
      contracts: pluginContracts,
      createdAt,
      ttlMs: pluginRightSurfaceIntentTtlMs,
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
  traceAvailable = false,
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
  | "traceAvailable"
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
  if (!suppressHomeNavbarUtilityActions && traceAvailable) {
    surfaces.push("trace");
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
  traceAvailable,
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
      traceAvailable,
      suppressHomeNavbarUtilityActions,
    }),
  });
}
