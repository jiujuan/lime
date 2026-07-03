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

const AGENT_RUNTIME_BYPASS_MARKERS = [
  {
    marker: "LIME_GATEWAY_BASE",
    reason: "Plugin package must not call Lime Gateway directly; use lime.agent / AgentRuntime Host facade",
  },
  {
    marker: "LIME_GATEWAY_PROTOCOL",
    reason: "Plugin package must not choose provider protocol directly; route through AgentRuntime model routing",
  },
  {
    marker: "OPENAI_API_KEY",
    reason: "Plugin package must not own provider credentials; credentials belong to Lime runtime policy",
  },
  {
    marker: "OPENAI_BASE_URL",
    reason: "Plugin package must not own OpenAI-compatible endpoints; use Host runtime",
  },
  {
    marker: "/v1/chat/completions",
    reason: "Plugin package must not call chat completions directly; use AgentRuntime tasks",
  },
  {
    marker: "/v1/responses",
    reason: "Plugin package must not call Responses-style provider APIs directly; use AgentRuntime tasks",
  },
  {
    marker: "new OpenAI(",
    reason: "Plugin package must not instantiate provider SDK clients",
  },
  {
    marker: ".chat.completions.create(",
    reason: "Plugin package must not call provider SDK completions directly",
  },
  {
    marker: "anthropic.messages.create(",
    reason: "Plugin package must not call provider SDK message APIs directly",
  },
  {
    marker: ".generateContent(",
    reason: "Plugin package must not call provider generation APIs directly",
  },
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

function createAgentRuntimeBypassReport(entries = []) {
  const matches = [];

  for (const entry of entries) {
    const filePath = normalizeText(entry.path);
    const content = normalizeText(entry.content);
    if (!filePath || !content) {
      continue;
    }
    for (const rule of AGENT_RUNTIME_BYPASS_MARKERS) {
      const count = content.split(rule.marker).length - 1;
      if (count <= 0) {
        continue;
      }
      matches.push({
        file: filePath,
        marker: rule.marker,
        count,
        reason: rule.reason,
      });
    }
  }

  return {
    matches,
    totalMatches: matches.reduce((sum, entry) => sum + entry.count, 0),
    fileCount: new Set(matches.map((entry) => entry.file)).size,
  };
}

function createVerdict({
  gitStatus,
  hostBridge,
  uiTest,
  scripts,
  distArtifacts,
  agentRuntimeBypass,
}) {
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
  if (agentRuntimeBypass.totalMatches > 0) {
    blockers.push(
      `plugin package contains direct model/provider runtime bypass markers: ${agentRuntimeBypass.totalMatches} hit(s) in ${agentRuntimeBypass.fileCount} file(s)`,
    );
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs_handoff" : "ready";
  const nextAction =
    status === "ready"
      ? "Run package tests and the agreed package verify gate."
      : status === "needs_handoff"
        ? "Confirm owner handoff before changing or rebuilding package artifacts."
        : agentRuntimeBypass.totalMatches > 0
          ? "Do not claim Plugin runtime completion; remove direct provider/Gateway calls and route AI work through lime.agent / AgentRuntime Host facade."
          : "Do not claim P18.5.3 complete; remove private bridge transport through the SDK facade first.";

  return {
    status,
    blockers,
    warnings,
    nextAction,
  };
}

function createPluginPackageHandoffReport({
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
  const agentRuntimeBypass = createAgentRuntimeBypassReport(files.runtimeFiles || []);
  const verdict = createVerdict({
    gitStatus,
    hostBridge,
    uiTest,
    scripts,
    distArtifacts,
    agentRuntimeBypass,
  });

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
    agentRuntimeBypass,
    verdict,
  };
}

export {
  AGENT_RUNTIME_BYPASS_MARKERS,
  PRIVATE_BRIDGE_MARKERS,
  SDK_FACADE_MARKERS,
  analyzeScripts,
  createPluginPackageHandoffReport,
  createAgentRuntimeBypassReport,
  createDistArtifactReport,
  countMarkerHits,
  parseGitStatusShort,
};
