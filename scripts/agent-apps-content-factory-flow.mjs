#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function resolveDefaultContentFactoryDir() {
  if (process.env.CONTENT_FACTORY_APP_DIR) {
    return path.resolve(process.env.CONTENT_FACTORY_APP_DIR);
  }
  return path.resolve(process.cwd(), "..", "..", "limecloud", "content-factory-app");
}

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 180_000,
  intervalMs: 1_000,
  completionTimeoutMs: 420_000,
  overallTimeoutMs: 0,
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "content-factory-full-flow",
  contentFactoryDir: resolveDefaultContentFactoryDir(),
  installSource: "local",
  launchMode: "embedded",
  modelProvider: process.env.CONTENT_FACTORY_E2E_MODEL_PROVIDER || "",
  modelName: process.env.CONTENT_FACTORY_E2E_MODEL || "",
  modelLabel: process.env.CONTENT_FACTORY_E2E_MODEL_LABEL || "",
  actions: [
    "run-scenarios",
    "run-production",
    "run-scripts",
    "run-strategy",
    "run-review",
  ],
};

const ACCOUNT_MENU_BUTTON_SELECTOR = '[data-testid="app-sidebar-account-button"]';
const AGENT_APPS_NAV_SELECTOR =
  'button[aria-label="Agent Apps"], button[title="Agent Apps"]';
const AGENT_APP_LAB_NAV_SELECTOR =
  'button[aria-label="Agent App Lab"], button[title="Agent App Lab"]';
const CONTENT_FACTORY_SAMPLE_PROJECT_ID = "sample_content_factory_spring";
const CONTENT_FACTORY_SAMPLE_PROJECT_NAME = "春季新品内容项目";
const CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY =
  "contentFactory.activeProjectId.v1";
const CONTENT_FACTORY_HOST_TASK_STORAGE_KEY =
  "contentFactory.activeHostTask.v1";
const CONTENT_FACTORY_PAGE_ALIASES = {
  projects: ["projects", "overview"],
  dashboard: ["dashboard", "overview"],
  start: ["start", "materials"],
  knowledge: ["knowledge", "materials"],
  produce: ["produce", "content"],
  campaigns: ["campaigns", "content"],
  deliver: ["deliver", "delivery"],
  delivery: ["delivery", "deliver"],
};
const CONTENT_FACTORY_PAGE_ROUTE_PATTERNS = {
  start: /^\/(?:knowledge|start)$/,
  knowledge: /^\/(?:knowledge|start)$/,
  materials: /^\/(?:knowledge|start)$/,
  scenes: /^\/scenario-planning$/,
  produce: /^\/campaigns$/,
  campaigns: /^\/campaigns$/,
  content: /^\/campaigns$/,
  deliver: /^\/(?:deliver|delivery)$/,
  delivery: /^\/(?:deliver|delivery)$/,
  review: /^\/review-dashboard$/,
};
const CONTENT_FACTORY_PAGE_ROUTE_PATHS = {
  start: "/knowledge",
  knowledge: "/knowledge",
  materials: "/knowledge",
  scenes: "/scenario-planning",
  produce: "/campaigns",
  campaigns: "/campaigns",
  content: "/campaigns",
  deliver: "/deliver",
  delivery: "/deliver",
  review: "/review-dashboard",
};
const CONTENT_FACTORY_REVIEW_E2E_METRICS = {
  "review.direction": "低气味家庭清洁内容",
  "review.sampleSize": "240",
  "review.reuseRatio": "6",
  "review.completionRate": "32",
  "review.searchShare": "28",
  "review.conversionRate": "3.5",
};

