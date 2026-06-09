import type {
  AgentEvent,
  AgentEventRuntimeStatus,
  AgentEventTaskProfileResolved,
  AgentEventTurnCompleted,
  AgentEventTurnFailed,
  AgentEventTurnStarted,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildTeamRuntimeFacts,
  compactProjectionFields,
  metadataKeys,
  normalizeRuntimePhaseFromRuntimeStatusPhase as normalizeRuntimePhase,
  normalizeRuntimeStatusFromRuntimePhase as normalizeRuntimeStatusFromPhase,
  truncateText,
} from "@limecloud/agent-runtime-projection";
import { buildPermissionChangedEvent } from "./permissionProjection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";
import { buildTeamChangedFromRuntimeStatusEvent } from "./subagentStatusProjection";

export function buildThreadStartedEvent(
  event: Extract<AgentEvent, { type: "thread_started" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "session.opened",
    threadId: event.thread_id,
    owner: "session",
    scope: "thread",
    phase: "accepted",
    surface: "session_tabs",
    persistence: "snapshot",
  };
}

export function buildTurnStartedEvent(
  event: AgentEventTurnStarted,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "run.started",
    threadId: event.turn.thread_id,
    turnId: event.turn.id,
    owner: "runtime",
    scope: "turn",
    phase: "accepted",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      status: event.turn.status,
      promptLength: event.turn.prompt_text.length,
    },
  };
}

export function buildRunFinishedEvent(
  event: AgentEventTurnCompleted | Extract<AgentEvent, { type: "done" | "final_done" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "run.finished",
    owner: "runtime",
    scope: "run",
    phase: "completed",
    surface: "runtime_status",
    persistence: "archive",
  };
}

export function buildRunFailedEvent(
  event: AgentEventTurnFailed | Extract<AgentEvent, { type: "error" }>,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "run.failed",
    owner: "runtime",
    scope: "run",
    phase: "failed",
    surface: "runtime_status",
    persistence: "archive",
    payload:
      event.type === "error"
        ? { errorPreview: truncateText(event.message) }
        : { errorPreview: truncateText(event.turn.error_message) },
  };
}

export function buildRuntimeStatusEvents(
  event: AgentEventRuntimeStatus,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildBase(event, context);
  const teamRuntimeFacts = compactProjectionFields(
    buildTeamRuntimeFacts(event.status.metadata),
  );
  return [
    {
      ...base,
      type: "run.status",
      owner: "runtime",
      scope: "run",
      phase: normalizeRuntimePhase(event.status.phase),
      surface: "runtime_status",
      persistence: "ephemeral_live",
      runtimeStatus: normalizeRuntimeStatusFromPhase(event.status.phase),
      latestTurnStatus: normalizeRuntimeStatusFromPhase(event.status.phase),
      ...teamRuntimeFacts,
      payload: {
        runtimeEntity: base.runtimeEntity,
        title: event.status.title,
        detailPreview: truncateText(event.status.detail),
        sourcePhase: event.status.phase,
        checkpointCount: event.status.checkpoints?.length ?? 0,
        metadataKeys: metadataKeys(event.status.metadata),
        ...teamRuntimeFacts,
      },
    },
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
  return {
    ...buildBase(event, context),
    type: "run.status",
    owner: "runtime",
    scope: "run",
    phase: "routing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      model: event.model,
      mode: event.mode,
    },
  };
}

export function buildTaskProfileResolvedEvent(
  event: AgentEventTaskProfileResolved,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "task.changed",
    owner: "task",
    scope: "run",
    phase: "routing",
    surface: "task_capsule",
    persistence: "snapshot",
    payload: {
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
  };
}
