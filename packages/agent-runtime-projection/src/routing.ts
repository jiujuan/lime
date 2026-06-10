import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import {
  compactProjectionFields,
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

  if (!routingDecision) {
    return {};
  }

  return compactProjectionFields({
    routingMode: readStringField(routingDecision, [
      "routingMode",
      "routing_mode",
    ]),
    decisionSource: readStringField(routingDecision, [
      "decisionSource",
      "decision_source",
    ]),
    decisionReason: readStringField(routingDecision, [
      "decisionReason",
      "decision_reason",
    ]),
    selectedProvider: readStringField(routingDecision, [
      "selectedProvider",
      "selected_provider",
    ]),
    selectedModel: readStringField(routingDecision, [
      "selectedModel",
      "selected_model",
    ]),
    requestedProvider: readStringField(routingDecision, [
      "requestedProvider",
      "requested_provider",
    ]),
    requestedModel: readStringField(routingDecision, [
      "requestedModel",
      "requested_model",
    ]),
    candidateCount: readNumberField(routingDecision, [
      "candidateCount",
      "candidate_count",
    ]),
    estimatedCostClass: readStringField(routingDecision, [
      "estimatedCostClass",
      "estimated_cost_class",
    ]),
    capabilityGap: readStringField(routingDecision, [
      "capabilityGap",
      "capability_gap",
    ]),
    fallbackChain: readStringArrayField(routingDecision, [
      "fallbackChain",
      "fallback_chain",
    ]),
    settingsSource: readStringField(routingDecision, [
      "settingsSource",
      "settings_source",
    ]),
    serviceModelSlot: readStringField(routingDecision, [
      "serviceModelSlot",
      "service_model_slot",
    ]),
  });
}
