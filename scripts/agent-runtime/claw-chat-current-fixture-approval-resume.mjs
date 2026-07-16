import {
  APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
  APPROVAL_REQUEST_CANCEL_DONE_TEXT,
  APPROVAL_REQUEST_DECLINE_DONE_TEXT,
  APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
  APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
  APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
  APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_PROMPT,
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
  APPROVAL_REQUEST_RESUME_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_SECOND_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
  APPROVAL_REQUEST_RESUME_SECOND_PROMPT_MARKER,
  APPROVAL_REQUEST_RESUME_SECOND_RESULT_TEXT,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  waitForBackendLedgerEntry,
  waitForBackendLedgerTurnStart,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  clickApprovalDecisionButton,
  clickApprovalApproveButton,
  waitForGuiApprovalPromptAbsent,
  waitForGuiApprovalPending,
  waitForGuiApprovalPromptAbsentAfterSecondTurn,
} from "./claw-chat-current-fixture-approval-gui.mjs";
import {
  summarizeApprovalCompletedReadModel,
  summarizeApprovalDecisionReadModel,
  summarizeApprovalSecondTurnStart,
  summarizeApprovalSessionCacheReadModel,
  waitForApprovalPendingReadModel,
} from "./claw-chat-current-fixture-approval-read-model.mjs";
import { waitForActionRespondTrace } from "./claw-chat-current-fixture-approval-trace.mjs";
import {
  waitForGuiChatCanceled,
  waitForGuiChatCompleted,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import {
  sendPromptFromGui,
  setInputbarAccessMode,
} from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  waitForSessionReadCanceled,
  waitForSessionReadCompleted,
} from "./claw-chat-current-fixture-read-model-waits.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

function summarizeFullAccessReadModel(readModel) {
  const detail = readModel?.detail ?? readModel ?? {};
  const threadRead = detail?.thread_read ?? detail?.threadRead ?? {};
  const pendingRequests = [
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
  const serialized = JSON.stringify(readModel || {});
  return sanitizeJson({
    pendingRequestCount: pendingRequests.length,
    latestTurnStatus:
      threadRead?.runtime_summary?.latestTurnStatus ??
      threadRead?.runtimeSummary?.latestTurnStatus ??
      threadRead?.status ??
      detail?.status ??
      null,
    includesPrompt: serialized.includes(APPROVAL_REQUEST_FULL_ACCESS_PROMPT),
    includesAssistantSummary: serialized.includes(
      APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT,
    ),
    includesAssistantDone: serialized.includes(
      APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
    ),
    includesApprovalRequest: serialized.includes("approval_request"),
    includesActionRequired:
      serialized.includes("action.required") ||
      serialized.includes("action_required"),
    includesActionResolved:
      serialized.includes("action.resolved") ||
      serialized.includes("action_resolved"),
    includesApprovalPrompt: serialized.includes(
      "需要确认浏览器控制权限",
    ),
  });
}

function summarizeBackendActionRespond(entry) {
  return {
    sessionId: entry.sessionId ?? null,
    threadId: entry.threadId ?? null,
    turnId: entry.turnId ?? null,
    requestId: entry.requestId ?? null,
    actionType: entry.actionType ?? null,
    decision: entry.decision ?? null,
    decisionScope: entry.decisionScope ?? null,
    confirmed: entry.confirmed ?? null,
    response: entry.response ?? null,
    actionScope: entry.actionScope ?? null,
  };
}

export async function runApprovalRequestFullAccessScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  logStage("set-approval-request-full-access-mode");
  const accessModeSet = await setInputbarAccessMode(
    page,
    options,
    "full-access",
  );

  logStage("send-approval-request-full-access-prompt-from-gui");
  const inputSend = sanitizeJson(
    await sendPromptFromGui(page, options, APPROVAL_REQUEST_FULL_ACCESS_PROMPT),
  );

  logStage("wait-approval-request-full-access-backend-turn-start");
  const backendTurnStart = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
    options,
  );

  logStage("wait-gui-approval-request-full-access-completed");
  const guiCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
      doneText: APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT,
    }),
  );

  logStage("wait-gui-approval-request-full-access-no-prompt");
  const noApprovalPrompt = await waitForGuiApprovalPromptAbsent(page, options, {
    requiredText: APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
  });

  logStage("wait-read-model-approval-request-full-access-completed");
  const completedReadModel = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
      doneText: APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT,
    },
  );

  return sanitizeJson({
    approvalRequestFullAccessAccessModeSet: accessModeSet,
    approvalRequestFullAccessInputSend: inputSend,
    approvalRequestFullAccessBackendTurnStart: {
      sessionId: backendTurnStart.entry.sessionId ?? null,
      threadId: backendTurnStart.entry.threadId ?? null,
      turnId: backendTurnStart.entry.turnId ?? null,
      inputText: backendTurnStart.entry.inputText ?? null,
      approvalPolicy:
        backendTurnStart.entry.runtimeRequest?.approval_policy ??
        backendTurnStart.entry.runtimeRequest?.approvalPolicy ??
        null,
      sandboxPolicy:
        backendTurnStart.entry.runtimeRequest?.sandbox_policy ??
        backendTurnStart.entry.runtimeRequest?.sandboxPolicy ??
        null,
    },
    guiApprovalRequestFullAccessCompleted: guiCompleted,
    guiApprovalRequestFullAccessNoApproval: noApprovalPrompt,
    readModelApprovalRequestFullAccessCompleted:
      summarizeFullAccessReadModel(completedReadModel),
  });
}

export async function runApprovalRequestDecisionScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
  decision,
}) {
  const scenarioStage = `approval-request-${decision}`;
  logStage(`send-${scenarioStage}-prompt-from-gui`);
  const inputSend = sanitizeJson(
    await sendPromptFromGui(page, options, APPROVAL_REQUEST_RESUME_PROMPT),
  );

  logStage(`wait-${scenarioStage}-backend-turn-start`);
  const backendTurnStart = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    APPROVAL_REQUEST_RESUME_PROMPT,
    options,
  );

  logStage(`wait-gui-${scenarioStage}-pending`);
  const pendingGui = await waitForGuiApprovalPending(page, options);

  logStage(`wait-read-model-${scenarioStage}-pending`);
  const pendingReadModel = await waitForApprovalPendingReadModel(
    page,
    options,
    appServerRequests,
  );

  logStage(`click-${scenarioStage}`);
  const decisionClick = await clickApprovalDecisionButton(
    page,
    options,
    decision,
  );

  logStage(`wait-${scenarioStage}-action-respond-trace`);
  const respondActionRequest = await waitForActionRespondTrace(page, options, {
    decision,
  });

  logStage(`wait-${scenarioStage}-backend-action-respond`);
  const backendActionRespond = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "approvalRequestResumeActionRespond" &&
      entry.requestId === APPROVAL_REQUEST_RESUME_REQUEST_ID &&
      entry.decision === decision,
    options,
  );

  if (decision === "cancel") {
    logStage(`wait-gui-${scenarioStage}-canceled`);
    const guiCanceled = sanitizeJson(
      await waitForGuiChatCanceled(page, options, {
        prompt: APPROVAL_REQUEST_RESUME_PROMPT,
        requireApprovalRecord: true,
      }),
    );

    logStage(`wait-read-model-${scenarioStage}-canceled`);
    const canceledReadModel = await waitForSessionReadCanceled(
      page,
      options,
      appServerRequests,
      {
        prompt: APPROVAL_REQUEST_RESUME_PROMPT,
      },
    );

    return sanitizeJson({
      approvalRequestDecisionExpectedDecision: decision,
      approvalRequestDecisionInputSend: inputSend,
      approvalRequestDecisionBackendTurnStart: {
        sessionId: backendTurnStart.entry.sessionId ?? null,
        threadId: backendTurnStart.entry.threadId ?? null,
        turnId: backendTurnStart.entry.turnId ?? null,
        inputText: backendTurnStart.entry.inputText ?? null,
      },
      approvalRequestDecisionPendingGui: pendingGui,
      approvalRequestDecisionPendingReadModel: pendingReadModel,
      approvalRequestDecisionClick: decisionClick,
      approvalRequestDecisionRespondActionRequest: respondActionRequest ?? {
        method: APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
        params: {
          sessionId: backendActionRespond.entry.sessionId,
          requestId: backendActionRespond.entry.requestId,
          actionType: backendActionRespond.entry.actionType,
          decision: backendActionRespond.entry.decision,
          decisionScope: backendActionRespond.entry.decisionScope,
          response: backendActionRespond.entry.response,
          actionScope: backendActionRespond.entry.actionScope,
        },
      },
      approvalRequestDecisionBackendActionRespond:
        summarizeBackendActionRespond(backendActionRespond.entry),
      guiApprovalRequestCancelCompleted: {
        ...guiCanceled,
        expectedDoneText: APPROVAL_REQUEST_CANCEL_DONE_TEXT,
      },
      readModelApprovalRequestCancelCanceled:
        summarizeApprovalDecisionReadModel(canceledReadModel, decision),
    });
  }

  logStage(`wait-gui-${scenarioStage}-completed`);
  const guiCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: APPROVAL_REQUEST_RESUME_PROMPT,
      doneText: APPROVAL_REQUEST_DECLINE_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
      requireApprovalRecord: true,
    }),
  );

  logStage(`wait-read-model-${scenarioStage}-completed`);
  const completedReadModel = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: APPROVAL_REQUEST_RESUME_PROMPT,
      doneText: APPROVAL_REQUEST_DECLINE_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
    },
  );

  return sanitizeJson({
    approvalRequestDecisionExpectedDecision: decision,
    approvalRequestDecisionInputSend: inputSend,
    approvalRequestDecisionBackendTurnStart: {
      sessionId: backendTurnStart.entry.sessionId ?? null,
      threadId: backendTurnStart.entry.threadId ?? null,
      turnId: backendTurnStart.entry.turnId ?? null,
      inputText: backendTurnStart.entry.inputText ?? null,
    },
    approvalRequestDecisionPendingGui: pendingGui,
    approvalRequestDecisionPendingReadModel: pendingReadModel,
    approvalRequestDecisionClick: decisionClick,
    approvalRequestDecisionRespondActionRequest: respondActionRequest ?? {
      method: APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      params: {
        sessionId: backendActionRespond.entry.sessionId,
        requestId: backendActionRespond.entry.requestId,
        actionType: backendActionRespond.entry.actionType,
        decision: backendActionRespond.entry.decision,
        decisionScope: backendActionRespond.entry.decisionScope,
        response: backendActionRespond.entry.response,
        actionScope: backendActionRespond.entry.actionScope,
      },
    },
    approvalRequestDecisionBackendActionRespond:
      summarizeBackendActionRespond(backendActionRespond.entry),
    guiApprovalRequestDeclineCompleted: guiCompleted,
    readModelApprovalRequestDeclineCompleted:
      summarizeApprovalDecisionReadModel(completedReadModel, decision),
  });
}

