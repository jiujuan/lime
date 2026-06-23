import type { AgentEvent } from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildActionRequiredEvent,
  buildActionResolvedEvent,
} from "./actionProjection";
import {
  buildArtifactEvent,
  buildContextTraceEvent,
} from "./artifactProjection";
import {
  buildRequestedFixExecutionEventsFromArtifact,
} from "./evidenceProjection";
import {
  buildMessageSnapshotEvent,
  buildTextDeltaEvent,
  buildThinkingDeltaEvent,
} from "./conversationEventProjection";
import { buildTurnContextEvents } from "./contextProjection";
import {
  buildCostMetricEvent,
  buildWarningEvent,
} from "./diagnosticProjection";
import { sequenceProjectionEvents as sequenceEvents } from "./projectionBase";
import {
  buildQueueAddedEvents,
  buildQueueLifecycleEvents,
} from "./queueProjection";
import { buildRoutingProjectionEvent } from "./routingProjection";
import {
  buildModelEffectiveEvent,
  buildModelChangeEvent,
  buildRunCanceledEvent,
  buildRunFailedEvent,
  buildRunFinishedEvent,
  buildRuntimeStatusEvents,
  buildTaskProfileResolvedEvent,
  buildThreadStartedEvent,
  buildTurnStartedEvent,
} from "./runtimeLifecycleProjection";
import {
  buildSubagentStatusChangedEvents,
} from "./subagentStatusProjection";
import { buildThreadItemEvents } from "./threadItemProjection";
import {
  buildToolEndEvents,
  buildToolInputDeltaEvent,
  buildToolOutputDeltaEvent,
  buildToolProgressEvent,
  buildToolStartEvents,
} from "./toolEventProjection";

export type {
  AgentUiControl,
  AgentUiEventClass,
  AgentUiOwner,
  AgentUiPersistence,
  AgentUiPhase,
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionRefs,
  AgentUiProjectionSourceType,
  AgentUiRuntimeEntity,
  AgentUiRuntimeStatus,
  AgentUiScope,
  AgentUiSurface,
  AgentUiTopology,
} from "@limecloud/agent-ui-contracts";

export type {
  AgentUiEvidenceProjectionInput,
  AgentUiHandoffProjectionInput,
  AgentUiRequestedFixExecutionResult,
  AgentUiRequestedFixExecutionStatus,
  AgentUiReviewProjectionInput,
} from "./evidenceProjection";

export {
  buildAgentUiEvidenceChangedEvent,
  buildAgentUiHandoffProjectionEvents,
  buildAgentUiReviewProjectionEvents,
} from "./evidenceProjection";

export type {
  AgentUiAutomationJobProjectionEvent,
  AgentUiAutomationJobProjectionInput,
} from "./automationJobProjection";

export { buildAgentUiAutomationJobProjectionEvents } from "./automationJobProjection";

export type {
  AgentUiTeamControlProjectionAction,
  AgentUiTeamControlProjectionInput,
} from "./teamControlProjection";

export { buildAgentUiTeamControlProjectionEvents } from "./teamControlProjection";

export type { AgentUiMetricProjectionInput } from "./metricProjection";
export { buildAgentUiMetricChangedEvent } from "./metricProjection";

export type {
  AgentUiRemoteTeammateProjectionEvent,
  AgentUiRemoteTeammateProjectionInput,
} from "./remoteTeammateProjection";

export {
  buildAgentUiRemoteTeammateProjectionEvents,
} from "./remoteTeammateProjection";

export function buildAgentUiProjectionEvents(
  event: AgentEvent,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const events: AgentUiProjectionEvent[] = (() => {
    switch (event.type) {
      case "thread_started":
        return [buildThreadStartedEvent(event, context)];
      case "turn_started":
        return [buildTurnStartedEvent(event, context)];
      case "item_started":
      case "item_updated":
      case "item_completed":
        return buildThreadItemEvents(event.type, event.item, context);
      case "turn_completed":
        return [buildRunFinishedEvent(event, context)];
      case "turn_canceled":
        return [buildRunCanceledEvent(event, context)];
      case "turn_failed":
      case "error":
        return [buildRunFailedEvent(event, context)];
      case "message":
        return [buildMessageSnapshotEvent(event, context)];
      case "text_delta":
      case "text_delta_batch":
        return [buildTextDeltaEvent(event, context)];
      case "thinking_delta":
      case "reasoning_delta":
      case "reasoning_final":
        return [buildThinkingDeltaEvent(event, context)];
      case "reasoning_started":
      case "reasoning_ended":
        return [];
      case "runtime_status":
        return buildRuntimeStatusEvents(event, context);
      case "tool_start":
        return buildToolStartEvents(event, context);
      case "tool_end":
        return buildToolEndEvents(event, context);
      case "tool_progress":
        return [buildToolProgressEvent(event, context)];
      case "tool_output_delta":
        return [buildToolOutputDeltaEvent(event, context)];
      case "tool_input_delta":
        return [buildToolInputDeltaEvent(event, context)];
      case "artifact_snapshot":
        return [
          buildArtifactEvent(event, context),
          ...buildRequestedFixExecutionEventsFromArtifact(event, context),
        ];
      case "action_required":
        return [buildActionRequiredEvent(event, context)];
      case "action_resolved":
        return [buildActionResolvedEvent(event, context)];
      case "context_trace":
        return [buildContextTraceEvent(event, context)];
      case "turn_context":
        return buildTurnContextEvents(event, context);
      case "queue_added":
        return buildQueueAddedEvents(event, context);
      case "queue_removed":
      case "queue_started":
      case "queue_cleared":
        return buildQueueLifecycleEvents(event, context);
      case "subagent_status_changed":
        return buildSubagentStatusChangedEvents(event, context);
      case "model_change":
        return [buildModelChangeEvent(event, context)];
      case "model_effective":
        return [buildModelEffectiveEvent(event, context)];
      case "task_profile_resolved":
        return [buildTaskProfileResolvedEvent(event, context)];
      case "warning":
        return [buildWarningEvent(event, context)];
      case "cost_estimated":
      case "cost_recorded":
        return [buildCostMetricEvent(event, context)];
      case "candidate_set_resolved":
      case "routing_decision_made":
      case "routing_fallback_applied":
      case "routing_not_possible":
      case "limit_state_updated":
      case "single_candidate_only":
      case "single_candidate_capability_gap":
      case "rate_limit_hit":
      case "quota_low":
      case "quota_blocked":
        return [buildRoutingProjectionEvent(event, context)];
      default:
        return [];
    }
  })();

  return sequenceEvents(events, context.sequence);
}
