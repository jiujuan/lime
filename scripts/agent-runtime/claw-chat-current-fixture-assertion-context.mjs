import {
  APPROVAL_REQUEST_CANCEL_SCENARIO,
  APPROVAL_REQUEST_DECLINE_SCENARIO,
  APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
  APPROVAL_REQUEST_FULL_ACCESS_SCENARIO,
  APPROVAL_REQUEST_RESUME_PROMPT,
  APPROVAL_REQUEST_RESUME_SCENARIO,
  CONTINUE_PROMPT,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO,
  CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  ELECTRON_RESIZE_REFLOW_SCENARIO,
  GOAL_PROMPT,
  HOME_HOTPATH_GREETING_SCENARIO,
  HOME_HOTPATH_SCENARIO,
  IMAGE_COMMAND_PROMPT,
  IMAGE_COMMAND_SCENARIO,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO,
  INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO,
  INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO,
  INPUTBAR_RICH_RESTORE_PROMPT,
  INPUTBAR_RICH_RESTORE_SCENARIO,
  LIVE_TAIL_COMMIT_PROMPT,
  LIVE_TAIL_COMMIT_SCENARIO,
  MCP_STRUCTURED_CONTENT_PROMPT,
  MULTI_AGENT_TEAM_PROMPT,
  MULTI_AGENT_TEAM_SCENARIO,
  NEWS_PROMPT,
  PLAIN_IMAGE_INTENT_ROUTED_PROMPT,
  PLAIN_IMAGE_INTENT_SCENARIO,
  PLAN_PROMPT,
  REASONING_FIRST_VISIBLE_PROMPT,
  REASONING_FIRST_VISIBLE_SCENARIO,
  RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
  SOUL_STYLE_SCENARIO,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_PROMPT,
  TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO,
  TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
  TERMINAL_FAILED_AFTER_ANSWER_SCENARIO,
  TERMINAL_STALE_GUARD_FIRST_PROMPT,
  TERMINAL_STALE_GUARD_SCENARIO,
  TERMINAL_STALE_GUARD_SECOND_PROMPT,
  WEB_TOOLS_RENDERING_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF } from "./claw-chat-current-fixture-expert-actions.mjs";
