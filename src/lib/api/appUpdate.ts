import type { UnlistenFn } from "@tauri-apps/api/event";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";

export const UPDATE_INSTALL_SESSION_EVENT = "app-update://session";

export interface VersionInfo {
  current: string;
  latest?: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseNotes?: string;
  releaseNotesUrl?: string;
  pubDate?: string;
  error?: string;
}

export interface DownloadUpdateResult {
  success: boolean;
  message: string;
  filePath?: string;
}

export type UpdateInstallStage =
  | "idle"
  | "checking"
  | "downloading"
  | "installing"
  | "restarting"
  | "completed"
  | "failed"
  | "up_to_date";

export interface UpdateInstallSession {
  sessionId: string;
  stage: UpdateInstallStage;
  currentVersion: string;
  latestVersion?: string | null;
  downloadUrl?: string | null;
  downloadedBytes: number;
  totalBytes?: number | null;
  percent: number;
  message: string;
  error?: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  canCloseWindow: boolean;
  isActive: boolean;
}

export interface UpdateCheckConfig {
  enabled: boolean;
  check_interval_hours: number;
  show_notification: boolean;
  last_check_timestamp: number;
  skipped_version: string | null;
  remind_later_until: number | null;
}

export interface UpdateNotificationMetrics {
  shown_count: number;
  update_now_count: number;
  remind_later_count: number;
  skip_version_count: number;
  dismiss_count: number;
  update_now_rate: number;
  remind_later_rate: number;
  skip_version_rate: number;
  dismiss_rate: number;
}

export async function checkForUpdates(): Promise<VersionInfo> {
  return safeInvoke<VersionInfo>("check_for_updates");
}

export async function downloadUpdate(): Promise<DownloadUpdateResult> {
  return safeInvoke<DownloadUpdateResult>("download_update");
}

export async function startUpdateInstallSession(): Promise<UpdateInstallSession> {
  return safeInvoke<UpdateInstallSession>("start_update_install_session");
}

export async function getUpdateInstallSession(): Promise<UpdateInstallSession> {
  return safeInvoke<UpdateInstallSession>("get_update_install_session");
}

export async function listenUpdateInstallSession(
  handler: (session: UpdateInstallSession) => void,
): Promise<UnlistenFn> {
  return safeListen<UpdateInstallSession>(
    UPDATE_INSTALL_SESSION_EVENT,
    ({ payload }) => handler(payload),
  );
}

export function isUpdateInstallSessionActive(
  session: Pick<UpdateInstallSession, "stage" | "isActive"> | null | undefined,
): boolean {
  if (!session?.isActive) {
    return false;
  }

  return (
    session.stage === "checking" ||
    session.stage === "downloading" ||
    session.stage === "installing" ||
    session.stage === "restarting"
  );
}

export async function getUpdateCheckSettings(): Promise<UpdateCheckConfig> {
  return safeInvoke<UpdateCheckConfig>("get_update_check_settings");
}

export async function setUpdateCheckSettings(
  settings: UpdateCheckConfig,
): Promise<void> {
  await safeInvoke("set_update_check_settings", { settings });
}

export async function getUpdateNotificationMetrics(): Promise<UpdateNotificationMetrics> {
  return safeInvoke<UpdateNotificationMetrics>(
    "get_update_notification_metrics",
  );
}

export async function testUpdateWindow(): Promise<void> {
  await safeInvoke("test_update_window");
}

export async function closeUpdateWindow(): Promise<void> {
  await safeInvoke("close_update_window");
}

export async function dismissUpdateNotification(
  version?: string | null,
): Promise<number> {
  return safeInvoke<number>("dismiss_update_notification", {
    version: version ?? null,
  });
}

export async function recordUpdateNotificationAction(
  action: string,
): Promise<void> {
  await safeInvoke("record_update_notification_action", { action });
}

export async function remindUpdateLater(hours: number): Promise<number> {
  return safeInvoke<number>("remind_update_later", { hours });
}

export async function skipUpdateVersion(version: string): Promise<void> {
  await safeInvoke("skip_update_version", { version });
}
