import type {
  AgentEvent,
  AgentEventRuntimeStatus,
  AgentEventSubagentStatusChanged,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiSubagentStatusChangedEvents,
  buildAgentUiRuntimeTeamChangedEvent,
} from "@limecloud/agent-runtime-projection";

type SubagentProjectionEvent = Extract<
  AgentEvent,
  { type: "subagent_status_changed" }
>;

export function buildSubagentProjectionEvents(
  event: SubagentProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildSubagentStatusChangedEvents(event, context);
}

export function buildTeamChangedFromRuntimeStatusEvent(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent | null {
  return buildAgentUiRuntimeTeamChangedEvent(
    {
      sourceType: event.type,
      phase: event.status.phase,
      title: event.status.title,
      detail: event.status.detail,
      metadata: event.status.metadata,
    },
    context,
  );
}

export function buildSubagentStatusChangedEvents(
  event: AgentEventSubagentStatusChanged,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiSubagentStatusChangedEvents(
    {
      sourceType: event.type,
      session_id: event.session_id,
      root_session_id: event.root_session_id,
      parent_session_id: event.parent_session_id,
      status: event.status,
      latest_turn_id: event.latest_turn_id,
      latest_turn_status: event.latest_turn_status,
      queued_turn_count: event.queued_turn_count,
      team_phase: event.team_phase,
      team_parallel_budget: event.team_parallel_budget,
      team_active_count: event.team_active_count,
      team_queued_count: event.team_queued_count,
      provider_concurrency_group: event.provider_concurrency_group,
      provider_parallel_budget: event.provider_parallel_budget,
      queue_reason: event.queue_reason,
      retryable_overload: event.retryable_overload,
      closed: event.closed,
      usage: event.usage,
      duration_ms: event.duration_ms,
      tool_count: event.tool_count,
      result_ref: event.result_ref,
      metadata: event.metadata,
    },
    context,
  );
}