export async function runApprovalRequestResumeScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  logStage("send-approval-request-resume-prompt-from-gui");
  const inputSend = sanitizeJson(
    await sendPromptFromGui(page, options, APPROVAL_REQUEST_RESUME_PROMPT),
  );

  logStage("wait-approval-request-resume-backend-turn-start");
  const backendTurnStart = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    APPROVAL_REQUEST_RESUME_PROMPT,
    options,
  );

  logStage("wait-gui-approval-request-resume-pending");
  const pendingGui = await waitForGuiApprovalPending(page, options);

  logStage("wait-read-model-approval-request-resume-pending");
  const pendingReadModel = await waitForApprovalPendingReadModel(
    page,
    options,
    appServerRequests,
  );

  logStage("click-approval-request-resume-approve");
  const approveClick = await clickApprovalApproveButton(page, options);

  logStage("wait-approval-request-resume-action-respond-trace");
  const respondActionRequest = await waitForActionRespondTrace(page, options);

  logStage("wait-approval-request-resume-backend-action-respond");
  const backendActionRespond = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "approvalRequestResumeActionRespond" &&
      entry.requestId === APPROVAL_REQUEST_RESUME_REQUEST_ID,
    options,
  );

  logStage("wait-gui-approval-request-resume-completed");
  const guiCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: APPROVAL_REQUEST_RESUME_PROMPT,
      doneText: APPROVAL_REQUEST_RESUME_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_RESUME_RESULT_TEXT,
      requireApprovalRecord: true,
    }),
  );

  logStage("wait-read-model-approval-request-resume-completed");
  const completedReadModel = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: APPROVAL_REQUEST_RESUME_PROMPT,
      doneText: APPROVAL_REQUEST_RESUME_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_RESUME_RESULT_TEXT,
    },
  );

  logStage("set-approval-request-resume-second-access-mode-current");
  const secondAccessModeSet = await setInputbarAccessMode(
    page,
    options,
    "current",
  );

  logStage("send-approval-request-resume-second-browser-prompt-from-gui");
  const secondInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
    ),
  );

  logStage("wait-approval-request-resume-second-backend-turn-start");
  const secondBackendTurnStart = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
    options,
  );

  logStage("wait-gui-approval-request-resume-second-completed");
  const secondGuiCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: APPROVAL_REQUEST_RESUME_SECOND_PROMPT_MARKER,
      doneText: APPROVAL_REQUEST_RESUME_SECOND_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_RESUME_SECOND_RESULT_TEXT,
    }),
  );

  logStage("wait-gui-approval-request-resume-second-no-prompt");
  const secondGuiNoApprovalPrompt =
    await waitForGuiApprovalPromptAbsentAfterSecondTurn(page, options);

  logStage("wait-read-model-approval-request-resume-second-completed");
  const secondCompletedReadModel = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: APPROVAL_REQUEST_RESUME_SECOND_PROMPT,
      doneText: APPROVAL_REQUEST_RESUME_SECOND_DONE_TEXT,
      summaryText: APPROVAL_REQUEST_RESUME_SECOND_RESULT_TEXT,
    },
  );

  return sanitizeJson({
    approvalRequestResumeInputSend: inputSend,
    approvalRequestResumeBackendTurnStart: {
      sessionId: backendTurnStart.entry.sessionId ?? null,
      threadId: backendTurnStart.entry.threadId ?? null,
      turnId: backendTurnStart.entry.turnId ?? null,
      inputText: backendTurnStart.entry.inputText ?? null,
    },
    approvalRequestResumePendingGui: pendingGui,
    approvalRequestResumePendingReadModel: pendingReadModel,
    approvalRequestResumeApproveClick: approveClick,
    approvalRequestResumeRespondActionRequest: respondActionRequest ?? {
      method: APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
      params: {
        sessionId: backendActionRespond.entry.sessionId,
        requestId: backendActionRespond.entry.requestId,
        actionType: backendActionRespond.entry.actionType,
        decision: backendActionRespond.entry.decision,
        decisionScope: backendActionRespond.entry.decisionScope,
        response: backendActionRespond.entry.response,
        actionScope: backendActionRespond.entry.actionScope,
      },
    },
    approvalRequestResumeBackendActionRespond:
      summarizeBackendActionRespond(backendActionRespond.entry),
    guiApprovalRequestResumeCompleted: guiCompleted,
    readModelApprovalRequestResumeCompleted:
      summarizeApprovalCompletedReadModel(completedReadModel),
    approvalRequestResumeSecondAccessModeSet: secondAccessModeSet,
    approvalRequestResumeSecondInputSend: secondInputSend,
    approvalRequestResumeSecondBackendTurnStart:
      summarizeApprovalSecondTurnStart(secondBackendTurnStart.entry),
    guiApprovalRequestResumeSecondCompleted: secondGuiCompleted,
    guiApprovalRequestResumeSecondNoApprovalPrompt: secondGuiNoApprovalPrompt,
    readModelApprovalRequestResumeSecondCompleted:
      summarizeApprovalSessionCacheReadModel(
        secondCompletedReadModel,
        secondBackendTurnStart.entry.turnId,
      ),
  });
}
