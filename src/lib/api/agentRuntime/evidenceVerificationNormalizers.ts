import type {
  AgentRuntimeRequestedFixExecutionResult,
  AgentRuntimeRequestedFixExecutionStatus,
} from "./types";
import {
  isRecord,
  readNumberField,
  readOptionalBooleanField,
  readOptionalNumberField,
  readOptionalStringField,
  readRecordField,
  readStringListField,
} from "./normalizerUtils";

function normalizeEvidenceVerificationOutcome(
  value?: string,
):
  | "success"
  | "blocking_failure"
  | "advisory_failure"
  | "recovered"
  | undefined {
  switch (value) {
    case "success":
    case "blocking_failure":
    case "advisory_failure":
    case "recovered":
      return value;
    default:
      return undefined;
  }
}

function normalizeArtifactValidatorVerificationSummary(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    applicable: readOptionalBooleanField(value, "applicable") ?? false,
    record_count: readNumberField(value, "recordCount", "record_count"),
    issue_count: readNumberField(value, "issueCount", "issue_count"),
    repaired_count: readNumberField(value, "repairedCount", "repaired_count"),
    fallback_used_count: readNumberField(
      value,
      "fallbackUsedCount",
      "fallback_used_count",
    ),
    outcome: normalizeEvidenceVerificationOutcome(
      readOptionalStringField(value, "outcome"),
    ),
  };
}

function normalizeBrowserVerificationSummary(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    record_count: readNumberField(value, "recordCount", "record_count"),
    success_count: readNumberField(value, "successCount", "success_count"),
    failure_count: readNumberField(value, "failureCount", "failure_count"),
    unknown_count: readNumberField(value, "unknownCount", "unknown_count"),
    latest_updated_at: readOptionalStringField(
      value,
      "latestUpdatedAt",
      "latest_updated_at",
    ),
    outcome: normalizeEvidenceVerificationOutcome(
      readOptionalStringField(value, "outcome"),
    ),
  };
}

function normalizeGuiSmokeVerificationSummary(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    status: readOptionalStringField(value, "status"),
    exit_code: readOptionalNumberField(value, "exitCode", "exit_code"),
    passed: readOptionalBooleanField(value, "passed") ?? false,
    updated_at: readOptionalStringField(value, "updatedAt", "updated_at"),
    has_output_preview:
      readOptionalBooleanField(
        value,
        "hasOutputPreview",
        "has_output_preview",
      ) ?? false,
    outcome: normalizeEvidenceVerificationOutcome(
      readOptionalStringField(value, "outcome"),
    ),
  };
}

function normalizeEvidenceObservabilityVerificationOutcomes(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    blocking_failure: readStringListField(
      value,
      "blockingFailure",
      "blocking_failure",
    ),
    advisory_failure: readStringListField(
      value,
      "advisoryFailure",
      "advisory_failure",
    ),
    recovered: readStringListField(value, "recovered"),
  };
}

function normalizeRequestedFixExecutionStatus(
  value: string | undefined,
): AgentRuntimeRequestedFixExecutionStatus {
  switch (value) {
    case "assigned":
    case "running":
    case "completed":
    case "failed":
    case "blocked":
    case "cancelled":
      return value;
    default:
      return "pending";
  }
}

function normalizeRequestedFixExecutionResult(
  value: unknown,
): AgentRuntimeRequestedFixExecutionResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    requested_fix: readOptionalStringField(
      value,
      "requestedFix",
      "requested_fix",
    ),
    requested_fix_index: readOptionalNumberField(
      value,
      "requestedFixIndex",
      "requested_fix_index",
    ),
    execution_status: normalizeRequestedFixExecutionStatus(
      readOptionalStringField(value, "executionStatus", "execution_status"),
    ),
    regression_outcome: normalizeEvidenceVerificationOutcome(
      readOptionalStringField(value, "regressionOutcome", "regression_outcome"),
    ),
    summary_preview: readOptionalStringField(
      value,
      "summaryPreview",
      "summary_preview",
    ),
    result_ref: readOptionalStringField(value, "resultRef", "result_ref"),
    artifact_ids: readStringListField(value, "artifactIds", "artifact_ids"),
    artifact_paths: readStringListField(
      value,
      "artifactPaths",
      "artifact_paths",
    ),
  };
}

function normalizeRequestedFixExecutionResults(
  value: unknown,
): AgentRuntimeRequestedFixExecutionResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeRequestedFixExecutionResult(entry))
    .filter(
      (entry): entry is AgentRuntimeRequestedFixExecutionResult =>
        entry !== null,
    );
}

export function normalizeEvidenceVerificationSummary(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    artifact_validator: normalizeArtifactValidatorVerificationSummary(
      readRecordField(value, "artifactValidator", "artifact_validator"),
    ),
    browser_verification: normalizeBrowserVerificationSummary(
      readRecordField(value, "browserVerification", "browser_verification"),
    ),
    gui_smoke: normalizeGuiSmokeVerificationSummary(
      readRecordField(value, "guiSmoke", "gui_smoke"),
    ),
    observability_verification_outcomes:
      normalizeEvidenceObservabilityVerificationOutcomes(
        readRecordField(
          value,
          "observabilityVerificationOutcomes",
          "observability_verification_outcomes",
        ),
      ),
    focus_verification_failure_outcomes: readStringListField(
      value,
      "focusVerificationFailureOutcomes",
      "focus_verification_failure_outcomes",
    ),
    focus_verification_recovered_outcomes: readStringListField(
      value,
      "focusVerificationRecoveredOutcomes",
      "focus_verification_recovered_outcomes",
    ),
    requested_fix_execution_results: normalizeRequestedFixExecutionResults(
      value.requestedFixExecutionResults ??
        value.requested_fix_execution_results,
    ),
  };
}
