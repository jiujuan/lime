#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildAgentQcEvidencePack,
  validateEvidencePackShape,
} from "./lib/agent-qc-evidence-core.mjs";

function parseArgs(argv) {
  const result = {
    baseUrl: "http://127.0.0.1:8080",
    changedFiles: [],
    check: false,
    diffBase: "",
    format: "json",
    help: false,
    itemsJson: "",
    jobId: "",
    jobJson: "",
    outputPath: "",
    ref: "",
    repo: "lime",
    riskTags: [],
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
    if (arg === "--repo" && argv[index + 1]) {
      result.repo = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--ref" && argv[index + 1]) {
      result.ref = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--diff-base" && argv[index + 1]) {
      result.diffBase = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--changed-file" && argv[index + 1]) {
      result.changedFiles.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--risk-tag" && argv[index + 1]) {
      result.riskTags.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
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
Lime Agent QC Evidence Export

用法:
  npm run agent-qc:export-evidence -- --job-id "qcloop-job-id" --output ./.lime/qc/evidence.json
  node scripts/agent-qc-export-evidence.mjs --job-json ./job.json --items-json ./items.json --check

选项:
  --job-id ID          从 qcloop HTTP API 读取 /api/jobs/:id 和 /api/items?job_id=:id
  --base-url URL       qcloop API 地址，默认 http://127.0.0.1:8080
  --job-json PATH      离线 job JSON 文件
  --items-json PATH    离线 items JSON 文件
  --output PATH        写入 Evidence Pack；默认 stdout
  --repo NAME          subject.repo，默认 lime
  --ref REF            subject.ref
  --diff-base REF      subject.diffBase
  --changed-file PATH  追加 changedFiles，可重复
  --risk-tag TAG       追加 riskTags，可重复
  --check              只校验输出形状，非法时非 0 退出
  --format FMT         输出格式：json | summary
  -h, --help           显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
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
    throw new Error("必须提供 --job-id，或同时提供 --job-json / --items-json。");
  }

  const baseUrl = options.baseUrl.replace(/\/$/, "");
  return {
    job: await readJsonUrl(`${baseUrl}/api/jobs/${encodeURIComponent(options.jobId)}`),
    items: await readJsonUrl(`${baseUrl}/api/items/?job_id=${encodeURIComponent(options.jobId)}`),
  };
}

function renderSummary(pack, validation) {
  const lines = [
    `runId=${pack.runId}`,
    `status=${pack.verdict.status}`,
    `scenarios=${pack.scenarioResults.length}`,
    `valid=${validation.valid}`,
    `summary=${pack.verdict.summary}`,
  ];
  if (validation.issues.length > 0) {
    lines.push(`issues=${validation.issues.join("; ")}`);
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
  const pack = buildAgentQcEvidencePack({
    job,
    items,
    options: {
      repo: options.repo,
      ref: options.ref,
      diffBase: options.diffBase,
      changedFiles: options.changedFiles,
      riskTags: options.riskTags,
    },
  });
  const validation = validateEvidencePackShape(pack);
  const content = options.format === "summary" ? renderSummary(pack, validation) : `${JSON.stringify(pack, null, 2)}\n`;
  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[agent-qc-evidence] ${issue}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[agent-qc-evidence] ${error.message}`);
  process.exit(1);
});