const CONTENT_FACTORY_ACTIONS = {
  "build-store": {
    action: "build-store",
    page: "start",
    pageReadyPattern: /资料|资料原文或摘要|确认资料版本/,
    label: "整理知识库",
    expectedSkills: ["knowledge-builder", "content-reviewer"],
    runningPattern:
      /AI 同事正在整理知识库|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-scenarios": {
    action: "run-scenarios",
    page: "scenes",
    pageReadyPattern: /场景整理|场景概览|优先场景/,
    label: "生成/更新场景包",
    expectedSkills: ["knowledge-builder", "content-reviewer"],
    runningPattern:
      /AI 同事正在准备场景|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-production": {
    action: "run-production",
    page: "produce",
    pageReadyPattern: /本轮内容画布|整理本轮内容|脚本和图片需求/,
    campaignStep: "copy",
    label: "生成本轮内容包",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在整理本轮内容|AI 同事正在生成内容包|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-production-next-round": {
    action: "run-production",
    page: "review",
    pageReadyPattern: /复盘决策室|复盘出口|下一轮建议/,
    campaignStep: "copy",
    prepareNextRound: true,
    label: "生成下一轮内容包",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /正在整理本轮内容|AI 同事正在生成内容包|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "only-copy": {
    action: "only-copy",
    page: "produce",
    pageReadyPattern: /本轮内容画布|只重写草稿|脚本和图片需求/,
    campaignStep: "copy",
    label: "只重写文案批次",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /AI 同事正在重写文案|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-scripts": {
    action: "run-scripts",
    page: "produce",
    pageReadyPattern: /本轮内容画布|生成脚本|图片需求/,
    campaignStep: "derivatives",
    label: "生成脚本批次",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /AI 同事正在生成脚本|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-strategy": {
    action: "run-strategy",
    page: "deliver",
    pageReadyPattern: /交付内容|复制或下载|更新交付结论/,
    label: "更新交付结论",
    expectedSkills: ["article-writer", "content-reviewer"],
    runningPattern:
      /AI 同事正在准备交付包|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
  "run-review": {
    action: "run-review",
    page: "review",
    pageReadyPattern: /录入一周结果|复盘发现|生成判断/,
    label: "生成判断",
    expectedSkills: ["content-reviewer"],
    runningPattern:
      /AI 同事正在分析复盘|Lime AI 运行现场|正在连接 Lime AI 同事/,
  },
};

function parseArgs(argv) {
  const options = { ...DEFAULTS, actions: [...DEFAULTS.actions] };
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
    if (arg === "--completion-timeout-ms" && argv[index + 1]) {
      options.completionTimeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--overall-timeout-ms" && argv[index + 1]) {
      options.overallTimeoutMs = Number(argv[index + 1]);
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
    if (arg === "--content-factory-dir" && argv[index + 1]) {
      options.contentFactoryDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--install-source" && argv[index + 1]) {
      options.installSource = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--launch-mode" && argv[index + 1]) {
      options.launchMode = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if ((arg === "--model-provider" || arg === "--provider") && argv[index + 1]) {
      options.modelProvider = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--model" && argv[index + 1]) {
      options.modelName = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--model-label" && argv[index + 1]) {
      options.modelLabel = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--actions" && index + 1 < argv.length) {
      const rawActions = String(argv[index + 1]).trim();
      options.actions = rawActions && rawActions !== "none"
        ? rawActions
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      index += 1;
      continue;
    }
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  for (const action of options.actions) {
    if (!CONTENT_FACTORY_ACTIONS[action]) {
      throw new Error(
        `Unsupported action: ${action}. Supported: ${Object.keys(
          CONTENT_FACTORY_ACTIONS,
        ).join(", ")}`,
      );
    }
  }
  if (!["local", "cloud"].includes(options.installSource)) {
    throw new Error("--install-source only supports local or cloud");
  }
  if (!["embedded", "standalone-shell"].includes(options.launchMode)) {
    throw new Error("--launch-mode only supports embedded or standalone-shell");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-apps-content-factory-flow.mjs [options]

Options:
  --app-url <url>                 Lime WebView URL, default http://127.0.0.1:1420/
  --health-url <url>              DevBridge health URL, default http://127.0.0.1:3030/health
  --timeout-ms <ms>               Page/bootstrap timeout, default 180000
  --completion-timeout-ms <ms>    Per action runtime completion timeout, default 420000
  --overall-timeout-ms <ms>       Whole flow watchdog timeout; 0 computes from actions and per-action timeout
  --prefix <name>                 Evidence filename prefix
  --content-factory-dir <dir>      Current content-factory-app directory, default ../../limecloud/content-factory-app
  --install-source <local|cloud>   Install current local package or cloud catalog release, default local
  --launch-mode <mode>             embedded or standalone-shell, default embedded
  --model-provider <id>            Optional provider preference written to Content Factory settings
  --model <name>                   Optional model preference written to Content Factory settings
  --model-label <label>            Optional display label for the model preference
  --actions <csv>                 Flow actions, default run-scenarios,run-production,run-scripts,run-strategy,run-review
                                  Extra: run-production-next-round creates and confirms a new round before production
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOverallTimeoutMs(options) {
  if (Number.isFinite(options.overallTimeoutMs) && options.overallTimeoutMs > 0) {
    return options.overallTimeoutMs;
  }
  const bootstrapBudgetMs = Math.max(options.timeoutMs * 2, 120_000);
  const perActionBudgetMs = options.completionTimeoutMs + Math.max(options.timeoutMs, 120_000);
  return bootstrapBudgetMs + Math.max(1, options.actions.length) * perActionBudgetMs;
}

function createFlowWatchdog(timeoutMs) {
  let timeoutId = null;
  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Content Factory flow exceeded overall timeout ${timeoutMs}ms before writing success evidence`,
        ),
      );
    }, timeoutMs);
  });
  return {
    promise,
    clear() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

function signalExitCode(signal) {
  if (signal === "SIGHUP") return 129;
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 1;
}

function logStage(stage) {
  console.log(`[content-factory-flow] stage=${stage}`);
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeText(value) {
  const text = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return text.length > 1_600
    ? `${text.slice(0, 1_600)}... [truncated ${text.length - 1_600} chars]`
    : text;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 6) {
    return "[truncated-depth]";
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeJson(item, depth + 1));
  }
  if (isObjectRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function pageButtonSelector(pageKey) {
  const keys = CONTENT_FACTORY_PAGE_ALIASES[pageKey] ?? [pageKey];
  return keys
    .flatMap((key) => [`button[data-page="${key}"]`, `button[data-go-page="${key}"]`])
    .join(", ");
}

function pageRoutePattern(pageKey) {
  const keys = [
    pageKey,
    ...(CONTENT_FACTORY_PAGE_ALIASES[pageKey] ?? []),
  ];
  for (const key of keys) {
    if (CONTENT_FACTORY_PAGE_ROUTE_PATTERNS[key]) {
      return CONTENT_FACTORY_PAGE_ROUTE_PATTERNS[key];
    }
  }
  return null;
}

function pageRoutePath(pageKey) {
  const keys = [
    pageKey,
    ...(CONTENT_FACTORY_PAGE_ALIASES[pageKey] ?? []),
  ];
  for (const key of keys) {
    if (CONTENT_FACTORY_PAGE_ROUTE_PATHS[key]) {
      return CONTENT_FACTORY_PAGE_ROUTE_PATHS[key];
    }
  }
  return "/dashboard";
}

async function waitForContentFactoryPageRoute(frame, pageKey, timeoutMs) {
  const pattern = pageRoutePattern(pageKey);
  if (!pattern) return;
  await frame.waitForFunction(
    ({ source }) => new RegExp(source).test(window.location.pathname),
    { source: pattern.source },
    { timeout: timeoutMs },
  );
}

async function isContentFactoryPageRoute(frame, pageKey, timeoutMs = 1_000) {
  const pattern = pageRoutePattern(pageKey);
  if (!pattern) return true;
  return Boolean(
    await evaluateWithTimeout(
      frame,
      ({ source }) => new RegExp(source).test(window.location.pathname),
      { source: pattern.source },
      timeoutMs,
    ).catch(() => false),
  );
}

async function clickFirstVisibleEnabled(locator, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let latestError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 12); index += 1) {
      const candidate = locator.nth(index);
      try {
        if (!(await candidate.isVisible({ timeout: 500 }).catch(() => false))) continue;
        if (await candidate.isDisabled().catch(() => false)) continue;
        try {
          await candidate.click({ timeout: Math.min(5_000, timeoutMs) });
        } catch (clickError) {
          latestError = clickError;
          await candidate.click({
            force: true,
            timeout: Math.min(5_000, timeoutMs),
          }).catch(async (forceError) => {
            latestError = forceError;
            await candidate.evaluate((element) => element.click());
          });
        }
        return true;
      } catch (error) {
        latestError = error;
      }
    }
    await sleep(500);
  }
  if (latestError) {
    throw latestError;
  }
  return false;
}

async function clickContentFactoryPage(frame, pageKey, timeoutMs) {
  if (await isContentFactoryPageRoute(frame, pageKey)) return;
  const clicked = await clickFirstVisibleEnabled(
    frame.locator(pageButtonSelector(pageKey)),
    timeoutMs,
  );
  assert(clicked, `Content Factory page ${pageKey} navigation should be visible`);
  await waitForContentFactoryPageRoute(frame, pageKey, timeoutMs);
}

async function waitForActionPageReady(frame, actionConfig, timeoutMs) {
  await waitForContentFactoryPageRoute(frame, actionConfig.page, timeoutMs);
  if (actionConfig.pageReadyPattern) {
    await frame.locator("body").getByText(actionConfig.pageReadyPattern).first().waitFor({
      timeout: timeoutMs,
    });
    return;
  }
  if (actionConfig.pageText) {
    await frame.getByText(actionConfig.pageText).first().waitFor({
      timeout: timeoutMs,
    });
  }
}

async function readBodyText(scope, timeoutMs = 1_500) {
  try {
    const fastText = await evaluateWithTimeout(
      scope,
      () =>
        document.body?.textContent ||
        document.documentElement?.textContent ||
        document.body?.innerText ||
        document.documentElement?.innerText ||
        "",
      null,
      timeoutMs,
    );
    if (String(fastText ?? "").trim()) {
      return String(fastText);
    }
  } catch {
    // Fall through to Playwright's text helpers; some frames are mid-navigation.
  }
  try {
    const fastHtml = await evaluateWithTimeout(
      scope,
      () =>
        document.body?.innerHTML ||
        document.documentElement?.outerHTML ||
        "",
      null,
      timeoutMs,
    );
    const readableText = htmlToReadableText(fastHtml);
    if (readableText.trim()) {
      return readableText;
    }
  } catch {
    // Fall through to Playwright's text helpers.
  }
  try {
    return await scope.locator("body").innerText({ timeout: timeoutMs });
  } catch {
    try {
      return htmlToReadableText(await readScopeHtml(scope, timeoutMs));
    } catch {
      try {
        return await evaluateWithTimeout(
          scope,
          () =>
            document.body?.innerText ||
            document.documentElement?.innerText ||
            document.body?.textContent ||
            document.documentElement?.textContent ||
            "",
          null,
          timeoutMs,
        );
      } catch {
        return "";
      }
    }
  }
}

async function readFrameTextEntry(frame, timeoutMs = 1_500) {
  const text = await readBodyText(frame, timeoutMs);
  return {
    url: typeof frame.url === "function" ? frame.url() : "",
    name: typeof frame.name === "function" ? frame.name() : "",
    text,
  };
}

async function readAllRuntimeTextEntries(page, fallbackFrame, timeoutMs = 2_000) {
  const frames = page?.frames?.() ?? [];
  const entries = [];
  const seen = new Set();

  for (const frame of frames) {
    const key = `${frame.url?.() ?? ""}::${frame.name?.() ?? ""}`;
    seen.add(key);
    try {
      const entry = await readFrameTextEntry(frame, timeoutMs);
      if (entry.text.trim()) {
        entries.push(entry);
      }
    } catch {
      // Ignore a frame that is reloading; the next poll will read the fresh frame.
    }
  }

  if (fallbackFrame) {
    const fallbackKey = `${fallbackFrame.url?.() ?? ""}::${fallbackFrame.name?.() ?? ""}`;
    if (!seen.has(fallbackKey)) {
      try {
        const entry = await readFrameTextEntry(fallbackFrame, timeoutMs);
        if (entry.text.trim()) {
          entries.push(entry);
        }
      } catch {
        // Ignore stale fallback frame handles.
      }
    }
  }

  return entries;
}

function isDetachedFrame(frame) {
  if (!frame) return true;
  if (typeof frame.isDetached !== "function") return false;
  try {
    return frame.isDetached();
  } catch {
    return true;
  }
}

async function resolveContentFactoryReadFrame(page, fallbackFrame, timeoutMs = 5_000) {
  if (!page) {
    if (isDetachedFrame(fallbackFrame)) {
      throw new Error("Content Factory runtime frame is detached");
    }
    return fallbackFrame;
  }
  try {
    const frame = await getContentFactoryRuntimeFrame(page, timeoutMs);
    if (!isDetachedFrame(frame)) {
      return frame;
    }
  } catch {
    // Fall back to the previous handle only if it is still attached.
  }
  if (!isDetachedFrame(fallbackFrame)) {
    return fallbackFrame;
  }
  throw new Error("Content Factory runtime frame is detached");
}

function isFrameDetachedError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /frame is detached|runtime frame is detached|Execution context was destroyed/i.test(message);
}

async function resolveOrRecoverContentFactoryReadFrame(page, fallbackFrame, options, timeoutMs) {
  try {
    return await resolveContentFactoryReadFrame(page, fallbackFrame, timeoutMs);
  } catch (error) {
    if (options.launchMode === "standalone-shell" || !isFrameDetachedError(error)) {
      throw error;
    }
    return recoverContentFactoryRuntimeFrame(page, options, timeoutMs);
  }
}

async function readScopeHtml(scope, timeoutMs = 1_500) {
  if (typeof scope.content !== "function") {
    return "";
  }
  let timeoutId = null;
  const content = scope.content();
  content.catch(() => null);
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("content timeout")), timeoutMs);
  });
  try {
    return await Promise.race([content, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function htmlToReadableText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function evaluateWithTimeout(scope, pageFunction, arg, timeoutMs = 5_000) {
  let timeoutId = null;
  const evaluation = scope.evaluate(pageFunction, arg);
  evaluation.catch(() => null);
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("evaluate timeout")), timeoutMs);
  });
  try {
    return await Promise.race([evaluation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function textMatchesPattern(text, pattern) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function textShowsRuntimeProcess(text, actionConfig) {
  return (
    text.includes("Lime AI 运行现场") ||
    text.includes("正在连接 Lime AI 同事") ||
    text.includes("运行过程已折叠") ||
    text.includes("的 AI 同事") ||
    textMatchesPattern(text, actionConfig.runningPattern)
  );
}

function textShowsMaterializedResult(text) {
  return (
    text.includes("整理完成，结果已更新到当前项目") ||
    text.includes("已完成，结果已更新") ||
    text.includes("已更新可审核结果") ||
    /已(更新|写回)\d+\s*个场景/.test(text) ||
    /已(更新|写回)\d+\s*条/.test(text)
  );
}

function textShowsWaitingForWriteBack(text) {
  return (
    text.includes("等待结果写回") ||
    text.includes("正在等待可更新结果") ||
    text.includes("等结果更新后再刷新项目") ||
    text.includes("等待进度更新")
  );
}

function textHasNumberAtLeast(text, patterns, minimum) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    const value = Number(match?.[1] ?? 0);
    if (Number.isFinite(value) && value >= minimum) {
      return true;
    }
  }
  return false;
}

function textShowsActionMaterializedResult(text, actionName) {
  const normalized = String(text ?? "").replace(/\s+/g, " ");
  if (textShowsWaitingForWriteBack(normalized)) {
    return false;
  }
  if (actionName === "run-scenarios") {
    return (
      textHasNumberAtLeast(
        normalized,
        [
          /场景(?:概览|数量)?\s*(\d+)(?:\s*个)?/,
          /场景\s*(\d+)\s*\/\s*120/,
          /已(?:更新|写回)场景\s*(\d+)\s*条/,
        ],
        120,
      ) ||
      /场景(?:概览|数量)?\s*120(?:\s*个)?/.test(normalized) ||
      /场景\s*120\s*\/\s*120/.test(normalized)
    );
  }
  if (
    actionName === "run-production" ||
    actionName === "run-production-next-round" ||
    actionName === "only-copy"
  ) {
    if (
      /正在整理当前项目内容|运行中|还没有形成\s*(?:20\s*条内容批次|草稿)|整理草稿\s*0\s*\/\s*20|第\d+轮内容\s*0\s*\/\s*20|内容\s*0\s*默认\s*20|内容：\s*0\s*条/.test(
        normalized,
      )
    ) {
      return false;
    }
    const hasDraftBatch =
      /第\d+轮内容\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /整理草稿\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /内容\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /草稿\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /内容批次\s*20\s*条内容已生成/.test(normalized) ||
      /已(?:更新|写回)20\s*条(?:内容|文案|草稿)/.test(normalized);
    const productionReadySignal =
      textShowsMaterializedResult(normalized) ||
      /本轮内容可确认|确认本轮内容|去审核草稿/.test(normalized) ||
      /脚本和图片需求\s*\d+\s*条脚本\s*\/\s*\d+\s*条图片需求/.test(normalized);
    return hasDraftBatch && productionReadySignal;
  }
  if (textShowsMaterializedResult(normalized)) {
    return true;
  }
  if (actionName === "run-scripts") {
    return (
      /脚本和图片需求\s*6\s*条脚本\s*\/\s*(?:5|12)\s*条图片需求/.test(normalized) ||
      /脚本\s*6\s*条/.test(normalized)
    );
  }
  if (actionName === "run-strategy") {
    return /交付物清单|项目交付内容|汇报结构/.test(normalized);
  }
  if (actionName === "run-review") {
    if (/待录入数据|样本量\s*0\s*条|复盘\s*待录入/.test(normalized)) return false;
    const hasMetrics = /样本量\s*(?:2[0-9]{2}|[3-9][0-9]{2,})\s*条/.test(normalized);
    const hasReviewDecision = /复盘判断待确认|确认复盘结论|确认进入下一轮|继续放量|修正方向|暂停投放|下一轮建议/.test(normalized);
    return hasMetrics && hasReviewDecision;
  }
  return false;
}

function findSceneCountRegressions(text, source) {
  const normalized = String(text ?? "").replace(/\s+/g, " ");
  const regressions = [];
  const patterns = [
    /(?:选择场景|场景)\s*(\d+)\s*\/\s*120\s*个?场景?/g,
    /场景概览\s*(\d+)\s*个/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(normalized);
    while (match) {
      const count = Number(match[1]);
      if (Number.isFinite(count) && count < 120) {
        regressions.push({
          source,
          count,
          snippet: sanitizeText(normalized.slice(Math.max(0, match.index - 80), match.index + 120)),
        });
      }
      match = pattern.exec(normalized);
    }
  }
  return regressions;
}

function actionsRequireSceneCountPreservation(actions) {
  return actions.some((actionName) =>
    ["run-scenarios", "run-production", "run-production-next-round", "only-copy"].includes(
      actionName,
    ),
  );
}

function collectSceneCountRegressions(flowResults, finalProbe) {
  const regressions = [];
  for (const result of flowResults) {
    const actionName = result.actionName ?? "unknown-action";
    regressions.push(
      ...findSceneCountRegressions(
        result.pageMaterialization?.bodyPreview ?? "",
        `${actionName}:bodyPreview`,
      ),
    );
    for (const entry of result.pageMaterialization?.frameTextSources ?? []) {
      regressions.push(
        ...findSceneCountRegressions(
          entry.textPreview ?? "",
          `${actionName}:frame:${entry.url ?? entry.name ?? "unknown"}`,
        ),
      );
    }
  }
  regressions.push(
    ...findSceneCountRegressions(finalProbe?.bodyPreview ?? "", "finalProbe"),
  );
  return regressions;
}

async function waitForPageMaterialization(frame, actionName, timeoutMs, diagnostics = {}) {
  const { page, options, ...diagnosticsForError } = diagnostics;
  const startedAt = Date.now();
  let latestState = null;
  let currentFrame = frame;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      currentFrame =
        page && options
          ? await resolveOrRecoverContentFactoryReadFrame(
              page,
              currentFrame,
              options,
              Math.min(timeoutMs, 8_000),
            )
          : await resolveContentFactoryReadFrame(page, currentFrame, 3_000);
      latestState = await readPageMaterializationState(
        currentFrame,
        Math.min(timeoutMs, 8_000),
        actionName,
        page,
      );
    } catch (error) {
      if (!page || !options || !isFrameDetachedError(error)) {
        throw error;
      }
      currentFrame = await recoverContentFactoryRuntimeFrame(
        page,
        options,
        Math.min(timeoutMs, 8_000),
      );
      latestState = await readPageMaterializationState(
        currentFrame,
        Math.min(timeoutMs, 8_000),
        actionName,
        page,
      );
    }
    if (latestState.ready) {
      return { ...latestState, waitedMs: Date.now() - startedAt };
    }
    await sleep(1_000);
  }
  throw new Error(
    `Content Factory ${actionName} runtime completed but page did not materialize workspace patch: ${JSON.stringify(
      sanitizeJson({
        waitedMs: Date.now() - startedAt,
        bodyPreview: latestState?.bodyPreview ?? "",
        frameTextSources: latestState?.frameTextSources ?? [],
        taskId: diagnosticsForError.taskId ?? "",
        sessionId: diagnosticsForError.sessionId ?? "",
        directRecord: diagnosticsForError.directRecord ?? null,
        hostRecord: diagnosticsForError.hostRecord ?? null,
        recoveredFrameUrl:
          typeof currentFrame?.url === "function" ? currentFrame.url() : "",
      }),
    )}`,
  );
}

async function readPageMaterializationState(
  frame,
  timeoutMs = 5_000,
  actionName = "",
  page = null,
) {
  const entries = page
    ? await readAllRuntimeTextEntries(page, frame, Math.min(timeoutMs, 2_500))
    : [await readFrameTextEntry(frame, timeoutMs)];
  const bodyText = entries.map((entry) => entry.text).join("\n");
  const ready = textShowsActionMaterializedResult(bodyText, actionName);
  return {
    ready,
    source: ready ? "content_factory_page" : "not_observed",
    bodyPreview: sanitizeText(bodyText),
    frameTextSources: entries.map((entry) => ({
      url: entry.url,
      name: entry.name,
      textPreview: sanitizeText(entry.text).slice(0, 600),
    })),
  };
}

async function waitForRuntimeProcessVisible(frame, page, actionConfig, timeoutMs) {
  const startedAt = Date.now();
  let latestText = "";
  while (Date.now() - startedAt < timeoutMs) {
    const readFrame = await resolveContentFactoryReadFrame(page, frame, 3_000).catch(
      () => frame,
    );
    const [frameText, pageText] = await Promise.all([
      readBodyText(readFrame),
      readBodyText(page),
    ]);
    latestText = `${frameText}\n${pageText}`;
    if (textShowsRuntimeProcess(latestText, actionConfig)) {
      return latestText;
    }
    await sleep(500);
  }
  throw new Error(
    `Content Factory runtime process UI did not become visible: ${sanitizeText(latestText)}`,
  );
}

async function readRuntimeSurfaceState(page) {
  try {
    return await evaluateWithTimeout(
      page,
      () => ({
        runtimeSurfaceVisible: Boolean(
          document.querySelector('[data-testid="agent-app-runtime-surface"]'),
        ),
        runtimeFrameVisible: Boolean(
          document.querySelector('[data-testid="agent-app-runtime-frame"]'),
        ),
        bodyText: document.body?.innerText ?? "",
        url: window.location.href,
      }),
      null,
      5_000,
    );
  } catch {
    return {
      runtimeSurfaceVisible: false,
      runtimeFrameVisible: false,
      bodyText: "",
      url: "",
    };
  }
}

function resolveInvokeUrl(healthUrl) {
  try {
    const url = new URL(healthUrl);
    url.pathname = "/invoke";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "http://127.0.0.1:3030/invoke";
  }
}

async function readJsonWithTimeout(url, init = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeRuntimeEntryUrl(url, timeoutMs = 30_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bodyLength: text.length,
    hasHtmlShell: /<html|<!doctype html|<div id="?root"?/i.test(text),
  };
}

function sha256Prefixed(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function readTextFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readFrontmatterValue(frontmatter, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
  const raw = frontmatter.match(pattern)?.[1]?.trim() ?? "";
  return raw.replace(/^["']|["']$/g, "");
}

function extractAppFrontmatter(appMarkdown) {
  const match = String(appMarkdown ?? "").match(/^---\s*\n([\s\S]*?)\n---/);
  return match?.[1] ?? "";
}

function readEntryKeysFromYaml(text) {
  return Array.from(text.matchAll(/^\s*-\s+key:\s*([A-Za-z0-9._-]+)\s*$/gm)).map(
    (match) => match[1],
  );
}

function readCurrentContentFactoryCatalogInfo(contentFactoryDir) {
  const appMarkdownPath = path.join(contentFactoryDir, "APP.md");
  const appEntriesPath = path.join(contentFactoryDir, "app.entries.yaml");
  const appMarkdown = readTextFileIfExists(appMarkdownPath);
  const appEntries = readTextFileIfExists(appEntriesPath);
  const frontmatter = extractAppFrontmatter(appMarkdown);
  const appId =
    readFrontmatterValue(frontmatter, "name") ||
    readFrontmatterValue(frontmatter, "appId") ||
    "content-factory-app";
  const version = readFrontmatterValue(frontmatter, "version") || "0.0.0";
  const displayName = readFrontmatterValue(frontmatter, "displayName") || "内容工厂";
  const entryKeys = readEntryKeysFromYaml(appEntries);
  const defaultEntries = entryKeys.length
    ? entryKeys.slice(0, 8)
    : ["dashboard", "scenario_planning", "content_factory"];
  const manifestHash = sha256Prefixed(appMarkdown || `${appId}@${version}`);
  const packageHash = sha256Prefixed(
    [appMarkdown, appEntries, contentFactoryDir].join("\n---package-seed---\n"),
  );

  return {
    appId,
    version,
    displayName,
    defaultEntries,
    packageHash,
    manifestHash,
  };
}

function activeCloudBootstrapPayload(options = DEFAULTS) {
  const appInfo = readCurrentContentFactoryCatalogInfo(options.contentFactoryDir);
  return {
    schemaVersion: "agent-app-cloud-bootstrap/v1",
    tenantId: "content-factory-flow",
    generatedAt: new Date().toISOString(),
    apps: [
      {
        appId: appInfo.appId,
        displayName: appInfo.displayName,
        version: appInfo.version,
        releaseId: `smoke-${appInfo.appId}-${appInfo.version}`,
        channel: "smoke",
        licenseState: "active",
        registrationRequired: true,
        registrationState: "active",
        enabled: true,
        packageUrl: `https://lime.local/agent-apps/${appInfo.appId}/releases/${appInfo.version}/package.zip`,
        packageHash: appInfo.packageHash,
        manifestHash: appInfo.manifestHash,
        capabilityRequirements: {},
        defaultEntries: appInfo.defaultEntries,
        policyDefaults: {},
        toolAvailability: [],
      },
    ],
  };
}

async function activateBootstrapCatalog(page, bootstrap) {
  await page.evaluate((payload) => {
    window.__LIME_AGENT_APP_E2E_BOOTSTRAP_CATALOG__ = payload;
    if (!window.__LIME_AGENT_APP_E2E_FETCH_PATCHED__ && typeof window.fetch === "function") {
      const originalFetch = window.fetch.bind(window);
      window.__LIME_AGENT_APP_E2E_FETCH_PATCHED__ = true;
      window.fetch = async (input, init) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input?.url;
        const requestMethod = String(
          init?.method || (input instanceof Request ? input.method : "") || "GET",
        ).toUpperCase();
        try {
          const url = new URL(String(requestUrl));
          if (
            requestMethod === "GET" &&
            /\/api\/v1\/public\/tenants\/[^/]+\/client\/agent-apps$/.test(url.pathname)
          ) {
            return new Response(
              JSON.stringify({
                code: 200,
                message: "success",
                data: window.__LIME_AGENT_APP_E2E_BOOTSTRAP_CATALOG__,
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }
        } catch {
          // Keep non-URL requests on the app's original fetch path.
        }
        return originalFetch(input, init);
      };
    }
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: payload.tenantId,
    };
    window.__LIME_SESSION_TOKEN__ = "smoke-agent-apps-token";
    window.__LIME_BOOTSTRAP__ = { data: { agentAppCatalog: payload } };
  }, bootstrap);
  await page.click('[data-testid="agent-apps-refresh"]');
}

async function installLocalContentFactory(page, options) {
  logStage("install-local-app");
  const installResult = await evaluateWithDevBridgeRetry(
    page,
    async ({ appDir }) => {
      const api = await import("/src/lib/api/agentApps.ts");
      const profileModule = await import(
        "/src/features/agent-app/runtime/workflowRuntimeCapabilityProfile.ts"
      );
      const profile = profileModule.buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      });
      const review = await api.reviewLocalAgentAppPackage({ appDir, profile });
      const state = await api.saveInstalledAgentAppState({ state: review.state });
      window.dispatchEvent(new CustomEvent(api.AGENT_APPS_CHANGED_EVENT));
      return {
        appId: state.appId,
        sourceKind: state.identity?.sourceKind,
        sourceUri: state.identity?.sourceUri,
        appVersion: state.identity?.appVersion,
        packageHash: state.identity?.packageHash,
        manifestHash: state.identity?.manifestHash,
      };
    },
    { appDir: options.contentFactoryDir },
    options,
    "install-local-app",
  );
  console.log(
    `[content-factory-flow] localPackage=${installResult.appId}@${installResult.appVersion} source=${installResult.sourceKind}:${installResult.sourceUri}`,
  );
  await page.click('[data-testid="agent-apps-refresh"]');
  await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
    timeout: options.timeoutMs,
  });
  return installResult;
}

