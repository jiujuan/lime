import type {
  AgentEventCostEstimated,
  AgentEventCostRecorded,
  AgentEventWarning,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { truncateText } from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

export function buildWarningEvent(
  event: AgentEventWarning,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
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
  };
}

export function buildCostMetricEvent(
  event: AgentEventCostEstimated | AgentEventCostRecorded,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
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
      cacheCreationInputTokens: event.cost_state.cacheCreationInputTokens,
    },
  };
}
