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
} from "../utils/internalImagePlaceholder";
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
  shouldKeepInlineProcessForActiveAssistant,
  shouldRenderConversationTimelineItem,
  shouldSuppressPreAnswerThinkingTimeline,
} from "./messageListInlineProcess";
import { shouldRenderAssistantRuntimeStatusPill } from "./messageAssistantMetaFooterState";
import {
  MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_PREVIEW_CHARS,
  MESSAGE_LIST_COMPACT_HISTORICAL_ASSISTANT_THRESHOLD,
  MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD,
  MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_PREVIEW_CHARS,
  MESSAGE_LIST_LONG_HISTORICAL_MESSAGE_THRESHOLD,
} from "./messageListConstants";

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
    ? undefined
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
    displayContentParts,
    shouldFoldSuppressedProcessFlow,
    shouldSuppressRendererProcessFlow,
  } = imageWorkbenchProcessDisplayState;
  const isConversationTailAssistant =
    message.role === "assistant" && message.id === group.lastAssistantId;
  const timeline =
    message.role !== "assistant"
      ? null
      : isConversationTailAssistant
        ? group.timeline
        : null;
  const hasProcessTimelineItems = hasTimelineProcessItems(timeline?.items);
  const includeInlineProcessFlow =
    !shouldDeferMessageDetails &&
    !shouldSuppressRendererProcessFlow &&
    message.role === "assistant" &&
    (shouldFoldSuppressedProcessFlow ||
      shouldKeepInlineProcessForActiveAssistant(
        message,
        isConversationTailAssistant,
        hasProcessTimelineItems,
        Boolean(timeline),
        displayContent,
        isSending,
      ));
  const conversationContentParts =
    message.role === "assistant"
      ? mergeStreamingOverlayContentParts(
          filterConversationDisplayContentParts(displayContentParts, {
            includeProcessFlow: includeInlineProcessFlow,
            preserveToolUseParts: !hasProcessTimelineItems,
          }),
          streamingTextOverlay?.content || null,
        )
      : displayContentParts;
  const conversationThinkingContent =
    message.role === "assistant" && includeInlineProcessFlow
      ? message.thinkingContent
      : undefined;
  const imageWorkbenchThinkingContent =
    imageWorkbenchDisplayState.thinkingContent;
  const conversationToolCalls =
    message.role === "assistant" && includeInlineProcessFlow
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
    timeline.turn.status !== "completed" &&
    includeInlineProcessFlow &&
    inlineProcessCoverage.hasInlineProcessEntries;
  const timelineConversationItems = timeline
    ? timeline.items.filter((item) =>
        shouldRenderConversationTimelineItem(item, timeline.items, {
          hasInlineRuntimeStatus: Boolean(message.runtimeStatus),
        }),
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
    ? timeline.items.filter((item) => {
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
  const trailingTimelineItems = timeline
    ? dedupeDeferredTimelineItems(
        timelineConversationItems.filter((item) =>
          isDeferredTimelineItem(item),
        ),
      ).filter(
        (item) =>
          item.type !== "file_artifact" ||
          !isHiddenConversationArtifactPath(item.path),
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
  const isCurrentInteractiveAssistantMessage =
    message.role === "assistant" &&
    (Boolean(message.isThinking) ||
      hasActivePendingSourceForMessage ||
      (message.id === lastAssistantMessageId && hasActiveInteractiveRuntime));
  const shouldReadOnlyInteractiveContent =
    message.role === "assistant" && !isCurrentInteractiveAssistantMessage;
  const rawActionContent = displayContent.trim();
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
  const hasImageWorkbenchLeadContent = imageWorkbenchDisplayState.hasLeadContent;
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
    shouldCollapseLongHistoricalMessage || shouldCompactHistoricalAssistantMessage;
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
  const rendererRawContent =
    shouldCollapseLongHistoricalMessage || shouldFlattenHistoricalAssistantContent
      ? rendererContent
      : visibleRawDisplayContent;
  const rendererContentParts =
    shouldCollapseLongHistoricalMessage || shouldFlattenHistoricalAssistantContent
      ? undefined
      : conversationContentParts;
  const rendererThinkingContent = shouldCollapseLongHistoricalMessage
    ? undefined
    : conversationThinkingContent;
  const rendererToolCalls = shouldCollapseLongHistoricalMessage
    ? undefined
    : conversationToolCalls;
  const rendererActionRequests =
    shouldCollapseLongHistoricalMessage || shouldSuppressRendererProcessFlow
      ? undefined
      : message.actionRequests;
  const rendererMarkdownRenderMode =
    shouldCollapseLongHistoricalMessage || shouldFlattenHistoricalAssistantContent
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
  const canSaveMessageAsInspiration = Boolean(
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

          return !trailingArtifactPaths.some((timelinePath) =>
            areArtifactProtocolPathsEquivalent(artifactPath, timelinePath),
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
  const primaryTimelineKey = primaryTimeline
    ? `leading:${primaryTimeline.turn.id}`
    : null;
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
    (arePrimaryTimelineDetailsDeferred ||
      primaryTimeline.items.length >=
        MESSAGE_LIST_HISTORICAL_TIMELINE_COMPACT_ITEM_THRESHOLD) &&
    !expandedHistoricalTimelineKeys.has(primaryTimelineKey!);
  const shouldRenderPrimaryTimelineOutsideBubble =
    message.role === "assistant" && Boolean(primaryTimeline) && hasVisibleAssistantText;
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
    canSaveMessageAsInspiration,
    canSaveMessageAsKnowledge,
    canSaveMessageAsSkill,
    displayContent,
    hasAssistantBodyContent,
    hasImageWorkbenchLeadContent,
    historicalAssistantPreviewContent,
    imageWorkbenchRendererState,
    inlineProcessCoverage,
    installedSkillMessageLabel,
    isConversationTailAssistant,
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
