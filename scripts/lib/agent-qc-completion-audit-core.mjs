function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeIdList(value) {
  return asArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function createItem(id, title, passed, evidence, gap = "") {
  return { id, title, passed: Boolean(passed), evidence: evidence || "", gap: passed ? "" : gap };
}

function summarizeQcloopStatusSidecar(entry) {
  const counts = entry.counts || {};
  return [
    `${entry.path} verdict=${entry.verdictStatus || "unknown"}`,
    `success=${counts.success ?? 0}`,
    `running=${counts.running ?? 0}`,
    `pending=${counts.pending ?? 0}`,
    `stale=${counts.stale ?? 0}`,
  ].join(" ");
}

function buildAgentQcCompletionAudit(facts) {
  const requiredQcloopScenarioIds = normalizeIdList(facts.scenarioReport?.p0ScenarioIds);
  const requiredQcloopScenarioCount =
    requiredQcloopScenarioIds.length || facts.scenarioReport?.p0ScenarioCount || 1;
  const realEvidenceScenarioIds = new Set(normalizeIdList(facts.realEvidencePack?.scenarioIds));
  const missingQcloopScenarioIds = requiredQcloopScenarioIds.filter(
    (scenarioId) => !realEvidenceScenarioIds.has(scenarioId),
  );
  const hasRequiredQcloopCoverage =
    requiredQcloopScenarioIds.length > 0
      ? missingQcloopScenarioIds.length === 0
      : facts.realEvidencePack?.scenarioCount >= requiredQcloopScenarioCount;
  const sidecarEvidenceSummary = asArray(facts.realEvidenceSidecars)
    .map((entry) => `${entry.path} status=${entry.status || "unknown"} scenarios=${entry.scenarioCount || 0}`)
    .join("; ");
  const qcloopStatusSidecarSummary = asArray(facts.qcloopStatusSidecars)
    .map((entry) => {
      const counts = entry.counts
        ? ` success=${entry.counts.success ?? 0} running=${entry.counts.running ?? 0} pending=${entry.counts.pending ?? 0} stale=${entry.counts.stale ?? 0}`
        : "";
      return `${entry.path} verdict=${entry.verdictStatus || "unknown"}${counts}`;
    })
    .join("; ");
  const staleQcloopStatusSidecars = asArray(facts.qcloopStatusSidecars).filter(
    (entry) => entry.verdictStatus === "stale" || Number(entry.counts?.stale || 0) > 0,
  );
  const activeQcloopStatusSidecars = asArray(facts.qcloopStatusSidecars).filter(
    (entry) =>
      entry.verdictStatus === "running" ||
      entry.verdictStatus === "stale" ||
      Number(entry.counts?.running || 0) > 0 ||
      Number(entry.counts?.pending || 0) > 0,
  );
  const qcloopEvidenceText = facts.realEvidencePack?.exists
    ? `.lime/qc/agent-qc-evidence.json status=${facts.realEvidencePack.status || "unknown"} scenarios=${facts.realEvidencePack.scenarioCount || 0}/${requiredQcloopScenarioCount}${missingQcloopScenarioIds.length > 0 ? ` missing=${missingQcloopScenarioIds.join(",")}` : ""}`
    : sidecarEvidenceSummary
      ? `未发现 .lime/qc/agent-qc-evidence.json；sidecars: ${sidecarEvidenceSummary}`
      : "未发现 .lime/qc/agent-qc-evidence.json";
  const qcloopEvidenceWithStatusText = qcloopStatusSidecarSummary
    ? `${qcloopEvidenceText}; qcloopStatus: ${qcloopStatusSidecarSummary}`
    : qcloopEvidenceText;
  const qcloopGapFragments = [];
  if (facts.realEvidencePack?.exists && facts.realEvidencePack.status !== "pass") {
    qcloopGapFragments.push(
      `官方 Evidence Pack 当前 status=${facts.realEvidencePack.status || "unknown"}，不能发布`,
    );
  }
  if (!facts.realEvidencePack?.exists && sidecarEvidenceSummary) {
    qcloopGapFragments.push("已有 sidecar Evidence Pack，但尚未生成 pass 的官方 .lime/qc/agent-qc-evidence.json");
  }
  if (missingQcloopScenarioIds.length > 0) {
    qcloopGapFragments.push(`尚未覆盖 P0 场景：${missingQcloopScenarioIds.join(",")}`);
  }
  if (activeQcloopStatusSidecars.length > 0) {
    qcloopGapFragments.push(
      `仍有 qcloop status sidecar 未终态：${activeQcloopStatusSidecars
        .map(summarizeQcloopStatusSidecar)
        .join("; ")}`,
    );
  }
  if (staleQcloopStatusSidecars.length > 0) {
    qcloopGapFragments.push(
      `其中 stale sidecar：${staleQcloopStatusSidecars.map((entry) => entry.path).join(", ")}`,
    );
  }
  const qcloopGapText =
    qcloopGapFragments.length > 0
      ? `${qcloopGapFragments.join("；")}。`
      : "尚未运行真实 qcloop 批次并导出 pass Evidence Pack。";
  const localVerifyEvidenceText = facts.localVerify?.status
    ? `status=${facts.localVerify.status}${facts.localVerify.failedStage ? ` failedStage=${facts.localVerify.failedStage}` : ""}`
    : "未发现 .lime/qc/verify-local-current.json";
  const guiSmokeEvidenceText = facts.guiSmoke?.status
    ? `; latestGuiSmoke status=${facts.guiSmoke.status}${facts.guiSmoke.failedStage ? ` failedStage=${facts.guiSmoke.failedStage}` : ""}`
    : "";
  const localVerifyGapFragments = [];
  if (facts.localVerify?.status) {
    localVerifyGapFragments.push(
      `verify:local 当前 status=${facts.localVerify.status}${facts.localVerify.error ? `；${facts.localVerify.error}` : ""}`,
    );
  } else {
    localVerifyGapFragments.push("缺少 verify:local 当前结果 sidecar，无法证明仓库统一本地校验通过");
  }
  if (facts.guiSmoke?.status && facts.guiSmoke.status !== "pass") {
    localVerifyGapFragments.push(
      `最近一次 verify:gui-smoke status=${facts.guiSmoke.status}${facts.guiSmoke.error ? `；${facts.guiSmoke.error}` : ""}`,
    );
  }
  const items = [
    createItem(
      "docs-tests-standard",
      "docs/tests 下存在 Agent QC 人读测试文档",
      facts.files?.agentOpsQc &&
        facts.files?.p0Scenarios &&
        facts.files?.limeRolloutPlan &&
        facts.files?.testsReadme,
      "docs/tests/agent-ops-qc.md, docs/tests/agent-qc-p0-scenarios.md, docs/tests/lime-agent-qc-rollout-plan.md, docs/tests/README.md",
      "缺少 docs/tests 测试体系文档。",
    ),
    createItem(
      "scenario-manifest",
      "Agent QC scenario manifest 有效",
      facts.scenarioReport?.valid === true && facts.scenarioReport?.scenarioCount > 0,
      `scenarioCount=${facts.scenarioReport?.scenarioCount ?? 0}`,
      "scenario manifest 未通过校验或没有场景。",
    ),
    createItem(
      "gui-flow-manifest",
      "GUI / Playwright MCP flow manifest 有效",
      facts.guiFlowReport?.valid === true && facts.guiFlowReport?.flowCount > 0,
      `flowCount=${facts.guiFlowReport?.flowCount ?? 0}`,
      "GUI flow manifest 未通过校验或没有 flow。",
    ),
    createItem(
      "evidence-schema",
      "Agent QC Evidence Pack schema 存在",
      facts.files?.evidenceSchema,
      "docs/test/agent-qc-evidence.schema.json",
      "缺少 Evidence Pack schema。",
    ),
    createItem(
      "qcloop-payload-generator",
      "可从 manifest 生成 qcloop job payload",
      facts.files?.qcloopJobScript && facts.qcloopPayload?.valid === true && facts.qcloopPayload?.itemCount > 0,
      `itemCount=${facts.qcloopPayload?.itemCount ?? 0}`,
      "qcloop payload 生成器不可用或没有 item。",
    ),
    createItem(
      "qcloop-verifier-evidence-placeholders",
      "qcloop verifier prompt 带 worker evidence 占位符",
      facts.qcloopPayload?.verifierHasWorkerOutput === true &&
        facts.qcloopPayload?.verifierHasAttemptStatus === true &&
        facts.qcloopPayload?.verifierHasExitCode === true,
      `stdout=${Boolean(facts.qcloopPayload?.verifierHasWorkerOutput)} attempt_status=${Boolean(facts.qcloopPayload?.verifierHasAttemptStatus)} exit_code=${Boolean(facts.qcloopPayload?.verifierHasExitCode)}`,
      "qcloop verifier prompt 缺少 {{stdout}} / {{attempt_status}} / {{exit_code}}，verifier 无法审查 worker 证据。",
    ),
    createItem(
      "structured-evidence-contract",
      "qcloop worker / verifier / exporter 强制结构化 evidence summary",
      facts.files?.evidenceContractDoc &&
      facts.qcloopPayload?.workerPromptHasStructuredEvidence === true &&
        facts.qcloopPayload?.verifierRequiresStructuredEvidence === true &&
        facts.qcloopPayload?.verifierRequiresStrictJson === true &&
        facts.structuredEvidence?.exporterParsesSummary === true &&
        facts.structuredEvidence?.releaseSummaryRejectsWeakRefs === true,
      `doc=${Boolean(facts.files?.evidenceContractDoc)} worker=${Boolean(facts.qcloopPayload?.workerPromptHasStructuredEvidence)} verifier=${Boolean(facts.qcloopPayload?.verifierRequiresStructuredEvidence)} strictJson=${Boolean(facts.qcloopPayload?.verifierRequiresStrictJson)} exporter=${Boolean(facts.structuredEvidence?.exporterParsesSummary)} release=${Boolean(facts.structuredEvidence?.releaseSummaryRejectsWeakRefs)}`,
      "结构化 evidence summary 契约未被文档、payload worker prompt、verifier prompt、exporter 与 release summary gate 同时强制，可能再次接受浅层 qcloop success。",
    ),
    createItem(
      "qcloop-evidence-exporter",
      "可把 qcloop job/items 导出为 Evidence Pack",
      facts.files?.exportEvidenceScript,
      "scripts/agent-qc-export-evidence.mjs",
      "缺少 qcloop Evidence Pack 导出入口。",
    ),
    createItem(
      "qcloop-status-monitor",
      "可只读监控 qcloop 运行批次和 stale item",
      facts.files?.qcloopStatusScript && facts.files?.qcloopOperationsDoc,
      "scripts/agent-qc-qcloop-status.mjs, docs/tests/lime-agent-qc-qcloop-operations.md",
      "缺少 qcloop 只读状态监控脚本或运维手册。",
    ),
    createItem(
      "gui-owner-check",
      "可在启动 GUI P0 前阻断并发 qcloop GUI owner",
      facts.files?.guiOwnerCheckScript && facts.files?.qcloopOperationsDoc,
      "scripts/agent-qc-gui-owner-check.mjs, docs/tests/lime-agent-qc-qcloop-operations.md",
      "缺少 GUI owner 并发检查脚本或运维手册。",
    ),
    createItem(
      "stale-owner-intervention-protocol",
      "stale GUI qcloop owner 有只读取证和 owner 确认协议",
      facts.files?.staleOwnerInterventionDoc &&
        facts.files?.qcloopOperationsDoc &&
        facts.staleOwnerIntervention?.guiOwnerReportHasDecisionPacket === true &&
        facts.staleOwnerIntervention?.docMentionsDecisionPacket === true &&
        facts.staleOwnerIntervention?.guiOwnerReportHasWatchHistory === true &&
        facts.staleOwnerIntervention?.docMentionsWatchHistory === true,
      `doc=${Boolean(facts.files?.staleOwnerInterventionDoc)} operations=${Boolean(facts.files?.qcloopOperationsDoc)} ownerIntervention=${Boolean(facts.staleOwnerIntervention?.guiOwnerReportHasDecisionPacket)} docDecisionPacket=${Boolean(facts.staleOwnerIntervention?.docMentionsDecisionPacket)} watchHistory=${Boolean(facts.staleOwnerIntervention?.guiOwnerReportHasWatchHistory)} docWatchHistory=${Boolean(facts.staleOwnerIntervention?.docMentionsWatchHistory)}`,
      "缺少 stale GUI owner 处置协议、机器可读 ownerIntervention 或 watch history 输出；容易在未确认时误杀 worker、启动并发 GUI P0，或丢失长期观察证据。",
    ),
    createItem(
      "qcloop-worker-preflight",
      "qcloop worker 执行前有 cwd / tmp / DevBridge preflight",
      facts.files?.qcloopPreflightScript &&
        facts.qcloopPayload?.workerPromptHasPreflight === true,
      `script=${Boolean(facts.files?.qcloopPreflightScript)} prompt=${Boolean(facts.qcloopPayload?.workerPromptHasPreflight)}`,
      "缺少 qcloop worker preflight 脚本，或 payload prompt 没有要求执行前置环境检查。",
    ),
    createItem(
      "release-summary",
      "可把 Evidence Pack 汇总为 release note 质量证据",
      facts.files?.releaseSummaryScript,
      "scripts/agent-qc-release-summary.mjs",
      "缺少 release summary 入口。",
    ),
    createItem(
      "github-actions-detached",
      "GitHub Actions 不执行 Agent QC 验证",
      facts.githubActions?.releaseDetached === true &&
        facts.githubActions?.nightlyDetached === true &&
        facts.githubActions?.contractsDetached === true,
      `release=${Boolean(facts.githubActions?.releaseDetached)} nightly=${Boolean(facts.githubActions?.nightlyDetached)} test:contracts=${Boolean(facts.githubActions?.contractsDetached)}`,
      "release、nightly 或 test:contracts 仍会在 GitHub Actions 中触发 Agent QC / qcloop。",
    ),
    createItem(
      "real-qcloop-evidence",
      "存在真实 qcloop Agent QC Evidence Pack",
      facts.realEvidencePack?.status === "pass" &&
        hasRequiredQcloopCoverage,
      qcloopEvidenceWithStatusText,
      qcloopGapText,
    ),
    createItem(
      "real-gui-evidence",
      "存在真实 GUI / Playwright MCP evidence",
      facts.files?.realGuiEvidence,
      facts.files?.realGuiEvidence ? ".lime/qc/gui-evidence" : "未发现 .lime/qc/gui-evidence",
      "尚未执行真实 GUI / Playwright MCP flow 并保存证据。",
    ),
    createItem(
      "local-verify-gate",
      "仓库统一本地校验 verify:local 通过",
      facts.localVerify?.status === "pass",
      `${localVerifyEvidenceText}${guiSmokeEvidenceText}`,
      `${localVerifyGapFragments.join("；")}。`,
    ),
  ];

  const passedCount = items.filter((item) => item.passed).length;
  const failed = items.filter((item) => !item.passed);
  return {
    status: failed.length === 0 ? "complete" : "incomplete",
    passedCount,
    failedCount: failed.length,
    totalCount: items.length,
    completionRatio: items.length === 0 ? 0 : passedCount / items.length,
    items,
    gaps: failed.map((item) => ({ id: item.id, title: item.title, gap: item.gap })),
  };
}

function renderAgentQcCompletionAuditMarkdown(audit) {
  const lines = audit.items.map((item) => {
    const marker = item.passed ? "PASS" : "MISS";
    return `- ${marker} ${item.id}: ${item.title}；证据：${item.evidence}${item.gap ? `；缺口：${item.gap}` : ""}`;
  });
  return `# Agent QC Completion Audit

- Status: ${audit.status}
- Passed: ${audit.passedCount}/${audit.totalCount}
- Completion: ${Math.round(audit.completionRatio * 100)}%

## Checklist

${lines.join("\n")}
`;
}

export { buildAgentQcCompletionAudit, renderAgentQcCompletionAuditMarkdown };
