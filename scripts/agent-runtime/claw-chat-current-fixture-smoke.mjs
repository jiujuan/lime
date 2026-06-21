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
const APP_SERVER_DRAIN_EVENTS_COMMAND = "app_server_drain_events";
const APP_SERVER_METHOD_INITIALIZE = "initialize";
const APP_SERVER_METHOD_INITIALIZED = "initialized";
const APP_SERVER_METHOD_AGENT_SESSION_EVENT = "agentSession/event";
const APP_SERVER_METHOD_SESSION_START = "agentSession/start";
const APP_SERVER_METHOD_SESSION_UPDATE = "agentSession/update";
const APP_SERVER_METHOD_SESSION_TURN_START = "agentSession/turn/start";
const APP_SERVER_METHOD_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
const APP_SERVER_METHOD_SESSION_READ = "agentSession/read";
const APP_SERVER_METHOD_SESSION_LIST = "agentSession/list";
const APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE = "workspace/default/ensure";
const NEWS_PROMPT = "整理今天的国际新闻";
const CONTINUE_PROMPT = "继续输出";
const PLAN_PROMPT = "先给我一个修复计划，不要直接改代码";
const GOAL_PROMPT = "本周完成 Goal E2E 修复";
const WEB_TOOLS_RENDERING_PROMPT = "验证网页搜索渲染";
const ASSISTANT_DONE_TEXT = "CLAW_NEWS_FIXTURE_DONE";
const CONTINUE_DONE_TEXT = "CLAW_CONTINUE_FIXTURE_DONE";
const PLAN_DONE_TEXT = "CLAW_PLAN_FIXTURE_DONE";
const GOAL_DONE_TEXT = "CLAW_GOAL_FIXTURE_DONE";
const WEB_TOOLS_RENDERING_DONE_TEXT = "CLAW_WEB_TOOLS_RENDERING_DONE";
const WEB_TOOLS_SEARCH_TITLE = "Lime WebSearch Rendering Source";
const WEB_TOOLS_SEARCH_URL = "https://example.com/lime-websearch-rendering";
const WEB_TOOLS_SEARCH_SOURCE_LABEL = "example.com/lime-websearch-rendering";
const WEB_TOOLS_SEARCH_SNIPPET = "Search source used to verify inline rendering";
const WEB_TOOLS_MID_THINKING_TEXT =
  "搜索结果还需要继续筛掉广告软文，我先读取有效来源。";
const WEB_TOOLS_FETCH_MARKDOWN =
  "WebFetch 正文摘要：页面确认搜索来源可以展开，同时最终正文继续输出。";
const WEB_TOOLS_BROKEN_MARKDOWN_TEXT = [
  "五年级选购指南###",
  "####如果孩子基础一般，优先看护眼、内容和家长管理。",
  "**推荐 型号 **：Lime 学习机 S30",
  "**理由 **：系统清晰，适合五年级基础巩固。",
  "对比表：",
  "| 品牌 | 型号 | 场景 |",
  "| --- | --- | --- |",
  "| Lime | S30 | 五年级巩固 |",
].join("\n");
const PLAN_STEPS = [
  { step: "确认计划模式请求进入 App Server", status: "completed" },
  { step: "输出 proposed_plan", status: "in_progress" },
  { step: "验证右侧计划轨显示", status: "pending" },
];
const PROPOSED_PLAN_BLOCK = `<proposed_plan>
${PLAN_STEPS.map((step) => `- ${step.step}`).join("\n")}
</proposed_plan>`;
const FIXTURE_PROVIDER = "fixture-provider";
const FIXTURE_MODEL = "fixture-model";
const SESSION_ID = `claw-chat-current-${Date.now()}-${process.pid}`;
const THREAD_ID = `${SESSION_ID}-thread`;
const SESSION_TITLE = "Claw 新闻输入 Electron fixture";
const WEB_TOOLS_SEARCH_TOOL_CALL_ID = `${SESSION_ID}:tool:websearch-rendering`;
const WEB_TOOLS_REASONING_ITEM_ID = `${SESSION_ID}:reasoning:web-tools-rendering`;
const WEB_TOOLS_FETCH_TOOL_CALL_ID = `${SESSION_ID}:tool:webfetch-rendering`;
const EVENT_READ_PROBE_PROMPT =
  "验证 agentSession/event 与 read model 同 turn 对齐。";
const EVENT_READ_PROBE_TURN_ID = `${SESSION_ID}-event-read-probe`;
const EVENT_READ_PROBE_READ_TEXT = "事件流 probe 已进入 RuntimeCore";
const EVENT_READ_PROBE_DONE_TEXT = "EVENT_READ_PROBE_DONE";
const EVENT_READ_PROBE_TOOL_CALL_ID = `${EVENT_READ_PROBE_TURN_ID}:tool:webfetch`;
const EVENT_READ_PROBE_TOOL_NAME = "WebFetch";
const EVENT_READ_PROBE_TOOL_OUTPUT =
  "fixture fetched https://example.com/claw-event-read";
const WEB_TOOLS_RENDERING_ASSERTION_KEYS = [
  "webToolsRenderingPromptReachedBackend",
  "guiWebToolsRenderingInputSubmitted",
  "guiWebSearchProcessDefaultCollapsed",
  "guiWebSearchProcessShowsSourcesAfterExpand",
  "guiWebFetchProcessShowsReadPagesAfterExpand",
  "guiWebToolsTimelineOrderPreserved",
  "guiWebSearchNoiseHidden",
  "guiMarkdownRendered",
  "guiWebSearchFinalTextInterleaved",
  "guiWebFetchTransportEnvelopeHidden",
  "readModelWebToolsRenderingCompleted",
];

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
  --scenario <name>      complete | cancel | cancel-then-continue | plan | goal | web-tools-rendering，默认 complete
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
  const allowedScenarios = [
    "complete",
    "cancel",
    "cancel-then-continue",
    "plan",
    "goal",
    "web-tools-rendering",
  ];
  if (!allowedScenarios.includes(options.scenario)) {
    throw new Error(
      `--scenario 只能是 ${allowedScenarios.join("、")}`,
    );
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

function cleanupTempRoot(tempRoot) {
  try {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} cleanup warning: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
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
  const proposedPlanFixtureText = `${PROPOSED_PLAN_BLOCK}\n计划已写入右侧计划轨，等待你确认后再执行。\n`;
  const webToolsRenderingFixtureText = `网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。\n${WEB_TOOLS_BROKEN_MARKDOWN_TEXT}\n`;
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const cancelSignalPath = process.argv[3];
const input = JSON.parse(readFileSync(0, "utf8"));
const asterChatRequest = input.request?.runtimeOptions?.hostOptions?.asterChatRequest;

function appendLedgerEntry(entry) {
  if (!ledgerPath) {
    return;
  }
  appendFileSync(ledgerPath, JSON.stringify({
    ...entry,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

function emitEvents(events) {
  appendLedgerEntry({
    kind: "backendEmit",
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    eventCount: events.length,
    eventTypes: events.map((event) => event?.type).filter(Boolean)
  });
  console.log(JSON.stringify({ events }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentThreadId() {
  return input.request?.session?.threadId ??
    input.request?.session?.thread_id ??
    "${THREAD_ID}";
}

function currentTurnId() {
  return input.request?.turn?.turnId ??
    input.request?.turn?.turn_id ??
    asterChatRequest?.turn_id ??
    asterChatRequest?.turnId ??
    "";
}

appendLedgerEntry({
    kind: input.kind,
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    inputText: input.request?.input?.text,
    providerPreference: input.request?.providerPreference,
    modelPreference: input.request?.modelPreference,
    runtimeOptions: input.request?.runtimeOptions,
    asterChatRequest
});

if (input.kind === "turnCancel") {
  if (cancelSignalPath) {
    appendFileSync(cancelSignalPath, JSON.stringify({
      sessionId: input.request?.session?.sessionId,
      turnId: input.request?.turn?.turnId,
      recordedAt: new Date().toISOString()
    }) + "\\n");
  }
  emitEvents([
    {
      type: "turn.canceled",
      payload: {
        status: "canceled",
        reason: "user_cancelled"
      }
    }
  ]);
  process.exit(0);
}

if (input.kind === "turnStart") {
  const inputText = input.request?.input?.text || "";
  const isEventReadProbe = inputText.includes("agentSession/event");
  const isContinuePrompt = inputText.includes("${CONTINUE_PROMPT}");
  const isPlanPrompt = inputText.includes("${PLAN_PROMPT}");
  const isGoalPrompt = inputText.includes("${GOAL_PROMPT}");
  const isWebToolsRenderingPrompt = inputText.includes("${WEB_TOOLS_RENDERING_PROMPT}");
  const assistantDoneText = isEventReadProbe
    ? "${EVENT_READ_PROBE_DONE_TEXT}"
    : isContinuePrompt
      ? "${CONTINUE_DONE_TEXT}"
      : isPlanPrompt
        ? "${PLAN_DONE_TEXT}"
        : isGoalPrompt
          ? "${GOAL_DONE_TEXT}"
          : isWebToolsRenderingPrompt
            ? "${WEB_TOOLS_RENDERING_DONE_TEXT}"
    : "${ASSISTANT_DONE_TEXT}";
  const initialEvents = [
    {
      type: "message.delta",
      payload: {
        text: isEventReadProbe
          ? "事件流 probe 已进入 RuntimeCore：\\n"
          : isContinuePrompt
            ? "继续输出已恢复：\\n"
            : isPlanPrompt
              ? "我先给出计划，不会直接改代码：\\n"
              : isGoalPrompt
                ? "追求目标已进入当前回合：\\n"
                : isWebToolsRenderingPrompt
                  ? "我先联网核实目标页面来源。\\n"
          : "以下是今日国际新闻简要整理：\\n"
      }
    }
  ];
  const followupText = isContinuePrompt
    ? "停止后的同一会话已经可以继续输出，并由 App Server current 终态收口。\\n"
    : isPlanPrompt
      ? ${JSON.stringify(proposedPlanFixtureText)}
      : isGoalPrompt
        ? "目标已绑定到本轮请求，后续会围绕 ${GOAL_PROMPT} 收口。\\n"
        : isWebToolsRenderingPrompt
          ? ${JSON.stringify(webToolsRenderingFixtureText)}
        : "1. 多国外交议题持续升温，地区安全与经贸协商仍是焦点。\\n2. 全球市场继续关注能源、供应链和主要央行政策变化。\\n3. 国际组织呼吁在气候、粮食与人道援助议题上保持协调。\\n";
  const shouldWaitForCancel =
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel" ||
      process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel-then-continue") &&
    !isEventReadProbe &&
    !isContinuePrompt;
  if (shouldWaitForCancel) {
    emitEvents(initialEvents);
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
      await sleep(100);
    }
    console.error("cancel scenario timed out waiting for turnCancel");
    process.exit(2);
  }

  emitEvents(initialEvents);
  await sleep(120);
  if (isWebToolsRenderingPrompt) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          name: "WebSearch",
          arguments: {
            query: "Lime WebSearch rendering"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          outputPreview: ${JSON.stringify(JSON.stringify({
            results: [
              {
                title: "Help",
                url: "https://help.yahoo.com/kb/search-for-desktop",
                snippet: "Yahoo search help navigation",
              },
              {
                title: "Sign In",
                url: "https://login.yahoo.com/?src=search",
                snippet: "Yahoo sign in navigation",
              },
              {
                title: "Yahoo Scout",
                url: "https://scout.yahoo.com/chat",
                snippet: "Yahoo search assistant navigation",
              },
              {
                title: WEB_TOOLS_SEARCH_TITLE,
                url: WEB_TOOLS_SEARCH_URL,
                snippet: WEB_TOOLS_SEARCH_SNIPPET,
              },
            ],
          }))},
          output: ${JSON.stringify(JSON.stringify({
            results: [
              {
                title: "Help",
                url: "https://help.yahoo.com/kb/search-for-desktop",
                snippet: "Yahoo search help navigation",
              },
              {
                title: "Sign In",
                url: "https://login.yahoo.com/?src=search",
                snippet: "Yahoo sign in navigation",
              },
              {
                title: "Yahoo Scout",
                url: "https://scout.yahoo.com/chat",
                snippet: "Yahoo search assistant navigation",
              },
              {
                title: WEB_TOOLS_SEARCH_TITLE,
                url: WEB_TOOLS_SEARCH_URL,
                snippet: WEB_TOOLS_SEARCH_SNIPPET,
              },
            ],
          }))},
          success: true
        }
      }
    ]);
    await sleep(80);
    const webToolsReasoningStartedAt = new Date().toISOString();
    emitEvents([
      {
        type: "item.updated",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "in_progress",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            updated_at: webToolsReasoningStartedAt,
            updatedAt: webToolsReasoningStartedAt
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          name: "WebFetch",
          arguments: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          outputPreview: ${JSON.stringify(JSON.stringify({
            bytes: 2048,
            code: 200,
            codeText: "OK",
            result: WEB_TOOLS_FETCH_MARKDOWN,
          }))},
          output: ${JSON.stringify(JSON.stringify({
            bytes: 2048,
            code: 200,
            codeText: "OK",
            result: WEB_TOOLS_FETCH_MARKDOWN,
          }))},
          success: true,
          metadata: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "item.completed",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "completed",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            completed_at: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      }
    ]);
    await sleep(900);
  }
  if (isEventReadProbe) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          arguments: {
            url: "https://example.com/claw-event-read",
            purpose: "claw-chat-current-fixture-event-read"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          outputPreview: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          output: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          success: true
        }
      }
    ]);
    await sleep(80);
  }
  emitEvents([
    {
      type: "message.delta",
      payload: {
        text: followupText
      }
    }
  ]);
  await sleep(120);
  emitEvents([
    {
      type: "turn.completed",
      payload: {
        status: "completed",
        text: assistantDoneText
      }
    }
  ]);
  process.exit(0);
}

