import {
  APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
  APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
  APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
  APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
  APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_PROMPT,
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
  APPROVAL_REQUEST_RESUME_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
  APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";

const LEGACY_RESPOND_ACTION_METHOD = [
  "agent",
  "runtime",
  "respond",
  "action",
].join("_");

function emitEventTypesForTurn(backendLedger, turnId) {
  return backendLedger
    .filter((entry) => entry?.kind === "backendEmit" && entry.turnId === turnId)
    .flatMap((entry) =>
      Array.isArray(entry.eventTypes) ? entry.eventTypes : [],
    );
}

function decisionRequestScoped(summary, turnId, expectedDecision) {
  const params = summary.approvalRequestDecisionRespondActionRequest?.params;
  return (
    params?.sessionId === SESSION_ID &&
    params?.requestId === APPROVAL_REQUEST_RESUME_REQUEST_ID &&
    params?.actionType === "tool_confirmation" &&
    params?.decision === expectedDecision &&
    !Object.prototype.hasOwnProperty.call(params ?? {}, "confirmed") &&
    (params?.actionScope?.turnId === turnId ||
      summary.approvalRequestDecisionBackendActionRespond?.actionScope
        ?.turnId === turnId)
  );
}

function noLegacyRuntimeRespond(appServerRequestMethods) {
  return !appServerRequestMethods.includes(LEGACY_RESPOND_ACTION_METHOD);
}

function compactApprovalRecordVisible(snapshot) {
  const shape = snapshot?.approvalRecordShape;
  return (
    shape?.recordCount === 1 &&
    shape?.promptInRecord === false &&
    shape?.maxLineBreaks <= 1 &&
    Array.isArray(shape?.legacyDetailFragmentHits) &&
    shape.legacyDetailFragmentHits.length === 0
  );
}

function turnStartApprovalPolicy(turnStart) {
  return (
    turnStart?.runtimeRequest?.approval_policy ??
    turnStart?.runtimeRequest?.approvalPolicy ??
    turnStart?.approvalPolicy ??
    turnStart?.approval_policy ??
    null
  );
}

function turnStartSandboxPolicy(turnStart) {
  return (
    turnStart?.runtimeRequest?.sandbox_policy ??
    turnStart?.runtimeRequest?.sandboxPolicy ??
    turnStart?.sandboxPolicy ??
    turnStart?.sandbox_policy ??
    null
  );
}

export function buildApprovalRequestFullAccessScenarioAssertions({
  appServerRequestMethods,
  approvalRequestFullAccessTurnStart,
  pageText,
  summary,
}) {
  return {
    approvalRequestFullAccessPromptReachedBackend:
      approvalRequestFullAccessTurnStart?.inputText ===
      APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
    approvalRequestFullAccessUsesFullAccessPolicy:
      turnStartApprovalPolicy(approvalRequestFullAccessTurnStart) === "never" &&
      turnStartSandboxPolicy(approvalRequestFullAccessTurnStart) ===
        "danger-full-access",
    guiApprovalRequestFullAccessInputSubmitted:
      summary.approvalRequestFullAccessInputSend?.afterFill
        ?.promptVisibleInTextarea === true &&
      summary.approvalRequestFullAccessInputSend?.clicked?.clicked === true,
    guiApprovalRequestFullAccessCompleted:
      summary.guiApprovalRequestFullAccessCompleted?.hasPrompt === true &&
      (summary.guiApprovalRequestFullAccessCompleted?.hasAssistantSummary ===
        true ||
        summary.guiApprovalRequestFullAccessCompleted?.hasDoneText === true) &&
      summary.guiApprovalRequestFullAccessCompleted?.textareaVisible === true &&
      summary.guiApprovalRequestFullAccessCompleted?.textareaDisabled ===
        false &&
      summary.guiApprovalRequestFullAccessCompleted?.stopButtonVisible ===
        false &&
      pageText.includes(APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT) &&
      pageText.includes(APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT),
    guiApprovalRequestFullAccessNoApprovalPrompt:
      summary.guiApprovalRequestFullAccessNoApproval?.approvalPromptVisible ===
        false &&
      summary.guiApprovalRequestFullAccessNoApproval
        ?.includesRuntimePermissionPrompt === false &&
      summary.guiApprovalRequestFullAccessNoApproval
        ?.includesRuntimeApprovalPrompt === false &&
      summary.guiApprovalRequestFullAccessNoApproval?.textareaVisible ===
        true &&
      summary.guiApprovalRequestFullAccessNoApproval?.textareaDisabled ===
        false,
    guiApprovalRequestFullAccessNoApprovalRecord:
      summary.guiApprovalRequestFullAccessCompleted?.approvalRecordShape
        ?.recordCount === 0 &&
      summary.guiApprovalRequestFullAccessNoApproval?.approvalRecordCount === 0,
    readModelApprovalRequestFullAccessCompleted:
      summary.readModelApprovalRequestFullAccessCompleted?.latestTurnStatus ===
        "completed" &&
      summary.readModelApprovalRequestFullAccessCompleted?.includesPrompt ===
        true &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesAssistantSummary === true &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesAssistantDone === true,
    readModelApprovalRequestFullAccessNoApprovalRequest:
      summary.readModelApprovalRequestFullAccessCompleted
        ?.pendingRequestCount === 0 &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesApprovalRequest === false &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesActionRequired === false &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesActionResolved === false &&
      summary.readModelApprovalRequestFullAccessCompleted
        ?.includesApprovalPrompt === false,
    approvalRequestFullAccessNoActionRespond: !appServerRequestMethods.includes(
      APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    ),
    approvalRequestFullAccessNoLegacyRuntimeRespond: noLegacyRuntimeRespond(
      appServerRequestMethods,
    ),
  };
}

export function buildApprovalRequestResumeScenarioAssertions({
  appServerRequestMethods,
  approvalRequestResumeTurnStart,
  pageText,
  summary,
}) {
  return {
    approvalRequestResumePromptReachedBackend:
      approvalRequestResumeTurnStart?.inputText ===
      APPROVAL_REQUEST_RESUME_PROMPT,
    guiApprovalRequestResumeInputSubmitted:
      summary.approvalRequestResumeInputSend?.afterFill
        ?.promptVisibleInTextarea === true &&
      summary.approvalRequestResumeInputSend?.clicked?.clicked === true,
    guiApprovalRequestResumePendingVisible:
      summary.approvalRequestResumePendingGui?.hasSection === true &&
      summary.approvalRequestResumePendingGui?.hasApprovalContent === true &&
      summary.approvalRequestResumePendingGui?.hasPrompt === true &&
      summary.approvalRequestResumePendingGui?.hasToolName === false &&
      summary.approvalRequestResumePendingGui?.hasCommand === false &&
      summary.approvalRequestResumePendingGui?.hasDetails === false &&
      summary.approvalRequestResumePendingGui?.hasPreformattedArguments ===
        false &&
      summary.approvalRequestResumePendingGui?.textareaVisible === false &&
      summary.approvalRequestResumePendingGui?.singleLine === true &&
      summary.approvalRequestResumePendingGui?.approveButtonVisible === true &&
      summary.approvalRequestResumePendingGui?.approveButtonDisabled === false,
    readModelApprovalRequestResumePending:
      summary.approvalRequestResumePendingReadModel?.hasPendingRequest ===
        true &&
      summary.approvalRequestResumePendingReadModel?.payloadActionType ===
        "tool_confirmation" &&
      summary.approvalRequestResumePendingReadModel?.includesRequestId ===
        true &&
      summary.approvalRequestResumePendingReadModel?.includesToolCallId ===
        true,
    approvalRequestResumeUsedCurrentActionRespond:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      ) ||
      summary.approvalRequestResumeRespondActionRequest?.method ===
        APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    approvalRequestResumeRespondPayloadScoped:
      summary.approvalRequestResumeRespondActionRequest?.params?.sessionId ===
        SESSION_ID &&
      summary.approvalRequestResumeRespondActionRequest?.params?.requestId ===
        APPROVAL_REQUEST_RESUME_REQUEST_ID &&
      summary.approvalRequestResumeRespondActionRequest?.params?.actionType ===
        "tool_confirmation" &&
      summary.approvalRequestResumeRespondActionRequest?.params?.decision ===
        "allow_for_session" &&
      !Object.prototype.hasOwnProperty.call(
        summary.approvalRequestResumeRespondActionRequest?.params ?? {},
        "confirmed",
      ) &&
      (summary.approvalRequestResumeRespondActionRequest?.params?.actionScope
        ?.turnId === approvalRequestResumeTurnStart?.turnId ||
        summary.approvalRequestResumeBackendActionRespond?.actionScope
          ?.turnId === approvalRequestResumeTurnStart?.turnId),
    approvalRequestResumeBackendActionRespondObserved:
      summary.approvalRequestResumeBackendActionRespond?.requestId ===
        APPROVAL_REQUEST_RESUME_REQUEST_ID &&
      summary.approvalRequestResumeBackendActionRespond?.actionType ===
        "tool_confirmation" &&
      summary.approvalRequestResumeBackendActionRespond?.decision ===
        "allow_for_session" &&
      summary.approvalRequestResumeBackendActionRespond?.decisionScope ===
        "session" &&
      summary.approvalRequestResumeBackendActionRespond?.turnId ===
        approvalRequestResumeTurnStart?.turnId,
    approvalRequestResumePendingCleared:
      summary.readModelApprovalRequestResumeCompleted?.pendingRequestCount ===
      0,
    guiApprovalRequestResumeCompleted:
      summary.guiApprovalRequestResumeCompleted?.hasPrompt === true &&
      (summary.guiApprovalRequestResumeCompleted?.hasAssistantSummary ===
        true ||
        summary.guiApprovalRequestResumeCompleted?.hasDoneText === true) &&
      summary.guiApprovalRequestResumeCompleted?.textareaVisible === true &&
      summary.guiApprovalRequestResumeCompleted?.textareaDisabled === false &&
      summary.guiApprovalRequestResumeCompleted?.stopButtonVisible === false,
    guiApprovalRequestResumeRecordCompact: compactApprovalRecordVisible(
      summary.guiApprovalRequestResumeCompleted,
    ),
    readModelApprovalRequestResumeCompleted:
      summary.readModelApprovalRequestResumeCompleted?.latestTurnStatus ===
        "completed" &&
      summary.readModelApprovalRequestResumeCompleted?.includesPrompt ===
        true &&
      summary.readModelApprovalRequestResumeCompleted?.includesRequestId ===
        true &&
      summary.readModelApprovalRequestResumeCompleted?.includesToolCallId ===
        true &&
      summary.readModelApprovalRequestResumeCompleted?.includesToolResult ===
        true &&
      summary.readModelApprovalRequestResumeCompleted
        ?.includesAssistantSummary === true,
    approvalRequestResumeSecondPromptReachedBackend:
      summary.approvalRequestResumeSecondBackendTurnStart?.inputText ===
        APPROVAL_REQUEST_RESUME_SECOND_PROMPT &&
      summary.approvalRequestResumeSecondInputSend?.clicked?.clicked === true,
    approvalRequestResumeSecondUsesBrowserControlContract:
      summary.approvalRequestResumeSecondBackendTurnStart?.approvalPolicy ===
        "on-request" &&
      summary.approvalRequestResumeSecondBackendTurnStart?.sandboxPolicy ===
        "workspace-write" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.browserAssistContractKey === "browser_control" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.browserAssistEnabled === true,
    approvalRequestResumeSessionCacheHitInjected:
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheDecision === "allow_for_session" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheDecisionScope === "session" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheSourceRequestId ===
        APPROVAL_REQUEST_RESUME_REQUEST_ID &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheKey?.actionKind === "permission_preflight" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheKey?.toolFamily === "browser_control" &&
      summary.approvalRequestResumeSecondBackendTurnStart
        ?.approvalSessionCacheKey?.contractKey === "browser_control",
    approvalRequestResumeSecondNoPendingApproval:
      summary.guiApprovalRequestResumeSecondNoApprovalPrompt
        ?.approvalPromptVisible === false &&
      summary.guiApprovalRequestResumeSecondNoApprovalPrompt
        ?.includesRuntimePermissionPrompt === false &&
      summary.guiApprovalRequestResumeSecondNoApprovalPrompt
        ?.textareaVisible === true &&
      summary.guiApprovalRequestResumeSecondNoApprovalPrompt
        ?.textareaDisabled === false,
    approvalRequestResumeSecondReadModelAutoResolved:
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.pendingRequestCount === 0 &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesApprovalSessionCacheHit === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesAllowForSession === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesSecondPermissionRequestId === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesActionResolvedForSecondPermission === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesActionRequiredForSecondPermission === false,
    guiApprovalRequestResumeSecondCompleted:
      summary.guiApprovalRequestResumeSecondCompleted?.hasPrompt === true &&
      (summary.guiApprovalRequestResumeSecondCompleted?.hasAssistantSummary ===
        true ||
        summary.guiApprovalRequestResumeSecondCompleted?.hasDoneText ===
          true) &&
      summary.guiApprovalRequestResumeSecondCompleted?.textareaVisible ===
        true &&
      summary.guiApprovalRequestResumeSecondCompleted?.textareaDisabled ===
        false &&
      summary.guiApprovalRequestResumeSecondCompleted?.stopButtonVisible ===
        false,
    guiApprovalRequestResumeSecondRecordCompact: compactApprovalRecordVisible(
      summary.guiApprovalRequestResumeSecondCompleted,
    ),
    readModelApprovalRequestResumeSecondCompleted:
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.latestTurnStatus === "completed" &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesSecondPrompt === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesSecondResult === true &&
      summary.readModelApprovalRequestResumeSecondCompleted
        ?.includesSecondDone === true,
    approvalRequestResumeNoLegacyRuntimeRespond:
      noLegacyRuntimeRespond(appServerRequestMethods) &&
      pageText.includes(APPROVAL_REQUEST_RESUME_RESULT_TEXT),
  };
}

