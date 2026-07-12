#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";

const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-session-messages-electron-fixture",
  ),
  prefix: "agent-session-messages-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const WORKSPACE_ID = "agent-session-messages-electron-workspace";
const SESSION_ID = "agent-session-messages-electron-session";
const THREAD_ID = "agent-session-messages-electron-thread";
const TURN_ID = "agent-session-messages-electron-turn";
const USER_TEXT = "请整理一条 Electron App Server messages fixture";
const ASSISTANT_TEXT = "已整理 Electron App Server messages fixture。";
const REQUIRED_METHODS = [
  "initialize",
  "agentSession/start",
  "agentSession/turn/start",
  "agentSession/read",
];

function printHelp() {
  console.log(`
Agent Session Messages Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，通过 preload bridge 调用
  app_server_handle_json_lines，并在一次性 external backend fixture 返回
  message.delta 后，验证 agentSession/read.detail.messages / messages_count
  可经 Electron IPC -> App Server JSON-RPC current 主链读回。

边界:
  external backend 只作为本脚本一次性可观测执行器，不是生产 fallback；
  不使用 legacy runtime commands、default mock、renderer mock 或 mock backend
  作为成功证据。

用法:
  node scripts/smoke/agent-session-messages-electron-fixture-smoke.mjs

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
  console.log(`[smoke:agent-session-messages-electron-fixture] stage=${stage}`);
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

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-session-messages-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const backendPath = path.join(tempRoot, "agent-session-messages-backend.mjs");
  const backendLedgerPath = path.join(
    tempRoot,
    "agent-session-messages-backend-ledger.jsonl",
  );

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);

  return {
    tempRoot,
    backendPath,
    backendLedgerPath,
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

function writeFixtureBackend(backendPath) {
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8"));

if (ledgerPath) {
  appendFileSync(ledgerPath, JSON.stringify({
    kind: input.kind,
    request: input.request,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

if (input.kind === "turnStart") {
  console.log(JSON.stringify({
    events: [
      {
        type: "message.delta",
        payload: {
          backend: "agent-session-messages-electron-fixture",
          text: "${ASSISTANT_TEXT}"
        }
      }
    ]
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
    { mode: 0o755 },
  );
}

function readBackendLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }
  return fs
    .readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

async function runSessionMessagesFixture(page, options) {
  return await page.evaluate(
    async ({
      command,
      sessionId,
      threadId,
      turnId,
      workspaceId,
      userText,
      assistantText,
      timeoutMs,
      intervalMs,
    }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }

      const requests = [];
      const messages = [];
      const readSnapshots = [];
      let requestId = 1;

      async function call(method, params = {}) {
        const id = `agent-session-messages-electron-${requestId++}`;
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

      function messageText(message) {
        return (Array.isArray(message?.content) ? message.content : [])
          .map((part) => {
            if (!part || typeof part !== "object") {
              return "";
            }
            return typeof part.text === "string" ? part.text : "";
          })
          .join("")
          .trim();
      }

      function readModelConverged(read) {
        const detail = read?.detail ?? null;
        const detailMessages = Array.isArray(detail?.messages)
          ? detail.messages
          : [];
        return (
          detail?.messages_count === 2 &&
          detailMessages.length === 2 &&
          detailMessages.some(
            (message) =>
              message?.role === "user" && messageText(message) === userText,
          ) &&
          detailMessages.some(
            (message) =>
              message?.role === "assistant" &&
              messageText(message) === assistantText,
          )
        );
      }

      async function waitForReadModel() {
        const startedAt = Date.now();
        let latestRead = null;
        while (Date.now() - startedAt < timeoutMs) {
          latestRead = await call("agentSession/read", {
            sessionId,
            historyLimit: 50,
          });
          readSnapshots.push({
            elapsedMs: Date.now() - startedAt,
            messagesCount: latestRead?.detail?.messages_count ?? null,
            messagesLength: Array.isArray(latestRead?.detail?.messages)
              ? latestRead.detail.messages.length
              : null,
          });
          if (readModelConverged(latestRead)) {
            return latestRead;
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        return latestRead;
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "agent-session-messages-electron-fixture",
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
          title: "Electron messages fixture",
          metadata: {
            title: "Electron messages fixture",
            runStartHooks: false,
            harness: {
              hiddenFromUserRecents: true,
              source: "smoke:agent-session-messages-electron-fixture",
            },
          },
        },
      });
      const turn = await call("agentSession/turn/start", {
        sessionId,
        turnId,
        input: {
          text: userText,
          attachments: [],
        },
        runtimeOptions: {
          eventName: "agent-session-messages-electron-fixture",
          runtimeRequest: {
            providerConfig: {
              providerName: "fixture-provider",
              modelName: "fixture-model",
            },
          },
        },
        queueIfBusy: false,
        skipPreSubmitResume: false,
      });
      const read = await waitForReadModel();

      return {
        initialize,
        start,
        turn,
        read,
        readSnapshots,
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
      turnId: TURN_ID,
      workspaceId: WORKSPACE_ID,
      userText: USER_TEXT,
      assistantText: ASSISTANT_TEXT,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    },
  );
}

function contentTextFromMessage(message) {
  return (Array.isArray(message?.content) ? message.content : [])
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

function summarizeFixtureResult(result, backendLedger) {
  const requestMethods = Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
  const detail = result?.read?.detail ?? null;
  const detailMessages = Array.isArray(detail?.messages) ? detail.messages : [];
  const userMessage = detailMessages.find(
    (message) => message?.role === "user",
  );
  const assistantMessage = detailMessages.find(
    (message) => message?.role === "assistant",
  );
  return {
    requestMethods,
    missingRequiredMethods: REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    sessionId: result?.start?.session?.sessionId ?? null,
    turnId: result?.turn?.turn?.turnId ?? null,
    readSessionId: result?.read?.session?.sessionId ?? null,
    detailMessagesCount: detail?.messages_count ?? null,
    detailMessagesLength: detailMessages.length,
    userMessageText: contentTextFromMessage(userMessage),
    assistantMessageText: contentTextFromMessage(assistantMessage),
    backendKinds: backendLedger.map((entry) => entry.kind),
    backendTurnStartSeen: backendLedger.some(
      (entry) => entry.kind === "turnStart",
    ),
  };
}

function assertFixtureResult(result, backendLedger) {
  const summary = summarizeFixtureResult(result, backendLedger);
  assert(
    summary.missingRequiredMethods.length === 0,
    `缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.sessionId === SESSION_ID,
    "agentSession/start sessionId 不正确",
  );
  assert(summary.turnId === TURN_ID, "agentSession/turn/start turnId 不正确");
  assert(
    summary.readSessionId === SESSION_ID,
    "agentSession/read sessionId 不正确",
  );
  assert(summary.backendTurnStartSeen, "external backend 未收到 turnStart");
  assert(
    summary.detailMessagesCount === 2,
    `agentSession/read.detail.messages_count 应为 2，实际为 ${summary.detailMessagesCount}`,
  );
  assert(
    summary.detailMessagesLength === 2,
    `agentSession/read.detail.messages 应有 2 条，实际为 ${summary.detailMessagesLength}`,
  );
  assert(
    summary.userMessageText === USER_TEXT,
    `用户消息未从 App Server detail.messages 恢复: ${summary.userMessageText}`,
  );
  assert(
    summary.assistantMessageText === ASSISTANT_TEXT,
    `助手消息未从 message.delta 投影: ${summary.assistantMessageText}`,
  );
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
  const backendLedgerEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-ledger.json`,
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
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: runtimeEnv.env,
  });
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    workspaceId: WORKSPACE_ID,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLedgerPath: options.keepTemp ? runtimeEnv.backendLedgerPath : null,
    backendMode: "external",
    requiredMethods: REQUIRED_METHODS,
    electronPreloadBridge: false,
    fixtureSummary: null,
    consoleErrors: [],
    screenshot: null,
    rawEvidence: rawEvidencePath,
    backendLedgerEvidence: backendLedgerEvidencePath,
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
        APP_SERVER_BACKEND_MODE: "external",
        APP_SERVER_BACKEND_COMMAND: process.execPath,
        APP_SERVER_BACKEND_ARGS: JSON.stringify([
          runtimeEnv.backendPath,
          runtimeEnv.backendLedgerPath,
        ]),
        APP_SERVER_BACKEND_TIMEOUT_MS: "5000",
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

    logStage("invoke-session-messages");
    const fixtureResult = await runSessionMessagesFixture(page, options);
    const backendLedger = readBackendLedger(runtimeEnv.backendLedgerPath);
    writeJsonFile(rawEvidencePath, sanitizeJson(fixtureResult));
    writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));
    const fixtureSummary = assertFixtureResult(fixtureResult, backendLedger);
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
      `[smoke:agent-session-messages-electron-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:agent-session-messages-electron-fixture] messages=${fixtureSummary.detailMessagesLength}`,
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
        // ignore screenshot failure
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
    `[smoke:agent-session-messages-electron-fixture] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
