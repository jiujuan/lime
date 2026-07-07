import {
  APP_SERVER_METHOD_SESSION_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
  APP_SERVER_METHOD_DIAGNOSTICS_TRACE_EXPORT,
  APP_SERVER_METHOD_DIAGNOSTICS_TRACE_LIST,
  APP_SERVER_METHOD_DIAGNOSTICS_TRACE_READ,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  ASSISTANT_DONE_TEXT,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EXPERT_SKILLS_RUNTIME_TITLE,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  IMAGE_COMMAND_DONE_TEXT,
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_RICH_RESTORE_PROMPT,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MULTI_AGENT_TEAM_DONE_TEXT,
  MULTI_AGENT_TEAM_PROMPT,
  MULTI_AGENT_TEAM_SUMMARY_TEXT,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  REASONING_FIRST_VISIBLE_DONE_TEXT,
  REASONING_FIRST_VISIBLE_FINAL_TEXT,
  REASONING_FIRST_VISIBLE_PROMPT,
  REASONING_FIRST_VISIBLE_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
  TERMINAL_STALE_GUARD_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_PROMPT,
  TERMINAL_STALE_GUARD_SECOND_PROMPT,
  TERMINAL_STALE_GUARD_SECOND_TEXT,
  TERMINAL_STALE_GUARD_STALE_DONE_TEXT,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  MEDIA_REFERENCE_PROMPT,
  MEDIA_REFERENCE_SUMMARY_TEXT,
  MEDIA_REFERENCE_URI,
} from "./claw-chat-current-fixture-media-reference.mjs";

