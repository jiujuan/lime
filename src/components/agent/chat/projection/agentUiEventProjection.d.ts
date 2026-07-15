import type { AgentEvent } from "@/lib/api/agentProtocol";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import type { AutomationJobRecord } from "@/lib/api/automation";
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
export interface AgentUiProjectionOptions {
  soulCopy?: SoulInteractionCopy;
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
export declare function buildAgentUiProjectionEvents(
  event: AgentEvent,
  context?: AgentUiProjectionContext,
  options?: AgentUiProjectionOptions,
): AgentUiProjectionEvent[];
export declare function buildAgentUiEvidenceChangedEvent(
  input: AgentUiEvidenceProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent;
export declare function buildAgentUiReviewProjectionEvents(
  input: AgentUiReviewProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent[];
export declare function buildAgentUiHandoffProjectionEvents(
  input: AgentUiHandoffProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent[];
export declare function buildAgentUiAutomationJobProjectionEvents(
  input: AgentUiAutomationJobProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent[];
export declare function buildAgentUiTeamControlProjectionEvents(
  input: AgentUiTeamControlProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent[];
export declare function buildAgentUiRemoteTeammateProjectionEvents(
  input: AgentUiRemoteTeammateProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent[];
export declare function buildAgentUiMetricChangedEvent(
  input: AgentUiMetricProjectionInput,
  context?: AgentUiProjectionContext,
): AgentUiProjectionEvent;
export {};
