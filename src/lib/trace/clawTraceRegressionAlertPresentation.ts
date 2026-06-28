import type {
  ClawTraceRegressionAlert,
  ClawTraceRegressionAlertReason,
  ClawTraceRegressionAlertSeverity,
} from "./clawTraceRegressionAlert";
import type { ClawTraceRegressionOwner } from "./clawTraceRegressionReport";

export type ClawTraceRegressionAlertTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

function formatMs(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

export function clawTraceRegressionOwnerLabelKey(
  owner: ClawTraceRegressionOwner,
): string {
  switch (owner) {
    case "provider_api":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.providerApi";
    case "app_server":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.appServer";
    case "lime_client":
      return "settings.developer.debugSwitch.clawTrace.regression.owner.limeClient";
  }
}

export function clawTraceRegressionAlertSeverityLabelKey(
  severity: ClawTraceRegressionAlertSeverity,
): string {
  switch (severity) {
    case "none":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.none";
    case "watch":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.watch";
    case "warning":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.warning";
    case "critical":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.severity.critical";
  }
}

export function clawTraceRegressionAlertReasonLabelKey(
  reason: ClawTraceRegressionAlertReason,
): string {
  switch (reason) {
    case "no_evidence":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.noEvidence";
    case "current_stable":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.currentStable";
    case "current_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.currentRegression";
    case "large_current_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.largeCurrentRegression";
    case "repeated_owner_regression":
      return "settings.developer.debugSwitch.clawTrace.regression.alert.reason.repeatedOwnerRegression";
  }
}

export function buildClawTraceRegressionAlertNotificationCopy(
  alert: ClawTraceRegressionAlert,
  translate: ClawTraceRegressionAlertTranslate,
): { body: string; title: string } {
  const body = alert.primary_owner
    ? translate(
        "settings.developer.debugSwitch.clawTrace.regression.alert.summary.withOwner",
        {
          deltaMs: formatMs(alert.current_regressed_delta_ms),
          owner: translate(
            clawTraceRegressionOwnerLabelKey(alert.primary_owner),
          ),
          reason: translate(
            clawTraceRegressionAlertReasonLabelKey(alert.reason),
          ),
          repeatCount: alert.repeated_owner_regression_count,
          windowCount: alert.recent_report_count,
        },
      )
    : translate(
        "settings.developer.debugSwitch.clawTrace.regression.alert.summary.noOwner",
        {
          reason: translate(
            clawTraceRegressionAlertReasonLabelKey(alert.reason),
          ),
          windowCount: alert.recent_report_count,
        },
      );

  return {
    body,
    title: `${translate(
      "settings.developer.debugSwitch.clawTrace.regression.alert.title",
    )}: ${translate(clawTraceRegressionAlertSeverityLabelKey(alert.severity))}`,
  };
}