emitEvents([]);
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

function readRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function readString(value, ...keys) {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  return null;
}

function agentSessionEventFromMessage(message) {
  if (message?.method !== APP_SERVER_METHOD_AGENT_SESSION_EVENT) {
    return null;
  }
  const event = readRecord(message?.params)?.event;
  if (!event) {
    return null;
  }
  return {
    eventId: readString(event, "eventId", "event_id"),
    sequence:
      typeof event.sequence === "number" && Number.isFinite(event.sequence)
        ? event.sequence
        : null,
    sessionId: readString(event, "sessionId", "session_id"),
    threadId: readString(event, "threadId", "thread_id"),
    turnId: readString(event, "turnId", "turn_id"),
    type: readString(event, "type"),
    timestamp: readString(event, "timestamp"),
    payload: readRecord(event.payload) ?? event.payload ?? null,
  };
}

function collectAgentSessionEvents(messages) {
  return Array.isArray(messages)
    ? messages.map(agentSessionEventFromMessage).filter(Boolean)
    : [];
}

function mergeAgentSessionEvents(events, nextEvents) {
  const byKey = new Map();
  for (const event of [...events, ...nextEvents]) {
    const key =
      event.eventId ||
      `${event.sessionId || ""}:${event.turnId || ""}:${event.sequence ?? ""}:${event.type || ""}`;
    byKey.set(key, event);
  }
  return [...byKey.values()].sort((left, right) => {
    const leftSequence =
      typeof left.sequence === "number"
        ? left.sequence
        : Number.MAX_SAFE_INTEGER;
    const rightSequence =
      typeof right.sequence === "number"
        ? right.sequence
        : Number.MAX_SAFE_INTEGER;
    return leftSequence - rightSequence;
  });
}

function summarizeAgentSessionEvents(events, turnId) {
  const scopedEvents = events.filter((event) => event.turnId === turnId);
  const terminalTypes = new Set([
    "turn.completed",
    "turn.done",
    "turn.final_done",
    "turn.failed",
    "turn.canceled",
    "turn.cancelled",
  ]);
  return sanitizeJson({
    eventCount: events.length,
    scopedEventCount: scopedEvents.length,
    eventTypes: scopedEvents.map((event) => event.type).filter(Boolean),
    eventTurnIds: Array.from(
      new Set(scopedEvents.map((event) => event.turnId).filter(Boolean)),
    ),
    hasTextDelta: scopedEvents.some((event) => event.type === "message.delta"),
    hasToolStarted: scopedEvents.some((event) => event.type === "tool.started"),
    hasToolResult: scopedEvents.some((event) => event.type === "tool.result"),
    hasCompleted: scopedEvents.some((event) => event.type === "turn.completed"),
    hasTerminal: scopedEvents.some((event) => terminalTypes.has(event.type)),
    terminalTypes: scopedEvents
      .map((event) => event.type)
      .filter((type) => terminalTypes.has(type)),
    sequences: scopedEvents
      .map((event) => event.sequence)
      .filter((sequence) => typeof sequence === "number"),
  });
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
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
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
    } catch (error) {
      if (!isTransientPageEvaluationError(error) || attempt === 2) {
        throw error;
      }
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError ?? new Error(`${method} App Server invocation failed`);
}

