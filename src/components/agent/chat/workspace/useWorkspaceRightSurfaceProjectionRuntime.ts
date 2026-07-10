import { useMemo } from "react";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import {
  resolveWorkspaceRightSurfaceState,
  type WorkspaceRightSurfaceIntent,
  type WorkspaceRightSurfaceKind,
  type WorkspaceRightSurfaceLauncherProjection,
  type WorkspaceRightSurfaceState,
} from "./right-surface";
import {
  buildWorkspaceRightSurfaceRuntimeLaunchers,
  buildWorkspaceRightSurfaceRuntimePendingIntents,
  hasWorkspaceRightSurfaceRuntimePendingSignals,
} from "./workspaceRightSurfaceRuntimeProjection";

interface UseWorkspaceRightSurfaceProjectionRuntimeParams {
  appServerPendingIntents: readonly WorkspaceRightSurfaceIntent[];
  appSurfaceAvailable: boolean;
  articleWorkspaceAvailable: boolean;
  expertInfoVisible: boolean;
  filesAvailable: boolean;
  harnessPendingCount: number;
  hasExpertInfoPanel: boolean;
  manualRightSurface: WorkspaceRightSurfaceKind | null;
  objectCanvasAvailable: boolean;
  objectCanvasCandidateId?: string | null;
  preferredServiceSkillResultFileTargetRelativePath?: string | null;
  sceneLayoutMode: LayoutMode;
  shellAvailable: boolean;
  showHarnessToggle: boolean;
  suppressHomeNavbarUtilityActions: boolean;
  traceAvailable: boolean;
}

interface UseWorkspaceRightSurfaceProjectionRuntimeResult {
  rightSurfaceLaunchers: WorkspaceRightSurfaceLauncherProjection[];
  rightSurfacePendingIntents: WorkspaceRightSurfaceIntent[];
  rightSurfaceState: WorkspaceRightSurfaceState;
}

function resolveWorkspaceRightSurfaceOpenSurfaces({
  appSurfaceAvailable,
  filesAvailable,
  hasExpertInfoPanel,
  manualRightSurface,
  objectCanvasAvailable,
  sceneLayoutMode,
  shellAvailable,
  harnessAvailable,
  traceAvailable,
}: {
  appSurfaceAvailable: boolean;
  filesAvailable: boolean;
  hasExpertInfoPanel: boolean;
  manualRightSurface: WorkspaceRightSurfaceKind | null;
  objectCanvasAvailable: boolean;
  sceneLayoutMode: LayoutMode;
  shellAvailable: boolean;
  harnessAvailable: boolean;
  traceAvailable: boolean;
}): WorkspaceRightSurfaceKind[] {
  const next: WorkspaceRightSurfaceKind[] = [];
  const add = (kind: WorkspaceRightSurfaceKind, enabled: boolean) => {
    if (enabled && !next.includes(kind)) {
      next.push(kind);
    }
  };

  add("workbench", sceneLayoutMode !== "chat");
  add("appSurface", appSurfaceAvailable);
  add("objectCanvas", objectCanvasAvailable);
  add("expertInfo", hasExpertInfoPanel);
  add("files", filesAvailable);
  add("shell", shellAvailable);
  add("harness", harnessAvailable);
  add("trace", traceAvailable);
  add("objectCanvas", manualRightSurface === "objectCanvas");
  add("articleWorkspace", manualRightSurface === "articleWorkspace");
  add("files", manualRightSurface === "files");
  add("shell", manualRightSurface === "shell");
  add("harness", manualRightSurface === "harness");
  add("trace", manualRightSurface === "trace");
  add("appSurface", manualRightSurface === "appSurface");
  add("expertInfo", manualRightSurface === "expertInfo");
  add("browser", manualRightSurface === "browser");
  return next;
}

