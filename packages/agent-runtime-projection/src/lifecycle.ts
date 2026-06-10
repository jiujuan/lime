import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  compactProjectionFields,
  definedString,
  metadataKeys,
  truncateText,
} from "./normalization.js";
import {
  buildTeamRuntimeFacts,
  hasTeamRuntimeMetadata,
  type AgentRuntimeStatusPhase,
  type AgentUiTeamRuntimeMetadata,
  normalizeRuntimePhaseFromRuntimeStatusPhase,
  normalizeRuntimeStatusFromRuntimePhase,
  normalizeTeamRuntimePhase,
  resolveTeamTopology,
} from "./runtimeFacts.js";

export interface AgentUiRunStartedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  threadId?: string | null;
  turnId?: string | null;
  status?: string | null;
  promptText?: string | null;
}

export interface AgentUiThreadStartedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  threadId?: string | null;
}

export interface AgentUiRunFinishedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
}

export interface AgentUiRunFailedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  errorMessage?: string | null;
}

export interface AgentUiRuntimeStatusProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  phase:
    | "preparing"
    | "routing"
    | "context"
    | "permission_review"
    | "failed"
    | string;
  title?: string | null;
  detail?: string | null;
  checkpoints?: readonly unknown[] | null;
  metadata?: AgentUiTeamRuntimeMetadata | null;
}

export interface AgentUiRuntimeTeamChangedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  phase: AgentRuntimeStatusPhase;
  title?: string | null;
  detail?: string | null;
  metadata?: AgentUiTeamRuntimeMetadata | null;
}

export interface AgentUiModelChangeProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  model?: string | null;
  mode?: string | null;
}

export interface AgentUiTaskProfileProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  kind?: string | null;
  source?: string | null;
  traits?: readonly string[] | null;
  modalityContractKey?: string | null;
  routingSlot?: string | null;
  executionProfileKey?: string | null;
  executorAdapterKey?: string | null;
  executorKind?: string | null;
  executorBindingKey?: string | null;
  permissionProfileKeys?: readonly string[] | null;
  userLockPolicy?: string | null;
  serviceModelSlot?: string | null;
  sceneKind?: string | null;
  sceneSkillId?: string | null;
  entrySource?: string | null;
}

export function buildAgentUiThreadStartedEvent(
  input: AgentUiThreadStartedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "thread_started" },
      context,
    ),
    type: "session.opened",
    threadId:
      definedString(input.threadId ?? undefined) ??
      definedString(context.threadId ?? undefined),
    owner: "session",
    scope: "thread",
    phase: "accepted",
    surface: "session_tabs",
    persistence: "snapshot",
  };
}

export function buildAgentUiRunStartedEvent(
  input: AgentUiRunStartedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "turn_started" },
      context,
    ),
    type: "run.started",
    threadId:
      definedString(input.threadId ?? undefined) ??
      definedString(context.threadId ?? undefined),
    turnId:
      definedString(input.turnId ?? undefined) ??
      definedString(context.turnId ?? undefined),
    owner: "runtime",
    scope: "turn",
    phase: "accepted",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      status: definedString(input.status ?? undefined),
      promptLength: input.promptText?.length ?? 0,
    },
  };
}

export function buildAgentUiRunFinishedEvent(
  input: AgentUiRunFinishedProjectionInput = {},
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "turn_completed" },
      context,
    ),
    type: "run.finished",
    owner: "runtime",
    scope: "run",
    phase: "completed",
    surface: "runtime_status",
    persistence: "archive",
  };
}

export function buildAgentUiRunFailedEvent(
  input: AgentUiRunFailedProjectionInput = {},
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "turn_failed" },
      context,
    ),
    type: "run.failed",
    owner: "runtime",
    scope: "run",
    phase: "failed",
    surface: "runtime_status",
    persistence: "archive",
    payload: {
      errorPreview: truncateText(input.errorMessage),
    },
  };
}

