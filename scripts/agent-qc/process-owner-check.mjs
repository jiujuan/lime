#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createAgentQcProcessOwnerReport,
  parseEtimeSeconds,
  sanitizeProcessCommand,
} from "../lib/agent-qc-process-owner-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "summary",
    help: false,
    markdownOutputPath: "",
    maxActiveGuiSmoke: 0,
    maxCargoOrRust: 0,
    maxQcloopRelated: 0,
    outputPath: "",
    staleMinutes: 30,
    watchHistoryOutputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (arg === "--markdown-output" && argv[index + 1]) {
      result.markdownOutputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--watch-history-output" && argv[index + 1]) {
      result.watchHistoryOutputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--max-active-gui-smoke" && argv[index + 1]) {
      result.maxActiveGuiSmoke = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--max-cargo-or-rust" && argv[index + 1]) {
      result.maxCargoOrRust = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--max-qcloop-related" && argv[index + 1]) {
      result.maxQcloopRelated = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--stale-minutes" && argv[index + 1]) {
      result.staleMinutes = Number(argv[index + 1]);
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
Lime Agent QC Process Owner Check

用法:
  npm run agent-qc:process-owner-check
  node scripts/agent-qc/process-owner-check.mjs --format json --output ./.lime/qc/gui-process-owner-current.json --markdown-output ./.lime/qc/gui-process-owner-current.md

选项:
  --format FMT                summary | json，默认 summary
  --output PATH               写入 JSON 或 summary；默认 stdout
  --markdown-output PATH      额外写入 Markdown 摘要
  --watch-history-output PATH 追加写入 JSONL 观察历史
  --max-active-gui-smoke N    允许的 GUI smoke / deep flow owner 数，默认 0
  --max-cargo-or-rust N       允许的 Cargo / Rust 构建进程数，默认 0
  --max-qcloop-related N      允许的 qcloop 相关进程数，默认 0
  --stale-minutes N           标记 active GUI owner stale 的分钟数，默认 30
  --check                     owner 超过上限时非 0 退出
  -h, --help                  显示帮助
`);
}

function parseUnixPsLine(line) {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  const etime = match[5];
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    stat: match[4],
    etime,
    durationSeconds: parseEtimeSeconds(etime),
    command: sanitizeProcessCommand(match[6].trim()),
  };
}

function collectUnixProcesses() {
  const output = execFileSync(
    "ps",
    ["-axo", "pid,ppid,pgid,stat,etime,command"],
    {
      encoding: "utf8",
    },
  );
  return output
    .split(/\r?\n/)
    .slice(1)
    .map(parseUnixPsLine)
    .filter(Boolean)
    .filter((entry) => entry.pid !== process.pid && entry.command.length > 0);
}

function collectWindowsProcesses() {
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8" },
  ).trim();
  const parsed = output ? JSON.parse(output) : [];
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map((entry) => ({
      pid: Number(entry?.ProcessId || 0),
      ppid: Number(entry?.ParentProcessId || 0),
      pgid: null,
      stat: "unknown",
      etime: "unknown",
      durationSeconds: null,
      command: sanitizeProcessCommand(String(entry?.CommandLine || "").trim()),
    }))
    .filter(
      (entry) =>
        entry.pid > 0 && entry.pid !== process.pid && entry.command.length > 0,
    );
}

function collectProcesses() {
  return process.platform === "win32"
    ? collectWindowsProcesses()
    : collectUnixProcesses();
}

function createReport(options = {}) {
  return createAgentQcProcessOwnerReport(collectProcesses(), {
    ...options,
    platform: process.platform,
  });
}

function renderSummary(report) {
  const lines = [
    `status=${report.verdict.status}`,
    `summary=${report.verdict.summary}`,
    `ownerIntervention=${report.ownerIntervention.status}`,
    `generatedAt=${report.generatedAt}`,
    `platform=${report.platform}`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(report) {
  const lines = [
    "# Agent QC raw process owner snapshot",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.verdict.status}`,
    `- Summary: ${report.verdict.summary}`,
    `- Next action: ${report.verdict.nextAction}`,
    `- Owner intervention: ${report.ownerIntervention.status}`,
    "",
    "## Active GUI smoke / deep flow processes",
    "",
  ];
  appendProcessList(lines, report.activeGuiSmokeProcesses);
  lines.push("", "## Stale active GUI smoke candidates", "");
  appendProcessList(lines, report.staleActiveGuiSmokeProcesses);
  lines.push("", "## qcloop related processes", "");
  appendProcessList(lines, report.qcloopProcesses);
  lines.push("", "## Cargo / Rust processes", "");
  appendProcessList(lines, report.cargoProcesses);
  lines.push("", "## Passive qcloop serve processes", "");
  appendProcessList(lines, report.passiveQcloopServerProcesses);
  lines.push("", "## Passive Electron dev runtime processes", "");
  appendProcessList(lines, report.passiveElectronRuntimeProcesses);
  lines.push("", "## Passive desktop runtime processes", "");
  appendProcessList(lines, report.passiveDesktopRuntimeProcesses);
  lines.push("", "## Observer processes", "");
  appendProcessList(lines, report.observerProcesses);
  if (report.ownerIntervention.status === "requires_owner_confirmation") {
    lines.push(
      "",
      "## Owner intervention",
      "",
      `- Required confirmation: ${report.ownerIntervention.requiredConfirmationText}`,
      `- Next action: ${report.ownerIntervention.nextAction}`,
      "- Prohibited until confirmed:",
    );
    for (const item of report.ownerIntervention.prohibitedUntilConfirmed) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push("", "## Guardrails", "");
  for (const guardrail of report.guardrails) {
    lines.push(`- ${guardrail}`);
  }
  return `${lines.join("\n")}\n`;
}

