#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildStandaloneUpdaterPublishPlan,
  readJsonFile,
  writeJsonFile,
  writeStandaloneUpdaterPublishFiles,
} from "../lib/plugin-standalone-updater-publisher-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    evidence: "",
    outputDir: "",
    release: "",
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--release" && argv[index + 1]) {
      options.release = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence" && argv[index + 1]) {
      options.evidence = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--write") {
      options.write = true;
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
  node scripts/plugin/standalone-updater-publisher.mjs --release <release.json> --output-dir <dir> [options]

Options:
  --evidence <path>  Write publish plan or write result JSON
  --write            Write latest.json and rollback.json locally
  --check            Exit non-zero unless plan is ready, or manifests are written when --write is set
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.release || !options.outputDir) {
    printHelp();
    process.exit(2);
  }

  const input = readJsonFile(options.release);
  const plan = buildStandaloneUpdaterPublishPlan({
    ...input,
    outputDir: options.outputDir,
  });
  const result = options.write
    ? writeStandaloneUpdaterPublishFiles(plan)
    : plan;

  if (options.evidence) {
    writeJsonFile(options.evidence, result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (options.check) {
    const ok = options.write
      ? result.status === "written"
      : result.status === "ready";
    if (!ok) process.exit(1);
  }
}

main();
