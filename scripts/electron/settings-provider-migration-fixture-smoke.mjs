#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";

const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "settings-provider-migration-fixture",
  ),
  prefix: "settings-provider-migration-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:settings-provider-migration-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const CUSTOM_PROVIDER_NAME = "Migration Fixture Provider";
const CUSTOM_PROVIDER_TYPE = "openai";
const CUSTOM_PROVIDER_HOST = "https://migration-fixture.invalid/v1";
const CUSTOM_MODEL_ID = "migration-fixture-model";
const PRODUCT_DB_MIGRATION_CLEANUP_POLICY = "drop-tables";
const UI_SELECTED_PROVIDER_KEY = "selected_provider";
const UI_COLLAPSED_GROUPS_KEY = "collapsed_groups";
const LEGACY_PROVIDER_COMMANDS = [
  "get_api_key_providers",
  "get_system_provider_catalog",
  "get_api_key_provider",
  "read_api_key_provider_config",
  "add_custom_api_key_provider",
  "create_api_key_provider",
  "update_api_key_provider",
  "delete_custom_api_key_provider",
  "delete_api_key_provider",
  "update_provider_sort_orders",
  "update_api_key_provider_sort_orders",
  "export_api_key_providers",
  "export_api_key_provider_config",
  "import_api_key_providers",
  "import_api_key_provider_config",
  "test_api_key_provider_connection",
  ["test_api_key_provider", "chat"].join("_"),
  "fetch_provider_models_auto",
  "add_api_key",
  "create_api_key_provider_key",
  "delete_api_key",
  "delete_api_key_provider_key",
  "toggle_api_key",
  "update_api_key_alias",
  "update_api_key_provider_key",
  "get_next_api_key",
  "next_api_key_provider_key",
  "record_api_key_usage",
  "record_api_key_provider_key_usage",
  "record_api_key_error",
  "record_api_key_provider_key_error",
  "get_provider_ui_state",
  "read_api_key_provider_ui_state",
  "set_provider_ui_state",
  "write_api_key_provider_ui_state",
];
const SEED_REQUIRED_METHODS = [
  "initialize",
  "modelProvider/create",
  "modelProvider/update",
  "modelProviderKey/create",
  "modelProviderUiState/write",
  "modelProvider/list",
  "modelProviderUiState/read",
];
const ELECTRON_REQUIRED_METHODS = [
  "modelProvider/list",
  "modelProviderUiState/read",
];

function printHelp() {
  console.log(`
Settings Provider Migration Electron Fixture Smoke

用途:
  在临时 Electron userData 根目录先创建旧 Product DB，再启动真实 Electron
  Desktop Host。Electron Host 会传入 userData/app-server 作为 App Server data-dir，
  本脚本验证旧 userData/lime.db 里的自定义 Provider、API Key 和 UI state 会迁移到
  userData/app-server/lime.db，并能被设置页 AI 服务商 GUI 读取。

边界:
  使用真实 Electron preload bridge 与 App Server JSON-RPC current method；
  APP_SERVER_BACKEND_MODE=unavailable，不调用正式模型后端，不使用 renderer mock、
  App Server mock backend 或旧 Provider facade 命令作为成功证据。

用法:
  node scripts/electron/settings-provider-migration-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     轮询间隔，默认 250
  --keep-temp            保留临时目录便于调试
  -h, --help             显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--app-url" && next) {
      options.appUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      options.prefix = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && next) {
      options.intervalMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStage(stage) {
  console.log(`${LOG_PREFIX} stage=${stage}`);
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${
        sanitized.length - 2_000
      } chars]`
    : sanitized;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 8) {
    return "[truncated-depth]";
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 160)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "settings-provider-migration-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const oldProductDataDir = electronUserDataDir;
  const appServerDataDir = path.join(electronUserDataDir, "app-server");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    oldProductDataDir,
    appServerDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    home,
    electronUserDataDir,
    oldProductDataDir,
    appServerDataDir,
    oldProductDbPath: path.join(oldProductDataDir, "lime.db"),
    migratedProductDbPath: path.join(appServerDataDir, "lime.db"),
    migrationMarkerPath: path.join(appServerDataDir, ".migration_completed"),
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
}

function parseJsonRpcLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function startJsonRpcProcess({ appServerBinary, runtimeEnv, dataDir }) {
  const child = spawn(
    appServerBinary,
    ["--stdio", "--backend", "unavailable", "--data-dir", dataDir],
    {
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        APP_SERVER_BACKEND_MODE: "unavailable",
        APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP: "retain",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stderr = [];
  const messages = [];
  const pending = new Map();
  let nextId = 1;

  child.stderr.on("data", (chunk) => {
    stderr.push(sanitizeText(chunk.toString("utf8")));
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const message = parseJsonRpcLine(line);
    if (!message) {
      messages.push({ raw: sanitizeText(line), parseError: true });
      return;
    }
    messages.push(message);
    const id = message.id;
    if (id === undefined || id === null) {
      return;
    }
    const key = String(id);
    const waiter = pending.get(key);
    if (!waiter) {
      return;
    }
    pending.delete(key);
    clearTimeout(waiter.timeout);
    if (message.error) {
      waiter.reject(
        new Error(
          `${waiter.method} returned JSON-RPC error: ${message.error.message}`,
        ),
      );
    } else {
      waiter.resolve(message);
    }
  });

  child.on("exit", (code, signal) => {
    const error = new Error(
      `app-server exited before pending requests settled: code=${code} signal=${signal}`,
    );
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    pending.clear();
  });

  function request(method, params = {}, timeoutMs = 15_000) {
    const id = `settings-provider-migration-${nextId++}`;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    messages.push({ direction: "request", ...payload });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(String(id));
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(String(id), { method, timeout, resolve, reject });
      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (error) {
          clearTimeout(timeout);
          pending.delete(String(id));
          reject(error);
        }
      });
    });
  }

  function notify(method, params = {}) {
    const payload = { jsonrpc: "2.0", method, params };
    messages.push({ direction: "notification", ...payload });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async function close() {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("closing app-server stdio process"));
    }
    pending.clear();
    child.stdin.end();
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return { child, request, notify, close, stderr, messages };
}

async function seedOldProductDatabase({
  appServerBinary,
  runtimeEnv,
  options,
}) {
  const rpc = startJsonRpcProcess({
    appServerBinary,
    runtimeEnv,
    dataDir: runtimeEnv.oldProductDataDir,
  });

  try {
    const initialize = await rpc.request(
      "initialize",
      {
        clientInfo: {
          name: "settings-provider-migration-fixture-seed",
          version: "1.0.0",
        },
        capabilities: {},
      },
      Math.min(options.timeoutMs, 20_000),
    );
    rpc.notify("initialized");

    const created = await rpc.request("modelProvider/create", {
      provider: {
        name: CUSTOM_PROVIDER_NAME,
        type: CUSTOM_PROVIDER_TYPE,
        api_host: CUSTOM_PROVIDER_HOST,
      },
    });
    const provider = created.result?.provider;
    const providerId = provider?.id;
    assert(
      typeof providerId === "string" && providerId.startsWith("custom-"),
      "modelProvider/create 未返回自定义 Provider id",
    );

    const updated = await rpc.request("modelProvider/update", {
      providerId,
      patch: {
        custom_models: [CUSTOM_MODEL_ID],
        sort_order: 1,
      },
    });
    await rpc.request("modelProviderKey/create", {
      providerId,
      apiKey: "sk-settings-provider-migration-fixture",
      alias: "migration-fixture-key",
      replaceExisting: true,
    });
    await rpc.request("modelProviderUiState/write", {
      key: UI_SELECTED_PROVIDER_KEY,
      value: providerId,
    });
    await rpc.request("modelProviderUiState/write", {
      key: UI_COLLAPSED_GROUPS_KEY,
      value: JSON.stringify([]),
    });
    const listed = await rpc.request("modelProvider/list", {});
    const selectedState = await rpc.request("modelProviderUiState/read", {
      key: UI_SELECTED_PROVIDER_KEY,
    });
    const listedProvider = (listed.result?.providers ?? []).find(
      (item) => item?.id === providerId,
    );

    assert(listedProvider, "旧 Product DB seed 后未读回自定义 Provider");
    assert(
      listedProvider?.name === CUSTOM_PROVIDER_NAME,
      `旧 Product DB Provider 名称不正确: ${listedProvider?.name}`,
    );
    assert(
      Number(listedProvider?.api_key_count ?? 0) >= 1,
      "旧 Product DB Provider 未保存 API Key",
    );
    assert(
      Array.isArray(listedProvider?.custom_models) &&
        listedProvider.custom_models.includes(CUSTOM_MODEL_ID),
      "旧 Product DB Provider 未保存 custom_models",
    );
    assert(
      selectedState.result?.value === providerId,
      "旧 Product DB UI selected_provider 未保存",
    );

    return {
      initialize: initialize.result,
      providerId,
      providerName: CUSTOM_PROVIDER_NAME,
      providerType: CUSTOM_PROVIDER_TYPE,
      customModelId: CUSTOM_MODEL_ID,
      oldProductDbPath: runtimeEnv.oldProductDbPath,
      oldProductDataDir: runtimeEnv.oldProductDataDir,
      created: created.result,
      updated: updated.result,
      selectedState: selectedState.result,
      listedProvider,
      messages: rpc.messages,
      stderr: rpc.stderr,
    };
  } finally {
    await rpc.close();
  }
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function evaluatePageSnapshot(page, pageFunction, arg) {
  try {
    return await page.evaluate(pageFunction, arg);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return null;
    }
    throw error;
  }
}

