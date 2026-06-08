import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";

import {
  archiveBrowserEnvironmentPreset,
  archiveBrowserProfile,
  browserExecuteAction,
  chromeBridgeExecuteCommand,
  closeBrowserRuntimeDebuggerWindow,
  closeCdpSession,
  closeChromeProfileSession,
  disconnectBrowserConnectorSession,
  getBrowserBackendPolicy,
  getBrowserBackendsStatus,
  getBrowserConnectorInstallStatus,
  getBrowserConnectorSettings,
  getBrowserActionAuditLogs,
  getBrowserEventBuffer,
  getBrowserRuntimeAuditLogs,
  getBrowserSessionState,
  getChromeBridgeEndpointInfo,
  getChromeBridgeStatus,
  getChromeProfileSessions,
  installBrowserConnectorExtension,
  launchBrowserSession,
  listBrowserEnvironmentPresets,
  listBrowserProfiles,
  listCdpTargets,
  openBrowserRuntimeDebuggerWindow,
  openChromeProfileWindow,
  openCdpSession,
  openBrowserConnectorGuideWindow,
  openBrowserExtensionsPage,
  openBrowserRemoteDebuggingPage,
  releaseBrowserSession,
  restoreBrowserEnvironmentPreset,
  restoreBrowserProfile,
  resumeBrowserSession,
  saveBrowserEnvironmentPreset,
  saveBrowserProfile,
  setBrowserActionCapabilityEnabled,
  setBrowserBackendPolicy,
  setBrowserConnectorEnabled,
  setBrowserConnectorInstallRoot,
  setSystemConnectorEnabled,
  startBrowserStream,
  stopBrowserStream,
  takeOverBrowserSession,
} from "./webview-api";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

function createDiagnosticList(command: string): unknown[] {
  const result: unknown[] = [];
  Object.defineProperty(result, "__diagnostic", {
    value: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
    enumerable: false,
  });
  return result;
}

function createDiagnosticObject(command: string): Record<string, unknown> {
  return {
    diagnostic: {
      source: "electron-host-diagnostic",
      command,
      status: "degraded",
    },
  };
}

