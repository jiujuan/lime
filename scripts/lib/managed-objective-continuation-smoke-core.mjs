const PROVIDER_PICK_ORDER = ["deepseek", "doubao", "lime-hub", "openai"];
const TERMINAL_THREAD_STATUSES = new Set([
  "completed",
  "failed",
  "aborted",
  "idle",
  "waiting_request",
]);
const RUNNING_THREAD_STATUSES = new Set(["running", "queued", "interrupting"]);
const FAILED_THREAD_STATUSES = new Set([
  "failed",
  "aborted",
  "cancelled",
  "canceled",
]);
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const APP_SERVER_METHOD_MODEL_PROVIDER_LIST = "modelProvider/list";
const APP_SERVER_METHOD_MODEL_PROVIDER_READ = "modelProvider/read";
const APP_SERVER_METHOD_AGENT_SESSION_START = "agentSession/start";
const APP_SERVER_METHOD_AGENT_SESSION_UPDATE = "agentSession/update";
const APP_SERVER_METHOD_AGENT_SESSION_READ = "agentSession/read";
const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ =
  "agentSession/objective/read";
const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET =
  "agentSession/objective/set";
const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE =
  "agentSession/objective/continue";
const APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT =
  "agentSession/objective/audit";
const APP_SERVER_METHOD_AGENT_SESSION_TURN_START =
  "agentSession/turn/start";
const APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL =
  "agentSession/turn/cancel";
const APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND =
  "agentSession/action/respond";
const APP_SERVER_METHOD_EVIDENCE_EXPORT = "evidence/export";

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
  const responseLines = result?.result?.lines ?? result?.lines;
  const messages = (Array.isArray(responseLines) ? responseLines : [])
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

