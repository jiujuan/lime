import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiRoutingStatusEvent } from "../dist/index.js";

test("routing status helper builds standard run status events", () => {
  const event = buildAgentUiRoutingStatusEvent(
    {
      runtimeEvent: "routing_decision_made",
      routingDecision: {
        routing_mode: "auto",
        decision_source: "runtime",
        decision_reason: "capability_match",
        selected_provider: "openai",
        selected_model: "gpt-5.4",
        candidate_count: "2",
        fallback_chain: ["gpt-5.4"],
      },
    },
    {
      sessionId: "session-routing",
      threadId: "thread-routing",
      runId: "run-routing",
      turnId: "turn-routing",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(event.sourceType, "routing_decision_made");
  assert.equal(event.timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(event.sessionId, "session-routing");
  assert.equal(event.threadId, "thread-routing");
  assert.equal(event.runId, "run-routing");
  assert.equal(event.turnId, "turn-routing");
  assert.equal(event.type, "run.status");
  assert.equal(event.owner, "runtime");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "routing");
  assert.equal(event.surface, "runtime_status");
  assert.equal(event.persistence, "snapshot");
  assert.deepEqual(event.payload, {
    runtimeEvent: "routing_decision_made",
    routingMode: "auto",
    decisionSource: "runtime",
    decisionReason: "capability_match",
    selectedProvider: "openai",
    selectedModel: "gpt-5.4",
    candidateCount: 2,
    fallbackChain: ["gpt-5.4"],
  });
});

test("routing status helper marks impossible routing as failed", () => {
  const event = buildAgentUiRoutingStatusEvent({
    sourceType: "routing_not_possible",
    runtimeEvent: "routing_not_possible",
    routingDecision: {
      routingMode: "auto",
      decisionSource: "runtime",
      decisionReason: "no_candidate",
      candidateCount: 0,
      capabilityGap: "missing_provider",
    },
  });

  assert.equal(event.type, "run.status");
  assert.equal(event.phase, "failed");
  assert.deepEqual(event.payload, {
    runtimeEvent: "routing_not_possible",
    routingMode: "auto",
    decisionSource: "runtime",
    decisionReason: "no_candidate",
    candidateCount: 0,
    capabilityGap: "missing_provider",
    fallbackChain: [],
  });
});

test("routing status helper projects limit state events", () => {
  const event = buildAgentUiRoutingStatusEvent({
    runtimeEvent: "single_candidate_only",
    limitState: {
      status: "warning",
      singleCandidateOnly: true,
      providerLocked: false,
      settingsLocked: true,
      oemLocked: false,
      candidateCount: 1,
      capabilityGap: "narrow_pool",
      notes: ["只剩一个候选模型"],
    },
  });

  assert.equal(event.sourceType, "single_candidate_only");
  assert.equal(event.phase, "routing");
  assert.deepEqual(event.payload, {
    runtimeEvent: "single_candidate_only",
    limitStatus: "warning",
    singleCandidateOnly: true,
    providerLocked: false,
    settingsLocked: true,
    oemLocked: false,
    candidateCount: 1,
    capabilityGap: "narrow_pool",
    notes: ["只剩一个候选模型"],
  });
});

test("routing status helper projects quota blocked events as failed", () => {
  const event = buildAgentUiRoutingStatusEvent({
    runtimeEvent: "quota_blocked",
    limitEvent: {
      eventKind: "quota_blocked",
      message: "额度不足，无法继续执行",
      retryable: false,
    },
  });

  assert.equal(event.sourceType, "quota_blocked");
  assert.equal(event.phase, "failed");
  assert.deepEqual(event.payload, {
    runtimeEvent: "quota_blocked",
    limitEventKind: "quota_blocked",
    messagePreview: "额度不足，无法继续执行",
    retryable: false,
  });
});
