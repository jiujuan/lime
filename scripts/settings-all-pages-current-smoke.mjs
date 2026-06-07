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
    "settings-current",
  ),
  prefix: "settings-current",
  headless: true,
};

const SETTINGS_TABS = [
  "设置首页",
  "个人资料",
  "数据统计",
  "外观",
  "快捷键",
  "记忆",
  "AI 服务商",
  "服务模型",
  "MCP 服务器",
  "网络搜索",
  "环境变量",
  "连接器",
  "自动化设置",
  "开发者与实验功能",
  "关于",
];

const PROBLEM_PATTERNS = [
  /无法连接后端桥接/,
  /Desktop Host 尚未支持命令/,
  /Electron host command is not supported/,
  /Electron host command is not implemented/,
  /Unsupported command/,
  /未知命令/,
  /bridge cooldown active/,
  /加载.*失败/,
  /加载失败/,
  /调用失败/,
];

const ALLOWED_CONSOLE_WARNING_PATTERNS = [
  /Electron updater is only enabled for packaged builds/i,
];

function printHelp() {
  console.log(`
Settings Current Smoke

用途:
  通过真实设置页逐项点击，验证当前设置页首屏不会出现 DevBridge 断连、
  unsupported command 或 safeInvoke 错误缓冲。

用法:
  node scripts/settings-all-pages-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/settings-current
  --prefix <name>        证据文件前缀，默认 settings-current
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
  console.log(`[smoke:settings-current] stage=${stage}`);
}

function formatDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") {
    return "diagnostics=unavailable";
  }

  const visibleButtons = Array.isArray(diagnostics.visibleButtons)
    ? diagnostics.visibleButtons
        .slice(0, 24)
        .map((button) => {
          const label = [button.text, button.aria, button.testId]
            .filter(Boolean)
            .join("/");
          return label ? `${button.index}:${label}` : `${button.index}:-`;
        })
        .join(" | ")
    : "";

  return [
    `url=${sanitizeText(diagnostics.url ?? "")}`,
    `title=${sanitizeText(diagnostics.title ?? "")}`,
    `settingsSidebarMounted=${String(
      diagnostics.settingsSidebarMounted ?? false,
    )}`,
    `visibleButtons=${sanitizeText(visibleButtons || "(none)")}`,
    `bodyStart=${sanitizeText(diagnostics.bodyStart ?? "")}`,
  ].join("; ");
}

async function collectPageDiagnostics(page) {
  return await page.evaluate(() => {
    const visibleButtons = [...document.querySelectorAll("button")]
      .map((button, index) => {
        const rect = button.getBoundingClientRect();
        return {
          index,
          visible: rect.width > 0 && rect.height > 0,
          text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
          aria: button.getAttribute("aria-label") ?? "",
          testId: button.getAttribute("data-testid") ?? "",
          disabled:
            button.hasAttribute("disabled") ||
            button.getAttribute("aria-disabled") === "true",
        };
      })
      .filter((button) => button.visible && !button.disabled)
      .slice(0, 40);

    return {
      url: window.location.href,
      title: document.title,
      settingsSidebarMounted: Boolean(
        document.querySelector('[data-testid="settings-sidebar"]'),
      ),
      visibleButtons,
      bodyStart: document.body.innerText
        ?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 500),
    };
  });
}

async function waitForAppShellReady(page, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ready = await page
      .evaluate(() =>
        Boolean(
          document.querySelector('[data-testid="app-sidebar"]') ||
          document.querySelector('[data-testid="app-sidebar-main-nav"]') ||
          document.querySelector('[data-testid="chat-navbar"]') ||
          document.querySelector('[data-testid="empty-state"]') ||
          document.querySelector('[data-testid="home-guide-cards"]') ||
          document.querySelector('[data-testid="task-center-tab-strip"]') ||
          document.querySelector(
            '[data-testid="app-sidebar-account-button"]',
          ) ||
          [...document.querySelectorAll("button")].some(
            (button) =>
              button.getAttribute("aria-label") === "打开用户菜单" ||
              button.getAttribute("data-testid") ===
                "app-sidebar-search-button" ||
              button.getAttribute("data-testid") ===
                "app-sidebar-invite-button" ||
              button.textContent?.includes("新建任务") ||
              button.textContent?.includes("打开用户菜单"),
          ),
        ),
      )
      .catch(() => false);

    if (ready) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function waitForSettingsMounted(page, timeoutMs = 10_000) {
  const mounted = await page
    .waitForSelector('[data-testid="settings-sidebar"]', {
      state: "visible",
      timeout: timeoutMs,
    })
    .then(() => true)
    .catch(() => false);

  if (mounted) {
    await ensureSettingsGroupsExpanded(page);
  }

  return mounted;
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
        `[smoke:settings-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
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
    `[smoke:settings-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
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

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/\b(sk|pc)_[A-Za-z0-9._-]{12,}\b/g, "$1_[redacted]");
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
    return value.slice(0, 80).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 120)
        .map(([key, nextValue]) => [key, sanitizeJson(nextValue, depth + 1)]),
    );
  }
  return String(value);
}

function collectJsonRpcErrors(payload, source = "response") {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item, index) =>
      collectJsonRpcErrors(item, `${source}[${index}]`),
    );
  }

  const errors = [];
  if ("error" in payload && payload.error) {
    errors.push({
      source,
      error: sanitizeJson(payload.error),
    });
  }

  const lines = payload.result?.lines;
  if (Array.isArray(lines)) {
    for (const [index, line] of lines.entries()) {
      const parsedLine = parseJson(line);
      errors.push(
        ...collectJsonRpcErrors(parsedLine, `${source}.lines[${index}]`),
      );
    }
  }

  return errors;
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

function readInvokeErrorBuffer() {
  try {
    const raw = localStorage.getItem("lime_invoke_error_buffer_v1");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          command: entry.command,
          transport: entry.transport,
          error: sanitizeText(entry.error),
        }))
      : [];
  } catch {
    return [];
  }
}

function readInvokeTraceBuffer() {
  try {
    const raw = localStorage.getItem("lime_invoke_trace_buffer_v1");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          command: entry.command,
          transport: entry.transport,
          status: entry.status,
          error: sanitizeText(entry.error),
        }))
      : [];
  } catch {
    return [];
  }
}

function clearInvokeBuffers() {
  try {
    localStorage.removeItem("lime_invoke_error_buffer_v1");
    localStorage.removeItem("lime_invoke_trace_buffer_v1");
  } catch {
    // ignore
  }
}

async function clickByButtonText(page, label) {
  const result = await page.evaluate((targetLabel) => {
    const findVisibleButton = (scope) =>
      [...scope.querySelectorAll("button")].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          candidate.hasAttribute("disabled") ||
          candidate.getAttribute("aria-disabled") === "true"
        ) {
          return false;
        }
        const text = candidate.textContent?.replace(/\s+/g, " ").trim();
        const aria = candidate.getAttribute("aria-label");
        return (
          text === targetLabel ||
          text === `${targetLabel}进入配置` ||
          text?.startsWith(targetLabel) ||
          text?.startsWith(`${targetLabel} `) ||
          aria === targetLabel
        );
      });

    const scopes = [
      document.querySelector('[data-testid="settings-sidebar"]'),
      document.querySelector('[data-testid="settings-floating-nav-panel"]'),
      document.body,
    ].filter(Boolean);
    const button = scopes.map(findVisibleButton).find(Boolean);

    if (!button) {
      const visibleButtons = [...document.querySelectorAll("button")]
        .map((candidate, index) => {
          const rect = candidate.getBoundingClientRect();
          return {
            index,
            visible: rect.width > 0 && rect.height > 0,
            text: candidate.textContent?.replace(/\s+/g, " ").trim() ?? "",
            aria: candidate.getAttribute("aria-label") ?? "",
            testId: candidate.getAttribute("data-testid") ?? "",
            disabled:
              candidate.hasAttribute("disabled") ||
              candidate.getAttribute("aria-disabled") === "true",
          };
        })
        .filter((candidate) => candidate.visible && !candidate.disabled)
        .slice(0, 40);

      return {
        clicked: false,
        url: window.location.href,
        title: document.title,
        settingsSidebarMounted: Boolean(
          document.querySelector('[data-testid="settings-sidebar"]'),
        ),
        visibleButtons,
        bodyStart: document.body.innerText
          ?.replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
      };
    }

    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return { clicked: true };
  }, label);
  assert(
    result.clicked,
    `未找到设置按钮: ${label}; ${formatDiagnostics(result)}`,
  );
  await page
    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function ensureSettingsGroupsExpanded(page) {
  await page.evaluate(
    async (groupLabels) => {
      const sleepInPage = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      for (const label of groupLabels) {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => {
            const rect = candidate.getBoundingClientRect();
            const text = candidate.textContent?.replace(/\s+/g, " ").trim();
            return rect.width > 0 && rect.height > 0 && text === label;
          },
        );
        const items = button?.parentElement?.querySelector("div");
        if (!button || !items) {
          continue;
        }
        if (getComputedStyle(items).display === "none") {
          button.click();
          await sleepInPage(120);
        }
      }
    },
    ["账号", "通用", "智能体", "系统"],
  );
}

async function snapshotSettingsPage(page, tabName, subTabName = null) {
  return await page.evaluate(
    ({ tabName: activeTabName, subTabName: activeSubTabName, patterns }) => {
      const sanitizeTextInPage = (value) =>
        String(value ?? "")
          .replace(
            /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
            "$1$2[redacted]",
          )
          .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
          .replace(/\b(sk|pc)_[A-Za-z0-9._-]{12,}\b/g, "$1_[redacted]");
      const readJsonArray = (key) => {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      const clearInvokeBuffersInPage = () => {
        try {
          localStorage.removeItem("lime_invoke_error_buffer_v1");
          localStorage.removeItem("lime_invoke_trace_buffer_v1");
        } catch {
          // ignore
        }
      };
      const text = document.body.innerText;
      const problemTexts = patterns.flatMap((patternSpec) => {
        const pattern = new RegExp(patternSpec.source, patternSpec.flags);
        const match = text.match(pattern);
        return match ? [match[0]] : [];
      });
      const errors = readJsonArray("lime_invoke_error_buffer_v1").map(
        (entry) => ({
          command: entry.command,
          transport: entry.transport,
          error: sanitizeTextInPage(entry.error),
        }),
      );
      const traces = readJsonArray("lime_invoke_trace_buffer_v1").map(
        (entry) => ({
          command: entry.command,
          transport: entry.transport,
          status: entry.status,
          error: sanitizeTextInPage(entry.error),
        }),
      );
      const errorTraces = traces.filter((entry) => entry.status === "error");
      clearInvokeBuffersInPage();
      return {
        name: activeTabName,
        subTab: activeSubTabName,
        title:
          document
            .querySelector(
              'main h1, main h2, [data-testid="settings-page-title"]',
            )
            ?.textContent?.trim() ?? "",
        problemTexts: [...new Set(problemTexts)],
        errorCount: errors.length,
        recentErrors: errors.slice(-10),
        traceErrorCount: errorTraces.length,
        recentTraceErrors: errorTraces.slice(-10),
        textStart: sanitizeTextInPage(text.slice(0, 400)),
      };
    },
    {
      tabName,
      subTabName,
      patterns: PROBLEM_PATTERNS.map((pattern) => ({
        source: pattern.source,
        flags: pattern.flags,
      })),
    },
  );
}

async function listVisibleSubTabs(page) {
  return await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    return tabs
      .filter((tab) => {
        const rect = tab.getBoundingClientRect();
        return (
          rect.width > 0 && rect.height > 0 && !tab.hasAttribute("disabled")
        );
      })
      .map((tab, index) => ({
        index,
        label:
          tab.getAttribute("aria-label") ||
          tab.textContent?.replace(/\s+/g, " ").trim() ||
          `tab-${index}`,
        selected: tab.getAttribute("aria-selected") === "true",
      }))
      .filter((tab) => tab.label && tab.label !== "tab-0");
  });
}

async function clickVisibleSubTab(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (candidate) => {
        const rect = candidate.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          candidate.hasAttribute("disabled")
        ) {
          return false;
        }
        const text = candidate.textContent?.replace(/\s+/g, " ").trim();
        return (
          text === targetLabel ||
          candidate.getAttribute("aria-label") === targetLabel
        );
      },
    );
    if (!tab) {
      return false;
    }
    tab.scrollIntoView({ block: "center", inline: "nearest" });
    tab.click();
    return true;
  }, label);
  if (clicked) {
    await page
      .waitForLoadState("domcontentloaded", { timeout: 5_000 })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  return clicked;
}

async function enterSettings(page, options) {
  logStage("enter-settings");
  await page.goto(options.appUrl, {
    waitUntil: "commit",
    timeout: Math.min(options.timeoutMs, 60_000),
  });
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => {});
  const appReady = await waitForAppShellReady(
    page,
    Math.min(options.timeoutMs, 45_000),
  );
  assert(
    appReady,
    `应用主壳未就绪: ${formatDiagnostics(await collectPageDiagnostics(page))}`,
  );

  const menuOpened = await page.evaluate(() => {
    document
      .querySelector('[data-testid="app-sidebar-account-slot"]')
      ?.scrollIntoView({ block: "end", inline: "nearest" });
    const menu =
      document.querySelector('[data-testid="app-sidebar-account-button"]') ||
      [...document.querySelectorAll("button")].find(
        (button) =>
          button.getAttribute("aria-label") === "打开用户菜单" ||
          button.textContent?.includes("打开用户菜单"),
      );
    if (!menu) {
      return false;
    }
    menu.click();
    return true;
  });
  assert(
    menuOpened,
    `无法打开用户菜单: ${formatDiagnostics(await collectPageDiagnostics(page))}`,
  );
  await page.waitForTimeout(300);

  const opened = await page.evaluate(() => {
    const settings = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "设置",
    );
    if (!settings) {
      return false;
    }
    settings.click();
    return true;
  });
  assert(
    opened,
    `无法从用户菜单进入设置页: ${formatDiagnostics(
      await collectPageDiagnostics(page),
    )}`,
  );
  await page
    .waitForLoadState("domcontentloaded", { timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  const settingsMounted = await waitForSettingsMounted(page, 20_000);
  assert(
    settingsMounted,
    `设置页未挂载: ${formatDiagnostics(await collectPageDiagnostics(page))}`,
  );
}

async function clickSettingsTabs(page, options) {
  const results = [];
  await page.evaluate(() => {
    localStorage.removeItem("lime_invoke_error_buffer_v1");
    localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });

  for (const tab of SETTINGS_TABS) {
    let settingsMounted = await waitForSettingsMounted(page, 8_000);
    if (!settingsMounted) {
      logStage(`recover-settings:${tab}`);
      await enterSettings(page, options);
      settingsMounted = await waitForSettingsMounted(page, 12_000);
    }
    assert(
      settingsMounted,
      `点击 ${tab} 前设置页不可用: ${formatDiagnostics(
        await collectPageDiagnostics(page),
      )}`,
    );

    logStage(`tab:${tab}`);
    await clickByButtonText(page, tab);
    const stillMounted = await waitForSettingsMounted(page, 12_000);
    assert(
      stillMounted,
      `点击 ${tab} 后设置页不可用: ${formatDiagnostics(
        await collectPageDiagnostics(page),
      )}`,
    );
    await page.waitForTimeout(tab === "AI 服务商" ? 1_800 : 1_300);

    results.push(await snapshotSettingsPage(page, tab));

    const subTabs = await listVisibleSubTabs(page);
    for (const subTab of subTabs) {
      if (!subTab.selected) {
        const clicked = await clickVisibleSubTab(page, subTab.label);
        if (!clicked) {
          continue;
        }
      }
      results.push(await snapshotSettingsPage(page, tab, subTab.label));
    }
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  await waitForHealth(options);

  const tmpProfileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "settings-current-"),
  );
  const context = await chromium.launchPersistentContext(tmpProfileDir, {
    headless: options.headless,
    viewport: { width: 1440, height: 1000 },
    executablePath: resolveLocalChromeExecutablePath(),
  });
  const page = await context.newPage();
  const consoleEntries = [];
  const invokeRequests = [];
  const invokeResponseErrors = [];

  page.on("console", (message) => {
    consoleEntries.push({
      type: message.type(),
      text: sanitizeText(message.text()),
    });
  });
  page.on("request", (request) => {
    if (!requestMatchesInvoke(request.url(), options.invokeUrl)) {
      return;
    }
    const payload = parseJson(request.postData());
    invokeRequests.push({
      url: normalizeUrl(request.url()),
      method: request.method(),
      cmd: payload?.cmd ?? null,
      args: sanitizeJson(payload?.args ?? null),
    });
  });
  page.on("response", async (response) => {
    if (!requestMatchesInvoke(response.url(), options.invokeUrl)) {
      return;
    }
    const requestPayload = parseJson(response.request().postData());
    const responseText = await response.text().catch(() => "");
    const responsePayload = parseJson(responseText);
    const rpcErrors = collectJsonRpcErrors(responsePayload);
    if (!response.ok() || rpcErrors.length > 0) {
      invokeResponseErrors.push({
        url: normalizeUrl(response.url()),
        status: response.status(),
        cmd: requestPayload?.cmd ?? null,
        errors: rpcErrors,
        bodyPreview: sanitizeText(responseText.slice(0, 800)),
      });
    }
  });

  let summary;
  try {
    await enterSettings(page, options);
    const pages = await clickSettingsTabs(page, options);
    const consoleErrors = consoleEntries.filter(
      (entry) => entry.type === "error",
    );
    const unexpectedConsoleWarnings = consoleEntries.filter(
      (entry) =>
        entry.type === "warning" &&
        !ALLOWED_CONSOLE_WARNING_PATTERNS.some((pattern) =>
          pattern.test(entry.text),
        ),
    );
    const failedPages = pages.filter(
      (entry) =>
        !entry.title ||
        entry.problemTexts.length > 0 ||
        entry.errorCount > 0 ||
        entry.traceErrorCount > 0,
    );

    summary = {
      ok:
        failedPages.length === 0 &&
        consoleErrors.length === 0 &&
        unexpectedConsoleWarnings.length === 0 &&
        invokeResponseErrors.length === 0,
      checkedAt: new Date().toISOString(),
      appUrl: options.appUrl,
      tabs: SETTINGS_TABS,
      pages,
      failedPages,
      consoleErrors,
      unexpectedConsoleWarnings,
      consoleWarnings: consoleEntries.filter(
        (entry) => entry.type === "warning",
      ),
      invokeResponseErrors,
      invokeCount: invokeRequests.length,
    };

    await page.screenshot({
      path: path.join(options.evidenceDir, `${options.prefix}.png`),
      fullPage: true,
    });

    assert(failedPages.length === 0, "设置页存在错误状态");
    assert(consoleErrors.length === 0, "设置页点击期间出现控制台 error");
    assert(
      unexpectedConsoleWarnings.length === 0,
      "设置页点击期间出现未分类控制台 warning",
    );
    assert(invokeResponseErrors.length === 0, "设置页 invoke 响应存在错误");
  } catch (error) {
    await page
      .screenshot({
        path: path.join(options.evidenceDir, `${options.prefix}-failure.png`),
        fullPage: true,
      })
      .catch(() => undefined);
    summary = {
      ...(summary ?? {
        checkedAt: new Date().toISOString(),
        appUrl: options.appUrl,
      }),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      consoleEntries,
      invokeResponseErrors,
      invokeCount: invokeRequests.length,
    };
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(options.evidenceDir, `${options.prefix}-summary.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(options.evidenceDir, `${options.prefix}-network-invoke.json`),
      `${JSON.stringify(invokeRequests, null, 2)}\n`,
      "utf8",
    );
    await context.close();
    fs.rmSync(tmpProfileDir, { recursive: true, force: true });
  }

  console.log(
    `[smoke:settings-current] ok tabs=${summary.pages.length} invokes=${summary.invokeCount}`,
  );
}

main().catch((error) => {
  console.error(
    `[smoke:settings-current] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