async function installCloudContentFactory(page, options) {
  logStage("install-cloud-app");
  await page.waitForFunction(
    () => {
      const button = document.querySelector(
        '[data-testid="agent-apps-install-cloud-content-factory-app"]',
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: options.timeoutMs },
  );
  await page.click('[data-testid="agent-apps-install-cloud-content-factory-app"]', {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="agent-apps-install-review"]', {
    timeout: options.timeoutMs,
  });
  await page.click('[data-testid="agent-apps-install-review-confirm"]');
  await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
    timeout: options.timeoutMs,
  });
}

async function clickInstalledContentFactoryCard(page, timeoutMs) {
  const markerSelector = '[data-testid="agent-apps-installed-content-factory-app"]';
  const detailSelector = '[data-testid="agent-apps-open-detail-content-factory-app"]';
  await page.waitForSelector(markerSelector, { timeout: timeoutMs });
  await page.waitForSelector(detailSelector, { timeout: timeoutMs });
  await page.click(detailSelector, { timeout: timeoutMs });
  await page.waitForSelector('[data-testid="agent-apps-detail"]', {
    timeout: timeoutMs,
  });
}

async function launchStandaloneContentFactoryShell(page) {
  return page.evaluate(async () => {
    const api = await import("/src/lib/api/agentApps.ts");
    const profileModule = await import(
      "/src/features/agent-app/runtime/workflowRuntimeCapabilityProfile.ts"
    );
    const runtimeProfileModule = await import(
      "/src/features/agent-app/runtime-profile/index.ts"
    );
    const shellModule = await import("/src/features/agent-app/shell/index.ts");

    const list = await api.listInstalledAgentApps();
    const installedState = list.states.find(
      (item) => item.appId === "content-factory-app",
    );
    if (!installedState) {
      throw new Error("Content Factory must be installed before standalone shell launch");
    }

    const hostProfile = profileModule.buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    });
    const state = structuredClone(installedState);
    const modeReadiness = state.readiness?.installModes?.find(
      (item) => item.mode === "standalone",
    );
    state.installMode = "standalone";
    state.runtimeProfileSummary = {
      installMode: "standalone",
      shellKind: "app_shell",
      runtimeVersion: modeReadiness?.runtimeVersion,
      runtimeMinVersion: state.manifest?.install?.runtime?.minVersion,
      checkedAt: state.readiness?.checkedAt ?? new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    await api.saveInstalledAgentAppState({ state });

    const runtimeProfile =
      runtimeProfileModule.buildLimeRuntimeProfileForInstalledState({
        state,
        hostProfile,
      });
    const entry =
      state.projection.entries.find((item) => item.key === "dashboard") ??
      state.projection.entries.find((item) =>
        ["page", "panel", "settings"].includes(item.kind),
      ) ??
      state.projection.entries[0];
    if (!entry) {
      throw new Error("Content Factory has no launchable standalone entry");
    }

    const preview = {
      identity: state.identity,
      manifest: state.manifest,
      projection: state.projection,
      readiness: state.readiness,
      cleanupPlan: { generatedAt: state.updatedAt },
    };
    const shellLaunch =
      shellModule.resolveShellLaunchDescriptorForInstalledEntry({
        state,
        preview,
        runtimeProfile,
        entry,
      });
    if (shellLaunch.status !== "ready") {
      throw new Error(`Shell launch not ready: ${shellLaunch.reason}`);
    }

    const result = await api.launchAgentAppShell({
      descriptor: shellLaunch.descriptor,
    });
    return {
      appId: state.appId,
      installMode: state.installMode,
      runtimeProfileSummary: state.runtimeProfileSummary,
      descriptor: {
        appId: shellLaunch.descriptor.appId,
        installMode: shellLaunch.descriptor.installMode,
        shellKind: shellLaunch.descriptor.runtimeProfile.shellKind,
        entry: shellLaunch.descriptor.entry,
        isolation: shellLaunch.descriptor.isolation,
        packageHash: shellLaunch.descriptor.packageHash,
        manifestHash: shellLaunch.descriptor.manifestHash,
      },
      result,
    };
  });
}

async function launchSmokeContext(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
    });
  } catch (error) {
    console.warn(
      `[content-factory-flow] Chrome channel 启动失败，改用 Playwright Chromium: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chromium.launchPersistentContext(userDataDir, { headless: true });
  }
}

function isBenignContentFactoryConsoleError(messageText, locationUrl) {
  if (!/Failed to load resource/i.test(messageText)) return false;
  if (!/the server responded with a status of 404/i.test(messageText)) return false;
  try {
    const url = new URL(locationUrl);
    return url.pathname === "/api/bootstrap" && url.searchParams.has("project_id");
  } catch {
    return false;
  }
}

function attachPageTelemetry(page, consoleErrors, failedRequests, pageLabel) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location?.() ?? {};
      if (isBenignContentFactoryConsoleError(message.text(), location.url)) {
        return;
      }
      const locationSuffix = location.url
        ? ` @ ${location.url}:${location.lineNumber ?? 0}`
        : "";
      consoleErrors.push(`[${pageLabel}] ${message.text()}${locationSuffix}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push({
        pageLabel,
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      pageLabel,
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[content-factory-flow] DevBridge ready in ${
          Date.now() - startedAt
        }ms status=${payload?.status ?? "unknown"}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }
  throw new Error(
    `DevBridge not ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function isTransientDevBridgeError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /DevBridge|后端桥接|Failed to fetch|timeout after|ERR_CONNECTION_REFUSED|ERR_ABORTED/i.test(
    message,
  );
}

function isTransientDirectRuntimeRecord(record) {
  if (!record || record.ok !== false) {
    return false;
  }
  return /fetch failed|Failed to fetch|ECONNREFUSED|ECONNRESET|AbortError|timeout/i.test(
    String(record.error ?? ""),
  );
}

async function evaluateWithDevBridgeRetry(page, pageFunction, arg, options, label) {
  const startedAt = Date.now();
  const retryBudgetMs = Math.min(options.timeoutMs, 300_000);
  let lastError = null;
  let attempt = 0;
  while (Date.now() - startedAt < retryBudgetMs) {
    attempt += 1;
    try {
      return await page.evaluate(pageFunction, arg);
    } catch (error) {
      if (!isTransientDevBridgeError(error)) {
        throw error;
      }
      lastError = error;
      console.warn(
        `[content-factory-flow] ${label} DevBridge transient failure, retry=${attempt}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await waitForHealth({
        ...options,
        timeoutMs: Math.min(options.timeoutMs, 120_000),
      }).catch(() => null);
      await sleep(Math.max(options.intervalMs, 1_000));
    }
  }
  throw lastError ?? new Error(`${label} failed because DevBridge was unavailable`);
}

async function openAccountMenuForAgentApps(page, timeoutMs) {
  if ((await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0) {
    return;
  }
  await page.click(ACCOUNT_MENU_BUTTON_SELECTOR);
  await page.waitForSelector(AGENT_APPS_NAV_SELECTOR, { timeout: timeoutMs });
}

async function clickAgentAppsNav(page, timeoutMs) {
  await openAccountMenuForAgentApps(page, timeoutMs);
  await page.locator(AGENT_APPS_NAV_SELECTOR).first().click();
}

async function bootstrapAndLaunchContentFactory(page, options, bootstrap, telemetry) {
  logStage("open-lime");
  await page.goto(options.appUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
    timeout: options.timeoutMs,
  });
  await openAccountMenuForAgentApps(page, options.timeoutMs);
  assert(
    (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
    "Agent Apps nav should be visible",
  );
  assert(
    (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
    "Agent App Lab nav should stay hidden in formal flow",
  );

  logStage("open-agent-apps");
  await clickAgentAppsNav(page, options.timeoutMs);
  await page.waitForSelector('[data-testid="agent-apps-page"]', {
    timeout: options.timeoutMs,
  });

  logStage("activate-cloud-catalog");
  await activateBootstrapCatalog(page, bootstrap);
  if (options.installSource === "local") {
    await installLocalContentFactory(page, options);
  } else {
    await installCloudContentFactory(page, options);
  }

  if (options.launchMode === "standalone-shell") {
    logStage("launch-standalone-shell");
    const standaloneLaunch = await launchStandaloneContentFactoryShell(page);
    assert(
      standaloneLaunch.result.status === "launched",
      "standalone shell launch should be launched",
    );
    assert(
      standaloneLaunch.result.devShell === true,
      "standalone shell launch should use dev shell adapter",
    );
    assert(
      standaloneLaunch.result.shellWindow?.url,
      "standalone shell launch should return shellWindow.url",
    );
    assert(
      standaloneLaunch.descriptor.isolation.packageMount === "read-only" &&
        standaloneLaunch.descriptor.isolation.secrets === "refs-only" &&
        standaloneLaunch.descriptor.isolation.sideEffects === "runtime-broker" &&
        standaloneLaunch.descriptor.isolation.evidence === "runtime-provenance",
      "standalone shell descriptor isolation policy should stay strict",
    );

    const runtimeEntryProbe = await probeRuntimeEntryUrl(
      standaloneLaunch.result.shellWindow.url,
      Math.min(options.timeoutMs, 30_000),
    );
    assert(
      runtimeEntryProbe.ok && runtimeEntryProbe.hasHtmlShell,
      `standalone runtime entry should return an HTML shell: ${JSON.stringify(
        runtimeEntryProbe,
      )}`,
    );

    const runtimePage = await page.context().newPage();
    if (telemetry) {
      attachPageTelemetry(
        runtimePage,
        telemetry.consoleErrors,
        telemetry.failedRequests,
        "standalone-business-host",
      );
    }
    await runtimePage.addInitScript(({ appId, entryKey }) => {
      window.sessionStorage.setItem(
        "lime.appNavigation.restore.v1",
        JSON.stringify({
          page: "agent-app",
          params: {
            appId,
            entryKey,
            launchRequestKey: Date.now(),
          },
        }),
      );
    }, {
      appId: standaloneLaunch.appId,
      entryKey: standaloneLaunch.descriptor.entry.entryKey,
    });
    await runtimePage.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await runtimePage.waitForSelector('[data-testid="agent-app-runtime-surface"]', {
      timeout: options.timeoutMs,
    });
    await runtimePage.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
      timeout: options.timeoutMs,
    });
    return {
      frame: await getContentFactoryRuntimeFrame(runtimePage, options.timeoutMs),
      page: runtimePage,
      standaloneLaunch: {
        ...standaloneLaunch,
        runtimeEntryProbe,
        businessHost: {
          kind: "agent-app-runtime-page",
          appUrl: options.appUrl,
          entryKey: standaloneLaunch.descriptor.entry.entryKey,
        },
      },
    };
  }

  logStage("launch-runtime-surface");
  await clickInstalledContentFactoryCard(page, options.timeoutMs);
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
        ?.hasAttribute("disabled"),
    undefined,
    { timeout: options.timeoutMs },
  );
  await page.click('[data-testid="agent-apps-launch-entry-dashboard"]');
  await page.waitForSelector('[data-testid="agent-app-runtime-surface"]', {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
    timeout: options.timeoutMs,
  });
  return {
    frame: await getContentFactoryRuntimeFrame(page, options.timeoutMs),
    page,
    standaloneLaunch: null,
  };
}

