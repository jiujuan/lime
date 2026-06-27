import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_FACTORY_PRODUCT_PROFILE_ASSERTION_KEYS } from "./claw-chat-current-fixture-constants.mjs";
import {
  createExpertSkillsRuntimeFixtureScenario,
  createManualEnableSkillsRuntimeFixtureScenario,
  createSkillsRuntimeFixtureScenario,
  EXPERT_PANEL_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  SKILLS_RUNTIME_EXPLICIT_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_QUERY,
  SKILLS_RUNTIME_SKILL_NAME,
  summarizeSkillsRuntimeEvidenceExport,
} from "./skills-runtime-fixture-scenario.mjs";

const fixtureSourceFiles = [
  "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs",
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
  "scripts/agent-runtime/claw-chat-current-fixture-skills-workspace.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-right-surface-visual.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-product-profile.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-worker-dogfood.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-workspace-patches.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-common-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-not-applicable-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertion-context.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertions.mjs",
];

function readSmokeScript() {
  return fixtureSourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function readCurrentFixtureRegressionSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/current-fixture-regression-smoke.mjs",
    "utf8",
  );
}

function readSkillsRuntimeFixtureScenario() {
  return fs.readFileSync(
    "scripts/agent-runtime/skills-runtime-fixture-scenario.mjs",
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
    const guiActionsContent = readGuiActionsScript();

    expect(guiActionsContent).toContain('textarea[name="agent-chat-message"]');
    expect(content + guiActionsContent).toContain("waitForInputReady");
    expect(guiActionsContent).toContain("waitForSendButtonReady");
    expect(content).toContain("sendNewsPromptFromGui");
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

  it("covers Plan mode revisioned thread item and history hydrate in the real Electron fixture", () => {
    const content = readSmokeScript();

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
      "summary.guiPlanCompleted?.hasAllPlanSteps === true",
    );
    expect(content).toContain("readModelPlanThreadItemRevisioned");
    expect(content).toContain("readModelPlanHistoryHydratePreserved");
    expect(content).toContain("legacyUpdatePlanToolHidden");
    expect(content).toContain("revisionId");
    expect(content).toContain("proposed_plan");
    expect(content).toContain("UpdatePlanTool");
    expect(content).toContain("update_plan");
    expect(content).toContain("legacyUpdatePlanToolVisible");
  });

  it("locks the news WebSearch policy to model-visible auto choice, not keyword required", () => {
    const content = readSmokeScript();

    expect(content).toContain("newsRequestDidNotForceRequiredSearch");
    expect(content).toContain("newsRequestDidNotPassLegacyWebSearchFlag");
    expect(content).toContain('search_mode !== "required"');
    expect(content).toContain('"web_search"');
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
    expect(content).toContain("webProcessGroupExpanded");
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
    expect(content).toContain("structuredContent:");
    expect(content).toContain("structured_content:");
    expect(content).toContain("result: {");
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

  it("covers Skills runtime search, on-demand body load, gate, and Evidence Pack in the real Electron fixture", () => {
    const content = readSmokeScript();
    const scenarioContent = readSkillsRuntimeFixtureScenario();
    const expertActionsContent = readExpertActionsScript();
    const guiActionsContent = readGuiActionsScript();
    const expertRuntimeContent = `${content}\n${expertActionsContent}\n${guiActionsContent}`;

    expect(content).toContain("skills-runtime");
    expect(content).toContain("skills-runtime-fixture-scenario.mjs");
    expect(content).toContain("createSkillsRuntimeFixtureScenario");
    expect(content).toContain("renderSkillsRuntimeBackendEvents");
    expect(content).toContain("SKILLS_RUNTIME_PROMPT");
    expect(content).toContain("SKILLS_RUNTIME_DONE_TEXT");
    expect(content).toContain("SKILLS_RUNTIME_EXPLICIT_PROMPT");
    expect(content).toContain("SKILLS_RUNTIME_EXPLICIT_DONE_TEXT");
    expect(content).toContain("SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT");
    expect(content).toContain("SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT");
    expect(content).toContain("expert-skills-runtime");
    expect(content).toContain("expert-plaza-skills-runtime");
    expect(content).toContain("expert-panel-skills-runtime");
    expect(content).toContain(
      'options.scenario !== "expert-panel-skills-runtime"',
    );
    expect(content).toContain("createExpertSkillsRuntimeFixtureScenario");
    expect(content).toContain("createExpertPanelSkillsRuntimeFixtureScenario");
    expect(content).toContain("buildExpertSkillsRuntimeMetadata");
    expect(content).toContain("buildExpertSkillsRuntimeCatalog");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_ASSERTION_KEYS");
    expect(content).toContain("EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS");
    expect(content).toContain("EXPERT_PANEL_SKILLS_RUNTIME_ASSERTION_KEYS");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_PROMPT");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_PANEL_PROMPT");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_DONE_TEXT");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_SKILL_REF");
    expect(content).toContain("EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF");
    expect(content).toContain("injectExpertSkillsRuntimeCatalog");
    expect(content).toContain("buildExpertPanelWorkspaceSkillCatalog");
    expect(expertRuntimeContent).toContain(
      "reloadRendererAfterExpertPanelSkillCatalogInjection",
    );
    expect(content).toContain("expertPanelSkillsRuntimeCatalogReload");
    expect(content).toContain("reload-expert-panel-skills-runtime-catalog");
    expect(expertRuntimeContent).toContain("lime:skill-catalog:v1");
    expect(content).toContain("workspaceSkillCatalog");
    expect(content).toContain("workspaceSkill: expertSkillsRuntimeSkill");
    expect(content).toContain('"native_skill"');
    expect(content).toContain('"skill:capability-report"');
    expect(expertRuntimeContent).toContain(
      "launchExpertSkillsRuntimeFromExpertPlaza",
    );
    expect(expertRuntimeContent).toContain(
      "addExpertSkillsRuntimeSkillFromInfoPanel",
    );
    expect(expertActionsContent).toContain("waitForExpertSkillPickerState");
    expect(expertActionsContent).toContain("clickExpertSkillPickerTrigger");
    for (const fragment of [
      "expert-info-skills-runtime-action-skill-code-review",
      "mapping-action",
      "setExpertSkillPickerQuery",
      "pickerSearch",
    ])
      expect(expertActionsContent).toContain(fragment);
    expect(expertActionsContent).toContain("waitForExpertPanelAddedSkill");
    expect(expertActionsContent).toContain(
      "exportExpertPanelEvidencePackFromHarnessPanel",
    );
    expect(expertActionsContent).toContain("waitForExpertPanelEvidenceSummary");
    expect(expertActionsContent).toContain(
      "expert-info-skills-evidence-summary",
    );
    expect(expertActionsContent).toContain("missing-visible-trigger");
    expect(expertActionsContent).toContain(
      "visibleElementSnapshot(candidate).visible",
    );
    expect(expertActionsContent).toContain("导出问题证据包");
    expect(expertActionsContent).toContain("刷新证据包");
    expect(expertActionsContent).toContain("app-sidebar-nav-experts");
    expect(expertActionsContent).toContain(
      "expert-start-${EXPERT_SKILLS_RUNTIME_ID}",
    );
    expect(expertActionsContent).toContain("expert-info-skills-add");
    expect(expertRuntimeContent).toContain(
      "EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF",
    );
    expect(expertActionsContent).toContain("skill:local:capability-report");
    expect(expertRuntimeContent).toContain(
      "EXPERT_PANEL_SKILLS_RUNTIME_UI_ADD_TEST_ID",
    );
    expect(expertRuntimeContent).toContain(
      "EXPERT_PANEL_SKILLS_RUNTIME_UI_CHIP_TEST_ID",
    );
    expect(content).toContain("selectExpertPanelSkillsRuntimeSessionId");
    expect(content).toContain("summary.expertPanelSkillsRuntimeSessionId");
    expect(content).toContain("expertPanelSkillsRuntimeSessionId");
    expect(content).toContain("expectedSessionId");
    expect(content).toContain(
      "{ expectedSessionId: expertPlazaSkillsRuntimeSessionId }",
    );
    expect(expertRuntimeContent).toContain("data-session-id");
    expect(expertRuntimeContent).toContain("textareaSessionId");
    expect(content).toContain("expertPlazaCatalogInjected");
    expect(content).toContain("expertPlazaCardClicked");
    expect(content).toContain("expertPlazaAutoSendTurnStarted");
    expect(content).toContain("expertPanelSkillPickerOpened");
    expect(content).toContain("expertPanelSkillAdded");
    expect(content).toContain("expertPanelAddedSkillVisible");
    expect(content).toContain("expertPanelEvidencePackGuiExport");
    expect(content).toContain("expertPanelEvidenceSummary");
    expect(content).toContain(
      "expertPanelEvidencePackExportedFromHarnessPanel",
    );
    expect(content).toContain("expertPanelEvidenceSummaryVisible");
    expect(content).toContain("expertPanelEvidenceSummarySkillCountsVisible");
    expect(content).toContain("expertPanelEvidenceSummaryLatestSkillVisible");
    expect(content).toContain("expertPanelEvidenceSummaryRuntimeEnableVisible");
    expect(content).toContain(
      "expertPanelEvidenceSummaryHidesRawRuntimeEnable",
    );
    expect(content).toContain("expertPanelSkillRefsOverrideReachedBackend");
    expect(content).toContain("waitForBackendLedgerTurnStartContaining");
    expect(content).toContain("launchSkillsRuntimeFromWorkspacePanel");
    expect(content).toContain("createExpertSkillsRuntimeSession");
    for (const fragment of [
      "send-expert-skills-runtime-prompt-from-gui",
      "expertSkillsRuntimeInputSend",
      "expectedSessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID",
      "expertSkillsRuntimeQueueResume",
      "waitForBackendTurnStartWithCurrentQueueResume",
    ])
      expect(content).toContain(fragment);
    for (const fragment of [
      "startExpertSkillsRuntimeTurn",
      "EXPERT_SKILLS_RUNTIME_TURN_ID",
    ])
      expect(content).not.toContain(fragment);
    expect(content).toContain("{ title }");
    expect(content).toContain("waitForBackendLedgerTurnStart");
    expect(content).toContain("manualEnableSkillsRuntimeSessionId");
    expect(content).not.toContain(
      "async function runManualEnableSkillsRuntimeTurn",
    );
    expect(content).toContain("ensureManualEnableWorkspaceSkill");
    expect(content).toContain('".lime"');
    expect(content).toContain('"registration.json"');
    expect(content).toContain("workspace-registered-skill-enable-runtime");
    expect(content).toContain("app-sidebar-nav-skills");
    expect(content).toContain("sanitizeBackendLedgerForEvidence");
    expect(content).toContain("isIgnorableConsoleError");
    expect(content).toContain("actionableConsoleErrors");
    expect(content).toContain("workspaceSkillRuntimeEnable");
    expect(content).toContain("SKILLS_RUNTIME_QUERY");
    expect(content).toContain("SKILLS_RUNTIME_SKILL_NAME");
    expect(content).toContain('"evidence/export"');
    expect(content).toContain("includeEvidencePack: true");
    expect(content).toContain("waitForGuiSkillsRuntimeCompleted");
    expect(content).toContain(
      "scenario.guiSummaryText ?? scenario.summaryText",
    );
    expect(content).toContain("waitForSessionReadSkillsRuntimeCompleted");
    expect(content).toContain("summarizeSkillsRuntimeReadModel");
    expect(content).toContain("readModelTurnTerminal");
    expect(content).toContain("exportSkillsRuntimeEvidencePack");
    expect(content).toContain("summarizeSkillsRuntimeEvidenceExport");
    expect(content).toContain("skillsRuntimePromptReachedBackend");
    expect(content).toContain("readModelSkillSearchObserved");
    expect(content).toContain("readModelSkillInvocationObserved");
    expect(content).toContain("evidenceSkillBodyReadObserved");
    expect(content).toContain("evidenceSkillGateObserved");
    expect(content).toContain("evidencePackSkillSearchObserved");
    expect(content).toContain("evidencePackSkillInvocationObserved");
    expect(content).toContain("skillSearchBeforeSkillInvocation");
    expect(content).toContain("explicitSkillsRuntimePromptReachedBackend");
    expect(content).toContain("guiExplicitSkillsRuntimeInputSubmitted");
    expect(content).toContain("readModelExplicitSkillSearchObserved");
    expect(content).toContain("evidenceExplicitSkillBodyReadObserved");
    expect(content).toContain("explicitSkillSearchBeforeSkillInvocation");
    expect(content).toContain("manualEnableSkillsRuntimePromptReachedBackend");
    expect(content).toContain(
      "manualEnableSkillsRuntimeMetadataReachedBackend",
    );
    expect(content).toContain(
      "manualEnableSkillsRuntimeSkillDirectoryPrepared",
    );
    expect(content).toContain(
      "manualEnableSkillsRuntimeLaunchedFromSkillsWorkspace",
    );
    expect(content).toContain("manualEnableSkillsRuntimeOpenedAgentSession");
    expect(content).toContain("expertSkillsRuntimeMetadataReachedBackend");
    expect(content).toContain("expert_declared_skill_refs");
    expect(content).toContain("expert_selected_skill");
    expect(content).toContain("expert_invoked_skill");
    expect(content).toContain("expertDeclaredSkillRefsObserved");
    expect(content).toContain("expertSelectedSkillObserved");
    expect(content).toContain("expertInvokedSkillObserved");
    expect(content).toContain("evidencePackExpertSkillSearchObserved");
    expect(content).toContain("evidencePackExpertSkillInvocationObserved");
    expect(content).toContain("expertSkillSearchBeforeSkillInvocation");
    expect(content).toContain("guiManualEnableSkillsRuntimeCompleted");
    expect(content).toContain("readModelManualEnableSkillSearchObserved");
    expect(content).toContain(
      "evidenceManualEnableWorkspaceRuntimeEnableObserved",
    );
    expect(content).toContain("manualEnableSkillSearchBeforeSkillInvocation");
    expect(content).toContain("SKILLS_RUNTIME_ASSERTION_KEYS");
    expect(scenarioContent).toContain(
      "createExplicitSkillsRuntimeFixtureScenario",
    );
    expect(scenarioContent).toContain(
      "createManualEnableSkillsRuntimeFixtureScenario",
    );
    expect(scenarioContent).toContain("buildManualEnableSkillsRuntimeMetadata");
    expect(scenarioContent).toContain(
      "createExpertSkillsRuntimeFixtureScenario",
    );
    expect(scenarioContent).toContain(
      "createExpertPanelSkillsRuntimeFixtureScenario",
    );
    expect(scenarioContent).toContain("buildExpertSkillsRuntimeMetadata");
    expect(scenarioContent).toContain("buildExpertSkillsRuntimeCatalog");
    expect(scenarioContent).toContain(SKILLS_RUNTIME_EXPLICIT_PROMPT);
    expect(scenarioContent).toContain(SKILLS_RUNTIME_EXPLICIT_DONE_TEXT);
    expect(scenarioContent).toContain(SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT);
    expect(scenarioContent).toContain(SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT);
    expect(scenarioContent).toContain(EXPERT_SKILLS_RUNTIME_PROMPT);
    expect(scenarioContent).toContain(EXPERT_SKILLS_RUNTIME_DONE_TEXT);
    expect(scenarioContent).toContain(EXPERT_SKILLS_RUNTIME_PANEL_PROMPT);
    expect(scenarioContent).toContain(EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT);
    expect(scenarioContent).toContain(EXPERT_SKILLS_RUNTIME_SKILL_REF);
    expect(scenarioContent).toContain('trigger: "explicit"');
    expect(scenarioContent).toContain("explicit skill mention");
    expect(scenarioContent).toContain(
      'trigger: "workspace_panel_manual_enable"',
    );
    expect(scenarioContent).toContain("launched from Skills workspace panel");
    expect(scenarioContent).toContain('gateMode: "workspace_runtime_enable"');
    expect(scenarioContent).toContain("sourceAllowlist");
    expect(scenarioContent).toContain("searchToolCallId");
    expect(scenarioContent).toContain("skillToolCallId");
    expect(scenarioContent).toContain('toolName: "skill_search"');
    expect(scenarioContent).toContain('tool_family: "skill_search"');
    expect(scenarioContent).toContain("skill_search_query");
    expect(scenarioContent).toContain("skill_search_snapshot_skill_count");
    expect(scenarioContent).toContain("skill_search_result_count");
    expect(scenarioContent).toContain("skillRuntime");
    expect(scenarioContent).toContain("skill_body_read");
    expect(scenarioContent).toContain("skill_gate_decision");
    expect(scenarioContent).toContain('toolName: "Skill"');
    expect(scenarioContent).toContain('tool_family: "skill"');
    expect(scenarioContent).toContain("workspace_skill_runtime_enable");
    expect(scenarioContent).toContain("expertSkillsRuntime");
    expect(scenarioContent).toContain("expert_skills_runtime");
    expect(scenarioContent).toContain("guiSummaryText");
    expect(scenarioContent).toContain(
      "专家面板新增 Skill 后的下一轮 runtime 证据已完成",
    );
    expect(scenarioContent).toContain("expert_declared_skill_refs");
    expect(scenarioContent).toContain("expert_selected_skill");
    expect(scenarioContent).toContain("expert_invoked_skill");
    expect(scenarioContent).toContain("promptStarters");
    expect(scenarioContent).toContain(
      "EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS",
    );
    for (const assertionKey of EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS) {
      expect(content).toContain(assertionKey);
      expect(scenarioContent).toContain(assertionKey);
    }
    for (const assertionKey of EXPERT_PANEL_SKILLS_RUNTIME_ASSERTION_KEYS) {
      expect(content).toContain(assertionKey);
      expect(scenarioContent).toContain(assertionKey);
    }
    expect(scenarioContent).toContain("expertDeclaredObserved");
    expect(scenarioContent).toContain("expertSelectedObserved");
    expect(scenarioContent).toContain("expertInvokedObserved");
    expect(scenarioContent).toContain(
      "export function summarizeSkillsRuntimeEvidenceExport",
    );
    expect(content).not.toContain("agent_runtime_");
    expect(scenarioContent).not.toContain("agent_runtime_");
    expect(expertActionsContent).not.toContain("agent_runtime_");
  });

  it("covers the Right Surface visual matrix without a model turn", () => {
    const content = readSmokeScript();

    expect(content).toContain("right-surface-visual-matrix");
    expect(content).toContain("runRightSurfaceVisualMatrix");
    expect(content).toContain("create-right-surface-visual-expert-session");
    expect(content).toContain("run-right-surface-visual-matrix");
    expect(content).toContain("workspaceRightSurface/request");
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
    expect(content).toContain("workspace-agent-app-surface");
    expect(content).toContain("workspace-agent-app-surface-tabs");
    expect(content).toContain("workspace-agent-app-surface-frame");
    expect(content).toContain("workspace-agent-app-surface-viewport");
    expect(content).toContain("agent-app-shell-content-factory-app-main");
    expect(content).toContain("agent-app-shell-prompt-lab-app");
    expect(content).toContain("webContentsView");
    expect(content).toContain("iframe: false");
    expect(content).toContain("browserView: false");
    expect(content).toContain("rightSurfaceVisualMatrixHostsFillRightSide");
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

  it("covers content factory Product Profile through runtime event append and artifact read", () => {
    const content = readSmokeScript();

    expect(content).toContain("content-factory-product-profile");
    expect(content).toContain("runContentFactoryProductProfileScenario");
    expect(content).toContain("agentAppInstalled/save");
    expect(content).toContain("agentSession/turn/start");
    expect(content).toContain("agentSession/runtimeEvents/append");
    expect(content).toContain("artifact/read");
    expect(content).toContain("content_factory.workspace_patch");
    expect(content).toContain("contentFactoryWorkspacePatch");
    expect(content).toContain("内容工厂 Product Profile Fixture");
    expect(content).toContain("公众号文章草稿");
    expect(content).toContain("配图组");
    expect(content).toContain("视频分镜");
    expect(content).toContain("交付检查清单");
    expect(content).toContain("artifact-article-1");
    expect(content).toContain("artifact-image-1");
    expect(content).toContain("artifact-video-storyboard");
    expect(content).toContain("artifact-delivery-checklist");
    expect(content).toContain("artifact-image-regenerate-workspace-patch");
    expect(content).toContain("artifact-image-regenerated");
    expect(content).toContain("image_regenerate_job_1");
    expect(content).toContain("worker_dogfood");
    expect(content).toContain("contentFactoryProductProfileWorkerTurnStart");
    expect(content).toContain("contentFactoryProductProfileWorkerTurnExecuted");
    expect(content).toContain(
      "CONTENT_FACTORY_PRODUCT_PROFILE_REMOTE_REJECT_TURN_ID",
    );
    expect(content).toContain("AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED");
    expect(content).toContain("runRemotePluginRuntimeRejectionProbe");
    expect(content).toContain(
      "contentFactoryProductProfileRemoteRuntimeRejection",
    );
    expect(content).toContain(
      "contentFactoryProductProfileRemoteRuntimeFailClosed",
    );
    expect(content).toContain(
      "contentFactoryProductProfileStoryboardObjectSelection",
    );
    expect(content).toContain(
      "workspace-product-profile-object-videoStoryboard",
    );
    expect(content).toContain(
      "workspace-product-profile-app-declared-renderer",
    );
    expect(content).toContain("app_declared");
    expect(content).toContain("host_placeholder");
    expect(content).toContain("host_placeholder_only");
    expect(content).toContain("not_loaded");
    expect(content).toContain("rendererExecutionModelVisible");
    expect(content).toContain("entryLoadPolicyVisible");
    expect(content).toContain("executableHostAbsent");
    expect(content).toContain("app_declared_renderer_placeholder_only");
    expect(content).toContain("./renderer/storyboard.tsx");
    expect(content).toContain("open_storyboard");
    expect(content).toContain(
      "contentFactoryProductProfileRendererHostPlaceholderVisible",
    );
    expect(content).toContain("已重新生成 2 张候选图");
    expect(content).toContain("task-center-object-canvas-toggle");
    expect(content).toContain("workspace-product-profile-surface");
    expect(content).toContain("workspace-right-surface-host");
    expect(content).toContain("artifact_document.v1");
    expect(content).toContain("worker_invalid_json_output");
    expect(content).toContain("failureCategory");
    expect(content).toContain("retryAdvice");
    expect(content).toContain("inspect_worker_output");
    expect(content).toContain(
      "contentFactoryProductProfileDoesNotUseModelTurn",
    );
    expect(content).toContain(
      "contentFactoryProductProfileActionResultPatchProjected",
    );
    for (const assertionKey of CONTENT_FACTORY_PRODUCT_PROFILE_ASSERTION_KEYS) {
      expect(content).toContain(assertionKey);
    }
    expect(content).not.toContain("APP_SERVER_METHOD_CONTENT_FACTORY");
    expect(content).not.toContain("content_factory/start");
    expect(content).not.toContain("content_factory/generate");
    expect(content).not.toContain("BrowserView");
  });

  it("summarizes Skills runtime evidence with mixed camelCase and snake_case fields", () => {
    const scenario = createSkillsRuntimeFixtureScenario(
      "skills-runtime-unit-session",
    );
    const evidenceExportResult = {
      evidencePack: {
        observability_summary: {
          skillSearches: [
            {
              query: SKILLS_RUNTIME_QUERY,
              tool_call_id: scenario.searchToolCallId,
            },
          ],
          skill_invocations: [
            {
              skill_name: SKILLS_RUNTIME_SKILL_NAME,
              toolCallId: scenario.skillToolCallId,
              workspaceSkillRuntimeEnable: {
                source: "manual_session_enable",
                authorization_scope: "session",
              },
            },
          ],
        },
      },
      events: [
        {
          event_type: "tool.result",
          payload: {
            toolCallId: scenario.searchToolCallId,
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              skillRuntime: {
                event: "skill_body_read",
              },
            },
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              skill_runtime: {
                event: "skill_gate_decision",
                mode: "selected_skills",
              },
            },
          },
        },
        {
          eventType: "tool.result",
          payload: {
            tool_call_id: scenario.skillToolCallId,
          },
        },
      ],
    };

    expect(
      summarizeSkillsRuntimeEvidenceExport(evidenceExportResult, scenario),
    ).toMatchObject({
      hasEvidencePack: true,
      eventCount: 4,
      skillSearchCount: 1,
      skillInvocationCount: 1,
      hasSkillSearchSummary: true,
      hasSkillInvocationSummary: true,
      skillBodyReadObserved: true,
      skillGateObserved: true,
      skillGateMode: "selected_skills",
      skillGateWorkspaceRuntimeEnable: null,
      skillGateSourceAllowlist: [],
      skillSearchEventIndex: 0,
      skillBodyReadEventIndex: 1,
      skillGateEventIndex: 2,
      skillInvocationEventIndex: 3,
      skillSearchBeforeSkillInvocation: true,
      searchQuery: SKILLS_RUNTIME_QUERY,
      invocationSkillName: SKILLS_RUNTIME_SKILL_NAME,
    });
  });

  it("ties Skills runtime body and gate evidence to the selected tool-call pair", () => {
    const natural = createSkillsRuntimeFixtureScenario(
      "skills-runtime-unit-session",
    );
    const explicit = createSkillsRuntimeFixtureScenario(
      "skills-runtime-unit-session",
      { variant: "explicit" },
    );
    const evidenceExportResult = {
      evidencePack: {
        observabilitySummary: {
          skillSearches: [
            {
              query: SKILLS_RUNTIME_QUERY,
              toolCallId: natural.searchToolCallId,
            },
            {
              query: SKILLS_RUNTIME_QUERY,
              toolCallId: explicit.searchToolCallId,
            },
          ],
          skillInvocations: [
            {
              skillName: SKILLS_RUNTIME_SKILL_NAME,
              toolCallId: natural.skillToolCallId,
              workspaceSkillRuntimeEnable: { source: "manual_session_enable" },
            },
          ],
        },
      },
      events: [
        {
          type: "tool.result",
          payload: { toolCallId: natural.searchToolCallId },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: { skillRuntime: { event: "skill_body_read" } },
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: { skillRuntime: { event: "skill_gate_decision" } },
          },
        },
        {
          type: "tool.result",
          payload: { toolCallId: natural.skillToolCallId },
        },
        {
          type: "tool.result",
          payload: { toolCallId: explicit.searchToolCallId },
        },
        {
          type: "tool.result",
          payload: { toolCallId: explicit.skillToolCallId },
        },
      ],
    };

    expect(
      summarizeSkillsRuntimeEvidenceExport(evidenceExportResult, natural),
    ).toMatchObject({
      skillBodyReadObserved: true,
      skillGateObserved: true,
      skillSearchBeforeSkillInvocation: true,
    });
    expect(
      summarizeSkillsRuntimeEvidenceExport(evidenceExportResult, explicit),
    ).toMatchObject({
      hasSkillSearchSummary: true,
      hasSkillInvocationSummary: false,
      skillBodyReadObserved: false,
      skillGateObserved: false,
      skillSearchBeforeSkillInvocation: true,
    });
  });

  it("summarizes the manual-enable Skills runtime gate mode and allowlist", () => {
    const scenario = createManualEnableSkillsRuntimeFixtureScenario(
      "skills-runtime-unit-session",
    );
    const evidenceExportResult = {
      evidencePack: {
        observabilitySummary: {
          skillSearches: [
            {
              query: SKILLS_RUNTIME_QUERY,
              toolCallId: scenario.searchToolCallId,
            },
          ],
          skillInvocations: [
            {
              skillName: SKILLS_RUNTIME_SKILL_NAME,
              toolCallId: scenario.skillToolCallId,
              workspaceSkillRuntimeEnable: { source: "manual_session_enable" },
            },
          ],
        },
      },
      events: [
        {
          type: "tool.result",
          payload: { toolCallId: scenario.searchToolCallId },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: { skillRuntime: { event: "skill_body_read" } },
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              skill_runtime: {
                event: "skill_gate_decision",
                mode: "workspace_runtime_enable",
                workspace_runtime_enable: true,
                source_allowlist: [SKILLS_RUNTIME_SKILL_NAME],
              },
            },
          },
        },
        {
          type: "tool.result",
          payload: { toolCallId: scenario.skillToolCallId },
        },
      ],
    };

    expect(
      summarizeSkillsRuntimeEvidenceExport(evidenceExportResult, scenario),
    ).toMatchObject({
      hasSkillSearchSummary: true,
      hasSkillInvocationSummary: true,
      skillBodyReadObserved: true,
      skillGateObserved: true,
      skillGateMode: "workspace_runtime_enable",
      skillGateWorkspaceRuntimeEnable: true,
      skillGateSourceAllowlist: [SKILLS_RUNTIME_SKILL_NAME],
      skillSearchBeforeSkillInvocation: true,
      searchQuery: SKILLS_RUNTIME_QUERY,
      invocationSkillName: SKILLS_RUNTIME_SKILL_NAME,
    });
  });

  it("summarizes expert Skills runtime declaration, selection, and invocation evidence", () => {
    const scenario = createExpertSkillsRuntimeFixtureScenario(
      "expert-skills-runtime-unit-session",
    );
    const evidenceExportResult = {
      evidencePack: {
        observability_summary: {
          skill_searches: [
            {
              query: SKILLS_RUNTIME_QUERY,
              toolCallId: scenario.searchToolCallId,
            },
          ],
          skillInvocations: [
            {
              skill_name: SKILLS_RUNTIME_SKILL_NAME,
              tool_call_id: scenario.skillToolCallId,
              workspace_skill_runtime_enable: {
                source: "manual_session_enable",
              },
            },
          ],
        },
      },
      events: [
        {
          type: "runtime.status",
          payload: {
            metadata: {
              expertSkillsRuntime: {
                event: "expert_declared_skill_refs",
                skillRefs: [EXPERT_SKILLS_RUNTIME_SKILL_REF],
              },
            },
          },
        },
        {
          event_type: "tool.result",
          payload: { tool_call_id: scenario.searchToolCallId },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              skillRuntime: { event: "skill_body_read" },
            },
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              skill_runtime: {
                event: "skill_gate_decision",
                mode: "selected_skills",
              },
            },
          },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              expert_skills_runtime: {
                event: "expert_selected_skill",
                skill_name: SKILLS_RUNTIME_SKILL_NAME,
              },
            },
          },
        },
        {
          eventType: "tool.result",
          payload: { toolCallId: scenario.skillToolCallId },
        },
        {
          type: "runtime.status",
          payload: {
            metadata: {
              expertSkillsRuntime: {
                event: "expert_invoked_skill",
                skillName: SKILLS_RUNTIME_SKILL_NAME,
              },
            },
          },
        },
      ],
    };

    expect(
      summarizeSkillsRuntimeEvidenceExport(evidenceExportResult, scenario),
    ).toMatchObject({
      hasEvidencePack: true,
      eventCount: 7,
      hasSkillSearchSummary: true,
      hasSkillInvocationSummary: true,
      skillBodyReadObserved: true,
      skillGateObserved: true,
      skillGateMode: "selected_skills",
      expertDeclaredObserved: true,
      expertSelectedObserved: true,
      expertInvokedObserved: true,
      expertDeclaredSkillRefs: [EXPERT_SKILLS_RUNTIME_SKILL_REF],
      expertSelectedSkill: SKILLS_RUNTIME_SKILL_NAME,
      expertInvokedSkill: SKILLS_RUNTIME_SKILL_NAME,
      skillSearchBeforeSkillInvocation: true,
      searchQuery: SKILLS_RUNTIME_QUERY,
      invocationSkillName: SKILLS_RUNTIME_SKILL_NAME,
    });
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

  it("keeps the Skills runtime fixture in the current Agent Runtime regression smoke", () => {
    const content = readCurrentFixtureRegressionSmokeScript();

    expect(content).toContain(
      "Claw Skills Runtime natural + explicit $skill + Skills workspace try Electron fixture",
    );
    expect(content).toContain("claw-chat-current-fixture-smoke.mjs");
    expect(content).toContain('"skills-runtime"');
    expect(content).toContain(
      "claw-chat-current-fixture-skills-runtime-regression",
    );
    expect(content).toContain(
      "Skills Runtime natural + 显式 $skill + 技能中心试用入口三入口按需加载 Electron fixture",
    );
    expect(content).toContain(
      "Claw MCP structuredContent Agent Chat GUI Electron fixture",
    );
    expect(content).toContain('"mcp-structured-content"');
    expect(content).toContain(
      "claw-chat-current-fixture-mcp-structured-content-regression",
    );
    expect(content).toContain(
      "MCP structuredContent 到 Agent Chat GUI 可见 Electron fixture",
    );
    expect(content).toContain(
      "Claw Expert Skills Runtime declared + selected + invoked Electron fixture",
    );
    expect(content).toContain('"expert-skills-runtime"');
    expect(content).toContain(
      "claw-chat-current-fixture-expert-skills-runtime-regression",
    );
    expect(content).toContain(
      "Expert Skills Runtime declared + selected + invoked Electron fixture",
    );
    expect(content).toContain(
      "Claw Expert Plaza Skills Runtime click-through Electron fixture",
    );
    expect(content).toContain('"expert-plaza-skills-runtime"');
    expect(content).toContain(
      "claw-chat-current-fixture-expert-plaza-skills-runtime-regression",
    );
    expect(content).toContain(
      "Expert Plaza 点击专家卡片进入同一 Skills Runtime 闭环 Electron fixture",
    );
    expect(content).toContain(
      "Claw Expert Panel Skills Runtime override Electron fixture",
    );
    expect(content).toContain('"expert-panel-skills-runtime"');
    expect(content).toContain(
      "claw-chat-current-fixture-expert-panel-skills-runtime-regression",
    );
    expect(content).toContain(
      "ExpertInfoPanel 调整 skillRefs 后下一轮继承同一 Skills Runtime 闭环并展示 Evidence Pack 复盘 Electron fixture",
    );
    expect(content).toContain('LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0"');
    expect(content).toContain('LIME_REAL_API_TEST: "0"');
  });
});
