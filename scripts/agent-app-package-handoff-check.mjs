#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createAgentAppPackageHandoffReport } from "./lib/agent-app-package-handoff-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "summary",
    help: false,
    packageDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--package-dir" || arg === "--package") && argv[index + 1]) {
      result.packageDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
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
Agent App Package Handoff Check

用法:
  node scripts/agent-app-package-handoff-check.mjs --package-dir <agent-app-package>
  node scripts/agent-app-package-handoff-check.mjs --package-dir <agent-app-package> --format json
  node scripts/agent-app-package-handoff-check.mjs --package-dir <agent-app-package> --check

选项:
  --package-dir PATH  要只读检查的 Agent App package 根目录。
  --format FMT        summary | json，默认 summary。
  --check             若 package 仍 blocked / needs_handoff，则以非 0 退出。
  -h, --help          显示帮助。
`);
}

function readFileIfExists(filePath) {
  try {
    return {
      exists: fs.existsSync(filePath),
      content: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "",
    };
  } catch {
    return {
      exists: false,
      content: "",
    };
  }
}

function collectGitStatusShort(packageDir) {
  try {
    return execFileSync("git", ["-C", packageDir, "status", "--short"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = [];
  for (const name of fs.readdirSync(rootDir)) {
    const filePath = path.join(rootDir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      entries.push(...walkFiles(filePath));
      continue;
    }
    if (stat.isFile()) {
      entries.push(filePath);
    }
  }
  return entries;
}

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 12);
}

function collectDistArtifacts(packageDir) {
  const entries = [];
  const pairs = [
    ["src/ui", "dist/ui"],
    ["src/core", "dist/core"],
    ["src/integrations", "dist/integrations"],
  ];

  for (const [srcRootRelative, distRootRelative] of pairs) {
    const srcRoot = path.join(packageDir, srcRootRelative);
    const distRoot = path.join(packageDir, distRootRelative);
    for (const srcPath of walkFiles(srcRoot)) {
      const relativePath = path.relative(srcRoot, srcPath);
      const distPath = path.join(distRoot, relativePath);
      if (!fs.existsSync(distPath)) {
        entries.push({
          status: "missing-dist",
          src: path.relative(packageDir, srcPath),
          dist: path.relative(packageDir, distPath),
          srcHash: fileHash(srcPath),
          distHash: "",
        });
        continue;
      }
      const srcHash = fileHash(srcPath);
      const distHash = fileHash(distPath);
      entries.push({
        status: srcHash === distHash ? "same" : "diff",
        src: path.relative(packageDir, srcPath),
        dist: path.relative(packageDir, distPath),
        srcHash,
        distHash,
      });
    }

    for (const distPath of walkFiles(distRoot)) {
      const relativePath = path.relative(distRoot, distPath);
      const srcPath = path.join(srcRoot, relativePath);
      if (!fs.existsSync(srcPath)) {
        entries.push({
          status: "extra-dist",
          src: path.relative(packageDir, srcPath),
          dist: path.relative(packageDir, distPath),
          srcHash: "",
          distHash: fileHash(distPath),
        });
      }
    }
  }

  const workerSrc = path.join(packageDir, "src", "worker", "index.mjs");
  const workerDist = path.join(packageDir, "dist", "worker", "index.mjs");
  if (fs.existsSync(workerSrc)) {
    if (!fs.existsSync(workerDist)) {
      entries.push({
        status: "missing-dist",
        src: path.relative(packageDir, workerSrc),
        dist: path.relative(packageDir, workerDist),
        srcHash: fileHash(workerSrc),
        distHash: "",
      });
    } else {
      const srcHash = fileHash(workerSrc);
      const distHash = fileHash(workerDist);
      entries.push({
        status: srcHash === distHash ? "same" : "diff",
        src: path.relative(packageDir, workerSrc),
        dist: path.relative(packageDir, workerDist),
        srcHash,
        distHash,
      });
    }
  }

  return entries;
}

function collectRuntimeFiles(packageDir) {
  const entries = [];
  const roots = ["src", "dist"];
  const extensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
  for (const root of roots) {
    const absoluteRoot = path.join(packageDir, root);
    for (const filePath of walkFiles(absoluteRoot)) {
      if (!extensions.has(path.extname(filePath))) {
        continue;
      }
      entries.push({
        path: path.relative(packageDir, filePath),
        content: fs.readFileSync(filePath, "utf8"),
      });
    }
  }
  return entries;
}

function createReport(packageDir) {
  const resolvedPackageDir = path.resolve(packageDir);
  const hostBridgePath = path.join(resolvedPackageDir, "src", "ui", "host-bridge.js");
  const uiTestPath = path.join(resolvedPackageDir, "tests", "ui.test.mjs");
  const packageJsonPath = path.join(resolvedPackageDir, "package.json");
  const buildScriptPath = path.join(resolvedPackageDir, "scripts", "build.mjs");
  const packageJson = readFileIfExists(packageJsonPath);

  return createAgentAppPackageHandoffReport({
    packageDir: resolvedPackageDir,
    gitStatusShort: collectGitStatusShort(resolvedPackageDir),
    files: {
      hostBridge: readFileIfExists(hostBridgePath),
      uiTest: readFileIfExists(uiTestPath),
      buildScript: readFileIfExists(buildScriptPath),
      distArtifacts: collectDistArtifacts(resolvedPackageDir),
      runtimeFiles: collectRuntimeFiles(resolvedPackageDir),
    },
    packageJsonText: packageJson.content,
  });
}

function renderMarkerSummary(markers) {
  if (!markers.length) {
    return "none";
  }
  return markers.map((entry) => `${entry.marker}:${entry.count}`).join(", ");
}

function renderSummary(report) {
  const bypassSummary = report.agentRuntimeBypass.matches
    .slice(0, 8)
    .map((entry) => `${entry.file}:${entry.marker}:${entry.count}`)
    .join(",");
  const lines = [
    `status=${report.verdict.status}`,
    `packageDir=${report.packageDir}`,
    `dirty=tracked:${report.gitStatus.trackedCount},untracked:${report.gitStatus.untrackedCount},total:${report.gitStatus.totalCount}`,
    `hostBridgePrivate=${renderMarkerSummary(report.files.hostBridge.privateMarkers)}`,
    `hostBridgeSdk=${renderMarkerSummary(report.files.hostBridge.sdkMarkers)}`,
    `uiTestPrivate=${renderMarkerSummary(report.files.uiTest.privateMarkers)}`,
    `agentRuntimeBypass=${bypassSummary || "none"}`,
    `highRiskScripts=${report.scripts.highRisk.map((entry) => entry.name).join(",") || "none"}`,
    `distArtifacts=diff:${report.distArtifacts.diffCount},missing:${report.distArtifacts.missingDistCount},extra:${report.distArtifacts.extraDistCount},total:${report.distArtifacts.totalDeltas}`,
    `blockers=${report.verdict.blockers.join(" | ") || "none"}`,
    `warnings=${report.verdict.warnings.join(" | ") || "none"}`,
    `nextAction=${report.verdict.nextAction}`,
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.packageDir) {
    console.error("缺少 --package-dir PATH。");
    printHelp();
    process.exitCode = 2;
    return;
  }

  const report = createReport(args.packageDir);
  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(renderSummary(report));
  }

  if (args.check && report.verdict.status !== "ready") {
    process.exitCode = 1;
  }
}

main();
