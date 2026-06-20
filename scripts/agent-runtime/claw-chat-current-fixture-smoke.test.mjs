import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "utf8",
  );
}

describe("claw chat current Electron fixture smoke guard", () => {
  it("drives the real Electron Desktop Host bridge and App Server JSON-RPC", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
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

    expect(content).toContain('textarea[name="agent-chat-message"]');
    expect(content).toContain("waitForInputReady");
    expect(content).toContain("sendNewsPromptFromGui");
    expect(content).toContain("整理今天的国际新闻");
    expect(content).toContain("promptVisibleInTextarea");
    expect(content).toContain("hasPrompt");
    expect(content).toContain("今日国际新闻简要整理");
    expect(content).toContain("CLAW_NEWS_FIXTURE_DONE");
    expect(content).toContain("guiInputRemainsReady");
    expect(content).toContain("guiNotStuckStreaming");
    expect(content).toContain("noEpochFallbackTitle");
  });

  it("uses a local external fixture backend and current Agent Session methods", () => {
    const content = readSmokeScript();

    expect(content).toContain('"app_server_drain_events"');
    expect(content).toContain('"agentSession/event"');
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
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
    expect(content).toContain('type: "turn.completed"');
    expect(content).toContain('type: "turn.canceled"');
    expect(content).not.toContain('type: "turn.final_done"');
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
    expect(content).toContain('type: "tool.started"');
    expect(content).toContain('type: "tool.result"');
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
    expect(content).toContain("summary.commonAssertions = commonAssertions");
    expect(content).toContain(
      "summary.scenarioAssertions = scenarioAssertions",
    );
    expect(content).toContain(
      "summary.notApplicableAssertions = notApplicableAssertions",
    );
    expect(content).toContain('"readModelCanceled"');
    expect(content).toContain('"eventReadProbeObserved"');
    expect(content).toContain('"readModelToolCallAligned"');
    expect(content).toContain("isCancelThenContinueScenario");
    expect(content).toContain("hasCancelPhase");
    expect(content).toContain("continuePromptReachedBackend");
    expect(content).toContain("backendRecordedCancelThenContinue");
  });

  it("covers the current cancel flow through GUI stop and App Server read model", () => {
    const content = readSmokeScript();

    expect(content).toContain("--scenario <name>");
    expect(content).toContain('scenario: "complete"');
    expect(content).toContain("CLAW_CHAT_FIXTURE_SCENARIO: options.scenario");
    expect(content).toContain("waitForStopButtonVisibleAndClick");
    expect(content).toContain("waitForGuiChatCanceled");
    expect(content).toContain("waitForSessionReadCanceled");
    expect(content).toContain("click-stop-from-gui");
    expect(content).toContain("wait-read-model-canceled");
    expect(content).toContain("usedCurrentTurnCancel");
    expect(content).toContain("externalFixtureCancelUsed");
    expect(content).toContain("fixtureCancelReachedBackend");
    expect(content).toContain("readModelCanceled");
    expect(content).toContain("guiStopClicked");
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

  it("locks the news WebSearch policy to model-visible auto choice, not keyword required", () => {
    const content = readSmokeScript();

    expect(content).toContain("newsRequestDidNotForceRequiredSearch");
    expect(content).toContain("newsRequestDidNotPassLegacyWebSearchFlag");
    expect(content).toContain('search_mode !== "required"');
    expect(content).toContain('"web_search"');
  });

  it("covers Codex-style WebSearch/WebFetch rendering in the real Electron fixture", () => {
    const content = readSmokeScript();

    expect(content).toContain("web-tools-rendering");
    expect(content).toContain("WEB_TOOLS_RENDERING_PROMPT");
    expect(content).toContain("WEB_TOOLS_SEARCH_TITLE");
    expect(content).toContain("WEB_TOOLS_SEARCH_URL");
    expect(content).toContain("waitForGuiWebToolsRenderingCompleted");
    expect(content).toContain("webProcessGroupExpanded");
    expect(content).toContain("hasSearchSourceSection");
    expect(content).toContain("hasFetchPageSection");
    expect(content).toContain("hasFetchPageUrl");
    expect(content).toContain("hasFetchMarkdownHidden");
    expect(content).toContain("rawJsonEnvelopeVisible");
    expect(content).toContain("guiWebSearchProcessDefaultExpanded");
    expect(content).toContain("guiWebSearchProcessShowsInlineSources");
    expect(content).toContain("guiWebFetchProcessShowsReadPages");
    expect(content).toContain("guiWebSearchFinalTextInterleaved");
    expect(content).toContain("guiWebFetchTransportEnvelopeHidden");
    expect(content).toContain("WEB_TOOLS_RENDERING_ASSERTION_KEYS");
    expect(content).toContain("bytes: 2048");
    expect(content).toContain('codeText: "OK"');
    expect(content).toContain("forbiddenTransportFragments");
    expect(content).not.toContain("agent_runtime_");
  });

  it("does not use live providers, App Server mock backend, renderer mocks, or legacy commands", () => {
    const content = readSmokeScript();

    expect(content).toContain('LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0"');
    expect(content).toContain('LIME_REAL_API_TEST: "0"');
    expect(content).toContain("liveProviderNotUsed");
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
