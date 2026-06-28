import {
  summarizeAgentUiPerformanceMetrics,
  type AgentUiPerformanceSnapshot,
} from "@/lib/agentUiPerformanceMetrics";
import {
  getAgentUiPerformanceTraceHistoryOverview,
  listAgentUiPerformanceTraceHistory,
  type AgentUiPerformanceTraceHistoryRecord,
  type AgentUiPerformanceTraceHistoryRetentionPolicy,
} from "@/lib/agentUiPerformanceTraceHistory";
import {
  buildAgentUiPerformanceDiagnosticSummary,
  type AgentUiPerformanceDiagnosticSummary,
} from "@/lib/crashDiagnosticAgentUiPerformance";
import { projectClawTraceBaselineComparison } from "./clawTraceBaseline";
import {
  projectClawTraceRegressionAlert,
  type ClawTraceRegressionAlert,
} from "./clawTraceRegressionAlert";
import {
  dispatchClawTraceRegressionAlert,
  type ClawTraceRegressionAlertDispatchNotificationResult,
  type DispatchClawTraceRegressionAlertResult,
} from "./clawTraceRegressionAlertDispatcher";
import type { ClawTraceRegressionAlertNotificationAdapter } from "./clawTraceRegressionAlertNotifier";
import {
  projectClawTraceRegressionReport,
  type ClawTraceRegressionReport,
} from "./clawTraceRegressionReport";
import {
  listClawTraceRegressionTrend,
  type ClawTraceRegressionTrendRecord,
} from "./clawTraceRegressionTrend";

export type ClawTraceRegressionAlertMonitorSkippedReason =
  | "alert_disabled"
  | "trace_disabled";

export interface ClawTraceRegressionAlertMonitorNotificationOptions {
  format: (alert: ClawTraceRegressionAlert) => {
    body: string;
    title: string;
  };
  notifier: ClawTraceRegressionAlertNotificationAdapter;
}

export interface EvaluateClawTraceRegressionAlertMonitorInput {
  alertEnabled: boolean;
  baselineRecords?: AgentUiPerformanceTraceHistoryRecord[];
  currentSnapshot?: AgentUiPerformanceSnapshot | null;
  currentSummary?: AgentUiPerformanceDiagnosticSummary | null;
  notification?: ClawTraceRegressionAlertMonitorNotificationOptions;
  notificationEnabled: boolean;
  nowMs?: number;
  retention?: AgentUiPerformanceTraceHistoryRetentionPolicy;
  traceEnabled: boolean;
  trendRecords?: ClawTraceRegressionTrendRecord[];
}

export interface EvaluateClawTraceRegressionAlertMonitorResult {
  alert: ClawTraceRegressionAlert | null;
  app_server_trace_requested: false;
  dispatch_result: DispatchClawTraceRegressionAlertResult | null;
  notification_result:
    | ClawTraceRegressionAlertDispatchNotificationResult
    | "not_evaluated";
  report: ClawTraceRegressionReport | null;
  skipped_reason: ClawTraceRegressionAlertMonitorSkippedReason | null;
}

function currentDiagnosticSummary(
  input: EvaluateClawTraceRegressionAlertMonitorInput,
): AgentUiPerformanceDiagnosticSummary | null {
  if (input.currentSummary !== undefined) {
    return input.currentSummary;
  }
  return buildAgentUiPerformanceDiagnosticSummary(
    input.currentSnapshot ?? summarizeAgentUiPerformanceMetrics(),
  );
}

export async function evaluateClawTraceRegressionAlertMonitor(
  input: EvaluateClawTraceRegressionAlertMonitorInput,
): Promise<EvaluateClawTraceRegressionAlertMonitorResult> {
  if (!input.traceEnabled) {
    return {
      alert: null,
      app_server_trace_requested: false,
      dispatch_result: null,
      notification_result: "not_evaluated",
      report: null,
      skipped_reason: "trace_disabled",
    };
  }

  if (!input.alertEnabled) {
    return {
      alert: null,
      app_server_trace_requested: false,
      dispatch_result: null,
      notification_result: "not_evaluated",
      report: null,
      skipped_reason: "alert_disabled",
    };
  }

  const retention =
    input.retention ?? getAgentUiPerformanceTraceHistoryOverview().retention;
  const baselineComparison = projectClawTraceBaselineComparison({
    baselineRecords:
      input.baselineRecords ?? listAgentUiPerformanceTraceHistory(),
    currentSummary: currentDiagnosticSummary(input),
    retention,
  });
  const report = projectClawTraceRegressionReport({
    appServerComparison: null,
    baselineComparison,
  });
  const alert = projectClawTraceRegressionAlert({
    currentReport: report,
    trendRecords: input.trendRecords ?? listClawTraceRegressionTrend(),
  });
  const notificationCopy =
    input.notificationEnabled && input.notification && alert.severity !== "none"
      ? input.notification.format(alert)
      : null;
  const dispatchResult = await dispatchClawTraceRegressionAlert({
    alert,
    alertEnabled: input.alertEnabled,
    notification: notificationCopy
      ? {
          ...notificationCopy,
          notifier: input.notification!.notifier,
        }
      : undefined,
    notificationEnabled: input.notificationEnabled,
    nowMs: input.nowMs,
    report,
  });

  return {
    alert,
    app_server_trace_requested: false,
    dispatch_result: dispatchResult,
    notification_result: dispatchResult.notification_result,
    report,
    skipped_reason: null,
  };
}
