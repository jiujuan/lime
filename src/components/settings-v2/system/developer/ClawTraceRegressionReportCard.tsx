import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ClipboardCopy, Save, Trash2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/crashDiagnostic";
import {
  projectClawTraceRegressionAlert,
  type ClawTraceRegressionAlertReason,
  type ClawTraceRegressionAlertSeverity,
} from "@/lib/trace/clawTraceRegressionAlert";
import {
  clearClawTraceRegressionTrend,
  exportClawTraceRegressionTrend,
  getClawTraceRegressionTrendOverview,
  listClawTraceRegressionTrend,
  saveClawTraceRegressionTrendRecord,
  type ClawTraceRegressionTrendRecord,
  type ClawTraceRegressionTrendOverview,
} from "@/lib/trace/clawTraceRegressionTrend";
import type {
  ClawTraceRegressionMetricKey,
  ClawTraceRegressionOwner,
  ClawTraceRegressionReport,
  ClawTraceRegressionSegment,
  ClawTraceRegressionVerdict,
} from "@/lib/trace/clawTraceRegressionReport";
import { SECONDARY_BUTTON_CLASS_NAME } from "./shared";

type DeveloperSettingsMessage = {
  type: "success" | "error";
  text: string;
};

interface ClawTraceRegressionReportCardProps {
  alertEnabled: boolean;
  onMessage: (message: DeveloperSettingsMessage) => void;
  report: ClawTraceRegressionReport;
}