export async function createAgentSessionCurrent(
  options,
  {
    workspaceId,
    title,
    executionStrategy = "react",
    metadata = {},
  },
) {
  const metadataRecord =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const harnessMetadata =
    metadataRecord.harness &&
    typeof metadataRecord.harness === "object" &&
    !Array.isArray(metadataRecord.harness)
      ? metadataRecord.harness
      : {};
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_START,
    {
      appId: "desktop",
      workspaceId,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspaceId}:${Date.now()}`,
        title,
        metadata: {
          ...metadataRecord,
          title,
          executionStrategy,
          runStartHooks: false,
          harness: {
            source: "smoke:managed-objective-continuation",
            ...harnessMetadata,
          },
        },
      },
    },
    30_000,
  );
  const sessionId = String(response?.session?.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("agentSession/start 未返回 sessionId");
  }
  return sessionId;
}

export async function updateAgentSessionRuntimeCurrent(
  options,
  { sessionId, provider, executionStrategy = "react" },
) {
  await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_UPDATE,
    {
      sessionId,
      providerSelector: provider.providerPreference,
      providerName: provider.providerName,
      modelName: provider.modelPreference,
      executionStrategy,
    },
    30_000,
  );
}

export async function setAgentSessionObjectiveCurrent(
  options,
  {
    sessionId,
    workspaceId,
    objectiveText,
    successCriteria = [],
    continuationPolicy = null,
    budgetPolicy = null,
    riskPolicy = null,
  },
) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_SET,
    compactRecord({
      sessionId,
      workspaceId,
      objectiveText,
      successCriteria,
      continuationPolicy,
      budgetPolicy,
      riskPolicy,
    }),
  );
  return response?.objective || null;
}

export async function readAgentSessionObjectiveCurrent(options, sessionId) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_READ,
    { sessionId },
  );
  return response?.objective || null;
}

export async function continueAgentSessionObjectiveCurrent(
  options,
  { sessionId, ownerKind, ownerId },
) {
  return invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE,
    compactRecord({
      sessionId,
      ownerKind,
      ownerId,
    }),
  );
}

export async function auditAgentSessionObjectiveCurrent(
  options,
  { sessionId, ownerKind, ownerId },
) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_OBJECTIVE_AUDIT,
    compactRecord({
      sessionId,
      ownerKind,
      ownerId,
    }),
  );
  return response?.objective || null;
}

export async function exportAgentSessionEvidencePackCurrent(
  options,
  { sessionId, turnId },
) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_EVIDENCE_EXPORT,
    compactRecord({
      sessionId,
      turnId,
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    }),
  );
  return response?.evidencePack || null;
}

export async function readAgentSessionDetailCurrent(
  options,
  sessionId,
  { historyLimit = 20 } = {},
) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_READ,
    {
      sessionId,
      historyLimit,
    },
  );
  const detail = response?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail;
  }
  return {
    id: response?.session?.sessionId || sessionId,
    thread_id: response?.session?.threadId || sessionId,
    workspace_id: response?.session?.workspaceId || null,
    turns: Array.isArray(response?.turns) ? response.turns : [],
    messages: [],
    items: [],
  };
}

function normalizeTurnConfig(turnConfig = {}) {
  const config =
    turnConfig && typeof turnConfig === "object" && !Array.isArray(turnConfig)
      ? turnConfig
      : {};
  return {
    providerPreference:
      config.providerPreference ?? config.provider_preference ?? undefined,
    modelPreference:
      config.modelPreference ?? config.model_preference ?? undefined,
    providerConfig:
      config.providerConfig ?? config.provider_config ?? undefined,
    approvalPolicy:
      config.approvalPolicy ?? config.approval_policy ?? undefined,
    sandboxPolicy: config.sandboxPolicy ?? config.sandbox_policy ?? undefined,
    metadata: config.metadata ?? undefined,
    executionStrategy:
      config.executionStrategy ?? config.execution_strategy ?? undefined,
    webSearch: config.webSearch ?? config.web_search ?? undefined,
    searchMode: config.searchMode ?? config.search_mode ?? undefined,
  };
}

function compactRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export async function startAgentSessionTurnCurrent(
  options,
  {
    sessionId,
    workspaceId,
    message,
    eventName,
    turnId,
    turnConfig = {},
    queueIfBusy,
    queuedTurnId,
    skipPreSubmitResume = true,
  },
) {
  const normalizedConfig = normalizeTurnConfig(turnConfig);
  const asterChatRequest = compactRecord({
    message,
    session_id: sessionId,
    workspace_id: workspaceId,
    event_name: eventName,
    turn_id: turnId,
    provider_preference: normalizedConfig.providerPreference,
    model_preference: normalizedConfig.modelPreference,
    provider_config: normalizedConfig.providerConfig,
    approval_policy: normalizedConfig.approvalPolicy,
    sandbox_policy: normalizedConfig.sandboxPolicy,
    metadata: normalizedConfig.metadata,
    execution_strategy: normalizedConfig.executionStrategy,
    web_search: normalizedConfig.webSearch,
    search_mode: normalizedConfig.searchMode,
    queue_if_busy: queueIfBusy,
    queued_turn_id: queuedTurnId,
  });
  const runtimeOptions = compactRecord({
    stream: true,
    eventName,
    providerPreference: normalizedConfig.providerPreference,
    modelPreference: normalizedConfig.modelPreference,
    metadata: normalizedConfig.metadata,
    queuedTurnId,
    hostOptions: {
      asterChatRequest,
    },
  });
  return invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_TURN_START,
    compactRecord({
      sessionId,
      turnId,
      input: {
        text: message,
      },
      runtimeOptions,
      queueIfBusy,
      skipPreSubmitResume,
    }),
  );
}

export async function cancelAgentSessionTurnCurrent(
  options,
  { sessionId, turnId },
) {
  return invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_TURN_CANCEL,
    {
      sessionId,
      turnId,
    },
  );
}

export async function respondAgentSessionActionCurrent(
  options,
  {
    sessionId,
    requestId,
    actionType,
    confirmed,
    response,
    userData,
    metadata,
    eventName,
    actionScope,
  },
) {
  const normalizedScope =
    actionScope && typeof actionScope === "object" && !Array.isArray(actionScope)
      ? {
          sessionId: actionScope.sessionId ?? actionScope.session_id,
          threadId: actionScope.threadId ?? actionScope.thread_id,
          turnId: actionScope.turnId ?? actionScope.turn_id,
        }
      : undefined;
  return invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    compactRecord({
      sessionId,
      requestId,
      actionType,
      confirmed,
      response,
      userData,
      metadata,
      eventName,
      actionScope: normalizedScope ? compactRecord(normalizedScope) : undefined,
    }),
  );
}

export async function readAgentRuntimeThreadCurrent(
  options,
  sessionId,
  { historyLimit } = {},
) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_READ,
    compactRecord({
      sessionId,
      historyLimit,
    }),
  );
  const threadRead =
    response?.detail?.thread_read || response?.detail?.threadRead;
  if (threadRead && typeof threadRead === "object" && !Array.isArray(threadRead)) {
    return threadRead;
  }
  const turns = Array.isArray(response?.turns) ? response.turns : [];
  const latestTurn = turns[turns.length - 1] || null;
  return {
    thread_id: response?.session?.threadId || sessionId,
    status: response?.session?.status || latestTurn?.status || "idle",
    active_turn_id:
      response?.session?.activeTurnId ||
      response?.session?.active_turn_id ||
      latestTurn?.turnId ||
      null,
    turns,
    queued_turns: [],
    pending_requests: [],
  };
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

function normalizeTurnRecord(turn) {
  if (!turn || typeof turn !== "object" || Array.isArray(turn)) {
    return null;
  }
  return {
    id: turn.id || turn.turnId || turn.turn_id || null,
    status: String(turn.status || "").toLowerCase(),
    completedAt: turn.completed_at || turn.completedAt || null,
    error:
      turn.error ||
      turn.error_message ||
      turn.errorMessage ||
      turn.failure_reason ||
      turn.failureReason ||
      null,
  };
}

function turnRecordsFromSessionDetail(sessionDetail) {
  return (Array.isArray(sessionDetail?.turns) ? sessionDetail.turns : [])
    .map(normalizeTurnRecord)
    .filter(Boolean);
}

function turnRecordsFromThreadRead(threadRead) {
  return (Array.isArray(threadRead?.turns) ? threadRead.turns : [])
    .map(normalizeTurnRecord)
    .filter(Boolean);
}

export function objectivePollFailureReason({
  threadRead,
  sessionDetail,
  objective,
} = {}) {
  const latestStatus = String(latestTurnStatus(threadRead) || "").toLowerCase();
  if (FAILED_THREAD_STATUSES.has(latestStatus)) {
    return `latest_turn_status=${latestStatus}`;
  }

  const threadStatus = String(threadRead?.status || "").toLowerCase();
  if (FAILED_THREAD_STATUSES.has(threadStatus)) {
    return `thread_status=${threadStatus}`;
  }

  const failedTurn = [
    ...turnRecordsFromSessionDetail(sessionDetail),
    ...turnRecordsFromThreadRead(threadRead),
  ].find((turn) => FAILED_THREAD_STATUSES.has(turn.status));
  if (failedTurn) {
    return [
      `turn_status=${failedTurn.status}`,
      failedTurn.id ? `turn_id=${failedTurn.id}` : "",
      failedTurn.error ? `error=${failedTurn.error}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const objectiveStatus = String(objective?.status || "").toLowerCase();
  if (objectiveStatus === "failed") {
    return "objective_status=failed";
  }

  return null;
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

export async function waitForObjectiveState(
  options,
  sessionId,
  predicate,
  label,
  { failFast = false } = {},
) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const [threadRead, objective, sessionDetail] = await Promise.all([
      readAgentRuntimeThreadCurrent(options, sessionId),
      readAgentSessionObjectiveCurrent(options, sessionId),
      readAgentSessionDetailCurrent(options, sessionId),
    ]);
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      objective: summarizeObjective(objective),
      session: summarizeSessionDetail(sessionDetail),
    };
    if (predicate({ threadRead, objective, sessionDetail, snapshot: lastSnapshot })) {
      return { threadRead, objective, sessionDetail, snapshot: lastSnapshot };
    }
    if (failFast) {
      const failureReason = objectivePollFailureReason({
        threadRead,
        sessionDetail,
        objective,
      });
      if (failureReason) {
        throw new Error(
          `${options.logPrefix} ${label} failed early: ${failureReason}; last=${JSON.stringify(lastSnapshot)}`,
        );
      }
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
