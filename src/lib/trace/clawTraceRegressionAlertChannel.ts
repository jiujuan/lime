import type {
  ClawTraceRegressionAlert,
  ClawTraceRegressionAlertReason,
  ClawTraceRegressionAlertSeverity,
} from "./clawTraceRegressionAlert";
import type {
  ClawTraceRegressionOwner,
  ClawTraceRegressionOwnerTotal,
  ClawTraceRegressionReport,
  ClawTraceRegressionSource,
  ClawTraceRegressionVerdict,
} from "./clawTraceRegressionReport";

export const CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY =
  "claw_trace_regression_alert_channel.v1";

export const CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION = 1;
export const CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS = 20;
export const CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClawTraceRegressionAlertChannelRetentionPolicy {
  max_records: number;
  max_age_days: number;
  mode: "summary_only_alert";
  raw_entries: false;
  raw_trace_jsonl: false;
  prompt_text: false;
  provider_payload: false;
  assistant_delta_text: false;
}

export interface ClawTraceRegressionAlertChannelReportSummary {
  evidence_sources: ClawTraceRegressionSource[];
  owner_totals: ClawTraceRegressionOwnerTotal[];
  primary_owner: ClawTraceRegressionOwner | null;
  verdict: ClawTraceRegressionVerdict;
  window: ClawTraceRegressionReport["window"];
}

export interface ClawTraceRegressionAlertChannelRecord {
  schema_version: typeof CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION;
  id: string;
  fingerprint: string;
  recorded_at: string;
  recorded_at_ms: number;
  alert: ClawTraceRegressionAlert;
  report_summary: ClawTraceRegressionAlertChannelReportSummary;
}

export interface ClawTraceRegressionAlertChannelOverview {
  count: number;
  latest_recorded_at: string | null;
  latest_severity: ClawTraceRegressionAlertSeverity | null;
  primary_owner_counts: Record<ClawTraceRegressionOwner, number>;
  retention: ClawTraceRegressionAlertChannelRetentionPolicy;
  severity_counts: Record<
    Exclude<ClawTraceRegressionAlertSeverity, "none">,
    number
  >;
}

export interface ClawTraceRegressionAlertChannelExport {
  schema_version: typeof CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION;
  exported_at: string;
  overview: ClawTraceRegressionAlertChannelOverview;
  records: ClawTraceRegressionAlertChannelRecord[];
  retention: ClawTraceRegressionAlertChannelRetentionPolicy;
}

