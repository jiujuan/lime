import path from "node:path";

export const PROVIDER_CRUD_SCENARIO_ID = "provider-crud-model-auth";
export const PROVIDER_CRUD_REQUIRED_METHODS = [
  "modelProvider/list",
  "modelProvider/catalog/list",
  "modelProvider/create",
  "modelProvider/update",
  "modelProviderKey/create",
  "modelProvider/fetchModels",
  "modelProvider/testConnection",
  "modelProvider/testChat",
  "modelProvider/delete",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_PROVIDER_COMMANDS = [
  "get_api_key_providers",
  "get_system_provider_catalog",
  "add_custom_provider",
  "update_provider",
  "delete_custom_provider",
  "add_api_key",
  "fetch_provider_models_auto",
  "test_api_key_provider_connection",
];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateName(value, label) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_NAME.test(normalized)) {
    throw new Error(`invalid Settings Provider CRUD ${label}`);
  }
  return normalized;
}

export function parseSettingsProviderCrudFixtureArgs(
  argv,
  { defaults, cwd = process.cwd() } = {},
) {
  const options = { ...defaults, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
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
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms must be >= 30000");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms must be >= 100");
  }
  options.runId = validateName(
    options.runId ||
      `standalone-settings-provider-crud-${new Date()
        .toISOString()
        .replace(/[-:.]/g, "")}-${process.pid}`,
    "run-id",
  );
  options.prefix = validateName(options.prefix, "prefix");
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(
      cwd,
      ".lime",
      "qc",
      "project-gates",
      options.runId,
      "settings-provider-crud-model-auth",
    );
  }
  return options;
}

