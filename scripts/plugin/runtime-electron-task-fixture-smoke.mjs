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
  timeoutMs: 120_000,
  intervalMs: 250,
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "plugin-runtime-electron-task-fixture",
  ),
  prefix: "plugin-runtime-electron-task-fixture",
  keepTemp: false,
};

const APP_ID = "content-factory-app";
const ENTRY_KEY = "writer";
const WORKSPACE_ID = "workspace-plugin-task-fixture";
const SESSION_ID = "plugin-electron-task-session";
const TASK_ID = "plugin-electron-task-1";
const TURN_ID = "plugin-electron-turn-1";
const REQUEST_ID = "plugin-electron-request-1";
const TASK_KIND = "content_factory.write";
const EVENT_NAME = `plugin_runtime:${APP_ID}:${TASK_ID}`;
const HOST_RESPONSE_EVENT_NAME = `${EVENT_NAME}:host_response`;
const RUNTIME_COMMANDS = [
  "plugin_runtime_start_task",
  "plugin_runtime_get_task",
  "plugin_runtime_submit_host_response",
  "plugin_runtime_cancel_task",
];
const REQUIRED_BACKEND_KINDS = ["turnStart", "actionRespond", "turnCancel"];

function printHelp() {
  console.log(`
Plugin Runtime Electron Task Fixture Smoke

用途:
  启动真实 Electron Desktop Host，在 renderer 内直接调用
  plugin_runtime_start_task / get_task / submit_host_response / cancel_task，
  并注入临时 external backend，验证 Electron Host facade 经 App Server
  JSON-RPC agentSession/* 主链到达 RuntimeCore/backend。

说明:
  本脚本不使用 renderer mock、default mock、DevBridge mock 或 legacy
  agent_runtime_* 命令。external backend 是一次性本地命令 fixture，用于
  证明真实 app-server sidecar 已收到 turnStart / actionRespond / turnCancel。

用法:
  node scripts/plugin/runtime-electron-task-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --timeout-ms <ms>      总超时，默认 120000
  --interval-ms <ms>     轮询间隔，默认 250
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
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
  console.log(`[smoke:plugin-runtime-electron-task-fixture] stage=${stage}`);
}

function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
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
        .slice(0, 160)
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plugin-runtime-electron-task-"),
  );
  const home = ensureDir(path.join(tempRoot, "home"));
  const xdgDataHome = ensureDir(path.join(tempRoot, "xdg-data"));
  const localAppData = ensureDir(path.join(tempRoot, "local-app-data"));
  const roamingAppData = ensureDir(path.join(tempRoot, "roaming-app-data"));
  const electronUserDataDir = ensureDir(
    path.join(tempRoot, "electron-user-data"),
  );
  const agentRoot = ensureDir(path.join(tempRoot, "agent"));

  return {
    tempRoot,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_AGENT_RUNTIME_ROOT: agentRoot,
    },
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

async function captureRendererSnapshot(page) {
  return await evaluatePageSnapshot(
    page,
    (commands) => {
      const electronApi = window.electronAPI;
      const commandSupport = Object.fromEntries(
        commands.map((command) => [
          command,
          Boolean(electronApi?.supportsCommand?.(command)),
        ]),
      );
      return {
        url: window.location.href,
        title: document.title || "",
        readyState: document.readyState,
        electron: window.__LIME_ELECTRON__ === true,
        hasElectronApi: Boolean(electronApi),
        electronApiKeys:
          electronApi && typeof electronApi === "object"
            ? Object.keys(electronApi).sort()
            : [],
        hasInvokeBridge: typeof electronApi?.invoke === "function",
        hasSupportsCommand: typeof electronApi?.supportsCommand === "function",
        commandSupport,
        startupVisible: Boolean(
          document.querySelector("[data-lime-startup-shell]"),
        ),
        appSidebarVisible: Boolean(
          document.querySelector('[data-testid="app-sidebar"]'),
        ),
        rootVisible: Boolean(document.querySelector("#root")),
        bodyText: document.body?.innerText || "",
      };
    },
    RUNTIME_COMMANDS,
  );
}

async function waitForRendererReady(page, options, onSnapshot) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await captureRendererSnapshot(page);
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    onSnapshot?.(snapshot);
    if (
      snapshot.electron &&
      snapshot.hasInvokeBridge &&
      !snapshot.startupVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    "Electron renderer invoke bridge / Plugin runtime commands 未就绪",
  );
}

async function runTaskLifecycleFromPage(page) {
  return await page.evaluate(
    async ({
      appId,
      entryKey,
      workspaceId,
      sessionId,
      taskId,
      turnId,
      requestId,
      taskKind,
      eventName,
      hostResponseEventName,
      commands,
    }) => {
      const api = window.electronAPI;
      if (!api || typeof api.invoke !== "function") {
        throw new Error("Electron invoke bridge is unavailable");
      }
      const commandSupport = Object.fromEntries(
        commands.map((command) => [
          command,
          Boolean(api.supportsCommand?.(command)),
        ]),
      );
      const start = await api.invoke("plugin_runtime_start_task", {
        request: {
          appId,
          entryKey,
          workspaceId,
          sessionId,
          taskId,
          taskKind,
          title: "Electron Plugin task fixture",
          prompt: "生成一段 Electron Host bridge fixture 文案",
          input: {
            topic: "Electron Desktop Host current bridge",
            requestedOutputs: ["draft", "action_required", "cancel"],
          },
          expectedOutput: {
            artifactKind: "markdown",
            actionRequestId: requestId,
          },
          eventName,
          turnId,
          queueIfBusy: true,
          skipPreSubmitResume: false,
          metadata: {
            smoke: "plugin-runtime-electron-task-fixture",
          },
          runtimeRequest: {
            providerConfig: {
              providerName: "fixture-provider",
              modelName: "fixture-model",
            },
            systemPrompt: "Plugin task fixture system prompt",
            reasoningEffort: "medium",
            sandboxPolicy: "workspace-write",
            metadata: {
              fixtureRuntimeRequest: true,
            },
          },
        },
      });
      const firstSnapshot = await api.invoke("plugin_runtime_get_task", {
        request: { appId, taskId, sessionId },
      });
      const hostResponse = await api.invoke(
        "plugin_runtime_submit_host_response",
        {
          request: {
            appId,
            taskId,
            runtimeRequest: {
              session_id: sessionId,
              request_id: requestId,
              action_type: "ask_user",
              confirmed: true,
              response: "继续",
              event_name: hostResponseEventName,
              action_scope: {
                session_id: sessionId,
                turn_id: turnId,
              },
              metadata: {
                smoke: "plugin-runtime-electron-task-fixture",
              },
            },
          },
        },
      );
      const secondSnapshot = await api.invoke("plugin_runtime_get_task", {
        request: { appId, taskId, sessionId },
      });
      const cancel = await api.invoke("plugin_runtime_cancel_task", {
        request: { appId, taskId, sessionId, turnId },
      });
      const finalSnapshot = await api.invoke("plugin_runtime_get_task", {
        request: { appId, taskId, sessionId },
      });

      return {
        commandSupport,
        start,
        firstSnapshot,
        hostResponse,
        secondSnapshot,
        cancel,
        finalSnapshot,
      };
    },
    {
      appId: APP_ID,
      entryKey: ENTRY_KEY,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      turnId: TURN_ID,
      requestId: REQUEST_ID,
      taskKind: TASK_KIND,
      eventName: EVENT_NAME,
      hostResponseEventName: HOST_RESPONSE_EVENT_NAME,
      commands: RUNTIME_COMMANDS,
    },
  );
}

function readBackendLogEntries(backendLogPath) {
  if (!fs.existsSync(backendLogPath)) {
    return [];
  }
  return fs
    .readFileSync(backendLogPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJson)
    .filter(Boolean);
}

function summarizeBackendLog(entries) {
  const backendKindsSeen = Array.from(
    new Set(entries.map((entry) => entry.kind).filter(Boolean)),
  ).sort();
  const turnStart = entries.find((entry) => entry.kind === "turnStart");
  const actionRespond = entries.find((entry) => entry.kind === "actionRespond");
  const turnCancel = entries.find((entry) => entry.kind === "turnCancel");
  return {
    backendKindsSeen,
    missingBackendKinds: REQUIRED_BACKEND_KINDS.filter(
      (kind) => !backendKindsSeen.includes(kind),
    ),
    runtimeRequestSeen: Boolean(turnStart?.runtimeRequestSeen),
    runtimeRequestProviderConfigSeen: Boolean(
      turnStart?.runtimeRequestProviderConfigSeen,
    ),
    startSessionId: turnStart?.sessionId ?? null,
    startTurnId: turnStart?.turnId ?? null,
    actionRequestId: actionRespond?.requestId ?? null,
    actionConfirmed: actionRespond?.confirmed ?? null,
    cancelTurnId: turnCancel?.turnId ?? null,
  };
}

async function waitForBackendKinds(backendLogPath, options) {
  const startedAt = Date.now();
  let entries = readBackendLogEntries(backendLogPath);
  while (Date.now() - startedAt < options.timeoutMs) {
    const summary = summarizeBackendLog(entries);
    if (summary.missingBackendKinds.length === 0) {
      return entries;
    }
    await sleep(options.intervalMs);
    entries = readBackendLogEntries(backendLogPath);
  }
  return entries;
}

function taskSnapshotTurns(snapshot) {
  const turns = snapshot?.threadRead?.turns;
  return Array.isArray(turns) ? turns : [];
}

function assertTaskLifecycleResult(result, backendSummary) {
  for (const command of RUNTIME_COMMANDS) {
    assert(
      result.commandSupport?.[command] === true,
      `Electron Host command 未注册: ${command}`,
    );
  }
  assert(result.start?.status === "accepted", "start_task 未返回 accepted");
  assert(result.start?.sessionId === SESSION_ID, "start_task sessionId 不正确");
  assert(result.start?.turnId === TURN_ID, "start_task turnId 不正确");
  assert(result.start?.eventName === EVENT_NAME, "start_task eventName 不正确");

  assert(
    result.firstSnapshot?.status === "thread_read_available",
    "get_task 未返回 thread_read_available",
  );
  assert(
    result.firstSnapshot?.taskStatus === "blocked",
    `首次 get_task taskStatus 应为 blocked，实际 ${result.firstSnapshot?.taskStatus}`,
  );
  assert(
    taskSnapshotTurns(result.firstSnapshot).some(
      (turn) => turn?.turnId === TURN_ID || turn?.turn_id === TURN_ID,
    ),
    "首次 get_task threadRead 未包含目标 turn",
  );

  assert(
    result.hostResponse?.status === "submitted",
    "submit_host_response 未返回 submitted",
  );
  assert(
    result.secondSnapshot?.taskStatus === "running",
    `submit_host_response 后 taskStatus 应为 running，实际 ${result.secondSnapshot?.taskStatus}`,
  );

  assert(
    result.cancel?.cancelled === true,
    "cancel_task 未返回 cancelled=true",
  );
  assert(result.cancel?.status === "cancelled", "cancel_task status 不正确");
  assert(
    result.finalSnapshot?.taskStatus === "cancelled",
    `最终 get_task taskStatus 应为 cancelled，实际 ${result.finalSnapshot?.taskStatus}`,
  );

  assert(
    backendSummary.missingBackendKinds.length === 0,
    `external backend 未收到: ${backendSummary.missingBackendKinds.join(", ")}`,
  );
  assert(
    backendSummary.runtimeRequestSeen,
    "turnStart 未携带 RuntimeOptions.runtimeRequest",
  );
  assert(
    backendSummary.runtimeRequestProviderConfigSeen,
    "turnStart 未携带 RuntimeRequest.providerConfig",
  );
  assert(
    backendSummary.startSessionId === SESSION_ID,
    "external backend turnStart sessionId 不正确",
  );
  assert(
    backendSummary.startTurnId === TURN_ID,
    "external backend turnStart turnId 不正确",
  );
  assert(
    backendSummary.actionRequestId === REQUEST_ID,
    "external backend actionRespond requestId 不正确",
  );
  assert(
    backendSummary.actionConfirmed === true,
    "external backend actionRespond confirmed 不正确",
  );
  assert(
    backendSummary.cancelTurnId === TURN_ID,
    "external backend turnCancel turnId 不正确",
  );
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeExternalBackend(backendPath) {
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const logPath = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8"));
const request = input.request ?? {};
const kind = input.kind;

function writeLog(entry) {
  appendFileSync(logPath, JSON.stringify(entry) + "\\n");
}

function sessionId() {
  return request.session?.sessionId ?? request.session?.session_id ?? null;
}

function turnId() {
  return request.turn?.turnId ?? request.turn?.turn_id ?? null;
}

function runtimeOptions() {
  return request.runtimeOptions ?? request.runtime_options ?? {};
}

function runtimeRequest() {
  return runtimeOptions().runtimeRequest ?? runtimeOptions().runtime_request ?? null;
}

writeLog({
  kind,
  sessionId: sessionId(),
  turnId: turnId(),
  inputText: request.input?.text ?? null,
  eventName: request.eventName ?? null,
  providerPreference: request.providerPreference ?? null,
  modelPreference: request.modelPreference ?? null,
  runtimeRequestSeen: Boolean(runtimeRequest()),
  runtimeRequestProviderConfigSeen: Boolean(runtimeRequest()?.providerConfig),
  runtimeRequestWorkspaceId: runtimeRequest()?.workspaceId ?? null,
  requestId: request.requestId ?? null,
  actionType: request.actionType ?? null,
  confirmed: request.confirmed ?? null,
  actionScopeTurnId: request.actionScope?.turnId ?? null,
});

if (kind === "turnStart") {
  console.log(JSON.stringify({
    events: [
      {
        type: "turn.started",
        payload: {
          backend: "external-plugin-task-fixture",
          sessionId: sessionId(),
          turnId: turnId(),
        },
      },
      {
        type: "action.required",
        payload: {
          backend: "external-plugin-task-fixture",
          requestId: "${REQUEST_ID}",
          actionType: "ask_user",
          message: "确认 Electron Plugin task fixture 继续",
        },
      },
    ],
  }));
  process.exit(0);
}

if (kind === "actionRespond") {
  console.log(JSON.stringify({
    events: [
      {
        type: "action.resolved",
        payload: {
          backend: "external-plugin-task-fixture",
          requestId: request.requestId,
          confirmed: request.confirmed,
        },
      },
      {
        type: "message.delta",
        payload: {
          backend: "external-plugin-task-fixture",
          text: "host response accepted",
        },
      },
    ],
  }));
  process.exit(0);
}

if (kind === "turnCancel") {
  console.log(JSON.stringify({
    events: [
      {
        type: "turn.canceled",
        payload: {
          backend: "external-plugin-task-fixture",
          sessionId: sessionId(),
          turnId: turnId(),
        },
      },
    ],
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
  );
  fs.chmodSync(backendPath, 0o755);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const backendLogEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-log.json`,
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
  const backendPath = path.join(
    runtimeEnv.tempRoot,
    "plugin-task-backend.mjs",
  );
  const backendLogPath = path.join(runtimeEnv.tempRoot, "backend-log.jsonl");
  writeExternalBackend(backendPath);

  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: runtimeEnv.env,
  });
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appId: APP_ID,
    taskId: TASK_ID,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    requestId: REQUEST_ID,
    appUrl: options.appUrl || null,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendPath: options.keepTemp ? backendPath : null,
    backendLogPath: options.keepTemp ? backendLogPath : null,
    electronPreloadBridge: false,
    commandSupport: {},
    taskLifecycle: null,
    backendSummary: null,
    backendLog: backendLogEvidencePath,
    rendererSnapshot: null,
    screenshot: null,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  let lastRendererSnapshot = null;
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
        APP_SERVER_BACKEND_MODE: "external",
        APP_SERVER_BACKEND_COMMAND: process.execPath,
        APP_SERVER_BACKEND_ARGS: JSON.stringify([backendPath, backendLogPath]),
        APP_SERVER_BACKEND_TIMEOUT_MS: "10000",
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
    const rendererSnapshot = await waitForRendererReady(
      page,
      options,
      (snapshot) => {
        lastRendererSnapshot = sanitizeJson(snapshot);
        summary.rendererSnapshot = lastRendererSnapshot;
      },
    );
    summary.electronPreloadBridge =
      rendererSnapshot.electron && rendererSnapshot.hasInvokeBridge;
    summary.commandSupport = rendererSnapshot.commandSupport;
    summary.rendererSnapshot = sanitizeJson(rendererSnapshot);

    logStage("run-task-lifecycle");
    const taskLifecycle = await runTaskLifecycleFromPage(page);
    const backendEntries = await waitForBackendKinds(backendLogPath, options);
    const backendSummary = summarizeBackendLog(backendEntries);
    assertTaskLifecycleResult(taskLifecycle, backendSummary);

    summary.taskLifecycle = sanitizeJson(taskLifecycle);
    summary.backendSummary = sanitizeJson(backendSummary);
    summary.consoleErrors = consoleErrors;
    summary.screenshot = screenshotPath;
    writeJsonFile(backendLogEvidencePath, backendEntries.map(sanitizeJson));
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert(
      summary.electronPreloadBridge,
      "未检测到真实 Electron preload bridge",
    );
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:plugin-runtime-electron-task-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:plugin-runtime-electron-task-fixture] backendLog=${backendLogEvidencePath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.rendererSnapshot = lastRendererSnapshot;
    summary.backendSummary = sanitizeJson(
      summarizeBackendLog(readBackendLogEntries(backendLogPath)),
    );
    writeJsonFile(
      backendLogEvidencePath,
      readBackendLogEntries(backendLogPath),
    );
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
      `[smoke:plugin-runtime-electron-task-fixture] summary=${summaryPath}`,
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
