#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";

const DEFAULTS = {
  appUrl: "",
  fixtureDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "plugins-runtime-fixtures",
    "content-factory-app",
  ),
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "plugin-ui-runtime-electron-fixture",
  ),
  prefix: "plugin-ui-runtime-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_ID = "content-factory-app";
const ENTRY_KEY = "dashboard";
const ENTRY_ROUTE = "/dashboard";
const RUNTIME_VERSION = "0.8.0";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_APP_SERVER_METHODS = [
  "pluginInstalled/list",
  "pluginUiRuntime/start",
];
const OPTIONAL_APP_SERVER_METHODS = [
  "pluginUiRuntime/status",
  "pluginUiRuntime/stop",
];
const LEGACY_PLUGIN_COMMANDS = [
  "plugin_start_ui_runtime",
  "plugin_get_ui_runtime_status",
  "plugin_stop_ui_runtime",
];

function printHelp() {
  console.log(`
Plugin UI Runtime Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，使用临时 userData / app data 种子 fixture
  Plugin installed state，然后通过正式侧栏进入 Plugin runtime 页面，验证
  前端 iframe surface 真实打开 App Server 返回的 entryUrl。

目标链路:
  Frontend -> Electron Desktop Host IPC -> app_server_handle_json_lines
    -> pluginUiRuntime/start -> App Server JSON-RPC -> RuntimeCore/backend

说明:
  本脚本不调用 legacy plugin_* UI runtime 命令，不写真实用户 app data，
  不消耗 live provider。installed state 只写临时 HOME / XDG_DATA_HOME /
  APPDATA / LOCALAPPDATA 与 ELECTRON_E2E_USER_DATA_DIR。
  本脚本只证明 pluginUiRuntime/* 的 UI 子进程 start/status/stop 与
  entryUrl iframe surface；它不证明 Agent 对话 turn、tool runtime、evidence
  或 Claw/Aster 完整执行链。对话 runtime 仍必须回到 agentSession/*
  -> RuntimeCore -> AsterBackend 主链验证。

用法:
  node scripts/plugin/ui-runtime-electron-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --fixture-dir <path>   fixture Plugin 目录
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
    if (arg === "--fixture-dir" && next) {
      options.fixtureDir = path.resolve(next.trim());
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
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!fs.existsSync(options.fixtureDir)) {
    throw new Error(`fixture Plugin 目录不存在: ${options.fixtureDir}`);
  }
  for (const fileName of ["APP.md", "package.json", "server.mjs"]) {
    const filePath = path.join(options.fixtureDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`fixture Plugin 缺少 ${fileName}: ${filePath}`);
    }
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
  console.log(`[smoke:plugin-ui-runtime-electron-fixture] stage=${stage}`);
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${sanitized.length - 2_000} chars]`
    : sanitized;
}

function sanitizeJson(value, depth = 0) {
  if (depth > 6) {
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
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
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

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plugin-ui-runtime-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const appDataDir = resolveTempPreferredDataDir({
    home,
    xdgDataHome,
    localAppData,
    platform: process.platform,
  });
  fs.mkdirSync(appDataDir, { recursive: true });

  return {
    tempRoot,
    appDataDir,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
}

function resolveTempPreferredDataDir({
  home,
  xdgDataHome,
  localAppData,
  platform,
}) {
  if (platform === "win32") {
    return path.join(localAppData, "lime");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "lime");
  }
  return path.join(xdgDataHome, "lime");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableStringifyPluginValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyPluginValue).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${stableStringifyPluginValue(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildPluginManifestHash(manifest) {
  return `manifest-fnv1a-${fnv1a(stableStringifyPluginValue(manifest))}`;
}

function buildPluginPackageHash({ manifest, sourceUri }) {
  return `package-fnv1a-${fnv1a(
    stableStringifyPluginValue({
      manifest,
      sourceUri,
    }),
  )}`;
}

function buildInstalledState(fixtureDir) {
  const now = new Date().toISOString();
  const manifest = {
    manifestVersion: "0.3",
    appId: APP_ID,
    displayName: "内容工厂",
    version: "0.3.0",
    status: "draft",
    appType: "domain-app",
    description: "Plugin UI runtime Electron fixture",
    runtimeTargets: ["local"],
    requires: {
      appRuntime: ">=0.3.0 <1.0.0",
      sdk: "@lime/app-sdk@^0.3.0",
      capabilities: {
        "lime.ui": "^0.3.0",
      },
    },
    runtimePackage: {
      ui: { path: "./dist/ui" },
    },
    permissions: [],
    entries: [
      {
        key: ENTRY_KEY,
        kind: "page",
        title: "项目首页",
        route: ENTRY_ROUTE,
        requiredCapabilities: [],
        permissions: [],
        enabledByDefault: true,
      },
    ],
    storage: {
      namespace: APP_ID,
      retention: "ask",
    },
    knowledgeTemplates: [],
    artifacts: [],
    policies: [],
    services: [],
    workflows: [],
    skillRefs: [],
    toolRefs: [],
    evals: [],
    events: [],
    secrets: [],
    overlayTemplates: [],
    lifecycle: {},
    install: {
      schemaVersion: 1,
      supportedModes: ["in_lime"],
      preferredMode: "in_lime",
      runtime: {
        minVersion: "0.3.0",
      },
      branding: {
        name: "内容工厂",
        windowTitle: "内容工厂",
      },
      compatibility: {},
    },
  };
  const identity = {
    appId: APP_ID,
    appVersion: manifest.version,
    sourceKind: "local_folder",
    sourceUri: fixtureDir,
    packageHash: buildPluginPackageHash({
      manifest,
      sourceUri: fixtureDir,
    }),
    manifestHash: buildPluginManifestHash(manifest),
    loadedAt: now,
  };
  const provenance = {
    sourceKind: "plugin",
    appId: APP_ID,
    appVersion: identity.appVersion,
    packageHash: identity.packageHash,
    manifestHash: identity.manifestHash,
  };
  const entry = {
    appId: APP_ID,
    key: ENTRY_KEY,
    kind: "page",
    title: "项目首页",
    route: ENTRY_ROUTE,
    presentation: "eligible-for-main-entry",
    readiness: "ready",
    requiredCapabilities: [],
    provenance: {
      ...provenance,
      entryKey: ENTRY_KEY,
    },
  };
  return {
    appId: APP_ID,
    identity,
    manifest,
    projection: {
      app: {
        appId: APP_ID,
        displayName: "内容工厂",
        version: identity.appVersion,
        status: "draft",
        appType: "domain-app",
        description: "Plugin UI runtime Electron fixture",
      },
      package: identity,
      entries: [entry],
      requiredCapabilities: [],
      runtimePackage: {
        hasUiBundle: true,
        hasWorkerBundle: false,
        uiPath: "./dist/ui",
      },
      storage: {
        namespace: APP_ID,
        retention: "ask",
      },
      knowledgeBindings: [],
      artifactTypes: [],
      policies: [],
      services: [],
      workflows: [],
      skillRequirements: [],
      toolRequirements: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
      lifecycle: {},
      install: {
        supportedModes: ["in_lime"],
        preferredMode: "in_lime",
        runtimeRequirements: [
          {
            mode: "in_lime",
            minVersion: "0.3.0",
          },
        ],
        shellRequirements: [],
        branding: {
          name: "内容工厂",
          windowTitle: "内容工厂",
        },
        warnings: [],
      },
      readinessHints: [
        {
          code: "ELECTRON_FIXTURE",
          message: "Fixture installed state for Electron UI runtime smoke.",
          severity: "info",
        },
      ],
      provenance,
    },
    readiness: {
      appId: APP_ID,
      status: "ready",
      checkedAt: now,
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [
        {
          entryKey: ENTRY_KEY,
          status: "ready",
          issues: [],
        },
      ],
      installModes: [
        {
          mode: "in_lime",
          status: "ready",
          runtimeVersion: RUNTIME_VERSION,
          blockers: [],
          warnings: [],
          setupActions: [],
          evidencePolicy: "required",
        },
      ],
    },
    installMode: "in_lime",
    runtimeProfileSummary: {
      installMode: "in_lime",
      shellKind: "desktop",
      runtimeVersion: RUNTIME_VERSION,
      runtimeMinVersion: "0.3.0",
      checkedAt: now,
    },
    setup: {},
    disabled: false,
    installedAt: now,
    updatedAt: now,
  };
}

function seedInstalledState(appDataDir, fixtureDir, evidenceDir, prefix) {
  const state = buildInstalledState(fixtureDir);
  const envelope = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    state,
  };
  const installedDir = path.join(appDataDir, "plugins", "installed");
  fs.mkdirSync(installedDir, { recursive: true });
  const installedPath = path.join(installedDir, `${APP_ID}.json`);
  fs.writeFileSync(installedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const evidenceSeedPath = path.join(
    evidenceDir,
    `${prefix}-installed-state-seed.json`,
  );
  fs.writeFileSync(evidenceSeedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  return { installedPath, evidenceSeedPath, state };
}

function invokeTraceEntriesFromStorage(value) {
  const entries = parseJson(value);
  return Array.isArray(entries) ? entries : [];
}

function collectAppServerInvokeEntries(traceEntries) {
  return traceEntries
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .map((entry) => {
      const requestMessages = decodeJsonRpcLines(
        entry?.args_preview?.request?.lines,
      );
      return {
        command: entry.command,
        transport: entry.transport ?? null,
        status: entry.status ?? null,
        appServerRequests: requestMessages
          .filter((message) => typeof message?.method === "string")
          .map((message) => ({
            id: message.id ?? null,
            method: message.method,
            params: sanitizeJson(message.params ?? {}),
          })),
      };
    });
}

function summarizeTraceEntries(traceEntries) {
  const appServerInvokeEntries = collectAppServerInvokeEntries(traceEntries);
  const appServerRequests = appServerInvokeEntries.flatMap(
    (entry) => entry.appServerRequests,
  );
  const appServerMethodsSeen = Array.from(
    new Set(appServerRequests.map((request) => request.method)),
  ).sort();
  const commandsSeen = Array.from(
    new Set(
      traceEntries
        .map((entry) =>
          typeof entry?.command === "string" ? entry.command : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  const legacyPluginCommandsSeen = LEGACY_PLUGIN_COMMANDS.filter(
    (command) => commandsSeen.includes(command),
  );
  const startRequests = appServerRequests.filter(
    (request) => request.method === "pluginUiRuntime/start",
  );

  return {
    appServerHandleJsonLinesSeen: appServerInvokeEntries.length > 0,
    appServerMethodsSeen,
    legacyPluginCommandsSeen,
    startRequestCount: startRequests.length,
    startRequests,
    missingRequiredAppServerMethods: REQUIRED_APP_SERVER_METHODS.filter(
      (method) => !appServerMethodsSeen.includes(method),
    ),
    optionalAppServerMethodsSeen: OPTIONAL_APP_SERVER_METHODS.filter((method) =>
      appServerMethodsSeen.includes(method),
    ),
    appServerInvokeEntries,
  };
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function evaluatePageSnapshot(page, pageFunction) {
  try {
    return await page.evaluate(pageFunction);
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
      bodyText: document.body?.innerText || "",
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
      !snapshot.startupVisible &&
      snapshot.appSidebarVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("Electron renderer invoke bridge / app sidebar 未就绪");
}

async function clearInvokeBuffers(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

async function waitForPluginSidebarEntry(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const entry = await evaluatePageSnapshot(page, () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const matched = buttons.find((button) => {
        const label = [button.getAttribute("title"), button.textContent]
          .filter(Boolean)
          .join(" ");
        return (
          label.includes("内容工厂") || label.includes("content-factory-app")
        );
      });
      if (!matched) {
        return null;
      }
      return {
        title: matched.getAttribute("title"),
        text: matched.textContent,
        ariaLabel: matched.getAttribute("aria-label"),
      };
    });
    if (entry) {
      return entry;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("未在正式侧栏观察到 fixture Plugin 入口");
}

async function clickPluginSidebarEntry(page) {
  const button = page
    .locator("button")
    .filter({ hasText: /内容工厂|content-factory-app/ })
    .first();
  if ((await button.count()) > 0) {
    await button.click();
    return;
  }
  const titled = page.locator('button[title*="内容工厂"]').first();
  if ((await titled.count()) > 0) {
    await titled.click();
    return;
  }
  throw new Error("fixture Plugin 侧栏按钮不可点击");
}

async function waitForRuntimeEvidence(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, async () => {
      const frame = document.querySelector(
        '[data-testid="plugin-runtime-frame"]',
      );
      const surface = document.querySelector(
        '[data-testid="plugin-runtime-surface"]',
      );
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      return {
        bodyText: document.body?.innerText || "",
        surfaceVisible: Boolean(surface),
        frameVisible: Boolean(frame),
        frameSrc: frame instanceof HTMLIFrameElement ? frame.src : null,
        traceRaw,
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }

    const traceEntries = invokeTraceEntriesFromStorage(snapshot.traceRaw);
    const traceSummary = summarizeTraceEntries(traceEntries);
    lastSnapshot = {
      ...snapshot,
      ...traceSummary,
      traceEntries: traceEntries.map(sanitizeJson),
    };

    const frameIsFixture =
      typeof snapshot.frameSrc === "string" &&
      snapshot.frameSrc.includes("127.0.0.1") &&
      snapshot.frameSrc.includes(ENTRY_ROUTE);
    if (
      snapshot.surfaceVisible &&
      snapshot.frameVisible &&
      frameIsFixture &&
      traceSummary.appServerHandleJsonLinesSeen &&
      traceSummary.missingRequiredAppServerMethods.length === 0 &&
      traceSummary.legacyPluginCommandsSeen.length === 0
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  return lastSnapshot;
}

async function waitForFixtureFrameContent(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(ENTRY_ROUTE));
    if (frame) {
      const text = await frame
        .locator("body")
        .innerText({ timeout: Math.min(options.intervalMs, 1_000) })
        .catch(() => "");
      if (text.includes("内容工厂") && text.includes("工作台状态")) {
        return {
          url: frame.url(),
          bodyTextPreview: sanitizeText(text.slice(0, 1_000)),
        };
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error("fixture iframe 未加载内容工厂页面正文");
}

async function stopRuntimeFromPage(page) {
  return await page.evaluate(
    async ({ appId }) => {
      return await window.electronAPI.invoke("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              jsonrpc: "2.0",
              id: "stop-plugin-ui-runtime",
              method: "pluginUiRuntime/stop",
              params: { appId },
            }),
          ],
        },
      });
    },
    { appId: APP_ID },
  );
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const tracePath = path.join(
    options.evidenceDir,
    `${options.prefix}-invoke-trace.json`,
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
  const seed = seedInstalledState(
    runtimeEnv.appDataDir,
    options.fixtureDir,
    options.evidenceDir,
    options.prefix,
  );
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: runtimeEnv.env,
  });
  const summary = {
    ok: false,
    appId: APP_ID,
    entryKey: ENTRY_KEY,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    fixtureDir: options.fixtureDir,
    appDataDir: options.keepTemp ? runtimeEnv.appDataDir : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    installedStatePath: options.keepTemp ? seed.installedPath : null,
    installedStateSeedEvidence: seed.evidenceSeedPath,
    electronPreloadBridge: false,
    sidebarEntryVisible: false,
    runtimeSurfaceVisible: false,
    runtimeFrameVisible: false,
    frameSrc: null,
    frameContent: null,
    appServerHandleJsonLinesSeen: false,
    appServerMethodsSeen: [],
    legacyPluginCommandsSeen: [],
    screenshot: null,
    trace: tracePath,
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

    logStage("wait-sidebar-entry");
    const sidebarEntry = await waitForPluginSidebarEntry(page, options);
    summary.sidebarEntryVisible = true;
    summary.sidebarEntry = sanitizeJson(sidebarEntry);

    logStage("open-runtime-page");
    await clickPluginSidebarEntry(page);

    logStage("wait-runtime-frame");
    const runtimeEvidence = await waitForRuntimeEvidence(page, options);
    assert(runtimeEvidence, "未收集到 Plugin runtime iframe 证据");
    Object.assign(summary, {
      runtimeSurfaceVisible: Boolean(runtimeEvidence.surfaceVisible),
      runtimeFrameVisible: Boolean(runtimeEvidence.frameVisible),
      frameSrc: runtimeEvidence.frameSrc,
      appServerHandleJsonLinesSeen: Boolean(
        runtimeEvidence.appServerHandleJsonLinesSeen,
      ),
      appServerMethodsSeen: runtimeEvidence.appServerMethodsSeen ?? [],
      legacyPluginCommandsSeen:
        runtimeEvidence.legacyPluginCommandsSeen ?? [],
      startRequestCount: runtimeEvidence.startRequestCount ?? 0,
      startRequests: sanitizeJson(runtimeEvidence.startRequests ?? []),
      optionalAppServerMethodsSeen:
        runtimeEvidence.optionalAppServerMethodsSeen ?? [],
    });

    logStage("wait-frame-content");
    summary.frameContent = await waitForFixtureFrameContent(page, options);

    logStage("stop-runtime");
    const stopResult = await stopRuntimeFromPage(page).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    summary.stopResult = sanitizeJson(stopResult);
    const finalTraceEntries = invokeTraceEntriesFromStorage(
      await page.evaluate(() =>
        window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
      ),
    );
    const finalTraceSummary = summarizeTraceEntries(finalTraceEntries);
    summary.appServerMethodsSeen = finalTraceSummary.appServerMethodsSeen;
    summary.optionalAppServerMethodsSeen =
      finalTraceSummary.optionalAppServerMethodsSeen;
    summary.legacyPluginCommandsSeen =
      finalTraceSummary.legacyPluginCommandsSeen;
    summary.appServerHandleJsonLinesSeen =
      finalTraceSummary.appServerHandleJsonLinesSeen;

    writeJsonFile(tracePath, {
      appServerInvokeEntries: finalTraceSummary.appServerInvokeEntries,
      traceEntries: finalTraceEntries.map(sanitizeJson),
    });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;

    assert(
      summary.electronPreloadBridge,
      "未检测到真实 Electron preload bridge",
    );
    assert(
      summary.sidebarEntryVisible,
      "正式侧栏未显示 fixture Plugin 入口",
    );
    assert(
      summary.runtimeSurfaceVisible,
      "正式 Plugin runtime surface 未出现",
    );
    assert(summary.runtimeFrameVisible, "正式 Plugin runtime iframe 未出现");
    assert(
      typeof summary.frameSrc === "string" &&
        summary.frameSrc.includes(ENTRY_ROUTE),
      `iframe src 未指向 fixture entry route: ${summary.frameSrc}`,
    );
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    for (const method of REQUIRED_APP_SERVER_METHODS) {
      assert(
        summary.appServerMethodsSeen.includes(method),
        `未观察到 App Server method: ${method}`,
      );
    }
    assert(
      summary.legacyPluginCommandsSeen.length === 0,
      `观察到 legacy Plugin 命令: ${summary.legacyPluginCommandsSeen.join(", ")}`,
    );
    assert(summary.frameContent, "未验证 fixture iframe 正文");

    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:plugin-ui-runtime-electron-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:plugin-ui-runtime-electron-fixture] frameSrc=${summary.frameSrc}`,
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
        summary.screenshot = failureScreenshotPath;
        writeJsonFile(summaryPath, summary);
      } catch {
        // 失败截图只是诊断证据，不能阻断错误上抛。
      }
    }
    console.error(
      `[smoke:plugin-ui-runtime-electron-fixture] summary=${summaryPath}`,
    );
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

await run();
