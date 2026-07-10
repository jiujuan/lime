import process from "node:process";

import { withCodingP0ToolExecutionArtifact } from "./benchmark-release-coding-p0-artifact.mjs";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function externalSuiteSlug(suite) {
  if (suite.id === "terminal-bench-release-slice") {
    return "terminal-bench";
  }
  if (suite.id === "deepswe-fixed-ten") {
    return "deepswe";
  }
  return suite.id;
}

function trueRunScriptForSuite(suite) {
  if (suite.runner === "harbor-adapter") {
    return "agent-qc:benchmark:terminal-run";
  }
  if (suite.runner === "deepswe-adapter") {
    return "agent-qc:benchmark:deepswe-run";
  }
  return "agent-qc:benchmark:true-run";
}

function currentChainEvidencePathForTask({
  currentChainEvidenceRoot = "",
  slug,
  taskId,
}) {
  if (!currentChainEvidenceRoot) {
    return "";
  }
  return `${currentChainEvidenceRoot}/${slug}/${taskId}/current-chain-evidence.json`;
}

function makeNpmStep({
  id,
  kind,
  script,
  args = [],
  outputPath = "",
  blocking = true,
  manifestCommand = "",
  evidenceArtifacts = [],
}) {
  return {
    id,
    kind,
    executable: npmExecutable(),
    args: ["run", script, "--", ...args],
    command: `npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`,
    manifestCommand,
    evidenceArtifacts,
    outputPath,
    blocking,
  };
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNpmRunCommand(command) {
  const parts = String(command).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3 || parts[0] !== "npm" || parts[1] !== "run") {
    throw new Error(`只支持 npm run 命令：${command}`);
  }
  const script = parts[2];
  const extraArgs = parts[3] === "--" ? parts.slice(4) : parts.slice(3);
  return { script, args: extraArgs };
}

function buildNpmSuiteSteps(suite, root) {
  const commands = Array.isArray(suite.commands) ? suite.commands : [];
  return commands.map((command, index) => {
    const parsed = parseNpmRunCommand(command);
    const codingArtifact = withCodingP0ToolExecutionArtifact({
      suiteId: suite.id,
      script: parsed.script,
      args: parsed.args,
      root,
    });
    const commandIndex = String(index + 1).padStart(2, "0");
    const scriptSlug = slugify(parsed.script) || `command-${index + 1}`;
    return makeNpmStep({
      id: `${suite.id}:npm-${commandIndex}-${scriptSlug}`,
      kind: "p0_npm_gate",
      script: parsed.script,
      args: codingArtifact.args,
      manifestCommand: command,
      evidenceArtifacts: codingArtifact.evidenceArtifacts,
      outputPath: `${root}/p0/${suite.id}/${commandIndex}-${scriptSlug}.json`,
    });
  });
}

export {
  buildNpmSuiteSteps,
  currentChainEvidencePathForTask,
  externalSuiteSlug,
  makeNpmStep,
  npmExecutable,
  trueRunScriptForSuite,
};
