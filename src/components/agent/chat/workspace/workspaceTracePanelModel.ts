import type {
  AgentUiPerformanceSessionSummary,
  AgentUiPerformanceSnapshot,
} from "@/lib/agentUiPerformanceMetrics";
import {
  AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_AGE_DAYS,
  AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS,
  type AgentUiPerformanceTraceHistoryRecord,
  type AgentUiPerformanceTraceHistoryRetentionPolicy,
} from "@/lib/agentUiPerformanceTraceHistory";
import { buildAgentUiPerformanceDiagnosticSummary } from "@/lib/crashDiagnosticAgentUiPerformance";
import {
  projectClawTraceBaselineComparison,
  type ClawTraceBaselineComparison,
} from "@/lib/trace/clawTraceBaseline";
import {
  projectClawTraceRegressionReport,
  type ClawTraceRegressionOwner,
  type ClawTraceRegressionReport,
  type ClawTraceRegressionSegment,
} from "@/lib/trace/clawTraceRegressionReport";

export type TraceSegmentId =
  | "input_to_accepted"
  | "server_wait"
  | "server_to_renderer"
  | "renderer_to_paint";

export interface TraceSegmentModel {
  id: TraceSegmentId;
  owner: "client" | "server" | "bridge";
  valueMs: number | null;
}

export type TraceCurrentAttributionReason =
  | "provider_wait_dominant"
  | "app_server_dominant"
  | "lime_client_dominant"
  | "balanced"
  | "insufficient";

export type TraceCurrentAttributionSeverity = "ok" | "slow" | "unknown";

export interface TraceCurrentAttributionModel {
  clientActionableMs: number | null;
  owner: ClawTraceRegressionOwner | null;
  ownerShare: number | null;
  ownerTotalMs: number | null;
  primarySegmentId: TraceSegmentId | null;
  primarySegmentValueMs: number | null;
  reason: TraceCurrentAttributionReason;
  severity: TraceCurrentAttributionSeverity;
  totalFirstTextPaintMs: number | null;
}

export type TraceHistoryRestoreMetricId =
  | "click_to_switch_start"
  | "click_to_fetch_start"
  | "fetch_detail"
  | "runtime_get_session"
  | "click_to_message_list_paint";

export interface TraceHistoryRestoreMetricModel {
  id: TraceHistoryRestoreMetricId;
  valueMs: number;
}

export type TraceRecordedPhaseGroupId =
  | "input_submit"
  | "turn_submit"
  | "provider_wait"
  | "first_text"
  | "history_switch"
  | "history_fetch_detail"
  | "runtime_session"
  | "message_list"
  | "ui_long_task"
  | "other";

export interface TraceRecordedPhaseGroupModel {
  id: TraceRecordedPhaseGroupId;
  count: number;
}

interface TraceHealthMetricModel {
  id: string;
  value: number | null;
}

export type TraceSessionKind = "claw_turn" | "history_restore" | "unknown";

export interface WorkspaceTracePanelModel {
  baselineComparison: ClawTraceBaselineComparison;
  clientActionableMs: number | null;
  currentAttribution: TraceCurrentAttributionModel;
  enabled: boolean;
  entryCount: number;
  missingPhaseIds: string[];
  recordedPhaseGroups: TraceRecordedPhaseGroupModel[];
  segments: TraceSegmentModel[];
  session: AgentUiPerformanceSessionSummary | null;
  sessionCount: number;
  sessionKind: TraceSessionKind;
  primaryRegressionSegment: ClawTraceRegressionSegment | null;
  regressionReport: ClawTraceRegressionReport;
  slowSegments: TraceSegmentModel[];
  totalFirstTextPaintMs: number | null;
  healthMetrics: TraceHealthMetricModel[];
  historyRestoreMetrics: TraceHistoryRestoreMetricModel[];
}

interface BuildWorkspaceTracePanelModelOptions {
  baselineRecords?: AgentUiPerformanceTraceHistoryRecord[];
  enabled: boolean;
  includeComparisons?: boolean;
  retention?: AgentUiPerformanceTraceHistoryRetentionPolicy;
  sessionId?: string | null;
  workspaceId?: string | null;
}

