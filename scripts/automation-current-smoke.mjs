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
    "automation-current",
  ),
  prefix: "automation-current",
  headless: true,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = ["automationJob/list"];
const LEGACY_AUTOMATION_COMMANDS = ["get_automation_jobs"];
const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "lime.app-sidebar.collapsed";

function printHelp() {
  console.log(`
Automation Current Smoke

用途:
  通过真实持续流程页面和 DevBridge /invoke 网络请求，验证自动化任务列表读取走
  App Server JSON-RPC current 主链，而不是 legacy automation 命令或 mock。

用法:
  node scripts/automation-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/automation-current
  --prefix <name>        证据文件前缀，默认 automation-current
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
  if (!options.appUrl) {
    throw new Error("--app-url 不能为空");
  }
  if (!options.healthUrl) {
    throw new Error("--health-url 不能为空");
  }
  if (!options.invokeUrl) {
    throw new Error("--invoke-url 不能为空");
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
  console.log(`[smoke:automation-current] stage=${stage}`);
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
        `[smoke:automation-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
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
    `[smoke:automation-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
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
  const automationJobListRequests = appServerRequests.filter(
    (request) => request.method === "automationJob/list",
  );
  const legacyAutomationCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_AUTOMATION_COMMANDS.includes(entry.cmd)
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
    legacyAutomationCommandsSeen,
    automationJobListRequestCount: automationJobListRequests.length,
    automationJobListRequests,
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
      observed.automationJobListRequestCount >= 1 &&
      observed.legacyAutomationCommandsSeen.length === 0
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
  await page.evaluate((collapsedKey) => {
    localStorage.setItem(collapsedKey, "false");
  }, APP_SIDEBAR_COLLAPSED_STORAGE_KEY);
}

async function openAutomationPage(page, options) {
  await primeSidebarStorage(page, options);
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page
    .waitForSelector('[data-testid="app-sidebar"]', {
      timeout: Math.min(15_000, options.timeoutMs),
    })
    .catch(() => null);

  const clickButtonByPattern = (scopeSelector, patternSource) =>
    page.evaluate(({ selector, pattern }) => {
      const scope = selector ? document.querySelector(selector) : document;
      if (!scope) {
        return false;
      }
      const matcher = new RegExp(pattern, "i");
      const buttons = Array.from(scope.querySelectorAll("button"));
      const target = buttons.find((button) => {
        const text = button.textContent || "";
        const aria = button.getAttribute("aria-label") || "";
        const title = button.getAttribute("title") || "";
        return matcher.test(`${text}\n${aria}\n${title}`);
      });
      if (!target) {
        return false;
      }
      target.click();
      return true;
    }, { selector: scopeSelector, pattern: patternSource });

  let clicked = await clickButtonByPattern(
    '[data-testid="app-sidebar"]',
    "持续流程|Automation|Automations|Workflow",
  );

  if (!clicked) {
    const accountButton = page.getByTestId("app-sidebar-account-button");
    if ((await accountButton.count()) > 0) {
      await accountButton.click();
      await page.waitForSelector('[data-testid="app-sidebar-account-menu"]', {
        timeout: Math.min(15_000, options.timeoutMs),
      });
      clicked = await clickButtonByPattern(
        '[data-testid="app-sidebar-account-menu"]',
        "持续流程|Automation|Automations|Workflow",
      );
    }
  }

  if (!clicked) {
    const settingsOpened = await clickButtonByPattern(
      '[data-testid="app-sidebar"]',
      "设置|Settings",
    );
    assert(settingsOpened, "未找到设置入口，无法打开持续流程页面");
    await page.waitForFunction(
      () => /打开持续流程|Open Automation/i.test(document.body.textContent || ""),
      { timeout: Math.min(30_000, options.timeoutMs) },
    );
    clicked = await clickButtonByPattern(
      null,
      "打开持续流程|Open Automation",
    );
  }

  assert(clicked, "未找到持续流程入口");
  await page.waitForSelector('[data-testid="automation-tab-tasks"]', {
    timeout: options.timeoutMs,
  });
  await page.waitForFunction(
    () => {
      const tasksTab = document.querySelector(
        '[data-testid="automation-tab-tasks"]',
      );
      const bodyText = document.body.textContent ?? "";
      const hasRows = document.querySelector(
        '[data-testid^="automation-job-row-"]',
      );
      const hasEmptyAction = /从空白流程开始|Blank|Start/i.test(bodyText);
      const hasTaskListTitle = /任务列表|Task list|Flows/i.test(bodyText);
      return (
        Boolean(tasksTab) &&
        (Boolean(hasRows) || hasEmptyAction || hasTaskListTitle)
      );
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
    health: null,
    automationPageMounted: false,
    tasksTabMounted: false,
    taskRowsMounted: false,
    taskEmptyStateMounted: false,
    taskListSettled: false,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    legacyAutomationCommandsSeen: [],
    automationJobListRequestCount: 0,
    automationJobListRequests: [],
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
      path.join(os.tmpdir(), "automation-current-"),
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
          "[smoke:automation-current] 解析 invoke 网络证据失败:",
          message,
        );
      }
    });

    logStage("open-automation-page");
    await openAutomationPage(page, options);

    summary.automationPageMounted =
      (await page.locator('[data-testid="automation-tab-tasks"]').count()) > 0;
    summary.tasksTabMounted =
      (await page.locator('[data-testid="automation-tab-tasks"]').count()) > 0;
    summary.taskRowsMounted =
      (await page.locator('[data-testid^="automation-job-row-"]').count()) > 0;
    const bodyText = await page.locator("body").innerText();
    summary.taskEmptyStateMounted =
      /从空白流程开始|Blank|Start/i.test(bodyText) && !summary.taskRowsMounted;
    summary.taskListSettled =
      summary.taskRowsMounted ||
      summary.taskEmptyStateMounted ||
      /任务列表|Task list|Flows/i.test(bodyText);

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

    assert(summary.automationPageMounted, "持续流程页面未挂载");
    assert(summary.tasksTabMounted, "持续流程任务 tab 未挂载");
    assert(summary.taskListSettled, "持续流程任务列表或空态未稳定挂载");
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingRequiredAppServerMethods.length === 0,
      `缺少 App Server JSON-RPC 方法: ${summary.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      summary.automationJobListRequestCount >= 1,
      `automationJob/list 请求不足，实际 ${summary.automationJobListRequestCount}`,
    );
    assert(
      summary.legacyAutomationCommandsSeen.length === 0,
      `观察到 legacy automation 命令: ${summary.legacyAutomationCommandsSeen.join(", ")}`,
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:automation-current] summary=${summaryPath}`);
    console.log(`[smoke:automation-current] screenshot=${screenshotPath}`);
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

    console.error(`[smoke:automation-current] summary=${summaryPath}`);
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
