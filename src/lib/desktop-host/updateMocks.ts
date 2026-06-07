const nowSeconds = () => Math.floor(Date.now() / 1000);

const getPreviewUpdateMode = () => {
  if (typeof window === "undefined") {
    return "none";
  }

  const params = new URLSearchParams(window.location.search);
  const mode =
    params.get("lime_mock_update") ?? params.get("mock_update") ?? "none";

  if (mode === "1" || mode === "true" || mode === "available") {
    return "available";
  }

  if (mode === "downloading") {
    return "downloading";
  }

  return "none";
};

const idleInstallSession = () => {
  const now = nowSeconds();
  return {
    sessionId: "idle",
    stage: "idle",
    currentVersion: "1.26.0",
    latestVersion: null,
    downloadUrl: "https://github.com/limecloud/lime/releases",
    downloadedBytes: 0,
    totalBytes: null,
    percent: 0,
    message: "尚未开始更新",
    error: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    canCloseWindow: true,
    isActive: false,
  };
};

const downloadingInstallSession = () => {
  const now = nowSeconds();
  return {
    sessionId: "mock-update-session",
    stage: "downloading",
    currentVersion: "1.26.0",
    latestVersion: "1.27.0",
    downloadUrl: "https://github.com/limecloud/lime/releases",
    downloadedBytes: 52_428_800,
    totalBytes: 104_857_600,
    percent: 0.5,
    message: "正在下载更新",
    error: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    canCloseWindow: true,
    isActive: true,
  };
};

export const updateMocks: Record<string, (args?: any) => any> = {
  check_update: () => ({
    current_version: "1.26.0",
    latest_version: getPreviewUpdateMode() === "none" ? null : "1.27.0",
    has_update: getPreviewUpdateMode() !== "none",
    download_url: "https://github.com/limecloud/lime/releases",
    release_notes_url: "https://github.com/limecloud/lime/releases",
    release_notes: null,
    pub_date: null,
    checked_at: Math.floor(Date.now() / 1000),
    error: null,
  }),
  check_for_updates: () => ({
    current: "1.26.0",
    latest: getPreviewUpdateMode() === "none" ? null : "1.27.0",
    hasUpdate: getPreviewUpdateMode() !== "none",
    downloadUrl: "https://github.com/limecloud/lime/releases",
    releaseNotesUrl: "https://github.com/limecloud/lime/releases",
    releaseNotes: null,
    pubDate: null,
    error: null,
  }),
  get_update_check_settings: () => ({
    enabled: true,
    check_interval_hours: 24,
    show_notification: true,
    last_check_timestamp: 0,
    skipped_version: null,
    remind_later_until: null,
  }),
  get_update_notification_metrics: () => ({
    shown_count: 0,
    update_now_count: 0,
    remind_later_count: 0,
    skip_version_count: 0,
    dismiss_count: 0,
    update_now_rate: 0,
    remind_later_rate: 0,
    skip_version_rate: 0,
    dismiss_rate: 0,
  }),
  record_update_notification_action: () => ({}),
  download_update: () => ({
    success: false,
    message: "当前已是最新版本",
    filePath: null,
  }),
  start_update_install_session: () => downloadingInstallSession(),
  get_update_install_session: () =>
    getPreviewUpdateMode() === "downloading"
      ? downloadingInstallSession()
      : idleInstallSession(),
  skip_update_version: () => ({}),
  remind_update_later: () => nowSeconds() + 24 * 3600,
  dismiss_update_notification: () => nowSeconds() + 24 * 3600,
  close_update_window: () => ({}),
  open_update_window: () => ({}),
  set_update_check_settings: () => ({ success: true }),
  test_update_window: () => ({}),
};
