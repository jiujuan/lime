import { AppServerClient } from "@/lib/api/appServer";
import {
  APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
  APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
  APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
  APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
  APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
} from "@/lib/api/appServer";
import { projectAppServerEvidenceExportToRuntimeEvidencePack } from "./appServerEvidenceExportProjection";
import {
  normalizeAnalysisHandoff,
  normalizeHandoffBundle,
  normalizeReplayCase,
  normalizeReviewDecisionTemplate,
} from "./normalizers";
import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeAnalysisArtifact,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffArtifact,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayArtifact,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionArtifact,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "./types";

export type AgentRuntimeEvidenceExportAppServerClient = Pick<
  AppServerClient,
  | "exportEvidence"
  | "exportHandoffBundle"
  | "exportReplayCase"
  | "exportAnalysisHandoff"
  | "exportReviewDecisionTemplate"
  | "saveReviewDecision"
>;

export interface AgentRuntimeExportClientDeps {
  appServerClient?: AgentRuntimeEvidenceExportAppServerClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): unknown {
  return record[camelKey] ?? (snakeKey ? record[snakeKey] : undefined);
}

function hasRequiredString(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): boolean {
  const value = readField(record, camelKey, snakeKey);
  return typeof value === "string" && value.length > 0;
}

function hasStringField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): boolean {
  return typeof readField(record, camelKey, snakeKey) === "string";
}

function hasRequiredFiniteNumber(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): boolean {
  const value = readField(record, camelKey, snakeKey);
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isArtifact(
  value: unknown,
  allowedKinds: readonly string[],
): value is
  | AgentRuntimeAnalysisArtifact
  | AgentRuntimeHandoffArtifact
  | AgentRuntimeReplayArtifact
  | AgentRuntimeReviewDecisionArtifact {
  if (!isRecord(value)) {
    return false;
  }
  const kind = readField(value, "kind");
  return (
    typeof kind === "string" &&
    allowedKinds.includes(kind) &&
    hasRequiredString(value, "title") &&
    hasRequiredString(value, "relativePath", "relative_path") &&
    hasRequiredString(value, "absolutePath", "absolute_path") &&
    hasRequiredFiniteNumber(value, "bytes")
  );
}

function isArtifactList(value: unknown, allowedKinds: readonly string[]): boolean {
  return Array.isArray(value) && value.every((item) => isArtifact(item, allowedKinds));
}

function hasRuntimeExportBaseFields(
  value: unknown,
  rootFields: ReadonlyArray<readonly [string, string]>,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const hasRootFields = rootFields.every(([camelKey, snakeKey]) =>
    hasRequiredString(value, camelKey, snakeKey),
  );
  return (
    hasRequiredString(value, "sessionId", "session_id") &&
    hasRequiredString(value, "threadId", "thread_id") &&
    hasRootFields &&
    hasRequiredString(value, "exportedAt", "exported_at") &&
    hasRequiredString(value, "threadStatus", "thread_status") &&
    hasRequiredFiniteNumber(
      value,
      "pendingRequestCount",
      "pending_request_count",
    ) &&
    hasRequiredFiniteNumber(value, "queuedTurnCount", "queued_turn_count")
  );
}

function isHandoffBundle(value: unknown): boolean {
  return (
    hasRuntimeExportBaseFields(value, [
      ["workspaceRoot", "workspace_root"],
      ["bundleRelativeRoot", "bundle_relative_root"],
      ["bundleAbsoluteRoot", "bundle_absolute_root"],
    ]) &&
    hasRequiredFiniteNumber(
      value,
      "activeSubagentCount",
      "active_subagent_count",
    ) &&
    hasRequiredFiniteNumber(value, "todoTotal", "todo_total") &&
    hasRequiredFiniteNumber(value, "todoPending", "todo_pending") &&
    hasRequiredFiniteNumber(value, "todoInProgress", "todo_in_progress") &&
    hasRequiredFiniteNumber(value, "todoCompleted", "todo_completed") &&
    isArtifactList(value.artifacts, ["plan", "progress", "handoff", "review_summary"])
  );
}

function isAnalysisHandoff(value: unknown): boolean {
  return (
    hasRuntimeExportBaseFields(value, [
      ["workspaceRoot", "workspace_root"],
      ["analysisRelativeRoot", "analysis_relative_root"],
      ["analysisAbsoluteRoot", "analysis_absolute_root"],
      ["handoffBundleRelativeRoot", "handoff_bundle_relative_root"],
      ["evidencePackRelativeRoot", "evidence_pack_relative_root"],
      ["replayCaseRelativeRoot", "replay_case_relative_root"],
    ]) &&
    isRecord(value) &&
    hasStringField(value, "title") &&
    hasRequiredString(
      value,
      "sanitizedWorkspaceRoot",
      "sanitized_workspace_root",
    ) &&
    hasStringField(value, "copyPrompt", "copy_prompt") &&
    isArtifactList(value.artifacts, ["analysis_brief", "analysis_context"])
  );
}

function isReplayCase(value: unknown): boolean {
  return (
    hasRuntimeExportBaseFields(value, [
      ["workspaceRoot", "workspace_root"],
      ["replayRelativeRoot", "replay_relative_root"],
      ["replayAbsoluteRoot", "replay_absolute_root"],
      ["handoffBundleRelativeRoot", "handoff_bundle_relative_root"],
      ["evidencePackRelativeRoot", "evidence_pack_relative_root"],
    ]) &&
    isRecord(value) &&
    hasRequiredFiniteNumber(
      value,
      "linkedHandoffArtifactCount",
      "linked_handoff_artifact_count",
    ) &&
    hasRequiredFiniteNumber(
      value,
      "linkedEvidenceArtifactCount",
      "linked_evidence_artifact_count",
    ) &&
    hasRequiredFiniteNumber(
      value,
      "recentArtifactCount",
      "recent_artifact_count",
    ) &&
    isArtifactList(value.artifacts, ["input", "expected", "grader", "evidence_links"])
  );
}

function isReviewDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasRequiredString(value, "decisionStatus", "decision_status") &&
    hasStringField(value, "decisionSummary", "decision_summary") &&
    hasStringField(value, "chosenFixStrategy", "chosen_fix_strategy") &&
    hasRequiredString(value, "riskLevel", "risk_level") &&
    isStringArray(readField(value, "riskTags", "risk_tags")) &&
    hasStringField(value, "humanReviewer", "human_reviewer") &&
    isStringArray(readField(value, "followupActions", "followup_actions")) &&
    isStringArray(
      readField(value, "regressionRequirements", "regression_requirements"),
    ) &&
    hasStringField(value, "notes")
  );
}

