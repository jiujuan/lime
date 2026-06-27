import type { ClawTraceTimelineProjection } from "./clawTraceTimeline";
import type { DiagnosticsTraceSummary } from "@/lib/api/serverRuntime";

export type ClawTraceAppServerComparisonMetricKey =
  | "rootDurationMs"
  | "providerFirstEventMs"
  | "providerFirstTextMs"
  | "providerToAppServerFirstDeltaMs"
  | "appServerFirstDeltaToTerminalMs";

export type ClawTraceAppServerComparisonVerdict =
  | "no_current"
  | "no_baseline"
  | "no_comparable"
  | "same"
  | "improved"
  | "regressed";

export type ClawTraceAppServerBaselineStrategy = "oldest_retained_trace";

export interface ClawTraceAppServerComparisonMetricDelta {
  baseline_ms: number;
  current_ms: number;
  delta_ms: number;
  delta_ratio: number | null;
  key: ClawTraceAppServerComparisonMetricKey;
  verdict: Extract<
    ClawTraceAppServerComparisonVerdict,
    "same" | "improved" | "regressed"
  >;
}

export interface ClawTraceAppServerComparison {
  baseline_trace_id: string | null;
  baseline_strategy: ClawTraceAppServerBaselineStrategy;
  current_trace_id: string | null;
  latest_trace_id: string | null;
  metrics: ClawTraceAppServerComparisonMetricDelta[];
  trace_window_count: number;
  verdict: ClawTraceAppServerComparisonVerdict;
}

export interface ProjectClawTraceAppServerComparisonInput {
  baseline: ClawTraceTimelineProjection | null | undefined;
  current: ClawTraceTimelineProjection | null | undefined;
  latestTraceId?: string | null;
  traceWindowCount?: number;
}

export interface ClawTraceAppServerComparisonWindow {
  baseline_strategy: ClawTraceAppServerBaselineStrategy;
  baseline_trace: DiagnosticsTraceSummary | null;
  current_trace: DiagnosticsTraceSummary | null;
  latest_trace_id: string | null;
  trace_window_count: number;
}

const COMPARED_METRICS: ClawTraceAppServerComparisonMetricKey[] = [
  "providerFirstEventMs",
  "providerFirstTextMs",
  "providerToAppServerFirstDeltaMs",
  "appServerFirstDeltaToTerminalMs",
  "rootDurationMs",
];

const MIN_REGRESSION_DELTA_MS = 50;
const MIN_REGRESSION_RATIO = 0.15;
const BASELINE_STRATEGY: ClawTraceAppServerBaselineStrategy =
  "oldest_retained_trace";

function traceTimestamp(summary: DiagnosticsTraceSummary): number | null {
  const candidates = [
    summary.last_wall_time_unix_ms,
    summary.first_wall_time_unix_ms,
    summary.modified_at ? Date.parse(summary.modified_at) : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sortedTraceWindow(
  traces: DiagnosticsTraceSummary[],
): DiagnosticsTraceSummary[] {
  return traces
    .map((trace, index) => ({ index, timestamp: traceTimestamp(trace), trace }))
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null) {
        const byTimestamp = left.timestamp - right.timestamp;
        if (byTimestamp !== 0) {
          return byTimestamp;
        }
      }

      if (left.timestamp !== null && right.timestamp === null) {
        return -1;
      }
      if (left.timestamp === null && right.timestamp !== null) {
        return 1;
      }

      const byInputOrder = right.index - left.index;
      if (byInputOrder !== 0) {
        return byInputOrder;
      }
      return left.trace.trace_id.localeCompare(right.trace.trace_id);
    })
    .map((item) => item.trace);
}

export function selectClawTraceAppServerComparisonWindow(
  traces: DiagnosticsTraceSummary[],
): ClawTraceAppServerComparisonWindow {
  const sorted = sortedTraceWindow(traces);
  const currentTrace = sorted.at(-1) ?? null;
  const baselineTrace =
    sorted.length > 1 && sorted[0]?.trace_id !== currentTrace?.trace_id
      ? sorted[0]
      : null;

  return {
    baseline_strategy: BASELINE_STRATEGY,
    baseline_trace: baselineTrace,
    current_trace: currentTrace,
    latest_trace_id: currentTrace?.trace_id ?? null,
    trace_window_count: traces.length,
  };
}

function checkpointOffset(
  projection: ClawTraceTimelineProjection,
  checkpoint: string,
): number | null {
  const row = projection.timeline.find(
    (item) => item.checkpoint === checkpoint,
  );
  if (!row || !Number.isFinite(row.offset_ms)) {
    return null;
  }
  return Math.max(0, Math.round(row.offset_ms));
}

