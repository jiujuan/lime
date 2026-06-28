import { showDesktopNotification } from "@/lib/api/desktopNotification";

export type ClawTraceRegressionAlertNotificationResult =
  | "failed"
  | "permission_denied"
  | "permission_not_requested"
  | "sent"
  | "unsupported";

export interface ClawTraceRegressionAlertNotificationPayload {
  body: string;
  tag: string;
  title: string;
}

export interface ClawTraceRegressionAlertNotificationAdapter {
  notify: (
    payload: ClawTraceRegressionAlertNotificationPayload,
  ) =>
    | ClawTraceRegressionAlertNotificationResult
    | Promise<ClawTraceRegressionAlertNotificationResult>;
}

type NotificationPermissionState = "default" | "denied" | "granted";

type NotificationConstructor = {
  new (
    title: string,
    options?: {
      body?: string;
      tag?: string;
    },
  ): unknown;
  permission?: NotificationPermissionState;
};

function getNotificationConstructor(): NotificationConstructor | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const candidate = (globalThis as { Notification?: unknown }).Notification;
  return typeof candidate === "function"
    ? (candidate as NotificationConstructor)
    : null;
}

export function notifyClawTraceRegressionAlert(
  payload: ClawTraceRegressionAlertNotificationPayload,
): ClawTraceRegressionAlertNotificationResult {
  const NotificationCtor = getNotificationConstructor();
  if (!NotificationCtor) {
    return "unsupported";
  }

  if (NotificationCtor.permission === "denied") {
    return "permission_denied";
  }

  if (NotificationCtor.permission !== "granted") {
    return "permission_not_requested";
  }

  try {
    new NotificationCtor(payload.title, {
      body: payload.body,
      tag: payload.tag,
    });
    return "sent";
  } catch {
    return "failed";
  }
}

export const browserClawTraceRegressionAlertNotifier: ClawTraceRegressionAlertNotificationAdapter =
  {
    notify: notifyClawTraceRegressionAlert,
  };

export const desktopHostClawTraceRegressionAlertNotifier: ClawTraceRegressionAlertNotificationAdapter =
  {
    async notify(payload) {
      try {
        const result = await showDesktopNotification({
          body: payload.body,
          silent: false,
          tag: payload.tag,
          title: payload.title,
        });
        return result.status;
      } catch {
        return "failed";
      }
    },
  };
