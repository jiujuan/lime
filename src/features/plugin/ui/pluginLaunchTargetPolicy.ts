import type { PluginRightSurfaceLaunchTarget } from "./pluginRightSurfaceLaunch";

export type PluginLaunchTargetMode = "standalone" | "rightSurface";

export interface PluginLaunchTargetPolicy {
  mode: PluginLaunchTargetMode;
  rightSurfaceAvailable: boolean;
  rightSurfaceTarget: PluginRightSurfaceLaunchTarget | null;
  rightSurfaceTargetId: string | null;
  rightSurfaceTargets: PluginRightSurfaceLaunchTargetOption[];
}

export interface PluginRightSurfaceLaunchTargetOption {
  id: string;
  target: PluginRightSurfaceLaunchTarget;
  label: string | null;
  description: string | null;
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizePluginRightSurfaceLaunchTarget(
  target: PluginRightSurfaceLaunchTarget | null | undefined,
): PluginRightSurfaceLaunchTarget | null {
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

export function getPluginRightSurfaceLaunchTargetId(
  target: PluginRightSurfaceLaunchTarget | null | undefined,
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
  target: PluginRightSurfaceLaunchTarget | null | undefined,
): PluginRightSurfaceLaunchTargetOption | null {
  const normalized = normalizePluginRightSurfaceLaunchTarget(target);
  const id = getPluginRightSurfaceLaunchTargetId(normalized);
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

export function normalizePluginRightSurfaceLaunchTargetOptions(
  targets:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
): PluginRightSurfaceLaunchTargetOption[] {
  const seen = new Set<string>();
  const options: PluginRightSurfaceLaunchTargetOption[] = [];
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

export function buildPluginRightSurfaceLaunchTargetOptions(params: {
  rightSurfaceTarget?: PluginRightSurfaceLaunchTarget | null;
  rightSurfaceTargets?:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null;
}): PluginRightSurfaceLaunchTargetOption[] {
  return normalizePluginRightSurfaceLaunchTargetOptions([
    params.rightSurfaceTarget,
    ...(params.rightSurfaceTargets ?? []),
  ]);
}

export function resolvePluginLaunchTargetPolicy(params: {
  mode: PluginLaunchTargetMode;
  rightSurfaceTarget?: PluginRightSurfaceLaunchTarget | null;
  rightSurfaceTargets?:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null;
  selectedRightSurfaceTargetId?: string | null;
}): PluginLaunchTargetPolicy {
  const rightSurfaceTargets = buildPluginRightSurfaceLaunchTargetOptions({
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
