import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import type { PluginMarketplaceViewItem } from "../marketplace/pluginMarketplaceViewModel";

export type PluginHistorySessionCandidateSource =
  | "history_restore"
  | "plugin_activation";

export interface PluginHistorySessionCandidate {
  key: string;
  sessionId: string;
  title: string;
  updatedAt: number;
  messagesCount: number;
  pluginId: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  artifactRefs: string[];
  source: PluginHistorySessionCandidateSource;
}

export interface PluginHistorySessionSelectionModel {
  pluginId: string;
  pluginLabel: string;
  candidates: PluginHistorySessionCandidate[];
}

export interface BuildPluginHistorySessionSelectionModelParams {
  item: PluginMarketplaceViewItem;
  sessions: readonly AsterSessionInfo[];
  maxCandidates?: number;
}

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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function readHistoryRestoreRecord(
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

function readPluginActivationRecord(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const harness = asRecord(metadata?.harness);
  return (
    asRecord(harness?.plugin_activation) ??
    asRecord(harness?.pluginActivation) ??
    asRecord(metadata?.plugin_activation) ??
    asRecord(metadata?.pluginActivation)
  );
}

function buildCandidateFromMetadata(
  session: AsterSessionInfo,
): Omit<PluginHistorySessionCandidate, "key" | "title" | "updatedAt" | "messagesCount"> | null {
  const metadata = asRecord(session.session_business_object_ref_metadata);
  const historyRestore = readHistoryRestoreRecord(metadata);
  const activation = readPluginActivationRecord(metadata);
  const sourceRecord = historyRestore ?? activation;
  const pluginId = readString(sourceRecord, ["plugin_id", "pluginId"]);
  if (!pluginId) {
    return null;
  }

  return {
    sessionId:
      readString(historyRestore, ["session_id", "sessionId"]) ?? session.id,
    pluginId,
    activeAgentAppId: readString(sourceRecord, [
      "active_agent_app_id",
      "activeAgentAppId",
    ]),
    activeEntryKey: readString(sourceRecord, [
      "active_entry_key",
      "activeEntryKey",
    ]),
    artifactRefs: readStringArray(
      sourceRecord?.artifact_refs ?? sourceRecord?.artifactRefs,
    ),
    source: historyRestore ? "history_restore" : "plugin_activation",
  };
}

function fallbackTitle(session: AsterSessionInfo): string {
  return session.name?.trim() || session.id;
}

export function buildPluginHistorySessionSelectionModel({
  item,
  maxCandidates = 12,
  sessions,
}: BuildPluginHistorySessionSelectionModelParams): PluginHistorySessionSelectionModel {
  const pluginId = item.pluginId.trim();
  const candidates = sessions
    .map((session): PluginHistorySessionCandidate | null => {
      const candidate = buildCandidateFromMetadata(session);
      if (!candidate || candidate.pluginId !== pluginId) {
        return null;
      }
      return {
        ...candidate,
        key: `${candidate.sessionId}:${candidate.source}`,
        title: fallbackTitle(session),
        updatedAt: session.updated_at,
        messagesCount: session.messages_count ?? 0,
      };
    })
    .filter(
      (candidate): candidate is PluginHistorySessionCandidate =>
        candidate !== null,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, maxCandidates));

  return {
    pluginId,
    pluginLabel: item.displayName.trim() || item.pluginName.trim() || pluginId,
    candidates,
  };
}
