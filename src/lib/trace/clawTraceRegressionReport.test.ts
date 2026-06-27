import { describe, expect, it } from "vitest";
import type { ClawTraceAppServerComparison } from "./clawTraceAppServerComparison";
import type { ClawTraceBaselineComparison } from "./clawTraceBaseline";
import { projectClawTraceRegressionReport } from "./clawTraceRegressionReport";

const retention = {
  max_age_days: 7,
  max_records: 20,
  mode: "compact_summary_only" as const,
  prompt_text: false as const,
  provider_payload: false as const,
  raw_entries: false as const,
};

function baselineComparison(
  metrics: ClawTraceBaselineComparison["metrics"],
): ClawTraceBaselineComparison {
  return {
    baseline_label: "oldest",
    baseline_saved_at: "2026-06-27T00:00:00.000Z",
    baseline_strategy: "oldest_retained_snapshot",
    history_record_count: 3,
    latest_saved_at: "2026-06-27T00:01:00.000Z",
    metrics,
    retention,
    verdict: metrics.some((metric) => metric.verdict === "regressed")
      ? "regressed"
      : "same",
  };
}

function appServerComparison(
  metrics: ClawTraceAppServerComparison["metrics"],
): ClawTraceAppServerComparison {
  return {
    baseline_strategy: "oldest_retained_trace",
    baseline_trace_id: "trace-oldest",
    current_trace_id: "trace-current",
    latest_trace_id: "trace-current",
    metrics,
    trace_window_count: 3,
    verdict: metrics.some((metric) => metric.verdict === "regressed")
      ? "regressed"
      : "same",
  };
}

describe("clawTraceRegressionReport", () => {
  it("应把 provider/API、App Server 与 Lime 本地输出分开归因", () => {
    const report = projectClawTraceRegressionReport({
      appServerComparison: appServerComparison([
        {
          baseline_ms: 100,
          current_ms: 240,
          delta_ms: 140,
          delta_ratio: 1.4,
          key: "providerFirstTextMs",
          verdict: "regressed",
        },
        {
          baseline_ms: 20,
          current_ms: 90,
          delta_ms: 70,
          delta_ratio: 3.5,
          key: "providerToAppServerFirstDeltaMs",
          verdict: "regressed",
        },
        {
          baseline_ms: 160,
          current_ms: 360,
          delta_ms: 200,
          delta_ratio: 1.25,
          key: "rootDurationMs",
          verdict: "regressed",
        },
      ]),
      baselineComparison: baselineComparison([
        {
          baseline_ms: 110,
          current_ms: 260,
          delta_ms: 150,
          delta_ratio: 1.36,
          key: "providerWaitMs",
          verdict: "regressed",
        },
        {
          baseline_ms: 15,
          current_ms: 80,
          delta_ms: 65,
          delta_ratio: 4.33,
          key: "rendererApplyFirstTextDeltaMs",
          verdict: "regressed",
        },
      ]),
    });

    expect(report).toMatchObject({
      evidence_sources: ["app_server_trace", "compact_summary"],
      primary_owner: "provider_api",
      verdict: "regressed",
      window: {
        app_server_trace_window_count: 3,
        compact_history_record_count: 3,
      },
    });
    expect(report.owner_totals).toEqual([
      {
        metric_count: 2,
        owner: "provider_api",
        regressed_delta_ms: 290,
      },
      {
        metric_count: 1,
        owner: "app_server",
        regressed_delta_ms: 70,
      },
      {
        metric_count: 1,
        owner: "lime_client",
        regressed_delta_ms: 65,
      },
    ]);
    expect(report.segments.map((segment) => segment.key)).not.toContain(
      "rootDurationMs",
    );
  });

  it("没有可比指标时应 fail closed", () => {
    const report = projectClawTraceRegressionReport({
      appServerComparison: null,
      baselineComparison: baselineComparison([]),
    });

    expect(report).toEqual({
      evidence_sources: [],
      owner_totals: [],
      primary_owner: null,
      segments: [],
      verdict: "no_evidence",
      window: {
        app_server_trace_window_count: 0,
        compact_history_record_count: 3,
      },
    });
  });
});