function appendProcessList(lines, entries) {
  if (!entries?.length) {
    lines.push("- none");
    return;
  }
  for (const entry of entries) {
    lines.push(
      `- pid=${entry.pid} ppid=${entry.ppid} pgid=${entry.pgid} stat=${entry.stat} etime=${entry.etime} command=${entry.command}`,
    );
  }
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

function createWatchHistoryEntry(report) {
  return {
    schemaVersion: "v1",
    generatedAt: report.generatedAt,
    verdictStatus: report.verdict.status,
    summary: report.verdict.summary,
    ownerInterventionStatus: report.ownerIntervention.status,
    ownerInterventionProcessIds: report.ownerIntervention.processIds,
    activeGuiSmokeCount: report.activeGuiSmokeProcesses.length,
    staleActiveGuiSmokeCount: report.staleActiveGuiSmokeProcesses.length,
    qcloopRelatedCount: report.qcloopProcesses.length,
    cargoOrRustCount: report.cargoProcesses.length,
    passiveQcloopServerCount: report.passiveQcloopServerProcesses.length,
    passiveElectronRuntimeCount: report.passiveElectronRuntimeProcesses.length,
    passiveDesktopRuntimeCount: report.passiveDesktopRuntimeProcesses.length,
    observerCount: report.observerProcesses.length,
    activeGuiSmokeProcesses: report.activeGuiSmokeProcesses.map((entry) => ({
      pid: entry.pid,
      ppid: entry.ppid,
      pgid: entry.pgid,
      stat: entry.stat,
      etime: entry.etime,
      durationSeconds: entry.durationSeconds,
      command: entry.command,
    })),
  };
}

function appendWatchHistory(outputPath, report) {
  if (!outputPath) {
    return;
  }
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.appendFileSync(
    resolvedOutputPath,
    `${JSON.stringify(createWatchHistoryEntry(report))}\n`,
    "utf8",
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = createReport(options);
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderSummary(report);
  writeOutput(options.outputPath, content);
  if (options.markdownOutputPath) {
    writeOutput(options.markdownOutputPath, renderMarkdown(report));
  }
  appendWatchHistory(options.watchHistoryOutputPath, report);

  if (options.check && report.verdict.status !== "pass") {
    process.exit(1);
  }
}

main();
