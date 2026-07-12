#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
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
    "plugin-runtime-electron-sdk-fixture",
  ),
  prefix: "plugin-runtime-electron-sdk-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_ID = "content-factory-sdk-fixture-app";
const ENTRY_KEY = "dashboard";
const ENTRY_ROUTE = "/dashboard";
const RUNTIME_VERSION = "0.8.0";
const TASK_ID = "plugin-electron-sdk-task-1";
const REQUEST_ID = "plugin-electron-sdk-request-1";
const TASK_KIND = "content_factory.sdk_write";
const ARTIFACT_ID = "plugin-sdk-artifact-1";
const ARTIFACT_REF = ".lime/artifacts/plugin-sdk-artifact-1.json";
const ARTIFACT_TITLE = "Plugin SDK artifact fixture";
const TOOL_CALL_ID = "plugin-sdk-tool-call-1";
const TOOL_NAME = "WebFetch";
const TOOL_OUTPUT_PREVIEW = "fetched https://example.com/plugin-sdk-fixture";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const REQUIRED_UI_RUNTIME_METHODS = [
  "pluginInstalled/list",
  "pluginUiRuntime/start",
];
const REQUIRED_BACKEND_KINDS = ["turnStart", "actionRespond", "turnCancel"];
const SDK_METHODS = [
  "startTask",
  "getTask",
  "submitHostResponse",
  "cancelTask",
];
const REQUIRED_AGENT_UI_PROJECTION_SELECTORS = [
  ".agent-ui-projection",
  ".agent-ui-main",
  ".agent-ui-sidecar",
  ".agent-message-parts",
  ".agent-process-timeline",
  ".agent-execution-graph",
  ".agent-artifact-refs",
  ".agent-evidence-refs",
];
const REQUIRED_HOST_ADAPTER_CAPABILITIES = [
  "lime.agent",
  "lime.storage",
  "lime.artifacts",
  "lime.evidence",
  "lime.knowledge",
];

