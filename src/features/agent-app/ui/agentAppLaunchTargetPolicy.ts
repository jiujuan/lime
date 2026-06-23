import type { AgentAppRightSurfaceLaunchTarget } from "./agentAppRightSurfaceLaunch";

export type AgentAppLaunchTargetMode = "standalone" | "rightSurface";

export interface AgentAppLaunchTargetPolicy {
  mode: AgentAppLaunchTargetMode;
  rightSurfaceAvailable: boolean;
  rightSurfaceTarget: AgentAppRightSurfaceLaunchTarget | null;
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizeAgentAppRightSurfaceLaunchTarget(
  target: AgentAppRightSurfaceLaunchTarget | null | undefined,
): AgentAppRightSurfaceLaunchTarget | null {
  const workspaceId = normalizeOptionalString(target?.workspaceId);
  const sessionId = normalizeOptionalString(target?.sessionId);
  if (!workspaceId && !sessionId) {
    return null;
  }
  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function resolveAgentAppLaunchTargetPolicy(params: {
  mode: AgentAppLaunchTargetMode;
  rightSurfaceTarget?: AgentAppRightSurfaceLaunchTarget | null;
}): AgentAppLaunchTargetPolicy {
  const rightSurfaceTarget = normalizeAgentAppRightSurfaceLaunchTarget(
    params.rightSurfaceTarget,
  );
  const rightSurfaceAvailable = Boolean(rightSurfaceTarget);
  if (params.mode !== "rightSurface" || !rightSurfaceTarget) {
    return {
      mode: "standalone",
      rightSurfaceAvailable,
      rightSurfaceTarget: null,
    };
  }
  return {
    mode: "rightSurface",
    rightSurfaceAvailable,
    rightSurfaceTarget,
  };
}
