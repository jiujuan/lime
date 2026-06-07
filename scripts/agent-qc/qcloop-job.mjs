#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildQCLoopJobPayload,
  renderQCLoopCurl,
  validateQCLoopJobPayload,
} from "../lib/agent-qc-qcloop-job-core.mjs";

const DEFAULT_MANIFEST_PATH = "internal/test/agent-qc-scenarios.manifest.json";

function parseArgs(argv) {
  const result = {
    baseUrl: "http://127.0.0.1:8080",
    check: false,
    cwd: process.cwd(),
    executorProvider: "codex",
    executionMode: "standard",
    format: "json",
    help: false,
    includeAll: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    maxQcRounds: 0,
    maxExecutorRetries: undefined,
    name: "",
    outputPath: "",
    risks: [],
    scenarioIds: [],
    tokenBudgetPerItem: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest" && argv[index + 1]) {
      result.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--risk" && argv[index + 1]) {
      result.risks.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--scenario" && argv[index + 1]) {
      result.scenarioIds.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--all") {
      result.includeAll = true;
      continue;
    }
    if (arg === "--name" && argv[index + 1]) {
      result.name = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--cwd" && argv[index + 1]) {
      result.cwd = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--executor-provider" && argv[index + 1]) {
      result.executorProvider = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--execution-mode" && argv[index + 1]) {
      result.executionMode = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--max-qc-rounds" && argv[index + 1]) {
      result.maxQcRounds = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--max-executor-retries" && argv[index + 1]) {
      result.maxExecutorRetries = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--token-budget-per-item" && argv[index + 1]) {
      result.tokenBudgetPerItem = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--base-url" && argv[index + 1]) {
      result.baseUrl = String(argv[index + 1]).trim();
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
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Agent QC qcloop Job Payload

用法:
  npm run agent-qc:qcloop-job -- --risk P0 --output ./tmp/qcloop-p0-job.json
  node scripts/agent-qc/qcloop-job.mjs --scenario command-bridge-contract --format curl

选项:
  --risk RISK              选择风险等级，可重复；默认 P0
  --scenario ID            选择指定 scenario，可重复；优先级高于 --risk
  --all                    选择全部 scenario
  --name NAME              qcloop job 名称
  --cwd PATH               worker 目标仓库目录，默认当前目录
  --executor-provider NAME qcloop executor_provider，默认 codex
  --execution-mode MODE    standard | goal_assisted，默认 standard
  --max-qc-rounds N        覆盖 max_qc_rounds
  --max-executor-retries N 覆盖 max_executor_retries，0-5
  --token-budget-per-item N 覆盖 token_budget_per_item
  --format FMT             json | curl
  --base-url URL           curl 模式 qcloop API 地址，默认 http://127.0.0.1:8080
  --output PATH            写入文件；默认 stdout
  --check                  payload 非法时非 0 退出
  -h, --help               显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"),
  );
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

  const manifest = readJsonFile(options.manifestPath);
  const payload = buildQCLoopJobPayload(manifest, {
    includeAll: options.includeAll,
    risks: options.risks.length > 0 ? options.risks : ["P0"],
    scenarioIds: options.scenarioIds,
    name: options.name,
    cwd: options.cwd,
    executorProvider: options.executorProvider,
    executionMode: options.executionMode,
    maxQcRounds: options.maxQcRounds,
    maxExecutorRetries: options.maxExecutorRetries,
    tokenBudgetPerItem: options.tokenBudgetPerItem,
  });
  const validation = validateQCLoopJobPayload(payload);
  const content =
    options.format === "curl"
      ? renderQCLoopCurl(payload, { baseUrl: options.baseUrl })
      : `${JSON.stringify({ ...payload, _validation: validation }, null, 2)}\n`;

  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[agent-qc-qcloop-job] ${issue}`);
    }
    process.exit(1);
  }
}

main();
