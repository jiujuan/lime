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
  probeCommand: "/skill-current-smoke-probe",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "skills-current",
  ),
  prefix: "skills-current",
  headless: true,
  allowLiveProvider: false,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = ["skill/list"];
const LEGACY_SKILL_COMMANDS = ["list_executable_skills", "get_skill_detail"];
const FORBIDDEN_APP_SERVER_METHODS = ["agentSession/turn/start"];
const FORBIDDEN_SIDE_EFFECT_COMMANDS = [
  "execute_skill",
  "agent_runtime_submit_turn",
];

function printHelp() {
  console.log(`
Skills Current Smoke

用途:
  通过真实首页输入框发送无效 slash skill probe，并捕获 DevBridge /invoke
  网络请求，验证 slash skill 发送前置检查的可执行 Skill 列表读取走
  App Server JSON-RPC current 主链，而不是 legacy list_executable_skills /
  get_skill_detail 命令或 mock；同时断言该探针停在 skill_not_found，不执行
  Skill、不启动真实 Agent turn。

用法:
  node scripts/skills-current-smoke.mjs

选项:
  --app-url <url>        前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --probe-command <cmd>  slash skill 探针，默认 /skill-current-smoke-probe
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     健康检查轮询间隔，默认 1000
  --evidence-dir <path>  证据目录，默认 .lime/qc/gui-evidence/skills-current
  --prefix <name>        证据文件前缀，默认 skills-current
  --headed               使用有界面 Chrome
  --allow-live-provider  保留统一 live gate 语义；本 smoke 默认不提交真实 AgentRuntime / Provider
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
    if (arg === "--probe-command" && argv[index + 1]) {
      options.probeCommand = String(argv[index + 1]).trim();
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
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
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
  if (!options.probeCommand || !options.probeCommand.startsWith("/")) {
    throw new Error("--probe-command 必须是 slash command");
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
  console.log(`[smoke:skills-current] stage=${stage}`);
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
        `[smoke:skills-current] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? response.status}`,
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
    `[smoke:skills-current] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
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

function resolveProbeSkillName(probeCommand) {
  return String(probeCommand || "")
    .replace(/^\//, "")
    .replace(/^_+|_+$/g, "");
}

function isSkillNotFoundText(bodyText, probeCommand) {
  const text = String(bodyText || "");
  const skillName = resolveProbeSkillName(probeCommand);
  const hasNotFound =
    text.includes("skill_not_found") ||
    text.includes("Skill 执行失败") ||
    text.includes("未找到名为");

  return (
    hasNotFound &&
    (!skillName || text.includes(skillName) || text.includes(probeCommand))
  );
}

function collectInvokeEntry(requestPayload, responsePayload, url) {
  const requestLines =
    requestPayload?.request?.lines ??
    requestPayload?.args?.request?.lines ??
    requestPayload?.payload?.lines ??
    requestPayload?.lines;
  const responseLines =
    responsePayload?.result?.lines ??
    responsePayload?.request?.lines ??
    responsePayload?.lines;
  const requestMessages = decodeJsonRpcLines(requestLines);
  const responseMessages = decodeJsonRpcLines(responseLines);
  const responseById = new Map(
    responseMessages
      .filter((message) => message && message.id !== undefined)
      .map((message) => [message.id, message]),
  );

  return {
    url: sanitizeText(url),
    cmd: requestPayload?.cmd ?? null,
    appServerRequests: requestMessages
      .filter((message) => typeof message?.method === "string")
      .map((message) => ({
        id: message.id ?? null,
        method: message.method,
        params: sanitizeJson(message.params ?? {}),
        response: sanitizeJson(responseById.get(message.id) ?? null),
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
  const summarizeAppServerRequest = (request) => ({
    id: request.id,
    method: request.method,
    params: request.params,
  });
  const skillListRequests = appServerRequests.filter(
    (request) => request.method === "skill/list",
  );
  const skillListResponses = skillListRequests.map((request) => ({
    id: request.id,
    hasError: Boolean(request.response?.error),
    skillsIsArray: Array.isArray(request.response?.result?.skills),
    skillCount: Array.isArray(request.response?.result?.skills)
      ? request.response.result.skills.length
      : null,
  }));
  const skillReadRequests = appServerRequests.filter(
    (request) => request.method === "skill/read",
  );
  const forbiddenAppServerMethodsSeen = appServerMethodsSeen.filter((method) =>
    FORBIDDEN_APP_SERVER_METHODS.includes(method),
  );
  const forbiddenSideEffectCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          FORBIDDEN_SIDE_EFFECT_COMMANDS.includes(entry.cmd)
            ? entry.cmd
            : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const legacySkillCommandsSeen = Array.from(
    new Set(
      entries
        .map((entry) =>
          typeof entry.cmd === "string" &&
          LEGACY_SKILL_COMMANDS.includes(entry.cmd)
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
    forbiddenAppServerMethodsSeen,
    forbiddenSideEffectCommandsSeen,
    legacySkillCommandsSeen,
    skillListRequestCount: skillListRequests.length,
    skillListRequests: skillListRequests.map(summarizeAppServerRequest),
    skillListResponses,
    skillReadRequestCount: skillReadRequests.length,
    skillReadRequests: skillReadRequests.map(summarizeAppServerRequest),
    missingRequiredAppServerMethods: REQUIRED_APP_SERVER_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
    skillListResponsesValid:
      skillListResponses.length > 0 &&
      skillListResponses.every(
        (response) => !response.hasError && response.skillsIsArray,
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
      observed.skillListRequestCount >= 1 &&
      observed.skillListResponsesValid &&
      observed.forbiddenAppServerMethodsSeen.length === 0 &&
      observed.forbiddenSideEffectCommandsSeen.length === 0 &&
      observed.legacySkillCommandsSeen.length === 0
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

async function primeHomeStorage(page, options) {
  await page.goto(options.appUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.evaluate(() => {
    localStorage.setItem("lime.app-sidebar.collapsed", "false");
  });
}

async function submitSkillProbe(page, options) {
  await primeHomeStorage(page, options);
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="app-sidebar"], textarea', {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector("textarea", {
    timeout: options.timeoutMs,
  });

  const textarea = page.locator("textarea").last();
  await textarea.click();
  await textarea.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await textarea.type(options.probeCommand, { delay: 5 });
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some((button) => {
        const aria = button.getAttribute("aria-label") || "";
        const title = button.getAttribute("title") || "";
        return /发送|Send/i.test(`${aria}\n${title}`) && !button.disabled;
      });
    },
    { timeout: Math.min(15_000, options.timeoutMs) },
  );

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target =
      buttons.find((button) => {
        const aria = button.getAttribute("aria-label") || "";
        const title = button.getAttribute("title") || "";
        return /发送|Send/i.test(`${aria}\n${title}`);
      }) ?? buttons.at(-1);
    if (!target || target.disabled) {
      return false;
    }
    target.click();
    return true;
  });

  assert(clicked, "未找到可点击的发送按钮");
  await page.waitForFunction(
    (probeCommand) => {
      const bodyText = document.body.textContent ?? "";
      const normalizedProbeName = String(probeCommand || "")
        .replace(/^\//, "")
        .replace(/^_+|_+$/g, "");
      const hasNotFound =
        bodyText.includes("skill_not_found") ||
        bodyText.includes("Skill 执行失败") ||
        bodyText.includes("未找到名为");
      return (
        hasNotFound &&
        (!normalizedProbeName || bodyText.includes(normalizedProbeName))
      );
    },
    options.probeCommand,
    { timeout: Math.min(30_000, options.timeoutMs) },
  );
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowLiveProvider) {
    console.log(
      "[smoke:skills-current] live_provider_submission=status:not_submitted reason:默认未提交真实 AgentRuntime / Provider，仅验证 slash skill 前置检查 current 主链。",
    );
  }
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
    probeCommand: options.probeCommand,
    health: null,
    homeMounted: false,
    skillNotFoundRendered: false,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    forbiddenAppServerMethodsSeen: [],
    forbiddenSideEffectCommandsSeen: [],
    legacySkillCommandsSeen: [],
    skillListRequestCount: 0,
    skillListRequests: [],
    skillListResponses: [],
    skillListResponsesValid: false,
    skillReadRequestCount: 0,
    skillReadRequests: [],
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
    tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-current-"));
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
          "[smoke:skills-current] 解析 invoke 网络证据失败:",
          message,
        );
      }
    });

    logStage("submit-skill-probe");
    await submitSkillProbe(page, options);

    const observed = await waitForInvokeEvidence(invokeEntries, options);
    Object.assign(summary, observed);

    const bodyText = await page.locator("body").innerText();
    summary.homeMounted =
      /新建任务|Skills|项目资料|Agent Apps|What can I help|帮你/i.test(
        bodyText,
      );
    summary.skillNotFoundRendered = isSkillNotFoundText(
      bodyText,
      options.probeCommand,
    );
    summary.consoleErrors = consoleErrors;
    summary.failedRequests = failedRequests.slice(0, 20);
    summary.screenshot = screenshotPath;

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeJsonFile(networkPath, {
      entries: invokeEntries,
      summary: observed,
    });

    assert(
      summary.health?.transport === "electron-host",
      `DevBridge transport 应为 electron-host，实际 ${summary.health?.transport ?? "unknown"}`,
    );
    assert(summary.homeMounted, "首页输入界面未挂载");
    assert(
      summary.skillNotFoundRendered,
      "未观察到 slash skill_not_found UI 结果",
    );
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.missingRequiredAppServerMethods.length === 0,
      `缺少 App Server JSON-RPC 方法: ${summary.missingRequiredAppServerMethods.join(", ")}`,
    );
    assert(
      summary.skillListRequestCount >= 1,
      `skill/list 请求不足，实际 ${summary.skillListRequestCount}`,
    );
    assert(
      summary.skillListResponsesValid,
      "skill/list response 缺少 result.skills 数组或返回错误",
    );
    assert(
      summary.forbiddenAppServerMethodsSeen.length === 0,
      `无效 slash skill 探针不应启动 Agent turn: ${summary.forbiddenAppServerMethodsSeen.join(", ")}`,
    );
    assert(
      summary.forbiddenSideEffectCommandsSeen.length === 0,
      `无效 slash skill 探针不应执行 side-effect 命令: ${summary.forbiddenSideEffectCommandsSeen.join(", ")}`,
    );
    assert(
      summary.legacySkillCommandsSeen.length === 0,
      `观察到 legacy skill 命令: ${summary.legacySkillCommandsSeen.join(", ")}`,
    );

    summary.ok = true;
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:skills-current] summary=${summaryPath}`);
    console.log(`[smoke:skills-current] screenshot=${screenshotPath}`);
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

    console.error(`[smoke:skills-current] summary=${summaryPath}`);
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