interface RecordAlertChannelOptions {
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

function retentionPolicy(): ClawTraceRegressionAlertChannelRetentionPolicy {
  return {
    assistant_delta_text: false,
    max_age_days: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_AGE_DAYS,
    max_records: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS,
    mode: "summary_only_alert",
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

function normalizeSeverity(
  value: unknown,
): ClawTraceRegressionAlertSeverity | null {
  return value === "none" ||
    value === "watch" ||
    value === "warning" ||
    value === "critical"
    ? value
    : null;
}

function normalizeActionableSeverity(
  value: unknown,
): Exclude<ClawTraceRegressionAlertSeverity, "none"> | null {
  return value === "watch" || value === "warning" || value === "critical"
    ? value
    : null;
}

function normalizeReason(
  value: unknown,
): ClawTraceRegressionAlertReason | null {
  return value === "no_evidence" ||
    value === "current_stable" ||
    value === "current_regression" ||
    value === "large_current_regression" ||
    value === "repeated_owner_regression"
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

function normalizeOwnerTotal(
  value: unknown,
): ClawTraceRegressionOwnerTotal | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionOwnerTotal>;
  const metricCount = normalizeNumber(candidate.metric_count);
  const owner = normalizeOwner(candidate.owner);
  const regressedDeltaMs = normalizeNumber(candidate.regressed_delta_ms);
  if (!owner || metricCount === null || regressedDeltaMs === null) {
    return null;
  }
  return {
    metric_count: Math.max(0, metricCount),
    owner,
    regressed_delta_ms: Math.max(0, regressedDeltaMs),
  };
}

function normalizeWindow(value: unknown): ClawTraceRegressionReport["window"] {
  if (!value || typeof value !== "object") {
    return {
      app_server_trace_window_count: 0,
      compact_history_record_count: 0,
    };
  }
  const candidate = value as Partial<ClawTraceRegressionReport["window"]>;
  return {
    app_server_trace_window_count: Math.max(
      0,
      normalizeNumber(candidate.app_server_trace_window_count) ?? 0,
    ),
    compact_history_record_count: Math.max(
      0,
      normalizeNumber(candidate.compact_history_record_count) ?? 0,
    ),
  };
}

function summarizeReport(
  report: ClawTraceRegressionReport,
): ClawTraceRegressionAlertChannelReportSummary {
  return {
    evidence_sources: [...report.evidence_sources].sort(),
    owner_totals: [...report.owner_totals],
    primary_owner: report.primary_owner,
    verdict: report.verdict,
    window: {
      app_server_trace_window_count:
        report.window.app_server_trace_window_count,
      compact_history_record_count: report.window.compact_history_record_count,
    },
  };
}

function normalizeReportSummary(
  value: unknown,
): ClawTraceRegressionAlertChannelReportSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate =
    value as Partial<ClawTraceRegressionAlertChannelReportSummary>;
  const verdict = normalizeVerdict(candidate.verdict);
  const primaryOwner =
    candidate.primary_owner === null
      ? null
      : normalizeOwner(candidate.primary_owner);
  if (!verdict || primaryOwner === undefined) {
    return null;
  }
  return {
    evidence_sources: Array.isArray(candidate.evidence_sources)
      ? candidate.evidence_sources.flatMap((source) => {
          const normalized = normalizeSource(source);
          return normalized ? [normalized] : [];
        })
      : [],
    owner_totals: Array.isArray(candidate.owner_totals)
      ? candidate.owner_totals.flatMap((total) => {
          const normalized = normalizeOwnerTotal(total);
          return normalized ? [normalized] : [];
        })
      : [],
    primary_owner: primaryOwner,
    verdict,
    window: normalizeWindow(candidate.window),
  };
}

function normalizeAlert(value: unknown): ClawTraceRegressionAlert | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionAlert>;
  const currentRegressedDeltaMs = normalizeNumber(
    candidate.current_regressed_delta_ms,
  );
  const primaryOwner =
    candidate.primary_owner === null
      ? null
      : normalizeOwner(candidate.primary_owner);
  const reason = normalizeReason(candidate.reason);
  const recentReportCount = normalizeNumber(candidate.recent_report_count);
  const repeatedOwnerRegressionCount = normalizeNumber(
    candidate.repeated_owner_regression_count,
  );
  const severity = normalizeSeverity(candidate.severity);
  if (
    currentRegressedDeltaMs === null ||
    primaryOwner === undefined ||
    !reason ||
    recentReportCount === null ||
    repeatedOwnerRegressionCount === null ||
    !severity
  ) {
    return null;
  }
  return {
    current_regressed_delta_ms: Math.max(0, currentRegressedDeltaMs),
    primary_owner: primaryOwner,
    reason,
    recent_report_count: Math.max(0, recentReportCount),
    repeated_owner_regression_count: Math.max(0, repeatedOwnerRegressionCount),
    severity,
  };
}

function fingerprintFor(
  alert: ClawTraceRegressionAlert,
  reportSummary: ClawTraceRegressionAlertChannelReportSummary,
): string {
  return JSON.stringify({
    alert: {
      current_regressed_delta_ms: alert.current_regressed_delta_ms,
      primary_owner: alert.primary_owner,
      reason: alert.reason,
      repeated_owner_regression_count: alert.repeated_owner_regression_count,
      severity: alert.severity,
    },
    report_summary: reportSummary,
  });
}

function normalizeRecord(
  value: unknown,
): ClawTraceRegressionAlertChannelRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ClawTraceRegressionAlertChannelRecord>;
  const alert = normalizeAlert(candidate.alert);
  const fingerprint = normalizeString(candidate.fingerprint);
  const id = normalizeString(candidate.id);
  const recordedAt = normalizeString(candidate.recorded_at);
  const recordedAtMs = normalizeNumber(candidate.recorded_at_ms);
  const reportSummary = normalizeReportSummary(candidate.report_summary);
  if (
    candidate.schema_version !==
      CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION ||
    !alert ||
    alert.severity === "none" ||
    !fingerprint ||
    !id ||
    !recordedAt ||
    recordedAtMs === null ||
    !reportSummary
  ) {
    return null;
  }
  return {
    schema_version: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION,
    alert,
    fingerprint,
    id,
    recorded_at: recordedAt,
    recorded_at_ms: recordedAtMs,
    report_summary: reportSummary,
  };
}

function parseRecords(
  raw: string | null,
): ClawTraceRegressionAlertChannelRecord[] {
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
        (record): record is ClawTraceRegressionAlertChannelRecord =>
          record !== null,
      );
  } catch {
    return [];
  }
}

