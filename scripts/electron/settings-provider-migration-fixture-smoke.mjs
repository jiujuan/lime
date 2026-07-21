#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  CUSTOM_MODEL_ID,
  CUSTOM_PROVIDER_NAME,
  CUSTOM_PROVIDER_TYPE,
  ELECTRON_REQUIRED_METHODS,
  SEED_REQUIRED_METHODS,
  UI_SELECTED_PROVIDER_KEY,
  applyFailedMigrationSurfaceEvidence,
  applyPassingMigrationSurfaceEvidence,
  assert,
  assertMigrationElectronEvidence,
  assertPermissionFailureElectronEvidence,
  createMigrationSurfaceEvidence,
  createTempRuntimeEnv,
  filterInvokeTraceEntriesSince,
  projectMigrationProviderInfo,
  readProductDbUserSchemaObjectCount,
  sanitizeJson,
  sanitizeText,
  seedOldProductDatabase,
  sha256File,
  summarizeMigrationElectronEvidence,
  summarizePermissionFailureElectronEvidence,
  markMigrationSurfaceEvidenceFail,
  markMigrationSurfaceEvidencePass,
  parseMigrationFixtureArgs,
  writeJsonFile,
} from "./lib/settings-provider-migration-fixture-core.mjs";

const DEFAULTS = {
  appUrl: "",
  evidenceDir: null,
  prefix: "settings-provider-migration-fixture",
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const LOG_PREFIX = "[smoke:settings-provider-migration-fixture]";

function printHelp() {
  console.log(`
Settings Provider Migration Electron Fixture Smoke

用途:
  在临时 Electron userData 根目录先创建旧 Product DB，再启动真实 Electron
  Desktop Host。Electron Host 会传入 userData/app-server 作为 App Server data-dir，
  本脚本验证旧 userData/lime.db 里的自定义 Provider、API Key 和 UI state 会迁移到
  userData/app-server/lime.db，并能被设置页 AI 服务商 GUI 读取。

边界:
  使用真实 Electron preload bridge 与 App Server JSON-RPC current method；
  APP_SERVER_BACKEND_MODE=unavailable，不调用正式模型后端，不使用 renderer mock、
  App Server mock backend 或旧 Provider facade 命令作为成功证据。

用法:
  node scripts/electron/settings-provider-migration-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --run-id <id>          Gate 项目 run-id；也可通过 LIME_GATE_RUN_ID 注入
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     轮询间隔，默认 250
  --keep-temp            保留临时目录便于调试
  -h, --help             显示帮助
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(stage) {
  console.log(`${LOG_PREFIX} stage=${stage}`);
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

async function waitForRendererReady(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
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

async function launchElectronFixture({
  options,
  runtimeEnv,
  appServerEnv,
  consoleErrors,
  pageErrors,
  rendererCrashes,
}) {
  const launchedAt = new Date().toISOString();
  const app = await electron.launch({
    executablePath: electronPath,
    args: ["--use-mock-keychain", "."],
    cwd: process.cwd(),
    env: {
      ...runtimeEnv.env,
      ...appServerEnv,
      APP_SERVER_BACKEND_MODE: "unavailable",
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

  const page = await app.firstWindow({ timeout: options.timeoutMs });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(sanitizeText(message.text()));
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(sanitizeText(error.message));
  });
  page.on("crash", () => {
    rendererCrashes.push("renderer-crash");
  });
  page.setDefaultTimeout(options.timeoutMs);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const rendererSnapshot = await waitForRendererReady(page, options);

  return { app, page, rendererSnapshot, launchedAt };
}

async function closeElectronFixture(handle) {
  if (handle?.app) {
    await handle.app.close().catch(() => undefined);
    await sleep(500);
  }
}

async function appServerCallFromPage(page, method, params = {}) {
  return await page.evaluate(
    async ({ command, method, params }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const id = `settings-provider-migration-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
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
      const decoded = Array.isArray(response?.lines)
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
      const error = decoded.find(
        (message) => message?.id === id && message.error,
      );
      if (error) {
        throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
      }
      const result = decoded.find(
        (message) =>
          message?.id === id &&
          Object.prototype.hasOwnProperty.call(message, "result"),
      );
      if (!result) {
        throw new Error(`${method} did not return a JSON-RPC result`);
      }
      return {
        method,
        result: result.result,
        decoded,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    { command: APP_SERVER_HANDLE_JSON_LINES_COMMAND, method, params },
  );
}

async function readInvokeBuffers(page) {
  return await page.evaluate(() => ({
    traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
  }));
}

async function waitForPageCondition(
  page,
  options,
  predicate,
  message,
  arg = {},
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(45_000, options.timeoutMs)) {
    const result = await evaluatePageSnapshot(page, predicate, arg);
    if (result) {
      return result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(message);
}

async function openProviderSettings(page, options) {
  const opened = await page.evaluate(() => {
    const accountButton = document.querySelector(
      '[data-testid="app-sidebar-account-button"]',
    );
    if (!(accountButton instanceof HTMLButtonElement)) {
      return { accountButton: false, menuItem: false };
    }
    accountButton.click();
    return { accountButton: true, menuItem: false };
  });
  assert(opened.accountButton, "未找到侧栏账号按钮");

  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(
        document.querySelector('[data-testid="app-sidebar-account-menu"]'),
      ),
    "账号菜单未打开",
  );

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => {
      const text = button.textContent || "";
      const aria = button.getAttribute("aria-label") || "";
      return /模型设置|AI 服务商|AI Providers|Model Settings/.test(
        `${text}\n${aria}`,
      );
    });
    if (!(target instanceof HTMLButtonElement)) {
      return false;
    }
    target.click();
    return true;
  });
  assert(clicked, "未找到账号菜单里的模型设置入口");

  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(document.querySelector('[data-testid="settings-top-header"]')),
    "设置页头部未挂载",
  );
  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(
        document.querySelector('[data-testid="api-key-provider-section"]') &&
        (document.querySelector('[data-testid="api-key-provider-detail"]') ||
          document.querySelector('[data-testid="provider-load-error"]')),
      ),
    "AI 服务商设置区域未挂载",
  );
}

