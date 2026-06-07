function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function countByStatus(items, getStatus = (item) => item?.status) {
  const counts = new Map();
  for (const item of asArray(items)) {
    const status = getStatus(item) || "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Object.fromEntries(
    Array.from(counts.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function summarizeEvidencePack(pack, sourcePath = "") {
  const scenarioResults = asArray(pack?.scenarioResults);
  const laneResults = asArray(pack?.laneResults);
  return {
    sourcePath,
    runId: pack?.runId || "unknown",
    generatedAt: pack?.generatedAt || "",
    status: pack?.verdict?.status || "unknown",
    summary: pack?.verdict?.summary || "",
    scenarioCount: scenarioResults.length,
    scenarioIds: scenarioResults
      .map((scenario) => String(scenario?.scenarioId || "").trim())
      .filter(Boolean)
      .sort(),
    scenarioStatusCounts: countByStatus(scenarioResults),
    laneStatusCounts: countByStatus(laneResults),
    blockers: asArray(pack?.verdict?.blockers).filter(isNonEmptyString),
    waivers: asArray(pack?.verdict?.waivers),
  };
}

function normalizeScenarioIds(scenarioIds) {
  return Array.from(
    new Set(
      asArray(scenarioIds)
        .map((scenarioId) => String(scenarioId || "").trim())
        .filter(Boolean),
    ),
  ).sort();
}

function hasStructuredEvidenceRef(scenario) {
  return asArray(scenario?.evidenceRefs).some((ref) => {
    const normalized = String(ref || "").trim();
    return normalized.length > 0 && !normalized.startsWith("qcloop:");
  });
}

function summarizeHarnessReport(summaryReport, trendReport) {
  return {
    summaryGeneratedAt: summaryReport?.generatedAt || "",
    trendGeneratedAt: trendReport?.generatedAt || "",
    readyCount: summaryReport?.totals?.readyCount ?? null,
    invalidCount: summaryReport?.totals?.invalidCount ?? null,
    trendSampleCount: trendReport?.sampleCount ?? null,
    signals: asArray(trendReport?.signals).filter(isNonEmptyString),
  };
}

function buildAgentQcReleaseSummary({
  evidencePacks = [],
  harnessSummary = null,
  harnessTrend = null,
  requiredScenarioIds = [],
  tag = "",
} = {}) {
  const evidence = asArray(evidencePacks).map((entry) =>
    summarizeEvidencePack(entry.pack, entry.sourcePath),
  );
  const statusCounts = countByStatus(evidence);
  const blockers = evidence.flatMap((entry) =>
    entry.blockers.map((blocker) => `${entry.runId}: ${blocker}`),
  );
  const waiverCount = evidence.reduce(
    (sum, entry) => sum + entry.waivers.length,
    0,
  );
  const hasFailingEvidence = evidence.some((entry) => entry.status !== "pass");
  const weakEvidenceScenarioIds = normalizeScenarioIds(
    asArray(evidencePacks).flatMap((entry) =>
      asArray(entry?.pack?.scenarioResults)
        .filter(
          (scenario) =>
            scenario?.status === "pass" && !hasStructuredEvidenceRef(scenario),
        )
        .map((scenario) => scenario?.scenarioId),
    ),
  );
  const structuredEvidenceBlockers = weakEvidenceScenarioIds.map(
    (scenarioId) =>
      `structured-evidence:${scenarioId}: pass scenario 缺少非 qcloop evidenceRefs，不能只凭 qcloop item id 作为发布证据。`,
  );
  const hasWeakStructuredEvidence = weakEvidenceScenarioIds.length > 0;
  const status =
    evidence.length === 0
      ? "blocked"
      : hasFailingEvidence || hasWeakStructuredEvidence
        ? "fail"
        : "pass";
  const coveredScenarioIds = normalizeScenarioIds(
    evidence.flatMap((entry) => entry.scenarioIds),
  );
  const normalizedRequiredScenarioIds =
    normalizeScenarioIds(requiredScenarioIds);
  const coveredScenarioIdSet = new Set(coveredScenarioIds);
  const missingRequiredScenarioIds = normalizedRequiredScenarioIds.filter(
    (scenarioId) => !coveredScenarioIdSet.has(scenarioId),
  );

  return {
    tag,
    status,
    evidenceCount: evidence.length,
    statusCounts,
    waiverCount,
    blockers: [...blockers, ...structuredEvidenceBlockers],
    coveredScenarioIds,
    evidence,
    harness: summarizeHarnessReport(harnessSummary, harnessTrend),
    missingRequiredScenarioIds,
    requiredScenarioIds: normalizedRequiredScenarioIds,
    weakEvidenceScenarioIds,
  };
}

function renderStatusCounts(counts) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) {
    return "无";
  }
  return entries.map(([status, count]) => `${status}: ${count}`).join(" / ");
}

function renderAgentQcReleaseMarkdown(summary) {
  const evidenceLines = summary.evidence.length
    ? summary.evidence
        .map(
          (entry) =>
            `- ${entry.runId}: ${entry.status}；场景 ${entry.scenarioCount}；${renderStatusCounts(entry.scenarioStatusCounts)}${entry.sourcePath ? `；source ${entry.sourcePath}` : ""}`,
        )
        .join("\n")
    : "- 无 Evidence Pack；发布应视为 blocked，除非有明确 waiver。";

  const blockerLines = summary.blockers.length
    ? summary.blockers.map((blocker) => `- ${blocker}`).join("\n")
    : "- 无";

  const harnessLines = [
    summary.harness.readyCount !== null
      ? `- Harness ready: ${summary.harness.readyCount}`
      : "- Harness ready: 未提供",
    summary.harness.invalidCount !== null
      ? `- Harness invalid: ${summary.harness.invalidCount}`
      : "- Harness invalid: 未提供",
    summary.harness.trendSampleCount !== null
      ? `- Harness trend samples: ${summary.harness.trendSampleCount}`
      : "- Harness trend samples: 未提供",
    ...summary.harness.signals.map((signal) => `- ${signal}`),
  ].join("\n");

  return `## Agent QC Evidence${summary.tag ? ` (${summary.tag})` : ""}

- Verdict: ${summary.status}
- Evidence packs: ${summary.evidenceCount}
- Evidence status: ${renderStatusCounts(summary.statusCounts)}
- Scenario coverage: ${summary.requiredScenarioIds?.length ? `${summary.coveredScenarioIds.length}/${summary.requiredScenarioIds.length}` : `${summary.coveredScenarioIds?.length || 0} covered`}
- Waivers: ${summary.waiverCount}

### Evidence Packs

${evidenceLines}

### Harness Trend

${harnessLines}

### Blockers

${blockerLines}
`;
}

function validateReleaseSummary(summary, { requireEvidence = true } = {}) {
  const issues = [];
  if (requireEvidence && summary.evidenceCount === 0) {
    issues.push(
      "缺少 Agent QC Evidence Pack。请先导出 qcloop evidence 或显式记录 waiver。",
    );
  }
  if (summary.status !== "pass") {
    issues.push(
      `Agent QC release summary 状态为 ${summary.status}，不能作为绿色发布证据。`,
    );
  }
  if (asArray(summary.missingRequiredScenarioIds).length > 0) {
    issues.push(
      `Agent QC Evidence Pack 未覆盖必需场景：${summary.missingRequiredScenarioIds.join(", ")}。`,
    );
  }
  if (asArray(summary.weakEvidenceScenarioIds).length > 0) {
    issues.push(
      `Agent QC Evidence Pack 存在缺少结构化 evidenceRefs 的 pass 场景：${summary.weakEvidenceScenarioIds.join(", ")}。`,
    );
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

export {
  buildAgentQcReleaseSummary,
  countByStatus,
  hasStructuredEvidenceRef,
  normalizeScenarioIds,
  renderAgentQcReleaseMarkdown,
  summarizeEvidencePack,
  summarizeHarnessReport,
  validateReleaseSummary,
};
