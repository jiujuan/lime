const QCLoopTerminalStatus = new Set(["success", "failed", "exhausted"]);
const QCLoopEvidenceSummaryMarker = "QCLOOP_EVIDENCE_SUMMARY_JSON=";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatus(value) {
  return isNonEmptyString(value) ? value.trim().toLowerCase() : "unknown";
}

function collectAttemptStdout(item) {
  return asArray(item?.attempts)
    .map((attempt) => (typeof attempt?.stdout === "string" ? attempt.stdout : ""))
    .join("\n");
}

function collectAttemptStderr(item) {
  return asArray(item?.attempts)
    .map((attempt) => (typeof attempt?.stderr === "string" ? attempt.stderr : ""))
    .join("\n");
}

function collectAttemptOutput(item) {
  return [collectAttemptStdout(item), collectAttemptStderr(item)].join("\n");
}

function isQCLoopWorkerBlocked(item) {
  return /QCLOOP_WORKER_RESULT\s*[:=]\s*BLOCKED/i.test(collectAttemptStdout(item));
}

function isQCLoopWorkerEnvironmentBlocked(item) {
  return [
    /QCLOOP_CODEX_BIN\s+不可用/i,
    /QCLOOP_CODEX_EXTRA_ARGS\s+解析失败/i,
    /QCLOOP_CODEX_SANDBOX=.*无效/i,
    /fork\/exec .* no such file or directory/i,
    /incorrect api key provided/i,
    /failed to connect to websocket: HTTP error: 401 Unauthorized/i,
  ].some((pattern) => pattern.test(collectAttemptOutput(item)));
}

function isQCLoopWorkerSelfReportedPass(item) {
  return /QCLOOP_WORKER_RESULT\s*[:=]\s*PASS/i.test(collectAttemptStdout(item));
}

function parseQCLoopEvidenceSummaryLine(line) {
  if (!isNonEmptyString(line)) {
    return { summary: null, error: "" };
  }
  const markerIndex = line.indexOf(QCLoopEvidenceSummaryMarker);
  if (markerIndex < 0) {
    return { summary: null, error: "" };
  }

  const rawJson = line.slice(markerIndex + QCLoopEvidenceSummaryMarker.length).trim();
  if (!rawJson) {
    return { summary: null, error: "empty" };
  }
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { summary: null, error: "not_object" };
    }
    return { summary: parsed, error: "" };
  } catch {
    return { summary: null, error: "invalid_json" };
  }
}

function collectQCLoopEvidenceSummaries(item) {
  const summaries = [];
  const parseErrors = [];
  const stdout = collectAttemptStdout(item);
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes(QCLoopEvidenceSummaryMarker)) {
      continue;
    }
    const parsed = parseQCLoopEvidenceSummaryLine(line);
    if (parsed.summary) {
      summaries.push(parsed.summary);
    } else {
      parseErrors.push(parsed.error || "unknown");
    }
  }
  return { summaries, parseErrors };
}

function latestQCLoopEvidenceSummary(item) {
  const { summaries } = collectQCLoopEvidenceSummaries(item);
  return summaries.at(-1) || null;
}

function normalizeEvidenceResult(value) {
  const normalized = normalizeStatus(value);
  if (["pass", "passed", "success"].includes(normalized)) {
    return "pass";
  }
  if (["blocked", "block"].includes(normalized)) {
    return "blocked";
  }
  if (["fail", "failed", "failure", "error"].includes(normalized)) {
    return "fail";
  }
  return "unknown";
}

function hasFailedQCLoopExecution(item) {
  const status = normalizeStatus(item?.status);
  if (status === "failed" || status === "exhausted") {
    return true;
  }
  if (asArray(item?.attempts).some((attempt) => normalizeStatus(attempt?.status) === "failed")) {
    return true;
  }
  return asArray(item?.qc_rounds).some((round) => normalizeStatus(round?.status) === "fail");
}

function mapQCLoopItemStatus(status, item = null) {
  const normalized = normalizeStatus(status);
  const evidenceSummary = item ? latestQCLoopEvidenceSummary(item) : null;
  const evidenceResult = evidenceSummary ? normalizeEvidenceResult(evidenceSummary.result) : "unknown";
  if (evidenceResult === "blocked") {
    return "blocked";
  }
  if (evidenceResult === "fail") {
    return "fail";
  }
  if (normalized === "success") {
    return item ? (evidenceSummary ? "pass" : "fail") : "pass";
  }
  if (isQCLoopWorkerBlocked(item) || isQCLoopWorkerEnvironmentBlocked(item)) {
    return "blocked";
  }
  if (normalized === "failed" || normalized === "exhausted") {
    return "fail";
  }
  if (normalized === "running" || normalized === "pending") {
    return "blocked";
  }
  return "needs-human-review";
}

