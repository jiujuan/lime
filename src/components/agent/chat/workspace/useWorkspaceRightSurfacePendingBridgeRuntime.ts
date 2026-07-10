import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import { shouldAutoRefreshWorkspaceRightSurfacePending } from "./agentChatWorkspaceHelpers";
import type { WorkspaceRightSurfaceKind } from "./right-surface";
import type { WorkspaceRightSurfacePendingActions } from "./useWorkspaceRightSurfaceArtifactOpenRuntime";
import {
  useWorkspaceRightSurfacePendingRuntime,
  type WorkspaceRightSurfacePendingRuntime,
} from "./useWorkspaceRightSurfacePendingRuntime";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";

interface UseWorkspaceRightSurfacePendingBridgeRuntimeParams {
  bindRightSurfacePendingActions: (
    actions: WorkspaceRightSurfacePendingActions,
  ) => void;
  canvasWorkbenchRootPath: string | null;
  manualRightSurface: WorkspaceRightSurfaceKind | null;
  pluginRuntimeContext: WorkspacePluginRuntimeContext;
  runtimeWorkspaceId: string | null;
  sceneIsPreparingSend: boolean;
  sceneIsSending: boolean;
  sceneLayoutMode: LayoutMode;
  sceneSessionId?: string | null;
  sessionId?: string | null;
  taskCenterHomeHotpathActive: boolean;
}

export function useWorkspaceRightSurfacePendingBridgeRuntime({
  bindRightSurfacePendingActions,
  canvasWorkbenchRootPath,
  manualRightSurface,
  pluginRuntimeContext,
  runtimeWorkspaceId,
  sceneIsPreparingSend,
  sceneIsSending,
  sceneLayoutMode,
  sceneSessionId,
  sessionId,
  taskCenterHomeHotpathActive,
}: UseWorkspaceRightSurfacePendingBridgeRuntimeParams): WorkspaceRightSurfacePendingRuntime {
  const activePluginActivationContext =
    pluginRuntimeContext.status === "active"
      ? pluginRuntimeContext.activationContext
      : null;
  const rightSurfacePendingSessionId = sessionId || sceneSessionId;
  const shouldAutoRefreshRightSurfacePending =
    shouldAutoRefreshWorkspaceRightSurfacePending({
      sessionId: rightSurfacePendingSessionId,
      workspaceId: runtimeWorkspaceId,
      workspaceRoot: canvasWorkbenchRootPath,
      sceneIsSending,
      sceneIsPreparingSend,
      sceneLayoutMode,
      taskCenterHomeHotpathActive,
      manualRightSurfaceActive: manualRightSurface !== null,
      pluginActivationActive: Boolean(activePluginActivationContext),
    });
  const rightSurfaceAppServerPendingRuntime =
    useWorkspaceRightSurfacePendingRuntime({
      enabled: true,
      autoRefreshEnabled: shouldAutoRefreshRightSurfacePending,
      workspaceId: runtimeWorkspaceId,
      workspaceRoot: canvasWorkbenchRootPath,
      sessionId: rightSurfacePendingSessionId,
      pluginActivationContext: activePluginActivationContext,
      pluginContracts: pluginRuntimeContext.contracts,
    });

  bindRightSurfacePendingActions({
    consumePendingRequestsForSurface:
      rightSurfaceAppServerPendingRuntime.consumePendingRequestsForSurface,
    refreshRightSurfacePendingRequests:
      rightSurfaceAppServerPendingRuntime.refreshPendingRequests,
  });

  return rightSurfaceAppServerPendingRuntime;
}
