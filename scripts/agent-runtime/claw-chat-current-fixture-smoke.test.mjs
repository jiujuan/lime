import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { containsForbiddenTraceEvidenceFragment } from "./claw-chat-current-fixture-agent-ui-trace.mjs";
import {
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
  HOME_HOTPATH_GREETING_SCENARIO,
  HOME_HOTPATH_SCENARIO,
} from "./claw-chat-current-fixture-constants.mjs";
import { resolveGateBExpectedIdentity } from "./claw-chat-current-fixture-assertion-context.mjs";
import {
  buildCanonicalToolItem,
  summarizeRequestInput,
} from "./claw-chat-current-fixture-backend-script.mjs";
import {
  summarizeApprovalDecisionReadModel,
  summarizeApprovalSessionCacheReadModel,
} from "./claw-chat-current-fixture-approval-read-model.mjs";
import {
  buildApprovalRequestDecisionScenarioAssertions,
  buildApprovalRequestResumeScenarioAssertions,
} from "./claw-chat-current-fixture-approval-assertions.mjs";
import { isRightSurfaceSnapshotReady } from "./claw-chat-current-fixture-right-surface-visual.mjs";
import { registerImageContentSmokeGuards } from "./claw-chat-current-fixture-smoke-domain-guards.mjs";
import { registerSkillsRuntimeSmokeGuards } from "./claw-chat-current-fixture-smoke-skills-runtime-guards.mjs";
import {
  buildSoulStyleTranscriptGoldenReport,
  SOUL_STYLE_TRANSCRIPT_GOLDENS,
  SOUL_STYLE_TRANSCRIPT_SURFACES,
} from "./claw-chat-current-fixture-soul-style-transcript-golden.mjs";
import { SOUL_STYLE_FIXTURE_PROFILE_IDS } from "./claw-chat-current-fixture-soul-style.mjs";
import { analyzeHomeHotpathSubmitToConversationSamples } from "./claw-chat-current-fixture-home-hotpath.mjs";

const fixtureSourceFiles = [
  "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
  "scripts/lib/electron-fixture-build.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-backend-tool-skill-events.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-backend-ledger.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-rpc.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-agent-ui-trace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-read-model-waits.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-session.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gui-input-modes.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gui-tool-waits.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-resume.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-gui.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-read-model.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-trace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-approval-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-media-reference.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-image-command-workflow-read.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-skills-workspace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-inputbar-rich-restore.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-inputbar-pending-steer.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-home-hotpath.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-pending-steer-gui-actions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-pending-steer-read-model.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-flow.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-terminal-after-answer.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-terminal-stale-guard.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-live-tail.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-resize-reflow.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-web-tools-rendering.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-right-surface-visual.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-article-workspace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-inline-image-article-workspace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-worker-dogfood.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-workspace-patches.mjs",
  "scripts/lib/content-factory-host-generation-fixture.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-common-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-pending-steer-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-resize-reflow-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-runtime-surface-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-terminal-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-web-tools-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-soul-style-transcript-golden.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-soul-style.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-not-applicable-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertion-context.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gate-b-contract.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-gate-b-execution-evidence.mjs",
];

function readSmokeScript() {
  return fixtureSourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function removeContentFactoryForbiddenMarkerGuard(content) {
  return content.replace(
    /const (?:FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS|forbiddenArticleTemplateMarkers) = \[[\s\S]*?\];/g,
    "",
  );
}

function readCurrentFixtureRegressionSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/current-fixture-regression-smoke.mjs",
    "utf8",
  );
}

function readExpertActionsScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-expert-actions.mjs",
    "utf8",
  );
}

function readGuiActionsScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-gui-actions.mjs",
    "utf8",
  );
}

function readFixtureUtilsScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-utils.mjs",
    "utf8",
  );
}

