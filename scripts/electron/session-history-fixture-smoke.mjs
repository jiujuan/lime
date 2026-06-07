#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
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
    "agent-session-history-electron-fixture",
  ),
  prefix: "agent-session-history-electron-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const WORKSPACE_ID = "agent-session-history-electron-workspace";
const SESSION_ID = "agent-session-history-electron-session";
const THREAD_ID = "agent-session-history-electron-thread";
const INITIAL_TITLE = "Electron history fixture";
const UPDATED_TITLE = "Electron history fixture restored";
const PERSISTED_SESSION_ID = "agent-session-history-electron-persisted";
const PERSISTED_TITLE = "Electron persisted archive fixture";
const PERSISTED_ARCHIVED_TITLE = "Electron persisted archive fixture archived";
const PERSISTED_WORKSPACE_ID =
  "agent-session-history-electron-persisted-workspace";
const PERSISTED_TURN_ID = "agent-session-history-electron-persisted-turn";
const PERSISTED_USER_ITEM_ID = "agent-session-history-electron-persisted-user";
const PERSISTED_AGENT_ITEM_ID =
  "agent-session-history-electron-persisted-agent";
const ARCHIVE_FAIL_CLOSED_MESSAGE =
  "agentSession/update archived is only supported for persisted current timeline sessions";
const REQUIRED_METHODS = [
  "initialize",
  "agentSession/start",
  "agentSession/read",
  "agentSession/update",
  "agentSession/list",
];
const FORBIDDEN_METHODS = ["agentSession/turn/start"];
const PERSISTED_SESSION_REQUIRED_METHODS = [
  "initialize",
  "agentSession/list",
  "agentSession/read",
];
const PERSISTED_SESSION_FORBIDDEN_METHODS = [
  "agentSession/start",
  "agentSession/turn/start",
];
const SIDEBAR_GUI_REQUIRED_METHODS = ["agentSession/update"];
const SIDEBAR_GUI_FORBIDDEN_METHODS = [
  "agentSession/start",
  "agentSession/turn/start",
];
const LAST_PROJECT_ID_KEY = "agent_last_project_id";
const PERSISTED_PROJECT_ID_CHANGED_EVENT = "agent-persisted-project-id-changed";
const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "lime.app-sidebar.collapsed";
const SIDEBAR_RECENT_LIST_SELECTOR =
  '[data-testid="app-sidebar-recent-conversations"]';
const SIDEBAR_ARCHIVED_LIST_SELECTOR =
  '[data-testid="app-sidebar-archived-conversations"]';
const SIDEBAR_SHELF_SELECTOR = '[data-testid="app-sidebar-conversation-shelf"]';
const SIDEBAR_ARCHIVE_MENU_ITEM_SELECTOR =
  '[data-testid="app-sidebar-conversation-menu-archive"]';
const SQLITE3_BINARY = process.env.SQLITE3_BIN?.trim() || "sqlite3";