export function buildAgentUiRuntimeStatusEvent(
  input: AgentUiRuntimeStatusProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "runtime_status" },
    context,
  );
  const teamRuntimeFacts = compactProjectionFields(
    buildTeamRuntimeFacts(input.metadata ?? undefined),
  );
  return {
    ...base,
    type: "run.status",
    owner: "runtime",
    scope: "run",
    phase: normalizeRuntimePhaseFromRuntimeStatusPhase(input.phase),
    surface: "runtime_status",
    persistence: "ephemeral_live",
    runtimeStatus: normalizeRuntimeStatusFromRuntimePhase(input.phase),
    latestTurnStatus: normalizeRuntimeStatusFromRuntimePhase(input.phase),
    ...teamRuntimeFacts,
    payload: {
      runtimeEntity: base.runtimeEntity,
      title: definedString(input.title ?? undefined),
      detailPreview: truncateText(input.detail),
      sourcePhase: input.phase,
      checkpointCount: input.checkpoints?.length ?? 0,
      metadataKeys: metadataKeys(input.metadata),
      ...teamRuntimeFacts,
    },
  };
}

export function buildAgentUiRuntimeTeamChangedEvent(
  input: AgentUiRuntimeTeamChangedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  const metadata = input.metadata ?? undefined;
  if (!hasTeamRuntimeMetadata(metadata)) {
    return null;
  }

  const facts = compactProjectionFields(buildTeamRuntimeFacts(metadata));
  const runtimeStatus = normalizeRuntimeStatusFromRuntimePhase(input.phase);

  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "runtime_status" },
      context,
    ),
    type: "team.changed",
    owner: "team",
    scope: "team",
    phase: normalizeTeamRuntimePhase({
      phase: input.phase,
      metadata,
    }),
    surface: "team_roster",
    persistence: "snapshot",
    runtimeStatus,
    latestTurnStatus: runtimeStatus,
    topology: resolveTeamTopology(facts),
    ...facts,
    payload: {
      teamEvent: "runtime_status_changed",
      sourcePhase: input.phase,
      title: definedString(input.title ?? undefined),
      detailPreview: truncateText(input.detail),
      concurrencyPhase: definedString(metadata?.concurrency_phase),
      concurrencyScope: definedString(metadata?.concurrency_scope),
    },
  };
}

export function buildAgentUiModelChangeEvent(
  input: AgentUiModelChangeProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "model_change" },
      context,
    ),
    type: "run.status",
    owner: "runtime",
    scope: "run",
    phase: "routing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      model: definedString(input.model ?? undefined),
      mode: definedString(input.mode ?? undefined),
    },
  };
}

export function buildAgentUiTaskProfileResolvedEvent(
  input: AgentUiTaskProfileProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "task_profile_resolved" },
      context,
    ),
    type: "task.changed",
    owner: "task",
    scope: "run",
    phase: "routing",
    surface: "task_capsule",
    persistence: "snapshot",
    payload: compactProjectionFields({
      kind: definedString(input.kind ?? undefined),
      source: definedString(input.source ?? undefined),
      traits: input.traits ?? [],
      modalityContractKey: definedString(
        input.modalityContractKey ?? undefined,
      ),
      routingSlot: definedString(input.routingSlot ?? undefined),
      executionProfileKey: definedString(
        input.executionProfileKey ?? undefined,
      ),
      executorAdapterKey: definedString(
        input.executorAdapterKey ?? undefined,
      ),
      executorKind: definedString(input.executorKind ?? undefined),
      executorBindingKey: definedString(
        input.executorBindingKey ?? undefined,
      ),
      permissionProfileKeys: input.permissionProfileKeys ?? [],
      userLockPolicy: definedString(input.userLockPolicy ?? undefined),
      serviceModelSlot: definedString(input.serviceModelSlot ?? undefined),
      sceneKind: definedString(input.sceneKind ?? undefined),
      sceneSkillId: definedString(input.sceneSkillId ?? undefined),
      entrySource: definedString(input.entrySource ?? undefined),
    }),
  };
}