const CLIENT_METRIC_THRESHOLD_MS = 80;
const CURRENT_ATTRIBUTION_DOMINANT_SHARE = 0.5;
const CURRENT_ATTRIBUTION_SLOW_OWNER_MS = 2000;
const CURRENT_ATTRIBUTION_SLOW_TOTAL_MS = 2500;

const DEFAULT_RETENTION: AgentUiPerformanceTraceHistoryRetentionPolicy = {
  max_age_days: AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_AGE_DAYS,
  max_records: AGENT_UI_PERFORMANCE_TRACE_HISTORY_MAX_RECORDS,
  mode: "compact_summary_only",
  prompt_text: false,
  provider_payload: false,
  raw_entries: false,
};

const EMPTY_BASELINE_COMPARISON: ClawTraceBaselineComparison = {
  baseline_label: null,
  baseline_saved_at: null,
  baseline_strategy: "oldest_retained_snapshot",
  history_record_count: 0,
  latest_saved_at: null,
  metrics: [],
  retention: DEFAULT_RETENTION,
  verdict: "no_baseline",
};

const EMPTY_REGRESSION_REPORT: ClawTraceRegressionReport = {
  evidence_sources: [],
  owner_totals: [],
  primary_owner: null,
  segments: [],
  verdict: "no_evidence",
  window: {
    compact_history_record_count: 0,
    app_server_trace_window_count: 0,
  },
};

const RECORDED_PHASE_GROUP_ORDER: TraceRecordedPhaseGroupId[] = [
  "input_submit",
  "turn_submit",
  "provider_wait",
  "first_text",
  "history_switch",
  "history_fetch_detail",
  "runtime_session",
  "message_list",
  "ui_long_task",
  "other",
];

