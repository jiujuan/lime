import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClawTraceRegressionReport } from "./clawTraceRegressionReport";
import {
  CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS,
  CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY,
  clearClawTraceRegressionTrend,
  exportClawTraceRegressionTrend,
  getClawTraceRegressionTrendOverview,
  listClawTraceRegressionTrend,
  saveClawTraceRegressionTrendRecord,
} from "./clawTraceRegressionTrend";

function report(
  owner: ClawTraceRegressionReport["primary_owner"],
  deltaMs: number,
): ClawTraceRegressionReport {
  return {
    evidence_sources: ["app_server_trace", "compact_summary"],
    owner_totals: owner
      ? [
          {
            metric_count: 1,
            owner,
            regressed_delta_ms: deltaMs,
          },
        ]
      : [],
    primary_owner: owner,
    segments: [
      {
        baseline_ms: 100,
        current_ms: 100 + deltaMs,
        delta_ms: deltaMs,
        key: owner === "lime_client" ? "clientLocalOutputMs" : "providerWaitMs",
        owner: owner ?? "provider_api",
        source: owner === "app_server" ? "app_server_trace" : "compact_summary",
        verdict: "regressed",
      },
    ],
    verdict: "regressed",
    window: {
      app_server_trace_window_count: 3,
      compact_history_record_count: 2,
    },
  };
}

describe("clawTraceRegressionTrend", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    clearClawTraceRegressionTrend();
  });

  it("应只保存 summary-only regression report 并输出 owner 趋势", () => {
    const nowMs = Date.now();
    saveClawTraceRegressionTrendRecord(report("provider_api", 120), {
      nowMs,
    });
    saveClawTraceRegressionTrendRecord(report("lime_client", 80), {
      nowMs: nowMs + 1,
    });

    const overview = getClawTraceRegressionTrendOverview();
    expect(overview).toMatchObject({
      count: 2,
      latest_verdict: "regressed",
      primary_owner_counts: {
        app_server: 0,
        lime_client: 1,
        provider_api: 1,
      },
      retention: {
        assistant_delta_text: false,
        mode: "summary_only_regression_report",
        prompt_text: false,
        provider_payload: false,
        raw_entries: false,
        raw_trace_jsonl: false,
      },
    });

    const exportedText = JSON.stringify(exportClawTraceRegressionTrend());
    expect(exportedText).toContain("providerWaitMs");
    expect(exportedText).not.toContain("raw_provider_payload");
    expect(exportedText).not.toContain("secret-provider-payload");
  });

  it("应按数量和时间裁剪 retained trend window", () => {
    const nowMs = Date.now();
    saveClawTraceRegressionTrendRecord(report("app_server", 10), {
      nowMs: nowMs - 8 * 24 * 60 * 60 * 1000,
    });

    for (
      let index = 0;
      index < CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS + 5;
      index += 1
    ) {
      saveClawTraceRegressionTrendRecord(report("provider_api", index + 1), {
        nowMs: nowMs + index,
      });
    }

    const records = listClawTraceRegressionTrend();
    expect(records).toHaveLength(CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS);
    expect(records[0]?.report.owner_totals[0]?.regressed_delta_ms).toBe(6);
    expect(records.at(-1)?.report.owner_totals[0]?.regressed_delta_ms).toBe(25);
    expect(
      records.some((record) => record.report.primary_owner === "app_server"),
    ).toBe(false);
  });

  it("无证据和损坏历史数据时应 fail closed", () => {
    expect(
      saveClawTraceRegressionTrendRecord({
        evidence_sources: [],
        owner_totals: [],
        primary_owner: null,
        segments: [],
        verdict: "no_evidence",
        window: {
          app_server_trace_window_count: 0,
          compact_history_record_count: 0,
        },
      }),
    ).toBeNull();

    window.localStorage.setItem(
      CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY,
      "{not-json",
    );
    expect(listClawTraceRegressionTrend()).toEqual([]);
    expect(exportClawTraceRegressionTrend().records).toEqual([]);
  });
});
