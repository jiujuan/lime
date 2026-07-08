import type {
  AgentRuntimeCompletionAuditRequiredEvidence,
  AgentRuntimeCompletionAuditSummary,
  AgentRuntimeEvidenceArtifact,
  AgentRuntimeEvidencePack,
} from "./types";
import { normalizeEvidenceObservabilitySummary } from "./evidenceObservabilityNormalizers";
import {
  isRecord,
  readNumberField,
  readNumberMapField,
  readOptionalBooleanField,
  readOptionalStringField,
  readStringField,
  readStringListField,
} from "./normalizerUtils";

function normalizeEvidenceArtifact(
  value: unknown,
): AgentRuntimeEvidenceArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readStringField(value, "kind");

  return {
    kind:
      kind === "runtime"
        ? "runtime"
        : kind === "timeline"
          ? "timeline"
          : kind === "artifacts"
            ? "artifacts"
            : "summary",
    title: readStringField(value, "title"),
    relative_path: readStringField(value, "relativePath", "relative_path"),
    absolute_path: readStringField(value, "absolutePath", "absolute_path"),
    bytes: readNumberField(value, "bytes"),
  };
}

function normalizeCompletionAuditRequiredEvidence(
  value: unknown,
): AgentRuntimeCompletionAuditRequiredEvidence {
  const record = isRecord(value) ? value : {};
  return {
    automation_owner:
      readOptionalBooleanField(record, "automationOwner", "automation_owner") ??
      false,
    workspace_skill_tool_call:
      readOptionalBooleanField(
        record,
        "workspaceSkillToolCall",
        "workspace_skill_tool_call",
      ) ?? false,
    artifact_or_timeline:
      readOptionalBooleanField(
        record,
        "artifactOrTimeline",
        "artifact_or_timeline",
      ) ?? false,
    controlled_get_evidence:
      readOptionalBooleanField(
        record,
        "controlledGetEvidence",
        "controlled_get_evidence",
      ) ?? false,
  };
}

function normalizeCompletionAuditSummary(
  value: unknown,
): AgentRuntimeCompletionAuditSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    source: readStringField(value, "source"),
    decision: readStringField(value, "decision"),
    owner_run_count: readNumberField(value, "ownerRunCount", "owner_run_count"),
    successful_owner_run_count: readNumberField(
      value,
      "successfulOwnerRunCount",
      "successful_owner_run_count",
    ),
    workspace_skill_tool_call_count: readNumberField(
      value,
      "workspaceSkillToolCallCount",
      "workspace_skill_tool_call_count",
    ),
    artifact_count: readNumberField(value, "artifactCount", "artifact_count"),
    controlled_get_evidence_artifact_count: readNumberField(
      value,
      "controlledGetEvidenceArtifactCount",
      "controlled_get_evidence_artifact_count",
    ),
    controlled_get_evidence_executed_count: readNumberField(
      value,
      "controlledGetEvidenceExecutedCount",
      "controlled_get_evidence_executed_count",
    ),
    controlled_get_evidence_scanned_artifact_count: readNumberField(
      value,
      "controlledGetEvidenceScannedArtifactCount",
      "controlled_get_evidence_scanned_artifact_count",
    ),
    controlled_get_evidence_skipped_unsafe_artifact_count: readNumberField(
      value,
      "controlledGetEvidenceSkippedUnsafeArtifactCount",
      "controlled_get_evidence_skipped_unsafe_artifact_count",
    ),
    controlled_get_evidence_status_counts: readNumberMapField(
      value,
      "controlledGetEvidenceStatusCounts",
      "controlled_get_evidence_status_counts",
    ),
    controlled_get_evidence_required:
      readOptionalBooleanField(
        value,
        "controlledGetEvidenceRequired",
        "controlled_get_evidence_required",
      ) ?? false,
    owner_audit_statuses: readStringListField(
      value,
      "ownerAuditStatuses",
      "owner_audit_statuses",
    ),
    required_evidence: normalizeCompletionAuditRequiredEvidence(
      value.requiredEvidence ?? value.required_evidence,
    ),
    blocking_reasons: readStringListField(
      value,
      "blockingReasons",
      "blocking_reasons",
    ),
    notes: readStringListField(value, "notes"),
  };
}

export function normalizeEvidencePack(
  value: unknown,
): AgentRuntimeEvidencePack {
  const record = isRecord(value) ? value : {};
  const rawArtifacts = Array.isArray(record.artifacts) ? record.artifacts : [];

  return {
    session_id: readStringField(record, "sessionId", "session_id"),
    thread_id: readStringField(record, "threadId", "thread_id"),
    workspace_id: readOptionalStringField(
      record,
      "workspaceId",
      "workspace_id",
    ),
    workspace_root: readStringField(record, "workspaceRoot", "workspace_root"),
    pack_relative_root: readStringField(
      record,
      "packRelativeRoot",
      "pack_relative_root",
    ),
    pack_absolute_root: readStringField(
      record,
      "packAbsoluteRoot",
      "pack_absolute_root",
    ),
    exported_at: readStringField(record, "exportedAt", "exported_at"),
    thread_status: readStringField(record, "threadStatus", "thread_status"),
    latest_turn_status: readOptionalStringField(
      record,
      "latestTurnStatus",
      "latest_turn_status",
    ),
    turn_count: readNumberField(record, "turnCount", "turn_count"),
    item_count: readNumberField(record, "itemCount", "item_count"),
    pending_request_count: readNumberField(
      record,
      "pendingRequestCount",
      "pending_request_count",
    ),
    queued_turn_count: readNumberField(
      record,
      "queuedTurnCount",
      "queued_turn_count",
    ),
    recent_artifact_count: readNumberField(
      record,
      "recentArtifactCount",
      "recent_artifact_count",
    ),
    known_gaps: readStringListField(record, "knownGaps", "known_gaps"),
    observability_summary: normalizeEvidenceObservabilitySummary(
      record.observabilitySummary ?? record.observability_summary,
    ),
    completion_audit_summary: normalizeCompletionAuditSummary(
      record.completionAuditSummary ?? record.completion_audit_summary,
    ),
    artifacts: rawArtifacts
      .map((artifact) => normalizeEvidenceArtifact(artifact))
      .filter(Boolean) as AgentRuntimeEvidenceArtifact[],
  };
}
