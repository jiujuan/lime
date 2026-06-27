import type {
  ClawTraceAppServerComparison,
  ClawTraceAppServerComparisonMetricDelta,
  ClawTraceAppServerComparisonMetricKey,
} from "./clawTraceAppServerComparison";
import type {
  ClawTraceBaselineComparison,
  ClawTraceBaselineMetricDelta,
  ClawTraceBaselineMetricKey,
} from "./clawTraceBaseline";

export type ClawTraceRegressionOwner =
  | "provider_api"
  | "app_server"
  | "lime_client";

export type ClawTraceRegressionSource = "app_server_trace" | "compact_summary";

export type ClawTraceRegressionVerdict =
  | "no_evidence"
  | "same"
  | "improved"
  | "regressed";

export type ClawTraceRegressionMetricKey =
  | ClawTraceBaselineMetricKey
  | Exclude<ClawTraceAppServerComparisonMetricKey, "rootDurationMs">;

export interface ClawTraceRegressionSegment {
  baseline_ms: number;
  current_ms: number;
  delta_ms: number;
  key: ClawTraceRegressionMetricKey;
  owner: ClawTraceRegressionOwner;
  source: ClawTraceRegressionSource;
  verdict: Exclude<ClawTraceRegressionVerdict, "no_evidence">;
}

export interface ClawTraceRegressionOwnerTotal {
  metric_count: number;
  owner: ClawTraceRegressionOwner;
  regressed_delta_ms: number;
}

export interface ClawTraceRegressionReport {
  evidence_sources: ClawTraceRegressionSource[];
  owner_totals: ClawTraceRegressionOwnerTotal[];
  primary_owner: ClawTraceRegressionOwner | null;
  segments: ClawTraceRegressionSegment[];
  verdict: ClawTraceRegressionVerdict;
  window: {
    compact_history_record_count: number;
    app_server_trace_window_count: number;
  };
}

export interface ProjectClawTraceRegressionReportInput {
  appServerComparison?: ClawTraceAppServerComparison | null;
  baselineComparison: ClawTraceBaselineComparison;
}

function ownerForBaselineMetric(
  key: ClawTraceBaselineMetricKey,
): ClawTraceRegressionOwner {
  switch (key) {
    case "providerWaitMs":
      return "provider_api";
    case "serverToRendererFirstTextDeltaMs":
    case "rendererApplyFirstTextDeltaMs":
    case "clientLocalOutputMs":
      return "lime_client";
  }
}

function ownerForAppServerMetric(
  key: Exclude<ClawTraceAppServerComparisonMetricKey, "rootDurationMs">,
): ClawTraceRegressionOwner {
  switch (key) {
    case "providerFirstEventMs":
    case "providerFirstTextMs":
      return "provider_api";
    case "providerToAppServerFirstDeltaMs":
    case "appServerFirstDeltaToTerminalMs":
      return "app_server";
  }
}

function fromBaselineMetric(
  metric: ClawTraceBaselineMetricDelta,
): ClawTraceRegressionSegment {
  return {
    baseline_ms: metric.baseline_ms,
    current_ms: metric.current_ms,
    delta_ms: metric.delta_ms,
    key: metric.key,
    owner: ownerForBaselineMetric(metric.key),
    source: "compact_summary",
    verdict: metric.verdict,
  };
}

function fromAppServerMetric(
  metric: ClawTraceAppServerComparisonMetricDelta,
): ClawTraceRegressionSegment | null {
  if (metric.key === "rootDurationMs") {
    return null;
  }
  return {
    baseline_ms: metric.baseline_ms,
    current_ms: metric.current_ms,
    delta_ms: metric.delta_ms,
    key: metric.key,
    owner: ownerForAppServerMetric(metric.key),
    source: "app_server_trace",
    verdict: metric.verdict,
  };
}

function aggregateVerdict(
  segments: ClawTraceRegressionSegment[],
): ClawTraceRegressionVerdict {
  if (segments.length === 0) {
    return "no_evidence";
  }
  if (segments.some((segment) => segment.verdict === "regressed")) {
    return "regressed";
  }
  if (segments.some((segment) => segment.verdict === "improved")) {
    return "improved";
  }
  return "same";
}

function ownerTotals(
  segments: ClawTraceRegressionSegment[],
): ClawTraceRegressionOwnerTotal[] {
  const totals = new Map<
    ClawTraceRegressionOwner,
    ClawTraceRegressionOwnerTotal
  >();
  for (const segment of segments) {
    if (segment.verdict !== "regressed" || segment.delta_ms <= 0) {
      continue;
    }
    const current = totals.get(segment.owner) ?? {
      metric_count: 0,
      owner: segment.owner,
      regressed_delta_ms: 0,
    };
    totals.set(segment.owner, {
      ...current,
      metric_count: current.metric_count + 1,
      regressed_delta_ms: current.regressed_delta_ms + segment.delta_ms,
    });
  }
  return [...totals.values()].sort((left, right) => {
    const byDelta = right.regressed_delta_ms - left.regressed_delta_ms;
    if (byDelta !== 0) {
      return byDelta;
    }
    return left.owner.localeCompare(right.owner);
  });
}

function evidenceSources(
  segments: ClawTraceRegressionSegment[],
): ClawTraceRegressionSource[] {
  return [...new Set(segments.map((segment) => segment.source))].sort();
}

function prioritizedSegments(
  segments: ClawTraceRegressionSegment[],
): ClawTraceRegressionSegment[] {
  return [...segments].sort((left, right) => {
    if (left.verdict === "regressed" && right.verdict !== "regressed") {
      return -1;
    }
    if (left.verdict !== "regressed" && right.verdict === "regressed") {
      return 1;
    }
    const byDelta = right.delta_ms - left.delta_ms;
    if (byDelta !== 0) {
      return byDelta;
    }
    return left.key.localeCompare(right.key);
  });
}

export function projectClawTraceRegressionReport({
  appServerComparison,
  baselineComparison,
}: ProjectClawTraceRegressionReportInput): ClawTraceRegressionReport {
  const compactSegments = baselineComparison.metrics.map(fromBaselineMetric);
  const appServerSegments = appServerComparison
    ? appServerComparison.metrics.flatMap((metric) => {
        const segment = fromAppServerMetric(metric);
        return segment ? [segment] : [];
      })
    : [];
  const segments = prioritizedSegments([
    ...appServerSegments,
    ...compactSegments,
  ]);
  const totals = ownerTotals(segments);

  return {
    evidence_sources: evidenceSources(segments),
    owner_totals: totals,
    primary_owner: totals[0]?.owner ?? null,
    segments,
    verdict: aggregateVerdict(segments),
    window: {
      compact_history_record_count: baselineComparison.history_record_count,
      app_server_trace_window_count:
        appServerComparison?.trace_window_count ?? 0,
    },
  };
}
