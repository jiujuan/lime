import { useMemo } from "react";
import type { BrowserAssistSessionState } from "../types";
import type { WorkspaceFilesSurfaceTarget } from "./WorkspaceFilesSurface";
import type { WorkspaceObjectCanvasCandidate } from "./workspaceObjectCanvasModel";
import type { WorkspacePluginSurfaceDescriptor } from "./workspacePluginSurfaceModel";
import { selectWorkspacePluginSurfaceDescriptor } from "./workspacePluginSurfaceModel";
import type { BrowserSessionRef } from "./workspaceBrowserSessionRef";
import type { WorkspaceRightSurfaceBrowserIntent } from "./workspaceRightSurfaceBrowserIntent";

interface UseWorkspaceRightSurfaceDerivedRuntimeParams {
  activeBrowserRightSurfaceIntent: WorkspaceRightSurfaceBrowserIntent | null;
  activeFilesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null;
  activeObjectCanvasRightSurfaceCandidate: WorkspaceObjectCanvasCandidate | null;
  activePluginSurfaceContainerId: string | null;
  activePluginSurfaces: WorkspacePluginSurfaceDescriptor[];
  browserAssistLaunching: boolean;
  browserAssistSessionRef: BrowserSessionRef | null;
  browserAssistSessionState: BrowserAssistSessionState | null;
  currentBrowserAssistScopeKey: string | null;
  pendingBrowserRightSurfaceIntent: WorkspaceRightSurfaceBrowserIntent | null;
  pendingFileTarget: WorkspaceFilesSurfaceTarget | null;
  pendingObjectCanvasCandidate: WorkspaceObjectCanvasCandidate | null;
  pendingPluginSurfaces: WorkspacePluginSurfaceDescriptor[];
  preferredServiceSkillResultFileTarget: WorkspaceFilesSurfaceTarget | null;
}

interface UseWorkspaceRightSurfaceDerivedRuntimeResult {
  browserAssistObjectCanvasCandidate: WorkspaceObjectCanvasCandidate | null;
  browserAssistObjectCanvasCandidateId: string | null;
  browserRightSurfaceAvailable: boolean;
  browserRightSurfaceControlMode: string | null;
  browserRightSurfaceIntent: WorkspaceRightSurfaceBrowserIntent | null;
  browserRightSurfaceLifecycleState: string | null;
  browserRightSurfaceSessionRef: BrowserSessionRef | null;
  filesRightSurfaceAvailable: boolean;
  filesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null;
  objectCanvasRightSurfaceAvailable: boolean;
  objectCanvasRightSurfaceCandidate: WorkspaceObjectCanvasCandidate | null;
  pluginSurfaceRightSurface: WorkspacePluginSurfaceDescriptor | null;
  pluginSurfaceRightSurfaceAvailable: boolean;
  pluginSurfaceRightSurfaces: WorkspacePluginSurfaceDescriptor[];
}