function printHelp() {
  console.log(`
Agent Session History Electron Fixture Smoke

用途:
  启动真实 Electron Desktop Host，在 renderer preload bridge 中通过
  app_server_handle_json_lines 调用 App Server JSON-RPC current 会话读写路径，
  验证历史详情 hydrate 所需的 agentSession/read/list/update 形状可用。

边界:
  本脚本显式使用 APP_SERVER_BACKEND_MODE=unavailable；不会调用正式模型后端，
  不提交 agentSession/turn/start，不使用 Tauri / legacy command / mock fallback
  作为成功证据。对内存 session 发起 archived=true 时必须 fail closed，
  不能把未持久化的 runtime session 伪装成已归档。

用法:
  node scripts/electron/session-history-fixture-smoke.mjs

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
  console.log(`[smoke:agent-session-history-electron-fixture] stage=${stage}`);
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-session-history-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const persistedWorkspaceRoot = path.join(tempRoot, "persisted-workspace");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    persistedWorkspaceRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    electronUserDataDir,
    persistedWorkspaceRoot,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
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
        .slice(0, 160)
        .map(([key, item]) => [key, sanitizeJson(item, depth + 1)]),
    );
  }
  return sanitizeText(String(value));
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

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resolvePreferredDataParentDir(env) {
  if (process.platform === "win32") {
    return env.LOCALAPPDATA || env.APPDATA;
  }
  if (process.platform === "darwin") {
    return env.HOME
      ? path.join(env.HOME, "Library", "Application Support")
      : null;
  }
  return (
    env.XDG_DATA_HOME ||
    (env.HOME ? path.join(env.HOME, ".local", "share") : null)
  );
}

function resolveFixtureDatabasePath(runtimeEnv) {
  const parent = resolvePreferredDataParentDir(runtimeEnv.env);
  if (!parent) {
    throw new Error("无法解析 fixture app data 目录");
  }
  return path.join(parent, "lime", "lime.db");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSqlite(dbPath, sql) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`fixture 数据库尚未创建: ${dbPath}`);
  }
  try {
    execFileSync(SQLITE3_BINARY, [dbPath], {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = sanitizeText(error?.stderr || "");
    const stdout = sanitizeText(error?.stdout || "");
    throw new Error(
      `${SQLITE3_BINARY} fixture seed 失败: ${error?.message || error}; stdout=${stdout}; stderr=${stderr}`,
    );
  }
}

function seedPersistedCurrentTimelineSession(runtimeEnv) {
  const dbPath = resolveFixtureDatabasePath(runtimeEnv);
  const now = "2026-06-07T00:00:00.000Z";
  const turnStartedAt = "2026-06-07T00:00:01.000Z";
  const turnCompletedAt = "2026-06-07T00:00:02.000Z";
  const workspaceRoot = runtimeEnv.persistedWorkspaceRoot;
  const userPayload = JSON.stringify({
    type: "user_message",
    content: "请验证 persisted session archive restart readback。",
  });
  const assistantPayload = JSON.stringify({
    type: "agent_message",
    text: "已准备 persisted session archive restart readback fixture。",
    phase: "final",
  });

  const sql = `
PRAGMA busy_timeout = 5000;
DELETE FROM agent_thread_items WHERE session_id = ${sqlLiteral(PERSISTED_SESSION_ID)};
DELETE FROM agent_thread_turns WHERE session_id = ${sqlLiteral(PERSISTED_SESSION_ID)};
DELETE FROM agent_sessions WHERE id = ${sqlLiteral(PERSISTED_SESSION_ID)};
INSERT OR REPLACE INTO workspaces (
  id, name, workspace_type, root_path, is_default, settings_json,
  created_at, updated_at, icon, color, is_favorite, is_archived,
  tags_json, default_persona_id
) VALUES (
  ${sqlLiteral(PERSISTED_WORKSPACE_ID)},
  'Electron persisted archive fixture',
  'persistent',
  ${sqlLiteral(workspaceRoot)},
  0,
  '{}',
  1780790400000,
  1780790400000,
  NULL,
  NULL,
  0,
  0,
  '[]',
  NULL
);
INSERT INTO agent_sessions (
  id, model, system_prompt, title, created_at, updated_at,
  working_dir, execution_strategy, session_type, extension_data_json,
  provider_name, model_config_json, archived_at
) VALUES (
  ${sqlLiteral(PERSISTED_SESSION_ID)},
  'fixture-model',
  NULL,
  ${sqlLiteral(PERSISTED_TITLE)},
  ${sqlLiteral(now)},
  ${sqlLiteral(turnCompletedAt)},
  ${sqlLiteral(workspaceRoot)},
  'react',
  'user',
  '{}',
  'fixture-provider',
  '{"model_name":"fixture-model"}',
  NULL
);
INSERT INTO agent_thread_turns (
  id, session_id, prompt_text, status, started_at, completed_at,
  error_message, created_at, updated_at
) VALUES (
  ${sqlLiteral(PERSISTED_TURN_ID)},
  ${sqlLiteral(PERSISTED_SESSION_ID)},
  '请验证 persisted session archive restart readback。',
  'completed',
  ${sqlLiteral(turnStartedAt)},
  ${sqlLiteral(turnCompletedAt)},
  NULL,
  ${sqlLiteral(turnStartedAt)},
  ${sqlLiteral(turnCompletedAt)}
);
INSERT INTO agent_thread_items (
  id, session_id, turn_id, sequence, item_type, status, started_at,
  completed_at, updated_at, payload_json
) VALUES
  (
    ${sqlLiteral(PERSISTED_USER_ITEM_ID)},
    ${sqlLiteral(PERSISTED_SESSION_ID)},
    ${sqlLiteral(PERSISTED_TURN_ID)},
    1,
    'user_message',
    'completed',
    ${sqlLiteral(turnStartedAt)},
    ${sqlLiteral(turnStartedAt)},
    ${sqlLiteral(turnStartedAt)},
    ${sqlLiteral(userPayload)}
  ),
  (
    ${sqlLiteral(PERSISTED_AGENT_ITEM_ID)},
    ${sqlLiteral(PERSISTED_SESSION_ID)},
    ${sqlLiteral(PERSISTED_TURN_ID)},
    2,
    'agent_message',
    'completed',
    ${sqlLiteral(turnCompletedAt)},
    ${sqlLiteral(turnCompletedAt)},
    ${sqlLiteral(turnCompletedAt)},
    ${sqlLiteral(assistantPayload)}
  );
`;
  runSqlite(dbPath, sql);
  return {
    dbPath,
    workspaceRoot,
    sessionId: PERSISTED_SESSION_ID,
    workspaceId: PERSISTED_WORKSPACE_ID,
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
}) {
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
  page.setDefaultTimeout(options.timeoutMs);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const rendererSnapshot = await waitForRendererReady(page, options);
  await clearInvokeBuffers(page);

  return { app, page, rendererSnapshot };
}

async function closeElectronFixture(handle) {
  if (handle?.app) {
    await handle.app.close().catch(() => undefined);
    await sleep(500);
  }
}

async function runSessionHistoryFixture(page) {
  return await page.evaluate(
    async ({
      command,
      sessionId,
      threadId,
      workspaceId,
      initialTitle,
      updatedTitle,
    }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }

      const requests = [];
      const messages = [];
      let requestId = 1;

      async function callRaw(method, params = {}) {
        const id = `agent-session-history-electron-${requestId++}`;
        requests.push({ id, method, params });
        let response;
        try {
          response = await invoke(command, {
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
        } catch (error) {
          return {
            id,
            method,
            params,
            decoded: [],
            error: null,
            result: null,
            invokeErrorMessage:
              error instanceof Error ? error.message : String(error),
          };
        }
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
        messages.push(...decoded);
        const error = decoded.find(
          (message) => message?.id === id && message.error,
        );
        const result = decoded.find(
          (message) =>
            message?.id === id &&
            Object.prototype.hasOwnProperty.call(message, "result"),
        );
        return {
          id,
          method,
          params,
          decoded,
          error,
          result,
          invokeErrorMessage: null,
        };
      }

      async function call(method, params = {}) {
        const response = await callRaw(method, params);
        if (response.invokeErrorMessage) {
          throw new Error(`${method} rejected: ${response.invokeErrorMessage}`);
        }
        if (response.error) {
          throw new Error(
            `${method} failed: ${JSON.stringify(response.error.error)}`,
          );
        }
        const { result } = response;
        if (!result) {
          throw new Error(`${method} did not return a JSON-RPC result`);
        }
        return result.result;
      }

      async function callExpectError(method, params = {}) {
        const response = await callRaw(method, params);
        if (response.invokeErrorMessage) {
          return {
            code: null,
            message: response.invokeErrorMessage,
            transport: "electron-ipc-reject",
          };
        }
        if (!response.error) {
          throw new Error(
            `${method} did not return the expected JSON-RPC error`,
          );
        }
        return {
          ...response.error.error,
          transport: "jsonrpc-error",
        };
      }

      const initialize = await call("initialize", {
        clientInfo: {
          name: "agent-session-history-electron-fixture",
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });
      const start = await call("agentSession/start", {
        sessionId,
        threadId,
        appId: "desktop",
        workspaceId,
        businessObjectRef: {
          kind: "agent.session",
          id: `agent-session:${workspaceId}:${sessionId}`,
          title: initialTitle,
          metadata: {
            title: initialTitle,
            model: "fixture-unavailable",
            modelName: "fixture-unavailable",
            executionStrategy: "react",
            runStartHooks: false,
            harness: {
              hiddenFromUserRecents: false,
              source: "smoke:agent-session-history-electron-fixture",
            },
          },
        },
      });
      const firstRead = await call("agentSession/read", {
        sessionId,
        historyLimit: 50,
      });
      const update = await call("agentSession/update", {
        sessionId,
        title: updatedTitle,
        providerSelector: "fixture-provider",
        providerName: "fixture-provider",
        modelName: "fixture-model",
        executionStrategy: "react",
      });
      const archiveFailure = await callExpectError("agentSession/update", {
        sessionId,
        archived: true,
      });
      const secondRead = await call("agentSession/read", {
        sessionId,
        historyLimit: 50,
      });
      const list = await call("agentSession/list", {
        includeArchived: true,
        limit: 20,
      });

      return {
        initialize,
        start,
        firstRead,
        update,
        archiveFailure,
        secondRead,
        list,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      workspaceId: WORKSPACE_ID,
      initialTitle: INITIAL_TITLE,
      updatedTitle: UPDATED_TITLE,
    },
  );
}

async function runPersistedSessionArchivePhase(page, phase) {
  return await page.evaluate(
    async ({
      command,
      phase,
      sessionId,
      workspaceId,
      archivedTitle,
      restoredTitle,
    }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }

      const requests = [];
      const messages = [];
      let requestId = 1;

      async function callRaw(method, params = {}) {
        const id = `agent-session-history-electron-persisted-${phase}-${requestId++}`;
        requests.push({ id, method, params });
        let response;
        try {
          response = await invoke(command, {
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
        } catch (error) {
          return {
            id,
            method,
            params,
            decoded: [],
            error: null,
            result: null,
            invokeErrorMessage:
              error instanceof Error ? error.message : String(error),
          };
        }
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
        messages.push(...decoded);
        const error = decoded.find(
          (message) => message?.id === id && message.error,
        );
        const result = decoded.find(
          (message) =>
            message?.id === id &&
            Object.prototype.hasOwnProperty.call(message, "result"),
        );
        return {
          id,
          method,
          params,
          decoded,
          error,
          result,
          invokeErrorMessage: null,
        };
      }

      async function call(method, params = {}) {
        const response = await callRaw(method, params);
        if (response.invokeErrorMessage) {
          throw new Error(`${method} rejected: ${response.invokeErrorMessage}`);
        }
        if (response.error) {
          throw new Error(
            `${method} failed: ${JSON.stringify(response.error.error)}`,
          );
        }
        const { result } = response;
        if (!result) {
          throw new Error(`${method} did not return a JSON-RPC result`);
        }
        return result.result;
      }

      const listParams = {
        workspaceId,
        limit: 20,
      };
      const initialize = await call("initialize", {
        clientInfo: {
          name: `agent-session-history-electron-fixture:${phase}`,
          version: "1.0.0",
        },
        capabilities: { eventMethods: ["agentSession/event"] },
      });
      await invoke(command, {
        request: {
          lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
        },
      });

      let result;
      if (phase === "archive") {
        const recentBefore = await call("agentSession/list", listParams);
        const readBefore = await call("agentSession/read", {
          sessionId,
          historyLimit: 50,
        });
        const updateArchive = await call("agentSession/update", {
          sessionId,
          title: archivedTitle,
          archived: true,
        });
        const archivedAfter = await call("agentSession/list", {
          ...listParams,
          archivedOnly: true,
        });
        const recentAfter = await call("agentSession/list", listParams);
        const readAfter = await call("agentSession/read", {
          sessionId,
          historyLimit: 50,
        });
        result = {
          recentBefore,
          readBefore,
          updateArchive,
          archivedAfter,
          recentAfter,
          readAfter,
        };
      } else if (phase === "archive-readback") {
        const archivedAfterRestart = await call("agentSession/list", {
          ...listParams,
          archivedOnly: true,
        });
        const recentAfterRestart = await call("agentSession/list", listParams);
        const readAfterRestart = await call("agentSession/read", {
          sessionId,
          historyLimit: 50,
        });
        result = {
          archivedAfterRestart,
          recentAfterRestart,
          readAfterRestart,
        };
      } else if (phase === "unarchive") {
        const archivedBefore = await call("agentSession/list", {
          ...listParams,
          archivedOnly: true,
        });
        const updateUnarchive = await call("agentSession/update", {
          sessionId,
          title: restoredTitle,
          archived: false,
        });
        const archivedAfter = await call("agentSession/list", {
          ...listParams,
          archivedOnly: true,
        });
        const recentAfter = await call("agentSession/list", listParams);
        const readAfter = await call("agentSession/read", {
          sessionId,
          historyLimit: 50,
        });
        result = {
          archivedBefore,
          updateUnarchive,
          archivedAfter,
          recentAfter,
          readAfter,
        };
      } else if (phase === "unarchive-readback") {
        const archivedAfterRestart = await call("agentSession/list", {
          ...listParams,
          archivedOnly: true,
        });
        const recentAfterRestart = await call("agentSession/list", listParams);
        const readAfterRestart = await call("agentSession/read", {
          sessionId,
          historyLimit: 50,
        });
        result = {
          archivedAfterRestart,
          recentAfterRestart,
          readAfterRestart,
        };
      } else {
        throw new Error(`unknown persisted archive phase: ${phase}`);
      }

      return {
        phase,
        initialize,
        ...result,
        requests,
        messages,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    {
      command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
      phase,
      sessionId: PERSISTED_SESSION_ID,
      workspaceId: PERSISTED_WORKSPACE_ID,
      archivedTitle: PERSISTED_ARCHIVED_TITLE,
      restoredTitle: PERSISTED_TITLE,
    },
  );
}

function parseInvokeTraceRaw(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonRpcRequestsFromInvokeTrace(raw) {
  const entries = parseInvokeTraceRaw(raw);
  const requests = [];
  for (const entry of entries) {
    if (entry?.command !== APP_SERVER_HANDLE_JSON_LINES_COMMAND) {
      continue;
    }
    const lines = entry?.args_preview?.request?.lines;
    if (!Array.isArray(lines)) {
      continue;
    }
    for (const line of lines) {
      const parsed = parseJsonRpcLine(line);
      if (parsed?.method) {
        requests.push({
          command: entry.command,
          transport: entry.transport ?? null,
          status: entry.status ?? null,
          durationMs: entry.duration_ms ?? null,
          id: parsed.id ?? null,
          method: parsed.method,
          params: parsed.params ?? {},
        });
      }
    }
  }
  return requests;
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

async function primeSidebarWorkspace(page, options) {
  await page.evaluate(
    ({ collapsedKey, persistedProjectEvent, lastProjectKey, workspaceId }) => {
      window.localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      window.localStorage.setItem(collapsedKey, "false");
      window.dispatchEvent(
        new CustomEvent(persistedProjectEvent, {
          detail: {
            key: lastProjectKey,
            projectId: workspaceId,
          },
        }),
      );
    },
    {
      collapsedKey: APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      persistedProjectEvent: PERSISTED_PROJECT_ID_CHANGED_EVENT,
      lastProjectKey: LAST_PROJECT_ID_KEY,
      workspaceId: PERSISTED_WORKSPACE_ID,
    },
  );

  await waitForPageCondition(
    page,
    options,
    ({ shelfSelector, recentSelector }) =>
      Boolean(
        document.querySelector(shelfSelector) &&
        document.querySelector(recentSelector),
      ),
    "侧栏会话 Shelf / 最近对话列表未挂载",
    {
      shelfSelector: SIDEBAR_SHELF_SELECTOR,
      recentSelector: SIDEBAR_RECENT_LIST_SELECTOR,
    },
  );
}

async function waitForSidebarListSettled(page, options, selector, loadingText) {
  return await waitForPageCondition(
    page,
    options,
    ({ selector: listSelector, loadingText: text }) => {
      const list = document.querySelector(listSelector);
      if (!list) {
        return false;
      }
      return !String(list.textContent ?? "").includes(text);
    },
    `${selector} 仍处于 loading`,
    { selector, loadingText },
  );
}

async function waitForSidebarSessionVisibility(
  page,
  options,
  { recentTitle, archivedTitle },
) {
  return await waitForPageCondition(
    page,
    options,
    ({ recentSelector, archivedSelector, recentTitle, archivedTitle }) => {
      const recentText =
        document.querySelector(recentSelector)?.textContent ?? "";
      const archivedText =
        document.querySelector(archivedSelector)?.textContent ?? "";
      const recentMatched = recentTitle
        ? recentText.includes(recentTitle)
        : !recentText.includes(archivedTitle);
      const archivedMatched = archivedTitle
        ? archivedText.includes(archivedTitle)
        : !archivedText.includes(recentTitle);
      return recentMatched && archivedMatched
        ? {
            recentText,
            archivedText,
          }
        : false;
    },
    `侧栏未达到预期会话可见状态 recent=${recentTitle ?? "absent"} archived=${
      archivedTitle ?? "absent"
    }`,
    {
      recentSelector: SIDEBAR_RECENT_LIST_SELECTOR,
      archivedSelector: SIDEBAR_ARCHIVED_LIST_SELECTOR,
      recentTitle,
      archivedTitle,
    },
  );
}

async function ensureArchivedSidebarExpanded(page, options) {
  await page.evaluate(
    ({ shelfSelector }) => {
      const shelf = document.querySelector(shelfSelector);
      const toggle = shelf?.querySelector('button[aria-expanded="false"]');
      if (toggle instanceof HTMLButtonElement) {
        toggle.click();
      }
    },
    { shelfSelector: SIDEBAR_SHELF_SELECTOR },
  );

  await waitForPageCondition(
    page,
    options,
    ({ archivedSelector }) => Boolean(document.querySelector(archivedSelector)),
    "归档会话列表未挂载",
    { archivedSelector: SIDEBAR_ARCHIVED_LIST_SELECTOR },
  );
  await waitForSidebarListSettled(
    page,
    options,
    SIDEBAR_ARCHIVED_LIST_SELECTOR,
    "正在加载归档",
  );
}

async function openSidebarConversationMenu(page, options, title) {
  const opened = await page.evaluate(
    ({ title }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((button) =>
        String(button.getAttribute("aria-label") ?? "").includes(title),
      );
      if (!(target instanceof HTMLButtonElement)) {
        return false;
      }
      target.click();
      return true;
    },
    { title },
  );
  assert(opened, `未找到 ${title} 的侧栏操作菜单按钮`);
  await waitForPageCondition(
    page,
    options,
    () =>
      Boolean(
        document.querySelector('[data-testid="app-sidebar-conversation-menu"]'),
      ),
    `${title} 操作菜单未打开`,
  );
}

async function clickSidebarArchiveMenuItem(page, options) {
  const clicked = await page.evaluate(
    ({ selector }) => {
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLButtonElement)) {
        return false;
      }
      target.click();
      return true;
    },
    { selector: SIDEBAR_ARCHIVE_MENU_ITEM_SELECTOR },
  );
  assert(clicked, "未找到侧栏归档 / 恢复菜单项");
  await waitForPageCondition(
    page,
    options,
    () =>
      !document.querySelector('[data-testid="app-sidebar-conversation-menu"]'),
    "侧栏会话操作菜单未关闭",
  );
}

async function waitForSidebarGuiUpdateTrace(page, options, archived) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(45_000, options.timeoutMs)) {
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const requests = parseJsonRpcRequestsFromInvokeTrace(traceRaw);
    const matched = requests.find(
      (request) =>
        request.method === "agentSession/update" &&
        request.params?.sessionId === PERSISTED_SESSION_ID &&
        request.params?.archived === archived &&
        request.status === "success",
    );
    if (matched) {
      return {
        matched,
        requests,
        traceRaw,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `侧栏 GUI 点击未等到 agentSession/update archived=${String(
      archived,
    )} 成功 trace`,
  );
}

async function readSidebarSnapshot(page) {
  return await page.evaluate(
    ({ recentSelector, archivedSelector, traceKey, errorKey }) => ({
      recentText:
        document.querySelector(recentSelector)?.textContent?.trim() ?? "",
      archivedText:
        document.querySelector(archivedSelector)?.textContent?.trim() ?? "",
      traceRaw: window.localStorage.getItem(traceKey),
      errorRaw: window.localStorage.getItem(errorKey),
      rememberedProjectRaw: window.localStorage.getItem(
        "agent_last_project_id",
      ),
    }),
    {
      recentSelector: SIDEBAR_RECENT_LIST_SELECTOR,
      archivedSelector: SIDEBAR_ARCHIVED_LIST_SELECTOR,
      traceKey: "lime_invoke_trace_buffer_v1",
      errorKey: "lime_invoke_error_buffer_v1",
    },
  );
}

function summarizeSidebarGuiArchive(result) {
  const requestMethods = Array.from(
    new Set((result?.guiRequests ?? []).map((request) => request.method)),
  );
  const updateRequests = (result?.guiRequests ?? []).filter(
    (request) => request.method === "agentSession/update",
  );
  return {
    requestMethods,
    missingRequiredMethods: SIDEBAR_GUI_REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    forbiddenMethodsSeen: SIDEBAR_GUI_FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ),
    appServerHandleJsonLinesSeen: (result?.guiRequests ?? []).some(
      (request) => request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    ),
    archiveRequestSeen: updateRequests.some(
      (request) =>
        request.params?.sessionId === PERSISTED_SESSION_ID &&
        request.params?.archived === true,
    ),
    unarchiveRequestSeen: updateRequests.some(
      (request) =>
        request.params?.sessionId === PERSISTED_SESSION_ID &&
        request.params?.archived === false,
    ),
    beforeRecentText: result?.before?.recentText ?? "",
    beforeArchivedText: result?.before?.archivedText ?? "",
    afterArchiveRecentText: result?.afterArchive?.recentText ?? "",
    afterArchiveArchivedText: result?.afterArchive?.archivedText ?? "",
    afterUnarchiveRecentText: result?.afterUnarchive?.recentText ?? "",
    afterUnarchiveArchivedText: result?.afterUnarchive?.archivedText ?? "",
    archiveReadback: summarizePersistedArchivePhase(
      result?.archiveReadback ?? {},
    ),
    unarchiveReadback: summarizePersistedArchivePhase(
      result?.unarchiveReadback ?? {},
    ),
  };
}

function assertSidebarGuiArchive(result) {
  const summary = summarizeSidebarGuiArchive(result);
  assert(
    summary.appServerHandleJsonLinesSeen,
    "侧栏 GUI 点击未观察到 app_server_handle_json_lines",
  );
  assert(
    summary.missingRequiredMethods.length === 0,
    `侧栏 GUI 点击缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.forbiddenMethodsSeen.length === 0,
    `侧栏 GUI 点击不应触发: ${summary.forbiddenMethodsSeen.join(", ")}`,
  );
  assert(
    summary.archiveRequestSeen,
    "侧栏 GUI 点击未发起 agentSession/update archived=true",
  );
  assert(
    summary.unarchiveRequestSeen,
    "侧栏 GUI 点击未发起 agentSession/update archived=false",
  );
  assert(
    summary.beforeRecentText.includes(PERSISTED_TITLE),
    "侧栏 GUI 初始最近列表未显示 persisted session",
  );
  assert(
    !summary.beforeArchivedText.includes(PERSISTED_TITLE),
    "侧栏 GUI 初始归档列表不应显示 persisted session",
  );
  assert(
    !summary.afterArchiveRecentText.includes(PERSISTED_TITLE),
    "侧栏 GUI 归档后最近列表仍显示 persisted session",
  );
  assert(
    summary.afterArchiveArchivedText.includes(PERSISTED_TITLE),
    "侧栏 GUI 归档后归档列表未显示 persisted session",
  );
  assert(
    summary.afterUnarchiveRecentText.includes(PERSISTED_TITLE),
    "侧栏 GUI 恢复后最近列表未显示 persisted session",
  );
  assert(
    !summary.afterUnarchiveArchivedText.includes(PERSISTED_TITLE),
    "侧栏 GUI 恢复后归档列表仍显示 persisted session",
  );
  assertPersistedPhaseContract(summary.archiveReadback);
  assertVisiblePersistedSession(
    summary.archiveReadback.archivedAfterRestartSession,
    "sidebar GUI archive readback archivedOnly list",
    true,
  );
  assert(
    !summary.archiveReadback.recentAfterRestartSession,
    "sidebar GUI archive readback 后 recent list 不应返回 archived session",
  );
  assertPersistedPhaseContract(summary.unarchiveReadback);
  assertVisiblePersistedSession(
    summary.unarchiveReadback.recentAfterRestartSession,
    "sidebar GUI unarchive readback recent list",
    false,
  );
  assert(
    !summary.unarchiveReadback.archivedAfterRestartSession,
    "sidebar GUI unarchive readback 后 archivedOnly list 不应返回 session",
  );
  return summary;
}

