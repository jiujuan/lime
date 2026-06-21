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
import { isRuntimeStatusDiagnosticsOnly } from "../utils/turnSummaryPresentation";
import type { MessageListRenderGroup } from "./MessageList.types";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { AgentThreadItem, Message, PendingA2UISource } from "../types";
import { buildHistoricalMessagePreview } from "./messageListHistoricalPreviewText";
import {
  parseLeadingUserCommandTag,
  resolveInstalledSkillMessageLabel,
} from "./messageListUserContentState";
import { resolveKnowledgeSourceFromArtifacts } from "./messageListKnowledgeSource";
import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import { isUnifiedWebSearchToolName } from "../utils/searchResultPreview";
import { isUnifiedWebFetchToolName } from "../utils/toolNameFamily";
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
  isAgentMessageCommentaryPhase,
  shouldUseAgentMessageAsFinalText,
} from "../utils/agentMessagePhase";
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

function hasInlineProcessContentParts(
  message: Message,
  options: {
    displayContent: string;
    timelineItems?: AgentThreadItem[];
  },
): boolean {
  const contentParts = message.contentParts || [];
  const hasNonThinkingProcessPart = contentParts.some(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  if (hasNonThinkingProcessPart) {
    return true;
  }

  const hasThinkingPart = contentParts.some(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (!hasThinkingPart) {
    return false;
  }

  if (
    message.isThinking &&
    !options.displayContent.trim() &&
    isRuntimeStatusDiagnosticsOnly(message.runtimeStatus)
  ) {
    return false;
  }

  return Boolean(
    options.displayContent.trim() ||
    options.timelineItems?.some((item) => item.type === "reasoning"),
  );
}

type MessageContentPart = NonNullable<Message["contentParts"]>[number];

function hasProcessBoundaryContentPart(
  parts?: Message["contentParts"],
): boolean {
  return Boolean(
    parts?.some(
      (part) =>
        part.type === "tool_use" ||
        part.type === "action_required" ||
        part.type === "file_changes_batch",
    ),
  );
}

function findLastProcessBoundaryIndex(parts: MessageContentPart[]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (
      part?.type === "tool_use" ||
      part?.type === "action_required" ||
      part?.type === "file_changes_batch"
    ) {
      return index;
    }
  }
  return -1;
}

function isLikelyCompleteThinkingSegment(text: string): boolean {
  return /[.!?;:。！？；：]\s*$/.test(text.trim());
}

function collectFileChangeBatchPaths(
  parts?: Message["contentParts"],
): string[] {
  return (parts || []).flatMap((part) =>
    part.type === "file_changes_batch"
      ? part.aggregate.files.map((file) => file.path)
      : [],
  );
}

function resolveFinalTextFromContentParts(
  parts?: Message["contentParts"],
): string {
  const textParts =
    parts?.filter(
      (part): part is Extract<MessageContentPart, { type: "text" }> =>
        part.type === "text" && part.text.trim().length > 0,
    ) || [];

  return textParts[textParts.length - 1]?.text.trim() || "";
}

function resolveDeferredTextContentParts(
  parts?: Message["contentParts"],
  options?: Parameters<typeof sanitizeMessageTextForDisplay>[1],
): Message["contentParts"] | undefined {
  const finalText = resolveFinalTextFromContentParts(parts);
  const sanitizedText = options
    ? sanitizeMessageTextForDisplay(finalText, options)
    : finalText;
  return sanitizedText ? [{ type: "text", text: sanitizedText }] : undefined;
}

function resolveAssistantActionContent(params: {
  displayContent: string;
  conversationContentParts?: Message["contentParts"];
  useProcessSeparatedFinalText: boolean;
}): string {
  if (params.useProcessSeparatedFinalText) {
    return resolveFinalTextFromContentParts(params.conversationContentParts);
  }

  return (
    params.displayContent.trim() ||
    resolveFinalTextFromContentParts(params.conversationContentParts)
  );
}

function hasFinalTextAfterProcessBoundary(
  parts?: Message["contentParts"],
): boolean {
  const normalizedParts = parts || [];
  const firstProcessIndex = normalizedParts.findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  if (firstProcessIndex < 0) {
    return false;
  }

  return normalizedParts.some(
    (part, index) =>
      index > firstProcessIndex &&
      part.type === "text" &&
      part.text.trim().length > 0,
  );
}

function resolveProcessSeparatedContentParts(
  parts?: Message["contentParts"],
): Message["contentParts"] | undefined {
  if (!hasProcessBoundaryContentPart(parts)) {
    return parts;
  }

  const hasActionBoundary = Boolean(
    parts?.some((part) => part.type === "action_required"),
  );
  if (hasActionBoundary) {
    return parts;
  }

  const firstProcessIndex = (parts || []).findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  const lastTextIndex = (parts || []).reduce(
    (lastIndex, part, index) =>
      part.type === "text" && part.text.trim().length > 0 ? index : lastIndex,
    -1,
  );

  const filtered = (parts || []).filter((part, index) => {
    if (part.type !== "text") {
      return true;
    }
    return index < firstProcessIndex || index === lastTextIndex;
  });

  return filtered.length > 0 ? filtered : undefined;
}

function hasInlineToolUseContentPart(parts?: Message["contentParts"]): boolean {
  return Boolean(parts?.some((part) => part.type === "tool_use"));
}

function hasRunningWebRetrievalContentPart(
  parts?: Message["contentParts"],
): boolean {
  return Boolean(
    parts?.some((part) => {
      return (
        part.type === "tool_use" &&
        part.toolCall.status === "running" &&
        (isUnifiedWebSearchToolName(part.toolCall.name) ||
          isUnifiedWebFetchToolName(part.toolCall.name))
      );
    }),
  );
}

function isRunningThreadItemStatus(status?: string | null): boolean {
  return status === "in_progress" || status === "running";
}

function isActiveThreadTurnStatus(status?: string | null): boolean {
  return status === "running" || status === "queued" || status === "in_progress";
}

function isWebRetrievalThreadItem(item: AgentThreadItem): boolean {
  return (
    item.type === "web_search" ||
    (item.type === "tool_call" &&
      (isUnifiedWebSearchToolName(item.tool_name) ||
        isUnifiedWebFetchToolName(item.tool_name)))
  );
}

function hasRunningWebRetrievalTimelineItem(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        isRunningThreadItemStatus(item.status) &&
        isWebRetrievalThreadItem(item),
    ),
  );
}