function mapQCLoopJobStatus(status, itemStatuses) {
  const normalized = normalizeStatus(status);
  if (itemStatuses.some((itemStatus) => itemStatus === "fail")) {
    return "fail";
  }
  if (itemStatuses.some((itemStatus) => itemStatus === "blocked")) {
    return "blocked";
  }
  if (itemStatuses.some((itemStatus) => itemStatus === "needs-human-review")) {
    return "needs-human-review";
  }
  if (normalized === "completed") {
    return "pass";
  }
  if (normalized === "failed") {
    return "fail";
  }
  if (normalized === "paused" || normalized === "running" || normalized === "pending") {
    return "blocked";
  }
  return "needs-human-review";
}

function parseScenarioId(itemValue) {
  if (!isNonEmptyString(itemValue)) {
    return "unknown-scenario";
  }

  const trimmed = itemValue.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      for (const key of ["scenarioId", "scenario_id", "id", "name", "entry"]) {
        if (isNonEmptyString(parsed?.[key])) {
          return parsed[key].trim();
        }
      }
    } catch {
      // 非 JSON item 按普通字符串处理。
    }
  }

  return trimmed.split(/[\s,|]+/)[0] || "unknown-scenario";
}

function collectItemFailureModes(item) {
  const modes = [];
  const status = normalizeStatus(item?.status);
  const { summaries, parseErrors } = collectQCLoopEvidenceSummaries(item);
  if (parseErrors.length > 0) {
    modes.push("qcloop:evidence_summary_invalid_json");
  }
  if (status === "success" && summaries.length === 0 && parseErrors.length === 0) {
    modes.push("qcloop:evidence_summary_missing");
  }
  if (status === "failed") {
    modes.push("qcloop:item_failed");
  }
  if (status === "exhausted") {
    modes.push("qcloop:max_qc_rounds_exhausted");
  }
  if (status === "running" || status === "pending") {
    modes.push("qcloop:item_not_terminal");
  }
  if (isNonEmptyString(item?.last_error)) {
    modes.push("qcloop:last_error_present");
  }
  if (isQCLoopWorkerBlocked(item)) {
    modes.push("qcloop:worker_blocked");
  }
  if (isQCLoopWorkerEnvironmentBlocked(item)) {
    modes.push("qcloop:worker_environment_blocked");
  }
  if (isQCLoopWorkerSelfReportedPass(item) && hasFailedQCLoopExecution(item)) {
    modes.push("qcloop:worker_self_report_pass_not_verified");
  }

  for (const attempt of asArray(item?.attempts)) {
    if (normalizeStatus(attempt.status) === "failed") {
      modes.push(`qcloop:attempt_${attempt.attempt_no ?? "unknown"}_failed`);
    }
  }

  for (const round of asArray(item?.qc_rounds)) {
    if (normalizeStatus(round.status) === "fail") {
      modes.push(`qcloop:qc_${round.qc_no ?? "unknown"}_failed`);
    }
  }

  return Array.from(new Set(modes));
}

function collectEvidenceSummaryArtifactRefs(summary) {
  const refs = [];
  for (const command of asArray(summary?.commands)) {
    for (const key of ["stdout_artifact", "stderr_artifact", "logRef", "log_ref"]) {
      if (isNonEmptyString(command?.[key])) {
        refs.push(command[key].trim());
      }
    }
  }
  for (const evidence of asArray(summary?.evidence_required)) {
    if (isNonEmptyString(evidence?.artifact_path)) {
      refs.push(evidence.artifact_path.trim());
    }
  }
  for (const artifact of asArray(summary?.artifacts)) {
    if (typeof artifact === "string" && artifact.trim()) {
      refs.push(artifact.trim());
      continue;
    }
    if (isNonEmptyString(artifact?.path)) {
      refs.push(artifact.path.trim());
    }
  }
  if (isNonEmptyString(summary?.gui_session_owner)) {
    refs.push(`gui-session-owner:${summary.gui_session_owner.trim()}`);
  }
  if (isNonEmptyString(summary?.release_scope)) {
    refs.push(`release-scope:${summary.release_scope.trim()}`);
  }
  return refs;
}

