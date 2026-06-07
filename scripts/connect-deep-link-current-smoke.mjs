#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";

const DEFAULTS = {
  timeoutMs: 120_000,
  intervalMs: 250,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "connect-deep-link-current",
  ),
  prefix: "connect-deep-link-current",
  deepLinkUrl:
    "lime://connect?relay=electron-current-smoke&key=sk-connect-smoke-000000000000&name=Electron%20Current%20Smoke&ref=smoke",
  appUrl: "",
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHOD = "connectDeepLink/resolve";
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
Connect Deep Link Current Smoke

用途:
  启动真实 Electron Desktop Host，把 lime://connect URL 作为首启参数交给
  Electron main，验证 renderer preload deepLink bridge 与 App Server JSON-RPC
  current 主链连通，而不是旧 desktop command / renderer mock。

用法:
  node scripts/connect-deep-link-current-smoke.mjs

选项:
  --app-url <url>         可选 renderer dev server，例如 http://127.0.0.1:1420/
  --deep-link-url <url>   默认使用一次性未验证 relay，只打开确认弹窗，不保存 Key
  --timeout-ms <ms>       总超时，默认 120000
  --interval-ms <ms>      轮询间隔，默认 250
  --evidence-dir <path>   证据目录，默认 .lime/qc/gui-evidence/connect-deep-link-current
  --prefix <name>         证据文件前缀，默认 connect-deep-link-current
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
  console.log(`[smoke:connect-deep-link-current] stage=${stage}`);
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

  return {
    appServerHandleJsonLinesSeen: appServerInvokeEntries.length > 0,
    appServerMethodsSeen,
    connectDeepLinkResolveSeen: appServerMethodsSeen.includes(
      REQUIRED_APP_SERVER_METHOD,
    ),
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
      const text = document.body?.innerText || "";
      return {
        url: window.location.href,
        electron: window.__LIME_ELECTRON__ === true,
        hasDeepLinkBridge:
          typeof window.electronAPI?.deepLink?.getCurrent === "function" &&
          typeof window.electronAPI?.deepLink?.onOpenUrl === "function",
        text,
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

async function waitForConnectEvidence(page, options) {
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
          bodyText.includes("electron-current-smoke"),
        hasCancelButton: Array.from(document.querySelectorAll("button")).some(
          (button) => (button.textContent || "").trim() === "取消",
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
      traceSummary.appServerHandleJsonLinesSeen &&
      traceSummary.connectDeepLinkResolveSeen &&
      traceSummary.forbiddenCommandsSeen.length === 0
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  return lastSnapshot;
}

async function cancelConnectDialog(page) {
  const cancelButton = page
    .locator("button")
    .filter({ hasText: /^取消$/ })
    .first();
  if ((await cancelButton.count()) > 0) {
    await cancelButton.click({ timeout: 5_000 }).catch(() => {});
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  const tmpUserDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "connect-deep-link-current-"),
  );
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    deepLinkUrl: sanitizeText(options.deepLinkUrl),
    appUrl: options.appUrl || null,
    electronPreloadBridge: false,
    connectDialogVisible: false,
    appServerHandleJsonLinesSeen: false,
    connectDeepLinkResolveSeen: false,
    appServerMethodsSeen: [],
    forbiddenCommandsSeen: [],
    screenshot: null,
    trace: tracePath,
    summary: summaryPath,
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
    const evidence = await waitForConnectEvidence(page, options);
    if (evidence) {
      summary.connectDialogVisible = Boolean(evidence.dialogVisible);
      summary.appServerHandleJsonLinesSeen = Boolean(
        evidence.appServerHandleJsonLinesSeen,
      );
      summary.connectDeepLinkResolveSeen = Boolean(
        evidence.connectDeepLinkResolveSeen,
      );
      summary.appServerMethodsSeen = evidence.appServerMethodsSeen ?? [];
      summary.forbiddenCommandsSeen = evidence.forbiddenCommandsSeen ?? [];
      writeJsonFile(tracePath, {
        appServerInvokeEntries: evidence.appServerInvokeEntries ?? [],
        traceEntries: evidence.traceEntries ?? [],
      });
    } else {
      writeJsonFile(tracePath, {
        appServerInvokeEntries: [],
        traceEntries: [],
      });
    }

    summary.consoleErrors = consoleErrors;
    summary.screenshot = screenshotPath;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert(
      summary.electronPreloadBridge,
      "未检测到真实 Electron preload bridge",
    );
    assert(summary.connectDialogVisible, "Connect 确认弹窗未出现");
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.connectDeepLinkResolveSeen,
      "未观察到 connectDeepLink/resolve",
    );
    assert(
      summary.forbiddenCommandsSeen.length === 0,
      `观察到旧 Connect 命令或事件: ${summary.forbiddenCommandsSeen.join(", ")}`,
    );

    await cancelConnectDialog(page);
    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:connect-deep-link-current] summary=${summaryPath}`);
    console.log(
      `[smoke:connect-deep-link-current] screenshot=${screenshotPath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
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
    console.error(`[smoke:connect-deep-link-current] summary=${summaryPath}`);
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  }
}

await run();
