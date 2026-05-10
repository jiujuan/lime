import { mapQCLoopItemStatus, parseScenarioId } from "./agent-qc-evidence-core.mjs";

const TERMINAL_ITEM_STATUSES = new Set(["success", "failed", "exhausted"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled", "cancelled"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatus(value) {
  return isNonEmptyString(value) ? value.trim().toLowerCase() : "unknown";
}

function parseTimestampMs(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function stringLength(value) {
  return typeof value === "string" ? value.length : 0;
}

function durationMinutes(startedAt, finishedAt, nowMs) {
  const startedMs = parseTimestampMs(startedAt);
  if (startedMs === null) {
    return null;
  }
  const finishedMs = parseTimestampMs(finishedAt) ?? nowMs;
  return Math.max(0, Math.round((finishedMs - startedMs) / 60000));
}

function durationSeconds(startedAt, finishedAt, nowMs) {
  const startedMs = parseTimestampMs(startedAt);
  if (startedMs === null) {
    return null;
  }
  const finishedMs = parseTimestampMs(finishedAt) ?? nowMs;
  return Math.max(0, Math.round((finishedMs - startedMs) / 1000));
}

function latestEntry(entries) {
  const normalizedEntries = asArray(entries).filter(Boolean);
  return normalizedEntries.length > 0 ? normalizedEntries[normalizedEntries.length - 1] : null;
}

function summarizeLatestWorker(item, nowMs) {
  const latestAttempt = latestEntry(item?.attempts);
  if (!latestAttempt) {
    return {
      status: "unknown",
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      durationMinutes: null,
      durationSeconds: null,
      stdoutLength: 0,
      stderrLength: 0,
      outputLength: 0,
    };
  }

  const stdoutLength = stringLength(latestAttempt.stdout);
  const stderrLength = stringLength(latestAttempt.stderr);
  return {
    status: normalizeStatus(latestAttempt.status),
    exitCode: latestAttempt.exit_code ?? null,
    startedAt: latestAttempt.started_at ?? null,
    finishedAt: latestAttempt.finished_at ?? null,
    durationMinutes: durationMinutes(latestAttempt.started_at, latestAttempt.finished_at, nowMs),
    durationSeconds: durationSeconds(latestAttempt.started_at, latestAttempt.finished_at, nowMs),
    stdoutLength,
    stderrLength,
    outputLength: stdoutLength + stderrLength,
  };
}

function summarizeLatestQc(item) {
  const latestQc = latestEntry(item?.qc_rounds);
  if (!latestQc) {
    return {
      status: "unknown",
      feedback: "",
    };
  }
  return {
    status: normalizeStatus(latestQc.status),
    feedback: latestQc.feedback || "",
  };
}

function classifyItemStaleness(item, worker, { staleMinutes = 30 } = {}) {
  const itemStatus = normalizeStatus(item?.status);
  const workerStatus = worker.status;
  const isRunning = itemStatus === "running" || workerStatus === "running";
  const isTerminal = TERMINAL_ITEM_STATUSES.has(itemStatus);
  const reasons = [];

  if (!isRunning || isTerminal || staleMinutes <= 0) {
    return { stale: false, reasons };
  }

  if (worker.startedAt === null) {
    reasons.push("running item 缺少 worker started_at，无法判断进度");
  }

  if (worker.durationMinutes !== null && worker.durationMinutes >= staleMinutes && worker.outputLength === 0) {
    reasons.push(`worker 运行 ${worker.durationMinutes} 分钟且 stdout/stderr 为空`);
  }

  return {
    stale: reasons.length > 0,
    reasons,
  };
}

function summarizeItem(item, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const worker = summarizeLatestWorker(item, nowMs);
  const qc = summarizeLatestQc(item);
  const itemStatus = normalizeStatus(item?.status);
  const terminal = TERMINAL_ITEM_STATUSES.has(itemStatus);
  const staleness = classifyItemStaleness(item, worker, options);

  return {
    scenarioId: parseScenarioId(item?.item_value),
    itemId: item?.id || "",
    qcloopStatus: itemStatus,
    evidenceStatus: mapQCLoopItemStatus(item?.status, item),
    terminal,
    stale: staleness.stale,
    staleReasons: staleness.reasons,
    staleSeconds: staleness.stale ? worker.durationSeconds : null,
    currentAttemptNo: item?.current_attempt_no ?? 0,
    currentQcNo: item?.current_qc_no ?? 0,
    worker,
    qc,
  };
}

function countByStatus(items) {
  const counts = {
    total: items.length,
    success: 0,
    failed: 0,
    exhausted: 0,
    running: 0,
    pending: 0,
    unknown: 0,
    terminal: 0,
    nonTerminal: 0,
    stale: 0,
  };

  for (const item of items) {
    const status = item.qcloopStatus;
    if (status in counts) {
      counts[status] += 1;
    } else {
      counts.unknown += 1;
    }
    if (item.terminal) {
      counts.terminal += 1;
    } else {
      counts.nonTerminal += 1;
    }
    if (item.stale) {
      counts.stale += 1;
    }
  }

  return counts;
}

function buildVerdict(job, items, counts) {
  const jobStatus = normalizeStatus(job?.status);
  const terminalProblemItems = items.filter((item) => item.qcloopStatus === "failed" || item.qcloopStatus === "exhausted");
  const terminalBlockedItems = terminalProblemItems.filter((item) => item.evidenceStatus === "blocked");
  const terminalFailedItems = terminalProblemItems.filter((item) => item.evidenceStatus === "fail");
  if (counts.stale > 0) {
    return {
      status: "stale",
      summary: `qcloop job ${job?.id || "unknown"} 仍在运行，${counts.stale} 个 item 疑似无进度。`,
      nextAction: "不要中断进程；先导出 sidecar、记录卡点，等当前 worker 结束后再提交修正后的重跑 payload。",
    };
  }
  if (counts.running > 0 || counts.pending > 0 || !TERMINAL_JOB_STATUSES.has(jobStatus)) {
    return {
      status: "running",
      summary: `qcloop job ${job?.id || "unknown"} 尚未进入终态，running=${counts.running} pending=${counts.pending}。`,
      nextAction: "继续观察 job/items；如果需要证据，只导出 sidecar，不覆盖官方 Evidence Pack。",
    };
  }
  if (terminalFailedItems.length > 0 || (jobStatus === "failed" && terminalBlockedItems.length === 0)) {
    return {
      status: "fail",
      summary: `qcloop job ${job?.id || "unknown"} 已终止但仍有 failed/exhausted item。`,
      nextAction: "修复失败项或补足 verifier 可审查证据后，发起新的 qcloop 批次。",
    };
  }
  if (terminalBlockedItems.length > 0) {
    return {
      status: "blocked",
      summary: `qcloop job ${job?.id || "unknown"} 已终止但 ${terminalBlockedItems.length} 个 item 明确报告 worker 环境阻断。`,
      nextAction: "先修复 qcloop worker 环境或权限，再用新批次重跑被阻断场景；不要覆盖官方 Evidence Pack。",
    };
  }
  if (items.length > 0 && counts.success === items.length && jobStatus === "completed") {
    return {
      status: "complete",
      summary: `qcloop job ${job?.id || "unknown"} 已完成，全部 item success。`,
      nextAction: "可导出官方 Evidence Pack，并运行 release summary 与 completion audit。",
    };
  }
  return {
    status: "needs-human-review",
    summary: `qcloop job ${job?.id || "unknown"} 状态无法自动归类。`,
    nextAction: "人工审查 qcloop job/items 原始 JSON，再决定是否重跑或补 exporter 规则。",
  };
}

function buildQCLoopStatusReport({ job, items, options = {} }) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const nowMs = parseTimestampMs(generatedAt) ?? Date.now();
  const parsedStaleMinutes = Number(options.staleMinutes ?? 30);
  const staleMinutes = Number.isFinite(parsedStaleMinutes) ? parsedStaleMinutes : 30;
  const itemSummaries = asArray(items).map((item) =>
    summarizeItem(item, {
      nowMs,
      staleMinutes,
    }),
  );
  const counts = countByStatus(itemSummaries);
  const verdict = buildVerdict(job, itemSummaries, counts);

  return {
    schemaVersion: "v1",
    generatedAt,
    staleMinutes,
    job: {
      id: job?.id || "unknown",
      name: job?.name || "",
      status: normalizeStatus(job?.status),
      createdAt: job?.created_at || null,
      finishedAt: job?.finished_at || null,
      terminal: TERMINAL_JOB_STATUSES.has(normalizeStatus(job?.status)),
    },
    counts,
    items: itemSummaries,
    verdict,
  };
}

function validateQCLoopStatusReport(report) {
  const issues = [];
  if (report?.schemaVersion !== "v1") {
    issues.push("schemaVersion 必须是 v1。");
  }
  if (!report?.job || !isNonEmptyString(report.job.id)) {
    issues.push("缺少 job.id。");
  }
  if (!Array.isArray(report?.items)) {
    issues.push("items 必须是数组。");
  }
  if (!report?.counts || typeof report.counts.total !== "number") {
    issues.push("缺少 counts.total。");
  }
  if (!report?.verdict || !isNonEmptyString(report.verdict.status)) {
    issues.push("缺少 verdict.status。");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

export {
  buildQCLoopStatusReport,
  classifyItemStaleness,
  normalizeStatus,
  summarizeItem,
  validateQCLoopStatusReport,
};
