import type { AgentEventArtifactSnapshot } from "@/lib/api/agentProtocol";
import type {
  AgentUiControl,
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";
import {
  definedString,
  metadataKeys,
  normalizeProjectionIdList,
  readNumberField,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateStringList,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import {
  normalizeEvidenceProjectionPhase,
  normalizeHandoffProjectionPhase,
} from "./phaseProjection";
import { buildAgentUiProjectionBase } from "./projectionBase";

export interface AgentUiEvidenceProjectionInput {
  evidenceId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  kind?: string | null;
  status?: string | null;
  verdict?: string | null;
  summaryPreview?: string | null;
  artifactIds?: string[];
  artifactPaths?: string[];
  itemCount?: number;
}

export interface AgentUiReviewProjectionInput
  extends AgentUiEvidenceProjectionInput {
  reviewEvent: "requested" | "completed";
  reviewId?: string | null;
  reviewer?: string | null;
  decisionStatus?: string | null;
  riskLevel?: string | null;
  followupActionCount?: number;
  regressionRequirementCount?: number;
  checklistCount?: number;
  regressionOutcome?: string | null;
  regressionFailureOutcomes?: string[];
  regressionRecoveredOutcomes?: string[];
  requestedFixes?: string[];
  followupActions?: string[];
  regressionRequirements?: string[];
  requestedFixExecutionResults?: AgentUiRequestedFixExecutionResult[];
}

export type AgentUiRequestedFixExecutionStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface AgentUiRequestedFixExecutionResult {
  requestedFix?: string | null;
  requestedFixIndex?: number | null;
  executionStatus?: AgentUiRequestedFixExecutionStatus | null;
  regressionOutcome?: string | null;
  summaryPreview?: string | null;
  resultRef?: string | null;
  artifactIds?: string[];
  artifactPaths?: string[];
}

export interface AgentUiHandoffProjectionInput
  extends AgentUiEvidenceProjectionInput {
  handoffId?: string | null;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  resumeTarget?: string | null;
  contextBoundary?: string | null;
}

export function buildAgentUiEvidenceChangedEvent(
  input: AgentUiEvidenceProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const status = definedString(input.status);

  return {
    type: "evidence.changed",
    sourceType: "evidence_projection",
    sequence: context.sequence,
    timestamp: context.timestamp,
    sessionId: definedString(input.sessionId ?? context.sessionId ?? undefined),
    threadId: definedString(input.threadId ?? context.threadId ?? undefined),
    runId: definedString(input.runId ?? context.runId ?? undefined),
    taskId: definedString(input.taskId ?? context.taskId ?? undefined),
    evidenceId: definedString(input.evidenceId ?? undefined),
    owner: "evidence",
    scope: "evidence",
    phase: normalizeEvidenceProjectionPhase(status),
    surface: "timeline_evidence",
    persistence: "evidence_pack",
    payload: {
      kind: definedString(input.kind),
      status,
      verdict: definedString(input.verdict),
      summaryPreview: truncateText(input.summaryPreview),
      itemCount: input.itemCount ?? 0,
    },
    refs: {
      ...(input.artifactIds?.length
        ? { artifactIds: [...new Set(input.artifactIds)] }
        : {}),
      ...(input.artifactPaths?.length
        ? { artifactPaths: [...new Set(input.artifactPaths)] }
        : {}),
    },
  };
}

function collectRequestedFixExecutionResultRecords(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  if (!metadata) {
    return [];
  }

  const review = readRecord(metadata.review);
  const records: Record<string, unknown>[] = [];
  const appendArray = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    value.forEach((item) => {
      const record = readRecord(item);
      if (record) {
        records.push(record);
      }
    });
  };
  const appendSingle = (value: unknown) => {
    const record = readRecord(value);
    if (record) {
      records.push(record);
    }
  };

  appendArray(metadata.requestedFixExecutionResults);
  appendArray(metadata.requested_fix_execution_results);
  appendArray(review?.requestedFixExecutionResults);
  appendArray(review?.requested_fix_execution_results);
  appendSingle(metadata.requestedFixExecutionResult);
  appendSingle(metadata.requested_fix_execution_result);
  appendSingle(review?.requestedFixExecutionResult);
  appendSingle(review?.requested_fix_execution_result);

  return records;
}

function normalizeRequestedFixExecutionStatus(
  status: string | null | undefined,
): AgentUiRequestedFixExecutionStatus {
  switch (definedString(status)) {
    case "assigned":
      return "assigned";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function resolveRequestedFixExecutionResult(
  requestedFixExecutionResults:
    | AgentUiRequestedFixExecutionResult[]
    | undefined,
  fix: string,
  fixNumber: number,
): AgentUiRequestedFixExecutionResult | undefined {
  const normalizedFix = definedString(fix);
  return requestedFixExecutionResults?.find((result) => {
    if (
      typeof result.requestedFixIndex === "number" &&
      result.requestedFixIndex === fixNumber
    ) {
      return true;
    }
    return (
      normalizedFix && definedString(result.requestedFix) === normalizedFix
    );
  });
}

function requestedFixExecutionPhase(
  status: AgentUiRequestedFixExecutionStatus,
): AgentUiPhase {
  switch (status) {
    case "assigned":
      return "planning";
    case "running":
      return "acting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "waiting";
    case "cancelled":
      return "cancelled";
    case "pending":
    default:
      return "waiting";
  }
}

function requestedFixRuntimeStatus(
  status: AgentUiRequestedFixExecutionStatus,
): AgentUiRuntimeStatus {
  switch (status) {
    case "assigned":
      return "accepted";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "waiting";
    case "cancelled":
      return "cancelled";
    case "pending":
    default:
      return "queued";
  }
}

function requestedFixControl(
  status: AgentUiRequestedFixExecutionStatus,
): AgentUiControl {
  return status === "pending" || status === "assigned" || status === "blocked"
    ? "assign"
    : "open_detail";
}

export function buildRequestedFixExecutionEventsFromArtifact(
  event: AgentEventArtifactSnapshot,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const metadata = event.artifact.metadata;
  const metadataRecord = readRecord(metadata);
  const records = collectRequestedFixExecutionResultRecords(metadataRecord);
  if (records.length === 0) {
    return [];
  }

  const reviewRecord = readRecord(metadataRecord?.review);
  const sourceArtifactId = definedString(event.artifact.artifactId);
  const sourceArtifactPath = definedString(event.artifact.filePath);
  const sourceArtifactIds = sourceArtifactId ? [sourceArtifactId] : [];
  const sourceArtifactPaths = sourceArtifactPath ? [sourceArtifactPath] : [];
  const base = buildAgentUiProjectionBase(event, context);

  const events: AgentUiProjectionEvent[] = [];
  records.forEach((record, index) => {
    const requestedFix =
      readStringField(record, ["requestedFix", "requested_fix"]) ??
      readStringField(metadataRecord, ["requestedFix", "requested_fix"]);
    const requestedFixIndex =
      readNumberField(record, ["requestedFixIndex", "requested_fix_index"]) ??
      index + 1;
    const executionStatus = normalizeRequestedFixExecutionStatus(
      readStringField(record, ["executionStatus", "execution_status"]),
    );
    const regressionOutcome = definedString(
      readStringField(record, ["regressionOutcome", "regression_outcome"]),
    );
    const summaryPreview = truncateText(
      readStringField(record, ["summaryPreview", "summary_preview"]),
    );
    const resultRef = definedString(
      readStringField(record, ["resultRef", "result_ref"]),
    );
    const resultArtifactIds = normalizeProjectionIdList(
      readStringArrayField(record, ["artifactIds", "artifact_ids"]),
    );
    const resultArtifactPaths = normalizeProjectionIdList(
      readStringArrayField(record, ["artifactPaths", "artifact_paths"]),
    );
    const artifactIds =
      resultArtifactIds.length > 0 ? resultArtifactIds : sourceArtifactIds;
    const artifactPaths =
      resultArtifactPaths.length > 0
        ? resultArtifactPaths
        : sourceArtifactPaths;

    if (
      !requestedFix &&
      !resultRef &&
      !summaryPreview &&
      artifactIds.length === 0 &&
      artifactPaths.length === 0
    ) {
      return;
    }

    const reviewId =
      readStringField(record, ["reviewId", "review_id"]) ??
      readStringField(metadataRecord, ["reviewId", "review_id"]) ??
      readStringField(reviewRecord, ["reviewId", "review_id", "id"]);
    const workItemId =
      readStringField(record, ["workItemId", "work_item_id"]) ??
      readStringField(record, ["taskId", "task_id"]) ??
      (reviewId
        ? `${reviewId}:requested-fix:${requestedFixIndex}`
        : sourceArtifactId
          ? `${sourceArtifactId}:requested-fix:${requestedFixIndex}`
          : (context.taskId ?? `requested-fix:${requestedFixIndex}`));
    const normalizedWorkItemId = definedString(workItemId);
    if (!normalizedWorkItemId) {
      return;
    }

    events.push({
      ...base,
      sequence:
        typeof context.sequence === "number"
          ? context.sequence + index + 1
          : undefined,
      type: "task.changed",
      taskId: normalizedWorkItemId,
      workItemId: normalizedWorkItemId,
      reviewId: definedString(reviewId),
      artifactId: sourceArtifactId,
      owner: "task",
      scope: "task",
      phase: requestedFixExecutionPhase(executionStatus),
      surface: "work_board",
      persistence: "snapshot",
      control: requestedFixControl(executionStatus),
      topology: "review_team",
      runtimeEntity: "work_item",
      runtimeStatus: requestedFixRuntimeStatus(executionStatus),
      payload: {
        taskEvent: "review_requested_fix",
        executionSource: "artifact_snapshot_metadata",
        requestedFix,
        requestedFixIndex,
        executionStatus,
        regressionOutcome,
        executionSummaryPreview: summaryPreview,
        executionResultRef: resultRef,
        executionArtifactIds: artifactIds,
        executionArtifactPaths: artifactPaths,
        sourceArtifactId,
        sourceArtifactPath,
        metadataKeys: metadataKeys(metadata),
      },
      refs: {
        ...(artifactIds.length > 0 ? { artifactIds } : {}),
        ...(artifactPaths.length > 0 ? { artifactPaths } : {}),
      },
      rawEventRef: sourceArtifactId ?? sourceArtifactPath,
    });
  });

  return events;
}

export function buildAgentUiReviewProjectionEvents(
  input: AgentUiReviewProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const evidenceEvent = buildAgentUiEvidenceChangedEvent(input, context);
  const status = definedString(input.status);
  const reviewId =
    definedString(input.reviewId) ??
    definedString(input.evidenceId) ??
    definedString(input.sessionId ?? context.sessionId ?? undefined);
  const reviewType =
    input.reviewEvent === "requested" ? "review.requested" : "review.completed";
  const phase: AgentUiPhase =
    input.reviewEvent === "requested" && status !== "failed"
      ? "reviewing"
      : normalizeEvidenceProjectionPhase(status);
  const followupActions = truncateStringList(input.followupActions);
  const regressionRequirements = truncateStringList(
    input.regressionRequirements,
  );
  const regressionFailureOutcomes = truncateStringList(
    input.regressionFailureOutcomes,
  );
  const regressionRecoveredOutcomes = truncateStringList(
    input.regressionRecoveredOutcomes,
  );
  const regressionOutcome =
    definedString(input.regressionOutcome) ??
    (regressionFailureOutcomes?.length
      ? "blocking_failure"
      : regressionRecoveredOutcomes?.length
        ? "recovered"
        : undefined);
  const requestedFixes =
    truncateStringList(input.requestedFixes) ?? followupActions;
  const sessionId = definedString(
    input.sessionId ?? context.sessionId ?? undefined,
  );
  const threadId = definedString(
    input.threadId ?? context.threadId ?? undefined,
  );
  const runId = definedString(input.runId ?? context.runId ?? undefined);
  const taskId = definedString(input.taskId ?? context.taskId ?? undefined);
  const reviewer = definedString(input.reviewer);
  const reviewEvent: AgentUiProjectionEvent = {
    type: reviewType,
    sourceType: "evidence_projection",
    sequence:
      typeof context.sequence === "number" ? context.sequence + 1 : undefined,
    timestamp: context.timestamp,
    sessionId,
    threadId,
    runId,
    taskId,
    evidenceId: definedString(input.evidenceId ?? undefined),
    reviewId,
    owner: "evidence",
    scope: "evidence",
    phase,
    surface: "review_lane",
    persistence: "evidence_pack",
    control:
      input.reviewEvent === "requested" ? "request_review" : "open_detail",
    topology: "review_team",
    payload: {
      reviewEvent: input.reviewEvent,
      kind: definedString(input.kind),
      status,
      verdict: definedString(input.verdict),
      decisionStatus: definedString(input.decisionStatus),
      reviewer,
      riskLevel: definedString(input.riskLevel),
      summaryPreview: truncateText(input.summaryPreview),
      itemCount: input.itemCount ?? 0,
      followupActionCount: input.followupActionCount,
      regressionRequirementCount: input.regressionRequirementCount,
      checklistCount: input.checklistCount,
      regressionOutcome,
      regressionFailureOutcomes,
      regressionRecoveredOutcomes,
      requestedFixes,
      followupActions,
      regressionRequirements,
    },
    refs: evidenceEvent.refs,
  };
  const reviewerTeamMemberEvent: AgentUiProjectionEvent | null = reviewer
    ? {
        type: "agent.changed",
        sourceType: "evidence_projection",
        sequence:
          typeof context.sequence === "number"
            ? context.sequence + 2
            : undefined,
        timestamp: context.timestamp,
        sessionId,
        threadId,
        runId,
        taskId,
        evidenceId: definedString(input.evidenceId ?? undefined),
        reviewId,
        workItemId: reviewId,
        agentId: `${reviewId ?? "review"}:reviewer:${reviewer}`,
        agentName: reviewer,
        agentRole: "reviewer",
        owner: "agent",
        scope: "agent",
        phase,
        surface: "team_roster",
        persistence: "snapshot",
        control:
          input.reviewEvent === "requested" ? "request_review" : "open_detail",
        topology: "review_team",
        runtimeEntity: "work_item",
        runtimeStatus:
          input.reviewEvent === "requested"
            ? "waiting"
            : phase === "completed"
              ? "completed"
              : phase === "failed"
                ? "failed"
                : "unknown",
        payload: {
          agentEvent: "reviewer_teammate",
          reviewEvent: input.reviewEvent,
          reviewId,
          reviewer,
          decisionStatus: definedString(input.decisionStatus),
          riskLevel: definedString(input.riskLevel),
        },
        refs: evidenceEvent.refs,
      }
    : null;
  const requestedFixWorkItems: AgentUiProjectionEvent[] =
    input.reviewEvent === "completed"
      ? (requestedFixes ?? []).map((fix, index) => {
          const fixNumber = index + 1;
          const workItemId = `${reviewId ?? "review"}:requested-fix:${fixNumber}`;
          const sequenceOffset = reviewerTeamMemberEvent ? 3 : 2;
          const executionResult = resolveRequestedFixExecutionResult(
            input.requestedFixExecutionResults,
            fix,
            fixNumber,
          );
          const executionStatus = normalizeRequestedFixExecutionStatus(
            executionResult?.executionStatus,
          );
          const fixRegressionOutcome =
            definedString(executionResult?.regressionOutcome) ??
            regressionOutcome;
          const fixArtifactIds = normalizeProjectionIdList(
            executionResult?.artifactIds,
          );
          const fixArtifactPaths = normalizeProjectionIdList(
            executionResult?.artifactPaths,
          );
          return {
            type: "task.changed",
            sourceType: "evidence_projection",
            sequence:
              typeof context.sequence === "number"
                ? context.sequence + sequenceOffset + index
                : undefined,
            timestamp: context.timestamp,
            sessionId,
            threadId,
            runId,
            taskId: workItemId,
            evidenceId: definedString(input.evidenceId ?? undefined),
            reviewId,
            workItemId,
            owner: "task",
            scope: "task",
            phase: requestedFixExecutionPhase(executionStatus),
            surface: "work_board",
            persistence: "snapshot",
            control: requestedFixControl(executionStatus),
            topology: "review_team",
            runtimeEntity: "work_item",
            runtimeStatus: requestedFixRuntimeStatus(executionStatus),
            payload: {
              taskEvent: "review_requested_fix",
              reviewEvent: input.reviewEvent,
              reviewId,
              requestedFix: fix,
              requestedFixIndex: fixNumber,
              requestedFixCount: requestedFixes?.length ?? 0,
              executionStatus,
              regressionOutcome: fixRegressionOutcome,
              regressionFailureOutcomes,
              regressionRecoveredOutcomes,
              regressionRequirements,
              executionSummaryPreview: truncateText(
                executionResult?.summaryPreview,
              ),
              executionResultRef: definedString(executionResult?.resultRef),
              executionArtifactIds: fixArtifactIds,
              executionArtifactPaths: fixArtifactPaths,
            },
            refs: {
              ...(evidenceEvent.refs ?? {}),
              ...(fixArtifactIds.length ? { artifactIds: fixArtifactIds } : {}),
              ...(fixArtifactPaths.length
                ? { artifactPaths: fixArtifactPaths }
                : {}),
            },
          } satisfies AgentUiProjectionEvent;
        })
      : [];

  return [
    evidenceEvent,
    reviewEvent,
    ...(reviewerTeamMemberEvent ? [reviewerTeamMemberEvent] : []),
    ...requestedFixWorkItems,
  ];
}

export function buildAgentUiHandoffProjectionEvents(
  input: AgentUiHandoffProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const evidenceEvent = buildAgentUiEvidenceChangedEvent(input, context);
  const status = definedString(input.status);
  const handoffId =
    definedString(input.handoffId) ??
    definedString(input.evidenceId) ??
    definedString(input.sessionId ?? context.sessionId ?? undefined);

  return [
    evidenceEvent,
    {
      type: "agent.handoff",
      sourceType: "evidence_projection",
      sequence:
        typeof context.sequence === "number" ? context.sequence + 1 : undefined,
      timestamp: context.timestamp,
      sessionId: definedString(
        input.sessionId ?? context.sessionId ?? undefined,
      ),
      threadId: definedString(input.threadId ?? context.threadId ?? undefined),
      runId: definedString(input.runId ?? context.runId ?? undefined),
      taskId: definedString(input.taskId ?? context.taskId ?? undefined),
      evidenceId: definedString(input.evidenceId ?? undefined),
      handoffId,
      owner: "agent",
      scope: "agent",
      phase: normalizeHandoffProjectionPhase(status),
      surface: "handoff_lane",
      persistence: "evidence_pack",
      topology: "specialist_handoff",
      payload: {
        handoffEvent: definedString(input.kind) ?? "analysis_handoff",
        status,
        verdict: definedString(input.verdict),
        from: definedString(input.from),
        to: definedString(input.to),
        reason: definedString(input.reason),
        resumeTarget: definedString(input.resumeTarget),
        contextBoundary: definedString(input.contextBoundary),
        summaryPreview: truncateText(input.summaryPreview),
        itemCount: input.itemCount ?? 0,
      },
      refs: evidenceEvent.refs,
    },
  ];
}
