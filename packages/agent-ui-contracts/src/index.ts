export type AgentRuntimeExecutionEventKind =
  | "context"
  | "source"
  | "skill"
  | "tool"
  | "permission"
  | "sandbox"
  | "state"
  | "model"
  | "draft"
  | "handoff"
  | "action"
  | "evidence"
  | "note"
  | string;

export type AgentRuntimeExecutionEventStatus =
  | "pending"
  | "running"
  | "completed"
  | "blocked"
  | "failed"
  | string;

export type AgentRuntimeEventClass =
  | "session.created"
  | "turn.submitted"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "run.status"
  | "context.resolved"
  | "tool.started"
  | "tool.result"
  | "tool.failed"
  | "tool.catalog.resolved"
  | "permission.evaluated"
  | "permission.requested"
  | "permission.resolved"
  | "sandbox.applied"
  | "sandbox.violation"
  | "model.requested"
  | "model.delta"
  | "model.completed"
  | "model.failed"
  | "artifact.changed"
  | "action.required"
  | "action.resolved"
  | "runtime.error"
  | "evidence.changed"
  | "snapshot.updated"
  | string;

export type AgentRuntimeFactOwner = "runtime" | "artifact" | "evidence" | string;

export type AgentRuntimePhase =
  | "submitted"
  | "routing"
  | "preparing"
  | "waiting_provider"
  | "streaming"
  | "tool_running"
  | "action_required"
  | "failed"
  | "completed"
  | "blocked"
  | string;

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
  | "review.completed"
  | string;

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

export type AgentUiProjectionSourceType =
  | "action_required"
  | "action_resolved"
  | "artifact_snapshot"
  | "automation_job_projection"
  | "evidence_projection"
  | "hydration_projection"
  | "performance_metric"
  | "queue_added"
  | "remote_task_projection"
  | "runtime_status"
  | "team_control_projection"
  | "team_formation_projection"
  | "text_delta"
  | "thinking_delta"
  | "tool_end"
  | "tool_input_delta"
  | "tool_output_delta"
  | "tool_progress"
  | "tool_start"
  | string;

export interface AgentUiProjectionRefs {
  artifactIds?: string[];
  artifactPaths?: string[];
  contextSourceIds?: string[];
  teamMemoryKeys?: string[];
  diagnosticKeys?: string[];
  rawEventRef?: string;
}

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

export interface AgentRuntimeExecutionEvent {
  id: string;
  kind: AgentRuntimeExecutionEventKind;
  status: AgentRuntimeExecutionEventStatus;
  eventClass?: AgentRuntimeEventClass;
  owner?: AgentRuntimeFactOwner;
  schemaVersion?: string;
  sequence?: number;
  runtimeId?: string;
  threadId?: string;
  turnId?: string;
  taskId?: string;
  runId?: string;
  stepId?: string;
  toolCallId?: string;
  actionId?: string;
  traceId?: string;
  spanId?: string;
  attemptId?: string;
  artifactId?: string;
  evidenceId?: string;
  phase?: AgentRuntimePhase;
  title: string;
  detail?: string;
  refIds?: string[];
  artifactRefs?: string[];
  evidenceRefs?: string[];
  payload?: Record<string, unknown>;
  model?: string;
  createdAt: string;
  completedAt?: string;
}

export type AgentRuntimeActionKind = "add-input-source" | "configure-text-model" | string;

export type AgentRuntimeActionDecision =
  | "open-input-source"
  | "open-model-settings"
  | "acknowledge";

export type AgentRuntimeActionLabelKey =
  | "agent.action.addInputSource"
  | "agent.action.configureTextModel"
  | "agent.action.acknowledge"
  | string;

export type AgentRuntimeDisplayStatusKey =
  | "agent.status.pending"
  | "agent.status.running"
  | "agent.status.completed"
  | "agent.status.blocked"
  | "agent.status.failed"
  | "agent.status.actionRequired"
  | "agent.status.actionResolved"
  | string;

export type AgentRuntimeSurface =
  | "runtime-status"
  | "human-action"
  | "tool"
  | "permission"
  | "artifact"
  | "evidence"
  | "context"
  | "message";

export interface AgentRuntimeActionProjection {
  actionKind: AgentRuntimeActionKind;
  targetModule: string;
  labelKey: AgentRuntimeActionLabelKey;
  buttonLabel?: string;
  decision: AgentRuntimeActionDecision;
}