function isReviewDecisionTemplate(value: unknown): boolean {
  return (
    hasRuntimeExportBaseFields(value, [
      ["workspaceRoot", "workspace_root"],
      ["reviewRelativeRoot", "review_relative_root"],
      ["reviewAbsoluteRoot", "review_absolute_root"],
      ["analysisRelativeRoot", "analysis_relative_root"],
      ["analysisAbsoluteRoot", "analysis_absolute_root"],
      ["handoffBundleRelativeRoot", "handoff_bundle_relative_root"],
      ["evidencePackRelativeRoot", "evidence_pack_relative_root"],
      ["replayCaseRelativeRoot", "replay_case_relative_root"],
    ]) &&
    isRecord(value) &&
    hasStringField(value, "title") &&
    hasRequiredString(
      value,
      "defaultDecisionStatus",
      "default_decision_status",
    ) &&
    isReviewDecision(value.decision) &&
    isStringArray(
      readField(value, "decisionStatusOptions", "decision_status_options"),
    ) &&
    isStringArray(readField(value, "riskLevelOptions", "risk_level_options")) &&
    isStringArray(readField(value, "reviewChecklist", "review_checklist")) &&
    isArtifactList(
      readField(value, "analysisArtifacts", "analysis_artifacts"),
      ["analysis_brief", "analysis_context"],
    ) &&
    isArtifactList(value.artifacts, [
      "review_decision_markdown",
      "review_decision_json",
    ])
  );
}

function assertRuntimeExportResult(
  command: string,
  value: unknown,
  predicate: (value: unknown) => boolean,
  label: string,
): void {
  if (!predicate(value)) {
    throw new Error(`${command} did not return ${label}`);
  }
}

