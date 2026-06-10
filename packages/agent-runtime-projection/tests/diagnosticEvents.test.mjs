import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentUiCostMetricEvent,
  buildAgentUiWarningEvent,
} from "../dist/index.js";

test("warning helper builds standard diagnostic events", () => {
  const event = buildAgentUiWarningEvent(
    {
      code: "knowledge_context_missing",
      message: "缺少知识上下文来源",
    },
    {
      sessionId: "session-diagnostic",
      threadId: "thread-diagnostic",
      runId: "run-diagnostic",
      turnId: "turn-diagnostic",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(event.sourceType, "warning");
  assert.equal(event.timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(event.sessionId, "session-diagnostic");
  assert.equal(event.threadId, "thread-diagnostic");
  assert.equal(event.runId, "run-diagnostic");
  assert.equal(event.turnId, "turn-diagnostic");
  assert.equal(event.type, "diagnostic.changed");
  assert.equal(event.owner, "diagnostics");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "acting");
  assert.equal(event.surface, "diagnostics");
  assert.equal(event.persistence, "diagnostics_log");
  assert.deepEqual(event.payload, {
    code: "knowledge_context_missing",
    messagePreview: "缺少知识上下文来源",
  });
});

test("warning helper trims empty code and message preview", () => {
  const event = buildAgentUiWarningEvent(
    {
      sourceType: "warning",
      code: null,
      message: "   ",
    },
    {
      sessionId: "session-diagnostic",
    },
  );

  assert.equal(event.type, "diagnostic.changed");
  assert.deepEqual(event.payload, {
    code: undefined,
    messagePreview: undefined,
  });
});

test("cost helper builds standard metric events", () => {
  const event = buildAgentUiCostMetricEvent(
    {
      sourceType: "cost_recorded",
      metricEvent: "cost_recorded",
      costState: {
        status: "estimated",
        estimatedCostClass: "low",
        estimatedTotalCost: 0.01,
        currency: "USD",
        totalTokens: 1200,
        inputTokens: 800,
        outputTokens: 300,
        cachedInputTokens: 50,
        cacheCreationInputTokens: 20,
      },
    },
    {
      sessionId: "session-cost",
      threadId: "thread-cost",
      turnId: "turn-cost",
    },
  );

  assert.equal(event.sourceType, "cost_recorded");
  assert.equal(event.sessionId, "session-cost");
  assert.equal(event.threadId, "thread-cost");
  assert.equal(event.turnId, "turn-cost");
  assert.equal(event.type, "metric.changed");
  assert.equal(event.owner, "diagnostics");
  assert.equal(event.scope, "run");
  assert.equal(event.phase, "acting");
  assert.equal(event.surface, "diagnostics");
  assert.equal(event.persistence, "diagnostics_log");
  assert.deepEqual(event.payload, {
    metricEvent: "cost_recorded",
    status: "estimated",
    estimatedCostClass: "low",
    estimatedTotalCost: 0.01,
    currency: "USD",
    totalTokens: 1200,
    inputTokens: 800,
    outputTokens: 300,
    cachedInputTokens: 50,
    cacheCreationInputTokens: 20,
  });
});
