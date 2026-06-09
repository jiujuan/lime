#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
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
    "session-files-electron-fixture",
  ),
  prefix: "session-files-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:session-files-electron-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const FILE_SHELL_COMMANDS = ["reveal_in_finder", "open_with_default_app"];
const SESSION_ID = `session-files-electron-${Date.now()}-${process.pid}`;
const FILE_NAME = "content-posts/current-fixture.md";
const FILE_CONTENT = [
  "# Session files current fixture",
  "",
  "This content was saved through App Server JSON-RPC.",
  "",
].join("\n");
const REQUIRED_METHODS = [
  "initialize",
  "sessionFile/getOrCreate",
  "sessionFile/updateMeta",
  "sessionFile/save",
  "sessionFile/list",
  "sessionFile/read",
  "sessionFile/resolvePath",
  "sessionFile/delete",
];
const FORBIDDEN_METHOD_PREFIXES = ["session_files_"];

function printHelp() {
  console.log(`
Session Files Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，通过 preload IPC 调用
  app_server_handle_json_lines -> App Server JSON-RPC current sessionFile/* 方法，
  验证会话文件保存、列出、读取、路径解析、Desktop Host 文件壳打开和删除链路。

边界:
  本脚本不调用模型后端，不使用 APP_SERVER_BACKEND_MODE=mock，不走旧
  session_files_* Tauri command、renderer mock fallback 或 DevBridge mock 作为成功证据。

用法:
  node scripts/electron/session-files-fixture-smoke.mjs

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
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
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
        .slice(0, 180)
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
    path.join(os.tmpdir(), "session-files-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
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
      supportsFileShell:
        typeof window.electronAPI?.supportsCommand === "function" &&
        window.electronAPI.supportsCommand("reveal_in_finder") &&
        window.electronAPI.supportsCommand("open_with_default_app"),
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
      snapshot.supportsFileShell &&
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

async function runSessionFileFixture(page) {
  return await page.evaluate(
    async ({ command, sessionId, fileName, fileContent }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }

      const requests = [];
      const messages = [];
      let requestId = 1;

      async function callRaw(method, params = {}) {
        const id = `session-files-electron-${requestId++}`;
        requests.push({ id, method, params });
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
        messages.push(...decoded);
        const error = decoded.find(
          (message) => message?.id === id && message.error,
        );
        const result = decoded.find(
          (message) =>
            message?.id === id &&
            Object.prototype.hasOwnProperty.call(message, "result"),
        );
        return { id, method, params, decoded, error, result };
      }

      async function call(method, params = {}) {
        const response = await callRaw(method, params);
        if (response.error) {
          throw new Error(
            `${method} failed: ${JSON.stringify(response.error.error)}`,
          );
        }
        if (!response.result) {
          throw new Error(`${method} did not return a JSON-RPC result`);
        }
        return response.result.result;
      }

      async function callHostCommand(hostCommand, params = {}) {
        const result = await invoke(hostCommand, params);
        return {
          command: hostCommand,
          params,
          result,
        };
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "session-files-electron-fixture",
          version: "1.0.0",
        },
        capabilities: {},
      });
      await invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
      const created = await call("sessionFile/getOrCreate", { sessionId });
      const updatedMeta = await call("sessionFile/updateMeta", {
        sessionId,
        title: "Session Files Electron Fixture",
        theme: "article",
        creationMode: "draft",
      });
      const saved = await call("sessionFile/save", {
        sessionId,
        fileName,
        content: fileContent,
        metadata: {
          source: "session-files-electron-fixture",
          contentPostIntent: "preview",
        },
      });
      const listedAfterSave = await call("sessionFile/list", { sessionId });
      const read = await call("sessionFile/read", { sessionId, fileName });
      const resolvedPath = await call("sessionFile/resolvePath", {
        sessionId,
        fileName,
      });
      const resolvedFilePath = resolvedPath?.path;
      const revealResult = await callHostCommand("reveal_in_finder", {
        path: resolvedFilePath,
      });
      const openResult = await callHostCommand("open_with_default_app", {
        path: resolvedFilePath,
      });
      const deleted = await call("sessionFile/delete", {
        sessionId,
        fileName,
      });
      const listedAfterDelete = await call("sessionFile/list", { sessionId });

      return {
        initialize,
        created,
        updatedMeta,
        saved,
        listedAfterSave,
        read,
        resolvedPath,
        fileShell: {
          revealResult,
          openResult,
        },
        deleted,
        listedAfterDelete,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      sessionId: SESSION_ID,
      fileName: FILE_NAME,
      fileContent: FILE_CONTENT,
    },
  );
}

function assertFixtureResult(result) {
  const requestMethods = result.requests.map((request) => request.method);
  const missingMethods = REQUIRED_METHODS.filter(
    (method) => !requestMethods.includes(method),
  );
  const forbiddenMethods = requestMethods.filter((method) =>
    FORBIDDEN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix)),
  );
  const savedFile = result.saved?.file ?? null;
  const listedAfterSave = Array.isArray(result.listedAfterSave?.files)
    ? result.listedAfterSave.files
    : [];
  const listedAfterDelete = Array.isArray(result.listedAfterDelete?.files)
    ? result.listedAfterDelete.files
    : [];
  const matchedAfterSave = listedAfterSave.find(
    (file) => file?.name === FILE_NAME,
  );
  const matchedAfterDelete = listedAfterDelete.find(
    (file) => file?.name === FILE_NAME,
  );
  const resolvedPath = String(result.resolvedPath?.path ?? "");

  assert(missingMethods.length === 0, `缺少 current 方法: ${missingMethods}`);
  assert(
    forbiddenMethods.length === 0,
    `不应调用旧 session_files_* 方法: ${forbiddenMethods}`,
  );
  assert(result.created?.meta?.sessionId === SESSION_ID, "会话创建结果异常");
  assert(
    result.updatedMeta?.meta?.theme === "article" &&
      result.updatedMeta?.meta?.creationMode === "draft",
    "会话元数据更新结果异常",
  );
  assert(savedFile?.name === FILE_NAME, "保存结果未返回目标文件");
  assert(matchedAfterSave, "保存后 list 未返回目标文件");
  assert(result.read?.content === FILE_CONTENT, "读取内容与保存内容不一致");
  assert(
    resolvedPath.includes(FILE_NAME.split("/").pop()),
    `resolvePath 未返回目标文件路径: ${resolvedPath}`,
  );
  assert(!matchedAfterDelete, "删除后 list 仍返回目标文件");
  assert(!result.errorRaw, `DevBridge error buffer 非空: ${result.errorRaw}`);

  const fileShell = result.fileShell ?? {};
  const revealResult = fileShell.revealResult ?? null;
  const openResult = fileShell.openResult ?? null;
  assert(
    revealResult?.command === "reveal_in_finder",
    "未调用 reveal_in_finder Desktop Host 壳命令",
  );
  assert(
    openResult?.command === "open_with_default_app",
    "未调用 open_with_default_app Desktop Host 壳命令",
  );
  assert(
    revealResult?.params?.path === resolvedPath &&
      openResult?.params?.path === resolvedPath,
    "Desktop Host 文件壳命令未使用 sessionFile/resolvePath 返回路径",
  );
  assertElectronHostEmptyResult("reveal_in_finder", revealResult.result);
  assertElectronHostEmptyResult("open_with_default_app", openResult.result);

  return {
    requestMethods,
    fileShellCommands: [revealResult.command, openResult.command],
    savedFileName: savedFile.name,
    listedAfterSaveCount: listedAfterSave.length,
    listedAfterDeleteCount: listedAfterDelete.length,
    resolvedPath,
    traceCaptured: Boolean(result.traceRaw),
  };
}

function assertElectronHostEmptyResult(command, result) {
  assert(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      Object.keys(result).length === 0,
    `${command} did not return an empty Electron Host result`,
  );
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
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });
  const summary = {
    ok: false,
    scenarioId: "session-files-electron-fixture",
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    sessionId: SESSION_ID,
    fileName: FILE_NAME,
    backendMode: "unavailable",
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    appServerBinary: options.keepTemp
      ? appServerBinary
      : path.basename(appServerBinary),
    requiredMethods: REQUIRED_METHODS,
    fileShellCommands: FILE_SHELL_COMMANDS,
    forbiddenMethodPrefixes: FORBIDDEN_METHOD_PREFIXES,
    rendererSnapshot: null,
    fixtureSummary: null,
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

    logStage("launch-electron");
    const handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    summary.rendererSnapshot = sanitizeJson(handle.rendererSnapshot);

    logStage("invoke-session-files");
    const fixtureResult = await runSessionFileFixture(page);
    rawEvidence.sessionFiles = sanitizeJson(fixtureResult);
    summary.fixtureSummary = sanitizeJson(assertFixtureResult(fixtureResult));

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.consoleErrors = consoleErrors;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(rawEvidencePath, rawEvidence);
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(
      `${LOG_PREFIX} methods=${summary.fixtureSummary.requestMethods.join(",")}`,
    );
    console.log(
      `${LOG_PREFIX} fileShell=${summary.fixtureSummary.fileShellCommands.join(",")}`,
    );
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
