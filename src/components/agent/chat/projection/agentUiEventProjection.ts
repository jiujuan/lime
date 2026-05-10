import type {
  AgentEvent,
  AgentEventActionRequired,
  AgentEventActionResolved,
  AgentEventArtifactSnapshot,
  AgentEventContextTrace,
  AgentEventQueueAdded,
  AgentEventQueueCleared,
  AgentEventQueueRemoved,
  AgentEventQueueStarted,
  AgentEventRuntimeStatus,
  AgentEventSubagentStatusChanged,
  AgentTokenUsage,
  AgentThreadItem,
  AgentEventToolEnd,
  AgentEventToolInputDelta,
  AgentEventToolOutputDelta,
  AgentEventToolProgress,
  AgentEventToolStart,
} from "@/lib/api/agentProtocol";
import type { AutomationJobRecord } from "@/lib/api/automation";
import { buildAgentUiRemoteTaskProjectionEvents } from "./remoteTaskAgentUiProjection";

export type AgentUiOwner =
  | "runtime"
  | "model"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "context"
  | "policy"
  | "task"
  | "session"
  | "diagnostics"
  | "ui_projection"
  | "unknown"
  | "agent"
  | "team";

export type AgentUiScope =
  | "application"
  | "workspace"
  | "session"
  | "thread"
  | "run"
  | "turn"
  | "message"
  | "part"
  | "task"
  | "agent"
  | "tool_call"
  | "action_request"
  | "artifact"
  | "evidence"
  | "unknown"
  | "team";

export type AgentUiPhase =
  | "draft"
  | "submitted"
  | "accepted"
  | "routing"
  | "preparing"
  | "planning"
  | "reasoning"
  | "acting"
  | "waiting"
  | "producing"
  | "reconciling"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "archived"
  | "hydrating"
  | "unknown"
  | "reviewing";

export type AgentUiSurface =
  | "composer"
  | "conversation"
  | "inline_process"
  | "runtime_status"
  | "tool_ui"
  | "hitl"
  | "task_capsule"
  | "artifact_workspace"
  | "timeline_evidence"
  | "session_tabs"
  | "diagnostics"
  | "custom"
  | "unknown"
  | "team_roster"
  | "work_board"
  | "delegation_graph"
  | "handoff_lane"
  | "worker_notifications"
  | "review_lane"
  | "teammate_transcript"
  | "background_teammate"
  | "remote_teammate"
  | "team_policy";

export type AgentUiPersistence =
  | "ephemeral_live"
  | "transcript"
  | "snapshot"
  | "archive"
  | "artifact_store"
  | "evidence_pack"
  | "diagnostics_log"
  | "ui_local"
  | "unknown";

export type AgentUiControl =
  | "send"
  | "queue"
  | "steer"
  | "interrupt"
  | "approve"
  | "reject"
  | "answer"
  | "edit"
  | "retry"
  | "rollback"
  | "remove"
  | "export"
  | "open_detail"
  | "none"
  | "unknown"
  | "delegate"
  | "assign"
  | "continue_agent"
  | "wait"
  | "stop"
  | "close"
  | "request_review";

export type AgentUiEventClass =
  | "session.opened"
  | "session.hydrated"
  | "session.updated"
  | "session.closed"
  | "run.started"
  | "run.status"
  | "run.finished"
  | "run.failed"
  | "plan.delta"
  | "plan.final"
  | "text.delta"
  | "text.final"
  | "reasoning.delta"
  | "reasoning.summary"
  | "tool.started"
  | "tool.args"
  | "tool.args.delta"
  | "tool.progress"
  | "tool.output.delta"
  | "tool.result"
  | "tool.failed"
  | "action.required"
  | "action.resolved"
  | "queue.changed"
  | "task.changed"
  | "agent.changed"
  | "context.changed"
  | "context.compaction.started"
  | "context.compaction.completed"
  | "permission.changed"
  | "artifact.created"
  | "artifact.updated"
  | "artifact.preview.ready"
  | "artifact.version.created"
  | "artifact.diff.ready"
  | "artifact.export.started"
  | "artifact.export.completed"
  | "artifact.failed"
  | "artifact.deleted"
  | "artifact.changed"
  | "evidence.changed"
  | "state.snapshot"
  | "state.delta"
  | "messages.snapshot"
  | "diagnostic.changed"
  | "metric.changed"
  | "agent.spawned"
  | "agent.completed"
  | "agent.handoff"
  | "team.changed"
  | "worker.notification"
  | "review.requested"
  | "review.completed";

export type AgentUiRuntimeEntity =
  | "agent_turn"
  | "subagent_turn"
  | "automation_job"
  | "external_task"
  | "work_item"
  | "unknown";

export type AgentUiTopology =
  | "solo_run"
  | "coordinator_team"
  | "parallel_workers"
  | "specialist_handoff"
  | "review_team"
  | "human_agent_board"
  | "background_teammate"
  | "remote_teammate"
  | "unknown";

export type AgentUiRuntimeStatus =
  | "idle"
  | "queued"
  | "submitted"
  | "accepted"
  | "preparing"
  | "running"
  | "waiting"
  | "needs_input"
  | "plan_ready"
  | "completed"
  | "failed"
  | "aborted"
  | "cancelled"
  | "closed"
  | "not_found"
  | "unknown";

export interface AgentUiProjectionRefs {
  artifactIds?: string[];
  artifactPaths?: string[];
  contextSourceIds?: string[];
  teamMemoryKeys?: string[];
  diagnosticKeys?: string[];
  rawEventRef?: string;
}

export type AgentUiProjectionSourceType =
  | AgentEvent["type"]
  | "automation_job_projection"
  | "evidence_projection"
  | "hydration_projection"
  | "remote_task_projection"
  | "team_formation_projection"
  | "team_control_projection"
  | "performance_metric";

export interface AgentUiProjectionEvent {
  type: AgentUiEventClass;
  sourceType: AgentUiProjectionSourceType;
  sequence?: number;
  timestamp?: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  messageId?: string;
  partId?: string;
  taskId?: string;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
  agentId?: string;
  diagnosticId?: string;
  owner: AgentUiOwner;
  scope: AgentUiScope;
  phase: AgentUiPhase;
  surface?: AgentUiSurface;
  persistence?: AgentUiPersistence;
  control?: AgentUiControl;
  parentSessionId?: string;
  parentThreadId?: string;
  agentName?: string;
  teamName?: string;
  teamId?: string;
  agentRole?: string;
  agentSource?: string;
  workerNotificationId?: string;
  remoteTaskId?: string;
  transcriptRef?: string;
  topology?: AgentUiTopology;
  runtimeEntity?: AgentUiRuntimeEntity;
  runtimeStatus?: AgentUiRuntimeStatus;
  latestTurnStatus?: AgentUiRuntimeStatus;
  teamPhase?: string;
  teamParallelBudget?: number;
  teamActiveCount?: number;
  teamQueuedCount?: number;
  queuedTurnCount?: number;
  queueReason?: string;
  providerConcurrencyGroup?: string;
  providerParallelBudget?: number;
  retryableOverload?: boolean;
  workItemId?: string;
  reviewId?: string;
  handoffId?: string;
  workerUsage?: Record<string, unknown> | null;
  teamPolicy?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  refs?: AgentUiProjectionRefs;
  rawEventRef?: string;
}

export interface AgentUiProjectionContext {
  sequence?: number;
  timestamp?: string;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  messageId?: string | null;
  taskId?: string | null;
  runtimeEntity?: AgentUiRuntimeEntity | null;
}

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

