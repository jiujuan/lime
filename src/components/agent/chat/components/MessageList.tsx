import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MessageListContainer,
  MessageListFrame,
} from "../styles";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type { Message } from "../types";
import { MessageListItem } from "./MessageListItem";
import type {
  MessageListProps,
  MessageListRenderGroup,
} from "./MessageList.types";
import {
  DefaultConversationEmptyState,
  HistoryWindow,
  PersistedHistoryWindow,
  RestoringSessionEmptyState,
  TaskCenterEmptyState,
} from "./MessageListHistoryChrome";
import { MessageListStreamingOverlayItem } from "./MessageListStreamingOverlayItem";
import { useMessageListHistoricalHydration } from "./useMessageListHistoricalHydration";
import { useMessageListPromptCacheNotice } from "./useMessageListPromptCacheNotice";
import { useMessageListRenderWindow } from "./useMessageListRenderWindow";
import {
  useMessageListAutoScroll,
  useMessageListScrollController,
} from "./useMessageListScrollController";
import { useMessageListTelemetry } from "./useMessageListTelemetry";
import { useMessageListTimelineState } from "./useMessageListTimelineState";

const MessageListInner: React.FC<MessageListProps> = ({
  sessionId = null,
  messages,
  leadingContent,
  trailingContent,
  emptyStateVariant = "default",
  turns = [],
  threadItems = [],
  currentTurnId = null,
  threadRead = null,
  pendingActions = [],
  submittedActionsInFlight = [],
  queuedTurns = [],
  childSubagentSessions = [],
  sessionHistoryWindow = null,
  onLoadFullHistory,
  isSending = false,
  assistantLabel = "Lime",
  onQuoteMessage,
  onA2UISubmit,
  renderA2UIInline = true,
  a2uiFormDataMap,
  onA2UIFormChange,
  onWriteFile,
  onFileClick,
  onOpenArtifactFromTimeline,
  onOpenSavedSiteContent,
  onArtifactClick,
  onOpenMessagePreview,
  onSaveMessageAsSkill,
  onSaveMessageAsInspiration,
  onSaveMessageAsKnowledge,
  onOpenSubagentSession,
  onPermissionResponse,
  collapseCodeBlocks,
  shouldCollapseCodeBlock,
  onCodeBlockClick,
  promoteActionRequestsToA2UI = false,
  isRestoringSession = false,
  onInterruptCurrentTurn,
  compactLeadingSpacing = false,
  focusedTimelineItemId = null,
  timelineFocusRequestKey = 0,
  activePendingA2UISource = null,
  providerType,
}) => {
  const { t } = useTranslation("agent");
  const isTaskCenterEmptyState = emptyStateVariant === "task-center";
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [
    expandedLongHistoricalMessageIds,
    setExpandedLongHistoricalMessageIds,
  ] = useState<Set<string>>(() => new Set());
  const [
    expandedHistoricalAssistantMessageIds,
    setExpandedHistoricalAssistantMessageIds,
  ] = useState<Set<string>>(() => new Set());
  const [expandedHistoricalTimelineKeys, setExpandedHistoricalTimelineKeys] =
    useState<Set<string>>(() => new Set());

  const scrollController = useMessageListScrollController();
  const renderWindow = useMessageListRenderWindow({
    isSending,
    isRestoringSession,
    isUserScrolling: scrollController.isUserScrolling,
    messages,
    sessionHistoryWindow,
  });
  const timelineState = useMessageListTimelineState({
    activePendingA2UISource,
    childSubagentSessions,
    currentTurnId,
    expandedHistoricalTimelineKeys,
    focusedTimelineItemId,
    hiddenHistoryCount: renderWindow.hiddenHistoryCount,
    isRestoredHistoryWindow: renderWindow.isRestoredHistoryWindow,
    isSending,
    pendingActions,
    persistedHiddenHistoryCount: renderWindow.persistedHiddenHistoryCount,
    progressiveInitialRenderCount: renderWindow.progressiveInitialRenderCount,
    queuedTurns,
    renderedAssistantMessageCount: renderWindow.renderedAssistantMessageCount,
    renderedMessageCount: renderWindow.renderedMessageCount,
    renderedMessages: renderWindow.renderedMessages,
    submittedActionsInFlight,
    threadItems,
    threadRead,
    turns,
  });
  const historicalHydration = useMessageListHistoricalHydration({
    activeCurrentTurnId: timelineState.activeCurrentTurnId,
    focusedTimelineItemId,
    isHistoricalTimelineReady: timelineState.isHistoricalTimelineReady,
    isRestoredHistoryWindow: renderWindow.isRestoredHistoryWindow,
    isSending,
    renderedMessages: renderWindow.renderedMessages,
  });
  const promptCacheNotice = useMessageListPromptCacheNotice({
    lastAssistantMessage: timelineState.lastAssistantMessage,
    providerType,
    restoredPromptCacheNoticeReady:
      renderWindow.restoredPromptCacheNoticeReady,
  });

  useMessageListAutoScroll({
    isRestoringSession,
    isSending,
    renderedMessageCount:
      renderWindow.renderedMessages.length + (trailingContent ? 1 : 0),
    scrollRef: scrollController.scrollRef,
    shouldAutoScroll: scrollController.shouldAutoScroll,
  });
  useMessageListTelemetry({
    canBuildHistoricalTimeline: timelineState.canBuildHistoricalTimeline,
    hiddenHistoryCount: renderWindow.hiddenHistoryCount,
    historicalContentPartsDeferredCount:
      historicalHydration.historicalContentPartsDeferredCount,
    historicalContentPartsDeferredMeasurement:
      historicalHydration.historicalContentPartsDeferredMeasurement,
    historicalMarkdownDeferredCount:
      historicalHydration.historicalMarkdownDeferredCount,
    historicalMarkdownHydrationTargetCount:
      historicalHydration.historicalMarkdownHydrationTargets.length,
    historicalMarkdownHydrationTargetsMeasurement:
      historicalHydration.historicalMarkdownHydrationTargetsMeasurement,
    hydratedHistoricalMarkdownCount:
      historicalHydration.hydratedHistoricalMarkdownCount,
    isHistoricalTimelineReady: timelineState.isHistoricalTimelineReady,
    isRestoredHistoryWindow: renderWindow.isRestoredHistoryWindow,
    isRestoringSession,
    messageGroupsMeasurement: timelineState.messageGroupsMeasurement,
    messagesCount: messages.length,
    persistedHiddenHistoryCount: renderWindow.persistedHiddenHistoryCount,
    renderedMessages: renderWindow.renderedMessages,
    renderedThreadItemsCount: timelineState.renderedThreadItems.length,
    renderedThreadItemsMeasurement: timelineState.renderedThreadItemsMeasurement,
    renderedTurnsCount: timelineState.renderedTurns.length,
    renderGroups: timelineState.renderGroups,
    renderGroupsMeasurement: timelineState.renderGroupsMeasurement,
    sessionId,
    shouldDeferHistoricalTimeline: timelineState.shouldDeferHistoricalTimeline,
    shouldDeferTailRuntimeStatusLine:
      timelineState.shouldDeferTailRuntimeStatusLine,
    shouldDeferThreadItemsScan: timelineState.shouldDeferThreadItemsScan,
    threadRead,
    timelineByMessageIdMeasurement: timelineState.timelineByMessageIdMeasurement,
    turnsCount: turns.length,
    visibleMessagesCount: renderWindow.visibleMessages.length,
  });

  const handleExpandLongHistoricalMessage = useCallback((messageId: string) => {
    setExpandedLongHistoricalMessageIds((current) => {
      if (current.has(messageId)) {
        return current;
      }

      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  }, []);
  const handleExpandHistoricalAssistantMessage = useCallback(
    (messageId: string) => {
      setExpandedHistoricalAssistantMessageIds((current) => {
        if (current.has(messageId)) {
          return current;
        }

        const next = new Set(current);
        next.add(messageId);
        return next;
      });
    },
    [],
  );
  const handleExpandHistoricalTimeline = useCallback((timelineKey: string) => {
    setExpandedHistoricalTimelineKeys((current) => {
      if (current.has(timelineKey)) {
        return current;
      }

      const next = new Set(current);
      next.add(timelineKey);
      return next;
    });
  }, []);

  const handleCopy = useCallback(async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      toast.success(t("agentChat.messageList.toast.copySuccess"));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(t("agentChat.messageList.toast.copyFailed"));
    }
  }, [t]);

  const renderMessageItem = useCallback(
    (
      msg: Message,
      group: MessageListRenderGroup,
      streamingTextOverlay: AgentStreamTextOverlaySnapshot | null = null,
    ) => (
      <MessageListItem
        msg={msg}
        group={group}
        streamingTextOverlay={streamingTextOverlay}
        activeConversationRuntimeStatusLine={
          timelineState.activeConversationRuntimeStatusLine
        }
        activeCurrentTurnId={timelineState.activeCurrentTurnId}
        activePendingA2UISource={activePendingA2UISource}
        assistantLabel={assistantLabel}
        a2uiFormDataMap={a2uiFormDataMap}
        collapseCodeBlocks={collapseCodeBlocks}
        compactLeadingSpacing={compactLeadingSpacing}
        copiedId={copiedId}
        expandedHistoricalAssistantMessageIds={
          expandedHistoricalAssistantMessageIds
        }
        expandedHistoricalTimelineKeys={expandedHistoricalTimelineKeys}
        expandedLongHistoricalMessageIds={expandedLongHistoricalMessageIds}
        focusedTimelineItemId={focusedTimelineItemId}
        hasActiveInteractiveRuntime={timelineState.hasActiveInteractiveRuntime}
        isRestoredHistoryWindow={renderWindow.isRestoredHistoryWindow}
        isSending={isSending}
        lastAssistantMessageId={timelineState.lastAssistantMessageId}
        promoteActionRequestsToA2UI={promoteActionRequestsToA2UI}
        promptCacheNotice={promptCacheNotice}
        providerType={providerType}
        renderA2UIInline={renderA2UIInline}
        shouldCollapseCodeBlock={shouldCollapseCodeBlock}
        shouldDeferHistoricalAssistantMessageDetails={
          historicalHydration.shouldDeferHistoricalAssistantMessageDetails
        }
        shouldDeferHistoricalTimelineDetails={
          timelineState.shouldDeferHistoricalTimelineDetails
        }
        shouldDeferThreadItemsScan={timelineState.shouldDeferThreadItemsScan}
        tailRuntimeStatusLine={timelineState.tailRuntimeStatusLine}
        threadRead={threadRead}
        timelineFocusRequestKey={timelineFocusRequestKey}
        handleCopy={handleCopy}
        handleExpandHistoricalAssistantMessage={
          handleExpandHistoricalAssistantMessage
        }
        handleExpandHistoricalTimeline={handleExpandHistoricalTimeline}
        handleExpandLongHistoricalMessage={handleExpandLongHistoricalMessage}
        onA2UIFormChange={onA2UIFormChange}
        onA2UISubmit={onA2UISubmit}
        onArtifactClick={onArtifactClick}
        onCodeBlockClick={onCodeBlockClick}
        onFileClick={onFileClick}
        onInterruptCurrentTurn={onInterruptCurrentTurn}
        onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
        onOpenMessagePreview={onOpenMessagePreview}
        onOpenSavedSiteContent={onOpenSavedSiteContent}
        onOpenSubagentSession={onOpenSubagentSession}
        onPermissionResponse={onPermissionResponse}
        onQuoteMessage={onQuoteMessage}
        onSaveMessageAsInspiration={onSaveMessageAsInspiration}
        onSaveMessageAsKnowledge={onSaveMessageAsKnowledge}
        onSaveMessageAsSkill={onSaveMessageAsSkill}
        onWriteFile={onWriteFile}
      />
    ),
    [
      activePendingA2UISource,
      assistantLabel,
      a2uiFormDataMap,
      collapseCodeBlocks,
      compactLeadingSpacing,
      copiedId,
      expandedHistoricalAssistantMessageIds,
      expandedHistoricalTimelineKeys,
      expandedLongHistoricalMessageIds,
      focusedTimelineItemId,
      handleCopy,
      handleExpandHistoricalAssistantMessage,
      handleExpandHistoricalTimeline,
      handleExpandLongHistoricalMessage,
      historicalHydration.shouldDeferHistoricalAssistantMessageDetails,
      isSending,
      onA2UIFormChange,
      onA2UISubmit,
      onArtifactClick,
      onCodeBlockClick,
      onFileClick,
      onInterruptCurrentTurn,
      onOpenArtifactFromTimeline,
      onOpenMessagePreview,
      onOpenSavedSiteContent,
      onOpenSubagentSession,
      onPermissionResponse,
      onQuoteMessage,
      onSaveMessageAsInspiration,
      onSaveMessageAsKnowledge,
      onSaveMessageAsSkill,
      onWriteFile,
      promoteActionRequestsToA2UI,
      promptCacheNotice,
      providerType,
      renderA2UIInline,
      renderWindow.isRestoredHistoryWindow,
      shouldCollapseCodeBlock,
      threadRead,
      timelineFocusRequestKey,
      timelineState.activeConversationRuntimeStatusLine,
      timelineState.activeCurrentTurnId,
      timelineState.hasActiveInteractiveRuntime,
      timelineState.lastAssistantMessageId,
      timelineState.shouldDeferHistoricalTimelineDetails,
      timelineState.shouldDeferThreadItemsScan,
      timelineState.tailRuntimeStatusLine,
    ],
  );

  return (
    <MessageListFrame data-testid="message-list-frame">
      <MessageListContainer
        ref={scrollController.containerRef}
        $taskCenterSurface={isTaskCenterEmptyState}
        data-testid="message-list-scroll-container"
      >
        <div
          data-testid="message-list-column"
          className={[
            "mx-auto flex min-h-full w-full max-w-[1040px] flex-col gap-4 py-4",
            compactLeadingSpacing ? "pl-2.5 pr-3" : "pl-4 pr-4",
            "justify-start",
          ].join(" ")}
        >
          {leadingContent ? (
            <div data-testid="message-list-leading-content">
              {leadingContent}
            </div>
          ) : null}
          {renderWindow.persistedHiddenHistoryCount > 0 ? (
            <PersistedHistoryWindow
              loadedMessages={
                sessionHistoryWindow?.loadedMessages ??
                renderWindow.renderedMessages.length
              }
              totalMessages={
                sessionHistoryWindow?.totalMessages ??
                renderWindow.renderedMessages.length
              }
              isLoadingFull={sessionHistoryWindow?.isLoadingFull === true}
              error={sessionHistoryWindow?.error}
              onLoadFullHistory={onLoadFullHistory}
            />
          ) : null}
          {renderWindow.hiddenHistoryCount > 0 ? (
            <HistoryWindow
              hiddenHistoryCount={renderWindow.hiddenHistoryCount}
              isRestoredHistoryWindow={renderWindow.isRestoredHistoryWindow}
              renderedMessagesCount={renderWindow.renderedMessages.length}
              onExpandAllHistory={renderWindow.handleExpandAllHistory}
            />
          ) : null}
          {timelineState.messageGroups.length === 0 &&
            (isRestoringSession ? (
              <RestoringSessionEmptyState />
            ) : isTaskCenterEmptyState ? (
              <TaskCenterEmptyState />
            ) : (
              <DefaultConversationEmptyState />
            ))}

          {timelineState.renderGroups.map((group, groupIndex) => {
            return (
              <section
                key={group.id}
                data-testid="message-turn-group"
                data-group-index={groupIndex + 1}
                className="py-2"
              >
                <div className="space-y-1">
                  {group.messages.map((msg, messageIndex) => (
                    <MessageListStreamingOverlayItem
                      key={msg.id ?? `${group.id}:${messageIndex}`}
                      msg={msg}
                      group={group}
                      onOverlayUpdate={
                        scrollController.handleStreamingOverlayUpdate
                      }
                      render={renderMessageItem}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {trailingContent ? (
            <section
              data-testid="message-list-trailing-content"
              className="py-2"
            >
              {trailingContent}
            </section>
          ) : null}
          <div ref={scrollController.scrollRef} />
        </div>
      </MessageListContainer>
    </MessageListFrame>
  );
};

export const MessageList = React.memo(MessageListInner);
MessageList.displayName = "MessageList";
