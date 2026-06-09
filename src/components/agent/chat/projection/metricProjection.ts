import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { definedString } from "@limecloud/agent-runtime-projection";

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
