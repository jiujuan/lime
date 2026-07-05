import type {
  AgentEvent,
  AgentEventLimitStateUpdated,
  AgentEventQuotaBlocked,
  AgentEventQuotaLow,
  AgentEventRateLimitHit,
  AgentEventSingleCandidateCapabilityGap,
  AgentEventSingleCandidateOnly,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { buildAgentUiRoutingStatusEvent } from "@limecloud/agent-runtime-projection";

type RoutingDecisionEvent = Extract<
  AgentEvent,
  {
    type:
      | "candidate_set_resolved"
      | "routing_decision_made"
      | "routing_fallback_applied"
      | "routing_not_possible";
  }
>;

type LimitStateEvent =
  | AgentEventLimitStateUpdated
  | AgentEventSingleCandidateOnly
  | AgentEventSingleCandidateCapabilityGap;

type LimitEvent = AgentEventRateLimitHit | AgentEventQuotaLow | AgentEventQuotaBlocked;

export type AgentUiRoutingProjectionEvent =
  | RoutingDecisionEvent
  | LimitStateEvent
  | LimitEvent;

export function buildRoutingProjectionEvents(
  event: AgentUiRoutingProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return [buildRoutingProjectionEvent(event, context)];
}

export function buildRoutingProjectionEvent(
  event: AgentUiRoutingProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  if (isRoutingDecisionEvent(event)) {
    return buildAgentUiRoutingStatusEvent(
      {
        sourceType: event.type,
        runtimeEvent: event.type,
        routingDecision: event.routing_decision,
      },
      context,
    );
  }
  if (isLimitStateEvent(event)) {
    return buildAgentUiRoutingStatusEvent(
      {
        sourceType: event.type,
        runtimeEvent: event.type,
        limitState: event.limit_state,
      },
      context,
    );
  }
  return buildAgentUiRoutingStatusEvent(
    {
      sourceType: event.type,
      runtimeEvent: event.type,
      limitEvent: event.limit_event,
    },
    context,
  );
}

function isRoutingDecisionEvent(
  event: AgentUiRoutingProjectionEvent,
): event is RoutingDecisionEvent {
  return (
    event.type === "candidate_set_resolved" ||
    event.type === "routing_decision_made" ||
    event.type === "routing_fallback_applied" ||
    event.type === "routing_not_possible"
  );
}

function isLimitStateEvent(
  event: AgentUiRoutingProjectionEvent,
): event is LimitStateEvent {
  return (
    event.type === "limit_state_updated" ||
    event.type === "single_candidate_only" ||
    event.type === "single_candidate_capability_gap"
  );
}
