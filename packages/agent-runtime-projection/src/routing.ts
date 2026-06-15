import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  compactProjectionFields,
  readBooleanField,
  readNumberField,
  readRecord,
  readStringArrayField,
  readStringField,
  truncateText,
} from "./normalization.js";

export interface AgentUiRoutingLimitStateProjectionInput {
  status?: string | null;
  singleCandidateOnly?: boolean | null;
  providerLocked?: boolean | null;
  settingsLocked?: boolean | null;
  oemLocked?: boolean | null;
  candidateCount?: number | null;
  capabilityGap?: string | null;
  notes?: string[] | null;
}

export interface AgentUiRoutingLimitEventProjectionInput {
  eventKind?: string | null;
  message?: string | null;
  retryable?: boolean | null;
}

export interface AgentUiRoutingStatusProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  runtimeEvent: string;
  routingDecision?: unknown;
  limitState?: AgentUiRoutingLimitStateProjectionInput | null;
  limitEvent?: AgentUiRoutingLimitEventProjectionInput | null;
}

export function buildAgentUiRoutingStatusEvent(
  input: AgentUiRoutingStatusProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  return {
    ...buildAgentUiProjectionBase(
      { sourceType: input.sourceType ?? input.runtimeEvent },
      context,
    ),
    type: "run.status",
    owner: "runtime",
    scope: "run",
    phase:
      input.runtimeEvent === "routing_not_possible" ||
      input.runtimeEvent === "quota_blocked"
        ? "failed"
        : "routing",
    surface: "runtime_status",
    persistence: "snapshot",
    payload: {
      runtimeEvent: input.runtimeEvent,
      ...buildAgentUiRoutingStatusPayload(input),
    },
  };
}

function buildAgentUiRoutingStatusPayload(
  input: AgentUiRoutingStatusProjectionInput,
): Record<string, unknown> {
  if (input.routingDecision) {
    return buildRoutingDecisionPayload({
      routingDecision: input.routingDecision,
    });
  }
  if (input.limitState) {
    return {
      limitStatus: input.limitState.status ?? undefined,
      singleCandidateOnly: input.limitState.singleCandidateOnly ?? undefined,
      providerLocked: input.limitState.providerLocked ?? undefined,
      settingsLocked: input.limitState.settingsLocked ?? undefined,
      oemLocked: input.limitState.oemLocked ?? undefined,
      candidateCount: input.limitState.candidateCount ?? undefined,
      capabilityGap: input.limitState.capabilityGap ?? undefined,
      notes: input.limitState.notes ?? [],
    };
  }
  if (input.limitEvent) {
    return {
      limitEventKind: input.limitEvent.eventKind ?? undefined,
      messagePreview: truncateText(input.limitEvent.message ?? undefined),
      retryable: input.limitEvent.retryable ?? undefined,
    };
  }
  return {};
}

export function buildRoutingDecisionPayload(
  event: unknown,
): Record<string, unknown> {
  const eventRecord = readRecord(event);
  const routingDecision =
    readRecord(eventRecord?.routing_decision) ??
    readRecord(eventRecord?.routingDecision);
  const source = routingDecision ?? eventRecord;

  if (!source) {
    return {};
  }

  const fallbackChain = readStringArrayField(source, [
    "fallbackChain",
    "fallback_chain",
  ]);
  const preservesEmptyFallbackChain = Boolean(
    routingDecision ?? readStringField(source, ["routingMode", "routing_mode"]),
  );

  return compactProjectionFields({
    routingMode: readStringField(source, [
      "routingMode",
      "routing_mode",
    ]),
    decisionSource: readStringField(source, [
      "decisionSource",
      "decision_source",
    ]),
    decisionReason: readStringField(source, [
      "decisionReason",
      "decision_reason",
    ]),
    selectedProvider: readStringField(source, [
      "selectedProvider",
      "selected_provider",
    ]),
    selectedModel: readStringField(source, [
      "selectedModel",
      "selected_model",
    ]),
    requestedProvider: readStringField(source, [
      "requestedProvider",
      "requested_provider",
    ]),
    requestedModel: readStringField(source, [
      "requestedModel",
      "requested_model",
    ]),
    candidateCount: readNumberField(source, [
      "candidateCount",
      "candidate_count",
    ]),
    estimatedCostClass: readStringField(source, [
      "estimatedCostClass",
      "estimated_cost_class",
    ]),
    capabilityGap: readStringField(source, [
      "capabilityGap",
      "capability_gap",
    ]),
    fallbackChain:
      fallbackChain.length > 0 || preservesEmptyFallbackChain
        ? fallbackChain
        : undefined,
    settingsSource: readStringField(source, [
      "settingsSource",
      "settings_source",
    ]),
    serviceModelSlot: readStringField(source, [
      "serviceModelSlot",
      "service_model_slot",
    ]),
    fallbackApplied: readBooleanField(source, [
      "fallbackApplied",
      "fallback_applied",
    ]),
    requestedSelection:
      readRecord(source.requestedSelection) ??
      readRecord(source.requested_selection),
    routingAttempts: readRoutingAttempts(source),
  });
}

function readRoutingAttempts(
  source: Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  const attempts = source.routingAttempts ?? source.routing_attempts;
  if (!Array.isArray(attempts)) {
    return undefined;
  }
  const records = attempts
    .map(readRecord)
    .filter((attempt): attempt is Record<string, unknown> => Boolean(attempt));
  return records.length > 0 ? records : undefined;
}
