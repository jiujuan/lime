#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createAgentQcReport,
  readJsonFile,
  renderAgentQcMarkdownReport,
} from "./lib/agent-qc-report-core.mjs";

const DEFAULT_MANIFEST_PATH = "docs/test/agent-qc-scenarios.manifest.json";
const DEFAULT_SCHEMA_PATH = "docs/test/agent-qc-evidence.schema.json";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "markdown",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    schemaPath: DEFAULT_SCHEMA_PATH,
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
    if (arg === "--schema" && argv[index + 1]) {
      result.schemaPath = String(argv[index + 1]).trim();
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
Lime Agent QC 场景报告

用法:
  npm run agent-qc:report
  npm run agent-qc:report:json
  npm run agent-qc:check
  node scripts/agent-qc-report.mjs --manifest docs/test/agent-qc-scenarios.manifest.json

选项:
  --check          如果 manifest 或 evidence schema 不合法，以非 0 退出
  --format FMT     输出格式：markdown | json
  --manifest PATH  Agent QC manifest 路径
  --schema PATH    Evidence schema 路径
  --output PATH    写入报告文件；默认输出到 stdout
  -h, --help       显示帮助
`);
}

function resolvePath(targetPath) {
  return path.resolve(process.cwd(), targetPath);
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

  const manifest = readJsonFile(resolvePath(options.manifestPath));
  const schema = readJsonFile(resolvePath(options.schemaPath));
  const packageJson = readJsonFile(resolvePath("package.json"));
  const report = createAgentQcReport({ manifest, packageJson, evidenceSchema: schema });

  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderAgentQcMarkdownReport(report);

  writeOutput(options.outputPath, content);

  if (options.check && !report.valid) {
    process.exit(1);
  }
}

main();
