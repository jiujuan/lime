import { app } from "electron";
import electronUpdater, { type ProgressInfo, type UpdateInfo } from "electron-updater";

const { autoUpdater } = electronUpdater;

type UpdateInstallStage =
  | "idle"
  | "checking"
  | "downloading"
  | "installing"
  | "restarting"
  | "completed"
  | "failed"
  | "up_to_date";

type UpdateInstallSession = {
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
};

type VersionInfo = {
  current: string;
  latest?: string | null;
  hasUpdate: boolean;
  downloadUrl?: string | null;
  releaseNotes?: string | null;
  releaseNotesUrl?: string | null;
  pubDate?: string | null;
  error?: string | null;
};

type DownloadUpdateResult = {
  success: boolean;
  message: string;
  filePath?: string | null;
};

type Broadcast = (event: string, payload?: unknown) => void;

const UPDATE_INSTALL_SESSION_EVENT = "app-update://session";

export class ElectronUpdateHost {
  readonly #broadcast: Broadcast;
  #configured = false;
  #session: UpdateInstallSession;
  #latestInfo: UpdateInfo | null = null;
  #downloadedFiles: string[] = [];

  constructor(broadcast: Broadcast) {
    this.#broadcast = broadcast;
    this.#session = this.#idleSession();
  }

  async invoke(command: string): Promise<unknown> {
    switch (command) {
      case "check_for_updates":
        return await this.checkForUpdates();
      case "download_update":
        return await this.downloadUpdate();
      case "start_update_install_session":
        return await this.startInstallSession();
      case "get_update_install_session":
        return this.#session;
      case "get_update_check_settings":
        return this.#updateSettings();
      case "set_update_check_settings":
        return { success: true };
      case "get_update_notification_metrics":
        return this.#updateMetrics();
      case "dismiss_update_notification":
      case "remind_update_later":
        return Math.floor(Date.now() / 1000) + 24 * 3600;
      case "record_update_notification_action":
      case "skip_update_version":
      case "close_update_window":
      case "test_update_window":
        return {};
      default:
        throw new Error(`Electron update command is not implemented: ${command}`);
    }
  }

  async checkForUpdates(): Promise<VersionInfo> {
    this.#configure();
    if (!this.#canUseUpdater()) {
      return {
        current: app.getVersion(),
        hasUpdate: false,
        error: "Electron updater is only enabled for packaged builds.",
      };
    }

    this.#setSession({ stage: "checking", message: "正在检查更新", isActive: true });
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo ?? null;
      this.#latestInfo = info;
      const hasUpdate = Boolean(info && info.version !== app.getVersion());
      this.#setSession({
        stage: hasUpdate ? "idle" : "up_to_date",
        latestVersion: info?.version ?? null,
        message: hasUpdate ? "发现新版本" : "当前已是最新版本",
        isActive: false,
        completedAt: Date.now(),
      });
      return this.#versionInfo(info, hasUpdate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setSession({
        stage: "failed",
        error: message,
        message,
        isActive: false,
        completedAt: Date.now(),
      });
      return {
        current: app.getVersion(),
        hasUpdate: false,
        error: message,
      };
    }
  }

  async downloadUpdate(): Promise<DownloadUpdateResult> {
    this.#configure();
    if (!this.#canUseUpdater()) {
      return {
        success: false,
        message: "Electron updater is only enabled for packaged builds.",
      };
    }

    this.#setSession({
      stage: "downloading",
      latestVersion: this.#latestInfo?.version ?? null,
      message: "正在下载更新",
      isActive: true,
    });
    try {
      this.#downloadedFiles = await autoUpdater.downloadUpdate();
      this.#setSession({
        stage: "completed",
        downloadedBytes: this.#session.totalBytes ?? this.#session.downloadedBytes,
        percent: 1,
        message: "更新已下载，准备安装",
        isActive: false,
        completedAt: Date.now(),
      });
      return {
        success: true,
        message: "更新已下载",
        filePath: this.#downloadedFiles[0] ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setSession({
        stage: "failed",
        error: message,
        message,
        isActive: false,
        completedAt: Date.now(),
      });
      return { success: false, message };
    }
  }

  async startInstallSession(): Promise<UpdateInstallSession> {
    const version = await this.checkForUpdates();
    if (!version.hasUpdate) {
      return this.#session;
    }
    const downloaded = await this.downloadUpdate();
    if (!downloaded.success) {
      return this.#session;
    }
    this.#setSession({
      stage: "restarting",
      message: "正在重启并安装更新",
      isActive: true,
      canCloseWindow: false,
    });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 250);
    return this.#session;
  }

  #configure(): void {
    if (this.#configured) {
      return;
    }
    this.#configured = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = console;
    const feedUrl = process.env.LIME_ELECTRON_UPDATES_URL?.trim();
    if (feedUrl) {
      autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
    }
    autoUpdater.on("download-progress", (progress) => {
      this.#applyProgress(progress);
    });
    autoUpdater.on("update-downloaded", (event) => {
      this.#latestInfo = event;
      this.#setSession({
        stage: "completed",
        latestVersion: event.version,
        percent: 1,
        message: "更新已下载，准备安装",
        isActive: false,
        completedAt: Date.now(),
      });
    });
    autoUpdater.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.#setSession({
        stage: "failed",
        error: message,
        message,
        isActive: false,
        completedAt: Date.now(),
      });
    });
  }

  #canUseUpdater(): boolean {
    return app.isPackaged || process.env.LIME_ELECTRON_ENABLE_DEV_UPDATER === "1";
  }

  #versionInfo(info: UpdateInfo | null, hasUpdate: boolean): VersionInfo {
    return {
      current: app.getVersion(),
      latest: info?.version ?? null,
      hasUpdate,
      downloadUrl: this.#downloadUrl(info),
      releaseNotes: typeof info?.releaseNotes === "string" ? info.releaseNotes : null,
      releaseNotesUrl: null,
      pubDate: info?.releaseDate ?? null,
      error: null,
    };
  }

  #downloadUrl(info: UpdateInfo | null): string | null {
    const firstFile = Array.isArray(info?.files) ? info?.files[0] : null;
    return firstFile?.url ?? null;
  }

  #applyProgress(progress: ProgressInfo): void {
    this.#setSession({
      stage: "downloading",
      downloadedBytes: progress.transferred,
      totalBytes: progress.total,
      percent: Math.max(0, Math.min(1, progress.percent / 100)),
      message: "正在下载更新",
      isActive: true,
    });
  }

  #setSession(update: Partial<UpdateInstallSession>): void {
    this.#session = {
      ...this.#session,
      ...update,
      updatedAt: Date.now(),
    };
    this.#broadcast(UPDATE_INSTALL_SESSION_EVENT, this.#session);
  }

  #idleSession(): UpdateInstallSession {
    const now = Date.now();
    return {
      sessionId: `electron-update-${now}`,
      stage: "idle",
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloadUrl: null,
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
  }

  #updateSettings() {
    return {
      enabled: true,
      check_interval_hours: 24,
      show_notification: true,
      last_check_timestamp: 0,
      skipped_version: null,
      remind_later_until: null,
    };
  }

  #updateMetrics() {
    return {
      shown_count: 0,
      update_now_count: 0,
      remind_later_count: 0,
      skip_version_count: 0,
      dismiss_count: 0,
      update_now_rate: 0,
      remind_later_rate: 0,
      skip_version_rate: 0,
      dismiss_rate: 0,
    };
  }
}
