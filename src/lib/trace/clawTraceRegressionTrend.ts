import type {
  ClawTraceRegressionOwner,
  ClawTraceRegressionReport,
  ClawTraceRegressionSegment,
  ClawTraceRegressionSource,
  ClawTraceRegressionVerdict,
} from "./clawTraceRegressionReport";

export const CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY =
  "claw_trace_regression_trend.v1";

export const CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION = 1;
export const CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS = 20;
export const CLAW_TRACE_REGRESSION_TREND_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClawTraceRegressionTrendRetentionPolicy {
  max_records: number;
  max_age_days: number;
  mode: "summary_only_regression_report";
  raw_entries: false;
  raw_trace_jsonl: false;
  prompt_text: false;
  provider_payload: false;
  assistant_delta_text: false;
}

export interface ClawTraceRegressionTrendRecord {
  schema_version: typeof CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION;
  id: string;
  saved_at: string;
  saved_at_ms: number;
  report: ClawTraceRegressionReport;
}

export interface ClawTraceRegressionTrendOverview {
  count: number;
  latest_saved_at: string | null;
  latest_verdict: ClawTraceRegressionVerdict | null;
  primary_owner_counts: Record<ClawTraceRegressionOwner, number>;
  retention: ClawTraceRegressionTrendRetentionPolicy;
}

export interface ClawTraceRegressionTrendExport {
  schema_version: typeof CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION;
  exported_at: string;
  retention: ClawTraceRegressionTrendRetentionPolicy;
  records: ClawTraceRegressionTrendRecord[];
  overview: ClawTraceRegressionTrendOverview;
}

interface SaveRegressionTrendOptions {
  nowMs?: number;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function retentionPolicy(): ClawTraceRegressionTrendRetentionPolicy {
  return {
    assistant_delta_text: false,
    max_age_days: CLAW_TRACE_REGRESSION_TREND_MAX_AGE_DAYS,
    max_records: CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS,
    mode: "summary_only_regression_report",
    prompt_text: false,
    provider_payload: false,
    raw_entries: false,
    raw_trace_jsonl: false,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

function normalizeOwner(value: unknown): ClawTraceRegressionOwner | null {
  return value === "provider_api" ||
    value === "app_server" ||
    value === "lime_client"
    ? value
    : null;
}

function normalizeVerdict(value: unknown): ClawTraceRegressionVerdict | null {
  return value === "no_evidence" ||
    value === "same" ||
    value === "improved" ||
    value === "regressed"
    ? value
    : null;
}

function normalizeSource(value: unknown): ClawTraceRegressionSource | null {
  return value === "app_server_trace" || value === "compact_summary"
    ? value
    : null;
}

function normalizeSegment(value: unknown): ClawTraceRegressionSegment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionSegment>;
  const baselineMs = normalizeNumber(candidate.baseline_ms);
  const currentMs = normalizeNumber(candidate.current_ms);
  const deltaMs = normalizeNumber(candidate.delta_ms);
  const key = normalizeString(candidate.key);
  const owner = normalizeOwner(candidate.owner);
  const source = normalizeSource(candidate.source);
  const verdict = normalizeVerdict(candidate.verdict);
  if (
    baselineMs === null ||
    currentMs === null ||
    deltaMs === null ||
    !key ||
    !owner ||
    !source ||
    !verdict ||
    verdict === "no_evidence"
  ) {
    return null;
  }
  return {
    baseline_ms: baselineMs,
    current_ms: currentMs,
    delta_ms: deltaMs,
    key: key as ClawTraceRegressionSegment["key"],
    owner,
    source,
    verdict,
  };
}

function normalizeReport(value: unknown): ClawTraceRegressionReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionReport>;
  const verdict = normalizeVerdict(candidate.verdict);
  const primaryOwner =
    candidate.primary_owner === null
      ? null
      : normalizeOwner(candidate.primary_owner);
  const evidenceSources = Array.isArray(candidate.evidence_sources)
    ? candidate.evidence_sources.flatMap((source) => {
        const normalized = normalizeSource(source);
        return normalized ? [normalized] : [];
      })
    : [];
  const segments = Array.isArray(candidate.segments)
    ? candidate.segments.flatMap((segment) => {
        const normalized = normalizeSegment(segment);
        return normalized ? [normalized] : [];
      })
    : [];
  const ownerTotals = Array.isArray(candidate.owner_totals)
    ? candidate.owner_totals.flatMap((total) => {
        if (!total || typeof total !== "object") {
          return [];
        }
        const owner = normalizeOwner((total as { owner?: unknown }).owner);
        const regressedDeltaMs = normalizeNumber(
          (total as { regressed_delta_ms?: unknown }).regressed_delta_ms,
        );
        const metricCount = normalizeNumber(
          (total as { metric_count?: unknown }).metric_count,
        );
        return owner && regressedDeltaMs !== null && metricCount !== null
          ? [
              {
                metric_count: Math.max(0, metricCount),
                owner,
                regressed_delta_ms: Math.max(0, regressedDeltaMs),
              },
            ]
          : [];
      })
    : [];
  const compactHistoryCount = normalizeNumber(
    (candidate.window as { compact_history_record_count?: unknown } | undefined)
      ?.compact_history_record_count,
  );
  const appServerTraceCount = normalizeNumber(
    (
      candidate.window as
        | { app_server_trace_window_count?: unknown }
        | undefined
    )?.app_server_trace_window_count,
  );

  if (!verdict || primaryOwner === undefined) {
    return null;
  }

  return {
    evidence_sources: evidenceSources,
    owner_totals: ownerTotals,
    primary_owner: primaryOwner,
    segments,
    verdict,
    window: {
      app_server_trace_window_count: Math.max(0, appServerTraceCount ?? 0),
      compact_history_record_count: Math.max(0, compactHistoryCount ?? 0),
    },
  };
}

function normalizeRecord(
  value: unknown,
): ClawTraceRegressionTrendRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionTrendRecord>;
  const id = normalizeString(candidate.id);
  const savedAt = normalizeString(candidate.saved_at);
  const savedAtMs = normalizeNumber(candidate.saved_at_ms);
  const report = normalizeReport(candidate.report);
  if (
    candidate.schema_version !== CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION ||
    !id ||
    !savedAt ||
    savedAtMs === null ||
    !report
  ) {
    return null;
  }
  return {
    schema_version: CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION,
    id,
    report,
    saved_at: savedAt,
    saved_at_ms: savedAtMs,
  };
}

