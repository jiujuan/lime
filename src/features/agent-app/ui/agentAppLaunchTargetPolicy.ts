import type { AgentAppRightSurfaceLaunchTarget } from "./agentAppRightSurfaceLaunch";

export type AgentAppLaunchTargetMode = "standalone" | "rightSurface";

export interface AgentAppLaunchTargetPolicy {
  mode: AgentAppLaunchTargetMode;
  rightSurfaceAvailable: boolean;
  rightSurfaceTarget: AgentAppRightSurfaceLaunchTarget | null;
  rightSurfaceTargetId: string | null;
  rightSurfaceTargets: AgentAppRightSurfaceLaunchTargetOption[];
}

export interface AgentAppRightSurfaceLaunchTargetOption {
  id: string;
  target: AgentAppRightSurfaceLaunchTarget;
  label: string | null;
  description: string | null;
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
  const label = normalizeOptionalString(target?.label);
  const title = normalizeOptionalString(target?.title);
  const description = normalizeOptionalString(target?.description);
  if (!workspaceId && !sessionId) {
    return null;
  }
  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(label ? { label } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

export function getAgentAppRightSurfaceLaunchTargetId(
  target: AgentAppRightSurfaceLaunchTarget | null | undefined,
): string | null {
  const workspaceId = normalizeOptionalString(target?.workspaceId);
  const sessionId = normalizeOptionalString(target?.sessionId);
  if (!workspaceId && !sessionId) {
    return null;
  }
  return [
    `workspace=${encodeURIComponent(workspaceId ?? "")}`,
    `session=${encodeURIComponent(sessionId ?? "")}`,
  ].join("&");
}

function buildRightSurfaceLaunchTargetOption(
  target: AgentAppRightSurfaceLaunchTarget | null | undefined,
): AgentAppRightSurfaceLaunchTargetOption | null {
  const normalized = normalizeAgentAppRightSurfaceLaunchTarget(target);
  const id = getAgentAppRightSurfaceLaunchTargetId(normalized);
  if (!normalized || !id) {
    return null;
  }
  return {
    id,
    target: normalized,
    label: normalized.label ?? normalized.title ?? null,
    description: normalized.description ?? null,
  };
}

export function normalizeAgentAppRightSurfaceLaunchTargetOptions(
  targets:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
): AgentAppRightSurfaceLaunchTargetOption[] {
  const seen = new Set<string>();
  const options: AgentAppRightSurfaceLaunchTargetOption[] = [];
  for (const target of targets ?? []) {
    const option = buildRightSurfaceLaunchTargetOption(target);
    if (!option || seen.has(option.id)) {
      continue;
    }
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

export function buildAgentAppRightSurfaceLaunchTargetOptions(params: {
  rightSurfaceTarget?: AgentAppRightSurfaceLaunchTarget | null;
  rightSurfaceTargets?:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null;
}): AgentAppRightSurfaceLaunchTargetOption[] {
  return normalizeAgentAppRightSurfaceLaunchTargetOptions([
    params.rightSurfaceTarget,
    ...(params.rightSurfaceTargets ?? []),
  ]);
}

export function resolveAgentAppLaunchTargetPolicy(params: {
  mode: AgentAppLaunchTargetMode;
  rightSurfaceTarget?: AgentAppRightSurfaceLaunchTarget | null;
  rightSurfaceTargets?:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null;
  selectedRightSurfaceTargetId?: string | null;
}): AgentAppLaunchTargetPolicy {
  const rightSurfaceTargets = buildAgentAppRightSurfaceLaunchTargetOptions({
    rightSurfaceTarget: params.rightSurfaceTarget,
    rightSurfaceTargets: params.rightSurfaceTargets,
  });
  const selectedRightSurfaceTargetId = normalizeOptionalString(
    params.selectedRightSurfaceTargetId,
  );
  const selectedOption =
    rightSurfaceTargets.find(
      (option) => option.id === selectedRightSurfaceTargetId,
    ) ??
    rightSurfaceTargets[0] ??
    null;
  const rightSurfaceAvailable = Boolean(selectedOption);
  if (params.mode !== "rightSurface" || !selectedOption) {
    return {
      mode: "standalone",
      rightSurfaceAvailable,
      rightSurfaceTarget: null,
      rightSurfaceTargetId: selectedOption?.id ?? null,
      rightSurfaceTargets,
    };
  }
  return {
    mode: "rightSurface",
    rightSurfaceAvailable,
    rightSurfaceTarget: selectedOption.target,
    rightSurfaceTargetId: selectedOption.id,
    rightSurfaceTargets,
  };
}
