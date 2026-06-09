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
import {
  buildRoutingDecisionPayload,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

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

export function buildRoutingProjectionEvent(
  event: AgentUiRoutingProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "run.status",
    owner: "runtime",
    scope: "run",
    phase:
      event.type === "routing_not_possible" || event.type === "quota_blocked"
        ? "failed"
        : "routing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      runtimeEvent: event.type,
      ...buildRoutingPayload(event),
    },
  };
}

function buildRoutingPayload(
  event: AgentUiRoutingProjectionEvent,
): Record<string, unknown> {
  if (isRoutingDecisionEvent(event)) {
    return buildRoutingDecisionPayload(event);
  }
  if (isLimitStateEvent(event)) {
    return {
      limitStatus: event.limit_state.status,
      singleCandidateOnly: event.limit_state.singleCandidateOnly,
      providerLocked: event.limit_state.providerLocked,
      settingsLocked: event.limit_state.settingsLocked,
      oemLocked: event.limit_state.oemLocked,
      candidateCount: event.limit_state.candidateCount,
      capabilityGap: event.limit_state.capabilityGap,
      notes: event.limit_state.notes ?? [],
    };
  }
  return {
    limitEventKind: event.limit_event.eventKind,
    messagePreview: truncateText(event.limit_event.message),
    retryable: event.limit_event.retryable,
  };
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
