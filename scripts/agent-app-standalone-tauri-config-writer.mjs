#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  readJsonFile,
  writeJsonFile,
  writeStandaloneTauriConfigFiles,
} from "./lib/agent-app-standalone-tauri-config-writer-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    evidence: "",
    outputRoot: "",
    plan: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan" && argv[index + 1]) {
      options.plan = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output-root" && argv[index + 1]) {
      options.outputRoot = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence" && argv[index + 1]) {
      options.evidence = path.resolve(String(argv[index + 1]).trim());
      index += 1;
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
  node scripts/agent-app-standalone-tauri-config-writer.mjs --plan <write-plan.json> --output-root <dir> [options]

Options:
  --evidence <path>  Write non-sensitive writer result JSON
  --check            Exit non-zero unless writer result is written
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.plan || !options.outputRoot) {
    printHelp();
    process.exit(2);
  }

  const plan = readJsonFile(options.plan);
  const result = writeStandaloneTauriConfigFiles({
    outputRoot: options.outputRoot,
    plan,
  });

  if (options.evidence) {
    writeJsonFile(options.evidence, result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (options.check && result.status !== "written") {
    process.exit(1);
  }
}

main();