export interface AgentUiReviewProjectionInput extends AgentUiEvidenceProjectionInput {
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

export interface AgentUiHandoffProjectionInput extends AgentUiEvidenceProjectionInput {
  handoffId?: string | null;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  resumeTarget?: string | null;
  contextBoundary?: string | null;
}

export interface AgentUiMetricProjectionInput {
  phase: string;
  at: number;
  wallTime: number;
  sessionId?: string | null;
  workspaceId?: string | null;
  source?: string | null;
  requestId?: string | null;
  actualSessionId?: string | null;
  metrics: Record<string, string | number | boolean | null>;
}

export type AgentUiAutomationJobProjectionEvent =
  | "loaded"
  | "created"
  | "updated"
  | "started"
  | "completed"
  | "failed"
  | "deleted";

type AutomationJobProjectionRecord = Partial<AutomationJobRecord> &
  Pick<AutomationJobRecord, "id" | "name">;

export interface AgentUiAutomationJobProjectionInput {
  event: AgentUiAutomationJobProjectionEvent;
  job: AutomationJobProjectionRecord;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  timestamp?: string | null;
}

export type AgentUiTeamControlProjectionAction =
  | "assign"
  | "close"
  | "close_completed"
  | "delegate"
  | "reassign"
  | "request_review"
  | "resume"
  | "send_input"
  | "stop"
  | "wait";

export interface AgentUiTeamControlProjectionInput {
  action: AgentUiTeamControlProjectionAction;
  sessionId?: string | null;
  requestedSessionIds: string[];
  affectedSessionIds?: string[];
  cascadeSessionIds?: string[];
  resolvedSessionId?: string | null;
  resolvedStatus?: string | null;
  timedOut?: boolean;
  messagePreview?: string | null;
  runtimeEntity?: AgentUiRuntimeEntity | null;
  workItemId?: string | null;
  reviewId?: string | null;
  previousAssigneeId?: string | null;
  nextAssigneeId?: string | null;
  reassignmentReason?: string | null;
  timestamp?: string | null;
}

export type AgentUiRemoteTeammateProjectionEvent =
  | "created"
  | "updated"
  | "needs_input"
  | "auth_required"
  | "artifact_updated"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentUiRemoteTeammateProjectionInput {
  event: AgentUiRemoteTeammateProjectionEvent;
  remoteTaskId: string;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agentCardId?: string | null;
  agentCardUrl?: string | null;
  provider?: string | null;
  status?: string | null;
  summaryPreview?: string | null;
  inputRequired?: boolean;
  authRequired?: boolean;
  artifactIds?: string[];
  artifactPaths?: string[];
  timestamp?: string | null;
}

const TEXT_PREVIEW_LIMIT = 240;

function definedString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function truncateText(value: string | null | undefined): string | undefined {
  const trimmed = definedString(value);
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= TEXT_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, TEXT_PREVIEW_LIMIT).trim()}...`;
}

function truncateStringList(
  values: string[] | undefined,
): string[] | undefined {
  const normalized = Array.from(
    new Set(
      (values ?? [])
        .map((value) => truncateText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function metadataKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>).sort();
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const normalized = definedString(value);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function readStringArrayField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const values = readStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function readBooleanField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readNumberField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

const AGENT_UI_RUNTIME_ENTITIES = new Set<AgentUiRuntimeEntity>([
  "agent_turn",
  "subagent_turn",
  "automation_job",
  "external_task",
  "work_item",
  "unknown",
]);

function normalizeRuntimeEntity(
  value: AgentUiRuntimeEntity | string | null | undefined,
): AgentUiRuntimeEntity | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return AGENT_UI_RUNTIME_ENTITIES.has(value as AgentUiRuntimeEntity)
    ? (value as AgentUiRuntimeEntity)
    : undefined;
}

function inferRuntimeEntityFromContext(
  event: AgentEvent,
  context: AgentUiProjectionContext,
): AgentUiRuntimeEntity {
  const explicit = normalizeRuntimeEntity(context.runtimeEntity);
  if (explicit) {
    return explicit;
  }
  if (event.type === "subagent_status_changed") {
    return "subagent_turn";
  }
  if (
    (event.type === "item_started" ||
      event.type === "item_updated" ||
      event.type === "item_completed") &&
    "item" in event &&
    event.item.type === "subagent_activity"
  ) {
    return "subagent_turn";
  }
  if (context.runId?.startsWith("agent_subagent_stream:")) {
    return "subagent_turn";
  }
  return "agent_turn";
}

function normalizeRuntimeStatusFromPhase(
  phase: AgentEventRuntimeStatus["status"]["phase"],
): AgentUiRuntimeStatus {
  switch (phase) {
    case "permission_review":
      return "waiting";
    case "failed":
      return "failed";
    case "context":
    case "preparing":
    case "routing":
    default:
      return "preparing";
  }
}

function normalizeSubagentRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus {
  switch (status) {
    case "idle":
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "aborted":
    case "closed":
    case "not_found":
      return status;
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function subagentStatusPhase(status: string | null | undefined): AgentUiPhase {
  switch (status) {
    case "completed":
    case "closed":
      return "completed";
    case "failed":
    case "not_found":
      return "failed";
    case "aborted":
    case "cancelled":
      return "cancelled";
    case "running":
      return "acting";
    case "queued":
      return "waiting";
    default:
      return "waiting";
  }
}

function subagentStatusControl(
  status: string | null | undefined,
): AgentUiControl | undefined {
  switch (status) {
    case "idle":
      return "continue_agent";
    case "queued":
      return "wait";
    case "running":
      return "stop";
    case "completed":
    case "failed":
    case "aborted":
    case "closed":
    case "not_found":
      return "close";
    default:
      return undefined;
  }
}

function isSubagentSpawnStatus(status: string | null | undefined): boolean {
  return status === "idle" || status === "queued" || status === "running";
}

function isSubagentTerminalStatus(status: string | null | undefined): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "aborted" ||
    status === "closed" ||
    status === "not_found"
  );
}

function hasTeamRuntimeMetadata(
  metadata: AgentEventRuntimeStatus["status"]["metadata"],
): boolean {
  if (!metadata) {
    return false;
  }
  return Boolean(
    definedString(metadata.team_phase) ||
    definedString(metadata.concurrency_phase) ||
    definedString(metadata.concurrency_scope) ||
    typeof metadata.team_parallel_budget === "number" ||
    typeof metadata.team_active_count === "number" ||
    typeof metadata.team_queued_count === "number" ||
    typeof metadata.concurrency_active_count === "number" ||
    typeof metadata.concurrency_queued_count === "number" ||
    typeof metadata.concurrency_budget === "number" ||
    definedString(metadata.provider_concurrency_group) ||
    typeof metadata.provider_parallel_budget === "number" ||
    definedString(metadata.queue_reason) ||
    typeof metadata.retryable_overload === "boolean",
  );
}

function normalizeTeamRuntimePhase(
  event: AgentEventRuntimeStatus,
): AgentUiPhase {
  const metadata = event.status.metadata;
  const teamPhase = definedString(metadata?.team_phase);
  const concurrencyPhase = definedString(metadata?.concurrency_phase);
  const phase = teamPhase ?? concurrencyPhase;
  switch (phase) {
    case "completed":
    case "done":
    case "idle":
      return "completed";
    case "failed":
    case "blocked":
      return "failed";
    case "queued":
    case "waiting":
      return "waiting";
    case "running":
    case "active":
      return "acting";
    default:
      return normalizeRuntimePhase(event);
  }
}

function buildTeamRuntimeFacts(
  metadata: AgentEventRuntimeStatus["status"]["metadata"],
): Pick<
  AgentUiProjectionEvent,
  | "teamPhase"
  | "teamParallelBudget"
  | "teamActiveCount"
  | "teamQueuedCount"
  | "queuedTurnCount"
  | "providerConcurrencyGroup"
  | "providerParallelBudget"
  | "queueReason"
  | "retryableOverload"
> {
  return {
    teamPhase: definedString(
      metadata?.team_phase ?? metadata?.concurrency_phase,
    ),
    teamParallelBudget:
      metadata?.team_parallel_budget ?? metadata?.concurrency_budget,
    teamActiveCount:
      metadata?.team_active_count ?? metadata?.concurrency_active_count,
    teamQueuedCount:
      metadata?.team_queued_count ?? metadata?.concurrency_queued_count,
    queuedTurnCount:
      metadata?.team_queued_count ?? metadata?.concurrency_queued_count,
    providerConcurrencyGroup: definedString(
      metadata?.provider_concurrency_group,
    ),
    providerParallelBudget: metadata?.provider_parallel_budget,
    queueReason: definedString(metadata?.queue_reason),
    retryableOverload: metadata?.retryable_overload,
  };
}

function buildSubagentRuntimeFacts(
  event: AgentEventSubagentStatusChanged,
): Pick<
  AgentUiProjectionEvent,
  | "runtimeEntity"
  | "runtimeStatus"
  | "latestTurnStatus"
  | "teamPhase"
  | "teamParallelBudget"
  | "teamActiveCount"
  | "teamQueuedCount"
  | "queuedTurnCount"
  | "providerConcurrencyGroup"
  | "providerParallelBudget"
  | "queueReason"
  | "retryableOverload"
> {
  return {
    runtimeEntity: "subagent_turn",
    runtimeStatus: normalizeSubagentRuntimeStatus(event.status),
    latestTurnStatus: event.latest_turn_status
      ? normalizeSubagentRuntimeStatus(event.latest_turn_status)
      : undefined,
    teamPhase: definedString(event.team_phase),
    teamParallelBudget: event.team_parallel_budget,
    teamActiveCount: event.team_active_count,
    teamQueuedCount: event.team_queued_count,
    queuedTurnCount: event.queued_turn_count,
    providerConcurrencyGroup: definedString(event.provider_concurrency_group),
    providerParallelBudget: event.provider_parallel_budget,
    queueReason: definedString(event.queue_reason),
    retryableOverload: event.retryable_overload,
  };
}

function buildSubagentProjectionPayload(
  event: AgentEventSubagentStatusChanged,
): Record<string, unknown> {
  return compactProjectionFields({
    status: event.status,
    childSessionId: event.session_id,
    parentSessionId: event.parent_session_id,
    latestTurnId: event.latest_turn_id,
    latestTurnStatus: event.latest_turn_status,
    queuedTurnCount: event.queued_turn_count,
    teamPhase: event.team_phase,
    teamParallelBudget: event.team_parallel_budget,
    teamActiveCount: event.team_active_count,
    teamQueuedCount: event.team_queued_count,
    providerConcurrencyGroup: event.provider_concurrency_group,
    providerParallelBudget: event.provider_parallel_budget,
    queueReason: event.queue_reason,
    retryableOverload: event.retryable_overload,
    closed: event.closed,
  });
}

function buildWorkerUsageProjection(
  usage: AgentTokenUsage | undefined,
): Record<string, unknown> | undefined {
  if (!usage) {
    return undefined;
  }

  return compactProjectionFields({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  });
}

function compactProjectionFields<T extends Record<string, unknown>>(
  value: T,
): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function resolveTeamTopology(
  facts: Pick<
    AgentUiProjectionEvent,
    "teamParallelBudget" | "teamActiveCount" | "teamQueuedCount"
  >,
): AgentUiTopology {
  if (
    (facts.teamParallelBudget ?? 0) > 1 ||
    (facts.teamActiveCount ?? 0) > 1 ||
    (facts.teamQueuedCount ?? 0) > 0
  ) {
    return "parallel_workers";
  }
  return "coordinator_team";
}

function extractArtifactRefs(metadata: unknown): AgentUiProjectionRefs {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const record = metadata as Record<string, unknown>;
  const artifactIds = [
    ...readStringArray(record.artifact_id),
    ...readStringArray(record.artifactId),
    ...readStringArray(record.artifact_ids),
    ...readStringArray(record.artifactIds),
  ];
  const artifactPaths = [
    ...readStringArray(record.artifact_path),
    ...readStringArray(record.artifactPath),
    ...readStringArray(record.artifact_paths),
    ...readStringArray(record.artifactPaths),
    ...readStringArray(record.file_path),
    ...readStringArray(record.filePath),
  ];
  return {
    ...(artifactIds.length > 0
      ? { artifactIds: [...new Set(artifactIds)] }
      : {}),
    ...(artifactPaths.length > 0
      ? { artifactPaths: [...new Set(artifactPaths)] }
      : {}),
  };
}

interface PlanApprovalProjection {
  requestId: string;
  from?: string;
  planFilePath?: string;
  planContent?: string;
  timestamp?: string;
  deliveryTarget?: string;
  deliverySubmissionId?: string;
  awaitingLeaderApproval?: boolean;
}

interface PlanApprovalResponseProjection {
  requestId: string;
  approved?: boolean;
  feedback?: string;
  permissionMode?: string;
  timestamp?: string;
  targetSessionId?: string;
  deliveryTarget?: string;
  deliverySubmissionId?: string;
}

function extractPlanApprovalProjection(
  metadata: unknown,
): PlanApprovalProjection | null {
  const record = readRecord(metadata);
  const requestRecord = readRecord(record?.plan_approval_request);
  if (!requestRecord) {
    return null;
  }

  const requestId =
    readStringField(requestRecord, ["request_id", "requestId", "id"]) ??
    readStringField(record, ["pending_request_id", "pendingRequestId"]);
  if (!requestId) {
    return null;
  }

  const deliveryRecord = readRecord(record?.plan_approval_delivery);
  return {
    requestId,
    from: readStringField(requestRecord, ["from", "sender", "agent"]),
    planFilePath: readStringField(requestRecord, [
      "plan_file_path",
      "planFilePath",
    ]),
    planContent: readStringField(requestRecord, [
      "plan_content",
      "planContent",
    ]),
    timestamp: readStringField(requestRecord, ["timestamp", "created_at"]),
    deliveryTarget: readStringField(deliveryRecord, ["target"]),
    deliverySubmissionId: readStringField(deliveryRecord, [
      "submission_id",
      "submissionId",
    ]),
    awaitingLeaderApproval:
      readBooleanField(record, ["awaiting_leader_approval"]) ?? true,
  };
}

function extractPlanApprovalResponseProjection(
  metadata: unknown,
): PlanApprovalResponseProjection | null {
  const record = readRecord(metadata);
  const sendMessageRecord = readRecord(record?.send_message);
  const deliveryRecord = readRecord(record?.plan_approval_delivery);
  const deliveryExtraRecord = readRecord(deliveryRecord?.extra);
  const responseRecord =
    readRecord(record?.plan_approval_response) ??
    readRecord(sendMessageRecord?.plan_approval_response) ??
    readRecord(deliveryExtraRecord?.plan_approval_response);
  if (!responseRecord) {
    return null;
  }

  const requestId =
    readStringField(responseRecord, ["request_id", "requestId", "id"]) ??
    readStringField(sendMessageRecord, ["request_id", "requestId"]);
  if (!requestId) {
    return null;
  }

  return {
    requestId,
    approved: readBooleanField(responseRecord, ["approved", "approve"]),
    feedback: readStringField(responseRecord, ["feedback", "reason"]),
    permissionMode: readStringField(responseRecord, [
      "permission_mode",
      "permissionMode",
    ]),
    timestamp: readStringField(responseRecord, ["timestamp", "created_at"]),
    targetSessionId: readStringField(responseRecord, [
      "target_session_id",
      "targetSessionId",
    ]),
    deliveryTarget:
      readStringField(responseRecord, ["delivery_target", "deliveryTarget"]) ??
      readStringField(sendMessageRecord, ["target"]),
    deliverySubmissionId:
      readStringField(responseRecord, [
        "delivery_submission_id",
        "deliverySubmissionId",
        "submission_id",
        "submissionId",
      ]) ?? readStringField(deliveryRecord, ["submission_id", "submissionId"]),
  };
}

function buildPlanApprovalRequiredEvent(params: {
  base: Pick<
    AgentUiProjectionEvent,
    | "sourceType"
    | "timestamp"
    | "sessionId"
    | "threadId"
    | "runId"
    | "turnId"
    | "messageId"
    | "taskId"
    | "partId"
    | "runtimeEntity"
  >;
  projection: PlanApprovalProjection;
  persistence: AgentUiPersistence;
  toolCallId?: string;
}): AgentUiProjectionEvent {
  const { base, projection, persistence, toolCallId } = params;
  return {
    ...base,
    type: "action.required",
    actionId: projection.requestId,
    ...(toolCallId ? { toolCallId } : {}),
    owner: "action",
    scope: "action_request",
    phase: "waiting",
    surface: "hitl",
    persistence,
    control: "approve",
    payload: {
      actionType: "plan_approval",
      decisionKind: "plan_approval_request",
      from: projection.from,
      planFilePath: projection.planFilePath,
      planContentPreview: truncateText(projection.planContent),
      planContentLength: projection.planContent?.length ?? 0,
      timestamp: projection.timestamp,
      deliveryTarget: projection.deliveryTarget,
      deliverySubmissionId: projection.deliverySubmissionId,
      awaitingLeaderApproval: projection.awaitingLeaderApproval,
    },
  };
}

function buildPlanApprovalResolvedEvent(params: {
  base: Pick<
    AgentUiProjectionEvent,
    | "sourceType"
    | "timestamp"
    | "sessionId"
    | "threadId"
    | "runId"
    | "turnId"
    | "messageId"
    | "taskId"
    | "partId"
    | "runtimeEntity"
  >;
  projection: PlanApprovalResponseProjection;
  persistence: AgentUiPersistence;
  toolCallId?: string;
}): AgentUiProjectionEvent {
  const { base, projection, persistence, toolCallId } = params;
  return {
    ...base,
    type: "action.resolved",
    actionId: projection.requestId,
    ...(toolCallId ? { toolCallId } : {}),
    owner: "action",
    scope: "action_request",
    phase: "completed",
    surface: "hitl",
    persistence,
    control: projection.approved === false ? "reject" : "approve",
    payload: {
      actionType: "plan_approval",
      decisionKind: "plan_approval_response",
      approved: projection.approved,
      feedbackPreview: truncateText(projection.feedback),
      permissionMode: projection.permissionMode,
      timestamp: projection.timestamp,
      targetSessionId: projection.targetSessionId,
      deliveryTarget: projection.deliveryTarget,
      deliverySubmissionId: projection.deliverySubmissionId,
    },
  };
}

function normalizeRuntimePhase(event: AgentEventRuntimeStatus): AgentUiPhase {
  switch (event.status.phase) {
    case "routing":
      return "routing";
    case "context":
      return "preparing";
    case "permission_review":
      return "waiting";
    case "failed":
      return "failed";
    case "preparing":
    default:
      return "preparing";
  }
}

function hasPermissionProjectionMetadata(
  metadata: AgentEventRuntimeStatus["status"]["metadata"],
): boolean {
  if (!metadata) {
    return false;
  }
  return Boolean(
    definedString(metadata.permission_status) ||
    definedString(metadata.confirmation_status) ||
    definedString(metadata.confirmation_request_id) ||
    definedString(metadata.confirmation_source) ||
    definedString(metadata.decision_source) ||
    definedString(metadata.decision_scope) ||
    readStringArray(metadata.required_profile_keys).length > 0 ||
    readStringArray(metadata.ask_profile_keys).length > 0 ||
    readStringArray(metadata.blocking_profile_keys).length > 0 ||
    typeof metadata.declared_only === "boolean" ||
    typeof metadata.turn_gating === "boolean",
  );
}

function normalizePermissionPhase(
  event: AgentEventRuntimeStatus,
): AgentUiPhase {
  const metadata = event.status.metadata;
  const permissionStatus = definedString(metadata?.permission_status);
  const confirmationStatus = definedString(metadata?.confirmation_status);

  if (
    permissionStatus === "blocked" ||
    permissionStatus === "denied" ||
    confirmationStatus === "denied"
  ) {
    return "failed";
  }

  if (
    event.status.phase === "permission_review" ||
    confirmationStatus === "not_requested" ||
    definedString(metadata?.confirmation_request_id) ||
    readStringArray(metadata?.ask_profile_keys).length > 0 ||
    readStringArray(metadata?.blocking_profile_keys).length > 0
  ) {
    return "waiting";
  }

  if (
    permissionStatus === "not_required" ||
    permissionStatus === "granted" ||
    permissionStatus === "approved" ||
    confirmationStatus === "resolved"
  ) {
    return "completed";
  }

  return normalizeRuntimePhase(event);
}

function buildPermissionChangedEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const metadata = event.status.metadata;
  if (!hasPermissionProjectionMetadata(metadata)) {
    return null;
  }

  const confirmationRequestId = definedString(
    metadata?.confirmation_request_id,
  );
  const requiredProfileKeys = readStringArray(metadata?.required_profile_keys);
  const askProfileKeys = readStringArray(metadata?.ask_profile_keys);
  const blockingProfileKeys = readStringArray(metadata?.blocking_profile_keys);
  const requiresHumanControl =
    event.status.phase === "permission_review" ||
    Boolean(confirmationRequestId) ||
    askProfileKeys.length > 0 ||
    blockingProfileKeys.length > 0;

  return {
    ...buildBase(event, context),
    type: "permission.changed",
    actionId: confirmationRequestId,
    owner: "policy",
    scope: "run",
    phase: normalizePermissionPhase(event),
    surface: requiresHumanControl ? "hitl" : "runtime_status",
    persistence: "snapshot",
    control: confirmationRequestId ? "approve" : undefined,
    payload: {
      permissionStatus: definedString(metadata?.permission_status),
      confirmationStatus: definedString(metadata?.confirmation_status),
      confirmationRequestId,
      confirmationSource: definedString(metadata?.confirmation_source),
      decisionSource: definedString(metadata?.decision_source),
      decisionScope: definedString(metadata?.decision_scope),
      requiredProfileKeys,
      askProfileKeys,
      blockingProfileKeys,
      declaredOnly: metadata?.declared_only,
      turnGating: metadata?.turn_gating,
      sourcePhase: event.status.phase,
    },
  };
}

function buildTeamChangedFromRuntimeStatusEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const metadata = event.status.metadata;
  if (!hasTeamRuntimeMetadata(metadata)) {
    return null;
  }

  const facts = compactProjectionFields(buildTeamRuntimeFacts(metadata));
  const runtimeStatus = normalizeRuntimeStatusFromPhase(event.status.phase);

  return {
    ...buildBase(event, context),
    type: "team.changed",
    owner: "team",
    scope: "team",
    phase: normalizeTeamRuntimePhase(event),
    surface: "team_roster",
    persistence: "snapshot",
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    topology: resolveTeamTopology(facts),
    ...facts,
    payload: {
      teamEvent: "runtime_status_changed",
      sourcePhase: event.status.phase,
      title: event.status.title,
      detailPreview: truncateText(event.status.detail),
      concurrencyPhase: definedString(metadata?.concurrency_phase),
      concurrencyScope: definedString(metadata?.concurrency_scope),
    },
  };
}

function resolveSubagentStatusHandoffStatus(
  event: AgentEventSubagentStatusChanged,
): string | null {
  if (!definedString(event.parent_session_id)) {
    return null;
  }

  switch (event.status) {
    case "running":
      return "accepted";
    case "queued":
    case "idle":
      return "handoff_requested";
    case "completed":
      return "returned";
    case "failed":
    case "not_found":
      return "failed";
    case "aborted":
    case "closed":
      return "cancelled";
    default:
      return null;
  }
}

function buildSubagentStatusChangedEvents(
  event: AgentEventSubagentStatusChanged,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const facts = compactProjectionFields(buildSubagentRuntimeFacts(event));
  const phase = subagentStatusPhase(event.status);
  const topology = resolveTeamTopology(facts);
  const payload = buildSubagentProjectionPayload(event);
  const transcriptRef = event.latest_turn_id
    ? `${event.session_id}:${event.latest_turn_id}`
    : event.session_id;
  const handoffStatus = resolveSubagentStatusHandoffStatus(event);
  const shared = {
    ...base,
    sessionId: event.root_session_id,
    taskId: event.session_id,
    agentId: event.session_id,
    parentSessionId: event.parent_session_id,
    topology,
    ...facts,
  };
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: {
        agentEvent: "subagent_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase,
      surface: "task_capsule",
      persistence: "snapshot",
      control: subagentStatusControl(event.status),
      payload: {
        taskEvent: "subagent_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "team.changed",
      owner: "team",
      scope: "team",
      phase,
      surface: "team_roster",
      persistence: "snapshot",
      payload: {
        teamEvent: "teammate_status_changed",
        ...payload,
      },
    },
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "teammate_transcript",
      persistence: "snapshot",
      control: "open_detail",
      transcriptRef,
      payload: {
        agentEvent: "teammate_transcript_ref",
        transcriptRef,
        ...payload,
      },
    },
  ];

  if (isSubagentSpawnStatus(event.status)) {
    events.push({
      ...shared,
      type: "agent.spawned",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "delegation_graph",
      persistence: "snapshot",
      control: "delegate",
      payload: {
        agentEvent: "subagent_active",
        spawnSource: "subagent_status_changed",
        ...payload,
      },
    });
  }

  if (isSubagentTerminalStatus(event.status)) {
    const terminalEvent =
      event.status === "completed" ? "worker_completed" : "worker_stopped";
    const workerUsage = buildWorkerUsageProjection(event.usage);
    const workerPayload = compactProjectionFields({
      transcriptRef,
      workerUsage,
      durationMs: event.duration_ms,
      toolCount: event.tool_count,
      resultRef: definedString(event.result_ref),
    });
    events.push(
      {
        ...shared,
        type: "agent.completed",
        owner: "agent",
        scope: "agent",
        phase,
        surface: "delegation_graph",
        persistence: "archive",
        payload: {
          agentEvent: terminalEvent,
          ...payload,
        },
      },
      {
        ...shared,
        type: "worker.notification",
        workerNotificationId: `${event.session_id}:${event.status}`,
        transcriptRef,
        ...(workerUsage ? { workerUsage } : {}),
        owner: "agent",
        scope: "agent",
        phase,
        surface: "worker_notifications",
        persistence: "archive",
        payload: {
          notificationKind: terminalEvent,
          ...payload,
          ...workerPayload,
        },
      },
    );
  }

  if (handoffStatus) {
    const parentSessionId = definedString(event.parent_session_id);
    const resultRef = definedString(event.result_ref);
    events.push({
      ...shared,
      type: "agent.handoff",
      handoffId: `${parentSessionId}:handoff:${event.session_id}`,
      transcriptRef,
      owner: "agent",
      scope: "agent",
      phase: normalizeHandoffProjectionPhase(handoffStatus),
      surface: "handoff_lane",
      persistence: isSubagentTerminalStatus(event.status)
        ? "archive"
        : "snapshot",
      control: "open_detail",
      topology: "specialist_handoff",
      payload: compactProjectionFields({
        handoffEvent: "specialist_handoff",
        status: handoffStatus,
        sourceStatus: event.status,
        from: parentSessionId,
        to: event.session_id,
        reason: "subagent_status_changed",
        resumeTarget: `agent-runtime://session/${event.session_id}`,
        contextBoundary: "subagent_session",
        transcriptRef,
        latestTurnId: event.latest_turn_id,
        resultRef,
      }),
    });
  }

  return events;
}

