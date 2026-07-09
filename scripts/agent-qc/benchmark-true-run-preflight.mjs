#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildDryRunReport } from "./benchmark-dry-run.mjs";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_OUTPUT_ROOT = ".lime/benchmark/runs/manual-true-run-preflight";
const COMMAND_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const result = {
    check: false,
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
Lime Benchmark True Run Preflight

用法:
  npm run agent-qc:benchmark:true-run-preflight -- --suite terminal-bench-release-slice --task hello-world --check
  npm run agent-qc:benchmark:true-run-preflight -- --suite deepswe-fixed-ten --task ytt-jsonpath-query-api --check
  npm run agent-qc:benchmark:true-run-preflight -- --suite terminal-bench-release-slice --task hello-world --output .lime/benchmark/runs/true-run-preflight/terminal-bench/hello-world

选项:
  --manifest PATH     release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --suite ID          要检查的 suite id
  --task ID           要检查的 task id；默认 suite.taskSet[0]
  --output PATH       输出目录；默认 <output-root>/<suite>/<task>
  --output-root PATH  默认输出根目录，默认 ${DEFAULT_OUTPUT_ROOT}
  --format FMT        输出格式：json | markdown
  --check             preflight blocked 时非 0 退出
  -h, --help          显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
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

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function readGitHeadFile(repoPath) {
  const headPath = path.join(repoPath, ".git", "HEAD");
  if (!fs.existsSync(headPath)) {
    return "";
  }

  const headContent = fs.readFileSync(headPath, "utf8").trim();
  const refPrefix = "ref:";
  if (!headContent.startsWith(refPrefix)) {
    return headContent;
  }

  const refPath = headContent.slice(refPrefix.length).trim();
  const resolvedRefPath = path.join(repoPath, ".git", refPath);
  return fs.existsSync(resolvedRefPath)
    ? fs.readFileSync(resolvedRefPath, "utf8").trim()
    : "";
}

function readGitHead(repoPath) {
  if (!isDirectory(path.join(repoPath, ".git"))) {
    return {
      ok: false,
      head: "",
      reason: "not_a_git_checkout",
    };
  }

  try {
    return {
      ok: true,
      head: execFileSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
      reason: "",
    };
  } catch (error) {
    const fallbackHead = readGitHeadFile(repoPath);
    if (fallbackHead) {
      return {
        ok: true,
        head: fallbackHead,
        reason: "",
      };
    }

    return {
      ok: false,
      head: "",
      reason: error instanceof Error ? error.message : "git_rev_parse_failed",
    };
  }
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

function taskIdForSuite(suite, taskId) {
  const selectedTaskId = taskId || suite.taskSet[0];
  if (!selectedTaskId) {
    throw new Error(`suite ${suite.id} 没有可检查 task`);
  }
  if (!suite.taskSet.includes(selectedTaskId)) {
    throw new Error(`task ${selectedTaskId} 不在 suite ${suite.id} 的 taskSet 中`);
  }
  return selectedTaskId;
}

function outputDirForOptions(options, suiteId, taskId) {
  if (options.outputPath) {
    return path.resolve(process.cwd(), options.outputPath);
  }
  return path.resolve(process.cwd(), options.outputRoot, suiteId, taskId);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    timeout: options.timeoutMs || COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });

  return {
    command,
    args,
    cwd: normalizePath(path.relative(process.cwd(), options.cwd || process.cwd()) || "."),
    status: result.status,
    signal: result.signal || "",
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || "",
  };
}

function commandCheck(id, label, commandResult, blockedReason) {
  const enoent = commandResult.error.includes("ENOENT");
  const timedOut = commandResult.error.includes("ETIMEDOUT") || commandResult.signal === "SIGTERM";
  const status = commandResult.ok ? "ok" : "blocked";
  const reason =
    commandResult.ok
      ? ""
      : enoent
        ? `${blockedReason}_missing`
        : timedOut
          ? `${blockedReason}_timeout`
          : blockedReason;

  return {
    id,
    label,
    status,
    reason,
    command: {
      executable: commandResult.command,
      args: commandResult.args,
      cwd: commandResult.cwd,
      status: commandResult.status,
      signal: commandResult.signal,
      error: commandResult.error,
      stdoutTail: commandResult.stdout.slice(-2_000),
      stderrTail: commandResult.stderr.slice(-2_000),
    },
  };
}

