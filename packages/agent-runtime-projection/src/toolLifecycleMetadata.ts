import {
  compactProjectionFields,
  readRecord,
  readStringField,
} from "./normalization.js";

export interface AgentUiToolLifecyclePayloadMetadata {
  soulLifecycle?: Record<string, unknown>;
  toolProcessFacts?: Record<string, unknown>;
  toolProcessSummary?: Record<string, unknown>;
  soulSurface?: string;
  soulPhase?: string;
  styleLevel?: string;
  riskLevel?: string;
  toneVariant?: string;
  profileId?: string;
  packId?: string;
}

export function extractAgentUiToolLifecyclePayloadMetadata(
  ...sources: unknown[]
): AgentUiToolLifecyclePayloadMetadata {
  const records = sources.flatMap(collectMetadataRecords);
  const soulLifecycle = firstRecord(records, ["soulLifecycle", "soul_lifecycle"]);
  const toolProcessFacts = firstRecord(records, [
    "toolProcessFacts",
    "tool_process_facts",
  ]);
  const toolProcessSummary = firstRecord(records, [
    "toolProcessSummary",
    "tool_process_summary",
    "processSummary",
    "process_summary",
  ]);

  return compactProjectionFields({
    soulLifecycle,
    toolProcessFacts,
    toolProcessSummary,
    soulSurface:
      firstString(records, ["soulSurface", "soul_surface"]) ??
      readStringField(soulLifecycle, ["surface"]),
    soulPhase:
      firstString(records, ["soulPhase", "soul_phase"]) ??
      readStringField(soulLifecycle, ["phase"]),
    styleLevel:
      firstString(records, ["styleLevel", "style_level"]) ??
      readStringField(soulLifecycle, ["styleLevel", "style_level"]) ??
      readStringField(toolProcessFacts, ["styleLevel", "style_level"]),
    riskLevel:
      firstString(records, ["riskLevel", "risk_level"]) ??
      readStringField(soulLifecycle, ["riskLevel", "risk_level"]) ??
      readStringField(toolProcessFacts, ["riskLevel", "risk_level"]),
    toneVariant:
      firstString(records, ["toneVariant", "tone_variant"]) ??
      readStringField(soulLifecycle, ["toneVariant", "tone_variant"]),
    profileId:
      firstString(records, ["profileId", "profile_id"]) ??
      readStringField(soulLifecycle, ["profileId", "profile_id"]),
    packId:
      firstString(records, ["packId", "pack_id"]) ??
      readStringField(soulLifecycle, ["packId", "pack_id"]),
  });
}

function collectMetadataRecords(source: unknown): Record<string, unknown>[] {
  const record = readRecord(source);
  if (!record) {
    return [];
  }
  return [
    record,
    readRecord(record.metadata),
    readRecord(readRecord(record.result)?.metadata),
  ].filter((item): item is Record<string, unknown> => Boolean(item));
}

function firstRecord(
  records: readonly Record<string, unknown>[],
  keys: string[],
): Record<string, unknown> | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = readRecord(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function firstString(
  records: readonly Record<string, unknown>[],
  keys: string[],
): string | undefined {
  for (const record of records) {
    const value = readStringField(record, keys);
    if (value) {
      return value;
    }
  }
  return undefined;
}
