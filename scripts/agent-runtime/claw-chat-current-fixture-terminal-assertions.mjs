import {
  TERMINAL_CANCELED_AFTER_ANSWER_CANCELED_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
  TERMINAL_STALE_GUARD_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_PROMPT,
  TERMINAL_STALE_GUARD_SECOND_PROMPT,
  TERMINAL_STALE_GUARD_STALE_DONE_TEXT,
} from "./claw-chat-current-fixture-constants.mjs";

export function buildTerminalScenarioAssertions({
  isTerminalCanceledAfterAnswerScenario,
  isTerminalFailedAfterAnswerScenario,
  isTerminalStaleGuardScenario,
  summary,
  terminalCanceledAfterAnswerTurnStart,
  terminalFailedAfterAnswerTurnStart,
  terminalStaleGuardFirstTurnStart,
  terminalStaleGuardSecondTurnStart,
}) {
  if (isTerminalStaleGuardScenario) {
    return {
      terminalStaleGuardFirstPromptReachedBackend:
        terminalStaleGuardFirstTurnStart?.inputText ===
        TERMINAL_STALE_GUARD_FIRST_PROMPT,
      terminalStaleGuardSecondPromptReachedBackend:
        terminalStaleGuardSecondTurnStart?.inputText ===
        TERMINAL_STALE_GUARD_SECOND_PROMPT,
      terminalStaleGuardFirstCompleted:
        summary.guiTerminalStaleGuardFirstCompleted?.hasPrompt === true &&
        summary.guiTerminalStaleGuardFirstCompleted?.hasDoneText === true &&
        summary.readModelTerminalStaleGuardFirstCompleted?.includesPrompt ===
          true &&
        summary.readModelTerminalStaleGuardFirstCompleted
          ?.includesAssistantDone === true,
      terminalStaleGuardSecondInputSubmitted:
        summary.terminalStaleGuardSecondInputSend?.afterFill
          ?.promptVisibleInTextarea === true &&
        summary.terminalStaleGuardSecondInputSend?.clicked?.clicked === true,
      terminalStaleGuardSecondCompleted:
        summary.guiTerminalStaleGuardSecondCompleted?.hasPrompt === true &&
        summary.guiTerminalStaleGuardSecondCompleted?.hasDoneText === true &&
        summary.guiTerminalStaleGuardSecondCompleted?.textareaDisabled ===
          false &&
        summary.guiTerminalStaleGuardSecondCompleted?.stopButtonVisible ===
          false &&
        (
          summary.guiTerminalStaleGuardSecondCompleted
            ?.disallowedVisibleTextHits ?? []
        ).every((hit) => hit.occurrences === 0),
      terminalStaleGuardReadModelCompleted:
        summary.readModelTerminalStaleGuardSecondCompleted?.includesPrompt ===
          true &&
        summary.readModelTerminalStaleGuardSecondCompleted
          ?.includesAssistantDone === true &&
        summary.readModelTerminalStaleGuardSecondCompleted
          ?.latestTurnStatus === "completed",
      terminalStaleGuardStaleTerminalIgnored:
        summary.terminalStaleGuardStaleTerminal?.staleEventType ===
          "turn.completed" &&
        summary.terminalStaleGuardStaleTerminal?.staleDoneText ===
          TERMINAL_STALE_GUARD_STALE_DONE_TEXT &&
        summary.terminalStaleGuardStaleTerminal
          ?.staleTurnDiffersFromCurrent === true &&
        summary.guiTerminalStaleGuardSecondCompleted?.bodyText?.includes(
          TERMINAL_STALE_GUARD_DONE_TEXT,
        ) === true &&
        summary.guiTerminalStaleGuardSecondCompleted?.bodyText?.includes(
          TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
        ) === true &&
        summary.guiTerminalStaleGuardSecondCompleted?.bodyText?.includes(
          TERMINAL_STALE_GUARD_STALE_DONE_TEXT,
        ) === false,
    };
  }

  if (isTerminalCanceledAfterAnswerScenario) {
    return {
      terminalCanceledAfterAnswerPromptReachedBackend:
        terminalCanceledAfterAnswerTurnStart?.inputText ===
        TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
      guiTerminalCanceledAfterAnswerInputSubmitted:
        summary.terminalCanceledAfterAnswerInputSend?.afterFill
          ?.promptVisibleInTextarea === true &&
        summary.terminalCanceledAfterAnswerInputSend?.clicked?.clicked === true,
      guiTerminalCanceledAfterAnswerPartialVisibleBeforeStop:
        summary.terminalCanceledAfterAnswerStopClick?.beforeClick?.hasPrompt ===
          true &&
        summary.terminalCanceledAfterAnswerStopClick?.beforeClick
          ?.hasVisibleAssistantOutput === true &&
        summary.terminalCanceledAfterAnswerStopClick?.beforeClick
          ?.hasRunningStatus === true &&
        summary.terminalCanceledAfterAnswerStopClick?.beforeClick?.scopedText?.includes(
          TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
        ) === true,
      guiTerminalCanceledAfterAnswerStopClicked:
        summary.terminalCanceledAfterAnswerStopClick?.clicked?.clicked === true,
      guiTerminalCanceledAfterAnswerPartialRetained:
        summary.guiTerminalCanceledAfterAnswerCanceled?.hasPrompt === true &&
        summary.guiTerminalCanceledAfterAnswerCanceled?.hasPartialText ===
          true &&
        summary.guiTerminalCanceledAfterAnswerCanceled?.bodyText?.includes(
          TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
        ) === true,
      guiTerminalCanceledAfterAnswerNoDuplicates:
        (summary.guiTerminalCanceledAfterAnswerCanceled?.bodyText?.split(
          TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
        ).length ?? 1) -
          1 ===
        1,
      guiTerminalCanceledAfterAnswerInputReady:
        summary.guiTerminalCanceledAfterAnswerCanceled?.textareaVisible ===
          true &&
        summary.guiTerminalCanceledAfterAnswerCanceled?.textareaDisabled ===
          false &&
        summary.guiTerminalCanceledAfterAnswerCanceled?.stopButtonVisible ===
          false,
      readModelTerminalCanceledAfterAnswerCanceled:
        summary.readModelTerminalCanceledAfterAnswer?.includesPrompt === true &&
        summary.readModelTerminalCanceledAfterAnswer?.includesPartialText ===
          true &&
        summary.readModelTerminalCanceledAfterAnswer?.includesCanceled ===
          true &&
        summary.readModelTerminalCanceledAfterAnswer?.latestTurnStatus ===
          "canceled",
      backendTerminalCanceledAfterAnswerRecorded:
        summary.terminalCanceledAfterAnswerBackend?.eventType ===
          "turn.canceled" &&
        summary.terminalCanceledAfterAnswerBackend?.partialText ===
          TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT &&
        summary.terminalCanceledAfterAnswerBackend?.canceledText ===
          TERMINAL_CANCELED_AFTER_ANSWER_CANCELED_TEXT,
    };
  }

  if (isTerminalFailedAfterAnswerScenario) {
    return {
      terminalFailedAfterAnswerPromptReachedBackend:
        terminalFailedAfterAnswerTurnStart?.inputText ===
        TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
      guiTerminalFailedAfterAnswerInputSubmitted:
        summary.terminalFailedAfterAnswerInputSend?.afterFill
          ?.promptVisibleInTextarea === true &&
        summary.terminalFailedAfterAnswerInputSend?.clicked?.clicked === true,
      guiTerminalFailedAfterAnswerPartialRetained:
        summary.guiTerminalFailedAfterAnswerCompleted?.hasPrompt === true &&
        summary.guiTerminalFailedAfterAnswerCompleted?.hasAssistantSummary ===
          true &&
        summary.guiTerminalFailedAfterAnswerCompleted?.completionScope?.assistantText?.includes(
          TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
        ) === true,
      guiTerminalFailedAfterAnswerFailureVisible:
        summary.guiTerminalFailedAfterAnswerCompleted?.hasDoneText === true &&
        summary.guiTerminalFailedAfterAnswerCompleted?.completionScope?.assistantText?.includes(
          TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
        ) === true,
      guiTerminalFailedAfterAnswerNoDuplicates: (
        summary.guiTerminalFailedAfterAnswerCompleted
          ?.assistantScopeDedupeGuardHits ?? []
      ).every((hit) => hit.occurrences === 1),
      guiTerminalFailedAfterAnswerInputReady:
        summary.guiTerminalFailedAfterAnswerCompleted?.textareaVisible ===
          true &&
        summary.guiTerminalFailedAfterAnswerCompleted?.textareaDisabled ===
          false &&
        summary.guiTerminalFailedAfterAnswerCompleted?.stopButtonVisible ===
          false,
      readModelTerminalFailedAfterAnswerFailed:
        summary.readModelTerminalFailedAfterAnswer?.includesPrompt === true &&
        summary.readModelTerminalFailedAfterAnswer?.includesPartialText ===
          true &&
        summary.readModelTerminalFailedAfterAnswer?.includesFailureText ===
          true &&
        summary.readModelTerminalFailedAfterAnswer?.latestTurnStatus ===
          "failed",
      backendTerminalFailedAfterAnswerRecorded:
        summary.terminalFailedAfterAnswerBackend?.eventType ===
          "turn.failed" &&
        summary.terminalFailedAfterAnswerBackend?.partialText ===
          TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT &&
        summary.terminalFailedAfterAnswerBackend?.failureText ===
          TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
    };
  }

  return {};
}