export interface AgentRuntimeEventProjection<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  id: string;
  source: TEvent;
  surface: AgentRuntimeSurface;
  title: string;
  detail?: string;
  status: TEvent["status"];
  displayStatusKey: AgentRuntimeDisplayStatusKey;
  displayStatus?: string;
  action?: AgentRuntimeActionProjection;
  actionId?: string;
  resolved: boolean;
  actionKind: string;
  targetModule: string;
}

export interface AgentRuntimeReadModel<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  events: AgentRuntimeEventProjection<TEvent>[];
  visibleEvents: AgentRuntimeEventProjection<TEvent>[];
  pendingActions: AgentRuntimeEventProjection<TEvent>[];
  inputSourceRecovery: boolean;
  sourceCount: number;
  artifactRefs: string[];
  evidenceRefs: string[];
  taskRefs: string[];
}

export interface AgentRuntimeProjectionInput<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  executionEvents?: TEvent[];
  sourceCount?: number;
}

export type UIMessagePartKind =
  | "text"
  | "reasoning"
  | "tool-preview"
  | "artifact-card"
  | "evidence-citation"
  | "diagnostic-ref"
  | string;

export type UIMessagePartState = "streaming" | "final" | "available" | "failed" | "unknown" | string;

export interface UIMessagePart {
  type: UIMessagePartKind;
  partId: string;
  messageId?: string;
  role?: "user" | "assistant" | "system" | string;
  text?: string;
  state?: UIMessagePartState;
  toolCallId?: string;
  artifactId?: string;
  evidenceId?: string;
  diagnosticId?: string;
  sourceEventId: string;
  createdAt?: string;
  refs?: string[];
}

export type UIMessageParts = UIMessagePart[];

export type ProcessTimelineEntryKind =
  | "status"
  | "reasoning"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "task"
  | "diagnostic"
  | "message"
  | string;

export interface ProcessTimelineEntry {
  entryId: string;
  sequence?: number;
  kind: ProcessTimelineEntryKind;
  phase?: AgentRuntimePhase;
  owner?: AgentRuntimeFactOwner;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  detail?: string;
  refs: string[];
  sourceEventId: string;
  createdAt: string;
  completedAt?: string;
}

export type ProcessTimeline = ProcessTimelineEntry[];

export type ExecutionGraphNodeType =
  | "turn"
  | "run"
  | "task"
  | "subagent"
  | "job"
  | "attempt"
  | "step"
  | "tool"
  | "action"
  | string;

export interface ExecutionGraphNode {
  nodeId: string;
  parentId?: string;
  nodeType: ExecutionGraphNodeType;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  refs: string[];
  sourceEventIds: string[];
  createdAt?: string;
  completedAt?: string;
}

export type ExecutionGraph = ExecutionGraphNode[];

export type AgentUiHydrationStatus = "idle" | "hydrating" | "live" | "stale" | "repairing" | "degraded";

export interface AgentUiRuntimeStatusView {
  status: "idle" | "running" | "waiting" | "blocked" | "completed" | "failed" | "stale";
  activeTurnId?: string;
  activeRunId?: string;
  activeTaskId?: string;
  latestEventId?: string;
  latestSequence?: number;
}

export interface AgentUiRefView {
  id: string;
  sourceEventId: string;
}

export interface AgentUiDiagnosticView {
  id: string;
  sourceEventId: string;
  title: string;
  detail?: string;
  status: AgentRuntimeExecutionEventStatus;
}

export interface AgentUiProjectionState<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  runtime: AgentUiRuntimeStatusView;
  messages: UIMessageParts;
  timeline: ProcessTimeline;
  graph: ExecutionGraph;
  tools: AgentRuntimeEventProjection<TEvent>[];
  actions: AgentRuntimeEventProjection<TEvent>[];
  artifacts: AgentUiRefView[];
  evidence: AgentUiRefView[];
  diagnostics: AgentUiDiagnosticView[];
  readModel: AgentRuntimeReadModel<TEvent>;
  hydration: {
    status: AgentUiHydrationStatus;
    eventCount: number;
  };
  ephemeralUi: Record<string, unknown>;
}

export interface AgentUiProjector<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
  getState(): AgentUiProjectionState<TEvent>;
  hydrate(input?: AgentRuntimeProjectionInput<TEvent>): AgentUiProjectionState<TEvent>;
  apply(event: TEvent): AgentUiProjectionState<TEvent>;
  reset(): AgentUiProjectionState<TEvent>;
}
