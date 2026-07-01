import type {
  PluginActivationContext,
  PluginContract,
  PluginObjectRef,
} from "@/features/plugin";
import { resolvePluginRendererOutputContract } from "@/features/plugin";
import {
  buildContentFactoryDeliveryArticleWorkspace,
  CONTENT_FACTORY_PLUGIN_ID,
} from "@/features/plugin-content-factory";
import { normalizeWorkspaceRightSurfaceKind } from "./right-surface";
import type {
  WorkspaceArticleObject,
  WorkspaceArticleObjectRef,
  WorkspaceArticleWorkspace,
  WorkspaceArticleWorkspaceLayoutState,
} from "./workspaceArticleWorkspaceModel";

export interface BuildWorkspacePluginArticleWorkspaceFromActivationParams {
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

function normalizeArticleWorkspaceTabKind(value?: string | null): string | null {
  const rightSurfaceKind = normalizeWorkspaceRightSurfaceKind(value);
  return rightSurfaceKind ?? normalizeString(value);
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
    normalizeString(contract.rightSurface.articleWorkspace.primaryObjectKind) ??
    activationEntryDefaultObjectKind(contract, activationContext) ??
    normalizeString(contract.artifactRenderers[0]?.artifactType)
  );
}

function buildObjectRef(params: {
  activationContext: PluginActivationContext;
  contract: PluginContract;
}): WorkspaceArticleObjectRef | null {
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
}): WorkspaceArticleWorkspaceLayoutState | null {
  const supportedTabs = new Set(params.contract.rightSurface.supportedTabs);
  const openedTabs = uniqueStrings(
    [
      ...(params.activationContext.openedTabs ?? []),
      params.contract.rightSurface.defaultActiveTab,
      supportedTabs.has("articleWorkspace") ? "articleWorkspace" : undefined,
    ].map(normalizeArticleWorkspaceTabKind),
  ).filter((tab) => supportedTabs.has(tab));
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
  ref: WorkspaceArticleObjectRef;
}): WorkspaceArticleObject {
  const displayName = resolvePluginDisplayName(params.contract);
  const outputContract =
    resolvePluginRendererOutputContract(params.contract, {
      artifactType: params.ref.kind,
    }) ??
    resolvePluginRendererOutputContract(params.contract, {
      paneKind: params.contract.rightSurface.panes[0]?.kind,
    });
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
      rendererContract: outputContract,
      outputArtifactKind: outputContract?.outputArtifactKind ?? null,
      artifactType: outputContract?.artifactType ?? params.ref.kind,
      surfaceKind: outputContract?.surfaceKind ?? null,
      paneKind: outputContract?.paneKind ?? null,
      rendererKind: outputContract?.rendererKind ?? null,
    },
  };
}

export function buildWorkspacePluginArticleWorkspaceFromActivation({
  activationContext,
  contracts,
  workspaceId,
}: BuildWorkspacePluginArticleWorkspaceFromActivationParams): WorkspaceArticleWorkspace | null {
  if (!activationContext) {
    return null;
  }
  const contract = contracts.find(
    (candidate) => candidate.id === activationContext.pluginId,
  );
  if (!contract || !contract.rightSurface.articleWorkspace.enabled) {
    return null;
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
    schemaVersion: "article-workspace.v1",
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