export function useWorkspaceRightSurfaceDerivedRuntime({
  activeBrowserRightSurfaceIntent,
  activeFilesRightSurfaceTarget,
  activeObjectCanvasRightSurfaceCandidate,
  activePluginSurfaceContainerId,
  activePluginSurfaces,
  browserAssistLaunching,
  browserAssistSessionRef,
  browserAssistSessionState,
  currentBrowserAssistScopeKey,
  pendingBrowserRightSurfaceIntent,
  pendingFileTarget,
  pendingObjectCanvasCandidate,
  pendingPluginSurfaces,
  preferredServiceSkillResultFileTarget,
}: UseWorkspaceRightSurfaceDerivedRuntimeParams): UseWorkspaceRightSurfaceDerivedRuntimeResult {
  const browserRightSurfaceAvailable = true;
  const browserRightSurfaceIntent =
    activeBrowserRightSurfaceIntent ?? pendingBrowserRightSurfaceIntent;
  const browserRightSurfaceSessionRef =
    browserRightSurfaceIntent?.sessionRef ?? browserAssistSessionRef;
  const browserRightSurfaceUsesBrowserAssistSession =
    browserRightSurfaceSessionRef === browserAssistSessionRef;
  const browserRightSurfaceControlMode =
    browserRightSurfaceIntent?.controlMode ??
    (browserRightSurfaceUsesBrowserAssistSession
      ? browserAssistSessionState?.controlMode ?? null
      : null);
  const browserRightSurfaceLifecycleState =
    browserRightSurfaceIntent?.lifecycleState ??
    (browserRightSurfaceUsesBrowserAssistSession
      ? browserAssistSessionState?.lifecycleState ?? null
      : null);
  const liveFilesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null =
    preferredServiceSkillResultFileTarget ?? pendingFileTarget;
  const pluginSurfaceRightSurfaces =
    activePluginSurfaces.length > 0
      ? activePluginSurfaces
      : pendingPluginSurfaces;
  const pluginSurfaceRightSurface = selectWorkspacePluginSurfaceDescriptor(
    pluginSurfaceRightSurfaces,
    activePluginSurfaceContainerId,
  );
  const pluginSurfaceRightSurfaceAvailable =
    pluginSurfaceRightSurfaces.length > 0;
  const filesRightSurfaceTarget: WorkspaceFilesSurfaceTarget | null =
    activeFilesRightSurfaceTarget ?? liveFilesRightSurfaceTarget;
  const filesRightSurfaceAvailable = Boolean(
    filesRightSurfaceTarget?.relativePath,
  );
  const browserAssistObjectCanvasCandidateId = browserAssistLaunching
    ? currentBrowserAssistScopeKey ||
      browserAssistSessionState?.sessionId ||
      browserAssistSessionState?.targetId ||
      browserAssistSessionState?.profileKey ||
      browserAssistSessionState?.url ||
      "browser-assist-launching"
    : browserAssistSessionState?.sessionId ||
      browserAssistSessionState?.targetId ||
      browserAssistSessionState?.profileKey ||
      browserAssistSessionState?.url ||
      null;
  const browserAssistObjectCanvasCandidate =
    useMemo<WorkspaceObjectCanvasCandidate | null>(
      () =>
        browserAssistObjectCanvasCandidateId
          ? {
              candidateId:
                browserAssistObjectCanvasCandidateId || "browser-assist",
              title: browserAssistSessionState?.title,
              url: browserAssistSessionState?.url,
              sessionId: browserAssistSessionState?.sessionId,
              profileKey: browserAssistSessionState?.profileKey,
              targetId: browserAssistSessionState?.targetId,
              lifecycleState: browserAssistSessionState?.lifecycleState,
              controlMode: browserAssistSessionState?.controlMode,
              transportKind: browserAssistSessionState?.transportKind,
              launching: browserAssistLaunching,
              sourceKind: "browserAssist",
            }
          : null,
      [
        browserAssistLaunching,
        browserAssistObjectCanvasCandidateId,
        browserAssistSessionState?.controlMode,
        browserAssistSessionState?.lifecycleState,
        browserAssistSessionState?.profileKey,
        browserAssistSessionState?.sessionId,
        browserAssistSessionState?.targetId,
        browserAssistSessionState?.title,
        browserAssistSessionState?.transportKind,
        browserAssistSessionState?.url,
      ],
    );
  const objectCanvasRightSurfaceCandidate =
    activeObjectCanvasRightSurfaceCandidate ??
    browserAssistObjectCanvasCandidate ??
    pendingObjectCanvasCandidate;
  const objectCanvasCandidateId =
    objectCanvasRightSurfaceCandidate?.candidateId ?? null;
  const objectCanvasRightSurfaceAvailable = Boolean(objectCanvasCandidateId);

  return {
    browserAssistObjectCanvasCandidate,
    browserAssistObjectCanvasCandidateId,
    browserRightSurfaceAvailable,
    browserRightSurfaceControlMode,
    browserRightSurfaceIntent,
    browserRightSurfaceLifecycleState,
    browserRightSurfaceSessionRef,
    filesRightSurfaceAvailable,
    filesRightSurfaceTarget,
    objectCanvasRightSurfaceAvailable,
    objectCanvasRightSurfaceCandidate,
    pluginSurfaceRightSurface,
    pluginSurfaceRightSurfaceAvailable,
    pluginSurfaceRightSurfaces,
  };
}
