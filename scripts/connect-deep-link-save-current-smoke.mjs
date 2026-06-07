#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";

const RELAY_ID = "electron-current-save-smoke";
const RELAY_NAME = "Electron Current Save Smoke";
const API_KEY = "sk-connect-save-smoke-000000000000";
const DEFAULTS = {
  timeoutMs: 120_000,
  intervalMs: 250,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "connect-deep-link-save-current",
  ),
  prefix: "connect-deep-link-save-current",
  deepLinkUrl: `lime://connect?relay=${RELAY_ID}&key=${API_KEY}&name=${encodeURIComponent(
    RELAY_NAME,
  )}&ref=smoke`,
  appUrl: "",
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = [
  "connectDeepLink/resolve",
  "connectRelayApiKey/save",
  "connectCallback/send",
];
const FORBIDDEN_CONNECT_COMMANDS = [
  "handle_deep_link",
  "handle_open_deep_link",
  "save_relay_api_key",
  "send_connect_callback",
  "list_relay_providers",
  "refresh_relay_registry",
  "deep-link-connect",
  "deep-link-error",
  "deep-link://new-url",
];

function printHelp() {
  console.log(`
Connect Deep Link Save Current Smoke

用途:
  启动真实 Electron Desktop Host，把 lime://connect URL 作为首启参数交给
  Electron main，点击“确认添加”，验证 Connect API Key 保存与 callback
  发送请求均走 app_server_handle_json_lines -> App Server JSON-RPC current
  主链，而不是旧 desktop command / renderer mock。

用法:
  node scripts/connect-deep-link-save-current-smoke.mjs

选项:
  --app-url <url>         可选 renderer dev server，例如 http://127.0.0.1:1420/
  --deep-link-url <url>   默认使用本脚本的 registry fixture relay
  --timeout-ms <ms>       总超时，默认 120000
  --interval-ms <ms>      轮询间隔，默认 250
  --evidence-dir <path>   证据目录，默认 .lime/qc/gui-evidence/connect-deep-link-save-current
  --prefix <name>         证据文件前缀，默认 connect-deep-link-save-current
  -h, --help              显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-url" && argv[index + 1]) {
      options.appUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--deep-link-url" && argv[index + 1]) {
      options.deepLinkUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && argv[index + 1]) {
      options.evidenceDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && argv[index + 1]) {
      options.prefix = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.deepLinkUrl.startsWith("lime://connect")) {
    throw new Error("--deep-link-url 必须是 lime://connect URL");
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
  console.log(`[smoke:connect-deep-link-save-current] stage=${stage}`);
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token|key)[^=\s]*=)(["']?)[^\s"'&]+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
  return sanitized.length > 1_500
    ? `${sanitized.slice(0, 1_500)}... [truncated ${sanitized.length - 1_500} chars]`
    : sanitized;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 5) {
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
    return value.slice(0, 60).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 120)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function decodeJsonRpcLines(lines) {
  return Array.isArray(lines)
    ? lines.map(parseJsonRpcLine).filter(Boolean)
    : [];
}

function invokeTraceEntriesFromStorage(value) {
  const entries = parseJson(value);
  return Array.isArray(entries) ? entries : [];
}

function collectAppServerInvokeEntries(traceEntries) {
  return traceEntries
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .map((entry) => {
      const requestMessages = decodeJsonRpcLines(
        entry?.args_preview?.request?.lines,
      );
      return {
        command: entry.command,
        transport: entry.transport ?? null,
        status: entry.status ?? null,
        appServerMethods: requestMessages
          .map((message) =>
            typeof message?.method === "string" ? message.method : null,
          )
          .filter(Boolean),
        requestMessages: requestMessages.map(sanitizeJson),
      };
    });
}

function summarizeTraceEntries(traceEntries) {
  const appServerInvokeEntries = collectAppServerInvokeEntries(traceEntries);
  const appServerMethodsSeen = Array.from(
    new Set(
      appServerInvokeEntries.flatMap((entry) => entry.appServerMethods ?? []),
    ),
  ).sort();
  const commandsSeen = Array.from(
    new Set(
      traceEntries
        .map((entry) =>
          typeof entry?.command === "string" ? entry.command : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const forbiddenCommandsSeen = FORBIDDEN_CONNECT_COMMANDS.filter((command) =>
    commandsSeen.includes(command),
  );
  const missingRequiredAppServerMethods = REQUIRED_APP_SERVER_METHODS.filter(
    (method) => !appServerMethodsSeen.includes(method),
  );

  return {
    appServerHandleJsonLinesSeen: appServerInvokeEntries.length > 0,
    appServerMethodsSeen,
    missingRequiredAppServerMethods,
    forbiddenCommandsSeen,
    appServerInvokeEntries,
  };
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function evaluatePageSnapshot(page, pageFunction) {
  try {
    return await page.evaluate(pageFunction);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return null;
    }
    throw error;
  }
}

async function waitForRendererReady(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      return {
        url: window.location.href,
        electron: window.__LIME_ELECTRON__ === true,
        hasDeepLinkBridge:
          typeof window.electronAPI?.deepLink?.getCurrent === "function" &&
          typeof window.electronAPI?.deepLink?.onOpenUrl === "function",
        startupVisible: Boolean(
          document.querySelector("[data-lime-startup-shell]"),
        ),
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    if (
      snapshot.electron &&
      snapshot.hasDeepLinkBridge &&
      !snapshot.startupVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("Electron renderer preload deepLink bridge 未就绪");
}

async function waitForConnectDialog(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, async () => {
      const bodyText = document.body?.innerText || "";
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      const pendingDeepLinks = window.electronAPI?.deepLink?.getCurrent
        ? await window.electronAPI.deepLink.getCurrent()
        : [];
      return {
        bodyText,
        traceRaw,
        pendingDeepLinks,
        dialogVisible:
          bodyText.includes("添加 API Key") &&
          bodyText.includes("确认添加") &&
          bodyText.includes("Electron Current Save Smoke"),
        hasConfirmButton: Array.from(document.querySelectorAll("button")).some(
          (button) => (button.textContent || "").trim() === "确认添加",
        ),
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    const traceEntries = invokeTraceEntriesFromStorage(snapshot.traceRaw);
    const traceSummary = summarizeTraceEntries(traceEntries);
    lastSnapshot = {
      ...snapshot,
      ...traceSummary,
      traceEntries: traceEntries.map(sanitizeJson),
    };
    if (
      snapshot.dialogVisible &&
      snapshot.hasConfirmButton &&
      traceSummary.appServerMethodsSeen.includes("connectDeepLink/resolve") &&
      traceSummary.forbiddenCommandsSeen.length === 0
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Connect 确认弹窗未出现或 resolve 未完成: ${sanitizeText(
      JSON.stringify(lastSnapshot),
    )}`,
  );
}

