#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";
import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";

const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "code-artifact-workbench-electron-fixture",
  ),
  prefix: "code-artifact-workbench-electron-fixture",
  timeoutMs: 180_000,
  intervalMs: 500,
  keepTemp: false,
  scenario: "direct-session",
};

const LOG_PREFIX = "[smoke:code-artifact-workbench-electron-fixture]";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_METHOD_SESSION_START = "agentSession/start";
const APP_SERVER_METHOD_SESSION_UPDATE = "agentSession/update";
const APP_SERVER_METHOD_SESSION_TURN_START = "agentSession/turn/start";
const APP_SERVER_METHOD_SESSION_READ = "agentSession/read";
const APP_SERVER_METHOD_SESSION_LIST = "agentSession/list";
const APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE = "workspace/default/ensure";
const SESSION_ID = `code-artifact-workbench-electron-${Date.now()}-${process.pid}`;
const THREAD_ID = `${SESSION_ID}-thread`;
const TURN_ID = `${SESSION_ID}-turn`;
const SESSION_TITLE = "代码产物工作台 Electron fixture";
const USER_PROMPT = "生成一个 TypeScript greeting 代码产物，并打开工作台验证。";
const GUI_CODING_PROMPT =
  "@代码 修复 coding-target.test.ts 中 codingWorkbenchSmoke 失败的问题，并补一个回归测试";
const ASSISTANT_ARTIFACT_TEXT = "已生成代码产物，可在工作台查看。";
const FINAL_DONE_TEXT = "CODE_ARTIFACT_WORKBENCH_DONE";
const ARTIFACT_ID = "code-artifact-workbench-electron:greeting";
const ARTIFACT_PATH =
  ".lime/qc/code-artifact-workbench-electron-fixture/src/greeting.ts";
const TOOL_CALL_ID = "code-artifact-workbench-electron:tool:webfetch";
const TOOL_NAME = "WebFetch";
const TOOL_OUTPUT_PREVIEW =
  "已获取 fixture 工具事实: https://example.com/lime-workbench-tool";
const TOOL_TIMELINE_GUI_TEXT = "已获取 1 项数据";
const CODING_FILE_PATH =
  ".lime/qc/code-artifact-workbench-electron-fixture/src/coding-target.ts";
const CODING_ARTIFACT_ID = "code-artifact-workbench-electron:coding-target";
const CODING_PATCH_ID = "code-artifact-workbench-electron:patch:coding-target";
const CODING_COMMAND_ID = "code-artifact-workbench-electron:command:test";
const CODING_TEST_RUN_ID = "code-artifact-workbench-electron:test:unit";
const CODING_COMMAND_TEXT = "npm test -- coding-target";
const CODING_COMMAND_OUTPUT_PREVIEW =
  "FAIL coding-target.test.ts: expected codingWorkbenchSmoke to be true";
const CODING_TEST_SUITE = "coding-target";
const CODING_FILE_PREVIEW = "export const codingWorkbenchSmoke = true;";
const ARTIFACT_CONTENT = [
  "export function greeting() {",
  "  return 'Hello Lime Workbench';",
  "}",
  "",
  "export const workbenchSmoke = true;",
  "",
].join("\n");

function expectedUserPrompt(options) {
  return options.scenario === "gui-coding-input"
    ? GUI_CODING_PROMPT
    : USER_PROMPT;
}

