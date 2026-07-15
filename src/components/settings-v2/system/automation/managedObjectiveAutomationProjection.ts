import type { AutomationJobRecord } from "@/lib/api/automation";
import type { ManagedObjectiveStatus } from "@/lib/api/agentRuntime/sessionTypes";

const AUTOMATION_OBJECTIVE_OWNER_KIND = "automation_job";
const ARTIFACT_OR_EVIDENCE_COMPLETION_AUDIT = "artifact_or_evidence_required";

const MANAGED_OBJECTIVE_STATUSES = new Set<ManagedObjectiveStatus>([
  "active",
  "verifying",
  "needs_input",
  "blocked",
  "budget_limited",
  "paused",
  "completed",
  "failed",
]);

export interface ManagedObjectiveAutomationProjection {
  objectiveId: string | null;
  ownerId: string | null;
  ownerType: string | null;
  objectiveText: string;
  successCriteria: string[];
  status: ManagedObjectiveStatus;
  completionAudit: string | null;
  requiresArtifactOrEvidence: boolean;
  lastAuditSummary: string | null;
  lastEvidencePackRef: string | null;
  lastArtifactRefs: string[];
  blockerReason: string | null;
}

export function resolveManagedObjectiveAutomationProjection(
  job: AutomationJobRecord,
): ManagedObjectiveAutomationProjection | null {
  if (job.payload.kind !== "agent_turn") {
    return null;
  }

  const requestMetadata = asRecord(job.payload.request_metadata);
  const harness = asRecord(readFirst(requestMetadata, ["harness"]));
  const managedObjective = asRecord(
    readFirst(harness, ["managed_objective", "managedObjective"]),
  );

  if (!managedObjective) {
    return null;
  }

  const ownerType = readString(managedObjective, [
    "owner_type",
    "ownerType",
    "owner_kind",
    "ownerKind",
  ]);
  if (ownerType && ownerType !== AUTOMATION_OBJECTIVE_OWNER_KIND) {
    return null;
  }

  const ownerId = readString(managedObjective, ["owner_id", "ownerId"]);
  if (ownerId && ownerId !== job.id) {
    return null;
  }

  const objectiveText = readString(managedObjective, [
    "objective_text",
    "objectiveText",
    "objective",
  ]);
  if (!objectiveText) {
    return null;
  }

  const completionAudit = readCompletionAudit(
    readFirst(managedObjective, ["completion_audit", "completionAudit"]),
  );

  return {
    objectiveId: readString(managedObjective, ["objective_id", "objectiveId"]),
    ownerId,
    ownerType,
    objectiveText,
    successCriteria: readStringArray(managedObjective, [
      "success_criteria",
      "successCriteria",
    ]),
    status: readManagedObjectiveStatus(
      readString(managedObjective, ["state", "status"]),
    ),
    completionAudit,
    requiresArtifactOrEvidence:
      completionAudit === ARTIFACT_OR_EVIDENCE_COMPLETION_AUDIT,
    lastAuditSummary: readString(managedObjective, [
      "last_audit_summary",
      "lastAuditSummary",
    ]),
    lastEvidencePackRef: readString(managedObjective, [
      "last_evidence_pack_ref",
      "lastEvidencePackRef",
    ]),
    lastArtifactRefs: readStringArray(managedObjective, [
      "last_artifact_refs",
      "lastArtifactRefs",
    ]),
    blockerReason: readString(managedObjective, [
      "blocker_reason",
      "blockerReason",
    ]),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readFirst(
  record: Record<string, unknown> | null,
  keys: string[],
): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  const value = readFirst(record, keys);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readStringArray(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  const value = readFirst(record, keys);
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readManagedObjectiveStatus(
  value: string | null,
): ManagedObjectiveStatus {
  if (
    value &&
    MANAGED_OBJECTIVE_STATUSES.has(value as ManagedObjectiveStatus)
  ) {
    return value as ManagedObjectiveStatus;
  }
  return "active";
}

function readCompletionAudit(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return readString(record, ["kind", "type", "policy", "requirement"]);
}
