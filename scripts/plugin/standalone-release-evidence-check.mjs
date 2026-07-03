#!/usr/bin/env node
import {
  checkStandaloneReleaseEvidence,
  readJsonFile,
  writeJsonFile,
} from "../lib/plugin-standalone-release-evidence-core.mjs";

function parseArgs(argv) {
  const options = {
    artifactRoot: "",
    check: false,
    evidence: "",
    output: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--evidence" && next) {
      options.evidence = next;
      index += 1;
    } else if (arg === "--artifact-root" && next) {
      options.artifactRoot = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
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
  node scripts/plugin/standalone-release-evidence-check.mjs --evidence <release-evidence.json> [options]

Options:
  --artifact-root <dir>  Verify artifact paths exist under this root
  --output <path>   Write final release evidence audit JSON
  --check           Exit non-zero unless final release evidence is ready
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
  requireOption(options.evidence, "--evidence");

  const evidence = readJsonFile(options.evidence);
  const result = checkStandaloneReleaseEvidence(evidence, {
    artifactRoot: options.artifactRoot || undefined,
  });

  if (options.output) {
    writeJsonFile(options.output, result);
  }

  console.log(
    `[plugin-release-evidence] status=${result.status} blockers=${result.blockers.length}`,
  );
  if (options.output) {
    console.log(`[plugin-release-evidence] output=${options.output}`);
  }

  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[plugin-release-evidence] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
