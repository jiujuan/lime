import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const APP_SERVER_HANDLE_JSON_LINES_COMMAND =
  "app_server_handle_json_lines";
export const CUSTOM_PROVIDER_NAME = "Migration Fixture Provider";
export const CUSTOM_PROVIDER_TYPE = "openai";
export const CUSTOM_PROVIDER_HOST = "https://migration-fixture.invalid/v1";
export const CUSTOM_MODEL_ID = "migration-fixture-model";
export const PRODUCT_DB_MIGRATION_CLEANUP_POLICY = "drop-tables";
export const UI_SELECTED_PROVIDER_KEY = "selected_provider";
const UI_COLLAPSED_GROUPS_KEY = "collapsed_groups";

export const LEGACY_PROVIDER_COMMANDS = [
  "get_api_key_providers",
  "get_system_provider_catalog",
  "get_api_key_provider",
  "read_api_key_provider_config",
  "add_custom_api_key_provider",
  "create_api_key_provider",
  "update_api_key_provider",
  "delete_custom_api_key_provider",
  "delete_api_key_provider",
  "update_provider_sort_orders",
  "update_api_key_provider_sort_orders",
  "export_api_key_providers",
  "export_api_key_provider_config",
  "import_api_key_providers",
  "import_api_key_provider_config",
  "test_api_key_provider_connection",
  ["test_api_key_provider", "chat"].join("_"),
  "fetch_provider_models_auto",
  "add_api_key",
  "create_api_key_provider_key",
  "delete_api_key",
  "delete_api_key_provider_key",
  "toggle_api_key",
  "update_api_key_alias",
  "update_api_key_provider_key",
  "get_next_api_key",
  "next_api_key_provider_key",
  "record_api_key_usage",
  "record_api_key_provider_key_usage",
  "record_api_key_error",
  "record_api_key_provider_key_error",
  "get_provider_ui_state",
  "read_api_key_provider_ui_state",
  "set_provider_ui_state",
  "write_api_key_provider_ui_state",
];

export const SEED_REQUIRED_METHODS = [
  "initialize",
  "modelProvider/create",
  "modelProvider/update",
  "modelProviderKey/create",
  "modelProviderUiState/write",
  "modelProvider/list",
  "modelProviderUiState/read",
];

export const ELECTRON_REQUIRED_METHODS = [
  "modelProvider/list",
  "modelProviderUiState/read",
];

const PROJECT_GATE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function createStandaloneProjectGateRunId({
  now = new Date(),
  random = Math.random,
} = {}) {
  const timestamp = now
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "")
    .replace("Z", "Z");
  const suffix = Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `standalone-shell-02-${timestamp}-${suffix}`;
}

export function validateProjectGateRunId(value) {
  const runId = String(value ?? "").trim();
  if (!PROJECT_GATE_RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      "--run-id / LIME_GATE_RUN_ID 只能包含字母、数字、点、下划线和连字符，且长度不超过 128",
    );
  }
  return runId;
}

export function parseMigrationFixtureArgs(
  argv,
  {
    defaults,
    printHelp = () => {},
    cwd = process.cwd(),
    exit = (code) => process.exit(code),
  } = {},
) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      exit(0);
      return options;
    }
    if (arg === "--app-url" && next) {
      options.appUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--run-id" && next) {
      options.runId = next.trim();
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
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  options.runId = validateProjectGateRunId(
    options.runId || createStandaloneProjectGateRunId(),
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.prefix)) {
    throw new Error(
      "--prefix 只能包含字母、数字、点、下划线和连字符，且长度不超过 128",
    );
  }
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(
      cwd,
      ".lime",
      "qc",
      "project-gates",
      options.runId,
      "shell-02-provider-migration",
    );
  }
  return options;
}

