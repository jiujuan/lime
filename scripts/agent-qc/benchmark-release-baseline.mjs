#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_VERSION = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const result = {
    allowNotReady: false,
    check: false,
    comparePath: "",
    format: "json",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    requireCompare: false,
    summaryPath: "",
    version: DEFAULT_VERSION,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-not-ready") {
      result.allowNotReady = true;
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
    if (arg === "--manifest" && argv[index + 1]) {
      result.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--require-compare") {
      result.requireCompare = true;
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
Lime Benchmark Release Baseline

用法:
  npm run agent-qc:benchmark-release:baseline -- --version 1.97.0 --require-compare --check
  npm run agent-qc:benchmark-release:baseline -- --version 1.97.0 --summary .lime/benchmark/releases/1.97.0/benchmark-release-summary.json --check

选项:
  --manifest PATH       release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --version VALUE       要登记为 baseline 的版本，默认 ${DEFAULT_VERSION}
  --summary PATH        benchmark-release-summary.json，默认 .lime/benchmark/releases/<version>/benchmark-release-summary.json
  --compare PATH        benchmark-release-compare.json，默认同 release 目录下的文件；不存在时记 warning
  --require-compare     compare 缺失或非 pass 时 baseline 不可用
  --allow-not-ready     允许 releaseReady=false 也生成 baseline descriptor；仅用于 bootstrap / 调试，正式 release 不应使用
  --output PATH         写入文件，默认 .lime/benchmark/releases/<version>/benchmark-baseline.json
  --format FMT          输出格式：json | markdown
  --check               baseline 不可用时非 0
  -h, --help            显示帮助
`);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function releaseRoot(version) {
  return normalizePath(`.lime/benchmark/releases/${version}`);
}

function defaultSummaryPath(version) {
  return `${releaseRoot(version)}/benchmark-release-summary.json`;
}

function defaultComparePath(version) {
  return `${releaseRoot(version)}/benchmark-release-compare.json`;
}

function defaultOutputPath(version) {
  return `${releaseRoot(version)}/benchmark-baseline.json`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(rootDir, filePath) {
  const resolved = path.resolve(rootDir, filePath);
  if (!fs.existsSync(resolved)) {
    return { exists: false, payload: null, error: "" };
  }
  try {
    return { exists: true, payload: readJsonFile(resolved), error: "" };
  } catch (error) {
    return { exists: true, payload: null, error: error.message };
  }
}

function relativePath(rootDir, filePath) {
  return normalizePath(path.relative(rootDir, path.resolve(rootDir, filePath)) || ".");
}

function buildBenchmarkReleaseBaseline({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  version = DEFAULT_VERSION,
  summaryPath = "",
  comparePath = "",
  outputPath = "",
  requireCompare = false,
  allowNotReady = false,
} = {}) {
  const issues = [];
  const warnings = [];
  const resolvedSummaryPath = normalizePath(summaryPath || defaultSummaryPath(version));
  const resolvedComparePath = normalizePath(comparePath || defaultComparePath(version));
  const resolvedOutputPath = normalizePath(outputPath || defaultOutputPath(version));
  let manifest = {};
  let summary = {};
  try {
    manifest = readJsonFile(path.resolve(rootDir, manifestPath));
  } catch (error) {
    issues.push(`${manifestPath}: manifest 读取失败：${error.message}`);
  }
  try {
    summary = readJsonFile(path.resolve(rootDir, resolvedSummaryPath));
  } catch (error) {
    issues.push(`${resolvedSummaryPath}: summary 读取失败：${error.message}`);
  }

  if (summary.schemaVersion && summary.schemaVersion !== "benchmark-release-summary-v1") {
    issues.push(`${resolvedSummaryPath}: schemaVersion 不是 benchmark-release-summary-v1`);
  }
  if (!allowNotReady && summary.releaseReady !== true) {
    issues.push("summary.releaseReady 不是 true，不能作为稳定 baseline");
  }
  const summaryIssueCount = Number(summary.summary?.issueCount || 0);
  if (summaryIssueCount > 0) {
    issues.push(`summary.issueCount=${summaryIssueCount}`);
  }
  const releaseBlockerCount = Number(summary.summary?.releaseBlockerCount || 0);
  if (releaseBlockerCount > 0) {
    issues.push(`summary.releaseBlockerCount=${releaseBlockerCount}`);
  }
  const p0GateBlockerCount = Number(summary.summary?.p0GateBlockerCount || 0);
  if (p0GateBlockerCount > 0) {
    issues.push(`summary.p0GateBlockerCount=${p0GateBlockerCount}`);
  }
  const preflightBlockerCount = Number(summary.summary?.preflightBlockerCount || 0);
  if (preflightBlockerCount > 0) {
    issues.push(`summary.preflightBlockerCount=${preflightBlockerCount}`);
  }
  const trueRunBlockerCount = Number(summary.summary?.trueRunBlockerCount || 0);
  if (trueRunBlockerCount > 0) {
    issues.push(`summary.trueRunBlockerCount=${trueRunBlockerCount}`);
  }
  const trueRunEvidenceBlockerCount = Number(
    summary.summary?.trueRunEvidenceBlockerCount || 0,
  );
  if (trueRunEvidenceBlockerCount > 0) {
    issues.push(`summary.trueRunEvidenceBlockerCount=${trueRunEvidenceBlockerCount}`);
  }
  if (
    manifest.datasetVersion &&
    summary.datasetVersion &&
    manifest.datasetVersion !== summary.datasetVersion
  ) {
    warnings.push(
      `datasetVersion 不一致：manifest=${manifest.datasetVersion} summary=${summary.datasetVersion}`,
    );
  }

  const compareRead = readOptionalJson(rootDir, resolvedComparePath);
  if (!compareRead.exists) {
    const message = `${resolvedComparePath}: compare 不存在`;
    if (requireCompare) {
      issues.push(message);
    } else {
      warnings.push(message);
    }
  } else if (compareRead.error) {
    issues.push(`${resolvedComparePath}: compare 读取失败：${compareRead.error}`);
  } else if (compareRead.payload?.schemaVersion !== "benchmark-release-compare-v1") {
    issues.push(`${resolvedComparePath}: schemaVersion 不是 benchmark-release-compare-v1`);
  } else if (compareRead.payload?.summary?.decision !== "pass") {
    const message = `${resolvedComparePath}: compare decision=${compareRead.payload?.summary?.decision || "(empty)"}`;
    if (requireCompare) {
      issues.push(message);
    } else {
      warnings.push(message);
    }
  }

  return {
    schemaVersion: "benchmark-release-baseline-v1",
    generatedAt: new Date().toISOString(),
    version,
    baselineKind: allowNotReady ? "bootstrap" : "stable",
    manifestPath: relativePath(rootDir, manifestPath),
    summaryPath: relativePath(rootDir, resolvedSummaryPath),
    comparePath: relativePath(rootDir, resolvedComparePath),
    outputPath: relativePath(rootDir, resolvedOutputPath),
    datasetVersion: summary.datasetVersion || manifest.datasetVersion || "",
    releaseReady: summary.releaseReady === true,
    requireCompare: Boolean(requireCompare),
    allowNotReady: Boolean(allowNotReady),
    compare: {
      exists: compareRead.exists,
      decision: compareRead.payload?.summary?.decision || "",
    },
    summary: {
      issueCount: summaryIssueCount,
      releaseBlockerCount,
      p0GateBlockerCount,
      preflightBlockerCount,
      trueRunBlockerCount,
      trueRunEvidenceBlockerCount,
      p0GateStepCount: Number(summary.summary?.p0GateStepCount || 0),
    },
    baselineReady: !allowNotReady && issues.length === 0,
    issues,
    warnings,
  };
}

function validateBenchmarkReleaseBaseline(baseline) {
  return {
    valid: baseline.baselineReady === true && (baseline.issues || []).length === 0,
    issues: baseline.issues || [],
  };
}

function renderMarkdown(baseline) {
  const lines = [
    "# Benchmark Release Baseline",
    "",
    `- version: ${baseline.version}`,
    `- baselineKind: ${baseline.baselineKind || "-"}`,
    `- datasetVersion: ${baseline.datasetVersion || "-"}`,
    `- baselineReady: ${baseline.baselineReady ? "yes" : "no"}`,
    `- releaseReady: ${baseline.releaseReady ? "yes" : "no"}`,
    `- summary: ${baseline.summaryPath}`,
    `- compare: ${baseline.compare.exists ? baseline.comparePath : "missing"}`,
    `- compareDecision: ${baseline.compare.decision || "-"}`,
  ];

  if (baseline.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of baseline.issues) {
      lines.push(`- ${issue}`);
    }
  }
  if (baseline.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of baseline.warnings) {
      lines.push(`- ${warning}`);
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
  const baseline = buildBenchmarkReleaseBaseline({
    manifestPath: options.manifestPath,
    version: options.version,
    summaryPath: options.summaryPath,
    comparePath: options.comparePath,
    outputPath: options.outputPath,
    requireCompare: options.requireCompare,
    allowNotReady: options.allowNotReady,
  });
  const validation = validateBenchmarkReleaseBaseline(baseline);
  const content =
    options.format === "json"
      ? `${JSON.stringify(baseline, null, 2)}\n`
      : renderMarkdown(baseline);
  const outputPath = options.outputPath || defaultOutputPath(options.version);
  writeOutput(outputPath, content);
  process.stdout.write(content);
  if (options.check && !validation.valid) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseBaseline,
  validateBenchmarkReleaseBaseline,
};