function hasCompletedOrRunningWebRetrievalTimelineItem(
  items?: AgentThreadItem[],
): boolean {
  return Boolean(
    items?.some(
      (item) =>
        (item.status === "completed" ||
          isRunningThreadItemStatus(item.status)) &&
        isWebRetrievalThreadItem(item),
    ),
  );
}

function normalizeInactiveRunningWebRetrievalContentParts(
  parts: Message["contentParts"] | undefined,
  shouldNormalize: boolean,
): Message["contentParts"] | undefined {
  if (!shouldNormalize || !parts?.length) {
    return parts;
  }

  let changed = false;
  const nextParts = parts.map((part) => {
    if (
      part.type !== "tool_use" ||
      part.toolCall.status !== "running" ||
      (!isUnifiedWebSearchToolName(part.toolCall.name) &&
        !isUnifiedWebFetchToolName(part.toolCall.name))
    ) {
      return part;
    }

    changed = true;
    return {
      ...part,
      toolCall: {
        ...part.toolCall,
        status: "completed" as const,
      },
    };
  });

  return changed ? nextParts : parts;
}

function normalizeInactiveRunningWebRetrievalTimelineItems(
  items: AgentThreadItem[] | undefined,
  shouldNormalize: boolean,
): AgentThreadItem[] | undefined {
  if (!shouldNormalize || !items?.length) {
    return items;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (
      !isRunningThreadItemStatus(item.status) ||
      !isWebRetrievalThreadItem(item)
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status: "completed" as const,
      completed_at: item.completed_at || item.updated_at || item.started_at,
    } as AgentThreadItem;
  });

  return changed ? nextItems : items;
}

function holdTextContentPartsAsProcessWhileRunning(
  parts?: Message["contentParts"],
  shouldHold?: boolean,
): Message["contentParts"] | undefined {
  if (!shouldHold || !parts?.length) {
    return parts;
  }

  let changed = false;
  const nextParts: NonNullable<Message["contentParts"]> = [];
  for (const part of parts) {
    if (part.type !== "text") {
      nextParts.push(part);
      continue;
    }

    changed = true;
    const normalized = part.text.trim();
    if (!normalized) {
      continue;
    }

    const lastPart = nextParts[nextParts.length - 1];
    if (lastPart?.type === "thinking") {
      nextParts[nextParts.length - 1] = {
        ...lastPart,
        text: `${lastPart.text}\n\n${normalized}`,
      };
      continue;
    }

    nextParts.push({ type: "thinking", text: normalized });
  }

  return changed ? nextParts : parts;
}

