import type {
  DiagnosticsTraceEvent,
  DiagnosticsTraceReadResult,
} from "@/lib/api/serverRuntime";

export type ClawTraceTimelinePhase =
  | "provider_api"
  | "app_server"
  | "renderer"
  | "terminal"
  | "other";

export type ClawTraceTimelineFilter = "all" | "slow" | ClawTraceTimelinePhase;

export interface ClawTraceTimelineMetric {
  key: string;
  value: string;
}

export interface ClawTraceTimelineRow {
  checkpoint: string;
  delta_ms: number | null;
  event_type: string;
  metrics: ClawTraceTimelineMetric[];
  offset_ms: number;
  phase: ClawTraceTimelinePhase;
  seq: number;
  wall_time_unix_ms: number;
}

export interface ClawTraceSpanNode {
  duration_ms: number;
  end_offset_ms: number;
  event_count: number;
  phase: ClawTraceTimelinePhase;
  start_offset_ms: number;
}

export interface ClawTraceSlowSegment {
  duration_ms: number;
  end_offset_ms: number;
  from_checkpoint: string;
  phase: ClawTraceTimelinePhase;
  start_offset_ms: number;
  to_checkpoint: string;
}

export interface ClawTracePhaseGap {
  phase: ClawTraceTimelinePhase;
  reason: "missing_phase";
}

export interface ClawTraceTimelineProjection {
  event_count: number;
  phase_gaps: ClawTracePhaseGap[];
  redaction_mode: string;
  root_duration_ms: number;
  slow_segments: ClawTraceSlowSegment[];
  spans: ClawTraceSpanNode[];
  timeline: ClawTraceTimelineRow[];
  trace_id: string | null;
}

export interface ClawTraceTimelineProjectionOptions {
  max_slow_segments?: number;
  slow_segment_threshold_ms?: number;
}

const MAX_METRICS_PER_ROW = 4;
const MAX_METRIC_VALUE_LENGTH = 80;
const DEFAULT_SLOW_SEGMENT_THRESHOLD_MS = 50;
const DEFAULT_MAX_SLOW_SEGMENTS = 5;
const REQUIRED_PHASES: ClawTraceTimelinePhase[] = [
  "provider_api",
  "app_server",
  "terminal",
];

function phaseForCheckpoint(checkpoint: string): ClawTraceTimelinePhase {
  if (checkpoint === "app_server.turn.terminal") {
    return "terminal";
  }
  if (checkpoint.startsWith("provider.")) {
    return "provider_api";
  }
  if (checkpoint.startsWith("app_server.")) {
    return "app_server";
  }
  if (checkpoint.startsWith("renderer.")) {
    return "renderer";
  }
  return "other";
}

function metricValue(value: unknown): string | null {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = String(value);
    return text.length > MAX_METRIC_VALUE_LENGTH
      ? text.slice(0, MAX_METRIC_VALUE_LENGTH)
      : text;
  }
  return null;
}

function projectMetrics(
  metrics: Record<string, unknown>,
): ClawTraceTimelineMetric[] {
  return Object.entries(metrics)
    .flatMap(([key, value]) => {
      const normalizedValue = metricValue(value);
      return normalizedValue === null ? [] : [{ key, value: normalizedValue }];
    })
    .slice(0, MAX_METRICS_PER_ROW);
}

function sortTraceEvents(
  events: DiagnosticsTraceEvent[],
): DiagnosticsTraceEvent[] {
  return [...events].sort((left, right) => {
    const byWallTime = left.wall_time_unix_ms - right.wall_time_unix_ms;
    if (byWallTime !== 0) {
      return byWallTime;
    }
    return left.seq - right.seq;
  });
}

function projectTimelineRow(
  event: DiagnosticsTraceEvent,
  index: number,
  events: DiagnosticsTraceEvent[],
  startWallTimeUnixMs: number,
): ClawTraceTimelineRow {
  const previous = index > 0 ? events[index - 1] : null;
  return {
    checkpoint: event.checkpoint,
    delta_ms: previous
      ? event.wall_time_unix_ms - previous.wall_time_unix_ms
      : null,
    event_type: event.event_type,
    metrics: projectMetrics(event.metrics),
    offset_ms: event.wall_time_unix_ms - startWallTimeUnixMs,
    phase: phaseForCheckpoint(event.checkpoint),
    seq: event.seq,
    wall_time_unix_ms: event.wall_time_unix_ms,
  };
}

