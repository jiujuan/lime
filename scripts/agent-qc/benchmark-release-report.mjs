#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_VERSION = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const result = {
    baselinePath: "",
    check: false,
    comparePath: "",
    format: "markdown",
    help: false,
    outputPath: "",
    releaseGate: false,
    releaseRoot: "",
    runPath: "",
    summaryPath: "",
    version: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline" && argv[index + 1]) {
      result.baselinePath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--compare" && argv[index + 1]) {
      result.comparePath = String(argv[index + 1]).trim();
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
    if (arg === "--release-gate") {
      result.releaseGate = true;
      continue;
    }
    if (arg === "--release-root" && argv[index + 1]) {
      result.releaseRoot = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--run" && argv[index + 1]) {
      result.runPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--summary" && argv[index + 1]) {
      result.summaryPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--version" && argv[index + 1]) {
      result.version = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  if (!["json", "markdown"].includes(result.format)) {
    throw new Error("--format 只支持 json 或 markdown");
  }
  return result;
}

function printHelp() {
  console.log(`
Benchmark Release Report

用法:
  npm run agent-qc:benchmark-release:report -- --version 1.97.0 --output .lime/benchmark/releases/1.97.0/benchmark-release-report.md --check
  npm run agent-qc:benchmark-release:report -- --release-root .lime/benchmark/runs/2026-07-10-checklist-run-sync --format json

选项:
  --version VALUE       release 版本；默认从 run report 推导，无法推导时使用 ${DEFAULT_VERSION}
  --release-root PATH   release evidence 根目录，默认 .lime/benchmark/releases/<version>
  --run PATH            benchmark-release-run.json，默认 release-root 下同名文件
  --summary PATH        benchmark-release-summary.json，默认 release-root 下同名文件
  --compare PATH        benchmark-release-compare.json，默认 release-root 下同名文件；不存在时记 missing
  --baseline PATH       benchmark-baseline.json，默认 release-root 下同名文件；不存在时记 missing
  --format FMT          输出格式：markdown | json
  --output PATH         写入文件；默认 stdout
  --check               run / summary 缺失或 report 结构无效时非 0
  --release-gate        同时要求 report decision=pass；正式 release 审计使用
  -h, --help            显示帮助
`);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function releaseRootForVersion(version, releaseRoot = "") {
  return normalizePath(releaseRoot || `.lime/benchmark/releases/${version || DEFAULT_VERSION}`);
}

function defaultArtifactPath(root, fileName) {
  return normalizePath(path.join(root, fileName));
}

function readOptionalJson(rootDir, filePath, required) {
  const resolvedPath = path.resolve(rootDir, filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: normalizePath(filePath),
      exists: false,
      required,
      payload: null,
      error: "",
    };
  }
  try {
    return {
      path: normalizePath(filePath),
      exists: true,
      required,
      payload: JSON.parse(fs.readFileSync(resolvedPath, "utf8")),
      error: "",
    };
  } catch (error) {
    return {
      path: normalizePath(filePath),
      exists: true,
      required,
      payload: null,
      error: error.message,
    };
  }
}

function flattenBlockers(summary) {
  const blockers = [];
  for (const blocker of summary.releaseBlockers || []) {
    blockers.push({ kind: "release", label: String(blocker) });
  }
  for (const blocker of summary.p0GateBlockers || []) {
    blockers.push({
      kind: "p0_gate",
      label: `${blocker.suiteId}: ${blocker.id}${blocker.command ? ` ${blocker.command}` : ""} (${blocker.reason})`,
    });
  }
  for (const blocker of summary.preflightBlockers || []) {
    blockers.push({
      kind: "preflight",
      label: `${blocker.suiteId}/${blocker.taskId}: ${blocker.id} (${blocker.reason})`,
    });
  }
  for (const blocker of summary.trueRunBlockers || []) {
    blockers.push({
      kind: "true_run",
      label: `${blocker.suiteId}${blocker.taskId ? `/${blocker.taskId}` : ""}: ${blocker.id} (${blocker.reason})`,
    });
  }
  for (const blocker of summary.trueRunEvidenceBlockers || []) {
    blockers.push({
      kind: "true_run_evidence",
      label: `${blocker.suiteId}${blocker.taskId ? `/${blocker.taskId}` : ""}: ${blocker.id} (${blocker.reason})`,
    });
  }
  return blockers;
}

function releaseDecision({ run, summary, compare, baseline, issues }) {
  if (issues.length > 0) {
    return "invalid";
  }
  if (!run.exists || !summary.exists) {
    return "incomplete";
  }
  if (summary.payload?.releaseReady !== true) {
    return "blocked";
  }
  if (!compare.exists) {
    return "needs_compare";
  }
  if (compare.payload?.summary?.decision !== "pass") {
    return "blocked";
  }
  if (baseline.exists && baseline.payload?.baselineReady !== true) {
    return "blocked";
  }
  return "pass";
}

function artifactInfo(artifact) {
  return {
    path: artifact.path,
    exists: artifact.exists,
    required: artifact.required,
    status: artifactStatus(artifact),
    schemaVersion: artifact.payload?.schemaVersion || "",
    error: artifact.error,
  };
}

