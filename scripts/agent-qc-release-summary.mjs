#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildAgentQcReleaseSummary,
  renderAgentQcReleaseMarkdown,
  validateReleaseSummary,
} from "./lib/agent-qc-release-summary-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    evidencePaths: [],
    format: "markdown",
    harnessSummaryPath: "",
    harnessTrendPath: "",
    help: false,
    outputPath: "",
    requireEvidence: true,
    requiredRisks: [],
    requiredScenarioManifestPath: "",
    tag: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--evidence" && argv[index + 1]) {
      result.evidencePaths.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--harness-summary" && argv[index + 1]) {
      result.harnessSummaryPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--harness-trend" && argv[index + 1]) {
      result.harnessTrendPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--tag" && argv[index + 1]) {
      result.tag = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--require-scenario-manifest" && argv[index + 1]) {
      result.requiredScenarioManifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--require-risk" && argv[index + 1]) {
      result.requiredRisks.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
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
    if (arg === "--allow-missing-evidence") {
      result.requireEvidence = false;
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
Lime Agent QC Release Summary

用法:
  npm run agent-qc:release-summary -- --evidence ./.lime/qc/agent-qc-evidence.json --require-scenario-manifest docs/test/agent-qc-scenarios.manifest.json --require-risk P0 --tag v1.2.3
  node scripts/agent-qc-release-summary.mjs --evidence evidence.json --harness-summary summary.json --harness-trend trend.json --output release-qc.md --check

选项:
  --evidence PATH          Agent QC Evidence Pack，可重复
  --harness-summary PATH   harness-eval-summary.json
  --harness-trend PATH     harness-eval-trend.json
  --tag TAG                release tag
  --require-scenario-manifest PATH  要求 Evidence Pack 覆盖该 manifest 中的场景
  --require-risk RISK      搭配 --require-scenario-manifest 使用，可重复；默认 P0
  --output PATH            写入文件；默认 stdout
  --format FMT             markdown | json
  --check                  非 pass 或缺证据时非 0 退出
  --allow-missing-evidence 允许无 Evidence Pack，适合本地预览，不适合发布门禁
  -h, --help               显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function readOptionalJson(filePath) {
  if (!filePath) {
    return null;
  }
  return readJsonFile(filePath);
}

function loadRequiredScenarioIds(manifestPath, risks) {
  if (!manifestPath) {
    return [];
  }
  const manifest = readJsonFile(manifestPath);
  const requiredRisks = new Set((risks.length > 0 ? risks : ["P0"]).map((risk) => risk.toUpperCase()));
  return Array.isArray(manifest?.scenarios)
    ? manifest.scenarios
        .filter((scenario) => requiredRisks.has(String(scenario?.risk || "").toUpperCase()))
        .map((scenario) => String(scenario?.id || "").trim())
        .filter(Boolean)
    : [];
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

  const evidencePacks = options.evidencePaths.map((sourcePath) => ({
    sourcePath,
    pack: readJsonFile(sourcePath),
  }));
  const requiredScenarioIds = loadRequiredScenarioIds(
    options.requiredScenarioManifestPath,
    options.requiredRisks,
  );
  const summary = buildAgentQcReleaseSummary({
    evidencePacks,
    harnessSummary: readOptionalJson(options.harnessSummaryPath),
    harnessTrend: readOptionalJson(options.harnessTrendPath),
    requiredScenarioIds,
    tag: options.tag,
  });
  const validation = validateReleaseSummary(summary, {
    requireEvidence: options.requireEvidence,
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...summary, validation }, null, 2)}\n`
      : renderAgentQcReleaseMarkdown(summary);

  writeOutput(options.outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[agent-qc-release] ${issue}`);
    }
    process.exit(1);
  }
}

main();
