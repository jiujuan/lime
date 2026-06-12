import type {
  AgentEvent,
  AgentEventRuntimeStatus,
  AgentEventTaskProfileResolved,
  AgentEventTurnCanceled,
  AgentEventTurnCompleted,
  AgentEventTurnFailed,
  AgentEventTurnStarted,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiModelChangeEvent,
  buildAgentUiRunCanceledEvent,
  buildAgentUiRunFailedEvent,
  buildAgentUiRunFinishedEvent,
  buildAgentUiRunStartedEvent,
  buildAgentUiRuntimeStatusEvent,
  buildAgentUiTaskProfileResolvedEvent,
  buildAgentUiThreadStartedEvent,
} from "@limecloud/agent-runtime-projection";
import { buildPermissionChangedEvent } from "./permissionProjection";
import { buildTeamChangedFromRuntimeStatusEvent } from "./subagentStatusProjection";

export function buildThreadStartedEvent(
  event: Extract<AgentEvent, { type: "thread_started" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiThreadStartedEvent(
    {
      sourceType: event.type,
      threadId: event.thread_id,
    },
    context,
  );
}

export function buildTurnStartedEvent(
  event: AgentEventTurnStarted,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiRunStartedEvent(
    {
      sourceType: event.type,
      threadId: event.turn.thread_id,
      turnId: event.turn.id,
      status: event.turn.status,
      promptText: event.turn.prompt_text,
    },
    context,
  );
}

export function buildRunFinishedEvent(
  event: AgentEventTurnCompleted,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiRunFinishedEvent({ sourceType: event.type }, context);
}

export function buildRunCanceledEvent(
  event: AgentEventTurnCanceled,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiRunCanceledEvent({ sourceType: event.type }, context);
}

export function buildRunFailedEvent(
  event: AgentEventTurnFailed | Extract<AgentEvent, { type: "error" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiRunFailedEvent(
    {
      sourceType: event.type,
      errorMessage:
        event.type === "error" ? event.message : event.turn.error_message,
    },
    context,
  );
}

export function buildRuntimeStatusEvents(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return [
    buildAgentUiRuntimeStatusEvent(
      {
        sourceType: event.type,
        phase: event.status.phase,
        title: event.status.title,
        detail: event.status.detail,
        checkpoints: event.status.checkpoints,
        metadata: event.status.metadata,
      },
      context,
    ),
    buildPermissionChangedEvent(event, context),
    buildTeamChangedFromRuntimeStatusEvent(event, context),
  ].filter((projectionEvent): projectionEvent is AgentUiProjectionEvent =>
    Boolean(projectionEvent),
  );
}

export function buildModelChangeEvent(
  event: Extract<AgentEvent, { type: "model_change" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiModelChangeEvent(
    {
      sourceType: event.type,
      model: event.model,
      mode: event.mode,
    },
    context,
  );
}

export function buildTaskProfileResolvedEvent(
  event: AgentEventTaskProfileResolved,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiTaskProfileResolvedEvent(
    {
      sourceType: event.type,
      kind: event.task_profile.kind,
      source: event.task_profile.source,
      traits: event.task_profile.traits ?? [],
      modalityContractKey: event.task_profile.modalityContractKey,
      routingSlot: event.task_profile.routingSlot,
      executionProfileKey: event.task_profile.executionProfileKey,
      executorAdapterKey: event.task_profile.executorAdapterKey,
      executorKind: event.task_profile.executorKind,
      executorBindingKey: event.task_profile.executorBindingKey,
      permissionProfileKeys: event.task_profile.permissionProfileKeys ?? [],
      userLockPolicy: event.task_profile.userLockPolicy,
      serviceModelSlot: event.task_profile.serviceModelSlot,
      sceneKind: event.task_profile.sceneKind,
      sceneSkillId: event.task_profile.sceneSkillId,
      entrySource: event.task_profile.entrySource,
    },
    context,
  );
}
