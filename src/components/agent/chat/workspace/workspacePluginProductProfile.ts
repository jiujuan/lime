import type {
  PluginActivationContext,
  PluginContract,
  PluginObjectRef,
} from "@/features/plugin";
import {
  buildContentFactoryDeliveryProfile,
  CONTENT_FACTORY_PLUGIN_ID,
} from "@/features/plugin-content-factory";
import type {
  WorkspaceProductObject,
  WorkspaceProductObjectRef,
  WorkspaceProductProfile,
  WorkspaceProductProfileLayoutState,
} from "./workspaceProductProfileModel";

export interface BuildWorkspacePluginProductProfileFromActivationParams {
  activationContext?: PluginActivationContext | null;
  contracts: readonly PluginContract[];
  workspaceId?: string | null;
}

const FALLBACK_OBJECT_ID = "pending";

function normalizeString(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeString)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function resolvePluginDisplayName(contract: PluginContract): string {
  return normalizeString(contract.displayName) ?? contract.id;
}

function activationEntryDefaultObjectKind(
  contract: PluginContract,
  activationContext: PluginActivationContext,
): string | null {
  const activeEntryKey = normalizeString(activationContext.activeEntryKey);
  const activeEntry = activeEntryKey
    ? contract.activationEntries.find((entry) => entry.key === activeEntryKey)
    : contract.activationEntries[0];
  return normalizeString(activeEntry?.defaultObjectKind);
}

function selectedObjectRefForPlugin(
  activationContext: PluginActivationContext,
): PluginObjectRef | null {
  const selectedObjectRef = activationContext.selectedObjectRef;
  if (
    !selectedObjectRef ||
    selectedObjectRef.pluginId !== activationContext.pluginId ||
    !normalizeString(selectedObjectRef.objectKind) ||
    !normalizeString(selectedObjectRef.objectId)
  ) {
    return null;
  }
  return selectedObjectRef;
}

function fallbackObjectKind(
  contract: PluginContract,
  activationContext: PluginActivationContext,
): string | null {
  return (
    normalizeString(contract.rightSurface.productWorkspace.primaryObjectKind) ??
    activationEntryDefaultObjectKind(contract, activationContext) ??
    normalizeString(contract.artifactRenderers[0]?.artifactType)
  );
}

function buildObjectRef(params: {
  activationContext: PluginActivationContext;
  contract: PluginContract;
}): WorkspaceProductObjectRef | null {
  const selectedObjectRef = selectedObjectRefForPlugin(
    params.activationContext,
  );
  const objectKind =
    normalizeString(selectedObjectRef?.objectKind) ??
    fallbackObjectKind(params.contract, params.activationContext);
  if (!objectKind) {
    return null;
  }

  return {
    appId: params.contract.id,
    kind: objectKind,
    id: normalizeString(selectedObjectRef?.objectId) ?? FALLBACK_OBJECT_ID,
    sessionId: params.activationContext.sessionId,
    version: selectedObjectRef?.version ?? null,
    artifactIds: selectedObjectRef?.artifactIds,
    sourceTurnId: selectedObjectRef?.sourceTurnId ?? null,
    sourceTaskId: selectedObjectRef?.sourceTaskId ?? null,
  };
}

function buildLayoutState(params: {
  activationContext: PluginActivationContext;
  contract: PluginContract;
}): WorkspaceProductProfileLayoutState | null {
  const supportedTabs = new Set(params.contract.rightSurface.supportedTabs);
  const openedTabs = uniqueStrings([
    ...(params.activationContext.openedTabs ?? []),
    params.contract.rightSurface.defaultActiveTab,
    supportedTabs.has("productProfile") ? "productProfile" : undefined,
  ]).filter((tab) => supportedTabs.has(tab));
  const activeTabKind = openedTabs[0] ?? null;
  const activePaneKind =
    normalizeString(params.contract.rightSurface.panes[0]?.kind) ??
    activeTabKind;

  if (!activeTabKind && !activePaneKind && openedTabs.length === 0) {
    return null;
  }

  return {
    activeTabKind,
    activePaneKind,
    openTabKinds: openedTabs,
    splitMode: null,
  };
}

function buildPlaceholderObject(params: {
  activationContext: PluginActivationContext;
  contract: PluginContract;
  ref: WorkspaceProductObjectRef;
}): WorkspaceProductObject {
  const displayName = resolvePluginDisplayName(params.contract);
  return {
    ref: params.ref,
    title: `${displayName} - ${params.ref.kind}`,
    status: "draft",
    summary: null,
    previewArtifactId: params.ref.artifactIds?.[0] ?? null,
    source: {
      source: "plugin_activation_context",
      pluginId: params.activationContext.pluginId,
      activeEntryKey: params.activationContext.activeEntryKey ?? null,
      selectedSkillKeys: params.activationContext.selectedSkillKeys ?? [],
    },
  };
}

export function buildWorkspacePluginProductProfileFromActivation({
  activationContext,
  contracts,
  workspaceId,
}: BuildWorkspacePluginProductProfileFromActivationParams): WorkspaceProductProfile | null {
  if (!activationContext) {
    return null;
  }
  const contract = contracts.find(
    (candidate) => candidate.id === activationContext.pluginId,
  );
  if (!contract || !contract.rightSurface.productWorkspace.enabled) {
    return null;
  }

  if (contract.id === CONTENT_FACTORY_PLUGIN_ID) {
    return buildContentFactoryDeliveryProfile({
      contract,
      sessionId: activationContext.sessionId,
      workspaceId,
    });
  }

  const objectRef = buildObjectRef({ activationContext, contract });
  if (!objectRef) {
    return null;
  }
  const object = buildPlaceholderObject({
    activationContext,
    contract,
    ref: objectRef,
  });

  return {
    schemaVersion: "product-workspace.v1",
    appId: contract.id,
    sessionId: activationContext.sessionId,
    workspaceId: normalizeString(workspaceId),
    source: "rightSurfacePending",
    objects: [object],
    objectCount: 1,
    primaryObjectRef: objectRef,
    selectedObjectRef: objectRef,
    layoutState: buildLayoutState({ activationContext, contract }),
    sourceArtifacts: [
      {
        source: "plugin_activation_context",
        pluginId: activationContext.pluginId,
        activeEntryKey: activationContext.activeEntryKey ?? null,
        selectedObjectRef: activationContext.selectedObjectRef ?? null,
      },
    ],
    actionHistory: [],
    workerEvidence: [],
    updatedAt: null,
  };
}
