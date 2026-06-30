import type {
  PluginActivationContext,
  PluginObjectRef,
} from "../activation/pluginActivation";
import type { PluginContract, PluginRegistryItem } from "../manifest/types";

export type PluginHistoryRestoreStatus =
  | "restored"
  | "artifact_preview"
  | "chat_only";

export type PluginHistoryRestoreActionMode =
  | "interactive"
  | "read_only"
  | "chat_only";

export type PluginHistoryRestoreFallbackTarget =
  | "none"
  | "artifactPreview"
  | "chatOnly";

export interface PluginSessionWorkspaceObject {
  ref: PluginObjectRef;
  title?: string;
  artifactIds?: string[];
  updatedAt?: string;
  readOnly?: boolean;
}

export interface PluginSessionWorkspace {
  pluginId: string;
  objects: readonly PluginSessionWorkspaceObject[];
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  openedTabs?: readonly string[];
  pinnedTabs?: readonly string[];
  activeTabId?: string;
}

export interface PluginWorkspaceLayoutState {
  activeSurfaceKind?: string;
  openSurfaceKinds?: readonly string[];
  activeTabId?: string;
}

export interface PluginHistoryRestoreSnapshot {
  sessionId: string;
  pluginId?: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  selectedSkillKeys?: readonly string[];
  pluginWorkspace?: PluginSessionWorkspace;
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  artifactRefs?: readonly string[];
  openedTabs?: readonly string[];
  pinnedTabs?: readonly string[];
  layoutState?: PluginWorkspaceLayoutState;
}

export interface PluginHistoryRestoreProjection {
  status: PluginHistoryRestoreStatus;
  sessionId: string;
  pluginId?: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  selectedSkillKeys: string[];
  activationContext?: PluginActivationContext;
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  artifactRefs: string[];
  openedTabs: string[];
  pinnedTabs: string[];
  activeSurfaceKind?: string;
  activeTabId?: string;
  actionMode: PluginHistoryRestoreActionMode;
  fallbackTarget: PluginHistoryRestoreFallbackTarget;
  blockerCodes: string[];
}