async function runSidebarGuiArchivePhase(page, options) {
  await primeSidebarWorkspace(page, options);
  await waitForSidebarListSettled(
    page,
    options,
    SIDEBAR_RECENT_LIST_SELECTOR,
    "正在加载对话",
  );
  await ensureArchivedSidebarExpanded(page, options);
  await waitForSidebarSessionVisibility(page, options, {
    recentTitle: PERSISTED_TITLE,
    archivedTitle: null,
  });

  const before = await readSidebarSnapshot(page);
  await clearInvokeBuffers(page);

  await openSidebarConversationMenu(page, options, PERSISTED_TITLE);
  await clickSidebarArchiveMenuItem(page, options);
  await waitForSidebarSessionVisibility(page, options, {
    recentTitle: null,
    archivedTitle: PERSISTED_TITLE,
  });
  const archiveTrace = await waitForSidebarGuiUpdateTrace(page, options, true);
  const afterArchive = await readSidebarSnapshot(page);
  const archiveReadback = await runPersistedSessionArchivePhase(
    page,
    "archive-readback",
  );

  await openSidebarConversationMenu(page, options, PERSISTED_TITLE);
  await clickSidebarArchiveMenuItem(page, options);
  await waitForSidebarSessionVisibility(page, options, {
    recentTitle: PERSISTED_TITLE,
    archivedTitle: null,
  });
  const unarchiveTrace = await waitForSidebarGuiUpdateTrace(
    page,
    options,
    false,
  );
  const afterUnarchive = await readSidebarSnapshot(page);
  const unarchiveReadback = await runPersistedSessionArchivePhase(
    page,
    "unarchive-readback",
  );

  const guiRequests = unarchiveTrace.requests;

  return {
    before,
    afterArchive,
    afterUnarchive,
    guiRequests,
    archiveTrace,
    unarchiveTrace,
    archiveReadback,
    unarchiveReadback,
  };
}

