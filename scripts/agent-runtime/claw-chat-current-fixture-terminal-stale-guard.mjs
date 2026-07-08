import {
  TERMINAL_STALE_GUARD_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_PROMPT,
  TERMINAL_STALE_GUARD_FIRST_TEXT,
  TERMINAL_STALE_GUARD_SECOND_PROMPT,
  TERMINAL_STALE_GUARD_SECOND_TEXT,
  TERMINAL_STALE_GUARD_STALE_DONE_TEXT,
} from "./claw-chat-current-fixture-constants.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import { waitForGuiChatCompleted } from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForBackendLedgerEntry } from "./claw-chat-current-fixture-backend-ledger.mjs";
import { waitForSessionReadCompleted } from "./claw-chat-current-fixture-read-model-waits.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

function summarizeTerminalStaleGuardReadModel(readModel, { prompt, doneText }) {
  const serialized = JSON.stringify(readModel || {});
  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    threadReadItemCount: Array.isArray(
      readModel?.detail?.thread_read?.thread_items,
    )
      ? readModel.detail.thread_read.thread_items.length
      : null,
    latestTurnStatus:
      readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
      readModel?.detail?.thread_read?.status ??
      readModel?.detail?.status ??
      null,
    includesPrompt: serialized.includes(prompt),
    includesAssistantDone: serialized.includes(doneText),
  };
}

export async function runTerminalStaleGuardScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  logStage,
}) {
  const result = {};

  logStage("send-terminal-stale-guard-first-prompt-from-gui");
  result.terminalStaleGuardFirstInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      TERMINAL_STALE_GUARD_FIRST_PROMPT,
    ),
  );

  logStage("wait-gui-terminal-stale-guard-first-completed");
  result.guiTerminalStaleGuardFirstCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: TERMINAL_STALE_GUARD_FIRST_PROMPT,
      doneText: TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
      summaryText: TERMINAL_STALE_GUARD_FIRST_TEXT,
    }),
  );

  logStage("wait-read-model-terminal-stale-guard-first-completed");
  const readModelTerminalStaleGuardFirstCompleted =
    await waitForSessionReadCompleted(page, options, appServerRequests, {
      prompt: TERMINAL_STALE_GUARD_FIRST_PROMPT,
      doneText: TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
      summaryText: TERMINAL_STALE_GUARD_FIRST_TEXT,
    });
  result.readModelTerminalStaleGuardFirstCompleted = sanitizeJson(
    summarizeTerminalStaleGuardReadModel(
      readModelTerminalStaleGuardFirstCompleted,
      {
        prompt: TERMINAL_STALE_GUARD_FIRST_PROMPT,
        doneText: TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
      },
    ),
  );

  logStage("send-terminal-stale-guard-second-prompt-from-gui");
  result.terminalStaleGuardSecondInputSend = sanitizeJson(
    await sendPromptFromGui(
      page,
      options,
      TERMINAL_STALE_GUARD_SECOND_PROMPT,
    ),
  );

  logStage("wait-gui-terminal-stale-guard-second-completed");
  result.guiTerminalStaleGuardSecondCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: TERMINAL_STALE_GUARD_SECOND_PROMPT,
      doneText: TERMINAL_STALE_GUARD_DONE_TEXT,
      summaryText: TERMINAL_STALE_GUARD_SECOND_TEXT,
      disallowedVisibleTexts: [TERMINAL_STALE_GUARD_STALE_DONE_TEXT],
    }),
  );

  logStage("wait-read-model-terminal-stale-guard-second-completed");
  const readModelTerminalStaleGuardSecondCompleted =
    await waitForSessionReadCompleted(page, options, appServerRequests, {
      prompt: TERMINAL_STALE_GUARD_SECOND_PROMPT,
      doneText: TERMINAL_STALE_GUARD_DONE_TEXT,
      summaryText: TERMINAL_STALE_GUARD_SECOND_TEXT,
    });
  result.readModelTerminalStaleGuardSecondCompleted = sanitizeJson(
    summarizeTerminalStaleGuardReadModel(
      readModelTerminalStaleGuardSecondCompleted,
      {
        prompt: TERMINAL_STALE_GUARD_SECOND_PROMPT,
        doneText: TERMINAL_STALE_GUARD_DONE_TEXT,
      },
    ),
  );

  const staleTerminalLedger = await waitForBackendLedgerEntry(
    runtimeEnv.backendLedgerPath,
    (entry) => entry.kind === "terminalStaleGuardStaleTerminal",
    options,
  );
  const staleTerminalEntry = staleTerminalLedger.entry;
  result.terminalStaleGuardStaleTerminal = sanitizeJson({
    currentTurnId: staleTerminalEntry.currentTurnId,
    staleTurnId: staleTerminalEntry.staleTurnId,
    staleEventType: staleTerminalEntry.staleEventType,
    staleDoneText: staleTerminalEntry.staleDoneText,
    staleTurnDiffersFromCurrent:
      Boolean(staleTerminalEntry.currentTurnId) &&
      Boolean(staleTerminalEntry.staleTurnId) &&
      staleTerminalEntry.staleTurnId !== staleTerminalEntry.currentTurnId,
    ledgerCount: staleTerminalLedger.ledger.length,
  });

  return result;
}
