import type {
  AgentRuntimeAnalysisArtifact,
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeHandoffArtifact,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayArtifact,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecision,
  AgentRuntimeReviewDecisionArtifact,
  AgentRuntimeReviewDecisionRiskLevel,
  AgentRuntimeReviewDecisionStatus,
  AgentRuntimeReviewDecisionTemplate,
} from "./types";
import { normalizeEvidenceVerificationSummary } from "./evidenceVerificationNormalizers";
import {
  isRecord,
  readNumberField,
  readOptionalStringField,
  readStringField,
  readStringListField,
} from "./normalizerUtils";

function normalizeAnalysisArtifact(
  value: unknown,
): AgentRuntimeAnalysisArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    kind:
      readStringField(value, "kind") === "analysis_context"
        ? "analysis_context"
        : "analysis_brief",
    title: readStringField(value, "title"),
    relative_path: readStringField(value, "relativePath", "relative_path"),
    absolute_path: readStringField(value, "absolutePath", "absolute_path"),
    bytes: readNumberField(value, "bytes"),
  };
}

function normalizeHandoffArtifact(
  value: unknown,
): AgentRuntimeHandoffArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readStringField(value, "kind");

  return {
    kind:
      kind === "progress"
        ? "progress"
        : kind === "handoff"
          ? "handoff"
          : kind === "review_summary"
            ? "review_summary"
            : "plan",
    title: readStringField(value, "title"),
    relative_path: readStringField(value, "relativePath", "relative_path"),
    absolute_path: readStringField(value, "absolutePath", "absolute_path"),
    bytes: readNumberField(value, "bytes"),
  };
}

function normalizeReplayArtifact(
  value: unknown,
): AgentRuntimeReplayArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readStringField(value, "kind");

  return {
    kind:
      kind === "expected"
        ? "expected"
        : kind === "grader"
          ? "grader"
          : kind === "evidence_links"
            ? "evidence_links"
            : "input",
    title: readStringField(value, "title"),
    relative_path: readStringField(value, "relativePath", "relative_path"),
    absolute_path: readStringField(value, "absolutePath", "absolute_path"),
    bytes: readNumberField(value, "bytes"),
  };
}

function normalizeReviewDecisionArtifact(
  value: unknown,
): AgentRuntimeReviewDecisionArtifact | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    kind:
      readStringField(value, "kind") === "review_decision_json"
        ? "review_decision_json"
        : "review_decision_markdown",
    title: readStringField(value, "title"),
    relative_path: readStringField(value, "relativePath", "relative_path"),
    absolute_path: readStringField(value, "absolutePath", "absolute_path"),
    bytes: readNumberField(value, "bytes"),
  };
}

function normalizeReviewDecisionStatus(
  value: string,
): AgentRuntimeReviewDecisionStatus {
  switch (value) {
    case "accepted":
    case "deferred":
    case "rejected":
    case "needs_more_evidence":
    case "pending_review":
      return value;
    default:
      return "pending_review";
  }
}