function summarizeFixtureResult(result) {
  const requestMethods = Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
  const listedSession = (result?.list?.sessions ?? []).find(
    (session) => session.sessionId === SESSION_ID,
  );
  return {
    requestMethods,
    missingRequiredMethods: REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    forbiddenMethodsSeen: FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ),
    archiveRequestSeen: (result?.requests ?? []).some(
      (request) =>
        request.method === "agentSession/update" &&
        request.params?.archived === true,
    ),
    archiveFailureMessage: result?.archiveFailure?.message ?? null,
    archiveFailureTransport: result?.archiveFailure?.transport ?? null,
    archiveFailClosed: String(result?.archiveFailure?.message ?? "").includes(
      ARCHIVE_FAIL_CLOSED_MESSAGE,
    ),
    sessionId: result?.start?.session?.sessionId ?? null,
    firstReadSessionId: result?.firstRead?.session?.sessionId ?? null,
    secondReadSessionId: result?.secondRead?.session?.sessionId ?? null,
    listSessionFound: Boolean(listedSession),
    listedSession,
    listedSessionArchivedAt: listedSession?.archivedAt ?? null,
    firstReadDetail: result?.firstRead?.detail ?? null,
    secondReadDetail: result?.secondRead?.detail ?? null,
  };
}

function uniqueRequestMethods(result) {
  return Array.from(
    new Set((result?.requests ?? []).map((request) => request.method)),
  );
}