export function createMigrationSurfaceEvidence(runId) {
  return {
    schemaVersion: 1,
    candidateRunId: validateProjectGateRunId(runId),
    surfaceProof: {
      surfaceId: "SHELL-02",
      proof: "gate-b-f",
      complete: false,
    },
    result: "fail",
    assertions: {
      total: 1,
      passed: 0,
      failed: ["notCompleted"],
    },
    claimScope: "provider-migration-only",
    missingScenarios: ["restart", "permission-failure"],
  };
}

export function markMigrationSurfaceEvidencePass(summary, assertionNames) {
  if (!Array.isArray(assertionNames) || assertionNames.length === 0) {
    throw new Error("SHELL-02 migration evidence assertions 不能为空");
  }
  summary.result = "pass";
  summary.assertions = {
    total: assertionNames.length,
    passed: assertionNames.length,
    failed: [],
  };
  delete summary.failureClass;
  delete summary.nextAction;
  delete summary.error;
  return summary;
}

export function markMigrationSurfaceEvidenceFail(summary, error) {
  summary.result = "fail";
  summary.surfaceProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
  };
  summary.failureClass = "shell-02-provider-migration-fixture";
  summary.nextAction =
    "修复 migration fixture 暴露的 Desktop Host/App Server/GUI 边界后，用新 candidate 重跑；不得把部分证据标为完整 SHELL-02";
  summary.error = sanitizeText(
    error instanceof Error ? error.message : String(error),
  );
  return summary;
}

export function buildMigrationProviderCreateParams() {
  return {
    name: CUSTOM_PROVIDER_NAME,
    providerType: CUSTOM_PROVIDER_TYPE,
    apiHost: CUSTOM_PROVIDER_HOST,
  };
}

export function buildMigrationProviderUpdateParams(providerId) {
  return {
    providerId,
    customModels: [CUSTOM_MODEL_ID],
    sortOrder: 1,
  };
}

export function projectMigrationProviderInfo(provider) {
  return {
    id: provider?.id ?? null,
    name: provider?.name ?? null,
    providerType: provider?.providerType ?? null,
    apiHost: provider?.apiHost ?? null,
    apiKeyCount: Number(provider?.apiKeyCount ?? 0),
    customModels: Array.isArray(provider?.customModels)
      ? provider.customModels
      : [],
  };
}

