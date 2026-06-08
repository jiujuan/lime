const PROVIDER_PICK_ORDER = ["deepseek", "doubao", "lime-hub", "openai"];
const TERMINAL_THREAD_STATUSES = new Set([
  "completed",
  "failed",
  "aborted",
  "idle",
  "waiting_request",
]);
const RUNNING_THREAD_STATUSES = new Set(["running", "queued", "interrupting"]);
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_METHOD_MODEL_PROVIDER_LIST = "modelProvider/list";
const APP_SERVER_METHOD_MODEL_PROVIDER_READ = "modelProvider/read";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertSmoke(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function normalizeProviderId(provider) {
  return String(provider?.id || provider?.provider_id || provider?.providerId || "").trim();
}

export function providerEnabled(provider) {
  return provider?.enabled !== false;
}

export function providerHasUsableKey(provider) {
  const keys = Array.isArray(provider?.api_keys)
    ? provider.api_keys
    : Array.isArray(provider?.apiKeys)
      ? provider.apiKeys
      : [];
  return keys.some((key) => key?.enabled !== false);
}

export function pickModelPreference(provider) {
  const candidates = [
    ...(Array.isArray(provider?.custom_models) ? provider.custom_models : []),
    ...(Array.isArray(provider?.customModels) ? provider.customModels : []),
    ...(Array.isArray(provider?.models) ? provider.models : []),
  ]
    .map((value) =>
      typeof value === "string"
        ? value
        : String(value?.name || value?.id || value?.model || "").trim(),
    )
    .filter(Boolean);

  return (
    candidates.find((value) => /flash|mini|lite|small/i.test(value)) ||
    candidates[0] ||
    ""
  );
}

export function pickProvider(providers, preferredProviderId = "") {
  const enabled = providers.filter((provider) => providerEnabled(provider));
  const keyed = enabled.filter((provider) => providerHasUsableKey(provider));
  const pool = keyed.length > 0 ? keyed : enabled;

  if (preferredProviderId) {
    return (
      pool.find((provider) => normalizeProviderId(provider) === preferredProviderId) ||
      enabled.find((provider) => normalizeProviderId(provider) === preferredProviderId) ||
      providers.find((provider) => normalizeProviderId(provider) === preferredProviderId) ||
      null
    );
  }

  for (const providerId of PROVIDER_PICK_ORDER) {
    const match = pool.find((provider) => normalizeProviderId(provider) === providerId);
    if (match) {
      return match;
    }
  }

  return pool[0] || enabled[0] || null;
}

export function providerRuntimeName(provider) {
  return String(
    provider?.runtime_provider_name ||
      provider?.runtimeProviderName ||
      provider?.aster_provider_name ||
      provider?.asterProviderName ||
      provider?.type ||
      provider?.provider_type ||
      provider?.providerType ||
      provider?.id ||
      "",
  ).trim();
}

export async function waitForHealth({ healthUrl, timeoutMs, intervalMs, logPrefix }) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(intervalMs, 5_000)),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const payload = text ? JSON.parse(text) : {};
      console.log(
        `${logPrefix} DevBridge ready elapsedMs=${Date.now() - startedAt}${
          payload?.status ? ` status=${payload.status}` : ""
        }`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || "unknown");
  throw new Error(`${logPrefix} DevBridge health timeout: ${detail}`);
}

