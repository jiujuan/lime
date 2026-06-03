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
import { shouldUseAgentMessageAsFinalText } from "../utils/agentMessagePhase";
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
import { toActionRequired } from "./timeline-utils/itemConverters";
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
import { resolveAgentRuntimeErrorPresentation } from "../utils/agentRuntimeErrorPresentation";
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

function stringifyTimelineArguments(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveTimelineToolStatus(
  status: AgentThreadItem["status"],
): Extract<
  NonNullable<Message["toolCalls"]>[number]["status"],
  "running" | "completed" | "failed"
> {
  if (status === "in_progress") {
    return "running";
  }
  return status;
}

function appendTextContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text = `${lastPart.text}\n${normalized}`;
    return;
  }

  parts.push({ type: "text", text: normalized });
}

function appendThinkingContentPart(
  parts: MessageContentPart[],
  text: string | undefined,
) {
  const normalized = text?.trim();
  if (!normalized) {
    return;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "thinking") {
    lastPart.text = `${lastPart.text}\n\n${normalized}`;
    return;
  }

  parts.push({ type: "thinking", text: normalized });
}

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

function resolveAssistantActionContent(params: {
  displayContent: string;
  conversationContentParts?: Message["contentParts"];
  useProcessSeparatedFinalText: boolean;
}): string {
  if (params.useProcessSeparatedFinalText) {
    return resolveFinalTextFromContentParts(params.conversationContentParts);
  }

  return params.displayContent.trim();
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

function buildTimelineToolContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type === "tool_call") {
    const status = resolveTimelineToolStatus(item.status);
    return {
      type: "tool_use",
      toolCall: {
        id: item.id,
        name: item.tool_name,
        arguments: stringifyTimelineArguments(item.arguments),
        status,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        result:
          status === "running"
            ? undefined
            : {
                success: item.success !== false && !item.error,
                output: item.output || "",
                error: item.error || undefined,
                metadata:
                  item.metadata &&
                  typeof item.metadata === "object" &&
                  !Array.isArray(item.metadata)
                    ? (item.metadata as Record<string, unknown>)
                    : undefined,
              },
      },
    };
  }

  if (item.type === "command_execution") {
    const status = resolveTimelineToolStatus(item.status);
    return {
      type: "tool_use",
      toolCall: {
        id: item.id,
        name: "Bash",
        arguments: stringifyTimelineArguments({
          command: item.command,
          cwd: item.cwd,
        }),
        status,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        result:
          status === "running"
            ? undefined
            : {
                success: item.exit_code === undefined || item.exit_code === 0,
                output: item.aggregated_output || "",
                error: item.error || undefined,
                metadata:
                  item.exit_code === undefined
                    ? undefined
                    : { exit_code: item.exit_code },
              },
      },
    };
  }

  if (item.type === "web_search") {
    const status = resolveTimelineToolStatus(item.status);
    return {
      type: "tool_use",
      toolCall: {
        id: item.id,
        name: "web_search",
        arguments: stringifyTimelineArguments({
          action: item.action || "web_search",
          query: item.query || item.action || "",
        }),
        status,
        startTime: new Date(item.started_at),
        endTime: item.completed_at ? new Date(item.completed_at) : undefined,
        result:
          status === "running"
            ? undefined
            : {
                success: status !== "failed",
                output: item.output || "",
              },
      },
    };
  }

  return null;
}

function buildTimelineActionContentPart(
  item: AgentThreadItem,
): MessageContentPart | null {
  if (item.type !== "approval_request" && item.type !== "request_user_input") {
    return null;
  }

  const actionRequired = toActionRequired(item);
  if (!actionRequired) {
    return null;
  }

  return {
    type: "action_required",
    actionRequired,
  };
}

