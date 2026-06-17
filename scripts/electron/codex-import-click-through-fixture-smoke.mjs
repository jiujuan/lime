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
    "codex-import-click-through-fixture",
  ),
  prefix: "codex-import-click-through-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:codex-import-click-through-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const SOURCE_THREAD_ID = "codex-import-click-through-thread";
const IMPORTED_USER_TEXT = "请运行测试并修复失败";
const IMPORTED_REASONING_TEXT = "I need to inspect the test failure first.";
const IMPORTED_ASSISTANT_TEXT = "已完成修复。";
const CONTINUE_USER_TEXT = "在这个导入会话里继续总结下一步";
const CONTINUE_ASSISTANT_TEXT = "CODEX_IMPORT_CLICK_THROUGH_DONE";
const IMPORTED_CWD = "/workspace/imported-codex";
const REQUIRED_BACKEND_METHODS = [
  "conversationImport/source/scan",
  "conversationImport/thread/preview",
  "conversationImport/thread/commit",
  "agentSession/read",
  "agentSession/turn/start",
];

function printHelp() {
  console.log(`
Codex Import Click-through Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，从侧边栏点击“导入 Codex 对话”，
  在确认弹窗中预览临时 Codex 会话，点击确认导入后进入 Lime 会话页，
  验证导入消息、Codex 细节还原和 task rail 上下文可见，再通过真实
  输入框发送 follow-up，证明同一导入 session 可继续对话。

边界:
  使用临时 CODEX_HOME fixture，不读取或修改真实 ~/.codex；
  external backend 只作为本脚本一次性可观测执行器，不调用正式模型后端；
  不使用 legacy runtime commands、renderer mock fallback 或 App Server mock
  backend 作为成功证据。

用法:
  node scripts/electron/codex-import-click-through-fixture-smoke.mjs

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
    return value.slice(0, 120).map((item) => sanitizeJson(item, depth + 1));
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
    path.join(os.tmpdir(), "codex-import-click-through-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const sourceRoot = path.join(tempRoot, "codex-home");
  const sessionsDir = path.join(sourceRoot, "sessions");
  const backendPath = path.join(tempRoot, "codex-import-backend.mjs");
  const backendLedgerPath = path.join(tempRoot, "codex-import-backend.jsonl");
  const rolloutPath = path.join(sessionsDir, `${SOURCE_THREAD_ID}.jsonl`);
  const sessionIndexPath = path.join(sourceRoot, "session_index.jsonl");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    sourceRoot,
    sessionsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);
  writeCodexRolloutFixture(rolloutPath);
  writeSessionIndexFixture(sessionIndexPath, rolloutPath);

  return {
    tempRoot,
    electronUserDataDir,
    sourceRoot,
    rolloutPath,
    sessionIndexPath,
    backendPath,
    backendLedgerPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      CODEX_HOME: sourceRoot,
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
          backend: "codex-import-click-through-fixture",
          text: "${CONTINUE_ASSISTANT_TEXT}"
        }
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${CONTINUE_ASSISTANT_TEXT}"
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

function writeSessionIndexFixture(sessionIndexPath, rolloutPath) {
  const line = {
    id: SOURCE_THREAD_ID,
    thread_name: "Codex 导入点击闭环",
    title: "Codex 导入点击闭环",
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:09.000Z",
    cwd: IMPORTED_CWD,
    path: rolloutPath,
  };
  fs.writeFileSync(sessionIndexPath, `${JSON.stringify(line)}\n`);
}

function writeCodexRolloutFixture(rolloutPath) {
  const lines = [
    {
      timestamp: "2026-06-16T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: SOURCE_THREAD_ID,
        timestamp: "2026-06-16T00:00:00.000Z",
        cwd: IMPORTED_CWD,
        source: "cli",
        model_provider: "openai",
        model: "gpt-5.5",
        reasoning_effort: "high",
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        memory_mode: "enabled",
      },
    },
    {
      timestamp: "2026-06-16T00:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: `## My request for Codex: ${IMPORTED_USER_TEXT}`,
      },
    },
    {
      timestamp: "2026-06-16T00:00:02.000Z",
      type: "response_item",
      payload: {
        type: "reasoning",
        content: [{ type: "reasoning_text", text: IMPORTED_REASONING_TEXT }],
      },
    },
    {
      timestamp: "2026-06-16T00:00:03.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_exec",
        call_id: "call_exec",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "npm test",
          workdir: IMPORTED_CWD,
        }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:04.000Z",
      type: "event_msg",
      payload: {
        type: "exec_approval_request",
        call_id: "call_exec",
        command: ["npm", "test"],
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_exec",
        output: "Exit code: 0\\nWall time: 0 seconds\\nOutput:\\nok",
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        id: "call_search",
        call_id: "call_search",
        action: "search_query",
        query: "Lime Codex import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:07.000Z",
      type: "event_msg",
      payload: {
        type: "web_search_end",
        call_id: "call_search",
        action: "search_query",
        query: "Lime Codex import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:08.000Z",
      type: "event_msg",
      payload: {
        type: "patch_apply_end",
        call_id: "call_patch",
        success: true,
        changes: {
          "/workspace/imported-codex/src/lib.rs": { type: "modify" },
        },
      },
    },
    {
      timestamp: "2026-06-16T00:00:09.000Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: IMPORTED_ASSISTANT_TEXT,
      },
    },
  ];
  fs.writeFileSync(
    rolloutPath,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
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

async function invokeAppServerFromPage(page, method, params = {}) {
  return await page.evaluate(
    async ({ command, method, params }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const id = `codex-import-click-through-${Date.now()}-${Math.random()}`;
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

async function initializeAppServer(page) {
  const initialize = await invokeAppServerFromPage(page, "initialize", {
    clientInfo: {
      name: "codex-import-click-through-fixture",
      version: "1.0.0",
    },
    capabilities: { eventMethods: ["agentSession/event"] },
  });
  await page.evaluate(async (command) => {
    await window.electronAPI.invoke(command, {
      request: {
        lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
      },
    });
  }, APP_SERVER_HANDLE_JSON_LINES_COMMAND);
  return initialize.result;
}

async function waitForUiSnapshot(page, options, predicate, failureLabel) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const bodyText = document.body?.innerText || "";
      const dialog = document.querySelector(
        '[data-testid="app-sidebar-conversation-import-dialog"]',
      );
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const sendButton = Array.from(document.querySelectorAll("button")).find(
        (button) => {
          const label = [
            button.getAttribute("aria-label") || "",
            button.getAttribute("title") || "",
            button.textContent || "",
          ].join("\n");
          return label.includes("发送") || /\bSend\b/i.test(label);
        },
      );
      return {
        url: window.location.href,
        title: document.title || "",
        bodyText,
        dialogVisible: Boolean(dialog),
        importButtonVisible: Boolean(
          document.querySelector(
            '[data-testid="app-sidebar-import-conversation-button"]',
          ),
        ),
        importConfirmVisible: Boolean(
          document.querySelector(
            '[data-testid="app-sidebar-conversation-import-confirm"]',
          ),
        ),
        importConfirmDisabled:
          document.querySelector(
            '[data-testid="app-sidebar-conversation-import-confirm"]',
          ) instanceof HTMLButtonElement
            ? document.querySelector(
                '[data-testid="app-sidebar-conversation-import-confirm"]',
              ).disabled
            : null,
        textareaVisible: textarea instanceof HTMLTextAreaElement,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaValue:
          textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        sendButtonVisible: sendButton instanceof HTMLButtonElement,
        sendButtonDisabled:
          sendButton instanceof HTMLButtonElement ? sendButton.disabled : null,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (predicate(snapshot)) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `${failureLabel}: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function clickSidebarImport(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) => snapshot.importButtonVisible,
    "侧边栏导入按钮未出现",
  );
  await page.locator('[data-testid="app-sidebar-import-conversation-button"]').click();
}

async function waitForImportPreview(page, options) {
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.dialogVisible &&
      snapshot.importConfirmVisible &&
      snapshot.importConfirmDisabled === false &&
      snapshot.bodyText.includes("Codex 导入点击闭环") &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT) &&
      snapshot.bodyText.includes("Codex 细节还原") &&
      snapshot.bodyText.includes("工具") &&
      snapshot.bodyText.includes("命令") &&
      snapshot.bodyText.includes("补丁") &&
      snapshot.bodyText.includes("审批") &&
      snapshot.bodyText.includes("搜索"),
    "Codex 导入弹窗预览未完成",
  );
}

async function confirmImport(page, options) {
  await page
    .locator('[data-testid="app-sidebar-conversation-import-confirm"]')
    .click();
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      !snapshot.dialogVisible &&
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(IMPORTED_USER_TEXT) &&
      snapshot.bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    "确认导入后未进入可继续对话的会话页",
  );
}

function hasAnyText(snapshot, values) {
  return values.some((value) => snapshot.bodyText.includes(value));
}

function summarizeImportedDetailsSnapshot(snapshot, readModelSummary = null) {
  const bodyText = snapshot?.bodyText || "";
  return {
    hasImportedUserMessage: bodyText.includes(IMPORTED_USER_TEXT),
    hasImportedAssistantMessage: bodyText.includes(IMPORTED_ASSISTANT_TEXT),
    hasReasoningVisible:
      bodyText.includes(IMPORTED_REASONING_TEXT) ||
      bodyText.includes("已完成思考") ||
      (bodyText.includes("已完成") && bodyText.includes("步骤")) ||
      readModelSummary?.hasReasoningItem === true,
    hasCommandText: bodyText.includes("npm test"),
    hasPatchText:
      hasAnyText({ bodyText }, ["补丁", "Patch", "patch"]) &&
      hasAnyText({ bodyText }, ["已编辑", "文件", "src/lib.rs"]),
    hasSearchEvidence:
      hasAnyText({ bodyText }, ["搜索", "Search", "web search"]) ||
      readModelSummary?.hasWebSearchItem === true,
    hasApprovalText:
      hasAnyText({ bodyText }, [
        "导入的权限记录",
        "已导入，只读记录",
        "审批",
        "确认",
        "权限请求",
        "Approval",
        "approval",
      ]),
    hidesRawImportedCommand:
      !bodyText.includes("Approve Codex command") &&
      !bodyText.includes("imported_read_only"),
  };
}

function summarizeContinuationSnapshot(snapshot) {
  const bodyText = snapshot?.bodyText || "";
  return {
    hasContinueUserMessage: bodyText.includes(CONTINUE_USER_TEXT),
    hasContinueAssistantMessage: bodyText.includes(CONTINUE_ASSISTANT_TEXT),
  };
}

async function waitForImportedSessionDetails(page, options) {
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) => {
      const summary = summarizeImportedDetailsSnapshot(snapshot);
      return (
        snapshot.textareaVisible &&
        summary.hasImportedUserMessage &&
        summary.hasImportedAssistantMessage &&
        summary.hasReasoningVisible &&
        summary.hasPatchText &&
        summary.hasApprovalText &&
        summary.hidesRawImportedCommand
      );
    },
    "导入后的会话页未还原 Codex 细节",
  );
}

async function sendFollowUpFromGui(page, options) {
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) => snapshot.textareaVisible && snapshot.textareaDisabled === false,
    "续聊输入框未就绪",
  );
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(CONTINUE_USER_TEXT);
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) => snapshot.textareaValue === CONTINUE_USER_TEXT,
    "续聊输入未进入 textarea",
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
  assert(
    clicked?.clicked,
    `未找到可点击发送按钮: ${JSON.stringify(sanitizeJson(clicked))}`,
  );
  return clicked;
}

async function waitForContinuationVisible(page, options) {
  return await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible &&
      snapshot.bodyText.includes(CONTINUE_USER_TEXT) &&
      snapshot.bodyText.includes(CONTINUE_ASSISTANT_TEXT),
    "续聊消息未在同一会话页完成",
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

function summarizeReadModel(readResult) {
  const detail = readResult?.detail ?? null;
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  const items = Array.isArray(detail?.items) ? detail.items : [];
  return {
    sessionId: readResult?.session?.sessionId ?? null,
    messagesLength: messages.length,
    itemsLength: items.length,
    hasImportedUserMessage: messages.some(
      (message) =>
        message?.role === "user" &&
        contentTextFromMessage(message) === IMPORTED_USER_TEXT,
    ),
    hasImportedAssistantMessage: messages.some(
      (message) =>
        message?.role === "assistant" &&
        contentTextFromMessage(message).includes(IMPORTED_ASSISTANT_TEXT),
    ),
    hasContinueUserMessage: messages.some(
      (message) =>
        message?.role === "user" &&
        contentTextFromMessage(message) === CONTINUE_USER_TEXT,
    ),
    hasContinueAssistantMessage: messages.some(
      (message) =>
        message?.role === "assistant" &&
        contentTextFromMessage(message).includes(CONTINUE_ASSISTANT_TEXT),
    ),
    hasReasoningItem: items.some(
      (item) =>
        item?.type === "reasoning" && item?.text === IMPORTED_REASONING_TEXT,
    ),
    hasCommandItem: items.some(
      (item) =>
        item?.type === "command_execution" &&
        String(item?.command || "").includes("npm test"),
    ),
    hasPatchItem: items.some(
      (item) =>
        item?.type === "patch" &&
        Array.isArray(item?.paths) &&
        item.paths.includes("/workspace/imported-codex/src/lib.rs"),
    ),
    hasWebSearchItem: items.some(
      (item) =>
        item?.type === "web_search" &&
        item?.id === "call_search" &&
        item?.action === "search_query",
    ),
    hasApprovalItem: items.some(
      (item) =>
        item?.type === "approval_request" &&
        item?.request_id === "call_exec",
    ),
  };
}

async function waitForImportedReadModel(page, options, sessionId) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    latest = await invokeAppServerFromPage(page, "agentSession/read", {
      sessionId,
      historyLimit: 100,
    });
    const summary = summarizeReadModel(latest.result);
    if (
      summary.hasImportedUserMessage &&
      summary.hasImportedAssistantMessage &&
      summary.hasContinueUserMessage &&
      summary.hasContinueAssistantMessage &&
      summary.hasReasoningItem &&
      summary.hasCommandItem &&
      summary.hasPatchItem &&
      summary.hasWebSearchItem &&
      summary.hasApprovalItem
    ) {
      return {
        read: latest.result,
        messages: latest.messages,
        summary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `导入 session read model 未收敛: ${JSON.stringify(
      sanitizeJson({
        latest: latest?.result ?? null,
        summary: latest?.result ? summarizeReadModel(latest.result) : null,
      }),
    )}`,
  );
}

function extractInvokeTraceMethods(rawTrace) {
  const methods = [];
  let entries = [];
  try {
    const parsed = JSON.parse(rawTrace || "[]");
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry?.command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
      continue;
    }
    const lines = Array.isArray(entry?.args_preview?.request?.lines)
      ? entry.args_preview.request.lines
      : [];
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (typeof message?.method === "string") {
          methods.push(message.method);
        }
      } catch {
        // ignore non JSON trace line
      }
    }
  }
  return Array.from(new Set(methods));
}

function summarizeBackendLedger(backendLedger, sessionId) {
  const backendTurnStart = backendLedger.find(
    (entry) => entry.kind === "turnStart",
  );
  const backendRuntimeOptions =
    backendTurnStart?.request?.runtimeOptions ??
    backendTurnStart?.request?.runtime_options ??
    null;
  return {
    backendTurnStartSeen: Boolean(backendTurnStart),
    backendSessionId: backendTurnStart?.request?.session?.sessionId ?? null,
    backendTurnId: backendTurnStart?.request?.turn?.turnId ?? null,
    backendInputText: backendTurnStart?.request?.input?.text ?? null,
    backendMetadataImported:
      backendRuntimeOptions?.metadata?.imported === true ||
      backendRuntimeOptions?.hostOptions?.asterChatRequest?.turn_config?.metadata
        ?.imported === true,
    backendCwd:
      backendRuntimeOptions?.hostOptions?.asterChatRequest?.turn_config?.cwd ??
      null,
    backendSessionMatches: backendTurnStart?.request?.session?.sessionId === sessionId,
  };
}

async function extractClickThroughSummary(page, readModelSummary, backendLedger) {
  return await page.evaluate(
    ({
      requiredMethods,
      sourceThreadId,
      importedUserText,
      importedAssistantText,
      importedReasoningText,
      continueUserText,
      continueAssistantText,
      readModelSummary,
      backendLedger,
    }) => {
      const traceRaw = window.localStorage.getItem("lime_invoke_trace_buffer_v1");
      const errorRaw = window.localStorage.getItem("lime_invoke_error_buffer_v1");
      const bodyText = document.body?.innerText || "";
      return {
        url: window.location.href,
        title: document.title || "",
        sourceThreadId,
        traceRaw,
        errorRaw,
        bodyTextLength: bodyText.length,
        hasDialogPreview: bodyText.includes("Codex 细节还原"),
        hasImportedSourceTaskRail:
          bodyText.includes("Codex 导入") ||
          bodyText.includes("导入来源") ||
          bodyText.includes(sourceThreadId),
        hasImportedUserMessage: bodyText.includes(importedUserText),
        hasImportedAssistantMessage: bodyText.includes(importedAssistantText),
        hasReasoningVisible:
          bodyText.includes(importedReasoningText) ||
          bodyText.includes("已完成思考") ||
          (bodyText.includes("已完成") && bodyText.includes("步骤")) ||
          readModelSummary?.hasReasoningItem === true,
        hasCommandText:
          bodyText.includes("npm test") ||
          readModelSummary?.hasCommandItem === true,
        hidesRawImportedCommand:
          !bodyText.includes("Approve Codex command") &&
          !bodyText.includes("imported_read_only"),
        hasPatchText:
          bodyText.includes("补丁") ||
          bodyText.includes("已编辑") ||
          bodyText.includes("Patch") ||
          bodyText.includes("patch"),
        hasSearchEvidence:
          bodyText.includes("搜索") ||
          bodyText.includes("Search") ||
          bodyText.includes("web search") ||
          readModelSummary?.hasWebSearchItem === true,
        hasApprovalText:
          bodyText.includes("导入的权限记录") ||
          bodyText.includes("已导入，只读记录") ||
          bodyText.includes("审批") ||
          bodyText.includes("确认") ||
          bodyText.includes("权限请求") ||
          bodyText.includes("Approval") ||
          bodyText.includes("approval"),
        hasContinueUserMessage: bodyText.includes(continueUserText),
        hasContinueAssistantMessage: bodyText.includes(continueAssistantText),
        readModelSummary,
        backendLedgerLength: Array.isArray(backendLedger)
          ? backendLedger.length
          : 0,
        requiredMethods,
      };
    },
    {
      requiredMethods: REQUIRED_BACKEND_METHODS,
      sourceThreadId: SOURCE_THREAD_ID,
      importedUserText: IMPORTED_USER_TEXT,
      importedAssistantText: IMPORTED_ASSISTANT_TEXT,
      importedReasoningText: IMPORTED_REASONING_TEXT,
      continueUserText: CONTINUE_USER_TEXT,
      continueAssistantText: CONTINUE_ASSISTANT_TEXT,
      readModelSummary,
      backendLedger,
    },
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
    sourceThreadId: SOURCE_THREAD_ID,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    sourceRoot: options.keepTemp ? runtimeEnv.sourceRoot : null,
    rolloutPath: options.keepTemp ? runtimeEnv.rolloutPath : null,
    sessionIndexPath: options.keepTemp ? runtimeEnv.sessionIndexPath : null,
    appServerBinary,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLedgerPath: options.keepTemp ? runtimeEnv.backendLedgerPath : null,
    backendMode: "external",
    requiredMethods: REQUIRED_BACKEND_METHODS,
    electronPreloadBridge: false,
    sessionId: null,
    clickThroughSummary: null,
    backendSummary: null,
    consoleErrors: [],
    screenshot: null,
    rawEvidence: rawEvidencePath,
    backendLedgerEvidence: backendLedgerEvidencePath,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const rendererSnapshots = [];
  const appServerRequests = [];
  let previewSnapshot = null;
  let importedPageSnapshot = null;
  let importedDetailsSnapshot = null;
  let importedDetailsSummary = null;
  let sendClick = null;
  let continuationSnapshot = null;
  let continuationSummary = null;
  let readModel = null;
  let clickThroughSummary = null;

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
    const rendererSnapshot = await waitForRendererReady(page, options, (snapshot) => {
      rendererSnapshots.push(sanitizeJson(snapshot));
    });
    summary.electronPreloadBridge =
      rendererSnapshot.electron && rendererSnapshot.hasInvokeBridge;
    await clearInvokeBuffers(page);
    appServerRequests.push({ method: "initialize", source: "script-probe" });
    await initializeAppServer(page);

    logStage("click-sidebar-import");
    await clickSidebarImport(page, options);

    logStage("wait-import-preview");
    previewSnapshot = await waitForImportPreview(page, options);

    logStage("confirm-import");
    importedPageSnapshot = await confirmImport(page, options);

    logStage("wait-imported-details");
    importedDetailsSnapshot = await waitForImportedSessionDetails(
      page,
      options,
    );

    logStage("send-follow-up");
    sendClick = await sendFollowUpFromGui(page, options);

    logStage("wait-continuation");
    continuationSnapshot = await waitForContinuationVisible(page, options);

    const backendLedger = readBackendLedger(runtimeEnv.backendLedgerPath);
    const backendTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart",
    );
    const sessionId = backendTurnStart?.request?.session?.sessionId ?? null;
    assert(sessionId, "backend ledger 未记录导入 sessionId");
    summary.sessionId = sessionId;
    appServerRequests.push({
      method: "agentSession/read",
      source: "script-probe",
      sessionId,
    });
    readModel = await waitForImportedReadModel(page, options, sessionId);
    const backendSummary = summarizeBackendLedger(backendLedger, sessionId);
    summary.backendSummary = sanitizeJson(backendSummary);
    assert(backendSummary.backendTurnStartSeen, "external backend 未收到 turnStart");
    assert(backendSummary.backendSessionMatches, "backend turnStart 不属于导入 session");
    assert(
      typeof backendSummary.backendTurnId === "string" &&
        backendSummary.backendTurnId.length > 0,
      "backend 未收到有效 turnId",
    );
    assert(
      backendSummary.backendInputText === CONTINUE_USER_TEXT,
      "backend 收到的续聊输入不正确",
    );
    assert(
      backendSummary.backendMetadataImported,
      "续聊 runtimeOptions 未携带 imported session metadata",
    );
    assert(
      backendSummary.backendCwd === IMPORTED_CWD,
      "续聊 runtimeOptions 未继承导入 cwd",
    );

    clickThroughSummary = await extractClickThroughSummary(
      page,
      readModel.summary,
      backendLedger,
    );
    importedDetailsSummary = summarizeImportedDetailsSnapshot(
      importedDetailsSnapshot,
      readModel.summary,
    );
    continuationSummary = summarizeContinuationSnapshot(continuationSnapshot);
    const traceMethods = Array.from(
      new Set([
        ...extractInvokeTraceMethods(clickThroughSummary.traceRaw),
        ...appServerRequests.map((request) => request.method),
      ]),
    );
    const missingRequiredMethods = REQUIRED_BACKEND_METHODS.filter(
      (method) => !traceMethods.includes(method),
    );
    assert(
      missingRequiredMethods.length === 0,
      `GUI 点击链路缺少 App Server method trace: ${missingRequiredMethods.join(", ")}`,
    );
    assert(importedDetailsSummary.hasImportedUserMessage, "页面未显示导入用户消息");
    assert(
      importedDetailsSummary.hasImportedAssistantMessage,
      "页面未显示导入助手消息",
    );
    assert(
      importedDetailsSummary.hasReasoningVisible,
      "页面或 read model 未保留导入 reasoning",
    );
    assert(
      importedDetailsSummary.hasCommandText &&
        readModel.summary.hasCommandItem,
      "页面或 read model 未保留导入 command",
    );
    assert(
      importedDetailsSummary.hidesRawImportedCommand,
      "页面暴露了 Codex 原始审批命令或导入内部字段",
    );
    assert(importedDetailsSummary.hasPatchText, "页面未显示导入 patch");
    assert(
      importedDetailsSummary.hasSearchEvidence,
      "页面或 read model 未保留导入 web search",
    );
    assert(importedDetailsSummary.hasApprovalText, "页面未显示导入 approval");
    assert(
      continuationSummary.hasContinueUserMessage,
      "页面未显示续聊用户消息",
    );
    assert(
      continuationSummary.hasContinueAssistantMessage,
      "页面未显示续聊助手消息",
    );
    assert(
      !clickThroughSummary.errorRaw,
      `invoke error buffer 非空: ${clickThroughSummary.errorRaw}`,
    );
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.clickThroughSummary = sanitizeJson({
      ...clickThroughSummary,
      importedDetailsSummary,
      continuationSummary,
      traceMethods,
      missingRequiredMethods,
      traceRaw: undefined,
      errorRaw: clickThroughSummary.errorRaw,
    });

    writeJsonFile(
      rawEvidencePath,
      sanitizeJson({
        rendererSnapshots,
        previewSnapshot,
        importedPageSnapshot,
        importedDetailsSnapshot,
        importedDetailsSummary,
        sendClick,
        continuationSnapshot,
        continuationSummary,
        appServerRequests,
        readModel,
        clickThroughSummary: {
          ...clickThroughSummary,
          importedDetailsSummary,
          continuationSummary,
          traceMethods,
        },
      }),
    );
    writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(
      `${LOG_PREFIX} session=${sessionId} importedItems=${readModel.summary.itemsLength} messages=${readModel.summary.messagesLength}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    writeJsonFile(
      rawEvidencePath,
      sanitizeJson({
        rendererSnapshots,
        previewSnapshot,
        importedPageSnapshot,
        importedDetailsSnapshot,
        importedDetailsSummary,
        sendClick,
        continuationSnapshot,
        continuationSummary,
        readModel,
        clickThroughSummary,
        appServerRequests,
        error: summary.error,
      }),
    );
    try {
      const backendLedger = readBackendLedger(runtimeEnv.backendLedgerPath);
      writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));
    } catch {
      // ignore failure evidence write
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
        // ignore screenshot failure
      }
    }
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      try {
        fs.rmSync(runtimeEnv.tempRoot, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
      } catch (cleanupError) {
        console.warn(
          `${LOG_PREFIX} cleanup warning: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
  }
}

run().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