function actionControl(
  event: AgentEventActionRequired,
): AgentUiControl | undefined {
  if (event.action_type === "ask_user" || event.action_type === "elicitation") {
    return "answer";
  }
  if (event.action_type === "tool_confirmation") {
    return "approve";
  }
  return undefined;
}

function resolvedActionControl(
  event: AgentEventActionResolved,
): AgentUiControl | undefined {
  if (event.action_type === "ask_user" || event.action_type === "elicitation") {
    return "answer";
  }
  if (event.action_type === "plan_approval") {
    return event.approved === false ? "reject" : "approve";
  }
  if (event.action_type === "tool_confirmation") {
    return event.approved === false ? "reject" : "approve";
  }
  return undefined;
}

function buildBase(
  event: AgentEvent,
  context: AgentUiProjectionContext,
): Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "taskId"
  | "runtimeEntity"
> {
  return {
    sourceType: event.type,
    timestamp: context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: definedString(context.turnId ?? undefined),
    messageId: definedString(context.messageId ?? undefined),
    taskId: definedString(context.taskId ?? undefined),
    runtimeEntity: inferRuntimeEntityFromContext(event, context),
  };
}

function sequenceEvents(
  events: AgentUiProjectionEvent[],
  startSequence: number | undefined,
): AgentUiProjectionEvent[] {
  if (typeof startSequence !== "number") {
    return events;
  }
  return events.map((event, index) => ({
    ...event,
    sequence: startSequence + index,
  }));
}

