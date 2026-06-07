#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildAgentQcPayloadCoverageReport,
  renderAgentQcPayloadCoverageMarkdown,
} from "../lib/agent-qc-payload-coverage-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    format: "markdown",
    help: false,
    manifestPath: "internal/test/agent-qc-scenarios.manifest.json",
    outputPath: "",
    payloadPath: "",
    processOwnerPath: ".lime/qc/gui-process-owner-current.json",
    requireOwnerClear: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest" && argv[index + 1]) {
      options.manifestPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--payload" && argv[index + 1]) {
      options.payloadPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--process-owner" && argv[index + 1]) {
      options.processOwnerPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.outputPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      options.format = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--require-owner-clear") {
      options.requireOwnerClear = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Lime Agent QC Payload Coverage

用法:
  npm run agent-qc:payload-coverage -- --payload ./.lime/qc/qcloop-p0.json
  node scripts/agent-qc/payload-coverage.mjs --payload ./.lime/qc/qcloop-p0.json --format json --check

选项:
  --manifest PATH          Agent QC scenario manifest，默认 internal/test/agent-qc-scenarios.manifest.json
  --payload PATH           qcloop job payload JSON
  --process-owner PATH     raw process owner JSON，默认 .lime/qc/gui-process-owner-current.json
  --output PATH            写入文件；默认 stdout
  --format FMT             markdown | json，默认 markdown
  --require-owner-clear    --check 时要求 owner gate 也为 ready
  --check                  coverage 不完整时非 0 退出
  -h, --help               显示帮助
`);
}

function readJson(filePath, { optional = false } = {}) {
  if (!filePath) {
    if (optional) return undefined;
    throw new Error("缺少 JSON 路径。");
  }
  const resolved = path.resolve(process.cwd(), filePath);
  if (optional && !fs.existsSync(resolved)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.payloadPath) {
    throw new Error("必须提供 --payload。");
  }
  const report = buildAgentQcPayloadCoverageReport({
    manifest: readJson(options.manifestPath),
    payload: readJson(options.payloadPath),
    processOwner: readJson(options.processOwnerPath, { optional: true }),
    manifestPath: options.manifestPath,
    payloadPath: options.payloadPath,
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderAgentQcPayloadCoverageMarkdown(report);
  writeOutput(options.outputPath, content);

  if (options.check && !report.coverage.passed) {
    process.exitCode = 1;
  }
  if (options.check && options.requireOwnerClear && report.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[agent-qc:payload-coverage] ${error.message}`);
  process.exitCode = 1;
});
