const REPORT_SCHEMA_VERSION = "lime.i18n.patchMetricsReport.v1";

function asFiniteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function asNonNegativeNumber(value, fallback = 0) {
  return Math.max(0, asFiniteNumber(value, fallback));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeRun(run) {
  return {
    durationMs: asNonNegativeNumber(run?.durationMs),
    language: asString(run?.language, "unknown"),
    matchedSegments: asNonNegativeNumber(run?.matchedSegments),
    replacedNodes: asNonNegativeNumber(run?.replacedNodes),
    rootKind: asString(run?.rootKind, "unknown"),
    timestamp: asNonNegativeNumber(run?.timestamp),
  };
}

function sumRuns(runs, field) {
  return runs.reduce((sum, run) => sum + asNonNegativeNumber(run[field]), 0);
}

function normalizeRuntimeMetrics(metrics) {
  const recentRuns = asArray(metrics?.recentRuns ?? metrics?.runs).map(normalizeRun);
  const patchTimes = asArray(metrics?.patchTimes).map((value) =>
    asNonNegativeNumber(value),
  );
  const totalPatchTime = patchTimes.reduce((sum, value) => sum + value, 0);

  const totalRuns = asNonNegativeNumber(
    metrics?.totalRuns,
    recentRuns.length,
  );
  const totalReplacedNodes = asNonNegativeNumber(
    metrics?.totalReplacedNodes,
    sumRuns(recentRuns, "replacedNodes"),
  );
  const totalMatchedSegments = asNonNegativeNumber(
    metrics?.totalMatchedSegments,
    sumRuns(recentRuns, "matchedSegments"),
  );
  const averagePatchTimeMs = asNonNegativeNumber(
    metrics?.averagePatchTimeMs,
    patchTimes.length > 0 ? totalPatchTime / patchTimes.length : 0,
  );
  const slowestPatchTimeMs = asNonNegativeNumber(
    metrics?.slowestPatchTimeMs,
    patchTimes.length > 0 ? Math.max(...patchTimes) : 0,
  );
  const lastRun = metrics?.lastRun
    ? normalizeRun(metrics.lastRun)
    : (recentRuns.at(-1) ?? null);

  return {
    averagePatchTimeMs,
    languageChanges: asNonNegativeNumber(metrics?.languageChanges),
    lastRun,
    recentRuns,
    slowestPatchTimeMs,
    totalMatchedSegments,
    totalReplacedNodes,
    totalRuns,
  };
}

function resolveStatus(summary) {
  if (summary.totalRuns === 0) {
    return "missing-metrics";
  }

  if (
    summary.totalMatchedSegments === 0 &&
    summary.totalReplacedNodes === 0
  ) {
    return "no-hit";
  }

  return "active-patch";
}

function buildRecommendations(status) {
  if (status === "missing-metrics") {
    return [
      "先在 GUI smoke 或 Playwright 验证中导出 window.__I18N_METRICS__，再判断 Patch 退出进度。",
    ];
  }

  if (status === "no-hit") {
    return [
      "当前样本未命中 legacy Patch，可进入 current 主路径依赖审计，但还不能直接删除 DOM replacer。",
    ];
  }

  return [
    "仍有 legacy Patch 命中，优先把 recentRuns 覆盖到的页面文案迁入 key-based namespace。",
  ];
}

function normalizeThresholds(thresholds = {}) {
  return {
    maxMatchedSegments:
      thresholds.maxMatchedSegments === undefined
        ? null
        : asNonNegativeNumber(thresholds.maxMatchedSegments),
    maxReplacedNodes:
      thresholds.maxReplacedNodes === undefined
        ? null
        : asNonNegativeNumber(thresholds.maxReplacedNodes),
    maxRuns:
      thresholds.maxRuns === undefined
        ? null
        : asNonNegativeNumber(thresholds.maxRuns),
  };
}

function buildThresholdIssues(summary, thresholds) {
  const issues = [];
  const checks = [
    ["maxMatchedSegments", "totalMatchedSegments", "命中文本段数"],
    ["maxReplacedNodes", "totalReplacedNodes", "替换节点数"],
    ["maxRuns", "totalRuns", "Patch 运行次数"],
  ];

  for (const [thresholdKey, summaryKey, label] of checks) {
    const threshold = thresholds[thresholdKey];
    if (threshold === null || threshold === undefined) {
      continue;
    }
    const actual = summary[summaryKey];
    if (actual > threshold) {
      issues.push({
        actual,
        field: summaryKey,
        message: `${label} ${actual} 超过门限 ${threshold}`,
        threshold,
      });
    }
  }

  return issues;
}

export function createI18nPatchMetricsReport({
  generatedAt = new Date().toISOString(),
  metrics,
  sourcePath = "",
  thresholds,
} = {}) {
  const normalizedMetrics = normalizeRuntimeMetrics(metrics ?? {});
  const status = resolveStatus(normalizedMetrics);
  const normalizedThresholds = normalizeThresholds(thresholds);
  const thresholdIssues = buildThresholdIssues(
    normalizedMetrics,
    normalizedThresholds,
  );

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    sourcePath,
    status,
    retirementCandidate: status === "no-hit",
    summary: {
      averagePatchTimeMs: normalizedMetrics.averagePatchTimeMs,
      languageChanges: normalizedMetrics.languageChanges,
      lastRunAt: normalizedMetrics.lastRun?.timestamp ?? null,
      lastRunLanguage: normalizedMetrics.lastRun?.language ?? null,
      lastRunRootKind: normalizedMetrics.lastRun?.rootKind ?? null,
      recentRunCount: normalizedMetrics.recentRuns.length,
      slowestPatchTimeMs: normalizedMetrics.slowestPatchTimeMs,
      totalMatchedSegments: normalizedMetrics.totalMatchedSegments,
      totalReplacedNodes: normalizedMetrics.totalReplacedNodes,
      totalRuns: normalizedMetrics.totalRuns,
    },
    thresholds: normalizedThresholds,
    thresholdIssues,
    recentRuns: normalizedMetrics.recentRuns,
    recommendations: buildRecommendations(status),
  };
}

export function renderI18nPatchMetricsTextReport(report) {
  const lines = [
    "Lime i18n Patch Metrics Report",
    `状态: ${report.status}`,
    `来源: ${report.sourcePath || "(未指定)"}`,
    `生成时间: ${report.generatedAt}`,
    `Patch 运行次数: ${report.summary.totalRuns}`,
    `替换节点数: ${report.summary.totalReplacedNodes}`,
    `命中文本段数: ${report.summary.totalMatchedSegments}`,
    `语言切换次数: ${report.summary.languageChanges}`,
    `平均耗时: ${report.summary.averagePatchTimeMs.toFixed(2)}ms`,
    `最慢耗时: ${report.summary.slowestPatchTimeMs.toFixed(2)}ms`,
    `退出候选: ${report.retirementCandidate ? "yes" : "no"}`,
  ];

  if (report.thresholdIssues.length > 0) {
    lines.push("", "门限问题:");
    for (const issue of report.thresholdIssues) {
      lines.push(`- ${issue.message}`);
    }
  }

  lines.push("", "建议:");
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation}`);
  }

  return `${lines.join("\n")}\n`;
}
