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
    "claw-chat-current-fixture",
  ),
  prefix: "claw-chat-current-fixture",
  timeoutMs: 180_000,
  intervalMs: 500,
  keepTemp: false,
  scenario: "complete",
};

const LOG_PREFIX = "[smoke:claw-chat-current-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_METHOD_INITIALIZE = "initialize";
const APP_SERVER_METHOD_INITIALIZED = "initialized";
const APP_SERVER_METHOD_SESSION_START = "agentSession/start";
const APP_SERVER_METHOD_SESSION_UPDATE = "agentSession/update";
const APP_SERVER_METHOD_SESSION_TURN_START = "agentSession/turn/start";
const APP_SERVER_METHOD_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
const APP_SERVER_METHOD_SESSION_READ = "agentSession/read";
const APP_SERVER_METHOD_SESSION_LIST = "agentSession/list";
const APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE = "workspace/default/ensure";
const NEWS_PROMPT = "整理今天的国际新闻";
const ASSISTANT_DONE_TEXT = "CLAW_NEWS_FIXTURE_DONE";
const FIXTURE_PROVIDER = "fixture-provider";
const FIXTURE_MODEL = "fixture-model";
const SESSION_ID = `claw-chat-current-${Date.now()}-${process.pid}`;
const THREAD_ID = `${SESSION_ID}-thread`;
const SESSION_TITLE = "Claw 新闻输入 Electron fixture";

