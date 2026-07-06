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
  CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO,
  DEFAULTS,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  IMAGE_COMMAND_SCENARIO,
  INPUTBAR_RICH_RESTORE_PROMPT,
  INPUTBAR_RICH_RESTORE_SCENARIO,
  LOG_PREFIX,
  MULTI_AGENT_TEAM_SCENARIO,
  NEWS_PROMPT,
  PLAIN_IMAGE_INTENT_SCENARIO,
  RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
  SESSION_ID,
  SOUL_STYLE_SCENARIO,
  THREAD_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { buildFixtureAssertionReport } from "./claw-chat-current-fixture-assertions.mjs";
import {
  collectAppServerTraceEvidence,
  collectAgentUiPerformanceTraceEvidence,
  enableClawTraceDebugOverride,
} from "./claw-chat-current-fixture-agent-ui-trace.mjs";
import {
  createTempRuntimeEnv,
  LOCAL_IMAGE_SERVER_API_KEY,
  startImageProviderFixtureServer,
  startTextProviderFixtureServer,
} from "./claw-chat-current-fixture-backend-file.mjs";
import {
  sanitizeBackendLedgerForEvidence,
  summarizeBackendLedger,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  bindGuiWorkspaceAndModelPreferences,
  clearInvokeBuffers,
  ensureDefaultWorkspace,
  ensureFixtureImageProvider,
  ensureFixtureTextProvider,
  initializeAppServer,
  invokeAppServerFromPage,
  readTraceMessages,
  waitForAppUrlReady,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { executeScenarioFlow } from "./claw-chat-current-fixture-scenario-flow.mjs";
import {
  DEFAULT_SOUL_STYLE_FIXTURE_INTENSITY,
  DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID,
  createSoulStyleFixtureOverrides,
  createSoulStyleFixtureSelection,
  isSoulStylePromptContextCoveredByRuntime,
  pickLatestSoulStylePromptMarkers,
} from "./claw-chat-current-fixture-soul-style.mjs";
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
  并验证 Frontend -> Electron IPC -> App Server JSON-RPC -> current runtime
  的主链可以完成用户消息、assistant 输出和 read model 收尾。

边界:
  普通聊天场景使用一次性本地 external backend fixture；图片命令场景使用
  APP_SERVER_BACKEND_MODE=runtime 以验证 App Server ImageCommandWorkflow。
  全部场景均不调用正式模型后端，不使用 APP_SERVER_BACKEND_MODE=mock，
  不走 Tauri / legacy runtime command / renderer mock fallback 作为成功证据。

用法:
  node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --scenario <name>      complete | cancel | cancel-then-continue | inputbar-rich-restore | plan | goal | soul-style | image-command | plain-image-intent | web-tools-rendering | mcp-structured-content | skills-runtime | multi-agent-team | expert-skills-runtime | expert-plaza-skills-runtime | expert-panel-skills-runtime | right-surface-visual-matrix | content-factory-article-workspace | content-factory-inline-image-article-workspace，默认 complete
  --soul-style-profile <id>   soul-style 场景使用的 profile，默认 ${DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID}
  --soul-style-intensity <v>  soul-style 场景使用的强度，默认 ${DEFAULT_SOUL_STYLE_FIXTURE_INTENSITY}
  --timeout-ms <ms>      总超时，默认 180000
  --interval-ms <ms>     轮询间隔，默认 500
  --keep-temp            保留临时目录便于调试
  -h, --help             显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    soulStyleProfileId: DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID,
    soulStyleIntensity: DEFAULT_SOUL_STYLE_FIXTURE_INTENSITY,
  };
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
    if (arg === "--soul-style-profile" && next) {
      options.soulStyleProfileId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--soul-style-intensity" && next) {
      options.soulStyleIntensity = next.trim();
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
    INPUTBAR_RICH_RESTORE_SCENARIO,
    "plan",
    "goal",
    SOUL_STYLE_SCENARIO,
    IMAGE_COMMAND_SCENARIO,
    PLAIN_IMAGE_INTENT_SCENARIO,
    "web-tools-rendering",
    "mcp-structured-content",
    "skills-runtime",
    MULTI_AGENT_TEAM_SCENARIO,
    "expert-skills-runtime",
    "expert-plaza-skills-runtime",
    "expert-panel-skills-runtime",
    RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
    CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO,
    CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO,
  ];
  if (!allowedScenarios.includes(options.scenario)) {
    throw new Error(`--scenario 只能是 ${allowedScenarios.join("、")}`);
  }
  createSoulStyleFixtureSelection({
    profileId: options.soulStyleProfileId,
    intensity: options.soulStyleIntensity,
  });
  return options;
}

