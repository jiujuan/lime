#!/usr/bin/env node

import process from "node:process";

import {
  buildVitestLayerReport,
  renderVitestLayerReportText,
} from "./lib/vitest-layer-report.mjs";
import { liveProviderSmokeAllowed } from "./lib/live-provider-smoke-gate.mjs";

function parseArgs(argv) {
  const options = {
    json: false,
    includeLiveProviderTests: liveProviderSmokeAllowed(),
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-live-provider-tests") {
      options.includeLiveProviderTests = true;
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
  node scripts/report-vitest-layers.mjs [options]

Options:
  --json                         输出 JSON
  --include-live-provider-tests  统计默认可运行数时包含 live Provider 测试
  --help                         显示帮助
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = buildVitestLayerReport({
    includeLiveProviderTests: options.includeLiveProviderTests,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  process.stdout.write(renderVitestLayerReportText(report));
}

main();
