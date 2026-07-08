import {
  APP_SERVER_METHOD_SESSION_THREAD_RESUME,
  APP_SERVER_METHOD_SESSION_TURN_CANCEL,
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_RICH_RESTORE_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";

export function buildPendingSteerPopFrontResumeScenarioAssertions(context) {
  const {
    appServerRequestMethods,
    inputbarPendingSteerActiveTurnStart,
    summary,
  } = context;
  const guiHydrated =
    summary.inputbarPendingSteerPopFrontGuiHydrated?.queuedPanel ?? {};
  const readModelAfterResume =
    summary.inputbarPendingSteerPopFrontReadModelAfterResume ?? {};

  return {
    inputbarPendingSteerActivePromptReachedBackend:
      inputbarPendingSteerActiveTurnStart?.inputText ===
      INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
    inputbarPendingSteerActiveOutputVisible:
      summary.inputbarPendingSteerActiveStreaming?.stopButtonVisible === true &&
      summary.inputbarPendingSteerActiveStreaming?.bodyText?.includes(
        INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
      ) === true,
    inputbarPendingSteerMultipleQueued:
      summary.inputbarPendingSteerQueuedReadModel?.queue?.multipleQueued ===
      true,
    inputbarPendingSteerQueueOrderPreserved:
      summary.inputbarPendingSteerQueuedReadModel?.queue?.orderPreserved ===
      true,
    inputbarPendingSteerPopFrontGuiPromoteClicked:
      summary.inputbarPendingSteerPopFrontGuiPromote?.clicked?.clicked === true,
    inputbarPendingSteerPopFrontUsedCurrentCancel:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_CANCEL) &&
      summary.inputbarPendingSteerPopFrontBackendCancel?.turnId ===
        inputbarPendingSteerActiveTurnStart?.turnId,
    inputbarPendingSteerPopFrontBackendCanceled:
      summary.inputbarPendingSteerPopFrontBackendCancel?.turnId ===
      inputbarPendingSteerActiveTurnStart?.turnId,
    inputbarPendingSteerPopFrontUsedCurrentResume:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_THREAD_RESUME) &&
      summary.inputbarPendingSteerPopFrontRichBackendTurnStart?.inputText?.includes(
        INPUTBAR_RICH_RESTORE_PROMPT,
      ) === true &&
      readModelAfterResume.richPromptStillQueued === false,
    inputbarPendingSteerPopFrontRichStartedBackend:
      summary.inputbarPendingSteerPopFrontRichBackendTurnStart?.inputText?.includes(
        INPUTBAR_RICH_RESTORE_PROMPT,
      ) === true,
    inputbarPendingSteerPopFrontRichDequeued:
      readModelAfterResume.richPromptStillQueued === false &&
      readModelAfterResume.richPromptInReadModel === true,
    inputbarPendingSteerPopFrontSecondReindexed:
      readModelAfterResume.secondPromptQueued === true &&
      readModelAfterResume.secondPositionZero === true,
    inputbarPendingSteerPopFrontGuiHydratedSecondQueue:
      guiHydrated.panelVisible === true &&
      guiHydrated.rowCount === 1 &&
      guiHydrated.secondQueued === true &&
      guiHydrated.richQueued === false &&
      guiHydrated.secondPosition === "0",
    inputbarPendingSteerPopFrontGuiInputReady:
      guiHydrated.textareaVisible === true &&
      guiHydrated.textareaDisabled === false,
  };
}