function collectEvidenceRefs(item) {
  const refs = [];
  if (isNonEmptyString(item?.id)) {
    refs.push(`qcloop:item:${item.id}`);
  }
  for (const attempt of asArray(item?.attempts)) {
    if (isNonEmptyString(attempt?.id)) {
      refs.push(`qcloop:attempt:${attempt.id}`);
    }
  }
  for (const round of asArray(item?.qc_rounds)) {
    if (isNonEmptyString(round?.id)) {
      refs.push(`qcloop:qc:${round.id}`);
    }
  }
  for (const summary of collectQCLoopEvidenceSummaries(item).summaries) {
    refs.push(...collectEvidenceSummaryArtifactRefs(summary));
  }
  return Array.from(new Set(refs));
}

function findArtifactRefByKind(summary, kind) {
  for (const artifact of asArray(summary?.artifacts)) {
    if (typeof artifact === "string") {
      if (artifact.includes(kind)) {
        return artifact;
      }
      continue;
    }
    if (artifact?.kind === kind && isNonEmptyString(artifact?.path)) {
      return artifact.path.trim();
    }
  }
  return "";
}

function summarizeQCLoopItem(item) {
  const attempts = asArray(item?.attempts);
  const qcRounds = asArray(item?.qc_rounds);
  const failedQcRound = qcRounds.find((round) => normalizeStatus(round.status) === "fail");
  const latestQcRound = qcRounds.at(-1);
  const status = mapQCLoopItemStatus(item?.status, item);
  const evidenceSummary = latestQCLoopEvidenceSummary(item);

  return {
    scenarioId: parseScenarioId(item?.item_value),
    status,
    executor: "qcloop",
    attempts: attempts.length,
    evidenceRefs: collectEvidenceRefs(item),
    failureModes: collectItemFailureModes(item),
    humanReview: {
      required: status === "needs-human-review",
      reason:
        status === "needs-human-review"
          ? "qcloop item 状态无法自动归类，需要人工审核。"
          : "无需人工审核。",
      decision: status === "needs-human-review" ? "not-reviewed" : "approved",
    },
    runtimeTranscriptRef:
      findArtifactRefByKind(evidenceSummary, "runtime-transcript") ||
      (attempts.length > 0 ? `qcloop:item:${item.id}:attempts` : ""),
    guiTraceRef: findArtifactRefByKind(evidenceSummary, "gui-trace"),
    consoleErrorCount: 0,
    networkErrorCount: 0,
    _summary: {
      itemId: item?.id ?? "",
      itemValue: item?.item_value ?? "",
      qcloopStatus: item?.status ?? "unknown",
      currentAttemptNo: item?.current_attempt_no ?? 0,
      currentQcNo: item?.current_qc_no ?? 0,
      latestFeedback: failedQcRound?.feedback || latestQcRound?.feedback || item?.last_error || "",
      evidenceSummaryPresent: Boolean(evidenceSummary),
    },
  };
}

function stripPrivateSummary(scenarioResult) {
  const { _summary, ...publicResult } = scenarioResult;
  return publicResult;
}

function collectChangedFiles(options) {
  return asArray(options.changedFiles).filter(isNonEmptyString);
}

function buildAgentQcEvidencePack({ job, items, options = {} }) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const scenarioSummaries = asArray(items).map(summarizeQCLoopItem);
  const scenarioResults = scenarioSummaries.map(stripPrivateSummary);
  const itemStatuses = scenarioResults.map((result) => result.status);
  const verdictStatus = mapQCLoopJobStatus(job?.status, itemStatuses);
  const failedItems = scenarioSummaries.filter((result) => result.status === "fail");
  const blockedItems = scenarioSummaries.filter((result) => result.status === "blocked");
  const reviewItems = scenarioSummaries.filter((result) => result.status === "needs-human-review");
  const commandStatus = verdictStatus === "pass" ? "pass" : verdictStatus;

  return {
    schemaVersion: "v1",
    runId: options.runId || `qcloop-${job?.id || "unknown"}-${Date.parse(generatedAt) || Date.now()}`,
    generatedAt,
    subject: {
      repo: options.repo || "lime",
      ref: options.ref || "unknown",
      diffBase: options.diffBase || "",
      changedFiles: collectChangedFiles(options),
      riskTags: ["agent-qc", "qcloop", ...(options.riskTags || [])],
    },
    laneResults: [
      {
        laneId: "L4-behavior-eval",
        status: commandStatus,
        commands: [
          {
            command: `qcloop job ${job?.id || "unknown"}`,
            status: commandStatus,
            artifactRefs: [
              `qcloop:job:${job?.id || "unknown"}`,
              `qcloop:items:${job?.id || "unknown"}`,
            ],
          },
        ],
        notes: [
          `qcloop job status: ${job?.status || "unknown"}`,
          `items: ${scenarioResults.length}`,
          `failed: ${failedItems.length}`,
          `blocked: ${blockedItems.length}`,
          `needs review: ${reviewItems.length}`,
        ],
      },
    ],
    scenarioResults,
    verdict: {
      status: verdictStatus,
      summary: renderVerdictSummary({ job, scenarioResults, failedItems, blockedItems, reviewItems }),
      blockers: renderBlockers({ failedItems, blockedItems, reviewItems }),
      waivers: [],
      nextAction: renderNextAction(verdictStatus),
    },
  };
}

