import {
  APP_SERVER_METHOD_SESSION_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  ASSISTANT_DONE_TEXT,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EXPERT_SKILLS_RUNTIME_TITLE,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
} from "./claw-chat-current-fixture-constants.mjs";

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
    isWebToolsRenderingScenario,
    isMcpStructuredContentScenario,
    isSkillsRuntimeScenario,
    isRightSurfaceVisualMatrixScenario,
    isContentFactoryProductProfileScenario,
    isAnyExpertSkillsRuntimeScenario,
    isExpertPanelSkillsRuntimeScenario,
    summary,
    pageText,
    errorRaw,
    actionableConsoleErrors,
  } = context;
  const commonAssertions = {
    electronPreloadBridge: rendererSnapshot.electron === true,
    appServerJsonRpcUsed:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) ||
      guiTurnStartReachedBackend ||
      (isRightSurfaceVisualMatrixScenario &&
        appServerRequestMethods.includes(
          APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
        )) ||
      (isContentFactoryProductProfileScenario &&
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
    externalFixtureBackendUsed:
      isRightSurfaceVisualMatrixScenario ||
      isContentFactoryProductProfileScenario
        ? true
        : backendLedger.some((entry) => entry.kind === "turnStart"),
    fixturePromptReachedBackend:
      isRightSurfaceVisualMatrixScenario ||
      isContentFactoryProductProfileScenario
        ? true
        : guiTurnStartReachedBackend,
    liveProviderNotUsed: backendLedger.every(
      (entry) =>
        entry.kind !== "turnStart" ||
        ((!entry.providerPreference ||
          entry.providerPreference === FIXTURE_PROVIDER) &&
          (!entry.modelPreference || entry.modelPreference === FIXTURE_MODEL)),
    ),
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
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.expertInfo?.stable
              ?.rootVisible === true
          : isContentFactoryProductProfileScenario
            ? summary.contentFactoryProductProfileGui?.rootVisible === true &&
              summary.contentFactoryProductProfileGui?.hasArticleTitle === true
            : isPlanScenario
              ? summary.guiPlanCompleted?.hasPrompt === true
              : isGoalScenario
                ? summary.guiGoalCompleted?.hasPrompt === true
                : isWebToolsRenderingScenario
                  ? summary.guiWebToolsRenderingCompleted?.hasPrompt === true
                  : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted?.hasPrompt ===
                      true
                    : isSkillsRuntimeScenario
                      ? summary.guiSkillsRuntimeCompleted?.hasPrompt === true &&
                        summary.guiExplicitSkillsRuntimeCompleted?.hasPrompt ===
                          true &&
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
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.files?.stable
              ?.rootVisible === true &&
            summary.rightSurfaceVisualMatrix?.captures?.objectCanvas?.stable
              ?.rootVisible === true &&
            summary.rightSurfaceVisualMatrix?.captures?.browser?.stable
              ?.rootVisible === true
          : isContentFactoryProductProfileScenario
            ? summary.contentFactoryProductProfileGui?.hasImageSetTitle ===
                true &&
              summary.contentFactoryProductProfileGui
                ?.hasWorkerEvidenceTitle === true
            : isPlanScenario
              ? summary.guiPlanCompleted?.hasPlanIntro === true ||
                summary.guiPlanCompleted?.hasDoneText === true ||
                (summary.guiPlanCompleted?.hasPlanSection === true &&
                  summary.guiPlanCompleted?.hasAllPlanSteps === true)
              : isGoalScenario
                ? summary.guiGoalCompleted?.hasAssistantSummary === true ||
                  summary.guiGoalCompleted?.hasDoneText === true
                : isWebToolsRenderingScenario
                  ? summary.guiWebToolsRenderingCompleted
                      ?.hasAssistantSummary === true ||
                    summary.guiWebToolsRenderingCompleted?.hasDoneText === true
                  : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted
                        ?.hasStructuredAnswer === true
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
                        : summary.guiCompleted?.hasAssistantSummary === true ||
                          summary.guiCompleted?.hasDoneText === true,
    guiInputRemainsReady: isCancelOnlyScenario
      ? summary.guiCanceled?.textareaVisible === true &&
        summary.guiCanceled?.textareaDisabled === false
      : isCancelThenContinueScenario
        ? summary.guiContinueCompleted?.textareaVisible === true &&
          summary.guiContinueCompleted?.textareaDisabled === false
        : isRightSurfaceVisualMatrixScenario
          ? summary.guiRightSurfaceVisualMatrixSessionOpened?.inputReady
              ?.textareaDisabled === false
          : isContentFactoryProductProfileScenario
            ? summary.guiContentFactoryProductProfileSessionOpened?.inputReady
                ?.textareaDisabled === false
            : isPlanScenario
              ? summary.guiPlanCompleted?.planDecisionVisible === true &&
                summary.guiPlanCompleted?.textareaVisible === false
              : isGoalScenario
                ? summary.guiGoalCompleted?.textareaVisible === true &&
                  summary.guiGoalCompleted?.textareaDisabled === false
                : isWebToolsRenderingScenario
                  ? summary.guiWebToolsRenderingCompleted?.textareaVisible ===
                      true &&
                    summary.guiWebToolsRenderingCompleted?.textareaDisabled ===
                      false
                  : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted
                        ?.textareaVisible === true &&
                      summary.guiMcpStructuredContentCompleted
                        ?.textareaDisabled === false
                    : isSkillsRuntimeScenario
                      ? summary.guiSkillsRuntimeCompleted?.textareaVisible ===
                          true &&
                        summary.guiSkillsRuntimeCompleted?.textareaDisabled ===
                          false &&
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
        : isRightSurfaceVisualMatrixScenario
          ? true
          : isContentFactoryProductProfileScenario
            ? true
            : isPlanScenario
              ? summary.guiPlanCompleted?.stopButtonVisible === false
              : isGoalScenario
                ? summary.guiGoalCompleted?.stopButtonVisible === false
                : isWebToolsRenderingScenario
                  ? summary.guiWebToolsRenderingCompleted?.stopButtonVisible ===
                    false
                  : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted
                        ?.stopButtonVisible === false
                    : isSkillsRuntimeScenario
                      ? summary.guiSkillsRuntimeCompleted?.stopButtonVisible ===
                          false &&
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
        : isRightSurfaceVisualMatrixScenario
          ? summary.rightSurfaceVisualMatrix?.captures?.files?.stable
              ?.activeSurface === "files" &&
            summary.rightSurfaceVisualMatrix?.captures?.objectCanvas?.stable
              ?.activeSurface === "productProfile" &&
            summary.rightSurfaceVisualMatrix?.captures?.expertInfo?.stable
              ?.activeSurface === "expertInfo" &&
            summary.rightSurfaceVisualMatrix?.captures?.browser?.stable
              ?.activeSurface === "browser" &&
            summary.rightSurfaceVisualMatrix?.captures?.appSurface?.stable
              ?.activeSurface === "appSurface"
          : isContentFactoryProductProfileScenario
            ? summary.contentFactoryProductProfileGui?.activeSurface ===
                "productProfile" &&
              summary.contentFactoryProductProfileGui?.hasArticleTitle ===
                true &&
              summary.contentFactoryProductProfileGui?.hasImageSetTitle ===
                true &&
              summary.contentFactoryProductProfileGui
                ?.hasWorkerEvidenceTitle === true
            : isPlanScenario
              ? pageText.includes(PLAN_PROMPT) &&
                PLAN_STEPS.every((step) => pageText.includes(step.step))
              : isGoalScenario
                ? pageText.includes(GOAL_PROMPT) &&
                  (pageText.includes("目标已绑定到本轮请求") ||
                    pageText.includes(GOAL_DONE_TEXT))
                : isWebToolsRenderingScenario
                  ? summary.guiWebToolsRenderingCompleted?.hasPrompt === true &&
                    summary.guiWebToolsRenderingCompleted?.hasProcessTitle ===
                      true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasSearchTitle === true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasSearchSourceLabel === true &&
                    summary.guiWebToolsRenderingCompleted
                      ?.hasAssistantSummary === true
                  : isMcpStructuredContentScenario
                    ? summary.guiMcpStructuredContentCompleted?.hasPrompt ===
                        true &&
                      summary.guiMcpStructuredContentCompleted
                        ?.hasStructuredAnswer === true &&
                      summary.guiMcpStructuredContentCompleted
                        ?.envelopeVisible === false
                    : isSkillsRuntimeScenario
                      ? summary.guiSkillsRuntimeCompleted?.hasPrompt === true &&
                        (summary.guiSkillsRuntimeCompleted
                          ?.hasAssistantSummary === true ||
                          summary.guiSkillsRuntimeCompleted?.hasDoneText ===
                            true) &&
                        summary.guiExplicitSkillsRuntimeCompleted?.hasPrompt ===
                          true &&
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
  };
  return commonAssertions;
}