async function drainAppServerEventsFromPage(page, limit = 50) {
  return await page.evaluate(
    async ({ command, limit }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const response = await invoke(command, {
        request: {
          limit,
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
      return {
        messages,
      };
    },
    {
      command: APP_SERVER_DRAIN_EVENTS_COMMAND,
      limit,
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
      const openedProjectIdsKey = "agent_opened_project_ids";

      const openedProjectIds = (() => {
        try {
          const parsed = JSON.parse(
            window.localStorage.getItem(openedProjectIdsKey) || "[]",
          );
          return Array.isArray(parsed)
            ? parsed.filter(
                (projectId) =>
                  typeof projectId === "string" && projectId.trim(),
              )
            : [];
        } catch {
          return [];
        }
      })();
      const nextOpenedProjectIds = Array.from(
        new Set([...openedProjectIds, workspaceId]),
      );

      window.localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      window.localStorage.setItem(
        openedProjectIdsKey,
        JSON.stringify(nextOpenedProjectIds),
      );
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
      window.dispatchEvent(
        new CustomEvent("agent-opened-project-ids-changed", {
          detail: {
            projectIds: nextOpenedProjectIds,
          },
        }),
      );
      window.dispatchEvent(new Event("focus"));

      return {
        lastProject: window.localStorage.getItem(lastProjectKey),
        openedProjects: window.localStorage.getItem(openedProjectIdsKey),
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

async function createFixtureSession(page, workspace, requestLog) {
  const { workspaceId, rootPath } = workspace;
  assert(rootPath, "workspace/default/ensure 未返回可用 rootPath");
  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      appId: "desktop",
      workspaceId,
      workingDir: rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspaceId}:${SESSION_ID}`,
        title: SESSION_TITLE,
        metadata: {
          title: SESSION_TITLE,
          workingDir: rootPath,
          working_dir: rootPath,
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

  return {
    session: session.result,
    update: update.result,
  };
}

async function navigateGuiToWorkspaceScopedAgent(page, options, workspaceId) {
  const startedAt = Date.now();
  let lastSnapshot = null;

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
      snapshot.hasConversationList &&
      snapshot.localStorageMatchesWorkspace
    ) {
      return snapshot;
    }

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });

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

async function openFixtureSessionFromSidebar(page, options, requestLog) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let lastClick = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    if (!lastClick?.clicked) {
      lastClick = await evaluatePageSnapshot(
        page,
        ({ title }) => {
          const candidates = Array.from(
            document.querySelectorAll(
              '[data-testid="app-sidebar-conversation-open"], button',
            ),
          );
          const button = candidates.find((candidate) => {
            const label = [
              candidate.getAttribute("title") || "",
              candidate.getAttribute("aria-label") || "",
              candidate.textContent || "",
            ].join("\n");
            if (!label.includes(title)) {
              return false;
            }
            const actionLabel = [
              candidate.getAttribute("data-testid") || "",
              candidate.getAttribute("aria-label") || "",
              candidate.textContent || "",
            ].join("\n");
            return !/menu|more|action|archive|delete|favorite|rename|菜单|更多|操作|归档|删除|收藏|重命名/i.test(
              actionLabel,
            );
          });
          if (!button) {
            const moreButton = Array.from(
              document.querySelectorAll("button"),
            ).find((candidate) =>
              (candidate.textContent || "").includes("查看更多对话"),
            );
            moreButton?.click();
            return false;
          }
          button.click();
          return {
            clicked: true,
            title: button.getAttribute("title") || "",
            aria: button.getAttribute("aria-label") || "",
            text: button.textContent || "",
            testId: button.getAttribute("data-testid") || "",
          };
        },
        { title: SESSION_TITLE },
      );
    }

    if (lastClick?.clicked) {
      const readModel = await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_SESSION_READ,
        {
          sessionId: SESSION_ID,
          historyLimit: 1,
        },
        requestLog,
      ).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      const inputReady = await evaluatePageSnapshot(
        page,
        ({ title }) => {
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
          const menu = document.querySelector(
            '[data-testid="app-sidebar-conversation-menu"]',
          );
          const bodyText = document.body?.innerText || "";
          const mainText = document.querySelector("main")?.textContent || "";
          return {
            url: window.location.href,
            hasTextarea: Boolean(textarea),
            textareaVisible,
            hasConversationMenu: Boolean(menu),
            hasSessionTitleInMain: mainText.includes(title),
            hasRecentConversationsShell: mainText.includes("最近对话"),
            hasMessageList: Boolean(
              document.querySelector('[data-testid="message-list"]') ||
                document.querySelector('[data-testid="message-list-frame"]'),
            ),
            isRestoringSessionShell:
              mainText.includes("正在恢复生成会话") ||
              bodyText.includes("正在恢复生成会话"),
            hasInputbarCore: Boolean(
              document.querySelector('[data-testid="inputbar-core-container"]'),
            ),
            hasWorkspaceShell: Boolean(
              document.querySelector('[data-testid="agent-chat-workspace"]') ||
                document.querySelector('[data-testid="chat-workspace"]') ||
                document.querySelector(
                  '[data-testid="theme-workbench-harness-toggle"]',
                ) ||
                document.querySelector('[data-testid="toggle-harness"]'),
            ),
            textareaDisabled:
              textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
            bodyText,
            mainText,
          };
        },
        { title: SESSION_TITLE },
      );
      lastSnapshot = {
        clicked: lastClick,
        inputReady: sanitizeJson(inputReady),
        readModel: sanitizeJson({
          hasDetail: Boolean(readModel?.result?.detail),
          sessionId:
            readModel?.result?.session?.sessionId ??
            readModel?.result?.session?.session_id ??
            readModel?.result?.detail?.session?.sessionId ??
            readModel?.result?.detail?.session?.session_id ??
            null,
          error: readModel?.error ?? null,
        }),
      };
      const readModelSessionId =
        readModel?.result?.session?.sessionId ??
        readModel?.result?.session?.session_id ??
        readModel?.result?.detail?.session?.sessionId ??
        readModel?.result?.detail?.session?.session_id ??
        null;
      if (
        inputReady?.hasTextarea &&
        inputReady?.hasInputbarCore &&
        inputReady?.textareaVisible &&
        inputReady?.textareaDisabled === false &&
        readModelSessionId === SESSION_ID &&
        !inputReady?.hasConversationMenu &&
        !inputReady?.hasRecentConversationsShell &&
        !inputReady?.isRestoringSessionShell &&
        !isTaskCenterHomeText(inputReady?.mainText || "") &&
        !isTaskCenterHomeText(inputReady?.bodyText || "") &&
        (inputReady?.hasSessionTitleInMain || inputReady?.hasMessageList)
      ) {
        return lastSnapshot;
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `侧栏未打开 Claw fixture 会话: ${SESSION_TITLE}; snapshot=${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
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
        mainText: document.querySelector("main")?.textContent || "",
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasTextarea &&
      snapshot.hasInputbarCore &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      !snapshot.mainText.includes("最近对话") &&
      !snapshot.mainText.includes("正在恢复生成会话") &&
      !isTaskCenterHomeText(snapshot.mainText || "") &&
      !isTaskCenterHomeText(snapshot.bodyText || "")
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw 输入框未就绪: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function sendPromptFromGui(page, options, prompt) {
  const before = await waitForInputReady(page, options);
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(prompt);
  const afterFill = await page.evaluate((prompt) => {
    const input = document.querySelector('textarea[name="agent-chat-message"]');
    return {
      value: input instanceof HTMLTextAreaElement ? input.value : null,
      promptVisibleInTextarea:
        input instanceof HTMLTextAreaElement ? input.value === prompt : false,
    };
  }, prompt);
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

async function sendNewsPromptFromGui(page, options) {
  return await sendPromptFromGui(page, options, NEWS_PROMPT);
}

async function enableInputbarPlusModeFromGui(
  page,
  options,
  { label, menuTestId, statusTestId, statusText },
) {
  await waitForInputReady(page, options);
  await page.locator('textarea[name="agent-chat-message"]').first().focus();
  const opened = await page.evaluate(() => {
    const directTrigger = document.querySelector(
      '[data-testid="inputbar-plus-trigger"]',
    );
    if (directTrigger instanceof HTMLElement) {
      directTrigger.click();
      return { clicked: true, method: "testid" };
    }

    const buttons = Array.from(document.querySelectorAll("button"));
    const trigger = buttons.find((button) => {
      const label = [
        button.getAttribute("data-testid") || "",
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
        button.textContent || "",
      ].join("\n");
      return (
        label.includes("inputbar-plus-trigger") ||
        label.includes("更多") ||
        label.includes("添加") ||
        /\bMore\b/i.test(label)
      );
    });
    if (trigger instanceof HTMLElement) {
      trigger.click();
      return { clicked: true, method: "label" };
    }
    return {
      clicked: false,
      buttons: buttons.map((button) => ({
        testId: button.getAttribute("data-testid") || "",
        aria: button.getAttribute("aria-label") || "",
        title: button.getAttribute("title") || "",
        text: button.textContent || "",
        disabled: button.disabled,
      })),
    };
  });
  assert(
    opened?.clicked,
    `未找到输入区更多菜单按钮，无法切换 ${label}: ${JSON.stringify(
      sanitizeJson(opened),
    )}`,
  );

  const startedAt = Date.now();
  let lastSnapshot = null;
  let clickedModeButton = false;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, ({ menuTestId, statusTestId }) => {
      const menu = document.querySelector('[data-testid="inputbar-plus-menu"]');
      const modeButton = document.querySelector(`[data-testid="${menuTestId}"]`);
      const statusChip = statusTestId
        ? document.querySelector(`[data-testid="${statusTestId}"]`)
        : null;
      return {
        menuVisible: Boolean(menu),
        modeButtonVisible: Boolean(modeButton),
        statusChipVisible: Boolean(statusChip),
        statusText: statusChip?.textContent || "",
        bodyText: document.body?.innerText || "",
      };
    }, { menuTestId, statusTestId });
    lastSnapshot = snapshot;
    if (snapshot?.modeButtonVisible) {
      await page.locator(`[data-testid="${menuTestId}"]`).click();
      clickedModeButton = true;
      break;
    }
    await sleep(options.intervalMs);
  }
  assert(
    clickedModeButton,
    `未找到 ${label} 菜单项: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );

  const enabledStartedAt = Date.now();
  const enabledTimeoutMs = Math.max(
    options.intervalMs,
    options.timeoutMs - (enabledStartedAt - startedAt),
  );
  while (Date.now() - enabledStartedAt < enabledTimeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, ({ statusTestId, statusText }) => {
      const statusChip = statusTestId
        ? document.querySelector(`[data-testid="${statusTestId}"]`)
        : null;
      return {
        statusChipVisible: Boolean(statusChip),
        statusText: statusChip?.textContent || "",
        bodyText: document.body?.innerText || "",
      };
    }, { statusTestId, statusText });
    const hasExpectedText =
      !statusText ||
      snapshot?.statusText?.includes(statusText) ||
      snapshot?.bodyText?.includes(statusText);
    if (snapshot?.statusChipVisible && hasExpectedText) {
      return sanitizeJson(snapshot);
    }
    lastSnapshot = snapshot;
    await sleep(options.intervalMs);
  }

  throw new Error(
    `${label} 未在输入区启用: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function enablePlanModeFromGui(page, options) {
  return await enableInputbarPlusModeFromGui(page, options, {
    label: "Plan mode",
    menuTestId: "inputbar-plus-plan-mode",
    statusTestId: "inputbar-task-mode-status",
    statusText: "",
  });
}

async function enableGoalModeFromGui(page, options) {
  return await enableInputbarPlusModeFromGui(page, options, {
    label: "追求目标",
    menuTestId: "inputbar-plus-objective",
    statusTestId: "inputbar-objective-status",
    statusText: "追求目标",
  });
}

async function waitForGuiChatCompleted(
  page,
  options,
  {
    prompt = NEWS_PROMPT,
    doneText = ASSISTANT_DONE_TEXT,
    summaryText = "今日国际新闻简要整理",
  } = {},
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText, summaryText }) => {
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
          hasAssistantSummary: text.includes(summaryText),
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
      { prompt, doneText, summaryText },
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
    `Claw GUI 未完成输入闭环: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function waitForGuiWebToolsRenderingCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({
        prompt,
        doneText,
        searchTitle,
        searchUrl,
        searchSourceLabel,
        midThinkingText,
        fetchMarkdown,
      }) => {
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
        const processGroups = Array.from(
          document.querySelectorAll('[data-testid="streaming-process-group"]'),
        ).map((group) => {
          const button = group.querySelector("button");
          return {
            text: group.textContent || "",
            buttonText: button?.textContent || "",
            expanded: button?.getAttribute("aria-expanded") || "",
          };
        });
        const webProcessGroup = processGroups.find(
          (group) =>
            group.buttonText.includes("已搜索网页 1 次，读取网页 1 次") ||
            group.text.includes("已搜索网页 1 次，读取网页 1 次"),
        );
        const promptIndex = text.indexOf(prompt);
        const processIndex = text.indexOf("已搜索网页 1 次，读取网页 1 次");
        const finalIndex = text.indexOf("网页搜索渲染结论");
        const sourceIndex = text.indexOf(searchTitle);
        const midThinkingIndex = text.indexOf(midThinkingText);
        const fetchPageIndex = text.indexOf(
          searchSourceLabel,
          Math.max(midThinkingIndex, 0),
        );
        const markdownHeading = Array.from(
          document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
        ).find((node) => node.textContent?.includes("五年级选购指南"));
        const markdownStrongTexts = Array.from(
          document.querySelectorAll("strong"),
        ).map((node) => node.textContent || "");
        const markdownTableVisible = Boolean(
          document.querySelector('[data-testid="markdown-table-scroll"] table'),
        );
        const forbiddenTransportFragments = [
          '"bytes"',
          '"codeText"',
          '"result"',
          "bytes:",
          "codeText:",
          "2048",
          "{ bytes",
          "{bytes",
        ];
        const forbiddenSearchNoiseFragments = [
          "Help",
          "Sign In",
          "Yahoo Scout",
          "https://help.yahoo.com/kb/search-for-desktop",
          "https://login.yahoo.com/",
          "https://scout.yahoo.com/chat",
        ];
        const forbiddenRawMarkdownFragments = [
          "五年级选购指南###",
          "####如果孩子基础",
          "**推荐 型号 **",
          "**理由 **",
          "| 品牌 | 型号 |",
        ];
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes("网页搜索渲染结论"),
          hasDoneText: text.includes(doneText),
          hasProcessTitle: text.includes("已搜索网页 1 次，读取网页 1 次"),
          hasSearchSourceSection: Boolean(
            webProcessGroup?.text.includes("搜索来源") ||
              webProcessGroup?.text.includes("Search sources"),
          ),
          hasFetchPageSection: Boolean(
            webProcessGroup?.text.includes("读取页面") ||
              webProcessGroup?.text.includes("Read pages"),
          ),
          hasSearchTitle: text.includes(searchTitle),
          hasMidThinkingText: text.includes(midThinkingText),
          hasSearchUrl: text.includes(searchUrl),
          hasSearchSourceLabel: text.includes(searchSourceLabel),
          hasFullSearchUrlVisible: text.includes(searchUrl),
          hasFetchMarkdownHidden: !text.includes(fetchMarkdown),
          hasFetchPageUrl: Boolean(
            webProcessGroup?.text.includes(searchSourceLabel),
          ),
          hasFinalTextAfterProcess:
            promptIndex >= 0 &&
            processIndex > promptIndex &&
            (sourceIndex < 0 || sourceIndex > processIndex) &&
            finalIndex > processIndex,
          hasTimelineOrderPreserved:
            processIndex >= 0 &&
            sourceIndex > processIndex &&
            midThinkingIndex > sourceIndex &&
            fetchPageIndex > midThinkingIndex &&
            finalIndex > fetchPageIndex,
          webProcessGroupExpanded: webProcessGroup?.expanded === "true",
          webProcessGroupText: webProcessGroup?.text || "",
          processGroupCount: processGroups.length,
          rawJsonEnvelopeVisible: forbiddenTransportFragments.some((value) =>
            text.includes(value),
          ),
          forbiddenTransportHits: forbiddenTransportFragments.filter((value) =>
            text.includes(value),
          ),
          searchNoiseVisible: forbiddenSearchNoiseFragments.some((value) =>
            text.includes(value),
          ),
          forbiddenSearchNoiseHits: forbiddenSearchNoiseFragments.filter(
            (value) => text.includes(value),
          ),
          rawMarkdownVisible: forbiddenRawMarkdownFragments.some((value) =>
            text.includes(value),
          ),
          forbiddenRawMarkdownHits: forbiddenRawMarkdownFragments.filter(
            (value) => text.includes(value),
          ),
          markdownHeadingVisible: Boolean(markdownHeading),
          markdownStrongVisible:
            markdownStrongTexts.includes("推荐 型号") &&
            markdownStrongTexts.includes("理由"),
          markdownTableVisible,
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
      {
        prompt: WEB_TOOLS_RENDERING_PROMPT,
        doneText: WEB_TOOLS_RENDERING_DONE_TEXT,
        searchTitle: WEB_TOOLS_SEARCH_TITLE,
        searchUrl: WEB_TOOLS_SEARCH_URL,
        searchSourceLabel: WEB_TOOLS_SEARCH_SOURCE_LABEL,
        midThinkingText: WEB_TOOLS_MID_THINKING_TEXT,
        fetchMarkdown: WEB_TOOLS_FETCH_MARKDOWN,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      (snapshot.hasAssistantSummary || snapshot.hasDoneText) &&
      snapshot.hasProcessTitle &&
      snapshot.webProcessGroupExpanded === false &&
      snapshot.hasSearchSourceSection === false &&
      snapshot.hasFetchPageSection === false &&
      snapshot.hasSearchTitle === false &&
      snapshot.hasMidThinkingText === false &&
      snapshot.hasSearchSourceLabel === false &&
      snapshot.hasFullSearchUrlVisible === false &&
      snapshot.hasFetchPageUrl === false &&
      snapshot.hasFetchMarkdownHidden &&
      snapshot.hasFinalTextAfterProcess &&
      snapshot.hasTimelineOrderPreserved === false &&
      snapshot.rawJsonEnvelopeVisible === false &&
      snapshot.searchNoiseVisible === false &&
      snapshot.rawMarkdownVisible === false &&
      snapshot.markdownHeadingVisible &&
      snapshot.markdownStrongVisible &&
      snapshot.markdownTableVisible &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      const expandedSnapshot = await expandAndInspectGuiWebToolsProcess(page, {
        ...options,
        defaultSnapshot: snapshot,
      });
      return sanitizeJson({
        ...snapshot,
        expandedDetails: expandedSnapshot,
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成网页搜索渲染验收: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function expandAndInspectGuiWebToolsProcess(page, options) {
  await page.evaluate(() => {
    const groups = Array.from(
      document.querySelectorAll('[data-testid="streaming-process-group"]'),
    );
    const targetGroup = groups.find((group) =>
      (group.textContent || "").includes("已搜索网页 1 次，读取网页 1 次"),
    );
    const button = targetGroup?.querySelector("button");
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });

  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 30000)) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({
        searchTitle,
        searchUrl,
        searchSourceLabel,
        midThinkingText,
        fetchMarkdown,
      }) => {
        const text = document.body?.innerText || "";
        const processGroups = Array.from(
          document.querySelectorAll('[data-testid="streaming-process-group"]'),
        ).map((group) => {
          const button = group.querySelector("button");
          return {
            text: group.textContent || "",
            buttonText: button?.textContent || "",
            expanded: button?.getAttribute("aria-expanded") || "",
          };
        });
        const webProcessGroup = processGroups.find(
          (group) =>
            group.buttonText.includes("已搜索网页 1 次，读取网页 1 次") ||
            group.text.includes("已搜索网页 1 次，读取网页 1 次"),
        );
        const processText = webProcessGroup?.text || "";
        const processIndex = processText.indexOf(
          "已搜索网页 1 次，读取网页 1 次",
        );
        const sourceIndex = processText.indexOf(searchTitle);
        const midThinkingIndex = processText.indexOf(midThinkingText);
        const fetchPageIndex = processText.indexOf(
          searchSourceLabel,
          Math.max(midThinkingIndex, 0),
        );
        return {
          webProcessGroupExpanded: webProcessGroup?.expanded === "true",
          hasSearchSourceSection: Boolean(
            webProcessGroup?.text.includes("搜索来源") ||
              webProcessGroup?.text.includes("Search sources"),
          ),
          hasFetchPageSection: Boolean(
            webProcessGroup?.text.includes("读取页面") ||
              webProcessGroup?.text.includes("Read pages"),
          ),
          hasSearchTitle: text.includes(searchTitle),
          hasMidThinkingText: processText.includes(midThinkingText),
          hasSearchSourceLabel: text.includes(searchSourceLabel),
          hasFullSearchUrlVisible: text.includes(searchUrl),
          hasFetchMarkdownHidden: !text.includes(fetchMarkdown),
          hasFetchPageUrl: Boolean(
            webProcessGroup?.text.includes(searchSourceLabel),
          ),
          hasTimelineOrderPreserved:
            processIndex >= 0 &&
            sourceIndex > processIndex &&
            midThinkingIndex > sourceIndex &&
            fetchPageIndex > midThinkingIndex,
          webProcessGroupText: processText,
        };
      },
      {
        searchTitle: WEB_TOOLS_SEARCH_TITLE,
        searchUrl: WEB_TOOLS_SEARCH_URL,
        searchSourceLabel: WEB_TOOLS_SEARCH_SOURCE_LABEL,
        midThinkingText: WEB_TOOLS_MID_THINKING_TEXT,
        fetchMarkdown: WEB_TOOLS_FETCH_MARKDOWN,
      },
    );
    lastSnapshot = snapshot;
    if (
      snapshot?.webProcessGroupExpanded &&
      snapshot.hasSearchSourceSection &&
      snapshot.hasFetchPageSection &&
      snapshot.hasSearchTitle &&
      snapshot.hasMidThinkingText &&
      snapshot.hasSearchSourceLabel &&
      snapshot.hasFullSearchUrlVisible === false &&
      snapshot.hasFetchPageUrl &&
      snapshot.hasTimelineOrderPreserved &&
      snapshot.hasFetchMarkdownHidden
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 网页搜索过程展开验收失败: ${JSON.stringify(
      sanitizeJson({ defaultSnapshot: options.defaultSnapshot, lastSnapshot }),
    )}`,
  );
}

async function inspectGuiWebToolsRenderingDebug(page) {
  return await evaluatePageSnapshot(page, () => {
    const text = document.body?.innerText || "";
    const processGroups = Array.from(
      document.querySelectorAll('[data-testid="streaming-process-group"]'),
    ).map((group, index) => {
      const button = group.querySelector("button");
      return {
        index,
        processKind: group.getAttribute("data-process-kind") || "",
        processRunning: group.getAttribute("data-process-running") || "",
        visualTone: group.getAttribute("data-visual-tone") || "",
        expanded: button?.getAttribute("aria-expanded") || "",
        buttonText: button?.textContent || "",
        text: group.textContent || "",
      };
    });
    const thinkingBlocks = Array.from(
      document.querySelectorAll('[data-testid="thinking-block"]'),
    ).map((block, index) => ({
      index,
      visualStyle: block.getAttribute("data-visual-style") || "",
      text: block.textContent || "",
    }));
    const processRows = Array.from(
      document.querySelectorAll(
        '[data-testid="web-retrieval-process-row"], [data-testid="inline-tool-process-step"]',
      ),
    ).map((row, index) => ({
      index,
      testId: row.getAttribute("data-testid") || "",
      grouped: row.getAttribute("data-grouped") || "",
      toolStatus: row.getAttribute("data-tool-status") || "",
      text: row.textContent || "",
    }));
    const renderers = Array.from(
      document.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).map((renderer, index) => ({
      index,
      renderMode: renderer.getAttribute("data-render-mode") || "",
      contentPartTypes: renderer.getAttribute("data-content-part-types") || "",
      text: renderer.textContent || "",
    }));
    const messageBubbles = Array.from(
      document.querySelectorAll("[data-message-role]"),
    ).map((bubble, index) => ({
      index,
      role: bubble.getAttribute("data-message-role") || "",
      messageContentPartTypes:
        bubble.getAttribute("data-message-content-part-types") || "",
      rendererContentPartTypes:
        bubble.getAttribute("data-renderer-content-part-types") || "",
      timelineItems: bubble.getAttribute("data-timeline-items") || "",
      text: bubble.textContent || "",
    }));
    const messageList = document.querySelector('[data-testid="message-list"]');
    const frame = document.querySelector('[data-testid="message-list-frame"]');
    return {
      url: window.location.href,
      hasMidThinkingInBody: text.includes(
        "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
      ),
      processGroups,
      thinkingBlocks,
      processRows,
      renderers,
      messageBubbles,
      messageListText: messageList?.textContent || "",
      messageFrameText: frame?.textContent || "",
      bodyText: text,
    };
  });
}

async function waitForGuiPlanCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText, planSteps }) => {
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
        const taskRailText =
          document
            .querySelector('[data-testid="task-center-run-control-surface"]')
            ?.textContent ||
          document
            .querySelector('[data-testid="task-center-task-rail"]')
            ?.textContent ||
          text;
        const planDecisionPanel = document.querySelector(
          '[data-testid="plan-composer-decision-panel"][data-layout="composer-drawer"]',
        );
        const planDecisionText = planDecisionPanel?.textContent || "";
        const planDecisionRect = planDecisionPanel?.getBoundingClientRect();
        const planDecisionStyle = planDecisionPanel
          ? window.getComputedStyle(planDecisionPanel)
          : null;
        const planDecisionVisible = Boolean(
          planDecisionPanel &&
            planDecisionRect &&
            planDecisionRect.width > 320 &&
            planDecisionRect.height > 48 &&
            planDecisionStyle?.visibility !== "hidden" &&
            planDecisionStyle?.display !== "none",
        );
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasPlanIntro: text.includes("我先给出计划"),
          hasDoneText: text.includes(doneText),
          hasPlanSection: taskRailText.includes("计划"),
          hasAllPlanSteps: planSteps.every((step) =>
            taskRailText.includes(step.step),
          ),
          planStepHits: planSteps.map((step) => ({
            step: step.step,
            visible: taskRailText.includes(step.step),
          })),
          proposedPlanVisible: planSteps.every((step) =>
            taskRailText.includes(step.step),
          ),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          planDecisionVisible,
          planDecisionText,
          planDecisionHasTitle: planDecisionText.includes("实施此计划"),
          planDecisionHasAcceptOption:
            planDecisionText.includes("是，实施此计划"),
          planDecisionHasAdjustInput: Boolean(
            planDecisionPanel?.querySelector(
              '[data-testid="plan-composer-adjust-input"]',
            ),
          ),
          planDecisionHasEscHint: planDecisionText.includes("ESC"),
          bodyText: text,
          taskRailText,
        };
      },
      { prompt: PLAN_PROMPT, doneText: PLAN_DONE_TEXT, planSteps: PLAN_STEPS },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.hasAllPlanSteps &&
      snapshot.planDecisionVisible &&
      snapshot.planDecisionHasTitle &&
      snapshot.planDecisionHasAcceptOption &&
      snapshot.planDecisionHasAdjustInput &&
      snapshot.textareaVisible === false &&
      snapshot.stopButtonVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未显示计划轨: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
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

async function waitForSessionReadCompleted(
  page,
  options,
  requestLog,
  {
    prompt = NEWS_PROMPT,
    doneText = ASSISTANT_DONE_TEXT,
    summaryText = "今日国际新闻简要整理",
  } = {},
) {
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
      serialized.includes(prompt) &&
      (serialized.includes(doneText) || serialized.includes(summaryText))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成输入闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

async function waitForSessionReadPlanCompleted(page, options, requestLog) {
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
      serialized.includes(PLAN_PROMPT) &&
      serialized.includes("<proposed_plan>") &&
      serialized.includes("</proposed_plan>") &&
      PLAN_STEPS.every((step) => serialized.includes(step.step))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未读回 proposed_plan 计划块: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

async function waitForSessionReadContainsTurn(
  page,
  options,
  requestLog,
  turnId,
  expectedText,
) {
  const startedAt = Date.now();
  let lastRead = null;
  const timeoutMs = Math.min(options.timeoutMs, 30_000);
  while (Date.now() - startedAt < timeoutMs) {
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
    if (serialized.includes(turnId) && serialized.includes(expectedText)) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未读回 event/read probe turn: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

function collectReadModelToolCalls(readResult) {
  const detail = readRecord(readResult?.detail) ?? readRecord(readResult) ?? {};
  const threadRead =
    readRecord(detail.thread_read) ?? readRecord(detail.threadRead) ?? {};
  return [
    ...(Array.isArray(detail.tool_calls) ? detail.tool_calls : []),
    ...(Array.isArray(detail.toolCalls) ? detail.toolCalls : []),
    ...(Array.isArray(threadRead.tool_calls) ? threadRead.tool_calls : []),
    ...(Array.isArray(threadRead.toolCalls) ? threadRead.toolCalls : []),
  ].filter((toolCall) => toolCall && typeof toolCall === "object");
}

function findReadModelToolCall(readResult, toolCallId, toolName) {
  return collectReadModelToolCalls(readResult).find((toolCall) => {
    const id = String(
      toolCall.id ??
        toolCall.tool_call_id ??
        toolCall.toolCallId ??
        toolCall.toolId ??
        "",
    );
    const name = String(
      toolCall.tool_name ?? toolCall.toolName ?? toolCall.name ?? "",
    );
    return id === toolCallId && name === toolName;
  });
}

async function waitForAgentSessionEventsForTurn(
  page,
  options,
  turnId,
  initialMessages,
) {
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs, 30_000);
  let events = collectAgentSessionEvents(initialMessages);
  let drainAttempts = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const summary = summarizeAgentSessionEvents(events, turnId);
    if (
      summary.scopedEventCount > 0 &&
      summary.hasTextDelta &&
      summary.hasToolStarted &&
      summary.hasToolResult &&
      summary.hasTerminal
    ) {
      return {
        events,
        summary: {
          ...summary,
          drainAttempts,
        },
      };
    }

    const drained = await drainAppServerEventsFromPage(page, 50);
    drainAttempts += 1;
    events = mergeAgentSessionEvents(
      events,
      collectAgentSessionEvents(drained.messages),
    );
    await sleep(options.intervalMs);
  }

  throw new Error(
    `未观察到 agentSession/event 同 turn 终态: ${JSON.stringify(
      summarizeAgentSessionEvents(events, turnId),
    )}`,
  );
}

async function runEventReadProbe(page, options, requestLog) {
  const eventName = `agentSession/event/${SESSION_ID}`;
  const turnStart = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: SESSION_ID,
      turnId: EVENT_READ_PROBE_TURN_ID,
      input: {
        text: EVENT_READ_PROBE_PROMPT,
      },
      runtimeOptions: {
        stream: true,
        eventName,
        providerPreference: FIXTURE_PROVIDER,
        modelPreference: FIXTURE_MODEL,
        metadata: {
          harness: {
            source: "smoke:claw-chat-current-fixture:event-read-probe",
          },
        },
        hostOptions: {
          asterChatRequest: {
            message: EVENT_READ_PROBE_PROMPT,
            session_id: SESSION_ID,
            event_name: eventName,
            provider_preference: FIXTURE_PROVIDER,
            model_preference: FIXTURE_MODEL,
            turn_id: EVENT_READ_PROBE_TURN_ID,
            turn_config: null,
          },
        },
      },
      queueIfBusy: false,
      skipPreSubmitResume: true,
    },
    requestLog,
  );

  const eventObservation = await waitForAgentSessionEventsForTurn(
    page,
    options,
    EVENT_READ_PROBE_TURN_ID,
    turnStart.messages,
  );
  const readModel = await waitForSessionReadContainsTurn(
    page,
    options,
    requestLog,
    EVENT_READ_PROBE_TURN_ID,
    EVENT_READ_PROBE_READ_TEXT,
  );
  const toolCall = findReadModelToolCall(
    readModel,
    EVENT_READ_PROBE_TOOL_CALL_ID,
    EVENT_READ_PROBE_TOOL_NAME,
  );
  const toolOutput = String(
    toolCall?.output_preview ??
      toolCall?.outputPreview ??
      toolCall?.output ??
      "",
  );

  return sanitizeJson({
    turnId: EVENT_READ_PROBE_TURN_ID,
    eventName,
    turnStartResult: {
      turnId:
        turnStart.result?.turn?.turnId ??
        turnStart.result?.turn?.turn_id ??
        null,
      status: turnStart.result?.turn?.status ?? null,
      messageCount: turnStart.messages.length,
      notificationCount: collectAgentSessionEvents(turnStart.messages).length,
    },
    events: eventObservation.summary,
    readModel: {
      containsTurnId: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_TURN_ID,
      ),
      containsDoneText: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_DONE_TEXT,
      ),
      containsReadText: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_READ_TEXT,
      ),
      toolCallCount: collectReadModelToolCalls(readModel).length,
      containsToolCall: Boolean(toolCall),
      toolName: toolCall?.tool_name ?? toolCall?.toolName ?? null,
      toolStatus: toolCall?.status ?? null,
      containsToolOutput: toolOutput.includes(EVENT_READ_PROBE_TOOL_OUTPUT),
      toolTurnId: toolCall?.turn_id ?? toolCall?.turnId ?? null,
      latestTurnStatus:
        readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
        readModel?.detail?.thread_read?.status ??
        readModel?.detail?.status ??
        null,
    },
  });
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
  const backendEmitEntries = backendLedger.filter(
    (entry) => entry.kind === "backendEmit",
  );
  const latestTurnStart = turnStartEntries.at(-1) ?? null;
  const latestTurnCancel = turnCancelEntries.at(-1) ?? null;
  const latestTurnEmitEntries =
    latestTurnStart?.turnId == null
      ? []
      : backendEmitEntries.filter(
          (entry) => entry.turnId === latestTurnStart.turnId,
        );
  const latestTurnEmitTimes = latestTurnEmitEntries
    .map((entry) => Date.parse(entry.recordedAt))
    .filter((timestamp) => Number.isFinite(timestamp));
  const latestTurnEmitSpanMs =
    latestTurnEmitTimes.length >= 2
      ? Math.max(...latestTurnEmitTimes) - Math.min(...latestTurnEmitTimes)
      : 0;
  const asterChatRequest = latestTurnStart?.asterChatRequest ?? null;
  const collaborationMode =
    asterChatRequest?.turn_config?.metadata?.harness?.collaboration_mode
      ?.mode ??
    asterChatRequest?.turnConfig?.metadata?.harness?.collaborationMode?.mode ??
    latestTurnStart?.runtimeOptions?.metadata?.harness?.collaboration_mode
      ?.mode ??
    latestTurnStart?.runtimeOptions?.metadata?.harness?.collaborationMode
      ?.mode ??
    null;
  return {
    kinds: backendLedger.map((entry) => entry.kind),
    turnStartCount: turnStartEntries.length,
    turnCancelCount: turnCancelEntries.length,
    backendEmitCount: backendEmitEntries.length,
    latestTurnBackendEmitCount: latestTurnEmitEntries.length,
    latestTurnBackendEmitSpanMs: latestTurnEmitSpanMs,
    latestTurnBackendEmitTypes: latestTurnEmitEntries.map(
      (entry) => entry.eventTypes,
    ),
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
          collaborationMode,
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

function readHarnessMetadataFromTurnStart(turnStart) {
  const asterChatRequest = turnStart?.asterChatRequest ?? {};
  return (
    asterChatRequest?.turn_config?.metadata?.harness ??
    asterChatRequest?.turnConfig?.metadata?.harness ??
    turnStart?.runtimeOptions?.metadata?.harness ??
    {}
  );
}

function readObjectiveTextFromHarness(harness) {
  return (
    harness?.thread_goal?.set?.objective ??
    harness?.threadGoal?.set?.objective ??
    harness?.goal?.set?.objective ??
    harness?.managed_objective?.objective_text ??
    harness?.managedObjective?.objectiveText ??
    null
  );
}

function isTaskCenterHomeText(text) {
  return (
    text.includes("青柠一下，灵感即来") ||
    text.includes("你可以从这些任务开始") ||
    text.includes("向下滑，看看 Lime 可以帮你做什么")
  );
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
    guiSessionOpened: null,
    inputSend: null,
    guiCompleted: null,
    stopClick: null,
    guiCanceled: null,
    continueInputSend: null,
    guiContinueCompleted: null,
    planModeEnabled: null,
    planInputSend: null,
    guiPlanCompleted: null,
    goalModeEnabled: null,
    goalInputSend: null,
    guiGoalCompleted: null,
    webToolsRenderingInputSend: null,
    guiWebToolsRenderingCompleted: null,
    readModelCompleted: null,
    readModelCanceled: null,
    readModelContinueCompleted: null,
    readModelPlanCompleted: null,
    readModelGoalCompleted: null,
    readModelWebToolsRenderingCompleted: null,
    eventReadProbe: null,
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
      workspace,
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
        cwd: workspace.rootPath,
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
    summary.guiSessionOpened = sanitizeJson(
      await openFixtureSessionFromSidebar(page, options, appServerRequests),
    );

    if (options.scenario === "plan") {
      logStage("enable-plan-mode-from-gui");
      summary.planModeEnabled = sanitizeJson(
        await enablePlanModeFromGui(page, options),
      );

      logStage("send-plan-prompt-from-gui");
      summary.planInputSend = sanitizeJson(
        await sendPromptFromGui(page, options, PLAN_PROMPT),
      );

      logStage("wait-gui-plan-completed");
      summary.guiPlanCompleted = sanitizeJson(
        await waitForGuiPlanCompleted(page, options),
      );

      logStage("wait-read-model-plan-completed");
      const readModelPlanCompleted = await waitForSessionReadPlanCompleted(
        page,
        options,
        appServerRequests,
      );
      summary.readModelPlanCompleted = sanitizeJson({
        latestTurnCompleted:
          readModelPlanCompleted?.detail?.status === "completed" ||
          readModelPlanCompleted?.detail?.thread_read?.status ===
            "completed" ||
          readModelPlanCompleted?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus === "completed",
        detailItemCount: Array.isArray(readModelPlanCompleted?.detail?.items)
          ? readModelPlanCompleted.detail.items.length
          : null,
        latestTurnStatus:
          readModelPlanCompleted?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus ??
          readModelPlanCompleted?.detail?.thread_read?.status ??
          readModelPlanCompleted?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(readModelPlanCompleted || {}).includes(
          PLAN_PROMPT,
        ),
        includesProposedPlanBlock:
          JSON.stringify(readModelPlanCompleted || {}).includes(
            "<proposed_plan>",
          ) &&
          JSON.stringify(readModelPlanCompleted || {}).includes(
            "</proposed_plan>",
          ),
        includesAssistantDone: JSON.stringify(
          readModelPlanCompleted || {},
        ).includes(PLAN_DONE_TEXT),
        includesPlanItem:
          JSON.stringify(readModelPlanCompleted || {}).includes("plan") ||
          JSON.stringify(readModelPlanCompleted || {}).includes(
            "proposed_plan",
          ),
        includesAllPlanSteps: PLAN_STEPS.every((step) =>
          JSON.stringify(readModelPlanCompleted || {}).includes(step.step),
        ),
      });
    } else if (options.scenario === "goal") {
      logStage("enable-goal-mode-from-gui");
      summary.goalModeEnabled = sanitizeJson(
        await enableGoalModeFromGui(page, options),
      );

      logStage("send-goal-prompt-from-gui");
      summary.goalInputSend = sanitizeJson(
        await sendPromptFromGui(page, options, GOAL_PROMPT),
      );

      logStage("wait-gui-goal-completed");
      summary.guiGoalCompleted = sanitizeJson(
        await waitForGuiChatCompleted(page, options, {
          prompt: GOAL_PROMPT,
          doneText: GOAL_DONE_TEXT,
          summaryText: "目标已绑定到本轮请求",
        }),
      );

      logStage("wait-read-model-goal-completed");
      const readModelGoalCompleted = await waitForSessionReadCompleted(
        page,
        options,
        appServerRequests,
        {
          prompt: GOAL_PROMPT,
          doneText: GOAL_DONE_TEXT,
          summaryText: "目标已绑定到本轮请求",
        },
      );
      summary.readModelGoalCompleted = sanitizeJson({
        detailItemCount: Array.isArray(readModelGoalCompleted?.detail?.items)
          ? readModelGoalCompleted.detail.items.length
          : null,
        latestTurnStatus:
          readModelGoalCompleted?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus ??
          readModelGoalCompleted?.detail?.thread_read?.status ??
          readModelGoalCompleted?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(readModelGoalCompleted || {}).includes(
          GOAL_PROMPT,
        ),
        includesAssistantDone: JSON.stringify(
          readModelGoalCompleted || {},
        ).includes(GOAL_DONE_TEXT),
        includesAssistantSummary: JSON.stringify(
          readModelGoalCompleted || {},
        ).includes("目标已绑定到本轮请求"),
      });
    } else if (options.scenario === "web-tools-rendering") {
      logStage("send-web-tools-rendering-prompt-from-gui");
      summary.webToolsRenderingInputSend = sanitizeJson(
        await sendPromptFromGui(page, options, WEB_TOOLS_RENDERING_PROMPT),
      );

      logStage("wait-gui-web-tools-rendering-completed");
      try {
        summary.guiWebToolsRenderingCompleted = sanitizeJson(
          await waitForGuiWebToolsRenderingCompleted(page, options),
        );
      } catch (error) {
        try {
          summary.guiWebToolsRenderingDebug = sanitizeJson(
            await inspectGuiWebToolsRenderingDebug(page),
          );
        } catch (debugError) {
          summary.guiWebToolsRenderingDebug = sanitizeJson({
            error: String(debugError?.message || debugError),
          });
        }
        try {
          const probe = await invokeAppServerFromPage(
            page,
            APP_SERVER_METHOD_SESSION_READ,
            {
              sessionId: SESSION_ID,
              historyLimit: 100,
            },
            appServerRequests,
          );
          const serializedProbe = JSON.stringify(probe.result || {});
          summary.readModelWebToolsRenderingFailureProbe = sanitizeJson({
            detailItemCount: Array.isArray(probe.result?.detail?.items)
              ? probe.result.detail.items.length
              : null,
            includesMidThinking: serializedProbe.includes(
              WEB_TOOLS_MID_THINKING_TEXT,
            ),
            includesWebSearchTool: serializedProbe.includes(
              WEB_TOOLS_SEARCH_TOOL_CALL_ID,
            ),
            includesWebFetchTool: serializedProbe.includes(
              WEB_TOOLS_FETCH_TOOL_CALL_ID,
            ),
          });
        } catch (probeError) {
          summary.readModelWebToolsRenderingFailureProbe = sanitizeJson({
            error: String(probeError?.message || probeError),
          });
        }
        throw error;
      }

      logStage("wait-read-model-web-tools-rendering-completed");
      const readModelWebToolsRenderingCompleted =
        await waitForSessionReadCompleted(page, options, appServerRequests, {
          prompt: WEB_TOOLS_RENDERING_PROMPT,
          doneText: WEB_TOOLS_RENDERING_DONE_TEXT,
          summaryText: "网页搜索渲染结论",
        });
      summary.readModelWebToolsRenderingCompleted = sanitizeJson({
        detailItemCount: Array.isArray(
          readModelWebToolsRenderingCompleted?.detail?.items,
        )
          ? readModelWebToolsRenderingCompleted.detail.items.length
          : null,
        toolCallCount: collectReadModelToolCalls(
          readModelWebToolsRenderingCompleted,
        ).length,
        latestTurnStatus:
          readModelWebToolsRenderingCompleted?.detail?.thread_read
            ?.runtime_summary?.latestTurnStatus ??
          readModelWebToolsRenderingCompleted?.detail?.thread_read?.status ??
          readModelWebToolsRenderingCompleted?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(
          readModelWebToolsRenderingCompleted || {},
        ).includes(WEB_TOOLS_RENDERING_PROMPT),
        includesAssistantDone: JSON.stringify(
          readModelWebToolsRenderingCompleted || {},
        ).includes(WEB_TOOLS_RENDERING_DONE_TEXT),
        includesAssistantSummary: JSON.stringify(
          readModelWebToolsRenderingCompleted || {},
        ).includes("网页搜索渲染结论"),
        includesWebSearchTool: JSON.stringify(
          readModelWebToolsRenderingCompleted || {},
        ).includes(WEB_TOOLS_SEARCH_TOOL_CALL_ID),
        includesWebFetchTool: JSON.stringify(
          readModelWebToolsRenderingCompleted || {},
        ).includes(WEB_TOOLS_FETCH_TOOL_CALL_ID),
      });
    } else {
      logStage("send-news-prompt-from-gui");
      summary.inputSend = sanitizeJson(
        await sendNewsPromptFromGui(page, options),
      );
    }

    if (
      options.scenario === "cancel" ||
      options.scenario === "cancel-then-continue"
    ) {
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

      if (options.scenario === "cancel-then-continue") {
        logStage("send-continue-prompt-from-gui");
        summary.continueInputSend = sanitizeJson(
          await sendPromptFromGui(page, options, CONTINUE_PROMPT),
        );

        logStage("wait-gui-continue-completed");
        summary.guiContinueCompleted = sanitizeJson(
          await waitForGuiChatCompleted(page, options, {
            prompt: CONTINUE_PROMPT,
            doneText: CONTINUE_DONE_TEXT,
            summaryText: "继续输出已恢复",
          }),
        );

        logStage("wait-read-model-continue-completed");
        const readModelContinueCompleted = await waitForSessionReadCompleted(
          page,
          options,
          appServerRequests,
          {
            prompt: CONTINUE_PROMPT,
            doneText: CONTINUE_DONE_TEXT,
            summaryText: "继续输出已恢复",
          },
        );
        summary.readModelContinueCompleted = sanitizeJson({
          detailItemCount: Array.isArray(
            readModelContinueCompleted?.detail?.items,
          )
            ? readModelContinueCompleted.detail.items.length
            : null,
          latestTurnStatus:
            readModelContinueCompleted?.detail?.thread_read?.runtime_summary
              ?.latestTurnStatus ??
            readModelContinueCompleted?.detail?.thread_read?.status ??
            readModelContinueCompleted?.detail?.status ??
            null,
          includesPrompt: JSON.stringify(
            readModelContinueCompleted || {},
          ).includes(CONTINUE_PROMPT),
          includesAssistantDone: JSON.stringify(
            readModelContinueCompleted || {},
          ).includes(CONTINUE_DONE_TEXT),
          includesAssistantSummary: JSON.stringify(
            readModelContinueCompleted || {},
          ).includes("继续输出已恢复"),
        });
      }
    } else if (
      options.scenario !== "plan" &&
      options.scenario !== "goal" &&
      options.scenario !== "web-tools-rendering"
    ) {
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

      logStage("probe-agent-session-event-read");
      summary.eventReadProbe = await runEventReadProbe(
        page,
        options,
        appServerRequests,
      );
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
    const planImplementationTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" && entry.inputText === "Implement the plan.",
    );
    const newsTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === NEWS_PROMPT,
    );
    const planTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === PLAN_PROMPT,
    );
    const goalTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === GOAL_PROMPT,
    );
    const webToolsRenderingTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === WEB_TOOLS_RENDERING_PROMPT,
    );
    const continueTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" && entry.inputText === CONTINUE_PROMPT,
    );
    const latestTurnCancel = backendLedger
      .filter((entry) => entry.kind === "turnCancel")
      .at(-1);
    const isCancelOnlyScenario = options.scenario === "cancel";
    const isCancelThenContinueScenario =
      options.scenario === "cancel-then-continue";
    const isPlanScenario = options.scenario === "plan";
    const isGoalScenario = options.scenario === "goal";
    const isWebToolsRenderingScenario =
      options.scenario === "web-tools-rendering";
    const asterChatRequest =
      (isPlanScenario
        ? planTurnStart?.asterChatRequest
        : isGoalScenario
          ? goalTurnStart?.asterChatRequest
          : isWebToolsRenderingScenario
            ? webToolsRenderingTurnStart?.asterChatRequest
            : newsTurnStart?.asterChatRequest) ?? {};
    const hasCancelPhase = isCancelOnlyScenario || isCancelThenContinueScenario;
    const goalHarness = readHarnessMetadataFromTurnStart(goalTurnStart);
    const goalObjectiveText = readObjectiveTextFromHarness(goalHarness);
    const collaborationMode =
      asterChatRequest?.turn_config?.metadata?.harness?.collaboration_mode
        ?.mode ??
      asterChatRequest?.turnConfig?.metadata?.harness?.collaborationMode
        ?.mode ??
      (isPlanScenario
        ? planTurnStart?.runtimeOptions?.metadata?.harness?.collaboration_mode
            ?.mode ??
          planTurnStart?.runtimeOptions?.metadata?.harness?.collaborationMode
            ?.mode
        : null);
    const guiTurnStartReachedBackend = isPlanScenario
      ? planTurnStart?.inputText === PLAN_PROMPT
      : isGoalScenario
        ? goalTurnStart?.inputText === GOAL_PROMPT
        : isWebToolsRenderingScenario
          ? webToolsRenderingTurnStart?.inputText === WEB_TOOLS_RENDERING_PROMPT
          : newsTurnStart?.inputText === NEWS_PROMPT;
    const commonAssertions = {
      electronPreloadBridge: rendererSnapshot.electron === true,
      appServerJsonRpcUsed:
        appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) ||
        guiTurnStartReachedBackend,
      usedCurrentSessionStart: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_START,
      ),
      usedCurrentSessionRead: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_READ,
      ),
      usedCurrentSessionList: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_LIST,
      ),
      externalFixtureBackendUsed: backendLedger.some(
        (entry) => entry.kind === "turnStart",
      ),
      fixturePromptReachedBackend: guiTurnStartReachedBackend,
      liveProviderNotUsed: backendLedger.every(
        (entry) =>
          entry.kind !== "turnStart" ||
          ((!entry.providerPreference ||
            entry.providerPreference === FIXTURE_PROVIDER) &&
            (!entry.modelPreference ||
              entry.modelPreference === FIXTURE_MODEL)),
      ),
      newsRequestDidNotForceRequiredSearch:
        asterChatRequest?.search_mode !== "required",
      newsRequestDidNotPassLegacyWebSearchFlag:
        !Object.prototype.hasOwnProperty.call(
          asterChatRequest || {},
          "web_search",
      ),
      guiUserMessageVisible: isCancelOnlyScenario
        ? summary.guiCanceled?.hasPrompt === true
        : isCancelThenContinueScenario
          ? summary.guiContinueCompleted?.hasPrompt === true &&
            summary.guiContinueCompleted?.bodyText?.includes(NEWS_PROMPT) ===
              true
          : isPlanScenario
            ? summary.guiPlanCompleted?.hasPrompt === true
          : isGoalScenario
            ? summary.guiGoalCompleted?.hasPrompt === true
            : isWebToolsRenderingScenario
              ? summary.guiWebToolsRenderingCompleted?.hasPrompt === true
          : summary.guiCompleted?.hasPrompt === true,
      guiAssistantOutputVisible: isCancelOnlyScenario
        ? summary.guiCanceled?.hasStoppedCopy === true
        : isCancelThenContinueScenario
          ? summary.guiContinueCompleted?.hasAssistantSummary === true ||
            summary.guiContinueCompleted?.hasDoneText === true
          : isPlanScenario
            ? summary.guiPlanCompleted?.hasPlanIntro === true ||
              summary.guiPlanCompleted?.hasDoneText === true
            : isGoalScenario
              ? summary.guiGoalCompleted?.hasAssistantSummary === true ||
                summary.guiGoalCompleted?.hasDoneText === true
              : isWebToolsRenderingScenario
                ? summary.guiWebToolsRenderingCompleted?.hasAssistantSummary ===
                    true ||
                  summary.guiWebToolsRenderingCompleted?.hasDoneText === true
          : summary.guiCompleted?.hasAssistantSummary === true ||
            summary.guiCompleted?.hasDoneText === true,
      guiInputRemainsReady: isCancelOnlyScenario
        ? summary.guiCanceled?.textareaVisible === true &&
          summary.guiCanceled?.textareaDisabled === false
        : isCancelThenContinueScenario
          ? summary.guiContinueCompleted?.textareaVisible === true &&
            summary.guiContinueCompleted?.textareaDisabled === false
          : isPlanScenario
            ? summary.guiPlanCompleted?.planDecisionVisible === true &&
              summary.guiPlanCompleted?.textareaVisible === false
            : isGoalScenario
              ? summary.guiGoalCompleted?.textareaVisible === true &&
                summary.guiGoalCompleted?.textareaDisabled === false
              : isWebToolsRenderingScenario
                ? summary.guiWebToolsRenderingCompleted?.textareaVisible ===
                    true &&
                  summary.guiWebToolsRenderingCompleted?.textareaDisabled ===
                    false
          : summary.guiCompleted?.textareaVisible === true &&
            summary.guiCompleted?.textareaDisabled === false,
      guiNotStuckStreaming: isCancelOnlyScenario
        ? summary.guiCanceled?.stopButtonVisible === false
        : isCancelThenContinueScenario
          ? summary.guiContinueCompleted?.stopButtonVisible === false
          : isPlanScenario
            ? summary.guiPlanCompleted?.stopButtonVisible === false
            : isGoalScenario
              ? summary.guiGoalCompleted?.stopButtonVisible === false
              : isWebToolsRenderingScenario
                ? summary.guiWebToolsRenderingCompleted?.stopButtonVisible ===
                  false
          : summary.guiCompleted?.stopButtonVisible === false,
      pageMentionsPromptAndAssistant: isCancelOnlyScenario
        ? pageText.includes(NEWS_PROMPT) &&
          (pageText.includes("已停止") ||
            pageText.includes("本轮已中止") ||
            /\bStopped\b/i.test(pageText) ||
            /\bCanceled\b/i.test(pageText))
        : isCancelThenContinueScenario
          ? pageText.includes(NEWS_PROMPT) &&
            pageText.includes(CONTINUE_PROMPT) &&
            (pageText.includes("继续输出已恢复") ||
              pageText.includes(CONTINUE_DONE_TEXT))
          : isPlanScenario
            ? pageText.includes(PLAN_PROMPT) &&
              PLAN_STEPS.every((step) => pageText.includes(step.step))
            : isGoalScenario
              ? pageText.includes(GOAL_PROMPT) &&
                (pageText.includes("目标已绑定到本轮请求") ||
                  pageText.includes(GOAL_DONE_TEXT))
              : isWebToolsRenderingScenario
                ? summary.guiWebToolsRenderingCompleted?.hasPrompt === true &&
                  summary.guiWebToolsRenderingCompleted?.hasProcessTitle ===
                    true &&
                  summary.guiWebToolsRenderingCompleted?.expandedDetails
                    ?.hasSearchTitle === true &&
                  summary.guiWebToolsRenderingCompleted
                    ?.expandedDetails?.hasSearchSourceLabel === true &&
                  summary.guiWebToolsRenderingCompleted
                    ?.hasAssistantSummary === true
          : pageText.includes(NEWS_PROMPT) &&
            (pageText.includes("今日国际新闻简要整理") ||
              pageText.includes(ASSISTANT_DONE_TEXT)),
      noInvokeErrors: !errorRaw,
      noConsoleErrors: consoleErrors.length === 0,
    };
    const scenarioAssertions = isPlanScenario
      ? {
          planModeEnabledInGui:
            summary.planModeEnabled?.statusChipVisible === true,
          planPromptReachedBackend: planTurnStart?.inputText === PLAN_PROMPT,
          planCollaborationModeReachedBackend: collaborationMode === "plan",
          guiPlanRailVisible:
            summary.guiPlanCompleted?.hasPlanSection === true ||
            summary.guiPlanCompleted?.hasAllPlanSteps === true,
          guiPlanStepsVisible:
            summary.guiPlanCompleted?.hasAllPlanSteps === true,
          guiPlanDecisionDrawerVisible:
            summary.guiPlanCompleted?.planDecisionVisible === true &&
            summary.guiPlanCompleted?.planDecisionHasTitle === true &&
            summary.guiPlanCompleted?.planDecisionHasAcceptOption === true &&
            summary.guiPlanCompleted?.planDecisionHasAdjustInput === true,
          guiPlanDidNotAutoImplement: !planImplementationTurnStart,
          readModelPlanCompleted:
            summary.readModelPlanCompleted?.includesPrompt === true &&
            summary.readModelPlanCompleted?.includesProposedPlanBlock === true &&
            summary.readModelPlanCompleted?.includesPlanItem === true &&
            summary.readModelPlanCompleted?.includesAllPlanSteps === true &&
            summary.readModelPlanCompleted?.latestTurnCompleted === true,
          proposedPlanVisible:
            pageText.includes("计划") &&
            PLAN_STEPS.every((step) => pageText.includes(step.step)),
        }
      : isGoalScenario
        ? {
            goalModeEnabledInGui:
              summary.goalModeEnabled?.statusChipVisible === true &&
              summary.goalModeEnabled?.statusText?.includes("追求目标") === true,
            goalPromptReachedBackend: goalTurnStart?.inputText === GOAL_PROMPT,
            goalObjectiveTextReachedBackend: goalObjectiveText === GOAL_PROMPT,
            goalManagedObjectiveReachedBackend:
              goalHarness?.managed_objective?.objective_text === GOAL_PROMPT ||
              goalHarness?.managedObjective?.objectiveText === GOAL_PROMPT,
            guiGoalCompleted:
              summary.guiGoalCompleted?.hasPrompt === true &&
              (summary.guiGoalCompleted?.hasAssistantSummary === true ||
                summary.guiGoalCompleted?.hasDoneText === true) &&
              summary.guiGoalCompleted?.textareaVisible === true &&
              summary.guiGoalCompleted?.textareaDisabled === false &&
              summary.guiGoalCompleted?.stopButtonVisible === false,
            readModelGoalCompleted:
              summary.readModelGoalCompleted?.includesPrompt === true &&
              (summary.readModelGoalCompleted?.includesAssistantDone === true ||
                summary.readModelGoalCompleted?.includesAssistantSummary === true),
          }
      : isWebToolsRenderingScenario
        ? {
            webToolsRenderingPromptReachedBackend:
              webToolsRenderingTurnStart?.inputText ===
              WEB_TOOLS_RENDERING_PROMPT,
            guiWebToolsRenderingInputSubmitted:
              summary.webToolsRenderingInputSend?.afterFill
                ?.promptVisibleInTextarea === true &&
              summary.webToolsRenderingInputSend?.clicked?.clicked === true,
            guiWebSearchProcessDefaultCollapsed:
              summary.guiWebToolsRenderingCompleted
                ?.webProcessGroupExpanded === false,
            guiWebSearchProcessShowsSourcesAfterExpand:
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasSearchSourceSection === true &&
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasSearchTitle === true &&
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasSearchSourceLabel === true &&
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasFullSearchUrlVisible ===
                false,
            guiWebFetchProcessShowsReadPagesAfterExpand:
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasFetchPageSection ===
                true &&
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasFetchPageUrl === true,
            guiWebToolsTimelineOrderPreserved:
              summary.guiWebToolsRenderingCompleted?.expandedDetails
                ?.hasTimelineOrderPreserved === true,
            guiWebSearchNoiseHidden:
              summary.guiWebToolsRenderingCompleted?.searchNoiseVisible ===
              false,
            guiMarkdownRendered:
              summary.guiWebToolsRenderingCompleted?.rawMarkdownVisible ===
                false &&
              summary.guiWebToolsRenderingCompleted?.markdownHeadingVisible ===
                true &&
              summary.guiWebToolsRenderingCompleted?.markdownStrongVisible ===
                true &&
              summary.guiWebToolsRenderingCompleted?.markdownTableVisible ===
                true,
            guiWebSearchFinalTextInterleaved:
              summary.guiWebToolsRenderingCompleted
                ?.hasFinalTextAfterProcess === true,
            guiWebFetchTransportEnvelopeHidden:
              summary.guiWebToolsRenderingCompleted?.rawJsonEnvelopeVisible ===
                false &&
              summary.guiWebToolsRenderingCompleted?.hasFetchMarkdownHidden ===
                true,
            readModelWebToolsRenderingCompleted:
              summary.readModelWebToolsRenderingCompleted?.includesPrompt ===
                true &&
              (summary.readModelWebToolsRenderingCompleted
                ?.includesAssistantDone === true ||
                summary.readModelWebToolsRenderingCompleted
                  ?.includesAssistantSummary === true) &&
              summary.readModelWebToolsRenderingCompleted
                ?.includesWebSearchTool === true &&
              summary.readModelWebToolsRenderingCompleted
                ?.includesWebFetchTool === true,
        }
      : hasCancelPhase
        ? {
            usedCurrentTurnCancel: appServerRequestMethods.includes(
              APP_SERVER_METHOD_SESSION_TURN_CANCEL,
            ),
            externalFixtureCancelUsed: backendLedger.some(
              (entry) => entry.kind === "turnCancel",
            ),
            fixtureCancelReachedBackend:
              latestTurnCancel?.sessionId === SESSION_ID &&
              typeof latestTurnCancel?.turnId === "string" &&
              latestTurnCancel.turnId.trim().length > 0,
            guiStopClicked: summary.stopClick?.clicked?.clicked === true,
            readModelCanceled:
              summary.readModelCanceled?.includesPrompt === true &&
              summary.readModelCanceled?.includesCanceled === true,
            ...(isCancelThenContinueScenario
              ? {
                  continuePromptReachedBackend:
                    continueTurnStart?.inputText === CONTINUE_PROMPT,
                  guiContinueInputSubmitted:
                    summary.continueInputSend?.afterFill
                      ?.promptVisibleInTextarea === true &&
                    summary.continueInputSend?.clicked?.clicked === true,
                  guiContinueCompleted:
                    summary.guiContinueCompleted?.hasPrompt === true &&
                    (summary.guiContinueCompleted?.hasAssistantSummary ===
                      true ||
                      summary.guiContinueCompleted?.hasDoneText === true) &&
                    summary.guiContinueCompleted?.textareaVisible === true &&
                    summary.guiContinueCompleted?.textareaDisabled === false &&
                    summary.guiContinueCompleted?.stopButtonVisible === false,
                  readModelContinueCompleted:
                    summary.readModelContinueCompleted?.includesPrompt ===
                      true &&
                    (summary.readModelContinueCompleted
                      ?.includesAssistantDone === true ||
                      summary.readModelContinueCompleted
                        ?.includesAssistantSummary === true),
                  backendRecordedCancelThenContinue:
                    backendLedger.filter((entry) => entry.kind === "turnStart")
                      .length >= 2 &&
                    backendLedger.some((entry) => entry.kind === "turnCancel"),
                }
              : {}),
          }
        : {
          noEpochFallbackTitle:
            summary.guiCompleted?.hasEpochFallbackTitle === false,
          readModelCompleted:
            summary.readModelCompleted?.includesPrompt === true &&
            (summary.readModelCompleted?.includesAssistantDone === true ||
              summary.readModelCompleted?.includesAssistantSummary === true),
          eventReadProbeObserved:
            summary.eventReadProbe?.events?.hasTextDelta === true &&
            summary.eventReadProbe?.events?.hasToolStarted === true &&
            summary.eventReadProbe?.events?.hasToolResult === true &&
            summary.eventReadProbe?.events?.hasTerminal === true &&
            summary.eventReadProbe?.events?.eventTurnIds?.length === 1 &&
            summary.eventReadProbe?.events?.eventTurnIds?.[0] ===
              EVENT_READ_PROBE_TURN_ID,
          readModelEventReadAligned:
            summary.eventReadProbe?.readModel?.containsTurnId === true &&
            summary.eventReadProbe?.readModel?.containsReadText === true,
          readModelToolCallAligned:
            summary.eventReadProbe?.readModel?.containsToolCall === true &&
            summary.eventReadProbe?.readModel?.toolName ===
              EVENT_READ_PROBE_TOOL_NAME &&
            summary.eventReadProbe?.readModel?.toolStatus === "completed" &&
            summary.eventReadProbe?.readModel?.containsToolOutput === true &&
            summary.eventReadProbe?.readModel?.toolTurnId ===
              EVENT_READ_PROBE_TURN_ID,
        };
    const notApplicableAssertions = isCancelOnlyScenario
      ? [
          "noEpochFallbackTitle",
          "readModelCompleted",
          "eventReadProbeObserved",
          "readModelEventReadAligned",
          "readModelToolCallAligned",
          "continuePromptReachedBackend",
          "guiContinueInputSubmitted",
          "guiContinueCompleted",
          "readModelContinueCompleted",
          "backendRecordedCancelThenContinue",
          "planModeEnabledInGui",
          "planPromptReachedBackend",
          "planCollaborationModeReachedBackend",
          "guiPlanRailVisible",
          "guiPlanStepsVisible",
          "guiPlanDecisionDrawerVisible",
          "readModelPlanCompleted",
          "proposedPlanVisible",
          "goalModeEnabledInGui",
          "goalPromptReachedBackend",
          "goalObjectiveTextReachedBackend",
          "goalManagedObjectiveReachedBackend",
          "guiGoalCompleted",
          "readModelGoalCompleted",
          ...WEB_TOOLS_RENDERING_ASSERTION_KEYS,
        ]
      : isCancelThenContinueScenario
        ? [
            "noEpochFallbackTitle",
            "readModelCompleted",
            "eventReadProbeObserved",
            "readModelEventReadAligned",
            "readModelToolCallAligned",
            "planModeEnabledInGui",
            "planPromptReachedBackend",
            "planCollaborationModeReachedBackend",
            "guiPlanRailVisible",
            "guiPlanStepsVisible",
            "guiPlanDecisionDrawerVisible",
            "readModelPlanCompleted",
            "proposedPlanVisible",
            "goalModeEnabledInGui",
            "goalPromptReachedBackend",
            "goalObjectiveTextReachedBackend",
            "goalManagedObjectiveReachedBackend",
            "guiGoalCompleted",
            "readModelGoalCompleted",
            ...WEB_TOOLS_RENDERING_ASSERTION_KEYS,
          ]
        : isPlanScenario
          ? [
              "usedCurrentTurnCancel",
              "externalFixtureCancelUsed",
              "fixtureCancelReachedBackend",
              "guiStopClicked",
              "readModelCanceled",
              "continuePromptReachedBackend",
              "guiContinueInputSubmitted",
              "guiContinueCompleted",
              "readModelContinueCompleted",
              "backendRecordedCancelThenContinue",
              "noEpochFallbackTitle",
              "readModelCompleted",
              "eventReadProbeObserved",
              "readModelEventReadAligned",
              "readModelToolCallAligned",
              "goalModeEnabledInGui",
              "goalPromptReachedBackend",
              "goalObjectiveTextReachedBackend",
              "goalManagedObjectiveReachedBackend",
              "guiGoalCompleted",
              "readModelGoalCompleted",
              ...WEB_TOOLS_RENDERING_ASSERTION_KEYS,
            ]
          : isGoalScenario
            ? [
                "usedCurrentTurnCancel",
                "externalFixtureCancelUsed",
                "fixtureCancelReachedBackend",
                "guiStopClicked",
                "readModelCanceled",
                "continuePromptReachedBackend",
                "guiContinueInputSubmitted",
                "guiContinueCompleted",
                "readModelContinueCompleted",
                "backendRecordedCancelThenContinue",
                "noEpochFallbackTitle",
                "readModelCompleted",
                "eventReadProbeObserved",
                "readModelEventReadAligned",
                "readModelToolCallAligned",
                "planModeEnabledInGui",
                "planPromptReachedBackend",
                "planCollaborationModeReachedBackend",
                "guiPlanRailVisible",
                "guiPlanStepsVisible",
                "guiPlanDecisionDrawerVisible",
                "readModelPlanCompleted",
                "proposedPlanVisible",
                ...WEB_TOOLS_RENDERING_ASSERTION_KEYS,
              ]
            : isWebToolsRenderingScenario
              ? [
                  "usedCurrentTurnCancel",
                  "externalFixtureCancelUsed",
                  "fixtureCancelReachedBackend",
                  "guiStopClicked",
                  "readModelCanceled",
                  "continuePromptReachedBackend",
                  "guiContinueInputSubmitted",
                  "guiContinueCompleted",
                  "readModelContinueCompleted",
                  "backendRecordedCancelThenContinue",
                  "noEpochFallbackTitle",
                  "readModelCompleted",
                  "eventReadProbeObserved",
                  "readModelEventReadAligned",
                  "readModelToolCallAligned",
                  "planModeEnabledInGui",
                  "planPromptReachedBackend",
                  "planCollaborationModeReachedBackend",
                  "guiPlanRailVisible",
                  "guiPlanStepsVisible",
                  "guiPlanDecisionDrawerVisible",
                  "readModelPlanCompleted",
                  "proposedPlanVisible",
                  "goalModeEnabledInGui",
                  "goalPromptReachedBackend",
                  "goalObjectiveTextReachedBackend",
                  "goalManagedObjectiveReachedBackend",
                  "guiGoalCompleted",
                  "readModelGoalCompleted",
              ]
        : [
            "usedCurrentTurnCancel",
            "externalFixtureCancelUsed",
            "fixtureCancelReachedBackend",
            "guiStopClicked",
            "readModelCanceled",
            "continuePromptReachedBackend",
            "guiContinueInputSubmitted",
            "guiContinueCompleted",
            "readModelContinueCompleted",
            "backendRecordedCancelThenContinue",
            "planModeEnabledInGui",
            "planPromptReachedBackend",
            "planCollaborationModeReachedBackend",
            "guiPlanRailVisible",
            "guiPlanStepsVisible",
            "readModelPlanCompleted",
            "proposedPlanVisible",
            "goalModeEnabledInGui",
            "goalPromptReachedBackend",
            "goalObjectiveTextReachedBackend",
            "goalManagedObjectiveReachedBackend",
            "guiGoalCompleted",
            "readModelGoalCompleted",
            ...WEB_TOOLS_RENDERING_ASSERTION_KEYS,
          ];
    const assertions = {
      ...commonAssertions,
      ...scenarioAssertions,
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
    summary.commonAssertions = commonAssertions;
    summary.scenarioAssertions = scenarioAssertions;
    summary.notApplicableAssertions = notApplicableAssertions;
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
      cleanupTempRoot(runtimeEnv.tempRoot);
    }
  }
}

await run();
