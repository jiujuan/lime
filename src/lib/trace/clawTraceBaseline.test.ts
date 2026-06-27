import { describe, expect, it } from "vitest";
import type { AgentUiPerformanceTraceHistoryRecord } from "@/lib/agentUiPerformanceTraceHistory";
import type { AgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";
import { projectClawTraceBaselineComparison } from "./clawTraceBaseline";

const retention = {
  max_records: 20,
  max_age_days: 7,
  mode: "compact_summary_only",
  raw_entries: false,
  prompt_text: false,
  provider_payload: false,
} as const;

const BASELINE_SAVED_AT_MS = Date.parse("2026-06-27T00:00:00.000Z");

function summary(
  metrics: Record<string, number>,
): AgentUiPerformanceDiagnosticSummary {
  return {
    entry_count: 4,
    session_count: 1,
    truncated_session_count: 0,
    sessions: [
      {
        sessionId: "session-a",
        phase_count: 4,
        phases: ["agentStream.providerTrace"],
        metrics,
      },
    ],
  };
}

function record(
  label: string,
  metrics: Record<string, number>,
  savedAtMs = BASELINE_SAVED_AT_MS,
): AgentUiPerformanceTraceHistoryRecord {
  return {
    schema_version: 1,
    id: `record-${label}`,
    label,
    saved_at: new Date(savedAtMs).toISOString(),
    saved_at_ms: savedAtMs,
    summary: summary(metrics),
  };
}

describe("clawTraceBaseline", () => {
  it("应把当前 compact summary 与最近 baseline 做 metric delta 对比", () => {
    const comparison = projectClawTraceBaselineComparison({
      baselineRecords: [
        record("baseline-a", {
          clientLocalOutputMs: 100,
          providerWaitMs: 1000,
          rendererApplyFirstTextDeltaMs: 8,
          serverToRendererFirstTextDeltaMs: 20,
        }),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 180,
        providerWaitMs: 900,
        rendererApplyFirstTextDeltaMs: 9,
        serverToRendererFirstTextDeltaMs: 24,
      }),
      retention,
    });

    expect(comparison).toMatchObject({
      baseline_label: "baseline-a",
      baseline_saved_at: "2026-06-27T00:00:00.000Z",
      baseline_strategy: "oldest_retained_snapshot",
      history_record_count: 1,
      latest_saved_at: "2026-06-27T00:00:00.000Z",
      verdict: "regressed",
    });
    expect(comparison.metrics).toEqual([
      {
        baseline_ms: 1000,
        current_ms: 900,
        delta_ms: -100,
        delta_ratio: -0.1,
        key: "providerWaitMs",
        verdict: "improved",
      },
      {
        baseline_ms: 20,
        current_ms: 24,
        delta_ms: 4,
        delta_ratio: 0.2,
        key: "serverToRendererFirstTextDeltaMs",
        verdict: "same",
      },
      {
        baseline_ms: 8,
        current_ms: 9,
        delta_ms: 1,
        delta_ratio: 0.125,
        key: "rendererApplyFirstTextDeltaMs",
        verdict: "same",
      },
      {
        baseline_ms: 100,
        current_ms: 180,
        delta_ms: 80,
        delta_ratio: 0.8,
        key: "clientLocalOutputMs",
        verdict: "regressed",
      },
    ]);
    expect(JSON.stringify(comparison)).not.toContain("raw_provider_payload");
  });

  it("多条 compact history 时应使用 retained window 的最早快照作为长期 baseline", () => {
    const comparison = projectClawTraceBaselineComparison({
      baselineRecords: [
        record(
          "recent-slow",
          {
            clientLocalOutputMs: 180,
            providerWaitMs: 1200,
          },
          BASELINE_SAVED_AT_MS + 120_000,
        ),
        record(
          "old-stable",
          {
            clientLocalOutputMs: 80,
            providerWaitMs: 900,
          },
          BASELINE_SAVED_AT_MS,
        ),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 180,
        providerWaitMs: 1200,
      }),
      retention,
    });

    expect(comparison).toMatchObject({
      baseline_label: "old-stable",
      baseline_strategy: "oldest_retained_snapshot",
      history_record_count: 2,
      latest_saved_at: "2026-06-27T00:02:00.000Z",
      verdict: "regressed",
    });
    expect(comparison.metrics).toEqual([
      {
        baseline_ms: 900,
        current_ms: 1200,
        delta_ms: 300,
        delta_ratio: 1 / 3,
        key: "providerWaitMs",
        verdict: "regressed",
      },
      {
        baseline_ms: 80,
        current_ms: 180,
        delta_ms: 100,
        delta_ratio: 1.25,
        key: "clientLocalOutputMs",
        verdict: "regressed",
      },
    ]);
  });

  it("无当前 summary 或无 baseline 时应 fail closed", () => {
    expect(
      projectClawTraceBaselineComparison({
        baselineRecords: [],
        currentSummary: null,
        retention,
      }),
    ).toMatchObject({
      history_record_count: 0,
      metrics: [],
      verdict: "no_current",
    });

    expect(
      projectClawTraceBaselineComparison({
        baselineRecords: [],
        currentSummary: summary({ clientLocalOutputMs: 100 }),
        retention,
      }),
    ).toMatchObject({
      baseline_strategy: "oldest_retained_snapshot",
      history_record_count: 0,
      metrics: [],
      verdict: "no_baseline",
    });
  });
});
