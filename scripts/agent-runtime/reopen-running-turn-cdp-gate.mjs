#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron, chromium } from "playwright";

import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import { ensureElectronFixtureBuild } from "../lib/electron-fixture-build.mjs";
import {
  createTempRuntimeEnv,
} from "./claw-chat-current-fixture-backend-file.mjs";
import {
  waitForBackendLedgerEntry,
  waitForBackendLedgerTurnStart,
  sanitizeBackendLedgerForEvidence,
  summarizeBackendLedger,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  APP_SERVER_METHOD_SESSION_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_THREAD_RESUME,
  APP_SERVER_METHOD_SESSION_TURN_CANCEL,
  APP_SERVER_METHOD_SESSION_TURN_START,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  NEWS_PROMPT,
  SESSION_ID,
  SESSION_TITLE,
  THREAD_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  sendPromptFromGui,
} from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  waitForGuiChatCanceled,
  waitForStopButtonVisibleAndClick,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import {
  collectReadModelTurns,
  readModelLatestTurnStatus,
  readModelTurnId,
  readModelTurnStatus,
  summarizeReadModelQueueState,
} from "./claw-chat-current-fixture-read-model-core.mjs";
import {
  waitForSessionReadCanceled,
} from "./claw-chat-current-fixture-read-model-waits.mjs";
import {
  bindGuiWorkspaceAndModelPreferences,
  clearInvokeBuffers,
  collectAgentSessionEvents,
  drainAppServerEventsFromPage,
  ensureDefaultWorkspace,
  initializeAppServer,
  invokeAppServerFromPage,
  readTraceMessages,
  reloadRendererDocument,
  summarizeAgentSessionEvents,
  waitForAppUrlReady,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  createFixtureSession,
  navigateGuiToWorkspaceScopedAgent,
  openFixtureSessionFromSidebar,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  assert,
  cleanupTempRoot,
  readJsonl,
  sanitizeJson,
  sanitizeText,
  sleep,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

const LOG_PREFIX = "[cdp:reopen-running-turn]";
const DEFAULTS = {
  appUrl: "",
  cdpPort: 9239,
  cdpUrl: "",
  evidenceDir: path.join(process.cwd(), ".lime", "cdp-evidence"),
  prefix: "reopen-running-turn-cdp-gate",
  timeoutMs: 180_000,
  intervalMs: 250,
  keepTemp: false,
};

function printHelp() {
  console.log(`
Reopen Running Turn CDP Gate

用途:
  启动真实 Electron Desktop Host，通过 chromium.connectOverCDP attach
  真实 renderer，使用 controlled external fixture 制造 running turn，
  然后 reload renderer，验证产品恢复逻辑自动调用
  agentSession/thread/resume，并且同一 sessionId/turnId 的主区、侧栏、
  输入框运行态保持一致。

边界:
  这是 Gate B controlled fixture：覆盖 Electron/preload/IPC、
  app_server_handle_json_lines、App Server JSON-RPC、read model、GUI 可见状态。
  不调用正式模型后端，不证明 live Provider。

用法:
  node scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs

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
  if (!options.prefix) {
    throw new Error("--prefix 不能为空");
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

async function readRendererTrace(page) {
  const raw = await page.evaluate(() =>
    window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
  );
  return readTraceMessages(raw);
}

function decodeJsonRpcLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines
    .map((line) => {
      try {
        return JSON.parse(String(line));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function summarizeTraceMessages(traceMessages) {
  const appServerEntries = traceMessages.filter(
    (entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  const methodEntries = appServerEntries.flatMap((entry, index) =>
    decodeJsonRpcLines(entry?.args_preview?.request?.lines).map((message) => ({
      index,
      command: entry.command ?? null,
      transport: entry.transport ?? null,
      status: entry.status ?? null,
      method: message.method ?? null,
      id: message.id ?? null,
      sessionId: message.params?.sessionId ?? message.params?.session_id ?? null,
      threadId: message.params?.threadId ?? message.params?.thread_id ?? null,
      turnId: message.params?.turnId ?? message.params?.turn_id ?? null,
      eventName:
        message.params?.runtimeOptions?.eventName ??
        message.params?.runtime_options?.event_name ??
        null,
      promptLength:
        typeof message.params?.input?.text === "string"
          ? message.params.input.text.length
          : null,
    })),
  );
  return sanitizeJson({
    entryCount: traceMessages.length,
    appServerEntryCount: appServerEntries.length,
    methods: Array.from(
      new Set(methodEntries.map((entry) => entry.method).filter(Boolean)),
    ),
    electronIpcSuccessCount: methodEntries.filter(
      (entry) =>
        entry.transport === "electron-ipc" && entry.status === "success",
    ).length,
    methodEntries,
  });
}

function traceMethodEntriesAfter(traceMessages, cursor, method) {
  const entries = traceMessages.slice(cursor).filter(
    (entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  return entries.flatMap((entry) =>
    decodeJsonRpcLines(entry?.args_preview?.request?.lines)
      .filter((message) => message?.method === method)
      .map((message) => ({
        transport: entry.transport ?? null,
        status: entry.status ?? null,
        method: message.method,
        sessionId:
          message.params?.sessionId ?? message.params?.session_id ?? null,
        threadId: message.params?.threadId ?? message.params?.thread_id ?? null,
        turnId: message.params?.turnId ?? message.params?.turn_id ?? null,
        params: sanitizeJson(message.params ?? {}),
      })),
  );
}

async function waitForTraceMethodAfter(
  page,
  options,
  cursor,
  method,
  { sessionId = SESSION_ID, turnId = null } = {},
) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const traceMessages = await readRendererTrace(page);
    const entries = traceMethodEntriesAfter(traceMessages, cursor, method);
    const matched = entries.find((entry) => {
      if (sessionId && entry.sessionId && entry.sessionId !== sessionId) {
        return false;
      }
      if (turnId && entry.turnId && entry.turnId !== turnId) {
        return false;
      }
      return entry.transport === "electron-ipc" && entry.status === "success";
    });
    lastSummary = sanitizeJson({
      cursor,
      method,
      traceCount: traceMessages.length,
      entries,
    });
    if (matched) {
      return {
        matched: sanitizeJson(matched),
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `未观察到 reload 后产品 trace method=${method}: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
}

function summarizeReadModelRunningState(readModel, turnId, prompt) {
  const serialized = JSON.stringify(readModel || {});
  const queueState = summarizeReadModelQueueState(readModel);
  const turns = collectReadModelTurns(readModel).map((turn) => ({
    turnId: readModelTurnId(turn),
    status: readModelTurnStatus(turn),
  }));
  const matchedTurn = turns.find((turn) => turn.turnId === turnId) ?? null;
  const statusValues = [
    queueState.detailStatus,
    queueState.threadStatus,
    queueState.latestTurnStatus,
    readModelLatestTurnStatus(readModel),
    matchedTurn?.status,
  ].map((status) => String(status ?? "").toLowerCase());
  const hasRunningStatus = statusValues.some((status) =>
    ["running", "active", "streaming", "in_progress"].includes(status),
  );
  const hasTerminalStatus = statusValues.some((status) =>
    ["completed", "failed", "canceled", "cancelled"].includes(status),
  );
  return sanitizeJson({
    ...queueState,
    latestTurnStatus: readModelLatestTurnStatus(readModel),
    matchedTurn,
    turns,
    includesPrompt: serialized.includes(prompt),
    includesInitialOutput: serialized.includes("以下是今日国际新闻简要整理"),
    sameActiveTurn: queueState.activeTurnId === turnId,
    hasRunningStatus,
    hasTerminalStatus,
    running: (queueState.activeTurnId === turnId || hasRunningStatus) &&
      !hasTerminalStatus,
  });
}

async function waitForReadModelRunning(page, options, requestLog, turnId) {
  const startedAt = Date.now();
  let lastSummary = null;
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
    lastSummary = summarizeReadModelRunningState(
      read.result,
      turnId,
      NEWS_PROMPT,
    );
    if (
      lastSummary.running &&
      lastSummary.includesPrompt &&
      lastSummary.includesInitialOutput
    ) {
      return {
        readModel: read.result,
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `read model 未保持同一 running turn: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
}

function summarizeSessionList(result, turnId) {
  const sessions = Array.isArray(result?.sessions)
    ? result.sessions
    : Array.isArray(result?.items)
      ? result.items
      : [];
  const matched = sessions.find(
    (session) =>
      session?.sessionId === SESSION_ID ||
      session?.session_id === SESSION_ID ||
      session?.id === SESSION_ID,
  );
  const serialized = JSON.stringify(matched || {});
  const statusValues = [
    matched?.runtimeStatus,
    matched?.runtime_status,
    matched?.status,
    matched?.state,
    matched?.latestTurnStatus,
    matched?.latest_turn_status,
    matched?.runtimeSummary?.latestTurnStatus,
    matched?.runtime_summary?.latestTurnStatus,
  ].map((status) => String(status ?? "").toLowerCase());
  const running = statusValues.some((status) =>
    ["running", "active", "streaming", "in_progress"].includes(status),
  );
  const terminal = statusValues.some((status) =>
    ["completed", "failed", "canceled", "cancelled"].includes(status),
  );
  return sanitizeJson({
    count: sessions.length,
    matched: matched
      ? {
          sessionId:
            matched.sessionId ?? matched.session_id ?? matched.id ?? null,
          title: matched.title ?? null,
          runtimeStatus: matched.runtimeStatus ?? matched.runtime_status ?? null,
          status: matched.status ?? matched.state ?? null,
          latestTurnStatus:
            matched.latestTurnStatus ?? matched.latest_turn_status ?? null,
          activeTurnId:
            matched.activeTurnId ??
            matched.active_turn_id ??
            matched.threadRead?.activeTurnId ??
            matched.thread_read?.active_turn_id ??
            null,
          includesTurnId: turnId ? serialized.includes(turnId) : null,
        }
      : null,
    running: Boolean(matched) && (running || serialized.includes(turnId)) &&
      !terminal,
    terminal,
  });
}

async function waitForSessionListRunning(page, options, requestLog, turnId) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const list = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      { includeArchived: true, limit: 20 },
      requestLog,
    );
    lastSummary = summarizeSessionList(list.result, turnId);
    if (lastSummary.running) {
      return lastSummary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `session list 未显示 running: ${JSON.stringify(sanitizeJson(lastSummary))}`,
  );
}

async function waitForSessionListNotRunning(page, options, requestLog, turnId) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const list = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      { includeArchived: true, limit: 20 },
      requestLog,
    );
    lastSummary = summarizeSessionList(list.result, turnId);
    if (lastSummary.matched && !lastSummary.running) {
      return lastSummary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `session list 取消后仍显示 running: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
}

async function sampleGuiRunningState(page, turnId) {
  return await page.evaluate(
    ({ prompt, title, turnId }) => {
      const bodyText = document.body?.innerText || "";
      const main = document.querySelector("main") ?? document.body;
      const mainText = main?.innerText || bodyText;
      const turnGroups = Array.from(
        document.querySelectorAll('[data-testid="message-turn-group"]'),
      );
      const promptTurnGroup =
        [...turnGroups]
          .reverse()
          .find((group) => (group.innerText || "").includes(prompt)) ?? null;
      const scope = promptTurnGroup ?? main ?? document;
      const scopedText = promptTurnGroup?.innerText || mainText;
      const statusNodes = Array.from(
        scope.querySelectorAll(
          [
            '[data-testid="assistant-first-token-runtime-status"]',
            '[data-testid="message-runtime-status-pill"]',
            '[data-testid="inputbar-runtime-status-line"]',
          ].join(","),
        ),
      ).map((node) => ({
        testId: node.getAttribute("data-testid") || "",
        status: node.getAttribute("data-status") || "",
        text: node.textContent || "",
      }));
      const inputbar = document.querySelector(
        '[data-testid="inputbar-core-container"]',
      );
      const inputbarText = inputbar?.textContent || "";
      const inputbarButtons = Array.from(
        inputbar?.querySelectorAll("button") || [],
      ).map((button) => ({
        title: button.getAttribute("title") || "",
        aria: button.getAttribute("aria-label") || "",
        text: button.textContent || "",
        disabled: button.disabled,
      }));
      const inputbarButtonLabels = inputbarButtons.map((button) =>
        [button.title, button.aria, button.text].join("\n"),
      );
      const inputbarHasStopButton = inputbarButtons.some((button) => {
        const label = [button.title, button.aria, button.text].join("\n");
        return (
          !button.disabled &&
          (label.includes("停止") ||
            label.includes("终止") ||
            /\bStop\b/i.test(label))
        );
      });
      const inputbarHasRunningText =
        inputbarText.includes("正在输出") ||
        inputbarText.includes("正在生成") ||
        inputbarButtonLabels.some(
          (label) =>
            label.includes("正在输出") || label.includes("正在生成"),
        );
      const sidebarRows = Array.from(
        document.querySelectorAll('[data-testid="app-sidebar-conversation-open"]'),
      );
      const sidebarRow =
        sidebarRows.find((row) => {
          const label = [
            row.getAttribute("title") || "",
            row.getAttribute("aria-label") || "",
            row.textContent || "",
          ].join("\n");
          return label.includes(title);
        }) ?? null;
      const sidebarStatusNode = sidebarRow?.querySelector(
        '[data-testid="app-sidebar-conversation-runtime-status"]',
      );
      const sidebarStatus = sidebarStatusNode?.getAttribute("data-status") || "";
      const sidebarStatusText = sidebarStatusNode?.textContent || "";
      const globalStopButtonVisible = Array.from(
        document.querySelectorAll("button"),
      ).some((button) => {
        const label = [
          button.getAttribute("title") || "",
          button.getAttribute("aria-label") || "",
          button.textContent || "",
        ].join("\n");
        return (
          !button.disabled &&
          (label.includes("停止") ||
            label.includes("终止") ||
            /\bStop\b/i.test(label))
        );
      });
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      return {
        url: window.location.href,
        hasPrompt: scopedText.includes(prompt),
        hasAssistantOutput: scopedText.includes("以下是今日国际新闻简要整理"),
        hasTurnIdInDom: turnId ? scopedText.includes(turnId) : null,
        statusNodes,
        mainRunningStatus:
          scopedText.includes("正在输出") ||
          scopedText.includes("正在生成") ||
          statusNodes.some(
            (entry) =>
              entry.status === "running" ||
              entry.text.includes("正在输出") ||
              entry.text.includes("正在生成"),
          ),
        inputbarHasStopButton,
        inputbarHasRunningText,
        inputbarButtonLabels,
        globalStopButtonVisible,
        sidebarTitleFound: Boolean(sidebarRow),
        sidebarStatus,
        sidebarStatusText,
        textareaSessionId:
          textarea instanceof HTMLTextAreaElement
            ? textarea.dataset.sessionId || null
            : null,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        scopedText,
      };
    },
    { prompt: NEWS_PROMPT, title: SESSION_TITLE, turnId },
  );
}

async function waitForGuiRunningConsistency(page, options, turnId, label) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    lastSnapshot = sanitizeJson(await sampleGuiRunningState(page, turnId));
    if (
      lastSnapshot.hasPrompt &&
      lastSnapshot.hasAssistantOutput &&
      (lastSnapshot.mainRunningStatus || lastSnapshot.globalStopButtonVisible) &&
      lastSnapshot.inputbarHasStopButton &&
      lastSnapshot.sidebarTitleFound &&
      lastSnapshot.sidebarStatus === "running"
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI running 状态不一致 (${label}): ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForGuiIdleConsistency(page, options, turnId) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    lastSnapshot = sanitizeJson(await sampleGuiRunningState(page, turnId));
    if (
      lastSnapshot.hasPrompt &&
      !lastSnapshot.inputbarHasStopButton &&
      !lastSnapshot.globalStopButtonVisible &&
      lastSnapshot.sidebarTitleFound &&
      lastSnapshot.sidebarStatus !== "running"
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 取消后仍存在 running 状态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForCanceledEventAfterReload(page, options, turnId) {
  const startedAt = Date.now();
  let events = [];
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const drained = await drainAppServerEventsFromPage(page, 100);
    events = [...events, ...collectAgentSessionEvents(drained.messages)];
    lastSummary = summarizeAgentSessionEvents(events, turnId);
    if (lastSummary.terminalTypes?.includes("turn.canceled")) {
      return {
        events: sanitizeJson(events.filter((event) => event.turnId === turnId)),
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `reload 后未通过 agentSession/event 观察到同一 turn 取消终态: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
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
  const screenshotBeforeReloadPath = path.join(
    options.evidenceDir,
    `${options.prefix}-before-reload.png`,
  );
  const screenshotAfterReloadPath = path.join(
    options.evidenceDir,
    `${options.prefix}-after-reload.png`,
  );
  const screenshotAfterCancelPath = path.join(
    options.evidenceDir,
    `${options.prefix}-after-cancel.png`,
  );
  const backendLedgerEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-ledger.json`,
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
    schemaVersion: "reopen-running-turn-cdp-gate.v1",
    scenarioId: "reopen-running-turn-cdp-gate",
    proofLevel: "Gate B controlled fixture",
    claimBoundary:
      "真实 Electron CDP + preload IPC + app_server_handle_json_lines + App Server JSON-RPC + external controlled fixture；证明 reload 后同一 running turnId 由产品恢复逻辑续接，不证明 live Provider。",
    completedGateB: false,
    backendMode: "external",
    appUrl: options.appUrl || null,
    cdpUrl: options.cdpUrl,
    cdpPort: options.cdpPort,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    prompt: NEWS_PROMPT,
    checkedAt: new Date().toISOString(),
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLedgerPath: options.keepTemp ? runtimeEnv.backendLedgerPath : null,
    backendLedger: backendLedgerEvidencePath,
    traceSummaryPath: tracePath,
    consoleErrors,
    forbiddenFallbacks: [
      "APP_SERVER_BACKEND_MODE=mock",
      "mockPriorityCommands",
      "defaultMocks",
      "invokeMockOnly",
      "legacy agent_runtime_* production truth",
    ],
    assertions: {},
  };

  let app = null;
  let browser = null;
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
      args: [
        `--remote-debugging-port=${options.cdpPort}`,
        "--use-mock-keychain",
        ".",
      ],
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
        CLAW_CHAT_FIXTURE_SCENARIO: "cancel",
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
        LIME_REAL_API_TEST: "0",
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
        LIME_ELECTRON_REMOTE_DEBUGGING_PORT: String(options.cdpPort),
        LIME_TRACE_EXPORT_OUTPUT_DIR: path.join(
          runtimeEnv.tempRoot,
          "trace-exports",
        ),
        LIME_SUPPORT_BUNDLE_OUTPUT_DIR: path.join(
          runtimeEnv.tempRoot,
          "support-bundles",
        ),
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
    await clearInvokeBuffers(page);

    logStage("initialize-app-server");
    summary.initialize = sanitizeJson(
      await initializeAppServer(page, requestLog),
    );

    logStage("ensure-default-workspace");
    const workspace = await ensureDefaultWorkspace(page, requestLog);
    summary.workspace = sanitizeJson(workspace);

    logStage("bind-gui-workspace-model");
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceAndModelPreferences(page, workspace.workspaceId, {
        provider: FIXTURE_PROVIDER,
        model: FIXTURE_MODEL,
      }),
    );

    logStage("create-fixture-session");
    summary.sessionCreation = sanitizeJson(
      await createFixtureSession(page, workspace, requestLog, {
        provider: FIXTURE_PROVIDER,
        model: FIXTURE_MODEL,
      }),
    );

    logStage("navigate-gui-workspace");
    summary.guiWorkspaceNavigation = sanitizeJson(
      await navigateGuiToWorkspaceScopedAgent(
        page,
        options,
        workspace.workspaceId,
      ),
    );

    logStage("open-fixture-session");
    summary.guiSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(page, options),
    );
    summary.guiSessionOpened = sanitizeJson(
      await openFixtureSessionFromSidebar(page, options, requestLog),
    );

    logStage("send-running-turn");
    summary.inputSend = sanitizeJson(
      await sendPromptFromGui(page, options, NEWS_PROMPT, {
        expectedSessionId: SESSION_ID,
        requireTurnStart: true,
      }),
    );
    const backendTurn = await waitForBackendLedgerTurnStart(
      runtimeEnv.backendLedgerPath,
      NEWS_PROMPT,
      options,
    );
    const turnId = String(backendTurn.entry?.turnId || "").trim();
    assert(turnId, "external backend ledger 未记录 turnId");
    summary.turnId = turnId;
    summary.backendTurnStart = sanitizeJson(backendTurn.entry);

    logStage("assert-running-before-reload");
    summary.readModelRunningBeforeReload = sanitizeJson(
      await waitForReadModelRunning(page, options, requestLog, turnId),
    );
    summary.sessionListRunningBeforeReload = sanitizeJson(
      await waitForSessionListRunning(page, options, requestLog, turnId),
    );
    summary.guiRunningBeforeReload = sanitizeJson(
      await waitForGuiRunningConsistency(
        page,
        options,
        turnId,
        "before-reload",
      ),
    );
    await page.screenshot({
      path: screenshotBeforeReloadPath,
      fullPage: true,
      timeout: 15_000,
    });
    summary.screenshotBeforeReload = screenshotBeforeReloadPath;

    const traceCursorBeforeReload = (await readRendererTrace(page)).length;
    summary.traceCursorBeforeReload = traceCursorBeforeReload;

    logStage("reload-renderer");
    summary.reload = sanitizeJson(await reloadRendererDocument(page, options));
    summary.rendererSnapshotAfterReload = sanitizeJson(
      await waitForRendererReady(page, options),
    );
    summary.guiSessionVisibleAfterReload = sanitizeJson(
      await waitForGuiSessionVisible(page, options),
    );
    summary.guiSessionOpenedAfterReload = sanitizeJson(
      await openFixtureSessionFromSidebar(page, options, requestLog),
    );

    logStage("assert-product-resume-after-reload");
    summary.threadResumeTraceAfterReload = sanitizeJson(
      await waitForTraceMethodAfter(
        page,
        options,
        traceCursorBeforeReload,
        APP_SERVER_METHOD_SESSION_THREAD_RESUME,
        { sessionId: SESSION_ID, turnId },
      ),
    );
    summary.readModelRunningAfterReload = sanitizeJson(
      await waitForReadModelRunning(page, options, requestLog, turnId),
    );
    summary.sessionListRunningAfterReload = sanitizeJson(
      await waitForSessionListRunning(page, options, requestLog, turnId),
    );
    summary.guiRunningAfterReload = sanitizeJson(
      await waitForGuiRunningConsistency(
        page,
        options,
        turnId,
        "after-reload",
      ),
    );
    await page.screenshot({
      path: screenshotAfterReloadPath,
      fullPage: true,
      timeout: 15_000,
    });
    summary.screenshotAfterReload = screenshotAfterReloadPath;

    const traceCursorBeforeCancel = (await readRendererTrace(page)).length;
    summary.traceCursorBeforeCancel = traceCursorBeforeCancel;

    logStage("stop-after-reload");
    summary.stopClick = sanitizeJson(
      await waitForStopButtonVisibleAndClick(page, options, {
        prompt: NEWS_PROMPT,
        visibleOutputText: "以下是今日国际新闻简要整理",
        requireVisibleOutput: true,
      }),
    );
    summary.turnCancelTraceAfterReload = sanitizeJson(
      await waitForTraceMethodAfter(
        page,
        options,
        traceCursorBeforeCancel,
        APP_SERVER_METHOD_SESSION_TURN_CANCEL,
        { sessionId: SESSION_ID, turnId },
      ),
    );
    summary.backendTurnCancel = sanitizeJson(
      await waitForBackendLedgerEntry(
        runtimeEnv.backendLedgerPath,
        (entry) =>
          entry.kind === "turnCancel" &&
          entry.sessionId === SESSION_ID &&
          entry.turnId === turnId,
        options,
      ),
    );
    summary.eventCanceledAfterReload = sanitizeJson(
      await waitForCanceledEventAfterReload(page, options, turnId),
    );
    summary.readModelCanceled = sanitizeJson(
      await waitForSessionReadCanceled(page, options, requestLog, {
        sessionId: SESSION_ID,
        prompt: NEWS_PROMPT,
        partialText: "以下是今日国际新闻简要整理",
      }),
    );
    summary.guiCanceled = sanitizeJson(
      await waitForGuiChatCanceled(page, options, {
        prompt: NEWS_PROMPT,
        partialText: "以下是今日国际新闻简要整理",
      }),
    );
    summary.sessionListAfterCancel = sanitizeJson(
      await waitForSessionListNotRunning(page, options, requestLog, turnId),
    );
    summary.guiIdleAfterCancel = sanitizeJson(
      await waitForGuiIdleConsistency(page, options, turnId),
    );
    await page.screenshot({
      path: screenshotAfterCancelPath,
      fullPage: true,
      timeout: 15_000,
    });
    summary.screenshotAfterCancel = screenshotAfterCancelPath;

    const traceMessages = await readRendererTrace(page);
    summary.traceSummary = summarizeTraceMessages(traceMessages);
    writeJsonFile(tracePath, summary.traceSummary);

    const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
    writeJsonFile(
      backendLedgerEvidencePath,
      sanitizeBackendLedgerForEvidence(backendLedger),
    );
    summary.backend = sanitizeJson(summarizeBackendLedger(backendLedger));
    summary.appServerRequestMethods = requestLog
      .map((entry) => entry.method)
      .filter(Boolean);

    const methods = new Set(summary.traceSummary.methods ?? []);
    summary.assertions = {
      electronPreloadBridge: summary.rendererSnapshot?.electron === true,
      hasInvokeBridge: summary.rendererSnapshot?.hasInvokeBridge === true,
      supportsAppServer: summary.rendererSnapshot?.supportsAppServer === true,
      cdpConnected:
        typeof summary.cdpEndpoint?.version?.browser === "string" ||
        typeof summary.cdpEndpoint?.version?.userAgent === "string",
      turnStartSeen: methods.has(APP_SERVER_METHOD_SESSION_TURN_START),
      threadResumeSeen: methods.has(APP_SERVER_METHOD_SESSION_THREAD_RESUME),
      turnCancelSeen: methods.has(APP_SERVER_METHOD_SESSION_TURN_CANCEL),
      sessionReadSeen: methods.has(APP_SERVER_METHOD_SESSION_READ),
      sessionListSeen: methods.has(APP_SERVER_METHOD_SESSION_LIST),
      sameTurnBeforeReload:
        summary.readModelRunningBeforeReload?.summary?.sameActiveTurn === true ||
        summary.readModelRunningBeforeReload?.summary?.matchedTurn?.turnId ===
          turnId,
      sameTurnAfterReload:
        summary.readModelRunningAfterReload?.summary?.sameActiveTurn === true ||
        summary.readModelRunningAfterReload?.summary?.matchedTurn?.turnId ===
          turnId,
      guiRunningBeforeReload:
        summary.guiRunningBeforeReload?.sidebarStatus === "running" &&
        summary.guiRunningBeforeReload?.inputbarHasStopButton === true,
      guiRunningAfterReload:
        summary.guiRunningAfterReload?.sidebarStatus === "running" &&
        summary.guiRunningAfterReload?.inputbarHasStopButton === true,
      canceledEventAfterReload:
        summary.eventCanceledAfterReload?.summary?.terminalTypes?.includes(
          "turn.canceled",
        ) === true,
      guiIdleAfterCancel:
        summary.guiIdleAfterCancel?.sidebarStatus !== "running" &&
        summary.guiIdleAfterCancel?.inputbarHasStopButton === false,
      noMockBackend: summary.backendMode === "external",
    };
    for (const [name, passed] of Object.entries(summary.assertions)) {
      assert(passed, `reopen running turn CDP assertion failed: ${name}`);
    }

    summary.completedGateB = true;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} trace=${tracePath}`);
  } catch (error) {
    summary.error = sanitizeText(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    try {
      const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
      writeJsonFile(
        backendLedgerEvidencePath,
        sanitizeBackendLedgerForEvidence(backendLedger),
      );
      summary.backend = sanitizeJson(summarizeBackendLedger(backendLedger));
    } catch (ledgerError) {
      summary.backendLedgerError = sanitizeText(ledgerError);
    }
    writeJsonFile(summaryPath, summary);
    console.error(`${LOG_PREFIX} failureSummary=${summaryPath}`);
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    if (!options.keepTemp) {
      cleanupTempRoot(runtimeEnv.tempRoot);
    }
  }
}

await run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
