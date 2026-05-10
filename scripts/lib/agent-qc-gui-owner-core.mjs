function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeScenarioId(value) {
  return String(value || "").trim();
}

function collectGuiScenarioIds(manifest) {
  return asArray(manifest?.scenarios)
    .filter((scenario) =>
      asArray(scenario?.evidenceRequired).includes("GUI session owner / isolation statement"),
    )
    .map((scenario) => normalizeScenarioId(scenario?.id))
    .filter(Boolean);
}

function summarizeActiveGuiItems(status, guiScenarioIds) {
  const guiScenarioIdSet = new Set(guiScenarioIds);
  return asArray(status?.items)
    .filter((item) => guiScenarioIdSet.has(normalizeScenarioId(item?.scenarioId)))
    .filter((item) => item?.terminal !== true)
    .map((item) => ({
      scenarioId: normalizeScenarioId(item?.scenarioId),
      qcloopStatus: item?.qcloopStatus || "unknown",
      evidenceStatus: item?.evidenceStatus || "unknown",
      stale: Boolean(item?.stale),
      staleSeconds: item?.staleSeconds ?? null,
      workerStatus: item?.worker?.status || "unknown",
      workerDurationSeconds: item?.worker?.durationSeconds ?? null,
    }));
}

function createAgentQcGuiOwnerReport({
  manifest,
  statusSidecars = [],
  generatedAt = new Date().toISOString(),
  maxActiveOwners = 0,
} = {}) {
  const guiScenarioIds = collectGuiScenarioIds(manifest);
  const sidecarsByJobId = new Map();
  for (const sidecar of asArray(statusSidecars)) {
    const status = sidecar?.status || sidecar;
    const jobId = status?.job?.id || sidecar?.path || "unknown";
    const entries = sidecarsByJobId.get(jobId) || [];
    entries.push(sidecar);
    sidecarsByJobId.set(jobId, entries);
  }

  const activeOwnerByJobId = new Map();

  for (const sidecars of sidecarsByJobId.values()) {
    const sidecar = selectRepresentativeSidecar(sidecars);
    const status = sidecar?.status || sidecar;
    const activeItems = summarizeActiveGuiItems(status, guiScenarioIds);
    if (activeItems.length === 0) {
      continue;
    }

    const jobId = status?.job?.id || sidecar?.path || "unknown";
    const existing = activeOwnerByJobId.get(jobId);
    const owner = {
      path: sidecar?.path || "",
      jobId,
      jobName: status?.job?.name || "",
      jobStatus: status?.job?.status || "unknown",
      verdictStatus: status?.verdict?.status || "unknown",
      counts: status?.counts || null,
      activeItems,
    };

    if (!existing) {
      activeOwnerByJobId.set(jobId, owner);
      continue;
    }

    const existingStaleCount = existing.activeItems.filter((item) => item.stale).length;
    const ownerStaleCount = owner.activeItems.filter((item) => item.stale).length;
    if (ownerStaleCount > existingStaleCount) {
      activeOwnerByJobId.set(jobId, owner);
    }
  }

  const activeOwners = Array.from(activeOwnerByJobId.values()).sort((left, right) =>
    left.jobId.localeCompare(right.jobId),
  );
  const ownerCount = activeOwners.length;
  const staleOwners = activeOwners.filter((owner) =>
    owner.activeItems.some((item) => item.stale),
  );
  const staleOwnerCount = staleOwners.length;
  const oldestStaleSeconds = Math.max(
    0,
    ...activeOwners.flatMap((owner) =>
      owner.activeItems
        .filter((item) => item.stale)
        .map((item) => Number(item.staleSeconds || 0)),
    ),
  );
  const pass = ownerCount <= maxActiveOwners;
  const ownerIntervention =
    staleOwnerCount > 0 ? createOwnerIntervention(activeOwners) : null;

  return {
    schemaVersion: "v1",
    generatedAt,
    maxActiveOwners,
    guiScenarioIds,
    ownerCount,
    staleOwnerCount,
    oldestStaleSeconds,
    activeOwners,
    ownerIntervention,
    verdict: {
      status: pass ? "pass" : "blocked",
      summary: pass
        ? `active GUI qcloop owner=${ownerCount}，未超过上限 ${maxActiveOwners}。`
        : `active GUI qcloop owner=${ownerCount}，超过上限 ${maxActiveOwners}${staleOwnerCount > 0 ? `；其中 stale owner=${staleOwnerCount}，最长 ${oldestStaleSeconds}s` : ""}。`,
      nextAction: pass
        ? "可以在其他 release gate 满足后启动新的 GUI P0 批次。"
        : staleOwnerCount > 0
          ? "不要启动新的 GUI P0 批次；当前存在 stale GUI owner，只能继续只读观察，或由该 owner 明确确认后处理。"
          : "不要启动新的 GUI P0 批次；等待现有 running 批次自然结束或由 owner 明确处理。",
    },
  };
}

