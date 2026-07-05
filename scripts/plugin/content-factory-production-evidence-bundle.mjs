#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { buildContentFactoryProductionEvidenceBundle } from "../lib/content-factory-production-evidence-bundle.mjs";

function defaultOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-apps",
    `content-factory-production-evidence-bundle-${stamp}`,
  );
}

function parseArgs(argv) {
  const options = {
    appId: "content-factory-app",
    bootstrapPath: "",
    catalogPath: "",
    check: false,
    expectedVersion: "",
    fetchCloudPath: "",
    guiEvidencePath: "",
    outputDir: "",
    preflightPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--app-id" && next) {
      options.appId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--expected-version" && next) {
      options.expectedVersion = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--output-dir" && next) {
      options.outputDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--preflight" && next) {
      options.preflightPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--catalog" && next) {
      options.catalogPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--bootstrap" && next) {
      options.bootstrapPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud" && next) {
      options.fetchCloudPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--gui-evidence" && next) {
      options.guiEvidencePath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  options.outputDir ||= defaultOutputDir();
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-production-evidence-bundle.mjs [options]

Options:
  --preflight <path>          Production preflight JSON.
  --catalog <path>            Production catalog/client plugins JSON.
  --bootstrap <path>          Production bootstrap JSON with trust roots.
  --fetch-cloud <path>        pluginPackage/fetchCloud verification evidence JSON.
  --gui-evidence <path>       Real Lime Desktop GUI evidence JSON.
  --expected-version <value>  Expected content-factory-app version.
  --output-dir <dir>          Output evidence-dir for signed release gate.
  --check                     Exit non-zero unless the bundled signed gate is ready.
  -h, --help                  Show help.

The bundle copies supplied evidence into the signed release gate's standard
five-file evidence-dir and writes content-factory-signed-release-gate.result.json.
It does not sign, upload, install, call a Provider, or call production APIs.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = buildContentFactoryProductionEvidenceBundle(options);
  console.log(
    `[content-factory-production-evidence-bundle] status=${result.gate.status} dir=${result.dir} missing=${result.gate.missingRequirements.length}`,
  );
  if (result.gate.missingRequirements.length > 0) {
    console.log(
      `[content-factory-production-evidence-bundle] missingCodes=${result.gate.missingRequirements
        .map((item) => item.code)
        .join(",")}`,
    );
  }
  console.log(
    `[content-factory-production-evidence-bundle] result=${result.files.result}`,
  );
  if (options.check && result.gate.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[content-factory-production-evidence-bundle] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
