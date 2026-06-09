import type {
  AgentUiControl,
  AgentUiPhase,
  AgentUiProjectionEvent,
  AgentUiRuntimeEntity,
  AgentUiRuntimeStatus,
  AgentUiTopology,
} from "@limecloud/agent-ui-contracts";

import { compactProjectionFields, definedString } from "./normalization.js";

export type AgentRuntimeStatusPhase =
  | "context"
  | "failed"
  | "permission_review"
  | "preparing"
  | "routing"
  | string;

export interface AgentUiRuntimeEntityInferenceInput {
  runtimeEntity?: AgentUiRuntimeEntity | string | null;
  sourceType?: string | null;
  itemType?: string | null;
  runId?: string | null;
}

export interface AgentUiTeamRuntimeMetadata {
  team_phase?: string;
  team_parallel_budget?: number;
  team_active_count?: number;
  team_queued_count?: number;
  concurrency_phase?: string;
  concurrency_scope?: string;
  concurrency_active_count?: number;
  concurrency_queued_count?: number;
  concurrency_budget?: number;
  provider_concurrency_group?: string;
  provider_parallel_budget?: number;
  queue_reason?: string;
  retryable_overload?: boolean;
}

export interface AgentUiSubagentRuntimeFactInput
  extends AgentUiTeamRuntimeMetadata {
  status?: string | null;
  latest_turn_status?: string | null;
  queued_turn_count?: number;
}

export interface AgentUiWorkerUsageInput {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const AGENT_UI_RUNTIME_ENTITIES = new Set<AgentUiRuntimeEntity>([
  "agent_turn",
  "subagent_turn",
  "automation_job",
  "external_task",
  "work_item",
  "unknown",
]);

export function normalizeRuntimeEntity(
  value: AgentUiRuntimeEntity | string | null | undefined,
): AgentUiRuntimeEntity | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return AGENT_UI_RUNTIME_ENTITIES.has(value as AgentUiRuntimeEntity)
    ? (value as AgentUiRuntimeEntity)
    : undefined;
}

export function inferAgentUiRuntimeEntity(
  input: AgentUiRuntimeEntityInferenceInput,
): AgentUiRuntimeEntity {
  const explicit = normalizeRuntimeEntity(input.runtimeEntity);
  if (explicit) {
    return explicit;
  }
  if (input.sourceType === "subagent_status_changed") {
    return "subagent_turn";
  }
  if (
    (input.sourceType === "item_started" ||
      input.sourceType === "item_updated" ||
      input.sourceType === "item_completed") &&
    input.itemType === "subagent_activity"
  ) {
    return "subagent_turn";
  }
  if (input.runId?.startsWith("agent_subagent_stream:")) {
    return "subagent_turn";
  }
  return "agent_turn";
}

export function normalizeRuntimeStatusFromRuntimePhase(
  phase: AgentRuntimeStatusPhase,
): AgentUiRuntimeStatus {
  switch (phase) {
    case "permission_review":
      return "waiting";
    case "failed":
      return "failed";
    case "context":
    case "preparing":
    case "routing":
    default:
      return "preparing";
  }
}

export function normalizeRuntimePhaseFromRuntimeStatusPhase(
  phase: AgentRuntimeStatusPhase,
): AgentUiPhase {
  switch (phase) {
    case "routing":
      return "routing";
    case "context":
      return "preparing";
    case "permission_review":
      return "waiting";
    case "failed":
      return "failed";
    case "preparing":
    default:
      return "preparing";
  }
}

export function normalizeSubagentRuntimeStatus(
  status: string | null | undefined,
): AgentUiRuntimeStatus {
  switch (status) {
    case "idle":
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "aborted":
    case "closed":
    case "not_found":
      return status;
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

export function resolveSubagentStatusPhase(
  status: string | null | undefined,
): AgentUiPhase {
  switch (status) {
    case "completed":
    case "closed":
      return "completed";
    case "failed":
    case "not_found":
      return "failed";
    case "aborted":
    case "cancelled":
      return "cancelled";
    case "running":
      return "acting";
    case "queued":
      return "waiting";
    default:
      return "waiting";
  }
}

export function resolveSubagentStatusControl(
  status: string | null | undefined,
): AgentUiControl | undefined {
  switch (status) {
    case "idle":
      return "continue_agent";
    case "queued":
      return "wait";
    case "running":
      return "stop";
    case "completed":
    case "failed":
    case "aborted":
    case "closed":
    case "not_found":
      return "close";
    default:
      return undefined;
  }
}

export function isSubagentSpawnStatus(
  status: string | null | undefined,
): boolean {
  return status === "idle" || status === "queued" || status === "running";
}

export function isSubagentTerminalStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "aborted" ||
    status === "closed" ||
    status === "not_found"
  );
}

export function hasTeamRuntimeMetadata(
  metadata: AgentUiTeamRuntimeMetadata | undefined,
): boolean {
  if (!metadata) {
    return false;
  }
  return Boolean(
    definedString(metadata.team_phase) ||
      definedString(metadata.concurrency_phase) ||
      definedString(metadata.concurrency_scope) ||
      typeof metadata.team_parallel_budget === "number" ||
      typeof metadata.team_active_count === "number" ||
      typeof metadata.team_queued_count === "number" ||
      typeof metadata.concurrency_active_count === "number" ||
      typeof metadata.concurrency_queued_count === "number" ||
      typeof metadata.concurrency_budget === "number" ||
      definedString(metadata.provider_concurrency_group) ||
      typeof metadata.provider_parallel_budget === "number" ||
      definedString(metadata.queue_reason) ||
      typeof metadata.retryable_overload === "boolean",
  );
}