function normalizeReviewDecisionRiskLevel(
  value: string,
): AgentRuntimeReviewDecisionRiskLevel {
  switch (value) {
    case "low":
    case "medium":
    case "high":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function normalizeReviewDecision(value: unknown): AgentRuntimeReviewDecision {
  const record = isRecord(value) ? value : {};

  return {
    decision_status: normalizeReviewDecisionStatus(
      readStringField(record, "decisionStatus", "decision_status"),
    ),
    decision_summary: readStringField(
      record,
      "decisionSummary",
      "decision_summary",
    ),
    chosen_fix_strategy: readStringField(
      record,
      "chosenFixStrategy",
      "chosen_fix_strategy",
    ),
    risk_level: normalizeReviewDecisionRiskLevel(
      readStringField(record, "riskLevel", "risk_level"),
    ),
    risk_tags: readStringListField(record, "riskTags", "risk_tags"),
    human_reviewer: readStringField(record, "humanReviewer", "human_reviewer"),
    reviewed_at: readOptionalStringField(record, "reviewedAt", "reviewed_at"),
    followup_actions: readStringListField(
      record,
      "followupActions",
      "followup_actions",
    ),
    regression_requirements: readStringListField(
      record,
      "regressionRequirements",
      "regression_requirements",
    ),
    notes: readStringField(record, "notes"),
  };
}

export function normalizeAnalysisHandoff(
  value: unknown,
): AgentRuntimeAnalysisHandoff {
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
    analysis_relative_root: readStringField(
      record,
      "analysisRelativeRoot",
      "analysis_relative_root",
    ),
    analysis_absolute_root: readStringField(
      record,
      "analysisAbsoluteRoot",
      "analysis_absolute_root",
    ),
    handoff_bundle_relative_root: readStringField(
      record,
      "handoffBundleRelativeRoot",
      "handoff_bundle_relative_root",
    ),
    evidence_pack_relative_root: readStringField(
      record,
      "evidencePackRelativeRoot",
      "evidence_pack_relative_root",
    ),
    replay_case_relative_root: readStringField(
      record,
      "replayCaseRelativeRoot",
      "replay_case_relative_root",
    ),
    exported_at: readStringField(record, "exportedAt", "exported_at"),
    title: readStringField(record, "title"),
    thread_status: readStringField(record, "threadStatus", "thread_status"),
    latest_turn_status: readOptionalStringField(
      record,
      "latestTurnStatus",
      "latest_turn_status",
    ),
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
    sanitized_workspace_root: readStringField(
      record,
      "sanitizedWorkspaceRoot",
      "sanitized_workspace_root",
    ),
    copy_prompt: readStringField(record, "copyPrompt", "copy_prompt"),
    artifacts: rawArtifacts
      .map((artifact) => normalizeAnalysisArtifact(artifact))
      .filter(Boolean) as AgentRuntimeAnalysisArtifact[],
  };
}

export function normalizeHandoffBundle(
  value: unknown,
): AgentRuntimeHandoffBundle {
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
    bundle_relative_root: readStringField(
      record,
      "bundleRelativeRoot",
      "bundle_relative_root",
    ),
    bundle_absolute_root: readStringField(
      record,
      "bundleAbsoluteRoot",
      "bundle_absolute_root",
    ),
    exported_at: readStringField(record, "exportedAt", "exported_at"),
    thread_status: readStringField(record, "threadStatus", "thread_status"),
    latest_turn_status: readOptionalStringField(
      record,
      "latestTurnStatus",
      "latest_turn_status",
    ),
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
    active_subagent_count: readNumberField(
      record,
      "activeSubagentCount",
      "active_subagent_count",
    ),
    todo_total: readNumberField(record, "todoTotal", "todo_total"),
    todo_pending: readNumberField(record, "todoPending", "todo_pending"),
    todo_in_progress: readNumberField(
      record,
      "todoInProgress",
      "todo_in_progress",
    ),
    todo_completed: readNumberField(record, "todoCompleted", "todo_completed"),
    artifacts: rawArtifacts
      .map((artifact) => normalizeHandoffArtifact(artifact))
      .filter(Boolean) as AgentRuntimeHandoffArtifact[],
  };
}

export function normalizeReplayCase(value: unknown): AgentRuntimeReplayCase {
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
    replay_relative_root: readStringField(
      record,
      "replayRelativeRoot",
      "replay_relative_root",
    ),
    replay_absolute_root: readStringField(
      record,
      "replayAbsoluteRoot",
      "replay_absolute_root",
    ),
    handoff_bundle_relative_root: readStringField(
      record,
      "handoffBundleRelativeRoot",
      "handoff_bundle_relative_root",
    ),
    evidence_pack_relative_root: readStringField(
      record,
      "evidencePackRelativeRoot",
      "evidence_pack_relative_root",
    ),
    exported_at: readStringField(record, "exportedAt", "exported_at"),
    thread_status: readStringField(record, "threadStatus", "thread_status"),
    latest_turn_status: readOptionalStringField(
      record,
      "latestTurnStatus",
      "latest_turn_status",
    ),
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
    linked_handoff_artifact_count: readNumberField(
      record,
      "linkedHandoffArtifactCount",
      "linked_handoff_artifact_count",
    ),
    linked_evidence_artifact_count: readNumberField(
      record,
      "linkedEvidenceArtifactCount",
      "linked_evidence_artifact_count",
    ),
    recent_artifact_count: readNumberField(
      record,
      "recentArtifactCount",
      "recent_artifact_count",
    ),
    artifacts: rawArtifacts
      .map((artifact) => normalizeReplayArtifact(artifact))
      .filter(Boolean) as AgentRuntimeReplayArtifact[],
  };
}

