import type {
  ClawTraceRegressionOwner,
  ClawTraceRegressionReport,
} from "./clawTraceRegressionReport";
import type { ClawTraceRegressionTrendRecord } from "./clawTraceRegressionTrend";

export type ClawTraceRegressionAlertSeverity =
  | "none"
  | "watch"
  | "warning"
  | "critical";

export type ClawTraceRegressionAlertReason =
  | "no_evidence"
  | "current_stable"
  | "current_regression"
  | "large_current_regression"
  | "repeated_owner_regression";

export interface ClawTraceRegressionAlert {
  current_regressed_delta_ms: number;
  primary_owner: ClawTraceRegressionOwner | null;
  reason: ClawTraceRegressionAlertReason;
  recent_report_count: number;
  repeated_owner_regression_count: number;
  severity: ClawTraceRegressionAlertSeverity;
}

export interface ProjectClawTraceRegressionAlertInput {
  currentReport: ClawTraceRegressionReport;
  trendRecords: ClawTraceRegressionTrendRecord[];
}

const RECENT_ALERT_WINDOW_RECORDS = 5;
const WARNING_DELTA_MS = 150;
const CRITICAL_DELTA_MS = 500;
const WARNING_REPEATED_OWNER_COUNT = 2;
const CRITICAL_REPEATED_OWNER_COUNT = 3;

function reportKey(report: ClawTraceRegressionReport): string {
  return JSON.stringify({
    owner_totals: report.owner_totals,
    primary_owner: report.primary_owner,
    segments: report.segments,
    verdict: report.verdict,
    window: report.window,
  });
}

function latestReports(
  currentReport: ClawTraceRegressionReport,
  trendRecords: ClawTraceRegressionTrendRecord[],
): ClawTraceRegressionReport[] {
  const currentKey = reportKey(currentReport);
  const savedReports = [...trendRecords]
    .sort((left, right) => right.saved_at_ms - left.saved_at_ms)
    .map((record) => record.report)
    .filter((report) => reportKey(report) !== currentKey);

  return [currentReport, ...savedReports].slice(0, RECENT_ALERT_WINDOW_RECORDS);
}

function ownerDelta(
  report: ClawTraceRegressionReport,
  owner: ClawTraceRegressionOwner | null,
): number {
  if (!owner) {
    return 0;
  }
  return Math.max(
    0,
    report.owner_totals.find((total) => total.owner === owner)
      ?.regressed_delta_ms ?? 0,
  );
}

function repeatedOwnerRegressionCount(
  reports: ClawTraceRegressionReport[],
  owner: ClawTraceRegressionOwner | null,
): number {
  if (!owner) {
    return 0;
  }
  return reports.filter(
    (report) =>
      report.verdict === "regressed" && report.primary_owner === owner,
  ).length;
}

export function projectClawTraceRegressionAlert({
  currentReport,
  trendRecords,
}: ProjectClawTraceRegressionAlertInput): ClawTraceRegressionAlert {
  const reports = latestReports(currentReport, trendRecords);
  const owner = currentReport.primary_owner;
  const currentDeltaMs = ownerDelta(currentReport, owner);
  const repeatCount = repeatedOwnerRegressionCount(reports, owner);

  if (
    currentReport.verdict === "no_evidence" ||
    currentReport.segments.length === 0
  ) {
    return {
      current_regressed_delta_ms: 0,
      primary_owner: null,
      reason: "no_evidence",
      recent_report_count: reports.length,
      repeated_owner_regression_count: 0,
      severity: "none",
    };
  }

  if (currentReport.verdict !== "regressed" || !owner) {
    return {
      current_regressed_delta_ms: 0,
      primary_owner: owner,
      reason: "current_stable",
      recent_report_count: reports.length,
      repeated_owner_regression_count: 0,
      severity: "none",
    };
  }

  if (
    repeatCount >= CRITICAL_REPEATED_OWNER_COUNT ||
    currentDeltaMs >= CRITICAL_DELTA_MS
  ) {
    return {
      current_regressed_delta_ms: currentDeltaMs,
      primary_owner: owner,
      reason:
        repeatCount >= CRITICAL_REPEATED_OWNER_COUNT
          ? "repeated_owner_regression"
          : "large_current_regression",
      recent_report_count: reports.length,
      repeated_owner_regression_count: repeatCount,
      severity: "critical",
    };
  }

  if (
    repeatCount >= WARNING_REPEATED_OWNER_COUNT ||
    currentDeltaMs >= WARNING_DELTA_MS
  ) {
    return {
      current_regressed_delta_ms: currentDeltaMs,
      primary_owner: owner,
      reason:
        repeatCount >= WARNING_REPEATED_OWNER_COUNT
          ? "repeated_owner_regression"
          : "large_current_regression",
      recent_report_count: reports.length,
      repeated_owner_regression_count: repeatCount,
      severity: "warning",
    };
  }

  return {
    current_regressed_delta_ms: currentDeltaMs,
    primary_owner: owner,
    reason: "current_regression",
    recent_report_count: reports.length,
    repeated_owner_regression_count: repeatCount,
    severity: "watch",
  };
}
