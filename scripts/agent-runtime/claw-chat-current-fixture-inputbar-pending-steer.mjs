import {
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_RICH_RESTORE_PROMPT,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  waitForBackendLedgerEntry,
  waitForBackendLedgerTurnStartContaining,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import { waitForStopButtonVisibleAndClick } from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import {
  prepareRichDraft,
  summarizeBackendTurnStart,
  waitForRichRestoreSnapshot,
} from "./claw-chat-current-fixture-inputbar-rich-restore.mjs";
import {
  clickQueuedTurnPromoteButtonForPrompt,
  clickRichRestoreDeferButton,
  deferSecondPlainPendingSteer,
  reloadAndWaitForPendingSteerQueuedHydrate,
} from "./claw-chat-current-fixture-pending-steer-gui-actions.mjs";
import {
  summarizeRichPromptBackendDeferral,
  waitForInputbarPendingSteerPopFrontReadModel,
  waitForInputbarPendingSteerQueuedReadModel,
} from "./claw-chat-current-fixture-pending-steer-read-model.mjs";
import { readJsonl, sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

async function startActivePendingSteerTurn({
  page,
  options,
  summary,
  runtimeEnv,
  activeStreamingLabel,
}) {
  summary.inputbarPendingSteerActiveInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
      {
        expectedSessionId: summary?.sessionId?.trim() || SESSION_ID,
      },
    ),
  );

  const activeTurnStart = await waitForBackendLedgerTurnStartContaining(
    runtimeEnv.backendLedgerPath,
    INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
    options,
  );
  summary.inputbarPendingSteerActiveBackendTurnStart =
    summarizeBackendTurnStart(activeTurnStart);

  summary.inputbarPendingSteerActiveStreaming =
    await waitForRichRestoreSnapshot(
      page,
      options,
      (snapshot) =>
        snapshot.stopButtonVisible === true &&
        snapshot.bodyText.includes(INPUTBAR_PENDING_STEER_ACTIVE_PROMPT) &&
        snapshot.bodyText.includes(INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT),
      activeStreamingLabel,
    );

  return {
    sessionId: activeTurnStart.entry.sessionId ?? SESSION_ID,
    turnId: activeTurnStart.entry.turnId ?? null,
  };
}

async function queueRichPendingSteerDraft({
  page,
  options,
  summary,
  runtimeEnv,
}) {
  summary.inputbarPendingSteerDraftPrepared = await prepareRichDraft(
    page,
    options,
    runtimeEnv,
    summary,
    { submitAction: "defer" },
  );
  summary.inputbarPendingSteerSkill =
    summary.inputbarPendingSteerDraftPrepared.skill;

  summary.inputbarPendingSteerInputDefer = await clickRichRestoreDeferButton(
    page,
    options,
  );
}

function summarizePendingSteerBackendBeforeCancel({ runtimeEnv, summary }) {
  summary.inputbarPendingSteerBackendBeforeCancel =
    summarizeRichPromptBackendDeferral(readJsonl(runtimeEnv.backendLedgerPath));
}

function summarizeRichRestoreResult(summary) {
  return sanitizeJson({
    inputbarPendingSteerActiveInputSend:
      summary.inputbarPendingSteerActiveInputSend,
    inputbarPendingSteerActiveBackendTurnStart:
      summary.inputbarPendingSteerActiveBackendTurnStart,
    inputbarPendingSteerActiveStreaming:
      summary.inputbarPendingSteerActiveStreaming,
    inputbarPendingSteerSkill: summary.inputbarPendingSteerSkill,
    inputbarPendingSteerDraftPrepared:
      summary.inputbarPendingSteerDraftPrepared,
    inputbarPendingSteerInputDefer: summary.inputbarPendingSteerInputDefer,
    inputbarPendingSteerSecondInputDefer:
      summary.inputbarPendingSteerSecondInputDefer,
    inputbarPendingSteerQueuedReadModel:
      summary.inputbarPendingSteerQueuedReadModel,
    inputbarPendingSteerBackendBeforeCancel:
      summary.inputbarPendingSteerBackendBeforeCancel,
    inputbarPendingSteerBackendCancel:
      summary.inputbarPendingSteerBackendCancel,
    inputbarPendingSteerStopClick: summary.inputbarPendingSteerStopClick,
    inputbarPendingSteerGuiCanceled: summary.inputbarPendingSteerGuiCanceled,
  });
}

