const PRIVATE_BRIDGE_MARKERS = [
  "pendingRequests",
  "buildMessage",
  "requestHostBridge",
  "window.parent.postMessage",
  "capability:invoke",
  "capability:subscribe",
  "capability:event",
];

const SDK_FACADE_MARKERS = [
  "createLimeHostBridgeCapabilityInvoker",
  "createLimeCoreCapabilityAdapters",
];

const HIGH_RISK_SCRIPT_PATTERNS = [
  {
    scriptName: "build",
    pattern: /\brm\s*\(|\brimraf\b|rm\s+-rf\s+dist|remove\s*\(\s*["']dist["']/i,
    reason: "build script may delete or rewrite dist artifacts",
  },
  {
    scriptName: "verify",
    pattern: /\bnpm\s+run\s+build\b|\bpnpm\s+run\s+build\b|\byarn\s+build\b/i,
    reason: "verify script runs build before validation",
  },
  {
    scriptName: "e2e",
    pattern: /\bnpm\s+run\s+build\b|\bpnpm\s+run\s+build\b|\byarn\s+build\b/i,
    reason: "e2e script runs build before user-flow validation",
  },
];

function normalizeText(value) {
  return String(value || "");
}

function countMarkerHits(text, markers) {
  const content = normalizeText(text);
  return markers
    .map((marker) => ({
      marker,
      count: content.split(marker).length - 1,
    }))
    .filter((entry) => entry.count > 0);
}

function parseGitStatusShort(output) {
  const entries = normalizeText(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
      untracked: line.startsWith("??"),
    }));

  const tracked = entries.filter((entry) => !entry.untracked);
  const untracked = entries.filter((entry) => entry.untracked);
  return {
    entries,
    trackedCount: tracked.length,
    untrackedCount: untracked.length,
    totalCount: entries.length,
  };
}

function parsePackageJson(packageJsonText) {
  if (!normalizeText(packageJsonText).trim()) {
    return { ok: false, scripts: {}, error: "package_json_missing" };
  }
  try {
    const parsed = JSON.parse(packageJsonText);
    return {
      ok: true,
      scripts: parsed?.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {},
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      scripts: {},
      error: `package_json_invalid:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function analyzeScripts(scripts, scriptFiles = {}) {
  const entries = Object.entries(scripts || {}).map(([name, command]) => ({
    name,
    command: normalizeText(command),
  }));
  const highRisk = [];

  for (const entry of entries) {
    for (const rule of HIGH_RISK_SCRIPT_PATTERNS) {
      const nameMatches =
        rule.scriptName === "e2e"
          ? entry.name.toLowerCase().includes("e2e")
          : entry.name === rule.scriptName;
      const inspectedText =
        entry.name === "build"
          ? `${entry.command}\n${normalizeText(scriptFiles.build)}`
          : entry.command;
      if (nameMatches && rule.pattern.test(inspectedText)) {
        highRisk.push({
          name: entry.name,
          command: entry.command,
          reason: rule.reason,
        });
      }
    }
  }

  return {
    entries,
    highRisk,
  };
}

function createFileMarkerReport({ exists, content }) {
  return {
    exists: Boolean(exists),
    privateMarkers: countMarkerHits(content, PRIVATE_BRIDGE_MARKERS),
    sdkMarkers: countMarkerHits(content, SDK_FACADE_MARKERS),
  };
}

function createDistArtifactReport(entries = []) {
  const normalizedEntries = entries.map((entry) => ({
    status: normalizeText(entry.status),
    src: normalizeText(entry.src),
    dist: normalizeText(entry.dist),
    srcHash: normalizeText(entry.srcHash),
    distHash: normalizeText(entry.distHash),
  }));
  const deltas = normalizedEntries.filter((entry) => entry.status !== "same");

  return {
    entries: normalizedEntries,
    deltas,
    totalDeltas: deltas.length,
    diffCount: deltas.filter((entry) => entry.status === "diff").length,
    missingDistCount: deltas.filter((entry) => entry.status === "missing-dist").length,
    extraDistCount: deltas.filter((entry) => entry.status === "extra-dist").length,
  };
}

function createVerdict({ gitStatus, hostBridge, uiTest, scripts, distArtifacts }) {
  const blockers = [];
  const warnings = [];

  if (!hostBridge.exists) {
    blockers.push("src/ui/host-bridge.js is missing");
  }
  if (!uiTest.exists) {
    warnings.push("tests/ui.test.mjs is missing; package-side bridge regression is not visible");
  }

  if (hostBridge.privateMarkers.length > 0 || uiTest.privateMarkers.length > 0) {
    blockers.push("private Host Bridge transport markers are still present");
  }
  if (hostBridge.sdkMarkers.length === 0) {
    blockers.push("SDK facade markers are not present in src/ui/host-bridge.js");
  }
  if (gitStatus.totalCount > 0) {
    warnings.push(
      `package worktree is dirty: tracked=${gitStatus.trackedCount}, untracked=${gitStatus.untrackedCount}`,
    );
  }
  if (scripts.highRisk.length > 0) {
    warnings.push("build/verify/e2e scripts may rewrite dist artifacts");
  }
  if (distArtifacts.totalDeltas > 0) {
    warnings.push(`dist artifacts are not synchronized: ${distArtifacts.totalDeltas} delta(s)`);
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs_handoff" : "ready";
  const nextAction =
    status === "ready"
      ? "Run package tests and the agreed package verify gate."
      : status === "needs_handoff"
        ? "Confirm owner handoff before changing or rebuilding package artifacts."
        : "Do not claim P18.5.3 complete; remove private bridge transport through the SDK facade first.";

  return {
    status,
    blockers,
    warnings,
    nextAction,
  };
}

function createAgentAppPackageHandoffReport({
  generatedAt = new Date().toISOString(),
  packageDir = "",
  gitStatusShort = "",
  files = {},
  packageJsonText = "",
} = {}) {
  const gitStatus = parseGitStatusShort(gitStatusShort);
  const hostBridge = createFileMarkerReport(files.hostBridge || {});
  const uiTest = createFileMarkerReport(files.uiTest || {});
  const packageJson = parsePackageJson(packageJsonText);
  const scripts = analyzeScripts(packageJson.scripts, {
    build: files.buildScript?.content,
  });
  const distArtifacts = createDistArtifactReport(files.distArtifacts || []);
  const verdict = createVerdict({ gitStatus, hostBridge, uiTest, scripts, distArtifacts });

  return {
    schemaVersion: "v1",
    generatedAt,
    packageDir,
    gitStatus,
    files: {
      hostBridge,
      uiTest,
    },
    packageJson,
    scripts,
    distArtifacts,
    verdict,
  };
}

export {
  PRIVATE_BRIDGE_MARKERS,
  SDK_FACADE_MARKERS,
  analyzeScripts,
  createAgentAppPackageHandoffReport,
  createDistArtifactReport,
  countMarkerHits,
  parseGitStatusShort,
};