function applyRetention(
  records: ClawTraceRegressionAlertChannelRecord[],
  nowMs: number,
): ClawTraceRegressionAlertChannelRecord[] {
  const minRecordedAtMs =
    nowMs - CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_AGE_DAYS * DAY_MS;
  return records
    .filter((record) => record.recorded_at_ms >= minRecordedAtMs)
    .sort((left, right) => left.recorded_at_ms - right.recorded_at_ms)
    .slice(-CLAW_TRACE_REGRESSION_ALERT_CHANNEL_MAX_RECORDS);
}

function readRecords(
  nowMs = Date.now(),
): ClawTraceRegressionAlertChannelRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  return applyRetention(
    parseRecords(
      storage.getItem(CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY),
    ),
    nowMs,
  );
}

function writeRecords(
  records: ClawTraceRegressionAlertChannelRecord[],
  nowMs = Date.now(),
): ClawTraceRegressionAlertChannelRecord[] | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const retained = applyRetention(records, nowMs);
  storage.setItem(
    CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY,
    JSON.stringify(retained),
  );
  return retained;
}

function buildRecordId(nowMs: number): string {
  return `claw-trace-regression-alert-${Math.round(nowMs)}`;
}

function severityCounts(
  records: ClawTraceRegressionAlertChannelRecord[],
): Record<Exclude<ClawTraceRegressionAlertSeverity, "none">, number> {
  return records.reduce<
    Record<Exclude<ClawTraceRegressionAlertSeverity, "none">, number>
  >(
    (counts, record) => {
      const severity = normalizeActionableSeverity(record.alert.severity);
      if (severity) {
        counts[severity] += 1;
      }
      return counts;
    },
    {
      critical: 0,
      warning: 0,
      watch: 0,
    },
  );
}

function ownerCounts(
  records: ClawTraceRegressionAlertChannelRecord[],
): Record<ClawTraceRegressionOwner, number> {
  return records.reduce<Record<ClawTraceRegressionOwner, number>>(
    (counts, record) => {
      const owner = record.alert.primary_owner;
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

export function listClawTraceRegressionAlertChannel(): ClawTraceRegressionAlertChannelRecord[] {
  return readRecords();
}

export function getClawTraceRegressionAlertChannelOverview(): ClawTraceRegressionAlertChannelOverview {
  const records = listClawTraceRegressionAlertChannel();
  const latest = records.at(-1) ?? null;
  return {
    count: records.length,
    latest_recorded_at: latest?.recorded_at ?? null,
    latest_severity: latest?.alert.severity ?? null,
    primary_owner_counts: ownerCounts(records),
    retention: retentionPolicy(),
    severity_counts: severityCounts(records),
  };
}

export function recordClawTraceRegressionAlertChannelEvaluation(
  alert: ClawTraceRegressionAlert,
  report: ClawTraceRegressionReport,
  options: RecordAlertChannelOptions = {},
): ClawTraceRegressionAlertChannelRecord | null {
  if (alert.severity === "none") {
    return null;
  }
  const nowMs = options.nowMs ?? Date.now();
  const reportSummary = summarizeReport(report);
  const fingerprint = fingerprintFor(alert, reportSummary);
  const records = readRecords(nowMs);
  const existing = records.find((record) => record.fingerprint === fingerprint);
  if (existing) {
    return existing;
  }
  const record: ClawTraceRegressionAlertChannelRecord = {
    schema_version: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION,
    alert,
    fingerprint,
    id: buildRecordId(nowMs),
    recorded_at: new Date(nowMs).toISOString(),
    recorded_at_ms: Math.round(nowMs),
    report_summary: reportSummary,
  };
  const retained = writeRecords([...records, record], nowMs);
  return retained?.some((item) => item.id === record.id) ? record : null;
}

export function clearClawTraceRegressionAlertChannel(): void {
  const storage = getStorage();
  storage?.removeItem(CLAW_TRACE_REGRESSION_ALERT_CHANNEL_STORAGE_KEY);
}

export function exportClawTraceRegressionAlertChannel(): ClawTraceRegressionAlertChannelExport {
  const records = listClawTraceRegressionAlertChannel();
  return {
    exported_at: new Date().toISOString(),
    overview: getClawTraceRegressionAlertChannelOverview(),
    records,
    retention: retentionPolicy(),
    schema_version: CLAW_TRACE_REGRESSION_ALERT_CHANNEL_SCHEMA_VERSION,
  };
}
