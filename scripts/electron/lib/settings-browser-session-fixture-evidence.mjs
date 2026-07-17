import path from "node:path";

export const BROWSER_SESSION_SCENARIO_ID = "chrome-relay-lifecycle";
export const BROWSER_SESSION_REQUIRED_METHODS = [
  "browserSession/target/list",
  "browserSession/open",
  "browserSession/read",
  "browserSession/close",
];

const APP_SERVER_COMMAND = "app_server_handle_json_lines";
const LEGACY_BROWSER_COMMANDS = [
  "get_browser_connector_settings_cmd",
  "get_browser_connector_install_status_cmd",
  "get_chrome_profile_sessions",
  "get_chrome_bridge_endpoint_info",
  "get_chrome_bridge_status",
  "get_browser_backend_policy",
  "get_browser_backends_status",
  "set_browser_connector_enabled_cmd",
  "set_browser_backend_policy",
  "launch_browser_session",
  "list_cdp_targets",
  "open_cdp_session",
  "close_cdp_session",
];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateName(value, label) {
  const normalized = String(value ?? "").trim();
  if (!SAFE_NAME.test(normalized)) {
    throw new Error(`invalid Settings Browser Session ${label}`);
  }
  return normalized;
}

export function parseSettingsBrowserSessionFixtureArgs(
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
      `standalone-settings-browser-session-${new Date()
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
      "settings-browser-session-lifecycle",
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

export function summarizeSettingsBrowserSessionTrace(traceRaws) {
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
    missingMethods: BROWSER_SESSION_REQUIRED_METHODS.filter(
      (method) => !methods.includes(method),
    ),
    legacyCommands: LEGACY_BROWSER_COMMANDS.filter((command) =>
      commands.has(command),
    ),
    mockFallbackHitCount: appServerEntries.filter(
      (entry) => entry.transport !== "electron-ipc",
    ).length,
  };
}

export function createSettingsBrowserSessionEvidence({
  candidateRunId,
  startedAt,
  prefix,
}) {
  return {
    schemaVersion: 1,
    scenarioId: "SETTINGS-01-chrome-relay-lifecycle",
    priority: "P0",
    proofLevel: "Gate B-R",
    claimBoundary:
      "Real Electron Browser Settings lifecycle through preload/IPC and App Server browserSession methods into RuntimeCore with an isolated local Chromium CDP fixture. It proves target discovery, open, readback, visible connected state, close, and visible closed state. It does not claim extension relay, persistent browser profiles, live websites, user browser data, or packaged-platform behavior, and stores no page content, URL, session identity, local path, or browser log.",
    candidateRunId: validateName(candidateRunId, "run-id"),
    testOnly: true,
    startedAt,
    result: "fail",
    failureClass: "settings-browser-session-not-completed",
    nextAction:
      "Run the real Electron Browser Settings lifecycle fixture with the isolated Chromium target.",
    settingsScenarioProof: {
      scenarioId: BROWSER_SESSION_SCENARIO_ID,
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
      connectedScreenshot: `${prefix}-connected.png`,
      closedScreenshot: `${prefix}-closed.png`,
      screenshot: `${prefix}-closed.png`,
      rawEvidence: `${prefix}-raw.json`,
      summary: `${prefix}-summary.json`,
    },
  };
}

export function applyPassingSettingsBrowserSessionEvidence(summary, facts) {
  const { trace, consoleErrors, pageErrors } = facts;
  summary.bridge = {
    electron: facts.electron === true,
    preloadInvoke: facts.preloadInvoke === true,
    transport: trace.appServerIpcHitCount > 0 ? "electron-ipc" : null,
    command: APP_SERVER_COMMAND,
    appServerIpcHitCount: trace.appServerIpcHitCount,
    methods: trace.methods,
  };
  summary.lifecycle = {
    isolatedUserData: facts.isolatedUserData === true,
    localCdpFixture: facts.localCdpFixture === true,
    settingsTabActive: facts.settingsTabActive === true,
    targetDetected: facts.targetDetected === true,
    targetSelected: facts.targetSelected === true,
    sessionOpened: facts.sessionOpened === true,
    sessionReadback: facts.sessionReadback === true,
    connectedVisible: facts.connectedVisible === true,
    sessionClosed: facts.sessionClosed === true,
    closedVisible: facts.closedVisible === true,
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
    ["realElectron", summary.bridge.electron],
    ["preloadInvokeBridge", summary.bridge.preloadInvoke],
    ["appServerElectronIpc", summary.bridge.appServerIpcHitCount > 0],
    ["allCurrentBrowserSessionMethods", trace.missingMethods.length === 0],
    ["isolatedUserData", summary.lifecycle.isolatedUserData],
    ["localCdpFixture", summary.lifecycle.localCdpFixture],
    ["settingsTabActive", summary.lifecycle.settingsTabActive],
    ["targetDetected", summary.lifecycle.targetDetected],
    ["targetSelected", summary.lifecycle.targetSelected],
    ["sessionOpened", summary.lifecycle.sessionOpened],
    ["sessionReadback", summary.lifecycle.sessionReadback],
    ["connectedVisible", summary.lifecycle.connectedVisible],
    ["sessionClosed", summary.lifecycle.sessionClosed],
    ["closedVisible", summary.lifecycle.closedVisible],
    ["consoleErrorsZero", consoleErrors.length === 0],
    ["pageErrorsZero", pageErrors.length === 0],
    ["invokeErrorsZero", facts.invokeErrorCount === 0],
    ["legacyCommandsZero", trace.legacyCommands.length === 0],
    ["mockFallbackZero", trace.mockFallbackHitCount === 0],
    ["connectedScreenshotWritten", facts.connectedScreenshotWritten === true],
    ["closedScreenshotWritten", facts.closedScreenshotWritten === true],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `SETTINGS Browser Session evidence failed: ${failed.join(", ")}`,
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

export function applyFailedSettingsBrowserSessionEvidence(summary, error) {
  summary.result = "fail";
  summary.settingsScenarioProof.complete = false;
  summary.assertions = {
    total: 1,
    passed: 0,
    failed: ["scenarioFailed"],
    details: {},
  };
  summary.failureClass = "settings-browser-session-lifecycle-fixture";
  summary.nextAction =
    "Fix the current Browser Settings session lifecycle and rerun with the same candidate run-id using a new prefix.";
  summary.errorClass =
    error instanceof Error && error.name ? error.name : "Error";
  return summary;
}
