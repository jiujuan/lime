import {
  compactProjectionFields,
  definedString,
  readRecord,
  readStringField,
} from "./normalization.js";

export interface AgentUiCollaborationPayloadMetadataInput {
  sourceType?: string | null;
  collaborationKind?: string | null;
  surface?: string | null;
  phase?: string | null;
  status?: string | null;
  runtimeEntity?: string | null;
  runtimeStatus?: string | null;
  latestTurnStatus?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  parentSessionId?: string | null;
  transcriptRef?: string | null;
  handoffId?: string | null;
  styleLevel?: string | null;
  riskLevel?: string | null;
  toneVariant?: string | null;
  profileId?: string | null;
  packId?: string | null;
  metadata?: unknown;
  payload?: unknown;
}

export interface AgentUiCollaborationPayloadMetadata {
  collaborationFacts: Record<string, unknown>;
  collaborationSurface?: string;
  collaborationPhase?: string;
  styleLevel?: string;
  riskLevel?: string;
  toneVariant?: string;
  profileId?: string;
  packId?: string;
}

export function buildAgentUiCollaborationPayloadMetadata(
  input: AgentUiCollaborationPayloadMetadataInput,
): AgentUiCollaborationPayloadMetadata {
  const records = collectMetadataRecords(input.payload, input.metadata);
  const collaborationFacts = firstRecord(records, [
    "collaborationFacts",
    "collaboration_facts",
  ]);
  const soulLifecycle = firstRecord(records, ["soulLifecycle", "soul_lifecycle"]);
  const surface =
    definedString(input.surface) ??
    readStringField(collaborationFacts, [
      "collaborationSurface",
      "collaboration_surface",
      "surface",
    ]) ??
    firstString(records, ["collaborationSurface", "collaboration_surface"]);
  const phase =
    definedString(input.phase) ??
    readStringField(collaborationFacts, [
      "collaborationPhase",
      "collaboration_phase",
      "phase",
    ]) ??
    firstString(records, ["collaborationPhase", "collaboration_phase"]);
  const styleLevel =
    definedString(input.styleLevel) ??
    firstString(records, ["styleLevel", "style_level"]) ??
    readStringField(collaborationFacts, ["styleLevel", "style_level"]) ??
    readStringField(soulLifecycle, ["styleLevel", "style_level"]) ??
    "L1";
  const riskLevel =
    definedString(input.riskLevel) ??
    firstString(records, ["riskLevel", "risk_level"]) ??
    readStringField(collaborationFacts, ["riskLevel", "risk_level"]) ??
    readStringField(soulLifecycle, ["riskLevel", "risk_level"]) ??
    "normal";
  const toneVariant =
    definedString(input.toneVariant) ??
    firstString(records, ["toneVariant", "tone_variant"]) ??
    readStringField(collaborationFacts, ["toneVariant", "tone_variant"]) ??
    readStringField(soulLifecycle, ["toneVariant", "tone_variant"]);
  const profileId =
    definedString(input.profileId) ??
    firstString(records, ["profileId", "profile_id"]) ??
    readStringField(collaborationFacts, ["profileId", "profile_id"]) ??
    readStringField(soulLifecycle, ["profileId", "profile_id"]);
  const packId =
    definedString(input.packId) ??
    firstString(records, ["packId", "pack_id"]) ??
    readStringField(collaborationFacts, ["packId", "pack_id"]) ??
    readStringField(soulLifecycle, ["packId", "pack_id"]);
  const facts = compactProjectionFields({
    ...(collaborationFacts ?? {}),
    source: readStringField(collaborationFacts, ["source"]) ?? "projection_facts",
    surface: readStringField(collaborationFacts, ["surface"]) ?? "collaboration",
    collaborationSurface: surface,
    collaborationPhase: phase,
    collaborationKind:
      definedString(input.collaborationKind) ??
      readStringField(collaborationFacts, [
        "collaborationKind",
        "collaboration_kind",
      ]),
    sourceType:
      definedString(input.sourceType) ??
      readStringField(collaborationFacts, ["sourceType", "source_type"]),
    status:
      definedString(input.status) ??
      readStringField(collaborationFacts, ["status"]),
    runtimeEntity:
      definedString(input.runtimeEntity) ??
      readStringField(collaborationFacts, ["runtimeEntity", "runtime_entity"]),
    runtimeStatus:
      definedString(input.runtimeStatus) ??
      readStringField(collaborationFacts, ["runtimeStatus", "runtime_status"]),
    latestTurnStatus:
      definedString(input.latestTurnStatus) ??
      readStringField(collaborationFacts, [
        "latestTurnStatus",
        "latest_turn_status",
      ]),
    taskId:
      definedString(input.taskId) ??
      readStringField(collaborationFacts, ["taskId", "task_id"]),
    agentId:
      definedString(input.agentId) ??
      readStringField(collaborationFacts, ["agentId", "agent_id"]),
    parentSessionId:
      definedString(input.parentSessionId) ??
      readStringField(collaborationFacts, [
        "parentSessionId",
        "parent_session_id",
      ]),
    transcriptRef:
      definedString(input.transcriptRef) ??
      readStringField(collaborationFacts, ["transcriptRef", "transcript_ref"]),
    handoffId:
      definedString(input.handoffId) ??
      readStringField(collaborationFacts, ["handoffId", "handoff_id"]),
    styleLevel,
    riskLevel,
    toneVariant,
    profileId,
    packId,
  });

  return compactProjectionFields({
    collaborationFacts: facts,
    collaborationSurface: surface,
    collaborationPhase: phase,
    styleLevel,
    riskLevel,
    toneVariant,
    profileId,
    packId,
  });
}

function collectMetadataRecords(...sources: unknown[]): Record<string, unknown>[] {
  return sources.flatMap((source) => {
    const record = readRecord(source);
    if (!record) {
      return [];
    }
    const payload = readRecord(record.payload);
    return [
      record,
      readRecord(record.metadata),
      payload,
      readRecord(payload?.metadata),
      readRecord(readRecord(record.result)?.metadata),
    ].filter((item): item is Record<string, unknown> => Boolean(item));
  });
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
