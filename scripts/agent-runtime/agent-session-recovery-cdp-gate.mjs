#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron, chromium } from "playwright";

import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import { ensureElectronFixtureBuild } from "../lib/electron-fixture-build.mjs";
import { createTempRuntimeEnv } from "./claw-chat-current-fixture-backend-file.mjs";
import {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  APP_SERVER_METHOD_INITIALIZED,
  APP_SERVER_METHOD_INITIALIZE,
  APP_SERVER_METHOD_SESSION_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_THREAD_RESUME,
  APP_SERVER_METHOD_SESSION_UPDATE,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  openSessionFromSidebar,
  navigateGuiToWorkspaceScopedAgent,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  bindGuiWorkspaceAndModelPreferences,
  clearInvokeBuffers,
  collectTraceRequestMethods,
  decodeJsonRpcLines,
  initializeAppServer,
  invokeAppServerFromPage,
  readTraceMessages,
  waitForAppUrlReady,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  assert,
  cleanupTempRoot,
  sanitizeJson,
  sanitizeText,
  sleep,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

const LOG_PREFIX = "[cdp:agent-session-recovery]";
const DEFAULTS = {
  appUrl: "",
  cdpPort: 9223,
  cdpUrl: "",
  evidenceDir: path.join(process.cwd(), ".lime", "cdp-evidence"),
  prefix: "agent-session-recovery-cdp-gate",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};
const SESSION_ID = "agent-session-recovery-cdp-gate-session";
const THREAD_ID = "agent-session-recovery-cdp-gate-thread";
const SESSION_TITLE = "Agent recovery CDP Gate session";

function printHelp() {
  console.log(`
Agent Session Recovery CDP Gate

用途:
  启动真实 Electron Desktop Host，打开 CDP 端口，再通过
  chromium.connectOverCDP 连接真实 Electron renderer，验证:
  window.__LIME_ELECTRON__、preload invoke、app_server_handle_json_lines、
  agentSession/start/read/list current JSON-RPC 主链。

边界:
  默认 APP_SERVER_BACKEND_MODE=unavailable，不触发 agentSession/turn/start，
  不调用正式模型后端，不使用 App Server mock backend 或 renderer mock fallback。

用法:
  node scripts/agent-runtime/agent-session-recovery-cdp-gate.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --cdp-port <port>      Electron remote debugging port，默认 ${DEFAULTS.cdpPort}
  --cdp-url <url>        显式 CDP endpoint；默认由 cdp-port 生成
  --evidence-dir <path>  证据目录，默认 .lime/cdp-evidence
  --prefix <name>        证据文件前缀
  --timeout-ms <ms>      总超时，默认 ${DEFAULTS.timeoutMs}
  --interval-ms <ms>     轮询间隔，默认 ${DEFAULTS.intervalMs}
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
    if (arg === "--cdp-port" && next) {
      options.cdpPort = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--cdp-url" && next) {
      options.cdpUrl = next.trim();
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
  if (!Number.isFinite(options.cdpPort) || options.cdpPort < 1) {
    throw new Error("--cdp-port 必须是有效端口");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.cdpUrl) {
    options.cdpUrl = `http://127.0.0.1:${options.cdpPort}`;
  }
  return options;
}

function logStage(stage) {
  console.log(`${LOG_PREFIX} stage=${stage}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return await response.json();
}

async function waitForCdpEndpoint(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const [version, targets] = await Promise.all([
        fetchJson(`${options.cdpUrl}/json/version`),
        fetchJson(`${options.cdpUrl}/json/list`),
      ]);
      return {
        url: options.cdpUrl,
        waitedMs: Date.now() - startedAt,
        version: summarizeCdpVersion(version),
        targets: summarizeCdpTargets(targets),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(options.intervalMs);
    }
  }
  throw new Error(`Electron CDP endpoint 未就绪: ${lastError}`);
}

function summarizeCdpVersion(version) {
  return sanitizeJson({
    browser: version?.Browser ?? version?.browser ?? null,
    protocolVersion: version?.["Protocol-Version"] ?? null,
    userAgent: version?.["User-Agent"] ?? null,
    webSocketDebuggerUrl: version?.webSocketDebuggerUrl ? "present" : null,
  });
}

function summarizeCdpTargets(targets) {
  return (Array.isArray(targets) ? targets : []).map((target) =>
    sanitizeJson({
      id: target?.id ?? null,
      type: target?.type ?? null,
      title: target?.title ?? null,
      url: target?.url ?? null,
    }),
  );
}

async function findElectronCdpPage(browser, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const page of pages) {
      const snapshot = await page
        .evaluate(() => ({
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
        }))
        .catch(() => null);
      lastSnapshot = snapshot;
      if (
        snapshot?.electron &&
        snapshot.hasInvokeBridge &&
        snapshot.supportsAppServer
      ) {
        return page;
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `未找到真实 Electron renderer CDP 页签: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

function summarizeTraceMessages(traceMessages) {
  const appServerEntries = traceMessages.filter(
    (entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  const methodEntries = appServerEntries.flatMap((entry) =>
    decodeJsonRpcLines(entry?.args_preview?.request?.lines).map((message) => ({
      command: entry.command ?? null,
      transport: entry.transport ?? null,
      status: entry.status ?? null,
      method: message.method ?? null,
      id: message.id ?? null,
      sessionId: message.params?.sessionId ?? message.params?.session_id ?? null,
      threadId: message.params?.threadId ?? message.params?.thread_id ?? null,
      turnId: message.params?.turnId ?? message.params?.turn_id ?? null,
      promptLength:
        typeof message.params?.input?.text === "string"
          ? message.params.input.text.length
          : null,
    })),
  );
  return sanitizeJson({
    entryCount: traceMessages.length,
    appServerEntryCount: appServerEntries.length,
    methods: Array.from(new Set(collectTraceRequestMethods(traceMessages))),
    electronIpcSuccessCount: methodEntries.filter(
      (entry) =>
        entry.transport === "electron-ipc" && entry.status === "success",
    ).length,
    methodEntries,
  });
}

async function readRendererTrace(page) {
  const raw = await page.evaluate(() =>
    window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
  );
  return readTraceMessages(raw);
}

async function waitForProductTraceMethods(page, options, requiredMethods) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const traceMessages = await readRendererTrace(page);
    const summary = summarizeTraceMessages(traceMessages);
    lastSummary = summary;
    const methods = new Set(summary.methods ?? []);
    const hasRequiredMethods = requiredMethods.every((method) =>
      methods.has(method),
    );
    if (
      hasRequiredMethods &&
      (summary.electronIpcSuccessCount ?? 0) > 0 &&
      (summary.appServerEntryCount ?? 0) > 0
    ) {
      return summary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `未观察到 renderer safeInvoke 产品路径 trace: required=${requiredMethods.join(
      ", ",
    )}; last=${JSON.stringify(sanitizeJson(lastSummary))}`,
  );
}

async function startProbeSession(page, workspace, requestLog) {
  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      appId: "desktop",
      workspaceId: workspace.workspaceId,
      workingDir: workspace.rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspace.workspaceId}:${SESSION_ID}`,
        title: SESSION_TITLE,
        metadata: {
          title: SESSION_TITLE,
          workingDir: workspace.rootPath,
          working_dir: workspace.rootPath,
          executionStrategy: "react",
          runStartHooks: false,
          harness: {
            hiddenFromUserRecents: false,
            source: "cdp:agent-session-recovery",
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
      providerSelector: "fixture-provider",
      providerName: "fixture-provider",
      modelName: "fixture-model",
      executionStrategy: "react",
      recentAccessMode: "full-access",
    },
    requestLog,
  );
  return {
    session: session.result,
    update: update.result,
  };
}

function summarizeSessionRead(result) {
  return sanitizeJson({
    sessionId:
      result?.session?.sessionId ??
      result?.session?.session_id ??
      result?.sessionId ??
      null,
    threadId:
      result?.thread?.threadId ??
      result?.thread?.thread_id ??
      result?.threadId ??
      null,
    title: result?.session?.title ?? result?.title ?? null,
    itemCount: Array.isArray(result?.items)
      ? result.items.length
      : Array.isArray(result?.thread?.items)
        ? result.thread.items.length
        : null,
    turnCount: Array.isArray(result?.turns)
      ? result.turns.length
      : Array.isArray(result?.thread?.turns)
        ? result.thread.turns.length
        : null,
    activeTurnId:
      result?.activeTurnId ??
      result?.active_turn_id ??
      result?.thread?.activeTurnId ??
      result?.thread?.active_turn_id ??
      null,
  });
}

function summarizeSessionList(result) {
  const sessions = Array.isArray(result?.sessions)
    ? result.sessions
    : Array.isArray(result?.items)
      ? result.items
      : [];
  const matched = sessions.find(
    (session) =>
      session?.sessionId === SESSION_ID || session?.session_id === SESSION_ID,
  );
  return sanitizeJson({
    count: sessions.length,
    matched: matched
      ? {
          sessionId: matched.sessionId ?? matched.session_id ?? null,
          title: matched.title ?? null,
          status: matched.status ?? matched.state ?? null,
          latestTurnStatus:
            matched.latestTurnStatus ?? matched.latest_turn_status ?? null,
        }
      : null,
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  ensureElectronFixtureBuild({
    appUrl: options.appUrl,
    logPrefix: LOG_PREFIX,
    rootDir: process.cwd(),
  });
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-screenshot.png`,
  );
  const tracePath = path.join(
    options.evidenceDir,
    `${options.prefix}-trace-summary.json`,
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
  const requestLog = [];
  const consoleErrors = [];
  const summary = {
    ok: false,
    scenarioId: "agent-session-recovery-cdp-gate",
    proofLevel: "Gate B",
    claimBoundary:
      "真实 Electron CDP attach + preload IPC + app_server_handle_json_lines + agentSession start/read/list；不证明 live Provider turn 输出。",
    appUrl: options.appUrl || null,
    cdpUrl: options.cdpUrl,
    cdpPort: options.cdpPort,
    backendMode: "unavailable",
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    checkedAt: new Date().toISOString(),
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    rendererSnapshot: null,
    cdpEndpoint: null,
    cdpPage: null,
    initialize: null,
    workspace: null,
    sessionCreation: null,
    sessionRead: null,
    sessionList: null,
    optionalThreadResume: null,
    traceSummary: null,
    traceSummaryPath: tracePath,
    screenshot: null,
    consoleErrors,
    assertions: {},
  };

  let app = null;
  let browser = null;
  try {
    if (options.appUrl) {
      logStage("wait-app-url");
      summary.rendererDevServer = await waitForAppUrlReady(options);
    }

    logStage("launch-electron");
    app = await electron.launch({
      executablePath: electronPath,
      args: [
        `--remote-debugging-port=${options.cdpPort}`,
        "--use-mock-keychain",
        ".",
      ],
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        ...appServerEnv,
        APP_SERVER_BACKEND_MODE: "unavailable",
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
        LIME_REAL_API_TEST: "0",
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
        LIME_ELECTRON_REMOTE_DEBUGGING_PORT: String(options.cdpPort),
        ...(options.appUrl ? { VITE_DEV_SERVER_URL: options.appUrl } : {}),
      },
      timeout: options.timeoutMs,
    });
    app.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeText(message.text()));
      }
    });

    const firstWindow = await app.firstWindow({ timeout: options.timeoutMs });
    firstWindow.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeText(message.text()));
      }
    });
    firstWindow.setDefaultTimeout(options.timeoutMs);
    await firstWindow.setViewportSize({ width: 1440, height: 1000 });

    logStage("wait-cdp-endpoint");
    summary.cdpEndpoint = await waitForCdpEndpoint(options);

    logStage("connect-over-cdp");
    browser = await chromium.connectOverCDP(options.cdpUrl);
    const page = await findElectronCdpPage(browser, options);
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });
    summary.cdpPage = sanitizeJson({
      url: page.url(),
      title: await page.title().catch(() => ""),
    });

    logStage("wait-renderer");
    summary.rendererSnapshot = sanitizeJson(
      await waitForRendererReady(page, options),
    );

    logStage("clear-trace");
    await clearInvokeBuffers(page);

    logStage("initialize");
    summary.initialize = sanitizeJson(
      await initializeAppServer(page, requestLog),
    );

    logStage("workspace-default-ensure");
    const workspaceEnsure = await invokeAppServerFromPage(
      page,
      "workspace/default/ensure",
      {},
      requestLog,
    );
    const workspace = workspaceEnsure.result?.workspace;
    const workspaceId = String(workspace?.id || "").trim();
    const rootPath = String(workspace?.rootPath || workspace?.root_path || "");
    assert(workspaceId, "workspace/default/ensure 未返回 workspace.id");
    assert(rootPath, "workspace/default/ensure 未返回 rootPath");
    summary.workspace = sanitizeJson({
      workspaceId,
      rootPath,
    });
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceAndModelPreferences(page, workspaceId, {
        provider: FIXTURE_PROVIDER,
        model: FIXTURE_MODEL,
      }),
    );
    summary.guiWorkspaceNavigation = sanitizeJson(
      await navigateGuiToWorkspaceScopedAgent(page, options, workspaceId),
    );

    logStage("session-start-read-list");
    summary.sessionCreation = sanitizeJson(
      await startProbeSession(page, { workspaceId, rootPath }, requestLog),
    );
    await page.evaluate(
      ({ sessionId, workspaceId }) => {
        window.dispatchEvent(
          new CustomEvent("lime:agent-runtime-sessions-changed", {
            detail: {
              reason: "external",
              sessionId,
              workspaceId,
            },
          }),
        );
      },
      { sessionId: SESSION_ID, workspaceId },
    );
    summary.guiSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(page, options, SESSION_TITLE),
    );
    summary.productListTrace = await waitForProductTraceMethods(page, options, [
      APP_SERVER_METHOD_SESSION_LIST,
    ]);
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 40,
      },
      requestLog,
    );
    summary.sessionRead = summarizeSessionRead(read.result);
    const list = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      {
        includeArchived: true,
        limit: 20,
      },
      requestLog,
    );
    summary.sessionList = summarizeSessionList(list.result);
    summary.guiSessionOpened = sanitizeJson(
      await openSessionFromSidebar(page, options, requestLog, {
        sessionId: SESSION_ID,
        title: SESSION_TITLE,
      }),
    );
    summary.productReadTrace = await waitForProductTraceMethods(page, options, [
      APP_SERVER_METHOD_SESSION_LIST,
      APP_SERVER_METHOD_SESSION_READ,
    ]);
    summary.optionalThreadResume = sanitizeJson(
      await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_SESSION_THREAD_RESUME,
        {
          sessionId: SESSION_ID,
          threadId: THREAD_ID,
          historyLimit: 40,
        },
        requestLog,
      )
        .then((response) => ({
          ok: true,
          result: response.result,
        }))
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })),
    );

    logStage("collect-trace");
    const traceMessages = await readRendererTrace(page);
    summary.traceSummary = summarizeTraceMessages(traceMessages);
    summary.directIpcSetupMethods = requestLog
      .map((entry) => entry.method)
      .filter(Boolean);
    writeJsonFile(tracePath, summary.traceSummary);

    logStage("screenshot");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;

    const methods = new Set(summary.traceSummary.methods ?? []);
    const directMethods = new Set(summary.directIpcSetupMethods ?? []);
    summary.assertions = {
      electronPreloadBridge: summary.rendererSnapshot?.electron === true,
      hasInvokeBridge: summary.rendererSnapshot?.hasInvokeBridge === true,
      supportsAppServer: summary.rendererSnapshot?.supportsAppServer === true,
      cdpConnected:
        typeof summary.cdpEndpoint?.version?.browser === "string" ||
        typeof summary.cdpEndpoint?.version?.userAgent === "string",
      appServerHandleJsonLinesSeen:
        (summary.traceSummary?.appServerEntryCount ?? 0) > 0,
      electronIpcSuccess:
        (summary.traceSummary?.electronIpcSuccessCount ?? 0) > 0,
      initializeSeen:
        directMethods.has(APP_SERVER_METHOD_INITIALIZE) ||
        methods.has(APP_SERVER_METHOD_INITIALIZE),
      initializedSeen:
        directMethods.has(APP_SERVER_METHOD_INITIALIZED) ||
        methods.has(APP_SERVER_METHOD_INITIALIZED),
      sessionStartSeen: directMethods.has(APP_SERVER_METHOD_SESSION_START),
      sessionUpdateSeen: directMethods.has(APP_SERVER_METHOD_SESSION_UPDATE),
      sessionReadSeen: methods.has(APP_SERVER_METHOD_SESSION_READ),
      sessionListSeen: methods.has(APP_SERVER_METHOD_SESSION_LIST),
      sessionReadMatched:
        summary.sessionRead?.sessionId === SESSION_ID ||
        summary.sessionRead?.threadId === THREAD_ID,
      sessionListMatched: summary.sessionList?.matched?.sessionId === SESSION_ID,
      noTurnStart:
        !methods.has("agentSession/turn/start") &&
        !requestLog.some((entry) => entry.method === "agentSession/turn/start"),
    };
    for (const [name, passed] of Object.entries(summary.assertions)) {
      assert(passed, `CDP Gate B assertion failed: ${name}`);
    }

    summary.requestLog = sanitizeJson(
      requestLog.map((entry) => ({
        method: entry.method,
        response: entry.response ?? null,
        error: entry.error ?? null,
      })),
    );
    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} trace=${tracePath}`);
    console.log(`${LOG_PREFIX} screenshot=${screenshotPath}`);
  } catch (error) {
    summary.error = sanitizeText(error instanceof Error ? error.message : error);
    writeJsonFile(summaryPath, summary);
    console.error(`${LOG_PREFIX} failed summary=${summaryPath}`);
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    if (!options.keepTemp) {
      cleanupTempRoot(runtimeEnv.tempRoot);
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
