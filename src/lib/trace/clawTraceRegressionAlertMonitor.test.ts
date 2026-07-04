import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentUiPerformanceTraceHistoryRecord,
  AgentUiPerformanceTraceHistoryRetentionPolicy,
} from "@/lib/agentUiPerformanceTraceHistory";
import type { AgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";
import {
  clearClawTraceRegressionAlertChannel,
  listClawTraceRegressionAlertChannel,
} from "./clawTraceRegressionAlertChannel";
import { evaluateClawTraceRegressionAlertMonitor } from "./clawTraceRegressionAlertMonitor";

const retention: AgentUiPerformanceTraceHistoryRetentionPolicy = {
  max_age_days: 7,
  max_records: 20,
  mode: "compact_summary_only",
  prompt_text: false,
  provider_payload: false,
  raw_entries: false,
};

function summary(
  metrics: Record<string, number>,
): AgentUiPerformanceDiagnosticSummary {
  return {
    entry_count: 4,
    session_count: 1,
    sessions: [
      {
        metrics,
        phase_count: 4,
        phases: ["agentStream.firstTextDelta", "agentStream.firstTextPaint"],
        sessionId: "session-a",
        workspaceId: "workspace-a",
      },
    ],
    truncated_session_count: 0,
  };
}

function historyRecord(
  metrics: Record<string, number>,
): AgentUiPerformanceTraceHistoryRecord {
  const savedAtMs = Date.parse("2026-06-27T00:00:00.000Z");
  return {
    id: "baseline-a",
    label: "baseline-a",
    saved_at: new Date(savedAtMs).toISOString(),
    saved_at_ms: savedAtMs,
    schema_version: 1,
    summary: summary(metrics),
  };
}

describe("clawTraceRegressionAlertMonitor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearClawTraceRegressionAlertChannel();
  });

  it("trace 关闭时不评估、不写 channel、不通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };

    const result = await evaluateClawTraceRegressionAlertMonitor({
      alertEnabled: true,
      baselineRecords: [
        historyRecord({
          clientLocalOutputMs: 100,
        }),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 400,
      }),
      notification: {
        format: () => ({ body: "body", title: "title" }),
        notifier,
      },
      notificationEnabled: true,
      retention,
      traceEnabled: false,
    });

    expect(result).toMatchObject({
      app_server_trace_requested: false,
      dispatch_result: null,
      notification_result: "not_evaluated",
      report: null,
      skipped_reason: "trace_disabled",
    });
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);
  });

  it("alert 总闸门关闭时不写 channel、不通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };

    const result = await evaluateClawTraceRegressionAlertMonitor({
      alertEnabled: false,
      baselineRecords: [
        historyRecord({
          clientLocalOutputMs: 100,
        }),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 400,
      }),
      notification: {
        format: () => ({ body: "body", title: "title" }),
        notifier,
      },
      notificationEnabled: true,
      retention,
      traceEnabled: true,
    });

    expect(result.skipped_reason).toBe("alert_disabled");
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);
  });

  it("开启后只用 compact summary 评估并触发一次通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };
    const nowMs = Date.now();

    const result = await evaluateClawTraceRegressionAlertMonitor({
      alertEnabled: true,
      baselineRecords: [
        historyRecord({
          clientLocalOutputMs: 100,
          providerWaitMs: 1000,
        }),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 310,
        providerWaitMs: 980,
      }),
      notification: {
        format: (alert) => ({
          body: `client delta ${alert.current_regressed_delta_ms}`,
          title: `alert ${alert.severity}`,
        }),
        notifier,
      },
      notificationEnabled: true,
      nowMs,
      retention,
      traceEnabled: true,
      trendRecords: [],
    });

    expect(result).toMatchObject({
      app_server_trace_requested: false,
      skipped_reason: null,
    });
    expect(result.report).toMatchObject({
      evidence_sources: ["compact_summary"],
      primary_owner: "lime_client",
      verdict: "regressed",
      window: {
        app_server_trace_window_count: 0,
        compact_history_record_count: 1,
      },
    });
    expect(result.alert).toMatchObject({
      current_regressed_delta_ms: 210,
      primary_owner: "lime_client",
      severity: "warning",
    });
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith({
      body: "client delta 210",
      tag: `claw-trace-regression-alert-${Math.round(nowMs)}`,
      title: "alert warning",
    });
    expect(listClawTraceRegressionAlertChannel()).toHaveLength(1);
  });

  it("相同 fingerprint 不重复通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };
    const nowMs = Date.now();
    const input = {
      alertEnabled: true,
      baselineRecords: [
        historyRecord({
          clientLocalOutputMs: 100,
        }),
      ],
      currentSummary: summary({
        clientLocalOutputMs: 310,
      }),
      notification: {
        format: () => ({ body: "body", title: "title" }),
        notifier,
      },
      notificationEnabled: true,
      retention,
      traceEnabled: true,
      trendRecords: [],
    };

    const first = await evaluateClawTraceRegressionAlertMonitor({
      ...input,
      nowMs,
    });
    const second = await evaluateClawTraceRegressionAlertMonitor({
      ...input,
      nowMs: nowMs + 60_000,
    });

    expect(first.dispatch_result?.notification_attempted).toBe(true);
    expect(second.dispatch_result).toMatchObject({
      notification_attempted: false,
      skipped_reason: "duplicate",
    });
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(listClawTraceRegressionAlertChannel()).toHaveLength(1);
  });

  it("monitor 不应导入 App Server trace 读取 API", () => {
    const source = readFileSync(
      resolve(cwd(), "src/lib/trace/clawTraceRegressionAlertMonitor.ts"),
      "utf8",
    );

    expect(source).not.toContain("listDiagnosticsTraces");
    expect(source).not.toContain("readDiagnosticsTrace");
    expect(source).not.toContain("@/lib/api/serverRuntime");
  });
});
