#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_CONFIG = "benchmarks/lime-agent-runtime/benchmark.json";

function parseArgs(argv) {
  const options = {
    check: false,
    config: DEFAULT_CONFIG,
    format: "markdown",
    output: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--config" && argv[index + 1]) {
      options.config = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      options.format = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!["json", "markdown"].includes(options.format)) {
    throw new Error("--format 只支持 json 或 markdown");
  }

  return options;
}

function printHelp() {
  console.log(`
Lime Harbor benchmark plan

用法:
  npm run agent-qc:benchmark:plan
  npm run agent-qc:benchmark:check
  node scripts/agent-qc-benchmark-plan.mjs --format json --output .lime/qc/benchmark-plan.json

选项:
  --config PATH  benchmark config，默认 ${DEFAULT_CONFIG}
  --format FMT   输出格式：markdown | json
  --output PATH  写入文件；默认输出到 stdout
  --check        有结构缺口时返回非 0
  -h, --help     显示帮助
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exists(rootDir, relativePath) {
  return fs.existsSync(path.resolve(rootDir, relativePath));
}

function readTextIfExists(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
}

function validateTask(rootDir, task) {
  const requiredFiles = [
    task.taskDir,
    task.taskToml,
    task.instructionRef,
    task.verifierRef,
    path.join(task.taskDir, "tests/test.sh"),
    path.join(task.taskDir, "environment/Dockerfile"),
  ];
  const missingFiles = requiredFiles.filter((entry) => !exists(rootDir, entry));
  const taskToml = readTextIfExists(rootDir, task.taskToml);
  const taskTomlIssues = [];

  if (!taskToml.includes('schema_version = "1.1"')) {
    taskTomlIssues.push("task.toml 缺少 schema_version = \"1.1\"");
  }
  if (!taskToml.includes("/logs/agent/trajectory.json")) {
    taskTomlIssues.push("task.toml artifacts 未声明 /logs/agent/trajectory.json");
  }
  if (!taskToml.includes("[verifier]") || !taskToml.includes("[agent]")) {
    taskTomlIssues.push("task.toml 缺少 [agent] 或 [verifier]");
  }

  const requiredEvidence = Array.isArray(task.requiredEvidence)
    ? task.requiredEvidence
    : [];
  const evidenceIssues = requiredEvidence.length === 0
    ? ["requiredEvidence 不能为空"]
    : [];

  return {
    id: task.id,
    scenarioId: task.scenarioId,
    status: task.status || "unknown",
    valid: missingFiles.length === 0 && taskTomlIssues.length === 0 && evidenceIssues.length === 0,
    missingFiles,
    taskTomlIssues,
    evidenceIssues,
    requiredEvidence,
    failureModes: Array.isArray(task.failureModes) ? task.failureModes : [],
  };
}

function createPlan(rootDir, configPath) {
  const benchmark = readJson(path.resolve(rootDir, configPath));
  const tasks = Array.isArray(benchmark.tasks)
    ? benchmark.tasks.map((task) => validateTask(rootDir, task))
    : [];
  const issues = [];

  if (benchmark.schemaVersion !== "lime-harbor-benchmark-v1") {
    issues.push("benchmark.json schemaVersion 必须是 lime-harbor-benchmark-v1");
  }
  if (!benchmark.datasetId || !benchmark.datasetVersion) {
    issues.push("benchmark.json 缺少 datasetId 或 datasetVersion");
  }
  if (!benchmark.harbor?.localPath) {
    issues.push("benchmark.json 缺少 harbor.localPath");
  }
  if (tasks.length === 0) {
    issues.push("benchmark.json 至少需要一个 task");
  }

  for (const task of tasks) {
    if (!task.valid) {
      issues.push(`${task.id} 结构不完整`);
    }
  }

  return {
    valid: issues.length === 0,
    generatedAt: new Date().toISOString(),
    datasetId: benchmark.datasetId,
    datasetVersion: benchmark.datasetVersion,
    purpose: benchmark.purpose,
    harbor: benchmark.harbor,
    decisionPolicy: benchmark.decisionPolicy,
    tasks,
    backlog: Array.isArray(benchmark.backlog) ? benchmark.backlog : [],
    issues,
  };
}

function renderMarkdown(plan) {
  const lines = [
    `# Lime Harbor Benchmark Plan`,
    "",
    `- valid: ${plan.valid ? "yes" : "no"}`,
    `- dataset: ${plan.datasetId}@${plan.datasetVersion}`,
    `- generatedAt: ${plan.generatedAt}`,
    "",
    "## Harbor commands",
    "",
    "```bash",
    plan.harbor?.baselineCommand || "# missing baseline command",
    "",
    plan.harbor?.candidateCommand || "# missing candidate command",
    "```",
    "",
    "## Tasks",
    "",
    "| Task | Status | Valid | Missing |",
    "| --- | --- | --- | --- |",
  ];

  for (const task of plan.tasks) {
    lines.push(
      `| ${task.id} | ${task.status} | ${task.valid ? "yes" : "no"} | ${[
        ...task.missingFiles,
        ...task.taskTomlIssues,
        ...task.evidenceIssues,
      ].join("<br>") || "-"} |`,
    );
  }

  if (plan.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of plan.issues) {
      lines.push(`- ${issue}`);
    }
  }

  if (plan.backlog.length > 0) {
    lines.push("", "## Backlog", "");
    for (const item of plan.backlog) {
      lines.push(`- ${item.id}: ${item.reason}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = createPlan(process.cwd(), options.config);
  const content = options.format === "json"
    ? `${JSON.stringify(plan, null, 2)}\n`
    : renderMarkdown(plan);
  writeOutput(options.output, content);

  if (options.check && !plan.valid) {
    process.exit(1);
  }
}

main();