export function parseInvokeTraceRaw(raw) {
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

export function filterInvokeTraceEntriesSince(raw, launchedAt) {
  const launchedAtMs = Date.parse(launchedAt);
  assert(
    Number.isFinite(launchedAtMs),
    `invalid Electron launch timestamp: ${launchedAt}`,
  );
  return parseInvokeTraceRaw(raw).filter((entry) => {
    const entryTimestampMs = Date.parse(String(entry?.timestamp ?? ""));
    return (
      !Number.isFinite(entryTimestampMs) || entryTimestampMs >= launchedAtMs
    );
  });
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

export function summarizeMigrationElectronEvidence({
  listResult,
  uiStateResult,
  traceRaw,
}) {
  const requests = parseJsonRpcRequestsFromInvokeTrace(traceRaw);
  const methods = Array.from(
    new Set(
      [
        listResult?.method,
        uiStateResult?.method,
        ...requests.map((request) => request.method),
      ].filter(Boolean),
    ),
  );
  const electronIpcRequestMethods = Array.from(
    new Set(
      requests
        .filter(
          (request) =>
            request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND &&
            request.transport === "electron-ipc",
        )
        .map((request) => request.method),
    ),
  );
  return {
    appServerHandleJsonLinesSeen: requests.some(
      (request) => request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    ),
    electronIpcSeen: requests.some(
      (request) =>
        request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND &&
        request.transport === "electron-ipc",
    ),
    requestMethods: methods,
    electronIpcRequestMethods,
    missingRequiredMethods: ELECTRON_REQUIRED_METHODS.filter(
      (method) => !electronIpcRequestMethods.includes(method),
    ),
    legacyProviderCommandsSeen: LEGACY_PROVIDER_COMMANDS.filter((method) =>
      methods.includes(method),
    ),
    migratedProvider: (listResult?.result?.providers ?? []).find(
      (provider) => provider?.name === CUSTOM_PROVIDER_NAME,
    ),
    selectedProviderValue: uiStateResult?.result?.value ?? null,
    requests:
      requests.length > 0
        ? requests
        : [
            {
              command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
              method: listResult?.method,
            },
            {
              command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
              method: uiStateResult?.method,
            },
          ],
  };
}

export function assertMigrationElectronEvidence(
  summary,
  providerId,
  phase = "迁移后",
) {
  const providerFacts = projectMigrationProviderInfo(summary.migratedProvider);
  assert(
    summary.appServerHandleJsonLinesSeen,
    `${phase}未观察到 app_server_handle_json_lines`,
  );
  assert(summary.electronIpcSeen, `${phase}未观察到 electron-ipc transport`);
  assert(
    summary.missingRequiredMethods.length === 0,
    `${phase}缺少 App Server current method: ${summary.missingRequiredMethods.join(", ")}`,
  );
  assert(
    summary.legacyProviderCommandsSeen.length === 0,
    `${phase}观察到 legacy Provider 命令: ${summary.legacyProviderCommandsSeen.join(", ")}`,
  );
  assert(
    summary.migratedProvider,
    `${phase} modelProvider/list 未返回目标 Provider`,
  );
  assert(
    providerFacts.id === providerId,
    `${phase} Provider id 不正确: ${providerFacts.id}`,
  );
  assert(providerFacts.apiKeyCount >= 1, `${phase} Provider API Key 丢失`);
  assert(
    providerFacts.customModels.includes(CUSTOM_MODEL_ID),
    `${phase} Provider customModels 丢失`,
  );
  assert(
    summary.selectedProviderValue === providerId,
    `${phase} modelProviderUiState/read 未读回 selected_provider`,
  );
}

export function summarizePermissionFailureElectronEvidence({
  traceRaw,
  errorRaw,
  consoleErrors = [],
}) {
  const traceEntries = parseInvokeTraceRaw(traceRaw);
  const errorEntries = parseInvokeTraceRaw(errorRaw);
  const requests = parseJsonRpcRequestsFromInvokeTrace(traceRaw);
  const failedRequests = requests.filter(
    (request) =>
      request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND &&
      request.transport === "electron-ipc" &&
      request.status === "error",
  );
  const diagnostics = JSON.stringify([
    ...traceEntries,
    ...errorEntries,
    ...consoleErrors,
  ]);
  return {
    appServerHandleJsonLinesSeen: requests.some(
      (request) => request.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    ),
    electronIpcSeen: requests.some(
      (request) => request.transport === "electron-ipc",
    ),
    failedRequestMethods: Array.from(
      new Set(failedRequests.map((request) => request.method)),
    ),
    invokeErrorCount: errorEntries.length,
    failureCauseSeen:
      /数据库迁移失败|拒绝回退旧路径|permission denied|operation not permitted|read-only file system|sidecar[^\n]*(?:exit|failed)|app-server[^\n]*(?:exit|failed)/i.test(
        diagnostics,
      ),
    requests,
  };
}

export function assertPermissionFailureElectronEvidence(summary) {
  assert(
    summary.appServerHandleJsonLinesSeen,
    "无权限场景未观察到 app_server_handle_json_lines",
  );
  assert(summary.electronIpcSeen, "无权限场景未观察到 electron-ipc transport");
  assert(
    summary.failedRequestMethods.includes("modelProvider/list"),
    "无权限场景未观察到 modelProvider/list 的 fail-closed IPC",
  );
  assert(summary.invokeErrorCount > 0, "无权限场景未记录 invoke error");
  assert(summary.failureCauseSeen, "无权限场景未观察到迁移/权限失败原因");
}

export function applyPassingMigrationSurfaceEvidence(
  summary,
  { migrationScreenshotPath, restartScreenshotPath, permissionScreenshotPath },
) {
  const checks = [
    ["realElectronRenderer", summary.electronRenderer === true],
    ["preloadInvokeBridge", summary.electronPreloadBridge === true],
    ["electronIpcTransport", summary.electronIpcSeen === true],
    ["appServerHandleJsonLines", summary.appServerHandleJsonLinesSeen === true],
    [
      "currentMethods",
      summary.electronRequiredMethods.every((method) =>
        summary.electronRequestMethods.includes(method),
      ),
    ],
    ["legacyCommandsZero", summary.legacyProviderCommandsSeen.length === 0],
    ["providerVisible", summary.providerVisibleInGui === true],
    ["migrationMarker", summary.migrationMarkerExists === true],
    ["migratedDatabase", summary.migratedProductDbExists === true],
    ["legacySchemaRemoved", summary.oldProductDbUserSchemaObjectCount === 0],
    ["consoleErrorsZero", summary.consoleErrors.length === 0],
    ["pageErrorsZero", summary.pageErrors.length === 0],
    ["invokeErrorsZero", summary.invokeErrors.length === 0],
    ["rendererCrashesZero", summary.rendererCrashCount === 0],
    ["migrationScreenshotWritten", fs.existsSync(migrationScreenshotPath)],
    ["restartVerified", summary.restartVerified === true],
    ["restartRealElectronRenderer", summary.restartElectronRenderer === true],
    [
      "restartPreloadInvokeBridge",
      summary.restartElectronPreloadBridge === true,
    ],
    ["restartElectronIpcTransport", summary.restartElectronIpcSeen === true],
    [
      "restartAppServerHandleJsonLines",
      summary.restartAppServerHandleJsonLinesSeen === true,
    ],
    [
      "restartCurrentMethods",
      summary.electronRequiredMethods.every((method) =>
        summary.restartElectronRequestMethods.includes(method),
      ),
    ],
    [
      "restartLegacyCommandsZero",
      summary.restartLegacyProviderCommandsSeen.length === 0,
    ],
    ["restartProviderVisible", summary.restartProviderVisibleInGui === true],
    [
      "restartProviderPersisted",
      summary.restartMigratedProviderSummary?.id === summary.providerId &&
        summary.restartMigratedProviderSummary.apiKeyCount >= 1 &&
        summary.restartMigratedProviderSummary.customModels.includes(
          CUSTOM_MODEL_ID,
        ) &&
        summary.restartUiStateSelectedProvider === summary.providerId,
    ],
    ["restartScreenshotWritten", fs.existsSync(restartScreenshotPath)],
    ["permissionFailureVerified", summary.permissionFailureVerified === true],
    [
      "permissionRealElectronRenderer",
      summary.permissionElectronRenderer === true,
    ],
    [
      "permissionPreloadInvokeBridge",
      summary.permissionElectronPreloadBridge === true,
    ],
    [
      "permissionElectronIpcTransport",
      summary.permissionElectronIpcSeen === true,
    ],
    [
      "permissionAppServerHandleJsonLines",
      summary.permissionAppServerHandleJsonLinesSeen === true,
    ],
    [
      "permissionCurrentMethodFailed",
      summary.permissionFailedRequestMethods.includes("modelProvider/list"),
    ],
    ["permissionInvokeError", summary.permissionInvokeErrorCount > 0],
    ["permissionFailureCause", summary.permissionFailureCauseSeen === true],
    ["permissionUserVisible", summary.permissionUserVisible === true],
    ["permissionSourceUnchanged", summary.permissionSourceUnchanged === true],
    [
      "permissionSourceSchemaPreserved",
      summary.permissionSourceSchemaObjectCount > 0,
    ],
    [
      "permissionMarkerAbsent",
      summary.permissionMigrationMarkerExists === false,
    ],
    [
      "permissionTargetDatabaseAbsent",
      summary.permissionMigratedProductDbExists === false,
    ],
    ["permissionConsoleErrorObserved", summary.permissionConsoleErrorCount > 0],
    ["permissionPageErrorsZero", summary.permissionPageErrorCount === 0],
    [
      "permissionRendererCrashesZero",
      summary.permissionRendererCrashCount === 0,
    ],
    ["permissionScreenshotWritten", fs.existsSync(permissionScreenshotPath)],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  assert(
    failed.length === 0,
    `SHELL-02 migration evidence 断言失败: ${failed.join(", ")}`,
  );
  summary.surfaceProof.complete = true;
  summary.claimScope = "shell-02-config-path-migration-isolation";
  summary.missingScenarios = [];
  markMigrationSurfaceEvidencePass(
    summary,
    checks.map(([name]) => name),
  );
}

export function applyFailedMigrationSurfaceEvidence(summary, error) {
  markMigrationSurfaceEvidenceFail(summary, error);
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function sanitizeText(value) {
  const sanitized = String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
  return sanitized.length > 2_000
    ? `${sanitized.slice(0, 2_000)}... [truncated ${
        sanitized.length - 2_000
      } chars]`
    : sanitized;
}

export function sanitizeJson(value, depth = 0) {
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

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function readProductDbUserSchemaObjectCount(
  runtimeEnv,
  { sqliteBinary = process.env.SQLITE3_BIN?.trim() || "sqlite3" } = {},
) {
  if (!fs.existsSync(runtimeEnv.oldProductDbPath)) {
    return null;
  }
  const result = spawnSync(
    sqliteBinary,
    [
      runtimeEnv.oldProductDbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view','trigger','index') AND name NOT LIKE 'sqlite_%';",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: runtimeEnv.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 Product DB schema check failed: ${sanitizeText(result.stderr)}`,
    );
  }
  const parsed = Number(String(result.stdout || "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `sqlite3 Product DB schema check returned invalid count: ${result.stdout}`,
    );
  }
  return parsed;
}

export function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "settings-provider-migration-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const oldProductDataDir = electronUserDataDir;
  const appServerDataDir = path.join(electronUserDataDir, "app-server");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    oldProductDataDir,
    appServerDataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    home,
    electronUserDataDir,
    oldProductDataDir,
    appServerDataDir,
    oldProductDbPath: path.join(oldProductDataDir, "lime.db"),
    migratedProductDbPath: path.join(appServerDataDir, "lime.db"),
    migrationMarkerPath: path.join(appServerDataDir, ".migration_completed"),
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
}

export function parseJsonRpcLine(line) {
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

function startJsonRpcProcess({ appServerBinary, runtimeEnv, dataDir }) {
  const child = spawn(
    appServerBinary,
    ["--stdio", "--backend", "unavailable", "--data-dir", dataDir],
    {
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        APP_SERVER_BACKEND_MODE: "unavailable",
        APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP: "retain",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stderr = [];
  const messages = [];
  const pending = new Map();
  let nextId = 1;

  child.stderr.on("data", (chunk) => {
    stderr.push(sanitizeText(chunk.toString("utf8")));
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const message = parseJsonRpcLine(line);
    if (!message) {
      messages.push({ raw: sanitizeText(line), parseError: true });
      return;
    }
    messages.push(message);
    const id = message.id;
    if (id === undefined || id === null) {
      return;
    }
    const key = String(id);
    const waiter = pending.get(key);
    if (!waiter) {
      return;
    }
    pending.delete(key);
    clearTimeout(waiter.timeout);
    if (message.error) {
      waiter.reject(
        new Error(
          `${waiter.method} returned JSON-RPC error: ${message.error.message}`,
        ),
      );
    } else {
      waiter.resolve(message);
    }
  });

  child.on("exit", (code, signal) => {
    const error = new Error(
      `app-server exited before pending requests settled: code=${code} signal=${signal}`,
    );
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    pending.clear();
  });

  function request(method, params = {}, timeoutMs = 15_000) {
    const id = `settings-provider-migration-${nextId++}`;
    const payload = { jsonrpc: "2.0", id, method, params };
    messages.push({ direction: "request", ...payload });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(String(id));
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(String(id), { method, timeout, resolve, reject });
      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (error) {
          clearTimeout(timeout);
          pending.delete(String(id));
          reject(error);
        }
      });
    });
  }

  function notify(method, params = {}) {
    const payload = { jsonrpc: "2.0", method, params };
    messages.push({ direction: "notification", ...payload });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async function close() {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("closing app-server stdio process"));
    }
    pending.clear();
    child.stdin.end();
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return { child, request, notify, close, stderr, messages };
}

export async function seedOldProductDatabase({
  appServerBinary,
  runtimeEnv,
  options,
}) {
  const rpc = startJsonRpcProcess({
    appServerBinary,
    runtimeEnv,
    dataDir: runtimeEnv.oldProductDataDir,
  });

  try {
    const initialize = await rpc.request(
      "initialize",
      {
        clientInfo: {
          name: "settings-provider-migration-fixture-seed",
          version: "1.0.0",
        },
        capabilities: {},
      },
      Math.min(options.timeoutMs, 20_000),
    );
    rpc.notify("initialized");

    const created = await rpc.request(
      "modelProvider/create",
      buildMigrationProviderCreateParams(),
    );
    const providerId = created.result?.provider?.id;
    assert(
      typeof providerId === "string" && providerId.startsWith("custom-"),
      "modelProvider/create 未返回自定义 Provider id",
    );

    const updated = await rpc.request(
      "modelProvider/update",
      buildMigrationProviderUpdateParams(providerId),
    );
    await rpc.request("modelProviderKey/create", {
      providerId,
      apiKey: "sk-settings-provider-migration-fixture",
      alias: "migration-fixture-key",
      replaceExisting: true,
    });
    await rpc.request("modelProviderUiState/write", {
      key: UI_SELECTED_PROVIDER_KEY,
      value: providerId,
    });
    await rpc.request("modelProviderUiState/write", {
      key: UI_COLLAPSED_GROUPS_KEY,
      value: JSON.stringify([]),
    });
    const listed = await rpc.request("modelProvider/list", {});
    const selectedState = await rpc.request("modelProviderUiState/read", {
      key: UI_SELECTED_PROVIDER_KEY,
    });
    const listedProvider = (listed.result?.providers ?? []).find(
      (item) => item?.id === providerId,
    );
    const listedProviderFacts = projectMigrationProviderInfo(listedProvider);

    assert(listedProvider, "旧 Product DB seed 后未读回自定义 Provider");
    assert(
      listedProviderFacts.name === CUSTOM_PROVIDER_NAME,
      `旧 Product DB Provider 名称不正确: ${listedProviderFacts.name}`,
    );
    assert(
      listedProviderFacts.apiKeyCount >= 1,
      "旧 Product DB Provider 未保存 API Key",
    );
    assert(
      listedProviderFacts.customModels.includes(CUSTOM_MODEL_ID),
      "旧 Product DB Provider 未保存 customModels",
    );
    assert(
      selectedState.result?.value === providerId,
      "旧 Product DB UI selected_provider 未保存",
    );

    return {
      initialize: initialize.result,
      providerId,
      providerName: CUSTOM_PROVIDER_NAME,
      providerType: CUSTOM_PROVIDER_TYPE,
      customModelId: CUSTOM_MODEL_ID,
      oldProductDbPath: runtimeEnv.oldProductDbPath,
      oldProductDataDir: runtimeEnv.oldProductDataDir,
      created: created.result,
      updated: updated.result,
      selectedState: selectedState.result,
      listedProvider,
      messages: rpc.messages,
      stderr: rpc.stderr,
    };
  } finally {
    await rpc.close();
  }
}