function summarizeMultiQueueResult(summary) {
  return sanitizeJson({
    inputbarPendingSteerActiveInputSend:
      summary.inputbarPendingSteerActiveInputSend,
    inputbarPendingSteerActiveBackendTurnStart:
      summary.inputbarPendingSteerActiveBackendTurnStart,
    inputbarPendingSteerActiveStreaming:
      summary.inputbarPendingSteerActiveStreaming,
    inputbarPendingSteerSkill: summary.inputbarPendingSteerSkill,
    inputbarPendingSteerInputDefer: summary.inputbarPendingSteerInputDefer,
    inputbarPendingSteerSecondInputDefer:
      summary.inputbarPendingSteerSecondInputDefer,
    inputbarPendingSteerQueuedReadModel:
      summary.inputbarPendingSteerQueuedReadModel,
    inputbarPendingSteerBackendBeforeCancel:
      summary.inputbarPendingSteerBackendBeforeCancel,
  });
}

function summarizePopFrontResumeResult(summary) {
  return sanitizeJson({
    inputbarPendingSteerActiveInputSend:
      summary.inputbarPendingSteerActiveInputSend,
    inputbarPendingSteerActiveBackendTurnStart:
      summary.inputbarPendingSteerActiveBackendTurnStart,
    inputbarPendingSteerActiveStreaming:
      summary.inputbarPendingSteerActiveStreaming,
    inputbarPendingSteerSkill: summary.inputbarPendingSteerSkill,
    inputbarPendingSteerInputDefer: summary.inputbarPendingSteerInputDefer,
    inputbarPendingSteerSecondInputDefer:
      summary.inputbarPendingSteerSecondInputDefer,
    inputbarPendingSteerQueuedReadModel:
      summary.inputbarPendingSteerQueuedReadModel,
    inputbarPendingSteerPopFrontGuiPromote:
      summary.inputbarPendingSteerPopFrontGuiPromote,
    inputbarPendingSteerBackendBeforeCancel:
      summary.inputbarPendingSteerBackendBeforeCancel,
    inputbarPendingSteerPopFrontBackendCancel:
      summary.inputbarPendingSteerPopFrontBackendCancel,
    inputbarPendingSteerPopFrontRichBackendTurnStart:
      summary.inputbarPendingSteerPopFrontRichBackendTurnStart,
    inputbarPendingSteerPopFrontReadModelAfterResume:
      summary.inputbarPendingSteerPopFrontReadModelAfterResume,
    inputbarPendingSteerPopFrontGuiHydrated:
      summary.inputbarPendingSteerPopFrontGuiHydrated,
  });
}

export async function runInputbarPendingSteerRichRestoreScenario({
  page,
  options,
  summary,
  appServerRequests,
  runtimeEnv,
}) {
  const { sessionId, turnId: activeTurnId } = await startActivePendingSteerTurn(
    {
      page,
      options,
      summary,
      runtimeEnv,
      activeStreamingLabel:
        "Inputbar pending steer active turn 未进入正在输出状态",
    },
  );

  await queueRichPendingSteerDraft({
    page,
    options,
    summary,
    runtimeEnv,
  });

  summary.inputbarPendingSteerQueuedReadModel =
    await waitForInputbarPendingSteerQueuedReadModel(
      page,
      options,
      appServerRequests,
      summary.threadId,
    );

  summarizePendingSteerBackendBeforeCancel({ runtimeEnv, summary });

  summary.inputbarPendingSteerStopClick = sanitizeJson(
    await waitForStopButtonVisibleAndClick(page, options),
  );

  summary.inputbarPendingSteerGuiCanceled = await waitForRichRestoreSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.textareaVisible === true &&
      snapshot.textareaDisabled === false &&
      snapshot.textareaValue === INPUTBAR_RICH_RESTORE_PROMPT &&
      snapshot.imageRestored === true &&
      snapshot.pathRestored === true &&
      snapshot.skillRestored === true &&
      snapshot.stopButtonVisible === false &&
      !snapshot.assistantTexts.includes("正在生成回复") &&
      snapshot.bodyText.includes(INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT),
    "Inputbar pending steer 取消 queued rich turn 后未恢复完整 rich 草稿",
  );

  const activeCancel = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "turnCancel" &&
      (!activeTurnId || entry.turnId === activeTurnId),
    options,
  );
  summary.inputbarPendingSteerBackendCancel = sanitizeJson({
    sessionId: activeCancel.entry.sessionId ?? null,
    turnId: activeCancel.entry.turnId ?? null,
    ledgerCount: activeCancel.ledger.length,
  });

  return summarizeRichRestoreResult(summary);
}

