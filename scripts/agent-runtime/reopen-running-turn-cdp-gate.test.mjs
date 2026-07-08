import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readGateFiles() {
  return [
    "package.json",
    "scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function readGateScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
    "utf8",
  );
}

describe("reopen running turn CDP Gate", () => {
  it("is wired as a package smoke entry", () => {
    const content = readGateFiles();

    expect(content).toContain("smoke:reopen-running-turn-cdp-gate");
    expect(content).toContain(
      "node scripts/agent-runtime/reopen-running-turn-cdp-gate.mjs",
    );
  });

  it("claims Gate B controlled fixture only, not live Provider coverage", () => {
    const content = readGateFiles();

    expect(content).toContain("reopen-running-turn-cdp-gate.v1");
    expect(content).toContain("Gate B controlled fixture");
    expect(content).toContain("completedGateB: false");
    expect(content).toContain("completedGateB = true");
    expect(content).toContain("不证明 live Provider");
    expect(content).not.toContain("Gate B skeleton");
    expect(content).not.toContain("passed_skeleton");
    expect(content).not.toContain("not yet prove");
  });

  it("runs one Electron CDP scenario instead of stitching child gates", () => {
    const content = readGateScript();

    expect(content).toContain("chromium.connectOverCDP");
    expect(content).toContain("--remote-debugging-port");
    expect(content).toContain("reloadRendererDocument");
    expect(content).toContain("--presentation-mode");
    expect(content).toContain(
      'const PRESENTATION_MODES = new Set(["foreground", "background"])',
    );
    expect(content).toContain("launchElectronCdpGate");
    expect(content).toContain("createTraceCursor");
    expect(content).toContain("traceMessagesAfterCursor");
    expect(content).toContain("waitForTraceMethodAfter");
    expect(content).not.toContain(
      "const traceCursorBeforeCancel = (await readRendererTrace(page)).length",
    );
    expect(content).not.toContain("agent-session-recovery-cdp-gate.mjs");
    expect(content).not.toContain("claw-chat-current-fixture-smoke.mjs");
    expect(content).not.toContain("runNodeScript");
  });

  it("requires current runtime signals and forbids mock fallbacks", () => {
    const content = readGateScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_TURN_START");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_THREAD_RESUME");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_TURN_CANCEL");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_READ");
    expect(content).toContain("APP_SERVER_METHOD_SESSION_LIST");
    expect(content).toContain("APP_SERVER_BACKEND_MODE=mock");
    expect(content).toContain("mockPriorityCommands");
    expect(content).toContain("defaultMocks");
    expect(content).toContain("invokeMockOnly");
    expect(content).toContain("legacy agent_runtime_* production truth");
  });

  it("does not depend on bounded final trace tail for turn lifecycle assertions", () => {
    const content = readGateScript();

    expect(content).toContain("summarizeTurnStartEvidence");
    expect(content).toContain("summary.turnStartEvidence");
    expect(content).toContain("guiTraceMatched");
    expect(content).toContain("backendLedgerMatched");
    expect(content).toContain("readRendererTraceFromPageRef");
    expect(content).toContain("isClosedPageError");
    expect(content).toContain("hasSuccessfulTraceEvidence");
    expect(
      fs.readFileSync(
        "scripts/agent-runtime/claw-chat-current-fixture-gui-actions.mjs",
        "utf8",
      ),
    ).toContain("transport: entry.transport");
    expect(content).not.toContain(
      "turnStartSeen: methods.has(APP_SERVER_METHOD_SESSION_TURN_START)",
    );
    expect(content).not.toContain(
      "threadResumeSeen: methods.has(APP_SERVER_METHOD_SESSION_THREAD_RESUME)",
    );
    expect(content).not.toContain(
      "turnCancelSeen: methods.has(APP_SERVER_METHOD_SESSION_TURN_CANCEL)",
    );
  });

  it("asserts same-turn running and idle UI consistency across main/sidebar/inputbar", () => {
    const content = readGateFiles();

    expect(content).toContain("sameActiveTurn");
    expect(content).toContain("sameTurnAfterReopen");
    expect(content).toContain("sameTurnAfterReload");
    expect(content).toContain("waitForGuiRunningConsistency");
    expect(content).toContain("waitForGuiIdleConsistency");
    expect(content).toContain("app-sidebar-conversation-runtime-status");
    expect(content).toContain("inputbarHasStopButton");
    expect(content).toContain("sidebarStatus === \"running\"");
    expect(content).toContain("canceledEventAfterReopen");
    expect(content).toContain("canceledEventAfterReload");
  });

  it("covers home background recovery before opening the session detail", () => {
    const content = readGateScript();

    expect(content).toContain("navigateGuiToNewTaskHome");
    expect(content).toContain("waitForGuiHomeBackgroundRecovery");
    expect(content).toContain("sampleGuiHomeBackgroundRecoveryState");
    expect(content).toContain("isTransientGuiSamplingError");
    expect(content).toContain("Execution context was destroyed");
    expect(content).toContain("home-start-surface");
    expect(content).toContain("home-unfinished-session-card");
    expect(content).toContain("homeRecoveryCardVisible");
    expect(content).toContain("homeRecoveryCardStatus ===");
    expect(content).toContain("homeRecoveryCardTitleFound");
    expect(content).toContain("openFixtureSessionFromHomeRecoveryCard");
    expect(content).toContain("homeRecoveryCardOpenedAfterReopen");
    expect(content).toContain("app-sidebar-home-button");
    expect(content).toContain("homeBackgroundBeforeReopen");
    expect(content).toContain("homeBackgroundAfterReopen");
    expect(content).toContain("homeBackgroundAfterReload");
    expect(content).toContain("activeDetailBoundToSession");
    expect(content).toContain("sidebarStatus === \"running\"");
    expect(content).toContain("homeBackgroundAfterReopen:");
    expect(content).toContain("presentationModeKnown");
  });

  it("can prove multiple unfinished sessions without stealing the home recovery focus", () => {
    const content = readGateScript();

    expect(content).toContain("--multi-running-sessions");
    expect(content).toContain("multiRunningSessions");
    expect(content).toContain("MULTI_RUNNING_SECONDARY_SESSION_ID");
    expect(content).toContain("createSecondaryRunningSession");
    expect(content).toContain("waitForGuiSidebarSessionsRunning");
    expect(content).toContain(
      "multiRunningPrimaryAndSecondarySidebarBeforeReopen",
    );
    expect(content).toContain(
      "multiRunningPrimaryAndSecondarySidebarAfterReopen",
    );
    expect(content).toContain("multiRunningHomeKeepsPrimaryRecoveryCard");
    expect(content).toContain(
      "multiRunningSecondaryStillRunningAfterPrimaryCancel",
    );
    expect(content).toContain("multiRunningSecondaryCleanupCanceled");
    expect(content).toContain("cancelSecondaryRunningSession");
  });

  it("keeps restart reopen mode as a cold-start recovery skeleton with bounded claims", () => {
    const content = readGateScript();

    expect(content).toContain('reopenMode: "reload"');
    expect(content).toContain('const REOPEN_MODES = new Set(["reload", "restart"])');
    expect(content).toContain("--reopen-mode");
    expect(content).toContain('options.reopenMode === "restart"');
    expect(content).toContain("closeElectronCdpGate");
    expect(content).toContain("restart-electron:launch");
    expect(content).toContain("rendererSnapshotAfterReopen");
    expect(content).toContain("guiRunningAfterReopen");
    expect(content).toContain(
      "不声明 external backend 子进程跨 Electron/App Server 重启存活",
    );
    expect(content).toContain("threadResumeNotRequiredForRestart");
    expect(content).toContain(
      "summary.threadResumeTraceAfterReopen?.skipped === true",
    );
    expect(content).toContain("threadResumeSeen: threadResumeSeenAfterReopen");
  });
});
