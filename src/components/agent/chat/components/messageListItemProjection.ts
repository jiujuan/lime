import {
  areArtifactProtocolPathsEquivalent,
  resolveArtifactProtocolFilePath,
} from "@/lib/artifact-protocol";
import { isHiddenConversationArtifactPath } from "../utils/internalArtifactVisibility";
import { resolveLatestProjectFileSavedSiteContentTargetFromMessage } from "../utils/latestSavedSiteContentTarget";
import { isPureRuntimePeerMessageText } from "../utils/runtimePeerMessageDisplay";
import {
  resolveSiteSavedContentTargetDisplayName,
  resolveSiteSavedContentTargetRelativePath,
} from "../utils/siteToolResultSummary";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/messageDisplaySanitizer";
import { hasStructuredHistoricalContentHint } from "../projection/historicalMessageHydrationProjection";
import type { MessageListRenderGroup } from "./MessageList.types";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message, PendingA2UISource } from "../types";
import { buildHistoricalMessagePreview } from "./messageListHistoricalPreviewText";
import {
  parseLeadingUserCommandTag,
  resolveInstalledSkillMessageLabel,
} from "./messageListUserContentState";
import { resolveKnowledgeSourceFromArtifacts } from "./messageListKnowledgeSource";
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
import { shouldRenderAssistantRuntimeStatusPill } from "./messageAssistantMetaFooterState";
import { resolveAgentRuntimeErrorPresentation } from "../utils/agentRuntimeErrorPresentation";
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
  holdTextContentPartsAsProcessWhileRunning,
  isActiveThreadTurnStatus,
  normalizeInactiveRunningWebRetrievalContentParts,
  normalizeInactiveRunningWebRetrievalTimelineItems,
} from "./messageListProjectionWebRetrieval";

function normalizeFailureContentForCompare(value?: string | null): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function isRuntimeFailureOnlyAssistantText(
  message: Message,
  actionContent: string,
): boolean {
  if (
    message.role !== "assistant" ||
    message.runtimeStatus?.phase !== "failed"
  ) {
    return false;
  }

  const detailText = normalizeFailureContentForCompare(
    message.runtimeStatus.detail,
  );
  const contentText = normalizeFailureContentForCompare(actionContent);
  if (!detailText || !contentText) {
    return false;
  }

  const rawFailureText = contentText.replace(/^执行失败：/, "").trim();
  if (rawFailureText && rawFailureText !== contentText) {
    const presentedFailureText = normalizeFailureContentForCompare(
      resolveAgentRuntimeErrorPresentation(rawFailureText).displayMessage,
    );
    if (presentedFailureText === detailText) {
      return true;
    }
  }

  return (
    contentText === detailText ||
    contentText === `执行失败：${detailText}` ||
    contentText === `当前处理失败 ${detailText}`
  );
}

