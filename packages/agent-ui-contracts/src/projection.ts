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
}

export interface AgentUiDiagnosticView {
  id: string;
  sourceEventId: string;
  title: string;
  detail?: string;
  status: AgentRuntimeExecutionEventStatus;
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
