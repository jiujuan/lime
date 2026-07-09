import { areArtifactProtocolPathsEquivalent } from "@/lib/artifact-protocol";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";
import { isPureRuntimePeerMessageText } from "../utils/runtimePeerMessageDisplay";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/messageDisplaySanitizer";
import { hasStructuredHistoricalContentHint } from "../projection/historicalMessageHydrationProjection";
import { shouldUseAgentMessageAsFinalText } from "../utils/agentMessagePhase";
import { buildHistoricalMessagePreview } from "./messageListHistoricalPreviewText";
import {
  parseLeadingUserCommandTag,
  resolveInstalledSkillMessageLabel,
} from "./messageListUserContentState";
import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import {
  resolveImageWorkbenchMessageDisplayState,
  resolveImageWorkbenchProcessDisplayState,
  resolveImageWorkbenchRendererProcessState,
} from "./imageWorkbenchMessageDisplay";
import {
  createInlineCoverageMatcher,
  dedupeDeferredTimelineItems,
  filterConversationDisplayContentParts,
  hasTimelineProcessItems,
  isDeferredTimelineItem,
  mergeStreamingOverlayContentParts,
  resolveInlineProcessCoverage,
  resolveInlineThinkingContent,
  hasPersistedReasoningTimelineItem,
  shouldKeepInlineProcessForActiveAssistant,
  shouldRenderConversationTimelineItem,
  shouldSuppressPreAnswerThinkingTimeline,
} from "./messageListInlineProcess";
import { hasImportedSourceProcessItem } from "../utils/importedSourceProcess";
import {
  MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_PREVIEW_CHARS,
  MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_THRESHOLD,
  MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD,
  MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS,
  MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_THRESHOLD,
} from "./messageListConstants";
import {
  collectFileChangeBatchPaths,
  ensureInlineThinkingContentPart,
  hasFinalTextAfterProcessBoundary,
  hasInlineProcessContentParts,
  hasInlineToolUseContentPart,
  normalizeInlineThinkingContentParts,
  resolveAssistantActionContent,
  resolveDeferredTextContentParts,
  resolveProcessSeparatedContentParts,
} from "./messageListProjectionContentParts";
import {
  hasCompletedOrRunningWebRetrievalTimelineItem,
  hasFinalAnswerTextAfterRunningWebRetrieval,
  hasFinalAnswerTextTimelineItem,
  hasRunningWebRetrievalContentPart,
  hasRunningWebRetrievalTimelineItem,
  hideFinalAnswerContentPartsWhileRunning,
  isActiveThreadTurnStatus,
  normalizeInactiveRunningWebRetrievalContentParts,
  normalizeInactiveRunningWebRetrievalTimelineItems,
} from "./messageListProjectionWebRetrieval";
import {
  canMergeTimelineAsSparseProcessPatch,
  canTimelineOwnInlineProcessFlow,
  isRuntimeFailureOnlyAssistantText,
  resolveMessageInteractiveProjectionState,
  resolveTimelineOwnedVisibleText,
  sanitizeRuntimeFailureAssistantText,
  sanitizeProjectedMessageText,
  shouldUseFirstTokenRuntimeStatus,
} from "./messageListItemProjectionHelpers";
import { resolveMessageListItemArtifactProjection } from "./messageListItemProjectionArtifacts";
import type { ResolveMessageListItemProjectionOptions } from "./messageListItemProjectionTypes";

