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
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "content-factory-full-flow",
  contentFactoryDir: resolveDefaultContentFactoryDir(),
  installSource: "local",
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
const CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY =
  "contentFactory.activeProjectId.v1";
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
  --prefix <name>                 Evidence filename prefix
  --content-factory-dir <dir>      Current content-factory-app directory, default ../../limecloud/content-factory-app
  --install-source <local|cloud>   Install current local package or cloud catalog release, default local
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

async function waitForActionPageReady(frame, actionConfig, timeoutMs) {
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

async function resolveContentFactoryReadFrame(page, fallbackFrame, timeoutMs = 5_000) {
  if (!page) return fallbackFrame;
  try {
    return await getContentFactoryRuntimeFrame(page, timeoutMs);
  } catch {
    return fallbackFrame;
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

function textShowsActionMaterializedResult(text, actionName) {
  const normalized = String(text ?? "").replace(/\s+/g, " ");
  if (textShowsWaitingForWriteBack(normalized)) {
    return false;
  }
  if (textShowsMaterializedResult(normalized)) {
    return true;
  }
  if (actionName === "run-scenarios") {
    return (
      /场景(?:概览|数量)?\s*120(?:\s*个)?/.test(normalized) ||
      /场景\s*120\s*\/\s*120/.test(normalized)
    );
  }
  if (
    actionName === "run-production" ||
    actionName === "run-production-next-round" ||
    actionName === "only-copy"
  ) {
    return (
      /内容\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /草稿\s*20\s*\/\s*20\s*条/.test(normalized) ||
      /(?:内容|文案|草稿)[^\d]{0,12}20\s*条/.test(normalized)
    );
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
    return /复盘发现|下一轮建议|生成判断/.test(normalized);
  }
  return false;
}

async function waitForPageMaterialization(frame, actionName, timeoutMs, diagnostics = {}) {
  const { page, ...diagnosticsForError } = diagnostics;
  const startedAt = Date.now();
  let latestState = null;
  while (Date.now() - startedAt < timeoutMs) {
    const readFrame = await resolveContentFactoryReadFrame(page, frame, 3_000);
    latestState = await readPageMaterializationState(
      readFrame,
      Math.min(timeoutMs, 8_000),
      actionName,
      page,
    );
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
    const [frameText, pageText] = await Promise.all([
      readBodyText(frame),
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
  const installResult = await page.evaluate(async ({ appDir }) => {
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
  }, { appDir: options.contentFactoryDir });
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

async function bootstrapAndLaunchContentFactory(page, options, bootstrap) {
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
  return getContentFactoryRuntimeFrame(page, options.timeoutMs);
}

async function getContentFactoryRuntimeFrame(page, timeoutMs) {
  const frameHandle = await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
    timeout: Math.min(timeoutMs, 45_000),
  });
  const frame = await frameHandle.contentFrame();
  assert(frame, "Content Factory runtime frame should be attached");
  return frame;
}

async function seedContentFactorySampleWorkspace(frame, timeoutMs) {
  logStage("seed-sample-workspace");
  await frame.evaluate(async ({ activeProjectStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem("contentFactory.activeHostTask.v1");
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
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  await frame.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await frame.locator(pageButtonSelector("projects")).first().click({ timeout: timeoutMs });
  await frame.evaluate(({ activeProjectStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem("contentFactory.activeHostTask.v1");
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  const sampleProjectButton = frame
    .locator(`button[data-open-project="${CONTENT_FACTORY_SAMPLE_PROJECT_ID}"]`)
    .first();
  await sampleProjectButton.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await sampleProjectButton.click({ timeout: timeoutMs });
  await frame.locator(".project-room-main h3", { hasText: "春季新品内容项目" }).waitFor({
    timeout: timeoutMs,
  });
  await frame.evaluate(({ activeProjectStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem("contentFactory.activeHostTask.v1");
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
}

async function ensureContentFactorySampleProjectActive(frame, timeoutMs) {
  const bodyText = await readBodyText(frame, 3_000);
  if (bodyText.includes("春季新品内容项目")) {
    return;
  }
  await frame.evaluate(({ activeProjectStorageKey, sampleProjectId }) => {
    window.sessionStorage?.removeItem("contentFactory.activeHostTask.v1");
    window.sessionStorage?.setItem(activeProjectStorageKey, sampleProjectId);
  }, {
    activeProjectStorageKey: CONTENT_FACTORY_ACTIVE_PROJECT_STORAGE_KEY,
    sampleProjectId: CONTENT_FACTORY_SAMPLE_PROJECT_ID,
  });
  await frame.locator(pageButtonSelector("projects")).first().click({ timeout: timeoutMs });
  const sampleProjectButton = frame
    .locator(`button[data-open-project="${CONTENT_FACTORY_SAMPLE_PROJECT_ID}"]`)
    .first();
  await sampleProjectButton.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await sampleProjectButton.click({ timeout: timeoutMs });
  await frame.locator(".project-room-main h3, .project-spine h2", {
    hasText: "春季新品内容项目",
  }).waitFor({ timeout: timeoutMs });
}

async function clickVisibleButtonIfPresent(locator, timeoutMs = 5_000) {
  if ((await locator.count().catch(() => 0)) < 1) return false;
  const button = locator.first();
  if (!(await button.isVisible({ timeout: timeoutMs }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click({ timeout: timeoutMs });
  return true;
}

async function prepareContentFactoryNextRound(frame, timeoutMs) {
  logStage("prepare-next-round");
  const boundedTimeoutMs = Math.min(timeoutMs, 60_000);
  await frame.locator(pageButtonSelector("review")).first().click({
    timeout: boundedTimeoutMs,
  });
  await frame.getByText(/复盘决策室|复盘出口|下一轮建议/).first().waitFor({
    timeout: boundedTimeoutMs,
  });

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
  const bodyAfterCreateAttempt = await readBodyText(frame, 3_000);
  assert(
    createdNextRound || /第\d+轮内容|第\d+轮目标|0\s*\/\s*20\s*条/.test(bodyAfterCreateAttempt),
    `Content Factory next round action should be available before next-round production: ${sanitizeText(
      bodyAfterCreateAttempt,
    )}`,
  );
  await frame.locator(pageButtonSelector("produce")).first().click({
    timeout: boundedTimeoutMs,
  });
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
  const artifacts = Array.isArray(threadRead.artifacts) ? threadRead.artifacts : [];
  const toolCalls = Array.isArray(threadRead.tool_calls)
    ? threadRead.tool_calls
    : Array.isArray(threadRead.toolCalls)
      ? threadRead.toolCalls
      : [];
  const taskEvents = Array.isArray(snapshot.taskEvents) ? snapshot.taskEvents : [];
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
  return {
    ok: true,
    taskStatus: snapshot.taskStatus ?? snapshot.status ?? "",
    profileStatus: threadRead.profile_status ?? "",
    status: threadRead.status ?? "",
    taskEventCount: taskEvents.length,
    artifactCount: artifacts.length,
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
    evidenceReady:
      valueContainsPattern(threadRead, /evidence_refs|evidenceRefs|skillEvidence/i) ||
      valueContainsPattern(taskEvents, /evidence/i) ||
      (hasOutputPatch && artifacts.length > 0),
    invokedSkillNames,
    terminalReady:
      isSuccessfulStatus(snapshot.taskStatus) ||
      isSuccessfulStatus(threadRead.profile_status) ||
      isSuccessfulStatus(threadRead.status),
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
  const actionConfig = CONTENT_FACTORY_ACTIONS[actionName];
  const boundedTimeoutMs = Math.min(options.timeoutMs, 60_000);
  await ensureContentFactorySampleProjectActive(frame, boundedTimeoutMs);

  logStage(`action:${actionName}:navigate`);
  await frame.locator(pageButtonSelector(actionConfig.page)).first().click({
    timeout: boundedTimeoutMs,
  });
  await waitForActionPageReady(frame, actionConfig, boundedTimeoutMs);
  if (actionConfig.prepareNextRound) {
    await prepareContentFactoryNextRound(frame, boundedTimeoutMs);
    await waitForActionPageReady(frame, CONTENT_FACTORY_ACTIONS["run-production"], boundedTimeoutMs);
  }
  if (actionConfig.campaignStep) {
    const stepButton = frame
      .locator(`button[data-campaign-step="${actionConfig.campaignStep}"]`)
      .first();
    await stepButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
    await stepButton.click({ timeout: boundedTimeoutMs });
  }

  const actionButton = frame
    .locator(`button[data-action="${actionConfig.action}"]`)
    .first();
  await actionButton.waitFor({ state: "visible", timeout: boundedTimeoutMs });
  assert(
    !(await actionButton.isDisabled().catch(() => false)),
    `Content Factory ${actionName} action should be enabled`,
  );

  const baselineCallLogLength = await readSdkCallLogLength(frame);
  logStage(`action:${actionName}:start`);
  await actionButton.click({ timeout: boundedTimeoutMs });
  await waitForRuntimeProcessVisible(frame, page, actionConfig, boundedTimeoutMs);
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
  let latestCompletion = null;
  let pageMaterialization = null;
  while (Date.now() - startedAt < options.completionTimeoutMs) {
    latestHostRecord = await readHostTaskRecord(frame, taskStart.taskId);
    const sessionId =
      taskStart.sessionId ||
      findSessionId(latestHostRecord) ||
      findSessionId(taskStart.newCalls);
    latestDirectRecord = await readDirectRuntimeRecord(
      options,
      taskStart.taskId,
      sessionId,
    );
    latestCompletion = summarizeCompletion({
      directRecord: latestDirectRecord,
      hostRecord: latestHostRecord,
      expectedSkills: actionConfig.expectedSkills,
    });
    if (latestCompletion.businessReady) {
      const readFrame = await resolveContentFactoryReadFrame(page, frame, 5_000);
      const materializationState = await readPageMaterializationState(
        readFrame,
        8_000,
        actionName,
        page,
      );
      if (materializationState.ready) {
        pageMaterialization = materializationState;
      }
    }
    if (latestCompletion.fullRuntimeReady && pageMaterialization?.ready) {
      break;
    }
    await sleep(options.intervalMs);
  }
  if (!latestCompletion?.fullRuntimeReady) {
    throw new Error(
      `Content Factory ${actionName} did not reach full runtime readiness: ${JSON.stringify(
        {
          missing: latestCompletion?.missing ?? ["not_observed"],
          taskId: taskStart.taskId,
          sessionId: taskStart.sessionId,
          directRecord: sanitizeJson(latestDirectRecord),
        },
      )}`,
    );
  }
  pageMaterialization =
    pageMaterialization?.ready
      ? pageMaterialization
      : await waitForPageMaterialization(
          frame,
          actionName,
          Math.min(options.completionTimeoutMs, 90_000),
          {
            page,
            taskId: taskStart.taskId,
            sessionId:
              taskStart.sessionId ||
              findSessionId(latestDirectRecord) ||
              findSessionId(latestHostRecord),
            directRecord: sanitizeJson(latestDirectRecord),
            hostRecord: sanitizeJson(latestHostRecord?.bridgeRecord ?? null),
          },
        );

  const finalFrame = await resolveContentFactoryReadFrame(page, frame, 5_000);
  const bodyText = [
    await readBodyText(finalFrame, Math.min(boundedTimeoutMs, 20_000)),
    await readBodyText(page, Math.min(boundedTimeoutMs, 20_000)),
  ].join("\n");
  const processVisible = textShowsRuntimeProcess(bodyText, actionConfig);
  const hostFallbackVisible = bodyText.includes("Lime AI 同事连接失败");
  if (!processVisible) {
    const surfaceState = await readRuntimeSurfaceState(page);
    if (!surfaceState.runtimeSurfaceVisible || !surfaceState.runtimeFrameVisible) {
      throw new Error(
        `Content Factory runtime surface disappeared after ${actionName}: ${JSON.stringify(
          sanitizeJson({
            url: surfaceState.url,
            runtimeSurfaceVisible: surfaceState.runtimeSurfaceVisible,
            runtimeFrameVisible: surfaceState.runtimeFrameVisible,
            bodyPreview: sanitizeText(surfaceState.bodyText),
          }),
        )}`,
      );
    }
  }
  assert(processVisible, `Content Factory ${actionName} should keep process UI visible`);
  assert(!hostFallbackVisible, `Content Factory ${actionName} should not show host fallback`);

  return {
    actionName,
    actionLabel: actionConfig.label,
    taskId: taskStart.taskId,
    sessionId:
      taskStart.sessionId ||
      findSessionId(latestDirectRecord) ||
      findSessionId(latestHostRecord),
    expectedSkills: actionConfig.expectedSkills,
    invokedSkillNames: latestCompletion.invokedSkillNames,
    completion: latestCompletion,
    directRuntimeSnapshot: sanitizeJson(latestDirectRecord),
    hostRuntimeSnapshot: sanitizeJson(latestHostRecord?.bridgeRecord ?? null),
    pageMaterialization,
    processVisible,
    hostFallbackVisible,
    capabilityCalls: taskStart.newCalls
      .map((call) => `${call?.capability ?? "unknown"}.${call?.method ?? "unknown"}`)
      .filter(Boolean),
    bodyPreview: sanitizeText(bodyText),
  };
}

async function collectFailureDiagnostics(page, options, error, consoleErrors, failedRequests) {
  const failurePath = path.join(options.evidenceDir, `${options.prefix}-failure.json`);
  const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-failure.png`);
  let pageState = null;
  let screenshot = screenshotPath;
  const frames = [];
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
    error: error instanceof Error ? error.message : String(error),
    pageState: sanitizeJson(pageState),
    frames: sanitizeJson(frames),
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

  await context.addInitScript((payload) => {
    window.localStorage.removeItem("lime.agentAppHost.flags");
    window.localStorage.removeItem("lime.agentAppHost.labEnabled");
    window.__LIME_AGENT_APPS_SMOKE_BOOTSTRAP__ = payload;
  }, bootstrap);

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
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });

  try {
    const frame = await bootstrapAndLaunchContentFactory(page, options, bootstrap);
    await seedContentFactorySampleWorkspace(frame, Math.min(options.timeoutMs, 90_000));
    const initialProbe = await markFrameProbe(frame);
    const flowResults = [];
    for (const actionName of options.actions) {
      flowResults.push(await runFlowAction(frame, page, options, actionName));
    }
    const finalProbe = await markFrameProbe(frame);
    assert(
      initialProbe.id === finalProbe.id,
      "Content Factory full flow should stay in the same iframe JS context",
    );

    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}.png`);
    let screenshot = screenshotPath;
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 30_000 });
    } catch (error) {
      screenshot = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const assertions = {
      sameIframeContext: initialProbe.id === finalProbe.id,
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
      processVisibleAfterEachAction: flowResults.every((item) => item.processVisible),
      noHostFallback: flowResults.every((item) => !item.hostFallbackVisible),
      consoleErrorCount: consoleErrors.length,
    };
    Object.entries(assertions).forEach(([key, value]) => {
      if (key === "consoleErrorCount") {
        return;
      }
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const summary = {
      scenarioId: "content-factory-full-flow",
      appUrl: options.appUrl,
      generatedAt: new Date().toISOString(),
      actions: options.actions,
      assertions,
      initialProbe,
      finalProbe,
      flowResults,
      consoleErrors: sanitizeJson(consoleErrors),
      failedRequests: sanitizeJson(failedRequests),
      screenshot,
    };
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[content-factory-flow] summary=${summaryPath}`);
    console.log("[content-factory-flow] 通过");
  } catch (error) {
    await collectFailureDiagnostics(page, options, error, consoleErrors, failedRequests);
    throw error;
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
