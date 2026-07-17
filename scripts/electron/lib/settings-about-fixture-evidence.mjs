import path from "node:path";

export const ABOUT_VERSION_SCENARIO_ID = "about-version-truth";
export const ABOUT_REQUIRED_HOST_COMMANDS = [
  "check_for_updates",
  "get_update_install_session",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_VERSION_COMMANDS = [
  "get_app_version",
  "get_version",
  "get_lime_version",
];
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function standaloneRunId({ now = new Date(), random = Math.random } = {}) {
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  const suffix = Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `standalone-settings-about-${timestamp}-${suffix}`;
}

function validateRunId(value) {
  const runId = String(value ?? "").trim();
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("invalid Settings About project Gate run-id");
  }
  return runId;
}

export function parseSettingsAboutFixtureArgs(
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
    throw new Error("invalid Settings About evidence prefix");
  }
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(
      cwd,
      ".lime",
      "qc",
      "project-gates",
      options.runId,
      "settings-about-version",
    );
  }
  return options;
}

function parseTrace(raw) {
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

function parseJsonRpcMethods(entries) {
  const methods = [];
  for (const entry of entries) {
    if (entry?.command !== APP_SERVER_COMMAND) {
      continue;
    }
    const lines = entry?.args_preview?.request?.lines;
    if (!Array.isArray(lines)) {
      continue;
    }
    for (const line of lines) {
      try {
        const request = JSON.parse(String(line));
        if (typeof request?.method === "string") {
          methods.push(request.method);
        }
      } catch {
        // Invalid previews cannot become positive evidence.
      }
    }
  }
  return Array.from(new Set(methods));
}

export function summarizeSettingsAboutTrace(traceRaw) {
  const entries = parseTrace(traceRaw);
  const appServerEntries = entries.filter(
    (entry) => entry?.command === APP_SERVER_COMMAND,
  );
  const hostEntries = entries.filter((entry) =>
    ABOUT_REQUIRED_HOST_COMMANDS.includes(entry?.command),
  );
  const commands = Array.from(
    new Set(entries.map((entry) => entry?.command).filter(Boolean)),
  );
  return {
    appServerIpcHitCount: appServerEntries.filter(
      (entry) => entry.transport === "electron-ipc",
    ).length,
    appServerMethods: parseJsonRpcMethods(appServerEntries),
    hostCommands: Array.from(
      new Set(hostEntries.map((entry) => entry.command)),
    ),
    hostIpcHitCount: hostEntries.filter(
      (entry) => entry.transport === "electron-ipc",
    ).length,
    missingHostCommands: ABOUT_REQUIRED_HOST_COMMANDS.filter(
      (command) => !commands.includes(command),
    ),
    legacyCommands: LEGACY_VERSION_COMMANDS.filter((command) =>
      commands.includes(command),
    ),
    mockFallbackHitCount: [...appServerEntries, ...hostEntries].filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function isLocalizedAboutVersionLine(locale, versionLine) {
  const line = String(versionLine ?? "").trim();
  const normalizedLocale = String(locale ?? "").toLowerCase();
  if (normalizedLocale.startsWith("zh")) {
    return line.startsWith("版本 ");
  }
  if (normalizedLocale.startsWith("ja")) {
    return line.startsWith("バージョン ");
  }
  if (normalizedLocale.startsWith("ko")) {
    return line.startsWith("버전 ");
  }
  return line.startsWith("Version ");
}

export function createSettingsAboutEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  const runId = validateRunId(candidateRunId);
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-about-version-truth",
    priority: "P0",
    proofLevel: "Gate B-F",
    claimBoundary:
      "Real Electron About page version truth and current update Host reads. It does not claim live update availability, download/install, packaged updater, or platform release behavior.",
    candidateRunId: runId,
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-about-version-not-completed",
    nextAction:
      "Run the real Electron About Settings fixture to a terminal version state.",
    settingsScenarioProof: {
      scenarioId: ABOUT_VERSION_SCENARIO_ID,
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

export function applyPassingSettingsAboutEvidence(
  summary,
  {
    completedAt,
    electronRenderer,
    preloadInvoke,
    packageVersion,
    visibleVersion,
    versionLabelLocalized,
    aboutActive,
    loadingVisible,
    internalDiagnosticVisible,
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
    methods: trace.appServerMethods,
  };
  summary.host = {
    transport: trace.hostIpcHitCount > 0 ? "electron-ipc" : null,
    commands: trace.hostCommands,
    expectedVersion: packageVersion,
    visibleVersion,
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
    ["appServerCurrentMethod", summary.bridge.methods.length > 0],
    ["hostElectronIpc", trace.hostIpcHitCount > 0],
    ["hostCurrentCommands", trace.missingHostCommands.length === 0],
    ["versionTruth", visibleVersion === packageVersion],
    ["versionLabelLocalized", versionLabelLocalized === true],
    ["aboutTabActive", aboutActive === true],
    ["loadingCleared", loadingVisible === false],
    ["internalDiagnosticsHidden", internalDiagnosticVisible === false],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["screenshotWritten", screenshotWritten === true],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(`SETTINGS About evidence failed: ${failed.join(", ")}`);
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

export function applyFailedSettingsAboutEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-about-version-fixture";
  summary.nextAction =
    "Fix the About version or real Desktop Host boundary and rerun with the same candidate run-id.";
  summary.error = String(error instanceof Error ? error.message : error).slice(
    0,
    500,
  );
  return summary;
}
