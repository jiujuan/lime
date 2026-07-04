import { beforeEach, describe, expect, it, vi } from "vitest";

const { appState, checkForUpdatesMock, quitAndInstallMock, setFeedURLMock } =
  vi.hoisted(() => ({
    appState: {
      isPackaged: false,
    },
    checkForUpdatesMock: vi.fn(),
    quitAndInstallMock: vi.fn(),
    setFeedURLMock: vi.fn(),
  }));

vi.mock("./electronRuntime", () => ({
  app: {
    getVersion: () => "1.60.0",
    get isPackaged() {
      return appState.isPackaged;
    },
  },
  autoUpdater: {
    checkForUpdates: checkForUpdatesMock,
    on: vi.fn(),
    once: vi.fn(),
    quitAndInstall: quitAndInstallMock,
    removeListener: vi.fn(),
    setFeedURL: setFeedURLMock,
  },
}));

import { ElectronUpdateHost } from "./updateHost";

describe("ElectronUpdateHost", () => {
  beforeEach(() => {
    appState.isPackaged = false;
    delete process.env.LIME_ELECTRON_ENABLE_DEV_UPDATER;
    delete process.env.LIME_ELECTRON_E2E;
    delete process.env.LIME_ELECTRON_SMOKE;
    delete process.env.VITE_DEV_SERVER_URL;
    checkForUpdatesMock.mockReset();
    quitAndInstallMock.mockReset();
    setFeedURLMock.mockReset();
  });

  it("开发 renderer 模式下即使宿主是 .app 也不启用 updater", async () => {
    appState.isPackaged = true;
    process.env.VITE_DEV_SERVER_URL = "http://127.0.0.1:1420";
    const host = new ElectronUpdateHost(vi.fn());

    await expect(host.invoke("check_for_updates")).resolves.toEqual({
      current: "1.60.0",
      hasUpdate: false,
      error: "Electron updater is only enabled for packaged builds.",
    });

    expect(checkForUpdatesMock).not.toHaveBeenCalled();
    expect(setFeedURLMock).not.toHaveBeenCalled();
  });

  it("updater 不可用时自动检查更新应返回本地版本", async () => {
    const host = new ElectronUpdateHost(vi.fn());

    await expect(
      host.invoke("check_for_updates", { automatic: true }),
    ).resolves.toEqual(
      expect.objectContaining({
        current: "1.60.0",
        hasUpdate: false,
        error: null,
      }),
    );

    expect(checkForUpdatesMock).not.toHaveBeenCalled();
    expect(setFeedURLMock).not.toHaveBeenCalled();
  });

  it("Electron GUI smoke 自动化会话不应触发真实 updater", async () => {
    appState.isPackaged = true;
    process.env.LIME_ELECTRON_SMOKE = "1";
    process.env.LIME_ELECTRON_E2E = "1";
    const host = new ElectronUpdateHost(vi.fn());

    await expect(
      host.invoke("check_for_updates", { automatic: true }),
    ).resolves.toEqual(
      expect.objectContaining({
        current: "1.60.0",
        hasUpdate: false,
        error: null,
      }),
    );

    expect(checkForUpdatesMock).not.toHaveBeenCalled();
    expect(setFeedURLMock).not.toHaveBeenCalled();
  });

  it("本地 Lime-dev.app 不应启用真实 updater", async () => {
    const originalExecPath = process.execPath;
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value:
        "/Users/example/project/.lime/electron-dev-host/Lime-dev.app/Contents/MacOS/Lime",
    });
    try {
      appState.isPackaged = true;
      const host = new ElectronUpdateHost(vi.fn());

      await expect(host.invoke("check_for_updates")).resolves.toEqual({
        current: "1.60.0",
        hasUpdate: false,
        error: "Electron updater is only enabled for packaged builds.",
      });

      expect(checkForUpdatesMock).not.toHaveBeenCalled();
      expect(setFeedURLMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        value: originalExecPath,
      });
    }
  });

  it("open_update_window 应把按钮锚点矩形传给更新窗口控制器", async () => {
    const open = vi.fn();
    const host = new ElectronUpdateHost(vi.fn(), {
      open,
      close: vi.fn(),
    });

    await expect(
      host.invoke("open_update_window", {
        anchorRect: { x: 18, y: 816, width: 30, height: 30 },
      }),
    ).resolves.toBeNull();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        current: "1.60.0",
        anchorRect: { x: 18, y: 816, width: 30, height: 30 },
      }),
    );
  });
});
