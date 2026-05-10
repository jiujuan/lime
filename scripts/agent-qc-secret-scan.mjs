#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SECRET_PATTERNS = [
  { id: "api-key-arg", regex: /--api-key [^<\s][^\s]*/gi },
  { id: "ctx7-token", regex: /ctx7sk-[A-Za-z0-9-]+/g },
  { id: "generic-sk-token", regex: /sk-[A-Za-z0-9_-]{12,}/g },
];

function parseArgs(argv) {
  const result = {
    check: false,
    format: "summary",
    help: false,
    outputPath: "",
    redact: false,
    root: ".lime/qc",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root" && argv[index + 1]) {
      result.root = String(argv[index + 1]).trim();
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
    if (arg === "--redact") {
      result.redact = true;
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
Lime Agent QC secret scan

用法:
  npm run agent-qc:secret-scan -- --check
  node scripts/agent-qc-secret-scan.mjs --root .lime/qc --redact --check

选项:
  --root PATH       扫描根目录，默认 .lime/qc
  --format FMT      summary | json，默认 summary
  --output PATH     写入扫描报告；默认 stdout
  --redact          将命中内容替换为脱敏占位符
  --check           存在命中时非 0 退出
  -h, --help        显示帮助
`);
}

function shouldSkipPath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return (
    normalized.includes("/.git/") ||
    normalized.includes("/bin/") ||
    normalized.endsWith(".db") ||
    normalized.endsWith(".sqlite") ||
    normalized.endsWith(".sqlite3") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".webp") ||
    normalized.endsWith(".gif")
  );
}

function listFiles(rootPath) {
  const resolved = path.resolve(process.cwd(), rootPath);
  if (!fs.existsSync(resolved)) {
    return [];
  }
  const result = [];
  const stack = [resolved];
  while (stack.length) {
    const current = stack.pop();
    if (!current || shouldSkipPath(current)) {
      continue;
    }
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isFile()) {
      result.push(current);
    }
  }
  return result.sort();
}

function sanitizeContent(content) {
  return String(content || "")
    .replace(/(--api-key(?:=|\s+))(?:"[^"]+"|'[^']+'|\S+)/gi, "$1<redacted>")
    .replace(/(api[_-]?key(?:=|:|\s+))(?:"[^"]+"|'[^']+'|\S+)/gi, "$1<redacted>")
    .replace(/ctx7sk-[A-Za-z0-9-]+/g, "ctx7sk-***")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***");
}

function findSecrets(content) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = String(content || "").matchAll(new RegExp(pattern.regex.source, pattern.regex.flags));
    for (const match of matches) {
      findings.push({ pattern: pattern.id, index: match.index ?? 0, preview: redactPreview(match[0]) });
    }
  }
  return findings;
}

function redactPreview(value) {
  return sanitizeContent(String(value || "")).slice(0, 160);
}

function createReport({ root, redact }) {
  const files = listFiles(root);
  const fileReports = [];
  let findingCount = 0;
  let changedCount = 0;

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const findings = findSecrets(content);
    if (findings.length === 0) {
      continue;
    }
    findingCount += findings.length;
    let changed = false;
    if (redact) {
      const sanitized = sanitizeContent(content);
      changed = sanitized !== content;
      if (changed) {
        fs.writeFileSync(filePath, sanitized, "utf8");
        changedCount += 1;
      }
    }
    fileReports.push({
      path: path.relative(process.cwd(), filePath),
      findingCount: findings.length,
      changed,
      findings,
    });
  }

  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    root,
    redacted: redact,
    fileCount: files.length,
    findingCount,
    changedCount,
    status: findingCount === 0 ? "pass" : redact ? "redacted" : "fail",
    files: fileReports,
  };
}

function renderSummary(report) {
  const lines = [
    `status=${report.status}`,
    `root=${report.root}`,
    `fileCount=${report.fileCount}`,
    `findingCount=${report.findingCount}`,
    `changedCount=${report.changedCount}`,
  ];
  for (const file of report.files) {
    lines.push(`file=${file.path} findings=${file.findingCount} changed=${file.changed}`);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = createReport(options);
  const content = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderSummary(report);
  writeOutput(options.outputPath, content);
  if (options.check && report.findingCount > 0) {
    process.exit(1);
  }
}

main();