async function waitForProviderVisible(page, options, providerId) {
  return await waitForPageCondition(
    page,
    options,
    ({ providerId, providerName, customModelId }) => {
      const item = document.querySelector(
        `[data-testid="enabled-model-item"][data-provider-id="${providerId}"]`,
      );
      const detail = document.querySelector(
        `[data-testid="provider-setting"][data-provider-id="${providerId}"]`,
      );
      const listText =
        document.querySelector('[data-testid="enabled-model-list"]')
          ?.textContent ?? "";
      const detailText =
        document.querySelector('[data-testid="api-key-provider-detail"]')
          ?.textContent ?? "";
      const providerNameText =
        document.querySelector('[data-testid="provider-name"]')?.textContent ??
        "";
      const visible =
        Boolean(item) &&
        Boolean(detail) &&
        listText.includes(providerName) &&
        listText.includes(customModelId) &&
        providerNameText.includes(providerName) &&
        detailText.includes(providerName);
      return visible
        ? {
            listText,
            detailText,
            providerNameText,
            itemSelected: item?.getAttribute("data-selected") ?? null,
          }
        : false;
    },
    `设置页未显示迁移后的 Provider: ${CUSTOM_PROVIDER_NAME}`,
    {
      providerId,
      providerName: CUSTOM_PROVIDER_NAME,
      customModelId: CUSTOM_MODEL_ID,
    },
  );
}

async function readProviderStateThroughElectron({
  handle,
  options,
  providerId,
}) {
  const { page, rendererSnapshot } = handle;
  const listResult = await appServerCallFromPage(
    page,
    "modelProvider/list",
    {},
  );
  const uiStateResult = await appServerCallFromPage(
    page,
    "modelProviderUiState/read",
    { key: UI_SELECTED_PROVIDER_KEY },
  );
  await openProviderSettings(page, options);
  const providerGui = await waitForProviderVisible(page, options, providerId);
  const guiInvokeBuffers = await readInvokeBuffers(page);
  const traceRaw = JSON.stringify(
    filterInvokeTraceEntriesSince(guiInvokeBuffers.traceRaw, handle.launchedAt),
  );
  const electronEvidence = summarizeMigrationElectronEvidence({
    listResult,
    uiStateResult,
    traceRaw,
  });

  return {
    renderer: rendererSnapshot.electron,
    preloadBridge:
      rendererSnapshot.electron && rendererSnapshot.hasInvokeBridge,
    providerVisibleInGui: true,
    providerGui,
    listResult,
    uiStateResult,
    electronEvidence,
    invokeErrors: filterInvokeTraceEntriesSince(
      guiInvokeBuffers.errorRaw,
      handle.launchedAt,
    ).map((entry) => sanitizeJson(entry)),
  };
}