function hideFinalAnswerContentPartsWhileRunning(
  parts?: Message["contentParts"],
  shouldHide?: boolean,
): Message["contentParts"] | undefined {
  if (!shouldHide || !parts?.length) {
    return parts;
  }

  let changed = false;
  const nextParts = parts.filter((part) => {
    if (part.type !== "text") {
      return true;
    }
    changed = true;
    return false;
  });

  return changed ? nextParts : parts;
}

function hasFinalAnswerTextAfterRunningWebRetrieval(
  items?: AgentThreadItem[],
): boolean {
  if (!items?.length) {
    return false;
  }

  const orderedItems = [...items].sort((left, right) => {
    const leftSequence = Number.isFinite(left.sequence)
      ? Number(left.sequence)
      : Number.MAX_SAFE_INTEGER;
    const rightSequence = Number.isFinite(right.sequence)
      ? Number(right.sequence)
      : Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }
    return left.id.localeCompare(right.id);
  });

  let sawRunningWebRetrieval = false;
  for (const item of orderedItems) {
    if (
      isWebRetrievalThreadItem(item) &&
      isRunningThreadItemStatus(item.status)
    ) {
      sawRunningWebRetrieval = true;
      continue;
    }

    if (
      sawRunningWebRetrieval &&
      item.type === "agent_message" &&
      !isAgentMessageCommentaryPhase(item.phase) &&
      shouldUseAgentMessageAsFinalText(item.phase) &&
      item.text.trim().length > 0
    ) {
      return true;
    }
  }

  return false;
}

function hasFinalAnswerTextTimelineItem(items?: AgentThreadItem[]): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.type === "agent_message" &&
        !isAgentMessageCommentaryPhase(item.phase) &&
        shouldUseAgentMessageAsFinalText(item.phase) &&
        item.text.trim().length > 0,
    ),
  );
}

function ensureInlineThinkingContentPart(params: {
  parts?: Message["contentParts"];
  thinkingContent?: string;
  shouldEnsure: boolean;
}): Message["contentParts"] | undefined {
  const normalizedThinking = params.thinkingContent?.trim();
  if (!params.shouldEnsure || !normalizedThinking) {
    return params.parts;
  }

  const parts = params.parts || [];
  const existingThinkingText = parts
    .filter(
      (part): part is Extract<MessageContentPart, { type: "thinking" }> =>
        part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");
  const normalizedExistingThinking = existingThinkingText.trim();
  const processBoundaryIndex = findLastProcessBoundaryIndex(parts);
  const thinkingPartIndex = parts.findIndex(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (thinkingPartIndex >= 0) {
    const existingPart = parts[thinkingPartIndex];
    const missingThinkingTail =
      normalizedExistingThinking &&
      normalizedThinking.startsWith(normalizedExistingThinking)
        ? normalizedThinking.slice(normalizedExistingThinking.length).trim()
        : "";
    if (
      processBoundaryIndex >= 0 &&
      missingThinkingTail &&
      isLikelyCompleteThinkingSegment(normalizedExistingThinking)
    ) {
      const nextParts = [...parts];
      const insertIndex = processBoundaryIndex + 1;
      const existingThinkingAfterBoundaryIndex = nextParts.findIndex(
        (part, index) =>
          index > processBoundaryIndex &&
          part.type === "thinking" &&
          part.text.trim().length > 0,
      );
      const existingThinkingAfterBoundary =
        existingThinkingAfterBoundaryIndex >= 0
          ? nextParts[existingThinkingAfterBoundaryIndex]
          : undefined;
      if (existingThinkingAfterBoundary?.type === "thinking") {
        nextParts[existingThinkingAfterBoundaryIndex] = {
          ...existingThinkingAfterBoundary,
          text: `${existingThinkingAfterBoundary.text}\n\n${missingThinkingTail}`,
        };
      } else {
        nextParts.splice(insertIndex, 0, {
          type: "thinking",
          text: missingThinkingTail,
        });
      }
      return nextParts;
    }
    if (
      existingPart?.type === "thinking" &&
      normalizedThinking.startsWith(existingPart.text.trim()) &&
      normalizedThinking.length > existingPart.text.trim().length
    ) {
      const nextParts = [...parts];
      nextParts[thinkingPartIndex] = {
        ...existingPart,
        text: normalizedThinking,
      };
      return nextParts;
    }
    return params.parts;
  }

  return [{ type: "thinking", text: normalizedThinking }, ...parts];
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
