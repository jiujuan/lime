import path from "node:path";

export const STATS_SCENARIO_ID = "stats-current-read";
export const STATS_REQUIRED_METHODS = [
  "usageStats/read",
  "usageStats/modelRanking/list",
  "usageStats/dailyTrends/list",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_USAGE_COMMANDS = [
  "get_usage_stats",
  "get_model_usage_ranking",
  "get_daily_usage_trends",
];
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateRunId(value) {
  const runId = String(value ?? "").trim();
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("invalid Settings Stats project Gate run-id");
  }
  return runId;
}

function standaloneRunId() {
  return `standalone-settings-stats-${new Date()
    .toISOString()
    .replace(/[-:.]/g, "")}-${process.pid}`;
}

export function parseSettingsStatsFixtureArgs(
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
  if (options.help) {
    return options;
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms must be >= 30000");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms must be >= 100");
  }
  options.runId = validateRunId(options.runId || standaloneRunId());
  if (!PREFIX_PATTERN.test(String(options.prefix ?? ""))) {
    throw new Error("invalid Settings Stats evidence prefix");
  }
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(
      cwd,
      ".lime",
      "qc",
      "project-gates",
      options.runId,
      "settings-stats-current-read",
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

function parseMethod(entry) {
  const lines = entry?.args_preview?.request?.lines;
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.flatMap((line) => {
    try {
      const request = JSON.parse(String(line));
      return typeof request?.method === "string" ? [request.method] : [];
    } catch {
      return [];
    }
  });
}

export function summarizeSettingsStatsTrace(traceRaw) {
  const entries = parseTrace(traceRaw);
  const appServerEntries = entries.filter(
    (entry) => entry?.command === APP_SERVER_COMMAND,
  );
  const electronEntries = appServerEntries.filter(
    (entry) => entry.transport === "electron-ipc",
  );
  const methods = Array.from(new Set(electronEntries.flatMap(parseMethod)));
  const commands = new Set(entries.map((entry) => entry?.command));
  return {
    appServerIpcHitCount: electronEntries.length,
    methods,
    missingMethods: STATS_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyCommands: LEGACY_USAGE_COMMANDS.filter((command) =>
      commands.has(command),
    ),
    mockFallbackHitCount: appServerEntries.filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function createSettingsStatsEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-stats-current-read",
    priority: "P0",
    proofLevel: "Gate B-F",
    claimBoundary:
      "Real Electron Settings usage statistics current read path. It does not claim non-empty production usage history or live model accounting.",
    candidateRunId: validateRunId(candidateRunId),
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-stats-not-completed",
    nextAction:
      "Run the real Electron Stats Settings fixture to a terminal current read state.",
    settingsScenarioProof: {
      scenarioId: STATS_SCENARIO_ID,
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
      screenshot: `${prefix}.png`,
      rawEvidence: `${prefix}-raw.json`,
      summary: `${prefix}-summary.json`,
    },
  };
}

export function applyPassingSettingsStatsEvidence(
  summary,
  {
    completedAt,
    electronRenderer,
    preloadInvoke,
    statsActive,
    loadingVisible,
    errorVisible,
    trace,
    consoleErrors,
    pageErrors,
    invokeErrorCount,
    screenshotWritten,
  },
) {
  summary.bridge = {
    electron: electronRenderer === true,
    preloadInvoke: preloadInvoke === true,
    transport: trace.appServerIpcHitCount > 0 ? "electron-ipc" : null,
    command: APP_SERVER_COMMAND,
    appServerIpcHitCount: trace.appServerIpcHitCount,
    methods: trace.methods,
  };
  summary.errors = {
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    invokeErrorCount,
    legacyCommandHitCount: trace.legacyCommands.length,
    legacyCommands: trace.legacyCommands,
    mockFallbackHitCount: trace.mockFallbackHitCount,
  };
  const checks = [
    ["realElectronRenderer", summary.bridge.electron],
    ["preloadInvokeBridge", summary.bridge.preloadInvoke],
    ["appServerElectronIpc", summary.bridge.appServerIpcHitCount > 0],
    ["allCurrentMethods", trace.missingMethods.length === 0],
    ["statsTabActive", statsActive === true],
    ["loadingCleared", loadingVisible === false],
    ["readErrorHidden", errorVisible === false],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["screenshotWritten", screenshotWritten === true],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(`SETTINGS Stats evidence failed: ${failed.join(", ")}`);
  }
  summary.result = "pass";
  summary.completedAt = completedAt;
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

export function applyFailedSettingsStatsEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-stats-current-read-fixture";
  summary.nextAction =
    "Fix the Stats current App Server read path and rerun with the same candidate run-id.";
  summary.error = String(error instanceof Error ? error.message : error).slice(
    0,
    500,
  );
  return summary;
}