function printHelp() {
  console.log(`
Plugin Runtime Electron SDK Fixture Smoke

用途:
  启动真实 Electron Desktop Host，种子临时 Plugin installed state，
  通过正式侧栏 Plugins 聚合入口进入 Plugin runtime page，再由 iframe 内真实 SDK
  createLimeHostBridgeCapabilityInvoker 调用 lime.agent start/get/respond/cancel。
  后端使用一次性 external backend fixture 记录 App Server RuntimeCore 请求。

目标链路:
  Plugin iframe SDK -> PluginRuntimePage Host Bridge
    -> AgentRuntimeCapabilityHost -> src/lib/api/pluginRuntime.ts
    -> Electron Desktop Host IPC -> App Server JSON-RPC -> RuntimeCore/backend

说明:
  本脚本不在 renderer 中直接调用 plugin_runtime_*，不使用 renderer mock、
  default mock、DevBridge mock、legacy agent_runtime_* 或 mock backend。

用法:
  node scripts/plugin/runtime-electron-sdk-fixture-smoke.mjs

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
  console.log(`[smoke:plugin-runtime-electron-sdk-fixture] stage=${stage}`);
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
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

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plugin-runtime-electron-sdk-"),
  );
  const home = ensureDir(path.join(tempRoot, "home"));
  const xdgDataHome = ensureDir(path.join(tempRoot, "xdg-data"));
  const localAppData = ensureDir(path.join(tempRoot, "local-app-data"));
  const roamingAppData = ensureDir(path.join(tempRoot, "roaming-app-data"));
  const electronUserDataDir = ensureDir(
    path.join(tempRoot, "electron-user-data"),
  );
  const appDataDir = ensureDir(
    resolveTempPreferredDataDir({
      home,
      xdgDataHome,
      localAppData,
      platform: process.platform,
    }),
  );
  const fixtureDir = ensureDir(path.join(tempRoot, "plugin-sdk-fixture"));
  const backendPath = path.join(tempRoot, "plugin-sdk-backend.mjs");
  const backendLogPath = path.join(tempRoot, "plugin-sdk-backend.jsonl");
  fs.writeFileSync(backendLogPath, "");

  return {
    tempRoot,
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    appDataDir,
    fixtureDir,
    backendPath,
    backendLogPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
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

function writeFixtureBackend(backendPath) {
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

const requestConfig = runtimeRequest();
writeLog({
  kind,
  sessionId: sessionId(),
  turnId: turnId(),
  inputText: request.input?.text ?? null,
  eventName: request.eventName ?? null,
  providerPreference: request.providerPreference ?? null,
  modelPreference: request.modelPreference ?? null,
  metadata: request.metadata ?? null,
  runtimeRequestSeen: Boolean(requestConfig),
  runtimeRequestProviderConfigSeen: Boolean(requestConfig?.providerConfig),
  runtimeRequestProviderName: requestConfig?.providerConfig?.providerName ?? null,
  runtimeRequestModelName: requestConfig?.providerConfig?.modelName ?? null,
  requestId: request.requestId ?? null,
  actionType: request.actionType ?? null,
  confirmed: request.confirmed ?? null,
  response: request.response ?? null,
  actionScopeTurnId: request.actionScope?.turnId ?? null,
});

if (kind === "turnStart") {
  console.log(JSON.stringify({
    events: [
      {
        type: "turn.started",
        payload: {
          backend: "external-plugin-sdk-fixture",
          sessionId: sessionId(),
          turnId: turnId()
        }
      },
      {
        type: "action.required",
        payload: {
          backend: "external-plugin-sdk-fixture",
          requestId: "${REQUEST_ID}",
          actionType: "ask_user",
          message: "确认 Plugin SDK fixture 继续"
        }
      }
    ]
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
          confirmed: request.confirmed
        }
      },
      {
        type: "message.delta",
        payload: {
          backend: "external-plugin-sdk-fixture",
          text: "sdk host response accepted"
        }
      },
      {
        type: "tool.started",
        payload: {
          backend: "external-plugin-sdk-fixture",
          id: "${TOOL_CALL_ID}",
          toolName: "${TOOL_NAME}",
          tool_name: "${TOOL_NAME}"
        }
      },
      {
        type: "tool.result",
        payload: {
          backend: "external-plugin-sdk-fixture",
          id: "${TOOL_CALL_ID}",
          toolName: "${TOOL_NAME}",
          tool_name: "${TOOL_NAME}",
          success: true,
          outputPreview: "${TOOL_OUTPUT_PREVIEW}"
        }
      },
      {
        type: "artifact.snapshot",
        payload: {
          artifact: {
            artifactId: "${ARTIFACT_ID}",
            artifactRef: "${ARTIFACT_REF}",
            path: "${ARTIFACT_REF}",
            title: "${ARTIFACT_TITLE}",
            kind: "content_factory.workspace_patch",
            status: "ready",
            metadata: {
              contentFactoryWorkspacePatch: {
                kind: "content_batch",
                contentBatch: {
                  count: 1
                },
                project: {
                  title: "Plugin SDK Host Bridge current path"
                },
                workspace: {
                  appId: "${APP_ID}",
                  taskId: "${TASK_ID}"
                }
              }
            }
          }
        }
      }
    ]
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
          sessionId: sessionId(),
          turnId: turnId()
        }
      }
    ]
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
  );
  fs.chmodSync(backendPath, 0o755);
}

function writeFixturePlugin(fixtureDir) {
  const sdkDistDir = path.join(
    process.cwd(),
    "packages",
    "plugin-runtime",
    "dist",
  );
  if (!fs.existsSync(path.join(sdkDistDir, "index.js"))) {
    throw new Error(`Plugin SDK dist 不存在: ${sdkDistDir}`);
  }

  fs.writeFileSync(
    path.join(fixtureDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          dev: "node server.mjs",
        },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(fixtureDir, "APP.md"),
    `# Content Factory SDK Fixture\n\nP3.216 Plugin SDK Host Bridge fixture.\n`,
  );
  fs.writeFileSync(
    path.join(fixtureDir, "server.mjs"),
    `#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const port = Number(process.env.PORT ?? "0");
const sdkDistDir = ${JSON.stringify(sdkDistDir)};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function serveSdk(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const relative = decodeURIComponent(url.pathname.replace(/^\\/sdk\\//, ""));
  const filePath = path.normalize(path.join(sdkDistDir, relative));
  if (!filePath.startsWith(sdkDistDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "sdk file not found", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  send(res, 200, fs.readFileSync(filePath), { "content-type": contentType(filePath) });
}

function pageHtml() {
  return String.raw\`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Plugin SDK Fixture</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      section {
        width: min(720px, calc(100vw - 48px));
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: white;
        padding: 24px;
      }
      code {
        display: block;
        white-space: pre-wrap;
        font-size: 12px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Plugin SDK Fixture</h1>
        <p id="status">running</p>
        <code id="result">{}</code>
      </section>
    </main>
    <script type="module">
      import { createLimeHostBridgeCapabilityInvoker } from "/sdk/index.js";

      const APP_ID = ${JSON.stringify(APP_ID)};
      const ENTRY_KEY = ${JSON.stringify(ENTRY_KEY)};
      const TASK_ID = ${JSON.stringify(TASK_ID)};
      const REQUEST_ID = ${JSON.stringify(REQUEST_ID)};
      const TASK_KIND = ${JSON.stringify(TASK_KIND)};
      const ARTIFACT_ID = ${JSON.stringify(ARTIFACT_ID)};
      const ARTIFACT_REF = ${JSON.stringify(ARTIFACT_REF)};
      const TOOL_CALL_ID = ${JSON.stringify(TOOL_CALL_ID)};
      const TOOL_NAME = ${JSON.stringify(TOOL_NAME)};
      const TOOL_OUTPUT_PREVIEW = ${JSON.stringify(TOOL_OUTPUT_PREVIEW)};
      const EVENT_NAME = "plugin_runtime:" + APP_ID + ":" + TASK_ID;
      const HOST_RESPONSE_EVENT_NAME = EVENT_NAME + ":host_response";
      const status = document.getElementById("status");
      const resultNode = document.getElementById("result");

      function expose(result) {
        window.__pluginSdkFixtureResult = result;
        resultNode.textContent = JSON.stringify(result, null, 2);
        status.textContent = result.ok ? "ok" : "failed";
      }

      function unwrap(label, response) {
        if (!response || response.ok !== true) {
          throw new Error(label + " failed: " + JSON.stringify(response));
        }
        const value = response.value;
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.prototype.hasOwnProperty.call(value, "ok")
        ) {
          if (value.ok === false) {
            throw new Error(label + " failed: " + JSON.stringify(value));
          }
          if (value.ok === true) {
            return Object.prototype.hasOwnProperty.call(value, "result")
              ? value.result
              : value.value;
          }
        }
        return value;
      }

      function readTaskEvents(task) {
        return Array.isArray(task?.events) ? task.events : [];
      }

      function readTaskResultToolCalls(task) {
        const result = task?.result;
        const nestedThreadRead = result?.thread_read ?? result?.threadRead ?? null;
        if (Array.isArray(result?.tool_calls)) {
          return result.tool_calls;
        }
        if (Array.isArray(result?.toolCalls)) {
          return result.toolCalls;
        }
        if (Array.isArray(nestedThreadRead?.tool_calls)) {
          return nestedThreadRead.tool_calls;
        }
        if (Array.isArray(nestedThreadRead?.toolCalls)) {
          return nestedThreadRead.toolCalls;
        }
        return [];
      }

      function readWorkspacePatch(event) {
        const payload = event && typeof event === "object" ? event.payload : null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return null;
        }
        const patch = payload.contentFactoryWorkspacePatch ?? payload.workspacePatch ?? null;
        return patch && typeof patch === "object" && !Array.isArray(patch)
          ? patch
          : null;
      }

      function readArtifactEvidenceFromTaskRecord(task) {
        const events = readTaskEvents(task);
        const artifactCreated = events.find((event) => {
          if (event?.type !== "artifact:created") {
            return false;
          }
          const refs = Array.isArray(event.refs) ? event.refs : [];
          const artifact = event.payload?.artifact;
          return (
            refs.includes(ARTIFACT_REF) ||
            artifact?.path === ARTIFACT_REF ||
            artifact?.artifactRef === ARTIFACT_ID ||
            artifact?.artifact_ref === ARTIFACT_ID
          );
        });
        const evidenceRecorded = events.find((event) => {
          if (event?.type !== "evidence:recorded") {
            return false;
          }
          const refs = Array.isArray(event.refs) ? event.refs : [];
          return (
            refs.includes("evidence:" + ARTIFACT_REF) ||
            event.payload?.artifactRef === ARTIFACT_REF
          );
        });
        const workspacePatch =
          readWorkspacePatch(evidenceRecorded) ??
          readWorkspacePatch(artifactCreated);
        const artifacts = Array.isArray(task?.result?.artifacts)
          ? task.result.artifacts
          : [];
        const resultArtifactRefs = artifacts.map((artifact) =>
          artifact?.path ??
          artifact?.artifactRef ??
          artifact?.artifact_ref ??
          artifact?.id ??
          null
        );
        if (!artifactCreated) {
          throw new Error("secondRead task record missing artifact:created replay event");
        }
        if (!evidenceRecorded) {
          throw new Error("secondRead task record missing evidence:recorded replay event");
        }
        if (!workspacePatch) {
          throw new Error("secondRead task record missing contentFactoryWorkspacePatch replay payload");
        }
        return {
          artifactEventType: artifactCreated.type,
          evidenceEventType: evidenceRecorded.type,
          artifactRefs: Array.isArray(artifactCreated.refs) ? artifactCreated.refs : [],
          evidenceRefs: Array.isArray(evidenceRecorded.refs) ? evidenceRecorded.refs : [],
          resultArtifactCount: artifacts.length,
          resultArtifactRefs,
          artifactId: ARTIFACT_ID,
          artifactRef: ARTIFACT_REF,
          workspacePatchKind: workspacePatch.kind ?? null,
          contentBatchCount: workspacePatch.contentBatch?.count ?? null,
          projectTitle: workspacePatch.project?.title ?? null
        };
      }

      function readToolCallEvidenceFromTaskRecord(task) {
        const events = readTaskEvents(task);
        const toolCall = events.find((event) => {
          if (event?.type !== "task:toolCall") {
            return false;
          }
          const refs = Array.isArray(event.refs) ? event.refs : [];
          return (
            refs.includes("tool:" + TOOL_CALL_ID) ||
            event.payload?.toolCall?.id === TOOL_CALL_ID ||
            event.payload?.runtimeEvent?.id === TOOL_CALL_ID
          );
        });
        const toolCalls = readTaskResultToolCalls(task);
        const readModelToolCall = toolCalls.find((call) => {
          return (
            call?.id === TOOL_CALL_ID ||
            call?.tool_call_id === TOOL_CALL_ID ||
            call?.toolCallId === TOOL_CALL_ID
          );
        });
        if (!toolCall) {
          throw new Error("secondRead task record missing task:toolCall replay event");
        }
        if (!readModelToolCall) {
          throw new Error("SDK secondRead result thread_read.tool_calls missing App Server tool call");
        }
        if (toolCall.payload?.toolName !== TOOL_NAME) {
          throw new Error("secondRead task:toolCall replay event missing toolName");
        }
        if (toolCall.payload?.outputPreview !== TOOL_OUTPUT_PREVIEW) {
          throw new Error("secondRead task:toolCall replay event missing outputPreview");
        }
        return {
          toolEventType: toolCall.type,
          toolRefs: Array.isArray(toolCall.refs) ? toolCall.refs : [],
          toolName: toolCall.payload?.toolName ?? null,
          outputPreview: toolCall.payload?.outputPreview ?? null,
          success: toolCall.payload?.success ?? null,
          readModelToolCallCount: toolCalls.length,
          readModelStatus: readModelToolCall?.status ?? null,
          readModelOutputPreview:
            readModelToolCall?.output_preview ??
            readModelToolCall?.outputPreview ??
            readModelToolCall?.output ??
            null
        };
      }

      async function run() {
        const bridge = createLimeHostBridgeCapabilityInvoker({
          appId: APP_ID,
          entryKey: ENTRY_KEY,
          requestTimeoutMs: 30000,
          requestIdPrefix: "plugin-sdk-fixture"
        });
        const capabilityEvents = [];
        const offCapability = bridge.onCapabilityEvent((event) => capabilityEvents.push(event));
        bridge.ready();
        const hostSnapshotResponse = await bridge.getHostSnapshot();
        const hostSnapshot = unwrap("getHostSnapshot", hostSnapshotResponse);
        const startTask = unwrap("startTask", await bridge.call({
          capability: "lime.agent",
          method: "startTask",
          requestId: "sdk-fixture-start-task",
          args: {
            taskId: TASK_ID,
            workspaceId: "workspace-plugin-sdk-fixture",
            taskKind: TASK_KIND,
            title: "Plugin SDK task fixture",
            prompt: "生成一段 Plugin SDK Host Bridge fixture 文案",
            input: {
              topic: "Plugin SDK Host Bridge current path",
              requestedOutputs: ["draft", "action_required", "cancel"]
            },
            expectedOutput: {
              artifactKind: "markdown",
              actionRequestId: REQUEST_ID
            },
            eventName: EVENT_NAME,
            queueIfBusy: true,
            skipPreSubmitResume: false,
            metadata: {
              smoke: "plugin-runtime-electron-sdk-fixture",
              source: "iframe-sdk"
            },
            runtimeRequest: {
              providerConfig: {
                providerName: "fixture-provider",
                modelName: "fixture-model"
              },
              systemPrompt: "Plugin SDK fixture system prompt",
              reasoningEffort: "medium",
              approvalPolicy: "on-request",
              sandboxPolicy: "workspace-write",
              webSearch: false,
              executionStrategy: "plugin_sdk_fixture",
              metadata: {
                fixtureRuntimeRequest: true
              }
            }
          }
        }));
        const runtimeTurnId =
          typeof startTask?.turnId === "string" && startTask.turnId.length > 0
            ? startTask.turnId
            : null;
        if (!runtimeTurnId) {
          throw new Error("startTask did not return runtime turnId");
        }
        const runtimeSessionId =
          typeof startTask?.sessionId === "string" && startTask.sessionId.length > 0
            ? startTask.sessionId
            : null;
        if (!runtimeSessionId) {
          throw new Error("startTask did not return runtime sessionId");
        }
        const firstRead = unwrap("getTask blocked", await bridge.call({
          capability: "lime.agent",
          method: "getTask",
          requestId: "sdk-fixture-get-task-blocked",
          args: {
            taskId: TASK_ID,
            sessionId: runtimeSessionId
          }
        }));
        const hostResponse = unwrap("submitHostResponse", await bridge.call({
          capability: "lime.agent",
          method: "submitHostResponse",
          requestId: "sdk-fixture-submit-host-response",
          args: {
            taskId: TASK_ID,
            requestId: REQUEST_ID,
            actionType: "ask_user",
            confirmed: true,
            response: "继续",
            metadata: {
              smoke: "plugin-runtime-electron-sdk-fixture"
            },
            eventName: HOST_RESPONSE_EVENT_NAME,
            actionScope: {
              sessionId: runtimeSessionId,
              turnId: runtimeTurnId
            }
          }
        }));
        const secondRead = unwrap("getTask running", await bridge.call({
          capability: "lime.agent",
          method: "getTask",
          requestId: "sdk-fixture-get-task-running",
          args: {
            taskId: TASK_ID,
            sessionId: runtimeSessionId,
            turnId: runtimeTurnId
          }
        }));
        const artifactEvidence = readArtifactEvidenceFromTaskRecord(secondRead);
        const toolEvidence = readToolCallEvidenceFromTaskRecord(secondRead);
        const hostRun = unwrap("openAgentRun", await bridge.call({
          capability: "lime.ui",
          method: "openAgentRun",
          requestId: "sdk-fixture-open-agent-run",
          args: {
            taskId: TASK_ID,
            sessionId: runtimeSessionId,
            bridgeAction: "plugin_sdk_fixture.standard_projection",
            title: "Plugin SDK Host Bridge current path",
            mode: "drawer",
            task: secondRead,
            snapshot: secondRead,
            runtimeProcess: secondRead?.runtimeProcess ?? secondRead?.process,
            events: readTaskEvents(secondRead)
          }
        }));
        const cancel = unwrap("cancelTask", await bridge.call({
          capability: "lime.agent",
          method: "cancelTask",
          requestId: "sdk-fixture-cancel-task",
          args: {
            taskId: TASK_ID,
            sessionId: runtimeSessionId,
            turnId: runtimeTurnId
          }
        }));
        const callLog = bridge.getCallLog();
        offCapability();
        expose({
          ok: true,
          hostSnapshot,
          callLog,
          capabilityEvents,
          taskLifecycle: {
            startTask,
            firstRead,
            hostResponse,
            secondRead,
            hostRun,
            cancel
          },
          artifactEvidence,
          toolEvidence,
          statuses: {
            first: firstRead?.status,
            second: secondRead?.status,
            cancel: cancel?.status
          },
          ids: {
            taskId: startTask?.taskId,
            sessionId: startTask?.sessionId,
            turnId: startTask?.turnId
          }
        });
      }

      run().catch((error) => {
        expose({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      });
    </script>
  </body>
</html>\`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/sdk/")) {
    serveSdk(req, res);
    return;
  }
  if (url.pathname === "/api/bootstrap") {
    send(
      res,
      200,
      JSON.stringify({
        ok: true,
        appId: ${JSON.stringify(APP_ID)},
        entryKey: ${JSON.stringify(ENTRY_KEY)},
        runtime: "plugin-sdk-fixture"
      }),
      { "content-type": "application/json; charset=utf-8" }
    );
    return;
  }
  if (url.pathname === "/" || url.pathname === ${JSON.stringify(ENTRY_ROUTE)}) {
    send(res, 200, pageHtml(), { "content-type": "text/html; charset=utf-8" });
    return;
  }
  send(res, 404, "not found", { "content-type": "text/plain; charset=utf-8" });
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.error("[plugin-sdk-fixture] listening " + JSON.stringify(address));
});
`,
  );
}

