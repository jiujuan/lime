import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import type {
  PluginContract,
  PluginHistoryRestoreProjection,
  PluginHistoryRestoreSnapshot,
  PluginObjectRef,
  PluginRegistryItem,
  PluginSessionWorkspaceObject,
} from "@/features/plugin";
import { buildPluginHistoryRestoreProjection } from "@/features/plugin";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  record: Record<string, unknown> | null,
  keys: readonly string[],
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function readObjectRef(value: unknown): PluginObjectRef | undefined {
  const record = asRecord(value);
  const pluginId = readString(record, ["plugin_id", "pluginId"]);
  const objectKind = readString(record, ["object_kind", "objectKind"]);
  const objectId = readString(record, ["object_id", "objectId"]);
  if (!pluginId || !objectKind || !objectId) {
    return undefined;
  }
  return {
    pluginId,
    objectKind,
    objectId,
    version: readString(record, ["version"]),
    artifactIds: readStringArray(record?.artifact_ids ?? record?.artifactIds),
    sourceTurnId: readString(record, ["source_turn_id", "sourceTurnId"]),
    sourceTaskId: readString(record, ["source_task_id", "sourceTaskId"]),
  };
}

function readPluginWorkspace(
  value: unknown,
): PluginHistoryRestoreSnapshot["pluginWorkspace"] {
  const record = asRecord(value);
  const pluginId = readString(record, ["plugin_id", "pluginId"]);
  if (!record || !pluginId) {
    return undefined;
  }
  const objects = Array.isArray(record.objects)
    ? record.objects
        .map((item): PluginSessionWorkspaceObject | null => {
          const objectRecord = asRecord(item);
          const ref = readObjectRef(objectRecord?.ref);
          if (!ref) {
            return null;
          }
          return {
            ref,
            title: readString(objectRecord, ["title"]),
            artifactIds: readStringArray(
              objectRecord?.artifact_ids ?? objectRecord?.artifactIds,
            ),
            updatedAt: readString(objectRecord, ["updated_at", "updatedAt"]),
            readOnly:
              typeof objectRecord?.read_only === "boolean"
                ? objectRecord.read_only
                : typeof objectRecord?.readOnly === "boolean"
                  ? objectRecord.readOnly
                  : undefined,
          };
        })
        .filter((item): item is PluginSessionWorkspaceObject => Boolean(item))
    : [];

  return {
    pluginId,
    objects,
    primaryObjectRef: readObjectRef(
      record.primary_object_ref ?? record.primaryObjectRef,
    ),
    selectedObjectRef: readObjectRef(
      record.selected_object_ref ?? record.selectedObjectRef,
    ),
    openedTabs: readStringArray(record.opened_tabs ?? record.openedTabs),
    pinnedTabs: readStringArray(record.pinned_tabs ?? record.pinnedTabs),
    activeTabId: readString(record, ["active_tab_id", "activeTabId"]),
  };
}

function readLayoutState(
  value: unknown,
): PluginHistoryRestoreSnapshot["layoutState"] {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  return {
    activeSurfaceKind: readString(record, [
      "active_surface_kind",
      "activeSurfaceKind",
    ]),
    openSurfaceKinds: readStringArray(
      record.open_surface_kinds ?? record.openSurfaceKinds,
    ),
    activeTabId: readString(record, ["active_tab_id", "activeTabId"]),
  };
}

function readHistoryRecord(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const harness = asRecord(metadata?.harness);
  return (
    asRecord(harness?.plugin_history_restore) ??
    asRecord(harness?.pluginHistoryRestore) ??
    asRecord(metadata?.plugin_history_restore) ??
    asRecord(metadata?.pluginHistoryRestore)
  );
}

export function hasWorkspacePluginHistoryRestoreMetadata(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): boolean {
  const metadata = asRecord(threadRead?.session_business_object_ref_metadata);
  return Boolean(readHistoryRecord(metadata));
}

export function extractWorkspacePluginHistoryRestoreSnapshot(
  threadRead: AgentRuntimeThreadReadModel | null | undefined,
): PluginHistoryRestoreSnapshot | null {
  const metadata = asRecord(threadRead?.session_business_object_ref_metadata);
  const restore = readHistoryRecord(metadata);
  const sessionId = readString(restore, ["session_id", "sessionId"]);
  if (!restore || !sessionId) {
    return null;
  }
  return {
    sessionId,
    pluginId: readString(restore, ["plugin_id", "pluginId"]),
    activePluginUiId: readString(restore, [
      "active_plugin_ui_id",
      "activePluginUiId",
    ]),
    activeEntryKey: readString(restore, ["active_entry_key", "activeEntryKey"]),
    selectedSkillKeys: readStringArray(
      restore.selected_skill_keys ?? restore.selectedSkillKeys,
    ),
    pluginWorkspace: readPluginWorkspace(
      restore.plugin_workspace ?? restore.pluginWorkspace,
    ),
    primaryObjectRef: readObjectRef(
      restore.primary_object_ref ?? restore.primaryObjectRef,
    ),
    selectedObjectRef: readObjectRef(
      restore.selected_object_ref ?? restore.selectedObjectRef,
    ),
    artifactRefs: readStringArray(
      restore.artifact_refs ?? restore.artifactRefs,
    ),
    openedTabs: readStringArray(restore.opened_tabs ?? restore.openedTabs),
    pinnedTabs: readStringArray(restore.pinned_tabs ?? restore.pinnedTabs),
    layoutState: readLayoutState(restore.layout_state ?? restore.layoutState),
  };
}

export function buildWorkspacePluginHistoryRestoreProjection(params: {
  threadRead: AgentRuntimeThreadReadModel | null | undefined;
  contracts: readonly PluginContract[];
  registryItems: readonly PluginRegistryItem[];
}): PluginHistoryRestoreProjection | null {
  const snapshot = extractWorkspacePluginHistoryRestoreSnapshot(
    params.threadRead,
  );
  if (!snapshot) {
    return null;
  }
  return buildPluginHistoryRestoreProjection({
    snapshot,
    contracts: params.contracts,
    registryItems: params.registryItems,
  });
}
