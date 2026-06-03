#!/usr/bin/env node

import process from "node:process";

import {
  buildRustLayerReport,
  renderRustLayerReportText,
} from "./rust-test-layer-classifier.mjs";

function parseArgs(argv) {
  const options = {
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/report-rust-test-layers.mjs [options]

Options:
  --json    输出 JSON
  --help    显示帮助
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildRustLayerReport();
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  process.stdout.write(renderRustLayerReportText(report));
}

main();
