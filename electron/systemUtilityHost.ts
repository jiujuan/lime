/* global process */
import path from "node:path";
import { app, globalShortcut, shell } from "./electronRuntime";

type HostArgs = Record<string, unknown> | null | undefined;
type ConfigReader = () => Promise<Record<string, unknown>>;

type SystemUtilityHostOptions = {
  userDataDir: string;
  readConfig: ConfigReader;
};

const FALLBACK_VOICE_SHORTCUT = "CommandOrControl+Shift+V";
const RESERVED_SHORTCUT_REASON =
  "快捷键与系统输入法切换冲突，请换成包含字母或数字的组合，例如 CommandOrControl+Shift+V";
const RESERVED_SHORTCUTS = [
  ["commandorcontrol", "space"],
  ["control", "space"],
  ["command", "space"],
  ["super", "space"],
  ["alt", "space"],
  ["shift", "space"],
  ["control", "alt", "space"],
  ["commandorcontrol", "alt", "space"],
] as const;
const MODIFIER_TOKENS = new Set([
  "commandorcontrol",
  "command",
  "control",
  "alt",
  "shift",
  "super",
]);
const SPECIAL_SHORTCUT_KEYS = new Set([
  "space",
  "tab",
  "enter",
  "return",
  "escape",
  "esc",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
]);

export class SystemUtilityHost {
  readonly #userDataDir: string;
  readonly #readConfig: ConfigReader;

  constructor(options: SystemUtilityHostOptions) {
    this.#userDataDir = options.userDataDir;
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

  async getVoiceShortcutRuntimeStatus(): Promise<Record<string, unknown>> {
    const config = await this.#readConfig();
    const requestedShortcut =
      readString(
        readRecord(readRecord(config, "experimental"), "voice_input"),
        "shortcut",
      ) ?? FALLBACK_VOICE_SHORTCUT;
    let shortcut = requestedShortcut;
    let fnNote = "Fn 按住录音尚未接入；当前使用普通语音快捷键回退。";
    try {
      assertValidShortcut(shortcut);
    } catch {
      shortcut = FALLBACK_VOICE_SHORTCUT;
      fnNote =
        "语音快捷键配置不可解析，已使用默认普通语音快捷键回退；Fn 按住录音尚未接入。";
    }
    const shortcutRegistered = globalShortcut.isRegistered(shortcut);

    return {
      shortcut_registered: shortcutRegistered,
      registered_shortcut: shortcutRegistered ? shortcut : null,
      fn_supported: process.platform === "darwin",
      fn_registered: false,
      fn_fallback_shortcut: shortcut,
      fn_note: fnNote,
    };
  }

  validateShortcut(args: HostArgs): boolean {
    const request = readRequest(args);
    const shortcut =
      readString(request, "shortcutStr") ??
      readString(request, "shortcut_str") ??
      readString(request, "shortcut") ??
      readString(args, "shortcutStr") ??
      readString(args, "shortcut_str") ??
      readString(args, "shortcut");
    assertValidShortcut(shortcut);
    return true;
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

  getSkillPackageFileAssociationStatus(): Record<string, unknown> {
    return {
      platform: process.platform,
      extension: "skill",
      extensions: ["skill", "skills"],
      mimeType: "application/vnd.lime.skill+zip",
      appIdentifier: app.getName(),
      isDefault: false,
      canSetDefault: true,
      requiresUserConfirmation: true,
      currentHandler: null,
      settingsUrl: null,
      detail:
        "Electron Desktop Host 当前只能检查 .skill / .skills 文件关联状态；设置默认打开方式需要系统确认。",
      diagnostic: diagnosticMeta("get_skill_package_file_association_status"),
    };
  }

  setSkillPackageFileAssociationDefault(): Record<string, unknown> {
    const status = this.getSkillPackageFileAssociationStatus();
    return {
      changed: false,
      message:
        "Electron Desktop Host 当前不能静默修改系统文件关联，请在系统设置中确认 .skill / .skills 默认打开方式。",
      status,
      diagnostic: diagnosticMeta("set_skill_package_file_association_default"),
    };
  }

  getBrowserConnectorSettings(): Record<string, unknown> {
    const installRoot = path.join(this.#userDataDir, "browser-connectors");
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
    const installRoot = path.join(this.#userDataDir, "browser-connectors");
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

function assertValidShortcut(shortcut: string | null): void {
  if (!shortcut) {
    throw new Error("快捷键不能为空");
  }
  const tokens = normalizeShortcutTokens(shortcut);
  const hasModifier = tokens.some((token) => MODIFIER_TOKENS.has(token));
  const keyTokens = tokens.filter((token) => !MODIFIER_TOKENS.has(token));
  if (
    !hasModifier ||
    keyTokens.length !== 1 ||
    !isValidShortcutKey(keyTokens[0])
  ) {
    throw new Error(`无法解析快捷键 '${shortcut}'`);
  }
  if (isReservedShortcut(tokens)) {
    throw new Error(RESERVED_SHORTCUT_REASON);
  }
}

function normalizeShortcutTokens(shortcut: string): string[] {
  const tokens = shortcut
    .split("+")
    .map(normalizeShortcutToken)
    .filter(Boolean);
  return [...new Set(tokens)].sort();
}

function normalizeShortcutToken(token: string): string {
  const compact = token
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");

  switch (compact) {
    case "ctrl":
    case "control":
      return "control";
    case "cmd":
    case "command":
      return "command";
    case "cmdorctrl":
    case "cmdorcontrol":
    case "commandorcontrol":
      return "commandorcontrol";
    case "option":
    case "alt":
      return "alt";
    case "win":
    case "windows":
    case "meta":
    case "super":
      return "super";
    case "spacebar":
    case "space":
      return "space";
    default:
      return compact;
  }
}

function isValidShortcutKey(token: string): boolean {
  if (/^[a-z0-9]$/.test(token)) {
    return true;
  }
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true;
  }
  return SPECIAL_SHORTCUT_KEYS.has(token);
}

function isReservedShortcut(tokens: string[]): boolean {
  return RESERVED_SHORTCUTS.some(
    (candidate) =>
      candidate.length === tokens.length &&
      candidate.every((token) => tokens.includes(token)),
  );
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