function buildBenchmarkReleaseReport({
  rootDir = process.cwd(),
  version = "",
  releaseRoot = "",
  runPath = "",
  summaryPath = "",
  comparePath = "",
  baselinePath = "",
} = {}) {
  const root = releaseRootForVersion(version, releaseRoot);
  const run = readOptionalJson(rootDir, runPath || defaultArtifactPath(root, "benchmark-release-run.json"), true);
  const summary = readOptionalJson(rootDir, summaryPath || defaultArtifactPath(root, "benchmark-release-summary.json"), true);
  const compare = readOptionalJson(rootDir, comparePath || defaultArtifactPath(root, "benchmark-release-compare.json"), false);
  const baseline = readOptionalJson(rootDir, baselinePath || defaultArtifactPath(root, "benchmark-baseline.json"), false);
  const issues = [];
  const reportVersion =
    version || run.payload?.plan?.version || summary.payload?.version || DEFAULT_VERSION;

  for (const artifact of [run, summary, compare, baseline]) {
    if (artifact.required && !artifact.exists) {
      issues.push(`${artifact.path}: required artifact missing`);
    }
    if (artifact.error) {
      issues.push(`${artifact.path}: JSON 读取失败：${artifact.error}`);
    }
  }
  if (run.payload && run.payload.schemaVersion !== "benchmark-release-run-v1") {
    issues.push(`${run.path}: schemaVersion 不是 benchmark-release-run-v1`);
  }
  if (summary.payload && summary.payload.schemaVersion !== "benchmark-release-summary-v1") {
    issues.push(`${summary.path}: schemaVersion 不是 benchmark-release-summary-v1`);
  }

  const blockers = summary.payload ? flattenBlockers(summary.payload) : [];
  const decision = releaseDecision({ run, summary, compare, baseline, issues });
  return {
    schemaVersion: "benchmark-release-report-v1",
    generatedAt: new Date().toISOString(),
    version: reportVersion,
    releaseRoot: root,
    decision,
    releaseReady: summary.payload?.releaseReady === true,
    artifacts: {
      run: artifactInfo(run),
      summary: artifactInfo(summary),
      compare: artifactInfo(compare),
      baseline: artifactInfo(baseline),
    },
    summary: {
      runValid: run.payload?.summary?.valid ?? null,
      runStepCount: run.payload?.summary?.stepCount ?? null,
      runPassedStepCount: run.payload?.summary?.passedStepCount ?? null,
      runFailedStepCount: run.payload?.summary?.failedStepCount ?? null,
      runSkippedStepCount: run.payload?.summary?.skippedStepCount ?? null,
      evidenceFileCount: summary.payload?.summary?.evidenceFileCount ?? null,
      p0GateBlockerCount: summary.payload?.summary?.p0GateBlockerCount ?? null,
      releaseBlockerCount: summary.payload?.summary?.releaseBlockerCount ?? null,
      preflightBlockerCount: summary.payload?.summary?.preflightBlockerCount ?? null,
      trueRunBlockerCount: summary.payload?.summary?.trueRunBlockerCount ?? null,
      trueRunEvidenceBlockerCount: summary.payload?.summary?.trueRunEvidenceBlockerCount ?? null,
      compareDecision: compare.payload?.summary?.decision || "missing",
      baselineReady: baseline.exists ? baseline.payload?.baselineReady === true : null,
    },
    blockers,
    issues,
  };
}

function validateBenchmarkReleaseReport(report) {
  const issues = [...(report.issues || [])];
  if (report.schemaVersion !== "benchmark-release-report-v1") {
    issues.push("schemaVersion 必须是 benchmark-release-report-v1");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

function artifactStatus(artifact) {
  if (artifact.error) {
    return "invalid";
  }
  if (!artifact.exists) {
    return artifact.required ? "missing" : "optional-missing";
  }
  return "present";
}

function renderMarkdown(report) {
  const lines = [
    "# Benchmark Release Report",
    "",
    `- version: ${report.version}`,
    `- releaseRoot: ${report.releaseRoot}`,
    `- decision: ${report.decision}`,
    `- releaseReady: ${report.releaseReady ? "yes" : "no"}`,
    `- run steps: ${report.summary.runPassedStepCount ?? "-"} passed / ${report.summary.runFailedStepCount ?? "-"} failed / ${report.summary.runSkippedStepCount ?? "-"} skipped`,
    `- compareDecision: ${report.summary.compareDecision}`,
    `- baselineReady: ${report.summary.baselineReady === null ? "missing" : report.summary.baselineReady ? "yes" : "no"}`,
    "",
    "## Artifacts",
    "",
    "| Artifact | Status | Path |",
    "| --- | --- | --- |",
  ];

  for (const [name, artifact] of Object.entries(report.artifacts)) {
    lines.push(`| ${name} | ${artifactStatus(artifact)} | ${artifact.path} |`);
  }

  lines.push("", "## Blockers", "");
  if (report.blockers.length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of report.blockers.slice(0, 30)) {
      lines.push(`- ${blocker.kind}: ${blocker.label}`);
    }
    if (report.blockers.length > 30) {
      lines.push(`- ... ${report.blockers.length - 30} more blockers`);
    }
  }

  if (report.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of report.issues) {
      lines.push(`- ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
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
  const report = buildBenchmarkReleaseReport({
    version: options.version,
    releaseRoot: options.releaseRoot,
    runPath: options.runPath,
    summaryPath: options.summaryPath,
    comparePath: options.comparePath,
    baselinePath: options.baselinePath,
  });
  const validation = validateBenchmarkReleaseReport(report);
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...report, validation }, null, 2)}\n`
      : renderMarkdown(report);
  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[benchmark-release-report] ${issue}`);
    }
    process.exit(1);
  }
  if (options.releaseGate && report.decision !== "pass") {
    console.error(`[benchmark-release-report] decision=${report.decision}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseReport,
  renderMarkdown,
  validateBenchmarkReleaseReport,
};