function projectSpan(
  phase: ClawTraceTimelinePhase,
  rows: ClawTraceTimelineRow[],
): ClawTraceSpanNode | null {
  const phaseRows = rows.filter((row) => row.phase === phase);
  const first = phaseRows[0];
  if (!first) {
    return null;
  }
  const last = phaseRows[phaseRows.length - 1] ?? first;
  return {
    duration_ms: Math.max(0, last.offset_ms - first.offset_ms),
    end_offset_ms: last.offset_ms,
    event_count: phaseRows.length,
    phase,
    start_offset_ms: first.offset_ms,
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function projectSlowSegments(
  rows: ClawTraceTimelineRow[],
  options: Required<ClawTraceTimelineProjectionOptions>,
): ClawTraceSlowSegment[] {
  const segments = rows.flatMap((row, index) => {
    if (index === 0 || row.delta_ms === null) {
      return [];
    }
    if (row.delta_ms < options.slow_segment_threshold_ms) {
      return [];
    }
    const previous = rows[index - 1];
    return [
      {
        duration_ms: row.delta_ms,
        end_offset_ms: row.offset_ms,
        from_checkpoint: previous.checkpoint,
        phase: row.phase,
        start_offset_ms: previous.offset_ms,
        to_checkpoint: row.checkpoint,
      },
    ];
  });

  return segments
    .sort((left, right) => right.duration_ms - left.duration_ms)
    .slice(0, options.max_slow_segments);
}

function projectPhaseGaps(rows: ClawTraceTimelineRow[]): ClawTracePhaseGap[] {
  const observedPhases = new Set(rows.map((row) => row.phase));
  return REQUIRED_PHASES.flatMap((phase) =>
    observedPhases.has(phase) ? [] : [{ phase, reason: "missing_phase" }],
  );
}

export function clawTraceTimelineRowKey(row: ClawTraceTimelineRow): string {
  return `${row.seq}:${row.checkpoint}:${row.offset_ms}`;
}

export function clawTraceSpanKey(span: ClawTraceSpanNode): string {
  return [
    span.phase,
    span.start_offset_ms,
    span.end_offset_ms,
    span.event_count,
  ].join(":");
}

export function findClawTraceSpanByKey(
  projection: ClawTraceTimelineProjection,
  spanKey: string | null,
): ClawTraceSpanNode | null {
  if (!spanKey) {
    return null;
  }
  return (
    projection.spans.find((span) => clawTraceSpanKey(span) === spanKey) ?? null
  );
}

export function filterClawTraceTimelineRowsBySpan(
  projection: ClawTraceTimelineProjection,
  span: ClawTraceSpanNode | null,
): ClawTraceTimelineRow[] {
  if (!span || span.event_count <= 0) {
    return [];
  }
  return projection.timeline.filter(
    (row) =>
      row.phase === span.phase &&
      row.offset_ms >= span.start_offset_ms &&
      row.offset_ms <= span.end_offset_ms,
  );
}

export function filterClawTraceTimelineRows(
  projection: ClawTraceTimelineProjection,
  filter: ClawTraceTimelineFilter,
): ClawTraceTimelineRow[] {
  if (filter === "all") {
    return projection.timeline;
  }
  if (filter === "slow") {
    const slowRows = new Set(
      projection.slow_segments.map(
        (segment) => `${segment.to_checkpoint}:${segment.end_offset_ms}`,
      ),
    );
    return projection.timeline.filter((row) =>
      slowRows.has(`${row.checkpoint}:${row.offset_ms}`),
    );
  }
  return projection.timeline.filter((row) => row.phase === filter);
}

export function projectClawTraceTimeline(
  result: DiagnosticsTraceReadResult,
  options: ClawTraceTimelineProjectionOptions = {},
): ClawTraceTimelineProjection {
  const normalizedOptions: Required<ClawTraceTimelineProjectionOptions> = {
    max_slow_segments: normalizePositiveInteger(
      options.max_slow_segments,
      DEFAULT_MAX_SLOW_SEGMENTS,
    ),
    slow_segment_threshold_ms: normalizePositiveInteger(
      options.slow_segment_threshold_ms,
      DEFAULT_SLOW_SEGMENT_THRESHOLD_MS,
    ),
  };
  const events = sortTraceEvents(result.events);
  const startWallTimeUnixMs = events[0]?.wall_time_unix_ms ?? 0;
  const timeline = events.map((event, index) =>
    projectTimelineRow(event, index, events, startWallTimeUnixMs),
  );
  const rootDurationMs =
    timeline.length > 0 ? timeline[timeline.length - 1].offset_ms : 0;
  const spans = (
    [
      "provider_api",
      "app_server",
      "renderer",
      "terminal",
      "other",
    ] satisfies ClawTraceTimelinePhase[]
  )
    .map((phase) => projectSpan(phase, timeline))
    .filter((span): span is ClawTraceSpanNode => Boolean(span));

  return {
    event_count: timeline.length,
    phase_gaps: projectPhaseGaps(timeline),
    redaction_mode: result.redaction.mode,
    root_duration_ms: rootDurationMs,
    slow_segments: projectSlowSegments(timeline, normalizedOptions),
    spans,
    timeline,
    trace_id: result.trace?.trace_id ?? events[0]?.trace_id ?? null,
  };
}
