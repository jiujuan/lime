import path from "node:path";

export const AUTOMATION_SCENARIO_ID = "automation-lifecycle";
export const AUTOMATION_REQUIRED_READ_METHODS = [
  "automationScheduler/config/read",
  "automationScheduler/status",
  "automationJob/list",
  "automationJob/health",
];
export const AUTOMATION_REQUIRED_METHODS = [
  ...AUTOMATION_REQUIRED_READ_METHODS,
  "automationScheduler/config/update",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_AUTOMATION_COMMANDS = [
  "get_automation_scheduler_config",
  "update_automation_scheduler_config",
  "get_automation_status",
  "get_automation_jobs",
  "get_automation_health",
];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateName(value, label) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_NAME.test(normalized)) {
    throw new Error(`invalid Settings Automation ${label}`);
  }
  return normalized;
}

export function parseSettingsAutomationFixtureArgs(
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
      `standalone-settings-automation-${new Date()
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
      "settings-automation-lifecycle",
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

export function summarizeSettingsAutomationTrace(traceRaws) {
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
    missingMethods: AUTOMATION_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyCommands: LEGACY_AUTOMATION_COMMANDS.filter((command) =>
      commands.has(command),
    ),
    mockFallbackHitCount: appServerEntries.filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function createSettingsAutomationEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-automation-lifecycle",
    priority: "P0",
    proofLevel: "Gate B-F",
    claimBoundary:
      "Real Electron Automation Settings scheduler lifecycle. The fixture reads scheduler config/status plus job/health summaries, changes all scheduler controls through the GUI, verifies cold-restart readback, restores the original config through the GUI, and verifies final cold-restart readback in isolated user data. It does not claim Automation Workspace job CRUD or runNow coverage and stores no config values, job data, prompts, paths, or run output.",
    candidateRunId: validateName(candidateRunId, "run-id"),
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-automation-not-completed",
    nextAction:
      "Run the real Electron Automation Settings scheduler lifecycle fixture.",
    settingsScenarioProof: {
      scenarioId: AUTOMATION_SCENARIO_ID,
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
      changedScreenshot: `${prefix}-changed.png`,
      restartScreenshot: `${prefix}-restart.png`,
      restoredScreenshot: `${prefix}-restored.png`,
      screenshot: `${prefix}-restored.png`,
      rawEvidence: `${prefix}-raw.json`,
      summary: `${prefix}-summary.json`,
    },
  };
}

export function applyPassingSettingsAutomationEvidence(summary, facts) {
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
    allControlsChanged: facts.allControlsChanged === true,
    restartReadback: facts.restartReadback === true,
    restorationSaved: facts.restorationSaved === true,
    finalRestorationReadback: facts.finalRestorationReadback === true,
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
    ["allCurrentAutomationMethods", trace.missingMethods.length === 0],
    ["isolatedUserData", summary.lifecycle.isolatedUserData],
    ["automationTabActive", facts.automationTabActive === true],
    ["schedulerControlsReady", facts.schedulerControlsReady === true],
    ["jobSummaryReady", facts.jobSummaryReady === true],
    ["healthSummaryReady", facts.healthSummaryReady === true],
    ["allControlsChanged", summary.lifecycle.allControlsChanged],
    ["restartReadback", summary.lifecycle.restartReadback],
    ["restorationSaved", summary.lifecycle.restorationSaved],
    ["finalRestorationReadback", summary.lifecycle.finalRestorationReadback],
    ["loadingCleared", facts.loadingVisible === false],
    ["readErrorHidden", facts.errorVisible === false],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", facts.invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["changedScreenshotWritten", facts.changedScreenshotWritten === true],
    ["restartScreenshotWritten", facts.restartScreenshotWritten === true],
    ["restoredScreenshotWritten", facts.restoredScreenshotWritten === true],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `SETTINGS Automation evidence failed: ${failed.join(", ")}`,
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

export function applyFailedSettingsAutomationEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-automation-lifecycle-fixture";
  summary.nextAction =
    "Fix the Automation Settings current scheduler lifecycle and rerun with the same candidate run-id using a new prefix.";
  summary.error = String(error instanceof Error ? error.message : error).slice(
    0,
    500,
  );
  return summary;
}