function buildTimelineInlineContentParts(params: {
  displayContent: string;
  existingContentParts?: Message["contentParts"];
  items?: AgentThreadItem[];
}): Message["contentParts"] | undefined {
  const items = params.items || [];
  const hasAgentMessage = items.some(
    (item) =>
      item.type === "agent_message" &&
      shouldUseAgentMessageAsFinalText(item.phase) &&
      item.text.trim().length > 0,
  );
  if (!hasAgentMessage) {
    return undefined;
  }

  const reasoningCount = items.filter(
    (item) => item.type === "reasoning" && item.text.trim().length > 0,
  ).length;
  const toolLikeCount = items.filter(
    (item) =>
      item.type === "tool_call" ||
      item.type === "command_execution" ||
      item.type === "web_search",
  ).length;
  const actionLikeCount = items.filter(
    (item) =>
      item.type === "approval_request" || item.type === "request_user_input",
  ).length;
  if (reasoningCount < 2 && toolLikeCount === 0 && actionLikeCount === 0) {
    return undefined;
  }

  const parts: MessageContentPart[] = [];
  for (const item of items) {
    if (item.type === "reasoning") {
      appendThinkingContentPart(parts, item.text);
      continue;
    }

    if (
      item.type === "agent_message" &&
      shouldUseAgentMessageAsFinalText(item.phase)
    ) {
      appendTextContentPart(parts, item.text);
      continue;
    }

    const toolPart = buildTimelineToolContentPart(item);
    if (toolPart) {
      parts.push(toolPart);
      continue;
    }

    const actionPart = buildTimelineActionContentPart(item);
    if (actionPart) {
      parts.push(actionPart);
    }
  }

  const hasTextPart = parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  if (!hasTextPart) {
    return undefined;
  }

  const fileChangeParts = (params.existingContentParts || []).filter(
    (part) => part.type === "file_changes_batch",
  );
  if (fileChangeParts.length > 0) {
    parts.push(...fileChangeParts);
  }

  return parts;
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
  const hasThinkingPart = parts.some(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (hasThinkingPart) {
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
  const timelineInlineContentParts =
    message.role === "assistant"
      ? buildTimelineInlineContentParts({
          displayContent,
          existingContentParts: displayContentParts,
          items: timeline?.items,
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
        Boolean(timeline),
        displayContent,
        isSending,
      ) ||
      // 消息 contentParts 已经持有过程顺序时，始终保留 inline process flow，
      // 让思考、工具、确认与文件改动按时间序穿插显示。
      hasInlineProcessContentParts(message, {
        displayContent,
        timelineItems: timeline?.items,
      }));
  const conversationContentParts =
    message.role === "assistant"
      ? ensureInlineThinkingContentPart({
          parts: mergeStreamingOverlayContentParts(
            timelineInlineContentParts ||
              filterConversationDisplayContentParts(displayContentParts, {
                includeProcessFlow: includeInlineProcessFlow,
                preserveToolUseParts: !hasProcessTimelineItems,
              }),
            streamingTextOverlay?.content || null,
          ),
          thinkingContent: message.thinkingContent,
          shouldEnsure:
            includeInlineProcessFlow &&
            Boolean(streamingTextOverlay?.content?.trim()),
        })
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
  const isCurrentInteractiveAssistantMessage =
    message.role === "assistant" &&
    (Boolean(message.isThinking) ||
      hasActivePendingSourceForMessage ||
      (message.id === lastAssistantMessageId && hasActiveInteractiveRuntime));
  const shouldReadOnlyInteractiveContent =
    message.role === "assistant" && !isCurrentInteractiveAssistantMessage;
  const usesProcessSeparatedFinalText =
    includeInlineProcessFlow &&
    hasFinalTextAfterProcessBoundary(conversationContentParts);
  const rendererConversationContentParts = usesProcessSeparatedFinalText
    ? resolveProcessSeparatedContentParts(conversationContentParts)
    : conversationContentParts;
  const rawActionContent = resolveAssistantActionContent({
    displayContent,
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
        : actionContent || visibleRawDisplayContent;
  const rendererContentParts =
    shouldSuppressDuplicatedFailureText ||
    shouldCollapseLongHistoricalMessage ||
    shouldFlattenHistoricalAssistantContent
      ? undefined
      : rendererConversationContentParts;
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
    message.role === "assistant" &&
    Boolean(primaryTimeline) &&
    hasVisibleAssistantText;
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
