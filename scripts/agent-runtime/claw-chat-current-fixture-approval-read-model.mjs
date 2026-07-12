import {
  APP_SERVER_METHOD_SESSION_READ,
  APPROVAL_REQUEST_CANCEL_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT,
  APPROVAL_REQUEST_RESUME_COMMAND,
  APPROVAL_REQUEST_RESUME_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_PROMPT,
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
  APPROVAL_REQUEST_RESUME_RESULT_TEXT,
  APPROVAL_REQUEST_DECLINE_DONE_TEXT,
  APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_SECOND_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
  APPROVAL_REQUEST_RESUME_SECOND_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

function collectPendingRequests(readModel) {
  const detail = readModel?.detail ?? readModel ?? {};
  const threadRead = detail?.thread_read ?? detail?.threadRead ?? {};
  return [
    ...(Array.isArray(readModel?.pending_requests)
      ? readModel.pending_requests
      : []),
    ...(Array.isArray(readModel?.pendingRequests)
      ? readModel.pendingRequests
      : []),
    ...(Array.isArray(detail?.pending_requests) ? detail.pending_requests : []),
    ...(Array.isArray(detail?.pendingRequests) ? detail.pendingRequests : []),
    ...(Array.isArray(threadRead?.pending_requests)
      ? threadRead.pending_requests
      : []),
    ...(Array.isArray(threadRead?.pendingRequests)
      ? threadRead.pendingRequests
      : []),
  ].filter(Boolean);
}

function readLatestTurnStatus(readModel) {
  return (
    readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
    readModel?.detail?.threadRead?.runtimeSummary?.latestTurnStatus ??
    readModel?.detail?.thread_read?.status ??
    readModel?.detail?.threadRead?.status ??
    readModel?.detail?.status ??
    null
  );
}

function findApprovalPendingRequest(readModel) {
  return collectPendingRequests(readModel).find((request) => {
    const requestId = String(
      request?.id ??
        request?.request_id ??
        request?.requestId ??
        request?.payload?.requestId ??
        request?.payload?.request_id ??
        "",
    );
    return requestId === APPROVAL_REQUEST_RESUME_REQUEST_ID;
  });
}

function summarizeApprovalPendingReadModel(readModel) {
  const pendingRequests = collectPendingRequests(readModel);
  const request = findApprovalPendingRequest(readModel);
  const serialized = JSON.stringify(readModel || {});
  const payload = request?.payload ?? {};
  return sanitizeJson({
    pendingRequestCount: pendingRequests.length,
    latestTurnStatus: readLatestTurnStatus(readModel),
    hasPendingRequest: Boolean(request),
    requestId:
      request?.id ??
      request?.request_id ??
      request?.requestId ??
      payload?.requestId ??
      payload?.request_id ??
      null,
    requestType: request?.request_type ?? request?.requestType ?? null,
    requestStatus: request?.status ?? null,
    title: request?.title ?? null,
    payloadActionType: payload?.actionType ?? payload?.action_type ?? null,
    payloadToolName: payload?.toolName ?? payload?.tool_name ?? null,
    includesPrompt: serialized.includes(APPROVAL_REQUEST_RESUME_PROMPT),
    includesApprovalPrompt: serialized.includes(
      APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT,
    ),
    includesCommand: serialized.includes(APPROVAL_REQUEST_RESUME_COMMAND),
    includesRequestId: serialized.includes(APPROVAL_REQUEST_RESUME_REQUEST_ID),
    includesToolCallId: serialized.includes(
      APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
    ),
  });
}

export function summarizeApprovalCompletedReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  const pendingRequests = collectPendingRequests(readModel);
  return sanitizeJson({
    pendingRequestCount: pendingRequests.length,
    latestTurnStatus: readLatestTurnStatus(readModel),
    includesPrompt: serialized.includes(APPROVAL_REQUEST_RESUME_PROMPT),
    includesApprovalPrompt: serialized.includes(
      APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT,
    ),
    includesRequestId: serialized.includes(APPROVAL_REQUEST_RESUME_REQUEST_ID),
    includesToolCallId: serialized.includes(
      APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
    ),
    includesToolResult:
      serialized.includes("tool.result") ||
      serialized.includes(APPROVAL_REQUEST_RESUME_RESULT_TEXT),
    includesActionResolved:
      serialized.includes("action.resolved") ||
      serialized.includes("action_resolved") ||
      serialized.includes('"decision":"allow_for_session"') ||
      serialized.includes('"decision":"approve"') ||
      serialized.includes('"decision":"approved"'),
    includesAssistantDone: serialized.includes(
      APPROVAL_REQUEST_RESUME_DONE_TEXT,
    ),
    includesAssistantSummary: serialized.includes(
      APPROVAL_REQUEST_RESUME_RESULT_TEXT,
    ),
  });
}