function buildInstalledState(fixtureDir) {
  const now = new Date().toISOString();
  const manifest = {
    manifestVersion: "0.3",
    appId: APP_ID,
    displayName: "SDK 内容工厂",
    version: "0.3.0",
    status: "draft",
    appType: "domain-app",
    description: "Plugin SDK runtime Electron fixture",
    runtimeTargets: ["local"],
    requires: {
      appRuntime: ">=0.3.0 <1.0.0",
      sdk: "@lime/app-sdk@^0.3.0",
      capabilities: {
        "lime.ui": "^0.3.0",
        "lime.agent": "^0.3.0",
        "lime.storage": "^0.3.0",
        "lime.artifacts": "^0.3.0",
        "lime.evidence": "^0.3.0",
        "lime.knowledge": "^0.3.0",
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
        title: "SDK 工作台",
        route: ENTRY_ROUTE,
        requiredCapabilities: [
          "lime.agent",
          "lime.storage",
          "lime.artifacts",
          "lime.evidence",
          "lime.knowledge",
        ],
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
        name: "SDK 内容工厂",
        windowTitle: "SDK 内容工厂",
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
  const limeAgentRequirement = {
    capability: "lime.agent",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const limeUiRequirement = {
    capability: "lime.ui",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const limeStorageRequirement = {
    capability: "lime.storage",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const limeArtifactsRequirement = {
    capability: "lime.artifacts",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const limeEvidenceRequirement = {
    capability: "lime.evidence",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const limeKnowledgeRequirement = {
    capability: "lime.knowledge",
    requestedRange: "^0.3.0",
    required: true,
    declaredBy: ["requires"],
  };
  const entry = {
    appId: APP_ID,
    key: ENTRY_KEY,
    kind: "page",
    title: "SDK 工作台",
    route: ENTRY_ROUTE,
    presentation: "eligible-for-main-entry",
    readiness: "ready",
    requiredCapabilities: [
      {
        capability: "lime.agent",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["entry"],
        entryKey: ENTRY_KEY,
      },
      {
        capability: "lime.storage",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["entry"],
        entryKey: ENTRY_KEY,
      },
      {
        capability: "lime.artifacts",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["entry"],
        entryKey: ENTRY_KEY,
      },
      {
        capability: "lime.evidence",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["entry"],
        entryKey: ENTRY_KEY,
      },
      {
        capability: "lime.knowledge",
        requestedRange: "^0.3.0",
        required: true,
        declaredBy: ["entry"],
        entryKey: ENTRY_KEY,
      },
    ],
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
        displayName: "SDK 内容工厂",
        version: identity.appVersion,
        status: "draft",
        appType: "domain-app",
        description: "Plugin SDK runtime Electron fixture",
      },
      package: identity,
      entries: [entry],
      requiredCapabilities: [
        limeAgentRequirement,
        limeArtifactsRequirement,
        limeEvidenceRequirement,
        limeKnowledgeRequirement,
        limeStorageRequirement,
        limeUiRequirement,
      ],
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
          name: "SDK 内容工厂",
          windowTitle: "SDK 内容工厂",
        },
        warnings: [],
      },
      readinessHints: [
        {
          code: "ELECTRON_SDK_FIXTURE",
          message: "Fixture installed state for Electron SDK task smoke.",
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
          capability: "lime.agent",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
        {
          capability: "lime.storage",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
        {
          capability: "lime.artifacts",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
        {
          capability: "lime.evidence",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
        {
          capability: "lime.knowledge",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "adapter",
        },
        {
          capability: "lime.ui",
          requestedRange: "^0.3.0",
          hostVersion: "0.3.0",
          supported: true,
          enabled: true,
          implementation: "native",
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
  return {
    appServerHandleJsonLinesSeen: appServerInvokeEntries.length > 0,
    appServerMethodsSeen,
    commandsSeen,
    startRequestCount: appServerRequests.filter(
      (request) => request.method === "pluginUiRuntime/start",
    ).length,
    appServerInvokeEntries,
  };
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
    runtimeRequestProviderName: turnStart?.runtimeRequestProviderName ?? null,
    runtimeRequestModelName: turnStart?.runtimeRequestModelName ?? null,
    startSessionId: turnStart?.sessionId ?? null,
    startTurnId: turnStart?.turnId ?? null,
    actionRequestId: actionRespond?.requestId ?? null,
    actionConfirmed: actionRespond?.confirmed ?? null,
    cancelTurnId: turnCancel?.turnId ?? null,
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

async function waitForRendererReady(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      electron: window.__LIME_ELECTRON__ === true,
      hasInvokeBridge: typeof window.electronAPI?.invoke === "function",
      hasSupportsCommand:
        typeof window.electronAPI?.supportsCommand === "function",
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
      snapshot.hasSupportsCommand &&
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

async function clickPluginsNavEntry(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const entry = await evaluatePageSnapshot(page, () => {
      const sidebar =
        document.querySelector('[data-testid="app-sidebar"]') ?? document;
      const buttons = Array.from(sidebar.querySelectorAll("button"));
      const matched = buttons.find((button) => {
        const label = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.textContent,
        ]
          .filter(Boolean)
          .join(" ");
        return /Plugins|应用中心|App Center/i.test(label);
      });
      if (!matched) {
        return null;
      }
      matched.click();
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
  throw new Error("未在正式侧栏观察到 Plugins 聚合入口");
}

async function waitForPluginsInstalledRow(page, options) {
  const rowSelector = `[data-testid="plugins-list-row-${APP_ID}"]`;
  const installedSelector = `[data-testid="plugins-installed-${APP_ID}"]`;
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ rowSelector, installedSelector }) => {
        const pageRoot = document.querySelector(
          '[data-testid="plugins-page"]',
        );
        const list = document.querySelector('[data-testid="plugins-list"]');
        const row = document.querySelector(rowSelector);
        const installedMarker = document.querySelector(installedSelector);
        return {
          pageVisible: Boolean(pageRoot),
          listVisible: Boolean(list),
          rowVisible: Boolean(row),
          installedMarkerVisible: Boolean(installedMarker),
          url: window.location.href,
          bodyText: document.body?.innerText?.slice(0, 1_200) ?? "",
        };
      },
      { rowSelector, installedSelector },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.pageVisible &&
      snapshot.listVisible &&
      snapshot.rowVisible &&
      snapshot.installedMarkerVisible
    ) {
      return {
        ...snapshot,
        bodyText: sanitizeText(snapshot.bodyText),
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Plugins 聚合页未显示 SDK fixture installed row: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
      null,
      2,
    )}`,
  );
}

async function openPluginRuntimeFromPluginsPage(page, options) {
  const navEntry = await clickPluginsNavEntry(page, options);
  await page.waitForSelector('[data-testid="plugins-page"]', {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('[data-testid="plugins-list"]', {
    timeout: options.timeoutMs,
  });
  const installedRow = await waitForPluginsInstalledRow(page, options);

  const detailButton = page
    .locator(`[data-testid="plugins-open-detail-${APP_ID}"]`)
    .first();
  await detailButton.click({ timeout: options.timeoutMs });
  await page.waitForSelector('[data-testid="plugins-detail"]', {
    timeout: options.timeoutMs,
  });
  const launchEntrySelector = `[data-testid="plugins-launch-entry-${ENTRY_KEY}"]`;
  await page.waitForSelector(launchEntrySelector, {
    timeout: options.timeoutMs,
  });
  await page.locator(launchEntrySelector).first().click({
    timeout: options.timeoutMs,
  });

  return {
    navEntry,
    installedRow,
    detailVisible:
      (await page.locator('[data-testid="plugins-detail"]').count()) > 0,
    launchEntryKey: ENTRY_KEY,
  };
}

async function waitForSdkFixtureResult(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes(ENTRY_ROUTE));
    if (frame) {
      const result = await frame
        .evaluate(() => window.__pluginSdkFixtureResult ?? null)
        .catch((error) => {
          if (isTransientPageEvaluationError(error)) {
            return null;
          }
          throw error;
        });
      const bodyText = await frame
        .locator("body")
        .innerText({ timeout: Math.min(options.intervalMs, 1_000) })
        .catch(() => "");
      lastSnapshot = {
        url: frame.url(),
        bodyTextPreview: sanitizeText(bodyText.slice(0, 1_000)),
        result: sanitizeJson(result),
      };
      if (result?.ok === true) {
        return {
          url: frame.url(),
          bodyTextPreview: sanitizeText(bodyText.slice(0, 1_000)),
          result,
        };
      }
      if (result?.ok === false) {
        throw new Error(`SDK fixture failed: ${result.error}`);
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `SDK fixture 未完成: ${JSON.stringify(lastSnapshot, null, 2)}`,
  );
}

async function captureRuntimePageEvidence(page) {
  return await evaluatePageSnapshot(page, () => {
    const frame = document.querySelector(
      '[data-testid="plugin-runtime-frame"]',
    );
    const surface = document.querySelector(
      '[data-testid="plugin-runtime-surface"]',
    );
    return {
      surfaceVisible: Boolean(surface),
      frameVisible: Boolean(frame),
      frameSrc: frame instanceof HTMLIFrameElement ? frame.src : null,
      traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    };
  });
}

async function waitForHostProjectionSurface(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      (requiredSelectors) => {
        const dock = document.querySelector(
          '[data-testid="plugin-host-agent-run-dock"]',
        );
        const drawer = document.querySelector(
          '[data-testid="plugin-host-agent-run-drawer"]',
        );
        const missingSelectors = requiredSelectors.filter(
          (selector) => !document.querySelector(selector),
        );
        const projectionRoot = document.querySelector(".agent-ui-projection");
        const action = document.querySelector("[data-action-id]");
        const actionRequiredList = document.querySelector(
          ".agent-action-required-list",
        );
        const artifact = document.querySelector(
          '.agent-artifact-refs [data-ref-kind="artifact"]',
        );
        const evidence = document.querySelector(
          '.agent-evidence-refs [data-ref-kind="evidence"]',
        );
        const toolEntry = document.querySelector(
          '.agent-process-entry[data-entry-kind="tool"]',
        );
        return {
          dockVisible: Boolean(dock),
          drawerVisible: Boolean(drawer),
          projectionVisible: Boolean(projectionRoot),
          runtimeStatus:
            projectionRoot instanceof HTMLElement
              ? projectionRoot.dataset.runtimeStatus ?? null
              : null,
          hydrationStatus:
            projectionRoot instanceof HTMLElement
              ? projectionRoot.dataset.hydrationStatus ?? null
              : null,
          missingSelectors,
          actionId:
            action instanceof HTMLElement ? action.dataset.actionId ?? null : null,
          actionRequiredListVisible: Boolean(actionRequiredList),
          artifactRefId:
            artifact instanceof HTMLElement ? artifact.dataset.refId ?? null : null,
          evidenceRefId:
            evidence instanceof HTMLElement ? evidence.dataset.refId ?? null : null,
          toolEntryVisible: Boolean(toolEntry),
          textPreview: document.body?.innerText?.slice(0, 1_000) ?? "",
        };
      },
      REQUIRED_AGENT_UI_PROJECTION_SELECTORS,
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (snapshot.dockVisible && !snapshot.drawerVisible) {
      await page
        .locator('[data-testid="plugin-host-agent-run-dock"]')
        .first()
        .click({ timeout: Math.min(options.intervalMs, 1_000) })
        .catch(() => {});
      await sleep(options.intervalMs);
      continue;
    }
    if (
      snapshot.drawerVisible &&
      snapshot.projectionVisible &&
      snapshot.missingSelectors.length === 0
    ) {
      return {
        ...snapshot,
        textPreview: sanitizeText(snapshot.textPreview),
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Host Agent Run 标准 AgentUI projection surface 未就绪: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
      null,
      2,
    )}`,
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

function assertSdkLifecycleResult(result, backendSummary) {
  const callLog = Array.isArray(result.callLog) ? result.callLog : [];
  const methodsSeen = callLog
    .filter((entry) => entry?.capability === "lime.agent")
    .map((entry) => entry.method);
  for (const method of SDK_METHODS) {
    assert(
      methodsSeen.includes(method),
      `iframe SDK callLog 未包含 lime.agent.${method}`,
    );
  }
  for (const capability of REQUIRED_HOST_ADAPTER_CAPABILITIES) {
    assert(
      result.hostSnapshot?.capabilities?.available?.includes(capability),
      `Host Snapshot 未声明 ${capability} available`,
    );
    assert(
      !result.hostSnapshot?.capabilities?.blocked?.includes(capability),
      `Host Snapshot 仍把 ${capability} 标为 blocked`,
    );
  }
  assert(
    result.taskLifecycle?.startTask?.taskId === TASK_ID,
    "SDK startTask taskId 不正确",
  );
  assert(
    typeof result.taskLifecycle?.startTask?.sessionId === "string" &&
      result.taskLifecycle.startTask.sessionId.length > 0,
    "SDK startTask 未返回有效 sessionId",
  );
  assert(
    typeof result.taskLifecycle?.startTask?.turnId === "string" &&
      result.taskLifecycle.startTask.turnId.length > 0,
    "SDK startTask 未返回有效 turnId",
  );
  assert(
    result.ids?.turnId === result.taskLifecycle?.startTask?.turnId,
    "SDK ids.turnId 未使用 startTask 返回的 runtime turnId",
  );
  assert(
    result.ids?.sessionId === result.taskLifecycle?.startTask?.sessionId,
    "SDK ids.sessionId 未使用 startTask 返回的 runtime sessionId",
  );
  assert(
    result.taskLifecycle?.firstRead?.status === "running",
    `首次 SDK getTask status 应为 running，实际 ${result.taskLifecycle?.firstRead?.status}`,
  );
  assert(
    result.taskLifecycle?.hostResponse?.status === "submitted",
    "SDK submitHostResponse 未返回 submitted",
  );
  assert(
    result.taskLifecycle?.secondRead?.status === "running",
    `submitHostResponse 后 SDK getTask status 应为 running，实际 ${result.taskLifecycle?.secondRead?.status}`,
  );
  assert(
    result.taskLifecycle?.hostRun?.surface === "host_agent_run",
    "SDK lime.ui.openAgentRun 未返回 host_agent_run surface",
  );
  assert(
    result.taskLifecycle?.hostRun?.opened === true,
    "SDK lime.ui.openAgentRun 未打开 Host Agent Run 面板",
  );
  assert(
    result.taskLifecycle?.cancel?.status === "cancelled",
    `SDK cancelTask status 应为 cancelled，实际 ${result.taskLifecycle?.cancel?.status}`,
  );
  assert(
    result.artifactEvidence?.artifactEventType === "artifact:created",
    "SDK secondRead 未从 App Server read model replay artifact:created",
  );
  assert(
    result.artifactEvidence?.evidenceEventType === "evidence:recorded",
    "SDK secondRead 未从 App Server read model replay evidence:recorded",
  );
  assert(
    result.artifactEvidence?.artifactRefs?.includes(ARTIFACT_REF),
    "SDK artifact:created refs 未指向 App Server artifact path",
  );
  assert(
    result.artifactEvidence?.evidenceRefs?.includes(`evidence:${ARTIFACT_REF}`),
    "SDK evidence:recorded refs 未指向 artifact evidence",
  );
  assert(
    result.artifactEvidence?.resultArtifactRefs?.includes(ARTIFACT_REF),
    "SDK secondRead result.artifacts 未包含 App Server artifact path",
  );
  assert(
    result.artifactEvidence?.workspacePatchKind === "content_batch",
    "SDK evidence replay 未携带 contentFactoryWorkspacePatch.kind",
  );
  assert(
    result.artifactEvidence?.contentBatchCount === 1,
    "SDK evidence replay 未携带 contentFactoryWorkspacePatch.contentBatch",
  );
  assert(
    result.toolEvidence?.toolEventType === "task:toolCall",
    "SDK secondRead 未从 App Server read model replay task:toolCall",
  );
  assert(
    result.toolEvidence?.toolRefs?.includes(`tool:${TOOL_CALL_ID}`),
    "SDK task:toolCall refs 未指向 App Server tool call",
  );
  assert(
    result.toolEvidence?.toolName === TOOL_NAME,
    "SDK task:toolCall 未携带 App Server toolName",
  );
  assert(
    result.toolEvidence?.outputPreview === TOOL_OUTPUT_PREVIEW,
    "SDK task:toolCall 未携带 App Server outputPreview",
  );
  assert(
    result.toolEvidence?.success === true,
    "SDK task:toolCall 未携带 App Server success=true",
  );
  assert(
    result.toolEvidence?.readModelToolCallCount >= 1,
    "SDK secondRead result thread_read.tool_calls 未包含 App Server tool call",
  );
  assert(
    result.toolEvidence?.readModelStatus === "completed",
    "SDK secondRead result thread_read.tool_calls 未标记 completed",
  );
  assert(
    result.toolEvidence?.readModelOutputPreview === TOOL_OUTPUT_PREVIEW,
    "SDK secondRead result thread_read.tool_calls 未携带 outputPreview",
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
    backendSummary.runtimeRequestProviderName === "fixture-provider",
    "RuntimeRequest.providerConfig.providerName 未抵达 backend",
  );
  assert(
    backendSummary.runtimeRequestModelName === "fixture-model",
    "RuntimeRequest.providerConfig.modelName 未抵达 backend",
  );
  assert(
    backendSummary.startSessionId === result.taskLifecycle?.startTask?.sessionId,
    "external backend turnStart sessionId 未与 SDK startTask 返回值一致",
  );
  assert(
    backendSummary.startTurnId === result.taskLifecycle?.startTask?.turnId,
    "external backend turnStart turnId 未与 SDK startTask 返回值一致",
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
    backendSummary.cancelTurnId === result.taskLifecycle?.startTask?.turnId,
    "external backend turnCancel turnId 未使用 SDK startTask 返回值",
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
  writeFixturePlugin(runtimeEnv.fixtureDir);
  writeFixtureBackend(runtimeEnv.backendPath);
  const seed = seedInstalledState(
    runtimeEnv.appDataDir,
    runtimeEnv.fixtureDir,
    options.evidenceDir,
    options.prefix,
  );
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: runtimeEnv.env,
  });
  const summary = {
    ok: false,
    checkedAt: new Date().toISOString(),
    appId: APP_ID,
    entryKey: ENTRY_KEY,
    sessionId: null,
    taskId: TASK_ID,
    turnId: null,
    requestId: REQUEST_ID,
    appUrl: options.appUrl || null,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    fixtureDir: options.keepTemp ? runtimeEnv.fixtureDir : null,
    appDataDir: options.keepTemp ? runtimeEnv.appDataDir : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    installedStatePath: options.keepTemp ? seed.installedPath : null,
    installedStateSeedEvidence: seed.evidenceSeedPath,
    backendPath: options.keepTemp ? runtimeEnv.backendPath : null,
    backendLogPath: options.keepTemp ? runtimeEnv.backendLogPath : null,
    electronPreloadBridge: false,
    sidebarEntryVisible: false,
    pluginsPageVisible: false,
    pluginsInstalledRowVisible: false,
    pluginsLaunchEntryVisible: false,
    runtimeSurfaceVisible: false,
    runtimeFrameVisible: false,
    frameSrc: null,
    sdkResult: null,
    artifactEvidence: null,
    backendSummary: null,
    appServerMethodsSeen: [],
    trace: tracePath,
    backendLog: backendLogEvidencePath,
    screenshot: null,
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
        APP_SERVER_BACKEND_MODE: "external",
        APP_SERVER_BACKEND_COMMAND: process.execPath,
        APP_SERVER_BACKEND_ARGS: JSON.stringify([
          runtimeEnv.backendPath,
          runtimeEnv.backendLogPath,
        ]),
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
    const rendererSnapshot = await waitForRendererReady(page, options);
    summary.electronPreloadBridge =
      rendererSnapshot.electron && rendererSnapshot.hasInvokeBridge;
    await clearInvokeBuffers(page);

    logStage("open-plugins-runtime-page");
    const pluginsLaunch = await openPluginRuntimeFromPluginsPage(
      page,
      options,
    );
    summary.sidebarEntryVisible = true;
    summary.sidebarEntry = sanitizeJson(pluginsLaunch.navEntry);
    summary.pluginsPageVisible = true;
    summary.pluginsInstalledRowVisible = true;
    summary.pluginsLaunchEntryVisible = true;
    summary.pluginsLaunch = sanitizeJson(pluginsLaunch);

    logStage("wait-sdk-result");
    const sdkEvidence = await waitForSdkFixtureResult(page, options);
    const runtimeEvidence = await captureRuntimePageEvidence(page);
    logStage("wait-host-agentui-projection");
    const hostProjectionEvidence = await waitForHostProjectionSurface(
      page,
      options,
    );
    const traceEntries = invokeTraceEntriesFromStorage(
      runtimeEvidence?.traceRaw,
    );
    const traceSummary = summarizeTraceEntries(traceEntries);
    const backendEntries = readBackendLogEntries(runtimeEnv.backendLogPath);
    const backendSummary = summarizeBackendLog(backendEntries);

    Object.assign(summary, {
      sessionId: sdkEvidence.result?.taskLifecycle?.startTask?.sessionId ?? null,
      turnId: sdkEvidence.result?.taskLifecycle?.startTask?.turnId ?? null,
      runtimeSurfaceVisible: Boolean(runtimeEvidence?.surfaceVisible),
      runtimeFrameVisible: Boolean(runtimeEvidence?.frameVisible),
      frameSrc: runtimeEvidence?.frameSrc ?? sdkEvidence.url,
      sdkResult: sanitizeJson(sdkEvidence.result),
      artifactEvidence: sanitizeJson(
        sdkEvidence.result?.artifactEvidence ?? null,
      ),
      toolEvidence: sanitizeJson(sdkEvidence.result?.toolEvidence ?? null),
      hostProjectionEvidence: sanitizeJson(hostProjectionEvidence),
      frameContent: sanitizeJson({
        url: sdkEvidence.url,
        bodyTextPreview: sdkEvidence.bodyTextPreview,
      }),
      backendSummary: sanitizeJson(backendSummary),
      appServerHandleJsonLinesSeen: traceSummary.appServerHandleJsonLinesSeen,
      appServerMethodsSeen: traceSummary.appServerMethodsSeen,
      startRequestCount: traceSummary.startRequestCount,
      consoleErrors,
    });
    writeJsonFile(summaryPath, summary);

    assertSdkLifecycleResult(sdkEvidence.result, backendSummary);

    logStage("stop-runtime");
    summary.stopResult = sanitizeJson(
      await stopRuntimeFromPage(page).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      })),
    );
    const finalTraceEntries = invokeTraceEntriesFromStorage(
      await page.evaluate(() =>
        window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
      ),
    );
    const finalTraceSummary = summarizeTraceEntries(finalTraceEntries);
    summary.appServerMethodsSeen = finalTraceSummary.appServerMethodsSeen;
    summary.appServerHandleJsonLinesSeen =
      finalTraceSummary.appServerHandleJsonLinesSeen;

    writeJsonFile(tracePath, {
      appServerInvokeEntries: finalTraceSummary.appServerInvokeEntries,
      traceEntries: finalTraceEntries.map(sanitizeJson),
    });
    writeJsonFile(backendLogEvidencePath, backendEntries.map(sanitizeJson));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;

    assert(
      summary.electronPreloadBridge,
      "未检测到真实 Electron preload bridge",
    );
    assert(
      summary.runtimeSurfaceVisible,
      "正式 Plugin runtime surface 未出现",
    );
    assert(summary.runtimeFrameVisible, "正式 Plugin runtime iframe 未出现");
    assert(
      typeof summary.frameSrc === "string" &&
        summary.frameSrc.includes(ENTRY_ROUTE),
      `iframe src 未指向 SDK fixture entry route: ${summary.frameSrc}`,
    );
    for (const method of REQUIRED_UI_RUNTIME_METHODS) {
      assert(
        summary.appServerMethodsSeen.includes(method),
        `未观察到 UI runtime App Server method: ${method}`,
      );
    }
    assert(
      summary.appServerHandleJsonLinesSeen,
      "未观察到 app_server_handle_json_lines",
    );
    assert(
      summary.hostProjectionEvidence?.projectionVisible === true,
      "未观察到 Host Agent Run 标准 AgentUI projection surface",
    );
    assert(
      summary.hostProjectionEvidence?.artifactRefId,
      "Host Agent Run 标准 ArtifactRef surface 未渲染",
    );
    assert(
      summary.hostProjectionEvidence?.evidenceRefId,
      "Host Agent Run 标准 EvidenceRef surface 未渲染",
    );
    assert(
      summary.hostProjectionEvidence?.toolEntryVisible === true,
      "Host Agent Run 标准 ProcessTimeline 未渲染 tool entry",
    );
    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:plugin-runtime-electron-sdk-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:plugin-runtime-electron-sdk-fixture] backendLog=${backendLogEvidencePath}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
    summary.backendSummary = sanitizeJson(
      summarizeBackendLog(readBackendLogEntries(runtimeEnv.backendLogPath)),
    );
    writeJsonFile(
      backendLogEvidencePath,
      readBackendLogEntries(runtimeEnv.backendLogPath).map(sanitizeJson),
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
      `[smoke:plugin-runtime-electron-sdk-fixture] summary=${summaryPath}`,
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
