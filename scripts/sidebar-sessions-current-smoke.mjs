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
  workspaceId: "workspace-1",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "sidebar-sessions-current",
  ),
  prefix: "sidebar-sessions-current",
  headless: true,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = ["agentSession/list"];
const LEGACY_SESSION_COMMANDS = ["agent_runtime_list_sessions"];
const LAST_PROJECT_ID_KEY = "agent_last_project_id";
const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "lime.app-sidebar.collapsed";

function printHelp() {
  console.log(`
Sidebar Sessions Current Smoke

用途:
  通过真实侧栏最近对话 / 归档 UI 和 DevBridge /invoke 网络请求，验证会话列表读取走
  App Server JSON-RPC current 主链，而不是 legacy session 命令或 mock。

用法:
  node scripts/sidebar-sessions-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --workspace-id <id>    写入 localStorage 的只读工作区 ID，默认 workspace-1
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/sidebar-sessions-current
  --prefix <name>        证据文件前缀，默认 sidebar-sessions-current
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
    if (arg === "--workspace-id" && argv[index + 1]) {
      options.workspaceId = String(argv[index + 1]).trim();
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
  if (!options.appUrl) {
    throw new Error("--app-url 不能为空");
  }
  if (!options.healthUrl) {
    throw new Error("--health-url 不能为空");
  }
  if (!options.invokeUrl) {
    throw new Error("--invoke-url 不能为空");
  }
  if (!options.workspaceId) {
    throw new Error("--workspace-id 不能为空");
  }
  if (!options.evidenceDir) {
    throw new Error("--evidence-dir 不能为空");
  }
  if (!options.prefix) {
    throw new Error("--prefix 不能为空");
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
  console.log(`[smoke:sidebar-sessions-current] stage=${stage}`);
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
        `[smoke:sidebar-sessions-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
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
    `[smoke:sidebar-sessions-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
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

function summarizeInvokeEntries(entries) {
  const appServerRequests = entries.flatMap((entry) => entry.appServerRequests);
  const appServerMethodsSeen = Array.from(
    new Set(appServerRequests.map((request) => request.method)),
  ).sort();
  const agentSessionListRequests = appServerRequests.filter(
    (request) => request.method === "agentSession/list",
  );
  const legacySessionCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_SESSION_COMMANDS.includes(entry.cmd)
            ? entry.cmd
            : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const appServerHandleJsonLinesSeen = entries.some(
    (entry) => entry.cmd === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  );
  const archivedOnlySeen = agentSessionListRequests.some(
    (request) => request.params?.archivedOnly === true,
  );

  return {
    appServerHandleJsonLinesSeen,
    appServerMethodsSeen,
    legacySessionCommandsSeen,
    agentSessionListRequestCount: agentSessionListRequests.length,
    agentSessionListRequests,
    archivedOnlySeen,
    missingRequiredAppServerMethods: REQUIRED_APP_SERVER_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
  };
}

async function waitForInvokeEvidence(entries, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(30_000, options.timeoutMs)) {
    const observed = summarizeInvokeEntries(entries);
    if (
      observed.appServerHandleJsonLinesSeen &&
      observed.missingRequiredAppServerMethods.length === 0 &&
      observed.agentSessionListRequestCount >= 2 &&
      observed.archivedOnlySeen &&
      observed.legacySessionCommandsSeen.length === 0
    ) {
      return observed;
    }
    await sleep(250);
  }
  return summarizeInvokeEntries(entries);
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

async function primeSidebarStorage(page, options) {
  await page.goto(options.appUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.evaluate(
    ({ collapsedKey, lastProjectKey, workspaceId }) => {
      localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      localStorage.setItem(collapsedKey, "false");
    },
    {
      collapsedKey: APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      lastProjectKey: LAST_PROJECT_ID_KEY,
      workspaceId: options.workspaceId,
    },
  );
}

async function openSidebarSessions(page, options) {
  await primeSidebarStorage(page, options);
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="app-sidebar-conversation-shelf"]', {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector(
    '[data-testid="app-sidebar-recent-conversations"]',
    {
      timeout: options.timeoutMs,
    },
  );
  await page.waitForFunction(
    () => {
      const recent = document.querySelector(
        '[data-testid="app-sidebar-recent-conversations"]',
      );
      const text = recent?.textContent ?? "";
      return !/正在加载对话|Loading/i.test(text);
    },
    { timeout: Math.min(30_000, options.timeoutMs) },
  );

  const expanded = await page.evaluate(() => {
    const shelf = document.querySelector(
      '[data-testid="app-sidebar-conversation-shelf"]',
    );
    const target = shelf?.querySelector('button[aria-expanded="false"]');
    if (!(target instanceof HTMLButtonElement)) {
      return false;
    }
    target.click();
    return true;
  });
  assert(expanded, "未找到归档会话折叠按钮");

  await page.waitForSelector(
    '[data-testid="app-sidebar-archived-conversations"]',
    {
      timeout: options.timeoutMs,
    },
  );
  await page.waitForFunction(
    () => {
      const archived = document.querySelector(
        '[data-testid="app-sidebar-archived-conversations"]',
      );
      const text = archived?.textContent ?? "";
      return !/正在加载归档|Loading/i.test(text);
    },
    { timeout: Math.min(30_000, options.timeoutMs) },
  );
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const networkPath = path.join(
    options.evidenceDir,
    `${options.prefix}-network-invoke.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );

  let browser = null;
  let tmpProfileDir = null;
  const consoleErrors = [];
  const failedRequests = [];
  const invokeEntries = [];
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl,
    healthUrl: options.healthUrl,
    invokeUrl: options.invokeUrl,
    workspaceId: options.workspaceId,
    health: null,
    conversationShelfMounted: false,
    recentConversationsMounted: false,
    archivedConversationsMounted: false,
    recentConversationsSettled: false,
    archivedConversationsSettled: false,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    legacySessionCommandsSeen: [],
    agentSessionListRequestCount: 0,
    agentSessionListRequests: [],
    archivedOnlySeen: false,
    missingRequiredAppServerMethods: [...REQUIRED_APP_SERVER_METHODS],
    consoleErrors: [],
    failedRequests: [],
    screenshot: null,
    network: networkPath,
    summary: summaryPath,
  };

  try {
    logStage("wait-health");
    summary.health = await waitForHealth(options);

    logStage("launch-browser");
    tmpProfileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sidebar-sessions-current-"),
    );
    browser = await chromium.launchPersistentContext(tmpProfileDir, {
      headless: options.headless,
      viewport: { width: 1440, height: 1000 },
      executablePath: resolveLocalChromeExecutablePath(),
    });
    const page = await browser.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeText(message.text()));
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: sanitizeText(request.url()),
        method: request.method(),
        failure: sanitizeText(request.failure()?.errorText || "unknown"),
      });
    });
    page.on("response", async (response) => {
      try {
        const request = response.request();
        if (
          request.method() !== "POST" ||
          !requestMatchesInvoke(request.url(), options.invokeUrl)
        ) {
          return;
        }
        const requestPayload = parseJson(request.postData() || "");
        const responsePayload = parseJson(await response.text());
        invokeEntries.push(
          collectInvokeEntry(requestPayload, responsePayload, request.url()),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("No resource with given identifier found")) {
          return;
        }
        console.warn(
          "[smoke:sidebar-sessions-current] 解析 invoke 网络证据失败:",
          message,
        );
      }
    });

    logStage("open-sidebar-sessions");
    await openSidebarSessions(page, options);

    summary.conversationShelfMounted =
      (await page
        .locator('[data-testid="app-sidebar-conversation-shelf"]')
        .count()) > 0;
    summary.recentConversationsMounted =
      (await page
        .locator('[data-testid="app-sidebar-recent-conversations"]')
        .count()) > 0;
    summary.archivedConversationsMounted =
      (await page
        .locator('[data-testid="app-sidebar-archived-conversations"]')
        .count()) > 0;
    summary.recentConversationsSettled = await page
      .locator('[data-testid="app-sidebar-recent-conversations"]')
      .evaluate(
        (node) => !/正在加载对话|Loading/i.test(node.textContent ?? ""),
      );
    summary.archivedConversationsSettled = await page
      .locator('[data-testid="app-sidebar-archived-conversations"]')
      .evaluate(
        (node) => !/正在加载归档|Loading/i.test(node.textContent ?? ""),
      );

    const observed = await waitForInvokeEvidence(invokeEntries, options);
    Object.assign(summary, observed);
    summary.consoleErrors = consoleErrors;
    summary.failedRequests = failedRequests.slice(0, 20);
    summary.screenshot = screenshotPath;

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });

    assert(summary.conversationShelfMounted, "侧栏会话 Shelf 未挂载");
    assert(summary.recentConversationsMounted, "最近对话列表未挂载");
    assert(summary.archivedConversationsMounted, "归档对话列表未挂载");
    assert(summary.recentConversationsSettled, "最近对话列表仍处于 loading");
    assert(summary.archivedConversationsSettled, "归档对话列表仍处于 loading");
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingRequiredAppServerMethods.length === 0,
      `缺少 App Server JSON-RPC 方法: ${summary.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      summary.agentSessionListRequestCount >= 2,
      `agentSession/list 请求不足，期望最近和归档至少各一次，实际 ${summary.agentSessionListRequestCount}`,
    );
    assert(summary.archivedOnlySeen, "未观察到归档列表 archivedOnly=true 请求");
    assert(
      summary.legacySessionCommandsSeen.length === 0,
      `观察到 legacy session 命令: ${summary.legacySessionCommandsSeen.join(", ")}`,
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:sidebar-sessions-current] summary=${summaryPath}`);
    console.log(
      `[smoke:sidebar-sessions-current] screenshot=${screenshotPath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.failedRequests = failedRequests.slice(0, 20);
    const observed = summarizeInvokeEntries(invokeEntries);
    Object.assign(summary, observed);
    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });
    writeJsonFile(summaryPath, summary);

    try {
      const pages = browser?.pages?.() ?? [];
      const page = pages.at(-1);
      if (page) {
        await page.screenshot({
          path: failureScreenshotPath,
          fullPage: true,
        });
        summary.screenshot = failureScreenshotPath;
        writeJsonFile(summaryPath, summary);
      }
    } catch {
      // 失败截图只是诊断证据，不能阻断错误上抛。
    }

    console.error(`[smoke:sidebar-sessions-current] summary=${summaryPath}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (tmpProfileDir) {
      fs.rmSync(tmpProfileDir, { recursive: true, force: true });
    }
  }
}

await run();
