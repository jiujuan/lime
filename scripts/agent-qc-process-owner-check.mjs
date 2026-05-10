#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const GUI_OWNER_PATTERNS = [
  "verify:gui-smoke",
  "smoke:workspace-ready",
  "smoke:browser-runtime",
  "smoke:site-adapters",
  "smoke:agent-service-skill-entry",
  "smoke:agent-runtime-tool-surface",
  "smoke:knowledge-gui",
  "smoke:design-canvas",
  "claw-chat-ready-streaming",
  "browser-runtime-site-adapter",
  "workspace-ready-session-restore",
  "release-package-startup-smoke",
];

const CARGO_OWNER_PATTERNS = [
  "cargo ",
  "cargo-fmt",
  "rustc ",
  "clippy-driver",
  "tauri dev",
];

const QCLOOP_OWNER_PATTERNS = [
  "qcloop --db",
  "./qcloop --db",
  "qcloop serve",
  "qcloop-worker",
  "qcloop_worker_result",
  "agent qc p0",
  "只读执行 lime agent qc p0",
];

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
  node scripts/agent-qc-process-owner-check.mjs --format json --output ./.lime/qc/gui-process-owner-current.json --markdown-output ./.lime/qc/gui-process-owner-current.md

选项:
  --format FMT                summary | json，默认 summary
  --output PATH               写入 JSON 或 summary；默认 stdout
  --markdown-output PATH      额外写入 Markdown 摘要
  --max-active-gui-smoke N    允许的 GUI smoke / deep flow owner 数，默认 0
  --max-cargo-or-rust N       允许的 Cargo / Rust 构建进程数，默认 0
  --max-qcloop-related N      允许的 qcloop 相关进程数，默认 0
  --check                     owner 超过上限时非 0 退出
  -h, --help                  显示帮助
`);
}

function parseUnixPsLine(line) {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    stat: match[4],
    etime: match[5],
    command: sanitizeProcessCommand(match[6].trim()),
  };
}

function collectUnixProcesses() {
  const output = execFileSync("ps", ["-axo", "pid,ppid,pgid,stat,etime,command"], {
    encoding: "utf8",
  });
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
      command: sanitizeProcessCommand(String(entry?.CommandLine || "").trim()),
    }))
    .filter((entry) => entry.pid > 0 && entry.pid !== process.pid && entry.command.length > 0);
}

function sanitizeProcessCommand(command) {
  return String(command || "")
    .replace(/(--api-key(?:=|\s+))(?:"[^"]+"|'[^']+'|\S+)/gi, "$1<redacted>")
    .replace(/(api[_-]?key(?:=|:|\s+))(?:"[^"]+"|'[^']+'|\S+)/gi, "$1<redacted>")
    .replace(/ctx7sk-[A-Za-z0-9-]+/g, "ctx7sk-***")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***");
}

function collectProcesses() {
  return process.platform === "win32" ? collectWindowsProcesses() : collectUnixProcesses();
}

function commandHasAny(command, patterns) {
  const normalized = String(command || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function uniqueByPid(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (seen.has(entry.pid)) {
      continue;
    }
    seen.add(entry.pid);
    result.push(entry);
  }
  return result.sort((left, right) => left.pid - right.pid);
}

function createReport({
  generatedAt = new Date().toISOString(),
  maxActiveGuiSmoke = 0,
  maxCargoOrRust = 0,
  maxQcloopRelated = 0,
} = {}) {
  const processes = collectProcesses();
  const activeGuiSmokeProcesses = uniqueByPid(
    processes.filter((entry) => commandHasAny(entry.command, GUI_OWNER_PATTERNS)),
  );
  const qcloopProcesses = uniqueByPid(
    processes.filter((entry) => commandHasAny(entry.command, QCLOOP_OWNER_PATTERNS)),
  );
  const cargoProcesses = uniqueByPid(
    processes.filter((entry) => commandHasAny(entry.command, CARGO_OWNER_PATTERNS)),
  );

  const counts = {
    activeGuiSmoke: activeGuiSmokeProcesses.length,
    cargoOrRust: cargoProcesses.length,
    qcloopRelated: qcloopProcesses.length,
  };
  const busy =
    counts.activeGuiSmoke > maxActiveGuiSmoke ||
    counts.cargoOrRust > maxCargoOrRust ||
    counts.qcloopRelated > maxQcloopRelated;

  return {
    schemaVersion: "v1",
    generatedAt,
    platform: process.platform,
    maxActiveGuiSmoke,
    maxCargoOrRust,
    maxQcloopRelated,
    verdict: {
      status: busy ? "busy" : "pass",
      summary: `activeGuiSmoke=${counts.activeGuiSmoke}, cargoOrRust=${counts.cargoOrRust}, qcloopRelated=${counts.qcloopRelated}`,
      nextAction: busy
        ? "Do not start full verify:local or another GUI P0 batch while these owners are active; continue read-only observation or wait for natural completion."
        : "No active raw GUI smoke, Cargo/Rust, or qcloop owner was observed; heavy gates may run if qcloop GUI owner and release evidence gates are also clear.",
    },
    activeGuiSmokeProcesses,
    qcloopProcesses,
    cargoProcesses,
    guardrails: [
      "best-effort process snapshot only",
      "do not kill or restart listed processes from this sidecar",
      "use this sidecar to decide whether heavy GUI or verify gates should wait",
    ],
  };
}

function renderSummary(report) {
  const lines = [
    `status=${report.verdict.status}`,
    `summary=${report.verdict.summary}`,
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
    "",
    "## Active GUI smoke / deep flow processes",
    "",
  ];
  appendProcessList(lines, report.activeGuiSmokeProcesses);
  lines.push("", "## qcloop related processes", "");
  appendProcessList(lines, report.qcloopProcesses);
  lines.push("", "## Cargo / Rust processes", "");
  appendProcessList(lines, report.cargoProcesses);
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

  if (options.check && report.verdict.status !== "pass") {
    process.exit(1);
  }
}

main();
