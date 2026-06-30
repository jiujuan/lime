#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import {
  APP_SERVER_METHOD_SESSION_LIST,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO,
  DEFAULTS,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  IMAGE_COMMAND_SCENARIO,
  LOG_PREFIX,
  NEWS_PROMPT,
  RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
  SESSION_ID,
  THREAD_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { buildFixtureAssertionReport } from "./claw-chat-current-fixture-assertions.mjs";
import {
  collectAppServerTraceEvidence,
  collectAgentUiPerformanceTraceEvidence,
  enableClawTraceDebugOverride,
} from "./claw-chat-current-fixture-agent-ui-trace.mjs";
import { createTempRuntimeEnv } from "./claw-chat-current-fixture-backend-file.mjs";
import {
  sanitizeBackendLedgerForEvidence,
  summarizeBackendLedger,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  bindGuiWorkspaceAndModelPreferences,
  clearInvokeBuffers,
  ensureDefaultWorkspace,
  initializeAppServer,
  invokeAppServerFromPage,
  readTraceMessages,
  waitForAppUrlReady,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { executeScenarioFlow } from "./claw-chat-current-fixture-scenario-flow.mjs";
import {
  createFixtureSession,
  navigateGuiToWorkspaceScopedAgent,
  openFixtureSessionFromSidebar,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  cleanupTempRoot,
  isIgnorableConsoleError,
  logStage,
  readJsonl,
  sanitizeJson,
  sanitizeText,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

function printHelp() {
  console.log(`
Claw Chat Current Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，通过 GUI 输入框发送“${NEWS_PROMPT}”，
  并验证 Frontend -> Electron IPC -> App Server JSON-RPC -> external fixture backend
  的 current 主链可以完成用户消息、assistant 输出和 read model 收尾。

边界:
  本脚本使用一次性本地 external backend fixture，不调用正式模型后端，不使用
  APP_SERVER_BACKEND_MODE=mock，不走 Tauri / legacy runtime command / renderer
  mock fallback 作为成功证据。

用法:
  node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --scenario <name>      complete | cancel | cancel-then-continue | plan | goal | image-command | web-tools-rendering | mcp-structured-content | skills-runtime | expert-skills-runtime | expert-plaza-skills-runtime | expert-panel-skills-runtime | right-surface-visual-matrix | content-factory-article-workspace，默认 complete
  --timeout-ms <ms>      总超时，默认 180000
  --interval-ms <ms>     轮询间隔，默认 500
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
    if (arg === "--scenario" && next) {
      options.scenario = next.trim();
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
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  const allowedScenarios = [
    "complete",
    "cancel",
    "cancel-then-continue",
    "plan",
    "goal",
    IMAGE_COMMAND_SCENARIO,
    "web-tools-rendering",
    "mcp-structured-content",
    "skills-runtime",
    "expert-skills-runtime",
    "expert-plaza-skills-runtime",
    "expert-panel-skills-runtime",
    RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO,
  ];
  if (!allowedScenarios.includes(options.scenario)) {
    throw new Error(`--scenario 只能是 ${allowedScenarios.join("、")}`);
  }
  return options;
}

function traceEvidenceHasProviderAndClient(evidence) {
  return (
    evidence?.hasProviderWaitMs === true &&
    evidence?.hasClientLocalOutputMs === true
  );
}

async function updateAgentUiPerformanceTraceEvidence(summary, page) {
  const evidence = sanitizeJson(
    await collectAgentUiPerformanceTraceEvidence(page),
  );
  summary.agentUiPerformanceTraceLatest = evidence;
  if (
    !summary.agentUiPerformanceTrace ||
    !traceEvidenceHasProviderAndClient(summary.agentUiPerformanceTrace) ||
    traceEvidenceHasProviderAndClient(evidence)
  ) {
    summary.agentUiPerformanceTrace = evidence;
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    options.prefix + "-summary.json",
  );
  const backendLedgerEvidencePath = path.join(
    options.evidenceDir,
    options.prefix + "-backend-ledger.json",
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    options.prefix + "-chat.png",
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    options.prefix + "-failure.png",
  );

  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });
  const appServerRequests = [];
  const summary = {
    ok: false,
    scenarioId: "claw-chat-current-fixture",
    scenario: options.scenario,
    prompt: NEWS_PROMPT,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    workspaceId: null,
    workspace: null,
    provider: FIXTURE_PROVIDER,
    model: FIXTURE_MODEL,
    appUrl: options.appUrl || null,
    checkedAt: new Date().toISOString(),
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLedgerPath: options.keepTemp ? runtimeEnv.backendLedgerPath : null,
    backendLedger: backendLedgerEvidencePath,
    screenshot: null,
    consoleErrors: [],
    rendererSnapshot: null,
    initialize: null,
    guiWorkspaceBinding: null,
    sessionCreation: null,
    guiWorkspaceNavigation: null,
    guiSessionVisible: null,
    guiSessionOpened: null,
    inputSend: null,
    guiCompleted: null,
    stopClick: null,
    guiCanceled: null,
    continueInputSend: null,
    guiContinueCompleted: null,
    planModeEnabled: null,
    planInputSend: null,
    guiPlanCompleted: null,
    goalModeEnabled: null,
    goalInputSend: null,
    guiGoalCompleted: null,
    webToolsRenderingInputSend: null,
    guiWebToolsRenderingCompleted: null,
    skillsRuntimeInputSend: null,
    guiSkillsRuntimeCompleted: null,
    explicitSkillsRuntimeInputSend: null,
    guiExplicitSkillsRuntimeCompleted: null,
    manualEnableSkillsRuntimeTurnStart: null,
    manualEnableSkillsRuntimeSkill: null,
    guiManualEnableSkillsRuntimeCompleted: null,
    readModelCompleted: null,
    readModelCanceled: null,
    readModelContinueCompleted: null,
    readModelPlanCompleted: null,
    readModelGoalCompleted: null,
    readModelWebToolsRenderingCompleted: null,
    imageCommandInputSend: null,
    imageCommandBackendTurnStart: null,
    imageCommandTaskCreateRequest: null,
    imageCommandTaskArtifact: null,
    imageCommandTaskArtifactTerminalPatch: null,
    imageCommandTaskArtifactTerminal: null,
    guiImageCommandCompleted: null,
    guiImageCommandTerminal: null,
    guiImageCommandReload: null,
    guiImageCommandRestoredAfterReload: null,
    imageCommandTaskArtifactAfterReload: null,
    readModelImageCommandCompleted: null,
    readModelSkillsRuntimeCompleted: null,
    readModelExplicitSkillsRuntimeCompleted: null,
    readModelManualEnableSkillsRuntimeCompleted: null,
    expertSkillsRuntimeSessionCreation: null,
    rightSurfaceVisualMatrixSessionCreation: null,
    guiRightSurfaceVisualMatrixSessionVisible: null,
    guiRightSurfaceVisualMatrixSessionOpened: null,
    rightSurfaceVisualMatrix: null,
    contentFactoryArticleWorkspaceSessionCreation: null,
    contentFactoryArticleWorkspaceInstalledStateSave: null,
    contentFactoryArticleWorkspaceRuntimeEventsAppend: null,
    contentFactoryArticleWorkspaceWorkerTurnStart: null,
    contentFactoryArticleWorkspaceRightSurfaceRequest: null,
    guiContentFactoryArticleWorkspaceSessionVisible: null,
    guiContentFactoryArticleWorkspaceSessionOpened: null,
    contentFactoryArticleWorkspaceRightSurface: null,
    contentFactoryArticleWorkspaceGui: null,
    contentFactoryArticleWorkspaceEditedDraftUpdate: null,
    contentFactoryArticleWorkspaceEditedDraftReload: null,
    contentFactoryArticleWorkspaceEditedDraftSessionReopened: null,
    contentFactoryArticleWorkspaceEditedDraftArtifactFrame: null,
    contentFactoryArticleWorkspaceEditedDraftRestored: null,
    contentFactoryArticleWorkspaceReadModel: null,
    contentFactoryArticleWorkspaceArtifactRead: null,
    expertSkillsRuntimeSkill: null,
    expertSkillsRuntimeTurnStart: null,
    expertPlazaSkillsRuntimeCatalog: null,
    expertPlazaSkillsRuntimeLaunch: null,
    guiExpertSkillsRuntimeSessionVisible: null,
    guiExpertSkillsRuntimeSessionOpened: null,
    guiExpertSkillsRuntimeCompleted: null,
    readModelExpertSkillsRuntimeCompleted: null,
    evidencePackSkillsRuntime: null,
    evidencePackExplicitSkillsRuntime: null,
    evidencePackManualEnableSkillsRuntime: null,
    evidencePackExpertSkillsRuntime: null,
    eventReadProbe: null,
    clawTraceDebugOverride: null,
    agentUiPerformanceTrace: null,
    agentUiPerformanceTraceLatest: null,
    appServerTraceEvidence: null,
    assertions: {},
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const actionableConsoleErrors = [];
  const agentDebugLogs = [];
  const pageLifecycleEvents = [];
  const collectConsoleMessage = (message) => {
    const text = sanitizeText(message.text());
    if (text.includes("[AgentDebug]")) {
      agentDebugLogs.push({ type: message.type(), text });
    }
    if (message.type() === "error") {
      consoleErrors.push(text);
      if (!isIgnorableConsoleError(text)) {
        actionableConsoleErrors.push(text);
      }
    }
  };

  try {
    if (options.appUrl) {
      logStage("wait-app-url");
      summary.rendererDevServer = sanitizeJson(
        await waitForAppUrlReady(options),
      );
    }

    logStage("launch-electron");
    app = await electron.launch({
      executablePath: electronPath,
      args: ["--use-mock-keychain", "."],
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        ...appServerEnv,
        APP_SERVER_BACKEND_MODE: "external",
        APP_SERVER_BACKEND_COMMAND: process.execPath,
        APP_SERVER_BACKEND_ARGS: JSON.stringify([
          runtimeEnv.backendPath,
          runtimeEnv.backendLedgerPath,
          runtimeEnv.cancelSignalPath,
          runtimeEnv.imageTaskFixturePath,
        ]),
        APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
        CLAW_CHAT_FIXTURE_SCENARIO: options.scenario,
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
        LIME_REAL_API_TEST: "0",
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
        LIME_TRACE_EXPORT_OUTPUT_DIR: path.join(
          runtimeEnv.tempRoot,
          "trace-exports",
        ),
        LIME_SUPPORT_BUNDLE_OUTPUT_DIR: path.join(
          runtimeEnv.tempRoot,
          "support-bundles",
        ),
        ...(options.appUrl ? { VITE_DEV_SERVER_URL: options.appUrl } : {}),
      },
      timeout: options.timeoutMs,
    });

    app.on("console", collectConsoleMessage);
    app.on("close", () => {
      pageLifecycleEvents.push({
        type: "electron-app-close",
        timestamp: new Date().toISOString(),
      });
    });

    page = await app.firstWindow({ timeout: options.timeoutMs });
    page.on("console", collectConsoleMessage);
    page.on("close", () => {
      pageLifecycleEvents.push({
        type: "page-close",
        timestamp: new Date().toISOString(),
      });
    });
    page.on("crash", () => {
      pageLifecycleEvents.push({
        type: "page-crash",
        timestamp: new Date().toISOString(),
      });
    });
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

    logStage("enable-claw-trace-debug-override");
    summary.clawTraceDebugOverride = sanitizeJson(
      await enableClawTraceDebugOverride(page, options),
    );

    logStage("wait-renderer");
    const rendererSnapshot = await waitForRendererReady(
      page,
      options,
      (snapshot) => {
        summary.rendererSnapshot = sanitizeJson(snapshot);
      },
    );
    summary.rendererSnapshot = sanitizeJson(rendererSnapshot);
    await clearInvokeBuffers(page);

    logStage("initialize-app-server");
    summary.initialize = sanitizeJson(
      await initializeAppServer(page, appServerRequests),
    );

    logStage("ensure-default-workspace");
    const workspace = await ensureDefaultWorkspace(page, appServerRequests);
    summary.workspaceId = workspace.workspaceId;
    summary.workspace = sanitizeJson(workspace);

    logStage("bind-gui-workspace-model");
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceAndModelPreferences(page, workspace.workspaceId),
    );

    logStage("create-fixture-session");
    const sessionCreation = await createFixtureSession(
      page,
      workspace,
      appServerRequests,
    );
    summary.sessionCreation = sanitizeJson({
      sessionId:
        sessionCreation.session?.session?.sessionId ??
        sessionCreation.session?.sessionId ??
        null,
      updatedSessionId:
        sessionCreation.update?.session?.sessionId ??
        sessionCreation.update?.sessionId ??
        null,
    });

    logStage("verify-session-list");
    const sessionList = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      { includeArchived: true, cwd: workspace.rootPath, limit: 20 },
      appServerRequests,
    );
    summary.sessionListVisibility = sanitizeJson({
      count: Array.isArray(sessionList.result?.sessions)
        ? sessionList.result.sessions.length
        : null,
      containsFixtureSession: Array.isArray(sessionList.result?.sessions)
        ? sessionList.result.sessions.some(
            (session) =>
              session?.sessionId === SESSION_ID ||
              session?.session_id === SESSION_ID ||
              session?.id === SESSION_ID,
          )
        : false,
    });

    logStage("navigate-gui-workspace");
    summary.guiWorkspaceNavigation = sanitizeJson(
      await navigateGuiToWorkspaceScopedAgent(
        page,
        options,
        workspace.workspaceId,
      ),
    );

    logStage("open-session-from-sidebar");
    summary.guiSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(page, options),
    );
    summary.guiSessionOpened = sanitizeJson(
      await openFixtureSessionFromSidebar(page, options, appServerRequests),
    );

    await executeScenarioFlow({
      page,
      options,
      workspace,
      summary,
      appServerRequests,
      runtimeEnv,
    });

    const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
    writeJsonFile(
      backendLedgerEvidencePath,
      sanitizeBackendLedgerForEvidence(backendLedger),
    );
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    summary.appServerTraceEvidence = sanitizeJson(
      await collectAppServerTraceEvidence(page, appServerRequests),
    );
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const errorRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_error_buffer_v1"),
    );
    const traceMessages = readTraceMessages(traceRaw);
    await updateAgentUiPerformanceTraceEvidence(summary, page);
    const assertionReport = buildFixtureAssertionReport({
      backendLedger,
      traceMessages,
      appServerRequests,
      rendererSnapshot,
      summary,
      pageText,
      errorRaw,
      actionableConsoleErrors,
      workspace,
      options,
    });

    try {
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        timeout: 15_000,
      });
      summary.screenshot = screenshotPath;
    } catch (screenshotError) {
      summary.screenshotError = sanitizeText(screenshotError);
    }
    summary.consoleErrors = consoleErrors;
    summary.actionableConsoleErrors = actionableConsoleErrors;
    summary.agentDebugLogs = agentDebugLogs.slice(-200);
    summary.agentStreamDebugLogs = agentDebugLogs
      .filter((entry) => entry.text.includes("[AgentDebug] AgentStream."))
      .slice(-200);
    summary.pageLifecycleEvents = pageLifecycleEvents;
    summary.appServerRequestMethods = assertionReport.appServerRequestMethods;
    summary.backend = sanitizeJson(assertionReport.backendSummary);
    summary.assertions = assertionReport.assertions;
    summary.commonAssertions = assertionReport.commonAssertions;
    summary.scenarioAssertions = assertionReport.scenarioAssertions;
    summary.notApplicableAssertions = assertionReport.notApplicableAssertions;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(LOG_PREFIX + " summary=" + summaryPath);
    console.log(LOG_PREFIX + " pass session=" + SESSION_ID);
  } catch (error) {
    try {
      if (page) {
        const traceRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        );
        const errorRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_error_buffer_v1"),
        );
        summary.invokeTrace = sanitizeJson(readTraceMessages(traceRaw));
        summary.invokeErrors = sanitizeJson(
          (() => {
            try {
              return JSON.parse(errorRaw || "[]");
            } catch {
              return errorRaw;
            }
          })(),
        );
        await updateAgentUiPerformanceTraceEvidence(summary, page);
        summary.appServerTraceEvidence = sanitizeJson(
          await collectAppServerTraceEvidence(page, appServerRequests),
        );
      }
    } catch (traceError) {
      summary.invokeTraceError = sanitizeText(traceError);
    }
    try {
      const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
      writeJsonFile(
        backendLedgerEvidencePath,
        sanitizeBackendLedgerForEvidence(backendLedger),
      );
      summary.backend = sanitizeJson(summarizeBackendLedger(backendLedger));
    } catch (ledgerError) {
      summary.backendLedgerError = sanitizeText(ledgerError);
    }
    summary.error = sanitizeText(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    summary.consoleErrors = consoleErrors;
    summary.actionableConsoleErrors = actionableConsoleErrors;
    summary.agentDebugLogs = agentDebugLogs.slice(-200);
    summary.agentStreamDebugLogs = agentDebugLogs
      .filter((entry) => entry.text.includes("[AgentDebug] AgentStream."))
      .slice(-200);
    summary.pageLifecycleEvents = pageLifecycleEvents;
    try {
      if (page) {
        await page.screenshot({
          path: failureScreenshotPath,
          fullPage: true,
          timeout: 15_000,
        });
        summary.screenshot = failureScreenshotPath;
      }
    } catch (screenshotError) {
      summary.screenshotError = sanitizeText(screenshotError);
    }
    writeJsonFile(summaryPath, summary);
    console.error(summary.error);
    console.error(LOG_PREFIX + " failureSummary=" + summaryPath);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      cleanupTempRoot(runtimeEnv.tempRoot);
    }
  }
}

await run();