function staticCheck(id, label, passed, reason, extra = {}) {
  return {
    id,
    label,
    status: passed ? "ok" : "blocked",
    reason: passed ? "" : reason,
    ...extra,
  };
}

function sourceCheck(source) {
  const sourceRoot = path.resolve(process.cwd(), source.localPath || "");
  const exists = Boolean(source.localPath && isDirectory(sourceRoot));
  const gitHead = exists
    ? readGitHead(sourceRoot)
    : { ok: false, head: "", reason: "source_missing" };
  const commitMatches = Boolean(source.commit && gitHead.head === source.commit);
  const status = exists && commitMatches ? "ok" : "blocked";
  const reason = !exists
    ? "source_missing"
    : !gitHead.ok
      ? gitHead.reason
      : !commitMatches
        ? "source_commit_mismatch"
        : "";

  return {
    id: "source_checkout",
    label: "source repo exists and commit matches manifest",
    status,
    reason,
    sourceRoot: normalizePath(path.relative(process.cwd(), sourceRoot)),
    expectedCommit: source.commit || "",
    actualCommit: gitHead.head,
  };
}

function requiredFilesCheck(dryRunReport) {
  return {
    id: "required_task_files",
    label: "task files required by adapter are present",
    status: dryRunReport.missingFiles.length === 0 ? "ok" : "blocked",
    reason:
      dryRunReport.missingFiles.length === 0
        ? ""
        : "required_task_files_missing",
    requiredCount: dryRunReport.requiredFiles.length,
    missingFiles: dryRunReport.missingFiles,
  };
}

function dockerChecks(commandRunner) {
  const dockerVersion = commandRunner("docker", ["--version"]);
  const checks = [
    commandCheck("docker_cli", "Docker CLI is available", dockerVersion, "docker_cli"),
  ];

  if (dockerVersion.ok) {
    checks.push(
      commandCheck(
        "docker_daemon",
        "Docker daemon is reachable",
        commandRunner("docker", ["info", "--format", "{{json .ServerVersion}}"]),
        "docker_daemon_unreachable",
      ),
    );
  } else {
    checks.push({
      id: "docker_daemon",
      label: "Docker daemon is reachable",
      status: "skipped",
      reason: "docker_cli_missing",
    });
  }

  return checks;
}

function terminalBenchChecks({ commandRunner, sourceRoot }) {
  const checks = [];
  const uvVersion = commandRunner("uv", ["--version"]);
  checks.push(commandCheck("uv_cli", "uv CLI is available", uvVersion, "uv_cli"));
  checks.push(...dockerChecks(commandRunner));

  const tbCli = commandRunner("tb", ["--help"]);
  if (tbCli.ok) {
    checks.push(
      commandCheck(
        "terminal_bench_cli",
        "Terminal-Bench tb CLI is available globally",
        tbCli,
        "terminal_bench_cli",
      ),
    );
  } else {
    checks.push({
      id: "terminal_bench_cli",
      label: "Terminal-Bench tb CLI is available globally",
      status: "skipped",
      reason: "global_tb_cli_missing_try_uv",
      command: {
        executable: tbCli.command,
        args: tbCli.args,
        cwd: tbCli.cwd,
        status: tbCli.status,
        signal: tbCli.signal,
        error: tbCli.error,
        stdoutTail: tbCli.stdout.slice(-2_000),
        stderrTail: tbCli.stderr.slice(-2_000),
      },
    });
  }

  if (!tbCli.ok && uvVersion.ok) {
    checks.push(
      commandCheck(
        "terminal_bench_uv_cli",
        "Terminal-Bench tb CLI is available through uv without dependency sync",
        commandRunner("uv", ["run", "--project", sourceRoot, "--no-sync", "tb", "--help"], {
          cwd: sourceRoot,
        }),
        "terminal_bench_uv_cli",
      ),
    );
  } else if (tbCli.ok) {
    checks.push({
      id: "terminal_bench_uv_cli",
      label: "Terminal-Bench tb CLI is available through uv without dependency sync",
      status: "skipped",
      reason: "global_tb_cli_available",
    });
  } else {
    checks.push({
      id: "terminal_bench_uv_cli",
      label: "Terminal-Bench tb CLI is available through uv without dependency sync",
      status: "skipped",
      reason: "uv_cli_missing",
    });
  }

  return checks;
}