async function waitForAppUrlReady(options) {
  if (!options.appUrl) {
    return null;
  }

  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.appUrl, { method: "GET" });
      if (response.ok) {
        return {
          url: options.appUrl,
          status: response.status,
          waitedMs: Date.now() - startedAt,
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `renderer dev server 未就绪: ${options.appUrl}; lastError=${lastError}`,
  );
}

async function waitForRendererReady(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      electron: window.__LIME_ELECTRON__ === true,
      hasInvokeBridge: typeof window.electronAPI?.invoke === "function",
      supportsAppServer:
        typeof window.electronAPI?.supportsCommand === "function" &&
        window.electronAPI.supportsCommand("app_server_handle_json_lines"),
      startupVisible: Boolean(
        document.querySelector("[data-lime-startup-shell]"),
      ),
      appSidebarVisible: Boolean(
        document.querySelector('[data-testid="app-sidebar"]'),
      ),
      bodyText: document.body?.innerText || "",
    }));
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    if (
      snapshot.electron &&
      snapshot.hasInvokeBridge &&
      snapshot.supportsAppServer &&
      !snapshot.startupVisible &&
      snapshot.appSidebarVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("Electron renderer / App Server bridge 未就绪");
}

async function clearInvokeBuffers(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

async function launchElectronFixture({
  options,
  runtimeEnv,
  appServerEnv,
  consoleErrors,
}) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: ["--use-mock-keychain", "."],
    cwd: process.cwd(),
    env: {
      ...runtimeEnv.env,
      ...appServerEnv,
      APP_SERVER_BACKEND_MODE: "unavailable",
      APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP:
        PRODUCT_DB_MIGRATION_CLEANUP_POLICY,
      ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
      LIME_ELECTRON_E2E: "1",
      LIME_ELECTRON_BRAND_DEV_APP: "0",
      LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
      LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
      ...(options.appUrl ? { VITE_DEV_SERVER_URL: options.appUrl } : {}),
    },
    timeout: options.timeoutMs,
  });

  app.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(sanitizeText(message.text()));
    }
  });

  const page = await app.firstWindow({ timeout: options.timeoutMs });
  page.setDefaultTimeout(options.timeoutMs);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const rendererSnapshot = await waitForRendererReady(page, options);
  await clearInvokeBuffers(page);

  return { app, page, rendererSnapshot };
}

async function closeElectronFixture(handle) {
  if (handle?.app) {
    await handle.app.close().catch(() => undefined);
    await sleep(500);
  }
}