export interface ResolveMessageListItemProjectionOptions {
  activeCurrentTurnId: string | null;
  activePendingA2UISource: PendingA2UISource | null;
  canOpenSavedSiteContent: boolean;
  expandedHistoricalAssistantMessageIds: Set<string>;
  expandedHistoricalTimelineKeys: Set<string>;
  expandedLongHistoricalMessageIds: Set<string>;
  focusedTimelineItemId?: string | null;
  group: MessageListRenderGroup;
  hasActiveInteractiveRuntime: boolean;
  isRestoredHistoryWindow: boolean;
  isSending: boolean;
  lastAssistantMessageId: string | null;
  message: Message;
  shouldDeferHistoricalAssistantMessageDetails: (message: Message) => boolean;
  shouldDeferThreadItemsScan: boolean;
  streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
}

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
  const rawDisplayContent =
    message.role === "assistant" && streamingTextOverlay?.content
      ? streamingTextOverlay.content
      : message.content || "";
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
  const hasRunningWebRetrievalPart =
    hasRunningWebRetrievalContentPart(rawDisplayContentParts);
  const hasActiveTimelineTurn =
    timeline !== null && isActiveThreadTurnStatus(timeline.turn.status);
  const hasFinalAnswerAfterRunningWebRetrieval =
    hasFinalAnswerTextAfterRunningWebRetrieval(rawTimelineItems);
  const hasFinalAnswerTimelineItem =
    hasFinalAnswerTextTimelineItem(rawTimelineItems);
  const isActiveAssistantOutput =
    message.isThinking ||
    isSending ||
    Boolean(streamingTextOverlay?.content?.trim()) ||
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
  const shouldHoldStreamingOverlayAsProcess =
    Boolean(streamingTextOverlay?.content?.trim()) &&
    shouldHoldRunningWebRetrieval;
  const shouldHideAssistantTextWhileRunning =
    shouldHoldRunningWebRetrieval &&
    !hasFinalAnswerTimelineItem &&
    (hasFinalAnswerAfterRunningWebRetrieval ||
      Boolean(streamingTextOverlay?.content?.trim()) ||
      Boolean(displayContent.trim()) ||
      !message.thinkingContent?.trim());
  const shouldHoldAssistantTextAsProcess =
    shouldHoldRunningWebRetrieval &&
    !hasFinalAnswerTimelineItem &&
    !shouldHideAssistantTextWhileRunning;
  const isActiveProcessOnlyOutput =
    message.role === "assistant" &&
    isActiveAssistantOutput &&
    !hasFinalAnswerTimelineItem &&
    !displayContent.trim() &&
    (hasCompletedOrRunningWebRetrievalTimelineProcess ||
      hasRunningWebRetrievalPart);
  const timelineInlineContentParts =
    message.role === "assistant" &&
    !shouldPreferCompactHistoricalTimeline &&
    !shouldKeepExpandedHistoricalTimelineInTimeline
      ? buildTimelineInlineContentParts({
          displayContent: shouldHoldStreamingOverlayAsProcess
            ? ""
            : shouldHideAssistantTextWhileRunning
              ? ""
              : displayContent,
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
      hasInlineProcessContentParts(message, {
        displayContent,
        timelineItems: timelineItemsForDisplay,
      }));
  const conversationContentParts =
    message.role === "assistant"
      ? ensureInlineThinkingContentPart({
          parts: hideFinalAnswerContentPartsWhileRunning(
            holdTextContentPartsAsProcessWhileRunning(
              mergeStreamingOverlayContentParts(
                timelineInlineContentParts ||
                  filterConversationDisplayContentParts(displayContentParts, {
                    includeProcessFlow: includeInlineProcessFlow,
                    preserveToolUseParts: !hasProcessTimelineItems,
                  }),
                shouldHideAssistantTextWhileRunning
                  ? null
                  : streamingTextOverlay?.content || null,
                {
                  holdOverlayAsProcessWhileRunning:
                    shouldHoldStreamingOverlayAsProcess,
                },
              ),
              shouldHoldAssistantTextAsProcess,
            ),
            shouldHideAssistantTextWhileRunning,
          ),
          thinkingContent: message.thinkingContent,
          shouldEnsure:
            includeInlineProcessFlow &&
            Boolean(message.thinkingContent?.trim()) &&
            (Boolean(streamingTextOverlay?.content?.trim()) ||
              hasActiveTimelineTurn ||
              !hasPersistedReasoningTimeline),
        })
      : displayContentParts;
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
  const conversationToolCalls =
    shouldAllowLegacyToolCallsProcess
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
  const hasActivePendingSourceForMessage =
    activePendingA2UISource?.kind === "assistant_message"
      ? activePendingA2UISource.messageId === message.id
      : activePendingA2UISource?.kind === "action_request"
        ? (message.actionRequests || []).some(
            (request) =>
              request.requestId === activePendingA2UISource.requestId,
          ) ||
          (message.contentParts || []).some(
            (part) =>
              part.type === "action_required" &&
              part.actionRequired.requestId ===
                activePendingA2UISource.requestId,
          )
        : false;
  const hasPendingActionRequestForMessage =
    (message.actionRequests || []).some(
      (request) => request.status !== "submitted",
    ) ||
    (message.contentParts || []).some(
      (part) =>
        part.type === "action_required" &&
        part.actionRequired.status !== "submitted",
    );
  const hasActiveStreamingOverlay = Boolean(
    streamingTextOverlay?.content?.trim(),
  );
  const isCurrentInteractiveAssistantMessage =
    message.role === "assistant" &&
    (hasActivePendingSourceForMessage ||
      hasActiveStreamingOverlay ||
      (message.id === lastAssistantMessageId &&
        hasActiveInteractiveRuntime &&
        (isSending ||
          hasPendingActionRequestForMessage ||
          isActiveProcessOnlyOutput)));
  const shouldReadOnlyInteractiveContent =
    message.role === "assistant" && !isCurrentInteractiveAssistantMessage;
  const usesProcessSeparatedFinalText =
    includeInlineProcessFlow &&
    hasFinalTextAfterProcessBoundary(conversationContentParts);
  const rendererConversationContentParts = usesProcessSeparatedFinalText
    ? resolveProcessSeparatedContentParts(conversationContentParts)
    : conversationContentParts;
  const rawActionContent = resolveAssistantActionContent({
    displayContent:
      shouldHoldAssistantTextAsProcess || shouldHideAssistantTextWhileRunning
        ? ""
        : displayContent,
    conversationContentParts,
    useProcessSeparatedFinalText: usesProcessSeparatedFinalText,
  });
  const shouldSuppressDuplicatedFailureText =
    Boolean(timeline) &&
    isRuntimeFailureOnlyAssistantText(message, rawActionContent);
  const actionContent = shouldSuppressDuplicatedFailureText
    ? ""
    : rawActionContent;
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
  const rendererRawContent = shouldSuppressDuplicatedFailureText
    ? ""
    : shouldCollapseLongHistoricalMessage ||
        shouldFlattenHistoricalAssistantContent
      ? rendererContent
      : usesProcessSeparatedFinalText
        ? actionContent
        : actionContent ||
          (shouldHoldAssistantTextAsProcess || shouldHideAssistantTextWhileRunning
            ? ""
            : visibleRawDisplayContent);
  const rendererContentParts =
    shouldSuppressDuplicatedFailureText ||
    shouldCollapseLongHistoricalMessage ||
    shouldFlattenHistoricalAssistantContent
      ? undefined
      : rendererConversationContentParts;
  const rendererThinkingContent = shouldCollapseLongHistoricalMessage
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
  const knowledgeArtifactSource =
    message.role === "assistant"
      ? resolveKnowledgeSourceFromArtifacts(message.artifacts)
      : null;
  const knowledgeSaveContent =
    knowledgeArtifactSource?.content.trim() || actionContent;
  const canSaveMessageAsKnowledge = Boolean(
    message.role === "assistant" &&
    !message.imageWorkbenchPreview &&
    !message.isThinking &&
    knowledgeSaveContent &&
    knowledgeSaveContent.length >= 24,
  );
  const messageSavedSiteContentTarget =
    message.role === "assistant"
      ? resolveLatestProjectFileSavedSiteContentTargetFromMessage(message)
      : null;
  const visibleAssistantArtifacts =
    message.role === "assistant" && !shouldSuppressImageProcessFlow
      ? (message.artifacts || []).filter((artifact) => {
          const artifactPath = resolveArtifactProtocolFilePath(artifact);
          if (isHiddenConversationArtifactPath(artifactPath)) {
            return false;
          }

          return !alreadyRenderedArtifactPaths.some((renderedPath) =>
            areArtifactProtocolPathsEquivalent(artifactPath, renderedPath),
          );
        })
      : [];
  const shouldRenderMessageCanvasShortcut = Boolean(
    messageSavedSiteContentTarget &&
    canOpenSavedSiteContent &&
    !message.imageWorkbenchPreview &&
    !hasTrailingArtifactTimelineItems,
  );
  const messageCanvasShortcutTitle = messageSavedSiteContentTarget
    ? resolveSiteSavedContentTargetDisplayName(messageSavedSiteContentTarget) ||
      "导出稿"
    : "文件";
  const messageCanvasShortcutPath = messageSavedSiteContentTarget
    ? resolveSiteSavedContentTargetRelativePath(messageSavedSiteContentTarget)
    : null;
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
  const shouldRenderFirstTokenRuntimeStatus =
    message.role === "assistant" &&
    message.isThinking &&
    !shouldSuppressRendererProcessFlow &&
    !shouldRenderAssistantRuntimeStatusPill(message.runtimeStatus) &&
    !hasVisibleAssistantText &&
    !conversationContentParts?.length &&
    !conversationThinkingContent?.trim() &&
    !conversationToolCalls?.length &&
    !((rendererActionRequests || []).length > 0) &&
    !((message.images || []).length > 0) &&
    visibleAssistantArtifacts.length === 0 &&
    !shouldRenderMessageCanvasShortcut &&
    !message.imageWorkbenchPreview &&
    !message.taskPreview;
  const shouldCollapseAssistantShell =
    message.role === "assistant" &&
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
  const shouldRenderProposedPlanBlocks = !primaryTimeline?.items.some(
    (item) => item.type === "plan",
  );
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
  };
}
