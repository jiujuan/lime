#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-app-ui-runtime-current",
  ),
  prefix: "agent-app-ui-runtime-current",
  headless: true,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = [
  "agentAppUiRuntime/status",
  "agentAppUiRuntime/stop",
  "agentAppUiRuntime/start",
];
const LEGACY_AGENT_APP_UI_RUNTIME_COMMANDS = [
  "agent_app_get_ui_runtime_status",
  "agent_app_stop_ui_runtime",
  "agent_app_start_ui_runtime",
];

function printHelp() {
  console.log(`
Agent App UI Runtime Current Smoke

用途:
  在真实前端页面里调用 src/lib/api/agentApps.ts 的 current gateway，
  验证 Agent App UI runtime status / stop / start 请求经
  app_server_handle_json_lines 进入 App Server JSON-RPC，而不是旧 agent_app_* 命令。

说明:
  本脚本使用一次性不存在的 appId，因此 start 预期由 App Server fail closed；
  它不会写 installed state，也不会启动真实 UI runtime 子进程。

用法:
  node scripts/agent-app/ui-runtime-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/agent-app-ui-runtime-current
  --prefix <name>        证据文件前缀，默认 agent-app-ui-runtime-current
  --headed               使用有界面 Chrome
  -h, --help             显示帮助
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
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
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
    if (arg === "--headed") {
      options.headless = false;
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
  if (!options.appUrl || !options.healthUrl || !options.invokeUrl) {
    throw new Error("--app-url / --health-url / --invoke-url 均不能为空");
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
  console.log(`[smoke:agent-app-ui-runtime-current] stage=${stage}`);
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, {
        signal: AbortSignal.timeout(Math.min(5_000, options.timeoutMs)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:agent-app-ui-runtime-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown error");
  throw new Error(
    `[smoke:agent-app-ui-runtime-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function requestMatchesInvoke(url, invokeUrl) {
  const requestUrl = normalizeUrl(url);
  const expectedUrl = normalizeUrl(invokeUrl);
  return requestUrl === expectedUrl || requestUrl.endsWith("/invoke");
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

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 1_200
    ? `${sanitized.slice(0, 1_200)}... [truncated ${sanitized.length - 1_200} chars]`
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
    return value.slice(0, 40).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function collectInvokeEntry(requestPayload, responsePayload, requestUrl) {
  const requestMessages = decodeJsonRpcLines(
    requestPayload?.args?.request?.lines,
  );
  const responseMessages = decodeJsonRpcLines(responsePayload?.result?.lines);
  return {
    url: requestUrl,
    cmd: requestPayload?.cmd ?? null,
    appServerRequests: requestMessages
      .filter((message) => typeof message?.method === "string")
      .map((message) => ({
        id: message.id ?? null,
        method: message.method,
        params: sanitizeJson(message.params ?? {}),
      })),
    responseMessageCount: responseMessages.length,
    responseMessages: responseMessages.map(sanitizeJson),
  };
}

function summarizeInvokeEntries(entries, appId) {
  const appServerRequests = entries.flatMap((entry) => entry.appServerRequests);
  const appServerMethodsSeen = Array.from(
    new Set(appServerRequests.map((request) => request.method)),
  ).sort();
  const startRequests = appServerRequests.filter(
    (request) => request.method === "agentAppUiRuntime/start",
  );
  const methodResponses = entries.flatMap((entry) => {
    const responseMap = new Map();
    for (const message of entry.responseMessages ?? []) {
      if (message && message.id !== undefined && message.id !== null) {
        responseMap.set(String(message.id), message);
      }
    }
    return (entry.appServerRequests ?? []).map((request) => ({
      method: request.method,
      response: responseMap.get(String(request.id)) ?? null,
    }));
  });
  const responseFor = (method) =>
    methodResponses.find((item) => item.method === method)?.response ?? null;
  const statusResponse = responseFor("agentAppUiRuntime/status");
  const stopResponse = responseFor("agentAppUiRuntime/stop");
  const startResponse = responseFor("agentAppUiRuntime/start");
  const statusResult = statusResponse?.result;
  const stopResult = stopResponse?.result;
  const legacyAgentAppUiRuntimeCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_AGENT_APP_UI_RUNTIME_COMMANDS.includes(entry.cmd)
            ? entry.cmd
            : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const appServerHandleJsonLinesSeen = entries.some(
    (entry) => entry.cmd === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );

  return {
    appServerHandleJsonLinesSeen,
    appServerMethodsSeen,
    legacyAgentAppUiRuntimeCommandsSeen,
    missingRequiredAppServerMethods: REQUIRED_APP_SERVER_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
    statusResponseValid:
      statusResult?.appId === appId && typeof statusResult.status === "string",
    stopResponseValid:
      stopResult?.appId === appId && typeof stopResult.status === "string",
    startRequestSeen: startRequests.length > 0,
    startRequestCount: startRequests.length,
    startRejectedByAppServer: Boolean(startResponse?.error),
    startUnexpectedSuccess: Boolean(startResponse?.result),
    statusResponse: sanitizeJson(statusResponse),
    stopResponse: sanitizeJson(stopResponse),
    startResponse: sanitizeJson(startResponse),
  };
}

async function waitForInvokeEvidence(entries, appId, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(30_000, options.timeoutMs)) {
    const observed = summarizeInvokeEntries(entries, appId);
    if (
      observed.appServerHandleJsonLinesSeen &&
      observed.missingRequiredAppServerMethods.length === 0 &&
      observed.legacyAgentAppUiRuntimeCommandsSeen.length === 0 &&
      observed.statusResponseValid &&
      observed.stopResponseValid &&
      observed.startRequestSeen &&
      !observed.startUnexpectedSuccess
    ) {
      return observed;
    }
    await sleep(250);
  }
  return summarizeInvokeEntries(entries, appId);
}

function resolveLocalChromeExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? undefined;
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function waitForAppShellReady(page, timeoutMs) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: timeoutMs })
    .catch(() => {});
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[data-testid="app-sidebar"]') ||
        document.querySelector('[data-testid="app-sidebar-main-nav"]') ||
        document.querySelector('[data-testid="home-start-surface"]') ||
        document.querySelector('[data-testid="chat-navbar"]') ||
        document.querySelector('[data-testid="empty-state"]'),
      ),
    undefined,
    { timeout: Math.min(timeoutMs, 60_000) },
  );
}

