import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ClipboardCopy, Save, Trash2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/crashDiagnostic";
import {
  projectClawTraceRegressionAlert,
  type ClawTraceRegressionAlertSeverity,
} from "@/lib/trace/clawTraceRegressionAlert";
import {
  clearClawTraceRegressionAlertChannel,
  exportClawTraceRegressionAlertChannel,
  getClawTraceRegressionAlertChannelOverview,
  type ClawTraceRegressionAlertChannelOverview,
} from "@/lib/trace/clawTraceRegressionAlertChannel";
import { dispatchClawTraceRegressionAlert } from "@/lib/trace/clawTraceRegressionAlertDispatcher";
import { desktopHostClawTraceRegressionAlertNotifier } from "@/lib/trace/clawTraceRegressionAlertNotifier";
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
  ClawTraceRegressionReport,
  ClawTraceRegressionSegment,
  ClawTraceRegressionVerdict,
} from "@/lib/trace/clawTraceRegressionReport";
import {
  buildClawTraceRegressionAlertNotificationCopy,
  clawTraceRegressionAlertReasonLabelKey,
  clawTraceRegressionAlertSeverityLabelKey,
  clawTraceRegressionOwnerLabelKey,
} from "@/lib/trace/clawTraceRegressionAlertPresentation";
import { SECONDARY_BUTTON_CLASS_NAME } from "./shared";

type DeveloperSettingsMessage = {
  type: "success" | "error";
  text: string;
};

type SettingsTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface ClawTraceRegressionReportCardProps {
  alertEnabled: boolean;
  alertNotificationEnabled: boolean;
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
  alertNotificationEnabled,
  onMessage,
  report,
}: ClawTraceRegressionReportCardProps) {
  const { t } = useTranslation("settings");
  const translate = useMemo<SettingsTranslate>(() => {
    const baseTranslate = t as unknown as SettingsTranslate;
    return (key, options) => String(baseTranslate(key, options));
  }, [t]);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<ClawTraceRegressionTrendOverview>(
    () => getClawTraceRegressionTrendOverview(),
  );
  const [trendRecords, setTrendRecords] = useState<
    ClawTraceRegressionTrendRecord[]
  >(() => listClawTraceRegressionTrend());
  const [alertChannelOverview, setAlertChannelOverview] =
    useState<ClawTraceRegressionAlertChannelOverview>(() =>
      getClawTraceRegressionAlertChannelOverview(),
    );
  const refreshOverview = useCallback(() => {
    setTrendRecords(listClawTraceRegressionTrend());
    setOverview(getClawTraceRegressionTrendOverview());
  }, []);
  const refreshAlertChannelOverview = useCallback(() => {
    setAlertChannelOverview(getClawTraceRegressionAlertChannelOverview());
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

  useEffect(() => {
    if (!alertEnabled || !alert) {
      return;
    }
    let cancelled = false;
    const notificationCopy = buildClawTraceRegressionAlertNotificationCopy(
      alert,
      translate,
    );

    const dispatchPromise = dispatchClawTraceRegressionAlert({
      alert,
      alertEnabled,
      notification: {
        body: notificationCopy.body,
        notifier: desktopHostClawTraceRegressionAlertNotifier,
        title: notificationCopy.title,
      },
      notificationEnabled: alertNotificationEnabled,
      report,
    });
    refreshAlertChannelOverview();
    void dispatchPromise.then((result) => {
      if (!cancelled && result.notification_attempted) {
        refreshAlertChannelOverview();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    alert,
    alertEnabled,
    alertNotificationEnabled,
    refreshAlertChannelOverview,
    report,
    translate,
  ]);

  const handleSaveTrend = useCallback(() => {
    try {
      const record = saveClawTraceRegressionTrendRecord(report);
      if (!record) {
        onMessage({
          type: "error",
          text: translate(
            "settings.developer.message.clawTraceRegressionNoEvidenceToSave",
          ),
        });
        return;
      }
      refreshOverview();
      onMessage({
        type: "success",
        text: translate(
          "settings.developer.message.clawTraceRegressionTrendSaved",
        ),
      });
    } catch (error) {
      console.error("保存 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : translate(
                "settings.developer.message.saveClawTraceRegressionTrendFailed",
              ),
      });
    }
  }, [onMessage, refreshOverview, report, translate]);

  const handleCopyTrend = useCallback(async () => {
    setSaving(true);
    try {
      await copyTextToClipboard(
        JSON.stringify(exportClawTraceRegressionTrend(), null, 2),
      );
      onMessage({
        type: "success",
        text: translate(
          "settings.developer.message.clawTraceRegressionTrendCopied",
        ),
      });
    } catch (error) {
      console.error("复制 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : translate(
                "settings.developer.message.copyClawTraceRegressionTrendFailed",
              ),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, translate]);

  const handleCopyAlertChannel = useCallback(async () => {
    setSaving(true);
    try {
      await copyTextToClipboard(
        JSON.stringify(exportClawTraceRegressionAlertChannel(), null, 2),
      );
      onMessage({
        type: "success",
        text: translate(
          "settings.developer.message.clawTraceRegressionAlertChannelCopied",
        ),
      });
    } catch (error) {
      console.error("复制 Claw Trace regression alert channel 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : translate(
                "settings.developer.message.copyClawTraceRegressionAlertChannelFailed",
              ),
      });
    } finally {
      setSaving(false);
    }
  }, [onMessage, translate]);

  const handleClearAlertChannel = useCallback(() => {
    try {
      clearClawTraceRegressionAlertChannel();
      refreshAlertChannelOverview();
      onMessage({
        type: "success",
        text: translate(
          "settings.developer.message.clawTraceRegressionAlertChannelCleared",
        ),
      });
    } catch (error) {
      console.error("清空 Claw Trace regression alert channel 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : translate(
                "settings.developer.message.clearClawTraceRegressionAlertChannelFailed",
              ),
      });
    }
  }, [onMessage, refreshAlertChannelOverview, translate]);

  const handleClearTrend = useCallback(() => {
    try {
      clearClawTraceRegressionTrend();
      refreshOverview();
      onMessage({
        type: "success",
        text: translate(
          "settings.developer.message.clawTraceRegressionTrendCleared",
        ),
      });
    } catch (error) {
      console.error("清空 Claw Trace regression trend 失败:", error);
      onMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : translate(
                "settings.developer.message.clearClawTraceRegressionTrendFailed",
              ),
      });
    }
  }, [onMessage, refreshOverview, translate]);

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
      data-testid="claw-trace-regression-report"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.title",
          )}
        </p>
        <p className="text-xs font-semibold text-slate-700">
          {translate(verdictKey(report.verdict))}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {report.primary_owner
          ? translate(
              "settings.developer.debugSwitch.clawTrace.regression.focus",
              {
                owner: translate(
                  clawTraceRegressionOwnerLabelKey(report.primary_owner),
                ),
              },
            )
          : translate(
              "settings.developer.debugSwitch.clawTrace.regression.empty",
            )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {translate(
          "settings.developer.debugSwitch.clawTrace.regression.window",
          {
            compactCount: report.window.compact_history_record_count,
            traceCount: report.window.app_server_trace_window_count,
          },
        )}
      </p>
      <p
        className="mt-1 text-xs text-slate-500"
        data-testid="claw-trace-regression-trend-overview"
      >
        {translate(
          "settings.developer.debugSwitch.clawTrace.regression.trend",
          {
            count: overview.count,
            latestVerdict: overview.latest_verdict
              ? translate(verdictKey(overview.latest_verdict))
              : translate(
                  "settings.developer.debugSwitch.clawTrace.regression.verdict.noEvidence",
                ),
          },
        )}
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
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.alert.title",
          )}
          {": "}
          {alert
            ? translate(
                clawTraceRegressionAlertSeverityLabelKey(alert.severity),
              )
            : translate(
                "settings.developer.debugSwitch.clawTrace.regression.alert.disabled",
              )}
        </span>
        <span className="text-slate-500">
          {!alert
            ? translate(
                "settings.developer.debugSwitch.clawTrace.regression.alert.summary.disabled",
              )
            : alert.primary_owner
              ? translate(
                  "settings.developer.debugSwitch.clawTrace.regression.alert.summary.withOwner",
                  {
                    deltaMs: formatMs(alert.current_regressed_delta_ms),
                    owner: translate(
                      clawTraceRegressionOwnerLabelKey(alert.primary_owner),
                    ),
                    reason: translate(
                      clawTraceRegressionAlertReasonLabelKey(alert.reason),
                    ),
                    repeatCount: alert.repeated_owner_regression_count,
                    windowCount: alert.recent_report_count,
                  },
                )
              : translate(
                  "settings.developer.debugSwitch.clawTrace.regression.alert.summary.noOwner",
                  {
                    reason: translate(
                      clawTraceRegressionAlertReasonLabelKey(alert.reason),
                    ),
                    windowCount: alert.recent_report_count,
                  },
                )}
        </span>
      </div>
      <p
        className="mt-1 text-xs text-slate-500"
        data-testid="claw-trace-regression-alert-channel-overview"
      >
        {alertChannelOverview.latest_severity
          ? translate(
              "settings.developer.debugSwitch.clawTrace.regression.alertChannel.status.withLatest",
              {
                count: alertChannelOverview.count,
                latestSeverity: translate(
                  clawTraceRegressionAlertSeverityLabelKey(
                    alertChannelOverview.latest_severity,
                  ),
                ),
              },
            )
          : translate(
              "settings.developer.debugSwitch.clawTrace.regression.alertChannel.status.empty",
              {
                count: alertChannelOverview.count,
              },
            )}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {translate(
          "settings.developer.debugSwitch.clawTrace.regression.alertChannel.retention",
          {
            maxAgeDays: alertChannelOverview.retention.max_age_days,
            maxRecords: alertChannelOverview.retention.max_records,
          },
        )}
      </p>
      {report.owner_totals.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {report.owner_totals.map((total) => (
            <span
              key={total.owner}
              className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
            >
              {translate(clawTraceRegressionOwnerLabelKey(total.owner))}
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
              {translate(metricLabelKey(segment.key))}
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
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.action.save",
          )}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={() => void handleCopyTrend()}
        >
          <ClipboardCopy className="h-4 w-4" />
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.action.copy",
          )}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={() => void handleCopyAlertChannel()}
        >
          <ClipboardCopy className="h-4 w-4" />
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.alertChannel.action.copy",
          )}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={handleClearTrend}
        >
          <Trash2 className="h-4 w-4" />
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.action.clear",
          )}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS_NAME}
          disabled={saving}
          onClick={handleClearAlertChannel}
        >
          <Trash2 className="h-4 w-4" />
          {translate(
            "settings.developer.debugSwitch.clawTrace.regression.alertChannel.action.clear",
          )}
        </button>
      </div>
    </div>
  );
}
