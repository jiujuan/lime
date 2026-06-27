import { describe, expect, it } from "vitest";
import type { ClawTraceRegressionReport } from "./clawTraceRegressionReport";
import type { ClawTraceRegressionTrendRecord } from "./clawTraceRegressionTrend";
import { projectClawTraceRegressionAlert } from "./clawTraceRegressionAlert";

function report(
  owner: ClawTraceRegressionReport["primary_owner"],
  deltaMs: number,
  verdict: ClawTraceRegressionReport["verdict"] = "regressed",
): ClawTraceRegressionReport {
  return {
    evidence_sources: verdict === "no_evidence" ? [] : ["compact_summary"],
    owner_totals:
      verdict === "regressed" && owner
        ? [
            {
              metric_count: 1,
              owner,
              regressed_delta_ms: deltaMs,
            },
          ]
        : [],
    primary_owner: verdict === "regressed" ? owner : null,
    segments:
      verdict === "no_evidence"
        ? []
        : [
            {
              baseline_ms: 100,
              current_ms: 100 + deltaMs,
              delta_ms: deltaMs,
              key:
                owner === "lime_client"
                  ? "clientLocalOutputMs"
                  : "providerWaitMs",
              owner: owner ?? "provider_api",
              source: "compact_summary",
              verdict:
                verdict === "regressed"
                  ? "regressed"
                  : verdict === "improved"
                    ? "improved"
                    : "same",
            },
          ],
    verdict,
    window: {
      app_server_trace_window_count: 0,
      compact_history_record_count: 3,
    },
  };
}

function record(
  savedAtMs: number,
  regressionReport: ClawTraceRegressionReport,
): ClawTraceRegressionTrendRecord {
  return {
    id: `record-${savedAtMs}`,
    report: regressionReport,
    saved_at: new Date(savedAtMs).toISOString(),
    saved_at_ms: savedAtMs,
    schema_version: 1,
  };
}

describe("clawTraceRegressionAlert", () => {
  it("无当前证据时应 fail closed", () => {
    const alert = projectClawTraceRegressionAlert({
      currentReport: report(null, 0, "no_evidence"),
      trendRecords: [record(1, report("provider_api", 600))],
    });

    expect(alert).toEqual({
      current_regressed_delta_ms: 0,
      primary_owner: null,
      reason: "no_evidence",
      recent_report_count: 2,
      repeated_owner_regression_count: 0,
      severity: "none",
    });
  });

  it("单次小幅回退应进入 watch", () => {
    const alert = projectClawTraceRegressionAlert({
      currentReport: report("lime_client", 80),
      trendRecords: [],
    });

    expect(alert).toMatchObject({
      current_regressed_delta_ms: 80,
      primary_owner: "lime_client",
      reason: "current_regression",
      repeated_owner_regression_count: 1,
      severity: "watch",
    });
  });

  it("当前大幅回退应进入 warning", () => {
    const alert = projectClawTraceRegressionAlert({
      currentReport: report("provider_api", 220),
      trendRecords: [],
    });

    expect(alert).toMatchObject({
      current_regressed_delta_ms: 220,
      primary_owner: "provider_api",
      reason: "large_current_regression",
      severity: "warning",
    });
  });

  it("重复相同 owner 回退应进入 critical", () => {
    const alert = projectClawTraceRegressionAlert({
      currentReport: report("app_server", 60),
      trendRecords: [
        record(3, report("app_server", 70)),
        record(2, report("provider_api", 90)),
        record(1, report("app_server", 80)),
      ],
    });

    expect(alert).toMatchObject({
      current_regressed_delta_ms: 60,
      primary_owner: "app_server",
      reason: "repeated_owner_regression",
      repeated_owner_regression_count: 3,
      severity: "critical",
    });
  });

  it("当前 report 已保存时不重复计数", () => {
    const currentReport = report("provider_api", 180);
    const alert = projectClawTraceRegressionAlert({
      currentReport,
      trendRecords: [record(2, currentReport), record(1, currentReport)],
    });

    expect(alert).toMatchObject({
      recent_report_count: 1,
      repeated_owner_regression_count: 1,
      severity: "warning",
    });
    expect(JSON.stringify(alert)).not.toContain("raw_provider_payload");
  });
});
