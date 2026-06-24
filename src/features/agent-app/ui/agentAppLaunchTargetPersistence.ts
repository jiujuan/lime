import type { AgentAppRightSurfaceLaunchTarget } from "./agentAppRightSurfaceLaunch";
import {
  getAgentAppRightSurfaceLaunchTargetId,
  normalizeAgentAppRightSurfaceLaunchTarget,
} from "./agentAppLaunchTargetPolicy";

export const AGENT_APP_RIGHT_SURFACE_TARGET_STORAGE_KEY =
  "agent-app:right-surface-targets:v1";
export const DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT = 5;

export interface AgentAppLaunchTargetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT;
  }
  return Math.max(0, Math.floor(limit));
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseUnknownTarget(
  value: unknown,
): AgentAppRightSurfaceLaunchTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const normalized = normalizeAgentAppRightSurfaceLaunchTarget({
    workspaceId: readOptionalString(record.workspaceId),
    sessionId: readOptionalString(record.sessionId),
    label: readOptionalString(record.label),
    title: readOptionalString(record.title),
    description: readOptionalString(record.description),
  });

  return normalized?.sessionId ? normalized : null;
}

function normalizeAgentAppRightSurfaceLaunchTargets(
  targets: readonly unknown[],
  limit = DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT,
): AgentAppRightSurfaceLaunchTarget[] {
  const maxTargets = normalizeLimit(limit);
  if (maxTargets === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedTargets: AgentAppRightSurfaceLaunchTarget[] = [];
  for (const target of targets) {
    const normalized = parseUnknownTarget(target);
    const id = getAgentAppRightSurfaceLaunchTargetId(normalized);
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

export function upsertAgentAppRightSurfaceLaunchTarget(
  current:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  target: AgentAppRightSurfaceLaunchTarget | null | undefined,
  limit = DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT,
): AgentAppRightSurfaceLaunchTarget[] {
  return normalizeAgentAppRightSurfaceLaunchTargets(
    [target, ...(current ?? [])],
    limit,
  );
}

export function parseAgentAppRightSurfaceLaunchTargets(
  value: string | null | undefined,
  limit = DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT,
): AgentAppRightSurfaceLaunchTarget[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeAgentAppRightSurfaceLaunchTargets(parsed, limit);
  } catch {
    return [];
  }
}

export function serializeAgentAppRightSurfaceLaunchTargets(
  targets:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  limit = DEFAULT_AGENT_APP_RIGHT_SURFACE_TARGET_LIMIT,
): string {
  return JSON.stringify(
    normalizeAgentAppRightSurfaceLaunchTargets([...(targets ?? [])], limit),
  );
}

export function loadAgentAppRightSurfaceLaunchTargetsFromStorage(
  storage: AgentAppLaunchTargetStorage | null | undefined,
  key = AGENT_APP_RIGHT_SURFACE_TARGET_STORAGE_KEY,
): AgentAppRightSurfaceLaunchTarget[] {
  if (!storage) {
    return [];
  }
  try {
    return parseAgentAppRightSurfaceLaunchTargets(storage.getItem(key));
  } catch {
    return [];
  }
}

export function saveAgentAppRightSurfaceLaunchTargetsToStorage(
  storage: AgentAppLaunchTargetStorage | null | undefined,
  targets:
    | readonly (AgentAppRightSurfaceLaunchTarget | null | undefined)[]
    | null
    | undefined,
  key = AGENT_APP_RIGHT_SURFACE_TARGET_STORAGE_KEY,
): void {
  if (!storage) {
    return;
  }

  const value = serializeAgentAppRightSurfaceLaunchTargets(targets);
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
