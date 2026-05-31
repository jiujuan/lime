#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createAgentQcGuiOwnerWatchEntry,
  createAgentQcGuiOwnerReport,
  renderAgentQcGuiOwnerSummary,
} from "./lib/agent-qc-gui-owner-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "summary",
    help: false,
    manifestPath: "internal/test/agent-qc-scenarios.manifest.json",
    maxActiveOwners: 0,
    outputPath: "",
    statusDir: ".lime/qc",
    watchHistoryOutputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest" && argv[index + 1]) {
      result.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--status-dir" && argv[index + 1]) {
      result.statusDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--max-active-owners" && argv[index + 1]) {
      result.maxActiveOwners = Number(argv[index + 1]);
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
    if (arg === "--watch-history-output" && argv[index + 1]) {
      result.watchHistoryOutputPath = String(argv[index + 1]).trim();
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
Lime Agent QC GUI Owner Check

用法:
  npm run agent-qc:gui-owner-check
  npm run agent-qc:gui-owner-check -- --check
  node scripts/agent-qc-gui-owner-check.mjs --format json --output ./.lime/qc/gui-owner-current.json

选项:
  --manifest PATH            scenario manifest，默认 internal/test/agent-qc-scenarios.manifest.json
  --status-dir PATH          qcloop status sidecar 目录，默认 .lime/qc
  --max-active-owners N      允许的 active GUI owner 数，默认 0
  --format FMT               summary | json
  --output PATH              写入文件；默认 stdout
  --watch-history-output PATH 追加 JSONL 观察记录
  --check                    active owner 超过上限时非 0 退出
  -h, --help                 显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function readQcloopStatusSidecars(statusDir) {
  const resolvedDir = path.resolve(process.cwd(), statusDir);
  if (!fs.existsSync(resolvedDir)) {
    return [];
  }
  return fs
    .readdirSync(resolvedDir)
    .filter((fileName) => /^qcloop-status\..+\.json$/.test(fileName))
    .sort()
    .map((fileName) => {
      const relativePath = path.posix.join(statusDir, fileName);
      try {
        return { path: relativePath, status: readJsonFile(relativePath) };
      } catch {
        return { path: relativePath, status: { job: { id: relativePath, status: "invalid-json" }, items: [] } };
      }
    });
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

function appendJsonLine(outputPath, entry) {
  if (!outputPath) {
    return;
  }
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.appendFileSync(resolvedOutputPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = createAgentQcGuiOwnerReport({
    manifest: readJsonFile(options.manifestPath),
    statusSidecars: readQcloopStatusSidecars(options.statusDir),
    maxActiveOwners: options.maxActiveOwners,
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderAgentQcGuiOwnerSummary(report);
  writeOutput(options.outputPath, content);
  appendJsonLine(options.watchHistoryOutputPath, createAgentQcGuiOwnerWatchEntry(report));

  if (options.check && report.verdict.status !== "pass") {
    process.exit(1);
  }
}

main();