function renderVerdictSummary({ job, scenarioResults, failedItems, blockedItems, reviewItems }) {
  return `qcloop job ${job?.id || "unknown"} (${job?.status || "unknown"}) 导出 ${scenarioResults.length} 个场景结果：失败 ${failedItems.length}，阻断 ${blockedItems.length}，需人审 ${reviewItems.length}。`;
}

function renderBlockers({ failedItems, blockedItems, reviewItems }) {
  const blockers = [];
  for (const result of failedItems) {
    let reason = result._summary.latestFeedback || "qcloop item failed";
    if (result.failureModes.includes("qcloop:evidence_summary_missing")) {
      reason = "qcloop item 已 success，但 stdout 缺少 QCLOOP_EVIDENCE_SUMMARY_JSON；不能作为 release pass。";
    } else if (result.failureModes.includes("qcloop:evidence_summary_invalid_json")) {
      reason = "qcloop stdout 包含 QCLOOP_EVIDENCE_SUMMARY_JSON，但 JSON 无法解析。";
    } else if (result.failureModes.includes("qcloop:worker_self_report_pass_not_verified")) {
      reason = `worker stdout 自报 QCLOOP_WORKER_RESULT=PASS，但 qcloop / verifier 未通过；latest verifier feedback: ${result._summary.latestFeedback || "无"}`;
    }
    blockers.push(`${result.scenarioId}: ${reason}`);
  }
  for (const result of blockedItems) {
    const reason = result.failureModes.includes("qcloop:worker_environment_blocked")
      ? "qcloop worker 环境阻断；请检查内层 CLI 二进制、认证、sandbox 或 extra args。"
      : result.failureModes.includes("qcloop:worker_blocked")
        ? `qcloop worker 明确输出 QCLOOP_WORKER_RESULT=BLOCKED；latest verifier feedback: ${result._summary.latestFeedback || "无"}`
        : `qcloop item 未进入终态 (${result._summary.qcloopStatus})`;
    blockers.push(`${result.scenarioId}: ${reason}`);
  }
  for (const result of reviewItems) {
    blockers.push(`${result.scenarioId}: 状态无法自动归类，需要人工审核`);
  }
  return blockers;
}

function renderNextAction(status) {
  if (status === "pass") {
    return "可把 Evidence Pack 挂到 PR / release 证据摘要。";
  }
  if (status === "fail") {
    return "优先修复 failed/exhausted item，并把高价值失败沉淀为 replay 或稳定回归。";
  }
  if (status === "blocked") {
    return "先恢复 qcloop job 到终态，或记录环境/权限阻断原因。";
  }
  return "安排人工审核 verifier feedback，再决定修复、waive 或补测试。";
}

function validateEvidencePackShape(pack) {
  const issues = [];
  for (const field of ["schemaVersion", "runId", "generatedAt", "subject", "laneResults", "scenarioResults", "verdict"]) {
    if (!(field in pack)) {
      issues.push(`缺少字段 ${field}`);
    }
  }
  if (pack.schemaVersion !== "v1") {
    issues.push("schemaVersion 必须是 v1");
  }
  if (!Array.isArray(pack.laneResults)) {
    issues.push("laneResults 必须是数组");
  }
  if (!Array.isArray(pack.scenarioResults)) {
    issues.push("scenarioResults 必须是数组");
  }
  if (!pack.verdict || !["pass", "fail", "blocked", "needs-human-review", "waived"].includes(pack.verdict.status)) {
    issues.push("verdict.status 不合法");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

export {
  buildAgentQcEvidencePack,
  collectEvidenceRefs,
  collectItemFailureModes,
  collectQCLoopEvidenceSummaries,
  isQCLoopWorkerEnvironmentBlocked,
  isQCLoopWorkerBlocked,
  isQCLoopWorkerSelfReportedPass,
  mapQCLoopItemStatus,
  mapQCLoopJobStatus,
  parseScenarioId,
  parseQCLoopEvidenceSummaryLine,
  summarizeQCLoopItem,
  validateEvidencePackShape,
};