function printHelp() {
  console.log(`
Claw Chat Current Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，通过 GUI 输入框发送“${NEWS_PROMPT}”，
  并验证 Frontend -> Electron IPC -> App Server JSON-RPC -> external fixture backend
  的 current 主链可以完成用户消息、assistant 输出和 read model 收尾。

边界:
  本脚本使用一次性本地 external backend fixture，不调用正式模型后端，不使用
  APP_SERVER_BACKEND_MODE=mock，不走 Tauri / legacy runtime command / renderer
  mock fallback 作为成功证据。

用法:
  node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --scenario <name>      complete | cancel，默认 complete
  --timeout-ms <ms>      总超时，默认 180000
  --interval-ms <ms>     轮询间隔，默认 500
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
    if (arg === "--scenario" && next) {
      options.scenario = next.trim();
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
  if (!["complete", "cancel"].includes(options.scenario)) {
    throw new Error("--scenario 只能是 complete 或 cancel");
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
    path.join(os.tmpdir(), "claw-chat-current-fixture-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const asterRoot = path.join(tempRoot, "aster");
  const backendPath = path.join(tempRoot, "claw-chat-backend.mjs");
  const backendLedgerPath = path.join(tempRoot, "claw-chat-backend.jsonl");
  const cancelSignalPath = path.join(tempRoot, "claw-chat-cancel.signal");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    asterRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);

  return {
    tempRoot,
    electronUserDataDir,
    backendPath,
    backendLedgerPath,
    cancelSignalPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_ASTER_ROOT: asterRoot,
    },
  };
}

function writeFixtureBackend(backendPath) {
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const cancelSignalPath = process.argv[3];
const input = JSON.parse(readFileSync(0, "utf8"));
const asterChatRequest = input.request?.runtimeOptions?.hostOptions?.asterChatRequest;

if (ledgerPath) {
  appendFileSync(ledgerPath, JSON.stringify({
    kind: input.kind,
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    inputText: input.request?.input?.text,
    providerPreference: input.request?.providerPreference,
    modelPreference: input.request?.modelPreference,
    runtimeOptions: input.request?.runtimeOptions,
    asterChatRequest,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

if (input.kind === "turnCancel") {
  if (cancelSignalPath) {
    appendFileSync(cancelSignalPath, JSON.stringify({
      sessionId: input.request?.session?.sessionId,
      turnId: input.request?.turn?.turnId,
      recordedAt: new Date().toISOString()
    }) + "\\n");
  }
  console.log(JSON.stringify({
    events: [
      {
        type: "turn.canceled",
        payload: {
          status: "canceled",
          reason: "user_cancelled"
        }
      }
    ]
  }));
  process.exit(0);
}

if (input.kind === "turnStart") {
  const initialEvents = [
    {
      type: "message.delta",
      payload: {
        text: "以下是今日国际新闻简要整理：\\n"
      }
    }
  ];
  if (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel") {
    console.log(JSON.stringify({ events: initialEvents }));
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120000) {
      try {
        const cancelled = cancelSignalPath ? readFileSync(cancelSignalPath, "utf8").trim() : "";
        if (cancelled) {
          process.exit(0);
        }
      } catch {
        // 等待 turnCancel 写入 signal。
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.error("cancel scenario timed out waiting for turnCancel");
    process.exit(2);
  }

  console.log(JSON.stringify({
    events: [
      ...initialEvents,
      {
        type: "message.delta",
        payload: {
          text: "1. 多国外交议题持续升温，地区安全与经贸协商仍是焦点。\\n2. 全球市场继续关注能源、供应链和主要央行政策变化。\\n3. 国际组织呼吁在气候、粮食与人道援助议题上保持协调。\\n"
        }
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${ASSISTANT_DONE_TEXT}"
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

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function waitForBackendLedgerEntry(filePath, predicate, options) {
  const startedAt = Date.now();
  let lastLedger = [];
  const timeoutMs = Math.min(options.timeoutMs, 10_000);
  while (Date.now() - startedAt < timeoutMs) {
    lastLedger = readJsonl(filePath);
    const matched = lastLedger.find(predicate);
    if (matched) {
      return { entry: matched, ledger: lastLedger };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `external backend ledger 未记录预期事件: ${JSON.stringify(
      sanitizeJson(lastLedger),
    )}`,
  );
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

function collectTraceRequestMethods(traceMessages) {
  return traceMessages
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines).map(
        (message) => message.method,
      ),
    )
    .filter(Boolean);
}

function readTraceMessages(traceRaw) {
  try {
    const parsed = JSON.parse(traceRaw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

async function waitForRendererReady(page, options, onSnapshot) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      title: document.title || "",
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
    onSnapshot?.(snapshot);
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

async function invokeAppServerFromPage(page, method, params = {}, requestLog) {
  requestLog?.push({ method, params: sanitizeJson(params) });
  return await page.evaluate(
    async ({ command, method, params }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const id = `claw-chat-current-${Date.now()}-${Math.random()}`;
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
      const messages = Array.isArray(response?.lines)
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
      const error = messages.find(
        (message) => message?.id === id && message.error,
      );
      if (error) {
        throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
      }
      const result = messages.find(
        (message) =>
          message?.id === id &&
          Object.prototype.hasOwnProperty.call(message, "result"),
      );
      if (!result) {
        throw new Error(`${method} did not return a JSON-RPC result`);
      }
      return {
        result: result.result,
        messages,
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      method,
      params,
    },
  );
}

async function initializeAppServer(page, requestLog) {
  const initialize = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_INITIALIZE,
    {
      clientInfo: {
        name: "claw-chat-current-fixture",
        version: "1.0.0",
      },
      capabilities: { eventMethods: ["agentSession/event"] },
    },
    requestLog,
  );
  requestLog?.push({ method: APP_SERVER_METHOD_INITIALIZED, params: {} });
  await page.evaluate(async (command) => {
    await window.electronAPI.invoke(command, {
      request: {
        lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
      },
    });
  }, APP_SERVER_HANDLE_JSON_LINES_COMMAND);
  return initialize.result;
}

async function ensureDefaultWorkspace(page, requestLog) {
  const ensured = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE,
    {},
    requestLog,
  );
  const workspace = ensured.result?.workspace;
  const workspaceId = String(workspace?.id || "").trim();
  assert(workspaceId, "workspace/default/ensure 未返回可用 workspace.id");
  return {
    workspaceId,
    rootPath: workspace?.rootPath || workspace?.root_path || null,
    workspace,
  };
}

async function bindGuiWorkspaceAndModelPreferences(page, workspaceId) {
  return await page.evaluate(
    ({ workspaceId, sessionId, provider, model }) => {
      const providerKey = `agent_pref_provider_${workspaceId}`;
      const modelKey = `agent_pref_model_${workspaceId}`;
      const migratedKey = `agent_pref_migrated_${workspaceId}`;
      const sessionProviderKey = `agent_topic_model_pref_${workspaceId}_${sessionId}`;
      const sessionWorkspaceKey = `agent_session_workspace_${sessionId}`;
      const lastProjectKey = "agent_last_project_id";

      window.localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      window.localStorage.setItem(providerKey, JSON.stringify(provider));
      window.localStorage.setItem(modelKey, JSON.stringify(model));
      window.localStorage.setItem(migratedKey, JSON.stringify(true));
      window.localStorage.setItem(
        sessionProviderKey,
        JSON.stringify({ providerType: provider, model }),
      );
      window.localStorage.setItem(
        `aster_execution_strategy_${workspaceId}`,
        JSON.stringify("react"),
      );
      window.localStorage.setItem(
        `aster_access_mode_${workspaceId}`,
        JSON.stringify("full-access"),
      );
      window.localStorage.setItem(
        sessionWorkspaceKey,
        JSON.stringify(workspaceId),
      );
      window.dispatchEvent(
        new CustomEvent("agent-persisted-project-id-changed", {
          detail: {
            key: lastProjectKey,
            projectId: workspaceId,
          },
        }),
      );
      window.dispatchEvent(new Event("focus"));

      return {
        lastProject: window.localStorage.getItem(lastProjectKey),
        provider: window.localStorage.getItem(providerKey),
        model: window.localStorage.getItem(modelKey),
        sessionProvider: window.localStorage.getItem(sessionProviderKey),
        sessionWorkspace: window.localStorage.getItem(sessionWorkspaceKey),
      };
    },
    {
      workspaceId,
      sessionId: SESSION_ID,
      provider: FIXTURE_PROVIDER,
      model: FIXTURE_MODEL,
    },
  );
}

async function createFixtureSession(page, workspaceId, requestLog) {
  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      appId: "desktop",
      workspaceId,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspaceId}:${SESSION_ID}`,
        title: SESSION_TITLE,
        metadata: {
          title: SESSION_TITLE,
          executionStrategy: "react",
          runStartHooks: false,
          harness: {
            hiddenFromUserRecents: false,
            source: "smoke:claw-chat-current-fixture",
          },
        },
      },
    },
    requestLog,
  );

  const update = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_UPDATE,
    {
      sessionId: SESSION_ID,
      title: SESSION_TITLE,
      providerSelector: FIXTURE_PROVIDER,
      providerName: FIXTURE_PROVIDER,
      modelName: FIXTURE_MODEL,
      executionStrategy: "react",
      recentAccessMode: "full-access",
      recentPreferences: {
        searchMode: "allowed",
      },
    },
    requestLog,
  );

  return {
    session: session.result,
    update: update.result,
  };
}