async function appServerCallFromPage(page, method, params = {}) {
  return await page.evaluate(
    async ({ command, method, params }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const id = `settings-provider-migration-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
      const response = await invoke(command, {
        request: {
          lines: [
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              method,
              params,
            }),
          ],
        },
      });
      const decoded = Array.isArray(response?.lines)
        ? response.lines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [];
      const error = decoded.find(
        (message) => message?.id === id && message.error,
      );
      if (error) {
        throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
      }
      const result = decoded.find(
        (message) =>
          message?.id === id &&
          Object.prototype.hasOwnProperty.call(message, "result"),
      );
      if (!result) {
        throw new Error(`${method} did not return a JSON-RPC result`);
      }
      return {
        method,
        result: result.result,
        decoded,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    { command: APP_SERVER_HANDLE_JSON_LINES_COMMAND, method, params },
  );
}

function parseInvokeTraceRaw(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonRpcRequestsFromInvokeTrace(raw) {
  const entries = parseInvokeTraceRaw(raw);
  const requests = [];
  for (const entry of entries) {
    if (entry?.command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
      continue;
    }
    const lines = entry?.args_preview?.request?.lines;
    if (!Array.isArray(lines)) {
      continue;
    }
    for (const line of lines) {
      const parsed = parseJsonRpcLine(line);
      if (parsed?.method) {
        requests.push({
          command: entry.command,
          transport: entry.transport ?? null,
          status: entry.status ?? null,
          durationMs: entry.duration_ms ?? null,
          id: parsed.id ?? null,
          method: parsed.method,
          params: parsed.params ?? {},
        });
      }
    }
  }
  return requests;
}

async function waitForPageCondition(
  page,
  options,
  predicate,
  message,
  arg = {},
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(45_000, options.timeoutMs)) {
    const result = await evaluatePageSnapshot(page, predicate, arg);
    if (result) {
      return result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(message);
}

async function openProviderSettings(page, options) {
  const opened = await page.evaluate(() => {
    const accountButton = document.querySelector(
      '[data-testid="app-sidebar-account-button"]',
    );
    if (!(accountButton instanceof HTMLButtonElement)) {
      return { accountButton: false, menuItem: false };
    }
    accountButton.click();
    return { accountButton: true, menuItem: false };
  });
  assert(opened.accountButton, "未找到侧栏账号按钮");

  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(
        document.querySelector('[data-testid="app-sidebar-account-menu"]'),
      ),
    "账号菜单未打开",
  );

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => {
      const text = button.textContent || "";
      const aria = button.getAttribute("aria-label") || "";
      return /模型设置|AI 服务商|AI Providers|Model Settings/.test(
        `${text}\n${aria}`,
      );
    });
    if (!(target instanceof HTMLButtonElement)) {
      return false;
    }
    target.click();
    return true;
  });
  assert(clicked, "未找到账号菜单里的模型设置入口");

  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(document.querySelector('[data-testid="settings-top-header"]')),
    "设置页头部未挂载",
  );
  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(
        document.querySelector('[data-testid="api-key-provider-section"]') &&
        document.querySelector('[data-testid="api-key-provider-detail"]'),
      ),
    "AI 服务商设置区域未挂载",
  );
}

async function waitForProviderVisible(page, options, providerId) {
  return await waitForPageCondition(
    page,
    options,
    ({ providerId, providerName, customModelId }) => {
      const item = document.querySelector(
        `[data-testid="enabled-model-item"][data-provider-id="${providerId}"]`,
      );
      const detail = document.querySelector(
        `[data-testid="provider-setting"][data-provider-id="${providerId}"]`,
      );
      const listText =
        document.querySelector('[data-testid="enabled-model-list"]')
          ?.textContent ?? "";
      const detailText =
        document.querySelector('[data-testid="api-key-provider-detail"]')
          ?.textContent ?? "";
      const providerNameText =
        document.querySelector('[data-testid="provider-name"]')?.textContent ??
        "";
      const visible =
        Boolean(item) &&
        Boolean(detail) &&
        listText.includes(providerName) &&
        listText.includes(customModelId) &&
        providerNameText.includes(providerName) &&
        detailText.includes(providerName);
      return visible
        ? {
            listText,
            detailText,
            providerNameText,
            itemSelected: item?.getAttribute("data-selected") ?? null,
          }
        : false;
    },
    `设置页未显示迁移后的 Provider: ${CUSTOM_PROVIDER_NAME}`,
    {
      providerId,
      providerName: CUSTOM_PROVIDER_NAME,
      customModelId: CUSTOM_MODEL_ID,
    },
  );
}

function summarizeElectronEvidence({ listResult, uiStateResult, traceRaw }) {
  const requests = parseJsonRpcRequestsFromInvokeTrace(traceRaw);
  const methods = Array.from(
    new Set(
      [
        listResult?.method,
        uiStateResult?.method,
        ...requests.map((request) => request.method),
      ].filter(Boolean),
    ),
  );
  return {
    appServerHandleJsonLinesSeen:
      Boolean(listResult?.decoded?.length) ||
      Boolean(uiStateResult?.decoded?.length),
    requestMethods: methods,
    missingRequiredMethods: ELECTRON_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyProviderCommandsSeen: LEGACY_PROVIDER_COMMANDS.filter((method) =>
      methods.includes(method),
    ),
    migratedProvider: (listResult?.result?.providers ?? []).find(
      (provider) => provider?.name === CUSTOM_PROVIDER_NAME,
    ),
    selectedProviderValue: uiStateResult?.result?.value ?? null,
    requests:
      requests.length > 0
        ? requests
        : [
            {
              command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
              method: listResult?.method,
            },
            {
              command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
              method: uiStateResult?.method,
            },
          ],
  };
}

function assertElectronEvidence(summary, providerId) {
  assert(
    summary.appServerHandleJsonLinesSeen,
    "未观察到 app_server_handle_json_lines",
  );
  assert(
    summary.missingRequiredMethods.length === 0,
    `缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.legacyProviderCommandsSeen.length === 0,
    `观察到 legacy Provider 命令: ${summary.legacyProviderCommandsSeen.join(", ")}`,
  );
  assert(
    summary.migratedProvider,
    "modelProvider/list 未返回迁移后的 Provider",
  );
  assert(
    summary.migratedProvider.id === providerId,
    `迁移后 Provider id 不正确: ${summary.migratedProvider.id}`,
  );
  assert(
    Number(summary.migratedProvider.api_key_count ?? 0) >= 1,
    "迁移后 Provider API Key 丢失",
  );
  assert(
    Array.isArray(summary.migratedProvider.custom_models) &&
      summary.migratedProvider.custom_models.includes(CUSTOM_MODEL_ID),
    "迁移后 Provider custom_models 丢失",
  );
  assert(
    summary.selectedProviderValue === providerId,
    "迁移后 modelProviderUiState/read 未读回 selected_provider",
  );
}

function readOldProductDbUserSchemaObjectCount(runtimeEnv) {
  if (!fs.existsSync(runtimeEnv.oldProductDbPath)) {
    return null;
  }
  const sqliteBinary = process.env.SQLITE3_BIN?.trim() || "sqlite3";
  const result = spawnSync(
    sqliteBinary,
    [
      runtimeEnv.oldProductDbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view','trigger','index') AND name NOT LIKE 'sqlite_%';",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: runtimeEnv.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 old Product DB schema check failed: ${sanitizeText(result.stderr)}`,
    );
  }
  const parsed = Number(String(result.stdout || "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `sqlite3 old Product DB schema check returned invalid count: ${result.stdout}`,
    );
  }
  return parsed;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const rawEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-raw.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );

  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });

  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    appUrlReady: null,
    backendMode: "unavailable",
    productDbMigrationCleanupPolicy: PRODUCT_DB_MIGRATION_CLEANUP_POLICY,
    electronPreloadBridge: false,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    oldProductDbPath: options.keepTemp
      ? runtimeEnv.oldProductDbPath
      : path.basename(runtimeEnv.oldProductDbPath),
    migratedProductDbPath: options.keepTemp
      ? runtimeEnv.migratedProductDbPath
      : path.join("app-server", "lime.db"),
    appServerBinary: options.keepTemp
      ? appServerBinary
      : path.basename(appServerBinary),
    seedRequiredMethods: SEED_REQUIRED_METHODS,
    electronRequiredMethods: ELECTRON_REQUIRED_METHODS,
    providerId: null,
    providerName: CUSTOM_PROVIDER_NAME,
    providerVisibleInGui: false,
    migrationMarkerExists: false,
    oldProductDbExists: false,
    oldProductDbUserSchemaObjectCount: null,
    migratedProductDbExists: false,
    migratedProviderSummary: null,
    uiStateSelectedProvider: null,
    electronRequestMethods: [],
    legacyProviderCommandsSeen: [],
    consoleErrors: [],
    screenshot: null,
    rawEvidence: rawEvidencePath,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const rawEvidence = {};

  try {
    logStage("wait-app-url");
    summary.appUrlReady = await waitForAppUrlReady(options);

    logStage("seed-old-product-database");
    const seed = await seedOldProductDatabase({
      appServerBinary,
      runtimeEnv,
      options,
    });
    rawEvidence.seed = sanitizeJson(seed);
    summary.providerId = seed.providerId;
    summary.oldProductDbExists = fs.existsSync(runtimeEnv.oldProductDbPath);
    assert(summary.oldProductDbExists, "旧 Product DB 未创建");

    logStage("launch-electron-and-trigger-migration");
    const handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    summary.electronPreloadBridge =
      handle.rendererSnapshot.electron &&
      handle.rendererSnapshot.hasInvokeBridge;

    logStage("read-migrated-provider-via-electron-jsonrpc");
    const listResult = await appServerCallFromPage(
      page,
      "modelProvider/list",
      {},
    );
    const uiStateResult = await appServerCallFromPage(
      page,
      "modelProviderUiState/read",
      { key: UI_SELECTED_PROVIDER_KEY },
    );
    rawEvidence.electronList = sanitizeJson(listResult);
    rawEvidence.electronUiState = sanitizeJson(uiStateResult);
    const traceRaw =
      uiStateResult.traceRaw ||
      listResult.traceRaw ||
      handle.rendererSnapshot.traceRaw;
    const electronEvidence = summarizeElectronEvidence({
      listResult,
      uiStateResult,
      traceRaw,
    });
    assertElectronEvidence(electronEvidence, seed.providerId);
    summary.electronRequestMethods = electronEvidence.requestMethods;
    summary.legacyProviderCommandsSeen =
      electronEvidence.legacyProviderCommandsSeen;
    summary.migratedProviderSummary = sanitizeJson({
      id: electronEvidence.migratedProvider.id,
      name: electronEvidence.migratedProvider.name,
      type: electronEvidence.migratedProvider.type,
      api_host: electronEvidence.migratedProvider.api_host,
      api_key_count: electronEvidence.migratedProvider.api_key_count,
      custom_models: electronEvidence.migratedProvider.custom_models,
    });
    summary.uiStateSelectedProvider = electronEvidence.selectedProviderValue;
    rawEvidence.electronRequests = sanitizeJson(electronEvidence.requests);

    logStage("open-provider-settings-gui");
    await openProviderSettings(page, options);
    const providerGui = await waitForProviderVisible(
      page,
      options,
      seed.providerId,
    );
    rawEvidence.providerGui = sanitizeJson(providerGui);
    summary.providerVisibleInGui = true;
    summary.migrationMarkerExists = fs.existsSync(
      runtimeEnv.migrationMarkerPath,
    );
    summary.oldProductDbExists = fs.existsSync(runtimeEnv.oldProductDbPath);
    summary.oldProductDbUserSchemaObjectCount =
      readOldProductDbUserSchemaObjectCount(runtimeEnv);
    summary.migratedProductDbExists = fs.existsSync(
      runtimeEnv.migratedProductDbPath,
    );

    assert(
      summary.migrationMarkerExists,
      "迁移后 app-server data-dir 未写入 .migration_completed",
    );
    assert(summary.migratedProductDbExists, "迁移目标 Product DB 未创建");
    assert(
      summary.oldProductDbUserSchemaObjectCount === 0,
      `迁移后旧 Product DB 仍保留业务 schema 对象: ${summary.oldProductDbUserSchemaObjectCount}`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await closeElectronFixture(handle);
    app = null;
    page = null;

    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.consoleErrors = consoleErrors;
    summary.screenshot = screenshotPath;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(rawEvidencePath, rawEvidence);
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} provider=${seed.providerId}`);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    if (Object.keys(rawEvidence).length > 0) {
      writeJsonFile(rawEvidencePath, rawEvidence);
    }
    writeJsonFile(summaryPath, summary);
    if (page) {
      try {
        await page.screenshot({
          path: failureScreenshotPath,
          fullPage: true,
        });
        summary.failureScreenshot = failureScreenshotPath;
        writeJsonFile(summaryPath, summary);
      } catch {
        // 截图失败不覆盖原始错误。
      }
    }
    throw error;
  } finally {
    if (app) {
      await closeElectronFixture({ app });
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
