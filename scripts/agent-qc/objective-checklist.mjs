#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildAgentQcObjectiveChecklist,
  buildMissingAuditAgentQcObjectiveChecklist,
  renderAgentQcObjectiveChecklistMarkdown,
} from "../lib/agent-qc-objective-checklist-core.mjs";

function parseArgs(argv) {
  const result = {
    auditPath: ".lime/qc/objective-completion-audit-current.json",
    processOwnerPath: ".lime/qc/gui-process-owner-current.json",
    guiOwnerPath: ".lime/qc/gui-owner-current.json",
    format: "markdown",
    outputPath: "",
    check: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--audit" && argv[index + 1]) {
      result.auditPath = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--process-owner" && argv[index + 1]) {
      result.processOwnerPath = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--gui-owner" && argv[index + 1]) {
      result.guiOwnerPath = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]);
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
Lime Agent QC Objective Checklist

用法:
  npm run agent-qc:objective-checklist -- --format json --output ./.lime/qc/objective-completion-checklist-current.json
  node scripts/agent-qc/objective-checklist.mjs --check

选项:
  --audit PATH          completion audit JSON，默认 .lime/qc/objective-completion-audit-current.json
  --process-owner PATH  raw process owner JSON，默认 .lime/qc/gui-process-owner-current.json
  --gui-owner PATH      GUI owner JSON，默认 .lime/qc/gui-owner-current.json
  --format FMT          markdown | json，默认 markdown
  --output PATH         写入文件；默认 stdout
  --check               checklist 未 complete 时非 0 退出
  -h, --help            显示帮助
`);
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"),
  );
}

function readJsonResult(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, reason: "missing", value: null, error: "" };
  }
  try {
    return { ok: true, reason: "", value: readJson(filePath), error: "" };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-json",
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function fallbackProcessOwner(readResult, filePath) {
  if (readResult.ok) {
    return readResult.value;
  }
  return {
    verdict: {
      status: "missing",
      summary: `缺少 raw process owner sidecar：${filePath}`,
    },
    ownerIntervention: { status: "missing" },
  };
}

function fallbackGuiOwner(readResult, filePath) {
  if (readResult.ok) {
    return readResult.value;
  }
  return {
    verdict: {
      status: "missing",
      summary: `缺少 GUI owner sidecar：${filePath}`,
    },
  };
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
  const auditReadResult = readJsonResult(options.auditPath);
  const processOwnerReadResult = readJsonResult(options.processOwnerPath);
  const guiOwnerReadResult = readJsonResult(options.guiOwnerPath);
  const result = auditReadResult.ok
    ? buildAgentQcObjectiveChecklist({
        audit: auditReadResult.value,
        processOwner: fallbackProcessOwner(
          processOwnerReadResult,
          options.processOwnerPath,
        ),
        guiOwner: fallbackGuiOwner(guiOwnerReadResult, options.guiOwnerPath),
      })
    : buildMissingAuditAgentQcObjectiveChecklist({
        auditPath: options.auditPath,
        reason: auditReadResult.reason,
        detail: auditReadResult.error,
      });
  const content =
    options.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : renderAgentQcObjectiveChecklistMarkdown(result);
  writeOutput(options.outputPath, content);
  if (options.check && result.status !== "complete") {
    process.exit(1);
  }
}

main();
