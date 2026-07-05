import { describe, expect, it } from "vitest";
import { buildRoutingProjectionEvents } from "./routingProjection";

const baseContext = {
  sessionId: "session-routing",
  threadId: "thread-routing",
  runId: "run-routing",
  turnId: "turn-routing",
  timestamp: "2026-06-10T00:00:00.000Z",
};

describe("routingProjection", () => {
  it("应由 routing owner 统一分发 routing_decision_made", () => {
    const events = buildRoutingProjectionEvents(
      {
        type: "routing_decision_made",
        routing_decision: {
          routing_mode: "auto",
          decision_source: "runtime",
          decision_reason: "capability_match",
          selected_provider: "openai",
          selected_model: "gpt-5.4",
          candidate_count: 2,
          fallback_chain: ["gpt-5.4"],
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "run.status",
      sourceType: "routing_decision_made",
      sessionId: "session-routing",
      threadId: "thread-routing",
      runId: "run-routing",
      turnId: "turn-routing",
      owner: "runtime",
      scope: "run",
      phase: "routing",
      surface: "runtime_status",
      persistence: "snapshot",
      payload: {
        runtimeEvent: "routing_decision_made",
        routingMode: "auto",
        decisionSource: "runtime",
        decisionReason: "capability_match",
        selectedProvider: "openai",
        selectedModel: "gpt-5.4",
        candidateCount: 2,
        fallbackChain: ["gpt-5.4"],
      },
    });
  });

  it("应由 routing owner 统一分发 limit state", () => {
    const events = buildRoutingProjectionEvents(
      {
        type: "single_candidate_only",
        limit_state: {
          status: "warning",
          singleCandidateOnly: true,
          providerLocked: false,
          settingsLocked: true,
          oemLocked: false,
          candidateCount: 1,
          capabilityGap: "narrow_pool",
          notes: ["只剩一个候选模型"],
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "run.status",
      sourceType: "single_candidate_only",
      owner: "runtime",
      scope: "run",
      phase: "routing",
      payload: {
        runtimeEvent: "single_candidate_only",
        limitStatus: "warning",
        singleCandidateOnly: true,
        providerLocked: false,
        settingsLocked: true,
        candidateCount: 1,
        capabilityGap: "narrow_pool",
        notes: ["只剩一个候选模型"],
      },
    });
  });

  it("应由 routing owner 统一分发 quota_blocked", () => {
    const events = buildRoutingProjectionEvents(
      {
        type: "quota_blocked",
        limit_event: {
          eventKind: "quota_blocked",
          message: "额度不足，无法继续执行",
          retryable: false,
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "run.status",
      sourceType: "quota_blocked",
      owner: "runtime",
      scope: "run",
      phase: "failed",
      payload: {
        runtimeEvent: "quota_blocked",
        limitEventKind: "quota_blocked",
        messagePreview: "额度不足，无法继续执行",
        retryable: false,
      },
    });
  });
});
