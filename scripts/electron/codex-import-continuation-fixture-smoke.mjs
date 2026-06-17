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
    "codex-import-continuation-fixture",
  ),
  prefix: "codex-import-continuation-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:codex-import-continuation-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const WORKSPACE_ID = "codex-import-continuation-workspace";
const SOURCE_THREAD_ID = "codex-import-continuation-thread";
const CONTINUE_TURN_ID = "codex-import-continuation-turn";
const IMPORTED_USER_TEXT = "请运行测试并修复失败";
const IMPORTED_REASONING_TEXT = "I need to inspect the test failure first.";
const IMPORTED_ASSISTANT_TEXT = "已完成修复。";
const CONTINUE_USER_TEXT = "在这个导入会话里继续总结下一步";
const CONTINUE_ASSISTANT_TEXT = "CODEX_IMPORT_CONTINUATION_DONE";
const REQUIRED_METHODS = [
  "initialize",
  "conversationImport/thread/commit",
  "agentSession/read",
  "agentSession/turn/start",
];

function printHelp() {
  console.log(`
Codex Import Continuation Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，通过 preload bridge 调用
  app_server_handle_json_lines。脚本先导入一条 Codex rollout fixture，
  验证 agentSession/read.detail.items 还原 reasoning / command / patch /
  web search / approval，再对同一个导入 session 调用 agentSession/turn/start
  继续对话，验证续聊仍走 current App Server JSON-RPC 主链。

边界:
  external backend 只作为本脚本一次性可观测执行器，不调用正式模型后端；
  不使用 legacy runtime commands、renderer mock fallback 或 App Server mock
  backend 作为成功证据。

用法:
  node scripts/electron/codex-import-continuation-fixture-smoke.mjs

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
    path.join(os.tmpdir(), "codex-import-continuation-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const sourceRoot = path.join(tempRoot, "codex-home");
  const backendPath = path.join(tempRoot, "codex-import-backend.mjs");
  const backendLedgerPath = path.join(tempRoot, "codex-import-backend.jsonl");
  const rolloutPath = path.join(sourceRoot, "rollout-continuation.jsonl");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    sourceRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);
  writeCodexRolloutFixture(rolloutPath);

  return {
    tempRoot,
    electronUserDataDir,
    sourceRoot,
    rolloutPath,
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
          backend: "codex-import-continuation-fixture",
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

function writeCodexRolloutFixture(rolloutPath) {
  const lines = [
    {
      timestamp: "2026-06-16T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: SOURCE_THREAD_ID,
        timestamp: "2026-06-16T00:00:00.000Z",
        cwd: "/workspace/imported-codex",
        source: "cli",
        model_provider: "openai",
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
          workdir: "/workspace/imported-codex",
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

async function runCodexImportContinuationFixture(page, options, runtimeEnv) {
  return await page.evaluate(
    async ({
      command,
      sourceRoot,
      sourcePath,
      workspaceId,
      continueTurnId,
      continueUserText,
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
        const id = `codex-import-continuation-${requestId++}`;
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

      async function waitForContinuedRead(sessionId) {
        const startedAt = Date.now();
        let latestRead = null;
        while (Date.now() - startedAt < timeoutMs) {
          latestRead = await call("agentSession/read", {
            sessionId,
            historyLimit: 50,
          });
          const detailMessages = Array.isArray(latestRead?.detail?.messages)
            ? latestRead.detail.messages
            : [];
          readSnapshots.push({
            elapsedMs: Date.now() - startedAt,
            turns: Array.isArray(latestRead?.turns) ? latestRead.turns.length : null,
            messagesCount: latestRead?.detail?.messages_count ?? null,
            messagesLength: detailMessages.length,
          });
          if (
            detailMessages.some(
              (message) =>
                message?.role === "user" &&
                messageText(message) === continueUserText,
            ) &&
            detailMessages.some(
              (message) =>
                message?.role === "assistant" &&
                messageText(message).includes(
                  "CODEX_IMPORT_CONTINUATION_DONE",
                ),
            )
          ) {
            return latestRead;
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        return latestRead;
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "codex-import-continuation-fixture",
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });

      const commit = await call("conversationImport/thread/commit", {
        sourceClient: "codex",
        sourceRoot,
        sourcePath,
        appId: "desktop",
        workspaceId,
        confirmed: true,
      });
      const sessionId = commit?.session?.sessionId;
      if (!sessionId) {
        throw new Error("conversationImport/thread/commit did not return sessionId");
      }

      const importedRead = await call("agentSession/read", {
        sessionId,
        historyLimit: 50,
      });
      const turn = await call("agentSession/turn/start", {
        sessionId,
        turnId: continueTurnId,
        input: {
          text: continueUserText,
          attachments: [],
        },
        runtimeOptions: {
          eventName: "codex-import-continuation-fixture",
        },
        queueIfBusy: false,
        skipPreSubmitResume: false,
      });
      const continuedRead = await waitForContinuedRead(sessionId);

      return {
        initialize,
        commit,
        importedRead,
        turn,
        continuedRead,
        readSnapshots,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      sourceRoot: runtimeEnv.sourceRoot,
      sourcePath: runtimeEnv.rolloutPath,
      workspaceId: WORKSPACE_ID,
      continueTurnId: CONTINUE_TURN_ID,
      continueUserText: CONTINUE_USER_TEXT,
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
  const importedDetail = result?.importedRead?.detail ?? null;
  const continuedDetail = result?.continuedRead?.detail ?? null;
  const importedMessages = Array.isArray(importedDetail?.messages)
    ? importedDetail.messages
    : [];
  const continuedMessages = Array.isArray(continuedDetail?.messages)
    ? continuedDetail.messages
    : [];
  const importedItems = Array.isArray(importedDetail?.items)
    ? importedDetail.items
    : [];
  const backendTurnStart = backendLedger.find(
    (entry) => entry.kind === "turnStart",
  );
  const backendRuntimeOptions =
    backendTurnStart?.request?.runtimeOptions ??
    backendTurnStart?.request?.runtime_options ??
    null;

  return {
    requestMethods,
    missingRequiredMethods: REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    sessionId: result?.commit?.session?.sessionId ?? null,
    commitCanContinue: result?.commit?.canContinue ?? null,
    importedMessagesLength: importedMessages.length,
    importedItemsLength: importedItems.length,
    hasImportedUserMessage: importedMessages.some(
      (message) =>
        message?.role === "user" &&
        contentTextFromMessage(message) === IMPORTED_USER_TEXT,
    ),
    hasImportedAssistantMessage: importedMessages.some(
      (message) =>
        message?.role === "assistant" &&
        contentTextFromMessage(message).includes(IMPORTED_ASSISTANT_TEXT),
    ),
    hasReasoningItem: importedItems.some(
      (item) =>
        item?.type === "reasoning" && item?.text === IMPORTED_REASONING_TEXT,
    ),
    hasCommandItem: importedItems.some(
      (item) =>
        item?.type === "command_execution" &&
        item?.id === "call_exec" &&
        String(item?.command || "").includes("npm test"),
    ),
    hasPatchItem: importedItems.some(
      (item) =>
        item?.type === "patch" &&
        Array.isArray(item?.paths) &&
        item.paths.includes("/workspace/imported-codex/src/lib.rs"),
    ),
    hasWebSearchItem: importedItems.some(
      (item) =>
        item?.type === "web_search" &&
        item?.id === "call_search" &&
        item?.action === "search_query",
    ),
    hasApprovalItem: importedItems.some(
      (item) =>
        item?.type === "approval_request" &&
        item?.request_id === "call_exec",
    ),
    continuedTurnId: result?.turn?.turn?.turnId ?? null,
    continuedReadSessionId: result?.continuedRead?.session?.sessionId ?? null,
    continuedMessagesLength: continuedMessages.length,
    hasContinueUserMessage: continuedMessages.some(
      (message) =>
        message?.role === "user" &&
        contentTextFromMessage(message) === CONTINUE_USER_TEXT,
    ),
    hasContinueAssistantMessage: continuedMessages.some(
      (message) =>
        message?.role === "assistant" &&
        contentTextFromMessage(message).includes(CONTINUE_ASSISTANT_TEXT),
    ),
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
  };
}

function assertFixtureResult(result, backendLedger) {
  const summary = summarizeFixtureResult(result, backendLedger);
  assert(
    summary.missingRequiredMethods.length === 0,
    `缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(summary.sessionId, "导入未返回 sessionId");
  assert(summary.commitCanContinue === true, "导入会话未标记 canContinue");
  assert(summary.hasImportedUserMessage, "导入用户消息未进入 read model");
  assert(summary.hasImportedAssistantMessage, "导入助手消息未进入 read model");
  assert(summary.hasReasoningItem, "导入 reasoning 未进入 detail.items");
  assert(summary.hasCommandItem, "导入 command 未进入 detail.items");
  assert(summary.hasPatchItem, "导入 patch 未进入 detail.items");
  assert(summary.hasWebSearchItem, "导入 web_search 未进入 detail.items");
  assert(summary.hasApprovalItem, "导入 approval 未进入 detail.items");
  assert(
    summary.continuedTurnId === CONTINUE_TURN_ID,
    "续聊 turnId 不正确",
  );
  assert(
    summary.continuedReadSessionId === summary.sessionId,
    "续聊 read model 没有停留在导入 session",
  );
  assert(summary.hasContinueUserMessage, "续聊用户消息未写入同一 session");
  assert(summary.hasContinueAssistantMessage, "续聊助手消息未写入同一 session");
  assert(summary.backendTurnStartSeen, "external backend 未收到 turnStart");
  assert(
    summary.backendSessionId === summary.sessionId,
    "backend 收到的 turnStart sessionId 不是导入 session",
  );
  assert(
    summary.backendTurnId === CONTINUE_TURN_ID,
    "backend 收到的 turnStart turnId 不正确",
  );
  assert(
    summary.backendInputText === CONTINUE_USER_TEXT,
    "backend 收到的续聊输入不正确",
  );
  assert(
    summary.backendMetadataImported,
    "续聊 runtimeOptions 未携带 imported session metadata",
  );
  assert(
    summary.backendCwd === "/workspace/imported-codex",
    "续聊 runtimeOptions 未继承导入 cwd",
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
    workspaceId: WORKSPACE_ID,
    continueTurnId: CONTINUE_TURN_ID,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    sourceRoot: options.keepTemp ? runtimeEnv.sourceRoot : null,
    rolloutPath: options.keepTemp ? runtimeEnv.rolloutPath : null,
    appServerBinary,
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

    logStage("invoke-codex-import-continuation");
    const fixtureResult = await runCodexImportContinuationFixture(
      page,
      options,
      runtimeEnv,
    );
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
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(
      `${LOG_PREFIX} session=${fixtureSummary.sessionId} importedItems=${fixtureSummary.importedItemsLength} continuedMessages=${fixtureSummary.continuedMessagesLength}`,
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
    `${LOG_PREFIX} failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
