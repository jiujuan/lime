#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  p0GateBlockersForSuite,
  suiteIdFromP0Step,
  summarizeP0GateSteps,
} from "./benchmark-release-summary-p0.mjs";
import { renderMarkdown } from "./benchmark-release-summary-render.mjs";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_EVIDENCE_ROOT = ".lime/benchmark/runs";

function parseArgs(argv) {
  const result = {
    check: false,
    dryRunSummaryPaths: [],
    evidenceRoot: DEFAULT_EVIDENCE_ROOT,
    format: "markdown",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    preflightSummaryPaths: [],
    releaseGate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--dry-run-summary" && argv[index + 1]) {
      result.dryRunSummaryPaths.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence-root" && argv[index + 1]) {
      result.evidenceRoot = String(argv[index + 1]).trim();
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
    if (arg === "--preflight-summary" && argv[index + 1]) {
      result.preflightSummaryPaths.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--release-gate") {
      result.releaseGate = true;
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
Lime Benchmark Release Summary

用法:
  npm run agent-qc:benchmark-release:summary
  npm run agent-qc:benchmark-release:summary -- --evidence-root .lime/benchmark/runs --output .lime/benchmark/runs/release-summary.json --format json --check
  node scripts/agent-qc/benchmark-release-summary.mjs --dry-run-summary runs/p1/suite-summary.json --preflight-summary runs/p1/task/summary.json

选项:
  --manifest PATH           release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --evidence-root PATH      自动扫描 evidence 根目录，默认 ${DEFAULT_EVIDENCE_ROOT}
  --dry-run-summary PATH    suite dry-run summary，可重复
  --preflight-summary PATH  true-run preflight summary，可重复
  --format FMT             输出格式：markdown | json
  --output PATH            写入文件；默认 stdout
  --check                  evidence 结构缺失 / 无效时非 0 退出；不把 blocked 当脚本失败
  --release-gate           同时要求 summary.releaseReady=true；正式 release runner 使用
  -h, --help               显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function relativePath(rootDir, filePath) {
  return normalizePath(path.relative(rootDir, filePath) || ".");
}

function walkJsonFiles(rootPath) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return [];
  }
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    return rootPath.endsWith(".json") ? [rootPath] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

function evidenceKind(payload) {
  if (payload?.schemaVersion === "benchmark-suite-dry-run-v1") {
    return "dry_run_suite";
  }
  if (payload?.schemaVersion === "benchmark-true-run-preflight-v1") {
    return "true_run_preflight";
  }
  if (payload?.schemaVersion === "benchmark-suite-true-run-v1") {
    return "true_run_suite";
  }
  if (payload?.schemaVersion === "benchmark-true-run-v1") {
    return "true_run_task";
  }
  if (payload?.schemaVersion === "benchmark-release-run-v1") {
    return "release_run";
  }
  if (payload?.kind === "p0_npm_gate" && payload?.id && payload?.command) {
    return "p0_gate_step";
  }
  return "";
}

function loadEvidenceFile(rootDir, filePath, issues) {
  const resolvedPath = path.resolve(rootDir, filePath);
  let payload;
  try {
    payload = readJsonFile(resolvedPath);
  } catch (error) {
    issues.push(
      `${relativePath(rootDir, resolvedPath)}: JSON 读取失败：${error.message}`,
    );
    return null;
  }

  const kind = evidenceKind(payload);
  if (!kind) {
    return null;
  }

  return {
    kind,
    path: relativePath(rootDir, resolvedPath),
    absolutePath: resolvedPath,
    payload,
  };
}

function discoverEvidence(rootDir, options, issues) {
  const candidatePaths = [
    ...options.dryRunSummaryPaths,
    ...options.preflightSummaryPaths,
  ].map((entry) => path.resolve(rootDir, entry));

  const evidenceRoot = path.resolve(rootDir, options.evidenceRoot);
  candidatePaths.push(...walkJsonFiles(evidenceRoot));

  const seen = new Set();
  const evidence = [];
  for (const candidatePath of candidatePaths) {
    const normalized = path.resolve(candidatePath);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const entry = loadEvidenceFile(rootDir, normalized, issues);
    if (entry) {
      evidence.push(entry);
    }
  }

  return evidence.sort((left, right) => left.path.localeCompare(right.path));
}

function latestByGeneratedAt(entries) {
  return (
    [...entries]
      .sort((left, right) => {
        const leftAt = left.payload?.generatedAt || "";
        const rightAt = right.payload?.generatedAt || "";
        if (leftAt === rightAt) {
          return left.path.localeCompare(right.path);
        }
        return leftAt.localeCompare(rightAt);
      })
      .at(-1) || null
  );
}

function groupEvidence(evidence) {
  const dryRuns = new Map();
  const preflights = new Map();
  const trueRuns = new Map();
  const trueRunTasks = new Map();
  const p0GateSteps = new Map();

  function addP0GateStep(entry, step, generatedAt = "") {
    if (!step?.id) {
      return;
    }
    const key = step.id;
    const current = p0GateSteps.get(key);
    const normalized = {
      kind: "p0_gate_step",
      path: entry.path,
      payload: {
        ...step,
        generatedAt: step.generatedAt || generatedAt || "",
      },
    };
    if (!current) {
      p0GateSteps.set(key, normalized);
      return;
    }
    const currentAt = current.payload.generatedAt || "";
    const nextAt = normalized.payload.generatedAt || "";
    if (
      nextAt > currentAt ||
      (nextAt === currentAt && normalized.path > current.path)
    ) {
      p0GateSteps.set(key, normalized);
    }
  }

  for (const entry of evidence) {
    if (entry.kind === "dry_run_suite") {
      const suiteId = entry.payload?.suite?.id || "";
      if (!suiteId) {
        continue;
      }
      const current = dryRuns.get(suiteId) || [];
      current.push(entry);
      dryRuns.set(suiteId, current);
    }
    if (entry.kind === "true_run_preflight") {
      const suiteId = entry.payload?.suite?.id || "";
      if (!suiteId) {
        continue;
      }
      const current = preflights.get(suiteId) || [];
      current.push(entry);
      preflights.set(suiteId, current);
    }
    if (entry.kind === "true_run_suite") {
      const suiteId = entry.payload?.suite?.id || "";
      if (!suiteId) {
        continue;
      }
      const current = trueRuns.get(suiteId) || [];
      current.push(entry);
      trueRuns.set(suiteId, current);
    }
    if (entry.kind === "true_run_task") {
      const suiteId = entry.payload?.suite?.id || "";
      if (!suiteId) {
        continue;
      }
      const current = trueRunTasks.get(suiteId) || [];
      current.push(entry);
      trueRunTasks.set(suiteId, current);
    }
    if (entry.kind === "release_run") {
      const generatedAt = entry.payload?.generatedAt || "";
      for (const step of entry.payload?.steps || []) {
        if (step?.kind === "p0_npm_gate") {
          addP0GateStep(entry, step, generatedAt);
        }
      }
    }
    if (entry.kind === "p0_gate_step") {
      addP0GateStep(entry, entry.payload, entry.payload?.generatedAt || "");
    }
  }

  return { dryRuns, preflights, trueRuns, trueRunTasks, p0GateSteps };
}

function suiteEvidenceState({
  suite,
  dryRun,
  preflights,
  trueRun,
  trueRunTasks,
  p0GateSteps,
}) {
  const externalRunner = suite.runner && suite.runner !== "npm";
  if (!externalRunner) {
    if (p0GateSteps.some((entry) => entry.payload?.status === "failed")) {
      return "failed";
    }
    if (p0GateSteps.some((entry) => entry.payload?.status === "skipped")) {
      return "skipped";
    }
    if (
      p0GateSteps.length > 0 &&
      p0GateSteps.every((entry) => entry.payload?.status === "passed")
    ) {
      return "passed";
    }
    return suite.status || "planned";
  }
  if (trueRun?.payload?.summary?.verdict === "blocked") {
    return "blocked";
  }
  if (trueRun?.payload?.summary?.verdict === "ready") {
    return "ready";
  }
  if (trueRunTasks.some((entry) => entry.payload?.verdict === "blocked")) {
    return "blocked";
  }
  if (trueRunTasks.some((entry) => entry.payload?.verdict === "ready")) {
    return "true_run_task_ready";
  }
  if (suite.adapterStatus === "ready") {
    return "ready";
  }
  if (preflights.some((entry) => entry.payload?.verdict === "blocked")) {
    return "blocked";
  }
  if (preflights.some((entry) => entry.payload?.verdict === "ready")) {
    return "preflight_ready";
  }
  if (dryRun?.payload?.summary?.verdict) {
    return dryRun.payload.summary.verdict;
  }
  return suite.status || suite.adapterStatus || "planned";
}

function summarizePreflights(entries) {
  return entries.map((entry) => ({
    path: entry.path,
    generatedAt: entry.payload.generatedAt || "",
    taskId: entry.payload.task?.id || "",
    verdict: entry.payload.verdict || "",
    blockers: Array.isArray(entry.payload.blockers)
      ? entry.payload.blockers.map((blocker) => ({
          id: blocker.id || "",
          reason: blocker.reason || "",
          label: blocker.label || "",
        }))
      : [],
  }));
}

function trueRunEvidencePackForEntry(entry) {
  const summaryPath = entry.absolutePath || "";
  const evidencePackPath = summaryPath
    ? path.join(path.dirname(summaryPath), "evidence-pack", "manifest.json")
    : "";
  const relativeEvidencePackPath = evidencePackPath
    ? normalizePath(path.relative(process.cwd(), evidencePackPath))
    : "";
  if (!evidencePackPath || !fs.existsSync(evidencePackPath)) {
    return {
      path: relativeEvidencePackPath,
      present: false,
      valid: false,
      reason: "evidence_pack_missing",
    };
  }

  let payload;
  try {
    payload = readJsonFile(evidencePackPath);
  } catch (error) {
    return {
      path: relativeEvidencePackPath,
      present: true,
      valid: false,
      reason: `evidence_pack_read_failed:${error.message}`,
    };
  }

  const suiteId = entry.payload?.suite?.id || "";
  const taskId = entry.payload?.task?.id || "";
  const valid =
    payload?.schemaVersion === "benchmark-evidence-pack-v1" &&
    payload?.mode === "true_run" &&
    payload?.suiteId === suiteId &&
    payload?.taskId === taskId &&
    payload?.verdict === entry.payload?.verdict;

  return {
    path: relativeEvidencePackPath,
    present: true,
    valid,
    reason: valid ? "" : "evidence_pack_invalid",
    schemaVersion: payload?.schemaVersion || "",
    mode: payload?.mode || "",
    verdict: payload?.verdict || "",
    suiteId: payload?.suiteId || "",
    taskId: payload?.taskId || "",
  };
}

function summarizeTrueRunTasks(entries) {
  const latestByTask = new Map();
  for (const entry of entries) {
    const taskId = entry.payload.task?.id || "";
    if (!taskId) {
      continue;
    }
    const current = latestByTask.get(taskId);
    if (!current) {
      latestByTask.set(taskId, entry);
      continue;
    }
    const currentAt = current.payload.generatedAt || "";
    const entryAt = entry.payload.generatedAt || "";
    if (
      entryAt > currentAt ||
      (entryAt === currentAt && entry.path > current.path)
    ) {
      latestByTask.set(taskId, entry);
    }
  }

  return [...latestByTask.values()].map((entry) => ({
    path: entry.path,
    generatedAt: entry.payload.generatedAt || "",
    taskId: entry.payload.task?.id || "",
    verdict: entry.payload.verdict || "",
    execution: {
      providerInvoked: Boolean(entry.payload.execution?.providerInvoked),
      verifierInvoked: Boolean(entry.payload.execution?.verifierInvoked),
      dockerInvoked: Boolean(entry.payload.execution?.dockerInvoked),
      liveProviderUsed: Boolean(entry.payload.execution?.liveProviderUsed),
      trueRunInvoked: Boolean(entry.payload.execution?.trueRunInvoked),
      currentChainInvoked: Boolean(
        entry.payload.execution?.currentChainInvoked,
      ),
      currentChain: {
        target: String(entry.payload.execution?.currentChain?.target || ""),
        appServerMethod: String(
          entry.payload.execution?.currentChain?.appServerMethod || "",
        ),
        evidenceExportMethod: String(
          entry.payload.execution?.currentChain?.evidenceExportMethod || "",
        ),
        externalVerifier:
          entry.payload.execution?.currentChain?.externalVerifier === true,
        invoked: entry.payload.execution?.currentChain?.invoked === true,
        evidenceExportInvoked:
          entry.payload.execution?.currentChain?.evidenceExportInvoked === true,
      },
    },
    evidencePack: trueRunEvidencePackForEntry(entry),
    blockers: Array.isArray(entry.payload.blockers)
      ? entry.payload.blockers.map((blocker) => ({
          id: blocker.id || "",
          reason: blocker.reason || "",
          label: blocker.label || "",
          phase: blocker.phase || "",
        }))
      : [],
  }));
}

function trueRunEvidenceBlockersForTask(suite, task) {
  if (task.verdict !== "ready") {
    return [];
  }
  const checks = [
    {
      passed: task.execution.currentChainInvoked,
      id: "current_chain_not_invoked",
      reason: "ready_true_run_must_use_lime_app_server_current_chain",
    },
    {
      passed:
        !task.execution.currentChainInvoked ||
        (task.execution.currentChain.target === "lime_app_server_current" &&
          task.execution.currentChain.appServerMethod ===
            "agentSession/turn/start" &&
          task.execution.currentChain.invoked === true),
      id: "current_chain_contract_invalid",
      reason:
        "ready_true_run_must_identify_lime_app_server_current_chain_contract",
    },
    {
      passed: task.execution.trueRunInvoked,
      id: "true_run_not_invoked",
      reason: "ready_true_run_must_execute_agent_turn",
    },
    {
      passed: task.execution.verifierInvoked,
      id: "external_verifier_not_invoked",
      reason: "ready_true_run_must_call_external_verifier",
    },
    {
      passed:
        !task.execution.currentChainInvoked ||
        (task.execution.currentChain.evidenceExportMethod ===
          "evidence/export" &&
          task.execution.currentChain.evidenceExportInvoked === true),
      id: "evidence_export_not_invoked",
      reason: "ready_true_run_must_export_evidence_from_current_chain",
    },
    {
      passed: task.evidencePack.valid,
      id: "evidence_pack_invalid",
      reason:
        task.evidencePack.reason ||
        "ready_true_run_requires_valid_evidence_pack",
    },
  ];

  return checks
    .filter((check) => !check.passed)
    .map((check) => ({
      suiteId: suite.id,
      taskId: task.taskId,
      id: check.id,
      reason: check.reason,
      path: task.path,
      evidencePackPath: task.evidencePack.path || "",
    }));
}

function trueRunEvidenceBlockersForSuite(suite) {
  const externalRunner = suite.runner && suite.runner !== "npm";
  if (
    !suite.requiredForRelease ||
    !externalRunner ||
    suite.adapterStatus !== "ready"
  ) {
    return [];
  }

  const readyTasks = (suite.trueRunTasks || []).filter(
    (task) => task.verdict === "ready",
  );
  const tasksById = new Map(
    (suite.trueRunTasks || []).map((task) => [task.taskId, task]),
  );
  const blockers = readyTasks.flatMap((task) =>
    trueRunEvidenceBlockersForTask(suite, task),
  );
  const taskSet = Array.isArray(suite.taskSet)
    ? suite.taskSet.filter(Boolean)
    : [];
  if (taskSet.length > 0) {
    for (const taskId of taskSet) {
      const task = tasksById.get(taskId);
      if (!task) {
        blockers.push({
          suiteId: suite.id,
          taskId,
          id: "task_set_true_run_missing",
          reason: "required_external_suite_must_cover_full_task_set",
          path: "",
          evidencePackPath: "",
        });
        continue;
      }
      if (task.verdict !== "ready") {
        blockers.push({
          suiteId: suite.id,
          taskId,
          id: "task_set_true_run_not_ready",
          reason:
            "required_external_suite_task_must_have_ready_current_chain_true_run",
          path: task.path,
          evidencePackPath: task.evidencePack?.path || "",
        });
      }
    }
  } else if (readyTasks.length === 0) {
    blockers.push({
      suiteId: suite.id,
      taskId: "",
      id: "ready_true_run_task_missing",
      reason: "required_external_suite_needs_ready_current_chain_true_run_task",
      path: suite.trueRun?.path || "",
      evidencePackPath: "",
    });
  }
  if (suite.trueRun?.verdict === "ready" && readyTasks.length === 0) {
    blockers.push({
      suiteId: suite.id,
      taskId: "",
      id: "suite_ready_without_task_evidence",
      reason: "ready_true_run_suite_requires_task_level_current_chain_evidence",
      path: suite.trueRun.path,
      evidencePackPath: "",
    });
  }

  return blockers;
}

function buildSuiteReport({
  suite,
  dryRun,
  preflights,
  trueRun,
  trueRunTasks,
  p0GateSteps,
}) {
  const state = suiteEvidenceState({
    suite,
    dryRun,
    preflights,
    trueRun,
    trueRunTasks,
    p0GateSteps,
  });
  const externalRunner = suite.runner && suite.runner !== "npm";
  const releaseBlocking = Boolean(
    suite.requiredForRelease &&
    externalRunner &&
    suite.adapterStatus !== "ready",
  );
  const p0Gate = summarizeP0GateSteps(p0GateSteps);

  return {
    id: suite.id || "",
    priority: suite.priority || "",
    runner: suite.runner || "",
    requiredForRelease: Boolean(suite.requiredForRelease),
    taskSet: Array.isArray(suite.taskSet) ? suite.taskSet : [],
    manifestStatus: suite.status || "",
    adapterStatus: suite.adapterStatus || "",
    state,
    releaseBlocking,
    p0Gate,
    dryRun: dryRun
      ? {
          path: dryRun.path,
          generatedAt: dryRun.payload.generatedAt || "",
          verdict: dryRun.payload.summary?.verdict || "",
          readyCount: dryRun.payload.summary?.readyCount || 0,
          blockedCount: dryRun.payload.summary?.blockedCount || 0,
          taskCount: dryRun.payload.summary?.taskCount || 0,
        }
      : null,
    preflights: summarizePreflights(preflights),
    trueRun: trueRun
      ? {
          path: trueRun.path,
          generatedAt: trueRun.payload.generatedAt || "",
          verdict: trueRun.payload.summary?.verdict || "",
          readyCount: trueRun.payload.summary?.readyCount || 0,
          blockedCount: trueRun.payload.summary?.blockedCount || 0,
          taskCount: trueRun.payload.summary?.taskCount || 0,
        }
      : null,
    trueRunTasks: summarizeTrueRunTasks(trueRunTasks),
  };
}

function buildBenchmarkReleaseSummary({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  evidenceRoot = DEFAULT_EVIDENCE_ROOT,
  dryRunSummaryPaths = [],
  preflightSummaryPaths = [],
} = {}) {
  const issues = [];
  const resolvedManifestPath = path.resolve(rootDir, manifestPath);
  let manifest = null;
  try {
    manifest = readJsonFile(resolvedManifestPath);
  } catch (error) {
    issues.push(`${manifestPath}: manifest 读取失败：${error.message}`);
    manifest = {};
  }

  const evidence = discoverEvidence(
    rootDir,
    { evidenceRoot, dryRunSummaryPaths, preflightSummaryPaths },
    issues,
  );
  const { dryRuns, preflights, trueRuns, trueRunTasks, p0GateSteps } =
    groupEvidence(evidence);
  const suites = Array.isArray(manifest.suites) ? manifest.suites : [];
  const suiteReports = suites.map((suite) => {
    const dryRun = latestByGeneratedAt(dryRuns.get(suite.id) || []);
    const suitePreflights = preflights.get(suite.id) || [];
    const trueRun = latestByGeneratedAt(trueRuns.get(suite.id) || []);
    const suiteTrueRunTasks = trueRunTasks.get(suite.id) || [];
    const suiteP0GateSteps = [...p0GateSteps.values()].filter(
      (entry) => suiteIdFromP0Step(entry.payload) === suite.id,
    );
    return buildSuiteReport({
      suite,
      dryRun,
      preflights: suitePreflights,
      trueRun,
      trueRunTasks: suiteTrueRunTasks,
      p0GateSteps: suiteP0GateSteps,
    });
  });

  for (const suite of suiteReports) {
    const externalRunner = suite.runner && suite.runner !== "npm";
    if (
      suite.requiredForRelease &&
      externalRunner &&
      !suite.dryRun &&
      suite.preflights.length === 0
    ) {
      issues.push(
        `${suite.id}: required external suite 缺少 dry-run 或 preflight evidence`,
      );
    }
  }

  const releaseBlockers = suiteReports
    .filter((suite) => suite.releaseBlocking)
    .map(
      (suite) =>
        `${suite.id}: adapterStatus=${suite.adapterStatus || "(empty)"}，尚不能作为 release gate 运行`,
    );

  const p0GateBlockers = suiteReports.flatMap((suite) =>
    p0GateBlockersForSuite({
      rootDir,
      evidenceRoot,
      suite,
      manifestSuites: suites,
    }),
  );

  const preflightBlockers = suiteReports.flatMap((suite) =>
    suite.preflights.flatMap((preflight) =>
      preflight.blockers.map((blocker) => ({
        suiteId: suite.id,
        taskId: preflight.taskId,
        id: blocker.id,
        reason: blocker.reason,
      })),
    ),
  );
  const trueRunBlockers = suiteReports.flatMap((suite) => [
    ...(suite.trueRunTasks || []).flatMap((task) =>
      task.blockers.map((blocker) => ({
        suiteId: suite.id,
        taskId: task.taskId,
        id: blocker.id,
        reason: blocker.reason,
        phase: blocker.phase,
      })),
    ),
    ...((suite.trueRun?.blockedCount || 0) > 0
      ? [
          {
            suiteId: suite.id,
            taskId: "",
            id: "suite_true_run_blocked",
            reason: `blockedCount=${suite.trueRun.blockedCount}`,
            phase: "suite",
          },
        ]
      : []),
  ]);
  const trueRunEvidenceBlockers = suiteReports.flatMap((suite) =>
    trueRunEvidenceBlockersForSuite(suite),
  );

  return {
    schemaVersion: "benchmark-release-summary-v1",
    generatedAt: new Date().toISOString(),
    manifestPath: relativePath(rootDir, resolvedManifestPath),
    evidenceRoot: normalizePath(evidenceRoot),
    datasetVersion: manifest.datasetVersion || "",
    releaseReady:
      issues.length === 0 &&
      releaseBlockers.length === 0 &&
      p0GateBlockers.length === 0 &&
      preflightBlockers.length === 0 &&
      trueRunBlockers.length === 0 &&
      trueRunEvidenceBlockers.length === 0,
    summary: {
      suiteCount: suiteReports.length,
      evidenceFileCount: evidence.length,
      dryRunSuiteCount: evidence.filter(
        (entry) => entry.kind === "dry_run_suite",
      ).length,
      preflightCount: evidence.filter(
        (entry) => entry.kind === "true_run_preflight",
      ).length,
      trueRunSuiteCount: evidence.filter(
        (entry) => entry.kind === "true_run_suite",
      ).length,
      trueRunTaskEvidenceCount: evidence.filter(
        (entry) => entry.kind === "true_run_task",
      ).length,
      trueRunTaskCount: suiteReports.reduce(
        (count, suite) => count + suite.trueRunTasks.length,
        0,
      ),
      p0GateStepCount: suiteReports.reduce(
        (count, suite) => count + suite.p0Gate.length,
        0,
      ),
      p0GatePassedCount: suiteReports.reduce(
        (count, suite) =>
          count +
          suite.p0Gate.filter((step) => step.status === "passed").length,
        0,
      ),
      p0GateFailedCount: suiteReports.reduce(
        (count, suite) =>
          count +
          suite.p0Gate.filter((step) => step.status === "failed").length,
        0,
      ),
      p0GateSkippedCount: suiteReports.reduce(
        (count, suite) =>
          count +
          suite.p0Gate.filter((step) => step.status === "skipped").length,
        0,
      ),
      releaseBlockerCount: releaseBlockers.length,
      p0GateBlockerCount: p0GateBlockers.length,
      preflightBlockerCount: preflightBlockers.length,
      trueRunBlockerCount: trueRunBlockers.length,
      trueRunEvidenceBlockerCount: trueRunEvidenceBlockers.length,
      issueCount: issues.length,
    },
    suites: suiteReports,
    releaseBlockers,
    p0GateBlockers,
    preflightBlockers,
    trueRunBlockers,
    trueRunEvidenceBlockers,
    issues,
  };
}

function validateBenchmarkReleaseSummary(summary) {
  return {
    valid: Array.isArray(summary.issues) && summary.issues.length === 0,
    issues: summary.issues || [],
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const summary = buildBenchmarkReleaseSummary({
    rootDir: process.cwd(),
    manifestPath: options.manifestPath,
    evidenceRoot: options.evidenceRoot,
    dryRunSummaryPaths: options.dryRunSummaryPaths,
    preflightSummaryPaths: options.preflightSummaryPaths,
  });
  const validation = validateBenchmarkReleaseSummary(summary);
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...summary, validation }, null, 2)}\n`
      : renderMarkdown(summary);
  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[benchmark-release-summary] ${issue}`);
    }
    process.exit(1);
  }
  if (options.releaseGate && !summary.releaseReady) {
    console.error("[benchmark-release-summary] releaseReady=false");
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

export {
  buildBenchmarkReleaseSummary,
  discoverEvidence,
  renderMarkdown,
  validateBenchmarkReleaseSummary,
};