export function summarizeApprovalDecisionReadModel(readModel, decision) {
  const serialized = JSON.stringify(readModel || {});
  const pendingRequests = collectPendingRequests(readModel);
  const latestTurnStatus = readLatestTurnStatus(readModel);
  return sanitizeJson({
    decision,
    pendingRequestCount: pendingRequests.length,
    latestTurnStatus,
    latestTurnCanceled:
      latestTurnStatus === "canceled" || latestTurnStatus === "cancelled",
    includesPrompt: serialized.includes(APPROVAL_REQUEST_RESUME_PROMPT),
    includesApprovalPrompt: serialized.includes(
      APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT,
    ),
    includesRequestId: serialized.includes(APPROVAL_REQUEST_RESUME_REQUEST_ID),
    includesToolCallId: serialized.includes(
      APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
    ),
    includesToolResult:
      serialized.includes("tool.result") ||
      serialized.includes(APPROVAL_REQUEST_RESUME_RESULT_TEXT),
    includesActionResolved:
      serialized.includes("action.resolved") ||
      serialized.includes("action_resolved"),
    includesDecision:
      serialized.includes(`"decision":"${decision}"`) ||
      serialized.includes(`"decision": "${decision}"`),
    includesDeclineResult: serialized.includes(
      APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
    ),
    includesDeclineDone: serialized.includes(APPROVAL_REQUEST_DECLINE_DONE_TEXT),
    includesCancelDone: serialized.includes(APPROVAL_REQUEST_CANCEL_DONE_TEXT),
    includesCanceled:
      serialized.includes('"status":"canceled"') ||
      serialized.includes('"status": "canceled"') ||
      serialized.includes("turn.canceled") ||
      serialized.includes("turn_canceled"),
  });
}

function collectEventLikeRecords(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectEventLikeRecords(item, output));
    return output;
  }
  const eventType = value.event_type ?? value.eventType ?? value.type;
  const payload = value.payload;
  if (typeof eventType === "string" && payload && typeof payload === "object") {
    output.push({ eventType, payload });
  }
  Object.values(value).forEach((item) => collectEventLikeRecords(item, output));
  return output;
}

function eventPayloadRequestId(payload) {
  return (
    payload?.requestId ??
    payload?.request_id ??
    payload?.actionId ??
    payload?.action_id ??
    null
  );
}

