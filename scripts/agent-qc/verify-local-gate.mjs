#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildAgentQcLocalVerifyGateReport,
  renderAgentQcLocalVerifyGateMarkdown,
} from "../lib/agent-qc-local-verify-gate-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    commandArgs: [],
    help: false,
    markdownOutputPath: ".lime/qc/verify-local-current.md",
    outputPath: ".lime/qc/verify-local-current.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      result.commandArgs = argv.slice(index + 1);
      break;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--markdown-output" && argv[index + 1]) {
      result.markdownOutputPath = String(argv[index + 1]).trim();
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
Lime Agent QC Local Verify Gate

用法:
  npm run agent-qc:verify-local-gate -- --check
  node scripts/agent-qc/verify-local-gate.mjs --output ./.lime/qc/verify-local-current.json --check
  node scripts/agent-qc/verify-local-gate.mjs -- -- npm run verify:local

选项:
  --output PATH           JSON sidecar，默认 .lime/qc/verify-local-current.json
  --markdown-output PATH  Markdown sidecar，默认 .lime/qc/verify-local-current.md
  --check                 verify:local 未通过时非 0 退出
  --                      覆盖要执行的命令；默认 npm run verify:local
  -h, --help              显示帮助
`);
}

function resolveCommand(commandArgs) {
  if (commandArgs.length > 0) {
    return {
      command: commandArgs[0],
      args: commandArgs.slice(1),
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "verify:local"],
  };
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function writeText(filePath, content) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, content, "utf8");
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      resolve({
        exitCode: null,
        signal: null,
        error,
      });
    });
    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        error: null,
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { command, args } = resolveCommand(options.commandArgs);
  const startedAt = new Date();
  const runResult = await runCommand(command, args);
  const completedAt = new Date();
  const report = buildAgentQcLocalVerifyGateReport({
    command: commandLabel(command, args),
    cwd: process.cwd(),
    exitCode: runResult.exitCode,
    signal: runResult.signal,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
  });

  if (runResult.error) {
    report.failedStage = runResult.error.message;
  }

  writeText(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeText(options.markdownOutputPath, renderAgentQcLocalVerifyGateMarkdown(report));

  if (options.check && report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[agent-qc:verify-local-gate] ${error.message}`);
  process.exitCode = 1;
});