function buildToolStartEvents(
  event: AgentEventToolStart,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const inputSummary = truncateText(event.arguments);
  const inputAvailable = Boolean(inputSummary);
  const shared = {
    ...base,
    toolCallId: event.tool_id,
    owner: "tool" as const,
    scope: "tool_call" as const,
    phase: "acting" as const,
    surface: "tool_ui" as const,
    persistence: "ephemeral_live" as const,
  };

  return [
    {
      ...shared,
      type: "tool.started",
      payload: {
        toolName: event.tool_name,
      },
    },
    {
      ...shared,
      type: "tool.args",
      payload: {
        toolName: event.tool_name,
        inputAvailable,
        inputSummary,
        inputLength: event.arguments?.length ?? 0,
      },
    },
  ];
}

function buildToolEndEvent(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const success = event.result.success !== false;
  const metadataKeyList = metadataKeys(event.result.metadata);
  const refs = extractArtifactRefs(event.result.metadata);
  return {
    ...buildBase(event, context),
    type: success ? "tool.result" : "tool.failed",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: success ? "completed" : "failed",
    surface: "tool_ui",
    persistence: "archive",
    payload: {
      success,
      outputPreview: truncateText(event.result.output),
      errorPreview: truncateText(event.result.error),
      outputLength: event.result.output?.length ?? 0,
      hasImages: Boolean(event.result.images?.length),
      metadataKeys: metadataKeyList,
    },
    refs: {
      ...refs,
      ...(metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : {}),
    },
  };
}

function buildToolEndEvents(
  event: AgentEventToolEnd,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const resultEvent = buildToolEndEvent(event, context);
  const planApproval = extractPlanApprovalProjection(event.result.metadata);
  const planApprovalResponse = extractPlanApprovalResponseProjection(
    event.result.metadata,
  );
  const events = [resultEvent];

  if (planApproval) {
    events.push(
      buildPlanApprovalRequiredEvent({
        base: buildBase(event, context),
        projection: planApproval,
        persistence: "snapshot",
        toolCallId: event.tool_id,
      }),
    );
  }

  if (planApprovalResponse) {
    events.push(
      buildPlanApprovalResolvedEvent({
        base: buildBase(event, context),
        projection: planApprovalResponse,
        persistence: "snapshot",
        toolCallId: event.tool_id,
      }),
    );
  }

  return events;
}

function buildToolProgressEvent(
  event: AgentEventToolProgress,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(event.progress.metadata);
  return {
    ...buildBase(event, context),
    type: "tool.progress",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      messagePreview: truncateText(event.progress.message),
      progress: event.progress.progress,
      total: event.progress.total,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

function buildToolOutputDeltaEvent(
  event: AgentEventToolOutputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadataKeyList = metadataKeys(event.metadata);
  return {
    ...buildBase(event, context),
    type: "tool.output.delta",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      outputKind: event.output_kind,
      deltaPreview: truncateText(event.delta),
      deltaLength: event.delta.length,
      metadataKeys: metadataKeyList,
    },
    refs:
      metadataKeyList.length > 0
        ? { diagnosticKeys: metadataKeyList }
        : undefined,
  };
}

function buildToolInputDeltaEvent(
  event: AgentEventToolInputDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "tool.args.delta",
    toolCallId: event.tool_id,
    owner: "tool",
    scope: "tool_call",
    phase: "acting",
    surface: "tool_ui",
    persistence: "ephemeral_live",
    payload: {
      toolName: event.tool_name,
      provider: event.provider,
      inputStreaming: true,
      deltaPreview: truncateText(event.delta),
      deltaLength: event.delta.length,
      accumulatedInputLength: event.accumulated_arguments?.length ?? 0,
      accumulatedInputPreview: truncateText(event.accumulated_arguments),
    },
  };
}

function buildActionRequiredEvent(
  event: AgentEventActionRequired,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    sessionId: event.scope?.session_id ?? context.sessionId ?? undefined,
    threadId: event.scope?.thread_id ?? context.threadId ?? undefined,
    turnId: event.scope?.turn_id ?? context.turnId ?? undefined,
    type: "action.required",
    actionId: event.request_id,
    owner: "action",
    scope: "action_request",
    phase: "waiting",
    surface: "hitl",
    persistence: "snapshot",
    control: actionControl(event),
    payload: {
      actionType: event.action_type,
      toolName: event.tool_name,
      promptPreview: truncateText(event.prompt),
      questionCount: event.questions?.length ?? 0,
      hasRequestedSchema: Boolean(event.requested_schema),
    },
  };
}

function buildActionResolvedEvent(
  event: AgentEventActionResolved,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const dataRecord = readRecord(event.data);
  return {
    ...buildBase(event, context),
    sessionId: event.scope?.session_id ?? context.sessionId ?? undefined,
    threadId: event.scope?.thread_id ?? context.threadId ?? undefined,
    turnId: event.scope?.turn_id ?? context.turnId ?? undefined,
    type: "action.resolved",
    actionId: event.request_id,
    owner: "action",
    scope: "action_request",
    phase: "completed",
    surface: "hitl",
    persistence: "snapshot",
    control: resolvedActionControl(event),
    payload: {
      actionType: event.action_type,
      decisionKind:
        typeof event.data?.decision_kind === "string"
          ? event.data.decision_kind
          : undefined,
      approved: event.approved,
      feedbackPreview: truncateText(event.feedback),
      permissionMode: event.permission_mode,
      targetSessionId: readStringField(dataRecord, [
        "target_session_id",
        "targetSessionId",
      ]),
      planFile: readStringField(dataRecord, ["plan_file", "planFile"]),
      planId: readStringField(dataRecord, ["plan_id", "planId"]),
      awaitingLeaderApproval: readBooleanField(dataRecord, [
        "awaiting_leader_approval",
        "awaitingLeaderApproval",
      ]),
      responseMetadataKeys: metadataKeys(event.data),
    },
  };
}

function buildArtifactEvent(
  event: AgentEventArtifactSnapshot,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const metadata = event.artifact.metadata;
  const complete = metadata?.complete;
  const isComplete = complete === undefined ? true : complete !== false;
  return {
    ...buildBase(event, context),
    type: isComplete ? "artifact.preview.ready" : "artifact.updated",
    artifactId: event.artifact.artifactId,
    owner: "artifact",
    scope: "artifact",
    phase: isComplete ? "completed" : "producing",
    surface: "artifact_workspace",
    persistence: "artifact_store",
    payload: {
      filePath: event.artifact.filePath,
      contentLength: event.artifact.content?.length ?? 0,
      complete: isComplete,
      metadataKeys: metadataKeys(metadata),
    },
    refs: {
      artifactIds: [event.artifact.artifactId],
      ...(event.artifact.filePath
        ? { artifactPaths: [event.artifact.filePath] }
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

function buildRequestedFixExecutionEventsFromArtifact(
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
  const base = buildBase(event, context);

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

function buildContextTraceEvent(
  event: AgentEventContextTrace,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "context.changed",
    owner: "context",
    scope: "turn",
    phase: "preparing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      stepCount: event.steps.length,
      latestStage: event.steps[event.steps.length - 1]?.stage,
      latestDetailPreview: truncateText(
        event.steps[event.steps.length - 1]?.detail,
      ),
    },
  };
}

function buildQueueAddedEvents(
  event: AgentEventQueueAdded,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const queuedTurn = event.queued_turn;
  return [
    {
      ...base,
      type: "queue.changed",
      sessionId: event.session_id,
      taskId: queuedTurn.queued_turn_id,
      owner: "task",
      scope: "task",
      phase: "waiting",
      surface: "task_capsule",
      persistence: "snapshot",
      control: "queue",
      runtimeStatus: "queued",
      latestTurnStatus: "queued",
      queuedTurnCount: 1,
      payload: {
        runtimeEntity: base.runtimeEntity,
        queueEvent: event.type,
        queuedTurnCount: 1,
        queuedTurnId: queuedTurn.queued_turn_id,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.message_preview),
        imageCount: queuedTurn.image_count,
        createdAt: queuedTurn.created_at,
      },
    },
    {
      ...base,
      type: "task.changed",
      sessionId: event.session_id,
      taskId: queuedTurn.queued_turn_id,
      owner: "task",
      scope: "turn",
      phase: "submitted",
      surface: "task_capsule",
      persistence: "snapshot",
      control: "steer",
      runtimeStatus: "queued",
      latestTurnStatus: "queued",
      queuedTurnCount: 1,
      payload: {
        runtimeEntity: base.runtimeEntity,
        taskEvent: "steer_intent",
        intentKind: "queued_user_input",
        queuedTurnId: queuedTurn.queued_turn_id,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.message_preview),
        messageLength: queuedTurn.message_text.length,
        imageCount: queuedTurn.image_count,
        createdAt: queuedTurn.created_at,
      },
    },
  ];
}

function buildQueueChangedEvent(
  event:
    | AgentEventQueueRemoved
    | AgentEventQueueStarted
    | AgentEventQueueCleared,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "queue.changed",
    sessionId: event.session_id,
    taskId: event.type === "queue_cleared" ? undefined : event.queued_turn_id,
    owner: "task",
    scope: "task",
    phase: event.type === "queue_started" ? "accepted" : "waiting",
    surface: "task_capsule",
    persistence: "snapshot",
    runtimeStatus: event.type === "queue_started" ? "running" : "queued",
    latestTurnStatus: event.type === "queue_started" ? "running" : "queued",
    queuedTurnCount:
      event.type === "queue_cleared" ? event.queued_turn_ids.length : 1,
    payload: {
      runtimeEntity: buildBase(event, context).runtimeEntity,
      queueEvent: event.type,
      queuedTurnCount:
        event.type === "queue_cleared" ? event.queued_turn_ids.length : 1,
    },
  };
}

