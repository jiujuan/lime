import { codingP0ArtifactBlockersForSuite } from "./benchmark-release-coding-p0-artifact.mjs";

function suiteIdFromP0Step(step) {
  const id = step?.id || "";
  const marker = ":npm-";
  return id.includes(marker) ? id.slice(0, id.indexOf(marker)) : "";
}

function summarizeP0GateSteps(entries) {
  return entries.map((entry) => ({
    path: entry.path,
    generatedAt: entry.payload.generatedAt || "",
    id: entry.payload.id || "",
    command: entry.payload.command || "",
    manifestCommand: entry.payload.manifestCommand || "",
    status: entry.payload.status || "",
    exitCode: entry.payload.exitCode ?? null,
    reason: entry.payload.reason || "",
    evidenceArtifacts: Array.isArray(entry.payload.evidenceArtifacts)
      ? entry.payload.evidenceArtifacts
      : [],
    outputPath: entry.payload.outputPath || "",
  }));
}

function p0GateBlockersForSuite({
  rootDir,
  evidenceRoot,
  suite,
  manifestSuites,
}) {
  if (suite.runner !== "npm" || !suite.requiredForRelease) {
    return [];
  }
  const manifestSuite = manifestSuites.find((entry) => entry.id === suite.id);
  const expectedCommands = Array.isArray(manifestSuite?.commands)
    ? manifestSuite.commands
    : [];
  const observedCommands = new Set(
    suite.p0Gate.map((step) => step.manifestCommand || step.command),
  );
  const missingBlockers = expectedCommands
    .filter((command) => !observedCommands.has(command))
    .map((command) => ({
      suiteId: suite.id,
      id: "p0_gate_missing",
      command,
      reason: "missing_p0_gate_evidence",
    }));
  const failedBlockers = suite.p0Gate
    .filter((step) => step.status !== "passed")
    .map((step) => ({
      suiteId: suite.id,
      id: step.id,
      command: step.manifestCommand || step.command,
      reason: step.reason || step.status || "p0_gate_not_passed",
    }));
  return [
    ...missingBlockers,
    ...failedBlockers,
    ...codingP0ArtifactBlockersForSuite({ rootDir, evidenceRoot, suite }),
  ];
}

export { p0GateBlockersForSuite, suiteIdFromP0Step, summarizeP0GateSteps };