import {
  collectTraceRequestMethods,
  decodeJsonRpcLines,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  readHarnessMetadataFromTurnStart,
  readObjectiveTextFromHarness,
  readWorkspaceSkillRuntimeEnableFromTurnStart,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import {
  MEDIA_REFERENCE_PROMPT,
  MEDIA_REFERENCE_SCENARIO,
} from "./claw-chat-current-fixture-media-reference.mjs";

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
  const traceTurnStarts = traceMessages
    .filter((entry) => entry?.command === "app_server_handle_json_lines")
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines)
        .filter((message) => message?.method === "agentSession/turn/start")
        .map((message) => ({
          transport: entry.transport ?? null,
          status: entry.status ?? null,
          sessionId: message.params?.sessionId ?? message.params?.session_id,
          turnId: message.params?.turnId ?? message.params?.turn_id,
          inputText: message.params?.input?.text ?? null,
        })),
    );
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
  const newsTraceTurnStart = traceTurnStarts.find(
    (entry) =>
      entry.inputText === NEWS_PROMPT &&
      entry.transport === "electron-ipc" &&
      entry.status === "success",
  );
  const homeHotpathPrompt =
    typeof summary?.homeHotpath?.prompt === "string" &&
    summary.homeHotpath.prompt.trim()
      ? summary.homeHotpath.prompt
      : NEWS_PROMPT;
  const homeHotpathTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === homeHotpathPrompt,
  );
  const homeHotpathTraceTurnStart = traceTurnStarts.find(
    (entry) =>
      entry.inputText === homeHotpathPrompt &&
      entry.transport === "electron-ipc" &&
      entry.status === "success",
  );
  const planTurnStart = backendLedger.find(
    (entry) => entry.kind === "turnStart" && entry.inputText === PLAN_PROMPT,
  );
  const goalTurnStart = backendLedger.find(
    (entry) => entry.kind === "turnStart" && entry.inputText === GOAL_PROMPT,
  );
  const inputbarRichRestoreTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      String(entry.inputText || "").includes(INPUTBAR_RICH_RESTORE_PROMPT),
  );
  const inputbarPendingSteerActiveTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  );
  const expectedImageIntentRoutedPrompt =
    options.scenario === PLAIN_IMAGE_INTENT_SCENARIO
      ? PLAIN_IMAGE_INTENT_ROUTED_PROMPT
      : IMAGE_COMMAND_PROMPT;
  const imageCommandWorkflowTurnStart =
    summary.imageCommandWorkflowTurnStart ??
    summary.imageCommandBackendTurnStart ??
    null;
  const imageCommandTurnStart =
    backendLedger.find(
      (entry) =>
        entry.kind === "turnStart" &&
        entry.inputText === expectedImageIntentRoutedPrompt,
    ) ?? imageCommandWorkflowTurnStart;
  const webToolsRenderingTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === WEB_TOOLS_RENDERING_PROMPT,
  );
  const reasoningFirstVisibleTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === REASONING_FIRST_VISIBLE_PROMPT,
  );
  const liveTailCommitTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === LIVE_TAIL_COMMIT_PROMPT,
  );
  const electronResizeReflowTurnStart = liveTailCommitTurnStart;
  const approvalRequestResumeTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === APPROVAL_REQUEST_RESUME_PROMPT,
  );
  const approvalRequestFullAccessTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === APPROVAL_REQUEST_FULL_ACCESS_PROMPT,
  );
  const terminalCanceledAfterAnswerTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  );
  const terminalFailedAfterAnswerTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
  );
  const terminalStaleGuardFirstTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === TERMINAL_STALE_GUARD_FIRST_PROMPT,
  );
  const terminalStaleGuardSecondTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === TERMINAL_STALE_GUARD_SECOND_PROMPT,
  );
  const mcpStructuredContentTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" &&
      entry.inputText === MCP_STRUCTURED_CONTENT_PROMPT,
  );
  const mediaReferenceTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === MEDIA_REFERENCE_PROMPT,
  );
  const multiAgentTeamTurnStart = backendLedger.find(
    (entry) =>
      entry.kind === "turnStart" && entry.inputText === MULTI_AGENT_TEAM_PROMPT,
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
  const isHomeHotpathScenario =
    options.scenario === HOME_HOTPATH_SCENARIO ||
    options.scenario === HOME_HOTPATH_GREETING_SCENARIO;
  const isImageCommandScenario =
    options.scenario === IMAGE_COMMAND_SCENARIO ||
    options.scenario === PLAIN_IMAGE_INTENT_SCENARIO;
  const isInputbarRichRestoreScenario =
    options.scenario === INPUTBAR_RICH_RESTORE_SCENARIO;
  const isInputbarPendingSteerRichRestoreScenario =
    options.scenario === INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO;
  const isInputbarPendingSteerMultiQueueScenario =
    options.scenario === INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO;
  const isInputbarPendingSteerPopFrontResumeScenario =
    options.scenario === INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO;
  const isInputbarPendingSteerScenario =
    isInputbarPendingSteerRichRestoreScenario ||
    isInputbarPendingSteerMultiQueueScenario ||
    isInputbarPendingSteerPopFrontResumeScenario;
  const isWebToolsRenderingScenario =
    options.scenario === "web-tools-rendering";
  const isReasoningFirstVisibleScenario =
    options.scenario === REASONING_FIRST_VISIBLE_SCENARIO;
  const isLiveTailCommitScenario =
    options.scenario === LIVE_TAIL_COMMIT_SCENARIO;
  const isElectronResizeReflowScenario =
    options.scenario === ELECTRON_RESIZE_REFLOW_SCENARIO;
  const isApprovalRequestResumeScenario =
    options.scenario === APPROVAL_REQUEST_RESUME_SCENARIO;
  const isApprovalRequestDeclineScenario =
    options.scenario === APPROVAL_REQUEST_DECLINE_SCENARIO;
  const isApprovalRequestCancelScenario =
    options.scenario === APPROVAL_REQUEST_CANCEL_SCENARIO;
  const isApprovalRequestFullAccessScenario =
    options.scenario === APPROVAL_REQUEST_FULL_ACCESS_SCENARIO;
  const isApprovalRequestDecisionScenario =
    isApprovalRequestDeclineScenario || isApprovalRequestCancelScenario;
  const isTerminalCanceledAfterAnswerScenario =
    options.scenario === TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO;
  const isTerminalFailedAfterAnswerScenario =
    options.scenario === TERMINAL_FAILED_AFTER_ANSWER_SCENARIO;
  const isTerminalStaleGuardScenario =
    options.scenario === TERMINAL_STALE_GUARD_SCENARIO;
  const isMcpStructuredContentScenario =
    options.scenario === "mcp-structured-content";
  const isMediaReferenceScenario =
    options.scenario === MEDIA_REFERENCE_SCENARIO;
  const isMultiAgentTeamScenario =
    options.scenario === MULTI_AGENT_TEAM_SCENARIO;
  const isSkillsRuntimeScenario = options.scenario === "skills-runtime";
  const isSoulStyleScenario = options.scenario === SOUL_STYLE_SCENARIO;
  const isExpertSkillsRuntimeScenario =
    options.scenario === "expert-skills-runtime";
  const isExpertPlazaSkillsRuntimeScenario =
    options.scenario === "expert-plaza-skills-runtime";
  const isExpertPanelSkillsRuntimeScenario =
    options.scenario === "expert-panel-skills-runtime";
  const isRightSurfaceVisualMatrixScenario =
    options.scenario === RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO;
  const isContentFactoryInlineImageArticleWorkspaceScenario =
    options.scenario ===
    CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO;
  const isContentFactoryArticleWorkspaceScenario =
    options.scenario === CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO ||
    isContentFactoryInlineImageArticleWorkspaceScenario;
  const isAnyExpertSkillsRuntimeScenario =
    isExpertSkillsRuntimeScenario ||
    isExpertPlazaSkillsRuntimeScenario ||
    isExpertPanelSkillsRuntimeScenario;
  const expertRuntimeTurnStartForAssertions = isExpertPanelSkillsRuntimeScenario
    ? expertPanelSkillsRuntimeTurnStart
    : expertSkillsRuntimeTurnStart;
  const runtimeRequest =
    (isPlanScenario
      ? planTurnStart?.runtimeRequest
      : isGoalScenario
        ? goalTurnStart?.runtimeRequest
        : isImageCommandScenario
          ? imageCommandTurnStart?.runtimeRequest
          : isInputbarRichRestoreScenario
            ? inputbarRichRestoreTurnStart?.runtimeRequest
            : isInputbarPendingSteerScenario
              ? inputbarPendingSteerActiveTurnStart?.runtimeRequest
              : isWebToolsRenderingScenario
                ? webToolsRenderingTurnStart?.runtimeRequest
                : isReasoningFirstVisibleScenario
                  ? reasoningFirstVisibleTurnStart?.runtimeRequest
                  : isLiveTailCommitScenario
                    ? liveTailCommitTurnStart?.runtimeRequest
                    : isElectronResizeReflowScenario
                      ? electronResizeReflowTurnStart?.runtimeRequest
                      : isApprovalRequestResumeScenario ||
                          isApprovalRequestDecisionScenario
                        ? approvalRequestResumeTurnStart?.runtimeRequest
                        : isApprovalRequestFullAccessScenario
                          ? approvalRequestFullAccessTurnStart?.runtimeRequest
                        : isTerminalCanceledAfterAnswerScenario
                          ? terminalCanceledAfterAnswerTurnStart?.runtimeRequest
                          : isTerminalFailedAfterAnswerScenario
                            ? terminalFailedAfterAnswerTurnStart?.runtimeRequest
                            : isMcpStructuredContentScenario
                              ? mcpStructuredContentTurnStart?.runtimeRequest
                              : isMediaReferenceScenario
                                ? mediaReferenceTurnStart?.runtimeRequest
                                : isMultiAgentTeamScenario
                                  ? multiAgentTeamTurnStart?.runtimeRequest
                                  : isSkillsRuntimeScenario
                                    ? skillsRuntimeTurnStart?.runtimeRequest
                                    : isAnyExpertSkillsRuntimeScenario
                                      ? expertRuntimeTurnStartForAssertions?.runtimeRequest
                                      : isContentFactoryArticleWorkspaceScenario
                                        ? {}
                                        : isHomeHotpathScenario
                                          ? homeHotpathTurnStart?.runtimeRequest
                                          : newsTurnStart?.runtimeRequest) ??
    {};
  const hasCancelPhase = isCancelOnlyScenario || isCancelThenContinueScenario;
  const goalHarness = readHarnessMetadataFromTurnStart(goalTurnStart);
  const goalObjectiveText = readObjectiveTextFromHarness(goalHarness);
  const imageCommandHarness = readHarnessMetadataFromTurnStart(
    imageCommandTurnStart,
  );
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
    expertRuntimeTurnStartForAssertions?.runtimeRequest?.metadata?.expert ??
    {};
  const expertHarnessMetadata =
    expertRuntimeTurnStartForAssertions?.runtimeRequest?.metadata?.harness
      ?.expert ??
    {};
  const rawExpertHarnessSkillRefs =
    expertHarnessMetadata?.skill_refs ?? expertHarnessMetadata?.skillRefs ?? [];
  const expertHarnessSkillRefs = Array.isArray(rawExpertHarnessSkillRefs)
    ? rawExpertHarnessSkillRefs
    : [];
  const expectedExpertHarnessSkillRef = isExpertPanelSkillsRuntimeScenario
    ? EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF
    : EXPERT_SKILLS_RUNTIME_SKILL_REF;
  const collaborationMode =
    runtimeRequest?.metadata?.harness?.collaboration_mode?.mode ??
    runtimeRequest?.metadata?.harness?.collaborationMode?.mode ??
    (isPlanScenario
      ? (planTurnStart?.runtimeOptions?.metadata?.harness?.collaboration_mode
          ?.mode ??
        planTurnStart?.runtimeOptions?.metadata?.harness?.collaborationMode
          ?.mode)
      : null);
  const guiTurnStartReachedBackend = isPlanScenario
    ? planTurnStart?.inputText === PLAN_PROMPT
    : isGoalScenario
      ? goalTurnStart?.inputText === GOAL_PROMPT
      : isHomeHotpathScenario
        ? homeHotpathTurnStart?.inputText === homeHotpathPrompt ||
          homeHotpathTraceTurnStart?.inputText === homeHotpathPrompt
        : isImageCommandScenario
        ? imageCommandTurnStart?.inputText === expectedImageIntentRoutedPrompt
        : isInputbarRichRestoreScenario
          ? String(inputbarRichRestoreTurnStart?.inputText || "").includes(
              INPUTBAR_RICH_RESTORE_PROMPT,
            )
          : isInputbarPendingSteerScenario
            ? inputbarPendingSteerActiveTurnStart?.inputText ===
              INPUTBAR_PENDING_STEER_ACTIVE_PROMPT
            : isWebToolsRenderingScenario
              ? webToolsRenderingTurnStart?.inputText ===
                WEB_TOOLS_RENDERING_PROMPT
              : isReasoningFirstVisibleScenario
                ? reasoningFirstVisibleTurnStart?.inputText ===
                  REASONING_FIRST_VISIBLE_PROMPT
                : isLiveTailCommitScenario
                  ? liveTailCommitTurnStart?.inputText ===
                    LIVE_TAIL_COMMIT_PROMPT
                  : isElectronResizeReflowScenario
                    ? electronResizeReflowTurnStart?.inputText ===
                      LIVE_TAIL_COMMIT_PROMPT
                    : isApprovalRequestResumeScenario ||
                        isApprovalRequestDecisionScenario
                      ? approvalRequestResumeTurnStart?.inputText ===
                        APPROVAL_REQUEST_RESUME_PROMPT
                      : isApprovalRequestFullAccessScenario
                        ? approvalRequestFullAccessTurnStart?.inputText ===
                          APPROVAL_REQUEST_FULL_ACCESS_PROMPT
                      : isTerminalCanceledAfterAnswerScenario
                        ? terminalCanceledAfterAnswerTurnStart?.inputText ===
                          TERMINAL_CANCELED_AFTER_ANSWER_PROMPT
                        : isTerminalFailedAfterAnswerScenario
                          ? terminalFailedAfterAnswerTurnStart?.inputText ===
                            TERMINAL_FAILED_AFTER_ANSWER_PROMPT
                          : isTerminalStaleGuardScenario
                            ? terminalStaleGuardFirstTurnStart?.inputText ===
                                TERMINAL_STALE_GUARD_FIRST_PROMPT &&
                              terminalStaleGuardSecondTurnStart?.inputText ===
                                TERMINAL_STALE_GUARD_SECOND_PROMPT
                            : isMcpStructuredContentScenario
                              ? mcpStructuredContentTurnStart?.inputText ===
                                MCP_STRUCTURED_CONTENT_PROMPT
                              : isMediaReferenceScenario
                                ? mediaReferenceTurnStart?.inputText ===
                                  MEDIA_REFERENCE_PROMPT
                                : isMultiAgentTeamScenario
                                  ? multiAgentTeamTurnStart?.inputText ===
                                    MULTI_AGENT_TEAM_PROMPT
                                  : isSkillsRuntimeScenario
                                    ? skillsRuntimeTurnStart?.inputText ===
                                        SKILLS_RUNTIME_PROMPT &&
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
                                      : isContentFactoryArticleWorkspaceScenario
                                        ? true
                                        : isSoulStyleScenario
                                          ? newsTraceTurnStart?.inputText ===
                                            NEWS_PROMPT
                                          : newsTurnStart?.inputText ===
                                            NEWS_PROMPT;
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
    traceTurnStarts,
    planImplementationTurnStart,
    newsTurnStart,
    newsTraceTurnStart,
    homeHotpathPrompt,
    homeHotpathTurnStart,
    homeHotpathTraceTurnStart,
    planTurnStart,
    goalTurnStart,
    inputbarRichRestoreTurnStart,
    inputbarPendingSteerActiveTurnStart,
    imageCommandTurnStart,
    expectedImageIntentRoutedPrompt,
    webToolsRenderingTurnStart,
    reasoningFirstVisibleTurnStart,
    liveTailCommitTurnStart,
    electronResizeReflowTurnStart,
    approvalRequestResumeTurnStart,
    approvalRequestFullAccessTurnStart,
    terminalCanceledAfterAnswerTurnStart,
    terminalFailedAfterAnswerTurnStart,
    terminalStaleGuardFirstTurnStart,
    terminalStaleGuardSecondTurnStart,
    mcpStructuredContentTurnStart,
    mediaReferenceTurnStart,
    multiAgentTeamTurnStart,
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
    isHomeHotpathScenario,
    isImageCommandScenario,
    isInputbarRichRestoreScenario,
    isInputbarPendingSteerRichRestoreScenario,
    isInputbarPendingSteerMultiQueueScenario,
    isInputbarPendingSteerPopFrontResumeScenario,
    isInputbarPendingSteerScenario,
    isWebToolsRenderingScenario,
    isReasoningFirstVisibleScenario,
    isLiveTailCommitScenario,
    isElectronResizeReflowScenario,
    isApprovalRequestResumeScenario,
    isApprovalRequestDeclineScenario,
    isApprovalRequestCancelScenario,
    isApprovalRequestFullAccessScenario,
    isApprovalRequestDecisionScenario,
    isTerminalCanceledAfterAnswerScenario,
    isTerminalFailedAfterAnswerScenario,
    isTerminalStaleGuardScenario,
    isMcpStructuredContentScenario,
    isMediaReferenceScenario,
    isMultiAgentTeamScenario,
    isSkillsRuntimeScenario,
    isSoulStyleScenario,
    isExpertSkillsRuntimeScenario,
    isExpertPlazaSkillsRuntimeScenario,
    isExpertPanelSkillsRuntimeScenario,
    isRightSurfaceVisualMatrixScenario,
    isContentFactoryArticleWorkspaceScenario,
    isContentFactoryInlineImageArticleWorkspaceScenario,
    isAnyExpertSkillsRuntimeScenario,
    expertRuntimeTurnStartForAssertions,
    runtimeRequest,
    hasCancelPhase,
    goalHarness,
    goalObjectiveText,
    imageCommandHarness,
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