function normalizeHistorySurfaceKind(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export interface BuildPluginHistoryRestoreProjectionParams {
  snapshot: PluginHistoryRestoreSnapshot;
  contracts: readonly PluginContract[];
  registryItems?: readonly PluginRegistryItem[];
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function objectRefKey(ref: PluginObjectRef | undefined): string | undefined {
  return ref ? `${ref.pluginId}:${ref.objectKind}:${ref.objectId}` : undefined;
}

function collectArtifactRefs(
  snapshot: PluginHistoryRestoreSnapshot,
): string[] {
  const refs: Array<string | undefined | null> = [
    ...(snapshot.artifactRefs ?? []),
  ];
  if (snapshot.primaryObjectRef?.artifactIds) {
    refs.push(...snapshot.primaryObjectRef.artifactIds);
  }
  if (snapshot.selectedObjectRef?.artifactIds) {
    refs.push(...snapshot.selectedObjectRef.artifactIds);
  }
  for (const object of snapshot.pluginWorkspace?.objects ?? []) {
    if (object.artifactIds) {
      refs.push(...object.artifactIds);
    }
    if (object.ref.artifactIds) {
      refs.push(...object.ref.artifactIds);
    }
  }
  return uniqueStrings(refs);
}

function objectBelongsToPlugin(
  ref: PluginObjectRef | undefined,
  pluginId: string,
): ref is PluginObjectRef {
  return Boolean(
    ref && ref.pluginId === pluginId && ref.objectKind && ref.objectId,
  );
}

function pluginIdFromSnapshot(
  snapshot: PluginHistoryRestoreSnapshot,
): string | undefined {
  return (
    snapshot.pluginId ??
    snapshot.pluginWorkspace?.pluginId ??
    snapshot.selectedObjectRef?.pluginId ??
    snapshot.primaryObjectRef?.pluginId
  );
}

function workspaceRefs(
  snapshot: PluginHistoryRestoreSnapshot,
  pluginId: string,
): PluginObjectRef[] {
  return (snapshot.pluginWorkspace?.objects ?? [])
    .map((object) => object.ref)
    .filter((ref) => objectBelongsToPlugin(ref, pluginId));
}

function firstValidObjectRef(
  pluginId: string,
  ...refs: Array<PluginObjectRef | undefined>
): PluginObjectRef | undefined {
  return refs.find((ref) => objectBelongsToPlugin(ref, pluginId));
}

function resolveObjectRefs(params: {
  contract: PluginContract;
  snapshot: PluginHistoryRestoreSnapshot;
  pluginId: string;
}): {
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  blockerCodes: string[];
} {
  const { contract, snapshot, pluginId } = params;
  const refs = workspaceRefs(snapshot, pluginId);
  const primaryObjectRef = firstValidObjectRef(
    pluginId,
    snapshot.primaryObjectRef,
    snapshot.pluginWorkspace?.primaryObjectRef,
    refs[0],
  );
  const selectedCandidate = firstValidObjectRef(
    pluginId,
    snapshot.selectedObjectRef,
    snapshot.pluginWorkspace?.selectedObjectRef,
    primaryObjectRef,
  );
  const requestedSelectionKey = objectRefKey(
    snapshot.selectedObjectRef ?? snapshot.pluginWorkspace?.selectedObjectRef,
  );
  const selectedKey = objectRefKey(selectedCandidate);
  const blockerCodes =
    requestedSelectionKey && requestedSelectionKey !== selectedKey
      ? ["PLUGIN_HISTORY_SELECTED_OBJECT_INVALID"]
      : [];

  if (contract.historyRestore.defaultSurface === "primaryArtifact") {
    return {
      primaryObjectRef,
      selectedObjectRef: primaryObjectRef,
      blockerCodes,
    };
  }

  return {
    primaryObjectRef,
    selectedObjectRef: contract.historyRestore.restoreSelection
      ? selectedCandidate
      : primaryObjectRef,
    blockerCodes,
  };
}

function resolveTabs(params: {
  contract: PluginContract;
  snapshot: PluginHistoryRestoreSnapshot;
}): {
  openedTabs: string[];
  pinnedTabs: string[];
  activeSurfaceKind?: string;
  activeTabId?: string;
} {
  const { contract, snapshot } = params;
  const supportedTabs = new Set(contract.rightSurface.supportedTabs);
  const restoreLayout = contract.historyRestore.restoreLayout;
  const requestedTabs = restoreLayout
    ? uniqueStrings([
        normalizeHistorySurfaceKind(snapshot.layoutState?.activeSurfaceKind),
        ...(snapshot.layoutState?.openSurfaceKinds ?? []).map(
          normalizeHistorySurfaceKind,
        ),
        ...(snapshot.openedTabs ?? []).map(normalizeHistorySurfaceKind),
        ...(snapshot.pluginWorkspace?.openedTabs ?? []).map(
          normalizeHistorySurfaceKind,
        ),
        normalizeHistorySurfaceKind(contract.rightSurface.defaultActiveTab),
      ])
    : uniqueStrings([
        normalizeHistorySurfaceKind(contract.rightSurface.defaultActiveTab),
      ]);
  const openedTabs = requestedTabs.filter((tab) => supportedTabs.has(tab));
  const fallbackTab = contract.rightSurface.defaultActiveTab;
  const normalizedOpenedTabs =
    openedTabs.length || !fallbackTab || !supportedTabs.has(fallbackTab)
      ? openedTabs
      : [fallbackTab];
  const pinnedTabs = restoreLayout
    ? uniqueStrings(
        [
          ...(snapshot.pinnedTabs ?? []),
          ...(snapshot.pluginWorkspace?.pinnedTabs ?? []),
        ].map(normalizeHistorySurfaceKind),
      ).filter((tab) => normalizedOpenedTabs.includes(tab))
    : [];

  return {
    openedTabs: normalizedOpenedTabs,
    pinnedTabs,
    activeSurfaceKind: normalizedOpenedTabs[0],
    activeTabId: restoreLayout
      ? (snapshot.layoutState?.activeTabId ??
        snapshot.pluginWorkspace?.activeTabId)
      : undefined,
  };
}

function fallbackTargetForSnapshot(params: {
  contract?: PluginContract;
  artifactRefs: readonly string[];
}): PluginHistoryRestoreFallbackTarget {
  if (
    params.artifactRefs.length > 0 &&
    (!params.contract ||
      params.contract.historyRestore.fallback === "artifactPreview")
  ) {
    return "artifactPreview";
  }
  return "chatOnly";
}

function fallbackProjection(params: {
  snapshot: PluginHistoryRestoreSnapshot;
  pluginId?: string;
  artifactRefs: string[];
  fallbackTarget: PluginHistoryRestoreFallbackTarget;
  blockerCodes: string[];
}): PluginHistoryRestoreProjection {
  return {
    status:
      params.fallbackTarget === "artifactPreview"
        ? "artifact_preview"
        : "chat_only",
    sessionId: params.snapshot.sessionId,
    pluginId: params.pluginId,
    activeAgentAppId: params.snapshot.activeAgentAppId,
    activeEntryKey: params.snapshot.activeEntryKey,
    selectedSkillKeys: [...(params.snapshot.selectedSkillKeys ?? [])],
    artifactRefs: params.artifactRefs,
    openedTabs: [],
    pinnedTabs: [],
    actionMode: "chat_only",
    fallbackTarget: params.fallbackTarget,
    blockerCodes: params.blockerCodes,
  };
}

function actionModeForRegistry(params: {
  pluginId: string;
  registryItems?: readonly PluginRegistryItem[];
}): {
  actionMode: PluginHistoryRestoreActionMode;
  blockerCodes: string[];
} {
  if (!params.registryItems) {
    return {
      actionMode: "read_only",
      blockerCodes: ["PLUGIN_HISTORY_REGISTRY_MISSING"],
    };
  }
  const item = params.registryItems.find(
    (candidate) => candidate.pluginId === params.pluginId,
  );
  if (!item) {
    return {
      actionMode: "read_only",
      blockerCodes: ["PLUGIN_HISTORY_REGISTRY_ITEM_MISSING"],
    };
  }
  if (item.activationState !== "activatable") {
    return {
      actionMode: "read_only",
      blockerCodes: ["PLUGIN_HISTORY_READ_ONLY", ...item.blockerCodes],
    };
  }
  return {
    actionMode: "interactive",
    blockerCodes: [],
  };
}

export function buildPluginHistoryRestoreProjection({
  snapshot,
  contracts,
  registryItems,
}: BuildPluginHistoryRestoreProjectionParams): PluginHistoryRestoreProjection {
  const pluginId = pluginIdFromSnapshot(snapshot);
  const artifactRefs = collectArtifactRefs(snapshot);
  if (!pluginId) {
    return fallbackProjection({
      snapshot,
      artifactRefs,
      fallbackTarget: fallbackTargetForSnapshot({ artifactRefs }),
      blockerCodes: ["PLUGIN_HISTORY_PLUGIN_MISSING"],
    });
  }

  const contract = contracts.find((candidate) => candidate.id === pluginId);
  if (!contract) {
    return fallbackProjection({
      snapshot,
      pluginId,
      artifactRefs,
      fallbackTarget: fallbackTargetForSnapshot({ artifactRefs }),
      blockerCodes: ["PLUGIN_CONTRACT_MISSING"],
    });
  }

  if (!contract.rightSurface.historyRestore.enabled) {
    return fallbackProjection({
      snapshot,
      pluginId,
      artifactRefs,
      fallbackTarget: fallbackTargetForSnapshot({ contract, artifactRefs }),
      blockerCodes: ["PLUGIN_HISTORY_RESTORE_DISABLED"],
    });
  }

  const { primaryObjectRef, selectedObjectRef, blockerCodes } =
    resolveObjectRefs({
      contract,
      snapshot,
      pluginId,
    });
  if (!primaryObjectRef && !selectedObjectRef) {
    return fallbackProjection({
      snapshot,
      pluginId,
      artifactRefs,
      fallbackTarget: fallbackTargetForSnapshot({ contract, artifactRefs }),
      blockerCodes: ["PLUGIN_HISTORY_WORKSPACE_MISSING"],
    });
  }

  const tabs = resolveTabs({ contract, snapshot });
  const action = actionModeForRegistry({ pluginId, registryItems });
  const activationContext: PluginActivationContext = {
    sessionId: snapshot.sessionId,
    pluginId,
    activeAgentAppId: snapshot.activeAgentAppId,
    activeEntryKey: snapshot.activeEntryKey,
    selectedSkillKeys: [...(snapshot.selectedSkillKeys ?? [])],
    selectedObjectRef,
    openedTabs: tabs.openedTabs,
    pinnedTabs: tabs.pinnedTabs,
    source: "history",
  };

  return {
    status: "restored",
    sessionId: snapshot.sessionId,
    pluginId,
    activeAgentAppId: snapshot.activeAgentAppId,
    activeEntryKey: snapshot.activeEntryKey,
    selectedSkillKeys: [...(snapshot.selectedSkillKeys ?? [])],
    activationContext,
    primaryObjectRef,
    selectedObjectRef,
    artifactRefs,
    openedTabs: tabs.openedTabs,
    pinnedTabs: tabs.pinnedTabs,
    activeSurfaceKind: tabs.activeSurfaceKind,
    activeTabId: tabs.activeTabId,
    actionMode: action.actionMode,
    fallbackTarget: "none",
    blockerCodes: [...blockerCodes, ...action.blockerCodes],
  };
}
