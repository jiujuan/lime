#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildPreflightReport } from "./benchmark-true-run-preflight.mjs";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_OUTPUT_ROOT = ".lime/benchmark/runs/manual-true-run";

function parseArgs(argv) {
  const result = {
    allTasks: false,
    check: false,
    currentChainEvidencePath: "",
    format: "json",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    outputRoot: DEFAULT_OUTPUT_ROOT,
    suiteId: "",
    taskId: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all-tasks") {
      result.allTasks = true;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--current-chain-evidence" && argv[index + 1]) {
      result.currentChainEvidencePath = String(argv[index + 1]).trim();
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
    if (arg === "--output-root" && argv[index + 1]) {
      result.outputRoot = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--suite" && argv[index + 1]) {
      result.suiteId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--task" && argv[index + 1]) {
      result.taskId = String(argv[index + 1]).trim();
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
  if (!result.suiteId && !result.help) {
    throw new Error("必须提供 --suite");
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark True Run

用法:
  npm run agent-qc:benchmark:true-run -- --suite terminal-bench-release-slice --output .lime/benchmark/runs/p1/terminal-bench --check
  npm run agent-qc:benchmark:terminal-run -- --output .lime/benchmark/runs/p1/terminal-bench --check
  npm run agent-qc:benchmark:deepswe-run -- --output .lime/benchmark/runs/p1/deepswe --check

选项:
  --manifest PATH     release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --suite ID          要运行的 suite id
  --task ID           只运行一个 task；默认 suite.taskSet 全部任务
  --all-tasks         显式运行 suite.taskSet 全部任务
  --current-chain-evidence PATH
                      已由 Lime App Server current 主链生成的 benchmark-current-chain-evidence-v1；仅 preflight ready 时消费
  --output PATH       输出目录；suite run 时作为 suite root，task run 时作为 task 目录
  --output-root PATH  默认输出根目录，默认 ${DEFAULT_OUTPUT_ROOT}
  --format FMT        输出格式：json | markdown
  --check             true-run 未 ready / blocked 时非 0 退出
  -h, --help          显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJsonFile(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    return readJsonFile(path.resolve(process.cwd(), filePath));
  } catch (error) {
    return {
      schemaVersion: "benchmark-current-chain-evidence-load-error-v1",
      loadError: error.message,
      sourcePath: normalizePath(filePath),
    };
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function fileStatus(rootDir, relativePath) {
  const resolvedPath = path.resolve(rootDir, relativePath);
  const exists = fs.existsSync(resolvedPath);
  const stat = exists ? fs.statSync(resolvedPath) : null;
  return {
    path: normalizePath(relativePath),
    exists,
    kind: stat?.isDirectory() ? "directory" : "file",
    bytes: stat?.isFile() ? stat.size : 0,
  };
}

function findSuite(manifest, suiteId) {
  const suite = (manifest.suites || []).find((entry) => entry.id === suiteId);
  if (!suite) {
    throw new Error(`找不到 suite：${suiteId}`);
  }
  if (!suite.taskRoot || !Array.isArray(suite.taskSet)) {
    throw new Error(`suite ${suiteId} 不是外部 task suite`);
  }
  return suite;
}

function taskIdsForSuite(suite, options) {
  if (options.taskId) {
    if (!suite.taskSet.includes(options.taskId)) {
      throw new Error(`task ${options.taskId} 不在 suite ${suite.id} 的 taskSet 中`);
    }
    return [options.taskId];
  }
  if (!suite.taskSet.length) {
    throw new Error(`suite ${suite.id} 没有可运行 task`);
  }
  return [...suite.taskSet];
}

function outputRootForSuite(options, suiteId) {
  if (options.outputPath) {
    return path.resolve(process.cwd(), options.outputPath);
  }
  return path.resolve(process.cwd(), options.outputRoot, suiteId);
}

function outputDirForTask(options, suiteId, taskId, taskCount) {
  if (options.outputPath && taskCount === 1 && options.taskId) {
    return path.resolve(process.cwd(), options.outputPath);
  }
  return path.join(outputRootForSuite(options, suiteId), taskId);
}

function trueRunAdapterBlocker(preflightReport) {
  if (preflightReport.verdict !== "ready") {
    return null;
  }
  return {
    id: "lime_current_true_run_adapter",
    reason: "lime_current_true_run_adapter_not_implemented",
    label: "Lime current App Server true-run adapter is implemented",
  };
}

function currentChainContract(invoked = false) {
  return {
    target: "lime_app_server_current",
    appServerMethod: "agentSession/turn/start",
    evidenceExportMethod: "evidence/export",
    externalVerifier: true,
    invoked,
    evidenceExportInvoked: false,
  };
}

function validateCurrentChainEvidence(evidence, suite, taskId) {
  const issues = [];
  if (!evidence) {
    issues.push("current_chain_evidence_missing");
  }
  if (evidence && evidence.schemaVersion !== "benchmark-current-chain-evidence-v1") {
    issues.push("schema_version_invalid");
  }
  if (evidence && evidence.suiteId !== suite.id) {
    issues.push("suite_id_mismatch");
  }
  if (evidence && evidence.taskId !== taskId) {
    issues.push("task_id_mismatch");
  }
  const appServer = evidence?.appServer || {};
  if (appServer.method !== "agentSession/turn/start" || appServer.invoked !== true) {
    issues.push("agent_session_turn_start_not_invoked");
  }
  const evidenceExport = evidence?.evidenceExport || {};
  if (evidenceExport.method !== "evidence/export" || evidenceExport.invoked !== true) {
    issues.push("evidence_export_not_invoked");
  }
  const pack = evidenceExport.pack || {};
  if (!pack.session_id || !pack.thread_id || !pack.pack_relative_root || !pack.exported_at) {
    issues.push("app_server_evidence_pack_shape_invalid");
  }
  if (pack.observability_summary?.source !== "app-server-current") {
    issues.push("app_server_evidence_pack_source_invalid");
  }
  const verifier = evidence?.externalVerifier || {};
  const verifierVerdict = String(verifier.verdict || "").toLowerCase();
  if (verifier.invoked !== true) {
    issues.push("external_verifier_not_invoked");
  }
  if (!["pass", "passed", "ready"].includes(verifierVerdict)) {
    issues.push("external_verifier_not_passed");
  }

  return {
    valid: issues.length === 0,
    issues,
    pack,
    verifier,
  };
}

function currentChainEvidenceBlocker(validation) {
  if (validation.valid) {
    return null;
  }
  return {
    id: "lime_current_chain_evidence",
    reason: `current_chain_evidence_invalid:${validation.issues.join(",")}`,
    label: "Lime App Server current chain evidence is valid",
  };
}

function buildTrueRunReport({
  manifest,
  suite,
  taskId,
  commandRunner,
  currentChainEvidence = null,
  generatedAt = new Date().toISOString(),
}) {
  const preflightReport = buildPreflightReport({
    manifest,
    suite,
    taskId,
    commandRunner,
  });
  const currentChainValidation =
    preflightReport.verdict === "ready"
      ? validateCurrentChainEvidence(currentChainEvidence, suite, taskId)
      : { valid: false, issues: ["blocked_before_current_chain_evidence"], pack: {}, verifier: {} };
  const adapterBlocker = currentChainValidation.valid
    ? null
    : currentChainEvidence && preflightReport.verdict === "ready"
      ? currentChainEvidenceBlocker(currentChainValidation)
      : trueRunAdapterBlocker(preflightReport);
  const blockers = [
    ...preflightReport.blockers.map((blocker) => ({
      ...blocker,
      phase: "preflight",
    })),
    ...(adapterBlocker ? [{ ...adapterBlocker, phase: "adapter" }] : []),
  ];
  const currentChainReady = preflightReport.verdict === "ready" && currentChainValidation.valid;

  return {
    schemaVersion: "benchmark-true-run-v1",
    generatedAt,
    mode: "true_run",
    verdict: blockers.length === 0 ? "ready" : "blocked",
    suite: preflightReport.suite,
    source: preflightReport.source,
    task: preflightReport.task,
    preflight: {
      verdict: preflightReport.verdict,
      blockerCount: preflightReport.blockers.length,
      blockers: preflightReport.blockers,
    },
    execution: {
      providerInvoked: currentChainReady,
      verifierInvoked: currentChainReady,
      dockerInvoked: currentChainReady,
      liveProviderUsed: currentChainReady,
      trueRunInvoked: currentChainReady,
      currentChainInvoked: currentChainReady,
      currentChain: {
        ...currentChainContract(currentChainReady),
        evidenceExportInvoked: currentChainReady,
        sessionId: currentChainValidation.pack.session_id || "",
        threadId: currentChainValidation.pack.thread_id || "",
        turnId: currentChainEvidence?.appServer?.turnId || "",
        evidencePackRelativeRoot: currentChainValidation.pack.pack_relative_root || "",
      },
      reason:
        preflightReport.verdict !== "ready"
          ? "true-run 被 preflight 阻断；未执行 Lime current 主链、Docker 任务或外部 verifier。"
          : currentChainReady
            ? "true-run 已消费 Lime App Server current 主链 evidence/export 与外部 verifier 结果。"
            : "true-run adapter 尚未接入 Lime App Server current 主链；未执行 Agent turn 或外部 verifier。",
    },
    checks: [
      ...preflightReport.checks,
      {
        id: "lime_current_true_run_adapter",
        label: "Lime current App Server true-run adapter is implemented",
        status: currentChainReady ? "ok" : adapterBlocker ? "blocked" : "skipped",
        reason: currentChainReady ? "" : adapterBlocker ? adapterBlocker.reason : "blocked_before_adapter",
      },
    ],
    blockers,
    requiredFiles: preflightReport.requiredFiles,
    missingFiles: preflightReport.missingFiles,
  };
}

function buildTrajectory(report) {
  return {
    schemaVersion: "benchmark-trajectory-true-run-v1",
    suiteId: report.suite.id,
    taskId: report.task.id,
    mode: report.mode,
    events: [
      ...report.checks.map((check, index) => ({
        sequence: index + 1,
        type: `benchmark.true_run.${check.id}`,
        status: check.status,
        reason: check.reason || "",
      })),
      {
        sequence: report.checks.length + 1,
        type: "benchmark.true_run.verdict",
        status: report.verdict,
        reason: report.execution.reason,
      },
    ],
  };
}

function buildToolTimeline(report) {
  return {
    schemaVersion: "benchmark-tool-timeline-true-run-v1",
    suiteId: report.suite.id,
    taskId: report.task.id,
    tools: report.checks.map((check) => ({
      id: check.id,
      status:
        check.status === "ok"
          ? "completed"
          : check.status === "skipped"
            ? "skipped"
            : "failed",
      input: check.command
        ? {
            executable: check.command.executable,
            args: check.command.args,
            cwd: check.command.cwd,
          }
        : {},
      output: {
        reason: check.reason || "",
        status: check.status,
      },
    })),
  };
}

function buildVerifierResult(report) {
  return {
    schemaVersion: "benchmark-verifier-result-v1",
    verdict: report.verdict === "ready" ? "ready" : "blocked",
    reward: null,
    verifierInvoked: Boolean(report.execution.verifierInvoked),
    reason: report.execution.reason,
    blockers: report.blockers,
  };
}

function buildStdout(report) {
  return [
    `[benchmark-true-run] suite=${report.suite.id} task=${report.task.id}`,
    `[benchmark-true-run] verdict=${report.verdict}`,
    `[benchmark-true-run] provider ${report.execution.providerInvoked ? "invoked" : "not invoked"}`,
    `[benchmark-true-run] verifier ${report.execution.verifierInvoked ? "invoked" : "not invoked"}`,
    `[benchmark-true-run] current chain ${report.execution.currentChainInvoked ? "invoked" : "not invoked"}`,
    ...report.checks.map(
      (check) =>
        `[benchmark-true-run] ${check.id}=${check.status}${check.reason ? ` reason=${check.reason}` : ""}`,
    ),
    "",
  ].join("\n");
}

function buildStderr(report) {
  const chunks = [];
  for (const check of report.checks) {
    if (check.command?.stderrTail) {
      chunks.push(`## ${check.id}`, check.command.stderrTail.trim(), "");
    }
    if (check.command?.error) {
      chunks.push(`## ${check.id} error`, check.command.error, "");
    }
  }
  return chunks.length === 0 ? "" : `${chunks.join("\n")}\n`;
}

function buildEvidenceManifest(report, outputDir, files) {
  return {
    schemaVersion: "benchmark-evidence-pack-v1",
    generatedAt: new Date().toISOString(),
    mode: "true_run",
    suiteId: report.suite.id,
    taskId: report.task.id,
    outputDir: normalizePath(path.relative(process.cwd(), outputDir)),
    verdict: report.verdict,
    files: files.map((filePath) =>
      fileStatus(process.cwd(), path.relative(process.cwd(), filePath)),
    ),
    source: report.source,
    blockers: report.blockers,
    missingFiles: report.missingFiles,
  };
}

function writeBenchmarkSpecificBlockedArtifacts(report, outputDir, writtenFiles) {
  if (report.suite.runner === "deepswe-adapter") {
    const patchPath = path.join(outputDir, "patch.diff");
    const rewardPath = path.join(outputDir, "reward.json");
    const ctrfPath = path.join(outputDir, "ctrf.json");
    const replayPath = path.join(outputDir, "replay-case/replay.json");
    writeTextFile(
      patchPath,
      "# true-run blocked before Lime current chain execution; patch not generated\n",
    );
    writeJsonFile(rewardPath, {
      schemaVersion: "benchmark-reward-v1",
      verdict: "blocked",
      reward: null,
      reason: report.execution.reason,
      blockers: report.blockers,
    });
    writeJsonFile(ctrfPath, {
      results: {
        tool: {
          name: "deepswe",
        },
        summary: {
          tests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
        },
        tests: [],
      },
    });
    writeJsonFile(replayPath, {
      schemaVersion: "benchmark-replay-case-v1",
      suiteId: report.suite.id,
      taskId: report.task.id,
      verdict: "blocked",
      reason: report.execution.reason,
    });
    writtenFiles.push(patchPath, rewardPath, ctrfPath, replayPath);
  }
}

function writeTrueRunArtifacts(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const writtenFiles = [];
  const writeJson = (relativePath, payload) => {
    const filePath = path.join(outputDir, relativePath);
    writeJsonFile(filePath, payload);
    writtenFiles.push(filePath);
  };
  const writeText = (relativePath, content) => {
    const filePath = path.join(outputDir, relativePath);
    writeTextFile(filePath, content);
    writtenFiles.push(filePath);
  };

  writeJson("summary.json", report);
  writeJson("trajectory.json", buildTrajectory(report));
  writeJson("tool-timeline.json", buildToolTimeline(report));
  writeJson("verifier-result.json", buildVerifierResult(report));
  writeText("stdout.log", buildStdout(report));
  writeText("stderr.log", buildStderr(report));
  writeBenchmarkSpecificBlockedArtifacts(report, outputDir, writtenFiles);

  const evidenceManifestPath = path.join(outputDir, "evidence-pack/manifest.json");
  writeJsonFile(
    evidenceManifestPath,
    buildEvidenceManifest(report, outputDir, writtenFiles),
  );
  writtenFiles.push(evidenceManifestPath);

  return {
    ...report,
    outputDir: normalizePath(path.relative(process.cwd(), outputDir)),
    artifacts: writtenFiles.map((filePath) =>
      normalizePath(path.relative(process.cwd(), filePath)),
    ),
  };
}

function buildSuiteSummary({ suite, outputRoot, taskReports }) {
  const tasks = taskReports.map((report) => ({
    taskId: report.task.id,
    verdict: report.verdict,
    blockerCount: report.blockers.length,
    blockers: report.blockers,
    artifactCount: report.artifacts.length,
    outputDir: report.outputDir,
  }));
  const readyCount = tasks.filter((task) => task.verdict === "ready").length;
  const blockedCount = tasks.filter((task) => task.verdict === "blocked").length;

  return {
    schemaVersion: "benchmark-suite-true-run-v1",
    generatedAt: new Date().toISOString(),
    mode: "true_run",
    suite: {
      id: suite.id,
      runner: suite.runner,
      requiredForRelease: Boolean(suite.requiredForRelease),
      taskCount: tasks.length,
    },
    outputDir: normalizePath(path.relative(process.cwd(), outputRoot)),
    summary: {
      readyCount,
      blockedCount,
      taskCount: tasks.length,
      verdict: blockedCount === 0 && readyCount === tasks.length ? "ready" : "blocked",
      releaseReady: false,
    },
    tasks,
  };
}

function runTrueRun(rootDir, options) {
  const manifest = readJsonFile(path.resolve(rootDir, options.manifestPath));
  const suite = findSuite(manifest, options.suiteId);
  const taskIds = taskIdsForSuite(suite, options);
  const outputRoot = outputRootForSuite(options, suite.id);
  const currentChainEvidence = readOptionalJsonFile(options.currentChainEvidencePath);
  const taskReports = taskIds.map((taskId) => {
    const report = buildTrueRunReport({ manifest, suite, taskId, currentChainEvidence });
    return writeTrueRunArtifacts(
      report,
      outputDirForTask(options, suite.id, taskId, taskIds.length),
    );
  });

  if (taskIds.length === 1 && options.taskId) {
    return taskReports[0];
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  const suiteSummary = buildSuiteSummary({ suite, outputRoot, taskReports });
  writeJsonFile(path.join(outputRoot, "suite-summary.json"), suiteSummary);
  return suiteSummary;
}

function isSuiteReport(report) {
  return report.schemaVersion === "benchmark-suite-true-run-v1";
}

function renderMarkdown(report) {
  if (isSuiteReport(report)) {
    const lines = [
      "# Benchmark Suite True Run",
      "",
      `- suite: ${report.suite.id}`,
      `- verdict: ${report.summary.verdict}`,
      `- tasks: ${report.summary.readyCount}/${report.summary.taskCount}`,
      `- outputDir: ${report.outputDir}`,
      "",
      "## Tasks",
      "",
      "| Task | Verdict | Blockers | Artifacts |",
      "| --- | --- | --- | --- |",
    ];
    for (const task of report.tasks) {
      lines.push(
        `| ${task.taskId} | ${task.verdict} | ${task.blockers.map((blocker) => blocker.id).join("<br>") || "-"} | ${task.artifactCount} |`,
      );
    }
    return `${lines.join("\n")}\n`;
  }

  const lines = [
    "# Benchmark True Run",
    "",
    `- suite: ${report.suite.id}`,
    `- task: ${report.task.id}`,
    `- verdict: ${report.verdict}`,
    `- outputDir: ${report.outputDir}`,
    `- currentChainInvoked: ${report.execution.currentChainInvoked ? "yes" : "no"}`,
    `- providerInvoked: ${report.execution.providerInvoked ? "yes" : "no"}`,
    `- verifierInvoked: ${report.execution.verifierInvoked ? "yes" : "no"}`,
    "",
    "## Blockers",
    "",
  ];

  if (report.blockers.length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker.id}: ${blocker.reason}`);
    }
  }

  lines.push("", "## Artifacts", "");
  for (const artifact of report.artifacts) {
    lines.push(`- ${artifact}`);
  }

  return `${lines.join("\n")}\n`;
}

function reportPassed(report) {
  if (isSuiteReport(report)) {
    return report.summary.verdict === "ready";
  }
  return report.verdict === "ready";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = runTrueRun(process.cwd(), options);
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderMarkdown(report);
  process.stdout.write(content);

  if (options.check && !reportPassed(report)) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildSuiteSummary,
  buildToolTimeline,
  buildTrajectory,
  buildTrueRunReport,
  buildVerifierResult,
  runTrueRun,
  writeTrueRunArtifacts,
};
