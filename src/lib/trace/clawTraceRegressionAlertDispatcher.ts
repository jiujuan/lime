import type { ClawTraceRegressionAlert } from "./clawTraceRegressionAlert";
import {
  listClawTraceRegressionAlertChannel,
  recordClawTraceRegressionAlertChannelEvaluation,
  type ClawTraceRegressionAlertChannelRecord,
} from "./clawTraceRegressionAlertChannel";
import type { ClawTraceRegressionReport } from "./clawTraceRegressionReport";
import type {
  ClawTraceRegressionAlertNotificationAdapter,
  ClawTraceRegressionAlertNotificationResult,
} from "./clawTraceRegressionAlertNotifier";

export type ClawTraceRegressionAlertDispatchNotificationResult =
  | "not_requested"
  | ClawTraceRegressionAlertNotificationResult;

export interface DispatchClawTraceRegressionAlertNotificationOptions {
  body: string;
  notifier: ClawTraceRegressionAlertNotificationAdapter;
  title: string;
}

export interface DispatchClawTraceRegressionAlertInput {
  alert: ClawTraceRegressionAlert | null;
  alertEnabled: boolean;
  notification?: DispatchClawTraceRegressionAlertNotificationOptions;
  notificationEnabled: boolean;
  nowMs?: number;
  report: ClawTraceRegressionReport;
}

export interface DispatchClawTraceRegressionAlertResult {
  notification_attempted: boolean;
  notification_result: ClawTraceRegressionAlertDispatchNotificationResult;
  record: ClawTraceRegressionAlertChannelRecord | null;
  recorded: boolean;
  skipped_reason:
    | "alert_disabled"
    | "duplicate"
    | "none_alert"
    | "record_failed"
    | null;
}

function isExistingRecord(
  records: ClawTraceRegressionAlertChannelRecord[],
  record: ClawTraceRegressionAlertChannelRecord,
): boolean {
  return records.some(
    (candidate) =>
      candidate.id === record.id ||
      candidate.fingerprint === record.fingerprint,
  );
}

export async function dispatchClawTraceRegressionAlert({
  alert,
  alertEnabled,
  notification,
  notificationEnabled,
  nowMs,
  report,
}: DispatchClawTraceRegressionAlertInput): Promise<DispatchClawTraceRegressionAlertResult> {
  if (!alertEnabled) {
    return {
      notification_attempted: false,
      notification_result: "not_requested",
      record: null,
      recorded: false,
      skipped_reason: "alert_disabled",
    };
  }

  if (!alert || alert.severity === "none") {
    return {
      notification_attempted: false,
      notification_result: "not_requested",
      record: null,
      recorded: false,
      skipped_reason: "none_alert",
    };
  }

  const beforeRecords = listClawTraceRegressionAlertChannel();
  const record = recordClawTraceRegressionAlertChannelEvaluation(
    alert,
    report,
    nowMs === undefined ? {} : { nowMs },
  );

  if (!record) {
    return {
      notification_attempted: false,
      notification_result: "not_requested",
      record: null,
      recorded: false,
      skipped_reason: "record_failed",
    };
  }

  const duplicate = isExistingRecord(beforeRecords, record);
  if (duplicate) {
    return {
      notification_attempted: false,
      notification_result: "not_requested",
      record,
      recorded: false,
      skipped_reason: "duplicate",
    };
  }

  if (!notificationEnabled || !notification) {
    return {
      notification_attempted: false,
      notification_result: "not_requested",
      record,
      recorded: true,
      skipped_reason: null,
    };
  }

  let notificationResult: ClawTraceRegressionAlertNotificationResult;
  try {
    notificationResult = await notification.notifier.notify({
      body: notification.body,
      tag: record.id,
      title: notification.title,
    });
  } catch {
    notificationResult = "failed";
  }

  return {
    notification_attempted: true,
    notification_result: notificationResult,
    record,
    recorded: true,
    skipped_reason: null,
  };
}
