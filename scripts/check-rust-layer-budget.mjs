#!/usr/bin/env node

import process from "node:process";

import { buildRustLayerReport } from "./rust-test-layer-classifier.mjs";

const DEFAULT_MAX_E2E_RUNNABLE = 0;

export function parseArgs(argv) {
  const options = {
    json: false,
    maxE2eRunnable: DEFAULT_MAX_E2E_RUNNABLE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--max-e2e-runnable") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error("--max-e2e-runnable requires a value");
      }
      options.maxE2eRunnable = parseNonNegativeInteger(
        value,
        "--max-e2e-runnable",
      );
      index += 1;
    } else if (arg.startsWith("--max-e2e-runnable=")) {
      options.maxE2eRunnable = parseNonNegativeInteger(
        arg.slice("--max-e2e-runnable=".length),
        "--max-e2e-runnable",
      );
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

export function evaluateRustLayerBudget(report, options = {}) {
  const maxE2eRunnable = options.maxE2eRunnable ?? DEFAULT_MAX_E2E_RUNNABLE;
  const e2eRunnableEntries = (report.entries ?? []).filter(
    (entry) =>
      entry.layer === "e2e" &&
      entry.cargoScope !== "excluded-subcrate" &&
      entry.testCount > entry.ignoredCount,
  );

  const e2eRunnable = e2eRunnableEntries.length;
  const e2eOverBudget = e2eRunnable > maxE2eRunnable;

  return {
    ok: !e2eOverBudget,
    maxE2eRunnable,
    e2eRunnable,
    e2eOverBudgetBy: e2eOverBudget ? e2eRunnable - maxE2eRunnable : 0,
    e2eRunnableFiles: e2eRunnableEntries.map((entry) => ({
      file: entry.file,
      packageName: entry.packageName,
      runnableTests: entry.testCount - entry.ignoredCount,
    })),
  };
}

export function renderBudgetResultText(result) {
  const lines = [
    "Rust layer budget check",
    `E2E files with non-ignored tests: ${result.e2eRunnable}`,
    `E2E budget: ${result.maxE2eRunnable}`,
    `Status: ${result.ok ? "ok" : "over budget"}`,
  ];

  if (result.e2eOverBudgetBy > 0) {
    lines.push(`E2E over budget by: ${result.e2eOverBudgetBy}`);
    if (result.e2eRunnableFiles.length > 0) {
      lines.push("E2E files with non-ignored tests:");
      for (const entry of result.e2eRunnableFiles) {
        lines.push(
          `- ${entry.file} (${entry.packageName}, runnable tests=${entry.runnableTests})`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-rust-layer-budget.mjs [options]

Options:
  --max-e2e-runnable N   允许默认可运行的 Rust e2e 文件数，默认 ${DEFAULT_MAX_E2E_RUNNABLE}
  --json                 输出 JSON
  --help                 显示帮助
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildRustLayerReport();
  const result = evaluateRustLayerBudget(report, options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(renderBudgetResultText(result));
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
