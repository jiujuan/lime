#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildStandaloneTauriBuildPlan,
  readJsonFile,
  runStandaloneTauriBuildPlan,
  writeJsonFile,
} from "./lib/agent-app-standalone-tauri-build-runner-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    execute: false,
    evidence: "",
    outputRoot: "",
    packageFormat: "app",
    repoRoot: process.cwd(),
    targetTriple: "",
    writerEvidence: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--writer-evidence" && argv[index + 1]) {
      options.writerEvidence = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output-root" && argv[index + 1]) {
      options.outputRoot = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--repo-root" && argv[index + 1]) {
      options.repoRoot = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--package-format" && argv[index + 1]) {
      options.packageFormat = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--target" && argv[index + 1]) {
      options.targetTriple = String(argv[index + 1]).trim();
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
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app-standalone-tauri-build-runner.mjs --writer-evidence <writer-evidence.json> --output-root <dir> [options]

Options:
  --repo-root <dir>       Repository root, defaults to cwd
  --package-format <fmt>  app, dmg, or pkg; default app
  --target <triple>       Optional Tauri target triple
  --evidence <path>       Write build plan or run result JSON
  --execute               Actually run npm run tauri -- build ...
  --check                 Exit non-zero unless plan is ready, or execution completed when --execute is set
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.writerEvidence || !options.outputRoot) {
    printHelp();
    process.exit(2);
  }

  const writerResult = readJsonFile(options.writerEvidence);
  const plan = buildStandaloneTauriBuildPlan({
    outputRoot: options.outputRoot,
    packageFormat: options.packageFormat,
    repoRoot: options.repoRoot,
    targetTriple: options.targetTriple,
    writerResult,
  });
  const result = options.execute ? runStandaloneTauriBuildPlan({ plan }) : plan;

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