async function invokeAgentAppUiRuntimeGateway(page, appId) {
  return await page.evaluate(async (smokeAppId) => {
    const api = await import("/src/lib/api/agentApps.ts");
    const status = await api.getAgentAppUiRuntimeStatus({
      appId: smokeAppId,
    });
    const stopped = await api.stopAgentAppUiRuntime({
      appId: smokeAppId,
    });
    let start = null;
    let startError = null;
    try {
      start = await api.startAgentAppUiRuntime({
        appId: smokeAppId,
        entryKey: "dashboard",
      });
    } catch (error) {
      startError = error instanceof Error ? error.message : String(error);
    }
    return {
      appId: smokeAppId,
      status,
      stopped,
      start,
      startError,
      startRejected: Boolean(startError),
    };
  }, appId);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const health = await waitForHealth(options);
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-app-ui-runtime-current-"),
  );
  const appId = `agent-app-ui-runtime-current-${Date.now()}`;
  const invokeEntries = [];
  const consoleErrors = [];
  const failedRequests = [];
  const executablePath = resolveLocalChromeExecutablePath();
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: executablePath ? undefined : "chromium",
    executablePath,
    headless: options.headless,
    viewport: { width: 1440, height: 960 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(sanitizeText(message.text()));
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: sanitizeText(request.url()),
      method: request.method(),
      failure: sanitizeText(request.failure()?.errorText ?? "unknown"),
    });
  });
  page.on("requestfinished", async (request) => {
    if (!requestMatchesInvoke(request.url(), options.invokeUrl)) {
      return;
    }
    const requestPayload = parseJson(request.postData());
    const response = await request.response().catch(() => null);
    const responsePayload = response
      ? await response.json().catch(() => null)
      : null;
    invokeEntries.push(
      collectInvokeEntry(requestPayload, responsePayload, request.url()),
    );
  });

  try {
    logStage("open-app");
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await waitForAppShellReady(page, options.timeoutMs);

    logStage("invoke-current-gateway");
    const frontendGatewayResult = await invokeAgentAppUiRuntimeGateway(
      page,
      appId,
    );
    const invokeEvidence = await waitForInvokeEvidence(
      invokeEntries,
      appId,
      options,
    );

    assert(
      invokeEvidence.appServerHandleJsonLinesSeen,
      "app_server_handle_json_lines should be observed",
    );
    assert(
      invokeEvidence.missingRequiredAppServerMethods.length === 0,
      `missing App Server methods: ${invokeEvidence.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      invokeEvidence.legacyAgentAppUiRuntimeCommandsSeen.length === 0,
      `legacy Agent App UI runtime commands should not be observed: ${invokeEvidence.legacyAgentAppUiRuntimeCommandsSeen.join(", ")}`,
    );
    assert(
      invokeEvidence.statusResponseValid,
      "agentAppUiRuntime/status should return a valid status response",
    );
    assert(
      invokeEvidence.stopResponseValid,
      "agentAppUiRuntime/stop should return a valid status response",
    );
    assert(
      invokeEvidence.startRequestSeen && !invokeEvidence.startUnexpectedSuccess,
      "agentAppUiRuntime/start should reach App Server and not return a successful runtime for missing installed state",
    );
    assert(
      frontendGatewayResult.startRejected,
      "frontend gateway should fail closed after App Server rejects the missing installed state",
    );

    const screenshotPath = path.join(
      options.evidenceDir,
      `${options.prefix}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const networkPath = path.join(
      options.evidenceDir,
      `${options.prefix}-network-invoke.json`,
    );
    writeJsonFile(networkPath, sanitizeJson(invokeEntries));
    const summary = {
      ok: true,
      transport: health?.transport ?? health?.mode ?? "unknown",
      appId,
      appUrl: options.appUrl,
      generatedAt: new Date().toISOString(),
      frontendGatewayResult: sanitizeJson(frontendGatewayResult),
      ...invokeEvidence,
      consoleErrors,
      failedRequests: sanitizeJson(failedRequests),
      screenshot: screenshotPath,
      network: networkPath,
    };
    const summaryPath = path.join(
      options.evidenceDir,
      `${options.prefix}-summary.json`,
    );
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:agent-app-ui-runtime-current] summary=${summaryPath}`);
    console.log(
      `[smoke:agent-app-ui-runtime-current] appServerMethodsSeen=${summary.appServerMethodsSeen.join(",")}`,
    );
    await context.close();
  } catch (error) {
    const failurePath = path.join(
      options.evidenceDir,
      `${options.prefix}-failure-summary.json`,
    );
    let screenshot = null;
    try {
      screenshot = path.join(
        options.evidenceDir,
        `${options.prefix}-failure.png`,
      );
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch (screenshotError) {
      screenshot =
        screenshotError instanceof Error
          ? screenshotError.message
          : String(screenshotError);
    }
    writeJsonFile(failurePath, {
      ok: false,
      appId,
      appUrl: options.appUrl,
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      invokeEvidence: summarizeInvokeEntries(invokeEntries, appId),
      invokeEntries: sanitizeJson(invokeEntries),
      consoleErrors,
      failedRequests: sanitizeJson(failedRequests),
      screenshot,
    });
    console.error(
      `[smoke:agent-app-ui-runtime-current] failureSummary=${failurePath}`,
    );
    await context.close().catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(
    `[smoke:agent-app-ui-runtime-current] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