export function normalizeReviewDecisionTemplate(
  value: unknown,
): AgentRuntimeReviewDecisionTemplate {
  const record = isRecord(value) ? value : {};
  const rawArtifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const rawAnalysisArtifacts = Array.isArray(record.analysisArtifacts)
    ? record.analysisArtifacts
    : Array.isArray(record.analysis_artifacts)
      ? record.analysis_artifacts
      : [];

  return {
    session_id: readStringField(record, "sessionId", "session_id"),
    thread_id: readStringField(record, "threadId", "thread_id"),
    workspace_id: readOptionalStringField(
      record,
      "workspaceId",
      "workspace_id",
    ),
    workspace_root: readStringField(record, "workspaceRoot", "workspace_root"),
    review_relative_root: readStringField(
      record,
      "reviewRelativeRoot",
      "review_relative_root",
    ),
    review_absolute_root: readStringField(
      record,
      "reviewAbsoluteRoot",
      "review_absolute_root",
    ),
    analysis_relative_root: readStringField(
      record,
      "analysisRelativeRoot",
      "analysis_relative_root",
    ),
    analysis_absolute_root: readStringField(
      record,
      "analysisAbsoluteRoot",
      "analysis_absolute_root",
    ),
    handoff_bundle_relative_root: readStringField(
      record,
      "handoffBundleRelativeRoot",
      "handoff_bundle_relative_root",
    ),
    evidence_pack_relative_root: readStringField(
      record,
      "evidencePackRelativeRoot",
      "evidence_pack_relative_root",
    ),
    replay_case_relative_root: readStringField(
      record,
      "replayCaseRelativeRoot",
      "replay_case_relative_root",
    ),
    exported_at: readStringField(record, "exportedAt", "exported_at"),
    title: readStringField(record, "title"),
    thread_status: readStringField(record, "threadStatus", "thread_status"),
    latest_turn_status: readOptionalStringField(
      record,
      "latestTurnStatus",
      "latest_turn_status",
    ),
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
    default_decision_status: readStringField(
      record,
      "defaultDecisionStatus",
      "default_decision_status",
    ),
    verification_summary: normalizeEvidenceVerificationSummary(
      record.verificationSummary ?? record.verification_summary,
    ),
    limit_status: readOptionalStringField(
      record,
      "limitStatus",
      "limit_status",
    ),
    capability_gap: readOptionalStringField(
      record,
      "capabilityGap",
      "capability_gap",
    ),
    user_locked_capability_summary: readOptionalStringField(
      record,
      "userLockedCapabilitySummary",
      "user_locked_capability_summary",
    ),
    permission_status: readOptionalStringField(
      record,
      "permissionStatus",
      "permission_status",
    ),
    permission_confirmation_status: readOptionalStringField(
      record,
      "permissionConfirmationStatus",
      "permission_confirmation_status",
    ),
    permission_confirmation_request_id: readOptionalStringField(
      record,
      "permissionConfirmationRequestId",
      "permission_confirmation_request_id",
    ),
    permission_confirmation_source: readOptionalStringField(
      record,
      "permissionConfirmationSource",
      "permission_confirmation_source",
    ),
    permission_confirmation_summary: readOptionalStringField(
      record,
      "permissionConfirmationSummary",
      "permission_confirmation_summary",
    ),
    decision: normalizeReviewDecision(record.decision),
    decision_status_options: readStringListField(
      record,
      "decisionStatusOptions",
      "decision_status_options",
    ).map((status) => normalizeReviewDecisionStatus(status)),
    risk_level_options: readStringListField(
      record,
      "riskLevelOptions",
      "risk_level_options",
    ).map((riskLevel) => normalizeReviewDecisionRiskLevel(riskLevel)),
    review_checklist: readStringListField(
      record,
      "reviewChecklist",
      "review_checklist",
    ),
    analysis_artifacts: rawAnalysisArtifacts
      .map((artifact) => normalizeAnalysisArtifact(artifact))
      .filter(Boolean) as AgentRuntimeAnalysisArtifact[],
    artifacts: rawArtifacts
      .map((artifact) => normalizeReviewDecisionArtifact(artifact))
      .filter(Boolean) as AgentRuntimeReviewDecisionArtifact[],
  };
}