function createOwnerIntervention(activeOwners) {
  const staleOwners = activeOwners.filter((owner) =>
    owner.activeItems.some((item) => item.stale),
  );
  const primaryOwner = staleOwners[0];
  const primaryJobId = primaryOwner?.jobId || "<job-id>";
  return {
    status: "requires_owner_confirmation",
    jobIds: staleOwners.map((owner) => owner.jobId),
    requiredConfirmationText: `确认处理 stale GUI owner ${primaryJobId}，可以终止 PID <pid> 并记录 sidecar。`,
    prohibitedUntilConfirmed: [
      "kill / pause / interrupt stale worker",
      "modify qcloop SQLite DB",
      "start another full GUI P0 batch",
      "overwrite .lime/qc/agent-qc-evidence.json",
      "git commit / push / tag / release",
    ],
    evidenceRefs: staleOwners.map((owner) => owner.path).filter(Boolean),
    nextAction:
      "先刷新 qcloop status、GUI owner、DB lease 和进程证据；只有 owner 明确确认后才能处理 stale worker。",
  };
}

function isTerminalJobStatus(status) {
  const jobStatus = String(status?.job?.status || "").toLowerCase();
  return (
    status?.job?.terminal === true ||
    ["completed", "failed", "cancelled", "canceled"].includes(jobStatus)
  );
}

function selectRepresentativeSidecar(sidecars) {
  const terminal = asArray(sidecars).find((sidecar) => isTerminalJobStatus(sidecar?.status || sidecar));
  if (terminal) {
    return terminal;
  }

  return asArray(sidecars).reduce((selected, candidate) => {
    if (!selected) {
      return candidate;
    }
    const selectedStatus = selected?.status || selected;
    const candidateStatus = candidate?.status || candidate;
    const selectedStale = Number(selectedStatus?.counts?.stale || 0);
    const candidateStale = Number(candidateStatus?.counts?.stale || 0);
    if (candidateStale > selectedStale) {
      return candidate;
    }
    if (candidateStale < selectedStale) {
      return selected;
    }
    const selectedMaxStaleSeconds = maxItemStaleSeconds(selectedStatus);
    const candidateMaxStaleSeconds = maxItemStaleSeconds(candidateStatus);
    if (candidateMaxStaleSeconds > selectedMaxStaleSeconds) {
      return candidate;
    }
    if (candidateMaxStaleSeconds < selectedMaxStaleSeconds) {
      return selected;
    }
    const selectedRunning = Number(selectedStatus?.counts?.running || 0);
    const candidateRunning = Number(candidateStatus?.counts?.running || 0);
    if (candidateRunning > selectedRunning) {
      return candidate;
    }
    if (candidateRunning < selectedRunning) {
      return selected;
    }
    return generatedAtMs(candidateStatus) > generatedAtMs(selectedStatus) ? candidate : selected;
  }, null);
}

function maxItemStaleSeconds(status) {
  return Math.max(
    0,
    ...asArray(status?.items).map((item) => Number(item?.staleSeconds || 0)),
  );
}

function generatedAtMs(status) {
  const value = Date.parse(String(status?.generatedAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function renderAgentQcGuiOwnerSummary(report) {
  const lines = [
    `status=${report.verdict.status}`,
    `activeOwners=${report.ownerCount}`,
    `staleOwners=${report.staleOwnerCount ?? 0}`,
    `oldestStaleSeconds=${report.oldestStaleSeconds ?? 0}`,
    `maxActiveOwners=${report.maxActiveOwners}`,
    `guiScenarios=${report.guiScenarioIds.join(",")}`,
    `summary=${report.verdict.summary}`,
  ];
  for (const owner of report.activeOwners) {
    const items = owner.activeItems
      .map((item) =>
        `${item.scenarioId}:${item.qcloopStatus}${item.stale ? `:stale=${item.staleSeconds ?? 0}s` : ""}`,
      )
      .join(",");
    lines.push(`owner=${owner.jobId} jobStatus=${owner.jobStatus} verdict=${owner.verdictStatus} path=${owner.path} items=${items}`);
  }
  return `${lines.join("\n")}\n`;
}

function createAgentQcGuiOwnerWatchEntry(report) {
  return {
    schemaVersion: "v1",
    observedAt: report?.generatedAt || new Date().toISOString(),
    verdictStatus: report?.verdict?.status || "unknown",
    ownerCount: report?.ownerCount ?? 0,
    staleOwnerCount: report?.staleOwnerCount ?? 0,
    oldestStaleSeconds: report?.oldestStaleSeconds ?? 0,
    activeOwners: asArray(report?.activeOwners).map((owner) => ({
      jobId: owner.jobId,
      jobStatus: owner.jobStatus,
      verdictStatus: owner.verdictStatus,
      path: owner.path,
      activeItems: asArray(owner.activeItems).map((item) => ({
        scenarioId: item.scenarioId,
        qcloopStatus: item.qcloopStatus,
        evidenceStatus: item.evidenceStatus,
        stale: Boolean(item.stale),
        staleSeconds: item.staleSeconds ?? null,
        workerStatus: item.workerStatus,
        workerDurationSeconds: item.workerDurationSeconds ?? null,
      })),
    })),
  };
}

export {
  collectGuiScenarioIds,
  createAgentQcGuiOwnerWatchEntry,
  createAgentQcGuiOwnerReport,
  createOwnerIntervention,
  renderAgentQcGuiOwnerSummary,
};