function parseTrace(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appServerMethods(entries) {
  return Array.from(
    new Set(
      entries.flatMap((entry) => {
        const lines = entry?.args_preview?.request?.lines;
        if (!Array.isArray(lines)) return [];
        return lines.flatMap((line) => {
          try {
            const request = JSON.parse(String(line));
            return typeof request?.method === "string" ? [request.method] : [];
          } catch {
            return [];
          }
        });
      }),
    ),
  );
}

export function summarizeSettingsProviderCrudTrace(traceRaws) {
  const entries = (Array.isArray(traceRaws) ? traceRaws : [traceRaws]).flatMap(
    parseTrace,
  );
  const appServerEntries = entries.filter(
    (entry) => entry?.command === APP_SERVER_COMMAND,
  );
  const appServerIpcEntries = appServerEntries.filter(
    (entry) => entry.transport === "electron-ipc",
  );
  const methods = appServerMethods(appServerIpcEntries);
  const commands = new Set(entries.map((entry) => entry?.command));
  return {
    appServerIpcHitCount: appServerIpcEntries.length,
    methods,
    missingMethods: PROVIDER_CRUD_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyCommands: LEGACY_PROVIDER_COMMANDS.filter((command) =>
      commands.has(command),
    ),
    mockFallbackHitCount: appServerEntries.filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function createSettingsProviderCrudEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-provider-crud-model-auth",
    priority: "P0",
    proofLevel: "Gate B-R",
    claimBoundary:
      "Real Electron Provider Settings CRUD, model discovery/selection, localhost authentication failure recovery, cold-restart readback, GUI deletion, and final cold-restart absence through preload/IPC and App Server current methods. It does not call a live provider, prove production credentials, make a real model turn, or store provider values, model IDs, API hosts, ports, keys, paths, request headers, or response bodies.",
    candidateRunId: validateName(candidateRunId, "run-id"),
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-provider-crud-not-completed",
    nextAction: "Run the real Electron Provider Settings CRUD fixture.",
    settingsScenarioProof: {
      scenarioId: PROVIDER_CRUD_SCENARIO_ID,
      complete: false,
    },
    assertions: {
      total: 1,
      passed: 0,
      failed: ["notCompleted"],
      details: {},
    },
    bridge: {
      electron: false,
      preloadInvoke: false,
      transport: null,
      command: APP_SERVER_COMMAND,
      appServerIpcHitCount: 0,
      methods: [],
    },
    errors: {
      consoleErrorCount: 0,
      pageErrorCount: 0,
      invokeErrorCount: 0,
      legacyCommandHitCount: 0,
      legacyCommands: [],
      mockFallbackHitCount: 0,
    },
    artifacts: {
      authFailureScreenshot: `${prefix}-auth-failure.png`,
      configuredScreenshot: `${prefix}-configured.png`,
      recoveredScreenshot: `${prefix}-recovered.png`,
      finalScreenshot: `${prefix}-final.png`,
      screenshot: `${prefix}-final.png`,
      rawEvidence: `${prefix}-raw.json`,
      summary: `${prefix}-summary.json`,
    },
  };
}

export function applyPassingSettingsProviderCrudEvidence(summary, facts) {
  const { trace, consoleErrors, pageErrors } = facts;
  summary.bridge = {
    electron: facts.electronLaunchCount === 3,
    preloadInvoke: facts.preloadLaunchCount === 3,
    transport: trace.appServerIpcHitCount > 0 ? "electron-ipc" : null,
    command: APP_SERVER_COMMAND,
    appServerIpcHitCount: trace.appServerIpcHitCount,
    methods: trace.methods,
  };
  summary.lifecycle = {
    isolatedUserData: facts.isolatedUserData === true,
    guiCreated: facts.guiCreated === true,
    authFailureVisible: facts.authFailureVisible === true,
    authRecovered: facts.authRecovered === true,
    modelSelected: facts.modelSelected === true,
    connectionReady: facts.connectionReady === true,
    restartReadback: facts.restartReadback === true,
    guiDeleted: facts.guiDeleted === true,
    finalRestartAbsent: facts.finalRestartAbsent === true,
  };
  summary.localFixture = {
    unauthorizedRequestCount: facts.unauthorizedRequestCount,
    authorizedRequestCount: facts.authorizedRequestCount,
    responseBodyStored: false,
    authorizationValueStored: false,
  };
  summary.errors = {
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    invokeErrorCount: facts.invokeErrorCount,
    legacyCommandHitCount: trace.legacyCommands.length,
    legacyCommands: trace.legacyCommands,
    mockFallbackHitCount: trace.mockFallbackHitCount,
  };
  const checks = [
    ["threeRealElectronLaunches", summary.bridge.electron],
    ["threePreloadInvokeBridges", summary.bridge.preloadInvoke],
    ["appServerElectronIpc", summary.bridge.appServerIpcHitCount > 0],
    ["allCurrentProviderMethods", trace.missingMethods.length === 0],
    ["isolatedUserData", summary.lifecycle.isolatedUserData],
    ["guiCreated", summary.lifecycle.guiCreated],
    ["authFailureVisible", summary.lifecycle.authFailureVisible],
    ["unauthorizedRequestObserved", facts.unauthorizedRequestCount > 0],
    ["authRecovered", summary.lifecycle.authRecovered],
    ["authorizedRequestObserved", facts.authorizedRequestCount > 0],
    ["modelSelected", summary.lifecycle.modelSelected],
    ["connectionReady", summary.lifecycle.connectionReady],
    ["restartReadback", summary.lifecycle.restartReadback],
    ["guiDeleted", summary.lifecycle.guiDeleted],
    ["finalRestartAbsent", summary.lifecycle.finalRestartAbsent],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", facts.invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["authFailureScreenshotWritten", facts.authFailureScreenshotWritten],
    ["configuredScreenshotWritten", facts.configuredScreenshotWritten],
    ["recoveredScreenshotWritten", facts.recoveredScreenshotWritten],
    ["finalScreenshotWritten", facts.finalScreenshotWritten],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `SETTINGS Provider CRUD evidence failed: ${failed.join(", ")}`,
    );
  }
  summary.result = "pass";
  summary.completedAt = facts.completedAt;
  summary.settingsScenarioProof.complete = true;
  summary.assertions = {
    total: checks.length,
    passed: checks.length,
    failed: [],
    details: Object.fromEntries(checks),
  };
  delete summary.failureClass;
  delete summary.nextAction;
  return summary;
}

export function applyFailedSettingsProviderCrudEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-provider-crud-fixture";
  summary.nextAction =
    "Fix the Provider Settings current lifecycle and rerun with the same candidate run-id using a new prefix.";
  summary.errorClass =
    error instanceof Error && error.name ? error.name : "Error";
  return summary;
}
