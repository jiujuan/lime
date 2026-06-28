import { useTranslation } from "react-i18next";
import type {
  ClawTraceAppServerComparison,
  ClawTraceAppServerComparisonMetricDelta,
  ClawTraceAppServerComparisonMetricKey,
  ClawTraceAppServerComparisonVerdict,
} from "@/lib/trace/clawTraceAppServerComparison";

interface ClawTraceAppServerComparisonCardProps {
  comparison: ClawTraceAppServerComparison;
}

type SettingsTranslate = (key: string) => string;

function formatMs(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

function formatSignedMs(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function metricLabelKey(metric: ClawTraceAppServerComparisonMetricKey): string {
  switch (metric) {
    case "providerFirstEventMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerFirstEvent";
    case "providerFirstTextMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerFirstText";
    case "providerToAppServerFirstDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.providerToAppServer";
    case "appServerFirstDeltaToTerminalMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.appServerTerminal";
    case "rootDurationMs":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.metric.rootDuration";
  }
}

function verdictKey(verdict: ClawTraceAppServerComparisonVerdict): string {
  switch (verdict) {
    case "no_current":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.noCurrent";
    case "no_baseline":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.noBaseline";
    case "no_comparable":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.noComparable";
    case "same":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.same";
    case "improved":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.improved";
    case "regressed":
      return "settings.developer.debugSwitch.clawTrace.appServerCompare.verdict.regressed";
  }
}

function metricDeltaClassName(
  metric: ClawTraceAppServerComparisonMetricDelta,
): string {
  switch (metric.verdict) {
    case "improved":
      return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
    case "regressed":
      return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800";
    case "same":
      return "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600";
  }
}

export function ClawTraceAppServerComparisonCard({
  comparison,
}: ClawTraceAppServerComparisonCardProps) {
  const { t } = useTranslation("settings");
  const translate = ((key) =>
    String(
      (t as unknown as SettingsTranslate)(key),
    )) satisfies SettingsTranslate;
  const hasBothTraces = Boolean(
    comparison.current_trace_id && comparison.baseline_trace_id,
  );

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
      data-testid="claw-trace-app-server-comparison"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.appServerCompare.title")}
        </p>
        <p className="text-xs font-semibold text-slate-700">
          {translate(verdictKey(comparison.verdict))}
        </p>
      </div>
      {hasBothTraces ? (
        <p className="mt-1 text-xs text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.appServerCompare.base", {
            baselineTraceId: comparison.baseline_trace_id,
            currentTraceId: comparison.current_trace_id,
          })}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.appServerCompare.empty")}
        </p>
      )}
      {comparison.trace_window_count > 0 && comparison.latest_trace_id ? (
        <p className="mt-1 break-all text-xs text-slate-500">
          {t(
            "settings.developer.debugSwitch.clawTrace.appServerCompare.window",
            {
              count: comparison.trace_window_count,
              latestTraceId: comparison.latest_trace_id,
            },
          )}
        </p>
      ) : null}
      {comparison.metrics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {comparison.metrics.map((metric) => (
            <span key={metric.key} className={metricDeltaClassName(metric)}>
              {translate(metricLabelKey(metric.key))}
              {": "}
              {formatMs(metric.current_ms)}
              {" ms"}
              {" / "}
              {formatSignedMs(metric.delta_ms)}
              {" ms"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
