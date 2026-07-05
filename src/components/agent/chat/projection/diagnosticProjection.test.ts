import { describe, expect, it } from "vitest";
import { buildDiagnosticProjectionEvents } from "./diagnosticProjection";

const baseContext = {
  sessionId: "session-diagnostic",
  threadId: "thread-diagnostic",
  runId: "run-diagnostic",
  turnId: "turn-diagnostic",
  timestamp: "2026-06-10T00:00:00.000Z",
};

describe("diagnosticProjection", () => {
  it("应由 diagnostic owner 统一分发 warning", () => {
    const events = buildDiagnosticProjectionEvents(
      {
        type: "warning",
        code: "knowledge_context_missing",
        message: "缺少知识上下文来源",
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "diagnostic.changed",
      sourceType: "warning",
      sessionId: "session-diagnostic",
      threadId: "thread-diagnostic",
      runId: "run-diagnostic",
      turnId: "turn-diagnostic",
      owner: "diagnostics",
      scope: "run",
      phase: "acting",
      surface: "diagnostics",
      persistence: "diagnostics_log",
      payload: {
        code: "knowledge_context_missing",
        messagePreview: "缺少知识上下文来源",
      },
    });
  });

  it("应由 diagnostic owner 统一分发 cost_recorded", () => {
    const events = buildDiagnosticProjectionEvents(
      {
        type: "cost_recorded",
        cost_state: {
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
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "metric.changed",
      sourceType: "cost_recorded",
      owner: "diagnostics",
      scope: "run",
      phase: "acting",
      surface: "diagnostics",
      persistence: "diagnostics_log",
      payload: {
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
      },
    });
  });
});