export function useWorkspaceRightSurfaceProjectionRuntime({
  appServerPendingIntents,
  appSurfaceAvailable,
  articleWorkspaceAvailable,
  expertInfoVisible,
  filesAvailable,
  harnessPendingCount,
  hasExpertInfoPanel,
  manualRightSurface,
  objectCanvasAvailable,
  objectCanvasCandidateId,
  preferredServiceSkillResultFileTargetRelativePath,
  sceneLayoutMode,
  shellAvailable,
  showHarnessToggle,
  suppressHomeNavbarUtilityActions,
  traceAvailable,
}: UseWorkspaceRightSurfaceProjectionRuntimeParams): UseWorkspaceRightSurfaceProjectionRuntimeResult {
  const harnessAvailable =
    !suppressHomeNavbarUtilityActions && showHarnessToggle;
  const effectiveTraceAvailable =
    !suppressHomeNavbarUtilityActions && traceAvailable;
  const openSurfaces = useMemo(
    () =>
      resolveWorkspaceRightSurfaceOpenSurfaces({
        appSurfaceAvailable,
        filesAvailable,
        hasExpertInfoPanel,
        manualRightSurface,
        objectCanvasAvailable,
        sceneLayoutMode,
        shellAvailable,
        harnessAvailable,
        traceAvailable: effectiveTraceAvailable,
      }),
    [
      appSurfaceAvailable,
      effectiveTraceAvailable,
      filesAvailable,
      harnessAvailable,
      hasExpertInfoPanel,
      manualRightSurface,
      objectCanvasAvailable,
      sceneLayoutMode,
      shellAvailable,
    ],
  );
  const rightSurfaceState = useMemo(
    () =>
      resolveWorkspaceRightSurfaceState({
        layoutMode: sceneLayoutMode,
        hasExpertInfo: hasExpertInfoPanel,
        expertInfoVisible,
        openSurfaces,
        requestedSurface: manualRightSurface ?? undefined,
        source: manualRightSurface ? "user" : undefined,
      }),
    [
      expertInfoVisible,
      hasExpertInfoPanel,
      manualRightSurface,
      openSurfaces,
      sceneLayoutMode,
    ],
  );
  const runtimePendingIntents = useMemo(() => {
    const params = {
      createdAt: Date.now(),
      harnessPendingCount,
      objectCanvasCandidateId,
      preferredServiceSkillResultFileTargetRelativePath,
      showHarnessToggle,
      suppressHomeNavbarUtilityActions,
    };
    return hasWorkspaceRightSurfaceRuntimePendingSignals(params)
      ? buildWorkspaceRightSurfaceRuntimePendingIntents(params)
      : [];
  }, [
    harnessPendingCount,
    objectCanvasCandidateId,
    preferredServiceSkillResultFileTargetRelativePath,
    showHarnessToggle,
    suppressHomeNavbarUtilityActions,
  ]);
  const rightSurfacePendingIntents = useMemo(
    () => [...runtimePendingIntents, ...appServerPendingIntents],
    [appServerPendingIntents, runtimePendingIntents],
  );
  const rightSurfaceLaunchers = useMemo(
    () =>
      buildWorkspaceRightSurfaceRuntimeLaunchers({
        surfaceState: rightSurfaceState,
        pendingIntents: rightSurfacePendingIntents,
        filesAvailable,
        appSurfaceAvailable,
        hasExpertInfoPanel,
        objectCanvasAvailable,
        articleWorkspaceAvailable,
        shellAvailable,
        showHarnessToggle,
        traceAvailable,
        suppressHomeNavbarUtilityActions,
      }),
    [
      appSurfaceAvailable,
      articleWorkspaceAvailable,
      filesAvailable,
      hasExpertInfoPanel,
      objectCanvasAvailable,
      rightSurfacePendingIntents,
      rightSurfaceState,
      shellAvailable,
      showHarnessToggle,
      suppressHomeNavbarUtilityActions,
      traceAvailable,
    ],
  );

  return {
    rightSurfaceLaunchers,
    rightSurfacePendingIntents,
    rightSurfaceState,
  };
}
