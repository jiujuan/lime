/* global process */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { globalShortcutIsRegisteredMock, openExternalMock } = vi.hoisted(() => ({
  globalShortcutIsRegisteredMock: vi.fn((_shortcut: string) => false),
  openExternalMock: vi.fn(),
}));

vi.mock("./electronRuntime", () => ({
  app: {
    getName: () => "Lime",
    getVersion: () => "0.0.0-test",
  },
  globalShortcut: {
    isRegistered: globalShortcutIsRegisteredMock,
  },
  shell: {
    openExternal: openExternalMock,
  },
}));

import { SystemUtilityHost } from "./systemUtilityHost";

const tempDirs: string[] = [];

async function createTempUserDataDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lime-system-utility-"));
  tempDirs.push(dir);
  return dir;
}

function createHost(
  userDataDir: string,
  config: Record<string, unknown> = {},
): SystemUtilityHost {
  return new SystemUtilityHost({
    userDataDir,
    readConfig: async () => config,
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  globalShortcutIsRegisteredMock.mockReturnValue(false);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("SystemUtilityHost", () => {
  it("openExternalUrl 只允许 http/https 并通过系统浏览器打开", async () => {
    const host = createHost(await createTempUserDataDir());
    openExternalMock.mockResolvedValueOnce(undefined);

    await expect(
      host.openExternalUrl({ url: " https://user.limeai.run/login " }),
    ).resolves.toEqual({});
    await expect(
      host.openExternalUrl({ url: "file:///tmp/token" }),
    ).rejects.toThrow("外部链接只支持 http/https 地址");

    expect(openExternalMock).toHaveBeenCalledTimes(1);
    expect(openExternalMock).toHaveBeenCalledWith(
      "https://user.limeai.run/login",
    );
  });

  it("openSystemSettingsUrl 只允许系统设置 scheme", async () => {
    const host = createHost(await createTempUserDataDir());
    openExternalMock.mockResolvedValue(undefined);

    await expect(
      host.openSystemSettingsUrl({
        url: " x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility ",
      }),
    ).resolves.toEqual({});
    await expect(
      host.openSystemSettingsUrl({
        url: "ms-settings:clipboard",
      }),
    ).resolves.toEqual({});
    await expect(
      host.openSystemSettingsUrl({
        url: "https://example.com/settings",
      }),
    ).rejects.toThrow(
      "系统设置链接只支持 x-apple.systempreferences 或 ms-settings scheme",
    );

    expect(openExternalMock).toHaveBeenCalledTimes(2);
    expect(openExternalMock).toHaveBeenNthCalledWith(
      1,
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
    expect(openExternalMock).toHaveBeenNthCalledWith(
      2,
      "ms-settings:clipboard",
    );
  });

  it("getVoiceShortcutRuntimeStatus 读取当前语音快捷键注册状态", async () => {
    const host = createHost(await createTempUserDataDir(), {
      experimental: {
        voice_input: {
          shortcut: "Alt+F8",
        },
      },
    });
    globalShortcutIsRegisteredMock.mockImplementation(
      (shortcut: string) => shortcut === "Alt+F8",
    );

    await expect(host.getVoiceShortcutRuntimeStatus()).resolves.toEqual({
      shortcut_registered: true,
      registered_shortcut: "Alt+F8",
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: "Alt+F8",
      fn_note: "Fn 按住录音尚未接入；当前使用普通语音快捷键回退。",
    });
    expect(globalShortcutIsRegisteredMock).toHaveBeenCalledWith("Alt+F8");
  });

  it("getVoiceShortcutRuntimeStatus 对无效配置回退默认快捷键", async () => {
    const host = createHost(await createTempUserDataDir(), {
      experimental: {
        voice_input: {
          shortcut: "InvalidKey",
        },
      },
    });

    await expect(host.getVoiceShortcutRuntimeStatus()).resolves.toEqual({
      shortcut_registered: false,
      registered_shortcut: null,
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: "CommandOrControl+Shift+V",
      fn_note:
        "语音快捷键配置不可解析，已使用默认普通语音快捷键回退；Fn 按住录音尚未接入。",
    });
    expect(globalShortcutIsRegisteredMock).toHaveBeenCalledWith(
      "CommandOrControl+Shift+V",
    );
  });

  it("validateShortcut 校验全局快捷键并拒绝不可解析值", async () => {
    const host = createHost(await createTempUserDataDir());

    expect(
      host.validateShortcut({ shortcutStr: "CommandOrControl+Shift+V" }),
    ).toBe(true);
    expect(host.validateShortcut({ request: { shortcut_str: "Alt+F4" } })).toBe(
      true,
    );
    expect(() => host.validateShortcut({ shortcutStr: "" })).toThrow(
      "快捷键不能为空",
    );
    expect(() => host.validateShortcut({ shortcutStr: "InvalidKey" })).toThrow(
      "无法解析快捷键 'InvalidKey'",
    );
    expect(() =>
      host.validateShortcut({ shortcutStr: "CommandOrControl+Space" }),
    ).toThrow("输入法切换");
  });

  it("getEnvironmentPreview 返回 current 环境预览且不暴露 diagnostic facade", async () => {
    const host = createHost(await createTempUserDataDir(), {
      server: {
        host: "127.0.0.1",
        port: 8910,
        api_key: "secret-key",
      },
    });

    const result = await host.getEnvironmentPreview();
    const shellImport = result.shellImport as Record<string, unknown>;

    expect(result).not.toHaveProperty("diagnostic");
    expect(shellImport).not.toHaveProperty("diagnostic");
    expect(shellImport).toEqual(
      expect.objectContaining({
        enabled: false,
        status: "disabled",
        importedCount: 0,
        durationMs: null,
      }),
    );
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "LIME_API_BASE",
          value: "http://127.0.0.1:8910",
          maskedValue: "http://127.0.0.1:8910",
          sensitive: false,
        }),
        expect.objectContaining({
          key: "LIME_API_KEY",
          value: "secret-key",
          maskedValue: "********",
          sensitive: true,
        }),
      ]),
    );
  });

  it("文件关联与浏览器诊断占位保持 degraded diagnostic 形态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    expect(host.getSkillPackageFileAssociationStatus()).toEqual(
      expect.objectContaining({
        extension: "skill",
        appIdentifier: "Lime",
        diagnostic: expect.objectContaining({
          command: "get_skill_package_file_association_status",
          status: "degraded",
        }),
      }),
    );
    expect(host.setSkillPackageFileAssociationDefault()).toEqual(
      expect.objectContaining({
        changed: false,
        status: expect.objectContaining({ extension: "skill" }),
        diagnostic: expect.objectContaining({
          command: "set_skill_package_file_association_default",
        }),
      }),
    );
    expect(host.getBrowserConnectorSettings()).toEqual(
      expect.objectContaining({
        enabled: true,
        install_root_dir: path.join(userDataDir, "browser-connectors"),
        diagnostic: expect.objectContaining({
          command: "get_browser_connector_settings_cmd",
        }),
      }),
    );
    expect(host.getBrowserConnectorInstallStatus()).toEqual(
      expect.objectContaining({
        status: "not_installed",
        bundled_version: "0.0.0-test",
        diagnostic: expect.objectContaining({
          command: "get_browser_connector_install_status_cmd",
        }),
      }),
    );
    expect(host.getChromeBridgeEndpointInfo()).toEqual(
      expect.objectContaining({
        server_running: false,
        diagnostic: expect.objectContaining({
          command: "get_chrome_bridge_endpoint_info",
        }),
      }),
    );
    expect(host.getBrowserBackendsStatus()).toEqual(
      expect.objectContaining({
        policy: expect.objectContaining({
          priority: ["lime_extension_bridge", "cdp_direct"],
        }),
        backends: expect.arrayContaining([
          expect.objectContaining({
            backend: "lime_extension_bridge",
            available: false,
          }),
        ]),
        diagnostic: expect.objectContaining({
          command: "get_browser_backends_status",
        }),
      }),
    );

    const profileSessions = host.getChromeProfileSessions();
    expect(profileSessions).toEqual([]);
    expect(
      Object.getOwnPropertyDescriptor(profileSessions, "__diagnostic"),
    ).toEqual(
      expect.objectContaining({
        enumerable: false,
        value: expect.objectContaining({
          command: "get_chrome_profile_sessions",
          status: "degraded",
        }),
      }),
    );
  });
});
