#!/usr/bin/env node
import {
  buildStandaloneInstallerVerificationPlan,
  readJsonFile,
  runStandaloneInstallerVerificationPlan,
  writeJsonFile,
} from "./lib/agent-app-standalone-installer-verify-core.mjs";

function parseArgs(argv) {
  const options = {
    artifacts: "",
    check: false,
    evidence: "",
    execute: false,
    outputRoot: "",
    packageFormat: "app",
    platform: "macos",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--artifacts" && next) {
      options.artifacts = next;
      index += 1;
    } else if (arg === "--output-root" && next) {
      options.outputRoot = next;
      index += 1;
    } else if (arg === "--platform" && next) {
      options.platform = next;
      index += 1;
    } else if (arg === "--package-format" && next) {
      options.packageFormat = next;
      index += 1;
    } else if (arg === "--evidence" && next) {
      options.evidence = next;
      index += 1;
    } else if (arg === "--execute") {
      options.execute = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app-standalone-installer-verify.mjs --artifacts <artifacts.json> --output-root <dir> [options]

Options:
  --platform <macos|windows>       Target platform, default macos
  --package-format <app|dmg|pkg>   macOS package format, default app
  --execute                        Run system verification commands
  --evidence <path>                Write verification plan/result JSON
  --check                          Exit non-zero unless plan is ready, or execution completed when --execute is set
`);
}

function requireOption(value, name) {
  if (!String(value ?? "").trim()) {
    throw new Error(`${name} is required`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  requireOption(options.artifacts, "--artifacts");
  requireOption(options.outputRoot, "--output-root");

  const artifacts = readJsonFile(options.artifacts);
  const plan = buildStandaloneInstallerVerificationPlan({
    artifacts,
    outputRoot: options.outputRoot,
    packageFormat: options.packageFormat,
    platform: options.platform,
  });
  const result = options.execute
    ? runStandaloneInstallerVerificationPlan({ plan })
    : plan;

  if (options.evidence) {
    writeJsonFile(options.evidence, result);
  }

  console.log(
    `[agent-app-installer-verify] status=${result.status} commands=${
      result.commands?.length ?? result.commandsRun?.length ?? 0
    }`,
  );
  if (options.evidence) {
    console.log(`[agent-app-installer-verify] evidence=${options.evidence}`);
  }

  if (options.check) {
    const ok = options.execute
      ? result.status === "completed"
      : result.status === "ready";
    if (!ok) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(
    `[agent-app-installer-verify] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
