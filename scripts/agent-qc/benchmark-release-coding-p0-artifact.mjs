import fs from "node:fs";
import path from "node:path";

const CODING_P0_SUITE_ID = "coding-workflow-p0";
const CODING_P0_BATCH_ID = "coding-current-tools";
const CODING_P0_SCRIPT = "smoke:agent-runtime-tool-execution";
const CODING_P0_ARTIFACT_KIND = "agent_runtime_tool_execution_smoke";
const CODING_P0_TARGET_TOOLS = ["Read", "apply_patch", "Glob", "Grep", "Bash"];
const REQUIRED_CODING_ASSERTIONS = [
  "fixtureProviderUsed",
  "naturalLanguageWithoutAtCommand",
  "allTargetToolsPresentInProviderRequests",
  "allTargetToolsCompleted",
  "sessionDefaultedToReact",
  "currentAgentRuntimeObserved",
  "evidencePackExported",
  "applyPatchMutatedFile",
  "applyPatchCreatedFile",
  "grepToolReturnedMarker",
  "globToolReturnedFixturePath",
  "bashToolReturnedOutput",
  "evidencePackMentionsCodingExecution",
];

function normalizePath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

function codingP0ToolExecutionArtifactPath(root) {
  return normalizePath(
    `${root}/p0/${CODING_P0_SUITE_ID}/${CODING_P0_BATCH_ID}/agent-runtime-tool-execution-${CODING_P0_BATCH_ID}.json`,
  );
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : "";
}

function commandMentionsCodingP0Smoke(command) {
  const value = String(command || "");
  return value.includes(CODING_P0_SCRIPT) && value.includes(CODING_P0_BATCH_ID);
}

function isCodingP0ToolExecutionCommand({
  suiteId = "",
  script = "",
  args = [],
} = {}) {
  return (
    suiteId === CODING_P0_SUITE_ID &&
    script === CODING_P0_SCRIPT &&
    argValue(args, "--batch") === CODING_P0_BATCH_ID
  );
}

function buildCodingP0ArtifactDescriptor(artifactPath) {
  return {
    kind: CODING_P0_ARTIFACT_KIND,
    scenarioId: CODING_P0_BATCH_ID,
    path: normalizePath(artifactPath),
    required: true,
    targetTools: CODING_P0_TARGET_TOOLS,
  };
}

function withCodingP0ToolExecutionArtifact({
  suiteId = "",
  script = "",
  args = [],
  root = "",
} = {}) {
  if (!isCodingP0ToolExecutionCommand({ suiteId, script, args })) {
    return {
      args,
      evidenceArtifacts: [],
    };
  }

  const existingOutput = argValue(args, "--output");
  const artifactPath = normalizePath(
    existingOutput || codingP0ToolExecutionArtifactPath(root),
  );
  return {
    args: existingOutput ? args : [...args, "--output", artifactPath],
    evidenceArtifacts: [buildCodingP0ArtifactDescriptor(artifactPath)],
  };
}

function artifactPathFromP0Step(step, evidenceRoot) {
  const artifact = (step.evidenceArtifacts || []).find(
    (entry) =>
      entry?.kind === CODING_P0_ARTIFACT_KIND &&
      entry?.scenarioId === CODING_P0_BATCH_ID &&
      entry?.path,
  );
  if (artifact?.path) {
    return normalizePath(artifact.path);
  }
  return codingP0ToolExecutionArtifactPath(evidenceRoot);
}

function readJsonFile(rootDir, filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, filePath), "utf8"));
}

function allTargetToolsIncluded(values) {
  const set = new Set(Array.isArray(values) ? values.map(String) : []);
  return CODING_P0_TARGET_TOOLS.every((tool) => set.has(tool));
}

function allTargetToolMapValuesTrue(record) {
  if (!record || typeof record !== "object") {
    return false;
  }
  return CODING_P0_TARGET_TOOLS.every((tool) => record[tool] === true);
}