function durationBetween(
  projection: ClawTraceTimelineProjection,
  fromCheckpoint: string,
  toCheckpoint: string,
): number | null {
  const fromOffset = checkpointOffset(projection, fromCheckpoint);
  const toOffset = checkpointOffset(projection, toCheckpoint);
  if (fromOffset === null || toOffset === null || toOffset < fromOffset) {
    return null;
  }
  return toOffset - fromOffset;
}

function metricValue(
  projection: ClawTraceTimelineProjection,
  key: ClawTraceAppServerComparisonMetricKey,
): number | null {
  switch (key) {
    case "providerFirstEventMs":
      return durationBetween(
        projection,
        "provider.request.started",
        "provider.first_event.received",
      );
    case "providerFirstTextMs":
      return durationBetween(
        projection,
        "provider.request.started",
        "provider.first_text_delta.received",
      );
    case "providerToAppServerFirstDeltaMs":
      return durationBetween(
        projection,
        "provider.first_text_delta.received",
        "app_server.message_delta.emitted",
      );
    case "appServerFirstDeltaToTerminalMs":
      return durationBetween(
        projection,
        "app_server.message_delta.emitted",
        "app_server.turn.terminal",
      );
    case "rootDurationMs":
      return projection.event_count > 1
        ? Math.max(0, Math.round(projection.root_duration_ms))
        : null;
  }
}

function metricDeltaVerdict(
  deltaMs: number,
  deltaRatio: number | null,
): ClawTraceAppServerComparisonMetricDelta["verdict"] {
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
  current: ClawTraceTimelineProjection,
  baseline: ClawTraceTimelineProjection,
  key: ClawTraceAppServerComparisonMetricKey,
): ClawTraceAppServerComparisonMetricDelta | null {
  const currentMs = metricValue(current, key);
  const baselineMs = metricValue(baseline, key);
  if (currentMs === null || baselineMs === null) {
    return null;
  }

  const deltaMs = currentMs - baselineMs;
  const deltaRatio = baselineMs > 0 ? deltaMs / baselineMs : null;
  return {
    baseline_ms: baselineMs,
    current_ms: currentMs,
    delta_ms: deltaMs,
    delta_ratio: deltaRatio,
    key,
    verdict: metricDeltaVerdict(deltaMs, deltaRatio),
  };
}

function aggregateVerdict(
  metrics: ClawTraceAppServerComparisonMetricDelta[],
): ClawTraceAppServerComparisonVerdict {
  if (metrics.length === 0) {
    return "no_comparable";
  }
  if (metrics.some((metric) => metric.verdict === "regressed")) {
    return "regressed";
  }
  if (metrics.some((metric) => metric.verdict === "improved")) {
    return "improved";
  }
  return "same";
}

function normalizeTraceWindowCount(
  value: number | undefined,
  current: ClawTraceTimelineProjection | null | undefined,
  baseline: ClawTraceTimelineProjection | null | undefined,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const traceIds = new Set(
    [current?.trace_id, baseline?.trace_id].filter(
      (traceId): traceId is string => Boolean(traceId),
    ),
  );
  return traceIds.size;
}

export function projectClawTraceAppServerComparison({
  baseline,
  current,
  latestTraceId,
  traceWindowCount,
}: ProjectClawTraceAppServerComparisonInput): ClawTraceAppServerComparison {
  const normalizedTraceWindowCount = normalizeTraceWindowCount(
    traceWindowCount,
    current,
    baseline,
  );
  const normalizedLatestTraceId = latestTraceId ?? current?.trace_id ?? null;
  if (!current || current.event_count === 0) {
    return {
      baseline_trace_id: baseline?.trace_id ?? null,
      baseline_strategy: BASELINE_STRATEGY,
      current_trace_id: current?.trace_id ?? null,
      latest_trace_id: normalizedLatestTraceId,
      metrics: [],
      trace_window_count: normalizedTraceWindowCount,
      verdict: "no_current",
    };
  }
  if (!baseline || baseline.event_count === 0) {
    return {
      baseline_trace_id: baseline?.trace_id ?? null,
      baseline_strategy: BASELINE_STRATEGY,
      current_trace_id: current.trace_id,
      latest_trace_id: normalizedLatestTraceId,
      metrics: [],
      trace_window_count: normalizedTraceWindowCount,
      verdict: "no_baseline",
    };
  }

  const metrics = COMPARED_METRICS.flatMap((key) => {
    const delta = projectMetricDelta(current, baseline, key);
    return delta ? [delta] : [];
  });

  return {
    baseline_trace_id: baseline.trace_id,
    baseline_strategy: BASELINE_STRATEGY,
    current_trace_id: current.trace_id,
    latest_trace_id: normalizedLatestTraceId,
    metrics,
    trace_window_count: normalizedTraceWindowCount,
    verdict: aggregateVerdict(metrics),
  };
}