function formatMs(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

function formatSignedMs(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function verdictKey(verdict: ClawTraceRegressionVerdict): string {
  switch (verdict) {
    case "no_evidence":
      return "settings.developer.debugSwitch.clawTrace.regression.verdict.noEvidence";
    case "same":
      return "settings.developer.debugSwitch.clawTrace.regression.verdict.same";
    case "improved":
      return "settings.developer.debugSwitch.clawTrace.regression.verdict.improved";
    case "regressed":
      return "settings.developer.debugSwitch.clawTrace.regression.verdict.regressed";
  }
}

function ownerKey(owner: ClawTraceRegressionOwner): string {
  switch (owner) {
    case "provider_api":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.providerApi";
    case "app_server":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.appServer";
    case "lime_client":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.limeClient";
  }
}

function metricLabelKey(metric: ClawTraceRegressionMetricKey): string {
  switch (metric) {
    case "providerWaitMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.providerWait";
    case "serverToRendererFirstTextDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.serverToRenderer";
    case "rendererApplyFirstTextDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.rendererApply";
    case "clientLocalOutputMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.clientLocal";
    case "providerFirstEventMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerFirstEvent";
    case "providerFirstTextMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerFirstText";
    case "providerToAppServerFirstDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerToAppServer";
    case "appServerFirstDeltaToTerminalMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.appServerTerminal";
  }
}

function alertSeverityKey(severity: ClawTraceRegressionAlertSeverity): string {
  switch (severity) {
    case "none":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.none";
    case "watch":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.watch";
    case "warning":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.warning";
    case "critical":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.critical";
  }
}

function alertReasonKey(reason: ClawTraceRegressionAlertReason): string {
  switch (reason) {
    case "no_evidence":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.noEvidence";
    case "current_stable":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.currentStable";
    case "current_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.currentRegression";
    case "large_current_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.largeCurrentRegression";
    case "repeated_owner_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.repeatedOwnerRegression";
  }
}

function alertClassName(severity: ClawTraceRegressionAlertSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
    case "warning":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-100";
    case "watch":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-100";
    case "none":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
  }
}

function segmentClassName(segment: ClawTraceRegressionSegment): string {
  switch (segment.verdict) {
    case "improved":
      return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
    case "regressed":
      return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800";
    case "same":
      return "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600";
  }
}

export function ClawTraceRegressionReportCard({
  alertEnabled,
  onMessage,
  report,
}: ClawTraceRegressionReportCardProps) {
  const { t } = useTranslation("settings");
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<ClawTraceRegressionTrendOverview>(
    () => getClawTraceRegressionTrendOverview(),
  );
  const [trendRecords, setTrendRecords] = useState<
    ClawTraceRegressionTrendRecord[]
  >(() => listClawTraceRegressionTrend());
  const refreshOverview = useCallback(() => {
    setTrendRecords(listClawTraceRegressionTrend());
    setOverview(getClawTraceRegressionTrendOverview());
  }, []);
  useEffect(() => {
    refreshOverview();
  }, [refreshOverview, report]);

  const alert = useMemo(
    () =>
      alertEnabled
        ? projectClawTraceRegressionAlert({
            currentReport: report,
            trendRecords,
          })
        : null,
    [alertEnabled, report, trendRecords],
  );

  const handleSaveTrend = useCallback(() => {
    try {
      const record = saveClawTraceRegressionTrendRecord(report);
      if (!record) {
        onMessage({
          type: "error",
          text: t(
            "settings.developer.message.clawTraceRegressionNoEvidenceToSave",
          ),
        });
        return;
      }
      refreshOverview();
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceRegressionTrendSaved"),
      });
    } catch (error) {
      console.error("保存 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t(
                "settings.developer.message.saveClawTraceRegressionTrendFailed",
              ),
      });
    }
  }, [onMessage, refreshOverview, report, t]);

  const handleCopyTrend = useCallback(async () => {
    setSaving(true);
    try {
      await copyTextToClipboard(
        JSON.stringify(exportClawTraceRegressionTrend(), null, 2),
      );
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceRegressionTrendCopied"),
      });
    } catch (error) {
      console.error("复制 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t(
                "settings.developer.message.copyClawTraceRegressionTrendFailed",
              ),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, t]);

  const handleClearTrend = useCallback(() => {
    try {
      clearClawTraceRegressionTrend();
      refreshOverview();
      onMessage({
        type: "success",
        text: t("settings.developer.message.clawTraceRegressionTrendCleared"),
      });
    } catch (error) {
      console.error("清空 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : t(
                "settings.developer.message.clearClawTraceRegressionTrendFailed",
              ),
      });
    }
  }, [onMessage, refreshOverview, t]);

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
      data-testid="claw-trace-regression-report"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.regression.title")}
        </p>
        <p className="text-xs font-semibold text-slate-700">
          {t(verdictKey(report.verdict))}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {report.primary_owner
          ? t("settings.developer.debugSwitch.clawTrace.regression.focus", {
              owner: t(ownerKey(report.primary_owner)),
            })
          : t("settings.developer.debugSwitch.clawTrace.regression.empty")}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {t("settings.developer.debugSwitch.clawTrace.regression.window", {
          compactCount: report.window.compact_history_record_count,
          traceCount: report.window.app_server_trace_window_count,
        })}
      </p>
      <p
        className="mt-1 text-xs text-slate-500"
        data-testid="claw-trace-regression-trend-overview"
      >
        {t("settings.developer.debugSwitch.clawTrace.regression.trend", {
          count: overview.count,
          latestVerdict: overview.latest_verdict
            ? t(verdictKey(overview.latest_verdict))
            : t(
                "settings.developer.debugSwitch.clawTrace.regression.verdict.noEvidence",
              ),
        })}
      </p>
      <div
        className="mt-2 flex flex-wrap items-center gap-2 text-xs"
        data-testid="claw-trace-regression-alert"
      >
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            alert
              ? alertClassName(alert.severity)
              : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("settings.developer.debugSwitch.clawTrace.regression.alert.title")}
          {": "}
          {alert
            ? t(alertSeverityKey(alert.severity))
            : t(
                "settings.developer.debugSwitch.clawTrace.regression.alert.disabled",
              )}
        </span>
        <span className="text-slate-500">
          {!alert
            ? t(
                "settings.developer.debugSwitch.clawTrace.regression.alert.summary.disabled",
              )
            : alert.primary_owner
              ? t(
                  "settings.developer.debugSwitch.clawTrace.regression.alert.summary.withOwner",
                  {
                  deltaMs: formatMs(alert.current_regressed_delta_ms),
                  owner: t(ownerKey(alert.primary_owner)),
                  reason: t(alertReasonKey(alert.reason)),
                  repeatCount: alert.repeated_owner_regression_count,
                  windowCount: alert.recent_report_count,
                },
              )
            : t(
                "settings.developer.debugSwitch.clawTrace.regression.alert.summary.noOwner",
                {
                  reason: t(alertReasonKey(alert.reason)),
                  windowCount: alert.recent_report_count,
                },
              )}
        </span>
      </div>
      {report.owner_totals.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {report.owner_totals.map((total) => (
            <span
              key={total.owner}
              className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
            >
              {t(ownerKey(total.owner))}
              {": +"}
              {formatMs(total.regressed_delta_ms)}
              {" ms"}
            </span>
          ))}
        </div>
      ) : null}
      {report.segments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {report.segments.slice(0, 6).map((segment) => (
            <span
              key={`${segment.source}:${segment.key}`}
              className={segmentClassName(segment)}
            >
              {t(metricLabelKey(segment.key))}
              {": "}
              {formatMs(segment.current_ms)}
              {" ms / "}
              {formatSignedMs(segment.delta_ms)}
              {" ms"}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={handleSaveTrend}
        >
          <Save className="h-4 w-4" />
          {t("settings.developer.debugSwitch.clawTrace.regression.action.save")}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={() => void handleCopyTrend()}
        >
          <ClipboardCopy className="h-4 w-4" />
          {t("settings.developer.debugSwitch.clawTrace.regression.action.copy")}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={handleClearTrend}
        >
          <Trash2 className="h-4 w-4" />
          {t(
            "settings.developer.debugSwitch.clawTrace.regression.action.clear",
          )}
        </button>
      </div>
    </div>
  );
}
