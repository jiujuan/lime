import { LIVE_TAIL_COMMIT_PROMPT } from "./claw-chat-current-fixture-constants.mjs";

function resizeSnapshots(summary) {
  const snapshots = summary.electronResizeReflowLayout?.snapshots ?? {};
  return [snapshots.wide, snapshots.compact, snapshots.restored].filter(
    Boolean,
  );
}

export function buildElectronResizeReflowScenarioAssertions({
  electronResizeReflowTurnStart,
  summary,
}) {
  const snapshots = resizeSnapshots(summary);
  const layout = summary.electronResizeReflowLayout ?? {};
  const stableActiveSurfaces = new Set(
    snapshots.map((snapshot) => snapshot?.rightSurface?.activeSurface ?? null),
  );

  return {
    electronResizeReflowPromptReachedBackend:
      electronResizeReflowTurnStart?.inputText === LIVE_TAIL_COMMIT_PROMPT,
    guiElectronResizeReflowInputSubmitted:
      summary.electronResizeReflowInputSend?.afterFill
        ?.promptVisibleInTextarea === true &&
      summary.electronResizeReflowInputSend?.clicked?.clicked === true,
    guiElectronResizeReflowCompleted:
      summary.guiElectronResizeReflowCompleted?.hasPrompt === true &&
      (summary.guiElectronResizeReflowCompleted?.hasAssistantSummary === true ||
        summary.guiElectronResizeReflowCompleted?.hasDoneText === true) &&
      summary.guiElectronResizeReflowCompleted?.textareaVisible === true &&
      summary.guiElectronResizeReflowCompleted?.textareaDisabled === false &&
      summary.guiElectronResizeReflowCompleted?.stopButtonVisible === false,
    guiElectronResizeReflowFilesSurfaceOpened:
      Boolean(
        summary.electronResizeReflowFilesSurfaceRequest?.result?.requestId,
      ) &&
      summary.electronResizeReflowFilesSurface?.stable?.activeSurface ===
        "files" &&
      summary.electronResizeReflowFilesSurface?.stable?.rootVisible === true,
    guiElectronResizeReflowViewportSnapshotsCaptured:
      layout.stableViewportCount === 3 &&
      layout.screenshotCount === 3 &&
      snapshots.map((snapshot) => snapshot?.label).join(",") ===
        "wide,compact,restored",
    guiElectronResizeReflowMessageAnchorStable:
      snapshots.length === 3 &&
      snapshots.every(
        (snapshot) =>
          snapshot.hasPrompt === true &&
          snapshot.hasFirstText === true &&
          snapshot.hasOverflowMarker === true &&
          snapshot.hasTableTail === true &&
          snapshot.hasDoneText === true &&
          snapshot.messageAnchorStable === true,
      ),
    guiElectronResizeReflowInputbarAnchored:
      snapshots.length === 3 &&
      snapshots.every(
        (snapshot) =>
          snapshot.inputbarAnchored === true &&
          snapshot.textareaDisabled === false &&
          snapshot.stopButtonVisible === false,
      ),
    guiElectronResizeReflowRightSurfaceStable:
      snapshots.length === 3 &&
      stableActiveSurfaces.size === 1 &&
      stableActiveSurfaces.has("files") &&
      snapshots.every((snapshot) => snapshot.rightSurfaceStable === true),
    guiElectronResizeReflowNoOverlap:
      snapshots.length === 3 &&
      snapshots.every(
        (snapshot) =>
          snapshot.noOverlap === true &&
          snapshot.noTailInputOverlap === true &&
          snapshot.noMessageRightOverlap === true &&
          snapshot.noInputRightOverlap === true,
      ),
    readModelElectronResizeReflowCompleted:
      summary.readModelElectronResizeReflowCompleted?.includesPrompt === true &&
      summary.readModelElectronResizeReflowCompleted?.latestTurnStatus ===
        "completed" &&
      summary.readModelElectronResizeReflowCompleted?.includesFirstText ===
        true &&
      summary.readModelElectronResizeReflowCompleted?.includesOverflowMarker ===
        true &&
      summary.readModelElectronResizeReflowCompleted?.includesTableHeader ===
        true &&
      summary.readModelElectronResizeReflowCompleted?.includesTableTail ===
        true &&
      summary.readModelElectronResizeReflowCompleted?.includesAssistantDone ===
        true,
    backendElectronResizeReflowRecorded:
      summary.electronResizeReflowBackendCompleted?.eventType ===
        "turn.completed" &&
      summary.electronResizeReflowBackendCompleted?.turnId ===
        electronResizeReflowTurnStart?.turnId,
  };
}