async function clickConfirm(page) {
  const confirmButton = page
    .locator("button")
    .filter({ hasText: /^确认添加$/ })
    .first();
  assert((await confirmButton.count()) > 0, "未找到确认添加按钮");
  await confirmButton.click({ timeout: 5_000 });
}

async function waitForSaveEvidence(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const visible = (element) => {
        if (!element) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };
      const bodyText = document.body?.innerText || "";
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      const visibleButtons = Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .map((button) => (button.textContent || "").trim());
      const dialogVisible =
        bodyText.includes("添加 API Key") &&
        bodyText.includes("Electron Current Save Smoke") &&
        visibleButtons.some(
          (text) => text === "确认添加" || text === "保存中...",
        );
      const errorVisible =
        bodyText.includes("保存失败") ||
        bodyText.includes("调用失败") ||
        bodyText.includes("无法加载中转商注册表") ||
        bodyText.includes("不在注册表中");
      return {
        bodyText,
        traceRaw,
        dialogVisible,
        errorVisible,
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }

    const traceEntries = invokeTraceEntriesFromStorage(snapshot.traceRaw);
    const traceSummary = summarizeTraceEntries(traceEntries);
    lastSnapshot = {
      ...snapshot,
      ...traceSummary,
      traceEntries: traceEntries.map(sanitizeJson),
    };
    if (
      !snapshot.dialogVisible &&
      !snapshot.errorVisible &&
      traceSummary.missingRequiredAppServerMethods.length === 0 &&
      traceSummary.forbiddenCommandsSeen.length === 0
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Connect 保存 / callback current 证据未完成: ${sanitizeText(
      JSON.stringify(lastSnapshot),
    )}`,
  );
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function buildIsolatedRuntimeEnv(tmpRoot) {
  const home = ensureDir(path.join(tmpRoot, "home"));
  const xdgDataHome = ensureDir(path.join(tmpRoot, "xdg-data"));
  const appData = ensureDir(path.join(tmpRoot, "appdata"));
  const localAppData = ensureDir(path.join(tmpRoot, "local-appdata"));
  const asterRoot = ensureDir(path.join(tmpRoot, "aster"));
  return {
    HOME: home,
    XDG_DATA_HOME: xdgDataHome,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    LIME_ASTER_ROOT: asterRoot,
  };
}

function registryPayload() {
  return {
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    providers: [
      {
        id: RELAY_ID,
        name: RELAY_NAME,
        description: "Electron current Connect save smoke fixture.",
        branding: {
          logo: "",
          color: "#159A79",
        },
        links: {
          homepage: "https://example.com/connect-save-smoke",
        },
        api: {
          base_url: "https://api.example.com/v1",
          protocol: "openai",
          auth_header: "Authorization",
          auth_prefix: "Bearer",
        },
        contact: {},
        features: {
          models: [],
          streaming: true,
          function_calling: false,
          vision: false,
        },
      },
    ],
  };
}

function seedConnectRegistryCaches(tmpRoot, env) {
  const candidateDataDirs = [
    path.join(env.HOME, "Library", "Application Support", "lime"),
    path.join(env.XDG_DATA_HOME, "lime"),
    path.join(env.APPDATA, "lime"),
    path.join(env.LOCALAPPDATA, "lime"),
  ];
  const registry = registryPayload();
  const seededPaths = [];
  for (const dataDir of candidateDataDirs) {
    if (!dataDir.startsWith(tmpRoot)) {
      continue;
    }
    const registryPath = path.join(dataDir, "connect", "registry.json");
    ensureDir(path.dirname(registryPath));
    writeJsonFile(registryPath, registry);
    seededPaths.push(registryPath);
  }
  return seededPaths;
}

function listRelativeFiles(root, fileName) {
  const matches = [];
  function visit(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name === fileName) {
        matches.push(path.relative(root, absolute));
      }
    }
  }
  visit(root);
  return matches.sort();
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const tracePath = path.join(
    options.evidenceDir,
    `${options.prefix}-invoke-trace.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );

  const appServerEnv = resolveElectronAppServerRuntimeEnv();
  const tmpRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "connect-deep-link-save-current-"),
  );
  const tmpUserDataDir = ensureDir(path.join(tmpRoot, "electron-user-data"));
  const isolatedRuntimeEnv = buildIsolatedRuntimeEnv(tmpRoot);
  const seededRegistryPaths = seedConnectRegistryCaches(
    tmpRoot,
    isolatedRuntimeEnv,
  );

  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    deepLinkUrl: sanitizeText(options.deepLinkUrl),
    appUrl: options.appUrl || null,
    tmpRoot,
    seededRegistryPaths: seededRegistryPaths.map((item) =>
      path.relative(tmpRoot, item),
    ),
    electronPreloadBridge: false,
    connectDialogVisible: false,
    dialogClosedAfterConfirm: false,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    missingRequiredAppServerMethods: REQUIRED_APP_SERVER_METHODS,
    forbiddenCommandsSeen: [],
    databaseFiles: [],
    screenshot: null,
    trace: tracePath,
    summary: summaryPath,
    callbackNetworkDeliveryVerified: false,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];

  try {
    logStage("launch-electron");
    app = await electron.launch({
      executablePath: electronPath,
      args: ["--use-mock-keychain", ".", options.deepLinkUrl],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...appServerEnv,
        ...isolatedRuntimeEnv,
        ELECTRON_E2E_USER_DATA_DIR: tmpUserDataDir,
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        ...(options.appUrl ? { VITE_DEV_SERVER_URL: options.appUrl } : {}),
      },
      timeout: options.timeoutMs,
    });

    app.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeText(message.text()));
      }
    });

    page = await app.firstWindow({ timeout: options.timeoutMs });
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

    logStage("wait-renderer");
    const rendererSnapshot = await waitForRendererReady(page, options);
    summary.electronPreloadBridge =
      rendererSnapshot.electron && rendererSnapshot.hasDeepLinkBridge;

    logStage("wait-connect-dialog");
    const dialogEvidence = await waitForConnectDialog(page, options);
    summary.connectDialogVisible = true;
    summary.appServerHandleJsonLinesSeen = Boolean(
      dialogEvidence.appServerHandleJsonLinesSeen,
    );
    summary.appServerMethodsSeen = dialogEvidence.appServerMethodsSeen ?? [];
    summary.forbiddenCommandsSeen = dialogEvidence.forbiddenCommandsSeen ?? [];

    logStage("confirm-connect-save");
    await clickConfirm(page);

    logStage("wait-save-callback-evidence");
    const saveEvidence = await waitForSaveEvidence(page, options);
    summary.dialogClosedAfterConfirm = !saveEvidence.dialogVisible;
    summary.appServerHandleJsonLinesSeen = Boolean(
      saveEvidence.appServerHandleJsonLinesSeen,
    );
    summary.appServerMethodsSeen = saveEvidence.appServerMethodsSeen ?? [];
    summary.missingRequiredAppServerMethods =
      saveEvidence.missingRequiredAppServerMethods ?? [];
    summary.forbiddenCommandsSeen = saveEvidence.forbiddenCommandsSeen ?? [];
    writeJsonFile(tracePath, {
      appServerInvokeEntries: saveEvidence.appServerInvokeEntries ?? [],
      traceEntries: saveEvidence.traceEntries ?? [],
    });

    summary.databaseFiles = listRelativeFiles(tmpRoot, "lime.db");
    summary.consoleErrors = consoleErrors;
    summary.screenshot = screenshotPath;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert(
      summary.electronPreloadBridge,
      "未检测到真实 Electron preload bridge",
    );
    assert(summary.connectDialogVisible, "Connect 确认弹窗未出现");
    assert(summary.dialogClosedAfterConfirm, "确认添加后 Connect 弹窗未关闭");
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingRequiredAppServerMethods.length === 0,
      `缺少 App Server Connect methods: ${summary.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      summary.forbiddenCommandsSeen.length === 0,
      `观察到旧 Connect 命令或事件: ${summary.forbiddenCommandsSeen.join(", ")}`,
    );
    assert(
      summary.databaseFiles.length > 0,
      "未在隔离 app data 下观察到 lime.db",
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:connect-deep-link-save-current] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:connect-deep-link-save-current] screenshot=${screenshotPath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.databaseFiles = listRelativeFiles(tmpRoot, "lime.db");
    writeJsonFile(summaryPath, summary);
    if (page) {
      try {
        await page.screenshot({
          path: failureScreenshotPath,
          fullPage: true,
        });
        summary.screenshot = failureScreenshotPath;
        writeJsonFile(summaryPath, summary);
      } catch {
        // 失败截图只是诊断证据，不能阻断错误上抛。
      }
    }
    console.error(
      `[smoke:connect-deep-link-save-current] summary=${summaryPath}`,
    );
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

await run();
