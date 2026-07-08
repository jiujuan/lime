import {
  TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  waitForGuiChatCanceled,
  waitForGuiChatCompleted,
  waitForStopButtonVisibleAndClick,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForBackendLedgerEntry } from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  waitForSessionReadCanceled,
  waitForSessionReadFailedAfterAnswer,
} from "./claw-chat-current-fixture-read-model-waits.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

function latestTurnStatus(readModel) {
  return (
    readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
    readModel?.detail?.thread_read?.status ??
    readModel?.detail?.status ??
    null
  );
}

function readModelItemCount(readModel) {
  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    threadReadItemCount: Array.isArray(
      readModel?.detail?.thread_read?.thread_items,
    )
      ? readModel.detail.thread_read.thread_items.length
      : null,
  };
}

function summarizeTerminalFailedAfterAnswerReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  return {
    ...readModelItemCount(readModel),
    latestTurnStatus: latestTurnStatus(readModel),
    latestTurnErrorMessage:
      readModel?.detail?.thread_read?.diagnostics
        ?.latest_turn_error_message ??
      readModel?.detail?.thread_read?.diagnostics
        ?.latestTurnErrorMessage ??
      null,
    includesPrompt: serialized.includes(TERMINAL_FAILED_AFTER_ANSWER_PROMPT),
    includesPartialText: serialized.includes(
      TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
    ),
    includesFailureText: serialized.includes(
      TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
    ),
  };
}

function summarizeTerminalCanceledAfterAnswerReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  return {
    ...readModelItemCount(readModel),
    latestTurnStatus: latestTurnStatus(readModel),
    includesPrompt: serialized.includes(TERMINAL_CANCELED_AFTER_ANSWER_PROMPT),
    includesPartialText: serialized.includes(
      TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
    ),
    includesCanceled: serialized.includes("canceled"),
  };
}

export async function runTerminalFailedAfterAnswerScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  const result = {};

  logStage("send-terminal-failed-after-answer-prompt-from-gui");
  result.terminalFailedAfterAnswerInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
    ),
  );

  logStage("wait-gui-terminal-failed-after-answer-failed");
  result.guiTerminalFailedAfterAnswerCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
      doneText: TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
      summaryText: TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
      requiredVisibleTexts: [TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT],
      dedupeGuardTexts: [
        TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
        TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
      ],
    }),
  );

  logStage("wait-read-model-terminal-failed-after-answer-failed");
  const readModelTerminalFailedAfterAnswer =
    await waitForSessionReadFailedAfterAnswer(
      page,
      options,
      appServerRequests,
      {
        prompt: TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
        partialText: TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
        failureText: TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
      },
    );
  result.readModelTerminalFailedAfterAnswer = sanitizeJson(
    summarizeTerminalFailedAfterAnswerReadModel(
      readModelTerminalFailedAfterAnswer,
    ),
  );

  const failedAfterAnswerLedger = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) => entry.kind === "terminalFailedAfterAnswerTurnFailed",
    options,
  );
  result.terminalFailedAfterAnswerBackend = sanitizeJson({
    eventType: failedAfterAnswerLedger.entry.eventType,
    turnId: failedAfterAnswerLedger.entry.turnId,
    partialText: failedAfterAnswerLedger.entry.partialText,
    failureText: failedAfterAnswerLedger.entry.failureText,
    ledgerCount: failedAfterAnswerLedger.ledger.length,
  });

  return result;
}

export async function runTerminalCanceledAfterAnswerScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  const result = {};

  logStage("send-terminal-canceled-after-answer-prompt-from-gui");
  result.terminalCanceledAfterAnswerInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
    ),
  );

  logStage("click-stop-after-terminal-canceled-partial-from-gui");
  result.terminalCanceledAfterAnswerStopClick = sanitizeJson(
    await waitForStopButtonVisibleAndClick(page, options, {
      prompt: TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
      visibleOutputText: TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
      requireVisibleOutput: true,
    }),
  );

  logStage("wait-gui-terminal-canceled-after-answer-canceled");
  result.guiTerminalCanceledAfterAnswerCanceled = sanitizeJson(
    await waitForGuiChatCanceled(page, options, {
      prompt: TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
      partialText: TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
    }),
  );

  logStage("wait-read-model-terminal-canceled-after-answer-canceled");
  const readModelTerminalCanceledAfterAnswer = await waitForSessionReadCanceled(
    page,
    options,
    appServerRequests,
    {
      prompt: TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
      partialText: TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
    },
  );
  result.readModelTerminalCanceledAfterAnswer = sanitizeJson(
    summarizeTerminalCanceledAfterAnswerReadModel(
      readModelTerminalCanceledAfterAnswer,
    ),
  );

  const canceledAfterAnswerLedger = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) => entry.kind === "terminalCanceledAfterAnswerTurnCanceled",
    options,
  );
  result.terminalCanceledAfterAnswerBackend = sanitizeJson({
    eventType: canceledAfterAnswerLedger.entry.eventType,
    turnId: canceledAfterAnswerLedger.entry.turnId,
    partialText: canceledAfterAnswerLedger.entry.partialText,
    canceledText: canceledAfterAnswerLedger.entry.canceledText,
    ledgerCount: canceledAfterAnswerLedger.ledger.length,
  });

  return result;
}