function printHelp() {
  console.log(`
Code Artifact Workbench Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，验证代码产物 / Coding Workbench current 主链。
  默认通过 App Server JSON-RPC current 主链创建一个带代码产物 artifact.snapshot 的会话，
  再在 GUI 里从侧栏历史打开该会话并点击工作台。gui-coding-input 场景会先通过真实
  GUI 输入框发送一条 coding 请求，再验证 Workbench 面板可用。

边界:
  本脚本使用一次性本地 external backend fixture，不调用正式模型后端，不使用
  APP_SERVER_BACKEND_MODE=mock，不走 Tauri / legacy command / renderer mock fallback
  作为成功证据。

用法:
  node scripts/electron/code-artifact-workbench-fixture-smoke.mjs

选项:
  --app-url <url>        可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>  证据目录
  --prefix <name>        证据文件前缀
  --scenario <name>      direct-session | gui-coding-input，默认 direct-session
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
  if (!["direct-session", "gui-coding-input"].includes(options.scenario)) {
    throw new Error("--scenario 只能是 direct-session 或 gui-coding-input");
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
  console.log(`${LOG_PREFIX} stage=${stage}`);
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
  if (depth > 8) {
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
        .slice(0, 180)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "code-artifact-workbench-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const asterRoot = path.join(tempRoot, "aster");
  const backendPath = path.join(tempRoot, "code-artifact-backend.mjs");
  const backendLedgerPath = path.join(tempRoot, "code-artifact-backend.jsonl");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    asterRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);

  return {
    tempRoot,
    electronUserDataDir,
    backendPath,
    backendLedgerPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_ASTER_ROOT: asterRoot,
    },
  };
}

function writeFixtureBackend(backendPath) {
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8"));

if (ledgerPath) {
  appendFileSync(ledgerPath, JSON.stringify({
    kind: input.kind,
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    inputText: input.request?.input?.text,
    providerPreference: input.request?.providerPreference,
    modelPreference: input.request?.modelPreference,
    runtimeOptions: input.request?.runtimeOptions,
    requestMetadata: input.request?.runtimeOptions?.metadata,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

if (input.kind === "turnStart") {
  console.log(JSON.stringify({
    events: [
      {
        type: "message.delta",
        payload: {
          text: "${ASSISTANT_ARTIFACT_TEXT}"
        }
      },
      {
        type: "tool.started",
        payload: {
          toolCallId: "${TOOL_CALL_ID}",
          toolName: "${TOOL_NAME}",
          arguments: {
            url: "https://example.com/lime-workbench-tool",
            purpose: "code-artifact-workbench-electron-fixture"
          }
        }
      },
      {
        type: "tool.result",
        payload: {
          toolCallId: "${TOOL_CALL_ID}",
          toolName: "${TOOL_NAME}",
          outputPreview: "${TOOL_OUTPUT_PREVIEW}",
          output: "${TOOL_OUTPUT_PREVIEW}",
          success: true
        }
      },
      {
        type: "artifact.snapshot",
        payload: {
          artifact: {
            artifactId: "${ARTIFACT_ID}",
            filePath: "${ARTIFACT_PATH}",
            content: ${JSON.stringify(ARTIFACT_CONTENT)},
            metadata: {
              complete: true,
              artifactKind: "code_file",
              artifactTitle: "Greeting TypeScript fixture",
              artifactStatus: "ready",
              language: "typescript",
              previewText: "export function greeting() returns Hello Lime Workbench.",
              source: "code-artifact-workbench-electron-fixture"
            }
          }
        }
      },
      {
        type: "file.changed",
        payload: {
          path: "${CODING_FILE_PATH}",
          artifactId: "${CODING_ARTIFACT_ID}",
          artifactRefs: ["${CODING_ARTIFACT_ID}"],
          changeKind: "modified",
          checkpointRef: "checkpoint://code-artifact-workbench/coding-target",
          contentRef: "content://code-artifact-workbench/coding-target",
          diffRef: "diff://code-artifact-workbench/coding-target",
          preview: "${CODING_FILE_PREVIEW}",
          change: {
            diff: [
              { kind: "context", value: "export const codingWorkbenchSmoke = false;" },
              { kind: "remove", value: "export const codingWorkbenchSmoke = false;" },
              { kind: "add", value: "${CODING_FILE_PREVIEW}" }
            ]
          }
        }
      },
      {
        type: "patch.started",
        payload: {
          patchId: "${CODING_PATCH_ID}",
          path: "${CODING_FILE_PATH}"
        }
      },
      {
        type: "patch.applied",
        payload: {
          patchId: "${CODING_PATCH_ID}",
          path: "${CODING_FILE_PATH}",
          diffRef: "diff://code-artifact-workbench/coding-target"
        }
      },
      {
        type: "command.started",
        payload: {
          commandId: "${CODING_COMMAND_ID}",
          command: "${CODING_COMMAND_TEXT}",
          cwd: "."
        }
      },
      {
        type: "command.output",
        payload: {
          commandId: "${CODING_COMMAND_ID}",
          outputRef: "output://code-artifact-workbench/coding-target-test",
          preview: "${CODING_COMMAND_OUTPUT_PREVIEW}"
        }
      },
      {
        type: "command.exited",
        payload: {
          commandId: "${CODING_COMMAND_ID}",
          command: "${CODING_COMMAND_TEXT}",
          exitCode: 1,
          outputRef: "output://code-artifact-workbench/coding-target-test",
          preview: "${CODING_COMMAND_OUTPUT_PREVIEW}"
        }
      },
      {
        type: "test.started",
        payload: {
          testRunId: "${CODING_TEST_RUN_ID}",
          commandId: "${CODING_COMMAND_ID}",
          suite: "${CODING_TEST_SUITE}"
        }
      },
      {
        type: "test.completed",
        payload: {
          testRunId: "${CODING_TEST_RUN_ID}",
          commandId: "${CODING_COMMAND_ID}",
          suite: "${CODING_TEST_SUITE}",
          result: "failed",
          passed: 0,
          failed: 1,
          outputRef: "output://code-artifact-workbench/coding-target-test"
        }
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${FINAL_DONE_TEXT}"
        }
      },
      {
        type: "turn.final_done",
        payload: {
          text: "${FINAL_DONE_TEXT}"
        }
      }
    ]
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
    { mode: 0o755 },
  );
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function readTraceMessages(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collectTraceRequestMethods(traceMessages) {
  return traceMessages
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines).map(
        (message) => message.method,
      ),
    )
    .filter(Boolean);
}

function collectTraceJsonRpcMessages(traceMessages) {
  return traceMessages
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines),
    );
}

function collectArtifactSummaries(readResult) {
  const detail = readResult?.detail;
  const candidates = [
    ...(Array.isArray(detail?.artifacts) ? detail.artifacts : []),
    ...(Array.isArray(detail?.thread_read?.artifacts)
      ? detail.thread_read.artifacts
      : []),
  ];
  return candidates.filter(
    (artifact) => artifact && typeof artifact === "object",
  );
}

function collectToolCalls(readResult) {
  const detail = readResult?.detail;
  const candidates = [
    ...(Array.isArray(detail?.tool_calls) ? detail.tool_calls : []),
    ...(Array.isArray(detail?.toolCalls) ? detail.toolCalls : []),
    ...(Array.isArray(detail?.thread_read?.tool_calls)
      ? detail.thread_read.tool_calls
      : []),
    ...(Array.isArray(detail?.thread_read?.toolCalls)
      ? detail.thread_read.toolCalls
      : []),
  ];
  return candidates.filter((toolCall) => {
    return toolCall && typeof toolCall === "object";
  });
}

function findFixtureToolCall(readResult) {
  return collectToolCalls(readResult).find((toolCall) => {
    const toolCallId = String(
      toolCall.id ||
        toolCall.tool_call_id ||
        toolCall.toolCallId ||
        toolCall.toolId ||
        "",
    );
    const toolName = String(
      toolCall.tool_name || toolCall.toolName || toolCall.name || "",
    );
    return toolCallId === TOOL_CALL_ID && toolName === TOOL_NAME;
  });
}

function hasToolTimelineProjection(readResult) {
  const toolCall = findFixtureToolCall(readResult);
  if (!toolCall) {
    return false;
  }
  const status = String(toolCall.status || "").toLowerCase();
  const output = String(
    toolCall.output_preview || toolCall.outputPreview || toolCall.output || "",
  );
  return status === "completed" && output.includes(TOOL_OUTPUT_PREVIEW);
}

function hasGuiToolTimelineEvidence({ sessionHydrated, workbench, pageText }) {
  const visibleText = [
    pageText,
    sessionHydrated?.bodyText,
    workbench?.snapshot?.bodyText,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");
  return (
    sessionHydrated?.hasToolName === true ||
    sessionHydrated?.hasToolOutputPreview === true ||
    sessionHydrated?.hasToolTimelineText === true ||
    visibleText.includes(TOOL_NAME) ||
    visibleText.includes(TOOL_OUTPUT_PREVIEW) ||
    visibleText.includes(TOOL_TIMELINE_GUI_TEXT)
  );
}

function hasCodeArtifactProjection(readResult) {
  return collectArtifactSummaries(readResult).some((artifact) => {
    const artifactId = String(
      artifact.artifactId || artifact.artifactRef || artifact.id || "",
    );
    const artifactPath = String(
      artifact.path || artifact.filePath || artifact.file_path || "",
    );
    return artifactId === ARTIFACT_ID && artifactPath === ARTIFACT_PATH;
  });
}

function hasCodingProjection(readResult) {
  const serialized = JSON.stringify(readResult || {});
  return (
    serialized.includes(CODING_FILE_PATH) &&
    serialized.includes(CODING_COMMAND_ID) &&
    serialized.includes(CODING_TEST_RUN_ID) &&
    serialized.includes(CODING_COMMAND_OUTPUT_PREVIEW)
  );
}

async function ensureDefaultWorkspace(page) {
  const ensured = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE,
    {},
  );
  const workspace = ensured.result?.workspace;
  const workspaceId = String(workspace?.id || "").trim();
  assert(workspaceId, "workspace/default/ensure 未返回可用 workspace.id");
  return {
    workspaceId,
    rootPath: workspace?.rootPath || workspace?.root_path || null,
    workspace,
  };
}

async function bindGuiWorkspaceToFixture(page, workspaceId) {
  return await page.evaluate(
    ({ workspaceId, sessionId }) => {
      const lastProjectKey = "agent_last_project_id";
      const sessionWorkspaceKey = `agent_session_workspace_${sessionId}`;
      window.localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      window.localStorage.setItem(
        sessionWorkspaceKey,
        JSON.stringify(workspaceId),
      );
      window.dispatchEvent(
        new CustomEvent("agent-persisted-project-id-changed", {
          detail: {
            key: lastProjectKey,
            projectId: workspaceId,
          },
        }),
      );
      window.dispatchEvent(new Event("focus"));
      return {
        lastProject: window.localStorage.getItem(lastProjectKey),
        sessionWorkspace: window.localStorage.getItem(sessionWorkspaceKey),
      };
    },
    { workspaceId, sessionId: SESSION_ID },
  );
}

async function navigateGuiToWorkspaceScopedAgent(page, options, workspaceId) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let clickedNewConversation = false;

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ workspaceId }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const recentShelfText = recentShelf?.textContent || "";
        const hasConversationList = Boolean(recentShelf);
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        return {
          url: window.location.href,
          localStorageWorkspace: window.localStorage.getItem(
            "agent_last_project_id",
          ),
          localStorageMatchesWorkspace:
            window.localStorage.getItem("agent_last_project_id") ===
            JSON.stringify(workspaceId),
          hasConversationList,
          recentShelfText,
          hasNewConversationButton: buttons.some((button) =>
            [button.title, button.text, button.aria].some((label) =>
              label.includes("新建对话"),
            ),
          ),
          hasWorkspaceShell: Boolean(
            document.querySelector('[data-testid="agent-chat-workspace"]') ||
            document.querySelector('[data-testid="chat-workspace"]') ||
            document.querySelector(
              '[data-testid="theme-workbench-harness-toggle"]',
            ) ||
            document.querySelector('[data-testid="toggle-harness"]'),
          ),
          bodyText: text,
        };
      },
      { workspaceId },
    );

    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;

    if (
      clickedNewConversation &&
      snapshot.hasConversationList &&
      snapshot.localStorageMatchesWorkspace
    ) {
      return snapshot;
    }

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const newConversationButton = buttons.find((button) => {
        const label = [
          button.getAttribute("title") || "",
          button.getAttribute("aria-label") || "",
          button.textContent || "",
        ].join("\n");
        return label.includes("新建对话");
      });
      if (newConversationButton instanceof HTMLElement) {
        newConversationButton.click();
        return true;
      }
      window.dispatchEvent(new Event("focus"));
      return false;
    });
    clickedNewConversation = clickedNewConversation || clicked;

    await sleep(options.intervalMs);
  }

  throw new Error(
    `GUI 未进入 workspace-scoped Agent 状态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForInputReady(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const textarea = document.querySelector(
        'textarea[name="agent-chat-message"]',
      );
      const rect = textarea?.getBoundingClientRect();
      const style = textarea ? window.getComputedStyle(textarea) : null;
      const visible = Boolean(
        textarea &&
        rect &&
        rect.width > 16 &&
        rect.height > 16 &&
        style?.visibility !== "hidden" &&
        style?.display !== "none",
      );
      return {
        url: window.location.href,
        hasTextarea: Boolean(textarea),
        textareaVisible: visible,
        textareaDisabled:
          textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
        textareaValue:
          textarea instanceof HTMLTextAreaElement ? textarea.value : null,
        hasInputbarCore: Boolean(
          document.querySelector('[data-testid="inputbar-core-container"]'),
        ),
        bodyText: document.body?.innerText || "",
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasTextarea &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Coding 输入框未就绪: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function sendPromptFromGui(page, options, prompt) {
  const before = await waitForInputReady(page, options);
  const textarea = page.locator('textarea[name="agent-chat-message"]').first();
  await textarea.fill(prompt);
  const afterFill = await page.evaluate((prompt) => {
    const input = document.querySelector('textarea[name="agent-chat-message"]');
    return {
      value: input instanceof HTMLTextAreaElement ? input.value : null,
      promptVisibleInTextarea:
        input instanceof HTMLTextAreaElement ? input.value === prompt : false,
    };
  }, prompt);
  assert(
    afterFill.promptVisibleInTextarea,
    `输入框未保留 coding 请求: ${JSON.stringify(sanitizeJson(afterFill))}`,
  );

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const sendButton = buttons.find((button) => {
      const label = [
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
        button.textContent || "",
      ].join("\n");
      return (
        (label.includes("发送") || /\bSend\b/i.test(label)) && !button.disabled
      );
    });
    if (sendButton instanceof HTMLElement) {
      sendButton.click();
      return {
        clicked: true,
        label:
          sendButton.getAttribute("aria-label") ||
          sendButton.getAttribute("title") ||
          sendButton.textContent ||
          "send",
      };
    }
    return {
      clicked: false,
      labels: buttons.map((button) =>
        [
          button.getAttribute("aria-label") || "",
          button.getAttribute("title") || "",
          button.textContent || "",
        ].join(" / "),
      ),
    };
  });
  assert(
    clicked?.clicked,
    `未找到可点击发送按钮: ${JSON.stringify(sanitizeJson(clicked))}`,
  );
  return {
    before,
    afterFill,
    clicked,
  };
}

function summarizeListVisibility(listResult) {
  const sessions = Array.isArray(listResult?.result?.sessions)
    ? listResult.result.sessions
    : [];
  const matchingSession = sessions.find(
    (session) =>
      session?.sessionId === SESSION_ID ||
      session?.session_id === SESSION_ID ||
      session?.id === SESSION_ID,
  );
  return {
    count: sessions.length,
    containsFixtureSession: Boolean(matchingSession),
    fixtureSession: matchingSession ?? null,
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
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      title: document.title || "",
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
    onSnapshot?.(snapshot);
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

async function invokeAppServerFromPage(page, method, params = {}) {
  return await page.evaluate(
    async ({ command, method, params }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const id = `code-artifact-workbench-${Date.now()}-${Math.random()}`;
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
      const messages = Array.isArray(response?.lines)
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
      const error = messages.find(
        (message) => message?.id === id && message.error,
      );
      if (error) {
        throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
      }
      const result = messages.find(
        (message) =>
          message?.id === id &&
          Object.prototype.hasOwnProperty.call(message, "result"),
      );
      if (!result) {
        throw new Error(`${method} did not return a JSON-RPC result`);
      }
      return {
        result: result.result,
        messages,
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      method,
      params,
    },
  );
}

async function initializeAppServer(page) {
  const initialize = await invokeAppServerFromPage(page, "initialize", {
    clientInfo: {
      name: "code-artifact-workbench-electron-fixture",
      version: "1.0.0",
    },
    capabilities: { eventMethods: ["agentSession/event"] },
  });
  await page.evaluate(async (command) => {
    await window.electronAPI.invoke(command, {
      request: {
        lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
      },
    });
  }, APP_SERVER_HANDLE_JSON_LINES_COMMAND);
  return initialize.result;
}

function summarizeCodeArtifactRead(readResult, requests = []) {
  return {
    requestMethods: Array.from(
      new Set(requests.map((request) => request.method).filter(Boolean)),
    ),
    detailItemCount: Array.isArray(readResult?.detail?.items)
      ? readResult.detail.items.length
      : null,
    detailArtifactCount: Array.isArray(readResult?.detail?.artifacts)
      ? readResult.detail.artifacts.length
      : null,
    threadReadArtifactCount: Array.isArray(
      readResult?.detail?.thread_read?.artifacts,
    )
      ? readResult.detail.thread_read.artifacts.length
      : null,
    threadReadToolCallCount: Array.isArray(
      readResult?.detail?.thread_read?.tool_calls,
    )
      ? readResult.detail.thread_read.tool_calls.length
      : null,
    codingProjectionPersisted: hasCodingProjection(readResult),
    toolTimelineProjectionPersisted: hasToolTimelineProjection(readResult),
    fixtureToolCall: findFixtureToolCall(readResult) ?? null,
    latestTurnStatus:
      readResult?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
      readResult?.detail?.thread_read?.status ??
      readResult?.detail?.status ??
      null,
    artifactProjectionPersisted: hasCodeArtifactProjection(readResult),
    detailTextIncludesArtifact: JSON.stringify(readResult || {}).includes(
      ARTIFACT_ID,
    ),
  };
}

async function waitForCodeArtifactReadModel(
  page,
  options,
  { requests = [], timeoutMs = 60_000 } = {},
) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < timeoutMs) {
    let read = null;
    try {
      requests.push({ method: APP_SERVER_METHOD_SESSION_READ, params: {} });
      read = await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_SESSION_READ,
        {
          sessionId: SESSION_ID,
          historyLimit: 100,
        },
      );
    } catch (error) {
      if (!isTransientPageEvaluationError(error)) {
        throw error;
      }
      await waitForRendererReady(page, {
        ...options,
        timeoutMs: Math.min(15_000, options.timeoutMs),
      });
      await sleep(500);
      continue;
    }
    lastRead = read.result;
    const text = JSON.stringify(read.result || {});
    if (
      hasCodeArtifactProjection(read.result) &&
      hasToolTimelineProjection(read.result) &&
      hasCodingProjection(read.result)
    ) {
      return read.result;
    }
    await sleep(500);
  }

  throw new Error(
    `代码产物会话未完成，或未持久化 artifact.snapshot / tool_calls / coding facts: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

async function startCodeArtifactSession(page, workspaceId, requests) {
  async function call(method, params = {}) {
    requests?.push({ method, params });
    return await invokeAppServerFromPage(page, method, params);
  }

  const session = await call(APP_SERVER_METHOD_SESSION_START, {
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    appId: "desktop",
    workspaceId,
    businessObjectRef: {
      kind: "agent.session",
      id: `agent-session:${workspaceId}:${SESSION_ID}`,
      title: SESSION_TITLE,
      metadata: {
        title: SESSION_TITLE,
        executionStrategy: "react",
        runStartHooks: false,
        harness: {
          hiddenFromUserRecents: false,
          source: "smoke:code-artifact-workbench-electron-fixture",
        },
      },
    },
  });

  await call(APP_SERVER_METHOD_SESSION_UPDATE, {
    sessionId: SESSION_ID,
    title: SESSION_TITLE,
    providerSelector: "fixture-provider",
    providerName: "fixture-provider",
    modelName: "fixture-model",
    executionStrategy: "react",
  });

  return {
    session: session.result,
  };
}

async function createCodeArtifactSession(page, options, workspaceId) {
  const requests = [];

  const session = await startCodeArtifactSession(page, workspaceId, requests);

  async function call(method, params = {}) {
    requests.push({ method, params });
    return await invokeAppServerFromPage(page, method, params);
  }

  const turn = await call(APP_SERVER_METHOD_SESSION_TURN_START, {
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    input: {
      text: USER_PROMPT,
    },
    runtimeOptions: {
      stream: true,
      eventName: `code_artifact_workbench_${TURN_ID}`,
      providerPreference: "fixture-provider",
      modelPreference: "fixture-model",
      metadata: {
        source: "code-artifact-workbench-electron-fixture",
      },
      hostOptions: {
        asterChatRequest: {
          message: USER_PROMPT,
          session_id: SESSION_ID,
          turn_id: TURN_ID,
          event_name: `code_artifact_workbench_${TURN_ID}`,
          provider_preference: "fixture-provider",
          model_preference: "fixture-model",
          provider_config: {
            provider_name: "fixture-provider",
            model_name: "fixture-model",
          },
          turn_config: {
            provider_config: {
              provider_name: "fixture-provider",
              model_name: "fixture-model",
            },
            approval_policy: "never",
            sandbox_policy: "workspace-write",
            execution_strategy: "react",
            metadata: {
              source: "code-artifact-workbench-electron-fixture",
            },
          },
        },
      },
    },
    queueIfBusy: false,
    skipPreSubmitResume: true,
  });

  const read = await waitForCodeArtifactReadModel(page, options, { requests });

  return {
    session: session.session,
    turn: turn.result,
    read,
    requests,
  };
}

async function waitForGuiSessionVisible(page, options) {
  const startedAt = Date.now();
  let lastRefreshAt = 0;
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ title, sessionId }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        const traceRaw = window.localStorage.getItem(
          "lime_invoke_trace_buffer_v1",
        );
        const errorRaw = window.localStorage.getItem(
          "lime_invoke_error_buffer_v1",
        );
        return {
          url: window.location.href,
          hasSessionTitle: text.includes(title),
          hasRecentShelf: Boolean(recentShelf),
          recentShelfText: recentShelf?.textContent || "",
          hasWorkbenchToggle: Boolean(
            document.querySelector(
              '[data-testid="theme-workbench-harness-toggle"]',
            ) || document.querySelector('[data-testid="toggle-harness"]'),
          ),
          hasWorkbenchSidebar: Boolean(
            document.querySelector('[data-testid="general-workbench-sidebar"]'),
          ),
          activeConversation: Boolean(
            document.querySelector(
              `[data-testid="app-sidebar-recent-conversations"] button[aria-current="page"]`,
            ),
          ),
          matchingButtonCount: buttons.filter(
            (button) =>
              button.title.includes(title) ||
              button.text.includes(title) ||
              button.aria.includes(title) ||
              button.title.includes(sessionId) ||
              button.text.includes(sessionId),
          ).length,
          appServerListCallCount: (() => {
            try {
              const entries = JSON.parse(traceRaw || "[]");
              return Array.isArray(entries)
                ? entries.filter((entry) =>
                    JSON.stringify(entry).includes("agentSession/list"),
                  ).length
                : 0;
            } catch {
              return 0;
            }
          })(),
          invokeErrorRaw: errorRaw,
          bodyText: text,
        };
      },
      { title: SESSION_TITLE, sessionId: SESSION_ID },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasSessionTitle ||
      snapshot.matchingButtonCount > 0 ||
      snapshot.hasWorkbenchToggle
    ) {
      return snapshot;
    }
    if (Date.now() - lastRefreshAt > 2_000) {
      lastRefreshAt = Date.now();
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 未显示代码产物 fixture 会话: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function openFixtureSessionFromSidebar(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const clicked = await evaluatePageSnapshot(
      page,
      ({ title }) => {
        const candidates = Array.from(document.querySelectorAll("button"));
        const button = candidates.find((candidate) => {
          const label = [
            candidate.getAttribute("title") || "",
            candidate.getAttribute("aria-label") || "",
            candidate.textContent || "",
          ].join("\n");
          return label.includes(title);
        });
        if (!button) {
          const moreButton = candidates.find((candidate) =>
            (candidate.textContent || "").includes("查看更多对话"),
          );
          moreButton?.click();
          return false;
        }
        button.click();
        return true;
      },
      { title: SESSION_TITLE },
    );
    if (clicked) {
      return;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(`侧栏未找到 fixture 会话: ${SESSION_TITLE}`);
}

async function openFixtureSessionViaTaskCenterEvent(
  page,
  options,
  workspaceId,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ sessionId, workspaceId }) => {
        const event = new CustomEvent("lime:task-center:open-task", {
          cancelable: true,
          detail: {
            sessionId,
            workspaceId,
            source: "conversation_shelf",
          },
        });
        const dispatchResult = window.dispatchEvent(event);
        const text = document.body?.innerText || "";
        return {
          handled: dispatchResult === false,
          defaultPrevented: event.defaultPrevented,
          hasConversationShell: Boolean(
            document.querySelector('[data-testid="agent-chat-workspace"]') ||
            document.querySelector('[data-testid="chat-workspace"]') ||
            document.querySelector('[data-testid="message-list"]') ||
            document.querySelector('[data-testid="message-list-frame"]'),
          ),
          hasTaskCenterShell: Boolean(
            document.querySelector(
              '[data-testid="task-center-chrome-shell"]',
            ) ||
            document.querySelector('[data-testid="task-center-tab-strip"]'),
          ),
          hasWorkbenchTab: Boolean(
            document.querySelector('[data-testid="task-center-tab-workbench"]'),
          ),
          hasCanvasWorkbenchShell: Boolean(
            document.querySelector('[data-testid="canvas-workbench-shell"]') ||
            document.querySelector('[data-testid="canvas-workbench-layout"]'),
          ),
          bodyText: text,
        };
      },
      { sessionId: SESSION_ID, workspaceId },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.handled ||
      snapshot.defaultPrevented ||
      snapshot.hasTaskCenterShell ||
      snapshot.hasWorkbenchTab ||
      snapshot.hasCanvasWorkbenchShell
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `未能通过 Task Center 事件打开 fixture 会话: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function waitForSessionHydrated(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({
        artifactPath,
        doneText,
        userPrompt,
        assistantArtifactText,
        toolName,
        toolOutputPreview,
      }) => {
        const text = document.body?.innerText || "";
        const normalizeText = (value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim();
        const normalizedText = normalizeText(text);
        const normalizedUserPrompt = normalizeText(userPrompt);
        return {
          url: window.location.href,
          isRestoringSession:
            text.includes("正在恢复生成会话") ||
            text.includes("正在同步最近一次生成会话"),
          hasUserPrompt:
            text.includes(userPrompt) ||
            (normalizedUserPrompt.length > 0 &&
              normalizedText.includes(normalizedUserPrompt)),
          hasDoneText: text.includes(doneText),
          hasGeneratedText: text.includes(assistantArtifactText),
          hasToolName: text.includes(toolName),
          hasToolOutputPreview: text.includes(toolOutputPreview),
          hasToolTimelineText:
            text.includes("已获取 1 项数据") ||
            text.includes("获取中 1 项") ||
            text.includes("Tool 结果") ||
            text.includes("Tool result") ||
            text.includes(toolOutputPreview),
          hasArtifactPath: text.includes(artifactPath),
          hasCodeText: text.includes("Hello Lime Workbench"),
          hasMessageList: Boolean(
            document.querySelector('[data-testid="message-list"]') ||
            document.querySelector('[data-testid="message-list-frame"]'),
          ),
          hasWorkbenchToggle: Boolean(
            document.querySelector(
              '[data-testid="theme-workbench-harness-toggle"]',
            ) || document.querySelector('[data-testid="toggle-harness"]'),
          ),
          hasTaskCenterShell: Boolean(
            document.querySelector(
              '[data-testid="task-center-chrome-shell"]',
            ) ||
            document.querySelector('[data-testid="task-center-tab-strip"]'),
          ),
          hasTaskCenterWorkbenchTab: Boolean(
            document.querySelector('[data-testid="task-center-tab-workbench"]'),
          ),
          hasWorkbenchEntry: Array.from(
            document.querySelectorAll("button"),
          ).some((button) => {
            const label = [
              button.getAttribute("title") || "",
              button.getAttribute("aria-label") || "",
              button.textContent || "",
            ].join("\n");
            return label.includes("工作台") || label.includes("Workbench");
          }),
          hasWorkbenchSidebar: Boolean(
            document.querySelector('[data-testid="general-workbench-sidebar"]'),
          ),
          hasArtifactWorkbenchShell: Boolean(
            document.querySelector('[data-testid="artifact-workbench-shell"]'),
          ),
          hasCanvasWorkbenchShell: Boolean(
            document.querySelector('[data-testid="canvas-workbench-shell"]') ||
            document.querySelector('[data-testid="canvas-workbench-layout"]'),
          ),
          hasHarnessPanel: Boolean(
            document.querySelector('[data-testid="harness-status-panel"]'),
          ),
          hasConversationShell: Boolean(
            document.querySelector('[data-testid="agent-chat-workspace"]') ||
            document.querySelector('[data-testid="chat-workspace"]') ||
            document.querySelector('[data-testid="message-list"]') ||
            document.querySelector('[data-testid="message-list-frame"]'),
          ),
          bodyText: text,
        };
      },
      {
        artifactPath: ARTIFACT_PATH,
        doneText: FINAL_DONE_TEXT,
        userPrompt: expectedUserPrompt(options),
        assistantArtifactText: ASSISTANT_ARTIFACT_TEXT,
        toolName: TOOL_NAME,
        toolOutputPreview: TOOL_OUTPUT_PREVIEW,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    if (
      !snapshot.isRestoringSession &&
      snapshot.hasUserPrompt &&
      (snapshot.hasDoneText || snapshot.hasGeneratedText) &&
      (snapshot.hasArtifactPath ||
        snapshot.hasCodeText ||
        snapshot.hasWorkbenchToggle ||
        snapshot.hasTaskCenterWorkbenchTab ||
        snapshot.hasWorkbenchEntry ||
        snapshot.hasTaskCenterShell ||
        snapshot.hasWorkbenchSidebar ||
        snapshot.hasArtifactWorkbenchShell ||
        snapshot.hasCanvasWorkbenchShell)
    ) {
      return snapshot;
    }
    if (
      !snapshot.isRestoringSession &&
      snapshot.hasUserPrompt &&
      (snapshot.hasDoneText ||
        snapshot.hasGeneratedText ||
        snapshot.hasToolName ||
        snapshot.hasToolOutputPreview ||
        snapshot.hasArtifactPath ||
        snapshot.hasCodeText) &&
      (snapshot.hasWorkbenchToggle || snapshot.hasTaskCenterWorkbenchTab) &&
      (snapshot.hasMessageList || snapshot.hasConversationShell)
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("代码产物会话未在 GUI 中完成 hydrate");
}

async function openWorkbench(page, options) {
  await waitForSessionHydrated(page, options);
  const existing = await evaluatePageSnapshot(page, () => {
    const text = document.body?.innerText || "";
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const canvasWorkbenchShell =
      document.querySelector('[data-testid="canvas-workbench-shell"]') ||
      document.querySelector('[data-testid="canvas-workbench-layout"]');
    const canvasWorkbenchPanel = document.querySelector(
      '[data-testid^="canvas-workbench-panel-"]',
    );
    const changesTab = document.querySelector(
      '[data-canvas-tab-key="changes"]',
    );
    return {
      hasCanvasWorkbenchShell: isVisible(canvasWorkbenchShell),
      hasCanvasWorkbenchPanel: isVisible(canvasWorkbenchPanel),
      hasChangesTab: isVisible(changesTab),
      bodyText: text,
    };
  });
  if (
    existing?.hasCanvasWorkbenchShell ||
    existing?.hasCanvasWorkbenchPanel ||
    existing?.hasChangesTab
  ) {
    return {
      clicked: { clicked: false, selector: "existing-canvas-workbench" },
      snapshot: {
        hasWorkbenchSidebar: false,
        hasHarnessPanel: false,
        hasArtifactWorkbenchShell: false,
        hasCanvasWorkbenchShell: existing.hasCanvasWorkbenchShell,
        hasCanvasWorkbenchPanel: existing.hasCanvasWorkbenchPanel,
        hasCurrentProgressTab: false,
        hasArtifactSummary: false,
        bodyText: existing.bodyText,
      },
    };
  }

  const clicked = await evaluatePageSnapshot(page, () => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const direct =
      [
        document.querySelector('[data-testid="task-center-workbench-toggle"]'),
        document.querySelector('[data-testid="task-center-tab-workbench"]'),
        document.querySelector(
          '[data-testid="theme-workbench-harness-toggle"]',
        ),
        document.querySelector('[data-testid="toggle-harness"]'),
      ].find(isVisible) || null;
    if (direct instanceof HTMLElement) {
      direct.click();
      return {
        clicked: true,
        selector:
          direct.getAttribute("data-testid") ||
          direct.getAttribute("aria-label") ||
          direct.textContent ||
          "workbench-toggle",
      };
    }
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => {
        if (!isVisible(candidate)) {
          return false;
        }
        const label = [
          candidate.getAttribute("title") || "",
          candidate.getAttribute("aria-label") || "",
          candidate.textContent || "",
        ].join("\n");
        return label.includes("工作台") || label.includes("Workbench");
      },
    );
    if (button) {
      button.click();
      return {
        clicked: true,
        selector:
          button.getAttribute("data-testid") ||
          button.getAttribute("aria-label") ||
          button.textContent ||
          "workbench-button",
      };
    }
    return { clicked: false, selector: null };
  });
  assert(clicked?.clicked, "未找到可点击的工作台入口");

  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const text = document.body?.innerText || "";
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      return {
        hasWorkbenchSidebar: isVisible(
          document.querySelector('[data-testid="general-workbench-sidebar"]'),
        ),
        hasHarnessPanel: isVisible(
          document.querySelector('[data-testid="harness-status-panel"]'),
        ),
        hasArtifactWorkbenchShell: isVisible(
          document.querySelector('[data-testid="artifact-workbench-shell"]'),
        ),
        hasCanvasWorkbenchShell: isVisible(
          document.querySelector('[data-testid="canvas-workbench-shell"]') ||
            document.querySelector('[data-testid="canvas-workbench-layout"]'),
        ),
        hasCanvasWorkbenchPanel: isVisible(
          document.querySelector('[data-testid^="canvas-workbench-panel-"]'),
        ),
        hasCurrentProgressTab: text.includes("当前进展"),
        hasArtifactSummary: false,
        bodyText: text,
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    if (
      snapshot.hasWorkbenchSidebar ||
      snapshot.hasHarnessPanel ||
      snapshot.hasArtifactWorkbenchShell ||
      snapshot.hasCanvasWorkbenchShell ||
      snapshot.hasCanvasWorkbenchPanel ||
      snapshot.hasCurrentProgressTab
    ) {
      return {
        clicked,
        snapshot,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error("点击工作台后未出现工作台内容");
}

async function collectCodingWorkbenchGuiEvidence(page, options) {
  const tabs = [
    {
      key: "changes",
      panelTestId: "canvas-workbench-panel-changes",
      expectedTexts: [CODING_FILE_PATH, CODING_FILE_PREVIEW],
    },
    {
      key: "outputs",
      panelTestId: "canvas-workbench-panel-outputs",
      expectedTexts: [
        CODING_COMMAND_TEXT,
        CODING_COMMAND_OUTPUT_PREVIEW,
        CODING_TEST_SUITE,
      ],
    },
    {
      key: "logs",
      panelTestId: "canvas-workbench-panel-logs",
      expectedTexts: [CODING_FILE_PATH, CODING_COMMAND_TEXT, CODING_TEST_SUITE],
    },
  ];
  const evidence = {};

  for (const tab of tabs) {
    const clicked = await evaluatePageSnapshot(
      page,
      ({ key }) => {
        const isVisible = (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const tabButton = Array.from(
          document.querySelectorAll(`[data-canvas-tab-key="${key}"]`),
        ).find(isVisible);
        if (tabButton instanceof HTMLElement) {
          tabButton.click();
          return true;
        }
        return false;
      },
      { key: tab.key },
    );
    if (!clicked) {
      evidence[tab.key] = {
        clicked: false,
        panelVisible: false,
        expectedTextsPresent: false,
        bodyText: "",
      };
      continue;
    }

    const startedAt = Date.now();
    let lastSnapshot = null;
    while (Date.now() - startedAt < options.timeoutMs) {
      const snapshot = await evaluatePageSnapshot(
        page,
        ({ panelTestId, expectedTexts }) => {
          const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) {
              return false;
            }
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          };
          const panel = Array.from(
            document.querySelectorAll(`[data-testid="${panelTestId}"]`),
          ).find(isVisible);
          const panelText = panel?.textContent || "";
          const bodyText = document.body?.innerText || "";
          const sourceText = `${panelText}\n${bodyText}`;
          return {
            clicked: true,
            panelVisible: Boolean(panel),
            expectedTexts: expectedTexts.map((text) => ({
              text,
              present: sourceText.includes(text),
            })),
            expectedTextsPresent: expectedTexts.every((text) =>
              sourceText.includes(text),
            ),
            bodyText,
          };
        },
        {
          panelTestId: tab.panelTestId,
          expectedTexts: tab.expectedTexts,
        },
      );
      if (!snapshot) {
        await sleep(options.intervalMs);
        continue;
      }
      lastSnapshot = snapshot;
      if (snapshot.panelVisible && snapshot.expectedTextsPresent) {
        break;
      }
      await sleep(options.intervalMs);
    }
    evidence[tab.key] = sanitizeJson(lastSnapshot);
  }

  return evidence;
}

async function clickCodingWorkbenchRecovery(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const outputTab = Array.from(
        document.querySelectorAll('[data-canvas-tab-key="outputs"]'),
      ).find(isVisible);
      if (outputTab instanceof HTMLElement) {
        outputTab.click();
      }
      const panel = Array.from(
        document.querySelectorAll(
          '[data-testid="canvas-workbench-panel-outputs"]',
        ),
      ).find(isVisible);
      const recoveryPanel = panel?.querySelector(
        '[data-testid="coding-workbench-recovery"]',
      );
      const button =
        panel?.querySelector(
          '[data-testid="coding-workbench-recovery-submit"]',
        ) ||
        Array.from(panel?.querySelectorAll("button") || []).find((candidate) =>
          (candidate.textContent || "").includes("继续修复"),
        );
      const buttonVisible = isVisible(button);
      const panelText = panel?.textContent || "";
      return {
        outputTabClicked: outputTab instanceof HTMLElement,
        outputPanelVisible: Boolean(panel),
        recoveryPanelVisible: isVisible(recoveryPanel),
        buttonVisible,
        hasCommandText: panelText.includes("npm test -- coding-target"),
        hasFailurePreview: panelText.includes("FAIL coding-target.test.ts"),
        panelText,
      };
    });
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.outputPanelVisible &&
      snapshot.recoveryPanelVisible &&
      snapshot.buttonVisible
    ) {
      break;
    }
    await sleep(options.intervalMs);
  }

  assert(
    lastSnapshot?.outputPanelVisible &&
      lastSnapshot?.recoveryPanelVisible &&
      lastSnapshot?.buttonVisible,
    `未找到可点击的继续修复入口: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );

  const clicked = await evaluatePageSnapshot(page, () => {
    const button =
      document.querySelector(
        '[data-testid="coding-workbench-recovery-submit"]',
      ) ||
      Array.from(document.querySelectorAll("button")).find((candidate) =>
        (candidate.textContent || "").includes("继续修复"),
      );
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    return false;
  });
  assert(clicked, "继续修复按钮点击失败");

  const traceStartedAt = Date.now();
  let lastTrace = null;
  while (Date.now() - traceStartedAt < 30_000) {
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const traceMessages = readTraceMessages(traceRaw);
    const turnStartMessages = collectTraceJsonRpcMessages(traceMessages).filter(
      (message) => message.method === APP_SERVER_METHOD_SESSION_TURN_START,
    );
    const recoveryTurnStart = turnStartMessages.find((message) => {
      const metadata =
        message?.params?.runtimeOptions?.metadata ||
        message?.params?.runtime_options?.metadata ||
        {};
      const harness = metadata.harness || {};
      return (
        harness.coding_workbench_recovery?.schemaVersion ===
        "coding-workbench-recovery/v1"
      );
    });
    lastTrace = {
      traceCount: traceMessages.length,
      turnStartCount: turnStartMessages.length,
      recoveryTurnStart: recoveryTurnStart || null,
    };
    if (recoveryTurnStart) {
      const metadata =
        recoveryTurnStart.params?.runtimeOptions?.metadata ||
        recoveryTurnStart.params?.runtime_options?.metadata ||
        {};
      const recovery = metadata.harness?.coding_workbench_recovery || null;
      return sanitizeJson({
        clicked: true,
        panel: lastSnapshot,
        inputText: recoveryTurnStart.params?.input?.text || null,
        recovery,
      });
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `继续修复点击后未在 turn/start trace 中找到结构化 recovery metadata: ${JSON.stringify(
      sanitizeJson(lastTrace),
    )}`,
  );
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const backendLedgerEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-backend-ledger.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-workbench.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
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
  const summary = {
    ok: false,
    scenarioId: "code-artifact-workbench-electron-fixture",
    scenario: options.scenario,
    prompt:
      options.scenario === "gui-coding-input" ? GUI_CODING_PROMPT : USER_PROMPT,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    turnId: TURN_ID,
    workspaceId: null,
    workspace: null,
    artifactId: ARTIFACT_ID,
    artifactPath: ARTIFACT_PATH,
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
    pageErrors: [],
    rendererSnapshot: null,
    initialize: null,
    guiWorkspaceBinding: null,
    guiWorkspaceNavigation: null,
    guiCodingInput: null,
    sessionCreation: null,
    sessionListVisibility: null,
    guiSessionVisible: null,
    guiSessionDirectOpen: null,
    guiSessionOpenAfterInput: null,
    sessionHydrated: null,
    workbench: null,
    codingWorkbenchGuiEvidence: null,
    codingRecoveryEvidence: null,
    assertions: {},
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];

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
    page.on("pageerror", (error) => {
      pageErrors.push(sanitizeText(error?.message || String(error)));
    });
    page.setDefaultTimeout(options.timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

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
    summary.initialize = sanitizeJson(await initializeAppServer(page));

    logStage("ensure-default-workspace");
    const workspace = await ensureDefaultWorkspace(page);
    summary.workspaceId = workspace.workspaceId;
    summary.workspace = sanitizeJson(workspace);

    let sessionCreation = null;

    if (options.scenario === "gui-coding-input") {
      logStage("start-empty-code-artifact-session");
      const requests = [];
      const startedSession = await startCodeArtifactSession(
        page,
        workspace.workspaceId,
        requests,
      );
      sessionCreation = {
        session: startedSession.session,
        turn: null,
        read: null,
        requests,
      };
    } else {
      logStage("create-code-artifact-session");
      sessionCreation = await createCodeArtifactSession(
        page,
        options,
        workspace.workspaceId,
      );
    }

    logStage("bind-gui-workspace");
    summary.guiWorkspaceBinding = sanitizeJson(
      await bindGuiWorkspaceToFixture(page, workspace.workspaceId),
    );

    logStage("verify-session-list");
    const unscopedList = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      {
        includeArchived: true,
        limit: 20,
      },
    );
    const workspaceList = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_LIST,
      {
        includeArchived: true,
        workspaceId: workspace.workspaceId,
        limit: 20,
      },
    );
    summary.sessionListVisibility = sanitizeJson({
      unscoped: summarizeListVisibility(unscopedList),
      workspace: summarizeListVisibility(workspaceList),
    });

    logStage("navigate-gui-workspace");
    summary.guiWorkspaceNavigation = sanitizeJson(
      await navigateGuiToWorkspaceScopedAgent(
        page,
        options,
        workspace.workspaceId,
      ),
    );

    logStage("open-session-via-task-center-event");
    summary.guiSessionDirectOpen = sanitizeJson(
      await openFixtureSessionViaTaskCenterEvent(
        page,
        options,
        workspace.workspaceId,
      ),
    );

    if (options.scenario === "gui-coding-input") {
      logStage("send-coding-prompt-from-gui");
      summary.guiCodingInput = sanitizeJson(
        await sendPromptFromGui(page, options, GUI_CODING_PROMPT),
      );
      logStage("wait-gui-coding-read-model");
      sessionCreation.read = await waitForCodeArtifactReadModel(page, options, {
        requests: sessionCreation.requests,
        timeoutMs: options.timeoutMs,
      });
      logStage("open-session-after-gui-coding-input");
      summary.guiSessionOpenAfterInput = sanitizeJson(
        await openFixtureSessionViaTaskCenterEvent(
          page,
          options,
          workspace.workspaceId,
        ),
      );
    }

    summary.sessionCreation = sanitizeJson({
      ...summarizeCodeArtifactRead(
        sessionCreation.read,
        sessionCreation.requests,
      ),
      sessionId:
        sessionCreation.session?.session?.sessionId ??
        sessionCreation.session?.session_id ??
        SESSION_ID,
      turnId:
        sessionCreation.turn?.turn?.turnId ??
        sessionCreation.turn?.turn?.turn_id ??
        null,
      guiPromptSubmitted:
        options.scenario === "gui-coding-input"
          ? summary.guiCodingInput?.clicked?.clicked === true &&
            summary.guiCodingInput?.afterFill?.promptVisibleInTextarea === true
          : null,
    });

    logStage("wait-session-hydrated");
    const sessionHydrated = await waitForSessionHydrated(page, options);
    summary.sessionHydrated = sanitizeJson(sessionHydrated);

    logStage("open-workbench");
    const workbench = await openWorkbench(page, options);
    summary.workbench = sanitizeJson(workbench);

    logStage("collect-coding-workbench-gui-evidence");
    summary.codingWorkbenchGuiEvidence = sanitizeJson(
      await collectCodingWorkbenchGuiEvidence(page, options),
    );

    logStage("click-coding-workbench-recovery");
    summary.codingRecoveryEvidence = sanitizeJson(
      await clickCodingWorkbenchRecovery(page, options),
    );

    const backendLedger = readJsonl(runtimeEnv.backendLedgerPath);
    writeJsonFile(backendLedgerEvidencePath, backendLedger.map(sanitizeJson));
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const errorRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_error_buffer_v1"),
    );
    const traceMessages = readTraceMessages(traceRaw);
    const appServerRequestMethods = Array.from(
      new Set(
        [
          ...(summary.sessionCreation?.requestMethods ?? []),
          ...collectTraceRequestMethods(traceMessages),
        ].filter(Boolean),
      ),
    );
    const backendRecoveryTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.requestMetadata?.harness?.coding_workbench_recovery
          ?.schemaVersion === "coding-workbench-recovery/v1",
    );
    const guiToolTimelineEvidencePresent = hasGuiToolTimelineEvidence({
      sessionHydrated: summary.sessionHydrated,
      workbench: summary.workbench,
      pageText,
    });
    const assertions = {
      electronPreloadBridge: rendererSnapshot.electron === true,
      appServerJsonRpcUsed: appServerRequestMethods.includes(
        APP_SERVER_METHOD_SESSION_TURN_START,
      ),
      externalFixtureBackendUsed: backendLedger.some(
        (entry) => entry.kind === "turnStart",
      ),
      liveProviderNotUsed: backendLedger.every(
        (entry) =>
          entry.kind !== "turnStart" ||
          ((!entry.providerPreference ||
            entry.providerPreference === "fixture-provider") &&
            (!entry.modelPreference ||
              entry.modelPreference === "fixture-model")),
      ),
      artifactPersisted:
        summary.sessionCreation?.artifactProjectionPersisted === true,
      toolTimelinePersisted:
        summary.sessionCreation?.toolTimelineProjectionPersisted === true,
      codingProjectionPersisted:
        summary.sessionCreation?.codingProjectionPersisted === true,
      guiHydratedSession:
        ((summary.sessionHydrated?.hasDoneText === true ||
          summary.sessionHydrated?.hasGeneratedText === true) &&
          summary.sessionHydrated?.hasUserPrompt === true &&
          (summary.sessionHydrated?.hasArtifactPath === true ||
            summary.sessionHydrated?.hasCodeText === true ||
            summary.sessionHydrated?.hasWorkbenchToggle === true ||
            summary.sessionHydrated?.hasTaskCenterWorkbenchTab === true ||
            summary.sessionHydrated?.hasWorkbenchEntry === true ||
            summary.sessionHydrated?.hasTaskCenterShell === true ||
            summary.sessionHydrated?.hasArtifactWorkbenchShell === true ||
            summary.sessionHydrated?.hasCanvasWorkbenchShell === true)) ||
        ((summary.sessionHydrated?.hasWorkbenchToggle === true ||
          summary.sessionHydrated?.hasTaskCenterWorkbenchTab === true) &&
          (summary.sessionHydrated?.hasMessageList === true ||
            summary.sessionHydrated?.hasConversationShell === true)),
      workbenchOpened:
        summary.workbench?.snapshot?.hasWorkbenchSidebar === true ||
        summary.workbench?.snapshot?.hasHarnessPanel === true ||
        summary.workbench?.snapshot?.hasArtifactWorkbenchShell === true ||
        summary.workbench?.snapshot?.hasCanvasWorkbenchShell === true ||
        summary.workbench?.snapshot?.hasCanvasWorkbenchPanel === true ||
        summary.workbench?.snapshot?.hasCurrentProgressTab === true ||
        summary.workbench?.snapshot?.hasArtifactSummary === true,
      pageMentionsArtifactOrCode:
        pageText.includes(ARTIFACT_PATH) ||
        pageText.includes("Hello Lime Workbench") ||
        pageText.includes("产物"),
      toolTimelineEvidencePresent: guiToolTimelineEvidencePresent,
      codingChangesEvidencePresent:
        summary.codingWorkbenchGuiEvidence?.changes?.panelVisible === true &&
        summary.codingWorkbenchGuiEvidence?.changes?.expectedTextsPresent ===
          true,
      codingOutputsEvidencePresent:
        summary.codingWorkbenchGuiEvidence?.outputs?.panelVisible === true &&
        summary.codingWorkbenchGuiEvidence?.outputs?.expectedTextsPresent ===
          true,
      codingLogsEvidencePresent:
        summary.codingWorkbenchGuiEvidence?.logs?.panelVisible === true &&
        summary.codingWorkbenchGuiEvidence?.logs?.expectedTextsPresent === true,
      codingRecoveryGuiSubmitted:
        summary.codingRecoveryEvidence?.clicked === true &&
        summary.codingRecoveryEvidence?.recovery?.schemaVersion ===
          "coding-workbench-recovery/v1" &&
        summary.codingRecoveryEvidence?.recovery?.sourceIds?.commandId ===
          CODING_COMMAND_ID &&
        summary.codingRecoveryEvidence?.recovery?.sourceIds?.testRunId ===
          CODING_TEST_RUN_ID,
      codingRecoveryReachedBackend:
        backendRecoveryTurnStart?.requestMetadata?.harness
          ?.coding_workbench_recovery?.schemaVersion ===
          "coding-workbench-recovery/v1" &&
        backendRecoveryTurnStart?.requestMetadata?.harness
          ?.coding_workbench_recovery?.sourceIds?.commandId ===
          CODING_COMMAND_ID &&
        backendRecoveryTurnStart?.requestMetadata?.harness
          ?.coding_workbench_recovery?.sourceIds?.testRunId ===
          CODING_TEST_RUN_ID,
      guiPromptSubmitted:
        options.scenario !== "gui-coding-input" ||
        summary.sessionCreation?.guiPromptSubmitted === true,
      noInvokeErrors: !errorRaw,
    };

    for (const [key, passed] of Object.entries(assertions)) {
      assert(passed, `断言失败: ${key}`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;
    summary.pageErrors = pageErrors;
    summary.appServerRequestMethods = appServerRequestMethods;
    summary.backendKinds = backendLedger.map((entry) => entry.kind);
    summary.guiToolTimelineEvidencePresent = guiToolTimelineEvidencePresent;
    summary.assertions = assertions;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(`${LOG_PREFIX} summary=${summaryPath}`);
    console.log(`${LOG_PREFIX} pass session=${SESSION_ID}`);
  } catch (error) {
    try {
      if (page) {
        const traceRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        );
        const errorRaw = await page.evaluate(() =>
          window.localStorage.getItem("lime_invoke_error_buffer_v1"),
        );
        summary.invokeTrace = sanitizeJson(
          (() => {
            try {
              return JSON.parse(traceRaw || "[]");
            } catch {
              return traceRaw;
            }
          })(),
        );
        summary.invokeErrors = sanitizeJson(
          (() => {
            try {
              return JSON.parse(errorRaw || "[]");
            } catch {
              return errorRaw;
            }
          })(),
        );
      }
    } catch (traceError) {
      summary.invokeTraceError = sanitizeText(traceError);
    }
    summary.error = sanitizeText(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    summary.consoleErrors = consoleErrors;
    summary.pageErrors = pageErrors;
    try {
      if (page) {
        await page.screenshot({ path: failureScreenshotPath, fullPage: true });
        summary.screenshot = failureScreenshotPath;
      }
    } catch (screenshotError) {
      summary.screenshotError = sanitizeText(screenshotError);
    }
    writeJsonFile(summaryPath, summary);
    console.error(summary.error);
    console.error(`${LOG_PREFIX} failureSummary=${summaryPath}`);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

await run();