export async function runInputbarPendingSteerMultiQueueScenario({
  page,
  options,
  summary,
  appServerRequests,
  runtimeEnv,
}) {
  const { sessionId } = await startActivePendingSteerTurn({
    page,
    options,
    summary,
    runtimeEnv,
    activeStreamingLabel:
      "Inputbar pending steer multi queue active turn 未进入正在输出状态",
  });

  await queueRichPendingSteerDraft({
    page,
    options,
    summary,
    runtimeEnv,
  });
  summary.inputbarPendingSteerSecondInputDefer =
    await deferSecondPlainPendingSteer(page, options);

  summary.inputbarPendingSteerQueuedReadModel =
    await waitForInputbarPendingSteerQueuedReadModel(
      page,
      options,
      appServerRequests,
      summary.threadId,
      { requireSecondQueued: true },
    );

  summarizePendingSteerBackendBeforeCancel({ runtimeEnv, summary });

  return summarizeMultiQueueResult(summary);
}

export async function runInputbarPendingSteerPopFrontResumeScenario({
  page,
  options,
  summary,
  appServerRequests,
  runtimeEnv,
}) {
  const { sessionId, turnId: activeTurnId } = await startActivePendingSteerTurn(
    {
      page,
      options,
      summary,
      runtimeEnv,
      activeStreamingLabel:
        "Inputbar pending steer pop-front active turn 未进入正在输出状态",
    },
  );

  await queueRichPendingSteerDraft({
    page,
    options,
    summary,
    runtimeEnv,
  });
  summary.inputbarPendingSteerSecondInputDefer =
    await deferSecondPlainPendingSteer(page, options);

  summary.inputbarPendingSteerQueuedReadModel =
    await waitForInputbarPendingSteerQueuedReadModel(
      page,
      options,
      appServerRequests,
      summary.threadId,
      { requireSecondQueued: true },
    );

  summary.inputbarPendingSteerPopFrontGuiPromote =
    await clickQueuedTurnPromoteButtonForPrompt(
      page,
      options,
      INPUTBAR_RICH_RESTORE_PROMPT,
    );

  summarizePendingSteerBackendBeforeCancel({ runtimeEnv, summary });

  const activeCancel = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) =>
      entry.kind === "turnCancel" &&
      (!activeTurnId || entry.turnId === activeTurnId),
    options,
  );
  summary.inputbarPendingSteerPopFrontBackendCancel = sanitizeJson({
    sessionId: activeCancel.entry.sessionId ?? null,
    turnId: activeCancel.entry.turnId ?? null,
    ledgerCount: activeCancel.ledger.length,
  });

  const richTurnStart = await waitForBackendLedgerTurnStartContaining(
    runtimeEnv.backendLedgerPath,
    INPUTBAR_RICH_RESTORE_PROMPT,
    options,
  );
  summary.inputbarPendingSteerPopFrontRichBackendTurnStart =
    summarizeBackendTurnStart(richTurnStart);

  summary.inputbarPendingSteerPopFrontReadModelAfterResume =
    await waitForInputbarPendingSteerPopFrontReadModel(
      page,
      options,
      appServerRequests,
      summary.threadId,
    );

  summary.inputbarPendingSteerPopFrontGuiHydrated =
    await reloadAndWaitForPendingSteerQueuedHydrate(
      page,
      options,
      summary.inputbarPendingSteerPopFrontRichBackendTurnStart.turnId,
    );

  return summarizePopFrontResumeResult(summary);
}
