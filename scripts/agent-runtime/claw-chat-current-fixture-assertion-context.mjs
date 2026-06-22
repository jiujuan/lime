import {
  CONTINUE_PROMPT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  GOAL_PROMPT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  NEWS_PROMPT,
  PLAN_PROMPT,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_PROMPT,
  WEB_TOOLS_RENDERING_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF } from "./claw-chat-current-fixture-expert-actions.mjs";
import { collectTraceRequestMethods } from "./claw-chat-current-fixture-rpc.mjs";
import {
  readHarnessMetadataFromTurnStart,
  readObjectiveTextFromHarness,
  readWorkspaceSkillRuntimeEnableFromTurnStart,
} from "./claw-chat-current-fixture-backend-ledger.mjs";

export function buildAssertionContext({
  backendLedger,
  traceMessages,
  appServerRequests,
  rendererSnapshot,
  summary,
  pageText,
  errorRaw,
  actionableConsoleErrors,
  workspace,
  options,
}) {
    const appServerRequestMethods = Array.from(
      new Set(
        [
          ...appServerRequests.map((request) => request.method),
          ...collectTraceRequestMethods(traceMessages),
        ].filter(Boolean),
      ),
    );
    const latestTurnStart = backendLedger
      .filter((entry) => entry.kind === "turnStart")
      .at(-1);
    const planImplementationTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" && entry.inputText === "Implement the plan.",
    );
    const newsTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === NEWS_PROMPT,
    );
    const planTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === PLAN_PROMPT,
    );
    const goalTurnStart = backendLedger.find(
      (entry) => entry.kind === "turnStart" && entry.inputText === GOAL_PROMPT,
    );
    const webToolsRenderingTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === WEB_TOOLS_RENDERING_PROMPT,
    );
    const mcpStructuredContentTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === MCP_STRUCTURED_CONTENT_PROMPT,
    );
    const skillsRuntimeTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" && entry.inputText === SKILLS_RUNTIME_PROMPT,
    );
    const explicitSkillsRuntimeTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === SKILLS_RUNTIME_EXPLICIT_PROMPT,
    );
    const manualEnableSkillsRuntimeTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
    );
    const expertSkillsRuntimeTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        String(entry.inputText || "").includes(EXPERT_SKILLS_RUNTIME_PROMPT),
    );
    const expertPanelSkillsRuntimeTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
    );
    const continueTurnStart = backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" && entry.inputText === CONTINUE_PROMPT,
    );
    const latestTurnCancel = backendLedger
      .filter((entry) => entry.kind === "turnCancel")
      .at(-1);
    const isCancelOnlyScenario = options.scenario === "cancel";
    const isCancelThenContinueScenario =
      options.scenario === "cancel-then-continue";
    const isPlanScenario = options.scenario === "plan";
    const isGoalScenario = options.scenario === "goal";
    const isWebToolsRenderingScenario =
      options.scenario === "web-tools-rendering";
    const isMcpStructuredContentScenario =
      options.scenario === "mcp-structured-content";
    const isSkillsRuntimeScenario = options.scenario === "skills-runtime";
    const isExpertSkillsRuntimeScenario =
      options.scenario === "expert-skills-runtime";
    const isExpertPlazaSkillsRuntimeScenario =
      options.scenario === "expert-plaza-skills-runtime";
    const isExpertPanelSkillsRuntimeScenario =
      options.scenario === "expert-panel-skills-runtime";
    const isAnyExpertSkillsRuntimeScenario =
      isExpertSkillsRuntimeScenario ||
      isExpertPlazaSkillsRuntimeScenario ||
      isExpertPanelSkillsRuntimeScenario;
    const expertRuntimeTurnStartForAssertions =
      isExpertPanelSkillsRuntimeScenario
        ? expertPanelSkillsRuntimeTurnStart
        : expertSkillsRuntimeTurnStart;
    const asterChatRequest =
      (isPlanScenario
        ? planTurnStart?.asterChatRequest
        : isGoalScenario
          ? goalTurnStart?.asterChatRequest
          : isWebToolsRenderingScenario
            ? webToolsRenderingTurnStart?.asterChatRequest
            : isMcpStructuredContentScenario
              ? mcpStructuredContentTurnStart?.asterChatRequest
              : isSkillsRuntimeScenario
                ? skillsRuntimeTurnStart?.asterChatRequest
                : isAnyExpertSkillsRuntimeScenario
                  ? expertRuntimeTurnStartForAssertions?.asterChatRequest
            : newsTurnStart?.asterChatRequest) ?? {};
    const hasCancelPhase = isCancelOnlyScenario || isCancelThenContinueScenario;
    const goalHarness = readHarnessMetadataFromTurnStart(goalTurnStart);
    const goalObjectiveText = readObjectiveTextFromHarness(goalHarness);
    const manualEnableRuntimeMetadata =
      readWorkspaceSkillRuntimeEnableFromTurnStart(
        manualEnableSkillsRuntimeTurnStart,
      );
    const manualEnableRuntimeBinding = Array.isArray(
      manualEnableRuntimeMetadata?.bindings,
    )
      ? manualEnableRuntimeMetadata.bindings[0]
      : null;
    const expertRuntimeMetadata =
      expertRuntimeTurnStartForAssertions?.runtimeOptions?.metadata?.expert ??
      expertRuntimeTurnStartForAssertions?.asterChatRequest?.turn_config?.metadata
        ?.expert ??
      expertRuntimeTurnStartForAssertions?.asterChatRequest?.turnConfig?.metadata
        ?.expert ??
      {};
    const expertHarnessMetadata =
      expertRuntimeTurnStartForAssertions?.runtimeOptions?.metadata?.harness?.expert ??
      expertRuntimeTurnStartForAssertions?.asterChatRequest?.turn_config?.metadata
        ?.harness?.expert ??
      expertRuntimeTurnStartForAssertions?.asterChatRequest?.turnConfig?.metadata
        ?.harness?.expert ??
      {};
    const rawExpertHarnessSkillRefs =
      expertHarnessMetadata?.skill_refs ??
      expertHarnessMetadata?.skillRefs ??
      [];
    const expertHarnessSkillRefs = Array.isArray(rawExpertHarnessSkillRefs)
      ? rawExpertHarnessSkillRefs
      : [];
    const expectedExpertHarnessSkillRef = isExpertPanelSkillsRuntimeScenario
      ? EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF
      : EXPERT_SKILLS_RUNTIME_SKILL_REF;
    const collaborationMode =
      asterChatRequest?.turn_config?.metadata?.harness?.collaboration_mode
        ?.mode ??
      asterChatRequest?.turnConfig?.metadata?.harness?.collaborationMode
        ?.mode ??
      (isPlanScenario
        ? planTurnStart?.runtimeOptions?.metadata?.harness?.collaboration_mode
            ?.mode ??
          planTurnStart?.runtimeOptions?.metadata?.harness?.collaborationMode
            ?.mode
        : null);
    const guiTurnStartReachedBackend = isPlanScenario
        ? planTurnStart?.inputText === PLAN_PROMPT
        : isGoalScenario
          ? goalTurnStart?.inputText === GOAL_PROMPT
          : isWebToolsRenderingScenario
            ? webToolsRenderingTurnStart?.inputText === WEB_TOOLS_RENDERING_PROMPT
            : isMcpStructuredContentScenario
              ? mcpStructuredContentTurnStart?.inputText ===
                MCP_STRUCTURED_CONTENT_PROMPT
              : isSkillsRuntimeScenario
                ? skillsRuntimeTurnStart?.inputText === SKILLS_RUNTIME_PROMPT &&
                  explicitSkillsRuntimeTurnStart?.inputText ===
                    SKILLS_RUNTIME_EXPLICIT_PROMPT &&
                  manualEnableSkillsRuntimeTurnStart?.inputText ===
                    SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT
                : isAnyExpertSkillsRuntimeScenario
                  ? isExpertPanelSkillsRuntimeScenario
                    ? expertPanelSkillsRuntimeTurnStart?.inputText ===
                      EXPERT_SKILLS_RUNTIME_PANEL_PROMPT
                    : expertSkillsRuntimeTurnStart?.inputText?.includes(
                      EXPERT_SKILLS_RUNTIME_PROMPT,
                    ) === true
          : newsTurnStart?.inputText === NEWS_PROMPT;
  return {
    backendLedger,
    traceMessages,
    appServerRequests,
    rendererSnapshot,
    summary,
    pageText,
    errorRaw,
    actionableConsoleErrors,
    workspace,
    options,
    appServerRequestMethods,
    latestTurnStart,
    planImplementationTurnStart,
    newsTurnStart,
    planTurnStart,
    goalTurnStart,
    webToolsRenderingTurnStart,
    mcpStructuredContentTurnStart,
    skillsRuntimeTurnStart,
    explicitSkillsRuntimeTurnStart,
    manualEnableSkillsRuntimeTurnStart,
    expertSkillsRuntimeTurnStart,
    expertPanelSkillsRuntimeTurnStart,
    continueTurnStart,
    latestTurnCancel,
    isCancelOnlyScenario,
    isCancelThenContinueScenario,
    isPlanScenario,
    isGoalScenario,
    isWebToolsRenderingScenario,
    isMcpStructuredContentScenario,
    isSkillsRuntimeScenario,
    isExpertSkillsRuntimeScenario,
    isExpertPlazaSkillsRuntimeScenario,
    isExpertPanelSkillsRuntimeScenario,
    isAnyExpertSkillsRuntimeScenario,
    expertRuntimeTurnStartForAssertions,
    asterChatRequest,
    hasCancelPhase,
    goalHarness,
    goalObjectiveText,
    manualEnableRuntimeMetadata,
    manualEnableRuntimeBinding,
    expertRuntimeMetadata,
    expertHarnessMetadata,
    rawExpertHarnessSkillRefs,
    expertHarnessSkillRefs,
    expectedExpertHarnessSkillRef,
    collaborationMode,
    guiTurnStartReachedBackend,
  };
}