function buildQueueTaskChangedEvent(params: {
  event:
    | AgentEventQueueRemoved
    | AgentEventQueueStarted
    | AgentEventQueueCleared;
  context: AgentUiProjectionContext;
  queuedTurnId: string;
  index?: number;
}): AgentUiProjectionEvent {
  const { event, context, queuedTurnId, index } = params;
  const started = event.type === "queue_started";
  return {
    ...buildBase(event, context),
    type: "task.changed",
    sessionId: event.session_id,
    taskId: queuedTurnId,
    owner: "task",
    scope: "turn",
    phase: started ? "accepted" : "cancelled",
    surface: "task_capsule",
    persistence: "snapshot",
    control: started ? "steer" : "remove",
    runtimeStatus: started ? "running" : "cancelled",
    latestTurnStatus: started ? "running" : "cancelled",
    payload: {
      runtimeEntity: buildBase(event, context).runtimeEntity,
      taskEvent: started ? "steer_started" : "steer_removed",
      intentKind: "queued_user_input",
      queueEvent: event.type,
      queuedTurnId,
      ...(typeof index === "number" ? { clearedIndex: index } : {}),
      ...(event.type === "queue_cleared"
        ? { clearedCount: event.queued_turn_ids.length }
        : {}),
    },
  };
}

function buildQueueLifecycleEvents(
  event:
    | AgentEventQueueRemoved
    | AgentEventQueueStarted
    | AgentEventQueueCleared,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const primary = buildQueueChangedEvent(event, context);
  if (event.type === "queue_cleared") {
    return [
      primary,
      ...event.queued_turn_ids.map((queuedTurnId, index) =>
        buildQueueTaskChangedEvent({
          event,
          context,
          queuedTurnId,
          index,
        }),
      ),
    ];
  }

  return [
    primary,
    buildQueueTaskChangedEvent({
      event,
      context,
      queuedTurnId: event.queued_turn_id,
    }),
  ];
}

function threadItemPhase(item: AgentThreadItem): AgentUiPhase {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "completed") {
    return "completed";
  }
  return "acting";
}

function threadItemToolResultType(item: AgentThreadItem): AgentUiEventClass {
  if (item.status === "failed") {
    return "tool.failed";
  }
  if (
    item.type === "command_execution" &&
    typeof item.exit_code === "number" &&
    item.exit_code !== 0
  ) {
    return "tool.failed";
  }
  if (item.status === "completed") {
    return "tool.result";
  }
  return "tool.progress";
}

function threadItemToolPhase(item: AgentThreadItem): AgentUiPhase {
  if (threadItemToolResultType(item) === "tool.failed") {
    return "failed";
  }
  return threadItemPhase(item);
}

function buildThreadItemBase(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "taskId"
  | "partId"
  | "runtimeEntity"
> {
  return {
    ...buildBase({ type: sourceType } as AgentEvent, context),
    threadId: item.thread_id,
    turnId: item.turn_id,
    partId: item.id,
  };
}

function buildThreadItemEvent(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const base = buildThreadItemBase(sourceType, item, context);

  switch (item.type) {
    case "plan":
      return {
        ...base,
        type: item.status === "completed" ? "plan.final" : "plan.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "planning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          preview: truncateText(item.text),
        },
      };
    case "reasoning":
      return {
        ...base,
        type:
          item.status === "completed" ? "reasoning.summary" : "reasoning.delta",
        owner: "model",
        scope: "part",
        phase: item.status === "completed" ? "completed" : "reasoning",
        surface: "inline_process",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          summaryCount: item.summary?.length ?? 0,
          preview: truncateText(item.summary?.[0] ?? item.text),
        },
      };
    case "tool_call":
      return {
        ...base,
        type:
          item.status === "failed" || item.success === false
            ? "tool.failed"
            : item.status === "completed"
              ? "tool.result"
              : "tool.progress",
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: item.tool_name,
          success: item.success,
          outputPreview: truncateText(item.output),
          errorPreview: truncateText(item.error),
          metadataKeys: metadataKeys(item.metadata),
        },
        refs: extractArtifactRefs(item.metadata),
      };
    case "command_execution":
      return {
        ...base,
        type: threadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "command_execution",
          commandPreview: truncateText(item.command),
          cwd: item.cwd,
          exitCode: item.exit_code,
          outputPreview: truncateText(item.aggregated_output),
          errorPreview: truncateText(item.error),
        },
      };
    case "web_search":
      return {
        ...base,
        type: threadItemToolResultType(item),
        toolCallId: item.id,
        owner: "tool",
        scope: "tool_call",
        phase: threadItemToolPhase(item),
        surface: "tool_ui",
        persistence: "archive",
        payload: {
          toolName: "web_search",
          queryPreview: truncateText(item.query),
          action: item.action,
          outputPreview: truncateText(item.output),
        },
      };
    case "approval_request":
    case "request_user_input":
      return {
        ...base,
        type: item.response ? "action.resolved" : "action.required",
        actionId: item.request_id,
        owner: "action",
        scope: "action_request",
        phase: item.response ? "completed" : "waiting",
        surface: "hitl",
        persistence: "archive",
        control: item.type === "request_user_input" ? "answer" : "approve",
        payload: {
          actionType: item.action_type,
          promptPreview: truncateText(item.prompt),
          questionCount:
            item.type === "request_user_input"
              ? (item.questions?.length ?? 0)
              : 0,
          hasResponse: Boolean(item.response),
        },
      };
    case "file_artifact":
      return {
        ...base,
        type:
          item.status === "completed"
            ? "artifact.preview.ready"
            : "artifact.updated",
        artifactId: item.id,
        owner: "artifact",
        scope: "artifact",
        phase: item.status === "completed" ? "completed" : "producing",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        payload: {
          filePath: item.path,
          source: item.source,
          contentLength: item.content?.length ?? 0,
          metadataKeys: metadataKeys(item.metadata),
        },
        refs: {
          artifactIds: [item.id],
          artifactPaths: [item.path],
        },
      };
    case "subagent_activity":
      return {
        ...base,
        type: "agent.changed",
        taskId: item.session_id,
        agentId: item.session_id,
        owner: "task",
        scope: "agent",
        phase: threadItemPhase(item),
        surface: "task_capsule",
        persistence: "archive",
        runtimeEntity: "subagent_turn",
        runtimeStatus:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "running",
        latestTurnStatus:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "running",
        topology: "coordinator_team",
        payload: {
          runtimeEntity: "subagent_turn",
          statusLabel: item.status_label,
          title: item.title,
          role: item.role,
          model: item.model,
          childSessionId: item.session_id,
        },
      };
    case "context_compaction":
      return {
        ...base,
        type:
          item.stage === "completed"
            ? "context.compaction.completed"
            : "context.compaction.started",
        owner: "context",
        scope: "turn",
        phase: item.stage === "completed" ? "completed" : "preparing",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          stage: item.stage,
          trigger: item.trigger,
          detailPreview: truncateText(item.detail),
        },
      };
    case "turn_summary":
      return {
        ...base,
        type: "state.snapshot",
        owner: "session",
        scope: "turn",
        phase: "archived",
        surface: "timeline_evidence",
        persistence: "archive",
        payload: {
          textLength: item.text.length,
          preview: truncateText(item.text),
        },
      };
    case "warning":
    case "error":
      return {
        ...base,
        type: "diagnostic.changed",
        owner: "diagnostics",
        scope: "turn",
        phase: item.type === "error" ? "failed" : threadItemPhase(item),
        surface: "diagnostics",
        persistence: "diagnostics_log",
        payload: {
          code: item.type === "warning" ? item.code : undefined,
          messagePreview:
            item.type === "warning"
              ? truncateText(item.message)
              : truncateText(item.message),
        },
      };
    default:
      return null;
  }
}

