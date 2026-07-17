import path from "node:path";

export const MCP_LIFECYCLE_SCENARIO_ID = "mcp-lifecycle-recovery";
export const MCP_LIFECYCLE_REQUIRED_METHODS = [
  "mcpServer/list",
  "mcpServer/create",
  "mcpServer/update",
  "mcpServer/delete",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_MCP_COMMANDS = [
  "get_mcp_servers",
  "mcp_list_servers_with_status",
  "mcp_list_tools",
  "mcp_list_prompts",
  "mcp_list_resources",
  "mcp_call_tool",
  "mcp_start_server",
  "sync_all_mcp_to_live",
];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateName(value, label) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_NAME.test(normalized)) {
    throw new Error(`invalid Settings MCP Lifecycle ${label}`);
  }
  return normalized;
}

export function parseSettingsMcpLifecycleFixtureArgs(
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
      `standalone-settings-mcp-lifecycle-${new Date()
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
      "settings-mcp-lifecycle-recovery",
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

export function summarizeSettingsMcpLifecycleTrace(traceRaws) {
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
    missingMethods: MCP_LIFECYCLE_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyCommands: LEGACY_MCP_COMMANDS.filter((command) =>
      commands.has(command),
    ),
    mockFallbackHitCount: appServerEntries.filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function createSettingsMcpLifecycleEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-mcp-lifecycle-recovery",
    priority: "P0",
    proofLevel: "Gate B-F",
    claimBoundary:
      "Real Electron MCP Settings configuration lifecycle through preload/IPC and App Server mcpServer list/create/update/delete. It proves GUI creation, update, cold-restart readback, GUI deletion, and final cold-restart absence in isolated user data. It does not start a live MCP server, call tools, access the configured URL, or store server config, names, descriptions, IDs, paths, credentials, prompts, resources, or tool output.",
    candidateRunId: validateName(candidateRunId, "run-id"),
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-mcp-lifecycle-not-completed",
    nextAction: "Run the real Electron MCP Settings lifecycle fixture.",
    settingsScenarioProof: {
      scenarioId: MCP_LIFECYCLE_SCENARIO_ID,
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
      updatedScreenshot: `${prefix}-updated.png`,
      recoveredScreenshot: `${prefix}-recovered.png`,
      finalScreenshot: `${prefix}-final.png`,
      screenshot: `${prefix}-final.png`,
      rawEvidence: `${prefix}-raw.json`,
      summary: `${prefix}-summary.json`,
    },
  };
}

export function applyPassingSettingsMcpLifecycleEvidence(summary, facts) {
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
    guiUpdated: facts.guiUpdated === true,
    restartReadback: facts.restartReadback === true,
    guiDeleted: facts.guiDeleted === true,
    finalRestartAbsent: facts.finalRestartAbsent === true,
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
    ["allCurrentMcpLifecycleMethods", trace.missingMethods.length === 0],
    ["isolatedUserData", summary.lifecycle.isolatedUserData],
    ["guiCreated", summary.lifecycle.guiCreated],
    ["guiUpdated", summary.lifecycle.guiUpdated],
    ["restartReadback", summary.lifecycle.restartReadback],
    ["guiDeleted", summary.lifecycle.guiDeleted],
    ["finalRestartAbsent", summary.lifecycle.finalRestartAbsent],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", facts.invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["updatedScreenshotWritten", facts.updatedScreenshotWritten === true],
    ["recoveredScreenshotWritten", facts.recoveredScreenshotWritten === true],
    ["finalScreenshotWritten", facts.finalScreenshotWritten === true],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `SETTINGS MCP lifecycle evidence failed: ${failed.join(", ")}`,
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

export function applyFailedSettingsMcpLifecycleEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-mcp-lifecycle-fixture";
  summary.nextAction =
    "Fix the MCP Settings current lifecycle and rerun with the same candidate run-id using a new prefix.";
  summary.errorClass =
    error instanceof Error && error.name ? error.name : "Error";
  return summary;
}
