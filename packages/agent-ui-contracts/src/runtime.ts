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
  | "canceled"
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

export type AgentRuntimeFactOwner =
  | "runtime"
  | "artifact"
  | "evidence"
  | string;

export type AgentRuntimePhase =
  | "submitted"
  | "routing"
  | "preparing"
  | "waiting_provider"
  | "streaming"
  | "tool_running"
  | "action_required"
  | "failed"
  | "canceled"
  | "completed"
  | "blocked"
  | string;

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
  subagentId?: string;
  runId?: string;
  stepId?: string;
  toolCallId?: string;
  actionId?: string;
  workerId?: string;
  channelId?: string;
  handoffId?: string;
  reviewId?: string;
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

export type AgentRuntimeJsonPatchOperation =
  | {
      op: "add" | "replace" | "test";
      path: string;
      value: unknown;
    }
  | {
      op: "remove";
      path: string;
    }
  | {
      op: "move" | "copy";
      path: string;
      from: string;
    };

export interface AgentRuntimeStateDelta {
  schemaVersion: "lime-runtime-state-delta/v0.1" | string;
  runtimeId: string;
  threadId?: string;
  turnId?: string;
  sequence: number;
  baseEventId?: string;
  target: "projection" | "readModel" | "runtime" | string;
  patch: AgentRuntimeJsonPatchOperation[];
  createdAt: string;
}

export type AgentRuntimeActionKind =
  | "add-input-source"
  | "configure-text-model"
  | string;

export type AgentRuntimeActionDecision =
  | "open-input-source"
  | "open-model-settings"
  | "acknowledge"
  | string;

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
  | "agent.status.canceled"
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

export interface AgentRuntimeEventProjection<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  id: string;
  source: TEvent;
  surface: AgentRuntimeSurface;
  title: string;
  detail?: string;
  status: TEvent["status"];
  displayStatusKey: AgentRuntimeDisplayStatusKey;
  displayStatus?: string;
  action?: AgentRuntimeActionProjection;
  actions?: AgentRuntimeActionProjection[];
  actionId?: string;
  resolved: boolean;
  actionKind: string;
  targetModule: string;
}

export interface AgentRuntimeReadModel<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  events: AgentRuntimeEventProjection<TEvent>[];
  visibleEvents: AgentRuntimeEventProjection<TEvent>[];
  pendingActions: AgentRuntimeEventProjection<TEvent>[];
  inputSourceRecovery: boolean;
  sourceCount: number;
  artifactRefs: string[];
  evidenceRefs: string[];
  taskRefs: string[];
}

export interface AgentRuntimeProjectionInput<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  executionEvents?: TEvent[];
  sourceCount?: number;
}
