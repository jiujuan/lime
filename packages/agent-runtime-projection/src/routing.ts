import {
  compactProjectionFields,
  readNumberField,
  readRecord,
  readStringArrayField,
  readStringField,
} from "./normalization.js";

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