function buildSubagentActivityWorkerNotificationEvent(
  sourceType: AgentEvent["type"],
  item: Extract<AgentThreadItem, { type: "subagent_activity" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  const phase = threadItemPhase(item);
  if (phase !== "completed" && phase !== "failed") {
    return null;
  }

  return {
    ...buildThreadItemBase(sourceType, item, context),
    type: "worker.notification",
    taskId: item.session_id,
    agentId: item.session_id,
    workerNotificationId: item.id,
    transcriptRef: `${item.thread_id}:${item.turn_id}:${item.id}`,
    owner: "agent",
    scope: "agent",
    phase,
    surface: "worker_notifications",
    persistence: "archive",
    runtimeEntity: "subagent_turn",
    runtimeStatus: phase === "failed" ? "failed" : "completed",
    latestTurnStatus: phase === "failed" ? "failed" : "completed",
    topology: "coordinator_team",
    payload: {
      runtimeEntity: "subagent_turn",
      notificationKind: "worker_result",
      statusLabel: item.status_label,
      title: item.title,
      summaryPreview: truncateText(item.summary),
      role: item.role,
      model: item.model,
      childSessionId: item.session_id,
    },
  };
}

function normalizeProjectionToolName(toolName: string): string {
  return toolName.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isTaskUpdateToolName(toolName: string): boolean {
  const normalized = normalizeProjectionToolName(toolName);
  return normalized === "taskupdate" || normalized === "taskupdatetool";
}

function buildTaskOwnerChangeProjectionEvents(
  sourceType: AgentEvent["type"],
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  if (
    sourceType !== "item_completed" ||
    item.status !== "completed" ||
    item.success === false ||
    !isTaskUpdateToolName(item.tool_name)
  ) {
    return [];
  }

  const metadata = readRecord(item.metadata);
  const updatedFields = readStringArrayField(metadata, [
    "updated_fields",
    "updatedFields",
  ]).map((field) => field.toLowerCase());
  if (!updatedFields.includes("owner")) {
    return [];
  }

  const task = readRecord(metadata?.task);
  const ownerChange = readRecord(
    metadata?.owner_change ?? metadata?.ownerChange,
  );
  const taskId =
    readStringField(metadata, ["task_id", "taskId"]) ??
    readStringField(task, ["id", "taskId"]);
  const nextAssigneeId =
    readStringField(ownerChange, ["to", "next", "nextOwner"]) ??
    readStringField(task, ["owner", "ownerName"]);
  if (!taskId || !nextAssigneeId) {
    return [];
  }

  const previousAssigneeId = readStringField(ownerChange, [
    "from",
    "previous",
    "previousOwner",
  ]);
  const sourceTaskListId = readStringField(metadata, [
    "task_list_id",
    "taskListId",
  ]);
  const action: AgentUiTeamControlProjectionAction = previousAssigneeId
    ? "reassign"
    : "assign";
  const timestamp = item.completed_at ?? item.updated_at ?? context.timestamp;

  return buildAgentUiTeamControlProjectionEvents(
    {
      action,
      requestedSessionIds: [taskId],
      workItemId: taskId,
      previousAssigneeId,
      nextAssigneeId,
      reassignmentReason: `${item.tool_name} owner change`,
      resolvedStatus: "assigned",
      runtimeEntity: "work_item",
      timestamp,
    },
    context,
  ).map((event) => ({
    ...event,
    sourceType,
    timestamp: event.timestamp ?? timestamp,
    threadId: item.thread_id,
    turnId: item.turn_id,
    partId: item.id,
    toolCallId: item.id,
    payload: {
      ...event.payload,
      sourceToolName: item.tool_name,
      sourceToolCallId: item.id,
      ...(sourceTaskListId ? { sourceTaskListId } : {}),
    },
  }));
}

function buildThreadItemEvents(
  sourceType: AgentEvent["type"],
  item: AgentThreadItem,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const primary = buildThreadItemEvent(sourceType, item, context);
  const events = primary ? [primary] : [];

  if (item.type === "subagent_activity") {
    const workerNotification = buildSubagentActivityWorkerNotificationEvent(
      sourceType,
      item,
      context,
    );
    if (workerNotification) {
      events.push(workerNotification);
    }
    return events;
  }

  if (item.type !== "tool_call") {
    return events;
  }

  const planApproval = extractPlanApprovalProjection(item.metadata);
  const planApprovalResponse = extractPlanApprovalResponseProjection(
    item.metadata,
  );
  if (planApproval) {
    events.push(
      buildPlanApprovalRequiredEvent({
        base: buildThreadItemBase(sourceType, item, context),
        projection: planApproval,
        persistence: "archive",
        toolCallId: item.id,
      }),
    );
  }
  if (planApprovalResponse) {
    events.push(
      buildPlanApprovalResolvedEvent({
        base: buildThreadItemBase(sourceType, item, context),
        projection: planApprovalResponse,
        persistence: "archive",
        toolCallId: item.id,
      }),
    );
  }
  events.push(
    ...buildTaskOwnerChangeProjectionEvents(sourceType, item, context),
  );
  return events;
}

export function buildAgentUiProjectionEvents(
  event: AgentEvent,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const events: AgentUiProjectionEvent[] = (() => {
    switch (event.type) {
      case "thread_started":
        return [
          {
            ...base,
            type: "session.opened",
            threadId: event.thread_id,
            owner: "session",
            scope: "thread",
            phase: "accepted",
            surface: "session_tabs",
            persistence: "snapshot",
          },
        ];
      case "turn_started":
        return [
          {
            ...base,
            type: "run.started",
            threadId: event.turn.thread_id,
            turnId: event.turn.id,
            owner: "runtime",
            scope: "turn",
            phase: "accepted",
            surface: "runtime_status",
            persistence: "snapshot",
            payload: {
              status: event.turn.status,
              promptLength: event.turn.prompt_text.length,
            },
          },
        ];
      case "item_started":
      case "item_updated":
      case "item_completed":
        return buildThreadItemEvents(event.type, event.item, context);
      case "turn_completed":
      case "done":
      case "final_done":
        return [
          {
            ...base,
            type: "run.finished",
            owner: "runtime",
            scope: "run",
            phase: "completed",
            surface: "runtime_status",
            persistence: "archive",
          },
        ];
      case "turn_failed":
      case "error":
        return [
          {
            ...base,
            type: "run.failed",
            owner: "runtime",
            scope: "run",
            phase: "failed",
            surface: "runtime_status",
            persistence: "archive",
            payload:
              event.type === "error"
                ? { errorPreview: truncateText(event.message) }
                : { errorPreview: truncateText(event.turn.error_message) },
          },
        ];
      case "message":
        return [
          {
            ...base,
            type: "messages.snapshot",
            owner: "session",
            scope: "message",
            phase: "hydrating",
            surface: "conversation",
            persistence: "snapshot",
            payload: {
              role: event.message.role,
              partCount: event.message.content.length,
            },
          },
        ];
      case "text_delta":
      case "text_delta_batch":
        return [
          {
            ...base,
            type: "text.delta",
            owner: "model",
            scope: "part",
            phase: "producing",
            surface: "conversation",
            persistence: "transcript",
            payload: {
              textLength: event.text.length,
              preview: truncateText(event.text),
              ...(event.type === "text_delta_batch"
                ? {
                    chunkCount: event.chunks.length,
                    boundary: event.boundary,
                  }
                : {}),
            },
          },
        ];
      case "thinking_delta":
        return [
          {
            ...base,
            type: "reasoning.delta",
            owner: "model",
            scope: "part",
            phase: "reasoning",
            surface: "inline_process",
            persistence: "ephemeral_live",
            payload: {
              textLength: event.text.length,
              preview: truncateText(event.text),
            },
          },
        ];
      case "runtime_status":
        return [
          {
            ...base,
            type: "run.status",
            owner: "runtime",
            scope: "run",
            phase: normalizeRuntimePhase(event),
            surface: "runtime_status",
            persistence: "ephemeral_live",
            runtimeStatus: normalizeRuntimeStatusFromPhase(event.status.phase),
            latestTurnStatus: normalizeRuntimeStatusFromPhase(
              event.status.phase,
            ),
            ...compactProjectionFields(
              buildTeamRuntimeFacts(event.status.metadata),
            ),
            payload: {
              runtimeEntity: base.runtimeEntity,
              title: event.status.title,
              detailPreview: truncateText(event.status.detail),
              sourcePhase: event.status.phase,
              checkpointCount: event.status.checkpoints?.length ?? 0,
              metadataKeys: metadataKeys(event.status.metadata),
              ...compactProjectionFields(
                buildTeamRuntimeFacts(event.status.metadata),
              ),
            },
          },
          buildPermissionChangedEvent(event, context),
          buildTeamChangedFromRuntimeStatusEvent(event, context),
        ].filter((projectionEvent): projectionEvent is AgentUiProjectionEvent =>
          Boolean(projectionEvent),
        );
      case "tool_start":
        return buildToolStartEvents(event, context);
      case "tool_end":
        return buildToolEndEvents(event, context);
      case "tool_progress":
        return [buildToolProgressEvent(event, context)];
      case "tool_output_delta":
        return [buildToolOutputDeltaEvent(event, context)];
      case "tool_input_delta":
        return [buildToolInputDeltaEvent(event, context)];
      case "artifact_snapshot":
        return [
          buildArtifactEvent(event, context),
          ...buildRequestedFixExecutionEventsFromArtifact(event, context),
        ];
      case "action_required":
        return [buildActionRequiredEvent(event, context)];
      case "action_resolved":
        return [buildActionResolvedEvent(event, context)];
      case "context_trace":
        return [buildContextTraceEvent(event, context)];
      case "turn_context": {
        const contextSummary = event.context_summary ?? null;
        const events: AgentUiProjectionEvent[] = [
          {
            ...base,
            type: "context.changed",
            sessionId: event.session_id,
            threadId: event.thread_id,
            turnId: event.turn_id,
            owner: "context",
            scope: "turn",
            phase: "preparing",
            surface: "runtime_status",
            persistence: "snapshot",
            payload: {
              outputSchemaAvailable: Boolean(event.output_schema_runtime),
              outputSchemaSource: event.output_schema_runtime?.source,
              outputSchemaStrategy: event.output_schema_runtime?.strategy,
              providerName: event.output_schema_runtime?.providerName,
              modelName: event.output_schema_runtime?.modelName,
              contextSummaryAvailable: Boolean(contextSummary),
              memoryBudget: contextSummary?.memory_budget ?? null,
              missingContext: contextSummary?.missing_context ?? [],
              retrievalRefs: contextSummary?.retrieval_refs ?? [],
              teamMemoryRefs: contextSummary?.team_memory_refs ?? [],
            },
            refs: {
              contextSourceIds: (contextSummary?.retrieval_refs ?? []).map(
                (ref) => ref.source_id,
              ),
              teamMemoryKeys: (contextSummary?.team_memory_refs ?? []).map(
                (ref) => ref.key,
              ),
            },
          },
        ];
        if (event.approval_policy || event.sandbox_policy) {
          events.push({
            ...base,
            type: "permission.changed",
            sessionId: event.session_id,
            threadId: event.thread_id,
            turnId: event.turn_id,
            owner: "policy",
            scope: "turn",
            phase: "preparing",
            surface: "runtime_status",
            persistence: "snapshot",
            payload: {
              approvalPolicy: event.approval_policy ?? null,
              sandboxPolicy: event.sandbox_policy ?? null,
              sourceEvent: "turn_context",
            },
          });
        }
        return events;
      }
      case "queue_added":
        return buildQueueAddedEvents(event, context);
      case "queue_removed":
      case "queue_started":
      case "queue_cleared":
        return buildQueueLifecycleEvents(event, context);
      case "subagent_status_changed":
        return buildSubagentStatusChangedEvents(event, context);
      case "model_change":
        return [
          {
            ...base,
            type: "run.status",
            owner: "runtime",
            scope: "run",
            phase: "routing",
            surface: "runtime_status",
            persistence: "snapshot",
            payload: {
              model: event.model,
              mode: event.mode,
            },
          },
        ];
      case "task_profile_resolved":
        return [
          {
            ...base,
            type: "task.changed",
            owner: "task",
            scope: "run",
            phase: "routing",
            surface: "task_capsule",
            persistence: "snapshot",
            payload: {
              kind: event.task_profile.kind,
              source: event.task_profile.source,
              traits: event.task_profile.traits ?? [],
              modalityContractKey: event.task_profile.modalityContractKey,
              routingSlot: event.task_profile.routingSlot,
              executionProfileKey: event.task_profile.executionProfileKey,
              executorAdapterKey: event.task_profile.executorAdapterKey,
              executorKind: event.task_profile.executorKind,
              executorBindingKey: event.task_profile.executorBindingKey,
              permissionProfileKeys:
                event.task_profile.permissionProfileKeys ?? [],
              userLockPolicy: event.task_profile.userLockPolicy,
              serviceModelSlot: event.task_profile.serviceModelSlot,
              sceneKind: event.task_profile.sceneKind,
              sceneSkillId: event.task_profile.sceneSkillId,
              entrySource: event.task_profile.entrySource,
            },
          },
        ];
      case "warning":
        return [
          {
            ...base,
            type: "diagnostic.changed",
            owner: "diagnostics",
            scope: "run",
            phase: "acting",
            surface: "diagnostics",
            persistence: "diagnostics_log",
            payload: {
              code: event.code,
              messagePreview: truncateText(event.message),
            },
          },
        ];
      case "cost_estimated":
      case "cost_recorded":
        return [
          {
            ...base,
            type: "metric.changed",
            owner: "diagnostics",
            scope: "run",
            phase: "acting",
            surface: "diagnostics",
            persistence: "diagnostics_log",
            payload: {
              metricEvent: event.type,
              status: event.cost_state.status,
              estimatedCostClass: event.cost_state.estimatedCostClass,
              estimatedTotalCost: event.cost_state.estimatedTotalCost,
              currency: event.cost_state.currency,
              totalTokens: event.cost_state.totalTokens,
              inputTokens: event.cost_state.inputTokens,
              outputTokens: event.cost_state.outputTokens,
              cachedInputTokens: event.cost_state.cachedInputTokens,
              cacheCreationInputTokens:
                event.cost_state.cacheCreationInputTokens,
            },
          },
        ];
      case "candidate_set_resolved":
      case "routing_decision_made":
      case "routing_fallback_applied":
      case "routing_not_possible":
      case "limit_state_updated":
      case "single_candidate_only":
      case "single_candidate_capability_gap":
      case "rate_limit_hit":
      case "quota_low":
      case "quota_blocked":
        return [
          {
            ...base,
            type: "run.status",
            owner: "runtime",
            scope: "run",
            phase:
              event.type === "routing_not_possible" ||
              event.type === "quota_blocked"
                ? "failed"
                : "routing",
            surface: "runtime_status",
            persistence: "snapshot",
            payload: {
              runtimeEvent: event.type,
              ...(event.type === "candidate_set_resolved" ||
              event.type === "routing_decision_made" ||
              event.type === "routing_fallback_applied" ||
              event.type === "routing_not_possible"
                ? {
                    routingMode: event.routing_decision.routingMode,
                    decisionSource: event.routing_decision.decisionSource,
                    decisionReason: event.routing_decision.decisionReason,
                    selectedProvider: event.routing_decision.selectedProvider,
                    selectedModel: event.routing_decision.selectedModel,
                    requestedProvider: event.routing_decision.requestedProvider,
                    requestedModel: event.routing_decision.requestedModel,
                    candidateCount: event.routing_decision.candidateCount,
                    estimatedCostClass:
                      event.routing_decision.estimatedCostClass,
                    capabilityGap: event.routing_decision.capabilityGap,
                    fallbackChain: event.routing_decision.fallbackChain ?? [],
                    settingsSource: event.routing_decision.settingsSource,
                    serviceModelSlot: event.routing_decision.serviceModelSlot,
                  }
                : {}),
              ...(event.type === "limit_state_updated" ||
              event.type === "single_candidate_only" ||
              event.type === "single_candidate_capability_gap"
                ? {
                    limitStatus: event.limit_state.status,
                    singleCandidateOnly: event.limit_state.singleCandidateOnly,
                    providerLocked: event.limit_state.providerLocked,
                    settingsLocked: event.limit_state.settingsLocked,
                    oemLocked: event.limit_state.oemLocked,
                    candidateCount: event.limit_state.candidateCount,
                    capabilityGap: event.limit_state.capabilityGap,
                    notes: event.limit_state.notes ?? [],
                  }
                : {}),
              ...(event.type === "rate_limit_hit" ||
              event.type === "quota_low" ||
              event.type === "quota_blocked"
                ? {
                    limitEventKind: event.limit_event.eventKind,
                    messagePreview: truncateText(event.limit_event.message),
                    retryable: event.limit_event.retryable,
                  }
                : {}),
            },
          },
        ];
      default:
        return [];
    }
  })();

  return sequenceEvents(events, context.sequence);
}

export function buildAgentUiEvidenceChangedEvent(
  input: AgentUiEvidenceProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const status = definedString(input.status);
  const phase: AgentUiPhase =
    status === "failed" || status === "error"
      ? "failed"
      : status === "completed" || status === "ready"
        ? "completed"
        : "acting";

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
    phase,
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

function normalizeEvidenceProjectionPhase(
  status: string | undefined,
): AgentUiPhase {
  return status === "failed" || status === "error"
    ? "failed"
    : status === "completed" || status === "ready"
      ? "completed"
      : "acting";
}

function normalizeHandoffProjectionPhase(
  status: string | undefined,
): AgentUiPhase {
  switch (definedString(status)) {
    case "accepted":
      return "accepted";
    case "active":
    case "running":
      return "acting";
    case "returned":
      return "reconciling";
    case "resumed":
    case "completed":
    case "ready":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "handoff_requested":
    case "requested":
    case "pending":
      return "waiting";
    default:
      return normalizeEvidenceProjectionPhase(status);
  }
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

function normalizeAutomationJobRuntimeStatus(
  job: AutomationJobProjectionRecord,
  event: AgentUiAutomationJobProjectionEvent,
): AgentUiRuntimeStatus {
  if (event === "deleted") {
    return "closed";
  }

  if (job.running_started_at) {
    return "running";
  }

  switch (job.last_status) {
    case "queued":
      return "queued";
    case "running":
    case "agent_resuming":
      return "running";
    case "waiting_for_human":
      return "needs_input";
    case "human_controlling":
      return "waiting";
    case "success":
      return "completed";
    case "error":
    case "timeout":
      return "failed";
    default:
      return job.enabled === false ? "idle" : "queued";
  }
}

function automationJobPhase(status: AgentUiRuntimeStatus): AgentUiPhase {
  switch (status) {
    case "running":
      return "acting";
    case "queued":
    case "needs_input":
    case "waiting":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "closed":
    case "cancelled":
      return "cancelled";
    case "idle":
    default:
      return "waiting";
  }
}

function automationJobProjectionPayload(input: {
  job: AutomationJobProjectionRecord;
  event: AgentUiAutomationJobProjectionEvent;
  runtimeStatus: AgentUiRuntimeStatus;
}): Record<string, unknown> {
  const { job, event, runtimeStatus } = input;
  return compactProjectionFields({
    taskEvent: `automation_job_${event}`,
    agentEvent: `automation_job_${event}`,
    runtimeEntity: "automation_job",
    runtimeStatus,
    jobId: job.id,
    jobName: job.name,
    descriptionPreview: truncateText(job.description),
    enabled: job.enabled,
    workspaceId: job.workspace_id,
    executionMode: job.execution_mode,
    scheduleKind: job.schedule?.kind,
    payloadKind: job.payload?.kind,
    deliveryMode: job.delivery?.mode,
    deliveryChannel: job.delivery?.channel,
    nextRunAt: job.next_run_at,
    lastStatus: job.last_status,
    lastErrorPreview: truncateText(job.last_error),
    lastRunAt: job.last_run_at,
    lastFinishedAt: job.last_finished_at,
    runningStartedAt: job.running_started_at,
    consecutiveFailures: job.consecutive_failures,
    lastRetryCount: job.last_retry_count,
    autoDisabledUntil: job.auto_disabled_until,
    lastDeliverySuccess: job.last_delivery?.success,
    lastDeliveryRunId: job.last_delivery?.run_id,
    lastDeliveryPreview: truncateText(job.last_delivery?.output_preview),
  });
}

function isAutomationJobTerminalStatus(status: AgentUiRuntimeStatus): boolean {
  return status === "completed" || status === "failed" || status === "closed";
}

export function buildAgentUiAutomationJobProjectionEvents(
  input: AgentUiAutomationJobProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const runtimeStatus = normalizeAutomationJobRuntimeStatus(
    input.job,
    input.event,
  );
  const phase = automationJobPhase(runtimeStatus);
  const timestamp =
    definedString(input.timestamp) ??
    context.timestamp ??
    input.job.updated_at ??
    input.job.created_at;
  const sessionId = definedString(input.sessionId ?? context.sessionId);
  const threadId = definedString(input.threadId ?? context.threadId);
  const runId =
    definedString(input.runId) ??
    definedString(input.job.last_delivery?.run_id) ??
    definedString(context.runId);
  const payload = automationJobProjectionPayload({
    job: input.job,
    event: input.event,
    runtimeStatus,
  });
  const shared = {
    sourceType: "automation_job_projection" as const,
    timestamp,
    sessionId,
    threadId,
    runId,
    taskId: input.job.id,
    agentId: input.job.id,
    workItemId: input.job.id,
    agentName: input.job.name,
    agentRole: "background_teammate",
    agentSource: "automation_job",
    topology: "background_teammate" as const,
    runtimeEntity: "automation_job" as const,
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
  };
  const events: AgentUiProjectionEvent[] = [
    {
      ...shared,
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase,
      surface: "task_capsule",
      persistence: "snapshot",
      control: runtimeStatus === "running" ? "stop" : "open_detail",
      payload,
      rawEventRef: input.job.id,
    },
    {
      ...shared,
      type: "agent.changed",
      owner: "agent",
      scope: "agent",
      phase,
      surface: "background_teammate",
      persistence: "snapshot",
      control: "open_detail",
      payload,
      rawEventRef: input.job.id,
    },
  ];

  if (isAutomationJobTerminalStatus(runtimeStatus)) {
    events.push({
      ...shared,
      type: "worker.notification",
      workerNotificationId: `${input.job.id}:${runtimeStatus}`,
      owner: "agent",
      scope: "agent",
      phase,
      surface: "worker_notifications",
      persistence: "archive",
      payload: {
        ...payload,
        notificationKind:
          runtimeStatus === "completed"
            ? "automation_completed"
            : "automation_stopped",
      },
      rawEventRef: input.job.id,
    });
  }

  return sequenceEvents(events, context.sequence);
}

function normalizeProjectionIdList(
  values: Array<string | null | undefined> | undefined,
): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value?.trim() ?? "").filter(Boolean)),
  );
}