export function buildCommonAssertions(context) {
  const {
    rendererSnapshot,
    appServerRequestMethods,
    guiTurnStartReachedBackend,
    backendLedger,
    asterChatRequest,
    isCancelOnlyScenario,
    isCancelThenContinueScenario,
    isPlanScenario,
    isGoalScenario,
    isImageCommandScenario,
    isInputbarPendingSteerRichRestoreScenario,
    isInputbarRichRestoreScenario,
    inputbarRichRestoreTurnStart,
    isWebToolsRenderingScenario,
    isMcpStructuredContentScenario,
    isMediaReferenceScenario,
    isMultiAgentTeamScenario,
    isReasoningFirstVisibleScenario,
    isTerminalCanceledAfterAnswerScenario,
    isTerminalFailedAfterAnswerScenario,
    isTerminalStaleGuardScenario,
    isSkillsRuntimeScenario,
    isSoulStyleScenario,
    isRightSurfaceVisualMatrixScenario,
    isContentFactoryArticleWorkspaceScenario,
    isAnyExpertSkillsRuntimeScenario,
    isExpertPlazaSkillsRuntimeScenario,
    isExpertPanelSkillsRuntimeScenario,
    hasCancelPhase,
    summary,
    pageText,
    errorRaw,
    actionableConsoleErrors,
  } = context;
  const shouldRequireAgentUiTraceEvidence =
    !isRightSurfaceVisualMatrixScenario &&
    !isContentFactoryArticleWorkspaceScenario &&
    !isExpertPlazaSkillsRuntimeScenario;
  const shouldRequireTextStreamTraceSeparation =
    shouldRequireAgentUiTraceEvidence &&
    !isPlanScenario &&
    !isImageCommandScenario &&
    !isMediaReferenceScenario &&
    !isSoulStyleScenario &&
    !isInputbarRichRestoreScenario &&
    !isInputbarPendingSteerRichRestoreScenario;
  const agentUiPerformanceTrace = summary.agentUiPerformanceTrace;
  const appServerTraceEvidence = summary.appServerTraceEvidence;
  const commonAssertions = {
    electronPreloadBridge: rendererSnapshot.electron === true,
    appServerJsonRpcUsed:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) ||
      guiTurnStartReachedBackend ||
      (isRightSurfaceVisualMatrixScenario &&
        appServerRequestMethods.includes(
          APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
        )) ||
      (isContentFactoryArticleWorkspaceScenario &&
        appServerRequestMethods.includes(
          APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
        )),
    usedCurrentSessionStart: appServerRequestMethods.includes(
      APP_SERVER_METHOD_SESSION_START,
    ),
    usedCurrentSessionRead: appServerRequestMethods.includes(
      APP_SERVER_METHOD_SESSION_READ,
    ),
    usedCurrentSessionList: appServerRequestMethods.includes(
      APP_SERVER_METHOD_SESSION_LIST,
    ),
    externalFixtureBackendUsed: isImageCommandScenario
      ? summary.imageCommandWorkflowUsed === true
      : isRightSurfaceVisualMatrixScenario ||
          isContentFactoryArticleWorkspaceScenario
        ? true
        : isSoulStyleScenario
          ? summary.textProviderFixtureServer?.requestCount >= 1
          : backendLedger.some((entry) => entry.kind === "turnStart"),
    fixturePromptReachedBackend:
      isRightSurfaceVisualMatrixScenario ||
      isContentFactoryArticleWorkspaceScenario
        ? true
        : isInputbarRichRestoreScenario
          ? Boolean(inputbarRichRestoreTurnStart)
          : isInputbarPendingSteerRichRestoreScenario
            ? guiTurnStartReachedBackend
        : guiTurnStartReachedBackend,
    liveProviderNotUsed: backendLedger.every((entry) => {
      if (entry.kind !== "turnStart") {
        return true;
      }
      if (
        isInputbarRichRestoreScenario ||
        isInputbarPendingSteerRichRestoreScenario
      ) {
        return (
          (!entry.providerPreference ||
            entry.providerPreference ===
              summary.textFixtureProvider?.providerId ||
            entry.providerPreference === FIXTURE_PROVIDER) &&
          (!entry.modelPreference ||
            entry.modelPreference === summary.textFixtureProvider?.modelId ||
            entry.modelPreference === FIXTURE_MODEL)
        );
      }
      return (
        (!entry.providerPreference ||
          entry.providerPreference === FIXTURE_PROVIDER) &&
        (!entry.modelPreference || entry.modelPreference === FIXTURE_MODEL)
      );
    }),
    newsRequestDidNotForceRequiredSearch:
      asterChatRequest?.search_mode !== "required",
    newsRequestDidNotPassLegacyWebSearchFlag:
      !Object.prototype.hasOwnProperty.call(
        asterChatRequest || {},
        "web_search",
      ),
    guiUserMessageVisible: isCancelOnlyScenario
      ? summary.guiCanceled?.hasPrompt === true
      : isCancelThenContinueScenario
        ? summary.guiContinueCompleted?.hasPrompt === true &&
          summary.guiContinueCompleted?.bodyText?.includes(NEWS_PROMPT) === true
        : isInputbarRichRestoreScenario
          ? summary.inputbarRichRestoreGuiCanceled?.hasPrompt === true
        : isInputbarPendingSteerRichRestoreScenario
          ? summary.inputbarPendingSteerGuiCanceled?.hasPrompt === true &&
            summary.inputbarPendingSteerGuiCanceled?.bodyText?.includes(
              INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
            ) === true
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.expertInfo?.stable
              ?.rootVisible === true
          : isContentFactoryArticleWorkspaceScenario
            ? summary.contentFactoryArticleWorkspaceGui?.rootVisible === true &&
              summary.contentFactoryArticleWorkspaceGui
                ?.hasArticleDraftObject === true
            : isPlanScenario
              ? summary.guiPlanCompleted?.hasPrompt === true
              : isGoalScenario
                ? summary.guiGoalCompleted?.hasPrompt === true
                : isImageCommandScenario
                  ? summary.guiImageCommandCompleted?.hasPrompt === true
                  : isWebToolsRenderingScenario
                    ? summary.guiWebToolsRenderingCompleted?.hasPrompt === true
                    : isReasoningFirstVisibleScenario
                      ? summary.guiReasoningFirstVisibleCompleted?.hasPrompt ===
                        true
                    : isTerminalCanceledAfterAnswerScenario
                      ? summary.guiTerminalCanceledAfterAnswerCanceled
                          ?.hasPrompt === true
                    : isTerminalFailedAfterAnswerScenario
                      ? summary.guiTerminalFailedAfterAnswerCompleted
                          ?.hasPrompt === true
                    : isTerminalStaleGuardScenario
                      ? summary.guiTerminalStaleGuardFirstCompleted
                          ?.hasPrompt === true &&
                        summary.guiTerminalStaleGuardSecondCompleted
                          ?.hasPrompt === true
                      : isMcpStructuredContentScenario
                        ? summary.guiMcpStructuredContentCompleted?.hasPrompt ===
                          true
                      : isMediaReferenceScenario
                        ? summary.guiMediaReferenceCompleted?.hasPrompt === true
                        : isMultiAgentTeamScenario
                          ? summary.guiMultiAgentTeamCompleted?.hasPrompt === true
                          : isSkillsRuntimeScenario
                            ? summary.guiSkillsRuntimeCompleted?.hasPrompt ===
                                true &&
                              summary.guiExplicitSkillsRuntimeCompleted
                                ?.hasPrompt === true &&
                              summary.guiManualEnableSkillsRuntimeCompleted
                                ?.hasPrompt === true
                            : isAnyExpertSkillsRuntimeScenario
                              ? isExpertPanelSkillsRuntimeScenario
                                ? summary.guiExpertPanelSkillsRuntimeCompleted
                                    ?.hasPrompt === true
                                : summary.guiExpertSkillsRuntimeCompleted
                                    ?.hasPrompt === true
                              : summary.guiCompleted?.hasPrompt === true,
    guiAssistantOutputVisible: isCancelOnlyScenario
      ? summary.guiCanceled?.hasStoppedCopy === true
      : isCancelThenContinueScenario
        ? summary.guiContinueCompleted?.hasAssistantSummary === true ||
          summary.guiContinueCompleted?.hasDoneText === true
        : isInputbarRichRestoreScenario
          ? summary.inputbarRichRestoreGuiCanceled
              ?.noVisibleAssistantOutput === true
        : isInputbarPendingSteerRichRestoreScenario
          ? summary.inputbarPendingSteerGuiCanceled?.bodyText?.includes(
              INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
            ) === true
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.files?.stable
              ?.rootVisible === true &&
            summary.rightSurfaceVisualMatrix?.captures?.objectCanvas?.stable
              ?.rootVisible === true &&
            summary.rightSurfaceVisualMatrix?.captures?.browser?.stable
              ?.rootVisible === true
          : isContentFactoryArticleWorkspaceScenario
            ? summary.contentFactoryArticleWorkspaceArtifactFrame?.visible ===
                true &&
              summary.contentFactoryArticleWorkspaceArtifactFrame
                ?.hasArticlePreviewContent === true &&
              summary.contentFactoryArticleWorkspaceGui
                ?.hasArticleCanvasContent === true
            : isPlanScenario
              ? summary.guiPlanCompleted?.hasPlanIntro === true ||
                summary.guiPlanCompleted?.hasDoneText === true ||
                (summary.guiPlanCompleted?.hasPlanSection === true &&
                  summary.guiPlanCompleted?.hasAllPlanSteps === true)
              : isGoalScenario
                ? summary.guiGoalCompleted?.hasAssistantSummary === true ||
                  summary.guiGoalCompleted?.hasDoneText === true
                : isImageCommandScenario
                  ? summary.guiImageCommandCompleted?.hasAssistantSummary ===
                      true ||
                    summary.guiImageCommandCompleted?.hasDoneText === true ||
                    summary.guiImageCommandCompleted?.imageTaskCardVisible ===
                      true
                  : isWebToolsRenderingScenario
                    ? summary.guiWebToolsRenderingCompleted
                        ?.hasAssistantSummary === true ||
                      summary.guiWebToolsRenderingCompleted?.hasDoneText ===
                        true
                    : isReasoningFirstVisibleScenario
                      ? summary.guiReasoningFirstVisibleBeforeAnswer
                          ?.hasReasoningText === true &&
                        summary.guiReasoningFirstVisibleCompleted
                          ?.hasFinalText === true
                    : isTerminalCanceledAfterAnswerScenario
                      ? summary.guiTerminalCanceledAfterAnswerCanceled
                          ?.hasPartialText === true
                    : isTerminalFailedAfterAnswerScenario
                      ? summary.guiTerminalFailedAfterAnswerCompleted
                          ?.hasAssistantSummary === true &&
                        summary.guiTerminalFailedAfterAnswerCompleted
                          ?.hasDoneText === true
                    : isTerminalStaleGuardScenario
                      ? summary.guiTerminalStaleGuardSecondCompleted
                          ?.hasAssistantSummary === true ||
                        summary.guiTerminalStaleGuardSecondCompleted
                          ?.hasDoneText === true
                    : isMcpStructuredContentScenario
                      ? summary.guiMcpStructuredContentCompleted
                          ?.hasStructuredAnswer === true
                      : isMediaReferenceScenario
                        ? summary.guiMediaReferenceSnapshot?.hasCard === true &&
                          summary.guiMediaReferenceSnapshot?.hasUri === true
                        : isMultiAgentTeamScenario
                          ? summary.guiMultiAgentTeamCompleted
                              ?.hasAssistantSummary === true ||
                            summary.guiMultiAgentTeamCompleted?.hasDoneText ===
                              true
                          : isSkillsRuntimeScenario
                            ? summary.guiSkillsRuntimeCompleted
                                ?.hasAssistantSummary === true ||
                              summary.guiSkillsRuntimeCompleted?.hasDoneText ===
                                true ||
                              summary.guiExplicitSkillsRuntimeCompleted
                                ?.hasAssistantSummary === true ||
                              summary.guiExplicitSkillsRuntimeCompleted
                                ?.hasDoneText === true ||
                              summary.guiManualEnableSkillsRuntimeCompleted
                                ?.hasAssistantSummary === true ||
                              summary.guiManualEnableSkillsRuntimeCompleted
                                ?.hasDoneText === true
                            : isAnyExpertSkillsRuntimeScenario
                              ? isExpertPanelSkillsRuntimeScenario
                                ? summary.guiExpertPanelSkillsRuntimeCompleted
                                    ?.hasAssistantSummary === true ||
                                  summary.guiExpertPanelSkillsRuntimeCompleted
                                    ?.hasDoneText === true
                                : summary.guiExpertSkillsRuntimeCompleted
                                    ?.hasAssistantSummary === true ||
                                  summary.guiExpertSkillsRuntimeCompleted
                                    ?.hasDoneText === true
                              : summary.guiCompleted?.hasAssistantSummary ===
                                  true ||
                                summary.guiCompleted?.hasDoneText === true,
    guiInputRemainsReady: isCancelOnlyScenario
      ? summary.guiCanceled?.textareaVisible === true &&
        summary.guiCanceled?.textareaDisabled === false
      : isCancelThenContinueScenario
        ? summary.guiContinueCompleted?.textareaVisible === true &&
          summary.guiContinueCompleted?.textareaDisabled === false
        : isInputbarRichRestoreScenario
          ? summary.inputbarRichRestoreGuiCanceled?.textareaVisible === true &&
            summary.inputbarRichRestoreGuiCanceled?.textareaDisabled ===
              false &&
            summary.inputbarRichRestoreGuiCanceled?.textareaValue ===
              INPUTBAR_RICH_RESTORE_PROMPT
        : isInputbarPendingSteerRichRestoreScenario
          ? summary.inputbarPendingSteerGuiCanceled?.textareaVisible === true &&
            summary.inputbarPendingSteerGuiCanceled?.textareaDisabled ===
              false &&
            summary.inputbarPendingSteerGuiCanceled?.textareaValue ===
              INPUTBAR_RICH_RESTORE_PROMPT
        : isRightSurfaceVisualMatrixScenario
          ? summary.guiRightSurfaceVisualMatrixSessionOpened?.inputReady
              ?.textareaDisabled === false
          : isContentFactoryArticleWorkspaceScenario
            ? summary.guiContentFactoryArticleWorkspaceSessionOpened?.inputReady
                ?.textareaDisabled === false
            : isPlanScenario
              ? summary.guiPlanCompleted?.planDecisionVisible === true &&
                summary.guiPlanCompleted?.textareaVisible === false
              : isGoalScenario
                ? summary.guiGoalCompleted?.textareaVisible === true &&
                  summary.guiGoalCompleted?.textareaDisabled === false
                : isImageCommandScenario
                  ? summary.guiImageCommandCompleted?.textareaVisible ===
                      true &&
                    summary.guiImageCommandCompleted?.textareaDisabled === false
                  : isWebToolsRenderingScenario
                    ? summary.guiWebToolsRenderingCompleted?.textareaVisible ===
                        true &&
                      summary.guiWebToolsRenderingCompleted
                        ?.textareaDisabled === false
                    : isReasoningFirstVisibleScenario
                      ? summary.guiReasoningFirstVisibleCompleted
                          ?.textareaVisible === true &&
                        summary.guiReasoningFirstVisibleCompleted
                          ?.textareaDisabled === false
                    : isTerminalCanceledAfterAnswerScenario
                      ? summary.guiTerminalCanceledAfterAnswerCanceled
                          ?.textareaVisible === true &&
                        summary.guiTerminalCanceledAfterAnswerCanceled
                          ?.textareaDisabled === false
                    : isTerminalFailedAfterAnswerScenario
                      ? summary.guiTerminalFailedAfterAnswerCompleted
                          ?.textareaVisible === true &&
                        summary.guiTerminalFailedAfterAnswerCompleted
                          ?.textareaDisabled === false
                    : isTerminalStaleGuardScenario
                      ? summary.guiTerminalStaleGuardSecondCompleted
                          ?.textareaVisible === true &&
                        summary.guiTerminalStaleGuardSecondCompleted
                          ?.textareaDisabled === false
                    : isMcpStructuredContentScenario
                      ? summary.guiMcpStructuredContentCompleted
                          ?.textareaVisible === true &&
                        summary.guiMcpStructuredContentCompleted
                          ?.textareaDisabled === false
                      : isMediaReferenceScenario
                        ? summary.guiMediaReferenceCompleted?.textareaVisible ===
                            true &&
                          summary.guiMediaReferenceCompleted
                            ?.textareaDisabled === false
                      : isMultiAgentTeamScenario
                        ? summary.guiMultiAgentTeamCompleted
                            ?.textareaVisible === true &&
                          summary.guiMultiAgentTeamCompleted
                            ?.textareaDisabled === false
                        : isSkillsRuntimeScenario
                          ? summary.guiSkillsRuntimeCompleted
                              ?.textareaVisible === true &&
                            summary.guiSkillsRuntimeCompleted
                              ?.textareaDisabled === false &&
                            summary.guiExplicitSkillsRuntimeCompleted
                              ?.textareaVisible === true &&
                            summary.guiExplicitSkillsRuntimeCompleted
                              ?.textareaDisabled === false &&
                            summary.guiManualEnableSkillsRuntimeCompleted
                              ?.textareaVisible === true &&
                            summary.guiManualEnableSkillsRuntimeCompleted
                              ?.textareaDisabled === false
                          : isAnyExpertSkillsRuntimeScenario
                            ? isExpertPanelSkillsRuntimeScenario
                              ? summary.guiExpertPanelSkillsRuntimeCompleted
                                  ?.textareaVisible === true &&
                                summary.guiExpertPanelSkillsRuntimeCompleted
                                  ?.textareaDisabled === false
                              : summary.guiExpertSkillsRuntimeCompleted
                                  ?.textareaVisible === true &&
                                summary.guiExpertSkillsRuntimeCompleted
                                  ?.textareaDisabled === false
                            : summary.guiCompleted?.textareaVisible === true &&
                              summary.guiCompleted?.textareaDisabled === false,
    guiNotStuckStreaming: isCancelOnlyScenario
      ? summary.guiCanceled?.stopButtonVisible === false
      : isCancelThenContinueScenario
        ? summary.guiContinueCompleted?.stopButtonVisible === false
        : isInputbarRichRestoreScenario
          ? summary.inputbarRichRestoreGuiCanceled?.stopButtonVisible === false
        : isInputbarPendingSteerRichRestoreScenario
          ? summary.inputbarPendingSteerGuiCanceled?.stopButtonVisible === false
        : isRightSurfaceVisualMatrixScenario
          ? true
          : isContentFactoryArticleWorkspaceScenario
            ? true
            : isPlanScenario
              ? summary.guiPlanCompleted?.stopButtonVisible === false
              : isGoalScenario
                ? summary.guiGoalCompleted?.stopButtonVisible === false
                : isImageCommandScenario
                  ? summary.guiImageCommandCompleted?.stopButtonVisible ===
                    false
                  : isWebToolsRenderingScenario
                    ? summary.guiWebToolsRenderingCompleted
                        ?.stopButtonVisible === false
                    : isReasoningFirstVisibleScenario
                      ? summary.guiReasoningFirstVisibleCompleted
                          ?.stopButtonVisible === false
                    : isTerminalCanceledAfterAnswerScenario
                      ? summary.guiTerminalCanceledAfterAnswerCanceled
                          ?.stopButtonVisible === false
                    : isTerminalFailedAfterAnswerScenario
                      ? summary.guiTerminalFailedAfterAnswerCompleted
                          ?.stopButtonVisible === false
                    : isTerminalStaleGuardScenario
                      ? summary.guiTerminalStaleGuardSecondCompleted
                          ?.stopButtonVisible === false
                    : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted
                        ?.stopButtonVisible === false
                    : isMediaReferenceScenario
                      ? summary.guiMediaReferenceCompleted?.stopButtonVisible ===
                        false
                      : isMultiAgentTeamScenario
                        ? summary.guiMultiAgentTeamCompleted
                            ?.stopButtonVisible === false
                        : isSkillsRuntimeScenario
                          ? summary.guiSkillsRuntimeCompleted
                              ?.stopButtonVisible === false &&
                            summary.guiExplicitSkillsRuntimeCompleted
                              ?.stopButtonVisible === false &&
                            summary.guiManualEnableSkillsRuntimeCompleted
                              ?.stopButtonVisible === false
                          : isAnyExpertSkillsRuntimeScenario
                            ? isExpertPanelSkillsRuntimeScenario
                              ? summary.guiExpertPanelSkillsRuntimeCompleted
                                  ?.stopButtonVisible === false
                              : summary.guiExpertSkillsRuntimeCompleted
                                  ?.stopButtonVisible === false
                          : summary.guiCompleted?.stopButtonVisible === false,
    guiRunningStatusPreservedBeforeStop:
      !hasCancelPhase ||
      (summary.stopClick?.beforeClick?.hasVisibleAssistantOutput === true &&
        summary.stopClick?.beforeClick?.hasRunningStatus === true &&
        summary.stopClick?.beforeClick?.startupNoteVisible === false &&
        Array.isArray(summary.stopClick?.beforeClick?.stopButtons) &&
        summary.stopClick.beforeClick.stopButtons.length > 0),
    pageMentionsPromptAndAssistant: isCancelOnlyScenario
      ? pageText.includes(NEWS_PROMPT) &&
        (pageText.includes("已停止") ||
          pageText.includes("本轮已中止") ||
          /\bStopped\b/i.test(pageText) ||
          /\bCanceled\b/i.test(pageText))
      : isCancelThenContinueScenario
        ? pageText.includes(NEWS_PROMPT) &&
          pageText.includes(CONTINUE_PROMPT) &&
          (pageText.includes("继续输出已恢复") ||
            pageText.includes(CONTINUE_DONE_TEXT))
        : isInputbarRichRestoreScenario
          ? pageText.includes(INPUTBAR_RICH_RESTORE_PROMPT) &&
            summary.inputbarRichRestoreGuiCanceled
              ?.noVisibleAssistantOutput === true
        : isInputbarPendingSteerRichRestoreScenario
          ? pageText.includes(INPUTBAR_PENDING_STEER_ACTIVE_PROMPT) &&
            pageText.includes(INPUTBAR_RICH_RESTORE_PROMPT) &&
            pageText.includes(INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT)
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.files?.stable
              ?.activeSurface === "files" &&
            summary.rightSurfaceVisualMatrix?.captures?.objectCanvas?.stable
              ?.activeSurface === "objectCanvas" &&
            summary.rightSurfaceVisualMatrix?.captures?.expertInfo?.stable
              ?.activeSurface === "expertInfo" &&
            summary.rightSurfaceVisualMatrix?.captures?.browser?.stable
              ?.activeSurface === "browser" &&
            summary.rightSurfaceVisualMatrix?.captures?.appSurface?.stable
              ?.activeSurface === "appSurface"
          : isContentFactoryArticleWorkspaceScenario
            ? summary.contentFactoryArticleWorkspaceGui?.activeSurface ===
                "articleWorkspace" &&
              summary.contentFactoryArticleWorkspaceGui
                ?.hasArticleDraftObject === true &&
              summary.contentFactoryArticleWorkspaceGui
                ?.hasArticleCanvasContent === true &&
              summary.contentFactoryArticleWorkspaceArtifactFrame
                ?.hasArticlePreviewContent === true &&
              summary.contentFactoryArticleWorkspaceReadModel
                ?.hasImageSetObject === true &&
              summary.contentFactoryArticleWorkspaceReadModel
                ?.hasStoryboardObject === true &&
              summary.contentFactoryArticleWorkspaceReadModel
                ?.hasChecklistObject === true
            : isPlanScenario
              ? pageText.includes(PLAN_PROMPT) &&
                PLAN_STEPS.every((step) => pageText.includes(step.step))
              : isGoalScenario
                ? pageText.includes(GOAL_PROMPT) &&
                  (pageText.includes("目标已绑定到本轮请求") ||
                    pageText.includes(GOAL_DONE_TEXT))
                : isImageCommandScenario
                  ? summary.guiImageCommandCompleted?.hasPrompt === true &&
                    (summary.guiImageCommandCompleted?.imageTaskCardVisible ===
                      true ||
                      summary.guiImageCommandCompleted?.hasDoneText === true ||
                      pageText.includes(IMAGE_COMMAND_DONE_TEXT)) &&
                    (summary.guiImageCommandCompleted?.hasSkillName === true ||
                      summary.guiImageCommandCompleted?.hasCreateTaskTool ===
                        true)
                  : isWebToolsRenderingScenario
                    ? summary.guiWebToolsRenderingCompleted?.hasPrompt ===
                        true &&
                      summary.guiWebToolsRenderingCompleted?.hasProcessTitle ===
                        true &&
                      summary.guiWebToolsRenderingCompleted?.expandedDetails
                        ?.hasSearchTitle === true &&
                      summary.guiWebToolsRenderingCompleted?.expandedDetails
                        ?.hasSearchSourceLabel === true &&
                      summary.guiWebToolsRenderingCompleted
                        ?.hasAssistantSummary === true
                    : isReasoningFirstVisibleScenario
                      ? pageText.includes(REASONING_FIRST_VISIBLE_PROMPT) &&
                        pageText.includes(REASONING_FIRST_VISIBLE_TEXT) &&
                        (pageText.includes(
                          REASONING_FIRST_VISIBLE_FINAL_TEXT,
                        ) ||
                          pageText.includes(REASONING_FIRST_VISIBLE_DONE_TEXT))
                    : isTerminalCanceledAfterAnswerScenario
                      ? pageText.includes(
                          TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
                        ) &&
                        pageText.includes(
                          TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
                        )
                    : isTerminalFailedAfterAnswerScenario
                      ? pageText.includes(
                          TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
                        ) &&
                        pageText.includes(
                          TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
                        ) &&
                        pageText.includes(
                          TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
                        )
                    : isTerminalStaleGuardScenario
                      ? pageText.includes(TERMINAL_STALE_GUARD_FIRST_PROMPT) &&
                        pageText.includes(TERMINAL_STALE_GUARD_SECOND_PROMPT) &&
                        pageText.includes(TERMINAL_STALE_GUARD_SECOND_TEXT) &&
                        pageText.includes(TERMINAL_STALE_GUARD_DONE_TEXT) &&
                        pageText.includes(TERMINAL_STALE_GUARD_FIRST_DONE_TEXT) &&
                        !pageText.includes(TERMINAL_STALE_GUARD_STALE_DONE_TEXT)
                    : isMcpStructuredContentScenario
                      ? summary.guiMcpStructuredContentCompleted?.hasPrompt ===
                          true &&
                        summary.guiMcpStructuredContentCompleted
                          ?.hasStructuredAnswer === true &&
                        summary.guiMcpStructuredContentCompleted
                          ?.envelopeVisible === false
                      : isMediaReferenceScenario
                        ? pageText.includes(MEDIA_REFERENCE_PROMPT) &&
                          pageText.includes(MEDIA_REFERENCE_SUMMARY_TEXT) &&
                          pageText.includes(MEDIA_REFERENCE_URI)
                      : isMultiAgentTeamScenario
                        ? pageText.includes(MULTI_AGENT_TEAM_PROMPT) &&
                          (pageText.includes(MULTI_AGENT_TEAM_SUMMARY_TEXT) ||
                            pageText.includes(MULTI_AGENT_TEAM_DONE_TEXT))
                        : isSkillsRuntimeScenario
                          ? summary.guiSkillsRuntimeCompleted?.hasPrompt ===
                              true &&
                            (summary.guiSkillsRuntimeCompleted
                              ?.hasAssistantSummary === true ||
                              summary.guiSkillsRuntimeCompleted?.hasDoneText ===
                                true) &&
                            summary.guiExplicitSkillsRuntimeCompleted
                              ?.hasPrompt === true &&
                            (summary.guiExplicitSkillsRuntimeCompleted
                              ?.hasAssistantSummary === true ||
                              summary.guiExplicitSkillsRuntimeCompleted
                                ?.hasDoneText === true) &&
                            summary.guiManualEnableSkillsRuntimeCompleted
                              ?.hasPrompt === true &&
                            (summary.guiManualEnableSkillsRuntimeCompleted
                              ?.hasAssistantSummary === true ||
                              summary.guiManualEnableSkillsRuntimeCompleted
                                ?.hasDoneText === true)
                          : isAnyExpertSkillsRuntimeScenario
                            ? isExpertPanelSkillsRuntimeScenario
                              ? summary.guiExpertPanelSkillsRuntimeCompleted
                                  ?.hasPrompt === true &&
                                (summary.guiExpertPanelSkillsRuntimeCompleted
                                  ?.hasAssistantSummary === true ||
                                  summary.guiExpertPanelSkillsRuntimeCompleted
                                    ?.hasDoneText === true) &&
                                pageText.includes(EXPERT_SKILLS_RUNTIME_TITLE)
                              : summary.guiExpertSkillsRuntimeCompleted
                                  ?.hasPrompt === true &&
                                (summary.guiExpertSkillsRuntimeCompleted
                                  ?.hasAssistantSummary === true ||
                                  summary.guiExpertSkillsRuntimeCompleted
                                    ?.hasDoneText === true) &&
                                pageText.includes(EXPERT_SKILLS_RUNTIME_TITLE)
                            : pageText.includes(NEWS_PROMPT) &&
                              (pageText.includes("今日国际新闻简要整理") ||
                                pageText.includes(ASSISTANT_DONE_TEXT)),
    noInvokeErrors: !errorRaw,
    noConsoleErrors: actionableConsoleErrors.length === 0,
    agentUiPerformanceTraceEvidenceAvailable:
      !shouldRequireAgentUiTraceEvidence ||
      agentUiPerformanceTrace?.available === true,
    agentUiPerformanceTraceSeparatesProviderAndClient:
      !shouldRequireTextStreamTraceSeparation ||
      (agentUiPerformanceTrace?.hasProviderWaitMs === true &&
        agentUiPerformanceTrace?.hasClientLocalOutputMs === true),
    agentUiPerformanceTraceHasFirstVisibleTextPaint:
      !shouldRequireTextStreamTraceSeparation ||
      (agentUiPerformanceTrace?.hasFirstVisibleOutputMs === true &&
        agentUiPerformanceTrace?.hasFirstTextDeltaToFirstTextPaintMs === true),
    agentUiPerformanceTraceNoRawPayload:
      agentUiPerformanceTrace == null ||
      (agentUiPerformanceTrace.rawEntriesExported === false &&
        agentUiPerformanceTrace.forbiddenFragmentPresent === false),
    appServerTraceEvidenceAvailable:
      !shouldRequireAgentUiTraceEvidence ||
      appServerTraceEvidence?.available === true,
    appServerTraceEvidenceUsesCurrentMethods:
      !shouldRequireAgentUiTraceEvidence ||
      (appServerRequestMethods.includes(
        APP_SERVER_METHOD_DIAGNOSTICS_TRACE_LIST,
      ) &&
        appServerRequestMethods.includes(
          APP_SERVER_METHOD_DIAGNOSTICS_TRACE_READ,
        ) &&
        appServerRequestMethods.includes(
          APP_SERVER_METHOD_DIAGNOSTICS_TRACE_EXPORT,
        )),
    appServerTraceSupportBundleOptInUsesCurrentMethod:
      !shouldRequireAgentUiTraceEvidence ||
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT,
      ),
    appServerTraceEvidenceSeparatesProviderAndServer:
      !shouldRequireTextStreamTraceSeparation ||
      (appServerTraceEvidence?.hasProviderFirstTextDelta === true &&
        appServerTraceEvidence?.hasAppServerMessageDelta === true),
    appServerTraceEvidenceHasW3cCarrier:
      !shouldRequireAgentUiTraceEvidence ||
      appServerTraceEvidence?.hasW3cTraceContext === true,
    appServerTraceEvidenceExportedSummaryOnly:
      !shouldRequireAgentUiTraceEvidence ||
      (appServerTraceEvidence?.export?.exported === true &&
        appServerTraceEvidence?.export?.includedSections?.includes(
          "trace/events.jsonl",
        ) === true &&
        appServerTraceEvidence?.export?.omittedSections?.includes(
          "assistant delta text",
        ) === true &&
        appServerTraceEvidence?.export?.redactionMode === "summary_only"),
    appServerTraceSupportBundleOptInSummaryOnly:
      !shouldRequireAgentUiTraceEvidence ||
      (appServerTraceEvidence?.supportBundleWithTrace?.bundlePathExists ===
        true &&
        appServerTraceEvidence?.supportBundleWithTrace?.traceExportIncluded ===
          true &&
        appServerTraceEvidence?.supportBundleWithTrace?.rawTraceJsonlOmitted ===
          true),
    appServerTraceEvidenceNoRawPayload:
      appServerTraceEvidence == null ||
      appServerTraceEvidence.forbiddenFragmentPresent === false,
  };
  return commonAssertions;
}
