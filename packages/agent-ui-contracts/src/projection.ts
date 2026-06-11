import type { ExecutionGraph } from "./graph";
import type { UIMessageParts } from "./messages";
import type {
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentRuntimeExecutionEventStatus,
  AgentRuntimeProjectionInput,
  AgentRuntimeReadModel,
} from "./runtime";
import type { ProcessTimeline } from "./timeline";

export type AgentUiHydrationStatus =
  | "idle"
  | "hydrating"
  | "live"
  | "stale"
  | "repairing"
  | "degraded";

export interface AgentUiRuntimeStatusView {
  status:
    | "idle"
    | "running"
    | "waiting"
    | "blocked"
    | "completed"
    | "failed"
    | "stale";
  activeTurnId?: string;
  activeRunId?: string;
  activeTaskId?: string;
  latestEventId?: string;
  latestSequence?: number;
}

export interface AgentUiRefView {
  id: string;
  sourceEventId: string;
  title?: string;
  status?: AgentRuntimeExecutionEventStatus;
  owner?: "artifact" | "evidence" | "runtime" | "ui" | string;
  path?: string;
  contentRef?: string;
  mimeType?: string;
  preview?: string;
  metadata?: Record<string, unknown>;
}

export type AgentUiArtifactRefView = AgentUiRefView;

export type AgentUiEvidenceRefView = AgentUiRefView;

export interface AgentUiDiagnosticView {
  id: string;
  sourceEventId: string;
  title: string;
  detail?: string;
  status: AgentRuntimeExecutionEventStatus;
}

export type AgentUiSubagentCommand =
  | "open_detail"
  | "send_input"
  | "interrupt"
  | "close"
  | "wait"
  | string;

export interface AgentUiSubagentIsolationView {
  runtimeProfileId?: string;
  modelProfileId?: string;
  isolationProfileId?: string;
  workspaceRef?: string;
  permissionProfile?: string;
  sandboxProfile?: string;
  forkPolicy?: string;
  depth?: number;
  canDelegate?: boolean;
}

export interface AgentUiSubagentThreadView {
  threadId: string;
  subagentId: string;
  parentThreadId?: string;
  parentTaskId?: string;
  taskId?: string;
  taskPath?: string;
  role?: string;
  nickname?: string;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  summary?: string;
  promptPreview?: string;
  lastActivityAt?: string;
  createdAt?: string;
  completedAt?: string;
  artifactRefs: string[];
  evidenceRefs: string[];
  sourceEventIds: string[];
  isolation?: AgentUiSubagentIsolationView;
}

export interface AgentUiSubagentDelegationView {
  callId: string;
  sourceEventId: string;
  action: "spawn" | "handoff" | "send_input" | "wait" | "interrupt" | "close" | string;
  parentThreadId?: string;
  targetThreadIds: string[];
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  promptPreview?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface AgentUiSubagentActivityView {
  activityId: string;
  threadId: string;
  sourceEventId: string;
  kind:
    | "started"
    | "updated"
    | "interacted"
    | "handoff"
    | "review"
    | "completed"
    | "interrupted"
    | "failed"
    | string;
  status: AgentRuntimeExecutionEventStatus;
  title: string;
  createdAt?: string;
}

export interface AgentUiSubagentsModel {
  hasSubagents: boolean;
  threads: AgentUiSubagentThreadView[];
  delegationCalls: AgentUiSubagentDelegationView[];
  activities: AgentUiSubagentActivityView[];
  activeThreadIds: string[];
  completedThreadIds: string[];
  failedThreadIds: string[];
}

export interface AgentUiProjectionState<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  runtime: AgentUiRuntimeStatusView;
  messages: UIMessageParts;
  timeline: ProcessTimeline;
  graph: ExecutionGraph;
  tools: AgentRuntimeEventProjection<TEvent>[];
  actions: AgentRuntimeEventProjection<TEvent>[];
  artifacts: AgentUiArtifactRefView[];
  evidence: AgentUiEvidenceRefView[];
  diagnostics: AgentUiDiagnosticView[];
  subagents: AgentUiSubagentsModel;
  readModel: AgentRuntimeReadModel<TEvent>;
  hydration: {
    status: AgentUiHydrationStatus;
    eventCount: number;
  };
  ephemeralUi: Record<string, unknown>;
}

export interface AgentUiProjector<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  getState(): AgentUiProjectionState<TEvent>;
  hydrate(
    input?: AgentRuntimeProjectionInput<TEvent>,
  ): AgentUiProjectionState<TEvent>;
  apply(event: TEvent): AgentUiProjectionState<TEvent>;
  reset(): AgentUiProjectionState<TEvent>;
}
