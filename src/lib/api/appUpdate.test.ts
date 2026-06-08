import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import {
  UPDATE_INSTALL_SESSION_EVENT,
  checkForUpdates,
  closeUpdateWindow,
  dismissUpdateNotification,
  downloadUpdate,
  getUpdateInstallSession,
  getUpdateCheckSettings,
  getUpdateNotificationMetrics,
  isUpdateInstallSessionActive,
  listenUpdateInstallSession,
  openUpdateWindow,
  recordUpdateNotificationAction,
  remindUpdateLater,
  setUpdateCheckSettings,
  skipUpdateVersion,
  startUpdateInstallSession,
  testUpdateWindow,
} from "./appUpdate";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

describe("appUpdate API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeListen).mockResolvedValue(vi.fn());
  });

  it("应获取版本信息并下载更新", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ current: "1.0.0", hasUpdate: false })
      .mockResolvedValueOnce({ success: true, message: "ok" })
      .mockResolvedValueOnce({
        enabled: true,
        check_interval_hours: 24,
        show_notification: true,
        last_check_timestamp: 0,
        skipped_version: null,
        remind_later_until: null,
      })
      .mockResolvedValueOnce({
        shown_count: 1,
        update_now_count: 1,
        remind_later_count: 0,
        skip_version_count: 0,
        dismiss_count: 0,
        update_now_rate: 100,
        remind_later_rate: 0,
        skip_version_rate: 0,
        dismiss_rate: 0,
      });

    await expect(checkForUpdates()).resolves.toEqual(
      expect.objectContaining({ current: "1.0.0" }),
    );
    await expect(downloadUpdate()).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    await expect(getUpdateCheckSettings()).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(getUpdateNotificationMetrics()).resolves.toEqual(
      expect.objectContaining({ shown_count: 1 }),
    );
  });

  it("检查更新遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "check_for_updates",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(checkForUpdates()).rejects.toThrow(
      "check_for_updates 尚未接入真实 updater current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("更新设置遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "get_update_check_settings",
        source: "electron-empty-diagnostic",
        status: "degraded",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(getUpdateCheckSettings()).rejects.toThrow(
      "get_update_check_settings 尚未接入真实 updater current 通道，收到 electron-empty-diagnostic 诊断返回。",
    );
  });

  it("更新窗口命令遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "open_update_window",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(openUpdateWindow()).rejects.toThrow(
      "open_update_window 尚未接入真实 updater current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("应代理更新提醒动作", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(123)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(456)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(closeUpdateWindow()).resolves.toBeUndefined();
    await expect(openUpdateWindow()).resolves.toBeUndefined();
    await expect(dismissUpdateNotification("1.2.3")).resolves.toBe(123);
    await expect(
      recordUpdateNotificationAction("update_now"),
    ).resolves.toBeUndefined();
    await expect(remindUpdateLater(24)).resolves.toBe(456);
    await expect(skipUpdateVersion("1.2.3")).resolves.toBeUndefined();
    await expect(
      setUpdateCheckSettings({
        enabled: true,
        check_interval_hours: 24,
        show_notification: true,
        last_check_timestamp: 0,
        skipped_version: null,
        remind_later_until: null,
      }),
    ).resolves.toBeUndefined();
    await expect(testUpdateWindow()).resolves.toBeUndefined();
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "open_update_window");
  });

  it("打开更新提醒窗口时应传递更新按钮锚点矩形", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      openUpdateWindow({ x: 18.4, y: 816.2, width: 30.1, height: 30 }),
    ).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("open_update_window", {
      anchorRect: { x: 18, y: 816, width: 30, height: 30 },
    });
  });

  it("应代理更新安装会话命令和事件", async () => {
    const session = {
      sessionId: "session-1",
      stage: "downloading",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      downloadUrl: "https://example.com/release",
      downloadedBytes: 50,
      totalBytes: 100,
      percent: 0.5,
      message: "downloading",
      error: null,
      startedAt: 1,
      updatedAt: 2,
      completedAt: null,
      canCloseWindow: true,
      isActive: true,
    } as const;

    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, stage: "idle", isActive: false });

    await expect(startUpdateInstallSession()).resolves.toEqual(session);
    await expect(getUpdateInstallSession()).resolves.toEqual(
      expect.objectContaining({ stage: "idle" }),
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "start_update_install_session",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "get_update_install_session");
    expect(isUpdateInstallSessionActive(session)).toBe(true);
    expect(isUpdateInstallSessionActive({ ...session, stage: "failed" })).toBe(
      false,
    );

    const handler = vi.fn();
    await listenUpdateInstallSession(handler);
    expect(safeListen).toHaveBeenCalledWith(
      UPDATE_INSTALL_SESSION_EVENT,
      expect.any(Function),
    );

    const bridgeHandler = vi.mocked(safeListen).mock.calls.at(-1)?.[1];
    bridgeHandler?.({ payload: session });
    expect(handler).toHaveBeenCalledWith(session);
  });
});