describe("webview-api Browser bridge diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Chrome profile sessions 收到 Electron empty diagnostic list 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(
      createDiagnosticList("get_chrome_profile_sessions"),
    );

    await expect(getChromeProfileSessions()).rejects.toThrow(
      "get_chrome_profile_sessions 尚未接入真实 Browser bridge current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("Browser bridge 对象级诊断返回应 fail closed", async () => {
    const cases: Array<[string, () => Promise<unknown>, string]> = [
      [
        "get_chrome_bridge_endpoint_info",
        getChromeBridgeEndpointInfo,
        "真实 Browser bridge current 通道",
      ],
      [
        "get_chrome_bridge_status",
        getChromeBridgeStatus,
        "真实 Browser bridge current 通道",
      ],
      [
        "get_browser_backend_policy",
        getBrowserBackendPolicy,
        "真实 Browser bridge current 通道",
      ],
      [
        "get_browser_backends_status",
        getBrowserBackendsStatus,
        "真实 Browser bridge current 通道",
      ],
      [
        "get_browser_connector_settings_cmd",
        getBrowserConnectorSettings,
        "真实 Browser connector current 通道",
      ],
      [
        "get_browser_connector_install_status_cmd",
        getBrowserConnectorInstallStatus,
        "真实 Browser connector current 通道",
      ],
    ];

    for (const [command, action, currentSurface] of cases) {
      vi.mocked(safeInvoke).mockResolvedValueOnce(
        createDiagnosticObject(command),
      );

      await expect(action()).rejects.toThrow(
        `${command} 尚未接入${currentSurface}，收到 electron-host-diagnostic 诊断返回。`,
      );
    }
  });

  it("Browser bridge 真实 current 返回不应被诊断检测拦截", async () => {
    const endpointInfo = {
      server_running: true,
      host: "127.0.0.1",
      port: 32123,
      observer_ws_url: "ws://127.0.0.1:32123/observer",
      control_ws_url: "ws://127.0.0.1:32123/control",
      bridge_key: "bridge-key",
    };
    const bridgeStatus = {
      endpoint: endpointInfo,
      observers: [],
      controls: [],
      pending_commands: [],
    };
    const backendPolicy = {
      preferred_backend: "existing_session",
      fallback_enabled: false,
      updated_at: "2026-06-08T00:00:00.000Z",
    };
    const backendsStatus = {
      policy: backendPolicy,
      backends: [],
      updated_at: "2026-06-08T00:00:00.000Z",
    };
    const connectorSettings = {
      enabled: true,
      install_root_dir: "/tmp/browser-connectors",
      install_dir: "/tmp/browser-connectors/Lime Browser Connector",
      system_connectors: [],
      browser_action_capabilities: [],
    };
    const connectorInstallStatus = {
      status: "not_installed" as const,
      install_root_dir: "/tmp/browser-connectors",
      install_dir: "/tmp/browser-connectors/Lime Browser Connector",
      bundled_name: "Lime Browser Connector",
      bundled_version: "1.60.0",
      installed_name: null,
      installed_version: null,
      message: "尚未导出浏览器连接器",
    };

    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(endpointInfo)
      .mockResolvedValueOnce(bridgeStatus)
      .mockResolvedValueOnce(backendPolicy)
      .mockResolvedValueOnce(backendsStatus)
      .mockResolvedValueOnce(connectorSettings)
      .mockResolvedValueOnce(connectorInstallStatus);

    await expect(getChromeProfileSessions()).resolves.toEqual([]);
    await expect(getChromeBridgeEndpointInfo()).resolves.toEqual(endpointInfo);
    await expect(getChromeBridgeStatus()).resolves.toEqual(bridgeStatus);
    await expect(getBrowserBackendPolicy()).resolves.toEqual(backendPolicy);
    await expect(getBrowserBackendsStatus()).resolves.toEqual(backendsStatus);
    await expect(getBrowserConnectorSettings()).resolves.toEqual(
      connectorSettings,
    );
    await expect(getBrowserConnectorInstallStatus()).resolves.toEqual(
      connectorInstallStatus,
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_chrome_profile_sessions");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "get_chrome_bridge_endpoint_info",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "get_chrome_bridge_status");
    expect(safeInvoke).toHaveBeenNthCalledWith(4, "get_browser_backend_policy");
    expect(safeInvoke).toHaveBeenNthCalledWith(5, "get_browser_backends_status");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      6,
      "get_browser_connector_settings_cmd",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      7,
      "get_browser_connector_install_status_cmd",
    );
  });

  it("Browser connector 写链未接 current 前应 fail closed 且不调用 legacy command", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      [
        "set_browser_connector_install_root_cmd",
        () => setBrowserConnectorInstallRoot("/tmp/browser-connectors"),
      ],
      [
        "set_browser_connector_enabled_cmd",
        () => setBrowserConnectorEnabled(true),
      ],
      [
        "set_system_connector_enabled_cmd",
        () => setSystemConnectorEnabled({ id: "calendar", enabled: true }),
      ],
      [
        "set_browser_action_capability_enabled_cmd",
        () => setBrowserActionCapabilityEnabled({ key: "read", enabled: true }),
      ],
      [
        "install_browser_connector_extension_cmd",
        () =>
          installBrowserConnectorExtension({
            install_root_dir: "/tmp/browser-connectors",
          }),
      ],
      ["open_browser_extensions_page_cmd", openBrowserExtensionsPage],
      [
        "open_browser_remote_debugging_page_cmd",
        openBrowserRemoteDebuggingPage,
      ],
      [
        "open_browser_connector_guide_window",
        () => openBrowserConnectorGuideWindow({ mode: "extension" }),
      ],
    ];

    for (const [command, action] of cases) {
      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 Browser connector current 通道`,
      );
    }

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Browser profile / environment preset 未接 current 前应 fail closed 且不调用 legacy command", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      [
        "list_browser_profiles_cmd",
        () => listBrowserProfiles({ include_archived: true }),
      ],
      [
        "save_browser_profile_cmd",
        () =>
          saveBrowserProfile({
            id: "profile-1",
            profile_key: "google",
            name: "Profile",
            launch_url: "https://example.com",
          }),
      ],
      ["archive_browser_profile_cmd", () => archiveBrowserProfile("profile-1")],
      ["restore_browser_profile_cmd", () => restoreBrowserProfile("profile-1")],
      [
        "list_browser_environment_presets_cmd",
        () => listBrowserEnvironmentPresets({ include_archived: true }),
      ],
      [
        "save_browser_environment_preset_cmd",
        () =>
          saveBrowserEnvironmentPreset({
            id: "preset-1",
            name: "Preset",
            description: "Preset",
            proxy_server: "http://127.0.0.1:8080",
          }),
      ],
      [
        "archive_browser_environment_preset_cmd",
        () => archiveBrowserEnvironmentPreset("preset-1"),
      ],
      [
        "restore_browser_environment_preset_cmd",
        () => restoreBrowserEnvironmentPreset("preset-1"),
      ],
    ];

    for (const [command, action] of cases) {
      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 Browser runtime current 通道`,
      );
    }

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("Browser Runtime / CDP no-host 命令未接 current 前应 fail closed 且不调用 legacy command", async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      [
        "open_chrome_profile_window",
        () =>
          openChromeProfileWindow({
            profile_key: "google",
            url: "https://example.com",
          }),
      ],
      [
        "close_chrome_profile_session",
        () => closeChromeProfileSession("google"),
      ],
      [
        "disconnect_browser_connector_session",
        () => disconnectBrowserConnectorSession({ profile_key: "google" }),
      ],
      [
        "chrome_bridge_execute_command",
        () =>
          chromeBridgeExecuteCommand({
            profile_key: "google",
            command: "read_page",
          }),
      ],
      [
        "set_browser_backend_policy",
        () =>
          setBrowserBackendPolicy({
            auto_fallback: false,
            priority: ["cdp_direct"],
          }),
      ],
      ["list_cdp_targets", () => listCdpTargets("google")],
      [
        "open_cdp_session",
        () => openCdpSession({ profile_key: "google", target_id: "target-1" }),
      ],
      ["close_cdp_session", () => closeCdpSession("session-1")],
      [
        "start_browser_stream",
        () => startBrowserStream({ session_id: "session-1", mode: "both" }),
      ],
      ["stop_browser_stream", () => stopBrowserStream("session-1")],
      ["get_browser_session_state", () => getBrowserSessionState("session-1")],
      [
        "take_over_browser_session",
        () =>
          takeOverBrowserSession({
            session_id: "session-1",
            human_reason: "debug",
          }),
      ],
      [
        "release_browser_session",
        () =>
          releaseBrowserSession({
            session_id: "session-1",
            human_reason: "done",
          }),
      ],
      [
        "resume_browser_session",
        () =>
          resumeBrowserSession({
            session_id: "session-1",
            human_reason: "continue",
          }),
      ],
      [
        "get_browser_event_buffer",
        () => getBrowserEventBuffer({ session_id: "session-1", cursor: 0 }),
      ],
      [
        "open_browser_runtime_debugger_window",
        () => openBrowserRuntimeDebuggerWindow({ session_id: "session-1" }),
      ],
      [
        "close_browser_runtime_debugger_window",
        closeBrowserRuntimeDebuggerWindow,
      ],
      [
        "launch_browser_session",
        () =>
          launchBrowserSession({
            profile_key: "google",
            url: "https://example.com",
          }),
      ],
      [
        "browser_execute_action",
        () =>
          browserExecuteAction({
            args: { session_id: "session-1" },
            action: "read_page",
          }),
      ],
      ["get_browser_action_audit_logs", () => getBrowserRuntimeAuditLogs(10)],
      ["get_browser_action_audit_logs", () => getBrowserActionAuditLogs(10)],
    ];

    for (const [command, action] of cases) {
      await expect(action()).rejects.toThrow(
        `${command} 尚未接入真实 Browser runtime current 通道`,
      );
    }

    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
