import { WEB_TOOLS_RENDERING_PROMPT } from "./claw-chat-current-fixture-constants.mjs";

export function buildWebToolsRenderingScenarioAssertions({
  summary,
  webToolsRenderingTurnStart,
}) {
  return {
    webToolsRenderingPromptReachedBackend:
      webToolsRenderingTurnStart?.inputText === WEB_TOOLS_RENDERING_PROMPT,
    guiWebToolsRenderingInputSubmitted:
      summary.webToolsRenderingInputSend?.afterFill
        ?.promptVisibleInTextarea === true &&
      summary.webToolsRenderingInputSend?.clicked?.clicked === true,
    guiWebToolsLiveRunningStateCaptured:
      (summary.guiWebToolsRenderingInProgress
        ?.webToolsLiveRunningStateCaptured === true &&
        summary.guiWebToolsRenderingInProgress?.hasPrompt === true &&
        summary.guiWebToolsRenderingInProgress?.webProcessGroupExpanded ===
          true &&
        summary.guiWebToolsRenderingInProgress?.hasAssistantSummary === false &&
        summary.guiWebToolsRenderingInProgress?.hasDoneText === false) ||
      (summary.guiWebToolsRenderingInProgress
        ?.fastCompletedBeforeLiveCapture === true &&
        summary.guiWebToolsRenderingInProgress?.hasPrompt === true &&
        summary.guiWebToolsRenderingInProgress?.hasAssistantSummary === true &&
        summary.guiWebToolsRenderingInProgress?.hasFinalTextAfterProcess ===
          true),
    guiWebToolsLiveNoLegacyTextAfterProcess:
      summary.guiWebToolsRenderingInProgress
        ?.runningProcessHasLegacyTextAfterProcess === false &&
      (summary.guiWebToolsRenderingInProgress
        ?.webToolsLiveRunningStateCaptured === true
        ? summary.guiWebToolsRenderingInProgress
            ?.latestAssistantTextAfterProcessPart === false
        : summary.guiWebToolsRenderingInProgress
            ?.fastCompletedBeforeLiveCapture === true),
    guiWebSearchProcessDefaultCollapsed:
      summary.guiWebToolsRenderingCompleted?.webProcessGroupExpanded === false,
    guiWebSearchProcessShowsSourcesAfterExpand:
      summary.guiWebToolsRenderingCompleted?.expandedDetails
        ?.hasSearchSourceSection === true &&
      summary.guiWebToolsRenderingCompleted?.expandedDetails?.hasSearchTitle ===
        true &&
      summary.guiWebToolsRenderingCompleted?.expandedDetails
        ?.hasSearchSourceLabel === true &&
      summary.guiWebToolsRenderingCompleted?.expandedDetails
        ?.hasFullSearchUrlVisible === false,
    guiWebFetchProcessShowsReadPagesAfterExpand:
      summary.guiWebToolsRenderingCompleted?.expandedDetails
        ?.hasFetchPageSection === true &&
      summary.guiWebToolsRenderingCompleted?.expandedDetails?.hasFetchPageUrl ===
        true,
    guiWebToolsTimelineOrderPreserved:
      summary.guiWebToolsRenderingCompleted?.expandedDetails
        ?.hasTimelineOrderPreserved === true,
    guiWebSearchNoiseHidden:
      summary.guiWebToolsRenderingCompleted?.searchNoiseVisible === false,
    guiMarkdownRendered:
      summary.guiWebToolsRenderingCompleted?.rawMarkdownVisible === false &&
      summary.guiWebToolsRenderingCompleted?.markdownHeadingVisible === true &&
      summary.guiWebToolsRenderingCompleted?.markdownStrongVisible === true &&
      summary.guiWebToolsRenderingCompleted?.markdownTableVisible === true,
    guiWebSearchFinalTextInterleaved:
      summary.guiWebToolsRenderingCompleted?.hasFinalTextAfterProcess === true,
    guiWebFetchTransportEnvelopeHidden:
      summary.guiWebToolsRenderingCompleted?.rawJsonEnvelopeVisible === false &&
      summary.guiWebToolsRenderingCompleted?.hasFetchMarkdownHidden === true,
    readModelWebToolsRenderingCompleted:
      summary.readModelWebToolsRenderingCompleted?.includesPrompt === true &&
      (summary.readModelWebToolsRenderingCompleted?.includesAssistantDone ===
        true ||
        summary.readModelWebToolsRenderingCompleted?.includesAssistantSummary ===
          true) &&
      summary.readModelWebToolsRenderingCompleted?.includesWebSearchTool ===
        true &&
      summary.readModelWebToolsRenderingCompleted?.includesWebFetchTool === true,
    readModelWebToolsReasoningProviderMetadataPreserved:
      summary.readModelWebToolsRenderingCompleted?.includesReasoningFinal ===
        true &&
      summary.readModelWebToolsRenderingCompleted
        ?.includesReasoningFinalProviderMetadata === true &&
      summary.readModelWebToolsRenderingCompleted?.includesReasoningItem ===
        true &&
      summary.readModelWebToolsRenderingCompleted
        ?.includesReasoningItemProviderMetadata === true,
    guiWebToolsReasoningDidNotOpenPlanRail:
      summary.guiWebToolsRenderingCompleted?.hasAllPlanSteps === false &&
      summary.guiWebToolsRenderingCompleted?.planDecisionVisible === false,
  };
}
