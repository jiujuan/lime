#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildQCLoopStatusReport,
  validateQCLoopStatusReport,
} from "../lib/agent-qc-qcloop-status-core.mjs";

function parseArgs(argv) {
  const result = {
    baseUrl: "http://127.0.0.1:8080",
    checkTerminal: false,
    failOnStale: false,
    format: "summary",
    help: false,
    itemsJson: "",
    jobId: "",
    jobJson: "",
    outputPath: "",
    staleMinutes: 30,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url" && argv[index + 1]) {
      result.baseUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--job-id" && argv[index + 1]) {
      result.jobId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--job-json" && argv[index + 1]) {
      result.jobJson = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--items-json" && argv[index + 1]) {
      result.itemsJson = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--stale-minutes" && argv[index + 1]) {
      result.staleMinutes = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check-terminal") {
      result.checkTerminal = true;
      continue;
    }
    if (arg === "--fail-on-stale") {
      result.failOnStale = true;
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
Lime Agent QC qcloop Status

用法:
  npm run agent-qc:qcloop-status -- --job-id "qcloop-job-id"
  npm run agent-qc:qcloop-status -- --job-id "qcloop-job-id" --format json --output ./.lime/qc/qcloop-status.json
  node scripts/agent-qc/qcloop-status.mjs --job-json ./job.json --items-json ./items.json

选项:
  --job-id ID          从 qcloop HTTP API 读取 /api/jobs/:id 和 /api/items?job_id=:id
  --base-url URL       qcloop API 地址，默认 http://127.0.0.1:8080
  --job-json PATH      离线 job JSON 文件
  --items-json PATH    离线 items JSON 文件
  --output PATH        写入报告；默认 stdout
  --stale-minutes N    running item 超过 N 分钟且无 stdout/stderr 时标记 stale，默认 30
  --format FMT         输出格式：summary | json
  --check-terminal     job 未 complete 或存在失败 / 卡住 item 时非 0 退出
  --fail-on-stale      只要存在 stale item 就非 0 退出
  -h, --help           显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"),
  );
}

async function readJsonUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }
  return response.json();
}

async function loadQCLoopData(options) {
  if (options.jobJson || options.itemsJson) {
    if (!options.jobJson || !options.itemsJson) {
      throw new Error("离线模式必须同时提供 --job-json 与 --items-json。");
    }
    return {
      job: readJsonFile(options.jobJson),
      items: readJsonFile(options.itemsJson),
    };
  }

  if (!options.jobId) {
    throw new Error(
      "必须提供 --job-id，或同时提供 --job-json / --items-json。",
    );
  }

  const baseUrl = options.baseUrl.replace(/\/$/, "");
  return {
    job: await readJsonUrl(
      `${baseUrl}/api/jobs/${encodeURIComponent(options.jobId)}`,
    ),
    items: await readJsonUrl(
      `${baseUrl}/api/items/?job_id=${encodeURIComponent(options.jobId)}`,
    ),
  };
}

function renderItemLine(item) {
  const parts = [
    `- ${item.scenarioId}`,
    `status=${item.qcloopStatus}`,
    `worker=${item.worker.status}`,
    `attempt=${item.currentAttemptNo}`,
    `qc=${item.currentQcNo}`,
  ];
  if (item.worker.durationMinutes !== null) {
    parts.push(`duration=${item.worker.durationMinutes}m`);
  }
  parts.push(`stdout=${item.worker.stdoutLength}`);
  parts.push(`stderr=${item.worker.stderrLength}`);
  if (item.stale) {
    parts.push(`stale=${item.staleReasons.join("; ")}`);
  }
  if (item.qc.feedback) {
    parts.push(
      `feedback=${item.qc.feedback.replace(/\s+/g, " ").slice(0, 180)}`,
    );
  }
  return parts.join(" ");
}

function renderSummary(report, validation) {
  const lines = [
    `job=${report.job.id}`,
    `name=${report.job.name}`,
    `status=${report.job.status}`,
    `verdict=${report.verdict.status}`,
    `items=${report.counts.total} terminal=${report.counts.terminal} nonTerminal=${report.counts.nonTerminal}`,
    `success=${report.counts.success} failed=${report.counts.failed} exhausted=${report.counts.exhausted} running=${report.counts.running} pending=${report.counts.pending} stale=${report.counts.stale}`,
    `summary=${report.verdict.summary}`,
    `nextAction=${report.verdict.nextAction}`,
    `valid=${validation.valid}`,
  ];
  if (validation.issues.length > 0) {
    lines.push(`issues=${validation.issues.join("; ")}`);
  }

  const activeItems = report.items.filter(
    (item) =>
      !item.terminal ||
      item.stale ||
      item.qcloopStatus === "failed" ||
      item.qcloopStatus === "exhausted",
  );
  if (activeItems.length > 0) {
    lines.push("items:");
    for (const item of activeItems) {
      lines.push(renderItemLine(item));
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { job, items } = await loadQCLoopData(options);
  const report = buildQCLoopStatusReport({
    job,
    items,
    options: {
      staleMinutes: options.staleMinutes,
    },
  });
  const validation = validateQCLoopStatusReport(report);
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderSummary(report, validation);
  writeOutput(options.outputPath, content);

  if (!validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[agent-qc-qcloop-status] ${issue}`);
    }
    process.exit(1);
  }
  if (options.failOnStale && report.counts.stale > 0) {
    process.exit(2);
  }
  if (options.checkTerminal && report.verdict.status !== "complete") {
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(`[agent-qc-qcloop-status] ${error.message}`);
  process.exit(1);
});
