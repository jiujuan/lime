#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createAgentQcGuiFlowReport,
  renderAgentQcGuiFlowMarkdown,
} from "../lib/agent-qc-gui-flow-core.mjs";

const DEFAULT_FLOW_MANIFEST_PATH =
  "internal/test/agent-qc-gui-flows.manifest.json";
const DEFAULT_SCENARIO_MANIFEST_PATH =
  "internal/test/agent-qc-scenarios.manifest.json";

function parseArgs(argv) {
  const result = {
    check: false,
    flowManifestPath: DEFAULT_FLOW_MANIFEST_PATH,
    format: "markdown",
    help: false,
    outputPath: "",
    scenarioManifestPath: DEFAULT_SCENARIO_MANIFEST_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--flow-manifest" && argv[index + 1]) {
      result.flowManifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--scenario-manifest" && argv[index + 1]) {
      result.scenarioManifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Agent QC GUI Flow Report

用法:
  npm run agent-qc:gui-flow:report
  npm run agent-qc:gui-flow:check

选项:
  --flow-manifest PATH     GUI flow manifest，默认 internal/test/agent-qc-gui-flows.manifest.json
  --scenario-manifest PATH Agent QC scenario manifest，默认 internal/test/agent-qc-scenarios.manifest.json
  --format FMT            markdown | json
  --output PATH           写入文件；默认 stdout
  --check                 非法时非 0 退出
  -h, --help              显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"),
  );
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, content, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = createAgentQcGuiFlowReport({
    flowManifest: readJsonFile(options.flowManifestPath),
    scenarioManifest: readJsonFile(options.scenarioManifestPath),
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderAgentQcGuiFlowMarkdown(report);

  writeOutput(options.outputPath, content);

  if (options.check && !report.valid) {
    process.exit(1);
  }
}

main();