export function resolveMessageListItemProjection({
  activeCurrentTurnId,
  activePendingA2UISource,
  canOpenSavedSiteContent,
  expandedHistoricalAssistantMessageIds,
  expandedHistoricalTimelineKeys,
  expandedLongHistoricalMessageIds,
  focusedTimelineItemId,
  group,
  hasActiveInteractiveRuntime,
  isRestoredHistoryWindow,
  isSending,
  lastAssistantMessageId,
  message,
  shouldDeferHistoricalAssistantMessageDetails,
  shouldDeferThreadItemsScan,
  streamingTextOverlay = null,
}: ResolveMessageListItemProjectionOptions) {
  const rawStreamingFinalTextOverlayContent =
    message.role === "assistant" &&
    streamingTextOverlay?.content &&
    shouldUseAgentMessageAsFinalText(streamingTextOverlay.phase)
      ? streamingTextOverlay.content
      : null;
  const rawDisplayContent = message.content || "";
  const hasImages = Array.isArray(message.images) && message.images.length > 0;
  const imageWorkbenchDisplayState = resolveImageWorkbenchMessageDisplayState({
    message,
    rawDisplayContent,
    thinkingContent:
      message.role === "assistant" && message.imageWorkbenchPreview
        ? resolveInlineThinkingContent(message)
        : undefined,
  });
  const shouldSuppressStandaloneImageWorkbenchProcess =
    imageWorkbenchDisplayState.shouldSuppressStandaloneProcess;
  const shouldSuppressImageProcessFlow =
    imageWorkbenchDisplayState.shouldSuppressProcessFlow;
  const visibleRawDisplayContent =
    imageWorkbenchDisplayState.visibleRawDisplayContent;
  const displayContent = sanitizeMessageTextForDisplay(
    visibleRawDisplayContent,
    {
      role: message.role,
      hasImages,
    },
  );
  const shouldDeferMessageDetails =
    shouldDeferHistoricalAssistantMessageDetails(message);
  const rawRuntimePeerContent = visibleRawDisplayContent.trim();
  const shouldRenderRuntimePeerCards =
    rawRuntimePeerContent.length > 0 &&
    isPureRuntimePeerMessageText(rawRuntimePeerContent);
  const sanitizedDisplayContentParts = shouldDeferMessageDetails
    ? resolveDeferredTextContentParts(message.contentParts, {
        role: message.role,
        hasImages,
      })
    : sanitizeContentPartsForDisplay(message.contentParts, {
        role: message.role,
        hasImages,
      });
  const imageWorkbenchProcessDisplayState =
    resolveImageWorkbenchProcessDisplayState({
      message,
      sanitizedContentParts: sanitizedDisplayContentParts,
      shouldDeferMessageDetails,
      shouldFoldSuppressedProcessFlow:
        imageWorkbenchDisplayState.shouldFoldSuppressedProcessFlow,
      shouldSuppressImageProcessFlow,
    });
  const {
    displayContentParts: rawDisplayContentParts,
    shouldFoldSuppressedProcessFlow,
    shouldSuppressRendererProcessFlow,
  } = imageWorkbenchProcessDisplayState;
  const isConversationTailAssistant =
    message.role === "assistant" && message.id === group.lastAssistantId;
  const isTimelineOwnerAssistant =
    message.role === "assistant" &&
    group.timeline !== null &&
    (group.timelineMessageId === message.id ||
      (!group.timelineMessageId && isConversationTailAssistant));
  const timeline =
    message.role !== "assistant"
      ? null
      : isTimelineOwnerAssistant
        ? group.timeline
        : null;
  const rawTimelineItems = timeline?.items;
  const hasProcessTimelineItems = hasTimelineProcessItems(rawTimelineItems);
  const hasPersistedReasoningTimeline =
    hasPersistedReasoningTimelineItem(rawTimelineItems);
  const hasRunningTimelineProcess =
    timeline !== null && hasRunningWebRetrievalTimelineItem(rawTimelineItems);
  const hasCompletedOrRunningWebRetrievalTimelineProcess =
    timeline !== null &&
    hasCompletedOrRunningWebRetrievalTimelineItem(rawTimelineItems);
  const hasRunningWebRetrievalPart = hasRunningWebRetrievalContentPart(
    rawDisplayContentParts,
  );
  const hasInlineNonThinkingProcessPart = Boolean(
    rawDisplayContentParts?.some(
      (part) =>
        part.type === "tool_use" ||
        part.type === "action_required" ||
        part.type === "file_changes_batch",
    ),
  );
  const hasInlineToolUseProcessPart = hasInlineToolUseContentPart(
    rawDisplayContentParts,
  );
  const hasActiveTimelineTurn =
    timeline !== null && isActiveThreadTurnStatus(timeline.turn.status);
  const isLegacyUnphasedStreamingOverlay =
    message.role === "assistant" &&
    Boolean(rawStreamingFinalTextOverlayContent?.trim()) &&
    !streamingTextOverlay?.phase?.trim();
  const hasStructuredProcessBoundaryForActiveTurn =
    hasProcessTimelineItems ||
    hasCompletedOrRunningWebRetrievalTimelineProcess ||
    hasRunningWebRetrievalPart ||
    hasInlineToolUseProcessPart;
  const shouldHideLegacyUnphasedOverlayDuringProcess =
    isLegacyUnphasedStreamingOverlay &&
    hasStructuredProcessBoundaryForActiveTurn &&
    (message.isThinking || isSending || hasActiveTimelineTurn);
  const streamingFinalTextOverlay = shouldHideLegacyUnphasedOverlayDuringProcess
    ? null
    : rawStreamingFinalTextOverlayContent
      ? streamingTextOverlay
      : null;
  const streamingFinalTextOverlayContent =
    streamingFinalTextOverlay?.content ?? null;
  const hasFinalAnswerAfterRunningWebRetrieval =
    hasFinalAnswerTextAfterRunningWebRetrieval(rawTimelineItems);
  const hasFinalAnswerTimelineItem =
    hasFinalAnswerTextTimelineItem(rawTimelineItems);
  const isActiveAssistantOutput =
    message.isThinking ||
    isSending ||
    Boolean(streamingFinalTextOverlayContent?.trim()) ||
    hasActiveTimelineTurn;
  const shouldHoldRunningWebRetrieval =
    (hasRunningTimelineProcess || hasRunningWebRetrievalPart) &&
    isActiveAssistantOutput;
  const shouldNormalizeInactiveRunningWebRetrieval =
    message.role === "assistant" && !shouldHoldRunningWebRetrieval;
  const displayContentParts = normalizeInactiveRunningWebRetrievalContentParts(
    rawDisplayContentParts,
    shouldNormalizeInactiveRunningWebRetrieval,
  );
  const timelineItemsForDisplay =
    normalizeInactiveRunningWebRetrievalTimelineItems(
      rawTimelineItems,
      shouldNormalizeInactiveRunningWebRetrieval,
    );
  const hasTimelinePlanItem = Boolean(
    timelineItemsForDisplay?.some((item) => item.type === "plan"),
  );
  const primaryTimelineKey = timeline ? `leading:${timeline.turn.id}` : null;
  const hasImportedSourcePrimaryTimeline = hasImportedSourceProcessItem(
    timelineItemsForDisplay,
  );
  const shouldPreferCompactHistoricalTimeline =
    Boolean(primaryTimelineKey) &&
    isRestoredHistoryWindow &&
    !focusedTimelineItemId &&
    timeline?.turn.status === "completed" &&
    timeline.turn.id !== activeCurrentTurnId &&
    !hasImportedSourcePrimaryTimeline &&
    !expandedHistoricalTimelineKeys.has(primaryTimelineKey!) &&
    (shouldDeferThreadItemsScan ||
      (timelineItemsForDisplay?.length || 0) >=
        MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD);
  const shouldKeepExpandedHistoricalTimelineInTimeline =
    Boolean(primaryTimelineKey) &&
    isRestoredHistoryWindow &&
    !focusedTimelineItemId &&
    timeline?.turn.status === "completed" &&
    timeline.turn.id !== activeCurrentTurnId &&
    !hasImportedSourcePrimaryTimeline &&
    expandedHistoricalTimelineKeys.has(primaryTimelineKey!);
  const hasStreamingOverlayText = Boolean(
    streamingFinalTextOverlayContent?.trim(),
  );
  const hasStructuredFinalTextAfterProcessBoundary =
    hasFinalTextAfterProcessBoundary(displayContentParts);
  const shouldHideAssistantTextWhileRunning =
    shouldHoldRunningWebRetrieval &&
    !hasFinalAnswerTimelineItem &&
    !hasStreamingOverlayText &&
    !hasStructuredFinalTextAfterProcessBoundary &&
    (hasFinalAnswerAfterRunningWebRetrieval ||
      Boolean(displayContent.trim()) ||
      !message.thinkingContent?.trim());
  const isActiveProcessOnlyOutput =
    message.role === "assistant" &&
    isActiveAssistantOutput &&
    !hasFinalAnswerTimelineItem &&
    !displayContent.trim() &&
    (hasCompletedOrRunningWebRetrievalTimelineProcess ||
      hasRunningWebRetrievalPart);
  const messageContentPartsOwnInlineProcessFlow =
    message.role === "assistant" &&
    hasInlineProcessContentParts(message, {
      displayContent,
      timelineItems: timelineItemsForDisplay,
    });
  const timelineOwnsInlineProcessFlow =
    !messageContentPartsOwnInlineProcessFlow &&
    canTimelineOwnInlineProcessFlow(timelineItemsForDisplay);
  const shouldMergeTimelineProcessWithInlineThinking =
    messageContentPartsOwnInlineProcessFlow &&
    !hasInlineNonThinkingProcessPart &&
    canTimelineOwnInlineProcessFlow(timelineItemsForDisplay);
  const timelineInlineContentParts =
    message.role === "assistant" &&
    (timelineOwnsInlineProcessFlow ||
      (messageContentPartsOwnInlineProcessFlow &&
        canMergeTimelineAsSparseProcessPatch(timelineItemsForDisplay)) ||
      shouldMergeTimelineProcessWithInlineThinking) &&
    !shouldPreferCompactHistoricalTimeline &&
    !shouldKeepExpandedHistoricalTimelineInTimeline
      ? buildTimelineInlineContentParts({
          displayContent: shouldHideAssistantTextWhileRunning
            ? ""
            : displayContent,
          processPrefaceContent:
            shouldHideAssistantTextWhileRunning &&
            !message.thinkingContent?.trim()
              ? displayContent
              : undefined,
          existingContentParts: displayContentParts,
          items: timelineItemsForDisplay,
        })
      : undefined;
  const includeInlineProcessFlow =
    !shouldDeferMessageDetails &&
    !shouldSuppressRendererProcessFlow &&
    message.role === "assistant" &&
    (Boolean(timelineInlineContentParts?.length) ||
      shouldFoldSuppressedProcessFlow ||
      shouldKeepInlineProcessForActiveAssistant(
        message,
        isConversationTailAssistant,
        hasProcessTimelineItems,
        hasPersistedReasoningTimeline,
        Boolean(timeline),
        displayContent,
        isSending,
      ) ||
      // 消息 contentParts 已经持有过程顺序时，始终保留 inline process flow，
      // 让思考、工具、确认与文件改动按时间序穿插显示。
      messageContentPartsOwnInlineProcessFlow);
  const ensuredConversationContentParts =
    message.role === "assistant"
      ? ensureInlineThinkingContentPart({
          parts: hideFinalAnswerContentPartsWhileRunning(
            mergeStreamingOverlayContentParts(
              timelineInlineContentParts ||
                filterConversationDisplayContentParts(displayContentParts, {
                  includeProcessFlow: includeInlineProcessFlow,
                  preserveToolUseParts: !hasProcessTimelineItems,
                }),
              shouldHideAssistantTextWhileRunning
                ? null
                : streamingFinalTextOverlay,
            ),
            shouldHideAssistantTextWhileRunning,
          ),
          thinkingContent: message.thinkingContent,
          shouldEnsure:
            includeInlineProcessFlow &&
            Boolean(message.thinkingContent?.trim()) &&
            (Boolean(streamingFinalTextOverlayContent?.trim()) ||
              hasActiveTimelineTurn ||
              !hasPersistedReasoningTimeline),
        })
      : displayContentParts;
  const conversationContentParts =
    message.role === "assistant"
      ? normalizeInlineThinkingContentParts(ensuredConversationContentParts)
      : ensuredConversationContentParts;
  const conversationThinkingContent =
    message.role === "assistant" && includeInlineProcessFlow
      ? message.thinkingContent
      : undefined;
  const imageWorkbenchThinkingContent =
    imageWorkbenchDisplayState.thinkingContent;
  const shouldAllowLegacyToolCallsProcess =
    message.role === "assistant" &&
    includeInlineProcessFlow &&
    !hasProcessTimelineItems;
  const conversationToolCalls = shouldAllowLegacyToolCallsProcess
    ? message.toolCalls
    : undefined;
  const inlineProcessCoverage = resolveInlineProcessCoverage({
    contentParts: conversationContentParts,
    thinkingContent: conversationThinkingContent,
    toolCalls: conversationToolCalls,
    actionRequests: message.actionRequests,
  });
  const shouldLetInlineProcessOwnActiveTurn =
    timeline !== null &&
    hasActiveTimelineTurn &&
    includeInlineProcessFlow &&
    inlineProcessCoverage.hasInlineProcessEntries;
  const timelineConversationItems = timeline
    ? (timelineItemsForDisplay || []).filter((item) =>
        shouldRenderConversationTimelineItem(
          item,
          timelineItemsForDisplay || [],
          {
            hasInlineRuntimeStatus: Boolean(message.runtimeStatus),
          },
        ),
      )
    : [];
  const timelineConversationItemIds =
    timelineConversationItems.length > 0
      ? new Set(timelineConversationItems.map((item) => item.id))
      : null;
  const isInlineCoveredTimelineItem = createInlineCoverageMatcher(
    inlineProcessCoverage,
  );
  const primaryTimelineItems = timeline
    ? (timelineItemsForDisplay || []).filter((item) => {
        if (shouldLetInlineProcessOwnActiveTurn) {
          return false;
        }

        if (!timelineConversationItemIds?.has(item.id)) {
          return false;
        }

        if (isDeferredTimelineItem(item)) {
          return false;
        }

        if (!inlineProcessCoverage.hasInlineProcessEntries) {
          return true;
        }

        if (isInlineCoveredTimelineItem(item)) {
          return false;
        }

        return true;
      })
    : [];
  const shouldHoldPreAnswerThinkingTimeline =
    timeline !== null &&
    shouldSuppressPreAnswerThinkingTimeline({
      message,
      turn: timeline.turn,
      items: primaryTimelineItems,
      displayContent,
    });
  const visiblePrimaryTimelineItems = shouldHoldPreAnswerThinkingTimeline
    ? []
    : primaryTimelineItems;
  const fileChangeBatchPaths = [
    ...collectFileChangeBatchPaths(message.contentParts),
    ...collectFileChangeBatchPaths(displayContentParts),
    ...collectFileChangeBatchPaths(conversationContentParts),
  ];
  const trailingTimelineItems = timeline
    ? dedupeDeferredTimelineItems(
        timelineConversationItems.filter((item) =>
          isDeferredTimelineItem(item),
        ),
      ).filter(
        (item) =>
          item.type !== "file_artifact" ||
          (!isHiddenConversationArtifactPath(item.path) &&
            !fileChangeBatchPaths.some((changedPath) =>
              areArtifactProtocolPathsEquivalent(item.path, changedPath),
            )),
      )
    : [];
  const hasDeferredHistoricalTimelineDetails =
    Boolean(timeline) &&
    isRestoredHistoryWindow &&
    shouldDeferThreadItemsScan &&
    timeline?.turn.status === "completed" &&
    timeline.turn.id !== activeCurrentTurnId;
  const primaryTimeline =
    !shouldSuppressImageProcessFlow &&
    timeline &&
    (visiblePrimaryTimelineItems.length > 0 ||
      hasDeferredHistoricalTimelineDetails)
      ? { ...timeline, items: visiblePrimaryTimelineItems }
      : null;
  const trailingTimeline =
    !shouldSuppressImageProcessFlow &&
    timeline &&
    trailingTimelineItems.length > 0
      ? { ...timeline, items: trailingTimelineItems }
      : null;
  const hasTrailingArtifactTimelineItems = trailingTimelineItems.some(
    (item) => item.type === "file_artifact",
  );
  const trailingArtifactPaths = trailingTimelineItems.flatMap((item) =>
    item.type === "file_artifact" ? [item.path] : [],
  );
  const alreadyRenderedArtifactPaths = [
    ...trailingArtifactPaths,
    ...fileChangeBatchPaths,
  ];
  const timelineActionRequests = inlineProcessCoverage.actionRequestCounts.size
    ? undefined
    : message.actionRequests;
  const primaryActionRequests =
    visiblePrimaryTimelineItems.length > 0 ? timelineActionRequests : undefined;
  const trailingActionRequests =
    visiblePrimaryTimelineItems.length === 0
      ? timelineActionRequests
      : undefined;
  const shouldSuppressInlineA2UI = false;
  const suppressedActionRequestId = null;
  const hasActiveStreamingOverlay = Boolean(
    streamingFinalTextOverlayContent?.trim(),
  );
  const {
    isCurrentInteractiveAssistantMessage,
    shouldReadOnlyInteractiveContent,
  } = resolveMessageInteractiveProjectionState({
    activePendingA2UISource,
    hasActiveInteractiveRuntime,
    hasActiveStreamingOverlay,
    isActiveProcessOnlyOutput,
    isSending,
    lastAssistantMessageId,
    message,
  });
  const usesProcessSeparatedFinalText =
    messageContentPartsOwnInlineProcessFlow &&
    includeInlineProcessFlow &&
    hasFinalTextAfterProcessBoundary(conversationContentParts);
  const rendererConversationContentParts = usesProcessSeparatedFinalText
    ? resolveProcessSeparatedContentParts(conversationContentParts)
    : conversationContentParts;
  const timelineOwnedActionContent =
    timelineOwnsInlineProcessFlow &&
    (messageContentPartsOwnInlineProcessFlow || !displayContent.trim())
      ? resolveTimelineOwnedVisibleText(conversationContentParts)
      : null;
  const rawActionContent =
    timelineOwnedActionContent ??
    resolveAssistantActionContent({
      displayContent: shouldHideAssistantTextWhileRunning ? "" : displayContent,
      conversationContentParts: usesProcessSeparatedFinalText
        ? rendererConversationContentParts
        : conversationContentParts,
      useProcessSeparatedFinalText: usesProcessSeparatedFinalText,
    });
  const sanitizedRawActionContent = sanitizeProjectedMessageText(
    message,
    rawActionContent,
  );
  const runtimeFailureSanitizedActionContent =
    sanitizeRuntimeFailureAssistantText(message, sanitizedRawActionContent);
  const shouldSuppressDuplicatedFailureText =
    isRuntimeFailureOnlyAssistantText(message, sanitizedRawActionContent);
  const shouldUseRuntimeFailureSanitizedText =
    runtimeFailureSanitizedActionContent !== sanitizedRawActionContent;
  const actionContent = shouldSuppressDuplicatedFailureText
    ? ""
    : runtimeFailureSanitizedActionContent;
  const installedSkillMessageLabel =
    message.role === "user" ? resolveInstalledSkillMessageLabel(message) : null;
  const isUserCommandMessage =
    message.role === "user" &&
    !installedSkillMessageLabel &&
    Boolean(
      parseLeadingUserCommandTag(displayContent, message.inputCapabilityRoute),
    );
  const hasVisibleAssistantText = Boolean(actionContent);
  const hasImageWorkbenchLeadContent =
    imageWorkbenchDisplayState.hasLeadContent;
  const shouldCollapseLongHistoricalMessage =
    isRestoredHistoryWindow &&
    message.role === "assistant" &&
    !message.isThinking &&
    actionContent.length > MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_THRESHOLD &&
    !expandedLongHistoricalMessageIds.has(message.id);
  const hasNonTextConversationContentParts = Boolean(
    conversationContentParts?.some((part) => part.type !== "text"),
  );
  const shouldFlattenHistoricalAssistantContent =
    isRestoredHistoryWindow &&
    message.role === "assistant" &&
    !message.isThinking &&
    !includeInlineProcessFlow &&
    !hasNonTextConversationContentParts &&
    actionContent.length > 0 &&
    !shouldCollapseLongHistoricalMessage;
  const shouldCompactHistoricalAssistantMessage =
    isRestoredHistoryWindow &&
    message.role === "assistant" &&
    !message.isThinking &&
    !focusedTimelineItemId &&
    !includeInlineProcessFlow &&
    !hasNonTextConversationContentParts &&
    !((message.actionRequests || []).length > 0) &&
    !actionContent.includes("```a2ui") &&
    actionContent.length >
      MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_THRESHOLD &&
    !expandedLongHistoricalMessageIds.has(message.id) &&
    !expandedHistoricalAssistantMessageIds.has(message.id);
  const shouldPreviewHistoricalAssistantMessage =
    shouldCollapseLongHistoricalMessage ||
    shouldCompactHistoricalAssistantMessage;
  const historicalAssistantPreviewContent = shouldCollapseLongHistoricalMessage
    ? buildHistoricalMessagePreview(
        displayContent,
        MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS,
      )
    : shouldCompactHistoricalAssistantMessage
      ? buildHistoricalMessagePreview(
          displayContent,
          MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_PREVIEW_CHARS,
        )
      : "";
  const rendererContent = shouldCollapseLongHistoricalMessage
    ? buildHistoricalMessagePreview(
        actionContent,
        MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS,
      )
    : actionContent;
  const rawRendererRawContent = shouldSuppressDuplicatedFailureText
    ? ""
    : shouldUseRuntimeFailureSanitizedText
      ? actionContent
    : shouldCollapseLongHistoricalMessage ||
        shouldFlattenHistoricalAssistantContent
      ? rendererContent
      : usesProcessSeparatedFinalText
        ? actionContent
        : actionContent ||
          (shouldHideAssistantTextWhileRunning ? "" : visibleRawDisplayContent);
  const rendererRawContent = sanitizeProjectedMessageText(
    message,
    rawRendererRawContent,
  );
  const runtimeFailureTextContentParts =
    shouldUseRuntimeFailureSanitizedText && actionContent
      ? ([{ type: "text" as const, text: actionContent }] satisfies NonNullable<
          typeof rendererConversationContentParts
        >)
      : undefined;
  const rendererContentParts =
    shouldSuppressDuplicatedFailureText ||
    shouldCollapseLongHistoricalMessage ||
    shouldFlattenHistoricalAssistantContent
      ? undefined
      : runtimeFailureTextContentParts || rendererConversationContentParts;
  const rendererHasProvenanceThinkingContentPart = Boolean(
    rendererContentParts?.some(
      (part) =>
        part.type === "thinking" &&
        part.text.trim().length > 0 &&
        (part.metadata?.source ||
          part.metadata?.threadItemId ||
          part.metadata?.turnId ||
          typeof part.metadata?.sequence === "number"),
    ),
  );
  const rendererThinkingContent = shouldCollapseLongHistoricalMessage
    ? undefined
    : rendererHasProvenanceThinkingContentPart
    ? undefined
    : conversationThinkingContent;
  const rendererToolCalls =
    shouldCollapseLongHistoricalMessage ||
    hasInlineToolUseContentPart(rendererConversationContentParts)
      ? undefined
      : conversationToolCalls;
  const rendererActionRequests =
    shouldCollapseLongHistoricalMessage || shouldSuppressRendererProcessFlow
      ? undefined
      : message.actionRequests;
  const rendererMarkdownRenderMode =
    shouldCollapseLongHistoricalMessage ||
    shouldFlattenHistoricalAssistantContent
      ? ("light" as const)
      : ("standard" as const);
  const canQuoteMessage = Boolean(actionContent);
  const canCopyMessage = Boolean(actionContent);
  const canSaveMessageAsSkill = Boolean(
    message.role === "assistant" &&
    !message.imageWorkbenchPreview &&
    !message.isThinking &&
    actionContent &&
    actionContent.length >= 24,
  );
  const {
    canSaveMessageAsKnowledge,
    hasArticleArtifactFrame,
    knowledgeArtifactSource,
    messageCanvasShortcutPath,
    messageCanvasShortcutTitle,
    messageSavedSiteContentTarget,
    shouldRenderMessageCanvasShortcut,
    visibleAssistantArtifacts,
  } = resolveMessageListItemArtifactProjection({
    actionContent,
    alreadyRenderedArtifactPaths,
    canOpenSavedSiteContent,
    hasTrailingArtifactTimelineItems,
    message,
    shouldSuppressImageProcessFlow,
  });
  const shouldDeferHistoricalMarkdownRender =
    shouldDeferMessageDetails &&
    message.role === "assistant" &&
    hasVisibleAssistantText &&
    !shouldPreviewHistoricalAssistantMessage &&
    !hasImages &&
    !hasNonTextConversationContentParts &&
    visibleAssistantArtifacts.length === 0 &&
    !shouldRenderMessageCanvasShortcut &&
    !message.imageWorkbenchPreview &&
    !message.taskPreview &&
    !hasStructuredHistoricalContentHint(actionContent);
  const hasAssistantRenderableContentBeforeFirstToken =
    hasVisibleAssistantText ||
    Boolean(conversationContentParts?.length) ||
    Boolean(message.thinkingContent?.trim()) ||
    Boolean(conversationThinkingContent?.trim()) ||
    Boolean(conversationToolCalls?.length) ||
    Boolean((rendererActionRequests || []).length > 0) ||
    Boolean(primaryTimeline) ||
    Boolean(trailingTimeline) ||
    Boolean((message.images || []).length > 0) ||
    visibleAssistantArtifacts.length > 0 ||
    shouldRenderMessageCanvasShortcut ||
    Boolean(message.imageWorkbenchPreview) ||
    Boolean(message.taskPreview);
  const hasActiveFirstTokenRuntime =
    timeline !== null ? hasActiveTimelineTurn : message.isThinking || isSending;
  const shouldRenderFirstTokenRuntimeStatus =
    message.role === "assistant" &&
    isConversationTailAssistant &&
    !isRestoredHistoryWindow &&
    hasActiveFirstTokenRuntime &&
    shouldUseFirstTokenRuntimeStatus(message.runtimeStatus) &&
    !hasAssistantRenderableContentBeforeFirstToken;
  const shouldCollapseAssistantShell =
    message.role === "assistant" &&
    !shouldRenderFirstTokenRuntimeStatus &&
    !hasVisibleAssistantText &&
    !conversationContentParts?.length &&
    !conversationThinkingContent?.trim() &&
    !conversationToolCalls?.length &&
    !((rendererActionRequests || []).length > 0) &&
    !primaryTimeline &&
    !trailingTimeline &&
    !((message.images || []).length > 0) &&
    visibleAssistantArtifacts.length === 0 &&
    !shouldRenderMessageCanvasShortcut &&
    !message.imageWorkbenchPreview &&
    !message.taskPreview;
  const hasAssistantBodyContent =
    message.role !== "assistant" || !shouldCollapseAssistantShell;
  const imageWorkbenchRendererState = resolveImageWorkbenchRendererProcessState(
    {
      actionContent,
      imageWorkbenchThinkingContent,
      message,
      rendererActionRequests,
      rendererContentParts,
      rendererThinkingContent,
      rendererToolCalls,
      shouldSuppressRendererProcessFlow,
    },
  );
  const arePrimaryTimelineDetailsDeferred =
    Boolean(primaryTimeline) &&
    shouldDeferThreadItemsScan &&
    primaryTimeline?.turn.status === "completed" &&
    primaryTimeline.turn.id !== activeCurrentTurnId;
  const shouldRenderCompactPrimaryTimeline =
    Boolean(primaryTimelineKey) &&
    isRestoredHistoryWindow &&
    !focusedTimelineItemId &&
    primaryTimeline?.turn.status === "completed" &&
    primaryTimeline.turn.id !== activeCurrentTurnId &&
    shouldPreferCompactHistoricalTimeline &&
    !hasImportedSourcePrimaryTimeline &&
    !expandedHistoricalTimelineKeys.has(primaryTimelineKey!);
  const shouldRenderPrimaryTimelineOutsideBubble =
    message.role === "assistant" &&
    Boolean(primaryTimeline) &&
    (hasVisibleAssistantText || !hasAssistantBodyContent);
  const shouldRenderProposedPlanBlocks = !hasTimelinePlanItem;
  const shouldRenderImageWorkbenchBareBubble =
    message.role === "assistant" &&
    Boolean(message.imageWorkbenchPreview) &&
    !primaryTimeline &&
    !trailingTimeline &&
    !hasImages &&
    visibleAssistantArtifacts.length === 0 &&
    !shouldRenderMessageCanvasShortcut &&
    !message.taskPreview;

  return {
    actionContent,
    arePrimaryTimelineDetailsDeferred,
    canCopyMessage,
    canQuoteMessage,
    canSaveMessageAsKnowledge,
    canSaveMessageAsSkill,
    displayContent,
    hasAssistantBodyContent,
    hasImageWorkbenchLeadContent,
    historicalAssistantPreviewContent,
    imageWorkbenchRendererState,
    inlineProcessCoverage,
    installedSkillMessageLabel,
    isActiveProcessOnlyOutput,
    isConversationTailAssistant,
    isCurrentInteractiveAssistantMessage,
    isUserCommandMessage,
    knowledgeArtifactSource,
    messageCanvasShortcutPath,
    messageCanvasShortcutTitle,
    messageSavedSiteContentTarget,
    primaryActionRequests,
    primaryTimeline,
    primaryTimelineKey,
    rawRuntimePeerContent,
    rendererActionRequests,
    rendererContent,
    rendererContentParts,
    rendererMarkdownRenderMode,
    rendererRawContent,
    rendererThinkingContent,
    rendererToolCalls,
    shouldCollapseLongHistoricalMessage,
    shouldDeferHistoricalMarkdownRender,
    shouldPreviewHistoricalAssistantMessage,
    shouldReadOnlyInteractiveContent,
    shouldRenderCompactPrimaryTimeline,
    shouldRenderFirstTokenRuntimeStatus,
    shouldRenderImageWorkbenchBareBubble,
    shouldRenderMessageCanvasShortcut,
    shouldRenderPrimaryTimelineOutsideBubble,
    shouldRenderProposedPlanBlocks,
    shouldRenderRuntimePeerCards,
    shouldSuppressInlineA2UI,
    shouldSuppressRendererProcessFlow,
    shouldSuppressStandaloneImageWorkbenchProcess,
    suppressedActionRequestId,
    trailingActionRequests,
    trailingTimeline,
    visibleAssistantArtifacts,
    hasArticleArtifactFrame,
  };
}
