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
  workingDir: process.cwd(),
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "knowledge-current",
  ),
  prefix: "knowledge-current",
  headless: true,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = ["knowledgePack/list"];
const LEGACY_KNOWLEDGE_LIST_COMMANDS = ["knowledge_list_packs"];
const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "lime.app-sidebar.collapsed";
const KNOWLEDGE_WORKING_DIR_STORAGE_KEY = "lime.knowledge.working-dir";

function printHelp() {
  console.log(`
Knowledge Current Smoke

用途:
  通过真实项目资料页面和 DevBridge /invoke 网络请求，验证知识包列表读取走
  App Server JSON-RPC current 主链，而不是 legacy knowledge_list_packs 或 mock。

用法:
  node scripts/knowledge-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --working-dir <path>   项目资料工作目录，默认当前仓库根
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/knowledge-current
  --prefix <name>        证据文件前缀，默认 knowledge-current
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
    if (arg === "--working-dir" && argv[index + 1]) {
      options.workingDir = path.resolve(String(argv[index + 1]).trim());
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
  if (!options.workingDir) {
    throw new Error("--working-dir 不能为空");
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
  console.log(`[smoke:knowledge-current] stage=${stage}`);
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
        `[smoke:knowledge-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
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
    `[smoke:knowledge-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
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
  const knowledgePackListRequests = appServerRequests.filter(
    (request) => request.method === "knowledgePack/list",
  );
  const legacyKnowledgeListCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_KNOWLEDGE_LIST_COMMANDS.includes(entry.cmd)
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
    legacyKnowledgeListCommandsSeen,
    knowledgePackListRequestCount: knowledgePackListRequests.length,
    knowledgePackListRequests,
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
      observed.knowledgePackListRequestCount >= 1 &&
      observed.legacyKnowledgeListCommandsSeen.length === 0
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

async function primeKnowledgeStorage(page, options) {
  await page.goto(options.appUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.evaluate(
    ({ collapsedKey, workingDirKey, workingDir }) => {
      localStorage.setItem(collapsedKey, "false");
      localStorage.setItem(workingDirKey, workingDir);
    },
    {
      collapsedKey: APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      workingDirKey: KNOWLEDGE_WORKING_DIR_STORAGE_KEY,
      workingDir: options.workingDir,
    },
  );
}

async function clickKnowledgeNav(page, options) {
  await primeKnowledgeStorage(page, options);
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="app-sidebar"]', {
    timeout: options.timeoutMs,
  });

  const clicked = await page.evaluate(() => {
    const scope =
      document.querySelector('[data-testid="app-sidebar-main-nav"]') ??
      document.querySelector('[data-testid="app-sidebar"]') ??
      document;
    const buttons = Array.from(scope.querySelectorAll("button"));
    const target = buttons.find((button) => {
      const text = button.textContent || "";
      const aria = button.getAttribute("aria-label") || "";
      const title = button.getAttribute("title") || "";
      return /项目资料|Knowledge|Project Knowledge|Project Materials/i.test(
        `${text}\n${aria}\n${title}`,
      );
    });
    if (!target) {
      return false;
    }
    target.click();
    return true;
  });

  assert(clicked, "未找到侧栏项目资料入口");
}

async function openKnowledgePage(page, options) {
  await clickKnowledgeNav(page, options);
  await page.waitForFunction(
    () =>
      /让 Lime 记住这个项目|Project Knowledge|Project Materials/i.test(
        document.body.textContent ?? "",
      ),
    { timeout: options.timeoutMs },
  );
  await page.waitForFunction(
    () => {
      const text = document.body.textContent ?? "";
      const title = /项目资料清单|Project Knowledge|Project Materials/i.test(
        text,
      );
      const row = Array.from(document.querySelectorAll("article")).some(
        (item) => /打开|用于创作|去确认/i.test(item.textContent ?? ""),
      );
      const emptyState =
        /这个项目还没有资料|No knowledge|No project materials/i.test(text);
      const loading = document.querySelector("svg.animate-spin");
      return (
        title &&
        !loading &&
        (row || emptyState || /资料名称|状态|操作/i.test(text))
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
    workingDir: options.workingDir,
    health: null,
    knowledgePageMounted: false,
    knowledgeCatalogMounted: false,
    knowledgeRowsMounted: false,
    knowledgeEmptyStateMounted: false,
    knowledgeCatalogSettled: false,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    legacyKnowledgeListCommandsSeen: [],
    knowledgePackListRequestCount: 0,
    knowledgePackListRequests: [],
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
      path.join(os.tmpdir(), "knowledge-current-"),
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
          "[smoke:knowledge-current] 解析 invoke 网络证据失败:",
          message,
        );
      }
    });

    logStage("open-knowledge-page");
    await openKnowledgePage(page, options);

    const observed = await waitForInvokeEvidence(invokeEntries, options);
    Object.assign(summary, observed);

    const bodyText = await page.locator("body").innerText();
    summary.knowledgePageMounted =
      /让 Lime 记住这个项目|Project Knowledge|Project Materials/i.test(
        bodyText,
      );
    summary.knowledgeCatalogMounted =
      /项目资料清单|资料名称|Project Knowledge|Project Materials/i.test(
        bodyText,
      );
    summary.knowledgeRowsMounted =
      (await page
        .locator("article")
        .filter({ hasText: /打开|用于创作|去确认/i })
        .count()) > 0;
    summary.knowledgeEmptyStateMounted =
      /这个项目还没有资料|No knowledge|No project materials/i.test(bodyText);
    summary.knowledgeCatalogSettled =
      summary.knowledgeRowsMounted ||
      summary.knowledgeEmptyStateMounted ||
      /资料名称|状态|操作/i.test(bodyText);

    summary.consoleErrors = consoleErrors;
    summary.failedRequests = failedRequests.slice(0, 20);
    summary.screenshot = screenshotPath;

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });

    assert(summary.knowledgePageMounted, "项目资料页面未挂载");
    assert(summary.knowledgeCatalogMounted, "项目资料清单未挂载");
    assert(summary.knowledgeCatalogSettled, "项目资料列表或空态未稳定挂载");
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingRequiredAppServerMethods.length === 0,
      `缺少 App Server JSON-RPC 方法: ${summary.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      summary.knowledgePackListRequestCount >= 1,
      `knowledgePack/list 请求不足，实际 ${summary.knowledgePackListRequestCount}`,
    );
    assert(
      summary.legacyKnowledgeListCommandsSeen.length === 0,
      `观察到 legacy knowledge list 命令: ${summary.legacyKnowledgeListCommandsSeen.join(", ")}`,
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:knowledge-current] summary=${summaryPath}`);
    console.log(`[smoke:knowledge-current] screenshot=${screenshotPath}`);
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

    console.error(`[smoke:knowledge-current] summary=${summaryPath}`);
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

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
