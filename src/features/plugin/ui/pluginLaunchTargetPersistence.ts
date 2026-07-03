import type { PluginRightSurfaceLaunchTarget } from "./pluginRightSurfaceLaunch";
import {
  getPluginRightSurfaceLaunchTargetId,
  normalizePluginRightSurfaceLaunchTarget,
} from "./pluginLaunchTargetPolicy";

export const PLUGIN_RIGHT_SURFACE_TARGET_STORAGE_KEY =
  "plugin:right-surface-targets:v1";
export const DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT = 5;

export interface PluginLaunchTargetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT;
  }
  return Math.max(0, Math.floor(limit));
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseUnknownTarget(
  value: unknown,
): PluginRightSurfaceLaunchTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const normalized = normalizePluginRightSurfaceLaunchTarget({
    workspaceId: readOptionalString(record.workspaceId),
    sessionId: readOptionalString(record.sessionId),
    label: readOptionalString(record.label),
    title: readOptionalString(record.title),
    description: readOptionalString(record.description),
  });

  return normalized?.sessionId ? normalized : null;
}

function normalizePluginRightSurfaceLaunchTargets(
  targets: readonly unknown[],
  limit = DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT,
): PluginRightSurfaceLaunchTarget[] {
  const maxTargets = normalizeLimit(limit);
  if (maxTargets === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedTargets: PluginRightSurfaceLaunchTarget[] = [];
  for (const target of targets) {
    const normalized = parseUnknownTarget(target);
    const id = getPluginRightSurfaceLaunchTargetId(normalized);
    if (!normalized || !id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalizedTargets.push(normalized);
    if (normalizedTargets.length >= maxTargets) {
      break;
    }
  }
  return normalizedTargets;
}

export function upsertPluginRightSurfaceLaunchTarget(
  current:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  target: PluginRightSurfaceLaunchTarget | null | undefined,
  limit = DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT,
): PluginRightSurfaceLaunchTarget[] {
  return normalizePluginRightSurfaceLaunchTargets(
    [target, ...(current ?? [])],
    limit,
  );
}

export function parsePluginRightSurfaceLaunchTargets(
  value: string | null | undefined,
  limit = DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT,
): PluginRightSurfaceLaunchTarget[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizePluginRightSurfaceLaunchTargets(parsed, limit);
  } catch {
    return [];
  }
}

export function serializePluginRightSurfaceLaunchTargets(
  targets:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  limit = DEFAULT_PLUGIN_RIGHT_SURFACE_TARGET_LIMIT,
): string {
  return JSON.stringify(
    normalizePluginRightSurfaceLaunchTargets([...(targets ?? [])], limit),
  );
}

export function loadPluginRightSurfaceLaunchTargetsFromStorage(
  storage: PluginLaunchTargetStorage | null | undefined,
  key = PLUGIN_RIGHT_SURFACE_TARGET_STORAGE_KEY,
): PluginRightSurfaceLaunchTarget[] {
  if (!storage) {
    return [];
  }
  try {
    return parsePluginRightSurfaceLaunchTargets(storage.getItem(key));
  } catch {
    return [];
  }
}

export function savePluginRightSurfaceLaunchTargetsToStorage(
  storage: PluginLaunchTargetStorage | null | undefined,
  targets:
    | readonly (PluginRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  key = PLUGIN_RIGHT_SURFACE_TARGET_STORAGE_KEY,
): void {
  if (!storage) {
    return;
  }

  const value = serializePluginRightSurfaceLaunchTargets(targets);
  try {
    if (value === "[]" && storage.removeItem) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, value);
  } catch {
    // localStorage 可能因隐私模式或配额限制不可写，启动目标恢复应 fail closed。
  }
}