async function recoverContentFactoryRuntimeFrame(page, options, timeoutMs) {
  logStage("recover-runtime-surface");
  const launchContext = await bootstrapAndLaunchContentFactory(
    page,
    { ...options, timeoutMs: Math.min(options.timeoutMs, timeoutMs) },
    activeCloudBootstrapPayload(options),
  );
  return launchContext.frame;
}

async function getContentFactoryRuntimeFrame(page, timeoutMs) {
  const frameHandle = await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
    timeout: Math.min(timeoutMs, 45_000),
  });
  const frame = await frameHandle.contentFrame();
  assert(frame, "Content Factory runtime frame should be attached");
  return frame;
}

async function clearContentFactoryResumeState(frame, timeoutMs = 5_000) {
  await evaluateWithTimeout(
    frame,
    ({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId }) => {
      window.sessionStorage?.removeItem(hostTaskStorageKey);
      window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
      return true;
    },
    {
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
      hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
      sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
    },
    timeoutMs,
  ).catch(() => null);
}

async function forceOpenContentFactoryProjectRoute(
  frame,
  routePath = "/dashboard",
  timeoutMs = 20_000,
) {
  const targetUrl = new URL(frame.url());
  targetUrl.pathname = routePath;
  targetUrl.search = `project_id=${encodeURIComponent(CONTENT_FACTORY_SAMPLE_PROJECT_ID)}`;
  await frame.goto(targetUrl.toString(), {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  }).catch(async () => {
    await evaluateWithTimeout(
      frame,
      ({ href }) => {
        window.location.assign(href);
        return true;
      },
      { href: targetUrl.toString() },
      timeoutMs,
    );
  });
}

async function readContentFactoryActiveProjectDiagnostics(frame, timeoutMs = 5_000) {
  return evaluateWithTimeout(
    frame,
    ({ activeProjectStorageKey, hostTaskStorageKey }) => {
      const text = (selector) =>
        document.querySelector(selector)?.textContent?.trim() || "";
      const activeCard = document.querySelector(".project-card.active");
      const activeCardButton = activeCard?.querySelector("[data-open-project]");
      const url = new URL(window.location.href);
      let hostTaskResume = null;
      const hostTaskRaw = window.sessionStorage?.getItem(hostTaskStorageKey) || "";
      if (hostTaskRaw) {
        try {
          const parsed = JSON.parse(hostTaskRaw);
          hostTaskResume = {
            projectId: parsed?.projectId || "",
            taskId: parsed?.taskId || "",
            sessionId: parsed?.sessionId || "",
            label: parsed?.label || "",
          };
        } catch {
          hostTaskResume = { raw: hostTaskRaw.slice(0, 200) };
        }
      }
      return {
        href: window.location.href,
        pathname: window.location.pathname,
        urlProjectId: url.searchParams.get("project_id") || "",
        storageProjectId:
          window.sessionStorage?.getItem(activeProjectStorageKey)?.trim() || "",
        overviewHeading: text(".project-room-main h3"),
        spineHeading: text(".project-spine-main h2"),
        activeCardProjectId: activeCardButton?.getAttribute("data-open-project") || "",
        activeCardHeading: activeCard?.querySelector("h3")?.textContent?.trim() || "",
        hostTaskResume,
      };
    },
    {
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
      hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    },
    timeoutMs,
  ).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
}

function contentFactoryDiagnosticsShowSampleActive(diagnostics) {
  if (!isObjectRecord(diagnostics)) return false;
  const activeHeading =
    diagnostics.overviewHeading ||
    diagnostics.spineHeading ||
    diagnostics.activeCardHeading ||
    "";
  return (
    activeHeading === CONTENT_FACTORY_SAMPLE_PROJECT_NAME &&
    diagnostics.storageProjectId === CONTENT_FACTORY_SAMPLE_PROJECT_ID &&
    !diagnostics.hostTaskResume
  );
}

async function waitForContentFactorySampleProjectActive(frame, timeoutMs, contextLabel) {
  await frame.waitForFunction(
    ({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId, sampleProjectName }) => {
      const heading =
        document.querySelector(".project-room-main h3")?.textContent?.trim() ||
        document.querySelector(".project-spine-main h2")?.textContent?.trim() ||
        document.querySelector(".project-card.active h3")?.textContent?.trim() ||
        "";
      const activeProjectId =
        window.sessionStorage?.getItem(activeProjectStorageKey)?.trim() || "";
      const hostTaskResume = window.sessionStorage?.getItem(hostTaskStorageKey) || "";
      return (
        heading === sampleProjectName &&
        activeProjectId === sampleProjectId &&
        !hostTaskResume
      );
    },
    {
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
      hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
      sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
      sampleProjectName: CONTENT_FACTORY_SAMPLE_PROJECT_NAME,
    },
    { timeout: timeoutMs },
  ).catch(async () => {
    const diagnostics = await readContentFactoryActiveProjectDiagnostics(frame, 3_000);
    throw new Error(
      `Content Factory sample project was not active (${contextLabel}): ${JSON.stringify(
        sanitizeJson(diagnostics),
      )}`,
    );
  });
}

async function seedContentFactorySampleWorkspace(frame, timeoutMs) {
  logStage("seed-sample-workspace");
  await frame.evaluate(async ({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem(hostTaskStorageKey);
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
    const response = await fetch("/api/sample/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`load sample failed: ${response.status}`);
    }
    window.location.href = `/dashboard?project_id=${encodeURIComponent(sampleProjectId)}`;
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  await frame.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await waitForContentFactorySampleProjectActive(frame, timeoutMs, "after sample reload");
  await frame.locator(pageButtonSelector("projects")).first().click({ timeout: timeoutMs });
  await frame.evaluate(({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem(hostTaskStorageKey);
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  const sampleProjectButton = frame
    .locator(`button[data-open-project="${CONTENT_FACTORY_SAMPLE_PROJECT_ID}"]`)
    .first();
  await sampleProjectButton.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await sampleProjectButton.click({ timeout: timeoutMs });
  await frame.locator(".project-room-main h3", { hasText: CONTENT_FACTORY_SAMPLE_PROJECT_NAME }).waitFor({
    timeout: timeoutMs,
  });
  await frame.evaluate(({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem(hostTaskStorageKey);
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  await waitForContentFactorySampleProjectActive(frame, timeoutMs, "after project card open");
}

function hasModelPreferenceOverride(options) {
  return Boolean(options.modelProvider || options.modelName);
}

function resolveModelPreferenceLabel(options) {
  return (
    options.modelLabel ||
    [options.modelProvider, options.modelName].filter(Boolean).join(" / ")
  );
}

async function applyContentFactoryModelPreference(frame, options, timeoutMs) {
  if (!hasModelPreferenceOverride(options)) return;
  logStage("apply-model-preference");
  const modelRouting = {
    providerPreference: options.modelProvider,
    modelPreference: options.modelName,
    label: resolveModelPreferenceLabel(options),
  };
  const saved = await frame.evaluate(async (payload) => {
    const settingsResponse = await fetch("/api/settings");
    const settingsPayload = await settingsResponse.json();
    if (!settingsResponse.ok) {
      throw new Error(
        `read settings failed: ${settingsResponse.status} ${
          settingsPayload?.data?.error || settingsPayload?.msg || ""
        }`,
      );
    }
    const currentSettings = settingsPayload?.data || {};
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...currentSettings,
        modelRouting: payload.modelRouting,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        `save settings failed: ${response.status} ${
          result?.data?.error || result?.msg || ""
        }`,
      );
    }
    window.location.href = `/dashboard?project_id=${encodeURIComponent(payload.sampleProjectId)}`;
    return result?.data?.settings?.modelRouting || null;
  }, {
    modelRouting,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  console.log(
    `[content-factory-flow] modelPreference=${JSON.stringify(sanitizeJson(saved || modelRouting))}`,
  );
  await frame.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await waitForContentFactorySampleProjectActive(frame, timeoutMs, "after model preference apply");
}

async function ensureContentFactorySampleProjectActive(frame, timeoutMs) {
  await clearContentFactoryResumeState(frame, 3_000);
  const diagnostics = await readContentFactoryActiveProjectDiagnostics(frame, 3_000);
  if (contentFactoryDiagnosticsShowSampleActive(diagnostics)) {
    return;
  }
  await frame.evaluate(({ activeProjectStorageKey, hostTaskStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem(hostTaskStorageKey);
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
    window.location.assign(`/dashboard?project_id=${encodeURIComponent(sampleProjectId)}`);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  const navigatedToSample = await waitForContentFactorySampleProjectActive(
    frame,
    Math.min(timeoutMs, 20_000),
    "after direct project navigation",
  ).then(() => true, () => false);
  if (navigatedToSample) {
    return;
  }

  await forceOpenContentFactoryProjectRoute(frame, "/dashboard", Math.min(timeoutMs, 20_000));
  const forceNavigatedToSample = await waitForContentFactorySampleProjectActive(
    frame,
    Math.min(timeoutMs, 20_000),
    "after forced project navigation",
  ).then(() => true, () => false);
  if (forceNavigatedToSample) {
    return;
  }

  await clearContentFactoryResumeState(frame, 3_000);
  const projectsNavigation = frame.locator(pageButtonSelector("projects")).first();
  const projectsNavigationVisible = await projectsNavigation
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  if (!projectsNavigationVisible) {
    const diagnostics = await readContentFactoryActiveProjectDiagnostics(frame, 3_000);
    throw new Error(
      `Content Factory projects navigation was not visible after recovery: ${JSON.stringify(
        sanitizeJson(diagnostics),
      )}`,
    );
  }
  await frame.locator(pageButtonSelector("projects")).first().click({ timeout: timeoutMs });
  const sampleProjectButton = frame
    .locator(`button[data-open-project="${CONTENT_FACTORY_SAMPLE_PROJECT_ID}"]`)
    .first();
  await sampleProjectButton.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await sampleProjectButton.click({ timeout: timeoutMs });
  await frame.locator(".project-room-main h3, .project-spine h2", {
    hasText: CONTENT_FACTORY_SAMPLE_PROJECT_NAME,
  }).waitFor({ timeout: timeoutMs });
  await clearContentFactoryResumeState(frame, 3_000);
  await waitForContentFactorySampleProjectActive(frame, timeoutMs, "after project list open");
}

async function clickVisibleButtonIfPresent(locator, timeoutMs = 5_000) {
  if ((await locator.count().catch(() => 0)) < 1) return false;
  const button = locator.first();
  if (!(await button.isVisible({ timeout: timeoutMs }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click({ timeout: timeoutMs });
  return true;
}

async function clickCampaignStep(frame, campaignStep, timeoutMs) {
  const startedAt = Date.now();
  let latestError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = Math.max(1_000, timeoutMs - (Date.now() - startedAt));
    const stepButton = frame
      .locator(`button[data-campaign-step="${campaignStep}"]`)
      .first();
    try {
      await stepButton.waitFor({
        state: "visible",
        timeout: Math.min(remainingMs, 5_000),
      });
      await stepButton.click({ timeout: Math.min(remainingMs, 10_000) });
      return;
    } catch (error) {
      latestError = error;
      await sleep(500);
    }
  }
  throw latestError ?? new Error(`Content Factory campaign step ${campaignStep} was not clickable`);
}

async function actionButtonIsStartable(frame, actionConfig, timeoutMs = 2_000) {
  const button = frame
    .locator(`button[data-action="${actionConfig.action}"]`)
    .first();
  if ((await button.count().catch(() => 0)) < 1) return false;
  if (!(await button.isVisible({ timeout: timeoutMs }).catch(() => false))) return false;
  return !(await button.isDisabled().catch(() => false));
}

function textLooksLikeCompletedContentRound(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ");
  return (
    /准备交付|复盘出口|下一轮建议/.test(normalized) ||
    /(?:内容|草稿)\s*20\s*\/\s*20\s*条/.test(normalized) ||
    /(?:内容|文案|草稿)[^\d]{0,12}20\s*条/.test(normalized)
  );
}

async function prepareNextRoundForCompletedDefaultProduction(
  frame,
  actionConfig,
  actionName,
  timeoutMs,
) {
  if (actionName !== "run-production") return false;
  if (await actionButtonIsStartable(frame, actionConfig)) return false;

  const bodyText = await readBodyText(frame, 3_000);
  if (!textLooksLikeCompletedContentRound(bodyText)) return false;

  logStage("action:run-production:auto-next-round");
  await prepareContentFactoryNextRound(frame, timeoutMs);
  await waitForActionPageReady(frame, CONTENT_FACTORY_ACTIONS["run-production"], timeoutMs);
  return true;
}

async function createNextRoundViaContentFactoryApi(frame, timeoutMs) {
  const result = await evaluateWithTimeout(
    frame,
    async ({ projectId, activeProjectStorageKey }) => {
      const readJson = async (url, init = {}) => {
        const response = await fetch(url, init);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.code >= 400) {
          throw new Error(payload?.data?.error || payload?.msg || `request failed: ${url}`);
        }
        return payload?.data ?? payload;
      };
      const snapshot = await readJson(
        `/api/project/get?project_id=${encodeURIComponent(projectId)}`,
      );
      const activeRound = snapshot.activeRound || snapshot.currentRound || {};
      const project = snapshot.project || {};
      const reviewReport = snapshot.reviewReport || {};
      const produce = {
        goal:
          activeRound.goal ||
          project.industry ||
          "下一轮内容目标",
        category: activeRound.category || project.industry || "",
        platform: activeRound.platform || project.platforms?.[0] || "抖音",
        persona: activeRound.persona || "",
        keyword: activeRound.keyword || project.industry || "",
        count: Number(activeRound.count || 20),
      };
      const created = await readJson("/api/round/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          source_review_id: reviewReport.id || activeRound.reviewReportId || "",
          produce,
        }),
      });
      window.sessionStorage?.setItem(activeProjectStorageKey, projectId);
      window.location.assign("/campaigns");
      return {
        roundId: created.round?.id || "",
        roundIndex: created.round?.roundIndex || null,
        status: created.project?.status || "",
      };
    },
    {
      projectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    },
    timeoutMs,
  );
  await frame.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => null);
  await waitForContentFactoryPageRoute(frame, "produce", timeoutMs);
  return result;
}

async function prepareContentFactoryNextRound(frame, timeoutMs) {
  logStage("prepare-next-round");
  const boundedTimeoutMs = Math.min(timeoutMs, 60_000);
  await clickContentFactoryPage(frame, "review", boundedTimeoutMs);
  await frame.getByText(/复盘决策室|复盘出口|下一轮建议/).first().waitFor({
    timeout: boundedTimeoutMs,
  });

  const confirmedDelivery = await clickVisibleButtonIfPresent(
    frame.locator('button[data-confirm-step="delivery_pack"]'),
    boundedTimeoutMs,
  );
  if (confirmedDelivery) {
    await frame.getByText(/交付已确认|确认复盘结论|创建下一轮目标/).first().waitFor({
      timeout: boundedTimeoutMs,
    });
  }

  const confirmedReview = await clickVisibleButtonIfPresent(
    frame.locator('button[data-confirm-step="review_report"]'),
    boundedTimeoutMs,
  );
  if (confirmedReview) {
    await frame.getByText(/已确认|创建下一轮目标/).first().waitFor({
      timeout: boundedTimeoutMs,
    });
  }

  const createdNextRound = await clickVisibleButtonIfPresent(
    frame.locator('button[data-action="start-next-round"]'),
    boundedTimeoutMs,
  );
  let nextRoundReady = false;
  if (createdNextRound) {
    nextRoundReady = await frame.waitForFunction(
      () => {
        const text = document.body?.innerText ?? "";
        return (
          window.location.pathname.includes("campaigns") &&
          /已创建独立下一轮草案|确认本轮目标|生成下一轮草稿|0\s*\/\s*20\s*条/.test(
            text,
          )
        );
      },
      undefined,
      { timeout: boundedTimeoutMs },
    ).then(() => true, () => false);
  }
  if (!nextRoundReady) {
    logStage("prepare-next-round:fallback-api");
    await createNextRoundViaContentFactoryApi(frame, boundedTimeoutMs);
  }
  await frame.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      return (
        !/正在打开工作台/.test(text) &&
        /已创建独立下一轮草案|确认本轮目标|生成下一轮草稿|0\s*\/\s*20\s*条/.test(text)
      );
    },
    undefined,
    { timeout: boundedTimeoutMs },
  ).catch(() => null);
  const bodyAfterCreateAttempt = await readBodyText(frame, 3_000);
  assert(
    /已创建独立下一轮草案|确认本轮目标|生成下一轮草稿|0\s*\/\s*20\s*条/.test(
      bodyAfterCreateAttempt,
    ),
    `Content Factory next round action should be available before next-round production: ${sanitizeText(
      bodyAfterCreateAttempt,
    )}`,
  );
  await clickContentFactoryPage(frame, "produce", boundedTimeoutMs);
  await frame.waitForFunction(
    () =>
      window.location.pathname.includes("campaigns") ||
      Boolean(document.querySelector('button[data-action="confirm-round-goal"]')) ||
      /第2轮目标|本轮目标/.test(document.body?.innerText ?? ""),
    undefined,
    { timeout: boundedTimeoutMs },
  );
  await frame.getByText(/来自复盘|第2轮目标|本轮目标/).first().waitFor({
    timeout: boundedTimeoutMs,
  });

  const confirmedRoundGoal = await clickVisibleButtonIfPresent(
    frame.locator('button[data-action="confirm-round-goal"]'),
    boundedTimeoutMs,
  );
  assert(
    confirmedRoundGoal || (await frame.getByText(/目标已确认|本轮目标已确认/).first().isVisible().catch(() => false)),
    `Content Factory next round goal should be confirmable before production: ${sanitizeText(
      await readBodyText(frame, 3_000),
    )}`,
  );
  if (confirmedRoundGoal) {
    await frame.getByText(/本轮目标已确认|目标已确认/).first().waitFor({
      timeout: boundedTimeoutMs,
    });
  }
  await frame.getByText(/0\s*\/\s*20\s*条草稿|整理草稿|生成下一轮草稿/).first().waitFor({
    timeout: boundedTimeoutMs,
  });
}

async function markFrameProbe(frame) {
  return frame.evaluate(() => {
    const globalKey = "__limeContentFactoryFlowProbe";
    if (!window[globalKey]) {
      window[globalKey] = {
        id:
          typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `probe-${Date.now()}-${Math.random()}`,
        createdAt: new Date().toISOString(),
      };
    }
    return {
      ...window[globalKey],
      url: window.location.href,
      title: document.title,
      bodyPreview: String(document.body?.innerText ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2_000),
    };
  });
}

async function readSdkCallLogLength(frame) {
  try {
    return await frame.evaluate(() => {
      const callLog = window.limeAgentAppBridge?.getSdkCallLog?.();
      return Array.isArray(callLog) ? callLog.length : 0;
    });
  } catch {
    return 0;
  }
}

async function readSdkCallLogSummary(frame, startIndex = 0) {
  try {
    return await frame.evaluate((start) => {
      const findTaskId = (value, depth = 0) => {
        if (depth > 8 || value == null) return "";
        if (typeof value === "string") {
          return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const taskId = findTaskId(item, depth + 1);
            if (taskId) return taskId;
          }
          return "";
        }
        if (typeof value === "object") {
          if (typeof value.taskId === "string" && value.taskId.trim()) return value.taskId.trim();
          if (typeof value.task_id === "string" && value.task_id.trim()) return value.task_id.trim();
          for (const item of Object.values(value)) {
            const taskId = findTaskId(item, depth + 1);
            if (taskId) return taskId;
          }
        }
        return "";
      };
      const findSessionId = (value, depth = 0) => {
        if (depth > 8 || value == null) return "";
        if (typeof value === "string") {
          return value.match(/agent-app-runtime-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const sessionId = findSessionId(item, depth + 1);
            if (sessionId) return sessionId;
          }
          return "";
        }
        if (typeof value === "object") {
          for (const key of ["sessionId", "session_id", "threadId", "thread_id"]) {
            const item = value[key];
            if (typeof item === "string") {
              const sessionId = findSessionId(item, depth + 1);
              if (sessionId) return sessionId;
            }
          }
          for (const item of Object.values(value)) {
            const sessionId = findSessionId(item, depth + 1);
            if (sessionId) return sessionId;
          }
        }
        return "";
      };
      const callLog = window.limeAgentAppBridge?.getSdkCallLog?.();
      const calls = Array.isArray(callLog) ? callLog : [];
      return {
        length: calls.length,
        calls: calls.slice(start).slice(-20).map((call, index) => ({
          index: start + index,
          capability: call?.capability ?? "unknown",
          method: call?.method ?? "unknown",
          taskId: findTaskId(call),
          sessionId: findSessionId(call),
          hasResult: Boolean(call?.result || call?.value || call?.response),
          hasError: Boolean(call?.error),
        })),
      };
    }, startIndex);
  } catch {
    return { length: 0, calls: [] };
  }
}

function findTaskId(value, depth = 0) {
  if (depth > 8 || value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const taskId = findTaskId(item, depth + 1);
      if (taskId) {
        return taskId;
      }
    }
    return "";
  }
  if (isObjectRecord(value)) {
    if (typeof value.taskId === "string" && value.taskId.trim()) {
      return value.taskId.trim();
    }
    if (typeof value.task_id === "string" && value.task_id.trim()) {
      return value.task_id.trim();
    }
    for (const item of Object.values(value)) {
      const taskId = findTaskId(item, depth + 1);
      if (taskId) {
        return taskId;
      }
    }
  }
  return "";
}

function findSessionId(value, depth = 0) {
  if (depth > 8 || value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.match(/agent-app-runtime-[a-z0-9-]+/i)?.[0] ?? "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const sessionId = findSessionId(item, depth + 1);
      if (sessionId) {
        return sessionId;
      }
    }
    return "";
  }
  if (isObjectRecord(value)) {
    for (const key of ["sessionId", "session_id", "threadId", "thread_id"]) {
      const valueForKey = value[key];
      if (typeof valueForKey === "string") {
        const sessionId = findSessionId(valueForKey, depth + 1);
        if (sessionId) {
          return sessionId;
        }
      }
    }
    for (const item of Object.values(value)) {
      const sessionId = findSessionId(item, depth + 1);
      if (sessionId) {
        return sessionId;
      }
    }
  }
  return "";
}

function findValueByKeys(value, keys, depth = 8) {
  if (depth < 0 || value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKeys(item, keys, depth - 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return undefined;
  }
  if (!isObjectRecord(value)) {
    return undefined;
  }
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
      return value[key];
    }
  }
  for (const item of Object.values(value)) {
    const found = findValueByKeys(item, keys, depth - 1);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }
  return undefined;
}

function findObjectByKeys(value, keys, depth = 8) {
  const found = findValueByKeys(value, keys, depth);
  return isObjectRecord(found) ? found : null;
}

function valueContainsPattern(value, pattern, depth = 0) {
  if (depth > 8 || value == null) {
    return false;
  }
  if (typeof value === "string") {
    pattern.lastIndex = 0;
    return pattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueContainsPattern(item, pattern, depth + 1));
  }
  if (!isObjectRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, item]) => {
    pattern.lastIndex = 0;
    return pattern.test(key) || valueContainsPattern(item, pattern, depth + 1);
  });
}