function traceEvidenceHasProviderAndClient(evidence) {
  return (
    evidence?.hasProviderWaitMs === true &&
    evidence?.hasClientLocalOutputMs === true
  );
}

function applySoulStyleProviderMarkerSummary(summary, textProviderRequests) {
  const soulMarkers = pickLatestSoulStylePromptMarkers(textProviderRequests);
  summary.soulStylePromptContextCoveredByRuntime =
    isSoulStylePromptContextCoveredByRuntime(soulMarkers);
  summary.soulStylePromptContextMarkers = sanitizeJson(soulMarkers ?? null);
}

function isImageWorkflowScenario(scenario) {
  return (
    scenario === IMAGE_COMMAND_SCENARIO ||
    scenario === PLAIN_IMAGE_INTENT_SCENARIO
  );
}

function shouldUseTextProviderFixture(scenario) {
  return (
    isImageWorkflowScenario(scenario) ||
    scenario === SOUL_STYLE_SCENARIO ||
    scenario === INPUTBAR_RICH_RESTORE_SCENARIO
  );
}

function resolveScenarioBackendEnv(options, runtimeEnv) {
  if (isImageWorkflowScenario(options.scenario)) {
    return {
      APP_SERVER_BACKEND_MODE: "runtime",
      APP_SERVER_BACKEND_COMMAND: "",
      APP_SERVER_BACKEND_ARGS: "",
      APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
    };
  }
  if (
    options.scenario === SOUL_STYLE_SCENARIO ||
    options.scenario === CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO ||
    options.scenario === CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO
  ) {
    return {
      APP_SERVER_BACKEND_MODE: "runtime",
      APP_SERVER_BACKEND_COMMAND: "",
      APP_SERVER_BACKEND_ARGS: "",
      APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
    };
  }

  return {
    APP_SERVER_BACKEND_MODE: "external",
    APP_SERVER_BACKEND_COMMAND: process.execPath,
    APP_SERVER_BACKEND_ARGS: JSON.stringify([
      runtimeEnv.backendPath,
      runtimeEnv.backendLedgerPath,
      runtimeEnv.cancelSignalPath,
    ]),
    APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
  };
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
  const soulStyleSelection =
    options.scenario === SOUL_STYLE_SCENARIO
      ? createSoulStyleFixtureSelection({
          profileId: options.soulStyleProfileId,
          intensity: options.soulStyleIntensity,
        })
      : null;
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
  const scenarioBackendEnv = resolveScenarioBackendEnv(options, runtimeEnv);
  const appServerRequests = [];
  const summary = {
    ok: false,
    scenarioId: "claw-chat-current-fixture",
    scenario: options.scenario,
    prompt:
      options.scenario === INPUTBAR_RICH_RESTORE_SCENARIO
        ? INPUTBAR_RICH_RESTORE_PROMPT
        : NEWS_PROMPT,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    workspaceId: null,
    workspace: null,
    provider: FIXTURE_PROVIDER,
    model: FIXTURE_MODEL,
    backendMode: scenarioBackendEnv.APP_SERVER_BACKEND_MODE,
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
    imageFixtureProvider: null,
    soulStyleExpectation: soulStyleSelection
      ? sanitizeJson(soulStyleSelection)
      : null,
    soulStyleConfig: null,
    soulStylePromptContextCoveredByRuntime: false,
    guiWorkspaceBinding: null,
    sessionCreation: null,
    guiWorkspaceNavigation: null,
    guiSessionVisible: null,
    guiSessionOpened: null,
    inputSend: null,
    guiCompleted: null,
    stopClick: null,
    guiCanceled: null,
    inputbarRichRestoreSkill: null,
    inputbarRichRestoreDraftPrepared: null,
    inputbarRichRestoreInputSend: null,
    inputbarRichRestoreBackendTurnStart: null,
    inputbarRichRestoreStopClick: null,
    inputbarRichRestoreGuiCanceled: null,
    inputbarRichRestoreReadModelCanceled: null,
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
    multiAgentTeamInputSend: null,
    guiMultiAgentTeamCompleted: null,
    readModelMultiAgentTeamCompleted: null,
    evidencePackMultiAgentTeam: null,
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
    contentFactoryArticleWorkspaceWorkerHostGenerationFixture: null,
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
    contentFactoryArticleWorkspaceWorkflowRead: null,
    contentFactoryArticleWorkspaceWorkflowRespond: null,
    contentFactoryArticleWorkspaceWorkflowCancel: null,
    contentFactoryArticleWorkspaceWorkflowRetry: null,
    contentFactoryInlineImageEditedDraftUpdate: null,
    contentFactoryInlineImageTaskCreated: null,
    contentFactoryInlineImageTaskSubmittedEvent: null,
    contentFactoryInlineImageTaskCompleted: null,
    contentFactoryInlineImageReload: null,
    contentFactoryInlineImageCanvas: null,
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
  let imageProviderFixtureServer = null;
  let textProviderFixtureServer = null;
  let chatProviderPreference = {
    provider: FIXTURE_PROVIDER,
    model: FIXTURE_MODEL,
  };
  const consoleErrors = [];
  const actionableConsoleErrors = [];
  const agentDebugLogs = [];
  const pageLifecycleEvents = [];
  const fixtureConfigSoulOverrides =
    createSoulStyleFixtureOverrides(soulStyleSelection);
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
    imageProviderFixtureServer = await startImageProviderFixtureServer();
    if (shouldUseTextProviderFixture(options.scenario)) {
      textProviderFixtureServer = await startTextProviderFixtureServer({
        soulStyleExpectation: soulStyleSelection,
      });
      summary.textProviderFixtureServer = sanitizeJson({
        baseUrl: textProviderFixtureServer.baseUrl,
        requestCount: 0,
      });
    }
    runtimeEnv.writeFixtureConfig?.({
      serverHost: imageProviderFixtureServer.host,
      serverPort: imageProviderFixtureServer.port,
      serverApiKey: LOCAL_IMAGE_SERVER_API_KEY,
      ...fixtureConfigSoulOverrides,
    });
    summary.imageProviderFixtureServer = sanitizeJson({
      baseUrl: imageProviderFixtureServer.baseUrl,
      requestCount: 0,
    });

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
        ...scenarioBackendEnv,
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

    if (options.scenario === SOUL_STYLE_SCENARIO) {
      logStage("enable-soul-style-config");
      runtimeEnv.writeFixtureConfig(fixtureConfigSoulOverrides);
      summary.soulStyleConfig = sanitizeJson(
        await page.evaluate(
          async ({ profileId, intensity }) => {
            const currentConfig = await window.electronAPI.invoke("get_config");
            const nextConfig = {
              ...(currentConfig || {}),
              memory: {
                ...(currentConfig?.memory || {}),
                enabled: true,
                soul: {
                  ...(currentConfig?.memory?.soul || {}),
                  enabled: true,
                  style_profile_id: profileId,
                  style_intensity: intensity,
                  imported_from: "manual",
                },
              },
            };
            await window.electronAPI.invoke("save_config", {
              config: nextConfig,
            });
            window.localStorage.setItem(
              "lime.app-config.changed-at",
              String(Date.now()),
            );
            window.dispatchEvent(new Event("lime:app-config-changed"));
            return nextConfig.memory.soul;
          },
          {
            profileId: soulStyleSelection.profileId,
            intensity: soulStyleSelection.intensity,
          },
        ),
      );
    }

    logStage("ensure-fixture-image-provider");
    const imageFixtureProvider = await ensureFixtureImageProvider(
      page,
      appServerRequests,
      {
        apiHost: imageProviderFixtureServer.baseUrl,
        localImageServerApiKey: LOCAL_IMAGE_SERVER_API_KEY,
        localImageServerHost: imageProviderFixtureServer.host,
        localImageServerPort: imageProviderFixtureServer.port,
      },
    );
    runtimeEnv.writeFixtureConfig({
      serverHost: imageProviderFixtureServer.host,
      serverPort: imageProviderFixtureServer.port,
      serverApiKey: LOCAL_IMAGE_SERVER_API_KEY,
      imageProviderId: imageFixtureProvider.providerId,
      imageModelId: imageFixtureProvider.modelId,
      ...fixtureConfigSoulOverrides,
    });
    summary.imageFixtureProvider = sanitizeJson({
      ...imageFixtureProvider,
      appServerConfigBinding: {
        providerId: imageFixtureProvider.providerId,
        modelId: imageFixtureProvider.modelId,
        configPath: runtimeEnv.configPath,
        macConfigPath: runtimeEnv.macConfigPath,
      },
    });

    if (textProviderFixtureServer) {
      logStage("ensure-fixture-text-provider");
      const textFixtureProvider = await ensureFixtureTextProvider(
        page,
        appServerRequests,
        {
          apiHost: textProviderFixtureServer.baseUrl,
        },
      );
      chatProviderPreference = {
        provider: textFixtureProvider.providerId,
        model: textFixtureProvider.modelId,
      };
      summary.textFixtureProvider = sanitizeJson(textFixtureProvider);
    }

    logStage("bind-gui-workspace-model");
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceAndModelPreferences(
        page,
        workspace.workspaceId,
        chatProviderPreference,
      ),
    );

    logStage("create-fixture-session");
    const sessionCreation = await createFixtureSession(
      page,
      workspace,
      appServerRequests,
      chatProviderPreference,
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
    summary.imageProviderFixtureServer = sanitizeJson({
      baseUrl: imageProviderFixtureServer.baseUrl,
      requestCount: imageProviderFixtureServer.requestCount(),
      requests: imageProviderFixtureServer.requests(),
    });
    if (textProviderFixtureServer) {
      const textProviderRequests = textProviderFixtureServer.requests();
      summary.textProviderFixtureServer = sanitizeJson({
        baseUrl: textProviderFixtureServer.baseUrl,
        requestCount: textProviderFixtureServer.requestCount(),
        requests: textProviderRequests,
      });
      if (options.scenario === SOUL_STYLE_SCENARIO) {
        applySoulStyleProviderMarkerSummary(summary, textProviderRequests);
      }
    }
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
    if (imageProviderFixtureServer) {
      summary.imageProviderFixtureServer = sanitizeJson({
        baseUrl: imageProviderFixtureServer.baseUrl,
        requestCount: imageProviderFixtureServer.requestCount(),
        requests: imageProviderFixtureServer.requests(),
      });
    }
    if (textProviderFixtureServer) {
      const textProviderRequests = textProviderFixtureServer.requests();
      summary.textProviderFixtureServer = sanitizeJson({
        baseUrl: textProviderFixtureServer.baseUrl,
        requestCount: textProviderFixtureServer.requestCount(),
        requests: textProviderRequests,
      });
      if (options.scenario === SOUL_STYLE_SCENARIO) {
        applySoulStyleProviderMarkerSummary(summary, textProviderRequests);
      }
    }
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
    if (imageProviderFixtureServer) {
      await imageProviderFixtureServer.close().catch(() => undefined);
    }
    if (textProviderFixtureServer) {
      await textProviderFixtureServer.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      cleanupTempRoot(runtimeEnv.tempRoot);
    }
  }
}

await run();
