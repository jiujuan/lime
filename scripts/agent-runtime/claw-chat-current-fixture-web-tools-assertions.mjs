import { WEB_TOOLS_RENDERING_PROMPT } from "./claw-chat-current-fixture-constants.mjs";

export function buildWebToolsRenderingScenarioAssertions({
  summary,
  webToolsRenderingTurnStart,
}) {
  return {
    webToolsRenderingPromptReachedBackend:
      webToolsRenderingTurnStart?.inputText === WEB_TOOLS_RENDERING_PROMPT,
    guiWebToolsRenderingInputSubmitted:
      summary.webToolsRenderingInputSend?.afterFill?.promptVisibleInTextarea ===
        true && summary.webToolsRenderingInputSend?.clicked?.clicked === true,
    guiWebToolsLiveRunningStateCaptured:
      summary.guiWebToolsRenderingInProgress
        ?.webToolsLiveRunningStateCaptured === true &&
      summary.guiWebToolsRenderingInProgress?.hasPrompt === true &&
      summary.guiWebToolsRenderingInProgress?.webProcessGroupExpanded ===
        true &&
      summary.guiWebToolsRenderingInProgress?.hasAssistantSummary === false &&
      summary.guiWebToolsRenderingInProgress?.hasDoneText === false,
    guiWebToolsLiveNoLegacyTextAfterProcess:
      summary.guiWebToolsRenderingInProgress
        ?.runningProcessHasLegacyTextAfterProcess === false &&
      summary.guiWebToolsRenderingInProgress
        ?.latestAssistantTextAfterProcessPart === false,
    guiWebToolsLiveSourcesVisible:
      summary.guiWebToolsRenderingInProgress?.hasSearchSourceSection === true &&
      summary.guiWebToolsRenderingInProgress?.hasSearchTitle === true &&
      summary.guiWebToolsRenderingInProgress?.hasSearchSourceLabel === true &&
      summary.guiWebToolsRenderingInProgress?.hasFullSearchUrlVisible === false,
    guiWebToolsLiveReadPagesVisible:
      summary.guiWebToolsRenderingInProgress?.hasFetchPageSection === true &&
      summary.guiWebToolsRenderingInProgress?.hasFetchPageUrl === true,
    guiWebToolsLiveTimelineOrderPreserved:
      summary.guiWebToolsRenderingInProgress?.hasTimelineOrderPreserved ===
      true,
    guiWebToolsCompletedProcessCompacted:
      summary.guiWebToolsRenderingCompleted
        ?.historicalTimelinePreviewVisible === true &&
      summary.guiWebToolsRenderingCompleted?.processGroupCount === 0 &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantMessageContentPartTypes.includes(
        "tool:WebSearch",
      ) === true &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantMessageContentPartTypes.includes(
        "thinking",
      ) === true &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantMessageContentPartTypes.includes(
        "tool:WebFetch",
      ) === true &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantRendererContentPartTypes.includes(
        "tool:WebSearch",
      ) === false &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantRendererContentPartTypes.includes(
        "thinking",
      ) === false &&
      summary.guiWebToolsRenderingCompleted?.latestAssistantRendererContentPartTypes.includes(
        "tool:WebFetch",
      ) === false,
    guiWebSearchNoiseHidden:
      summary.guiWebToolsRenderingCompleted?.searchNoiseVisible === false,
    guiMarkdownRendered:
      summary.guiWebToolsRenderingCompleted?.rawMarkdownVisible === false &&
      summary.guiWebToolsRenderingCompleted?.markdownHeadingVisible === true &&
      summary.guiWebToolsRenderingCompleted?.markdownStrongVisible === true &&
      summary.guiWebToolsRenderingCompleted?.markdownTableVisible === true,
    guiWebToolsFinalTextVisibleAfterCompletion:
      summary.guiWebToolsRenderingCompleted?.hasAssistantSummary === true &&
      summary.guiWebToolsRenderingCompleted?.hasDoneText === true,
    guiWebFetchTransportEnvelopeHidden:
      summary.guiWebToolsRenderingCompleted?.rawJsonEnvelopeVisible === false &&
      summary.guiWebToolsRenderingCompleted?.hasFetchMarkdownHidden === true,
    readModelWebToolsRenderingCompleted:
      summary.readModelWebToolsRenderingCompleted?.includesPrompt === true &&
      (summary.readModelWebToolsRenderingCompleted?.includesAssistantDone ===
        true ||
        summary.readModelWebToolsRenderingCompleted
          ?.includesAssistantSummary === true) &&
      summary.readModelWebToolsRenderingCompleted?.includesWebSearchTool ===
        true &&
      summary.readModelWebToolsRenderingCompleted?.includesWebFetchTool ===
        true,
    readModelWebToolsReasoningProviderMetadataPreserved:
      summary.readModelWebToolsRenderingCompleted?.includesReasoningItem ===
        true &&
      summary.readModelWebToolsRenderingCompleted
        ?.includesReasoningItemProviderMetadata === true,
    guiWebToolsReasoningDidNotOpenPlanRail:
      summary.guiWebToolsRenderingCompleted?.hasAllPlanSteps === false &&
      summary.guiWebToolsRenderingCompleted?.planDecisionVisible === false,
  };
}