function resolveTeamControl(
  control: AgentUiTeamControlProjectionAction,
): AgentUiControl {
  switch (control) {
    case "assign":
    case "reassign":
      return "assign";
    case "delegate":
      return "delegate";
    case "request_review":
      return "request_review";
    case "resume":
    case "send_input":
      return "continue_agent";
    case "stop":
      return "stop";
    case "wait":
      return "wait";
    case "close":
    case "close_completed":
    default:
      return "close";
  }
}

function normalizeTeamControlResolvedRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus | undefined {
  const normalizedStatus = definedString(status);
  switch (normalizedStatus) {
    case "idle":
    case "queued":
    case "submitted":
    case "accepted":
    case "preparing":
    case "running":
    case "waiting":
    case "needs_input":
    case "plan_ready":
    case "completed":
    case "failed":
    case "aborted":
    case "cancelled":
    case "closed":
    case "not_found":
      return normalizedStatus;
    case "assigned":
    case "claimed":
      return "accepted";
    case "blocked":
    case "reviewing":
      return "waiting";
    case "done":
      return "completed";
    case "killed":
      return "aborted";
    case "open":
      return "queued";
    default:
      return undefined;
  }
}

function phaseFromTeamControlRuntimeStatus(
  status: AgentUiRuntimeStatus,
): AgentUiPhase {
  switch (status) {
    case "accepted":
      return "accepted";
    case "queued":
    case "submitted":
      return "planning";
    case "preparing":
      return "preparing";
    case "running":
      return "acting";
    case "waiting":
    case "needs_input":
    case "plan_ready":
      return "waiting";
    case "completed":
    case "closed":
    case "not_found":
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      return "interrupted";
    case "cancelled":
      return "cancelled";
    case "idle":
    default:
      return "unknown";
  }
}

