import type {
  PluginActivationContext,
  PluginContract,
} from "@/features/plugin";
import {
  createWorkspaceRightSurfaceOpenIntent,
  type WorkspaceRightSurfaceIntent,
  type WorkspaceRightSurfaceKind,
} from "./right-surface";

export interface WorkspacePluginRightSurfaceProjectionInput {
  activationContext?: PluginActivationContext | null;
  contracts: readonly PluginContract[];
  createdAt: number;
  ttlMs?: number;
}

function normalizeSurfaceKind(
  value: string | undefined,
): WorkspaceRightSurfaceKind | null {
  if (value === "productProfile" || value === "appSurface") {
    return value;
  }
  return null;
}

function preferredSurfaceForPlugin(
  contract: PluginContract,
  context: PluginActivationContext,
): WorkspaceRightSurfaceKind | null {
  const openedTabSurface = (context.openedTabs ?? [])
    .map(normalizeSurfaceKind)
    .find((kind): kind is WorkspaceRightSurfaceKind => Boolean(kind));
  if (openedTabSurface) {
    return openedTabSurface;
  }

  return normalizeSurfaceKind(contract.rightSurface.defaultActiveTab);
}

function pluginIntentId(
  contract: PluginContract,
  context: PluginActivationContext,
): string {
  const entryKey = context.activeEntryKey ?? "default";
  const objectKey = context.selectedObjectRef
    ? `${context.selectedObjectRef.objectKind}:${context.selectedObjectRef.objectId}`
    : "no-object";
  return `plugin:${contract.id}:${entryKey}:${objectKey}`;
}

export function buildWorkspacePluginRightSurfaceIntents({
  activationContext,
  contracts,
  createdAt,
  ttlMs,
}: WorkspacePluginRightSurfaceProjectionInput): WorkspaceRightSurfaceIntent[] {
  if (!activationContext) {
    return [];
  }
  const contract = contracts.find(
    (candidate) => candidate.id === activationContext.pluginId,
  );
  if (!contract || !contract.rightSurface.productWorkspace.enabled) {
    return [];
  }
  const surfaceKind = preferredSurfaceForPlugin(contract, activationContext);
  if (!surfaceKind) {
    return [];
  }

  return [
    createWorkspaceRightSurfaceOpenIntent({
      id: pluginIntentId(contract, activationContext),
      kind: surfaceKind,
      origin: "runtime",
      createdAt,
      priority: "background",
      ttlMs,
      reason: "plugin_activation_context",
    }),
  ];
}
