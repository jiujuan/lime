import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawTraceRegressionAlert } from "./clawTraceRegressionAlert";
import {
  clearClawTraceRegressionAlertChannel,
  listClawTraceRegressionAlertChannel,
} from "./clawTraceRegressionAlertChannel";
import { dispatchClawTraceRegressionAlert } from "./clawTraceRegressionAlertDispatcher";
import type { ClawTraceRegressionReport } from "./clawTraceRegressionReport";

function report(deltaMs: number): ClawTraceRegressionReport {
  return {
    evidence_sources: ["compact_summary"],
    owner_totals: [
      {
        metric_count: 1,
        owner: "lime_client",
        regressed_delta_ms: deltaMs,
      },
    ],
    primary_owner: "lime_client",
    segments: [
      {
        baseline_ms: 100,
        current_ms: 100 + deltaMs,
        delta_ms: deltaMs,
        key: "clientLocalOutputMs",
        owner: "lime_client",
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
  severity: Exclude<ClawTraceRegressionAlert["severity"], "none">,
  deltaMs: number,
): ClawTraceRegressionAlert {
  return {
    current_regressed_delta_ms: deltaMs,
    primary_owner: "lime_client",
    reason:
      severity === "critical"
        ? "large_current_regression"
        : "current_regression",
    recent_report_count: 3,
    repeated_owner_regression_count: severity === "critical" ? 3 : 1,
    severity,
  };
}

describe("clawTraceRegressionAlertDispatcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("alert 总闸门关闭时不写入本地 channel", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };

    const result = await dispatchClawTraceRegressionAlert({
      alert: alert("warning", 180),
      alertEnabled: false,
      notification: {
        body: "body",
        notifier,
        title: "title",
      },
      notificationEnabled: true,
      report: report(180),
    });

    expect(result).toMatchObject({
      notification_attempted: false,
      notification_result: "not_requested",
      recorded: false,
      skipped_reason: "alert_disabled",
    });
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);
  });

  it("none alert 不写入也不通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };

    const result = await dispatchClawTraceRegressionAlert({
      alert: {
        current_regressed_delta_ms: 0,
        primary_owner: null,
        reason: "current_stable",
        recent_report_count: 1,
        repeated_owner_regression_count: 0,
        severity: "none",
      },
      alertEnabled: true,
      notification: {
        body: "body",
        notifier,
        title: "title",
      },
      notificationEnabled: true,
      report: report(0),
    });

    expect(result.skipped_reason).toBe("none_alert");
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(listClawTraceRegressionAlertChannel()).toEqual([]);
  });

  it("通知关闭时只写入 summary-only channel", async () => {
    const nowMs = Date.now();
    const result = await dispatchClawTraceRegressionAlert({
      alert: alert("watch", 80),
      alertEnabled: true,
      notificationEnabled: false,
      nowMs,
      report: report(80),
    });

    expect(result).toMatchObject({
      notification_attempted: false,
      notification_result: "not_requested",
      recorded: true,
      skipped_reason: null,
    });
    expect(listClawTraceRegressionAlertChannel()).toHaveLength(1);
  });

  it("新写入的 alert 才触发通知，相同 fingerprint 不重复通知", async () => {
    const notifier = { notify: vi.fn(() => "sent" as const) };
    const currentAlert = alert("critical", 520);
    const currentReport = report(520);
    const nowMs = Date.now();

    const first = await dispatchClawTraceRegressionAlert({
      alert: currentAlert,
      alertEnabled: true,
      notification: {
        body: "Lime local output · +520 ms",
        notifier,
        title: "Regression alert: Critical",
      },
      notificationEnabled: true,
      nowMs,
      report: currentReport,
    });
    const second = await dispatchClawTraceRegressionAlert({
      alert: currentAlert,
      alertEnabled: true,
      notification: {
        body: "Lime local output · +520 ms",
        notifier,
        title: "Regression alert: Critical",
      },
      notificationEnabled: true,
      nowMs: nowMs + 1_000,
      report: currentReport,
    });

    expect(first).toMatchObject({
      notification_attempted: true,
      notification_result: "sent",
      recorded: true,
    });
    expect(second).toMatchObject({
      notification_attempted: false,
      notification_result: "not_requested",
      recorded: false,
      skipped_reason: "duplicate",
    });
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith({
      body: "Lime local output · +520 ms",
      tag: first.record?.id,
      title: "Regression alert: Critical",
    });
    expect(listClawTraceRegressionAlertChannel()).toHaveLength(1);
  });

  it("本地存储不可用时不尝试通知", async () => {
    clearClawTraceRegressionAlertChannel();
    const notifier = { notify: vi.fn(() => "sent" as const) };
    const originalLocalStorage = Object.getOwnPropertyDescriptor(
      window,
      "localStorage",
    );
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      },
    });

    try {
      const result = await dispatchClawTraceRegressionAlert({
        alert: alert("warning", 180),
        alertEnabled: true,
        notification: {
          body: "body",
          notifier,
          title: "title",
        },
        notificationEnabled: true,
        report: report(180),
      });

      expect(result).toMatchObject({
        notification_attempted: false,
        recorded: false,
        skipped_reason: "record_failed",
      });
      expect(notifier.notify).not.toHaveBeenCalled();
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(window, "localStorage", originalLocalStorage);
      }
    }
  });
});