export function normalizeTeamRuntimePhase(input: {
  phase: AgentRuntimeStatusPhase;
  metadata?: AgentUiTeamRuntimeMetadata;
}): AgentUiPhase {
  const teamPhase = definedString(input.metadata?.team_phase);
  const concurrencyPhase = definedString(input.metadata?.concurrency_phase);
  const phase = teamPhase ?? concurrencyPhase;
  switch (phase) {
    case "completed":
    case "done":
    case "idle":
      return "completed";
    case "failed":
    case "blocked":
      return "failed";
    case "queued":
    case "waiting":
      return "waiting";
    case "running":
    case "active":
      return "acting";
    default:
      return normalizeRuntimePhaseFromRuntimeStatusPhase(input.phase);
  }
}

export function buildTeamRuntimeFacts(
  metadata: AgentUiTeamRuntimeMetadata | undefined,
): Pick<
  AgentUiProjectionEvent,
  | "teamPhase"
  | "teamParallelBudget"
  | "teamActiveCount"
  | "teamQueuedCount"
  | "queuedTurnCount"
  | "providerConcurrencyGroup"
  | "providerParallelBudget"
  | "queueReason"
  | "retryableOverload"
> {
  return {
    teamPhase: definedString(
      metadata?.team_phase ?? metadata?.concurrency_phase,
    ),
    teamParallelBudget:
      metadata?.team_parallel_budget ?? metadata?.concurrency_budget,
    teamActiveCount:
      metadata?.team_active_count ?? metadata?.concurrency_active_count,
    teamQueuedCount:
      metadata?.team_queued_count ?? metadata?.concurrency_queued_count,
    queuedTurnCount:
      metadata?.team_queued_count ?? metadata?.concurrency_queued_count,
    providerConcurrencyGroup: definedString(
      metadata?.provider_concurrency_group,
    ),
    providerParallelBudget: metadata?.provider_parallel_budget,
    queueReason: definedString(metadata?.queue_reason),
    retryableOverload: metadata?.retryable_overload,
  };
}

export function buildSubagentRuntimeFacts(
  input: AgentUiSubagentRuntimeFactInput,
): Pick<
  AgentUiProjectionEvent,
  | "runtimeEntity"
  | "runtimeStatus"
  | "latestTurnStatus"
  | "teamPhase"
  | "teamParallelBudget"
  | "teamActiveCount"
  | "teamQueuedCount"
  | "queuedTurnCount"
  | "providerConcurrencyGroup"
  | "providerParallelBudget"
  | "queueReason"
  | "retryableOverload"
> {
  return {
    runtimeEntity: "subagent_turn",
    runtimeStatus: normalizeSubagentRuntimeStatus(input.status),
    latestTurnStatus: input.latest_turn_status
      ? normalizeSubagentRuntimeStatus(input.latest_turn_status)
      : undefined,
    teamPhase: definedString(input.team_phase),
    teamParallelBudget: input.team_parallel_budget,
    teamActiveCount: input.team_active_count,
    teamQueuedCount: input.team_queued_count,
    queuedTurnCount: input.queued_turn_count,
    providerConcurrencyGroup: definedString(input.provider_concurrency_group),
    providerParallelBudget: input.provider_parallel_budget,
    queueReason: definedString(input.queue_reason),
    retryableOverload: input.retryable_overload,
  };
}

export function buildSubagentProjectionPayload(
  input: AgentUiSubagentRuntimeFactInput & {
    session_id?: string | null;
    parent_session_id?: string | null;
    latest_turn_id?: string | null;
    queued_turn_count?: number;
    closed?: boolean;
  },
): Record<string, unknown> {
  return compactProjectionFields({
    status: input.status,
    childSessionId: input.session_id,
    parentSessionId: input.parent_session_id,
    latestTurnId: input.latest_turn_id,
    latestTurnStatus: input.latest_turn_status,
    queuedTurnCount: input.queued_turn_count,
    teamPhase: input.team_phase,
    teamParallelBudget: input.team_parallel_budget,
    teamActiveCount: input.team_active_count,
    teamQueuedCount: input.team_queued_count,
    providerConcurrencyGroup: input.provider_concurrency_group,
    providerParallelBudget: input.provider_parallel_budget,
    queueReason: input.queue_reason,
    retryableOverload: input.retryable_overload,
    closed: input.closed,
  });
}

export function buildWorkerUsageProjection(
  usage: AgentUiWorkerUsageInput | undefined,
): Record<string, unknown> | undefined {
  if (!usage) {
    return undefined;
  }

  return compactProjectionFields({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  });
}

export function resolveTeamTopology(
  facts: Pick<
    AgentUiProjectionEvent,
    "teamParallelBudget" | "teamActiveCount" | "teamQueuedCount"
  >,
): AgentUiTopology {
  if (
    (facts.teamParallelBudget ?? 0) > 1 ||
    (facts.teamActiveCount ?? 0) > 1 ||
    (facts.teamQueuedCount ?? 0) > 0
  ) {
    return "parallel_workers";
  }
  return "coordinator_team";
}