function extractTomlString(source, key) {
  const match = source.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : "";
}

function extractPierVersion(source) {
  const direct = source.match(/\b(?:pier|datacurve-pier)\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
  if (direct) {
    return direct[1];
  }
  const packageStyle = source.match(/datacurve-pier\s+v?([0-9]+\.[0-9]+\.[0-9]+)/i);
  return packageStyle ? packageStyle[1] : "";
}

function compareSemver(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }
  return 0;
}

function pierVersionCheck(id, label, commandResult, blockedReason) {
  const baseCheck = commandCheck(id, label, commandResult, blockedReason);
  if (baseCheck.status !== "ok") {
    return baseCheck;
  }

  const version = extractPierVersion(`${commandResult.stdout}\n${commandResult.stderr}`);
  const meetsMinimum = Boolean(version) && compareSemver(version, "0.3.0") >= 0;
  return {
    ...baseCheck,
    status: meetsMinimum ? "ok" : "blocked",
    reason: meetsMinimum
      ? ""
      : version
        ? "pier_version_below_0_3_0"
        : "pier_version_unknown",
    version,
    minimumVersion: "0.3.0",
  };
}

function deepSweTaskFormatChecks(taskPath) {
  const taskTomlPath = path.join(taskPath, "task.toml");
  const taskToml = readTextIfExists(taskTomlPath);
  const schemaVersion = extractTomlString(taskToml, "schema_version");
  const verifierEnvironmentMode = extractTomlString(taskToml, "environment_mode");
  const repositoryUrl = extractTomlString(taskToml, "repository_url");
  const baseCommitHash = extractTomlString(taskToml, "base_commit_hash");
  const language = extractTomlString(taskToml, "language");
  const dockerImage = extractTomlString(taskToml, "docker_image");
  const artifactsConfigured = taskToml.includes("/logs/artifacts/model.patch");
  const missingMetadata = [
    ["schema_version", schemaVersion],
    ["repository_url", repositoryUrl],
    ["base_commit_hash", baseCommitHash],
    ["language", language],
    ["docker_image", dockerImage],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const metadataValid =
    missingMetadata.length === 0 &&
    schemaVersion === "1.1" &&
    verifierEnvironmentMode === "separate" &&
    artifactsConfigured;

  const verifierFiles = [
    "pre_artifacts.sh",
    "tests/Dockerfile",
    "tests/test.patch",
    "tests/test.sh",
    "tests/grader.py",
    "tests/config.json",
    "environment/Dockerfile",
  ];
  const missingVerifierFiles = verifierFiles.filter(
    (relativePath) => !fs.existsSync(path.join(taskPath, relativePath)),
  );

  return [
    staticCheck(
      "deep_swe_task_metadata",
      "DeepSWE task metadata supports v1.1 separate verifier grading",
      metadataValid,
      missingMetadata.length > 0
        ? "deep_swe_task_metadata_missing"
        : schemaVersion !== "1.1"
          ? "deep_swe_schema_version_not_1_1"
          : verifierEnvironmentMode !== "separate"
            ? "deep_swe_verifier_environment_not_separate"
            : "deep_swe_artifact_patch_not_configured",
      {
        metadata: {
          schemaVersion,
          verifierEnvironmentMode,
          repositoryUrl,
          baseCommitHash,
          language,
          dockerImage,
          artifactsConfigured,
          missingMetadata,
        },
      },
    ),
    staticCheck(
      "deep_swe_verifier_files",
      "DeepSWE verifier files required for separate grading are present",
      missingVerifierFiles.length === 0,
      "deep_swe_verifier_files_missing",
      {
        requiredFiles: verifierFiles,
        missingFiles: missingVerifierFiles,
      },
    ),
  ];
}

function deepSweChecks({ commandRunner, taskPath }) {
  const checks = [];
  const uvVersion = commandRunner("uv", ["--version"]);
  checks.push(commandCheck("uv_cli", "uv CLI is available", uvVersion, "uv_cli"));
  checks.push(...dockerChecks(commandRunner));
  checks.push(...deepSweTaskFormatChecks(taskPath));

  const pierVersion = commandRunner("pier", ["--version"]);
  if (pierVersion.ok) {
    checks.push(
      pierVersionCheck(
        "deep_swe_pier_cli",
        "Pier CLI is available and meets DeepSWE >=0.3.0 requirement",
        pierVersion,
        "pier_cli",
      ),
    );
    checks.push({
      id: "deep_swe_pier_uv_tool",
      label: "datacurve-pier is visible through uv tool list",
      status: "skipped",
      reason: "global_pier_cli_available",
    });
  } else {
    checks.push({
      id: "deep_swe_pier_cli",
      label: "Pier CLI is available and meets DeepSWE >=0.3.0 requirement",
      status: "skipped",
      reason: "global_pier_cli_missing_try_uv_tool",
      command: {
        executable: pierVersion.command,
        args: pierVersion.args,
        cwd: pierVersion.cwd,
        status: pierVersion.status,
        signal: pierVersion.signal,
        error: pierVersion.error,
        stdoutTail: pierVersion.stdout.slice(-2_000),
        stderrTail: pierVersion.stderr.slice(-2_000),
      },
    });
    checks.push(
      pierVersionCheck(
        "deep_swe_pier_uv_tool",
        "datacurve-pier is visible through uv tool list",
        commandRunner("uv", ["tool", "list"]),
        "pier_uv_tool",
      ),
    );
  }

  return checks;
}

function buildPreflightReport({
  manifest,
  suite,
  taskId,
  commandRunner = runCommand,
}) {
  const dryRunReport = buildDryRunReport({ manifest, suite, taskId });
  const sourceRoot = path.resolve(process.cwd(), dryRunReport.source.localPath);
  const taskPath = path.resolve(process.cwd(), dryRunReport.task.path);
  const checks = [
    sourceCheck(dryRunReport.source),
    requiredFilesCheck(dryRunReport),
  ];

  if (suite.runner === "harbor-adapter") {
    checks.push(
      ...terminalBenchChecks({
        commandRunner,
        sourceRoot,
      }),
    );
    const hasTbCli = checks.some(
      (check) =>
        ["terminal_bench_cli", "terminal_bench_uv_cli"].includes(check.id) &&
        check.status === "ok",
    );
    if (!hasTbCli) {
      checks.push({
        id: "terminal_bench_runner_entry",
        label: "Terminal-Bench runner entry is callable",
        status: "blocked",
        reason: "terminal_bench_cli_unavailable",
      });
    }
  } else if (suite.runner === "deepswe-adapter") {
    checks.push(
      ...deepSweChecks({
        commandRunner,
        taskPath,
      }),
    );
    const hasPierRunner = checks.some(
      (check) =>
        ["deep_swe_pier_cli", "deep_swe_pier_uv_tool"].includes(check.id) &&
        check.status === "ok",
    );
    if (!hasPierRunner) {
      checks.push({
        id: "deep_swe_runner_entry",
        label: "DeepSWE Pier runner entry is callable",
        status: "blocked",
        reason: "deep_swe_pier_unavailable",
      });
    }
  } else {
    checks.push({
      id: "benchmark_runner_supported",
      label: "Benchmark runner is supported by true-run preflight",
      status: "blocked",
      reason: `unsupported_runner:${suite.runner}`,
    });
  }

  const blockers = checks
    .filter((check) => check.status === "blocked")
    .map((check) => ({
      id: check.id,
      reason: check.reason,
      label: check.label,
    }));
  const verdict = blockers.length === 0 ? "ready" : "blocked";

  return {
    schemaVersion: "benchmark-true-run-preflight-v1",
    generatedAt: new Date().toISOString(),
    mode: "true_run_preflight",
    verdict,
    suite: dryRunReport.suite,
    source: dryRunReport.source,
    task: dryRunReport.task,
    execution: {
      providerInvoked: false,
      verifierInvoked: false,
      dockerInvoked: false,
      liveProviderUsed: false,
      trueRunInvoked: false,
      reason:
        verdict === "ready"
          ? "preflight 通过；仍需由 true-run adapter 调用 Lime current 主链和外部 verifier。"
          : "preflight 被阻断；未执行 Agent turn、Docker 任务或外部 verifier。",
    },
    checks,
    blockers,
    requiredFiles: dryRunReport.requiredFiles,
    missingFiles: dryRunReport.missingFiles,
  };
}

function buildTrajectory(report) {
  return {
    schemaVersion: "benchmark-trajectory-true-run-preflight-v1",
    suiteId: report.suite.id,
    taskId: report.task.id,
    mode: report.mode,
    events: report.checks.map((check, index) => ({
      sequence: index + 1,
      type: `benchmark.preflight.${check.id}`,
      status: check.status,
      reason: check.reason || "",
    })),
  };
}

function buildToolTimeline(report) {
  return {
    schemaVersion: "benchmark-tool-timeline-true-run-preflight-v1",
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
    verdict: report.verdict === "ready" ? "not_run" : "blocked",
    reward: null,
    verifierInvoked: false,
    reason: report.execution.reason,
    blockers: report.blockers,
  };
}

function buildStdout(report) {
  return [
    `[benchmark-true-run-preflight] suite=${report.suite.id} task=${report.task.id}`,
    `[benchmark-true-run-preflight] verdict=${report.verdict}`,
    "[benchmark-true-run-preflight] provider not invoked",
    "[benchmark-true-run-preflight] verifier not invoked",
    ...report.checks.map(
      (check) =>
        `[benchmark-true-run-preflight] ${check.id}=${check.status}${check.reason ? ` reason=${check.reason}` : ""}`,
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

function buildEvidenceManifest(report, outputDir, files) {
  return {
    schemaVersion: "benchmark-evidence-pack-v1",
    generatedAt: new Date().toISOString(),
    dryRun: false,
    preflight: true,
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

function writePreflightArtifacts(report, outputDir) {
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

function runPreflight(rootDir, options) {
  const manifest = readJsonFile(path.resolve(rootDir, options.manifestPath));
  const suite = findSuite(manifest, options.suiteId);
  const taskId = taskIdForSuite(suite, options.taskId);
  const report = buildPreflightReport({ manifest, suite, taskId });
  const outputDir = outputDirForOptions(options, suite.id, taskId);
  return writePreflightArtifacts(report, outputDir);
}

function renderMarkdown(report) {
  const lines = [
    "# Benchmark True Run Preflight",
    "",
    `- suite: ${report.suite.id}`,
    `- task: ${report.task.id}`,
    `- verdict: ${report.verdict}`,
    `- outputDir: ${report.outputDir}`,
    `- providerInvoked: ${report.execution.providerInvoked ? "yes" : "no"}`,
    `- verifierInvoked: ${report.execution.verifierInvoked ? "yes" : "no"}`,
    "",
    "## Checks",
    "",
    "| Check | Status | Reason |",
    "| --- | --- | --- |",
  ];

  for (const check of report.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${check.reason || "-"} |`);
  }

  lines.push("", "## Artifacts", "");
  for (const artifact of report.artifacts) {
    lines.push(`- ${artifact}`);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = runPreflight(process.cwd(), options);
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderMarkdown(report);
  process.stdout.write(content);

  if (options.check && report.verdict !== "ready") {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildPreflightReport,
  buildToolTimeline,
  buildTrajectory,
  buildVerifierResult,
  runPreflight,
  writePreflightArtifacts,
};
