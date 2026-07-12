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
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "plugin-runtime-sdk-electron-fixture",
  ),
  prefix: "plugin-runtime-sdk-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_ID = "content-factory-app";
const ENTRY_KEY = "dashboard";
const ENTRY_ROUTE = "/dashboard";
const RUNTIME_VERSION = "0.8.0";
const WORKSPACE_ID = "plugin-sdk-electron-workspace";
const SESSION_ID = "plugin-sdk-electron-session";
const REQUEST_ID = "plugin-sdk-electron-action";
const SDK_DIST_DIR = path.join(
  process.cwd(),
  "packages",
  "plugin-runtime",
  "dist",
);
const RUNTIME_COMMANDS = [
  "plugin_runtime_start_task",
  "plugin_runtime_get_task",
  "plugin_runtime_submit_host_response",
  "plugin_runtime_cancel_task",
];
const REQUIRED_BACKEND_KINDS = ["turnStart", "actionRespond", "turnCancel"];
const LEGACY_RUNTIME_COMMANDS = [
  "submit_turn",
  "get_thread_read",
  "respond_action",
  "interrupt_turn",
  "export_evidence_pack",
].map((suffix) => ["agent", "runtime", suffix].join("_"));

function printHelp() {
  console.log(`
Plugin Runtime SDK Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，种子临时 Plugin installed state，
  通过正式侧栏打开 Plugin runtime iframe，然后在 iframe 内使用
  @limecloud/plugin-runtime browser SDK 发起 lime.agent.startTask /
  getTask / submitHostResponse / cancelTask，验证链路进入 Electron
  Desktop Host facade 与 App Server JSON-RPC RuntimeCore/backend。

目标链路:
  Plugin iframe -> Host Bridge postMessage capability:invoke
    -> AgentRuntimeCapabilityHost -> src/lib/api/pluginRuntime.ts
    -> safeInvoke -> Electron Desktop Host -> App Server JSON-RPC
    -> RuntimeCore / external backend fixture

说明:
  本脚本不使用 renderer mock、DevBridge mock、默认 mock 集合或 legacy
  agent_runtime_*。external backend 是本 smoke 进程注入的一次性本地命令
  fixture，只用于证明真实 app-server sidecar 收到 turnStart /
  actionRespond / turnCancel。

用法:
  node scripts/plugin/runtime-sdk-electron-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
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
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  if (!fs.existsSync(path.join(SDK_DIST_DIR, "index.js"))) {
    throw new Error(
      `Plugin runtime SDK dist 不存在，请先构建 packages/plugin-runtime: ${SDK_DIST_DIR}`,
    );
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
  console.log(`[smoke:plugin-runtime-sdk-electron-fixture] stage=${stage}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
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
  if (depth > 7) {
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
    return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
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

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plugin-runtime-sdk-electron-"),
  );
  const home = ensureDir(path.join(tempRoot, "home"));
  const xdgDataHome = ensureDir(path.join(tempRoot, "xdg-data"));
  const localAppData = ensureDir(path.join(tempRoot, "local-app-data"));
  const roamingAppData = ensureDir(path.join(tempRoot, "roaming-app-data"));
  const electronUserDataDir = ensureDir(
    path.join(tempRoot, "electron-user-data"),
  );
  const agentRoot = ensureDir(path.join(tempRoot, "agent"));
  const appDataDir = ensureDir(
    resolveTempPreferredDataDir({
      home,
      xdgDataHome,
      localAppData,
      platform: process.platform,
    }),
  );

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
      LIME_AGENT_RUNTIME_ROOT: agentRoot,
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

function buildCapabilityRequirement(capability, declaredBy, entryKey) {
  return {
    capability,
    requestedRange: "^0.3.0",
    required: true,
    declaredBy,
    ...(entryKey ? { entryKey } : {}),
  };
}

function buildFixtureManifest() {
  return {
    manifestVersion: "0.3",
    appId: APP_ID,
    displayName: "内容工厂 SDK",
    version: "0.3.0",
    status: "draft",
    appType: "domain-app",
    description: "Plugin SDK Electron task fixture",
    runtimeTargets: ["local"],
    requires: {
      appRuntime: ">=0.3.0 <1.0.0",
      sdk: "@lime/app-sdk@^0.3.0",
      capabilities: {
        "lime.ui": "^0.3.0",
        "lime.agent": "^0.3.0",
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
        title: "SDK 任务验证",
        route: ENTRY_ROUTE,
        requiredCapabilities: ["lime.agent"],
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
        name: "内容工厂 SDK",
        windowTitle: "内容工厂 SDK",
      },
      compatibility: {},
    },
  };
}

function buildInstalledState({ fixtureDir, manifest, packageHash, manifestHash }) {
  const now = new Date().toISOString();
  const identity = {
    appId: APP_ID,
    appVersion: manifest.version,
    sourceKind: "local_folder",
    sourceUri: fixtureDir,
    packageHash,
    manifestHash,
    loadedAt: now,
  };
  const provenance = {
    sourceKind: "plugin",
    appId: APP_ID,
    appVersion: identity.appVersion,
    packageHash: identity.packageHash,
    manifestHash: identity.manifestHash,
  };
  const appLevelAgentRequirement = buildCapabilityRequirement("lime.agent", [
    "requires",
  ]);
  const entryAgentRequirement = buildCapabilityRequirement(
    "lime.agent",
    ["entry"],
    ENTRY_KEY,
  );
  const uiRequirement = buildCapabilityRequirement("lime.ui", ["requires"]);
  const entry = {
    appId: APP_ID,
    key: ENTRY_KEY,
    kind: "page",
    title: "SDK 任务验证",
    route: ENTRY_ROUTE,
    presentation: "eligible-for-main-entry",
    readiness: "ready",
    requiredCapabilities: [entryAgentRequirement],
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
        displayName: "内容工厂 SDK",
        version: identity.appVersion,
        status: "draft",
        appType: "domain-app",
        description: "Plugin SDK Electron task fixture",
      },
      package: identity,
      entries: [entry],
      requiredCapabilities: [uiRequirement, appLevelAgentRequirement],
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
          name: "内容工厂 SDK",
          windowTitle: "内容工厂 SDK",
        },
        warnings: [],
      },
      readinessHints: [
        {
          code: "ELECTRON_SDK_FIXTURE",
          message: "Fixture installed state for Plugin SDK Electron smoke.",
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
      supportedCapabilities: [
        {
          capability: "lime.ui",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "mock",
        },
        {
          capability: "lime.agent",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
      ],
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

function writeFixturePlugin({ fixtureDir, packageHash, manifestHash }) {
  ensureDir(fixtureDir);
  fs.writeFileSync(
    path.join(fixtureDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          dev: "node server.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(fixtureDir, "APP.md"),
    `---
manifestVersion: 0.3.0
name: ${APP_ID}
displayName: 内容工厂 SDK
version: 0.3.0
entries:
  - key: ${ENTRY_KEY}
    kind: page
    title: SDK 任务验证
    route: ${ENTRY_ROUTE}
requires:
  capabilities:
    lime.agent: ^0.3.0
---
# 内容工厂 SDK
`,
  );
  fs.writeFileSync(
    path.join(fixtureDir, "server.mjs"),
    buildFixtureServerSource({
      sdkDistDir: SDK_DIST_DIR,
      packageHash,
      manifestHash,
    }),
  );
}

function buildFixtureServerSource({ sdkDistDir, packageHash, manifestHash }) {
  return `import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const appId = ${JSON.stringify(APP_ID)};
const entryKey = ${JSON.stringify(ENTRY_KEY)};
const packageHash = ${JSON.stringify(packageHash)};
const manifestHash = ${JSON.stringify(manifestHash)};
const workspaceId = ${JSON.stringify(WORKSPACE_ID)};
const sessionId = ${JSON.stringify(SESSION_ID)};
const requestId = ${JSON.stringify(REQUEST_ID)};
const sdkDistDir = ${JSON.stringify(sdkDistDir)};
const port = Number(process.env.PORT || 4173);

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json";
  return "text/plain; charset=utf-8";
}

function serveSdkModule(requestPath, response) {
  const relativePath = requestPath.replace(/^\\/sdk\\//, "");
  if (!relativePath || relativePath.includes("..")) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  const filePath = path.join(sdkDistDir, relativePath);
  if (!filePath.startsWith(sdkDistDir) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": contentType(filePath) });
  response.end(fs.readFileSync(filePath));
}

const html = \`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>内容工厂 SDK</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { padding: 24px; }
      button { border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; padding: 8px 12px; cursor: pointer; }
      button:hover { background: #f1f5f9; }
      .panel { border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 16px; }
      .muted { color: #64748b; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <h1>内容工厂 SDK</h1>
      <p class="muted">Plugin iframe · Host Bridge · lime.agent.startTask</p>
      <section class="panel">
        <button id="run-sdk-smoke">运行 SDK 任务</button>
        <p id="status">SDK smoke 等待 Host Bridge</p>
        <pre id="result"></pre>
      </section>
    </main>
    <script type="module">
      import {
        LIME_PLUGIN_BRIDGE_PROTOCOL,
        LIME_PLUGIN_BRIDGE_VERSION,
        createLimeCoreCapabilityAdapters,
        createLimeHostBridgeCapabilityInvoker,
      } from "/sdk/index.js";

      const appId = ${JSON.stringify(APP_ID)};
      const entryKey = ${JSON.stringify(ENTRY_KEY)};
      const packageHash = ${JSON.stringify(packageHash)};
      const manifestHash = ${JSON.stringify(manifestHash)};
      const workspaceId = ${JSON.stringify(WORKSPACE_ID)};
      const sessionId = ${JSON.stringify(SESSION_ID)};
      const requestId = ${JSON.stringify(REQUEST_ID)};

      const invoker = createLimeHostBridgeCapabilityInvoker({
        appId,
        entryKey,
        targetOrigin: "*",
        requestTimeoutMs: 90000,
        requestIdPrefix: "plugin-runtime-sdk-electron-fixture",
      });
      const lime = createLimeCoreCapabilityAdapters({
        invoker,
        provenance: {
          appId,
          entryKey,
          packageHash,
          manifestHash,
          workspaceId,
        },
        storageNamespace: appId,
      });
      const state = {
        ready: false,
        running: false,
        completed: false,
        error: null,
        result: null,
      };

      function updateStatus(message) {
        document.querySelector("#status").textContent = message;
      }

      async function run() {
        state.running = true;
        state.completed = false;
        state.error = null;
        updateStatus("通过 Host Bridge 调用 lime.agent.startTask");
        try {
          const started = await lime.agent.startTask({
            title: "Plugin SDK Electron fixture task",
            prompt: "生成一段 Plugin SDK Host Bridge fixture 文案",
            taskKind: "content_factory.write",
            idempotencyKey: "plugin-runtime-sdk-electron-fixture",
            sessionId,
            workspaceId,
            queueIfBusy: true,
            skipPreSubmitResume: false,
            input: {
              topic: "Plugin iframe Host Bridge",
              requestedOutputs: ["draft", "action_required", "cancel"],
            },
            expectedOutput: {
              artifactKind: "markdown",
              actionRequestId: requestId,
            },
            runtimeRequest: {
              providerConfig: {
                providerName: "fixture-provider",
                modelName: "fixture-model",
              },
              providerPreference: "fixture-provider",
              modelPreference: "fixture-model",
              systemPrompt: "Plugin SDK Electron fixture system prompt",
              reasoningEffort: "medium",
              approvalPolicy: "never",
              sandboxPolicy: "workspace-write",
              webSearch: false,
              executionStrategy: "fixture",
              metadata: {
                source: "plugin-runtime-sdk-electron-fixture",
              },
            },
          });
          updateStatus("读取 task blocked 状态");
          const firstTask = await lime.agent.getTask({
            taskId: started.taskId,
            sessionId: started.sessionId,
            turnId: started.turnId,
          });
          updateStatus("提交 Host response");
          const hostResponse = await lime.agent.submitHostResponse({
            taskId: started.taskId,
            requestId,
            actionType: "ask_user",
            confirmed: true,
            response: "继续",
            actionScope: {
              sessionId: started.sessionId,
              turnId: started.turnId,
            },
            metadata: {
              source: "plugin-runtime-sdk-electron-fixture",
            },
          });
          const secondTask = await lime.agent.getTask({
            taskId: started.taskId,
            sessionId: started.sessionId,
            turnId: started.turnId,
          });
          updateStatus("取消 task");
          const cancelTask = await lime.agent.cancelTask({
            taskId: started.taskId,
            sessionId: started.sessionId,
            turnId: started.turnId,
          });
          const finalTask = await lime.agent.getTask({
            taskId: started.taskId,
            sessionId: started.sessionId,
            turnId: started.turnId,
          });
          state.completed = true;
          state.result = {
            protocol: LIME_PLUGIN_BRIDGE_PROTOCOL,
            version: LIME_PLUGIN_BRIDGE_VERSION,
            started,
            firstTask,
            hostResponse,
            secondTask,
            cancelTask,
            finalTask,
            sdkCallLog: invoker.getCallLog(),
          };
          document.querySelector("#result").textContent = JSON.stringify(
            state.result,
            null,
            2,
          );
          updateStatus("SDK smoke 已完成");
          return state.result;
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
          updateStatus("SDK smoke 失败: " + state.error);
          throw error;
        } finally {
          state.running = false;
        }
      }

      window.__limeSdkSmoke = {
        appId,
        entryKey,
        bridgeProtocol: LIME_PLUGIN_BRIDGE_PROTOCOL,
        bridgeVersion: LIME_PLUGIN_BRIDGE_VERSION,
        getCallLog: () => invoker.getCallLog(),
        getState: () => state,
        run,
      };
      document.querySelector("#run-sdk-smoke").addEventListener("click", () => {
        void run();
      });
      invoker.sendReady();
      state.ready = true;
      updateStatus("SDK smoke 已连接 Host Bridge");
    </script>
  </body>
</html>\`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/bootstrap") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, appId }));
    return;
  }
  if (url.pathname.startsWith("/sdk/")) {
    serveSdkModule(url.pathname, response);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

server.listen(port, "127.0.0.1");
`;
}

function seedInstalledState({
  appDataDir,
  fixtureDir,
  evidenceDir,
  prefix,
  manifest,
  packageHash,
  manifestHash,
}) {
  const state = buildInstalledState({
    fixtureDir,
    manifest,
    packageHash,
    manifestHash,
  });
  const envelope = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    state,
  };
  const installedDir = path.join(appDataDir, "plugins", "installed");
  ensureDir(installedDir);
  const installedPath = path.join(installedDir, `${APP_ID}.json`);
  fs.writeFileSync(installedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const evidenceSeedPath = path.join(
    evidenceDir,
    `${prefix}-installed-state-seed.json`,
  );
  fs.writeFileSync(evidenceSeedPath, `${JSON.stringify(envelope, null, 2)}\n`);

  return { installedPath, evidenceSeedPath, state };
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

function readSessionId() {
  return request.session?.sessionId ?? request.session?.session_id ?? null;
}

function readTurnId() {
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
  sessionId: readSessionId(),
  turnId: readTurnId(),
  inputText: request.input?.text ?? null,
  eventName: request.eventName ?? null,
  runtimeRequestSeen: Boolean(runtimeRequest()),
  runtimeRequestProviderName: runtimeRequest()?.providerConfig?.providerName ?? null,
  runtimeRequestModel: runtimeRequest()?.providerConfig?.modelName ?? null,
  runtimeRequestSystemPrompt: runtimeRequest()?.systemPrompt ?? null,
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
          backend: "external-plugin-sdk-fixture",
          sessionId: readSessionId(),
          turnId: readTurnId(),
        },
      },
      {
        type: "action.required",
        payload: {
          backend: "external-plugin-sdk-fixture",
          requestId: "${REQUEST_ID}",
          actionType: "ask_user",
          message: "确认 Plugin SDK Electron fixture 继续",
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
          backend: "external-plugin-sdk-fixture",
          requestId: request.requestId,
          confirmed: request.confirmed,
        },
      },
      {
        type: "message.delta",
        payload: {
          backend: "external-plugin-sdk-fixture",
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
          backend: "external-plugin-sdk-fixture",
          sessionId: readSessionId(),
          turnId: readTurnId(),
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

function readBackendLogEntries(backendLogPath) {
  if (!fs.existsSync(backendLogPath)) {
    return [];
  }
  return fs
    .readFileSync(backendLogPath, "utf8")
    .split(/\r?\n/u)
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
    startSessionId: turnStart?.sessionId ?? null,
    startTurnId: turnStart?.turnId ?? null,
    runtimeRequestProviderName: turnStart?.runtimeRequestProviderName ?? null,
    runtimeRequestModel: turnStart?.runtimeRequestModel ?? null,
    runtimeRequestSystemPrompt: turnStart?.runtimeRequestSystemPrompt ?? null,
    actionRequestId: actionRespond?.requestId ?? null,
    actionConfirmed: actionRespond?.confirmed ?? null,
    cancelTurnId: turnCancel?.turnId ?? null,
  };
}

function invokeTraceEntriesFromStorage(value) {
  const entries = parseJson(value);
  return Array.isArray(entries) ? entries : [];
}

function summarizeInvokeTrace(traceEntries) {
  const commandsSeen = Array.from(
    new Set(
      traceEntries
        .map((entry) =>
          typeof entry?.command === "string" ? entry.command : null,
        )
        .filter(Boolean),
    ),
  ).sort();
  return {
    commandsSeen,
    runtimeCommandsSeen: RUNTIME_COMMANDS.filter((command) =>
      commandsSeen.includes(command),
    ),
    missingRuntimeCommands: RUNTIME_COMMANDS.filter(
      (command) => !commandsSeen.includes(command),
    ),
    legacyRuntimeCommandsSeen: LEGACY_RUNTIME_COMMANDS.filter((command) =>
      commandsSeen.includes(command),
    ),
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

async function waitForRendererReady(page, options, onSnapshot) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
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
          hasInvokeBridge: typeof electronApi?.invoke === "function",
          hasSupportsCommand: typeof electronApi?.supportsCommand === "function",
          commandSupport,
          startupVisible: Boolean(
            document.querySelector("[data-lime-startup-shell]"),
          ),
          appSidebarVisible: Boolean(
            document.querySelector('[data-testid="app-sidebar"]'),
          ),
          bodyText: document.body?.innerText || "",
        };
      },
      RUNTIME_COMMANDS,
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    onSnapshot?.(snapshot);
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
  throw new Error("Electron renderer / app sidebar 未就绪");
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

async function waitForRuntimeFrame(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(ENTRY_ROUTE));
    if (frame) {
      const ready = await frame
        .evaluate(() => {
          const smoke = window.__limeSdkSmoke;
          return {
            url: window.location.href,
            bodyText: document.body?.innerText || "",
            hasSmoke: Boolean(smoke),
            ready: Boolean(smoke?.getState?.().ready),
            protocol: smoke?.bridgeProtocol ?? null,
            version: smoke?.bridgeVersion ?? null,
          };
        })
        .catch(() => null);
      if (
        ready?.hasSmoke &&
        ready.ready &&
        ready.protocol === "lime.plugin.bridge" &&
        ready.version === 1
      ) {
        return { frame, ready };
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error("fixture iframe 未加载 Plugin SDK smoke");
}

async function runSdkSmokeFromFrame(frame) {
  return await frame.evaluate(async () => {
    if (!window.__limeSdkSmoke?.run) {
      throw new Error("Plugin SDK smoke bridge is unavailable");
    }
    return await window.__limeSdkSmoke.run();
  });
}

async function readFrameSmokeState(frame) {
  return await frame
    .evaluate(() => window.__limeSdkSmoke?.getState?.() ?? null)
    .catch(() => null);
}

function assertSdkSmokeResult(result, backendSummary) {
  assert(result?.protocol === "lime.plugin.bridge", "Host Bridge protocol 不正确");
  assert(result?.version === 1, "Host Bridge version 不正确");
  assert(result?.started?.status === "running", "SDK startTask 未返回 running task");
  assert(
    result.started?.sessionId === SESSION_ID,
    "SDK startTask sessionId 不正确",
  );
  assert(
    result.firstTask?.status === "running",
    "SDK getTask 首次未返回 running record",
  );
  assert(
    result.firstTask?.runtimeProcess?.terminal === false ||
      result.firstTask?.status === "running",
    "SDK first getTask 未处于可继续状态",
  );
  assert(
    result.hostResponse?.status === "submitted",
    "SDK submitHostResponse 未返回 submitted",
  );
  assert(
    result.cancelTask?.status === "cancelled",
    "SDK cancelTask 未返回 cancelled task record",
  );
  assert(
    result.finalTask?.status === "cancelled",
    `SDK final getTask 应为 cancelled，实际 ${result.finalTask?.status}`,
  );

  const callLog = Array.isArray(result.sdkCallLog) ? result.sdkCallLog : [];
  const callKeys = callLog.map((entry) => `${entry.capability}.${entry.method}`);
  for (const key of [
    "lime.agent.startTask",
    "lime.agent.getTask",
    "lime.agent.submitHostResponse",
    "lime.agent.cancelTask",
  ]) {
    assert(callKeys.includes(key), `SDK call log 缺少 ${key}`);
  }

  assert(
    backendSummary.missingBackendKinds.length === 0,
    `external backend 未收到: ${backendSummary.missingBackendKinds.join(", ")}`,
  );
  assert(
    backendSummary.runtimeRequestSeen,
    "turnStart 未携带 RuntimeOptions.runtimeRequest",
  );
  assert(
    backendSummary.startSessionId === SESSION_ID,
    "external backend turnStart sessionId 不正确",
  );
  assert(
    backendSummary.startTurnId === result.started?.turnId,
    "external backend turnStart turnId 不正确",
  );
  assert(
    backendSummary.runtimeRequestProviderName === "fixture-provider",
    "external backend runtimeRequest providerName 不正确",
  );
  assert(
    backendSummary.runtimeRequestSystemPrompt ===
      "Plugin SDK Electron fixture system prompt",
    "external backend runtimeRequest systemPrompt 不正确",
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
    backendSummary.cancelTurnId === result.started?.turnId,
    "external backend turnCancel turnId 不正确",
  );
}

async function stopRuntimeFromPage(page) {
  return await page.evaluate(
    async ({ appId }) => {
      return await window.electronAPI.invoke("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              jsonrpc: "2.0",
              id: "stop-plugin-sdk-runtime",
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
  ensureDir(options.evidenceDir);

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const backendLogEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-log.json`,
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
  const fixtureDir = path.join(runtimeEnv.tempRoot, "plugin-fixture");
  const backendPath = path.join(
    runtimeEnv.tempRoot,
    "plugin-sdk-backend.mjs",
  );
  const backendLogPath = path.join(runtimeEnv.tempRoot, "backend-log.jsonl");
  const manifest = buildFixtureManifest();
  const manifestHash = buildPluginManifestHash(manifest);
  const packageHash = buildPluginPackageHash({
    manifest,
    sourceUri: fixtureDir,
  });
  writeFixturePlugin({ fixtureDir, packageHash, manifestHash });
  writeExternalBackend(backendPath);
  const seed = seedInstalledState({
    appDataDir: runtimeEnv.appDataDir,
    fixtureDir,
    evidenceDir: options.evidenceDir,
    prefix: options.prefix,
    manifest,
    packageHash,
    manifestHash,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: runtimeEnv.env,
  });
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appId: APP_ID,
    entryKey: ENTRY_KEY,
    appUrl: options.appUrl || null,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    fixtureDir: options.keepTemp ? fixtureDir : null,
    installedStatePath: options.keepTemp ? seed.installedPath : null,
    installedStateSeedEvidence: seed.evidenceSeedPath,
    backendPath: options.keepTemp ? backendPath : null,
    backendLogPath: options.keepTemp ? backendLogPath : null,
    electronPreloadBridge: false,
    commandSupport: {},
    sidebarEntryVisible: false,
    runtimeFrameVisible: false,
    sdkSmoke: null,
    backendSummary: null,
    backendLog: backendLogEvidencePath,
    trace: tracePath,
    screenshot: null,
    rendererSnapshot: null,
  };

  let app = null;
  let page = null;
  let sdkFrame = null;
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
    await clearInvokeBuffers(page);

    logStage("wait-sidebar-entry");
    const sidebarEntry = await waitForPluginSidebarEntry(page, options);
    summary.sidebarEntryVisible = true;
    summary.sidebarEntry = sanitizeJson(sidebarEntry);

    logStage("open-runtime-page");
    await clickPluginSidebarEntry(page);

    logStage("wait-sdk-frame");
    const frameEvidence = await waitForRuntimeFrame(page, options);
    sdkFrame = frameEvidence.frame;
    summary.runtimeFrameVisible = true;
    summary.frameReady = sanitizeJson(frameEvidence.ready);

    logStage("run-sdk-smoke");
    const sdkSmoke = await runSdkSmokeFromFrame(sdkFrame);
    const backendEntries = readBackendLogEntries(backendLogPath);
    const backendSummary = summarizeBackendLog(backendEntries);
    assertSdkSmokeResult(sdkSmoke, backendSummary);

    logStage("stop-runtime");
    const stopResult = await stopRuntimeFromPage(page).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));

    const finalTraceEntries = invokeTraceEntriesFromStorage(
      await page.evaluate(() =>
        window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
      ),
    );
    const traceSummary = summarizeInvokeTrace(finalTraceEntries);
    assert(
      traceSummary.missingRuntimeCommands.length === 0,
      `Electron invoke trace 缺少: ${traceSummary.missingRuntimeCommands.join(", ")}`,
    );
    assert(
      traceSummary.legacyRuntimeCommandsSeen.length === 0,
      `观察到 legacy runtime 命令: ${traceSummary.legacyRuntimeCommandsSeen.join(", ")}`,
    );
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.sdkSmoke = sanitizeJson(sdkSmoke);
    summary.backendSummary = sanitizeJson(backendSummary);
    summary.stopResult = sanitizeJson(stopResult);
    summary.traceSummary = traceSummary;
    summary.consoleErrors = consoleErrors;
    summary.screenshot = screenshotPath;
    writeJsonFile(backendLogEvidencePath, backendEntries.map(sanitizeJson));
    writeJsonFile(
      tracePath,
      finalTraceEntries.map((entry) => sanitizeJson(entry)),
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:plugin-runtime-sdk-electron-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:plugin-runtime-sdk-electron-fixture] backendLog=${backendLogEvidencePath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.rendererSnapshot = lastRendererSnapshot;
    summary.frameState = sdkFrame ? sanitizeJson(await readFrameSmokeState(sdkFrame)) : null;
    summary.backendSummary = sanitizeJson(
      summarizeBackendLog(readBackendLogEntries(backendLogPath)),
    );
    writeJsonFile(
      backendLogEvidencePath,
      readBackendLogEntries(backendLogPath).map(sanitizeJson),
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
      `[smoke:plugin-runtime-sdk-electron-fixture] summary=${summaryPath}`,
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
