#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import YAML from "yaml";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_OUTPUT_ROOT = ".lime/benchmark/runs/manual-dry-run";

function parseArgs(argv) {
  const result = {
    allTasks: false,
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
    if (arg === "--all-tasks") {
      result.allTasks = true;
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
Lime Benchmark Dry Run

用法:
  npm run agent-qc:benchmark:dry-run -- --suite terminal-bench-release-slice --task hello-world --check
  npm run agent-qc:benchmark:dry-run -- --suite deepswe-fixed-ten --task ytt-jsonpath-query-api --output .lime/benchmark/runs/p1/deepswe/ytt-jsonpath-query-api
  npm run agent-qc:benchmark:dry-run -- --suite terminal-bench-release-slice --all-tasks --output .lime/benchmark/runs/p1/terminal-bench

选项:
  --manifest PATH     release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --suite ID          要 dry-run 的 suite id
  --task ID           要 dry-run 的 task id；默认 suite.taskSet[0]
  --all-tasks         dry-run suite.taskSet 中的全部任务
  --output PATH       输出目录；默认 <output-root>/<suite>/<task>
  --output-root PATH  默认输出根目录，默认 ${DEFAULT_OUTPUT_ROOT}
  --format FMT        输出格式：json | markdown
  --check             dry-run 缺必需文件时非 0 退出
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

function fileStatus(rootDir, relativePath) {
  const resolvedPath = path.resolve(rootDir, relativePath);
  const exists = fs.existsSync(resolvedPath);
  const stat = exists ? fs.statSync(resolvedPath) : null;
  return {
    path: relativePath.replaceAll("\\", "/"),
    exists,
    kind: stat?.isDirectory() ? "directory" : "file",
    bytes: stat?.isFile() ? stat.size : 0,
    sha256: stat?.isFile()
      ? crypto
          .createHash("sha256")
          .update(fs.readFileSync(resolvedPath))
          .digest("hex")
      : "",
  };
}

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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
    throw new Error(`suite ${suite.id} 没有可运行 task`);
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

function outputRootForSuiteOptions(options, suiteId) {
  if (options.outputPath) {
    return path.resolve(process.cwd(), options.outputPath);
  }
  return path.resolve(process.cwd(), options.outputRoot, suiteId);
}

function terminalBenchRequiredFiles(taskId, taskPath) {
  const prefix = path.join("original-tasks", taskId);
  const requiredFiles = [
    path.join(prefix, "task.yaml"),
    path.join(prefix, "docker-compose.yaml"),
    path.join(prefix, "run-tests.sh"),
    path.join(prefix, "tests/test_outputs.py"),
  ];

  if (fs.existsSync(path.join(taskPath, "Dockerfile"))) {
    requiredFiles.push(path.join(prefix, "Dockerfile"));
    return requiredFiles;
  }

  const composeYaml = readTextIfExists(path.join(taskPath, "docker-compose.yaml"));
  const parsedCompose = composeYaml ? YAML.parse(composeYaml) : {};
  const composeDockerfiles = Object.values(parsedCompose?.services || {}).flatMap(
    (service) => {
      const build = service?.build;
      if (typeof build === "string") {
        return [path.join(build, "Dockerfile")];
      }
      if (build && typeof build === "object") {
        return [path.join(build.context || ".", build.dockerfile || "Dockerfile")];
      }
      return [];
    },
  );

  for (const dockerfile of composeDockerfiles) {
    requiredFiles.push(path.join(prefix, dockerfile));
  }

  return requiredFiles;
}

function deepSweRequiredFiles(taskId) {
  const prefix = path.join("tasks", taskId);
  return [
    path.join(prefix, "task.toml"),
    path.join(prefix, "instruction.md"),
    path.join(prefix, "environment/Dockerfile"),
    path.join(prefix, "tests/test.sh"),
    path.join(prefix, "tests/grader.py"),
    path.join(prefix, "tests/config.json"),
  ];
}

function extractTomlString(source, key) {
  const match = source.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : "";
}

function buildTerminalBenchTask({ sourceRoot, suite, taskId }) {
  const taskPath = path.resolve(process.cwd(), suite.taskRoot, taskId);
  const sourceTaskPath = path.resolve(sourceRoot, "original-tasks", taskId);
  if (taskPath !== sourceTaskPath) {
    throw new Error(`taskRoot 与 sourceRef 路径不一致：${taskPath}`);
  }
  const taskYamlPath = path.join(taskPath, "task.yaml");
  const taskYaml = readTextIfExists(taskYamlPath);
  const parsed = taskYaml ? YAML.parse(taskYaml) : {};
  const instruction = typeof parsed?.instruction === "string" ? parsed.instruction : "";

  return {
    benchmarkKind: "terminal-bench",
    taskPath,
    metadata: {
      category: parsed?.category || "",
      difficulty: parsed?.difficulty || "",
      instructionBytes: Buffer.byteLength(instruction),
      instructionSha256: instruction ? hashText(instruction) : "",
      parserName: parsed?.parser_name || "",
      timeoutSec: parsed?.max_agent_timeout_sec || null,
    },
    requiredFiles: terminalBenchRequiredFiles(taskId, taskPath),
  };
}

function buildDeepSweTask({ sourceRoot, suite, taskId }) {
  const taskPath = path.resolve(process.cwd(), suite.taskRoot, taskId);
  const sourceTaskPath = path.resolve(sourceRoot, "tasks", taskId);
  if (taskPath !== sourceTaskPath) {
    throw new Error(`taskRoot 与 sourceRef 路径不一致：${taskPath}`);
  }
  const taskToml = readTextIfExists(path.join(taskPath, "task.toml"));
  const instruction = readTextIfExists(path.join(taskPath, "instruction.md"));

  return {
    benchmarkKind: "deep-swe",
    taskPath,
    metadata: {
      baseCommitHash: extractTomlString(taskToml, "base_commit_hash"),
      displayTitle: extractTomlString(taskToml, "display_title"),
      language: extractTomlString(taskToml, "language"),
      repositoryUrl: extractTomlString(taskToml, "repository_url"),
      schemaVersion: extractTomlString(taskToml, "schema_version"),
      instructionBytes: Buffer.byteLength(instruction),
      instructionSha256: instruction ? hashText(instruction) : "",
    },
    requiredFiles: deepSweRequiredFiles(taskId),
  };
}

function sourceForSuite(manifest, suite) {
  const source = (manifest.downloadedSources || []).find(
    (entry) => entry.id === suite.sourceRef,
  );
  if (!source) {
    throw new Error(`suite ${suite.id} sourceRef 不存在：${suite.sourceRef}`);
  }
  return source;
}

function buildTaskContext({ manifest, suite, taskId }) {
  const source = sourceForSuite(manifest, suite);
  const sourceRoot = path.resolve(process.cwd(), source.localPath);
  if (suite.runner === "harbor-adapter") {
    return {
      source,
      ...buildTerminalBenchTask({ sourceRoot, suite, taskId }),
    };
  }
  if (suite.runner === "deepswe-adapter") {
    return {
      source,
      ...buildDeepSweTask({ sourceRoot, suite, taskId }),
    };
  }
  throw new Error(`不支持 dry-run runner：${suite.runner}`);
}

function buildDryRunReport({ manifest, suite, taskId }) {
  const context = buildTaskContext({ manifest, suite, taskId });
  const sourceRoot = path.resolve(process.cwd(), context.source.localPath);
  const requiredFileStatuses = context.requiredFiles.map((entry) =>
    fileStatus(sourceRoot, entry),
  );
  const missingFiles = requiredFileStatuses
    .filter((entry) => !entry.exists)
    .map((entry) => entry.path);
  const verdict = missingFiles.length === 0 ? "dry_run_ready" : "blocked";

  return {
    schemaVersion: "benchmark-dry-run-v1",
    generatedAt: new Date().toISOString(),
    mode: "dry_run",
    verdict,
    suite: {
      id: suite.id,
      runner: suite.runner,
      sourceRef: suite.sourceRef,
      requiredForRelease: Boolean(suite.requiredForRelease),
      adapterStatus: suite.adapterStatus || "",
    },
    source: {
      id: context.source.id,
      localPath: context.source.localPath,
      commit: context.source.commit,
    },
    task: {
      id: taskId,
      benchmarkKind: context.benchmarkKind,
      path: path.relative(process.cwd(), context.taskPath).replaceAll("\\", "/"),
      metadata: context.metadata,
    },
    execution: {
      providerInvoked: false,
      verifierInvoked: false,
      dockerInvoked: false,
      liveProviderUsed: false,
      reason: "dry-run 只校验任务加载、必需文件和 Lime 证据形状，不执行外部 verifier。",
    },
    requiredFiles: requiredFileStatuses,
    missingFiles,
  };
}

function buildTrajectory(report) {
  return {
    schemaVersion: "benchmark-trajectory-dry-run-v1",
    suiteId: report.suite.id,
    taskId: report.task.id,
    mode: report.mode,
    events: [
      {
        sequence: 1,
        type: "benchmark.task.loaded",
        status: "ok",
        benchmarkKind: report.task.benchmarkKind,
      },
      {
        sequence: 2,
        type: "benchmark.required_files.checked",
        status: report.missingFiles.length === 0 ? "ok" : "blocked",
        missingFiles: report.missingFiles,
      },
      {
        sequence: 3,
        type: "benchmark.provider.skipped",
        status: "skipped",
        reason: "dry_run_no_live_provider",
      },
      {
        sequence: 4,
        type: "benchmark.verifier.skipped",
        status: "skipped",
        reason: "dry_run_no_docker_or_verifier",
      },
    ],
  };
}

function buildToolTimeline(report) {
  return {
    schemaVersion: "benchmark-tool-timeline-dry-run-v1",
    suiteId: report.suite.id,
    taskId: report.task.id,
    tools: [
      {
        id: "read_benchmark_task",
        status: "completed",
        input: { taskPath: report.task.path },
        output: {
          benchmarkKind: report.task.benchmarkKind,
          instructionBytes: report.task.metadata.instructionBytes || 0,
        },
      },
      {
        id: "check_required_files",
        status: report.missingFiles.length === 0 ? "completed" : "failed",
        input: { requiredFileCount: report.requiredFiles.length },
        output: { missingFiles: report.missingFiles },
      },
      {
        id: "skip_verifier",
        status: "skipped",
        input: { mode: report.mode },
        output: { reason: report.execution.reason },
      },
    ],
  };
}

function buildVerifierResult(report) {
  return {
    schemaVersion: "benchmark-verifier-result-v1",
    verdict: "not_run",
    reward: null,
    verifierInvoked: false,
    reason: report.execution.reason,
  };
}

function buildCtrfPlaceholder(report) {
  return {
    results: {
      tool: {
        name: "benchmark-dry-run",
      },
      summary: {
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        other: 0,
      },
      tests: [],
    },
    metadata: {
      dryRun: true,
      suiteId: report.suite.id,
      taskId: report.task.id,
      reason: report.execution.reason,
    },
  };
}

function buildEvidenceManifest(report, outputDir, files) {
  return {
    schemaVersion: "benchmark-evidence-pack-v1",
    generatedAt: new Date().toISOString(),
    dryRun: true,
    suiteId: report.suite.id,
    taskId: report.task.id,
    outputDir: path.relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    verdict: report.verdict,
    files: files.map((filePath) =>
      fileStatus(process.cwd(), path.relative(process.cwd(), filePath)),
    ),
    source: report.source,
    missingFiles: report.missingFiles,
  };
}

function writeDryRunArtifacts(report, outputDir) {
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
  writeText(
    "stdout.log",
    [
      `[benchmark-dry-run] suite=${report.suite.id} task=${report.task.id}`,
      "[benchmark-dry-run] provider not invoked",
      "[benchmark-dry-run] verifier not invoked",
      `[benchmark-dry-run] verdict=${report.verdict}`,
      "",
    ].join("\n"),
  );
  writeText("stderr.log", "");

  if (report.task.benchmarkKind === "deep-swe") {
    writeText("patch.diff", "");
    writeText(
      "test-stdout.txt",
      "dry-run only: verifier was not executed; no test stdout is available.\n",
    );
    writeJson("reward.json", buildVerifierResult(report));
    writeJson("ctrf.json", buildCtrfPlaceholder(report));
    writeJson("replay-case/replay.json", {
      schemaVersion: "benchmark-replay-case-dry-run-v1",
      suiteId: report.suite.id,
      taskId: report.task.id,
      replayable: false,
      reason: "dry-run 只验证任务加载和证据形状，未执行 Agent turn。",
    });
  }

  const evidenceManifestPath = path.join(outputDir, "evidence-pack/manifest.json");
  writeJsonFile(
    evidenceManifestPath,
    buildEvidenceManifest(report, outputDir, writtenFiles),
  );
  writtenFiles.push(evidenceManifestPath);

  return {
    ...report,
    outputDir: path.relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    artifacts: writtenFiles.map((filePath) =>
      path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
    ),
  };
}

function runDryRun(rootDir, options) {
  const manifest = readJsonFile(path.resolve(rootDir, options.manifestPath));
  const suite = findSuite(manifest, options.suiteId);
  const taskId = taskIdForSuite(suite, options.taskId);
  const report = buildDryRunReport({ manifest, suite, taskId });
  const outputDir = outputDirForOptions(options, suite.id, taskId);
  return writeDryRunArtifacts(report, outputDir);
}

function runSuiteDryRun(rootDir, options) {
  const manifest = readJsonFile(path.resolve(rootDir, options.manifestPath));
  const suite = findSuite(manifest, options.suiteId);
  const suiteOutputRoot = outputRootForSuiteOptions(options, suite.id);
  const taskReports = suite.taskSet.map((taskId) => {
    const report = buildDryRunReport({ manifest, suite, taskId });
    return writeDryRunArtifacts(report, path.join(suiteOutputRoot, taskId));
  });
  const readyCount = taskReports.filter(
    (report) => report.verdict === "dry_run_ready",
  ).length;
  const suiteReport = {
    schemaVersion: "benchmark-suite-dry-run-v1",
    generatedAt: new Date().toISOString(),
    mode: "dry_run",
    suite: {
      id: suite.id,
      runner: suite.runner,
      sourceRef: suite.sourceRef,
      taskCount: taskReports.length,
    },
    outputDir: path.relative(process.cwd(), suiteOutputRoot).replaceAll("\\", "/"),
    summary: {
      readyCount,
      blockedCount: taskReports.length - readyCount,
      taskCount: taskReports.length,
      verdict:
        readyCount === taskReports.length ? "dry_run_ready" : "blocked",
    },
    tasks: taskReports.map((report) => ({
      taskId: report.task.id,
      verdict: report.verdict,
      outputDir: report.outputDir,
      missingFiles: report.missingFiles,
      artifactCount: report.artifacts.length,
    })),
  };
  writeJsonFile(path.join(suiteOutputRoot, "suite-summary.json"), suiteReport);
  return suiteReport;
}

function isSuiteReport(report) {
  return report.schemaVersion === "benchmark-suite-dry-run-v1";
}

function renderMarkdown(report) {
  if (isSuiteReport(report)) {
    const lines = [
      "# Benchmark Suite Dry Run",
      "",
      `- suite: ${report.suite.id}`,
      `- verdict: ${report.summary.verdict}`,
      `- tasks: ${report.summary.readyCount}/${report.summary.taskCount}`,
      `- outputDir: ${report.outputDir}`,
      "",
      "## Tasks",
      "",
      "| Task | Verdict | Artifacts | Missing |",
      "| --- | --- | --- | --- |",
    ];
    for (const task of report.tasks) {
      lines.push(
        `| ${task.taskId} | ${task.verdict} | ${task.artifactCount} | ${task.missingFiles.join("<br>") || "-"} |`,
      );
    }
    return `${lines.join("\n")}\n`;
  }

  const lines = [
    "# Benchmark Dry Run",
    "",
    `- suite: ${report.suite.id}`,
    `- task: ${report.task.id}`,
    `- verdict: ${report.verdict}`,
    `- outputDir: ${report.outputDir}`,
    `- providerInvoked: ${report.execution.providerInvoked ? "yes" : "no"}`,
    `- verifierInvoked: ${report.execution.verifierInvoked ? "yes" : "no"}`,
    "",
    "## Missing Files",
    "",
  ];

  if (report.missingFiles.length === 0) {
    lines.push("- 无");
  } else {
    for (const filePath of report.missingFiles) {
      lines.push(`- ${filePath}`);
    }
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

  const report = options.allTasks
    ? runSuiteDryRun(process.cwd(), options)
    : runDryRun(process.cwd(), options);
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderMarkdown(report);
  process.stdout.write(content);

  const passed = isSuiteReport(report)
    ? report.summary.verdict === "dry_run_ready"
    : report.verdict === "dry_run_ready";
  if (options.check && !passed) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildDryRunReport,
  buildEvidenceManifest,
  buildToolTimeline,
  buildTrajectory,
  buildVerifierResult,
  runDryRun,
  runSuiteDryRun,
};