async function navigateGuiToWorkspaceScopedAgent(page, options, workspaceId) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let clickedNewConversation = false;

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ workspaceId }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        return {
          url: window.location.href,
          localStorageWorkspace: window.localStorage.getItem(
            "agent_last_project_id",
          ),
          localStorageMatchesWorkspace:
            window.localStorage.getItem("agent_last_project_id") ===
            JSON.stringify(workspaceId),
          hasConversationList: Boolean(recentShelf),
          recentShelfText: recentShelf?.textContent || "",
          hasNewConversationButton: buttons.some((button) =>
            [button.title, button.text, button.aria].some((label) =>
              label.includes("新建对话"),
            ),
          ),
          hasWorkspaceShell: Boolean(
            document.querySelector('[data-testid="agent-chat-workspace"]') ||
            document.querySelector('[data-testid="chat-workspace"]') ||
            document.querySelector(
              '[data-testid="theme-workbench-harness-toggle"]',
            ) ||
            document.querySelector('[data-testid="toggle-harness"]'),
          ),
          bodyText: text,
        };
      },
      { workspaceId },
    );

    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;

    if (
      clickedNewConversation &&
      snapshot.hasConversationList &&
      snapshot.localStorageMatchesWorkspace
    ) {
      return snapshot;
    }

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const newConversationButton = buttons.find((button) => {
        const label = [
          button.getAttribute("title") || "",
          button.getAttribute("aria-label") || "",
          button.textContent || "",
        ].join("\n");
        return label.includes("新建对话");
      });
      if (newConversationButton instanceof HTMLElement) {
        newConversationButton.click();
        return true;
      }
      window.dispatchEvent(new Event("focus"));
      return false;
    });
    clickedNewConversation = clickedNewConversation || clicked;

    await sleep(options.intervalMs);
  }

  throw new Error(
    `GUI 未进入 workspace-scoped Agent 状态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForGuiSessionVisible(page, options) {
  const startedAt = Date.now();
  let lastRefreshAt = 0;
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ title }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        return {
          url: window.location.href,
          hasSessionTitle: text.includes(title),
          hasRecentShelf: Boolean(recentShelf),
          recentShelfText: recentShelf?.textContent || "",
          matchingButtonCount: buttons.filter((button) =>
            [button.title, button.text, button.aria].some((label) =>
              label.includes(title),
            ),
          ).length,
          bodyText: text,
        };
      },
      { title: SESSION_TITLE },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (snapshot.hasSessionTitle || snapshot.matchingButtonCount > 0) {
      return snapshot;
    }
    if (Date.now() - lastRefreshAt > 2_000) {
      lastRefreshAt = Date.now();
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 未显示 Claw fixture 会话: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function openFixtureSessionFromSidebar(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const clicked = await evaluatePageSnapshot(
      page,
      ({ title }) => {
        const candidates = Array.from(document.querySelectorAll("button"));
        const button = candidates.find((candidate) => {
          const label = [
            candidate.getAttribute("title") || "",
            candidate.getAttribute("aria-label") || "",
            candidate.textContent || "",
          ].join("\n");
          return label.includes(title);
        });
        if (!button) {
          const moreButton = candidates.find((candidate) =>
            (candidate.textContent || "").includes("查看更多对话"),
          );
          moreButton?.click();
          return false;
        }
        button.click();
        return true;
      },
      { title: SESSION_TITLE },
    );
    if (clicked) {
      return;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(`侧栏未找到 Claw fixture 会话: ${SESSION_TITLE}`);
}

async function waitForInputReady(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const rect = textarea?.getBoundingClientRect();
      const style = textarea ? window.getComputedStyle(textarea) : null;
      const visible = Boolean(
        textarea &&
        rect &&
        rect.width > 16 &&
        rect.height > 16 &&
        style?.visibility !== "hidden" &&
        style?.display !== "none",
      );
      return {
        url: window.location.href,
        hasTextarea: Boolean(textarea),
        textareaVisible: visible,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaValue:
          textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        hasInputbarCore: Boolean(
          document.querySelector('[data-testid="inputbar-core-container"]'),
        ),
        bodyText: document.body?.innerText || "",
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasTextarea &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw 输入框未就绪: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function sendNewsPromptFromGui(page, options) {
  const before = await waitForInputReady(page, options);
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(NEWS_PROMPT);
  const afterFill = await page.evaluate((prompt) => {
    const input = document.querySelector('textarea[name="agent-chat-message"]');
    return {
      value: input instanceof HTMLTextAreaElement ? input.value : null,
      promptVisibleInTextarea:
        input instanceof HTMLTextAreaElement ? input.value === prompt : false,
    };
  }, NEWS_PROMPT);
  assert(
    afterFill.promptVisibleInTextarea,
    `输入框未保留用户输入: ${JSON.stringify(sanitizeJson(afterFill))}`,
  );

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const sendButton = buttons.find((button) => {
      const label = [
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
        button.textContent || "",
      ].join("\n");
      return (
        (label.includes("发送") || /\bSend\b/i.test(label)) && !button.disabled
      );
    });
    if (sendButton instanceof HTMLElement) {
      sendButton.click();
      return {
        clicked: true,
        label:
          sendButton.getAttribute("aria-label") ||
          sendButton.getAttribute("title") ||
          sendButton.textContent ||
          "send",
      };
    }
    return {
      clicked: false,
      labels: buttons.map((button) =>
        [
          button.getAttribute("aria-label") || "",
          button.getAttribute("title") || "",
          button.textContent || "",
        ].join(" / "),
      ),
    };
  });
  assert(clicked?.clicked, `未找到可点击发送按钮: ${JSON.stringify(clicked)}`);
  return {
    before,
    afterFill,
    clicked,
  };
}

async function waitForGuiChatCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText }) => {
        const text = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const rect = textarea?.getBoundingClientRect();
        const style = textarea ? window.getComputedStyle(textarea) : null;
        const textareaVisible = Boolean(
          textarea &&
          rect &&
          rect.width > 16 &&
          rect.height > 16 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none",
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            disabled: button.disabled,
          }),
        );
        const stopButtonVisible = buttons.some((button) => {
          const label = [button.title, button.text, button.aria].join("\n");
          return (
            !button.disabled &&
            (label.includes("停止") ||
              label.includes("终止") ||
              /\bStop\b/i.test(label))
          );
        });
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("今日国际新闻简要整理"),
          hasDoneText: text.includes(doneText),
          hasEpochFallbackTitle: text.includes("任务 1970/1/1"),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          hasMessageList: Boolean(
            document.querySelector('[data-testid="message-list"]') ||
            document.querySelector('[data-testid="message-list-frame"]'),
          ),
          bodyText: text,
        };
      },
      { prompt: NEWS_PROMPT, doneText: ASSISTANT_DONE_TEXT },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      (snapshot.hasAssistantSummary || snapshot.hasDoneText) &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成新闻输入闭环: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForStopButtonVisibleAndClick(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt }) => {
        const text = document.body?.innerText || "";
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button, index) => {
            const label = [
              button.getAttribute("title") || "",
              button.textContent || "",
              button.getAttribute("aria-label") || "",
            ].join("\n");
            return {
              index,
              label,
              disabled: button.disabled,
              visible: Boolean(
                button.offsetParent ||
                button.getClientRects().length > 0 ||
                window.getComputedStyle(button).position === "fixed",
              ),
              isStop:
                !button.disabled &&
                (label.includes("停止") ||
                  label.includes("终止") ||
                  /\bStop\b/i.test(label)),
            };
          },
        );
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("今日国际新闻简要整理"),
          stopButtons: buttons.filter((button) => button.isStop),
          buttonLabels: buttons
            .filter((button) => button.label.trim().length > 0)
            .slice(0, 80)
            .map((button) => button.label),
          bodyText: text,
        };
      },
      { prompt: NEWS_PROMPT },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (snapshot.stopButtons?.length > 0) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const stopButton = buttons.find((button) => {
          const label = [
            button.getAttribute("title") || "",
            button.textContent || "",
            button.getAttribute("aria-label") || "",
          ].join("\n");
          return (
            !button.disabled &&
            (label.includes("停止") ||
              label.includes("终止") ||
              /\bStop\b/i.test(label))
          );
        });
        if (stopButton instanceof HTMLElement) {
          stopButton.click();
          return {
            clicked: true,
            label:
              stopButton.getAttribute("aria-label") ||
              stopButton.getAttribute("title") ||
              stopButton.textContent ||
              "stop",
          };
        }
        return { clicked: false };
      });
      assert(
        clicked?.clicked,
        `停止按钮出现但点击失败: ${JSON.stringify(sanitizeJson(clicked))}`,
      );
      return {
        beforeClick: sanitizeJson(snapshot),
        clicked: sanitizeJson(clicked),
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未出现停止按钮: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function waitForGuiChatCanceled(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt }) => {
        const text = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const rect = textarea?.getBoundingClientRect();
        const style = textarea ? window.getComputedStyle(textarea) : null;
        const textareaVisible = Boolean(
          textarea &&
          rect &&
          rect.width > 16 &&
          rect.height > 16 &&
          style?.visibility !== "hidden" &&
          style?.display !== "none",
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            disabled: button.disabled,
          }),
        );
        const stopButtonVisible = buttons.some((button) => {
          const label = [button.title, button.text, button.aria].join("\n");
          return (
            !button.disabled &&
            (label.includes("停止") ||
              label.includes("终止") ||
              /\bStop\b/i.test(label))
          );
        });
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("今日国际新闻简要整理"),
          hasStoppedCopy:
            text.includes("已停止") ||
            text.includes("本轮已中止") ||
            /\bStopped\b/i.test(text) ||
            /\bCanceled\b/i.test(text),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          bodyText: text,
        };
      },
      { prompt: NEWS_PROMPT },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成取消闭环: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function waitForSessionReadCompleted(page, options, requestLog) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (
      serialized.includes(NEWS_PROMPT) &&
      (serialized.includes(ASSISTANT_DONE_TEXT) ||
        serialized.includes("今日国际新闻简要整理"))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成新闻输入闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

async function waitForSessionReadCanceled(page, options, requestLog) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (serialized.includes(NEWS_PROMPT) && serialized.includes("canceled")) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成取消闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

function summarizeBackendLedger(backendLedger) {
  const turnStartEntries = backendLedger.filter(
    (entry) => entry.kind === "turnStart",
  );
  const turnCancelEntries = backendLedger.filter(
    (entry) => entry.kind === "turnCancel",
  );
  const latestTurnStart = turnStartEntries.at(-1) ?? null;
  const latestTurnCancel = turnCancelEntries.at(-1) ?? null;
  const asterChatRequest = latestTurnStart?.asterChatRequest ?? null;
  return {
    kinds: backendLedger.map((entry) => entry.kind),
    turnStartCount: turnStartEntries.length,
    turnCancelCount: turnCancelEntries.length,
    latestTurnStart: latestTurnStart
      ? sanitizeJson({
          sessionId: latestTurnStart.sessionId,
          turnId: latestTurnStart.turnId,
          inputText: latestTurnStart.inputText,
          providerPreference: latestTurnStart.providerPreference,
          modelPreference: latestTurnStart.modelPreference,
          searchMode: asterChatRequest?.search_mode ?? null,
          webSearch: Object.prototype.hasOwnProperty.call(
            asterChatRequest || {},
            "web_search",
          )
            ? asterChatRequest.web_search
            : null,
        })
      : null,
    latestTurnCancel: latestTurnCancel
      ? sanitizeJson({
          sessionId: latestTurnCancel.sessionId,
          turnId: latestTurnCancel.turnId,
        })
      : null,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const backendLedgerEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-ledger.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-chat.png`,
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
  const appServerRequests = [];
  const summary = {
    ok: false,
    scenarioId: "claw-chat-current-fixture",
    scenario: options.scenario,
    prompt: NEWS_PROMPT,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    workspaceId: null,
    workspace: null,
    provider: FIXTURE_PROVIDER,
    model: FIXTURE_MODEL,
    appUrl: options.appUrl || null,
    checkedAt: new Date().toISOString(),
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLedgerPath: options.keepTemp ? runtimeEnv.backendLedgerPath : null,
    backendLedger: backendLedgerEvidencePath,
    screenshot: null,
    consoleErrors: [],
    rendererSnapshot: null,
    initialize: null,
    guiWorkspaceBinding: null,
    sessionCreation: null,
    guiWorkspaceNavigation: null,
    guiSessionVisible: null,
    inputSend: null,
    guiCompleted: null,
    stopClick: null,
    guiCanceled: null,
    readModelCompleted: null,
    readModelCanceled: null,
    assertions: {},
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];

  try {
    if (options.appUrl) {
      logStage("wait-app-url");
      summary.rendererDevServer = sanitizeJson(
        await waitForAppUrlReady(options),
      );
    }

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
          runtimeEnv.cancelSignalPath,
        ]),
        APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
        CLAW_CHAT_FIXTURE_SCENARIO: options.scenario,
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
        LIME_REAL_API_TEST: "0",
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
    const rendererSnapshot = await waitForRendererReady(
      page,
      options,
      (snapshot) => {
        summary.rendererSnapshot = sanitizeJson(snapshot);
      },
    );
    summary.rendererSnapshot = sanitizeJson(rendererSnapshot);
    await clearInvokeBuffers(page);

    logStage("initialize-app-server");
    summary.initialize = sanitizeJson(
      await initializeAppServer(page, appServerRequests),
    );

    logStage("ensure-default-workspace");
    const workspace = await ensureDefaultWorkspace(page, appServerRequests);
    summary.workspaceId = workspace.workspaceId;
    summary.workspace = sanitizeJson(workspace);

    logStage("bind-gui-workspace-model");
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceAndModelPreferences(page, workspace.workspaceId),
    );

    logStage("create-fixture-session");
    const sessionCreation = await createFixtureSession(
      page,
      workspace.workspaceId,
      appServerRequests,
    );
    summary.sessionCreation = sanitizeJson({
      sessionId:
        sessionCreation.session?.session?.sessionId ??
        sessionCreation.session?.sessionId ??
        null,
      updatedSessionId:
        sessionCreation.update?.session?.sessionId ??
        sessionCreation.update?.sessionId ??
        null,
    });

    logStage("verify-session-list");
    const sessionList = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      {
        includeArchived: true,
        workspaceId: workspace.workspaceId,
        limit: 20,
      },
      appServerRequests,
    );
    summary.sessionListVisibility = sanitizeJson({
      count: Array.isArray(sessionList.result?.sessions)
        ? sessionList.result.sessions.length
        : null,
      containsFixtureSession: Array.isArray(sessionList.result?.sessions)
        ? sessionList.result.sessions.some(
            (session) =>
              session?.sessionId === SESSION_ID ||
              session?.session_id === SESSION_ID ||
              session?.id === SESSION_ID,
          )
        : false,
    });

    logStage("navigate-gui-workspace");
    summary.guiWorkspaceNavigation = sanitizeJson(
      await navigateGuiToWorkspaceScopedAgent(
        page,
        options,
        workspace.workspaceId,
      ),
    );

    logStage("open-session-from-sidebar");
    summary.guiSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(page, options),
    );
    await openFixtureSessionFromSidebar(page, options);

    logStage("send-news-prompt-from-gui");
    summary.inputSend = sanitizeJson(
      await sendNewsPromptFromGui(page, options),
    );

    if (options.scenario === "cancel") {
      logStage("click-stop-from-gui");
      summary.stopClick = sanitizeJson(
        await waitForStopButtonVisibleAndClick(page, options),
      );

      logStage("wait-gui-canceled");
      summary.guiCanceled = sanitizeJson(
        await waitForGuiChatCanceled(page, options),
      );

      logStage("wait-read-model-canceled");
      const readModelCanceled = await waitForSessionReadCanceled(
        page,
        options,
        appServerRequests,
      );
      summary.readModelCanceled = sanitizeJson({
        detailItemCount: Array.isArray(readModelCanceled?.detail?.items)
          ? readModelCanceled.detail.items.length
          : null,
        latestTurnStatus:
          readModelCanceled?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus ??
          readModelCanceled?.detail?.thread_read?.status ??
          readModelCanceled?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(readModelCanceled || {}).includes(
          NEWS_PROMPT,
        ),
        includesCanceled: JSON.stringify(readModelCanceled || {}).includes(
          "canceled",
        ),
      });
      const cancelLedger = await waitForBackendLedgerEntry(
        runtimeEnv.backendLedgerPath,
        (entry) => entry.kind === "turnCancel",
        options,
      );
      summary.backendCancelObserved = sanitizeJson({
        sessionId: cancelLedger.entry.sessionId,
        turnId: cancelLedger.entry.turnId,
        ledgerCount: cancelLedger.ledger.length,
      });
    } else {
      logStage("wait-gui-completed");
      summary.guiCompleted = sanitizeJson(
        await waitForGuiChatCompleted(page, options),
      );

      logStage("wait-read-model-completed");
      const readModelCompleted = await waitForSessionReadCompleted(
        page,
        options,
        appServerRequests,
      );
      summary.readModelCompleted = sanitizeJson({
        detailItemCount: Array.isArray(readModelCompleted?.detail?.items)
          ? readModelCompleted.detail.items.length
          : null,
        latestTurnStatus:
          readModelCompleted?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus ??
          readModelCompleted?.detail?.thread_read?.status ??
          readModelCompleted?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(readModelCompleted || {}).includes(
          NEWS_PROMPT,
        ),
        includesAssistantDone: JSON.stringify(
          readModelCompleted || {},
        ).includes(ASSISTANT_DONE_TEXT),
        includesAssistantSummary: JSON.stringify(
          readModelCompleted || {},
        ).includes("今日国际新闻简要整理"),
      });
    }

    const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
    writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));
    const backendSummary = summarizeBackendLedger(backendLedger);
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const errorRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_error_buffer_v1"),
    );
    const traceMessages = readTraceMessages(traceRaw);
    const appServerRequestMethods = Array.from(
      new Set(
        [
          ...appServerRequests.map((request) => request.method),
          ...collectTraceRequestMethods(traceMessages),
        ].filter(Boolean),
      ),
    );
    const latestTurnStart = backendLedger
      .filter((entry) => entry.kind === "turnStart")
      .at(-1);
    const latestTurnCancel = backendLedger
      .filter((entry) => entry.kind === "turnCancel")
      .at(-1);
    const asterChatRequest = latestTurnStart?.asterChatRequest ?? {};
    const assertions = {
      electronPreloadBridge: rendererSnapshot.electron === true,
      appServerJsonRpcUsed: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_TURN_START,
      ),
      usedCurrentSessionStart: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_START,
      ),
      usedCurrentSessionRead: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_READ,
      ),
      usedCurrentSessionList: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_LIST,
      ),
      usedCurrentTurnCancel:
        options.scenario !== "cancel" ||
        appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_CANCEL),
      externalFixtureBackendUsed: backendLedger.some(
        (entry) => entry.kind === "turnStart",
      ),
      externalFixtureCancelUsed:
        options.scenario !== "cancel" ||
        backendLedger.some((entry) => entry.kind === "turnCancel"),
      fixturePromptReachedBackend: latestTurnStart?.inputText === NEWS_PROMPT,
      fixtureCancelReachedBackend:
        options.scenario !== "cancel" ||
        (latestTurnCancel?.sessionId === SESSION_ID &&
          typeof latestTurnCancel?.turnId === "string" &&
          latestTurnCancel.turnId.trim().length > 0),
      liveProviderNotUsed: backendLedger.every(
        (entry) =>
          entry.kind !== "turnStart" ||
          (entry.providerPreference === FIXTURE_PROVIDER &&
            entry.modelPreference === FIXTURE_MODEL),
      ),
      newsRequestDidNotForceRequiredSearch:
        asterChatRequest?.search_mode !== "required",
      newsRequestDidNotPassLegacyWebSearchFlag:
        !Object.prototype.hasOwnProperty.call(
          asterChatRequest || {},
          "web_search",
        ),
      guiUserMessageVisible:
        options.scenario === "cancel"
          ? summary.guiCanceled?.hasPrompt === true
          : summary.guiCompleted?.hasPrompt === true,
      guiAssistantOutputVisible:
        options.scenario === "cancel"
          ? summary.guiCanceled?.hasStoppedCopy === true
          : summary.guiCompleted?.hasAssistantSummary === true ||
            summary.guiCompleted?.hasDoneText === true,
      guiInputRemainsReady:
        options.scenario === "cancel"
          ? summary.guiCanceled?.textareaVisible === true &&
            summary.guiCanceled?.textareaDisabled === false
          : summary.guiCompleted?.textareaVisible === true &&
            summary.guiCompleted?.textareaDisabled === false,
      guiNotStuckStreaming:
        options.scenario === "cancel"
          ? summary.guiCanceled?.stopButtonVisible === false
          : summary.guiCompleted?.stopButtonVisible === false,
      guiStopClicked:
        options.scenario !== "cancel" ||
        summary.stopClick?.clicked?.clicked === true,
      noEpochFallbackTitle:
        options.scenario === "cancel" ||
        summary.guiCompleted?.hasEpochFallbackTitle === false,
      readModelCompleted:
        options.scenario === "cancel" ||
        (summary.readModelCompleted?.includesPrompt === true &&
          (summary.readModelCompleted?.includesAssistantDone === true ||
            summary.readModelCompleted?.includesAssistantSummary === true)),
      readModelCanceled:
        options.scenario !== "cancel" ||
        (summary.readModelCanceled?.includesPrompt === true &&
          summary.readModelCanceled?.includesCanceled === true),
      pageMentionsPromptAndAssistant:
        options.scenario === "cancel"
          ? pageText.includes(NEWS_PROMPT) &&
            (pageText.includes("已停止") ||
              pageText.includes("本轮已中止") ||
              /\bStopped\b/i.test(pageText) ||
              /\bCanceled\b/i.test(pageText))
          : pageText.includes(NEWS_PROMPT) &&
            (pageText.includes("今日国际新闻简要整理") ||
              pageText.includes(ASSISTANT_DONE_TEXT)),
      noInvokeErrors: !errorRaw,
      noConsoleErrors: consoleErrors.length === 0,
    };

    for (const [key, passed] of Object.entries(assertions)) {
      assert(passed, `断言失败: ${key}`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;
    summary.appServerRequestMethods = appServerRequestMethods;
    summary.backend = sanitizeJson(backendSummary);
    summary.assertions = assertions;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} pass session=${SESSION_ID}`);
  } catch (error) {
    try {
      if (page) {
        const traceRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        );
        const errorRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_error_buffer_v1"),
        );
        summary.invokeTrace = sanitizeJson(readTraceMessages(traceRaw));
        summary.invokeErrors = sanitizeJson(
          (() => {
            try {
              return JSON.parse(errorRaw || "[]");
            } catch {
              return errorRaw;
            }
          })(),
        );
      }
    } catch (traceError) {
      summary.invokeTraceError = sanitizeText(traceError);
    }
    try {
      const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
      writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));
      summary.backend = sanitizeJson(summarizeBackendLedger(backendLedger));
    } catch (ledgerError) {
      summary.backendLedgerError = sanitizeText(ledgerError);
    }
    summary.error = sanitizeText(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    summary.consoleErrors = consoleErrors;
    try {
      if (page) {
        await page.screenshot({ path: failureScreenshotPath, fullPage: true });
        summary.screenshot = failureScreenshotPath;
      }
    } catch (screenshotError) {
      summary.screenshotError = sanitizeText(screenshotError);
    }
    writeJsonFile(summaryPath, summary);
    console.error(summary.error);
    console.error(`${LOG_PREFIX} failureSummary=${summaryPath}`);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

await run();
