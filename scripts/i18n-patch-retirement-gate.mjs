#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PATCH_REPORT_SCHEMA_VERSION = "lime.i18n.patchMetricsReport.v1";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "text",
    help: false,
    legacyReportPath: ".lime/governance/legacy-surface-report.json",
    outputPath: "",
    patchReportPath: ".lime/i18n/patch-metrics-report.json",
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

    if (arg === "--patch-report" && argv[index + 1]) {
      result.patchReportPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg === "--legacy-report" && argv[index + 1]) {
      result.legacyReportPath = String(argv[index + 1]).trim();
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

function resolvePath(targetPath) {
  return path.resolve(process.cwd(), targetPath);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadPatchReport(patchReportPath) {
  const resolvedPath = resolvePath(patchReportPath);
  const raw = readJsonFile(resolvedPath);

  if (raw && raw.schemaVersion === PATCH_REPORT_SCHEMA_VERSION) {
    return {
      report: {
        ...raw,
        sourcePath: resolvedPath,
      },
      sourcePath: resolvedPath,
    };
  }

  const summary = raw?.summary ?? {};
  const report = {
    generatedAt: raw?.generatedAt ?? new Date().toISOString(),
    recommendations: Array.isArray(raw?.recommendations)
      ? raw.recommendations
      : [],
    recentRuns: Array.isArray(raw?.recentRuns) ? raw.recentRuns : [],
    retirementCandidate: Boolean(raw?.retirementCandidate),
    schemaVersion: PATCH_REPORT_SCHEMA_VERSION,
    sourcePath: resolvedPath,
    status: String(raw?.status ?? "unknown"),
    summary: {
      averagePatchTimeMs: Number(summary.averagePatchTimeMs ?? 0),
      languageChanges: Number(summary.languageChanges ?? 0),
      lastRunAt: summary.lastRunAt ?? null,
      lastRunLanguage: summary.lastRunLanguage ?? null,
      lastRunRootKind: summary.lastRunRootKind ?? null,
      recentRunCount: Number(summary.recentRunCount ?? 0),
      slowestPatchTimeMs: Number(summary.slowestPatchTimeMs ?? 0),
      totalMatchedSegments: Number(summary.totalMatchedSegments ?? 0),
      totalReplacedNodes: Number(summary.totalReplacedNodes ?? 0),
      totalRuns: Number(summary.totalRuns ?? 0),
    },
    thresholdIssues: Array.isArray(raw?.thresholdIssues)
      ? raw.thresholdIssues
      : [],
    thresholds: raw?.thresholds ?? {},
    sourcePath: resolvedPath,
  };

  return {
    report,
    sourcePath: resolvedPath,
  };
}

function loadLegacyReport(legacyReportPath) {
  const resolvedPath = resolvePath(legacyReportPath);
  const raw = readJsonFile(resolvedPath);

  return {
    report: {
      ...raw,
      sourcePath: resolvedPath,
    },
    sourcePath: resolvedPath,
  };
}

function buildGateState({ patchReport, legacyReport }) {
  const patchIssues = [];
  if (patchReport.status !== "no-hit") {
    patchIssues.push(`Patch status 必须为 no-hit，当前为 ${patchReport.status}`);
  }
  if (!patchReport.retirementCandidate) {
    patchIssues.push("Patch report 需要标记 retirementCandidate=true");
  }
  if (patchReport.thresholdIssues.length > 0) {
    patchIssues.push(
      `Patch report 存在 ${patchReport.thresholdIssues.length} 个门限问题`,
    );
  }

  const legacySummary = legacyReport?.summary ?? {};
  const legacyViolations = Array.isArray(legacySummary.violations)
    ? legacySummary.violations
    : [];
  const legacyDriftCandidates = Array.isArray(
    legacySummary.classificationDriftCandidates,
  )
    ? legacySummary.classificationDriftCandidates
    : [];
  const legacyZeroReferenceCandidates = Array.isArray(
    legacySummary.zeroReferenceCandidates,
  )
    ? legacySummary.zeroReferenceCandidates
    : [];

  const legacyIssues = [];
  if (legacyViolations.length > 0) {
    legacyIssues.push(
      `Legacy surface report 存在 ${legacyViolations.length} 个违规引用`,
    );
  }

  return {
    gateIssues: [...patchIssues, ...legacyIssues],
    legacy: {
      classificationDriftCandidateCount: legacyDriftCandidates.length,
      summaryPath: legacyReport.sourcePath,
      violationCount: legacyViolations.length,
      zeroReferenceCandidateCount: legacyZeroReferenceCandidates.length,
    },
    patch: {
      recommendationCount: patchReport.recommendations.length,
      sourcePath: patchReport.sourcePath,
      retirementCandidate: patchReport.retirementCandidate,
      status: patchReport.status,
      thresholdIssueCount: patchReport.thresholdIssues.length,
      totalMatchedSegments: patchReport.summary.totalMatchedSegments,
      totalReplacedNodes: patchReport.summary.totalReplacedNodes,
      totalRuns: patchReport.summary.totalRuns,
    },
    retirementReady: patchIssues.length === 0 && legacyIssues.length === 0,
  };
}

function formatGateReport(report, format) {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "[i18n:patch-retirement] gate",
    `状态: ${report.retirementReady ? "pass" : "fail"}`,
    `Patch 报告: ${report.patch.sourcePath}`,
    `  status=${report.patch.status} retirementCandidate=${
      report.patch.retirementCandidate ? "yes" : "no"
    } totalRuns=${report.patch.totalRuns} matchedSegments=${report.patch.totalMatchedSegments} replacedNodes=${report.patch.totalReplacedNodes}`,
    `Legacy 报告: ${report.legacy.summaryPath}`,
    `  violations=${report.legacy.violationCount} zeroReferenceCandidates=${report.legacy.zeroReferenceCandidateCount} classificationDriftCandidates=${report.legacy.classificationDriftCandidateCount}`,
  ];

  if (report.gateIssues.length > 0) {
    lines.push("问题:");
    for (const issue of report.gateIssues) {
      lines.push(`- ${issue}`);
    }
  } else {
    lines.push("问题: 无");
  }

  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`
Lime i18n Patch Retirement Gate

用法:
  node scripts/i18n-patch-retirement-gate.mjs
  node scripts/i18n-patch-retirement-gate.mjs --check
  node scripts/i18n-patch-retirement-gate.mjs --format json
  node scripts/i18n-patch-retirement-gate.mjs --patch-report .lime/i18n/patch-metrics-report.json --legacy-report .lime/governance/legacy-surface-report.json

输入:
  --patch-report PATH   Patch metrics 报告 JSON，默认 ".lime/i18n/patch-metrics-report.json"
  --legacy-report PATH  legacy surface 报告 JSON，默认 ".lime/governance/legacy-surface-report.json"

选项:
  --format FMT          输出格式：text | json
  --output PATH         写入报告到文件
  --check               如果 gate 未通过，以非 0 退出
  -h, --help            显示帮助
`);
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const patchReport = loadPatchReport(options.patchReportPath);
  const legacyReport = loadLegacyReport(options.legacyReportPath);
  const gateReport = buildGateState({
    legacyReport: legacyReport.report,
    patchReport: patchReport.report,
  });
  const content = formatGateReport(gateReport, options.format);

  if (options.outputPath) {
    const resolvedOutputPath = resolvePath(options.outputPath);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, content, "utf8");
  } else {
    process.stdout.write(content);
  }

  if (options.check && !gateReport.retirementReady) {
    return 1;
  }

  return 0;
}

function main() {
  return runCli();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export {
  buildGateState,
  formatGateReport,
  loadLegacyReport,
  loadPatchReport,
  main,
  parseArgs,
  runCli,
};
