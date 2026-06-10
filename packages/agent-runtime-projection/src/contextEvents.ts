import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  definedString,
  normalizeProjectionIdList,
  truncateText,
} from "./normalization.js";

export interface AgentUiContextTraceStepInput {
  stage: string;
  detail: string;
}

export interface AgentUiContextTraceProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  steps: readonly AgentUiContextTraceStepInput[];
}

export interface AgentUiTurnContextOutputSchemaInput {
  source?: string | null;
  strategy?: string | null;
  providerName?: string | null;
  provider_name?: string | null;
  modelName?: string | null;
  model_name?: string | null;
}

export interface AgentUiTurnContextRetrievalRefInput {
  source_id?: string | null;
  sourceId?: string | null;
  [key: string]: unknown;
}

export interface AgentUiTurnContextTeamMemoryRefInput {
  key?: string | null;
  [key: string]: unknown;
}

export interface AgentUiTurnContextSummaryInput {
  memory_budget?: unknown;
  memoryBudget?: unknown;
  missing_context?: readonly unknown[] | null;
  missingContext?: readonly unknown[] | null;
  retrieval_refs?: readonly AgentUiTurnContextRetrievalRefInput[] | null;
  retrievalRefs?: readonly AgentUiTurnContextRetrievalRefInput[] | null;
  team_memory_refs?: readonly AgentUiTurnContextTeamMemoryRefInput[] | null;
  teamMemoryRefs?: readonly AgentUiTurnContextTeamMemoryRefInput[] | null;
}

export interface AgentUiTurnContextProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  sessionId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  outputSchemaRuntime?: AgentUiTurnContextOutputSchemaInput | null;
  contextSummary?: AgentUiTurnContextSummaryInput | null;
  approvalPolicy?: string | null;
  sandboxPolicy?: string | null;
}

export function buildAgentUiContextTraceEvent(
  input: AgentUiContextTraceProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const latestStep = input.steps[input.steps.length - 1];

  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? "context_trace" },
      context,
    ),
    type: "context.changed",
    owner: "context",
    scope: "turn",
    phase: "preparing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      stepCount: input.steps.length,
      latestStage: latestStep?.stage,
      latestDetailPreview: truncateText(latestStep?.detail),
    },
  };
}

export function buildAgentUiTurnContextEvents(
  input: AgentUiTurnContextProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const contextEvent = buildAgentUiTurnContextChangedEvent(input, context);
  const permissionEvent = buildAgentUiTurnContextPermissionEvent(input, context);
  return permissionEvent ? [contextEvent, permissionEvent] : [contextEvent];
}

export function buildAgentUiTurnContextChangedEvent(
  input: AgentUiTurnContextProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "turn_context" },
    context,
  );
  const summary = input.contextSummary ?? null;
  const outputSchema = input.outputSchemaRuntime ?? null;
  const retrievalRefs = summary?.retrieval_refs ?? summary?.retrievalRefs ?? [];
  const teamMemoryRefs =
    summary?.team_memory_refs ?? summary?.teamMemoryRefs ?? [];

  return {
    ...base,
    sessionId: definedString(input.sessionId) ?? base.sessionId,
    threadId: definedString(input.threadId) ?? base.threadId,
    turnId: definedString(input.turnId) ?? base.turnId,
    type: "context.changed",
    owner: "context",
    scope: "turn",
    phase: "preparing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      outputSchemaAvailable: Boolean(outputSchema),
      outputSchemaSource: outputSchema?.source,
      outputSchemaStrategy: outputSchema?.strategy,
      providerName: outputSchema?.providerName ?? outputSchema?.provider_name,
      modelName: outputSchema?.modelName ?? outputSchema?.model_name,
      contextSummaryAvailable: Boolean(summary),
      memoryBudget: summary?.memory_budget ?? summary?.memoryBudget ?? null,
      missingContext: summary?.missing_context ?? summary?.missingContext ?? [],
      retrievalRefs,
      teamMemoryRefs,
    },
    refs: {
      contextSourceIds: normalizeProjectionIdList(
        retrievalRefs.map((ref) => ref.source_id ?? ref.sourceId),
      ),
      teamMemoryKeys: normalizeProjectionIdList(
        teamMemoryRefs.map((ref) => ref.key),
      ),
    },
  };
}

export function buildAgentUiTurnContextPermissionEvent(
  input: AgentUiTurnContextProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent | null {
  const approvalPolicy = definedString(input.approvalPolicy);
  const sandboxPolicy = definedString(input.sandboxPolicy);
  if (!approvalPolicy && !sandboxPolicy) {
    return null;
  }

  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "turn_context" },
    context,
  );

  return {
    ...base,
    sessionId: definedString(input.sessionId) ?? base.sessionId,
    threadId: definedString(input.threadId) ?? base.threadId,
    turnId: definedString(input.turnId) ?? base.turnId,
    type: "permission.changed",
    owner: "policy",
    scope: "turn",
    phase: "preparing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      approvalPolicy: approvalPolicy ?? null,
      sandboxPolicy: sandboxPolicy ?? null,
      sourceEvent: "turn_context",
    },
  };
}
