#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "./lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "./lib/electron-dev-sidecar.mjs";

const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-session-history-electron-fixture",
  ),
  prefix: "agent-session-history-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const WORKSPACE_ID = "agent-session-history-electron-workspace";
const SESSION_ID = "agent-session-history-electron-session";
const THREAD_ID = "agent-session-history-electron-thread";
const INITIAL_TITLE = "Electron history fixture";
const UPDATED_TITLE = "Electron history fixture restored";
const REQUIRED_METHODS = [
  "initialize",
  "agentSession/start",
  "agentSession/read",
  "agentSession/update",
  "agentSession/list",
];
const FORBIDDEN_METHODS = ["agentSession/turn/start"];

function printHelp() {
  console.log(`
Agent Session History Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，在 renderer preload bridge 中通过
  app_server_handle_json_lines 调用 App Server JSON-RPC current 会话读写路径，
  验证历史详情 hydrate 所需的 agentSession/read/list/update 形状可用。

边界:
  本脚本显式使用 APP_SERVER_BACKEND_MODE=unavailable；不会调用正式模型后端，
  不提交 agentSession/turn/start，不使用 Tauri / legacy command / mock fallback
  作为成功证据。

用法:
  node scripts/agent-session-history-electron-fixture-smoke.mjs

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
  console.log(`[smoke:agent-session-history-electron-fixture] stage=${stage}`);
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-session-history-electron-"),
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

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${sanitized.length - 2_000} chars]`
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

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

async function runSessionHistoryFixture(page) {
  return await page.evaluate(
    async ({
      command,
      sessionId,
      threadId,
      workspaceId,
      initialTitle,
      updatedTitle,
    }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }

      const requests = [];
      const messages = [];
      let requestId = 1;

      async function call(method, params = {}) {
        const id = `agent-session-history-electron-${requestId++}`;
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
        return result.result;
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "agent-session-history-electron-fixture",
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
      const start = await call("agentSession/start", {
        sessionId,
        threadId,
        appId: "desktop",
        workspaceId,
        businessObjectRef: {
          kind: "agent.session",
          id: `agent-session:${workspaceId}:${sessionId}`,
          title: initialTitle,
          metadata: {
            title: initialTitle,
            model: "fixture-unavailable",
            modelName: "fixture-unavailable",
            executionStrategy: "react",
            runStartHooks: false,
            harness: {
              hiddenFromUserRecents: false,
              source: "smoke:agent-session-history-electron-fixture",
            },
          },
        },
      });
      const firstRead = await call("agentSession/read", {
        sessionId,
        historyLimit: 50,
      });
      const update = await call("agentSession/update", {
        sessionId,
        title: updatedTitle,
        providerSelector: "fixture-provider",
        providerName: "fixture-provider",
        modelName: "fixture-model",
        executionStrategy: "react",
      });
      const secondRead = await call("agentSession/read", {
        sessionId,
        historyLimit: 50,
      });
      const list = await call("agentSession/list", {
        includeArchived: true,
        limit: 20,
      });

      return {
        initialize,
        start,
        firstRead,
        update,
        secondRead,
        list,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      workspaceId: WORKSPACE_ID,
      initialTitle: INITIAL_TITLE,
      updatedTitle: UPDATED_TITLE,
    },
  );
}

function summarizeFixtureResult(result) {
  const requestMethods = Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
  const listedSession = (result?.list?.sessions ?? []).find(
    (session) => session.sessionId === SESSION_ID,
  );
  return {
    requestMethods,
    missingRequiredMethods: REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    forbiddenMethodsSeen: FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ),
    sessionId: result?.start?.session?.sessionId ?? null,
    firstReadSessionId: result?.firstRead?.session?.sessionId ?? null,
    secondReadSessionId: result?.secondRead?.session?.sessionId ?? null,
    listSessionFound: Boolean(listedSession),
    listedSession,
    firstReadDetail: result?.firstRead?.detail ?? null,
    secondReadDetail: result?.secondRead?.detail ?? null,
  };
}

function assertFixtureResult(result) {
  const summary = summarizeFixtureResult(result);
  assert(
    summary.missingRequiredMethods.length === 0,
    `缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.forbiddenMethodsSeen.length === 0,
    `默认 history fixture 不应触发: ${summary.forbiddenMethodsSeen.join(", ")}`,
  );
  assert(
    summary.sessionId === SESSION_ID,
    "agentSession/start sessionId 不正确",
  );
  assert(
    summary.firstReadSessionId === SESSION_ID,
    "首次 agentSession/read sessionId 不正确",
  );
  assert(
    summary.secondReadSessionId === SESSION_ID,
    "更新后 agentSession/read sessionId 不正确",
  );
  assert(summary.listSessionFound, "agentSession/list 未返回 fixture session");
  assert(
    summary.listedSession?.title === UPDATED_TITLE,
    `agentSession/list 未反映更新标题: ${summary.listedSession?.title}`,
  );

  for (const [label, detail] of [
    ["firstRead", summary.firstReadDetail],
    ["secondRead", summary.secondReadDetail],
  ]) {
    assert(detail && typeof detail === "object", `${label} 缺少 detail`);
    assert(Array.isArray(detail.turns), `${label}.detail.turns 不是数组`);
    assert(Array.isArray(detail.items), `${label}.detail.items 不是数组`);
    assert(
      Array.isArray(detail.queued_turns),
      `${label}.detail.queued_turns 不是数组`,
    );
    assert(
      Array.isArray(detail.child_subagent_sessions ?? []),
      `${label}.detail.child_subagent_sessions 不能破坏 hydrate`,
    );
    assert(
      detail.thread_read && typeof detail.thread_read === "object",
      `${label}.detail.thread_read 缺失`,
    );
  }

  return summary;
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
    sessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendMode: "unavailable",
    appServerBinary: options.keepTemp
      ? appServerBinary
      : path.basename(appServerBinary),
    requiredMethods: REQUIRED_METHODS,
    forbiddenMethods: FORBIDDEN_METHODS,
    electronPreloadBridge: false,
    fixtureSummary: null,
    consoleErrors: [],
    screenshot: null,
    rawEvidence: rawEvidencePath,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];

  try {
    logStage("launch-electron");
    app = await electron.launch({
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

    page = await app.firstWindow({ timeout: options.timeoutMs });
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

    logStage("wait-renderer");
    const rendererSnapshot = await waitForRendererReady(page, options);
    summary.electronPreloadBridge =
      rendererSnapshot.electron && rendererSnapshot.hasInvokeBridge;
    await clearInvokeBuffers(page);

    logStage("invoke-session-history");
    const fixtureResult = await runSessionHistoryFixture(page);
    writeJsonFile(rawEvidencePath, sanitizeJson(fixtureResult));
    const fixtureSummary = assertFixtureResult(fixtureResult);
    summary.fixtureSummary = sanitizeJson(fixtureSummary);

    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:agent-session-history-electron-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:agent-session-history-electron-fixture] methods=${fixtureSummary.requestMethods.join(",")}`,
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
        summary.failureScreenshot = failureScreenshotPath;
        writeJsonFile(summaryPath, summary);
      } catch {
        // 截图失败不覆盖原始错误。
      }
    }
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `[smoke:agent-session-history-electron-fixture] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