function repairUnescapedStringQuotes(value) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (!inString) {
        inString = true;
        output += char;
        continue;
      }
      const next = value.slice(index + 1).match(/\S/)?.[0];
      if (!next || [",", "}", "]", ":"].includes(next)) {
        inString = false;
        output += char;
      } else {
        output += `\\"`;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function parseJsonRecordCandidate(candidate) {
  try {
    const parsed = JSON.parse(candidate);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    const repaired = repairUnescapedStringQuotes(candidate);
    if (repaired === candidate) {
      return null;
    }
    try {
      const parsed = JSON.parse(repaired);
      return isObjectRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseJsonObjectFromText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  const candidates = [];
  if (text.startsWith("{") && text.endsWith("}")) {
    candidates.push(text);
  }
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(match[1]?.trim() ?? "");
  }
  for (const candidate of candidates.filter(Boolean)) {
    const parsed = parseJsonRecordCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function hasWorkspacePatch(value, depth = 0) {
  if (depth > 10 || value == null) {
    return false;
  }
  if (typeof value === "string") {
    const parsed = parseJsonObjectFromText(value);
    if (parsed) {
      return hasWorkspacePatch(parsed, depth + 1);
    }
    return /contentFactoryWorkspacePatch|content_factory_workspace_patch|workspacePatch|workspace_patch|content_factory\.workspace_patch/.test(
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasWorkspacePatch(item, depth + 1));
  }
  if (!isObjectRecord(value)) {
    return false;
  }
  if (
    value.kind === "content_factory.workspace_patch" ||
    value.contentFactoryWorkspacePatch ||
    value.workspacePatch
  ) {
    return true;
  }
  return Object.values(value).some((item) => hasWorkspacePatch(item, depth + 1));
}

function extractWorkspacePatch(value, depth = 0) {
  if (depth > 10 || value == null) {
    return null;
  }
  if (typeof value === "string") {
    const parsed = parseJsonObjectFromText(value);
    return parsed ? extractWorkspacePatch(parsed, depth + 1) : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const patch = extractWorkspacePatch(item, depth + 1);
      if (patch) return patch;
    }
    return null;
  }
  if (!isObjectRecord(value)) {
    return null;
  }
  if (isObjectRecord(value.contentFactoryWorkspacePatch)) {
    return value.contentFactoryWorkspacePatch;
  }
  if (isObjectRecord(value.content_factory_workspace_patch)) {
    return value.content_factory_workspace_patch;
  }
  if (isObjectRecord(value.workspacePatch)) {
    return value.workspacePatch;
  }
  if (isObjectRecord(value.workspace_patch)) {
    return value.workspace_patch;
  }
  if (value.kind === "content_factory.workspace_patch") {
    return value;
  }
  for (const item of Object.values(value)) {
    const patch = extractWorkspacePatch(item, depth + 1);
    if (patch) return patch;
  }
  return null;
}

function isWorkspacePatchOutputEvent(event) {
  const eventType = String(event?.eventType ?? event?.event_type ?? event?.type ?? "");
  return [
    "artifact:created",
    "evidence:recorded",
    "evidence:verified",
    "task:runtimeEvent",
  ].includes(eventType);
}

function hasOutputWorkspacePatch({ artifacts = [], taskEvents = [] }) {
  const artifactPatchReady = artifacts.some((artifact) => {
    if (!isObjectRecord(artifact)) {
      return false;
    }
    return (
      hasWorkspacePatch(artifact.metadata) ||
      hasWorkspacePatch(artifact.payload) ||
      hasWorkspacePatch(artifact.workspacePatch) ||
      hasWorkspacePatch(artifact.contentFactoryWorkspacePatch)
    );
  });
  if (artifactPatchReady) {
    return true;
  }

  return taskEvents.some((event) => {
    if (!isObjectRecord(event) || !isWorkspacePatchOutputEvent(event)) {
      return false;
    }
    return (
      hasWorkspacePatch(event.payload) ||
      hasWorkspacePatch(event.refs) ||
      hasWorkspacePatch(event.workspacePatch) ||
      hasWorkspacePatch(event.contentFactoryWorkspacePatch)
    );
  });
}

async function materializeDirectWorkspacePatch(frame, directRecord, actionConfig, timeoutMs, preparedReviewInput = null) {
  const patch = directRecord?.workspacePatch;
  if (!isObjectRecord(patch)) return false;
  const projectId = patch.projectId || patch.project_id || CONTENT_FACTORY_SAMPLE_PROJECT_ID;
  const reviewInput = actionConfig?.action === "run-review"
    ? preparedReviewInput || await readContentFactoryReviewInput(frame, Math.min(timeoutMs, 5_000)).catch(() => null)
    : null;
  const frameUrl = typeof frame.url === "function" ? frame.url() : "";
  let origin = "";
  try {
    const parsed = new URL(frameUrl);
    origin = parsed.origin === "null" ? "" : parsed.origin;
  } catch {
    origin = "";
  }
  if (!origin) {
    throw new Error(`Content Factory frame origin is unavailable for direct materialization: ${frameUrl}`);
  }
  let browserMaterializeError = null;
  let materialized = await evaluateWithTimeout(
    frame,
    async ({ patch: runtimePatch, projectId: targetProjectId, activeProjectStorageKey, reviewInput: reviewInputFromPage }) => {
      const response = await fetch("/api/runtime/materialize-workspace-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: runtimePatch.projectId || runtimePatch.project_id || targetProjectId,
          patch: runtimePatch,
          review_input: reviewInputFromPage,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.code >= 400) {
        throw new Error(
          payload?.data?.error ||
            payload?.msg ||
            "runtime workspace patch materialization failed",
        );
      }
      window.sessionStorage?.setItem(
        activeProjectStorageKey,
        runtimePatch.projectId || runtimePatch.project_id || targetProjectId,
      );
      return true;
    },
    {
      patch,
      projectId,
      reviewInput,
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    },
    timeoutMs,
  ).catch((error) => {
    browserMaterializeError = error;
    return false;
  });
  if (!materialized) {
    const response = await readJsonWithTimeout(
      `${origin}/api/runtime/materialize-workspace-patch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          patch,
          review_input: reviewInput,
        }),
      },
      timeoutMs,
    );
    if (!response.ok || response.body?.code >= 400) {
      throw new Error(
        `runtime workspace patch materialization failed via browser and node fetch: ${JSON.stringify(
          sanitizeJson({
            browserError:
              browserMaterializeError instanceof Error
                ? browserMaterializeError.message
                : String(browserMaterializeError ?? ""),
            nodeStatus: response.status,
            nodeError: response.body?.data?.error || response.body?.msg || response.error || "",
          }),
        )}`,
      );
    }
    materialized = true;
  }
  const routePath = pageRoutePath(actionConfig.page);
  await frame
    .goto(`${origin}${routePath}?project_id=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    })
    .catch(() => null);
  await evaluateWithTimeout(
    frame,
    ({ activeProjectStorageKey, targetProjectId, routePath }) => {
      window.sessionStorage?.setItem(activeProjectStorageKey, targetProjectId);
      if (!window.location.pathname.includes(routePath.replace(/^\//, ""))) {
        window.location.assign(`${routePath}?project_id=${encodeURIComponent(targetProjectId)}`);
      }
      return true;
    },
    {
      activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
      targetProjectId: projectId,
      routePath,
    },
    Math.min(timeoutMs, 10_000),
  ).catch(() => null);
  await waitForContentFactoryPageRoute(frame, actionConfig.page, timeoutMs).catch(() => null);
  if (actionConfig.campaignStep) {
    await clickCampaignStep(frame, actionConfig.campaignStep, timeoutMs);
  }
  return materialized;
}

async function readContentFactoryReviewInput(frame, timeoutMs = 5_000) {
  return evaluateWithTimeout(
    frame,
    () => {
      const readField = (field) => document.querySelector(`input[data-field="${field}"]`)?.value ?? "";
      return {
        direction: readField("review.direction"),
        sampleSize: readField("review.sampleSize"),
        reuseRatio: readField("review.reuseRatio"),
        completionRate: readField("review.completionRate"),
        searchShare: readField("review.searchShare"),
        conversionRate: readField("review.conversionRate"),
      };
    },
    null,
    timeoutMs,
  );
}

function isSuccessfulStatus(value) {
  return ["completed", "complete", "success", "succeeded"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

function collectSkillNames(value, names = new Set(), depth = 0) {
  if (depth > 9 || value == null) {
    return names;
  }
  if (typeof value === "string") {
    for (const skillName of Object.values(CONTENT_FACTORY_ACTIONS).flatMap(
      (item) => item.expectedSkills,
    )) {
      if (value.includes(skillName)) {
        names.add(skillName);
      }
    }
    return names;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSkillNames(item, names, depth + 1);
    }
    return names;
  }
  if (!isObjectRecord(value)) {
    return names;
  }
  for (const key of [
    "invokedSkillName",
    "invoked_skill_name",
    "skillName",
    "skill_name",
    "name",
    "tool_name",
    "toolName",
  ]) {
    const item = value[key];
    if (typeof item === "string") {
      for (const skillName of Object.values(CONTENT_FACTORY_ACTIONS).flatMap(
        (config) => config.expectedSkills,
      )) {
        if (item === skillName || item.endsWith(`:${skillName}`) || item.includes(skillName)) {
          names.add(skillName);
        }
      }
    }
  }
  for (const item of Object.values(value)) {
    collectSkillNames(item, names, depth + 1);
  }
  return names;
}

function hasTokenUsage(value) {
  const usage = findObjectByKeys(value, ["usage", "tokenUsage", "token_usage"], 8);
  if (!usage) {
    return false;
  }
  return [
    "inputTokens",
    "input_tokens",
    "outputTokens",
    "output_tokens",
    "totalTokens",
    "total_tokens",
    "cachedInputTokens",
    "cached_input_tokens",
  ].some((key) => Number.isFinite(Number(usage[key])) && Number(usage[key]) > 0);
}

function estimateTokenCountFromValue(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
}

function hasCost(value) {
  const cost = findObjectByKeys(value, ["cost_state", "costState", "cost"], 8);
  if (!cost) {
    return false;
  }
  return Boolean(
    cost.estimatedCostClass ||
      cost.estimated_cost_class ||
      Number.isFinite(Number(cost.estimatedTotalCost)) ||
      Number.isFinite(Number(cost.estimated_total_cost)) ||
      Number.isFinite(Number(cost.totalCost)) ||
      Number.isFinite(Number(cost.total_cost)),
  );
}

function firstReadySource(sources) {
  return sources.find((source) => source.ready)?.name ?? "";
}

async function readHostTaskRecord(frame, actionTaskId = "") {
  try {
    return await evaluateWithTimeout(frame, (taskId) => {
      const bridge = window.limeAgentAppBridge;
      const bridgeRecord = taskId
        ? (bridge?.getHostTaskRunRecord?.(taskId) ?? null)
        : null;
      const findTaskId = (value, depth = 0) => {
        if (depth > 8 || value == null) return "";
        if (typeof value === "string") {
          return value.match(/agent-app-task-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findTaskId(item, depth + 1);
            if (found) return found;
          }
          return "";
        }
        if (typeof value === "object") {
          if (typeof value.taskId === "string" && value.taskId.trim()) return value.taskId.trim();
          if (typeof value.task_id === "string" && value.task_id.trim()) return value.task_id.trim();
          for (const item of Object.values(value)) {
            const found = findTaskId(item, depth + 1);
            if (found) return found;
          }
        }
        return "";
      };
      const findSessionId = (value, depth = 0) => {
        if (depth > 8 || value == null) return "";
        if (typeof value === "string") {
          return value.match(/agent-app-runtime-[a-z0-9-]+/i)?.[0] ?? "";
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findSessionId(item, depth + 1);
            if (found) return found;
          }
          return "";
        }
        if (typeof value === "object") {
          for (const key of ["sessionId", "session_id", "threadId", "thread_id"]) {
            const item = value[key];
            if (typeof item === "string") {
              const found = findSessionId(item, depth + 1);
              if (found) return found;
            }
          }
          for (const item of Object.values(value)) {
            const found = findSessionId(item, depth + 1);
            if (found) return found;
          }
        }
        return "";
      };
      const hasWorkspacePatch = (value, depth = 0) => {
        if (depth > 8 || value == null) return false;
        if (typeof value === "string") {
          return /contentFactoryWorkspacePatch|content_factory_workspace_patch|workspacePatch|workspace_patch|content_factory\.workspace_patch/.test(value);
        }
        if (Array.isArray(value)) return value.some((item) => hasWorkspacePatch(item, depth + 1));
        if (typeof value !== "object") return false;
        if (
          value.kind === "content_factory.workspace_patch" ||
          value.contentFactoryWorkspacePatch ||
          value.workspacePatch
        ) return true;
        return Object.values(value).some((item) => hasWorkspacePatch(item, depth + 1));
      };
      const collectSkills = (value, names = new Set(), depth = 0) => {
        if (depth > 7 || value == null) return names;
        if (typeof value === "string") {
          for (const skillName of ["knowledge-builder", "article-writer", "content-reviewer"]) {
            if (value.includes(skillName)) names.add(skillName);
          }
          return names;
        }
        if (Array.isArray(value)) {
          value.forEach((item) => collectSkills(item, names, depth + 1));
          return names;
        }
        if (typeof value !== "object") return names;
        for (const key of ["invokedSkillNames", "skillNames"]) {
          if (Array.isArray(value[key])) {
            value[key].forEach((item) => {
              if (typeof item === "string") names.add(item);
            });
          }
        }
        for (const key of ["skillName", "skill_name", "command_name", "toolName", "tool_name"]) {
          if (typeof value[key] === "string") collectSkills(value[key], names, depth + 1);
        }
        Object.values(value).forEach((item) => collectSkills(item, names, depth + 1));
        return names;
      };
      const runtimeProcess =
        bridgeRecord?.runtimeProcess ??
        bridgeRecord?.process ??
        bridgeRecord?.task?.runtimeProcess ??
        bridgeRecord?.snapshot?.runtimeProcess ??
        null;
      const runtimeFacts =
        bridgeRecord?.runtimeFacts ??
        bridgeRecord?.task?.runtimeFacts ??
        bridgeRecord?.snapshot?.runtimeFacts ??
        null;
      return {
        bridgeRecord: bridgeRecord
          ? {
              taskId: findTaskId(bridgeRecord),
              sessionId: findSessionId(bridgeRecord),
              status:
                bridgeRecord?.task?.status ??
                bridgeRecord?.snapshot?.status ??
                bridgeRecord?.status ??
                "",
              hasWorkspacePatch: hasWorkspacePatch(bridgeRecord),
              hasArtifact: /artifact/i.test(JSON.stringify(bridgeRecord).slice(0, 12000)),
              hasEvidence: /evidence/i.test(JSON.stringify(bridgeRecord).slice(0, 12000)),
              invokedSkillNames: Array.from(collectSkills(bridgeRecord)),
              runtimeProcess: runtimeProcess
                ? {
                    timelineCount: Array.isArray(runtimeProcess.timeline)
                      ? runtimeProcess.timeline.length
                      : 0,
                    routingCount: runtimeProcess.routingCount ?? 0,
                    executionCount: runtimeProcess.executionCount ?? 0,
                    artifactCount: runtimeProcess.artifactCount ?? 0,
                    hasUsage: Boolean(runtimeProcess.usage),
                    hasCost: Boolean(runtimeProcess.cost),
                    invokedSkillNames: Array.isArray(runtimeProcess.invokedSkillNames)
                      ? runtimeProcess.invokedSkillNames
                      : [],
                  }
                : null,
              runtimeFacts: runtimeFacts
                ? {
                    hasUsage: Boolean(
                      runtimeFacts?.tokenUsage?.totals ||
                        runtimeFacts?.tokenUsage?.tasks?.length,
                    ),
                    hasCost: Boolean(
                      runtimeFacts?.costSummary?.cost ||
                        runtimeFacts?.costSummary?.tasks?.length,
                    ),
                  }
                : null,
            }
          : null,
        callLog: [],
      };
    }, actionTaskId, 5_000);
  } catch {
    return { bridgeRecord: null, callLog: [] };
  }
}

async function readDirectRuntimeRecord(options, taskId, sessionId) {
  if (!taskId || !sessionId) {
    return null;
  }
  const response = await readJsonWithTimeout(
    resolveInvokeUrl(options.healthUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "agent_app_runtime_get_task",
        args: {
          request: {
            appId: "content-factory-app",
            taskId,
            sessionId,
          },
        },
      }),
    },
    Math.min(Math.max(options.intervalMs * 10, 10_000), 45_000),
  );
  const snapshot = isObjectRecord(response.body) ? response.body.result : null;
  if (!response.ok || !snapshot || response.body?.error) {
    return {
      ok: false,
      status: response.status,
      error: response.body?.error ?? response.error ?? "agent_app_runtime_get_task unavailable",
    };
  }
  const threadRead = isObjectRecord(snapshot.threadRead) ? snapshot.threadRead : {};
  const runtimeSummary = isObjectRecord(threadRead.runtime_summary)
    ? threadRead.runtime_summary
    : isObjectRecord(threadRead.runtimeSummary)
      ? threadRead.runtimeSummary
      : {};
  const runtimeSummaryTaskId = findTaskId(runtimeSummary);
  const taskMatchesRuntimeSummary =
    !runtimeSummaryTaskId || String(runtimeSummaryTaskId) === String(taskId);
  const artifacts = Array.isArray(threadRead.artifacts) ? threadRead.artifacts : [];
  const toolCalls = Array.isArray(threadRead.tool_calls)
    ? threadRead.tool_calls
    : Array.isArray(threadRead.toolCalls)
      ? threadRead.toolCalls
      : [];
  const taskEvents = Array.isArray(snapshot.taskEvents) ? snapshot.taskEvents : [];
  if (!taskMatchesRuntimeSummary) {
    return {
      ok: true,
      taskMismatch: true,
      requestedTaskId: taskId,
      runtimeSummaryTaskId,
      taskStatus: "task_mismatch",
      profileStatus: threadRead.profile_status ?? "",
      status: threadRead.status ?? "",
      taskEventCount: 0,
      artifactCount: 0,
      persistedArtifactCount: 0,
      taskEventArtifactCount: 0,
      toolCallCount: 0,
      modelRouting: null,
      selectedModel: "",
      selectedProvider: "",
      costState: null,
      hasWorkspacePatch: false,
      hasUsage: false,
      hasEstimatedUsage: false,
      estimatedUsageTokens: 0,
      hasCost: false,
      workspacePatch: null,
      evidenceReady: false,
      invokedSkillNames: [],
      terminalReady: false,
    };
  }
  const modelRouting =
    findObjectByKeys(threadRead, ["model_routing", "modelRouting", "routing_decision"]) ??
    findObjectByKeys(snapshot, ["model_routing", "modelRouting", "routing_decision"]);
  const selectedModel =
    modelRouting?.selectedModel ??
    modelRouting?.selected_model ??
    modelRouting?.model ??
    modelRouting?.modelName ??
    "";
  const selectedProvider =
    modelRouting?.selectedProvider ??
    modelRouting?.selected_provider ??
    modelRouting?.provider ??
    "";
  const invokedSkillNames = Array.from(collectSkillNames({ toolCalls, taskEvents, threadRead }));
  const hasActualUsage = hasTokenUsage(snapshot);
  const estimatedUsageTokens = estimateTokenCountFromValue({
    taskEvents,
    artifacts,
    toolCalls,
    turns: Array.isArray(threadRead.turns) ? threadRead.turns : [],
  });
  const hasOutputPatch = hasOutputWorkspacePatch({ artifacts, taskEvents });
  const taskEventArtifactCount = taskEvents.filter(
    (event) =>
      isObjectRecord(event) &&
      isWorkspacePatchOutputEvent(event) &&
      hasWorkspacePatch(event.payload ?? event),
  ).length;
  const workspacePatch = hasOutputPatch
    ? extractWorkspacePatch({ artifacts, taskEvents })
    : null;
  return {
    ok: true,
    taskMismatch: false,
    requestedTaskId: taskId,
    runtimeSummaryTaskId,
    taskStatus: snapshot.taskStatus ?? snapshot.status ?? "",
    profileStatus: threadRead.profile_status ?? "",
    status: threadRead.status ?? "",
    taskEventCount: taskEvents.length,
    artifactCount: artifacts.length + taskEventArtifactCount,
    persistedArtifactCount: artifacts.length,
    taskEventArtifactCount,
    toolCallCount: toolCalls.length,
    modelRouting: modelRouting ?? null,
    selectedModel,
    selectedProvider,
    costState: threadRead.cost_state ?? null,
    hasWorkspacePatch: hasOutputPatch,
    hasUsage: hasActualUsage,
    hasEstimatedUsage: !hasActualUsage && estimatedUsageTokens > 0,
    estimatedUsageTokens,
    hasCost: hasCost(snapshot),
    workspacePatch,
    evidenceReady:
      valueContainsPattern(threadRead, /evidence_refs|evidenceRefs|skillEvidence/i) ||
      valueContainsPattern(taskEvents, /evidence/i) ||
      (hasOutputPatch && artifacts.length > 0),
    invokedSkillNames,
    terminalReady:
      isSuccessfulStatus(snapshot.taskStatus) ||
      isSuccessfulStatus(threadRead.profile_status) ||
      isSuccessfulStatus(threadRead.status) ||
      taskEvents.some(
        (event) =>
          isObjectRecord(event) &&
          String(event.eventType ?? event.event_type ?? "") === "task:completed" &&
          isSuccessfulStatus(event.status),
      ),
  };
}

function summarizeCompletion({ directRecord, hostRecord, expectedSkills }) {
  const bridgeRecord = hostRecord?.bridgeRecord ?? null;
  const combined = {
    directRecord,
    bridgeRecord,
    callLog: hostRecord?.callLog ?? [],
  };
  const invokedSkillNames = Array.from(collectSkillNames(combined));
  const expectedSkillsInvoked = expectedSkills.every((skillName) =>
    invokedSkillNames.some(
      (invokedSkillName) =>
        invokedSkillName === skillName || String(invokedSkillName).endsWith(`:${skillName}`),
    ),
  );
  const modelReady = Boolean(
    directRecord?.selectedModel ||
      directRecord?.selectedProvider ||
      findObjectByKeys(bridgeRecord, ["model", "modelRouting", "model_routing"], 7),
  );
  const usageEvidenceSource = firstReadySource([
    { name: "direct_runtime_snapshot", ready: Boolean(directRecord?.hasUsage) },
    { name: "host_runtime_process", ready: Boolean(bridgeRecord?.runtimeProcess?.hasUsage) },
    { name: "host_runtime_facts", ready: Boolean(bridgeRecord?.runtimeFacts?.hasUsage) },
    { name: "host_record_payload", ready: hasTokenUsage(bridgeRecord) },
    { name: "direct_runtime_estimate", ready: Boolean(directRecord?.hasEstimatedUsage) },
  ]);
  const costEvidenceSource = firstReadySource([
    { name: "direct_runtime_snapshot", ready: Boolean(directRecord?.hasCost) },
    { name: "host_runtime_process", ready: Boolean(bridgeRecord?.runtimeProcess?.hasCost) },
    { name: "host_runtime_facts", ready: Boolean(bridgeRecord?.runtimeFacts?.hasCost) },
    { name: "host_record_payload", ready: hasCost(bridgeRecord) },
  ]);
  const usageReady = Boolean(usageEvidenceSource);
  const costReady = Boolean(costEvidenceSource);
  const artifactReady = Boolean(
    Number(directRecord?.artifactCount ?? 0) > 0 ||
      bridgeRecord?.hasArtifact ||
      Number(bridgeRecord?.runtimeProcess?.artifactCount ?? 0) > 0,
  );
  const workspacePatchReady = Boolean(
    directRecord?.hasWorkspacePatch || bridgeRecord?.hasWorkspacePatch,
  );
  const evidenceReady = Boolean(
    directRecord?.evidenceReady ||
      bridgeRecord?.hasEvidence ||
      (workspacePatchReady && artifactReady),
  );
  const terminalReady = Boolean(
    directRecord?.terminalReady ||
      isSuccessfulStatus(directRecord?.taskStatus) ||
      isSuccessfulStatus(findValueByKeys(bridgeRecord, ["status", "taskStatus"], 5)),
  );
  const checks = {
    terminalReady,
    modelReady,
    usageReady,
    costReady,
    expectedSkillsInvoked,
    artifactReady,
    evidenceReady,
    workspacePatchReady,
  };
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([key]) => key);
  const fullRuntimeReady = missing.length === 0;
  const businessReady = Boolean(
    modelReady &&
      usageReady &&
      costReady &&
      expectedSkillsInvoked &&
      workspacePatchReady,
  );
  return {
    ...checks,
    ready: fullRuntimeReady,
    fullRuntimeReady,
    businessReady,
    missing,
    invokedSkillNames,
    usageEvidenceSource,
    costEvidenceSource,
  };
}

async function waitForNewTask(frame, baselineCallLogLength, timeoutMs) {
  const startedAt = Date.now();
  let latestSummary = { calls: [] };
  let latestHostRecord = null;
  while (Date.now() - startedAt < timeoutMs) {
    latestSummary = await readSdkCallLogSummary(frame, baselineCallLogLength);
    const newCalls = latestSummary.calls ?? [];
    const taskId = findTaskId(newCalls);
    const sessionId = findSessionId(newCalls);
    if (taskId && sessionId) {
      return { taskId, sessionId, newCalls };
    }
    latestHostRecord = await readHostTaskRecord(frame);
    const hostTaskId = latestHostRecord?.bridgeRecord?.taskId ?? "";
    const hostSessionId = latestHostRecord?.bridgeRecord?.sessionId ?? "";
    if (hostTaskId && hostSessionId) {
      return { taskId: hostTaskId, sessionId: hostSessionId, newCalls };
    }
    await sleep(500);
  }
  throw new Error(
    `Content Factory action did not create a new AgentRuntime task: ${JSON.stringify(
      sanitizeJson({
        calls: latestSummary.calls ?? [],
        hostRecord: latestHostRecord,
      }),
    )}`,
  );
}

async function runFlowAction(frame, page, options, actionName) {
  frame = await resolveContentFactoryReadFrame(
    page,
    frame,
    Math.min(options.timeoutMs, 45_000),
  );
  const actionConfig = CONTENT_FACTORY_ACTIONS[actionName];
  let preparedReviewInput = null;
  const boundedTimeoutMs = Math.min(options.timeoutMs, 60_000);
  await ensureContentFactorySampleProjectActive(frame, boundedTimeoutMs);

  logStage(`action:${actionName}:navigate`);
  await clickContentFactoryPage(frame, actionConfig.page, boundedTimeoutMs);
  await waitForActionPageReady(frame, actionConfig, boundedTimeoutMs);
  let executionConfig = actionConfig;
  if (actionConfig.prepareNextRound) {
    await prepareContentFactoryNextRound(frame, boundedTimeoutMs);
    executionConfig = CONTENT_FACTORY_ACTIONS["run-production"];
    await waitForActionPageReady(frame, executionConfig, boundedTimeoutMs);
  }
  if (executionConfig.campaignStep) {
    await clickCampaignStep(frame, executionConfig.campaignStep, boundedTimeoutMs);
  }
  const preparedNextRound = await prepareNextRoundForCompletedDefaultProduction(
    frame,
    executionConfig,
    actionName,
    boundedTimeoutMs,
  );
  if (preparedNextRound && executionConfig.campaignStep) {
    await clickCampaignStep(frame, executionConfig.campaignStep, boundedTimeoutMs);
  }
  if (!(await isContentFactoryPageRoute(frame, executionConfig.page))) {
    frame = await resolveContentFactoryReadFrame(page, frame, boundedTimeoutMs);
    await clickContentFactoryPage(frame, executionConfig.page, boundedTimeoutMs);
    await waitForActionPageReady(frame, executionConfig, boundedTimeoutMs);
    if (executionConfig.campaignStep) {
      await clickCampaignStep(frame, executionConfig.campaignStep, boundedTimeoutMs);
    }
  }
  if (actionName === "run-review") {
    await prepareReviewMetricsForAction(frame, boundedTimeoutMs);
    preparedReviewInput = await readContentFactoryReviewInput(frame, Math.min(boundedTimeoutMs, 5_000)).catch(() => null);
  }

  const actionButton = frame
    .locator(`button[data-action="${executionConfig.action}"]`)
    .first();
  await actionButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
  assert(
    !(await actionButton.isDisabled().catch(() => false)),
    `Content Factory ${actionName} action should be enabled`,
  );

  const baselineCallLogLength = await readSdkCallLogLength(frame);
  logStage(`action:${actionName}:start`);
  await actionButton.click({ timeout: boundedTimeoutMs });
  await waitForRuntimeProcessVisible(frame, page, executionConfig, boundedTimeoutMs);
  const startTaskTimeoutMs = Math.min(
    options.completionTimeoutMs,
    Math.max(boundedTimeoutMs, 180_000),
  );
  const taskStart = await waitForNewTask(
    frame,
    baselineCallLogLength,
    startTaskTimeoutMs,
  );

  logStage(`action:${actionName}:wait-runtime`);
  const startedAt = Date.now();
  let latestHostRecord = null;
  let latestDirectRecord = null;
  let latestDirectRuntimeReadError = null;
  let latestCompletion = null;
  let pageMaterialization = null;
  let directPatchMaterialized = false;
  while (Date.now() - startedAt < options.completionTimeoutMs) {
    try {
      latestHostRecord = await readHostTaskRecord(frame, taskStart.taskId);
    } catch (error) {
      if (!isFrameDetachedError(error)) {
        throw error;
      }
      frame = await resolveOrRecoverContentFactoryReadFrame(
        page,
        frame,
        options,
        boundedTimeoutMs,
      );
      latestHostRecord = await readHostTaskRecord(frame, taskStart.taskId);
    }
    const sessionId =
      taskStart.sessionId ||
      findSessionId(latestHostRecord) ||
      findSessionId(taskStart.newCalls);
    const directRuntimeProbe = await readDirectRuntimeRecord(
      options,
      taskStart.taskId,
      sessionId,
    );
    if (isTransientDirectRuntimeRecord(directRuntimeProbe) && latestDirectRecord) {
      latestDirectRuntimeReadError = directRuntimeProbe;
    } else {
      latestDirectRecord = directRuntimeProbe;
      latestDirectRuntimeReadError = isTransientDirectRuntimeRecord(directRuntimeProbe)
        ? directRuntimeProbe
        : null;
    }
    latestCompletion = summarizeCompletion({
      directRecord: latestDirectRecord,
      hostRecord: latestHostRecord,
      expectedSkills: executionConfig.expectedSkills,
    });
    if (latestCompletion.businessReady) {
      const readFrame = await resolveOrRecoverContentFactoryReadFrame(
        page,
        frame,
        options,
        boundedTimeoutMs,
      );
      const materializationState = await readPageMaterializationState(
        readFrame,
        8_000,
        actionName,
        page,
      );
      if (materializationState.ready) {
        pageMaterialization = materializationState;
      } else if (
        latestCompletion.fullRuntimeReady &&
        !directPatchMaterialized &&
        latestDirectRecord?.workspacePatch
      ) {
        directPatchMaterialized = await materializeDirectWorkspacePatch(
          readFrame,
          latestDirectRecord,
          executionConfig,
          boundedTimeoutMs,
          preparedReviewInput,
        ).catch(() => false);
        if (directPatchMaterialized) {
          const materializedFrame = await resolveOrRecoverContentFactoryReadFrame(
            page,
            readFrame,
            options,
            boundedTimeoutMs,
          );
          const materializationState = await readPageMaterializationState(
            materializedFrame,
            8_000,
            actionName,
            page,
          );
          pageMaterialization = materializationState.ready
            ? {
                ...materializationState,
                directPatchMaterialized: true,
              }
            : materializationState;
        }
      }
    }
    if (latestCompletion.fullRuntimeReady && pageMaterialization?.ready) {
      break;
    }
    await sleep(options.intervalMs);
  }
  if (!latestCompletion?.fullRuntimeReady) {
    const sessionId =
      taskStart.sessionId ||
      findSessionId(latestDirectRecord) ||
      findSessionId(latestHostRecord) ||
      findSessionId(taskStart.newCalls);
    if (latestDirectRuntimeReadError && sessionId) {
      logStage(`action:${actionName}:final-direct-runtime-retry`);
      await waitForHealth({
        ...options,
        timeoutMs: Math.min(options.timeoutMs, 180_000),
      }).catch(() => null);
      const recoveredDirectRecord = await readDirectRuntimeRecord(
        options,
        taskStart.taskId,
        sessionId,
      );
      if (recoveredDirectRecord?.ok) {
        latestDirectRecord = recoveredDirectRecord;
        latestDirectRuntimeReadError = null;
        latestCompletion = summarizeCompletion({
          directRecord: latestDirectRecord,
          hostRecord: latestHostRecord,
          expectedSkills: executionConfig.expectedSkills,
        });
      }
    }
  }
  if (!latestCompletion?.fullRuntimeReady) {
    throw new Error(
      `Content Factory ${actionName} did not reach full runtime readiness: ${JSON.stringify(
        {
          missing: latestCompletion?.missing ?? ["not_observed"],
          taskId: taskStart.taskId,
          sessionId: taskStart.sessionId,
          directRecord: sanitizeJson(latestDirectRecord),
          directRuntimeReadError: sanitizeJson(latestDirectRuntimeReadError),
        },
      )}`,
    );
  }
  if (!pageMaterialization?.ready && latestDirectRecord?.workspacePatch) {
    const readFrame = await resolveOrRecoverContentFactoryReadFrame(
      page,
      frame,
      options,
      boundedTimeoutMs,
    );
    directPatchMaterialized = await materializeDirectWorkspacePatch(
      readFrame,
      latestDirectRecord,
      executionConfig,
      boundedTimeoutMs,
      preparedReviewInput,
    ).catch(() => false);
    if (directPatchMaterialized) {
      const materializedFrame = await resolveOrRecoverContentFactoryReadFrame(
        page,
        readFrame,
        options,
        boundedTimeoutMs,
      );
      const materializationState = await readPageMaterializationState(
        materializedFrame,
        8_000,
        actionName,
        page,
      );
      if (materializationState.ready) {
        pageMaterialization = materializationState;
      }
    }
  }
  pageMaterialization =
    pageMaterialization?.ready
      ? pageMaterialization
      : await waitForPageMaterialization(
          await resolveOrRecoverContentFactoryReadFrame(
            page,
            frame,
            options,
            boundedTimeoutMs,
          ),
          actionName,
          Math.min(options.completionTimeoutMs, 90_000),
          {
            page,
            options,
            taskId: taskStart.taskId,
            sessionId:
              taskStart.sessionId ||
              findSessionId(latestDirectRecord) ||
              findSessionId(latestHostRecord),
            directRecord: sanitizeJson(latestDirectRecord),
            hostRecord: sanitizeJson(latestHostRecord?.bridgeRecord ?? null),
          },
        );

  let finalFrame = await resolveOrRecoverContentFactoryReadFrame(
    page,
    frame,
    options,
    boundedTimeoutMs,
  );
  let bodyText = [
    await readBodyText(finalFrame, Math.min(boundedTimeoutMs, 20_000)),
    await readBodyText(page, Math.min(boundedTimeoutMs, 20_000)),
  ].join("\n");
  let processVisible = textShowsRuntimeProcess(bodyText, executionConfig);
  const hostFallbackVisible = bodyText.includes("Lime AI 同事连接失败");
  if (!processVisible && options.launchMode !== "standalone-shell") {
    const surfaceState = await readRuntimeSurfaceState(page);
    if (!surfaceState.runtimeSurfaceVisible || !surfaceState.runtimeFrameVisible) {
      finalFrame = await recoverContentFactoryRuntimeFrame(page, options, boundedTimeoutMs);
      bodyText = [
        await readBodyText(finalFrame, Math.min(boundedTimeoutMs, 20_000)),
        await readBodyText(page, Math.min(boundedTimeoutMs, 20_000)),
      ].join("\n");
      processVisible = textShowsRuntimeProcess(bodyText, executionConfig);
      const recoveredSurfaceState = await readRuntimeSurfaceState(page);
      assert(
        recoveredSurfaceState.runtimeSurfaceVisible && recoveredSurfaceState.runtimeFrameVisible,
        `Content Factory runtime surface disappeared after ${actionName}: ${JSON.stringify(
          sanitizeJson({
            url: surfaceState.url || recoveredSurfaceState.url,
            runtimeSurfaceVisible: recoveredSurfaceState.runtimeSurfaceVisible,
            runtimeFrameVisible: recoveredSurfaceState.runtimeFrameVisible,
            bodyPreview: sanitizeText(surfaceState.bodyText || recoveredSurfaceState.bodyText),
          }),
        )}`,
      );
    }
  }
  assert(
    processVisible || pageMaterialization?.ready,
    `Content Factory ${actionName} should keep process UI visible or materialize the result`,
  );
  assert(!hostFallbackVisible, `Content Factory ${actionName} should not show host fallback`);
  if (
    actionName === "run-production" ||
    actionName === "run-production-next-round" ||
    actionName === "only-copy"
  ) {
    assert(
      !/还没有形成\s*(?:20\s*条内容批次|草稿)|整理草稿\s*0\s*\/\s*20|内容：\s*0\s*条/.test(
        bodyText.replace(/\s+/g, " "),
      ),
      `Content Factory ${actionName} should not keep stale 0/20 blocker after runtime patch`,
    );
  }

  return {
    actionName,
    actionLabel: actionConfig.label,
    taskId: taskStart.taskId,
    sessionId:
      taskStart.sessionId ||
      findSessionId(latestDirectRecord) ||
      findSessionId(latestHostRecord),
    expectedSkills: executionConfig.expectedSkills,
    invokedSkillNames: latestCompletion.invokedSkillNames,
    completion: latestCompletion,
    directRuntimeSnapshot: sanitizeJson(latestDirectRecord),
    hostRuntimeSnapshot: sanitizeJson(latestHostRecord?.bridgeRecord ?? null),
    pageMaterialization,
    nextFrame: finalFrame,
    processVisible,
    hostFallbackVisible,
    capabilityCalls: taskStart.newCalls
      .map((call) => `${call?.capability ?? "unknown"}.${call?.method ?? "unknown"}`)
      .filter(Boolean),
    bodyPreview: sanitizeText(bodyText),
  };
}

async function prepareReviewMetricsForAction(frame, timeoutMs) {
  logStage("action:run-review:prepare-metrics");
  for (const [field, value] of Object.entries(CONTENT_FACTORY_REVIEW_E2E_METRICS)) {
    const input = frame.locator(`input[data-field="${field}"]`).first();
    await input.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 20_000) });
    await input.fill(value, { timeout: Math.min(timeoutMs, 20_000) });
    await input.evaluate((element) => {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}

async function collectFailureDiagnostics(page, options, error, consoleErrors, failedRequests) {
  const failurePath = path.join(options.evidenceDir, `${options.prefix}-failure.json`);
  const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-failure.png`);
  let pageState = null;
  let screenshot = screenshotPath;
  const frames = [];
  const projectDiagnostics = [];
  for (const frame of page.frames()) {
    let bodyText = "";
    try {
      bodyText = await readBodyText(frame, 3_000);
    } catch (frameError) {
      bodyText = `[unavailable] ${
        frameError instanceof Error ? frameError.message : String(frameError)
      }`;
    }
    frames.push({
      url: frame.url(),
      name: frame.name(),
      bodyText: bodyText.slice(0, 2_000),
    });
    if (/\/(?:dashboard|knowledge|start|scenario-planning|campaigns|deliver|delivery|review-dashboard|projects)\b/.test(frame.url())) {
      projectDiagnostics.push({
        url: frame.url(),
        diagnostics: await readContentFactoryActiveProjectDiagnostics(frame, 3_000),
      });
    }
  }
  try {
    pageState = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 2_000),
      runtimeSurfaceVisible: Boolean(
        document.querySelector('[data-testid="agent-app-runtime-surface"]'),
      ),
      runtimeFrameVisible: Boolean(
        document.querySelector('[data-testid="agent-app-runtime-frame"]'),
      ),
      frameCount: window.frames.length,
    }));
  } catch (diagnosticError) {
    pageState = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 30_000 });
  } catch (diagnosticError) {
    screenshot = {
      error:
        diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
    };
  }
  const summary = {
    scenarioId: "content-factory-full-flow-failure",
    failedAt: new Date().toISOString(),
    appUrl: options.appUrl,
    modelPreferenceOverride: hasModelPreferenceOverride(options)
      ? {
          providerPreference: options.modelProvider,
          modelPreference: options.modelName,
          label: resolveModelPreferenceLabel(options),
        }
      : null,
    error: error instanceof Error ? error.message : String(error),
    pageState: sanitizeJson(pageState),
    frames: sanitizeJson(frames),
    projectDiagnostics: sanitizeJson(projectDiagnostics),
    consoleErrors: sanitizeJson(consoleErrors),
    failedRequests: sanitizeJson(failedRequests),
    screenshot,
  };
  fs.writeFileSync(failurePath, `${JSON.stringify(summary, null, 2)}\n`);
  console.error(`[content-factory-flow] failureSummary=${failurePath}`);
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  await waitForHealth(options);

  const bootstrap = activeCloudBootstrapPayload(options);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-content-factory-flow-"));
  const context = await launchSmokeContext(userDataDir);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  let activeDiagnosticPage = page;

  await context.addInitScript((payload) => {
    window.localStorage.removeItem("lime.agentAppHost.flags");
    window.localStorage.removeItem("lime.agentAppHost.labEnabled");
    window.sessionStorage?.removeItem(payload.hostTaskStorageKey);
    window.sessionStorage?.setItem(payload.activeProjectStorageKey, payload.sampleProjectId);
    window.__LIME_AGENT_APPS_SMOKE_BOOTSTRAP__ = payload;
  }, {
    ...bootstrap,
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    hostTaskStorageKey: CONTENT_FACTORY_HOST_TASK_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });

  await page.route(
    "https://user.limeai.run/api/v1/public/tenants/*/client/agent-apps",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bootstrap),
      });
    },
  );
  attachPageTelemetry(page, consoleErrors, failedRequests, "lime-desktop");

  const signalHandlers = new Map();
  let signalFailureStarted = false;
  for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (signalFailureStarted) return;
      signalFailureStarted = true;
      const error = new Error(
        `Content Factory flow interrupted by ${signal} before writing success evidence`,
      );
      Promise.resolve()
        .then(() =>
          collectFailureDiagnostics(
            activeDiagnosticPage,
            options,
            error,
            consoleErrors,
            failedRequests,
          ),
        )
        .catch((diagnosticError) => {
          console.error(
            `[content-factory-flow] signal diagnostic failed: ${
              diagnosticError instanceof Error
                ? diagnosticError.message
                : String(diagnosticError)
            }`,
          );
        })
        .finally(async () => {
          await context.close().catch(() => null);
          fs.rmSync(userDataDir, { recursive: true, force: true });
          process.exit(signalExitCode(signal));
        });
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  const runFlow = async () => {
    const launchContext = await bootstrapAndLaunchContentFactory(
      page,
      options,
      bootstrap,
      { consoleErrors, failedRequests },
    );
    let frame = launchContext.frame;
    const runtimePage = launchContext.page;
    activeDiagnosticPage = runtimePage;
    await seedContentFactorySampleWorkspace(frame, Math.min(options.timeoutMs, 90_000));
    await applyContentFactoryModelPreference(frame, options, Math.min(options.timeoutMs, 90_000));
    frame = await resolveContentFactoryReadFrame(
      runtimePage,
      frame,
      Math.min(options.timeoutMs, 45_000),
    );
    const initialProbe = await markFrameProbe(frame);
    const flowResults = [];
    for (const actionName of options.actions) {
      frame = await resolveContentFactoryReadFrame(
        runtimePage,
        frame,
        Math.min(options.timeoutMs, 45_000),
      );
      const actionResult = await runFlowAction(frame, runtimePage, options, actionName);
      const nextFrame = actionResult.nextFrame;
      delete actionResult.nextFrame;
      flowResults.push(actionResult);
      frame = nextFrame && !isDetachedFrame(nextFrame)
        ? nextFrame
        : await resolveContentFactoryReadFrame(
            runtimePage,
            frame,
            Math.min(options.timeoutMs, 45_000),
          );
    }
    const finalProbe = await markFrameProbe(frame);
    const sameIframeContext = initialProbe.id === finalProbe.id;
    const sceneCountRegressions = collectSceneCountRegressions(flowResults, finalProbe);
    const sceneCountPreservationRequired = actionsRequireSceneCountPreservation(options.actions);

    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}.png`);
    let screenshot = screenshotPath;
    try {
      await runtimePage.screenshot({ path: screenshotPath, fullPage: true, timeout: 30_000 });
    } catch (error) {
      screenshot = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const assertions = {
      sameIframeContext,
      actionCount: flowResults.length === options.actions.length,
      allActionsCompleted: flowResults.every(
        (item) => item.completion.businessReady && item.pageMaterialization?.ready,
      ),
      allActionsUsedExpectedSkills: flowResults.every(
        (item) => item.completion.expectedSkillsInvoked,
      ),
      allActionsHaveModelUsageCost: flowResults.every(
        (item) =>
          item.completion.modelReady &&
          item.completion.usageReady &&
          item.completion.costReady,
      ),
      allActionsHaveWorkspacePatch: flowResults.every(
        (item) => item.completion.workspacePatchReady,
      ),
      allActionsFullRuntimeReady: flowResults.every((item) => item.completion.fullRuntimeReady),
      processVisibleAfterEachAction: flowResults.every(
        (item) => item.processVisible || item.pageMaterialization?.ready,
      ),
      sceneCountPreservedAfterFlow:
        !sceneCountPreservationRequired || sceneCountRegressions.length === 0,
      noHostFallback: flowResults.every((item) => !item.hostFallbackVisible),
      standaloneShellLaunched:
        options.launchMode !== "standalone-shell" ||
        launchContext.standaloneLaunch?.result?.status === "launched",
      standaloneRuntimeEntryReachable:
        options.launchMode !== "standalone-shell" ||
        Boolean(
          launchContext.standaloneLaunch?.runtimeEntryProbe?.ok &&
            launchContext.standaloneLaunch?.runtimeEntryProbe?.hasHtmlShell,
        ),
      standaloneBusinessHostReady:
        options.launchMode !== "standalone-shell" ||
        (() => {
          if (
            launchContext.standaloneLaunch?.businessHost?.kind !==
            "agent-app-runtime-page"
          ) {
            return false;
          }
          try {
            const runtimeUrl = new URL(initialProbe.url);
            return (
              runtimeUrl.hostname === "127.0.0.1" &&
              [
                "/dashboard",
                "/scenario-planning",
                "/campaigns",
                "/deliver",
                "/delivery",
                "/review-dashboard",
                "/knowledge",
              ].includes(runtimeUrl.pathname)
            );
          } catch {
            return false;
          }
        })(),
      strictStandaloneIsolation:
        options.launchMode !== "standalone-shell" ||
        Boolean(
          launchContext.standaloneLaunch?.descriptor?.isolation?.packageMount === "read-only" &&
            launchContext.standaloneLaunch?.descriptor?.isolation?.secrets === "refs-only" &&
            launchContext.standaloneLaunch?.descriptor?.isolation?.sideEffects ===
              "runtime-broker" &&
            launchContext.standaloneLaunch?.descriptor?.isolation?.evidence ===
              "runtime-provenance",
        ),
      noConsoleErrors: consoleErrors.length === 0,
      consoleErrorCount: consoleErrors.length,
    };
    assert(
      assertions.sceneCountPreservedAfterFlow,
      `Assertion failed: sceneCountPreservedAfterFlow ${JSON.stringify(
        sanitizeJson(sceneCountRegressions.slice(0, 6)),
      )}`,
    );
    Object.entries(assertions).forEach(([key, value]) => {
      if (
        key === "consoleErrorCount" ||
        key === "sameIframeContext" ||
        key === "sceneCountPreservedAfterFlow"
      ) {
        return;
      }
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const summary = {
      scenarioId:
        options.launchMode === "standalone-shell"
          ? "content-factory-standalone-full-flow"
          : "content-factory-full-flow",
      appUrl: options.appUrl,
      launchMode: options.launchMode,
      generatedAt: new Date().toISOString(),
      actions: options.actions,
      modelPreferenceOverride: hasModelPreferenceOverride(options)
        ? {
            providerPreference: options.modelProvider,
            modelPreference: options.modelName,
            label: resolveModelPreferenceLabel(options),
          }
        : null,
      assertions,
      standaloneLaunch: sanitizeJson(launchContext.standaloneLaunch),
      initialProbe,
      finalProbe,
      flowResults,
      sceneCountRegressions,
      consoleErrors: sanitizeJson(consoleErrors),
      failedRequests: sanitizeJson(failedRequests),
      screenshot,
    };
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[content-factory-flow] summary=${summaryPath}`);
    console.log("[content-factory-flow] 通过");
  };

  const watchdogTimeoutMs = resolveOverallTimeoutMs(options);
  const watchdog = createFlowWatchdog(watchdogTimeoutMs);
  const runPromise = runFlow();
  let runCompleted = false;
  try {
    await Promise.race([
      runPromise.then(() => {
        runCompleted = true;
      }),
      watchdog.promise,
    ]);
  } catch (error) {
    if (signalFailureStarted) {
      runPromise.catch(() => null);
      return;
    }
    if (!runCompleted) {
      runPromise.catch(() => null);
    }
    await collectFailureDiagnostics(
      activeDiagnosticPage,
      options,
      error,
      consoleErrors,
      failedRequests,
    );
    throw error;
  } finally {
    for (const [signal, handler] of signalHandlers.entries()) {
      process.removeListener(signal, handler);
    }
    watchdog.clear();
    if (!signalFailureStarted) {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