function normalizeMs(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function sumMs(values: Array<number | null>): number | null {
  const numbers = values.filter(
    (value): value is number => typeof value === "number",
  );
  if (numbers.length === 0) {
    return null;
  }
  return numbers.reduce((total, value) => total + value, 0);
}

function ownerForSegment(segment: TraceSegmentModel): ClawTraceRegressionOwner {
  switch (segment.id) {
    case "server_wait":
      return "provider_api";
    case "server_to_renderer":
      return "app_server";
    case "input_to_accepted":
    case "renderer_to_paint":
      return "lime_client";
  }
}

function dominantReasonForOwner(
  owner: ClawTraceRegressionOwner,
): TraceCurrentAttributionReason {
  switch (owner) {
    case "provider_api":
      return "provider_wait_dominant";
    case "app_server":
      return "app_server_dominant";
    case "lime_client":
      return "lime_client_dominant";
  }
}

function buildCurrentAttribution(
  segments: TraceSegmentModel[],
  totalFirstTextPaintMs: number | null,
  clientActionableMs: number | null,
): TraceCurrentAttributionModel {
  const measuredSegments = segments.filter(
    (segment): segment is TraceSegmentModel & { valueMs: number } =>
      segment.valueMs !== null,
  );
  if (measuredSegments.length === 0) {
    return {
      clientActionableMs,
      owner: null,
      ownerShare: null,
      ownerTotalMs: null,
      primarySegmentId: null,
      primarySegmentValueMs: null,
      reason: "insufficient",
      severity: "unknown",
      totalFirstTextPaintMs,
    };
  }

  const ownerTotals = new Map<ClawTraceRegressionOwner, number>();
  for (const segment of measuredSegments) {
    const owner = ownerForSegment(segment);
    ownerTotals.set(owner, (ownerTotals.get(owner) ?? 0) + segment.valueMs);
  }

  const [primaryOwner, ownerTotalMs] = [...ownerTotals.entries()].sort(
    (left, right) => {
      const byTotal = right[1] - left[1];
      if (byTotal !== 0) {
        return byTotal;
      }
      return left[0].localeCompare(right[0]);
    },
  )[0] ?? [null, null];
  const ownerSegments = primaryOwner
    ? measuredSegments.filter(
        (segment) => ownerForSegment(segment) === primaryOwner,
      )
    : [];
  const primarySegment = [...ownerSegments].sort(
    (left, right) => right.valueMs - left.valueMs,
  )[0];
  const totalForShare =
    totalFirstTextPaintMs ??
    sumMs(measuredSegments.map((segment) => segment.valueMs));
  const ownerShare =
    ownerTotalMs !== null && totalForShare && totalForShare > 0
      ? Math.min(1, ownerTotalMs / totalForShare)
      : null;
  const isDominant =
    ownerShare !== null && ownerShare >= CURRENT_ATTRIBUTION_DOMINANT_SHARE;
  const severity =
    (totalFirstTextPaintMs ?? 0) >= CURRENT_ATTRIBUTION_SLOW_TOTAL_MS ||
    (ownerTotalMs ?? 0) >= CURRENT_ATTRIBUTION_SLOW_OWNER_MS
      ? "slow"
      : "ok";

  return {
    clientActionableMs,
    owner: primaryOwner,
    ownerShare,
    ownerTotalMs,
    primarySegmentId: primarySegment?.id ?? null,
    primarySegmentValueMs: primarySegment?.valueMs ?? null,
    reason:
      primaryOwner && isDominant
        ? dominantReasonForOwner(primaryOwner)
        : "balanced",
    severity,
    totalFirstTextPaintMs,
  };
}

function latestSessionId(snapshot: AgentUiPerformanceSnapshot): string | null {
  for (let index = snapshot.entries.length - 1; index >= 0; index -= 1) {
    const sessionId = snapshot.entries[index]?.sessionId?.trim();
    if (sessionId) {
      return sessionId;
    }
  }
  return null;
}

function hasClawTurnMetric(session: AgentUiPerformanceSessionSummary): boolean {
  return (
    normalizeMs(session.homeInputToSubmitAcceptedMs) !== null ||
    normalizeMs(session.providerWaitMs) !== null ||
    normalizeMs(session.submitAcceptedToFirstEventMs) !== null ||
    normalizeMs(session.serverToRendererFirstTextDeltaMs) !== null ||
    normalizeMs(session.rendererApplyFirstTextDeltaMs) !== null ||
    normalizeMs(session.clientLocalOutputMs) !== null ||
    normalizeMs(session.homeInputToFirstTextPaintMs) !== null
  );
}

function hasHistoryRestoreMetric(
  session: AgentUiPerformanceSessionSummary,
): boolean {
  return (
    normalizeMs(session.clickToSwitchStartMs) !== null ||
    normalizeMs(session.clickToFetchStartMs) !== null ||
    normalizeMs(session.fetchDetailDurationMs) !== null ||
    normalizeMs(session.runtimeGetSessionDurationMs) !== null ||
    normalizeMs(session.clickToMessageListPaintMs) !== null
  );
}

function sessionKind(
  session: AgentUiPerformanceSessionSummary | null,
): TraceSessionKind {
  if (!session) {
    return "unknown";
  }
  if (hasClawTurnMetric(session)) {
    return "claw_turn";
  }
  if (hasHistoryRestoreMetric(session)) {
    return "history_restore";
  }
  return "unknown";
}

function latestClawTurnSession(
  snapshot: AgentUiPerformanceSnapshot,
  workspaceId?: string | null,
): AgentUiPerformanceSessionSummary | null {
  const normalizedWorkspaceId = workspaceId?.trim();
  for (let index = snapshot.sessions.length - 1; index >= 0; index -= 1) {
    const session = snapshot.sessions[index];
    if (!session || !hasClawTurnMetric(session)) {
      continue;
    }
    if (
      normalizedWorkspaceId &&
      session.workspaceId !== normalizedWorkspaceId
    ) {
      continue;
    }
    return session;
  }
  return null;
}

function selectTraceSession(
  snapshot: AgentUiPerformanceSnapshot,
  sessionId?: string | null,
  workspaceId?: string | null,
): AgentUiPerformanceSessionSummary | null {
  const normalizedSessionId = sessionId?.trim();
  const exact = normalizedSessionId
    ? snapshot.sessions.find(
        (session) => session.sessionId === normalizedSessionId,
      )
    : null;
  if (exact && hasClawTurnMetric(exact)) {
    return exact;
  }

  const latestClawSession = latestClawTurnSession(snapshot, workspaceId);
  if (latestClawSession) {
    return latestClawSession;
  }

  if (exact) {
    return exact;
  }

  const latestEntrySessionId = latestSessionId(snapshot);
  if (latestEntrySessionId) {
    const latestEntrySession = snapshot.sessions.find(
      (session) => session.sessionId === latestEntrySessionId,
    );
    if (latestEntrySession) {
      return latestEntrySession;
    }
  }

  const normalizedWorkspaceId = workspaceId?.trim();
  if (normalizedWorkspaceId) {
    for (let index = snapshot.sessions.length - 1; index >= 0; index -= 1) {
      const session = snapshot.sessions[index];
      if (session?.workspaceId === normalizedWorkspaceId) {
        return session;
      }
    }
  }

  return snapshot.sessions.at(-1) ?? null;
}

function recordedPhaseGroupId(phase: string): TraceRecordedPhaseGroupId {
  const normalized = phase.toLowerCase();
  if (normalized.includes("longtask")) {
    return "ui_long_task";
  }
  if (normalized.includes("messagelist")) {
    return "message_list";
  }
  if (normalized.includes("getsession")) {
    return "runtime_session";
  }
  if (normalized.includes("fetchdetail")) {
    return "history_fetch_detail";
  }
  if (
    normalized.includes("historyrestore.click") ||
    normalized.includes("switch")
  ) {
    return "history_switch";
  }
  if (normalized.includes("firsttext")) {
    return "first_text";
  }
  if (normalized.includes("provider")) {
    return "provider_wait";
  }
  if (normalized.includes("submitaccepted")) {
    return "turn_submit";
  }
  if (normalized.includes("homeinput") || normalized.includes("submit")) {
    return "input_submit";
  }
  return "other";
}

function buildRecordedPhaseGroups(
  phases: string[],
): TraceRecordedPhaseGroupModel[] {
  const counts = new Map<TraceRecordedPhaseGroupId, number>();
  for (const phase of phases) {
    const groupId = recordedPhaseGroupId(phase);
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  return RECORDED_PHASE_GROUP_ORDER.flatMap((id) => {
    const count = counts.get(id) ?? 0;
    return count > 0 ? [{ id, count }] : [];
  });
}

function buildMissingPhaseIds(
  session: AgentUiPerformanceSessionSummary | null,
  kind: TraceSessionKind,
): string[] {
  if (!session || kind === "history_restore") {
    return [];
  }

  const missing: string[] = [];
  if (normalizeMs(session.homeInputToSubmitAcceptedMs) === null) {
    missing.push("input_to_accepted");
  }
  if (
    normalizeMs(session.providerWaitMs) === null &&
    normalizeMs(session.submitAcceptedToFirstEventMs) === null
  ) {
    missing.push("server_wait");
  }
  if (normalizeMs(session.serverToRendererFirstTextDeltaMs) === null) {
    missing.push("server_to_renderer");
  }
  if (
    normalizeMs(session.clientLocalOutputMs) === null &&
    normalizeMs(session.firstTextDeltaToFirstTextPaintMs) === null
  ) {
    missing.push("renderer_to_paint");
  }
  return missing;
}

function buildHistoryRestoreMetrics(
  session: AgentUiPerformanceSessionSummary | null,
): TraceHistoryRestoreMetricModel[] {
  if (!session) {
    return [];
  }

  return [
    {
      id: "click_to_switch_start",
      valueMs: normalizeMs(session.clickToSwitchStartMs),
    },
    {
      id: "click_to_fetch_start",
      valueMs: normalizeMs(session.clickToFetchStartMs),
    },
    {
      id: "fetch_detail",
      valueMs: normalizeMs(session.fetchDetailDurationMs),
    },
    {
      id: "runtime_get_session",
      valueMs: normalizeMs(session.runtimeGetSessionDurationMs),
    },
    {
      id: "click_to_message_list_paint",
      valueMs: normalizeMs(session.clickToMessageListPaintMs),
    },
  ].filter(
    (metric): metric is TraceHistoryRestoreMetricModel =>
      metric.valueMs !== null,
  );
}

function buildSelectedSessionDiagnosticSummary(
  snapshot: AgentUiPerformanceSnapshot,
  session: AgentUiPerformanceSessionSummary | null,
) {
  if (!session) {
    return null;
  }

  const summary = buildAgentUiPerformanceDiagnosticSummary(snapshot);
  const selectedSession = summary?.sessions.find(
    (item) => item.sessionId === session.sessionId,
  );
  if (!selectedSession) {
    return null;
  }

  return {
    entry_count: snapshot.entries.filter(
      (entry) => entry.sessionId === session.sessionId,
    ).length,
    session_count: 1,
    sessions: [selectedSession],
    truncated_session_count: 0,
  };
}

function selectPrimaryRegressionSegment(
  report: ClawTraceRegressionReport,
): ClawTraceRegressionSegment | null {
  if (!report.primary_owner) {
    return null;
  }

  return (
    report.segments.find(
      (segment) =>
        segment.owner === report.primary_owner &&
        segment.verdict === "regressed",
    ) ?? null
  );
}

export function buildWorkspaceTracePanelModel(
  snapshot: AgentUiPerformanceSnapshot,
  options: BuildWorkspaceTracePanelModelOptions,
): WorkspaceTracePanelModel {
  const session = selectTraceSession(
    snapshot,
    options.sessionId,
    options.workspaceId,
  );
  const selectedSessionKind = sessionKind(session);
  const segments: TraceSegmentModel[] =
    session && selectedSessionKind === "claw_turn"
      ? [
          {
            id: "input_to_accepted",
            owner: "client",
            valueMs: normalizeMs(session.homeInputToSubmitAcceptedMs),
          },
          {
            id: "server_wait",
            owner: "server",
            valueMs:
              normalizeMs(session.providerWaitMs) ??
              normalizeMs(session.submitAcceptedToFirstEventMs),
          },
          {
            id: "server_to_renderer",
            owner: "bridge",
            valueMs: normalizeMs(session.serverToRendererFirstTextDeltaMs),
          },
          {
            id: "renderer_to_paint",
            owner: "client",
            valueMs:
              normalizeMs(session.clientLocalOutputMs) ??
              normalizeMs(session.firstTextDeltaToFirstTextPaintMs),
          },
        ]
      : [];
  const includeComparisons = options.includeComparisons !== false;
  const baselineComparison = includeComparisons
    ? projectClawTraceBaselineComparison({
        baselineRecords: options.baselineRecords ?? [],
        currentSummary: buildSelectedSessionDiagnosticSummary(
          snapshot,
          session,
        ),
        retention: options.retention ?? DEFAULT_RETENTION,
      })
    : {
        ...EMPTY_BASELINE_COMPARISON,
        retention: options.retention ?? DEFAULT_RETENTION,
      };
  const regressionReport = includeComparisons
    ? projectClawTraceRegressionReport({
        appServerComparison: null,
        baselineComparison,
      })
    : EMPTY_REGRESSION_REPORT;
  const clientActionableMs = sumMs(
    segments
      .filter((segment) => segment.owner === "client")
      .map((segment) => segment.valueMs),
  );
  const totalFirstTextPaintMs = normalizeMs(
    session?.homeInputToFirstTextPaintMs,
  );

  return {
    baselineComparison,
    clientActionableMs,
    currentAttribution: buildCurrentAttribution(
      segments,
      totalFirstTextPaintMs,
      clientActionableMs,
    ),
    enabled: options.enabled,
    entryCount: snapshot.entries.length,
    missingPhaseIds: buildMissingPhaseIds(session, selectedSessionKind),
    recordedPhaseGroups: buildRecordedPhaseGroups(session?.phases ?? []),
    segments,
    session,
    sessionCount: snapshot.sessions.length,
    sessionKind: selectedSessionKind,
    primaryRegressionSegment: selectPrimaryRegressionSegment(regressionReport),
    regressionReport,
    slowSegments: [...segments]
      .filter(
        (segment) =>
          segment.valueMs !== null &&
          (segment.owner !== "client" ||
            segment.valueMs >= CLIENT_METRIC_THRESHOLD_MS),
      )
      .sort((left, right) => (right.valueMs ?? 0) - (left.valueMs ?? 0))
      .slice(0, 3),
    totalFirstTextPaintMs,
    healthMetrics: [
      {
        id: "long_task_count",
        value: normalizeMs(session?.longTaskCount),
      },
      {
        id: "long_task_max",
        value: normalizeMs(session?.longTaskMaxMs),
      },
      {
        id: "message_list_compute_max",
        value: normalizeMs(session?.messageListComputeMaxMs),
      },
      {
        id: "message_list_render_max",
        value: normalizeMs(session?.messageListRenderGroupsMaxMs),
      },
    ],
    historyRestoreMetrics: buildHistoryRestoreMetrics(session),
  };
}