function persistedSessionFromList(response) {
  return (response?.sessions ?? []).find(
    (session) => session.sessionId === PERSISTED_SESSION_ID,
  );
}

function persistedReadDetailShape(readResponse) {
  const detail = readResponse?.detail;
  return {
    sessionId: readResponse?.session?.sessionId ?? null,
    threadId: readResponse?.session?.threadId ?? null,
    hasDetail: Boolean(detail && typeof detail === "object"),
    turnsIsArray: Array.isArray(detail?.turns),
    itemsIsArray: Array.isArray(detail?.items),
    queuedTurnsIsArray: Array.isArray(detail?.queued_turns),
    childSubagentSessionsIsArray: Array.isArray(
      detail?.child_subagent_sessions,
    ),
    threadReadPresent:
      detail && Object.prototype.hasOwnProperty.call(detail, "thread_read"),
    messagesCount: detail?.messages_count ?? null,
  };
}

function summarizePersistedArchivePhase(result) {
  const requestMethods = uniqueRequestMethods(result);
  const updateRequests = (result?.requests ?? []).filter(
    (request) => request.method === "agentSession/update",
  );
  return {
    phase: result?.phase ?? null,
    requestMethods,
    missingRequiredMethods: PERSISTED_SESSION_REQUIRED_METHODS.filter(
      (method) => !requestMethods.includes(method),
    ),
    forbiddenMethodsSeen: PERSISTED_SESSION_FORBIDDEN_METHODS.filter((method) =>
      requestMethods.includes(method),
    ),
    archiveRequestSeen: updateRequests.some(
      (request) => request.params?.archived === true,
    ),
    unarchiveRequestSeen: updateRequests.some(
      (request) => request.params?.archived === false,
    ),
    recentBeforeSession: persistedSessionFromList(result?.recentBefore),
    archivedBeforeSession: persistedSessionFromList(result?.archivedBefore),
    recentAfterSession: persistedSessionFromList(result?.recentAfter),
    archivedAfterSession: persistedSessionFromList(result?.archivedAfter),
    recentAfterRestartSession: persistedSessionFromList(
      result?.recentAfterRestart,
    ),
    archivedAfterRestartSession: persistedSessionFromList(
      result?.archivedAfterRestart,
    ),
    updateArchiveSession: result?.updateArchive?.session ?? null,
    updateUnarchiveSession: result?.updateUnarchive?.session ?? null,
    readBeforeDetail: persistedReadDetailShape(result?.readBefore),
    readAfterDetail: persistedReadDetailShape(result?.readAfter),
    readAfterRestartDetail: persistedReadDetailShape(result?.readAfterRestart),
  };
}