describe("claw chat current Electron fixture smoke guard", () => {
  it.each([HOME_HOTPATH_SCENARIO, HOME_HOTPATH_GREETING_SCENARIO])(
    "%s Gate B identity binds to the home submission turn",
    (scenario) => {
      const identity = resolveGateBExpectedIdentity({
        summary: {
          sessionId: "precreated-session",
          threadId: "precreated-thread",
          homeHotpath: {
            backendTurnStart: {
              sessionId: "home-session",
              turnId: "home-turn",
            },
          },
        },
        options: { scenario },
        backendLedger: [
          {
            kind: "turnStart",
            sessionId: "precreated-session",
            threadId: "precreated-thread",
            turnId: "precreated-turn",
          },
          {
            kind: "turnStart",
            sessionId: "other-session",
            threadId: "other-thread",
            turnId: "other-turn",
          },
          {
            kind: "turnStart",
            sessionId: "home-session",
            threadId: null,
            turnId: "home-turn",
          },
          {
            kind: "turnStart",
            sessionId: "latest-session",
            threadId: "latest-thread",
            turnId: "latest-turn",
          },
        ],
        appServerRequests: [
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "different-session",
              threadId: "wrong-thread",
              turns: [{ turnId: "home-turn" }],
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "home-session",
              threadId: "other-turn-thread",
              turns: [{ turnId: "other-turn" }],
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "home-session",
              threadId: null,
              turns: [{ turnId: "home-turn" }],
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "home-session",
              threadId: "home-thread",
              turns: [{ turnId: "home-turn" }],
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: "latest-session" },
            response: {
              sessionId: "latest-session",
              threadId: "latest-thread",
              turns: [{ turnId: "latest-turn" }],
            },
          },
        ],
      });

      expect(identity).toEqual({
        sessionId: "home-session",
        threadId: "home-thread",
        turnId: "home-turn",
      });
    },
  );

  it("keeps the precreated Gate B identity for non-home scenarios", () => {
    expect(
      resolveGateBExpectedIdentity({
        summary: {
          sessionId: "precreated-session",
          threadId: "precreated-thread",
        },
        options: { scenario: "complete" },
        appServerRequests: [],
        backendLedger: [
          {
            kind: "turnStart",
            sessionId: "runtime-session",
            threadId: "runtime-thread",
            turnId: "runtime-turn",
          },
        ],
      }),
    ).toEqual({
      sessionId: "precreated-session",
      threadId: "precreated-thread",
    });
  });

  it("binds skills runtime Gate B identity to the final manual-enable turn", () => {
    expect(
      resolveGateBExpectedIdentity({
        summary: {
          sessionId: "precreated-session",
          threadId: "precreated-thread",
          manualEnableSkillsRuntimeTurnStart: {
            backend: {
              sessionId: "skills-session",
              turnId: "skills-turn",
            },
          },
        },
        options: { scenario: "skills-runtime" },
        backendLedger: [
          {
            kind: "turnStart",
            sessionId: "skills-session",
            turnId: "skills-turn",
          },
        ],
        appServerRequests: [
          {
            method: "agentSession/read",
            params: { sessionId: "skills-session" },
            response: {
              sessionId: "skills-session",
              threadId: "skills-thread",
              turns: [{ turnId: "skills-turn" }],
            },
          },
        ],
      }),
    ).toEqual({
      sessionId: "skills-session",
      threadId: "skills-thread",
      turnId: "skills-turn",
    });
  });

  it("binds content factory Gate B identity to the App Server worker turn", () => {
    expect(
      resolveGateBExpectedIdentity({
        summary: {
          contentFactoryArticleWorkspaceWorkerTurnStart: {
            turnId: "worker-turn",
          },
        },
        options: { scenario: "content-factory-article-workspace" },
        backendLedger: [],
        appServerRequests: [
          {
            method: "agentSession/turn/start",
            params: {
              sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
              turnId: "worker-turn",
            },
            response: {
              sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
              threadId: "content-thread",
              turnId: "worker-turn",
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID },
            response: {
              sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
              threadId: "content-thread",
              turns: [{ turnId: "worker-turn" }],
            },
          },
        ],
      }),
    ).toEqual({
      sessionId: CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
      threadId: "content-thread",
      turnId: "worker-turn",
    });
  });

  it("fails closed when the home submission turn has no matching ledger identity", () => {
    expect(() =>
      resolveGateBExpectedIdentity({
        summary: {
          sessionId: "precreated-session",
          threadId: "precreated-thread",
          homeHotpath: {
            backendTurnStart: {
              sessionId: "home-session",
              turnId: "home-turn",
            },
          },
        },
        options: { scenario: HOME_HOTPATH_SCENARIO },
        appServerRequests: [
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "home-session",
              threadId: "home-thread",
              turns: [{ turnId: "home-turn" }],
            },
          },
        ],
        backendLedger: [
          {
            kind: "turnStart",
            sessionId: "home-session",
            threadId: "wrong-thread",
            turnId: "different-turn",
          },
          {
            kind: "turnStart",
            sessionId: "different-session",
            threadId: "wrong-thread",
            turnId: "home-turn",
          },
        ],
      }),
    ).toThrow(/matching backend turnStart and agentSession\/read evidence/);
  });

  it("fails closed when no session read binds the home session and turn", () => {
    expect(() =>
      resolveGateBExpectedIdentity({
        summary: {
          homeHotpath: {
            backendTurnStart: {
              sessionId: "home-session",
              turnId: "home-turn",
            },
          },
        },
        options: { scenario: HOME_HOTPATH_SCENARIO },
        backendLedger: [
          {
            kind: "turnStart",
            sessionId: "home-session",
            threadId: null,
            turnId: "home-turn",
          },
        ],
        appServerRequests: [
          {
            method: "agentSession/read",
            params: { sessionId: "home-session" },
            response: {
              sessionId: "home-session",
              threadId: "wrong-thread",
              turns: [{ turnId: "different-turn" }],
            },
          },
          {
            method: "agentSession/read",
            params: { sessionId: "different-session" },
            response: {
              sessionId: "home-session",
              threadId: "wrong-thread",
              turns: [{ turnId: "home-turn" }],
            },
          },
        ],
      }),
    ).toThrow(/matching backend turnStart and agentSession\/read evidence/);
  });

  it("binds Gate B artifacts to one run before assertions", () => {
    const content = readSmokeScript();
    const screenshotIndex = content.indexOf("path: screenshotPath");
    const assertionIndex = content.indexOf(
      "const assertionReport = buildFixtureAssertionReport({",
    );

    expect(content).toContain("LIME_GATE_RUN_ID");
    expect(content).toContain('arg === "--run-id"');
    expect(content).toContain("runId: options.runId");
    expect(content).toContain("screenshotCaptured");
    expect(content).toContain("collectGateBGuiEvidence");
    expect(content).toContain("identityConsistent");
    expect(content).toContain("explicitTerminalOrPending");
    expect(screenshotIndex).toBeGreaterThan(-1);
    expect(assertionIndex).toBeGreaterThan(screenshotIndex);
  });

  it("首页首发采样只允许从完整首页单向切换到 conversation", () => {
    const mainAreaBounds = { left: 294, top: 8, width: 1134, height: 980 };
    const homeSample = (elapsedMs) => ({
      elapsedMs,
      hasConnectedComposer: true,
      hasEmptyConversationText: false,
      hasEmptyStateFirstScreen: true,
      hasMessageList: false,
      hasNoAvailableModelText: false,
      hasTaskCenterHomeText: true,
      imperativePendingShellCount: 0,
      mainAreaBounds,
      promptInBody: false,
    });
    const conversationSample = (elapsedMs) => ({
      elapsedMs,
      hasConnectedComposer: false,
      hasEmptyConversationText: false,
      hasEmptyStateFirstScreen: false,
      hasMessageList: true,
      hasNoAvailableModelText: false,
      hasTaskCenterHomeText: false,
      imperativePendingShellCount: 0,
      mainAreaBounds,
      promptInBody: true,
    });

    const stable = analyzeHomeHotpathSubmitToConversationSamples(
      [
        homeSample(16),
        homeSample(32),
        conversationSample(48),
        conversationSample(64),
      ],
      mainAreaBounds,
    );
    expect(stable).toMatchObject({
      stable: true,
      conversationStartedAtMs: 48,
      beforeConversationSampleCount: 2,
      conversationSampleCount: 2,
      unstableCount: 0,
    });

    const returnedHome = analyzeHomeHotpathSubmitToConversationSamples(
      [homeSample(16), conversationSample(32), homeSample(48)],
      mainAreaBounds,
    );
    expect(returnedHome.stable).toBe(false);
    expect(returnedHome.firstUnstableConversationSamples).toHaveLength(1);

    const blankIntermediate = analyzeHomeHotpathSubmitToConversationSamples(
      [
        homeSample(16),
        {
          ...homeSample(32),
          hasConnectedComposer: false,
          hasEmptyStateFirstScreen: false,
          hasTaskCenterHomeText: false,
        },
        conversationSample(48),
      ],
      mainAreaBounds,
    );
    expect(blankIntermediate.stable).toBe(false);
    expect(
      blankIntermediate.firstInvalidBeforeConversationSamples,
    ).toHaveLength(1);
  });

  it("drives the real Electron Desktop Host bridge and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron, chromium }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("--cdp-port");
    expect(content).toContain("--remote-debugging-port=");
    expect(content).toContain("chromium.connectOverCDP");
    expect(content).toContain("findElectronCdpPage");
    expect(content).toContain("LIME_ELECTRON_REMOTE_DEBUGGING_PORT");
    expect(content).toContain("ensureElectronFixtureBuild");
    expect(content).toContain("../lib/electron-fixture-build.mjs");
    expect(content).toContain("rebuilding stale packaged fixture assets");
    expect(content).toContain("buildStaleElectronFixtureSegments");
    expect(content).toContain("waitForAppUrlReady");
    expect(content).toContain('logStage("wait-app-url")');
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain('"initialize"');
    expect(content).toContain('"initialized"');
  });

  it("uses GUI input to submit the news prompt instead of calling turn/start directly", () => {
    const content = readSmokeScript();
    const guiActionsContent = readGuiActionsScript();
    const regressionContent = readCurrentFixtureRegressionSmokeScript();

    expect(guiActionsContent).toContain('textarea[name="agent-chat-message"]');
    expect(content + guiActionsContent).toContain("waitForInputReady");
    expect(guiActionsContent).toContain("waitForSendButtonReady");
    expect(content).toContain("sendNewsPromptFromGui");
    expect(guiActionsContent).toContain("setControlledTextareaValue");
    expect(guiActionsContent).toContain('new InputEvent("input"');
    expect(content).toContain("整理今天的国际新闻");
    expect(content).toContain("promptVisibleInTextarea");
    expect(content).toContain("hasPrompt");
    expect(content).toContain('[data-testid="message-turn-group"]');
    expect(content).toContain("assistantScopeText");
    expect(content).toContain("completionScope");
    expect(content).toContain("assistantScopeDedupeGuardHits");
    expect(content).toContain("scenario.disallowedVisibleTexts");
    expect(content).toContain("今日国际新闻简要整理");
    expect(content).toContain("CLAW_NEWS_FIXTURE_DONE");
    expect(content).toContain("guiInputRemainsReady");
    expect(content).toContain("guiNotStuckStreaming");
    expect(content).toContain("noEpochFallbackTitle");
    expect(content).toContain("agentUiPerformanceTraceEvidenceAvailable");
    expect(content).toContain(
      "agentUiPerformanceTraceSeparatesProviderAndClient",
    );
    expect(content).toContain(
      "agentUiPerformanceTraceHasFirstVisibleTextPaint",
    );
    expect(content).toContain("hasFirstVisibleOutputMs");
    expect(content).toContain("hasHomeInputToFirstTextPaintMs");
    expect(content).toContain("hasStreamRequestStartToFirstTextPaintMs");
    expect(content).toContain("hasSubmitAcceptedToFirstTextPaintMs");
    expect(content).toContain("hasFirstTextDeltaToFirstTextPaintMs");
    expect(content).toContain("agentUiPerformanceTraceNoRawPayload");
    expect(content).toContain("collectAppServerTraceEvidence");
    expect(content).toContain("appServerTraceEvidenceAvailable");
    expect(content).toContain("appServerTraceEvidenceUsesCurrentMethods");
    expect(content).toContain("appServerTraceEvidenceHasW3cCarrier");
    expect(content).toContain("appServerTraceEvidenceExportedSummaryOnly");
    expect(content).toContain(
      "appServerTraceSupportBundleOptInUsesCurrentMethod",
    );
    expect(content).toContain("appServerTraceSupportBundleOptInSummaryOnly");
    expect(content).toContain('"diagnostics/supportBundle/export"');
    expect(content).toContain("includeTraceExport");
    expect(content).toContain("LIME_SUPPORT_BUNDLE_OUTPUT_DIR");
    expect(content).toContain('"diagnostics/trace/export"');
    expect(content).toContain("recordAgentUiPerformanceTraceEvidence");
    expect(content).toContain("agentUiPerformanceTraceLatest");
    expect(content).toContain("traceEvidenceHasProviderAndClient(evidence)");
    expect(content).toContain("HOME_HOTPATH_SCENARIO");
    expect(content).toContain('"home-hotpath"');
    expect(content).toContain("HOME_HOTPATH_GREETING_SCENARIO");
    expect(content).toContain('"home-hotpath-greeting"');
    expect(content).toContain("GREETING_PROMPT");
    expect(content).toContain("GREETING_DONE_TEXT");
    expect(content).toContain("GREETING_SUMMARY_TEXT");
    expect(content).toContain("runHomeHotpathScenario");
    expect(content).toContain("scenarioConfig");
    expect(content).toContain("allowTaskCenterHomeInput");
    expect(content).toContain("homeHotpathNoBlankConversationAfterSubmit");
    expect(content).toContain("collectAfterFillStability");
    expect(content).toContain("afterFillStability");
    expect(content).toContain("postCompletionStability");
    expect(content).toContain("homeHotpathNoTransientFallbackAfterInputFill");
    expect(content).toContain("homeHotpathNoPostCompletionRefreshFlicker");
    expect(content).toContain("homeHotpathNoImperativePendingShell");
    expect(content).toContain("homeHotpathMainAreaBoundsStable");
    expect(content).toContain("data-home-hotpath-pending-shell");
    expect(content).toContain("workspace-main-area");
    expect(content).toContain("HOME_HOTPATH_BLOCKED_PRE_TURN_METHODS");
    expect(content).toContain("blockedAuxiliaryMethodsBeforeTurnStart");
    expect(content).toContain("homeHotpathPreTurnTraceWindowAvailable");
    expect(content).toContain("homeHotpathNoAuxiliaryAppServerBeforeTurnStart");
    expect(content).toContain('"sessionFile/getOrCreate"');
    expect(content).toContain('"workspaceRightSurface/pending/list"');
    expect(content).toMatch(
      /HOME_HOTPATH_BLOCKED_PRE_TURN_METHODS[\s\S]*"modelPreferences\/list"[\s\S]*"modelSyncState\/read"/,
    );
    expect(content).toContain("homeHotpathPendingPreviewPaintWithinBudget");
    expect(content).toContain("HOME_HOTPATH_PENDING_PREVIEW_PAINT_BUDGET_MS");
    expect(content).toContain("HOME_HOTPATH_SEND_DISPATCH_BUDGET_MS");
    expect(content).toContain("HOME_HOTPATH_SUBMIT_ACCEPTED_BUDGET_MS");
    expect(content).toContain(
      "const HOME_HOTPATH_SUBMIT_ACCEPTED_BUDGET_MS = 1800;",
    );
    expect(content).toContain("HOME_HOTPATH_TEXT_DELTA_TO_PAINT_BUDGET_MS");
    expect(content).toContain("homeHotpathSendDispatchWithinBudget");
    expect(content).toContain("homeHotpathTraceHasSubmitAccepted");
    expect(content).toContain("homeHotpathSubmitAcceptedWithinBudget");
    expect(content).toContain("homeHotpathTextDeltaToPaintWithinBudget");
    expect(content).toContain("inputbarTriggerToPendingPreviewPaintMs");
    expect(content).toContain("homeInputToPendingPreviewPaintMs");
    expect(content).toContain("inputbarTriggerToSubmitAcceptedMs");
    expect(content).toContain("homeInputToSubmitAcceptedMs");
    expect(content).toContain("sendDispatchToSubmitAcceptedMs");
    expect(content).toContain("firstTextDeltaToFirstTextPaintMs");
    expect(content).toContain("isGreetingPrompt");
    expect(content).toContain("CLAW_GREETING_FIXTURE_DONE");
    expect(regressionContent).toContain("home-hotpath-greeting");
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-home-hotpath-greeting-regression",
    );
  });

  it("passes home hotpath text matchers into page.evaluate instead of closing over Node imports", () => {
    const content = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-home-hotpath.mjs",
      "utf8",
    );
    const snapshotFunction = content.slice(
      content.indexOf("function readHomeHotpathSnapshot"),
      content.indexOf("async function waitForHomeHotpathReady"),
    );

    expect(content).toContain("HOME_HOTPATH_MATCHERS");
    expect(content).toContain("prompt: NEWS_PROMPT");
    expect(content).toContain("doneText: ASSISTANT_DONE_TEXT");
    expect(content).toContain("normalizeHomeHotpathScenarioConfig");
    expect(content).toContain("config.prompt");
    expect(content).toContain("config.doneText");
    expect(content).toContain("config.summaryText");
    expect(content).toContain(
      "promptInBody: prompt ? bodyText.includes(prompt) : false",
    );
    expect(content).toContain(
      "doneInBody: doneText ? bodyText.includes(doneText) : false",
    );
    expect(content).toContain("readHomeHotpathSnapshot");
    expect(content).toContain("HOME_HOTPATH_MATCHERS");
    expect(snapshotFunction).not.toContain("NEWS_PROMPT");
    expect(snapshotFunction).not.toContain("ASSISTANT_DONE_TEXT");
  });

  it("does not run default news completion waits after scenario-owned flows complete", () => {
    const content = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs",
      "utf8",
    );

    expect(content).toContain(
      "options.scenario === ELECTRON_RESIZE_REFLOW_SCENARIO",
    );
    expect(content).toContain(
      "options.scenario !== ELECTRON_RESIZE_REFLOW_SCENARIO",
    );
    expect(content).toContain("options.scenario === HOME_HOTPATH_SCENARIO");
    expect(content).toContain(
      "options.scenario === HOME_HOTPATH_GREETING_SCENARIO",
    );
    expect(content).toContain("!isHomeHotpathScenario");
    expect(content.indexOf("runElectronResizeReflowScenario")).toBeLessThan(
      content.indexOf("wait-gui-completed"),
    );
    expect(content.indexOf("runHomeHotpathScenario")).toBeLessThan(
      content.indexOf("wait-gui-completed"),
    );
  });

  it("does not classify redacted task ids as leaked API keys in trace evidence", () => {
    expect(
      containsForbiddenTraceEvidenceFragment({
        sessionId: "task-[redacted]",
        source: "task-[redacted]",
      }),
    ).toBe(false);
    expect(
      containsForbiddenTraceEvidenceFragment({
        authorization: "Bearer [redacted]",
      }),
    ).toBe(true);
    expect(
      containsForbiddenTraceEvidenceFragment({
        token: "sk-1234567890abcdef",
      }),
    ).toBe(true);
  });

  it("uses a local external fixture backend and current Agent Session methods", () => {
    const content = readSmokeScript();

    expect(content).toContain('"app_server_drain_events"');
    expect(content).toContain('"agentSession/event"');
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "runtime"');
    expect(content).toContain("resolveScenarioBackendEnv");
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("writeFixtureBackend");
    expect(content).toContain('const FIXTURE_PROVIDER = "fixture-provider"');
    expect(content).toContain('const FIXTURE_MODEL = "fixture-model"');
    expect(content).toContain('"agentSession/start"');
    expect(content).toContain('"agentSession/update"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain('"agentSession/turn/cancel"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"agentSession/list"');
    expect(content).toContain('"workspace/default/ensure"');
    expect(content).toContain('kind === "turnStart"');
    expect(content).toContain('kind === "turnCancel"');
    expect(content).toContain('type: "message.delta"');
    expect(content).toContain('type: "message.completed"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).toContain('type: "turn.canceled"');
    expect(content).not.toContain('type: "turn.final_done"');
  });

  it("clears Electron renderer cache for packaged file fixture runs", () => {
    const content = readSmokeScript();

    expect(content).toContain('LIME_ELECTRON_CLEAR_RENDERER_CACHE: "1"');
    expect(content).not.toContain('LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0"');
  });

  it("covers stream parser completed full-text dedupe in the default Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("streamParserCompletedFullTextObserved");
    expect(content).toContain("guiStreamParserNoDuplicateFinalText");
    expect(content).toContain("readModelStreamParserNoDuplicateFinalText");
    expect(content).toContain("STREAM_PARSER_BOUNDARY_DEDUPE_GUARDS");
    expect(content).toContain("message.completed");
    expect(content).toContain("flattenBackendEmitTypesForPrompt");
    expect(content).toContain("includesOrderedEventTypes");
  });

  it("uses a local image provider stub for @配图 fixture execution", () => {
    const content = readSmokeScript();

    expect(content).toContain("startImageProviderFixtureServer");
    expect(content).toContain("LOCAL_IMAGE_SERVER_API_KEY");
    expect(content).toContain("imageProviderFixtureServer.baseUrl");
    expect(content).toContain("localImageServerApiKey");
    expect(content).toContain("/v1/images/generations");
    expect(content).toContain("IMAGE_PROVIDER_FIXTURE_DATA_URL");
    expect(content).toContain("ADAAAAAbCAMAAAANt/x");
    expect(content).not.toContain("AAAAEAAAABCAQAAAC1HAw");
  });

  it("proves agentSession/event notifications align with the same turn read model", () => {
    const content = readSmokeScript();

    expect(content).toContain("runEventReadProbe");
    expect(content).toContain("waitForAgentSessionEventsForTurn");
    expect(content).toContain("waitForSessionReadContainsTurn");
    expect(content).toContain("drainAppServerEventsFromPage");
    expect(content).toContain("EVENT_READ_PROBE_TURN_ID");
    expect(content).toContain("EVENT_READ_PROBE_DONE_TEXT");
    expect(content).toContain("EVENT_READ_PROBE_TOOL_CALL_ID");
    expect(content).toContain('const EVENT_READ_PROBE_TOOL_NAME = "WebFetch"');
    expect(content).toContain("EVENT_READ_PROBE_TOOL_OUTPUT");
    expect(content).toContain('type: "item.started"');
    expect(content).toContain('type: "item.completed"');
    expect(content).toContain("hasToolStarted");
    expect(content).toContain("hasToolResult");
    expect(content).toContain("collectReadModelToolCalls");
    expect(content).toContain("findReadModelToolCall");
    expect(content).toContain("eventReadProbeObserved");
    expect(content).toContain("readModelEventReadAligned");
    expect(content).toContain("readModelToolCallAligned");
    expect(content).toContain("containsToolOutput");
    expect(content).toContain("agentSession/event 与 read model 同 turn 对齐");
  });

  it("keeps scenario-specific assertions out of unrelated evidence", () => {
    const content = readSmokeScript();

    expect(content).toContain("const commonAssertions = {");
    expect(content).toContain("const scenarioAssertions =");
    expect(content).toContain("const notApplicableAssertions =");
    expect(content).toContain(
      "summary.commonAssertions = assertionReport.commonAssertions",
    );
    expect(content).toContain(
      "summary.scenarioAssertions = assertionReport.scenarioAssertions",
    );
    expect(content).toContain(
      "summary.notApplicableAssertions = assertionReport.notApplicableAssertions",
    );
    expect(content).toContain('"readModelCanceled"');
    expect(content).toContain('"eventReadProbeObserved"');
    expect(content).toContain('"readModelToolCallAligned"');
    expect(content).toContain("isCancelThenContinueScenario");
    expect(content).toContain("hasCancelPhase");
    expect(content).toContain("continuePromptReachedBackend");
    expect(content).toContain("backendRecordedCancelThenContinue");
  });

  it("covers approval decline and cancel decision semantics through current action/respond", () => {
    const content = readSmokeScript();
    const backendScript = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs",
      "utf8",
    );

    expect(content).toContain("approval-request-resume");
    expect(content).toContain("approval-request-decline");
    expect(content).toContain("approval-request-cancel");
    expect(content).toContain("runApprovalRequestDecisionScenario");
    expect(content).toContain("clickApprovalDecisionButton");
    expect(content).toContain('decision === "cancel"');
    expect(content).toContain('decision === "decline"');
    const approvalBackendEvents = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs",
      "utf8",
    );
    const approvalCancelBranchStart = approvalBackendEvents.indexOf(
      "const completionEvents = approvalCanceled",
    );
    const approvalCancelBranchEnd = approvalBackendEvents.indexOf(
      "\n    : approvalAllowed",
      approvalCancelBranchStart,
    );
    expect(approvalCancelBranchStart).toBeGreaterThanOrEqual(0);
    expect(approvalCancelBranchEnd).toBeGreaterThan(approvalCancelBranchStart);
    const approvalCancelCompletionBranch = approvalBackendEvents.slice(
      approvalCancelBranchStart,
      approvalCancelBranchEnd,
    );
    expect(approvalCancelCompletionBranch).toContain('type: "item.completed"');
    expect(approvalCancelCompletionBranch).toContain('status: "failed"');
    expect(approvalCancelCompletionBranch).toContain('type: "turn.canceled"');
    expect(approvalCancelCompletionBranch).toContain(
      'reason: "approval_request_cancelled"',
    );
    expect(content).toContain("approvalRequestDeclineNoToolExecuted");
    expect(content).toContain("approvalRequestCancelNoToolExecuted");
    expect(content).toContain("readModelApprovalRequestCancelCanceled");
    expect(content).toContain("APPROVAL_REQUEST_DECISION_ASSERTION_KEYS");
    expect(backendScript).toContain(
      "input.request?.runtimeOptions?.runtimeRequest",
    );
    expect(backendScript).not.toContain(
      "input.request?.runtimeOptions?.hostOptions",
    );
  });

  it("requires the resumed turn to clear its own pending approval status", () => {
    const content = readSmokeScript();

    expect(content).toContain("waitForGuiApprovalPromptAbsentAfterSecondTurn");
    expect(content).toContain('[data-testid="message-turn-group"]');
    expect(content).toContain("hasPendingApprovalStatus");
    expect(content).toMatch(
      /hasPendingApprovalStatus:\s*\(secondTurnGroup\?\.innerText \|\| ""\)\.includes\(\s*"待确认"/u,
    );
    expect(content).toContain("snapshot?.hasPendingApprovalStatus === false");
    expect(content).toContain("?.hasPendingApprovalStatus === false");
  });

  it("fails the resumed approval assertion when its turn remains pending", () => {
    const buildAssertions = (hasPendingApprovalStatus) =>
      buildApprovalRequestResumeScenarioAssertions({
        appServerRequestMethods: [],
        approvalRequestResumeTurnStart: null,
        pageText: "",
        summary: {
          guiApprovalRequestResumeSecondNoApprovalPrompt: {
            approvalPromptVisible: false,
            includesRuntimePermissionPrompt: false,
            hasPendingApprovalStatus,
            textareaVisible: true,
            textareaDisabled: false,
          },
        },
      });

    expect(
      buildAssertions(false).approvalRequestResumeSecondNoPendingApproval,
    ).toBe(true);
    expect(
      buildAssertions(true).approvalRequestResumeSecondNoPendingApproval,
    ).toBe(false);
  });

  it("keeps full-access approval out of prompts, records, and action/respond", () => {
    const content = readSmokeScript();
    const regressionContent = readCurrentFixtureRegressionSmokeScript();

    expect(content).toContain("approval-request-full-access");
    expect(content).toContain("APPROVAL_REQUEST_FULL_ACCESS_PROMPT");
    expect(content).toContain("APPROVAL_REQUEST_FULL_ACCESS_RESULT_TEXT");
    expect(content).toContain("APPROVAL_REQUEST_FULL_ACCESS_DONE_TEXT");
    expect(content).toContain("runApprovalRequestFullAccessScenario");
    expect(content).toContain(
      'setInputbarAccessMode(\n    page,\n    options,\n    "full-access"',
    );
    expect(content).toContain("waitForGuiApprovalPromptAbsent");
    expect(content).toContain("approvalPromptVisible");
    expect(content).toContain("approvalRecordCount");
    expect(content).toContain("approvalRecordShape");
    expect(content).toContain("turnStartApprovalPolicy");
    expect(content).toContain("turnStartSandboxPolicy");
    expect(content).toContain('"never"');
    expect(content).toContain('"danger-full-access"');
    expect(content).toContain("approvalRequestFullAccessNoActionRespond");
    expect(content).toContain(
      "approvalRequestFullAccessNoLegacyRuntimeRespond",
    );
    expect(content).toContain("APPROVAL_REQUEST_FULL_ACCESS_ASSERTION_KEYS");
    expect(content).toMatch(
      /approvalRequestFullAccessNoActionRespond:\s*!appServerRequestMethods\.includes\(\s*APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND/u,
    );
    expect(regressionContent).toContain(
      "Claw approval full-access no prompt Electron fixture",
    );
    expect(regressionContent).toContain("approval-request-full-access");
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-approval-request-full-access-regression",
    );
  });

  it("keeps pending approval as a single inputbar row without tool argument details", () => {
    const content = readSmokeScript();

    expect(content).toContain('[data-testid="inputbar-approval-prompt"]');
    expect(content).toContain('[data-testid="inputbar-approval-summary"]');
    expect(content).toContain('approvalPrompt?.querySelector("details")');
    expect(content).toContain('approvalPrompt?.querySelector("pre")');
    expect(content).toContain("snapshot.textareaVisible === false");
    expect(content).toContain("snapshot.singleLine === true");
    expect(content).toContain(
      "approvalRequestResumePendingGui?.hasToolName === false",
    );
    expect(content).toContain(
      "approvalRequestResumePendingGui?.hasCommand === false",
    );
  });

  it("covers the current cancel flow through GUI stop and App Server read model", () => {
    const content = readSmokeScript();

    expect(content).toContain("--scenario <name>");
    expect(content).toContain('scenario: "complete"');
    expect(content).toContain("CLAW_CHAT_FIXTURE_SCENARIO: options.scenario");
    expect(content).toContain("waitForStopButtonVisibleAndClick");
    expect(content).toContain("requireVisibleOutput: true");
    expect(content).toContain("waitForGuiChatCanceled");
    expect(content).toContain("waitForSessionReadCanceled");
    expect(content).toContain("click-stop-from-gui");
    expect(content).toContain("wait-read-model-canceled");
    expect(content).toContain("usedCurrentTurnCancel");
    expect(content).toContain("externalFixtureCancelUsed");
    expect(content).toContain("fixtureCancelReachedBackend");
    expect(content).toContain("readModelCanceled");
    expect(content).toContain("guiStopClicked");
    expect(content).toContain("guiRunningStatusPreservedBeforeStop");
    expect(content).toContain("hasVisibleAssistantOutput");
    expect(content).toContain("hasRunningStatus");
    expect(content).toContain("statusSnapshots");
  });

  it("proves a stopped Claw turn can continue in the same current session", () => {
    const content = readSmokeScript();

    expect(content).toContain('const CONTINUE_PROMPT = "继续输出"');
    expect(content).toContain(
      'const CONTINUE_DONE_TEXT = "CLAW_CONTINUE_FIXTURE_DONE"',
    );
    expect(content).toContain("send-continue-prompt-from-gui");
    expect(content).toContain("wait-gui-continue-completed");
    expect(content).toContain("wait-read-model-continue-completed");
    expect(content).toContain("continueInputSend");
    expect(content).toContain("guiContinueCompleted");
    expect(content).toContain("readModelContinueCompleted");
    expect(content).toContain("continuePromptReachedBackend");
    expect(content).toContain("guiContinueInputSubmitted");
    expect(content).toContain("guiContinueCompleted");
    expect(content).toContain("readModelContinueCompleted");
    expect(content).toContain("backendRecordedCancelThenContinue");
    expect(content).toContain("停止后的同一会话已经可以继续输出");
  });

  it("covers Inputbar rich draft restore after an output-free cancel", () => {
    const content = readSmokeScript();
    const regressionContent = readCurrentFixtureRegressionSmokeScript();

    expect(content).toContain("inputbar-rich-restore");
    expect(content).toContain("INPUTBAR_RICH_RESTORE_PROMPT");
    expect(content).toContain("runInputbarRichRestoreScenario");
    expect(content).toContain("ensureUserVisibleCapabilityReportSkill");
    expect(content).toContain("application/x-lime-path-reference");
    expect(content).toContain("DataTransfer");
    expect(content).toContain("DragEvent");
    expect(content).toContain("inputbar-path-reference-chip");
    expect(content).toContain("input-skill-badge");
    expect(content).toContain("RICH_RESTORE_IMAGE_BASE64");
    expect(content).toContain("attachFixtureImage");
    expect(content).toContain("dropPathReference");
    expect(content).toContain("selectCapabilityReportSkill");
    expect(content).toContain("sendPromptFromGui");
    expect(content).toContain("waitForBackendLedgerTurnStart");
    expect(content).toContain("waitForStopButtonVisibleAndClick");
    expect(content).toContain("waitForInputbarRichRestoreReadModelCanceled");
    expect(content).toContain("provider.first_event.received");
    expect(content).toContain("turn.canceled");
    expect(content).toContain("CLAW_INPUTBAR_RICH_RESTORE_DONE");
    expect(content).toContain("INPUTBAR_RICH_RESTORE_FORBIDDEN_ASSISTANT_TEXT");
    expect(content).toContain("inputbarRichRestoreDraftPrepared");
    expect(content).toContain("inputbarRichRestoreInputSubmitted");
    expect(content).toContain("inputbarRichRestoreBackendInputSummaryReached");
    expect(content).toContain("inputbarRichRestoreUsedCurrentTurnCancel");
    expect(content).toContain("inputbarRichRestoreGuiCanceled");
    expect(content).toContain("inputbarRichRestoreTextRestored");
    expect(content).toContain("inputbarRichRestoreImageRestored");
    expect(content).toContain("inputbarRichRestorePathRestored");
    expect(content).toContain("inputbarRichRestoreSkillRestored");
    expect(content).toContain("inputbarRichRestoreNoVisibleAssistantOutput");
    expect(content).toContain("inputbarRichRestoreReadModelCanceled");
    expect(content).toContain("INPUTBAR_RICH_RESTORE_ASSERTION_KEYS");
    expect(content).toContain("shouldUseTextProviderFixture");
    expect(content).toContain("modelProvider/fetchModels");
    expect(content).toContain("customModels: []");
    expect(content).toContain('["/models", "/v1/models"]');
    expect(content).toContain('input_modalities: ["text", "image"]');
    expect(content).toContain("fixtureModelInputModalities");
    expect(content).toContain(
      "options.scenario !== INPUTBAR_RICH_RESTORE_SCENARIO",
    );
    expect(regressionContent).toContain(
      "Claw Inputbar rich draft restore output-free cancel Electron fixture",
    );
    expect(regressionContent).toContain('"inputbar-rich-restore"');
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-inputbar-rich-restore-regression",
    );
    expect(regressionContent).toContain(
      "Inputbar rich draft restore output-free cancel Electron fixture",
    );
  });

  it("counts current AgentAttachment images by protocol kind", () => {
    expect(
      summarizeRequestInput({
        input: {
          text: "inspect image",
          attachments: [
            {
              kind: "image",
              uri: "data:image/png;base64,abc",
              metadata: { mediaType: "image/png", index: 0 },
            },
          ],
        },
      }),
    ).toMatchObject({
      attachmentCount: 1,
      imageAttachmentCount: 1,
    });
  });

  it("builds typed canonical tool items for the external fixture", () => {
    expect(
      buildCanonicalToolItem({
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        ordinal: 2,
        callId: "tool-1",
        name: "browser_control",
        arguments: { command: "open https://example.com" },
      }),
    ).toMatchObject({
      item: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        ordinal: 2,
        kind: "tool",
        status: "inProgress",
        payload: {
          type: "tool",
          call_id: "tool-1",
          name: "browser_control",
          arguments: [{ name: "command", value: "open https://example.com" }],
          output: null,
        },
      },
    });
  });

  it("keeps retired raw tool wire out of external backend emissions", () => {
    const backendEventSources = [
      "scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs",
      "scripts/agent-runtime/claw-chat-current-fixture-backend-tool-skill-events.mjs",
      "scripts/agent-runtime/skills-runtime-fixture-scenario.mjs",
    ].map((file) => fs.readFileSync(file, "utf8"));
    const retiredToolWire =
      /type: "tool\.(?:started|args|result|failed|args\.delta|input\.delta)"/u;

    for (const source of backendEventSources) {
      expect(source).not.toMatch(retiredToolWire);
    }
  });

  it("reads session-cache auto-resolution from canonical Approval", () => {
    expect(
      summarizeApprovalSessionCacheReadModel(
        {
          detail: {
            thread_read: {
              items: [
                {
                  kind: "approval",
                  status: "completed",
                  payload: {
                    type: "approval",
                    request_id: "permission-turn-2",
                    action: { kind: "tool_confirmation", description: "" },
                    decision: "approvedForSession",
                  },
                },
              ],
            },
          },
        },
        "turn-2",
      ),
    ).toMatchObject({
      includesApprovalSessionCacheHit: true,
      includesAllowForSession: true,
      includesSecondPermissionRequestId: true,
      includesActionRequiredForSecondPermission: false,
      includesActionResolvedForSecondPermission: true,
    });
  });

  it.each([
    ["decline", "denied", false],
    ["cancel", "abort", true],
  ])(
    "reads %s resolution from canonical Approval",
    (decision, canonicalDecision, includesCanceled) => {
      expect(
        summarizeApprovalDecisionReadModel(
          {
            detail: {
              thread_read: {
                runtime_summary: {
                  latestTurnStatus:
                    decision === "cancel" ? "canceled" : "completed",
                },
                items: [
                  {
                    kind: "approval",
                    status: "completed",
                    payload: {
                      type: "approval",
                      request_id: APPROVAL_REQUEST_RESUME_REQUEST_ID,
                      action: { kind: "tool_confirmation", description: "" },
                      decision: canonicalDecision,
                    },
                  },
                ],
              },
            },
          },
          decision,
        ),
      ).toMatchObject({
        includesActionResolved: true,
        includesDecision: true,
        includesCanceled,
      });
    },
  );

  it("reads terminal Approval from the canonical session read model", () => {
    expect(
      summarizeApprovalDecisionReadModel(
        {
          detail: {
            thread_read: {
              runtime_summary: { latestTurnStatus: "completed" },
              thread_items: [
                {
                  type: "approval_request",
                  request_id: APPROVAL_REQUEST_RESUME_REQUEST_ID,
                  status: "completed",
                  response: "denied",
                },
              ],
            },
          },
        },
        "decline",
      ),
    ).toMatchObject({
      includesActionResolved: true,
      includesDecision: true,
    });
  });

  it("hides terminal approval details behind a non-interactive history summary", () => {
    const buildAssertions = ({ previewCount, recordCount }) =>
      buildApprovalRequestDecisionScenarioAssertions({
        appServerRequestMethods: [],
        approvalRequestResumeTurnStart: { turnId: "turn-1" },
        backendLedger: [],
        isApprovalRequestCancelScenario: false,
        isApprovalRequestDeclineScenario: true,
        summary: {
          guiApprovalRequestDeclineCompleted: {
            compactTimelinePreviewCount: previewCount,
            approvalRecordShape: {
              recordCount,
              texts: recordCount === 0 ? [] : ["approval record"],
            },
          },
        },
      });

    expect(
      buildAssertions({ previewCount: 1, recordCount: 0 })
        .guiApprovalRequestDeclineHistoricalDetailsHidden,
    ).toBe(true);
    expect(
      buildAssertions({ previewCount: 1, recordCount: 1 })
        .guiApprovalRequestDeclineHistoricalDetailsHidden,
    ).toBe(false);
    expect(
      buildAssertions({ previewCount: 0, recordCount: 0 })
        .guiApprovalRequestDeclineHistoricalDetailsHidden,
    ).toBe(false);
  });

  it("covers Inputbar pending steer rich draft queue and restore", () => {
    const content = readSmokeScript();
    const regressionContent = readCurrentFixtureRegressionSmokeScript();

    expect(content).toContain("inputbar-pending-steer-rich-restore");
    expect(content).toContain("inputbar-pending-steer-multi-queue");
    expect(content).toContain("inputbar-pending-steer-pop-front-resume");
    expect(content).toContain("INPUTBAR_PENDING_STEER_ACTIVE_PROMPT");
    expect(content).toContain("INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT");
    expect(content).toContain("INPUTBAR_PENDING_STEER_SECOND_PROMPT");
    expect(content).toContain("runInputbarPendingSteerRichRestoreScenario");
    expect(content).toContain("runInputbarPendingSteerMultiQueueScenario");
    expect(content).toContain("runInputbarPendingSteerPopFrontResumeScenario");
    expect(content).toContain("scenarioWaitsForExternalBackendCancel");
    expect(content).toContain("Math.max(options.timeoutMs, 130_000)");
    expect(content).toContain("clickRichRestoreDeferButton");
    expect(content).toContain("clickQueuedTurnPromoteButtonForPrompt");
    expect(content).toContain(
      "textarea?.closest('[data-testid=\"inputbar-core-container\"]')",
    );
    expect(content).toContain("scopedRowCount");
    expect(content).toContain("deferSecondPlainPendingSteer");
    expect(content).toContain("DEFER_BUTTON_LABELS");
    expect(content).toContain("Handle later");
    expect(content).toContain("稍后处理");
    expect(content).toContain("waitForInputbarPendingSteerQueuedReadModel");
    expect(content).toContain("summarizePendingSteerQueue");
    expect(content).toContain("findReadModelQueuedTurnForPrompt");
    expect(content).toContain("inputbarPendingSteerQueuedReadModel");
    expect(content).toContain("inputbarPendingSteerSecondInputDefer");
    expect(content).toContain("inputbarPendingSteerBackendBeforeCancel");
    expect(content).toContain(
      "inputbarPendingSteerRichPromptNotStartedBeforeCancel",
    );
    expect(content).toContain("inputbarPendingSteerQueuedRestoreClicked");
    expect(content).toContain("inputbarPendingSteerQueuedRichImagePreserved");
    expect(content).toContain("inputbarPendingSteerQueuedRichPathPreserved");
    expect(content).toContain(
      "inputbarPendingSteerQueuedRichTextElementsPreserved",
    );
    expect(content).toContain("inputbarPendingSteerQueuedRichSkillPreserved");
    expect(content).toContain("inputbarPendingSteerMultipleQueued");
    expect(content).toContain("inputbarPendingSteerQueueOrderPreserved");
    expect(content).toContain("inputbarPendingSteerSecondTextQueued");
    expect(content).toContain("inputbarPendingSteerPopFrontGuiPromoteClicked");
    expect(content).toContain("inputbarPendingSteerPopFrontUsedCurrentResume");
    expect(content).not.toMatch(
      /summary\.inputbarPendingSteerPopFrontActiveCancel\s*=\s*await cancelActivePendingSteerTurn/u,
    );
    expect(content).not.toMatch(
      /summary\.inputbarPendingSteerPopFrontQueueResume\s*=\s*await resumeQueuedTurnForPromptIfNeeded/u,
    );
    expect(content).toContain("inputbarPendingSteerPopFrontSecondReindexed");
    expect(content).toContain(
      "inputbarPendingSteerPopFrontGuiHydratedSecondQueue",
    );
    expect(content).toContain(
      "inputbarPendingSteerPopFrontHydratedResumeReady",
    );
    expect(content).toContain(
      "inputbarPendingSteerPopFrontQueuedPanel.richTurnTerminal === true",
    );
    expect(content).toContain(
      "inputbarPendingSteerPopFrontQueuedPanel.stopButtonVisible === false",
    );
    expect(content).toMatch(
      /isInputbarPendingSteerPopFrontResumeScenario\s*\?\s*inputbarPendingSteerPopFrontHydratedResumeReady/u,
    );
    expect(content).toContain(
      "INPUTBAR_PENDING_STEER_MULTI_QUEUE_ASSERTION_KEYS",
    );
    expect(content).toContain(
      "INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_ASSERTION_KEYS",
    );
    expect(content).toContain(
      "INPUTBAR_PENDING_STEER_RICH_RESTORE_ASSERTION_KEYS",
    );
    expect(content).toContain("inputbarPendingSteerQueuedProjectionCleared");
    expect(content).toContain(
      "options.scenario !== INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO",
    );
    expect(regressionContent).toContain(
      "Claw Inputbar pending steer rich draft queue + restore Electron fixture",
    );
    expect(regressionContent).toContain(
      '"inputbar-pending-steer-rich-restore"',
    );
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-inputbar-pending-steer-rich-restore-regression",
    );
    expect(regressionContent).toContain(
      "Claw Inputbar pending steer multi queue order Electron fixture",
    );
    expect(regressionContent).toContain('"inputbar-pending-steer-multi-queue"');
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-inputbar-pending-steer-multi-queue-regression",
    );
    expect(regressionContent).toContain(
      "Claw Inputbar pending steer pop-front resume hydrate Electron fixture",
    );
    expect(regressionContent).toContain(
      '"inputbar-pending-steer-pop-front-resume"',
    );
    expect(regressionContent).toContain(
      "claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-regression",
    );
  });

  it("covers Plan mode revisioned thread item and history hydrate in the real Electron fixture", () => {
    const content = readSmokeScript();
    const planHistoryContent = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs",
      "utf8",
    );

    expect(content).toContain('options.scenario === "plan"');
    expect(content).toContain("enablePlanModeFromGui");
    expect(content).toContain("waitForGuiPlanCompleted");
    expect(content).toContain("waitForSessionReadPlanCompleted");
    expect(content).toContain("verifyPlanHistoryHydrate");
    expect(content).toContain("verify-plan-history-hydrate-from-sidebar");
    expect(content).toContain("allowPlanDecision: true");
    expect(content).toContain("lime:agent-runtime-sessions-changed");
    expect(content).toContain('reason: "external"');
    expect(content).toContain("hasPlanDecisionPanel");
    expect(content).toContain("hasPlanDecisionTitle");
    expect(content).toContain("readModelPlanThreadItem");
    expect(content).toContain("guiPlanHistoryHydrateCompleted");
    expect(content).toContain("readModelPlanHistoryHydrate");
    expect(content).toContain(
      "summary.guiPlanCompleted?.hasPlanSection === true",
    );
    expect(content).toContain(
      "summary.guiPlanCompleted?.planOwnerHasAllSteps === true",
    );
    expect(content).toContain("planOwnerKindsWithAllSteps");
    expect(content).toContain("planDecisionRevisionBound");
    expect(content).toContain("planOwnerRevisionIds");
    expect(content).toContain("readModelPlanThreadItemRevisioned");
    expect(content).toContain("readModelPlanHistoryHydratePreserved");
    expect(content).toContain("legacyUpdatePlanToolHidden");
    expect(content).toContain("planUiAbsentWithoutProposedPlan");
    expect(content).toContain("guiNoPlanUiWithoutProposedPlan");
    expect(content).toContain("revisionId");
    expect(content).toContain("proposed_plan");
    expect(content).toContain("UpdatePlanTool");
    expect(content).toContain("update_plan");
    expect(content).toContain("legacyUpdatePlanToolVisible");
    expect(planHistoryContent).not.toContain("clearInvokeBuffers");
  });

  it("locks the news WebSearch policy to model-visible auto choice, not keyword required", () => {
    const content = readSmokeScript();

    expect(content).toContain("newsRequestDidNotForceRequiredSearch");
    expect(content).toContain("newsRequestDidNotPassLegacyWebSearchFlag");
    expect(content).toContain('search_mode !== "required"');
    expect(content).toContain('"web_search"');
  });

  it("covers Soul style config through the real Electron fixture without exposing prompt payload", () => {
    const content = readSmokeScript();

    expect(content).toContain("soul-style");
    expect(content).toContain("SOUL_STYLE_SCENARIO");
    expect(content).toContain("--soul-style-profile");
    expect(content).toContain("SOUL_STYLE_FIXTURE_PROFILES");
    expect(content).toContain("createSoulStyleFixtureSelection");
    expect(content).toContain("buildSoulStyleFixtureAssistantText");
    expect(content).toContain("resolveSoulStyleFixtureExpectedTexts");
    expect(content).toContain("soulStyleExpectation");
    expect(content).toContain("enable-soul-style-config");
    expect(content).toContain("soulStyleConfig");
    expect(content).toContain("soulStyleConfigEnabled");
    expect(content).toContain("soulStylePromptReachedBackend");
    expect(content).toContain("soulStyleRuntimeProviderReached");
    expect(content).toContain("soulStylePromptContextCoveredByRuntime");
    expect(content).toContain("soulStylePromptContextMarkers");
    expect(content).toContain("applySoulStyleProviderMarkerSummary");
    expect(content).toContain("summarizeSoulPromptMarkers");
    expect(content).toContain("hasInteractionSoul");
    expect(content).toContain("hasMemorySoulSchema");
    expect(content).toContain("hasProfileId");
    expect(content).toContain("hasStylePack");
    expect(content).toContain("hasToolLifecycleSurfaceContracts");
    expect(content).toContain("closing_suggestion:");
    expect(content).toContain("buildSoulStyleScenarioAssertions");
    expect(content).toContain("soulStyleTranscriptMatchesExpectedProfile");
    expect(content).toContain("SOUL_STYLE_TRANSCRIPT_GOLDENS");
    expect(content).toContain("buildSoulStyleTranscriptGoldenReport");
    expect(content).toContain("soulStyleReadModelCompleted");
    expect(content).toContain("soulStyleGuiCompleted");
    expect(content).toContain("!isSoulStyleScenario");
    expect(content).toContain("options.scenario === SOUL_STYLE_SCENARIO");
    expect(content).toContain("options.scenario !== SOUL_STYLE_SCENARIO");
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "runtime"');
    expect(readGuiActionsScript()).toContain(
      "/^(system_prompt|systemPrompt)$/u",
    );
    expect(readFixtureUtilsScript()).toContain(
      "/^(system_prompt|systemPrompt)$/u",
    );
    expect(readGuiActionsScript()).toContain("[redacted-prompt]");
    expect(readFixtureUtilsScript()).toContain("[redacted-prompt]");
    expect(content).not.toContain("soulStyleContextReachedBackend");
    expect(content).not.toContain("includesMemorySoulPromptContext");
    expect(content).not.toContain("requestContains");
    expect(content).not.toContain("bodyPreview");
    expect(content).not.toContain("contentPreview");
    expect(content).not.toContain("SOUL_STYLE_PROFILE_ID");
    expect(content).not.toContain("SOUL_STYLE_PACK_ID");
    expect(content).not.toContain("SOUL_STYLE_INTENSITY");
  });

  it("locks Soul transcript golden to four different styles over the same facts", () => {
    const report = buildSoulStyleTranscriptGoldenReport();

    expect(report.profiles).toEqual([
      "cheeky_sassy_executor",
      "warm_supportive_companion",
      "cool_confident_operator",
      "calm_professional_partner",
    ]);
    expect(SOUL_STYLE_FIXTURE_PROFILE_IDS).toEqual(report.profiles);
    expect(report.surfaces).toEqual(SOUL_STYLE_TRANSCRIPT_SURFACES);
    expect(SOUL_STYLE_TRANSCRIPT_GOLDENS).toHaveLength(4);

    for (const check of report.checks) {
      expect(check.textCount, `${check.surface} text count`).toBe(4);
      expect(check.uniqueTextCount, `${check.surface} style collapse`).toBe(4);
      expect(check.factSignatureCount, `${check.surface} fact drift`).toBe(1);
      expect(
        check.missingFactsByProfile,
        `${check.surface} missing facts`,
      ).toEqual({});
    }
  });

  it("covers web tool WebSearch/WebFetch rendering in the real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("web-tools-rendering");
    expect(content).toContain("WEB_TOOLS_RENDERING_PROMPT");
    expect(content).toContain("WEB_TOOLS_SEARCH_TITLE");
    expect(content).toContain("WEB_TOOLS_SEARCH_URL");
    expect(content).toContain("WEB_TOOLS_MID_THINKING_TEXT");
    expect(content).toContain("WEB_TOOLS_REASONING_ITEM_ID");
    expect(content).toContain("waitForGuiWebToolsRenderingCompleted");
    expect(content).toContain("startupNoteVisible");
    expect(content).toContain("webProcessGroupExpanded");
    expect(content).toContain("webProcessGroupRunning");
    expect(content).toContain("hasSearchSourceSection");
    expect(content).toContain("hasFetchPageSection");
    expect(content).toContain("hasFetchPageUrl");
    expect(content).toContain("hasFetchMarkdownHidden");
    expect(content).toContain("rawJsonEnvelopeVisible");
    expect(content).toContain("guiWebSearchProcessDefaultCollapsed");
    expect(content).toContain("guiWebSearchProcessShowsSourcesAfterExpand");
    expect(content).toContain("guiWebFetchProcessShowsReadPagesAfterExpand");
    expect(content).toContain("guiWebToolsTimelineOrderPreserved");
    expect(content).toContain("guiWebSearchFinalTextInterleaved");
    expect(content).toContain("guiWebFetchTransportEnvelopeHidden");
    expect(content).toContain('type: "item.updated"');
    expect(content).toContain('type: "item.completed"');
    expect(content).toContain("hasTimelineOrderPreserved");
    expect(content).toContain("WEB_TOOLS_RENDERING_ASSERTION_KEYS");
    expect(content).toContain("bytes: 2048");
    expect(content).toContain('codeText: "OK"');
    expect(content).toContain("forbiddenTransportFragments");
    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain(
      "guiWebToolsReasoningVisibleBeforeFinalAnswer",
    );
  });

  it("covers reasoning-first visibility in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("reasoning-first-visible");
    expect(content).toContain("REASONING_FIRST_VISIBLE_PROMPT");
    expect(content).toContain("REASONING_FIRST_VISIBLE_TEXT");
    expect(content).toContain("REASONING_FIRST_VISIBLE_FINAL_TEXT");
    expect(content).toContain("REASONING_FIRST_VISIBLE_DONE_TEXT");
    expect(content).toContain("waitForGuiReasoningFirstVisibleBeforeAnswer");
    expect(content).toContain("waitForGuiReasoningFirstVisibleCompleted");
    expect(content).toContain("guiReasoningFirstVisibleBeforeAnswer");
    expect(content).toContain("guiReasoningFirstVisibleCompleted");
    expect(content).toContain("readModelReasoningFirstVisibleCompleted");
    expect(content).toContain("readModelReasoningFirstVisibleItemObserved");
    expect(content).toContain("REASONING_FIRST_VISIBLE_ASSERTION_KEYS");
    expect(content).toContain('type: "reasoning"');
    expect(content).toContain('status: "in_progress"');
    expect(content).toContain('type: "message.delta"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers live-tail commit in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("live-tail-commit");
    expect(content).toContain("LIVE_TAIL_COMMIT_PROMPT");
    expect(content).toContain("LIVE_TAIL_COMMIT_FIRST_TEXT");
    expect(content).toContain("LIVE_TAIL_COMMIT_OVERFLOW_MARKER");
    expect(content).toContain("LIVE_TAIL_COMMIT_TABLE_HEADER");
    expect(content).toContain("LIVE_TAIL_COMMIT_TABLE_TAIL");
    expect(content).toContain("LIVE_TAIL_COMMIT_DONE_TEXT");
    expect(content).toContain("runLiveTailCommitScenario");
    expect(content).toContain("wait-gui-live-tail-first-visible-before-commit");
    expect(content).toContain("guiLiveTailFirstVisibleBeforeCommit");
    expect(content).toContain("runningStatusVisible");
    expect(content).toContain("startupNoteVisible");
    expect(content).toContain("overflowCommitted");
    expect(content).toContain("scrollAnchorStable");
    expect(content).toContain("markdownTableRendered");
    expect(content).toContain("readModelLiveTailCommitCompleted");
    expect(content).toContain("liveTailCommitCompleted");
    expect(content).toContain("LIVE_TAIL_COMMIT_ASSERTION_KEYS");
    expect(content).toContain('eventType: "turn.completed"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).toContain("options.scenario !== LIVE_TAIL_COMMIT_SCENARIO");
    expect(content).not.toContain('type: "turn.final_done"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers Electron resize/reflow in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("electron-resize-reflow");
    expect(content).toContain("ELECTRON_RESIZE_REFLOW_SCENARIO");
    expect(content).toContain("runElectronResizeReflowScenario");
    expect(content).toContain(
      "APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST",
    );
    expect(content).toContain("request-electron-resize-reflow-files-surface");
    expect(content).toContain("wait-electron-resize-reflow-backend-turn-start");
    expect(content).toContain("capture-electron-resize-reflow-${label}");
    expect(content).toContain("wide: { width: 1440, height: 1000 }");
    expect(content).toContain("compact: { width: 1240, height: 760 }");
    expect(content).toContain("restored: { width: 1440, height: 1000 }");
    expect(content).toContain("captureResizeScreenshot");
    expect(content).toContain("screenshotCount");
    expect(content).toContain("workspace-files-surface");
    expect(content).toContain("task-center-files-toggle");
    expect(content).toContain("textRangeRect");
    expect(content).toContain("noTailInputOverlap");
    expect(content).toContain("noMessageRightOverlap");
    expect(content).toContain("guiElectronResizeReflowNoOverlap");
    expect(content).toContain("ELECTRON_RESIZE_REFLOW_ASSERTION_KEYS");
    expect(content).toContain('eventType: "turn.completed"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).not.toContain('type: "turn.final_done"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers stale terminal guard in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("terminal-stale-guard");
    expect(content).toContain("TERMINAL_STALE_GUARD_FIRST_PROMPT");
    expect(content).toContain("TERMINAL_STALE_GUARD_SECOND_PROMPT");
    expect(content).toContain("TERMINAL_STALE_GUARD_FIRST_DONE_TEXT");
    expect(content).toContain("TERMINAL_STALE_GUARD_DONE_TEXT");
    expect(content).toContain("TERMINAL_STALE_GUARD_STALE_DONE_TEXT");
    expect(content).toContain("terminalStaleGuardStaleTerminal");
    expect(content).toContain("wait-gui-terminal-stale-guard-first-completed");
    expect(content).toContain("wait-gui-terminal-stale-guard-second-completed");
    expect(content).toContain("readModelTerminalStaleGuardSecondCompleted");
    expect(content).toContain("terminalStaleGuardStaleTerminalIgnored");
    expect(content).toContain("TERMINAL_STALE_GUARD_ASSERTION_KEYS");
    expect(content).toContain(
      "options.scenario !== TERMINAL_STALE_GUARD_SCENARIO",
    );
    expect(content).toContain('staleEventType: "turn.completed"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers failed terminal after visible answer in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("terminal-failed-after-answer");
    expect(content).toContain("TERMINAL_FAILED_AFTER_ANSWER_PROMPT");
    expect(content).toContain("TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT");
    expect(content).toContain("TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT");
    expect(content).toContain("terminalFailedAfterAnswerTurnFailed");
    expect(content).toContain("wait-gui-terminal-failed-after-answer-failed");
    expect(content).toContain(
      "wait-read-model-terminal-failed-after-answer-failed",
    );
    expect(content).toContain("waitForSessionReadFailedAfterAnswer");
    expect(content).toContain("readModelTerminalFailedAfterAnswerFailed");
    expect(content).toContain("backendTerminalFailedAfterAnswerRecorded");
    expect(content).toContain("TERMINAL_FAILED_AFTER_ANSWER_ASSERTION_KEYS");
    expect(content).toContain(
      "options.scenario !== TERMINAL_FAILED_AFTER_ANSWER_SCENARIO",
    );
    expect(content).toContain('eventType: "turn.failed"');
    expect(content).toContain('type: "turn.failed"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers canceled terminal after visible answer in a dedicated real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("terminal-canceled-after-answer");
    expect(content).toContain("TERMINAL_CANCELED_AFTER_ANSWER_PROMPT");
    expect(content).toContain("TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT");
    expect(content).toContain("TERMINAL_CANCELED_AFTER_ANSWER_CANCELED_TEXT");
    expect(content).toContain("terminalCanceledAfterAnswerTurnCanceled");
    expect(content).toContain(
      "click-stop-after-terminal-canceled-partial-from-gui",
    );
    expect(content).toContain(
      "wait-read-model-terminal-canceled-after-answer-canceled",
    );
    expect(content).toContain("waitForSessionReadCanceled");
    expect(content).toContain("readModelTerminalCanceledAfterAnswerCanceled");
    expect(content).toContain("backendTerminalCanceledAfterAnswerRecorded");
    expect(content).toContain("TERMINAL_CANCELED_AFTER_ANSWER_ASSERTION_KEYS");
    expect(content).toContain(
      "options.scenario !== TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO",
    );
    expect(content).toContain('eventType: "turn.canceled"');
    expect(content).toContain('type: "turn.canceled"');
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers MCP structuredContent rendering in the real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("mcp-structured-content");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_PROMPT");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_DONE_TEXT");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_TOOL_CALL_ID");
    expect(content).toContain(
      'const MCP_STRUCTURED_CONTENT_TOOL_NAME = "mcp__docs__diagnostic_probe"',
    );
    expect(content).toContain("MCP_STRUCTURED_CONTENT_TOOL_DISPLAY_LABEL");
    expect(content).toContain('"docs / diagnostic probe"');
    expect(content).toContain("MCP_STRUCTURED_CONTENT_ANSWER");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_REFERENCE_ID");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_RESULT");
    expect(content).toContain('tool_family: "mcp"');
    expect(content).toContain('mcp_server: "docs"');
    expect(content).toContain('mcp_tool: "diagnostic_probe"');
    expect(content).toContain("buildCanonicalToolItem({");
    expect(content).toContain('status: "completed"');
    expect(content).toContain("structuredContent:");
    expect(content).toContain(
      "text: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)}",
    );
    expect(content).toContain("waitForGuiMcpStructuredContentCompleted");
    expect(content).toContain(
      "waitForSessionReadMcpStructuredContentCompleted",
    );
    expect(content).toContain("forbiddenEnvelopeFragments");
    expect(content).toContain("request_metadata");
    expect(content).toContain("mcp_tool_result_projection");
    expect(content).toContain("diagnostics");
    expect(content).toContain("raw_transport_payload");
    expect(content).toContain("doc-hidden-envelope");
    expect(content).toContain("guiMcpStructuredContentEnvelopeHidden");
    expect(content).toContain("guiMcpStructuredContentVisible");
    expect(content).toContain("readModelMcpStructuredContentCompleted");
    expect(content).toContain("readModelMcpStructuredContentObserved");
    expect(content).toContain("MCP_STRUCTURED_CONTENT_ASSERTION_KEYS");
    expect(content).not.toContain("server__diagnostic_probe");
    expect(content).not.toContain("agent_runtime_");
  });

  it("covers media contentParts references in Agent Chat and Workbench preview", () => {
    const content = readSmokeScript();
    const backendContent = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs",
      "utf8",
    );

    expect(content).toContain("media-reference");
    expect(content).toContain("MEDIA_REFERENCE_PROMPT");
    expect(content).toContain("验证媒体引用展示");
    expect(content).toContain("CLAW_MEDIA_REFERENCE_FIXTURE_DONE");
    expect(content).toContain("contentParts");
    expect(content).toContain('type: "media"');
    expect(content).toContain("sidecar://media/fixture-image-1");
    expect(content).toContain("fixture-image-1.png");
    expect(content).toContain("streaming-media-reference-card");
    expect(content).toContain("runMediaReferenceScenario");
    expect(content).toContain("summarizeGuiMediaReferenceSnapshot");
    expect(content).toContain("openGuiMediaReferencePreview");
    expect(content).toContain("waitForSessionReadMediaReferenceCompleted");
    expect(content).toContain("mediaReferencePromptReachedBackend");
    expect(content).toContain("guiMediaReferenceCardVisible");
    expect(content).toContain("guiMediaReferenceDoesNotExposeInlinePayload");
    expect(content).toContain("guiMediaReferencePreviewOpened");
    expect(content).toContain("readModelMediaReferenceObserved");
    expect(content).toContain("source_path");
    expect(content).toContain("hasSourceOwner");
    expect(content).toContain("preview-artifact-image");
    const mediaBranchIndex = backendContent.indexOf(
      "if (isMediaReferencePrompt)",
    );
    const mediaStartedIndex = backendContent.indexOf(
      'type: "item.started"',
      mediaBranchIndex,
    );
    const mediaCompletedIndex = backendContent.indexOf(
      'type: "item.completed"',
      mediaStartedIndex,
    );
    expect(mediaBranchIndex).toBeGreaterThan(-1);
    expect(mediaStartedIndex).toBeGreaterThan(mediaBranchIndex);
    expect(mediaCompletedIndex).toBeGreaterThan(mediaStartedIndex);
    expect(
      backendContent.slice(mediaStartedIndex, mediaCompletedIndex),
    ).toContain('id: "agent-media-reference-1"');
    expect(content).toContain("!isMediaReferenceScenario");
    expect(content).not.toContain("data:image/png;base64,fixture-image-1");
  });

  registerImageContentSmokeGuards({
    expect,
    it,
    readSmokeScript,
    removeContentFactoryForbiddenMarkerGuard,
  });
  registerSkillsRuntimeSmokeGuards({
    expect,
    it,
    readSmokeScript,
    readCurrentFixtureRegressionSmokeScript,
    readExpertActionsScript,
    readGuiActionsScript,
  });

  it("covers the Right Surface visual matrix without a model turn", () => {
    const content = readSmokeScript();

    expect(content).toContain("right-surface-visual-matrix");
    expect(content).toContain("runRightSurfaceVisualMatrix");
    expect(content).toContain("create-right-surface-visual-expert-session");
    expect(content).toContain("run-right-surface-visual-matrix");
    expect(content).toContain("workspaceRightSurface/request");
    expect(content).toContain('origin: "runtime"');
    expect(content).not.toContain("fixture:right-surface-visual-matrix");
    expect(content).toContain("workspaceRightSurface/pending/list");
    expect(content).toContain("task-center-files-toggle");
    expect(content).toContain("task-center-object-canvas-toggle");
    expect(content).toContain("task-center-browser-toggle");
    expect(content).toContain("task-center-expert-info-toggle");
    expect(content).toContain("workspace-right-surface-tab-appSurface");
    expect(content).toContain("right-surface-browser.png");
    expect(content).toContain("workspace-right-surface-host");
    expect(content).toContain("workspace-files-surface");
    expect(content).toContain("workspace-object-canvas-surface");
    expect(content).toContain("right-surface-browser-panel");
    expect(content).toContain("summarizeRightSurfaceRequest(requests.browser)");
    expect(content).toContain(
      "fs.existsSync(rightSurfaceVisualCaptures.browser.screenshot)",
    );
    expect(content).toContain("expert-info-panel");
    expect(content).toContain("workspace-plugin-surface");
    expect(content).toContain("workspace-plugin-surface-tabs");
    expect(content).toContain("workspace-plugin-surface-frame");
    expect(content).toContain("workspace-plugin-surface-viewport");
    expect(content).toContain("plugin-shell-content-factory-app-main");
    expect(content).toContain("plugin-shell-prompt-lab-app");
    expect(content).toContain("webContentsView");
    expect(content).toContain("iframe: false");
    expect(content).toContain("browserView: false");
    expect(content).toContain("rightSurfaceVisualMatrixHostsFillRightSide");
    expect(content).toContain(
      "rightSurfaceVisualMatrixObjectCanvasRailVisible",
    );
    expect(content).toContain("rightSurfaceVisualMatrixBrowserSurfaceVisible");
    expect(content).toContain("rightSurfaceVisualMatrixAppSurfaceVisible");
    expect(content).toContain(
      "rightSurfaceVisualMatrixAppSurfaceMultiInstanceTabs",
    );
    expect(content).toContain(
      "rightSurfaceVisualMatrixPendingConsumeKeepsSurfaceOpen",
    );
    expect(content).toContain("rightSurfaceVisualMatrixDoesNotUseModelTurn");
    expect(content).not.toContain("agent_runtime_");
  });

  it("accepts Article Editor right rail snapshots without canvas-panel fill", () => {
    expect(
      isRightSurfaceSnapshotReady(
        {
          activeSurface: "articleWorkspace",
          hostVisible: true,
          rootVisible: true,
          visibleRootKinds: ["articleWorkspace"],
          geometry: {
            hostFillsCanvasPanel: false,
            rootFillsSurfaceViewport: true,
          },
        },
        "articleWorkspace",
      ),
    ).toBe(true);

    expect(
      isRightSurfaceSnapshotReady(
        {
          activeSurface: "files",
          hostVisible: true,
          rootVisible: true,
          visibleRootKinds: ["files"],
          geometry: {
            hostFillsCanvasPanel: false,
            rootFillsSurfaceViewport: true,
          },
        },
        "files",
      ),
    ).toBe(false);
  });

  it("does not use live providers, App Server mock backend, renderer mocks, or legacy commands", () => {
    const content = readSmokeScript();

    expect(content).toContain('LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0"');
    expect(content).toContain('LIME_REAL_API_TEST: "0"');
    expect(content).toContain("liveProviderNotUsed");
    expect(content).toContain("invokeErrorBufferClearedBeforeScenario");
    expect(content).toContain('removeItem("lime_invoke_error_buffer_v1")');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("explicitMockFallback");
    expect(content).not.toContain("safeInvoke(");
    expect(content).not.toContain("agent_runtime_");
  });
});
