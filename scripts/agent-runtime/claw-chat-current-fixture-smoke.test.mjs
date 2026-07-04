import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_FACTORY_ARTICLE_WORKSPACE_ASSERTION_KEYS } from "./claw-chat-current-fixture-constants.mjs";
import { isRightSurfaceSnapshotReady } from "./claw-chat-current-fixture-right-surface-visual.mjs";
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
  "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-image-command-workflow-read.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-skills-workspace.mjs",
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
  "scripts/agent-runtime/claw-chat-current-fixture-content-factory-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-not-applicable-assertions.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertion-context.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-assertions.mjs",
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

function readFixtureUtilsScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-utils.mjs",
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
    expect(content).toContain("recordAgentUiPerformanceTraceEvidence");
    expect(content).toContain("agentUiPerformanceTraceLatest");
    expect(content).toContain("traceEvidenceHasProviderAndClient(evidence)");
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
    expect(content).toContain('type: "turn.completed"');
    expect(content).toContain('type: "turn.canceled"');
    expect(content).not.toContain('type: "turn.final_done"');
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

  it("covers Soul style config through the real Electron fixture without exposing prompt payload", () => {
    const content = readSmokeScript();

    expect(content).toContain("soul-style");
    expect(content).toContain("SOUL_STYLE_SCENARIO");
    expect(content).toContain("SOUL_STYLE_PROFILE_ID");
    expect(content).toContain("SOUL_STYLE_INTENSITY");
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
    expect(content).toContain("hasIntensity");
    expect(content).toContain("soulStyleReadModelCompleted");
    expect(content).toContain("soulStyleGuiCompleted");
    expect(content).toContain("!isSoulStyleScenario");
    expect(content).toContain('options.scenario === SOUL_STYLE_SCENARIO');
    expect(content).toContain('options.scenario !== SOUL_STYLE_SCENARIO');
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

  it("covers Claw @配图 through ImageCommandWorkflow and current task artifact", () => {
    const content = readSmokeScript();
    const imageCommandContent = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs",
      "utf8",
    );
    const rpcContent = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-rpc.mjs",
      "utf8",
    );

    expect(content).toContain("image-command");
    expect(content).toContain("plain-image-intent");
    expect(content).toContain("IMAGE_COMMAND_SCENARIO");
    expect(content).toContain("PLAIN_IMAGE_INTENT_SCENARIO");
    expect(content).toContain("@配图 E2E 图片命令路由测试，请生成一张青柠插画");
    expect(content).toContain("画一张广州夏天的图");
    expect(content).toContain("@配图 ${PLAIN_IMAGE_INTENT_PROMPT}");
    expect(imageCommandContent).toContain("expectedSessionId: SESSION_ID");
    expect(content).toContain("ensure-fixture-image-provider");
    expect(rpcContent).toContain("modelProvider/create");
    expect(rpcContent).toContain("modelProviderKey/create");
    expect(rpcContent).toContain("media_defaults");
    expect(content).toContain("image_command_intent");
    expect(content).toContain("imageCommandLegacySkillLaunchNotSubmitted");
    expect(content).toContain("image_task");
    expect(imageCommandContent).not.toContain(
      'entrySource: "plain_image_intent"',
    );
    expect(imageCommandContent).toContain('entrySource: "at_image_command"');
    expect(imageCommandContent).not.toContain("IMAGE_COMMAND_SKILL_NAME");
    expect(imageCommandContent).not.toContain(
      "IMAGE_COMMAND_SKILL_TOOL_CALL_ID",
    );
    expect(imageCommandContent).toContain("image_command_workflow");
    expect(content).toContain("lime_create_image_generation_task");
    expect(content).toContain("IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID");
    expect(content).toContain("mediaTaskArtifact/image/create");
    expect(content).toContain("mediaTaskArtifact/get");
    expect(content).toContain("mediaTaskArtifact/list");
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "runtime"');
    expect(content).toContain("media_runtime_worker");
    expect(content).toContain("lime-image-api-worker");
    expect(content).toContain(".lime/tasks/image_generate");
    expect(content).toContain("runImageCommandScenario");
    expect(content).toContain("waitForImageCommandWorkflowTaskArtifact");
    expect(content).toContain("isImageIntentScenario");
    expect(content).toContain("waitForGuiImageCommandCompleted");
    expect(content).toContain("waitForGuiImageCommandTerminal");
    expect(content).toContain("waitForSessionReadImageCommandCompleted");
    expect(content).toContain("waitForImageCommandTaskArtifactTerminal");
    expect(content).not.toContain("createImageCommandTaskArtifact");
    expect(content).not.toContain("completeImageCommandTaskArtifact");
    expect(content).not.toContain("completeImageCommandTaskArtifactFile");
    expect(content).toContain("imageCommandTaskArtifactTerminalPatch");
    expect(content).toContain("completeMethodUsed");
    expect(content).toContain("imageCommandTaskArtifactTerminal");
    expect(content).toContain("imageCommandTaskArtifactAfterReload");
    expect(content).toContain("imageCommandTaskAuditLog");
    expect(content).toContain("EXPECTED_IMAGE_TASK_AUDIT_EVENTS");
    expect(content).toContain("worker_loaded");
    expect(content).toContain("request_slot_succeeded");
    expect(content).toContain("task_succeeded");
    expect(content).toContain("guiImageCommandRestoredAfterReload");
    expect(content).toContain("agentUiPerformanceTracePreReload");
    expect(content).toContain("collectAgentUiPerformanceTraceEvidence");
    expect(content).toContain("image-workbench-message-preview-${taskId}");
    expect(content).toContain("page.reload");
    expect(content).toContain("imageCommandTaskArtifact");
    expect(content).toContain("imageCommandPromptReachedBackend");
    expect(content).toContain("imageCommandMetadataReachedBackend");
    expect(content).toContain(
      "imageCommandUsedCurrentMediaTaskArtifactMethods",
    );
    expect(content).toContain("imageCommandTaskArtifactWritten");
    expect(content).toContain("imageCommandTaskArtifactTerminal");
    expect(content).toContain("imageCommandTaskArtifactSameTaskUpdated");
    expect(content).toContain("imageCommandTaskAuditLogWritten");
    expect(content).toContain("imageCommandTaskAuditLogEventSequence");
    expect(content).toContain("imageCommandTaskAuditLogNoSensitiveTokens");
    expect(content).toContain("readImageCommandWorkflowAudit");
    expect(content).toContain("APP_SERVER_METHOD_WORKFLOW_READ");
    expect(content).toContain("workflow/read");
    expect(content).toContain("imageCommandWorkflowRead");
    expect(content).toContain("imageCommandWorkflowAuditReadModelProjected");
    expect(content).toContain("imageCommandWorkflowAuditStepsProjected");
    expect(content).toContain("imageCommandWorkflowAuditSummaryRedacted");
    expect(content).toContain("image-command-run-${turnId}");
    expect(content).toContain("imageCommandWorkerUsedFixtureProviderAndModel");
    expect(content).toContain("imageCommandFixtureProvider");
    expect(content).toContain("bodyIncludesModel");
    expect(content).toContain("headerProviderId");
    expect(content).toContain("imageCommandWorkflowToolObserved");
    expect(content).toContain("imageCommandCreateTaskToolObserved");
    expect(content).toContain("guiImageCommandToolProcessVisible");
    expect(content).toContain("guiImageCommandTaskCardVisible");
    expect(content).toContain("guiImageCommandTaskCardTerminal");
    expect(content).toContain("guiImageCommandSingleTaskCard");
    expect(content).toContain("guiImageCommandRestoredAfterReload");
    expect(content).toContain("hasLoadedVisiblePreviewImage");
    expect(content).toContain("guiImageCommandNoDraftCard");
    expect(content).toContain("guiImageCommandNoTemplateTaskId");
    expect(imageCommandContent).toContain("suppresses submission-summary chat");
    expect(imageCommandContent).toContain(
      "snapshot.hasVisibleImageTaskProcess",
    );
    expect(imageCommandContent).not.toContain(
      "(snapshot.hasAssistantSummary || snapshot.hasDoneText) &&",
    );
    expect(imageCommandContent).not.toContain(
      "snapshot.hasPresentationCaption === true",
    );
    expect(content).toContain("readModelImageCommandTaskPreviewObserved");
    expect(content).toContain("IMAGE_COMMAND_ASSERTION_KEYS");
    expect(content).toContain("draft-image-");
    expect(content).toContain("{task_id}");
    expect(content).not.toContain("execute_skill");
    expect(content).not.toContain("agent_runtime_submit_turn");
  });

  it("covers Skills runtime search, on-demand body load, gate, and Evidence Pack in the real Electron fixture", () => {
    const content = readSmokeScript();
    const scenarioContent = readSkillsRuntimeFixtureScenario();
    const expertActionsContent = readExpertActionsScript();
    const sessionContent = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-session.mjs",
      "utf8",
    );
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
    expect(expertActionsContent).toContain("EXPERT_SKILLS_RUNTIME_SKILL_REF");
    expect(expertActionsContent).not.toContain("skill:local:capability-report");
    expect(sessionContent).toContain("lime:skill-catalog-changed");
    expect(sessionContent).toContain('source: "manual_override"');
    expect(sessionContent).toContain("window.__LIME_OEM_CLOUD__?.tenantId");
    expect(sessionContent).toContain(
      "buildExpertPanelWorkspaceSkillCatalog(options.workspaceSkill, { tenantId })",
    );
    expect(sessionContent).toContain("EXPERT_SKILLS_RUNTIME_TENANT_ID");
    expect(scenarioContent).toContain("EXPERT_SKILLS_RUNTIME_TENANT_ID");
    expect(expertRuntimeContent).toContain(
      "EXPERT_PANEL_SKILLS_RUNTIME_UI_ADD_TEST_ID",
    );
    expect(expertRuntimeContent).toContain(
      "EXPERT_PANEL_SKILLS_RUNTIME_UI_CHIP_TEST_ID",
    );
    expect(content).toContain("selectExpertPanelSkillsRuntimeSessionId");
    expect(content).toContain("summary.expertPanelSkillsRuntimeSessionId");
    expect(content).toContain("expertPanelSkillsRuntimeSessionId");
    expect(content).toContain("reopen-expert-panel-skills-runtime-session");
    expect(content).toContain("guiExpertPanelSkillsRuntimeSessionReopened");
    expect(content).toContain(
      "openSessionFromSidebar(page, options, appServerRequests",
    );
    expect(content).toContain("expectedSessionId");
    expect(content).toContain(
      "{ expectedSessionId: expertPlazaSkillsRuntimeSessionId }",
    );
    expect(expertRuntimeContent).toContain("data-session-id");
    expect(expertRuntimeContent).toContain("hasAddedSkill");
    expect(content).toContain("expertPlazaCatalogInjected");
    expect(content).toContain("expertPlazaCardClicked");
    expect(content).toContain("expertPlazaAutoSendTurnStarted");
    expect(content).toContain("expertPanelSkillPickerOpened");
    expect(content).toContain("expertPanelSkillAdded");
    expect(content).toContain("expertPanelAddedSkillVisible");
    expect(content).toContain("expertPanelEvidencePackGuiExport");
    expect(content).toContain(
      "expertPanelEvidencePackExportedFromHarnessPanel",
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
    expect(content).toContain("manualEnableSkillsRuntimeUsedAgentSession");
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
      "rightSurfaceVisualMatrixArticleWorkspaceRailVisible",
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

  it("covers content factory Article Workspace through runtime event append and artifact read", () => {
    const content = readSmokeScript();
    const contentFactoryScenario = fs.readFileSync(
      "scripts/agent-runtime/claw-chat-current-fixture-content-factory-article-workspace.mjs",
      "utf8",
    );

    expect(content).toContain("content-factory-article-workspace");
    expect(content).toContain("content-factory-inline-image-article-workspace");
    expect(content).toContain("runContentFactoryArticleWorkspaceScenario");
    expect(content).toContain(
      "runContentFactoryInlineImageArticleWorkspaceScenario",
    );
    expect(content).toContain("pluginInstalled/save");
    expect(content).toContain("agentSession/turn/start");
    expect(content).toContain("agentSession/runtimeEvents/append");
    expect(content).toContain("workflow/read");
    expect(content).toContain("workflow/respond");
    expect(content).toContain("workflow/cancel");
    expect(content).toContain("workflow/retry");
    expect(contentFactoryScenario).toContain("workflow.run.started");
    expect(contentFactoryScenario).toContain("workflow.step.waiting");
    expect(contentFactoryScenario).toContain(
      "summarizeContentFactoryWorkflowRead",
    );
    expect(contentFactoryScenario).toContain(
      "summarizeContentFactoryWorkflowControl",
    );
    expect(content).toContain("artifact/read");
    expect(content).toContain("content_factory.workspace_patch");
    expect(content).toContain("contentFactoryWorkspacePatch");
    expect(content).toContain("内容工厂 Article Editor Fixture");
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
    expect(content).toContain("contentFactoryArticleWorkspaceWorkerTurnStart");
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkerHostGenerationFixture",
    );
    expect(content).toContain("contentFactoryHostGenerationAsterChatRequest");
    expect(content).toContain("startContentFactoryHostGenerationFixture");
    expect(content).toContain("fixture-openai");
    expect(content).toContain("article-draft-document");
    const contentWithoutForbiddenMarkerGuard =
      removeContentFactoryForbiddenMarkerGuard(content);
    expect(contentWithoutForbiddenMarkerGuard).not.toContain(
      "受控宿主生成标题",
    );
    expect(contentWithoutForbiddenMarkerGuard).not.toContain(
      "内容工厂插件化写作：让文章生产可审计",
    );
    expect(contentFactoryScenario).toContain(
      "articleCanvasHasForbiddenTemplate",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkerTurnExecuted",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkerAuditFactsHidden",
    );
    expect(content).toContain("contentFactoryArticleWorkspaceWorkflowRead");
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkflowReadModelProjected",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkflowRespondProjected",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkflowCancelProjected",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceWorkflowRetryProjected",
    );
    expect(content).toContain("content.article.generate");
    expect(content).toContain(
      "options.scenario === CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO",
    );
    expect(content).toContain(
      "options.scenario !== CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO",
    );
    expect(content).toContain("CONTENT_FACTORY_INLINE_IMAGE_SLOT_ID");
    expect(content).toContain("contentFactoryInlineImageTaskEventEmitted");
    expect(content).toContain("contentFactoryInlineImageArticleRestored");
    expect(content).toContain("mediaTaskArtifact/image/create");
    expect(content).toContain("mediaTaskArtifact/image/complete");
    expect(content).toContain(
      "readModel.workerArticleObject?.hostManagedGenerationStatus ===",
    );
    expect(content).toContain('"completed"');
    expect(content).not.toContain(
      'readModel.workerArticleObject?.hostManagedGenerationStatus ===\n        "unavailable"',
    );
    expect(content).toContain(
      "CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_TURN_ID",
    );
    expect(content).toContain("PLUGIN_WORKER_CONTRACT_UNSUPPORTED");
    expect(content).toContain("runRuntimeContractRejectionProbe");
    expect(content).toContain(
      "contentFactoryArticleWorkspaceRuntimeContractRejection",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceRuntimeContractFailClosed",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceStoryboardObjectSelection",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceArticleObjectSelection",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceArticleCanvasSurface",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceArticleCanvasSurfaceVisible",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceEditedDraftUpdate",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceEditedDraftSessionReopened",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceEditedDraftReload",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceEditedDraftArtifactFrame",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceEditedDraftRestored",
    );
    expect(content).toContain("E2E_EDITED_ARTICLE_DRAFT_RESTORED");
    expect(contentFactoryScenario).toContain(
      "reloadContentFactoryArticleWorkspaceSession",
    );
    expect(contentFactoryScenario).toContain("reloadRendererDocument");
    expect(contentFactoryScenario).toContain(
      "updateContentFactoryArticleWorkspaceEditedDraft",
    );
    expect(contentFactoryScenario).toContain(
      "waitForContentFactoryArticleWorkspaceEditedDraftRestored",
    );
    expect(contentFactoryScenario).toContain(
      "readContentFactoryArticleDraftObjectRef",
    );
    expect(contentFactoryScenario).toContain("article-artifact-frame");
    expect(contentFactoryScenario).toContain(
      "clickContentFactoryArticleArtifactFrame",
    );
    expect(contentFactoryScenario).toContain(
      "waitForContentFactoryArticleEditorOpened",
    );
    expect(contentFactoryScenario).not.toContain(
      'toggleTestId: "task-center-object-canvas-toggle"',
    );
    expect(content).toContain("workspace-article-editor-related-articleDraft");
    expect(content).toContain(
      "workspace-article-editor-related-videoStoryboard",
    );
    expect(content).toContain("workspace-article-editor-title-candidates");
    expect(content).toContain("workspace-article-editor-research");
    expect(content).toContain("workspace-article-editor-outline");
    expect(content).toContain("workspace-article-editor-citations");
    expect(content).toContain("workspace-article-editor-image-slots");
    expect(content).toContain("workspace-article-editor-canvas");
    expect(content).toContain("documentCanvasText.includes");
    expect(contentFactoryScenario).toContain(
      "FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS",
    );
    expect(contentFactoryScenario).toContain("metadataPanelsHidden");
    expect(contentFactoryScenario).toContain(
      "articleCanvasHasForbiddenTemplate",
    );
    expect(contentFactoryScenario).toContain("snapshot.metadataPanelsHidden");
    expect(contentFactoryScenario).toContain("snapshot.hasFullArticleCanvas");
    expect(contentFactoryScenario).not.toContain("researchText.includes");
    expect(contentFactoryScenario).not.toContain("takeawaysText.length");
    expect(contentFactoryScenario).not.toContain("writingPlanText.length");
    expect(content).toContain("snapshot.hasArticleCanvasContent");
    expect(content).toContain("readModel.hasImageSetObject");
    expect(content).toContain("readModel.hasStoryboardObject");
    expect(content).toContain("readModel.hasChecklistObject");
    expect(content).toContain(
      "workspace-article-workspace-app-declared-renderer",
    );
    expect(content).toContain("app_declared");
    expect(content).toContain("host_placeholder");
    expect(content).toContain("host_placeholder_only");
    expect(content).toContain("rendererContract");
    expect(content).toContain("not_loaded");
    expect(content).toContain("rendererExecutionModelVisible");
    expect(content).toContain("entryLoadPolicyVisible");
    expect(content).toContain("executableHostAbsent");
    expect(content).toContain("app_declared_renderer_placeholder_only");
    expect(content).toContain("./renderer/storyboard.tsx");
    expect(content).toContain("open_storyboard");
    expect(content).toContain(
      "contentFactoryArticleWorkspaceStoryboardRendererContractPreserved",
    );
    expect(content).toContain("已重新生成 2 张候选图");
    expect(content).toContain("workspace-article-editor-surface");
    expect(content).toContain("workspace-right-surface-host");
    expect(content).toContain("artifact_document.v1");
    expect(content).toContain("worker_invalid_json_output");
    expect(content).toContain("failureCategory");
    expect(content).toContain("retryAdvice");
    expect(content).toContain("inspect_worker_output");
    expect(content).toContain(
      "contentFactoryArticleWorkspaceDoesNotUseModelTurn",
    );
    expect(content).toContain(
      "contentFactoryArticleWorkspaceActionResultPatchProjected",
    );
    for (const assertionKey of CONTENT_FACTORY_ARTICLE_WORKSPACE_ASSERTION_KEYS) {
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
