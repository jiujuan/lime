import { useTranslation } from "react-i18next";
import type {
  ClawTraceBaselineComparison,
  ClawTraceBaselineMetricDelta,
  ClawTraceBaselineMetricKey,
  ClawTraceBaselineVerdict,
} from "@/lib/trace/clawTraceBaseline";

interface ClawTraceBaselineComparisonCardProps {
  comparison: ClawTraceBaselineComparison;
}

function formatSavedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

function formatMs(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

function formatSignedMs(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function metricLabelKey(metric: ClawTraceBaselineMetricKey): string {
  switch (metric) {
    case "providerWaitMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.providerWait";
    case "serverToRendererFirstTextDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.serverToRenderer";
    case "rendererApplyFirstTextDeltaMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.rendererApply";
    case "clientLocalOutputMs":
      return "settings.developer.debugSwitch.clawTrace.baseline.metric.clientLocal";
  }
}

function verdictKey(verdict: ClawTraceBaselineVerdict): string {
  switch (verdict) {
    case "no_current":
      return "settings.developer.debugSwitch.clawTrace.baseline.verdict.noCurrent";
    case "no_baseline":
      return "settings.developer.debugSwitch.clawTrace.baseline.verdict.noBaseline";
    case "same":
      return "settings.developer.debugSwitch.clawTrace.baseline.verdict.same";
    case "improved":
      return "settings.developer.debugSwitch.clawTrace.baseline.verdict.improved";
    case "regressed":
      return "settings.developer.debugSwitch.clawTrace.baseline.verdict.regressed";
  }
}

function metricDeltaClassName(metric: ClawTraceBaselineMetricDelta): string {
  switch (metric.verdict) {
    case "improved":
      return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700";
    case "regressed":
      return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800";
    case "same":
      return "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600";
  }
}

export function ClawTraceBaselineComparisonCard({
  comparison,
}: ClawTraceBaselineComparisonCardProps) {
  const { t } = useTranslation("settings");

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
      data-testid="claw-trace-baseline-comparison"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.baseline.title")}
        </p>
        <p className="text-xs font-semibold text-slate-700">
          {t(verdictKey(comparison.verdict))}
        </p>
      </div>
      {comparison.baseline_label ? (
        <p className="mt-1 text-xs text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.baseline.base", {
            label: comparison.baseline_label,
            savedAt:
              formatSavedAt(comparison.baseline_saved_at) ??
              comparison.baseline_saved_at,
          })}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {t("settings.developer.debugSwitch.clawTrace.baseline.empty")}
        </p>
      )}
      {comparison.history_record_count > 0 ? (
        <p
          className="mt-1 text-xs text-slate-500"
          data-testid="claw-trace-baseline-window"
        >
          {t("settings.developer.debugSwitch.clawTrace.baseline.window", {
            count: comparison.history_record_count,
            latestSavedAt:
              formatSavedAt(comparison.latest_saved_at) ??
              comparison.latest_saved_at,
          })}
        </p>
      ) : null}
      {comparison.metrics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {comparison.metrics.map((metric) => (
            <span key={metric.key} className={metricDeltaClassName(metric)}>
              {t(metricLabelKey(metric.key))}
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
