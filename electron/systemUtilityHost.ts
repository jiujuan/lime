import path from "node:path";
import { app, shell } from "./electronRuntime";

type HostArgs = Record<string, unknown> | null | undefined;
type ConfigReader = () => Promise<Record<string, unknown>>;

type SystemUtilityHostOptions = {
  appDataRoot: string;
  readConfig: ConfigReader;
};

export class SystemUtilityHost {
  readonly #appDataRoot: string;
  readonly #readConfig: ConfigReader;

  constructor(options: SystemUtilityHostOptions) {
    this.#appDataRoot = options.appDataRoot;
    this.#readConfig = options.readConfig;
  }

  async openExternalUrl(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const url = readRequiredString(request, "url");
    await shell.openExternal(normalizeExternalUrl(url));
    return {};
  }

  async openSystemSettingsUrl(args: HostArgs): Promise<Record<string, never>> {
    const request = readRequest(args);
    const url = readRequiredString(request, "url");
    await shell.openExternal(normalizeSystemSettingsUrl(url));
    return {};
  }

  async getEnvironmentPreview(): Promise<Record<string, unknown>> {
    const config = await this.#readConfig();
    const serverConfig = toRecord(config.server);
    const apiKey = readString(serverConfig, "api_key") ?? "";
    const apiBase =
      `http://${readString(serverConfig, "host") ?? "127.0.0.1"}:` +
      `${readNumber(serverConfig, "port") ?? 8787}`;
    const entries = [
      {
        key: "LIME_API_BASE",
        value: apiBase,
        maskedValue: apiBase,
        source: "config",
        sourceLabel: "Electron Desktop Host",
        sensitive: false,
        overriddenSources: [],
      },
      {
        key: "LIME_API_KEY",
        value: apiKey,
        maskedValue: apiKey ? "********" : "",
        source: "config",
        sourceLabel: "Electron Desktop Host",
        sensitive: true,
        overriddenSources: [],
      },
    ];
    return {
      shellImport: {
        enabled: false,
        status: "disabled",
        message: "Electron current 暂未接入 shell 环境导入预览。",
        importedCount: 0,
        durationMs: null,
      },
      entries,
    };
  }

  getBrowserConnectorSettings(): Record<string, unknown> {
    const installRoot = path.join(this.#appDataRoot, "connectors", "browser");
    return {
      enabled: true,
      install_root_dir: installRoot,
      install_dir: path.join(installRoot, "Lime Browser Connector"),
      browser_action_capabilities: [
        { key: "read_page", label: "读取页面", enabled: true },
        { key: "click", label: "点击", enabled: true },
        { key: "type", label: "输入", enabled: true },
        { key: "scroll_page", label: "滚动页面", enabled: true },
      ],
      system_connectors: [],
      diagnostic: diagnosticMeta("get_browser_connector_settings_cmd"),
    };
  }

  getBrowserConnectorInstallStatus(): Record<string, unknown> {
    const installRoot = path.join(this.#appDataRoot, "connectors", "browser");
    return {
      status: "not_installed",
      install_root_dir: installRoot,
      install_dir: path.join(installRoot, "Lime Browser Connector"),
      bundled_name: "Lime Browser Connector",
      bundled_version: app.getVersion(),
      installed_name: null,
      installed_version: null,
      message: "尚未导出浏览器连接器",
      diagnostic: diagnosticMeta("get_browser_connector_install_status_cmd"),
    };
  }

  getChromeProfileSessions(): Array<Record<string, unknown>> {
    return emptyDiagnosticList("get_chrome_profile_sessions");
  }

  getChromeBridgeEndpointInfo(): Record<string, unknown> {
    return {
      server_running: false,
      host: "127.0.0.1",
      port: 8999,
      observer_ws_url: "ws://127.0.0.1:8999/lime-chrome-observer",
      control_ws_url: "ws://127.0.0.1:8999/lime-chrome-control",
      bridge_key: "proxy_cast",
      diagnostic: diagnosticMeta("get_chrome_bridge_endpoint_info"),
    };
  }

  getChromeBridgeStatus(): Record<string, unknown> {
    return {
      observer_count: 0,
      control_count: 0,
      pending_command_count: 0,
      observers: [],
      controls: [],
      pending_commands: [],
      diagnostic: diagnosticMeta("get_chrome_bridge_status"),
    };
  }

  getBrowserBackendPolicy(): Record<string, unknown> {
    return {
      priority: ["lime_extension_bridge", "cdp_direct"],
      auto_fallback: false,
      diagnostic: diagnosticMeta("get_browser_backend_policy"),
    };
  }

  getBrowserBackendsStatus(): Record<string, unknown> {
    const policy = this.getBrowserBackendPolicy();
    return {
      policy,
      bridge_observer_count: 0,
      bridge_control_count: 0,
      running_profile_count: 0,
      cdp_alive_profile_count: 0,
      agent_native_host_supported: false,
      agent_native_host_configured: false,
      backends: [
        {
          backend: "lime_extension_bridge",
          available: false,
          reason: "浏览器连接器尚未连接",
          capabilities: [],
        },
        {
          backend: "cdp_direct",
          available: false,
          reason: "当前没有运行中的 Chrome Profile 会话",
          capabilities: [],
        },
      ],
      diagnostic: diagnosticMeta("get_browser_backends_status"),
    };
  }
}

function diagnosticMeta(command: string): Record<string, unknown> {
  return {
    source: "electron-host-diagnostic",
    command,
    status: "degraded",
    appServerCurrent: false,
  };
}

function emptyDiagnosticList(command: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  Object.defineProperty(result, "__diagnostic", {
    value: diagnosticMeta(command),
    enumerable: false,
  });
  return result;
}

function normalizeExternalUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch (error) {
    throw new Error(
      `外部链接格式无效: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("外部链接只支持 http/https 地址");
  }
  return parsed.toString();
}

function normalizeSystemSettingsUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch (error) {
    throw new Error(
      `系统设置链接格式无效: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    parsed.protocol !== "x-apple.systempreferences:" &&
    parsed.protocol !== "ms-settings:"
  ) {
    throw new Error(
      "系统设置链接只支持 x-apple.systempreferences 或 ms-settings scheme",
    );
  }
  return parsed.toString();
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const next = record[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : null;
}

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readString(value: unknown, key: string): string | null {
  const record = toRecord(value);
  const next = record?.[key];
  if (typeof next !== "string") {
    return null;
  }
  const trimmed = next.trim();
  return trimmed || null;
}

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