function codingP0ArtifactValidationFailures(payload) {
  const failures = [];
  if (payload?.schemaVersion !== "v1") {
    failures.push({
      id: "coding_p0_evidence_schema_invalid",
      reason: "coding_p0_artifact_schema_must_be_v1",
    });
  }
  if (payload?.scenarioId !== CODING_P0_BATCH_ID) {
    failures.push({
      id: "coding_p0_scenario_invalid",
      reason: "coding_p0_artifact_must_use_coding_current_tools",
    });
  }
  if (payload?.status !== "pass") {
    failures.push({
      id: "coding_p0_evidence_not_passed",
      reason: "coding_p0_artifact_status_must_be_pass",
    });
  }
  if (!allTargetToolsIncluded(payload?.coverage?.targetTools)) {
    failures.push({
      id: "coding_p0_target_tools_incomplete",
      reason: "coding_p0_artifact_must_list_all_target_tools",
    });
  }
  if (!allTargetToolMapValuesTrue(payload?.provider?.targetToolPresence)) {
    failures.push({
      id: "coding_p0_provider_tools_incomplete",
      reason: "coding_p0_provider_request_must_expose_all_target_tools",
    });
  }
  if (!allTargetToolMapValuesTrue(payload?.runtime?.completedTools)) {
    failures.push({
      id: "coding_p0_runtime_tools_incomplete",
      reason: "coding_p0_runtime_must_complete_all_target_tools",
    });
  }
  const failedAssertions = Array.isArray(payload?.failedAssertions)
    ? payload.failedAssertions.filter(Boolean)
    : [];
  const missingAssertions = REQUIRED_CODING_ASSERTIONS.filter(
    (name) => payload?.assertions?.[name] !== true,
  );
  if (failedAssertions.length > 0 || missingAssertions.length > 0) {
    failures.push({
      id: "coding_p0_assertion_failed",
      reason: `coding_p0_required_assertions_failed:${[
        ...failedAssertions,
        ...missingAssertions,
      ].join(",")}`,
    });
  }
  if (
    payload?.assertions?.evidencePackExported !== true ||
    !payload?.evidencePack
  ) {
    failures.push({
      id: "coding_p0_evidence_pack_missing",
      reason: "coding_p0_must_export_app_server_evidence_pack",
    });
  }
  return failures;
}

function codingP0ArtifactBlockersForSuite({ rootDir, evidenceRoot, suite }) {
  if (
    suite?.id !== CODING_P0_SUITE_ID ||
    suite?.runner !== "npm" ||
    !suite?.requiredForRelease
  ) {
    return [];
  }
  const step = (suite.p0Gate || []).find(
    (entry) =>
      commandMentionsCodingP0Smoke(entry.command) ||
      commandMentionsCodingP0Smoke(entry.manifestCommand) ||
      (entry.evidenceArtifacts || []).some(
        (artifact) =>
          artifact?.kind === CODING_P0_ARTIFACT_KIND &&
          artifact?.scenarioId === CODING_P0_BATCH_ID,
      ),
  );
  if (!step || step.status !== "passed") {
    return [];
  }

  const artifactPath = artifactPathFromP0Step(step, evidenceRoot);
  let payload = null;
  try {
    payload = readJsonFile(rootDir, artifactPath);
  } catch (error) {
    return [
      {
        suiteId: suite.id,
        id: fs.existsSync(path.resolve(rootDir, artifactPath))
          ? "coding_p0_evidence_read_failed"
          : "coding_p0_evidence_missing",
        command: step.manifestCommand || step.command || "",
        reason: error.message,
        artifactPath,
      },
    ];
  }

  return codingP0ArtifactValidationFailures(payload).map((failure) => ({
    suiteId: suite.id,
    id: failure.id,
    command: step.manifestCommand || step.command || "",
    reason: failure.reason,
    artifactPath,
  }));
}

export {
  CODING_P0_BATCH_ID,
  CODING_P0_SUITE_ID,
  CODING_P0_TARGET_TOOLS,
  codingP0ArtifactBlockersForSuite,
  codingP0ToolExecutionArtifactPath,
  withCodingP0ToolExecutionArtifact,
};