export function buildApprovalRequestDecisionScenarioAssertions({
  appServerRequestMethods,
  approvalRequestResumeTurnStart,
  backendLedger,
  isApprovalRequestCancelScenario,
  isApprovalRequestDeclineScenario,
  summary,
}) {
  const expectedDecision = isApprovalRequestCancelScenario
    ? "cancel"
    : "decline";
  const turnId = approvalRequestResumeTurnStart?.turnId;
  const emitTypes = emitEventTypesForTurn(backendLedger, turnId);
  const noToolResult =
    summary.readModelApprovalRequestDeclineCompleted?.includesToolResult !==
      true &&
    summary.readModelApprovalRequestCancelCanceled?.includesToolResult !== true;
  return {
    approvalRequestDecisionPromptReachedBackend:
      approvalRequestResumeTurnStart?.inputText ===
      APPROVAL_REQUEST_RESUME_PROMPT,
    guiApprovalRequestDecisionInputSubmitted:
      summary.approvalRequestDecisionInputSend?.afterFill
        ?.promptVisibleInTextarea === true &&
      summary.approvalRequestDecisionInputSend?.clicked?.clicked === true,
    guiApprovalRequestDecisionPendingVisible:
      summary.approvalRequestDecisionPendingGui?.hasSection === true &&
      summary.approvalRequestDecisionPendingGui?.hasApprovalContent === true &&
      summary.approvalRequestDecisionPendingGui?.hasPrompt === true &&
      summary.approvalRequestDecisionPendingGui?.hasToolName === false &&
      summary.approvalRequestDecisionPendingGui?.hasCommand === false &&
      summary.approvalRequestDecisionPendingGui?.hasDetails === false &&
      summary.approvalRequestDecisionPendingGui?.hasPreformattedArguments ===
        false &&
      summary.approvalRequestDecisionPendingGui?.textareaVisible === false &&
      summary.approvalRequestDecisionPendingGui?.singleLine === true &&
      (expectedDecision === "cancel"
        ? summary.approvalRequestDecisionPendingGui?.cancelButtonVisible ===
          true
        : summary.approvalRequestDecisionPendingGui?.declineButtonVisible ===
          true),
    readModelApprovalRequestDecisionPending:
      summary.approvalRequestDecisionPendingReadModel?.hasPendingRequest ===
        true &&
      summary.approvalRequestDecisionPendingReadModel?.payloadActionType ===
        "tool_confirmation" &&
      summary.approvalRequestDecisionPendingReadModel?.includesRequestId ===
        true &&
      summary.approvalRequestDecisionPendingReadModel?.includesToolCallId ===
        true,
    approvalRequestDecisionUsedCurrentActionRespond:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      ) ||
      summary.approvalRequestDecisionRespondActionRequest?.method ===
        APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    approvalRequestDecisionRespondPayloadScoped: decisionRequestScoped(
      summary,
      turnId,
      expectedDecision,
    ),
    approvalRequestDecisionBackendActionRespondObserved:
      summary.approvalRequestDecisionBackendActionRespond?.requestId ===
        APPROVAL_REQUEST_RESUME_REQUEST_ID &&
      summary.approvalRequestDecisionBackendActionRespond?.actionType ===
        "tool_confirmation" &&
      summary.approvalRequestDecisionBackendActionRespond?.decision ===
        expectedDecision &&
      summary.approvalRequestDecisionBackendActionRespond?.decisionScope ===
        "once" &&
      summary.approvalRequestDecisionBackendActionRespond?.turnId === turnId,
    approvalRequestDecisionPendingCleared:
      (isApprovalRequestDeclineScenario
        ? summary.readModelApprovalRequestDeclineCompleted?.pendingRequestCount
        : summary.readModelApprovalRequestCancelCanceled
            ?.pendingRequestCount) === 0,
    ...(isApprovalRequestDeclineScenario
      ? {
          approvalRequestDeclineNoToolExecuted:
            noToolResult &&
            emitTypes.includes("turn.completed") &&
            !emitTypes.includes("turn.canceled"),
          guiApprovalRequestDeclineCompleted:
            summary.guiApprovalRequestDeclineCompleted?.hasPrompt === true &&
            summary.guiApprovalRequestDeclineCompleted?.hasAssistantSummary ===
              true &&
            summary.guiApprovalRequestDeclineCompleted?.textareaVisible ===
              true &&
            summary.guiApprovalRequestDeclineCompleted?.textareaDisabled ===
              false &&
            summary.guiApprovalRequestDeclineCompleted?.stopButtonVisible ===
              false,
          guiApprovalRequestDeclineRecordCompact: compactApprovalRecordVisible(
            summary.guiApprovalRequestDeclineCompleted,
          ),
          readModelApprovalRequestDeclineCompleted:
            summary.readModelApprovalRequestDeclineCompleted
              ?.latestTurnStatus === "completed" &&
            summary.readModelApprovalRequestDeclineCompleted?.includesPrompt ===
              true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesRequestId === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesToolCallId === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesActionResolved === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesDecision === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesDeclineResult === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesDeclineDone === true &&
            summary.readModelApprovalRequestDeclineCompleted
              ?.includesToolResult === false &&
            summary.guiApprovalRequestDeclineCompleted?.hasAssistantSummary ===
              true,
        }
      : {
          approvalRequestCancelNoToolExecuted:
            noToolResult &&
            emitTypes.includes("turn.canceled") &&
            !emitTypes.includes("turn.completed"),
          guiApprovalRequestCancelCompleted:
            summary.guiApprovalRequestCancelCompleted?.hasPrompt === true &&
            summary.guiApprovalRequestCancelCompleted?.textareaVisible ===
              true &&
            summary.guiApprovalRequestCancelCompleted?.textareaDisabled ===
              false &&
            summary.guiApprovalRequestCancelCompleted?.stopButtonVisible ===
              false,
          guiApprovalRequestCancelRecordCompact: compactApprovalRecordVisible(
            summary.guiApprovalRequestCancelCompleted,
          ),
          readModelApprovalRequestCancelCanceled:
            summary.readModelApprovalRequestCancelCanceled
              ?.latestTurnCanceled === true &&
            summary.readModelApprovalRequestCancelCanceled?.includesPrompt ===
              true &&
            summary.readModelApprovalRequestCancelCanceled
              ?.includesRequestId === true &&
            summary.readModelApprovalRequestCancelCanceled
              ?.includesToolCallId === true &&
            summary.readModelApprovalRequestCancelCanceled
              ?.includesActionResolved === true &&
            summary.readModelApprovalRequestCancelCanceled?.includesDecision ===
              true &&
            summary.readModelApprovalRequestCancelCanceled?.includesCanceled ===
              true &&
            summary.readModelApprovalRequestCancelCanceled
              ?.includesToolResult === false,
        }),
    approvalRequestDecisionNoLegacyRuntimeRespond: noLegacyRuntimeRespond(
      appServerRequestMethods,
    ),
  };
}