function parseRecords(raw: string | null): ClawTraceRegressionTrendRecord[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeRecord)
      .filter(
        (record): record is ClawTraceRegressionTrendRecord => record !== null,
      );
  } catch {
    return [];
  }
}

function applyRetention(
  records: ClawTraceRegressionTrendRecord[],
  nowMs: number,
): ClawTraceRegressionTrendRecord[] {
  const minSavedAtMs =
    nowMs - CLAW_TRACE_REGRESSION_TREND_MAX_AGE_DAYS * DAY_MS;
  return records
    .filter((record) => record.saved_at_ms >= minSavedAtMs)
    .sort((left, right) => left.saved_at_ms - right.saved_at_ms)
    .slice(-CLAW_TRACE_REGRESSION_TREND_MAX_RECORDS);
}

function readRecords(nowMs = Date.now()): ClawTraceRegressionTrendRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  return applyRetention(
    parseRecords(storage.getItem(CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY)),
    nowMs,
  );
}

function writeRecords(
  records: ClawTraceRegressionTrendRecord[],
  nowMs = Date.now(),
): ClawTraceRegressionTrendRecord[] | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const retained = applyRetention(records, nowMs);
  storage.setItem(
    CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY,
    JSON.stringify(retained),
  );
  return retained;
}

function buildRecordId(nowMs: number): string {
  return `claw-trace-regression-${Math.round(nowMs)}`;
}

function ownerCounts(
  records: ClawTraceRegressionTrendRecord[],
): Record<ClawTraceRegressionOwner, number> {
  return records.reduce<Record<ClawTraceRegressionOwner, number>>(
    (counts, record) => {
      const owner = record.report.primary_owner;
      if (owner) {
        counts[owner] += 1;
      }
      return counts;
    },
    {
      app_server: 0,
      lime_client: 0,
      provider_api: 0,
    },
  );
}

export function listClawTraceRegressionTrend(): ClawTraceRegressionTrendRecord[] {
  return readRecords();
}

export function getClawTraceRegressionTrendOverview(): ClawTraceRegressionTrendOverview {
  const records = listClawTraceRegressionTrend();
  const latest = records.at(-1) ?? null;
  return {
    count: records.length,
    latest_saved_at: latest?.saved_at ?? null,
    latest_verdict: latest?.report.verdict ?? null,
    primary_owner_counts: ownerCounts(records),
    retention: retentionPolicy(),
  };
}

export function saveClawTraceRegressionTrendRecord(
  report: ClawTraceRegressionReport,
  options: SaveRegressionTrendOptions = {},
): ClawTraceRegressionTrendRecord | null {
  if (report.verdict === "no_evidence" || report.segments.length === 0) {
    return null;
  }
  const nowMs = options.nowMs ?? Date.now();
  const record: ClawTraceRegressionTrendRecord = {
    schema_version: CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION,
    id: buildRecordId(nowMs),
    report,
    saved_at: new Date(nowMs).toISOString(),
    saved_at_ms: Math.round(nowMs),
  };
  const retained = writeRecords([...readRecords(nowMs), record], nowMs);
  return retained?.some((item) => item.id === record.id) ? record : null;
}

export function clearClawTraceRegressionTrend(): void {
  const storage = getStorage();
  storage?.removeItem(CLAW_TRACE_REGRESSION_TREND_STORAGE_KEY);
}

export function exportClawTraceRegressionTrend(): ClawTraceRegressionTrendExport {
  const records = listClawTraceRegressionTrend();
  return {
    exported_at: new Date().toISOString(),
    overview: getClawTraceRegressionTrendOverview(),
    records,
    retention: retentionPolicy(),
    schema_version: CLAW_TRACE_REGRESSION_TREND_SCHEMA_VERSION,
  };
}
