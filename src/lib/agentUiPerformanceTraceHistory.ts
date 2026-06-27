import type { AgentUiPerformanceSnapshot } from "@/lib/agentUiPerformanceMetrics";
import {
  buildAgentUiPerformanceDiagnosticSummary,
  type AgentUiPerformanceDiagnosticSummary,
} from "@/lib/crashDiagnosticAgentUiPerformance";

export const AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY =
  "agent_ui_performance_trace_history.v1";

export const AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION = 1;
export const AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS = 20;
export const AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgentUiPerformanceTraceHistoryRecord {
  schema_version: typeof AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION;
  id: string;
  label: string;
  saved_at: string;
  saved_at_ms: number;
  summary: AgentUiPerformanceDiagnosticSummary;
}

export interface AgentUiPerformanceTraceHistoryRetentionPolicy {
  max_records: number;
  max_age_days: number;
  mode: "compact_summary_only";
  raw_entries: false;
  prompt_text: false;
  provider_payload: false;
}

export interface AgentUiPerformanceTraceHistoryOverview {
  count: number;
  latest_saved_at: string | null;
  latest_saved_at_ms: number | null;
  retention: AgentUiPerformanceTraceHistoryRetentionPolicy;
}

export interface AgentUiPerformanceTraceHistoryExport {
  schema_version: typeof AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION;
  exported_at: string;
  retention: AgentUiPerformanceTraceHistoryRetentionPolicy;
  records: AgentUiPerformanceTraceHistoryRecord[];
}

interface SaveTraceSnapshotOptions {
  label?: string;
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

function retentionPolicy(): AgentUiPerformanceTraceHistoryRetentionPolicy {
  return {
    max_records: AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS,
    max_age_days: AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_AGE_DAYS,
    mode: "compact_summary_only",
    raw_entries: false,
    prompt_text: false,
    provider_payload: false,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeSummary(
  value: unknown,
): AgentUiPerformanceDiagnosticSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AgentUiPerformanceDiagnosticSummary>;
  if (
    typeof candidate.entry_count !== "number" ||
    typeof candidate.session_count !== "number" ||
    typeof candidate.truncated_session_count !== "number" ||
    !Array.isArray(candidate.sessions)
  ) {
    return null;
  }

  return candidate as AgentUiPerformanceDiagnosticSummary;
}

function normalizeRecord(
  value: unknown,
): AgentUiPerformanceTraceHistoryRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AgentUiPerformanceTraceHistoryRecord>;
  const id = normalizeString(candidate.id);
  const label = normalizeString(candidate.label);
  const savedAt = normalizeString(candidate.saved_at);
  const summary = normalizeSummary(candidate.summary);

  if (
    candidate.schema_version !==
      AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION ||
    !id ||
    !label ||
    !savedAt ||
    typeof candidate.saved_at_ms !== "number" ||
    !Number.isFinite(candidate.saved_at_ms) ||
    !summary
  ) {
    return null;
  }

  return {
    schema_version: AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION,
    id,
    label,
    saved_at: savedAt,
    saved_at_ms: Math.round(candidate.saved_at_ms),
    summary,
  };
}

function parseRecords(
  raw: string | null,
): AgentUiPerformanceTraceHistoryRecord[] {
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
        (record): record is AgentUiPerformanceTraceHistoryRecord =>
          record !== null,
      );
  } catch {
    return [];
  }
}

function applyRetention(
  records: AgentUiPerformanceTraceHistoryRecord[],
  nowMs: number,
): AgentUiPerformanceTraceHistoryRecord[] {
  const minSavedAtMs =
    nowMs - AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_AGE_DAYS * DAY_MS;
  return records
    .filter((record) => record.saved_at_ms >= minSavedAtMs)
    .sort((left, right) => left.saved_at_ms - right.saved_at_ms)
    .slice(-AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS);
}

function readRecords(
  nowMs = Date.now(),
): AgentUiPerformanceTraceHistoryRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  return applyRetention(
    parseRecords(
      storage.getItem(AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY),
    ),
    nowMs,
  );
}

function writeRecords(
  records: AgentUiPerformanceTraceHistoryRecord[],
  nowMs = Date.now(),
): AgentUiPerformanceTraceHistoryRecord[] | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const retained = applyRetention(records, nowMs);
  storage.setItem(
    AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY,
    JSON.stringify(retained),
  );
  return retained;
}

function buildRecordId(nowMs: number): string {
  return `agent-ui-trace-${Math.round(nowMs)}`;
}

function normalizeLabel(
  label: string | undefined,
  summary: AgentUiPerformanceDiagnosticSummary,
): string {
  const explicit = normalizeString(label);
  if (explicit) {
    return explicit.slice(0, 120);
  }

  const latestSession = summary.sessions.at(-1);
  return latestSession?.sessionId
    ? `session:${latestSession.sessionId}`.slice(0, 120)
    : "agent-ui-trace-summary";
}

export function listAgentUiPerformanceTraceHistory(): AgentUiPerformanceTraceHistoryRecord[] {
  return readRecords();
}

export function getAgentUiPerformanceTraceHistoryOverview(): AgentUiPerformanceTraceHistoryOverview {
  const records = listAgentUiPerformanceTraceHistory();
  const latest = records.at(-1) ?? null;
  return {
    count: records.length,
    latest_saved_at: latest?.saved_at ?? null,
    latest_saved_at_ms: latest?.saved_at_ms ?? null,
    retention: retentionPolicy(),
  };
}

export function saveAgentUiPerformanceTraceSnapshot(
  snapshot: AgentUiPerformanceSnapshot,
  options: SaveTraceSnapshotOptions = {},
): AgentUiPerformanceTraceHistoryRecord | null {
  const summary = buildAgentUiPerformanceDiagnosticSummary(snapshot);
  if (!summary || (summary.entry_count === 0 && summary.session_count === 0)) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const savedAt = new Date(nowMs).toISOString();
  const record: AgentUiPerformanceTraceHistoryRecord = {
    schema_version: AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION,
    id: buildRecordId(nowMs),
    label: normalizeLabel(options.label, summary),
    saved_at: savedAt,
    saved_at_ms: Math.round(nowMs),
    summary,
  };

  const nextRecords = [...readRecords(nowMs), record];
  const retained = writeRecords(nextRecords, nowMs);
  return retained?.some((item) => item.id === record.id) ? record : null;
}

export function clearAgentUiPerformanceTraceHistory(): void {
  const storage = getStorage();
  storage?.removeItem(AGENT_UI_PERFORMANCE_TRACE_HISTORY_STORAGE_KEY);
}

export function exportAgentUiPerformanceTraceHistory(): AgentUiPerformanceTraceHistoryExport {
  return {
    schema_version: AGENT_UI_PERFORMANCE_TRACE_HISTORY_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    retention: retentionPolicy(),
    records: listAgentUiPerformanceTraceHistory(),
  };
}