async function readPermissionFailureThroughElectron({
  handle,
  options,
  consoleErrors,
}) {
  await openProviderSettings(handle.page, options);
  const gui = await waitForPageCondition(
    handle.page,
    options,
    () => {
      const error = document.querySelector(
        '[data-testid="provider-load-error"]',
      );
      const retry = document.querySelector(
        '[data-testid="provider-load-retry"]',
      );
      return error && retry
        ? {
            text: error.textContent ?? "",
            retryEnabled:
              !(retry instanceof HTMLButtonElement) || !retry.disabled,
          }
        : false;
    },
    "设置页未显示 Provider 数据目录权限错误",
  );
  const invokeBuffers = await readInvokeBuffers(handle.page);
  const electronEvidence = summarizePermissionFailureElectronEvidence({
    traceRaw: JSON.stringify(
      filterInvokeTraceEntriesSince(invokeBuffers.traceRaw, handle.launchedAt),
    ),
    errorRaw: JSON.stringify(
      filterInvokeTraceEntriesSince(invokeBuffers.errorRaw, handle.launchedAt),
    ),
    consoleErrors,
  });
  assertPermissionFailureElectronEvidence(electronEvidence);
  return { gui, electronEvidence };
}

async function run() {
  const options = parseMigrationFixtureArgs(process.argv.slice(2), {
    defaults: DEFAULTS,
    printHelp,
  });
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const rawEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-raw.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}.png`,
  );
  const restartScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-restart.png`,
  );
  const permissionScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-permission-failure.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );

  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });

  const summary = {
    ...createMigrationSurfaceEvidence(options.runId),
    ok: false,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    appUrlReady: null,
    backendMode: "unavailable",
    electronRenderer: false,
    electronPreloadBridge: false,
    electronIpcSeen: false,
    appServerHandleJsonLinesSeen: false,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    oldProductDbPath: options.keepTemp
      ? runtimeEnv.oldProductDbPath
      : path.basename(runtimeEnv.oldProductDbPath),
    migratedProductDbPath: options.keepTemp
      ? runtimeEnv.migratedProductDbPath
      : path.join("app-server", "lime.db"),
    appServerBinary: options.keepTemp
      ? appServerBinary
      : path.basename(appServerBinary),
    seedRequiredMethods: SEED_REQUIRED_METHODS,
    electronRequiredMethods: ELECTRON_REQUIRED_METHODS,
    providerId: null,
    providerName: CUSTOM_PROVIDER_NAME,
    providerVisibleInGui: false,
    migrationManifestExists: false,
    migrationManifest: null,
    oldProductDbExists: false,
    oldProductDbUserSchemaObjectCount: null,
    migratedProductDbExists: false,
    migratedProviderSummary: null,
    uiStateSelectedProvider: null,
    electronRequestMethods: [],
    legacyProviderCommandsSeen: [],
    consoleErrors: [],
    pageErrors: [],
    invokeErrors: [],
    rendererCrashCount: 0,
    screenshot: null,
    restartVerified: false,
    restartElectronRenderer: false,
    restartElectronPreloadBridge: false,
    restartElectronIpcSeen: false,
    restartAppServerHandleJsonLinesSeen: false,
    restartProviderVisibleInGui: false,
    restartMigratedProviderSummary: null,
    restartUiStateSelectedProvider: null,
    restartElectronRequestMethods: [],
    restartLegacyProviderCommandsSeen: [],
    restartScreenshot: null,
    permissionFailureVerified: false,
    permissionPlatform: process.platform,
    permissionElectronRenderer: false,
    permissionElectronPreloadBridge: false,
    permissionElectronIpcSeen: false,
    permissionAppServerHandleJsonLinesSeen: false,
    permissionFailedRequestMethods: [],
    permissionInvokeErrorCount: 0,
    permissionFailureCauseSeen: false,
    permissionUserVisible: false,
    permissionSourceUnchanged: false,
    permissionSourceSchemaObjectCount: null,
    permissionMigrationManifestExists: null,
    permissionMigratedProductDbExists: null,
    permissionConsoleErrorCount: 0,
    permissionPageErrorCount: 0,
    permissionRendererCrashCount: 0,
    permissionScreenshot: null,
    rawEvidence: path.basename(rawEvidencePath),
    summary: path.basename(summaryPath),
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];
  const rendererCrashes = [];
  const permissionConsoleErrors = [];
  const permissionPageErrors = [];
  const permissionRendererCrashes = [];
  const rawEvidence = {};
  let permissionRuntimeEnv = null;
  let permissionSourceHash = null;

  try {
    logStage("wait-app-url");
    summary.appUrlReady = await waitForAppUrlReady(options);

    logStage("seed-old-product-database");
    const seed = await seedOldProductDatabase({
      appServerBinary,
      runtimeEnv,
      options,
    });
    rawEvidence.seed = sanitizeJson(seed);
    summary.providerId = seed.providerId;
    summary.oldProductDbExists = fs.existsSync(runtimeEnv.oldProductDbPath);
    assert(summary.oldProductDbExists, "旧 Product DB 未创建");

    assert(
      process.platform !== "win32",
      "SHELL-02 Windows 权限注入尚未实现，禁止用 chmod 场景冒充 Windows 证据",
    );
    logStage("seed-permission-failure-product-database");
    permissionRuntimeEnv = createTempRuntimeEnv();
    const permissionSeed = await seedOldProductDatabase({
      appServerBinary,
      runtimeEnv: permissionRuntimeEnv,
      options,
    });
    rawEvidence.permissionSeed = sanitizeJson({
      providerId: permissionSeed.providerId,
      requiredMethods: SEED_REQUIRED_METHODS,
    });
    permissionSourceHash = sha256File(permissionRuntimeEnv.oldProductDbPath);

    logStage("launch-electron-and-trigger-migration");
    const handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
      rendererCrashes,
    });
    app = handle.app;
    page = handle.page;

    logStage("read-migrated-provider-through-electron");
    const migrationRead = await readProviderStateThroughElectron({
      handle,
      options,
      providerId: seed.providerId,
    });
    rawEvidence.electronList = sanitizeJson(migrationRead.listResult);
    rawEvidence.electronUiState = sanitizeJson(migrationRead.uiStateResult);
    rawEvidence.providerGui = sanitizeJson(migrationRead.providerGui);
    rawEvidence.electronRequests = sanitizeJson(
      migrationRead.electronEvidence.requests,
    );
    summary.electronRenderer = migrationRead.renderer;
    summary.electronPreloadBridge = migrationRead.preloadBridge;
    summary.providerVisibleInGui = migrationRead.providerVisibleInGui;
    summary.electronIpcSeen = migrationRead.electronEvidence.electronIpcSeen;
    summary.appServerHandleJsonLinesSeen =
      migrationRead.electronEvidence.appServerHandleJsonLinesSeen;
    summary.electronRequestMethods =
      migrationRead.electronEvidence.electronIpcRequestMethods;
    summary.legacyProviderCommandsSeen =
      migrationRead.electronEvidence.legacyProviderCommandsSeen;
    summary.migratedProviderSummary = sanitizeJson(
      projectMigrationProviderInfo(
        migrationRead.electronEvidence.migratedProvider,
      ),
    );
    summary.uiStateSelectedProvider =
      migrationRead.electronEvidence.selectedProviderValue;
    summary.invokeErrors = migrationRead.invokeErrors;
    assertMigrationElectronEvidence(
      migrationRead.electronEvidence,
      seed.providerId,
      "迁移后",
    );
    summary.migrationManifestExists = fs.existsSync(
      runtimeEnv.migrationManifestPath,
    );
    if (summary.migrationManifestExists) {
      const manifest = JSON.parse(
        fs.readFileSync(runtimeEnv.migrationManifestPath, "utf8"),
      );
      summary.migrationManifest = {
        schemaVersion: manifest.schemaVersion,
        migrationId: manifest.migrationId,
        state: manifest.state,
        mode: manifest.mode,
        targetRelativePath: manifest.target?.relativePath,
        sourceSha256Length:
          manifest.source?.snapshot?.fingerprint?.sha256?.length,
        targetSha256Length:
          manifest.target?.snapshot?.fingerprint?.sha256?.length,
        cleanupAuthorizedAt: manifest.cleanupAuthorizedAt,
      };
    }
    summary.oldProductDbExists = fs.existsSync(runtimeEnv.oldProductDbPath);
    summary.oldProductDbUserSchemaObjectCount =
      readProductDbUserSchemaObjectCount(runtimeEnv);
    summary.migratedProductDbExists = fs.existsSync(
      runtimeEnv.migratedProductDbPath,
    );

    assert(
      summary.migrationManifestExists,
      "迁移后 app-server data-dir 未写入 migration-manifest.json",
    );
    assert(
      summary.migrationManifest?.schemaVersion === "storage-migration.v1" &&
        summary.migrationManifest?.migrationId === "database-path-v1" &&
        summary.migrationManifest?.state === "completed" &&
        summary.migrationManifest?.mode === "copied" &&
        summary.migrationManifest?.targetRelativePath === "lime.db" &&
        summary.migrationManifest?.sourceSha256Length === 64 &&
        summary.migrationManifest?.targetSha256Length === 64 &&
        summary.migrationManifest?.cleanupAuthorizedAt === null,
      `迁移 manifest 契约不完整: ${JSON.stringify(summary.migrationManifest)}`,
    );
    assert(summary.migratedProductDbExists, "迁移目标 Product DB 未创建");
    assert(
      summary.oldProductDbExists &&
        summary.oldProductDbUserSchemaObjectCount > 0,
      `迁移启动流程修改了旧 Product DB: exists=${summary.oldProductDbExists} schemaObjects=${summary.oldProductDbUserSchemaObjectCount}`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await clearInvokeBuffers(page);
    await closeElectronFixture(handle);
    app = null;
    page = null;

    logStage("restart-electron-with-same-user-data");
    const restartHandle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
      rendererCrashes,
    });
    app = restartHandle.app;
    page = restartHandle.page;

    logStage("read-persisted-provider-after-restart");
    const restartRead = await readProviderStateThroughElectron({
      handle: restartHandle,
      options,
      providerId: seed.providerId,
    });
    rawEvidence.restartElectronList = sanitizeJson(restartRead.listResult);
    rawEvidence.restartElectronUiState = sanitizeJson(
      restartRead.uiStateResult,
    );
    rawEvidence.restartProviderGui = sanitizeJson(restartRead.providerGui);
    rawEvidence.restartElectronRequests = sanitizeJson(
      restartRead.electronEvidence.requests,
    );
    summary.restartElectronRenderer = restartRead.renderer;
    summary.restartElectronPreloadBridge = restartRead.preloadBridge;
    summary.restartElectronIpcSeen =
      restartRead.electronEvidence.electronIpcSeen;
    summary.restartAppServerHandleJsonLinesSeen =
      restartRead.electronEvidence.appServerHandleJsonLinesSeen;
    summary.restartProviderVisibleInGui = restartRead.providerVisibleInGui;
    summary.restartMigratedProviderSummary = sanitizeJson(
      projectMigrationProviderInfo(
        restartRead.electronEvidence.migratedProvider,
      ),
    );
    summary.restartUiStateSelectedProvider =
      restartRead.electronEvidence.selectedProviderValue;
    summary.restartElectronRequestMethods =
      restartRead.electronEvidence.electronIpcRequestMethods;
    summary.restartLegacyProviderCommandsSeen =
      restartRead.electronEvidence.legacyProviderCommandsSeen;
    summary.invokeErrors.push(...restartRead.invokeErrors);
    assertMigrationElectronEvidence(
      restartRead.electronEvidence,
      seed.providerId,
      "重启后",
    );

    await page.screenshot({ path: restartScreenshotPath, fullPage: true });
    await closeElectronFixture(restartHandle);
    app = null;
    page = null;
    summary.restartVerified = true;

    fs.chmodSync(permissionRuntimeEnv.appServerDataDir, 0o555);

    logStage("launch-electron-with-read-only-app-server-data-dir");
    const permissionHandle = await launchElectronFixture({
      options,
      runtimeEnv: permissionRuntimeEnv,
      appServerEnv,
      consoleErrors: permissionConsoleErrors,
      pageErrors: permissionPageErrors,
      rendererCrashes: permissionRendererCrashes,
    });
    app = permissionHandle.app;
    page = permissionHandle.page;

    logStage("observe-user-visible-permission-failure");
    const permissionRead = await readPermissionFailureThroughElectron({
      handle: permissionHandle,
      options,
      consoleErrors: permissionConsoleErrors,
    });
    rawEvidence.permissionGui = sanitizeJson(permissionRead.gui);
    rawEvidence.permissionRequests = sanitizeJson(
      permissionRead.electronEvidence.requests.map(
        ({ command, transport, status, method }) => ({
          command,
          transport,
          status,
          method,
        }),
      ),
    );
    summary.permissionElectronRenderer =
      permissionHandle.rendererSnapshot.electron;
    summary.permissionElectronPreloadBridge =
      permissionHandle.rendererSnapshot.electron &&
      permissionHandle.rendererSnapshot.hasInvokeBridge;
    summary.permissionElectronIpcSeen =
      permissionRead.electronEvidence.electronIpcSeen;
    summary.permissionAppServerHandleJsonLinesSeen =
      permissionRead.electronEvidence.appServerHandleJsonLinesSeen;
    summary.permissionFailedRequestMethods =
      permissionRead.electronEvidence.failedRequestMethods;
    summary.permissionInvokeErrorCount =
      permissionRead.electronEvidence.invokeErrorCount;
    summary.permissionFailureCauseSeen =
      permissionRead.electronEvidence.failureCauseSeen;
    summary.permissionUserVisible = true;

    await page.screenshot({ path: permissionScreenshotPath, fullPage: true });
    await closeElectronFixture(permissionHandle);
    app = null;
    page = null;
    fs.chmodSync(permissionRuntimeEnv.appServerDataDir, 0o755);

    summary.permissionSourceUnchanged =
      sha256File(permissionRuntimeEnv.oldProductDbPath) ===
      permissionSourceHash;
    summary.permissionSourceSchemaObjectCount =
      readProductDbUserSchemaObjectCount(permissionRuntimeEnv);
    summary.permissionMigrationManifestExists = fs.existsSync(
      permissionRuntimeEnv.migrationManifestPath,
    );
    summary.permissionMigratedProductDbExists = fs.existsSync(
      permissionRuntimeEnv.migratedProductDbPath,
    );
    summary.permissionConsoleErrorCount = permissionConsoleErrors.length;
    summary.permissionPageErrorCount = permissionPageErrors.length;
    summary.permissionRendererCrashCount = permissionRendererCrashes.length;
    summary.permissionScreenshot = path.basename(permissionScreenshotPath);
    summary.permissionFailureVerified = true;

    summary.consoleErrors = consoleErrors;
    summary.pageErrors = pageErrors;
    summary.rendererCrashCount = rendererCrashes.length;
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );
    assert(
      pageErrors.length === 0,
      `观察到 page error: ${pageErrors.join(" | ")}`,
    );
    assert(
      summary.invokeErrors.length === 0,
      `观察到 invoke error: ${summary.invokeErrors.length}`,
    );
    assert(
      rendererCrashes.length === 0,
      `观察到 renderer crash: ${rendererCrashes.length}`,
    );

    summary.screenshot = path.basename(screenshotPath);
    summary.restartScreenshot = path.basename(restartScreenshotPath);
    applyPassingMigrationSurfaceEvidence(summary, {
      migrationScreenshotPath: screenshotPath,
      restartScreenshotPath,
      permissionScreenshotPath,
    });
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(rawEvidencePath, rawEvidence);
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} provider=${seed.providerId}`);
  } catch (error) {
    summary.consoleErrors = consoleErrors;
    summary.pageErrors = pageErrors;
    summary.rendererCrashCount = rendererCrashes.length;
    applyFailedMigrationSurfaceEvidence(summary, error);
    if (Object.keys(rawEvidence).length > 0) {
      writeJsonFile(rawEvidencePath, rawEvidence);
    }
    writeJsonFile(summaryPath, summary);
    if (page) {
      try {
        await page.screenshot({
          path: failureScreenshotPath,
          fullPage: true,
        });
        summary.failureScreenshot = path.basename(failureScreenshotPath);
        writeJsonFile(summaryPath, summary);
      } catch {
        // 截图失败不覆盖原始错误。
      }
    }
    throw error;
  } finally {
    if (app) {
      await closeElectronFixture({ app });
    }
    if (permissionRuntimeEnv) {
      fs.chmodSync(permissionRuntimeEnv.appServerDataDir, 0o755);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
      if (permissionRuntimeEnv) {
        fs.rmSync(permissionRuntimeEnv.tempRoot, {
          recursive: true,
          force: true,
        });
      }
    }
  }
}

run().catch((error) => {
  console.error(
    `${LOG_PREFIX} failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