export async function invokeDevBridge(options, cmd, args = {}, timeoutMs = options.timeoutMs) {
  const response = await fetch(options.invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${cmd} HTTP ${response.status}: ${text}`);
  }
  const payload = text ? JSON.parse(text) : null;
  if (payload?.error) {
    throw new Error(`${cmd} error: ${payload.error}`);
  }
  return payload?.result;
}

let appServerRequestId = 1;

export async function invokeAppServerMethod(
  options,
  method,
  params,
  timeoutMs = options.timeoutMs,
) {
  const id = `managed-objective-${appServerRequestId++}`;
  const request =
    params === undefined ? { id, method } : { id, method, params };
  const result = await invokeDevBridge(
    options,
    APP_SERVER_HANDLE_JSON_LINES_COMMAND,
    { request: { lines: [`${JSON.stringify(request)}\n`] } },
    timeoutMs,
  );
  const messages = (Array.isArray(result?.lines) ? result.lines : [])
    .map((line) => {
      try {
        return JSON.parse(String(line));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const error = messages.find((message) => message.id === id && message.error);
  if (error) {
    throw new Error(
      `${method} error: ${error.error?.message || "App Server JSON-RPC error"}`,
    );
  }
  const response = messages.find(
    (message) => message.id === id && Object.hasOwn(message, "result"),
  );
  if (!response) {
    throw new Error(`${method} missing App Server response`);
  }
  return response.result;
}

export async function resolveProviderPreference(options) {
  const explicitProvider = String(options.providerPreference || "").trim();
  const explicitModel = String(options.modelPreference || "").trim();
  if (explicitProvider && explicitModel) {
    return {
      providerPreference: explicitProvider,
      providerName: explicitProvider,
      modelPreference: explicitModel,
      source: "explicit",
    };
  }

  const providerList = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_MODEL_PROVIDER_LIST,
    {},
    30_000,
  );
  const providers = providerList?.providers;
  const selected = pickProvider(Array.isArray(providers) ? providers : [], explicitProvider);
  const providerId = normalizeProviderId(selected);
  if (!providerId) {
    throw new Error(
      `${options.logPrefix} no usable provider found; pass --provider-preference and --model-preference`,
    );
  }

  let providerDetail = selected;
  try {
    providerDetail =
      (await invokeAppServerMethod(
        options,
        APP_SERVER_METHOD_MODEL_PROVIDER_READ,
        { providerId },
        30_000,
      ))?.provider ||
      selected;
  } catch (error) {
    console.warn(`${options.logPrefix} provider detail failed, using list item: ${error.message}`);
  }

  const modelPreference = explicitModel || pickModelPreference(providerDetail);
  if (!modelPreference) {
    throw new Error(`${options.logPrefix} provider ${providerId} has no configured model`);
  }

  return {
    providerPreference: providerId,
    providerName: providerRuntimeName(providerDetail) || providerId,
    modelPreference,
    source: explicitProvider || explicitModel ? "partial-explicit" : "auto-enabled-provider",
  };
}

export function latestTurnStatus(threadRead) {
  return (
    threadRead?.diagnostics?.latest_turn_status ||
    threadRead?.diagnostics?.latestTurnStatus ||
    threadRead?.runtime_summary?.latestTurnStatus ||
    threadRead?.runtimeSummary?.latestTurnStatus ||
    threadRead?.status ||
    null
  );
}

export function summarizeThreadRead(threadRead) {
  const pendingRequests = Array.isArray(threadRead?.pending_requests)
    ? threadRead.pending_requests
    : Array.isArray(threadRead?.pendingRequests)
      ? threadRead.pendingRequests
      : [];
  const queuedTurns = Array.isArray(threadRead?.queued_turns)
    ? threadRead.queued_turns
    : Array.isArray(threadRead?.queuedTurns)
      ? threadRead.queuedTurns
      : [];
  return {
    threadStatus: threadRead?.status || null,
    latestTurnStatus: latestTurnStatus(threadRead),
    activeTurnId: threadRead?.active_turn_id || threadRead?.activeTurnId || null,
    turnCount: Array.isArray(threadRead?.turns) ? threadRead.turns.length : 0,
    queuedTurnCount: queuedTurns.length,
    pendingRequestCount: pendingRequests.length,
    managedObjective: summarizeObjective(threadRead?.managed_objective || threadRead?.managedObjective),
  };
}

export function summarizeSessionDetail(detail) {
  return {
    sessionId: detail?.id || null,
    workspaceId: detail?.workspace_id || detail?.workspaceId || null,
    turnCount: Array.isArray(detail?.turns) ? detail.turns.length : 0,
    itemCount: Array.isArray(detail?.items) ? detail.items.length : 0,
    turnStatuses: Array.isArray(detail?.turns)
      ? detail.turns.map((turn) => ({
          id: turn?.id || null,
          status: turn?.status || null,
          completedAt: turn?.completed_at || turn?.completedAt || null,
        }))
      : [],
  };
}

export function summarizeObjective(objective) {
  if (!objective) {
    return null;
  }
  return {
    objectiveId: objective.objective_id || objective.objectiveId || null,
    ownerKind: objective.owner_kind || objective.ownerKind || null,
    ownerId: objective.owner_id || objective.ownerId || null,
    status: objective.status || null,
    blockerReason: objective.blocker_reason || objective.blockerReason || null,
    lastAuditSummary: objective.last_audit_summary || objective.lastAuditSummary || null,
    lastEvidencePackRef: objective.last_evidence_pack_ref || objective.lastEvidencePackRef || null,
    artifactRefCount: Array.isArray(objective.last_artifact_refs)
      ? objective.last_artifact_refs.length
      : Array.isArray(objective.lastArtifactRefs)
        ? objective.lastArtifactRefs.length
        : 0,
  };
}

export function summarizeEvidencePack(pack) {
  if (!pack) {
    return null;
  }
  return {
    sessionId: pack.session_id || pack.sessionId || null,
    threadId: pack.thread_id || pack.threadId || null,
    threadStatus: pack.thread_status || pack.threadStatus || null,
    latestTurnStatus: pack.latest_turn_status || pack.latestTurnStatus || null,
    turnCount: pack.turn_count ?? pack.turnCount ?? null,
    itemCount: pack.item_count ?? pack.itemCount ?? null,
    pendingRequestCount: pack.pending_request_count ?? pack.pendingRequestCount ?? null,
    queuedTurnCount: pack.queued_turn_count ?? pack.queuedTurnCount ?? null,
    knownGaps: pack.known_gaps || pack.knownGaps || [],
    completionAuditSummary:
      pack.completion_audit_summary || pack.completionAuditSummary || null,
  };
}

export function guardSummaryText(objective) {
  return String(
    objective?.last_audit_summary ||
      objective?.lastAuditSummary ||
      objective?.managedObjective?.last_audit_summary ||
      "",
  );
}

export function guardDecisionFromSummary(summary) {
  const text = String(summary || "");
  const match = text.match(/decision=([a-z_]+)/i);
  return match ? match[1] : null;
}

export function objectiveReachedBudgetLimit(objective) {
  const status = String(objective?.status || "").toLowerCase();
  const blocker = String(objective?.blocker_reason || objective?.blockerReason || "").toLowerCase();
  const summary = guardSummaryText(objective).toLowerCase();
  return (
    status === "budget_limited" ||
    blocker.includes("maximum") ||
    blocker.includes("max") ||
    blocker.includes("最大") ||
    summary.includes("decision=budget_limited")
  );
}

export function objectiveStopState(objective) {
  const status = String(objective?.status || "").toLowerCase();
  const summaryDecision = guardDecisionFromSummary(guardSummaryText(objective));

  if (objectiveReachedBudgetLimit(objective)) {
    return "budget_limited";
  }

  if (
    ["completed", "needs_input", "blocked", "failed", "paused"].includes(status)
  ) {
    return status;
  }

  if (
    ["completed", "needs_input", "blocked", "failed", "paused"].includes(
      summaryDecision,
    )
  ) {
    return summaryDecision;
  }

  return null;
}

function completionAuditDecision(evidencePack) {
  const audit =
    evidencePack?.completion_audit_summary ||
    evidencePack?.completionAuditSummary ||
    null;
  if (typeof audit === "string") {
    return guardDecisionFromSummary(audit);
  }
  return String(audit?.decision || audit?.status || "").trim() || null;
}

function evidencePackHasCompletionAudit(evidencePack) {
  return Boolean(
    evidencePack?.completion_audit_summary ||
      evidencePack?.completionAuditSummary,
  );
}

function evidencePackKnownGaps(evidencePack) {
  const gaps = evidencePack?.known_gaps || evidencePack?.knownGaps || [];
  return Array.isArray(gaps) ? gaps : [];
}

export function evidencePackExplainsObjectiveStop(objective, evidencePack) {
  if (!evidencePack) {
    return false;
  }

  const stopState = objectiveStopState(objective);
  const auditDecision = String(completionAuditDecision(evidencePack) || "")
    .trim()
    .toLowerCase();
  const knownGaps = evidencePackKnownGaps(evidencePack)
    .map((gap) => JSON.stringify(gap).toLowerCase())
    .join("\n");
  const pendingRequestCount =
    evidencePack.pending_request_count ?? evidencePack.pendingRequestCount ?? 0;

  if (stopState === "completed") {
    return auditDecision === "completed";
  }

  if (stopState === "needs_input") {
    return (
      auditDecision === "needs_input" ||
      Number(pendingRequestCount) > 0 ||
      knownGaps.includes("needs_input") ||
      knownGaps.includes("pending")
    );
  }

  if (["blocked", "failed"].includes(stopState)) {
    return (
      auditDecision === stopState ||
      knownGaps.includes(stopState) ||
      evidencePackHasCompletionAudit(evidencePack)
    );
  }

  if (stopState === "budget_limited") {
    return evidencePackHasCompletionAudit(evidencePack);
  }

  return false;
}

export async function waitForObjectiveState(options, sessionId, predicate, label) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const [threadRead, objective, sessionDetail] = await Promise.all([
      invokeDevBridge(options, "agent_runtime_get_thread_read", { sessionId }),
      invokeDevBridge(options, "agent_runtime_get_objective", { sessionId }),
      invokeDevBridge(options, "agent_runtime_get_session", {
        sessionId,
        resumeSessionStartHooks: false,
        historyLimit: 20,
      }),
    ]);
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      objective: summarizeObjective(objective),
      session: summarizeSessionDetail(sessionDetail),
    };
    if (predicate({ threadRead, objective, sessionDetail, snapshot: lastSnapshot })) {
      return { threadRead, objective, sessionDetail, snapshot: lastSnapshot };
    }
    await sleep(options.intervalMs);
  }

  throw new Error(`${options.logPrefix} ${label} timeout; last=${JSON.stringify(lastSnapshot)}`);
}

export function threadSettled(threadRead) {
  const status = String(threadRead?.status || "").toLowerCase();
  if (RUNNING_THREAD_STATUSES.has(status)) {
    return false;
  }
  if (TERMINAL_THREAD_STATUSES.has(status)) {
    return true;
  }
  return !threadRead?.active_turn_id && !threadRead?.activeTurnId;
}

export function buildSmokeEvidence({
  generatedAt,
  options,
  workspace,
  provider,
  sessionId,
  turnId,
  objective,
  allowSnapshot,
  finalSnapshot,
  evidencePack,
}) {
  const finalObjective = summarizeObjective(objective);
  const finalGuardSummary = finalObjective?.lastAuditSummary || "";
  const finalStopState = objectiveStopState(objective);
  const expectedFinalStatus = options.expectedFinalStatus || "budget_limited";
  const assertions = {
    objectiveStoppedWithKnownReason: Boolean(finalStopState),
    objectiveMatchesExpectedFinalStatus:
      expectedFinalStatus === "any_stop"
        ? Boolean(finalStopState)
        : finalStopState === expectedFinalStatus,
    objectiveBudgetLimited: objectiveReachedBudgetLimit(objective),
    guardSummaryPresent: finalGuardSummary.includes("auto_continuation_guard"),
    evidencePackExplainsFinalState: evidencePackExplainsObjectiveStop(
      objective,
      evidencePack,
    ),
    atLeastTwoTurnsObserved: (finalSnapshot?.session?.turnCount || 0) >= 2,
  };
  const requiredAssertions = [
    assertions.objectiveStoppedWithKnownReason,
    assertions.objectiveMatchesExpectedFinalStatus,
    assertions.guardSummaryPresent,
    assertions.evidencePackExplainsFinalState,
    assertions.atLeastTwoTurnsObserved,
  ];
  return {
    schemaVersion: "v1",
    scenarioId: "managed-objective-auto-continuation",
    status: requiredAssertions.every(Boolean) ? "pass" : "fail",
    generatedAt,
    command: "smoke:managed-objective-continuation",
    coverage: {
      usesCurrentRuntimeSubmitTurn: true,
      usesDevBridgeCurrentCommands: true,
      autoContinuationObserved: Boolean(allowSnapshot),
      budgetLimitObserved: objectiveReachedBudgetLimit(objective),
      completedStopObserved: finalStopState === "completed",
      needsInputStopObserved: finalStopState === "needs_input",
      evidencePackExported: Boolean(evidencePack),
    },
    config: {
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      maxAutoTurns: options.maxAutoTurns,
      expectedFinalStatus,
    },
    workspace: {
      id: workspace?.id || null,
      name: workspace?.name || null,
    },
    provider: {
      providerPreference: provider.providerPreference,
      providerName: provider.providerName,
      modelPreference: provider.modelPreference,
      source: provider.source,
    },
    runtime: {
      sessionId,
      initialTurnId: turnId,
      allowSnapshot,
      finalSnapshot,
    },
    objective: finalObjective,
    guard: {
      finalDecision: guardDecisionFromSummary(finalGuardSummary),
      finalSummary: finalGuardSummary,
      allowSummary: allowSnapshot?.objective?.lastAuditSummary || null,
    },
    evidencePack: summarizeEvidencePack(evidencePack),
    assertions,
  };
}
