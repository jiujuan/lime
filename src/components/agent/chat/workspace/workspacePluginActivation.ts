import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  buildPluginActivationMentionCatalog,
  parsePluginActivationMention,
  projectPluginRegistryFromInstalledAgentApps,
  type PluginActivationContext,
  type PluginActivationContextSource,
  type PluginActivationMentionParseResult,
  type PluginObjectRef,
} from "@/features/plugin";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import { asRecord } from "./commands/skillSlotUtils";

export interface WorkspacePluginActivationResolution {
  status: "matched" | "blocked";
  trigger: string;
  body: string;
  context?: PluginActivationContext;
  blockerCodes?: string[];
}

export interface WorkspacePluginActivationRequestMetadata {
  source: string;
  trigger: string;
  body: string;
  context: PluginActivationContext;
}

function resolvePluginActivationParseResult(params: {
  text: string;
  sessionId: string;
  installedAgentApps: readonly InstalledAgentAppState[];
}): PluginActivationMentionParseResult | null {
  const projection = projectPluginRegistryFromInstalledAgentApps(
    params.installedAgentApps,
  );
  const contracts = projection.contracts;
  if (contracts.length === 0) {
    return null;
  }
  return parsePluginActivationMention({
    text: params.text,
    catalog: buildPluginActivationMentionCatalog({
      contracts,
      registryItems: projection.registry,
    }),
    sessionId: params.sessionId,
    source: "user",
  });
}

export function resolveWorkspacePluginActivation(params: {
  text: string;
  sessionId?: string | null;
  installedAgentApps: readonly InstalledAgentAppState[];
}): WorkspacePluginActivationResolution | null {
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return null;
  }
  const parseResult = resolvePluginActivationParseResult({
    text: params.text,
    sessionId,
    installedAgentApps: params.installedAgentApps,
  });
  if (!parseResult) {
    return null;
  }
  const base = {
    trigger: parseResult.match.trigger,
    body: parseResult.match.body,
  };
  if (parseResult.status === "blocked") {
    return {
      status: "blocked",
      ...base,
      blockerCodes: parseResult.blockerCodes,
    };
  }
  return {
    status: "matched",
    ...base,
    context: parseResult.context,
  };
}

function pluginActivationMetadata(
  resolution: WorkspacePluginActivationResolution,
) {
  if (resolution.status !== "matched" || !resolution.context) {
    return {};
  }
  const { context } = resolution;
  return {
    plugin_activation: {
      source: "plugin_explicit_mention",
      trigger: resolution.trigger,
      body: resolution.body,
      session_id: context.sessionId,
      plugin_id: context.pluginId,
      active_agent_app_id: context.activeAgentAppId,
      active_entry_key: context.activeEntryKey,
      selected_skill_keys: context.selectedSkillKeys,
      selected_object_ref: context.selectedObjectRef
        ? {
            plugin_id: context.selectedObjectRef.pluginId,
            object_kind: context.selectedObjectRef.objectKind,
            object_id: context.selectedObjectRef.objectId,
            version: context.selectedObjectRef.version,
            artifact_ids: context.selectedObjectRef.artifactIds,
            source_turn_id: context.selectedObjectRef.sourceTurnId,
            source_task_id: context.selectedObjectRef.sourceTaskId,
          }
        : undefined,
      opened_tabs: context.openedTabs,
      pinned_tabs: context.pinnedTabs,
      context_source: context.source,
    },
  };
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (items.length > 0) {
      return Array.from(new Set(items));
    }
  }
  return undefined;
}

function parsePluginObjectRef(value: unknown): PluginObjectRef | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
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
    artifactIds: readStringArray(record, ["artifact_ids", "artifactIds"]),
    sourceTurnId: readString(record, ["source_turn_id", "sourceTurnId"]),
    sourceTaskId: readString(record, ["source_task_id", "sourceTaskId"]),
  };
}

function normalizeContextSource(
  value: string | undefined,
): PluginActivationContextSource {
  if (value === "history" || value === "route" || value === "restore") {
    return value;
  }
  return "user";
}

export function extractWorkspacePluginActivationFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
): WorkspacePluginActivationRequestMetadata | null {
  const metadata = asRecord(requestMetadata);
  const harness = asRecord(metadata?.harness);
  const activation =
    asRecord(harness?.plugin_activation) ||
    asRecord(harness?.pluginActivation) ||
    asRecord(metadata?.plugin_activation) ||
    asRecord(metadata?.pluginActivation);
  if (!activation) {
    return null;
  }

  const source = readString(activation, ["source"]);
  const trigger = readString(activation, ["trigger"]);
  const sessionId = readString(activation, ["session_id", "sessionId"]);
  const pluginId = readString(activation, ["plugin_id", "pluginId"]);
  if (!source || !trigger || !sessionId || !pluginId) {
    return null;
  }

  return {
    source,
    trigger,
    body: readString(activation, ["body"]) ?? "",
    context: {
      sessionId,
      pluginId,
      activeAgentAppId: readString(activation, [
        "active_agent_app_id",
        "activeAgentAppId",
      ]),
      activeEntryKey: readString(activation, [
        "active_entry_key",
        "activeEntryKey",
      ]),
      selectedSkillKeys: readStringArray(activation, [
        "selected_skill_keys",
        "selectedSkillKeys",
      ]),
      selectedObjectRef: parsePluginObjectRef(
        activation.selected_object_ref ?? activation.selectedObjectRef,
      ),
      openedTabs: readStringArray(activation, ["opened_tabs", "openedTabs"]),
      pinnedTabs: readStringArray(activation, ["pinned_tabs", "pinnedTabs"]),
      source: normalizeContextSource(
        readString(activation, ["context_source", "contextSource"]),
      ),
    },
  };
}

export function mergePluginActivationSendOptions(params: {
  sendOptions?: HandleSendOptions;
  resolution: WorkspacePluginActivationResolution;
}): HandleSendOptions | undefined {
  if (params.resolution.status !== "matched") {
    return params.sendOptions;
  }
  const previousRequestMetadata = params.sendOptions?.requestMetadata || {};
  const previousHarness = asRecord(previousRequestMetadata.harness) || {};
  return {
    ...(params.sendOptions || {}),
    requestMetadata: {
      ...previousRequestMetadata,
      harness: {
        ...previousHarness,
        ...pluginActivationMetadata(params.resolution),
      },
    },
  };
}
