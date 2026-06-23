import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";

export type WorkspaceAgentAppSurfaceStrategy =
  | "controlledBrowserWindow"
  | "webContentsView";

export interface WorkspaceAgentAppSurfaceDescriptor {
  appId: string;
  title: string;
  entryUrl: string;
  containerId: string;
  activeStrategy: WorkspaceAgentAppSurfaceStrategy;
  supportedStrategies: WorkspaceAgentAppSurfaceStrategy[];
  sourceRequestId?: string;
}

export function buildWorkspaceAgentAppSurfaceFromPendingRequests(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceAgentAppSurfaceDescriptor | null {
  return (
    buildWorkspaceAgentAppSurfacesFromPendingRequests(pendingRequests)[0] ??
    null
  );
}

export function buildWorkspaceAgentAppSurfacesFromPendingRequests(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceAgentAppSurfaceDescriptor[] {
  const next: WorkspaceAgentAppSurfaceDescriptor[] = [];
  for (const request of pendingRequests) {
    if (request.status !== "pending" || request.surfaceKind !== "appSurface") {
      continue;
    }

    const descriptor = buildWorkspaceAgentAppSurfaceFromPendingRequest(request);
    if (descriptor) {
      upsertWorkspaceAgentAppSurfaceDescriptor(next, descriptor);
    }
  }

  return next;
}

export function buildWorkspaceAgentAppSurfaceFromPendingRequest(
  request: WorkspaceRightSurfacePendingRequest,
): WorkspaceAgentAppSurfaceDescriptor | null {
  const metadata = asRecord(request.metadata);
  const surface = asRecord(metadata?.surface) ?? metadata;
  const embedding = asRecord(surface?.embedding);
  const entryUrl = firstString(
    surface?.entryUrl,
    metadata?.entryUrl,
    metadata?.url,
  );
  const appId = firstString(
    metadata?.appId,
    surface?.appId,
    request.candidateId,
  );
  const containerId = firstString(
    surface?.containerId,
    metadata?.containerId,
    request.candidateId,
    request.requestId,
  );
  if (!entryUrl || !appId || !containerId) {
    return null;
  }

  const supportedStrategies = normalizeStrategies(
    surface?.supportedStrategies,
    metadata?.supportedStrategies,
  );
  if (!supportedStrategies.includes("webContentsView")) {
    return null;
  }
  if (embedding?.rightSurfaceDock === false) {
    return null;
  }
  if (embedding?.iframe === true || embedding?.browserView === true) {
    return null;
  }

  return {
    appId,
    title:
      firstString(
        metadata?.title,
        metadata?.name,
        metadata?.appName,
        surface?.title,
      ) ?? appId,
    entryUrl,
    containerId,
    activeStrategy:
      normalizeStrategy(surface?.activeStrategy) ?? "webContentsView",
    supportedStrategies,
    sourceRequestId: request.requestId,
  };
}

export function mergeWorkspaceAgentAppSurfaceDescriptors(
  currentSurfaces: readonly WorkspaceAgentAppSurfaceDescriptor[],
  incomingSurfaces: readonly WorkspaceAgentAppSurfaceDescriptor[],
): WorkspaceAgentAppSurfaceDescriptor[] {
  const next = [...currentSurfaces];
  for (const surface of incomingSurfaces) {
    upsertWorkspaceAgentAppSurfaceDescriptor(next, surface);
  }
  return next;
}

export function selectWorkspaceAgentAppSurfaceDescriptor(
  surfaces: readonly WorkspaceAgentAppSurfaceDescriptor[],
  activeContainerId?: string | null,
): WorkspaceAgentAppSurfaceDescriptor | null {
  const normalizedActiveContainerId = normalizeKey(activeContainerId);
  if (normalizedActiveContainerId) {
    const selected = surfaces.find(
      (surface) =>
        normalizeKey(surface.containerId) === normalizedActiveContainerId,
    );
    if (selected) {
      return selected;
    }
  }
  return surfaces[0] ?? null;
}

export function resolveWorkspaceAgentAppSurfaceActiveContainerId({
  activeContainerId,
  preferredContainerId,
  surfaces,
}: {
  activeContainerId?: string | null;
  preferredContainerId?: string | null;
  surfaces: readonly WorkspaceAgentAppSurfaceDescriptor[];
}): string | null {
  const preferred = normalizeKey(preferredContainerId);
  if (
    preferred &&
    surfaces.some((surface) => normalizeKey(surface.containerId) === preferred)
  ) {
    return preferred;
  }

  const active = normalizeKey(activeContainerId);
  if (
    active &&
    surfaces.some((surface) => normalizeKey(surface.containerId) === active)
  ) {
    return active;
  }

  return surfaces[0]?.containerId ?? null;
}

export function closeWorkspaceAgentAppSurfaceDescriptor({
  activeContainerId,
  containerId,
  surfaces,
}: {
  activeContainerId?: string | null;
  containerId: string;
  surfaces: readonly WorkspaceAgentAppSurfaceDescriptor[];
}): {
  activeContainerId: string | null;
  surfaces: WorkspaceAgentAppSurfaceDescriptor[];
} {
  const normalizedContainerId = normalizeKey(containerId);
  const closedIndex = surfaces.findIndex(
    (surface) => normalizeKey(surface.containerId) === normalizedContainerId,
  );
  if (closedIndex < 0) {
    return {
      activeContainerId:
        resolveWorkspaceAgentAppSurfaceActiveContainerId({
          activeContainerId,
          surfaces,
        }) ?? null,
      surfaces: [...surfaces],
    };
  }

  const nextSurfaces = surfaces.filter(
    (surface) => normalizeKey(surface.containerId) !== normalizedContainerId,
  );
  const active = normalizeKey(activeContainerId);
  if (active && active !== normalizedContainerId) {
    return {
      activeContainerId: resolveWorkspaceAgentAppSurfaceActiveContainerId({
        activeContainerId: active,
        surfaces: nextSurfaces,
      }),
      surfaces: nextSurfaces,
    };
  }

  return {
    activeContainerId:
      nextSurfaces[Math.min(closedIndex, nextSurfaces.length - 1)]
        ?.containerId ?? null,
    surfaces: nextSurfaces,
  };
}

function upsertWorkspaceAgentAppSurfaceDescriptor(
  surfaces: WorkspaceAgentAppSurfaceDescriptor[],
  incoming: WorkspaceAgentAppSurfaceDescriptor,
): void {
  const incomingKey = normalizeKey(incoming.containerId);
  const existingIndex = surfaces.findIndex(
    (surface) => normalizeKey(surface.containerId) === incomingKey,
  );
  if (existingIndex >= 0) {
    surfaces[existingIndex] = incoming;
    return;
  }
  surfaces.push(incoming);
}

function normalizeStrategies(
  ...values: unknown[]
): WorkspaceAgentAppSurfaceStrategy[] {
  const strategies = values.flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  const next = strategies
    .map(normalizeStrategy)
    .filter(
      (strategy): strategy is WorkspaceAgentAppSurfaceStrategy =>
        strategy !== null,
    );
  return next.length > 0 ? Array.from(new Set(next)) : ["webContentsView"];
}

function normalizeStrategy(
  value: unknown,
): WorkspaceAgentAppSurfaceStrategy | null {
  return value === "controlledBrowserWindow" || value === "webContentsView"
    ? value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
