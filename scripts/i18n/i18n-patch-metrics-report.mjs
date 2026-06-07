#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createI18nPatchMetricsReport,
  renderI18nPatchMetricsTextReport,
} from "../lib/i18n-patch-metrics-report-core.mjs";

const DEFAULT_INPUT_PATH = ".lime/i18n/patch-metrics.json";

function parseNumberArg(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseArgs(argv) {
  const result = {
    check: false,
    format: "text",
    help: false,
    inputPath: DEFAULT_INPUT_PATH,
    maxMatchedSegments: undefined,
    maxReplacedNodes: undefined,
    maxRuns: undefined,
    outputPath: "",
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

    if (arg === "--input" && argv[index + 1]) {
      result.inputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg === "--max-matched-segments" && argv[index + 1]) {
      result.maxMatchedSegments = parseNumberArg(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--max-replaced-nodes" && argv[index + 1]) {
      result.maxReplacedNodes = parseNumberArg(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--max-runs" && argv[index + 1]) {
      result.maxRuns = parseNumberArg(argv[index + 1]);
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

  return result;
}

function printHelp() {
  console.log(`
Lime i18n Patch Metrics Report

用法:
  npm run i18n:patch-report
  npm run i18n:patch-report:json
  node scripts/i18n/i18n-patch-metrics-report.mjs --input .lime/i18n/patch-metrics.json --format json
  node scripts/i18n/i18n-patch-metrics-report.mjs --check --max-matched-segments 0 --max-replaced-nodes 0

输入:
  默认读取 ${DEFAULT_INPUT_PATH}。该文件应来自 GUI / Playwright 导出的 window.__I18N_METRICS__ 或 getI18nPatchMetricsReport() JSON。

选项:
  --input PATH                 Patch metrics JSON 路径
  --output PATH                写入报告文件；默认输出到 stdout
  --format FMT                 输出格式：text | json
  --check                      如果门限问题存在，以非 0 退出
  --max-matched-segments NUM   允许的最大命中文本段数
  --max-replaced-nodes NUM     允许的最大替换节点数
  --max-runs NUM               允许的最大 Patch 运行次数
  -h, --help                   显示帮助
`);
}

function resolvePath(targetPath) {
  return path.resolve(process.cwd(), targetPath);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }

  const resolvedOutputPath = resolvePath(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, content, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const resolvedInputPath = resolvePath(options.inputPath);
  const metrics = readJsonFile(resolvedInputPath);
  const report = createI18nPatchMetricsReport({
    metrics,
    sourcePath: path.relative(process.cwd(), resolvedInputPath),
    thresholds: {
      maxMatchedSegments: options.maxMatchedSegments,
      maxReplacedNodes: options.maxReplacedNodes,
      maxRuns: options.maxRuns,
    },
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderI18nPatchMetricsTextReport(report);

  writeOutput(options.outputPath, content);

  if (options.check && report.thresholdIssues.length > 0) {
    process.exit(1);
  }
}

main();