export function summarizeApprovalSessionCacheReadModel(readModel, secondTurnId) {
  const serialized = JSON.stringify(readModel || {});
  const pendingRequests = collectPendingRequests(readModel);
  const secondPermissionRequestId = secondTurnId
    ? `permission-${secondTurnId}`
    : null;
  const secondPermissionEvents = collectEventLikeRecords(readModel).filter(
    (event) =>
      secondPermissionRequestId &&
      eventPayloadRequestId(event.payload) === secondPermissionRequestId,
  );
  const includesApprovalSessionCacheMetadata = serialized.includes(
    "approval_session_cache",
  );
  const includesCacheResolvedSource = serialized.includes(
    "approval_session_cache",
  );
  const includesAllowForSession = serialized.includes("allow_for_session");
  const includesSecondPermissionRequestId = secondPermissionRequestId
    ? secondPermissionEvents.length > 0 ||
      serialized.includes(secondPermissionRequestId)
    : false;
  const includesActionRequiredForSecondPermission = secondPermissionEvents.some(
    (event) =>
      event.eventType === "action.required" ||
      event.eventType === "action_required",
  );
  const includesActionResolvedForSecondPermission =
    secondPermissionEvents.some(
      (event) =>
        (event.eventType === "action.resolved" ||
          event.eventType === "action_resolved") &&
        (event.payload?.source === "approval_session_cache" ||
          event.payload?.decision === "allow_for_session"),
    ) ||
    (includesSecondPermissionRequestId &&
      includesCacheResolvedSource &&
      includesAllowForSession &&
      !includesActionRequiredForSecondPermission);
  return sanitizeJson({
    pendingRequestCount: pendingRequests.length,
    latestTurnStatus: readLatestTurnStatus(readModel),
    includesSecondPrompt: serialized.includes(
      APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
    ),
    includesSecondResult: serialized.includes(
      APPROVAL_REQUEST_RESUME_SECOND_RESULT_TEXT,
    ),
    includesSecondDone: serialized.includes(
      APPROVAL_REQUEST_RESUME_SECOND_DONE_TEXT,
    ),
    includesApprovalSessionCacheHit:
      serialized.includes("approval.session_cache.hit") ||
      includesActionResolvedForSecondPermission,
    includesApprovalSessionCacheMetadata,
    includesCacheResolvedSource,
    includesAllowForSession,
    includesSecondPermissionRequestId,
    includesActionRequiredForSecondPermission,
    includesActionResolvedForSecondPermission,
  });
}

function approvalCacheHarnessFromTurnStart(entry) {
  const harness = entry?.runtimeRequest?.metadata?.harness ?? {};
  return harness && typeof harness === "object" ? harness : {};
}

export function summarizeApprovalSecondTurnStart(entry) {
  const harness = approvalCacheHarnessFromTurnStart(entry);
  const browserAssist = harness.browser_assist ?? harness.browserAssist ?? {};
  const runtimeContract =
    browserAssist?.runtime_contract ?? browserAssist?.runtimeContract ?? {};
  const cache =
    harness.approval_session_cache ?? harness.approvalSessionCache ?? null;
  const cacheKey = cache?.key ?? {};
  const runtimeRequest = entry?.runtimeRequest ?? {};
  return sanitizeJson({
    sessionId: entry?.sessionId ?? null,
    threadId: entry?.threadId ?? null,
    turnId: entry?.turnId ?? null,
    inputText: entry?.inputText ?? null,
    approvalPolicy:
      runtimeRequest?.approval_policy ?? runtimeRequest?.approvalPolicy,
    sandboxPolicy:
      runtimeRequest?.sandbox_policy ?? runtimeRequest?.sandboxPolicy,
    browserAssistEnabled: browserAssist?.enabled ?? null,
    browserAssistProfileKey:
      browserAssist?.profile_key ?? browserAssist?.profileKey ?? null,
    browserAssistContractKey:
      runtimeContract?.contract_key ?? runtimeContract?.contractKey ?? null,
    approvalSessionCacheDecision: cache?.decision ?? null,
    approvalSessionCacheDecisionScope:
      cache?.decisionScope ?? cache?.decision_scope ?? null,
    approvalSessionCacheSourceRequestId:
      cache?.sourceRequestId ?? cache?.source_request_id ?? null,
    approvalSessionCacheKey: {
      actionKind: cacheKey?.actionKind ?? cacheKey?.action_kind ?? null,
      toolFamily: cacheKey?.toolFamily ?? cacheKey?.tool_family ?? null,
      approvalPolicy:
        cacheKey?.approvalPolicy ?? cacheKey?.approval_policy ?? null,
      sandboxPolicy:
        cacheKey?.sandboxPolicy ?? cacheKey?.sandbox_policy ?? null,
      contractKey: cacheKey?.contractKey ?? cacheKey?.contract_key ?? null,
    },
  });
}

export async function waitForApprovalPendingReadModel(
  page,
  options,
  requestLog,
) {
  const startedAt = Date.now();
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastSummary = summarizeApprovalPendingReadModel(read.result);
    if (
      lastSummary.hasPendingRequest === true &&
      lastSummary.payloadActionType === "tool_confirmation" &&
      lastSummary.includesApprovalPrompt === true &&
      lastSummary.includesCommand === true
    ) {
      return lastSummary;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `审批 pending read model 未出现: ${JSON.stringify(
      sanitizeJson(lastSummary),
    )}`,
  );
}
