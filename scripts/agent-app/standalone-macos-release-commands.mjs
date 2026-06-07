#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildMacOsStandaloneReleaseCommandPlan,
  readJsonFile,
  runMacOsStandaloneReleaseCommandPlan,
  writeJsonFile,
} from "../lib/agent-app-standalone-macos-release-commands-core.mjs";

function parseArgs(argv) {
  const options = {
    applicationSigningIdentity: "",
    artifacts: "",
    check: false,
    evidence: "",
    execute: false,
    notarizationProfile: "",
    outputRoot: "",
    packageFormat: "app",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifacts" && argv[index + 1]) {
      options.artifacts = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output-root" && argv[index + 1]) {
      options.outputRoot = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--package-format" && argv[index + 1]) {
      options.packageFormat = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--application-identity" && argv[index + 1]) {
      options.applicationSigningIdentity = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--notarization-profile" && argv[index + 1]) {
      options.notarizationProfile = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--evidence" && argv[index + 1]) {
      options.evidence = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app/standalone-macos-release-commands.mjs --artifacts <artifacts.json> --output-root <dir> [options]

Options:
  --package-format <fmt>          app or dmg; default app
  --application-identity <ref>    Developer ID Application identity ref
  --notarization-profile <ref>    notarytool keychain profile ref
  --evidence <path>               Write command plan or run result JSON
  --execute                       Actually run codesign/notarytool/stapler
  --check                         Exit non-zero unless plan is ready, or execution completed when --execute is set
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.artifacts || !options.outputRoot) {
    printHelp();
    process.exit(2);
  }

  const artifactInput = readJsonFile(options.artifacts);
  const artifacts = Array.isArray(artifactInput)
    ? artifactInput
    : (artifactInput.artifactRefs ?? artifactInput.artifacts ?? []);
  const plan = buildMacOsStandaloneReleaseCommandPlan({
    applicationSigningIdentity: options.applicationSigningIdentity,
    artifacts,
    notarizationProfile: options.notarizationProfile,
    outputRoot: options.outputRoot,
    packageFormat: options.packageFormat,
  });
  const result = options.execute
    ? runMacOsStandaloneReleaseCommandPlan({ plan })
    : plan;

  if (options.evidence) {
    writeJsonFile(options.evidence, result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (options.check) {
    const ok = options.execute
      ? result.status === "completed"
      : result.status === "ready";
    if (!ok) process.exit(1);
  }
}

main();
