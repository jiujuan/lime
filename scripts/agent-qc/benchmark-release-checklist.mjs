#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const DEFAULT_VERSION = "<version>";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "markdown",
    fullExternalSuites: false,
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputRoot: "",
    outputPath: "",
    strictGate: false,
    version: DEFAULT_VERSION,
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
    if (arg === "--full-external-suites") {
      result.fullExternalSuites = true;
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
    if (arg === "--strict-gate") {
      result.strictGate = true;
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
Lime Benchmark Release Checklist

用法:
  npm run agent-qc:benchmark-release:checklist
  npm run agent-qc:benchmark-release:checklist -- --version 1.97.0 --output .lime/benchmark/releases/1.97.0/checklist.json --format json --check

选项:
  --manifest PATH  release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --version VALUE  release 版本或 run id，默认 ${DEFAULT_VERSION}
  --output-root PATH
                   evidence 根目录，默认 .lime/benchmark/releases/<version>
  --full-external-suites
                   展开 P1 external suite 的全部 taskSet；strict gate 自动启用
  --strict-gate    按正式 release gate 清单生成；会自动启用 full external suites
  --format FMT     输出格式：markdown | json
  --output PATH    写入文件；默认 stdout
  --check          清单结构无效时非 0 退出；不把 blocked/planned 步骤当脚本失败
  -h, --help       显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPackageScripts(rootDir, issues) {
  const packagePath = path.resolve(rootDir, "package.json");
  try {
    const packageJson = readJsonFile(packagePath);
    return new Set(Object.keys(packageJson.scripts || {}));
  } catch (error) {
    issues.push(`package.json 读取失败：${error.message}`);
    return new Set();
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

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function releaseRoot(version, outputRoot = "") {
  return normalizePath(outputRoot || `.lime/benchmark/releases/${version}`);
}

function npmScriptName(command) {
  const match = String(command).match(/^npm\s+run\s+([^\s]+)(?:\s|$)/);
  return match ? match[1] : "";
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

function quoted(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function trueRunScriptForSuite(suite) {
  if (suite.runner === "harbor-adapter") {
    return "agent-qc:benchmark:terminal-run";
  }
  if (suite.runner === "deepswe-adapter") {
    return "agent-qc:benchmark:deepswe-run";
  }
  return "";
}

function trueRunReadinessForSuite(suite) {
  if (suite.runner === "harbor-adapter") {
    return {
      status: suite.adapterStatus === "ready" ? "ready" : "planned",
      reason:
        suite.adapterStatus === "ready"
          ? ""
          : "terminal_bench_true_run_adapter_not_ready",
    };
  }
  if (suite.runner === "deepswe-adapter") {
    return {
      status: suite.adapterStatus === "ready" ? "ready" : "planned",
      reason: suite.adapterStatus === "ready" ? "" : "deepswe_true_run_adapter_not_ready",
    };
  }
  return {
    status: "unsupported",
    reason: `unsupported_runner:${suite.runner}`,
  };
}

function npmRunCommand(script, args = []) {
  const lines = [`npm run ${script} --`];
  for (const arg of args) {
    lines.push(`  ${arg}`);
  }
  return lines.join(" \\\n");
}

function buildNpmSuiteSteps(suite) {
  const commands = Array.isArray(suite.commands) ? suite.commands : [];
  return commands.map((command, index) => ({
    id: `${suite.id}:command:${index + 1}`,
    suiteId: suite.id,
    lane: suite.priority || "",
    kind: "npm_command",
    status: "ready",
    command,
    evidencePath: "",
    blocking: Boolean(suite.requiredForRelease),
    reason: "",
  }));
}

function buildExternalSuiteSteps(suite, { manifestPath, version, outputRoot, fullExternalSuites }) {
  const slug = externalSuiteSlug(suite);
  const taskSet = Array.isArray(suite.taskSet) ? suite.taskSet : [];
  const firstTask = taskSet[0] || "<task-id>";
  const root = releaseRoot(version, outputRoot);
  const dryRunOutput = `${root}/${slug}/dry-run`;
  const trueRunReadiness = trueRunReadinessForSuite(suite);
  const trueRunScript = trueRunScriptForSuite(suite);
  const trueRunTaskSet = fullExternalSuites ? taskSet : [firstTask];
  const taskSteps = trueRunTaskSet.flatMap((taskId) => {
    const preflightOutput = `${releaseRoot(version)}/${slug}/${taskId}-preflight`;
    const trueRunOutput = `${releaseRoot(version)}/${slug}/${taskId}-true-run`;
    return [
      {
        id: `${suite.id}:${taskId}:true-run-preflight`,
        suiteId: suite.id,
        lane: suite.priority || "",
        kind: "true_run_preflight",
        status: "ready",
        command: npmRunCommand("agent-qc:benchmark:true-run-preflight", [
          `--manifest ${quoted(manifestPath)}`,
          `--suite ${quoted(suite.id)}`,
          `--task ${quoted(taskId)}`,
          `--output ${quoted(preflightOutput)}`,
          "--format json",
        ]),
        evidencePath: `${preflightOutput}/summary.json`,
        blocking: Boolean(suite.requiredForRelease),
        reason: "",
      },
      {
        id: `${suite.id}:${taskId}:true-run`,
        suiteId: suite.id,
        lane: suite.priority || "",
        kind: "true_run",
        status: trueRunReadiness.status,
        command: trueRunScript
          ? npmRunCommand(trueRunScript, [
              `--manifest ${quoted(manifestPath)}`,
              `--task ${quoted(taskId)}`,
              `--output ${quoted(trueRunOutput)}`,
              "--format json",
            ])
          : "",
        evidencePath: `${trueRunOutput}/summary.json`,
        blocking: Boolean(suite.requiredForRelease),
        reason: trueRunReadiness.reason,
      },
    ];
  });

  return [
    {
      id: `${suite.id}:dry-run`,
      suiteId: suite.id,
      lane: suite.priority || "",
      kind: "dry_run",
      status: "ready",
      command: npmRunCommand("agent-qc:benchmark:dry-run", [
        `--manifest ${quoted(manifestPath)}`,
        `--suite ${quoted(suite.id)}`,
        "--all-tasks",
        `--output ${quoted(dryRunOutput)}`,
        "--check",
      ]),
      evidencePath: `${dryRunOutput}/suite-summary.json`,
      blocking: Boolean(suite.requiredForRelease),
      reason: "",
    },
    ...taskSteps,
  ];
}

function buildReleaseOpsSteps({ manifestPath, version, outputRoot, strictGate }) {
  const root = releaseRoot(version, outputRoot);
  return [
    {
      id: "benchmark-release:context",
      suiteId: "",
      lane: "release",
      kind: "release_context",
      status: "ready",
      command: npmRunCommand("agent-qc:benchmark-release:context", [
        `--manifest ${quoted(manifestPath)}`,
        `--version ${quoted(version)}`,
        `--output ${quoted(`${root}/run-context.json`)}`,
        "--format json",
        "--check",
      ]),
      evidencePath: `${root}/run-context.json`,
      blocking: true,
      reason: "",
    },
    {
      id: "benchmark-release:summary",
      suiteId: "",
      lane: "release",
      kind: "release_summary",
      status: "ready",
      command: npmRunCommand("agent-qc:benchmark-release:summary", [
        `--manifest ${quoted(manifestPath)}`,
        `--evidence-root ${quoted(root)}`,
        `--output ${quoted(`${root}/benchmark-release-summary.json`)}`,
        "--format json",
        "--check",
        ...(strictGate ? ["--release-gate"] : []),
      ]),
      evidencePath: `${root}/benchmark-release-summary.json`,
      blocking: true,
      reason: "",
    },
    {
      id: "benchmark-release:check",
      suiteId: "",
      lane: "release",
      kind: "manifest_check",
      status: "ready",
      command: npmRunCommand("agent-qc:benchmark-release:check", [
        `--manifest ${quoted(manifestPath)}`,
        `--output ${quoted(`${root}/benchmark-release-check.json`)}`,
      ]),
      evidencePath: "",
      blocking: true,
      reason: "",
    },
    {
      id: "benchmark-release:gate",
      suiteId: "",
      lane: "release",
      kind: "release_gate",
      status: "ready",
      command: npmRunCommand("agent-qc:benchmark-release:gate", [
        `--manifest ${quoted(manifestPath)}`,
      ]),
      evidencePath: "",
      blocking: true,
      reason: "expected_to_fail_until_required_p1_adapters_are_ready",
    },
  ];
}

function buildBenchmarkReleaseChecklist({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  version = DEFAULT_VERSION,
  outputRoot = "",
  fullExternalSuites = false,
  strictGate = false,
} = {}) {
  const resolvedManifestPath = path.resolve(rootDir, manifestPath);
  const issues = [];
  let manifest = {};
  try {
    manifest = readJsonFile(resolvedManifestPath);
  } catch (error) {
    issues.push(`${manifestPath}: manifest 读取失败：${error.message}`);
  }

  const suites = Array.isArray(manifest.suites) ? manifest.suites : [];
  const packageScripts = readPackageScripts(rootDir, issues);
  const shouldUseFullExternalSuites = Boolean(fullExternalSuites || strictGate);
  const root = releaseRoot(version, outputRoot);
  const suiteSteps = suites.flatMap((suite) =>
    suite.runner === "npm"
      ? buildNpmSuiteSteps(suite)
      : buildExternalSuiteSteps(suite, {
          manifestPath,
          version,
          outputRoot: root,
          fullExternalSuites: shouldUseFullExternalSuites,
        }),
  );
  const releaseSteps = buildReleaseOpsSteps({ manifestPath, version, outputRoot: root, strictGate });
  const steps = [...suiteSteps, ...releaseSteps];

  for (const suite of suites) {
    if (suite.requiredForRelease && !steps.some((step) => step.suiteId === suite.id)) {
      issues.push(`${suite.id}: required suite 没有 checklist step`);
    }
  }
  for (const step of steps) {
    if (!step.id || !step.kind || !step.status) {
      issues.push(`${step.id || "(unknown step)"}: checklist step 缺少 id/kind/status`);
    }
    if (step.status !== "unsupported" && !step.command) {
      issues.push(`${step.id}: checklist step 缺少 command`);
    }
    const scriptName = npmScriptName(step.command);
    if (scriptName && !packageScripts.has(scriptName)) {
      issues.push(`${step.id}: package.json 缺少 npm script：${scriptName}`);
    }
  }

  return {
    schemaVersion: "benchmark-release-checklist-v1",
    generatedAt: new Date().toISOString(),
    manifestPath: normalizePath(path.relative(rootDir, resolvedManifestPath)),
    datasetVersion: manifest.datasetVersion || "",
    version,
    releaseRoot: root,
    fullExternalSuites: shouldUseFullExternalSuites,
    strictGate: Boolean(strictGate),
    summary: {
      suiteCount: suites.length,
      stepCount: steps.length,
      readyStepCount: steps.filter((step) => step.status === "ready").length,
      plannedStepCount: steps.filter((step) => step.status === "planned").length,
      unsupportedStepCount: steps.filter((step) => step.status === "unsupported").length,
      issueCount: issues.length,
    },
    steps,
    issues,
  };
}

function validateBenchmarkReleaseChecklist(checklist) {
  return {
    valid: Array.isArray(checklist.issues) && checklist.issues.length === 0,
    issues: checklist.issues || [],
  };
}

function renderMarkdown(checklist) {
  const lines = [
    "# Benchmark Release Checklist",
    "",
    `- datasetVersion: ${checklist.datasetVersion || "-"}`,
    `- version: ${checklist.version}`,
    `- releaseRoot: ${checklist.releaseRoot}`,
    `- steps: ${checklist.summary.readyStepCount} ready / ${checklist.summary.plannedStepCount} planned / ${checklist.summary.unsupportedStepCount} unsupported`,
    "",
    "## Steps",
    "",
    "| Step | Kind | Status | Blocking | Evidence |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const step of checklist.steps) {
    lines.push(
      `| ${step.id} | ${step.kind} | ${step.status} | ${step.blocking ? "yes" : "no"} | ${step.evidencePath || "-"} |`,
    );
  }

  lines.push("", "## Commands", "");
  for (const step of checklist.steps) {
    if (!step.command) {
      continue;
    }
    lines.push(`### ${step.id}`, "", "```bash", step.command, "```", "");
    if (step.reason) {
      lines.push(`Reason: ${step.reason}`, "");
    }
  }

  if (checklist.issues.length > 0) {
    lines.push("## Issues", "");
    for (const issue of checklist.issues) {
      lines.push(`- ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const checklist = buildBenchmarkReleaseChecklist({
    rootDir: process.cwd(),
    manifestPath: options.manifestPath,
    version: options.version,
    outputRoot: options.outputRoot,
    fullExternalSuites: options.fullExternalSuites,
    strictGate: options.strictGate,
  });
  const validation = validateBenchmarkReleaseChecklist(checklist);
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...checklist, validation }, null, 2)}\n`
      : renderMarkdown(checklist);

  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[benchmark-release-checklist] ${issue}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseChecklist,
  renderMarkdown,
  validateBenchmarkReleaseChecklist,
};