function assertPersistedReadDetail(detail, label) {
  assert(
    detail.sessionId === PERSISTED_SESSION_ID,
    `${label} sessionId 不正确`,
  );
  assert(detail.threadId === PERSISTED_SESSION_ID, `${label} threadId 不正确`);
  assert(detail.hasDetail, `${label} 缺少 persisted detail`);
  assert(detail.turnsIsArray, `${label}.detail.turns 不是数组`);
  assert(detail.itemsIsArray, `${label}.detail.items 不是数组`);
  assert(detail.queuedTurnsIsArray, `${label}.detail.queued_turns 不是数组`);
  assert(
    detail.childSubagentSessionsIsArray,
    `${label}.detail.child_subagent_sessions 不能破坏 hydrate`,
  );
  assert(detail.threadReadPresent, `${label}.detail.thread_read 字段缺失`);
  assert(
    Number(detail.messagesCount) >= 2,
    `${label}.detail.messages_count 未反映 persisted timeline items`,
  );
}

function assertPersistedPhaseContract(summary) {
  assert(
    summary.missingRequiredMethods.length === 0,
    `${summary.phase} 缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.forbiddenMethodsSeen.length === 0,
    `${summary.phase} 不应触发: ${summary.forbiddenMethodsSeen.join(", ")}`,
  );
}

function assertVisiblePersistedSession(session, label, expectedArchived) {
  assert(session, `${label} 未返回 persisted session`);
  assert(
    session.sessionId === PERSISTED_SESSION_ID,
    `${label} sessionId 不正确`,
  );
  assert(session.threadId === PERSISTED_SESSION_ID, `${label} threadId 不正确`);
  assert(
    session.workspaceId === PERSISTED_WORKSPACE_ID,
    `${label} workspaceId 不正确: ${session.workspaceId}`,
  );
  assert(
    Number(session.messagesCount) >= 2,
    `${label} messagesCount 未反映 timeline entries`,
  );
  if (expectedArchived) {
    assert(session.archivedAt, `${label} 缺少 archivedAt`);
  } else {
    assert(session.archivedAt == null, `${label} 不应有 archivedAt`);
  }
}

function assertPersistedArchivePhase(result) {
  const summary = summarizePersistedArchivePhase(result);
  assertPersistedPhaseContract(summary);
  assert(
    summary.archiveRequestSeen,
    "persisted archive phase 未发起 archived=true update",
  );
  assertVisiblePersistedSession(
    summary.recentBeforeSession,
    "archive recentBefore",
    false,
  );
  assertPersistedReadDetail(summary.readBeforeDetail, "archive readBefore");
  assertVisiblePersistedSession(
    summary.updateArchiveSession,
    "archive update response",
    true,
  );
  assert(
    summary.updateArchiveSession?.title === PERSISTED_ARCHIVED_TITLE,
    `archive update 未反映标题: ${summary.updateArchiveSession?.title}`,
  );
  assertVisiblePersistedSession(
    summary.archivedAfterSession,
    "archive archivedOnly list",
    true,
  );
  assert(
    !summary.recentAfterSession,
    "archive 后 includeArchived=false recent list 不应继续返回 session",
  );
  assertPersistedReadDetail(summary.readAfterDetail, "archive readAfter");
  return summary;
}

function assertPersistedArchiveReadbackPhase(result) {
  const summary = summarizePersistedArchivePhase(result);
  assertPersistedPhaseContract(summary);
  assertVisiblePersistedSession(
    summary.archivedAfterRestartSession,
    "archive restart archivedOnly list",
    true,
  );
  assert(
    summary.archivedAfterRestartSession?.title === PERSISTED_ARCHIVED_TITLE,
    `archive restart 未读回归档标题: ${summary.archivedAfterRestartSession?.title}`,
  );
  assert(
    !summary.recentAfterRestartSession,
    "archive restart 后 recent list 不应返回 archived session",
  );
  assertPersistedReadDetail(
    summary.readAfterRestartDetail,
    "archive restart read",
  );
  return summary;
}

function assertPersistedUnarchivePhase(result) {
  const summary = summarizePersistedArchivePhase(result);
  assertPersistedPhaseContract(summary);
  assert(
    summary.unarchiveRequestSeen,
    "persisted unarchive phase 未发起 archived=false update",
  );
  assertVisiblePersistedSession(
    summary.archivedBeforeSession,
    "unarchive archivedBefore",
    true,
  );
  assertVisiblePersistedSession(
    summary.updateUnarchiveSession,
    "unarchive update response",
    false,
  );
  assert(
    summary.updateUnarchiveSession?.title === PERSISTED_TITLE,
    `unarchive update 未恢复标题: ${summary.updateUnarchiveSession?.title}`,
  );
  assert(
    !summary.archivedAfterSession,
    "unarchive 后 archivedOnly list 不应继续返回 session",
  );
  assertVisiblePersistedSession(
    summary.recentAfterSession,
    "unarchive recent list",
    false,
  );
  assertPersistedReadDetail(summary.readAfterDetail, "unarchive readAfter");
  return summary;
}

function assertPersistedUnarchiveReadbackPhase(result) {
  const summary = summarizePersistedArchivePhase(result);
  assertPersistedPhaseContract(summary);
  assert(
    !summary.archivedAfterRestartSession,
    "unarchive restart 后 archivedOnly list 不应返回 session",
  );
  assertVisiblePersistedSession(
    summary.recentAfterRestartSession,
    "unarchive restart recent list",
    false,
  );
  assert(
    summary.recentAfterRestartSession?.title === PERSISTED_TITLE,
    `unarchive restart 未恢复标题: ${summary.recentAfterRestartSession?.title}`,
  );
  assertPersistedReadDetail(
    summary.readAfterRestartDetail,
    "unarchive restart read",
  );
  return summary;
}

function assertFixtureResult(result) {
  const summary = summarizeFixtureResult(result);
  assert(
    summary.missingRequiredMethods.length === 0,
    `缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.forbiddenMethodsSeen.length === 0,
    `默认 history fixture 不应触发: ${summary.forbiddenMethodsSeen.join(", ")}`,
  );
  assert(
    summary.sessionId === SESSION_ID,
    "agentSession/start sessionId 不正确",
  );
  assert(
    summary.firstReadSessionId === SESSION_ID,
    "首次 agentSession/read sessionId 不正确",
  );
  assert(
    summary.secondReadSessionId === SESSION_ID,
    "更新后 agentSession/read sessionId 不正确",
  );
  assert(summary.listSessionFound, "agentSession/list 未返回 fixture session");
  assert(
    summary.listedSession?.title === UPDATED_TITLE,
    `agentSession/list 未反映更新标题: ${summary.listedSession?.title}`,
  );
  assert(
    summary.archiveRequestSeen,
    "history fixture 未验证 archived=true fail-closed 边界",
  );
  assert(
    summary.archiveFailClosed,
    `内存 session archived=true 应 fail closed，实际错误: ${summary.archiveFailureMessage}`,
  );
  assert(
    summary.listedSessionArchivedAt == null,
    `内存 session 归档失败后不应出现在归档态: ${summary.listedSessionArchivedAt}`,
  );

  for (const [label, detail] of [
    ["firstRead", summary.firstReadDetail],
    ["secondRead", summary.secondReadDetail],
  ]) {
    assert(detail && typeof detail === "object", `${label} 缺少 detail`);
    assert(Array.isArray(detail.turns), `${label}.detail.turns 不是数组`);
    assert(Array.isArray(detail.items), `${label}.detail.items 不是数组`);
    assert(
      Array.isArray(detail.queued_turns),
      `${label}.detail.queued_turns 不是数组`,
    );
    assert(
      Array.isArray(detail.child_subagent_sessions ?? []),
      `${label}.detail.child_subagent_sessions 不能破坏 hydrate`,
    );
    assert(
      detail.thread_read && typeof detail.thread_read === "object",
      `${label}.detail.thread_read 缺失`,
    );
  }

  return summary;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
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
    ok: false,
    checkedAt: new Date().toISOString(),
    appUrl: options.appUrl || null,
    sessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    tempRoot: options.keepTemp ? runtimeEnv.tempRoot : null,
    electronUserDataDir: options.keepTemp
      ? runtimeEnv.electronUserDataDir
      : null,
    backendMode: "unavailable",
    appServerBinary: options.keepTemp
      ? appServerBinary
      : path.basename(appServerBinary),
    requiredMethods: REQUIRED_METHODS,
    forbiddenMethods: FORBIDDEN_METHODS,
    persistedSessionId: PERSISTED_SESSION_ID,
    persistedWorkspaceId: PERSISTED_WORKSPACE_ID,
    persistedRequiredMethods: PERSISTED_SESSION_REQUIRED_METHODS,
    persistedForbiddenMethods: PERSISTED_SESSION_FORBIDDEN_METHODS,
    sqliteBinary: SQLITE3_BINARY,
    electronPreloadBridge: false,
    fixtureSummary: null,
    persistedSeed: null,
    persistedArchiveSummary: null,
    persistedArchiveReopenSummary: null,
    persistedUnarchiveSummary: null,
    persistedUnarchiveReopenSummary: null,
    sidecarRestartReadback: false,
    sidebarGuiArchiveSummary: null,
    sidebarGuiArchive: false,
    consoleErrors: [],
    screenshot: null,
    rawEvidence: rawEvidencePath,
    summary: summaryPath,
  };

  let app = null;
  let page = null;
  const consoleErrors = [];
  const rawEvidence = {};

  try {
    logStage("launch-electron-memory-fail-closed");
    let handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    summary.electronPreloadBridge =
      handle.rendererSnapshot.electron &&
      handle.rendererSnapshot.hasInvokeBridge;

    logStage("invoke-session-history");
    const fixtureResult = await runSessionHistoryFixture(page);
    rawEvidence.memoryFailClosed = sanitizeJson(fixtureResult);
    const fixtureSummary = assertFixtureResult(fixtureResult);
    summary.fixtureSummary = sanitizeJson(fixtureSummary);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await closeElectronFixture(handle);
    app = null;
    page = null;

    logStage("seed-persisted-current-timeline-session");
    const persistedSeed = seedPersistedCurrentTimelineSession(runtimeEnv);
    summary.persistedSeed = sanitizeJson({
      ...persistedSeed,
      sqliteBinary: SQLITE3_BINARY,
    });

    logStage("launch-electron-persisted-archive");
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    const persistedArchiveResult = await runPersistedSessionArchivePhase(
      page,
      "archive",
    );
    rawEvidence.persistedArchive = sanitizeJson(persistedArchiveResult);
    const persistedArchiveSummary = assertPersistedArchivePhase(
      persistedArchiveResult,
    );
    summary.persistedArchiveSummary = sanitizeJson(persistedArchiveSummary);
    await closeElectronFixture(handle);
    app = null;
    page = null;

    logStage("launch-electron-persisted-archive-readback");
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    const persistedArchiveReadbackResult =
      await runPersistedSessionArchivePhase(page, "archive-readback");
    rawEvidence.persistedArchiveReadback = sanitizeJson(
      persistedArchiveReadbackResult,
    );
    const persistedArchiveReopenSummary = assertPersistedArchiveReadbackPhase(
      persistedArchiveReadbackResult,
    );
    summary.persistedArchiveReopenSummary = sanitizeJson(
      persistedArchiveReopenSummary,
    );
    await closeElectronFixture(handle);
    app = null;
    page = null;

    logStage("launch-electron-persisted-unarchive");
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    const persistedUnarchiveResult = await runPersistedSessionArchivePhase(
      page,
      "unarchive",
    );
    rawEvidence.persistedUnarchive = sanitizeJson(persistedUnarchiveResult);
    const persistedUnarchiveSummary = assertPersistedUnarchivePhase(
      persistedUnarchiveResult,
    );
    summary.persistedUnarchiveSummary = sanitizeJson(persistedUnarchiveSummary);
    await closeElectronFixture(handle);
    app = null;
    page = null;

    logStage("launch-electron-persisted-unarchive-readback");
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
    });
    app = handle.app;
    page = handle.page;
    const persistedUnarchiveReadbackResult =
      await runPersistedSessionArchivePhase(page, "unarchive-readback");
    rawEvidence.persistedUnarchiveReadback = sanitizeJson(
      persistedUnarchiveReadbackResult,
    );
    const persistedUnarchiveReopenSummary =
      assertPersistedUnarchiveReadbackPhase(persistedUnarchiveReadbackResult);
    summary.persistedUnarchiveReopenSummary = sanitizeJson(
      persistedUnarchiveReopenSummary,
    );

    logStage("sidebar-gui-persisted-archive-unarchive");
    const sidebarGuiArchiveResult = await runSidebarGuiArchivePhase(
      page,
      options,
    );
    rawEvidence.sidebarGuiArchive = sanitizeJson(sidebarGuiArchiveResult);
    const sidebarGuiArchiveSummary = assertSidebarGuiArchive(
      sidebarGuiArchiveResult,
    );
    summary.sidebarGuiArchiveSummary = sanitizeJson(sidebarGuiArchiveSummary);
    summary.sidebarGuiArchive = true;

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await closeElectronFixture(handle);
    app = null;
    page = null;
    writeJsonFile(rawEvidencePath, rawEvidence);

    assert(
      consoleErrors.length === 0,
      `观察到 console error: ${consoleErrors.join(" | ")}`,
    );

    summary.screenshot = screenshotPath;
    summary.consoleErrors = consoleErrors;
    summary.sidecarRestartReadback = true;
    summary.ok = true;
    summary.completedAt = new Date().toISOString();
    writeJsonFile(summaryPath, summary);
    console.log(
      `[smoke:agent-session-history-electron-fixture] summary=${summaryPath}`,
    );
    console.log(
      `[smoke:agent-session-history-electron-fixture] methods=${fixtureSummary.requestMethods.join(",")}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.consoleErrors = consoleErrors;
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
        summary.failureScreenshot = failureScreenshotPath;
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
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `[smoke:agent-session-history-electron-fixture] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
