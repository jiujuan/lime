import type {
  AgentUiPerformanceTraceHistoryRecord,
  AgentUiPerformanceTraceHistoryRetentionPolicy,
} from "@/lib/agentUiPerformanceTraceHistory";
import type { AgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";

export type ClawTraceBaselineMetricKey =
  | "providerWaitMs"
  | "serverToRendererFirstTextDeltaMs"
  | "rendererApplyFirstTextDeltaMs"
  | "clientLocalOutputMs";

export type ClawTraceBaselineVerdict =
  | "no_current"
  | "no_baseline"
  | "same"
  | "improved"
  | "regressed";

export type ClawTraceBaselineStrategy = "oldest_retained_snapshot";

export interface ClawTraceBaselineMetricDelta {
  key: ClawTraceBaselineMetricKey;
  current_ms: number;
  baseline_ms: number;
  delta_ms: number;
  delta_ratio: number | null;
  verdict: Extract<ClawTraceBaselineVerdict, "same" | "improved" | "regressed">;
}

export interface ClawTraceBaselineComparison {
  baseline_label: string | null;
  baseline_saved_at: string | null;
  baseline_strategy: ClawTraceBaselineStrategy;
  history_record_count: number;
  latest_saved_at: string | null;
  metrics: ClawTraceBaselineMetricDelta[];
  retention: AgentUiPerformanceTraceHistoryRetentionPolicy;
  verdict: ClawTraceBaselineVerdict;
}

export interface ProjectClawTraceBaselineComparisonInput {
  baselineRecords: AgentUiPerformanceTraceHistoryRecord[];
  currentSummary: AgentUiPerformanceDiagnosticSummary | null | undefined;
  retention: AgentUiPerformanceTraceHistoryRetentionPolicy;
}

const COMPARED_METRICS: ClawTraceBaselineMetricKey[] = [
  "providerWaitMs",
  "serverToRendererFirstTextDeltaMs",
  "rendererApplyFirstTextDeltaMs",
  "clientLocalOutputMs",
];

const MIN_REGRESSION_DELTA_MS = 50;
const MIN_REGRESSION_RATIO = 0.15;
const BASELINE_STRATEGY: ClawTraceBaselineStrategy = "oldest_retained_snapshot";

function sortedBaselineRecords(
  records: AgentUiPerformanceTraceHistoryRecord[],
): AgentUiPerformanceTraceHistoryRecord[] {
  return [...records].sort((left, right) => {
    const bySavedAt = left.saved_at_ms - right.saved_at_ms;
    if (bySavedAt !== 0) {
      return bySavedAt;
    }
    return left.id.localeCompare(right.id);
  });
}

function metricValue(
  summary: AgentUiPerformanceDiagnosticSummary,
  key: ClawTraceBaselineMetricKey,
): number | null {
  for (const session of summary.sessions.toReversed()) {
    const value = session.metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
  }
  return null;
}

function metricDeltaVerdict(
  deltaMs: number,
  deltaRatio: number | null,
): ClawTraceBaselineMetricDelta["verdict"] {
  if (deltaMs <= -MIN_REGRESSION_DELTA_MS) {
    return "improved";
  }
  if (
    deltaMs >= MIN_REGRESSION_DELTA_MS &&
    (deltaRatio === null || deltaRatio >= MIN_REGRESSION_RATIO)
  ) {
    return "regressed";
  }
  return "same";
}

function projectMetricDelta(
  currentSummary: AgentUiPerformanceDiagnosticSummary,
  baselineSummary: AgentUiPerformanceDiagnosticSummary,
  key: ClawTraceBaselineMetricKey,
): ClawTraceBaselineMetricDelta | null {
  const currentMs = metricValue(currentSummary, key);
  const baselineMs = metricValue(baselineSummary, key);
  if (currentMs === null || baselineMs === null) {
    return null;
  }

  const deltaMs = currentMs - baselineMs;
  const deltaRatio = baselineMs > 0 ? deltaMs / baselineMs : null;
  return {
    key,
    current_ms: currentMs,
    baseline_ms: baselineMs,
    delta_ms: deltaMs,
    delta_ratio: deltaRatio,
    verdict: metricDeltaVerdict(deltaMs, deltaRatio),
  };
}

function aggregateVerdict(
  metrics: ClawTraceBaselineMetricDelta[],
): ClawTraceBaselineVerdict {
  if (metrics.some((metric) => metric.verdict === "regressed")) {
    return "regressed";
  }
  if (metrics.some((metric) => metric.verdict === "improved")) {
    return "improved";
  }
  return "same";
}

export function projectClawTraceBaselineComparison({
  baselineRecords,
  currentSummary,
  retention,
}: ProjectClawTraceBaselineComparisonInput): ClawTraceBaselineComparison {
  const sortedRecords = sortedBaselineRecords(baselineRecords);
  const baseline = sortedRecords[0] ?? null;
  const latest = sortedRecords.at(-1) ?? null;
  if (!currentSummary || currentSummary.session_count === 0) {
    return {
      baseline_label: baseline?.label ?? null,
      baseline_saved_at: baseline?.saved_at ?? null,
      baseline_strategy: BASELINE_STRATEGY,
      history_record_count: sortedRecords.length,
      latest_saved_at: latest?.saved_at ?? null,
      metrics: [],
      retention,
      verdict: "no_current",
    };
  }
  if (!baseline) {
    return {
      baseline_label: null,
      baseline_saved_at: null,
      baseline_strategy: BASELINE_STRATEGY,
      history_record_count: 0,
      latest_saved_at: null,
      metrics: [],
      retention,
      verdict: "no_baseline",
    };
  }

  const metrics = COMPARED_METRICS.flatMap((key) => {
    const delta = projectMetricDelta(currentSummary, baseline.summary, key);
    return delta ? [delta] : [];
  });

  return {
    baseline_label: baseline.label,
    baseline_saved_at: baseline.saved_at,
    baseline_strategy: BASELINE_STRATEGY,
    history_record_count: sortedRecords.length,
    latest_saved_at: latest?.saved_at ?? null,
    metrics,
    retention,
    verdict: aggregateVerdict(metrics),
  };
}