export function createExportClient({
  appServerClient = new AppServerClient(),
}: AgentRuntimeExportClientDeps = {}) {
  async function exportAgentRuntimeHandoffBundle(
    sessionId: string,
  ): Promise<AgentRuntimeHandoffBundle> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error(
        "sessionId is required to export App Server handoff bundle",
      );
    }

    const response = await appServerClient.exportHandoffBundle({
      sessionId: normalizedSessionId,
    });
    const result = response.result;
    assertRuntimeExportResult(
      APP_SERVER_METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT,
      result,
      isHandoffBundle,
      "runtime handoff bundle",
    );
    return normalizeHandoffBundle(result);
  }

  async function exportAgentRuntimeAnalysisHandoff(
    sessionId: string,
  ): Promise<AgentRuntimeAnalysisHandoff> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error(
        "sessionId is required to export App Server analysis handoff",
      );
    }
    const response = await appServerClient.exportAnalysisHandoff({
      sessionId: normalizedSessionId,
    });
    const result = response.result;
    assertRuntimeExportResult(
      APP_SERVER_METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT,
      result,
      isAnalysisHandoff,
      "runtime analysis handoff",
    );
    return normalizeAnalysisHandoff(result);
  }

  async function exportAgentRuntimeReviewDecisionTemplate(
    sessionId: string,
  ): Promise<AgentRuntimeReviewDecisionTemplate> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error(
        "sessionId is required to export App Server review decision template",
      );
    }
    const response = await appServerClient.exportReviewDecisionTemplate({
      sessionId: normalizedSessionId,
    });
    const result = response.result;
    assertRuntimeExportResult(
      APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT,
      result,
      isReviewDecisionTemplate,
      "runtime review decision template",
    );
    return normalizeReviewDecisionTemplate(result);
  }

  async function saveAgentRuntimeReviewDecision(
    request: AgentRuntimeSaveReviewDecisionRequest,
  ): Promise<AgentRuntimeReviewDecisionTemplate> {
    const normalizedSessionId = request.session_id.trim();
    if (!normalizedSessionId) {
      throw new Error(
        "sessionId is required to save App Server review decision",
      );
    }
    const response = await appServerClient.saveReviewDecision({
      sessionId: normalizedSessionId,
      decisionStatus: request.decision_status,
      decisionSummary: request.decision_summary,
      chosenFixStrategy: request.chosen_fix_strategy,
      riskLevel: request.risk_level,
      riskTags: request.risk_tags,
      humanReviewer: request.human_reviewer,
      followupActions: request.followup_actions,
      regressionRequirements: request.regression_requirements,
      notes: request.notes,
    });
    const result = response.result;
    assertRuntimeExportResult(
      APP_SERVER_METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE,
      result,
      isReviewDecisionTemplate,
      "runtime review decision template",
    );
    return normalizeReviewDecisionTemplate(result);
  }

  async function exportAgentRuntimeEvidencePack(
    sessionId: string,
  ): Promise<AgentRuntimeEvidencePack> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required to export App Server evidence");
    }

    const response = await appServerClient.exportEvidence({
      sessionId: normalizedSessionId,
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    return projectAppServerEvidenceExportToRuntimeEvidencePack(response.result);
  }

  async function exportAgentRuntimeReplayCase(
    sessionId: string,
  ): Promise<AgentRuntimeReplayCase> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error(
        "sessionId is required to export App Server replay case",
      );
    }
    const response = await appServerClient.exportReplayCase({
      sessionId: normalizedSessionId,
    });
    const result = response.result;
    assertRuntimeExportResult(
      APP_SERVER_METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT,
      result,
      isReplayCase,
      "runtime replay case",
    );
    return normalizeReplayCase(result);
  }

  return {
    exportAgentRuntimeAnalysisHandoff,
    exportAgentRuntimeEvidencePack,
    exportAgentRuntimeHandoffBundle,
    exportAgentRuntimeReplayCase,
    exportAgentRuntimeReviewDecisionTemplate,
    saveAgentRuntimeReviewDecision,
  };
}

export const {
  exportAgentRuntimeAnalysisHandoff,
  exportAgentRuntimeEvidencePack,
  exportAgentRuntimeHandoffBundle,
  exportAgentRuntimeReplayCase,
  exportAgentRuntimeReviewDecisionTemplate,
  saveAgentRuntimeReviewDecision,
} = createExportClient();
