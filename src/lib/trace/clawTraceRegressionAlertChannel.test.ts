import { beforeEach, describe, expect, it } from "vitest";
import type { ClawTraceRegressionAlert } from "./clawTraceRegressionAlert";
import type { ClawTraceRegressionReport } from "./clawTraceRegressionReport";
import {
  exportClawTraceRegressionAlertChannel,
  getClawTraceRegressionAlertChannelOverview,
  listClawTraceRegressionAlertChannel,
  recordClawTraceRegressionAlertChannelEvaluation,
  CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS,
  CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY,
} from "./clawTraceRegressionAlertChannel";

function report(
  owner: ClawTraceRegressionReport["primary_owner"],
  deltaMs: number,
): ClawTraceRegressionReport {
  return {
    evidence_sources: ["compact_summary"],
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
        source: "compact_summary",
        verdict: "regressed",
      },
    ],
    verdict: "regressed",
    window: {
      app_server_trace_window_count: 0,
      compact_history_record_count: 3,
    },
  };
}

function alert(
  severity: ClawTraceRegressionAlert["severity"],
  owner: ClawTraceRegressionReport["primary_owner"],
  deltaMs: number,
): ClawTraceRegressionAlert {
  return {
    current_regressed_delta_ms: deltaMs,
    primary_owner: owner,
    reason:
      severity === "critical"
        ? "repeated_owner_regression"
        : "current_regression",
    recent_report_count: 3,
    repeated_owner_regression_count: severity === "critical" ? 3 : 1,
    severity,
  };
}

describe("clawTraceRegressionAlertChannel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("none alert 不应写入通道", () => {
    const record = recordClawTraceRegressionAlertChannelEvaluation(
      alert("none", null, 0),
      report(null, 0),
      { nowMs: 1_000 },
    );

    expect(record).toBeNull();
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);
  });

  it("应只保存 summary-only alert channel record", () => {
    const record = recordClawTraceRegressionAlertChannelEvaluation(
      alert("warning", "provider_api", 220),
      report("provider_api", 220),
      { nowMs: 1_000 },
    );

    expect(record).toMatchObject({
      alert: {
        primary_owner: "provider_api",
        severity: "warning",
      },
      report_summary: {
        primary_owner: "provider_api",
        verdict: "regressed",
      },
    });
    const exported = exportClawTraceRegressionAlertChannel();
    expect(exported.retention).toMatchObject({
      assistant_delta_text: false,
      mode: "summary_only_alert",
      prompt_text: false,
      provider_payload: false,
      raw_entries: false,
      raw_trace_jsonl: false,
    });
    expect(JSON.stringify(exported)).not.toContain("raw_provider_payload");
    expect(JSON.stringify(exported)).not.toContain("assistant delta text");
  });

  it("相同 alert/report fingerprint 应去重", () => {
    const nowMs = Date.now();
    const currentAlert = alert("watch", "lime_client", 80);
    const currentReport = report("lime_client", 80);
    const first = recordClawTraceRegressionAlertChannelEvaluation(
      currentAlert,
      currentReport,
      { nowMs },
    );
    const second = recordClawTraceRegressionAlertChannelEvaluation(
      currentAlert,
      currentReport,
      { nowMs: nowMs + 1_000 },
    );

    expect(second?.id).toBe(first?.id);
    expect(listClawTraceRegressionAlertChannel()).toHaveLength(1);
  });

  it("应按 retained window 裁剪并忽略损坏记录", () => {
    const nowMs = Date.now();
    window.localStorage.setItem(
      CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY,
      JSON.stringify([{ id: "bad-record" }]),
    );
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);

    for (
      let index = 0;
      index < CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS + 2;
      index += 1
    ) {
      recordClawTraceRegressionAlertChannelEvaluation(
        alert(index % 2 === 0 ? "watch" : "critical", "app_server", 60 + index),
        report("app_server", 60 + index),
        { nowMs: nowMs + index },
      );
    }

    const records = listClawTraceRegressionAlertChannel();
    expect(records).toHaveLength(
      CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS,
    );
    expect(records[0]?.alert.current_regressed_delta_ms).toBe(62);
    expect(getClawTraceRegressionAlertChannelOverview()).toMatchObject({
      count: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS,
      latest_severity: "critical",
    });
  });
});