function resolveTeamControlPhase(
  action: AgentUiTeamControlProjectionAction,
  timedOut: boolean,
  resolvedStatus?: string | null,
): AgentUiPhase {
  const resolvedRuntimeStatus = timedOut
    ? undefined
    : normalizeTeamControlResolvedRuntimeStatus(resolvedStatus);
  if (resolvedRuntimeStatus) {
    return phaseFromTeamControlRuntimeStatus(resolvedRuntimeStatus);
  }
  if (action === "request_review") {
    return "reviewing";
  }
  if (action === "reassign") {
    return "routing";
  }
  if (action === "assign" || action === "delegate") {
    return "planning";
  }
  if (action === "wait") {
    return timedOut ? "waiting" : "completed";
  }
  if (action === "resume" || action === "send_input") {
    return "acting";
  }
  if (action === "stop") {
    return "interrupted";
  }
  return "completed";
}

function resolveTeamControlRuntimeStatus(
  action: AgentUiTeamControlProjectionAction,
  timedOut: boolean,
  resolvedStatus?: string | null,
): AgentUiRuntimeStatus {
  const resolvedRuntimeStatus = timedOut
    ? undefined
    : normalizeTeamControlResolvedRuntimeStatus(resolvedStatus);
  if (resolvedRuntimeStatus) {
    return resolvedRuntimeStatus;
  }
  if (action === "request_review") {
    return "waiting";
  }
  if (action === "assign" || action === "delegate" || action === "reassign") {
    return "queued";
  }
  if (action === "wait") {
    return timedOut ? "waiting" : "completed";
  }
  if (action === "resume" || action === "send_input") {
    return "running";
  }
  if (action === "stop") {
    return "aborted";
  }
  return "closed";
}

function resolveTeamControlTaskSurface(
  action: AgentUiTeamControlProjectionAction,
): AgentUiSurface {
  switch (action) {
    case "delegate":
      return "delegation_graph";
    case "request_review":
      return "review_lane";
    case "assign":
    case "reassign":
    default:
      return "work_board";
  }
}

function resolveTeamControlRuntimeEntity(
  input: AgentUiTeamControlProjectionInput,
): AgentUiRuntimeEntity {
  if (input.runtimeEntity) {
    return input.runtimeEntity;
  }
  return input.action === "assign" || input.action === "reassign"
    ? "work_item"
    : "subagent_turn";
}

export function buildAgentUiTeamControlProjectionEvents(
  input: AgentUiTeamControlProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const requestedSessionIds = normalizeProjectionIdList(
    input.requestedSessionIds,
  );
  const affectedSessionIds = normalizeProjectionIdList(
    input.affectedSessionIds,
  );
  const cascadeSessionIds = normalizeProjectionIdList(input.cascadeSessionIds);
  const workItemId = definedString(input.workItemId);
  const reviewId = definedString(input.reviewId);
  const previousAssigneeId = definedString(input.previousAssigneeId);
  const nextAssigneeId = definedString(input.nextAssigneeId);
  const reassignmentReason = truncateText(input.reassignmentReason);
  const fallbackTaskIds = normalizeProjectionIdList([workItemId, reviewId]);
  const taskSessionIds =
    affectedSessionIds.length > 0
      ? affectedSessionIds
      : requestedSessionIds.length > 0
        ? requestedSessionIds
        : fallbackTaskIds;
  const control = resolveTeamControl(input.action);
  const timedOut = input.timedOut === true;
  const phase = resolveTeamControlPhase(
    input.action,
    timedOut,
    input.resolvedStatus,
  );
  const runtimeStatus = resolveTeamControlRuntimeStatus(
    input.action,
    timedOut,
    input.resolvedStatus,
  );
  const taskSurface = resolveTeamControlTaskSurface(input.action);
  const runtimeEntity = resolveTeamControlRuntimeEntity(input);
  const timestamp = definedString(input.timestamp) ?? context.timestamp;
  const sessionId = definedString(input.sessionId ?? context.sessionId);
  const sharedPayload = compactProjectionFields({
    teamEvent: "team_control",
    taskEvent:
      input.action === "reassign" ? "team_reassignment" : "team_control",
    action: input.action,
    control,
    requestedSessionIds,
    affectedSessionIds,
    cascadeSessionIds,
    resolvedSessionId: definedString(input.resolvedSessionId),
    resolvedStatus: definedString(input.resolvedStatus),
    timedOut,
    messagePreview: truncateText(input.messagePreview),
    runtimeEntity,
    workItemId,
    reviewId,
    previousAssigneeId,
    nextAssigneeId,
    reassignmentReason,
  });

  const events: AgentUiProjectionEvent[] = [
    {
      sourceType: "team_control_projection",
      timestamp,
      sessionId,
      threadId: definedString(context.threadId),
      runId: definedString(context.runId),
      turnId: definedString(context.turnId),
      type: "team.changed",
      owner: "team",
      scope: "team",
      phase,
      surface: "team_policy",
      persistence: "snapshot",
      control,
      topology: "coordinator_team",
      payload: sharedPayload,
    },
    ...taskSessionIds.map<AgentUiProjectionEvent>((taskId) => ({
      sourceType: "team_control_projection",
      timestamp,
      sessionId,
      threadId: definedString(context.threadId),
      runId: definedString(context.runId),
      turnId: definedString(context.turnId),
      type: "task.changed",
      taskId,
      agentId: taskId,
      workItemId,
      reviewId,
      owner: "task",
      scope: "task",
      phase,
      surface: taskSurface,
      persistence: "snapshot",
      control,
      topology: "coordinator_team",
      runtimeEntity,
      runtimeStatus,
      latestTurnStatus: runtimeStatus,
      payload: {
        ...sharedPayload,
        taskId,
        runtimeEntity,
        runtimeStatus,
      },
    })),
  ];

  if (input.action === "resume" && runtimeEntity === "subagent_turn") {
    events.push(
      ...affectedSessionIds.map<AgentUiProjectionEvent>((taskId) => ({
        sourceType: "team_control_projection",
        timestamp,
        sessionId,
        threadId: definedString(context.threadId),
        runId: definedString(context.runId),
        turnId: definedString(context.turnId),
        type: "agent.handoff",
        taskId,
        agentId: taskId,
        handoffId: `${sessionId ?? "session"}:handoff:${taskId}`,
        parentSessionId: sessionId,
        owner: "agent",
        scope: "agent",
        phase: normalizeHandoffProjectionPhase("resumed"),
        surface: "handoff_lane",
        persistence: "snapshot",
        control,
        topology: "specialist_handoff",
        runtimeEntity,
        runtimeStatus,
        latestTurnStatus: runtimeStatus,
        payload: {
          ...sharedPayload,
          handoffEvent: "specialist_handoff",
          status: "resumed",
          sourceControl: "resume",
          from: sessionId,
          to: taskId,
          reason: "team_control_resume",
          resumeTarget: `agent-runtime://session/${taskId}`,
          contextBoundary: "subagent_session",
        },
      })),
    );
  }

  return sequenceEvents(events, context.sequence);
}

export function buildAgentUiRemoteTeammateProjectionEvents(
  input: AgentUiRemoteTeammateProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const artifactIds = input.artifactIds ?? [];
  const artifactPaths = input.artifactPaths ?? [];

  return buildAgentUiRemoteTaskProjectionEvents(
    {
      remoteTaskId: input.remoteTaskId,
      event: input.event,
      taskId: input.taskId,
      title: input.agentName ?? input.summaryPreview,
      inputSummary: input.summaryPreview,
      inputRequired: input.inputRequired,
      authRequired: input.authRequired,
      authStatus: input.event === "auth_required" ? "auth_required" : undefined,
      status: normalizeRemoteTeammateRuntimeStatus(input.status),
      agentCard: {
        id: input.agentCardId ?? input.agentId,
        name: input.agentName,
        provider: input.provider,
        url: input.agentCardUrl,
      },
      artifacts: artifactIds.map((artifactId, index) => ({
        artifactId,
        artifactPath: artifactPaths[index],
      })),
      timestamp: input.timestamp,
      sessionId: input.sessionId,
      threadId: input.threadId,
      runId: input.runId,
    },
    context,
  );
}

function normalizeRemoteTeammateRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus | null {
  switch (definedString(status)) {
    case "idle":
      return "idle";
    case "queued":
      return "queued";
    case "submitted":
      return "submitted";
    case "accepted":
      return "accepted";
    case "preparing":
      return "preparing";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "needs_input":
      return "needs_input";
    case "plan_ready":
      return "plan_ready";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "aborted":
      return "aborted";
    case "cancelled":
      return "cancelled";
    case "closed":
      return "closed";
    case "not_found":
      return "not_found";
    case "unknown":
      return "unknown";
    default:
      return null;
  }
}

export function buildAgentUiMetricChangedEvent(
  input: AgentUiMetricProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    type: "metric.changed",
    sourceType: "performance_metric",
    sequence: context.sequence,
    timestamp:
      context.timestamp ??
      (Number.isFinite(input.wallTime)
        ? new Date(input.wallTime).toISOString()
        : undefined),
    sessionId: definedString(input.sessionId ?? context.sessionId ?? undefined),
    threadId: definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: definedString(context.turnId ?? undefined),
    owner: "diagnostics",
    scope: input.sessionId ? "session" : "application",
    phase: "acting",
    surface: "diagnostics",
    persistence: "diagnostics_log",
    payload: {
      metricPhase: input.phase,
      at: input.at,
      wallTime: input.wallTime,
      workspaceId: definedString(input.workspaceId ?? undefined),
      source: definedString(input.source ?? undefined),
      requestId: definedString(input.requestId ?? undefined),
      actualSessionId: definedString(input.actualSessionId ?? undefined),
      metrics: input.metrics,
    },
  };
}
