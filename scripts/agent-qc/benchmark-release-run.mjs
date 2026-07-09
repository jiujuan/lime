#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { renderConsoleSummary, renderMarkdown } from "./benchmark-release-run-render.mjs";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_VERSION = new Date().toISOString().slice(0, 10);
const COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_MIN_FREE_MB = 512;

function parseArgs(argv) {
  const result = {
    baselineSummaryPath: "",
    baselineVersion: "",
    check: false,
    dryRunOnly: false,
    format: "json",
    fullExternalSuites: false,
    help: false,
    includeP0: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    minFreeMb: DEFAULT_MIN_FREE_MB,
    outputRoot: "",
    promoteBaseline: false,
    strictGate: false,
    stdoutMode: "full",
    version: DEFAULT_VERSION,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline-summary" && argv[index + 1]) {
      result.baselineSummaryPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--baseline-version" && argv[index + 1]) {
      result.baselineVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--dry-run-only") {
      result.dryRunOnly = true;
      continue;
    }
    if (arg === "--full-external-suites") {
      result.fullExternalSuites = true;
      continue;
    }
    if (arg === "--include-p0") {
      result.includeP0 = true;
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
    if (arg === "--min-free-mb" && argv[index + 1]) {
      result.minFreeMb = Number(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output-root" && argv[index + 1]) {
      result.outputRoot = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--promote-baseline") {
      result.promoteBaseline = true;
      continue;
    }
    if (arg === "--strict-gate") {
      result.strictGate = true;
      continue;
    }
    if (arg === "--stdout" && argv[index + 1]) {
      result.stdoutMode = String(argv[index + 1]).trim();
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
  if (!Number.isFinite(result.minFreeMb) || result.minFreeMb < 0) {
    throw new Error("--min-free-mb 必须是非负数字");
  }
  if (!["full", "summary", "none"].includes(result.stdoutMode)) {
    throw new Error("--stdout 只支持 full、summary 或 none");
  }
  if (result.baselineSummaryPath && result.baselineVersion) {
    throw new Error("--baseline-summary 和 --baseline-version 只能二选一");
  }
  if (result.strictGate && !result.includeP0) {
    throw new Error("--strict-gate 必须和 --include-p0 一起使用");
  }
  if (result.strictGate && !result.baselineSummaryPath && !result.baselineVersion) {
    throw new Error("--strict-gate 需要 --baseline-version 或 --baseline-summary");
  }
  if (result.promoteBaseline && !result.strictGate) {
    throw new Error("--promote-baseline 必须和 --strict-gate 一起使用");
  }
  if (result.promoteBaseline && !result.baselineSummaryPath && !result.baselineVersion) {
    throw new Error("--promote-baseline 需要 --baseline-version 或 --baseline-summary");
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark Release Run

用法:
  npm run agent-qc:benchmark-release:run -- --version 2026-07-09 --check
  npm run agent-qc:benchmark-release:run -- --version 1.97.0 --output-root .lime/benchmark/releases/1.97.0 --check
  npm run agent-qc:benchmark-release:run -- --version 1.97.0 --strict-gate --check

选项:
  --manifest PATH    release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --version VALUE    release 版本或 run id，默认 ${DEFAULT_VERSION}
  --output-root PATH evidence 根目录，默认 .lime/benchmark/releases/<version>
  --baseline-version VALUE
                     上一稳定版本 id；会解析为 .lime/benchmark/releases/<baseline>/benchmark-release-summary.json
  --baseline-summary PATH
                     上一稳定版本 benchmark-release-summary.json；提供后会生成 benchmark-release-compare.json
  --min-free-mb N    output root 所在卷的最低可用空间，默认 ${DEFAULT_MIN_FREE_MB}
  --include-p0      执行 manifest 中 runner=npm 的 P0 基础门禁；正式 RC / release 推荐启用
  --dry-run-only     只跳过 P1 preflight / fail-closed true-run；若带 --include-p0 仍执行 P0 门禁
  --full-external-suites
                    对 P1 external suite 的全部 taskSet 执行 preflight / true-run；strict gate 自动启用
  --strict-gate      正式放行 gate；必须同时提供 --include-p0 和 baseline
  --promote-baseline strict gate 通过后生成 benchmark-baseline.json；必须同时提供 baseline 并启用 strict gate
  --format FMT       输出格式：json | markdown
  --stdout MODE      stdout 输出：full | summary | none；默认 full，完整 report 始终写入 benchmark-release-run.json
  --check            runner 结构失败或必需命令失败时非 0；不因 releaseReady=false 失败，除非带 --strict-gate
  -h, --help         显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function releaseRoot(version, outputRoot) {
  return normalizePath(outputRoot || `.lime/benchmark/releases/${version}`);
}

function baselineSummaryPathForVersion(version) {
  return normalizePath(`.lime/benchmark/releases/${version}/benchmark-release-summary.json`);
}

function baselineDescriptorPathForSummary(summaryPath) {
  return normalizePath(path.join(path.dirname(summaryPath), "benchmark-baseline.json"));
}

function resolveBaselineSummaryPath({ baselineSummaryPath = "", baselineVersion = "" } = {}) {
  if (baselineSummaryPath && baselineVersion) {
    throw new Error("baselineSummaryPath 和 baselineVersion 只能二选一");
  }
  if (baselineSummaryPath) {
    return normalizePath(baselineSummaryPath);
  }
  if (baselineVersion) {
    return baselineSummaryPathForVersion(baselineVersion);
  }
  return "";
}

function validateBaselineDescriptorForStrictGate({
  rootDir,
  strictGate,
  baselineSummaryPath = "",
} = {}) {
  if (!strictGate) {
    return {
      status: "not_required",
      descriptorPath: "",
      issues: [],
      payload: null,
    };
  }
  const descriptorPath = baselineDescriptorPathForSummary(baselineSummaryPath);
  const resolvedDescriptorPath = path.resolve(rootDir, descriptorPath);
  const issues = [];
  let payload = null;
  if (!fs.existsSync(resolvedDescriptorPath)) {
    issues.push(`${descriptorPath}: baseline descriptor 不存在`);
  } else {
    try {
      payload = readJsonFile(resolvedDescriptorPath);
    } catch (error) {
      issues.push(`${descriptorPath}: baseline descriptor 读取失败：${error.message}`);
    }
  }
  if (payload) {
    if (payload.schemaVersion !== "benchmark-release-baseline-v1") {
      issues.push(`${descriptorPath}: schemaVersion 不是 benchmark-release-baseline-v1`);
    }
    if (payload.baselineReady !== true) {
      issues.push(`${descriptorPath}: baselineReady 不是 true`);
    }
    if (payload.releaseReady !== true) {
      issues.push(`${descriptorPath}: releaseReady 不是 true`);
    }
    if (payload.allowNotReady === true || payload.baselineKind === "bootstrap") {
      issues.push(`${descriptorPath}: bootstrap baseline 不能用于 strict gate`);
    }
    const descriptorSummaryPath = payload.summaryPath
      ? normalizePath(payload.summaryPath)
      : "";
    if (descriptorSummaryPath && descriptorSummaryPath !== normalizePath(baselineSummaryPath)) {
      issues.push(
        `${descriptorPath}: summaryPath=${descriptorSummaryPath} 与 baselineSummaryPath=${normalizePath(baselineSummaryPath)} 不一致`,
      );
    }
  }
  return {
    status: issues.length === 0 ? "ready" : "blocked",
    descriptorPath,
    issues,
    payload,
  };
}

function nearestExistingPath(filePath) {
  let current = path.resolve(filePath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

function defaultStorageChecker({ rootDir, outputRoot, minFreeBytes }) {
  const resolvedOutputRoot = path.resolve(rootDir, outputRoot);
  try {
    fs.mkdirSync(resolvedOutputRoot, { recursive: true });
  } catch (error) {
    return {
      status: "blocked",
      reason: "output_root_create_failed",
      outputRoot: normalizePath(outputRoot),
      checkedPath: normalizePath(nearestExistingPath(resolvedOutputRoot)),
      minFreeBytes,
      availableBytes: null,
      totalBytes: null,
      error: error.message,
    };
  }

  if (typeof fs.statfsSync !== "function") {
    return {
      status: "unknown",
      reason: "statfs_unavailable",
      outputRoot: normalizePath(outputRoot),
      checkedPath: normalizePath(resolvedOutputRoot),
      minFreeBytes,
      availableBytes: null,
      totalBytes: null,
      error: "",
    };
  }

  try {
    const stat = fs.statfsSync(resolvedOutputRoot);
    const availableBytes = Number(stat.bavail) * Number(stat.bsize);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    return {
      status: availableBytes < minFreeBytes ? "blocked" : "ready",
      reason: availableBytes < minFreeBytes ? "available_below_minimum" : "",
      outputRoot: normalizePath(outputRoot),
      checkedPath: normalizePath(resolvedOutputRoot),
      minFreeBytes,
      availableBytes,
      totalBytes,
      error: "",
    };
  } catch (error) {
    return {
      status: "unknown",
      reason: "statfs_failed",
      outputRoot: normalizePath(outputRoot),
      checkedPath: normalizePath(resolvedOutputRoot),
      minFreeBytes,
      availableBytes: null,
      totalBytes: null,
      error: error.message,
    };
  }
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function externalSuiteSlug(suite) {
  if (suite.id === "terminal-bench-release-slice") {
    return "terminal-bench";
  }
  if (suite.id === "deepswe-fixed-ten") {
    return "deepswe";
  }
  return suite.id;
}

function trueRunScriptForSuite(suite) {
  if (suite.runner === "harbor-adapter") {
    return "agent-qc:benchmark:terminal-run";
  }
  if (suite.runner === "deepswe-adapter") {
    return "agent-qc:benchmark:deepswe-run";
  }
  return "agent-qc:benchmark:true-run";
}

function makeNpmStep({ id, kind, script, args = [], outputPath = "", blocking = true }) {
  return {
    id,
    kind,
    executable: npmExecutable(),
    args: ["run", script, "--", ...args],
    command: `npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`,
    outputPath,
    blocking,
  };
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNpmRunCommand(command) {
  const parts = String(command).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3 || parts[0] !== "npm" || parts[1] !== "run") {
    throw new Error(`只支持 npm run 命令：${command}`);
  }
  const script = parts[2];
  const extraArgs = parts[3] === "--" ? parts.slice(4) : parts.slice(3);
  return { script, args: extraArgs };
}

function buildNpmSuiteSteps(suite, root) {
  const commands = Array.isArray(suite.commands) ? suite.commands : [];
  return commands.map((command, index) => {
    const parsed = parseNpmRunCommand(command);
    const commandIndex = String(index + 1).padStart(2, "0");
    const scriptSlug = slugify(parsed.script) || `command-${index + 1}`;
    return makeNpmStep({
      id: `${suite.id}:npm-${commandIndex}-${scriptSlug}`,
      kind: "p0_npm_gate",
      script: parsed.script,
      args: parsed.args,
      outputPath: `${root}/p0/${suite.id}/${commandIndex}-${scriptSlug}.json`,
    });
  });
}

function buildExternalSuiteSteps(suite, root, options) {
  const taskSet = Array.isArray(suite.taskSet) ? suite.taskSet : [];
  const firstTask = taskSet[0] || "<task-id>";
  const trueRunTaskSet = options.fullExternalSuites ? taskSet : [firstTask];
  const slug = externalSuiteSlug(suite);
  const steps = [
    makeNpmStep({
      id: `${suite.id}:dry-run`,
      kind: "dry_run",
      script: "agent-qc:benchmark:dry-run",
      args: [
        "--manifest",
        options.manifestPath,
        "--suite",
        suite.id,
        "--all-tasks",
        "--output",
        `${root}/${slug}/dry-run`,
        "--check",
      ],
      outputPath: `${root}/${slug}/dry-run/suite-summary.json`,
    }),
  ];

  if (!options.dryRunOnly) {
    steps.push(
      ...trueRunTaskSet.flatMap((taskId) => [
        makeNpmStep({
          id: `${suite.id}:${taskId}:true-run-preflight`,
          kind: "true_run_preflight",
          script: "agent-qc:benchmark:true-run-preflight",
          args: [
            "--manifest",
            options.manifestPath,
            "--suite",
            suite.id,
            "--task",
            taskId,
            "--output",
            `${root}/${slug}/${taskId}-preflight`,
            "--format",
            "json",
          ],
          outputPath: `${root}/${slug}/${taskId}-preflight/summary.json`,
        }),
        makeNpmStep({
          id: `${suite.id}:${taskId}:true-run`,
          kind: "true_run",
          script: trueRunScriptForSuite(suite),
          args: [
            "--manifest",
            options.manifestPath,
            "--task",
            taskId,
            "--output",
            `${root}/${slug}/${taskId}-true-run`,
            "--format",
            "json",
          ],
          outputPath: `${root}/${slug}/${taskId}-true-run/summary.json`,
        }),
      ]),
    );
  }

  return steps;
}

function buildBenchmarkReleaseRunPlan({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  version = DEFAULT_VERSION,
  outputRoot = "",
  baselineSummaryPath = "",
  baselineVersion = "",
  dryRunOnly = false,
  fullExternalSuites = false,
  includeP0 = false,
  promoteBaseline = false,
  strictGate = false,
} = {}) {
  const manifest = readJsonFile(path.resolve(rootDir, manifestPath));
  const root = releaseRoot(version, outputRoot);
  const resolvedBaselineSummaryPath = resolveBaselineSummaryPath({
    baselineSummaryPath,
    baselineVersion,
  });
  if (promoteBaseline && !strictGate) {
    throw new Error("promoteBaseline 必须和 strictGate 一起使用");
  }
  if (strictGate && !includeP0) {
    throw new Error("strictGate 必须和 includeP0 一起使用");
  }
  if (strictGate && !resolvedBaselineSummaryPath) {
    throw new Error("strictGate 需要 baselineSummaryPath 或 baselineVersion");
  }
  if (promoteBaseline && !resolvedBaselineSummaryPath) {
    throw new Error("promoteBaseline 需要 baselineSummaryPath 或 baselineVersion");
  }
  const npmSuites = (manifest.suites || []).filter((suite) => suite.runner === "npm");
  const externalSuites = (manifest.suites || []).filter(
    (suite) => suite.runner && suite.runner !== "npm",
  );
  const shouldRunFullExternalSuites = Boolean(fullExternalSuites || strictGate);
  const steps = [
    makeNpmStep({
      id: "benchmark-release:context",
      kind: "release_context",
      script: "agent-qc:benchmark-release:context",
      args: [
        "--manifest",
        manifestPath,
        "--version",
        version,
        "--output",
        `${root}/run-context.json`,
        "--format",
        "json",
        "--check",
      ],
      outputPath: `${root}/run-context.json`,
    }),
    makeNpmStep({
      id: "benchmark-release:checklist",
      kind: "release_checklist",
      script: "agent-qc:benchmark-release:checklist",
      args: [
        "--manifest",
        manifestPath,
        "--version",
        version,
        "--output-root",
        root,
        "--output",
        `${root}/benchmark-release-checklist.json`,
        "--format",
        "json",
        "--check",
        ...(shouldRunFullExternalSuites ? ["--full-external-suites"] : []),
        ...(strictGate ? ["--strict-gate"] : []),
      ],
      outputPath: `${root}/benchmark-release-checklist.json`,
    }),
    ...(includeP0 ? npmSuites.flatMap((suite) => buildNpmSuiteSteps(suite, root)) : []),
    ...externalSuites.flatMap((suite) =>
      buildExternalSuiteSteps(suite, root, {
        dryRunOnly,
        fullExternalSuites: shouldRunFullExternalSuites,
        manifestPath,
      }),
    ),
    makeNpmStep({
      id: "benchmark-release:summary",
      kind: "release_summary",
      script: "agent-qc:benchmark-release:summary",
      args: [
        "--manifest",
        manifestPath,
        "--evidence-root",
        root,
        "--output",
        `${root}/benchmark-release-summary.json`,
        "--format",
        "json",
        "--check",
        ...(strictGate ? ["--release-gate"] : []),
      ],
      outputPath: `${root}/benchmark-release-summary.json`,
    }),
    makeNpmStep({
      id: "benchmark-release:check",
      kind: "manifest_check",
      script: "agent-qc:benchmark-release:check",
      args: ["--manifest", manifestPath, "--output", `${root}/benchmark-release-check.json`],
      outputPath: `${root}/benchmark-release-check.json`,
    }),
    ...(resolvedBaselineSummaryPath
      ? [
          makeNpmStep({
            id: "benchmark-release:compare",
            kind: "release_compare",
            script: "agent-qc:benchmark-release:compare",
            args: [
              "--manifest",
              manifestPath,
              "--baseline-summary",
              resolvedBaselineSummaryPath,
              "--candidate-summary",
              `${root}/benchmark-release-summary.json`,
              "--output",
              `${root}/benchmark-release-compare.json`,
              "--format",
              "json",
              "--check",
            ],
            outputPath: `${root}/benchmark-release-compare.json`,
          }),
        ]
      : []),
  ];

  if (strictGate) {
    steps.push(
      makeNpmStep({
        id: "benchmark-release:gate",
        kind: "release_gate",
        script: "agent-qc:benchmark-release:gate",
        args: ["--manifest", manifestPath],
        outputPath: "",
      }),
    );
  }

  if (promoteBaseline) {
    steps.push(
      makeNpmStep({
        id: "benchmark-release:baseline",
        kind: "baseline_promotion",
        script: "agent-qc:benchmark-release:baseline",
        args: [
          "--manifest",
          manifestPath,
          "--version",
          version,
          "--summary",
          `${root}/benchmark-release-summary.json`,
          "--compare",
          `${root}/benchmark-release-compare.json`,
          "--output",
          `${root}/benchmark-baseline.json`,
          "--require-compare",
          "--format",
          "json",
          "--check",
        ],
        outputPath: `${root}/benchmark-baseline.json`,
      }),
    );
  }

  return {
    schemaVersion: "benchmark-release-run-plan-v1",
    version,
    manifestPath: normalizePath(manifestPath),
    outputRoot: root,
    baselineSummaryPath: resolvedBaselineSummaryPath,
    baselineVersion: normalizePath(baselineVersion),
    dryRunOnly: Boolean(dryRunOnly),
    fullExternalSuites: shouldRunFullExternalSuites,
    includeP0: Boolean(includeP0),
    promoteBaseline: Boolean(promoteBaseline),
    strictGate: Boolean(strictGate),
    stepCount: steps.length,
    steps,
  };
}

function defaultCommandRunner(step) {
  const result = spawnSync(step.executable, step.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
  return {
    status: result.status,
    signal: result.signal || "",
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || "",
  };
}

function runBenchmarkRelease({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  version = DEFAULT_VERSION,
  outputRoot = "",
  baselineSummaryPath = "",
  baselineVersion = "",
  dryRunOnly = false,
  fullExternalSuites = false,
  includeP0 = false,
  minFreeMb = DEFAULT_MIN_FREE_MB,
  promoteBaseline = false,
  strictGate = false,
  commandRunner = defaultCommandRunner,
  storageChecker = defaultStorageChecker,
  now = () => new Date(),
} = {}) {
  const plan = buildBenchmarkReleaseRunPlan({
    rootDir,
    manifestPath,
    version,
    outputRoot,
    baselineSummaryPath,
    baselineVersion,
    dryRunOnly,
    fullExternalSuites,
    includeP0,
    promoteBaseline,
    strictGate,
  });
  const baselineDescriptor = validateBaselineDescriptorForStrictGate({
    rootDir,
    strictGate: plan.strictGate,
    baselineSummaryPath: plan.baselineSummaryPath,
  });
  if (baselineDescriptor.status === "blocked") {
    const skippedSteps = plan.steps.map((step) => ({
      ...step,
      status: "skipped",
      exitCode: null,
      signal: "",
      error: "",
      stdoutTail: "",
      stderrTail: "",
      reason: "baseline_descriptor_blocked",
    }));
    return {
      schemaVersion: "benchmark-release-run-v1",
      generatedAt: now().toISOString(),
      plan: {
        version: plan.version,
        manifestPath: plan.manifestPath,
        outputRoot: plan.outputRoot,
        baselineSummaryPath: plan.baselineSummaryPath,
        baselineVersion: plan.baselineVersion,
        dryRunOnly: plan.dryRunOnly,
        fullExternalSuites: plan.fullExternalSuites,
        includeP0: plan.includeP0,
        promoteBaseline: plan.promoteBaseline,
        strictGate: plan.strictGate,
      },
      baselineDescriptor,
      storage: {
        status: "skipped",
        reason: "baseline_descriptor_blocked",
        outputRoot: plan.outputRoot,
        checkedPath: "",
        minFreeBytes: minFreeMb * BYTES_PER_MIB,
        availableBytes: null,
        totalBytes: null,
        error: "",
      },
      summary: {
        stepCount: skippedSteps.length,
        passedStepCount: 0,
        failedStepCount: 0,
        skippedStepCount: skippedSteps.length,
        valid: false,
      },
      steps: skippedSteps,
      issues: baselineDescriptor.issues.map((issue) => `baseline_descriptor: ${issue}`),
    };
  }
  const storage = storageChecker({
    rootDir,
    outputRoot: plan.outputRoot,
    minFreeBytes: minFreeMb * BYTES_PER_MIB,
  });
  if (storage.status === "blocked") {
    const skippedSteps = plan.steps.map((step) => ({
      ...step,
      status: "skipped",
      exitCode: null,
      signal: "",
      error: storage.error || "",
      stdoutTail: "",
      stderrTail: "",
      reason: `storage_preflight_${storage.reason}`,
    }));
    return {
      schemaVersion: "benchmark-release-run-v1",
      generatedAt: now().toISOString(),
      plan: {
        version: plan.version,
        manifestPath: plan.manifestPath,
        outputRoot: plan.outputRoot,
        baselineSummaryPath: plan.baselineSummaryPath,
        baselineVersion: plan.baselineVersion,
        dryRunOnly: plan.dryRunOnly,
        fullExternalSuites: plan.fullExternalSuites,
        includeP0: plan.includeP0,
        promoteBaseline: plan.promoteBaseline,
        strictGate: plan.strictGate,
      },
      baselineDescriptor,
      storage,
      summary: {
        stepCount: skippedSteps.length,
        passedStepCount: 0,
        failedStepCount: 0,
        skippedStepCount: skippedSteps.length,
        valid: false,
      },
      steps: skippedSteps,
      issues: [`storage_preflight: ${storage.reason}`],
    };
  }
  const stepResults = [];
  let stopped = false;

  for (const step of plan.steps) {
    if (stopped) {
      const skippedStepResult = {
        ...step,
        status: "skipped",
        exitCode: null,
        signal: "",
        error: "",
        stdoutTail: "",
        stderrTail: "",
        reason: "previous_required_step_failed",
      };
      stepResults.push(skippedStepResult);
      if (skippedStepResult.kind === "p0_npm_gate" && skippedStepResult.outputPath) {
        writeJsonFile(path.resolve(rootDir, skippedStepResult.outputPath), skippedStepResult);
      }
      continue;
    }

    const result = commandRunner(step);
    const passed = result.status === 0;
    const stepResult = {
      ...step,
      status: passed ? "passed" : "failed",
      exitCode: result.status,
      signal: result.signal || "",
      error: result.error || "",
      stdoutTail: String(result.stdout || "").slice(-4_000),
      stderrTail: String(result.stderr || "").slice(-4_000),
      reason: passed ? "" : "command_failed",
    };
    stepResults.push(stepResult);
    if (stepResult.kind === "p0_npm_gate" && stepResult.outputPath) {
      writeJsonFile(path.resolve(rootDir, stepResult.outputPath), stepResult);
    }

    if (step.blocking && !passed) {
      stopped = true;
    }
  }

  const failedSteps = stepResults.filter((step) => step.status === "failed");
  const skippedSteps = stepResults.filter((step) => step.status === "skipped");
  const passedSteps = stepResults.filter((step) => step.status === "passed");
  return {
    schemaVersion: "benchmark-release-run-v1",
    generatedAt: now().toISOString(),
    plan: {
      version: plan.version,
      manifestPath: plan.manifestPath,
      outputRoot: plan.outputRoot,
      baselineSummaryPath: plan.baselineSummaryPath,
      baselineVersion: plan.baselineVersion,
      dryRunOnly: plan.dryRunOnly,
      fullExternalSuites: plan.fullExternalSuites,
      includeP0: plan.includeP0,
      promoteBaseline: plan.promoteBaseline,
      strictGate: plan.strictGate,
    },
    baselineDescriptor,
    storage,
    summary: {
      stepCount: stepResults.length,
      passedStepCount: passedSteps.length,
      failedStepCount: failedSteps.length,
      skippedStepCount: skippedSteps.length,
      valid: failedSteps.length === 0,
    },
    steps: stepResults,
    issues: failedSteps.map((step) => `${step.id}: ${step.reason}`),
  };
}

function validateBenchmarkReleaseRun(report) {
  const issues = [...(report.issues || [])];
  if (report.schemaVersion !== "benchmark-release-run-v1") {
    issues.push("schemaVersion 必须是 benchmark-release-run-v1");
  }
  if (!report.plan?.version) {
    issues.push("version 不能为空");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = runBenchmarkRelease({
    rootDir: process.cwd(),
    manifestPath: options.manifestPath,
    version: options.version,
    outputRoot: options.outputRoot,
    baselineSummaryPath: options.baselineSummaryPath,
    baselineVersion: options.baselineVersion,
    dryRunOnly: options.dryRunOnly,
    fullExternalSuites: options.fullExternalSuites,
    includeP0: options.includeP0,
    minFreeMb: options.minFreeMb,
    promoteBaseline: options.promoteBaseline,
    strictGate: options.strictGate,
  });
  const validation = validateBenchmarkReleaseRun(report);
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...report, validation }, null, 2)}\n`
      : renderMarkdown(report);
  const outputPath = path.join(report.plan.outputRoot, "benchmark-release-run.json");
  let outputWriteError = "";
  try {
    writeJsonFile(outputPath, { ...report, validation });
  } catch (error) {
    outputWriteError = error.message;
  }
  if (options.stdoutMode === "full") {
    process.stdout.write(content);
  } else if (options.stdoutMode === "summary") {
    process.stdout.write(renderConsoleSummary(report, { outputPath, outputWriteError }));
  }
  if (outputWriteError) {
    console.error(`[benchmark-release-run] report 写入失败：${outputWriteError}`);
  }

  if (options.check && (!validation.valid || outputWriteError)) {
    for (const issue of validation.issues) {
      console.error(`[benchmark-release-run] ${issue}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseRunPlan,
  renderConsoleSummary,
  renderMarkdown,
  runBenchmarkRelease,
  validateBenchmarkReleaseRun,
};
