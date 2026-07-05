import type {
  AgentEvent,
  AgentEventCostEstimated,
  AgentEventCostRecorded,
  AgentEventWarning,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiCostMetricEvent,
  buildAgentUiWarningEvent,
} from "@limecloud/agent-runtime-projection";

type DiagnosticProjectionEvent = Extract<
  AgentEvent,
  {
    type: "warning" | "cost_estimated" | "cost_recorded";
  }
>;

export function buildDiagnosticProjectionEvents(
  event: DiagnosticProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  switch (event.type) {
    case "warning":
      return [buildWarningEvent(event, context)];
    case "cost_estimated":
    case "cost_recorded":
      return [buildCostMetricEvent(event, context)];
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function buildWarningEvent(
  event: AgentEventWarning,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiWarningEvent(
    {
      sourceType: event.type,
      code: event.code,
      message: event.message,
    },
    context,
  );
}

export function buildCostMetricEvent(
  event: AgentEventCostEstimated | AgentEventCostRecorded,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiCostMetricEvent(
    {
      sourceType: event.type,
      metricEvent: event.type,
      costState: event.cost_state,
    },
    context,
  );
}
