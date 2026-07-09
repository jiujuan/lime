#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";

function parseArgs(argv) {
  const result = {
    baselineSummaryPath: "",
    candidateSummaryPath: "",
    check: false,
    format: "json",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline-summary" && argv[index + 1]) {
      result.baselineSummaryPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--candidate-summary" && argv[index + 1]) {
      result.candidateSummaryPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
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
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  if (!["json", "markdown"].includes(result.format)) {
    throw new Error("--format 只支持 json 或 markdown");
  }
  if (!result.help && (!result.baselineSummaryPath || !result.candidateSummaryPath)) {
    throw new Error("必须提供 --baseline-summary 和 --candidate-summary");
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark Release Compare

用法:
  npm run agent-qc:benchmark-release:compare -- \\
    --baseline-summary ".lime/benchmark/releases/1.96.0/benchmark-release-summary.json" \\
    --candidate-summary ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json" \\
    --check

选项:
  --manifest PATH             release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --baseline-summary PATH     上一稳定版本 benchmark-release-summary.json
  --candidate-summary PATH    候选版本 benchmark-release-summary.json
  --output PATH               写入文件；默认 stdout
  --format FMT                输出格式：json | markdown
  --check                     compare 决策不是 pass 时非 0
  -h, --help                  显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function relativePath(rootDir, filePath) {
  return normalizePath(path.relative(rootDir, path.resolve(rootDir, filePath)) || ".");
}

function readManifest(rootDir, manifestPath, issues) {
  try {
    return readJsonFile(path.resolve(rootDir, manifestPath));
  } catch (error) {
    issues.push(`${manifestPath}: manifest 读取失败：${error.message}`);
    return {};
  }
}

function readSummary(rootDir, summaryPath, label, issues) {
  try {
    const summary = readJsonFile(path.resolve(rootDir, summaryPath));
    if (summary.schemaVersion !== "benchmark-release-summary-v1") {
      issues.push(`${label}: schemaVersion 不是 benchmark-release-summary-v1`);
    }
    return summary;
  } catch (error) {
    issues.push(`${label}: summary 读取失败：${error.message}`);
    return {};
  }
}

function maxAdditionalFailedTasks(manifest) {
  const value = manifest?.releasePolicy?.p1RegressionBudget?.maxAdditionalFailedTasks;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function statusClass(verdict) {
  const normalized = String(verdict || "").toLowerCase();
  if (["pass", "passed", "ready"].includes(normalized)) {
    return "passed";
  }
  if (["fail", "failed", "blocked"].includes(normalized)) {
    return "failed";
  }
  if (["skipped", "not_run", "not-run"].includes(normalized)) {
    return "skipped";
  }
  return "unknown";
}

function suitesById(summary) {
  return new Map((summary.suites || []).map((suite) => [suite.id, suite]));
}

function p0StepsByCommand(summary) {
  const result = new Map();
  for (const suite of summary.suites || []) {
    if (suite.runner !== "npm") {
      continue;
    }
    for (const step of suite.p0Gate || []) {
      result.set(`${suite.id}:${step.command}`, {
        suiteId: suite.id,
        command: step.command,
        status: step.status || "",
      });
    }
  }
  return result;
}

function trueRunTasksByKey(summary) {
  const result = new Map();
  for (const suite of summary.suites || []) {
    for (const task of suite.trueRunTasks || []) {
      if (!task.taskId) {
        continue;
      }
      result.set(`${suite.id}:${task.taskId}`, {
        suiteId: suite.id,
        taskId: task.taskId,
        verdict: task.verdict || "",
        statusClass: statusClass(task.verdict),
      });
    }
  }
  return result;
}

function suiteTrueRunBlockedDelta(baselineSuite, candidateSuite) {
  if ((candidateSuite?.trueRunTasks || []).length > 0) {
    return 0;
  }
  const baselineBlocked = Number(baselineSuite?.trueRun?.blockedCount || 0);
  const candidateBlocked = Number(candidateSuite?.trueRun?.blockedCount || 0);
  return Math.max(0, candidateBlocked - baselineBlocked);
}

function compareP0Steps(baseline, candidate) {
  const baselineSteps = p0StepsByCommand(baseline);
  const candidateSteps = p0StepsByCommand(candidate);
  const regressions = [];

  for (const [key, baselineStep] of baselineSteps) {
    if (statusClass(baselineStep.status) !== "passed") {
      continue;
    }
    const candidateStep = candidateSteps.get(key);
    if (statusClass(candidateStep?.status) === "passed") {
      continue;
    }
    regressions.push({
      suiteId: baselineStep.suiteId,
      command: baselineStep.command,
      baselineStatus: baselineStep.status,
      candidateStatus: candidateStep?.status || "missing",
      reason: candidateStep ? "p0_step_no_longer_passing" : "p0_step_missing",
    });
  }

  return regressions;
}

function compareTrueRunTasks(baseline, candidate) {
  const baselineTasks = trueRunTasksByKey(baseline);
  const candidateTasks = trueRunTasksByKey(candidate);
  const regressions = [];

  for (const [key, candidateTask] of candidateTasks) {
    if (candidateTask.statusClass !== "failed") {
      continue;
    }
    const baselineTask = baselineTasks.get(key);
    if (baselineTask?.statusClass === "failed") {
      continue;
    }
    regressions.push({
      suiteId: candidateTask.suiteId,
      taskId: candidateTask.taskId,
      baselineVerdict: baselineTask?.verdict || "missing",
      candidateVerdict: candidateTask.verdict,
      reason: "candidate_failed_task_not_failed_in_baseline",
    });
  }

  return regressions;
}

function compareSuiteReports(baseline, candidate) {
  const baselineSuites = suitesById(baseline);
  const candidateSuites = suitesById(candidate);
  const suiteIds = [...new Set([...baselineSuites.keys(), ...candidateSuites.keys()])].sort();

  return suiteIds.map((suiteId) => {
    const baselineSuite = baselineSuites.get(suiteId) || {};
    const candidateSuite = candidateSuites.get(suiteId) || {};
    return {
      id: suiteId,
      priority: candidateSuite.priority || baselineSuite.priority || "",
      runner: candidateSuite.runner || baselineSuite.runner || "",
      requiredForRelease: Boolean(
        candidateSuite.requiredForRelease || baselineSuite.requiredForRelease,
      ),
      baselineState: baselineSuite.state || "missing",
      candidateState: candidateSuite.state || "missing",
      baselineTrueRunBlockedCount: baselineSuite.trueRun?.blockedCount || 0,
      candidateTrueRunBlockedCount: candidateSuite.trueRun?.blockedCount || 0,
      suiteTrueRunBlockedDelta: suiteTrueRunBlockedDelta(baselineSuite, candidateSuite),
      baselineP0StepCount: (baselineSuite.p0Gate || []).length,
      candidateP0StepCount: (candidateSuite.p0Gate || []).length,
    };
  });
}

function buildBenchmarkReleaseCompare({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  baselineSummaryPath,
  candidateSummaryPath,
} = {}) {
  const issues = [];
  const manifest = readManifest(rootDir, manifestPath, issues);
  const baseline = readSummary(rootDir, baselineSummaryPath, "baseline", issues);
  const candidate = readSummary(rootDir, candidateSummaryPath, "candidate", issues);
  const regressionBudget = {
    maxAdditionalFailedTasks: maxAdditionalFailedTasks(manifest),
  };
  const p0Regressions = compareP0Steps(baseline, candidate);
  const taskRegressions = compareTrueRunTasks(baseline, candidate);
  const suiteComparisons = compareSuiteReports(baseline, candidate);
  const suiteBlockedDelta = suiteComparisons.reduce(
    (sum, suite) => sum + suite.suiteTrueRunBlockedDelta,
    0,
  );
  const additionalFailedTaskCount = taskRegressions.length + suiteBlockedDelta;
  const releaseReadyRegression = Boolean(baseline.releaseReady && !candidate.releaseReady);
  const candidateIssueCount = Number(candidate.summary?.issueCount || 0);
  const budgetExceeded =
    additionalFailedTaskCount > regressionBudget.maxAdditionalFailedTasks;
  const p0Regressed = p0Regressions.length > 0;
  const decision =
    issues.length > 0 || p0Regressed || budgetExceeded || releaseReadyRegression || candidateIssueCount > 0
      ? "hold-or-revert"
      : candidate.releaseReady
        ? "pass"
        : "needs-release-gate";

  return {
    schemaVersion: "benchmark-release-compare-v1",
    generatedAt: new Date().toISOString(),
    manifestPath: relativePath(rootDir, manifestPath),
    baselineSummaryPath: relativePath(rootDir, baselineSummaryPath),
    candidateSummaryPath: relativePath(rootDir, candidateSummaryPath),
    datasetVersion: candidate.datasetVersion || baseline.datasetVersion || manifest.datasetVersion || "",
    regressionBudget,
    summary: {
      suiteCount: suiteComparisons.length,
      p0RegressionCount: p0Regressions.length,
      additionalFailedTaskCount,
      suiteBlockedDelta,
      taskRegressionCount: taskRegressions.length,
      releaseReadyRegression,
      candidateIssueCount,
      budgetExceeded,
      decision,
    },
    suiteComparisons,
    p0Regressions,
    taskRegressions,
    issues,
  };
}

function validateBenchmarkReleaseCompare(compare) {
  const issues = [...(compare.issues || [])];
  if (compare.summary?.decision !== "pass") {
    issues.push(`benchmark release compare decision=${compare.summary?.decision || "(empty)"}`);
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

function renderMarkdown(compare) {
  const lines = [
    "# Benchmark Release Compare",
    "",
    `- datasetVersion: ${compare.datasetVersion || "-"}`,
    `- decision: ${compare.summary.decision}`,
    `- maxAdditionalFailedTasks: ${compare.regressionBudget.maxAdditionalFailedTasks}`,
    `- additionalFailedTaskCount: ${compare.summary.additionalFailedTaskCount}`,
    `- p0RegressionCount: ${compare.summary.p0RegressionCount}`,
    `- releaseReadyRegression: ${compare.summary.releaseReadyRegression ? "yes" : "no"}`,
    "",
    "## Suite Compare",
    "",
    "| Suite | Baseline | Candidate | True-run blocked delta |",
    "| --- | --- | --- | --- |",
  ];

  for (const suite of compare.suiteComparisons) {
    lines.push(
      `| ${suite.id} | ${suite.baselineState} | ${suite.candidateState} | ${suite.suiteTrueRunBlockedDelta} |`,
    );
  }

  if (compare.p0Regressions.length > 0) {
    lines.push("", "## P0 Regressions", "");
    for (const regression of compare.p0Regressions) {
      lines.push(
        `- ${regression.suiteId}: ${regression.command} ${regression.baselineStatus} -> ${regression.candidateStatus}`,
      );
    }
  }

  if (compare.taskRegressions.length > 0) {
    lines.push("", "## Task Regressions", "");
    for (const regression of compare.taskRegressions) {
      lines.push(
        `- ${regression.suiteId}/${regression.taskId}: ${regression.baselineVerdict} -> ${regression.candidateVerdict}`,
      );
    }
  }

  if (compare.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of compare.issues) {
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
  const compare = buildBenchmarkReleaseCompare({
    manifestPath: options.manifestPath,
    baselineSummaryPath: options.baselineSummaryPath,
    candidateSummaryPath: options.candidateSummaryPath,
  });
  const validation = validateBenchmarkReleaseCompare(compare);
  const content =
    options.format === "json"
      ? `${JSON.stringify(compare, null, 2)}\n`
      : renderMarkdown(compare);
  writeOutput(options.outputPath, content);
  if (options.check && !validation.valid) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseCompare,
  compareP0Steps,
  compareTrueRunTasks,
  statusClass,
  validateBenchmarkReleaseCompare,
};
