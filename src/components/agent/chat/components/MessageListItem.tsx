import React from "react";
import type { Artifact } from "@/lib/artifact/types";
import type { A2UIFormData } from "@/lib/workspace/a2ui";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import { MessageWrapper, ContentColumn, MessageBubble } from "../styles";
import { type TokenUsagePromptCacheNotice } from "./TokenUsageDisplay";
import type { InputbarRuntimeStatusLineModel } from "../utils/inputbarRuntimeStatusLine";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import type { AgentStreamTextOverlaySnapshot } from "../hooks/agentStreamTextOverlayStore";
import type {
  ConfirmResponse,
  Message,
  MessagePreviewTarget,
  PendingA2UISource,
  SiteSavedContentTarget,
  WriteArtifactContext,
} from "../types";
import { AssistantFirstTokenRuntimeStatus } from "./MessageListRuntimeStatus";
import { MessageArtifactCards } from "./MessageArtifactCards";
import { MessageActionButtons } from "./MessageActionButtons";
import { MessageImageAttachments } from "./MessageImageAttachments";
import { MessageAssistantBody } from "./MessageAssistantBody";
import { MessageAssistantMetaFooter } from "./MessageAssistantMetaFooter";
import {
  resolveMessageAssistantMetaFooterState,
} from "./messageAssistantMetaFooterState";
import { MessageTimelineSection } from "./MessageTimelineSection";
import { MessageUserBody } from "./MessageUserBody";
import type { MessageListRenderGroup } from "./MessageList.types";
import { resolveMessageListItemProjection } from "./messageListItemProjection";

export interface MessageListItemProps {
  msg: Message;
  group: MessageListRenderGroup;
  streamingTextOverlay?: AgentStreamTextOverlaySnapshot | null;
  activeConversationRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
  activeCurrentTurnId: string | null;
  activePendingA2UISource: PendingA2UISource | null;
  assistantLabel: string;
  a2uiFormDataMap?: Record<string, { formId: string; formData: A2UIFormData }>;
  collapseCodeBlocks?: boolean;
  compactLeadingSpacing: boolean;
  copiedId: string | null;
  expandedHistoricalAssistantMessageIds: Set<string>;
  expandedHistoricalTimelineKeys: Set<string>;
  expandedLongHistoricalMessageIds: Set<string>;
  focusedTimelineItemId?: string | null;
  hasActiveInteractiveRuntime: boolean;
  isRestoredHistoryWindow: boolean;
  isSending: boolean;
  lastAssistantMessageId: string | null;
  promoteActionRequestsToA2UI: boolean;
  promptCacheNotice?: TokenUsagePromptCacheNotice | null;
  providerType?: string;
  renderA2UIInline: boolean;
  shouldDeferHistoricalAssistantMessageDetails: (message: Message) => boolean;
  shouldDeferHistoricalTimelineDetails: boolean;
  shouldDeferThreadItemsScan: boolean;
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  tailRuntimeStatusLine: InputbarRuntimeStatusLineModel | null;
  threadRead: AgentRuntimeThreadReadModel | null;
  timelineFocusRequestKey: number;
  handleCopy: (content: string, id: string) => void | Promise<void>;
  handleExpandHistoricalAssistantMessage: (messageId: string) => void;
  handleExpandHistoricalTimeline: (timelineKey: string) => void;
  handleExpandLongHistoricalMessage: (messageId: string) => void;
  onA2UIFormChange?: (formId: string, formData: A2UIFormData) => void;
  onA2UISubmit?: (formData: A2UIFormData, messageId: string) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  onCodeBlockClick?: (language: string, code: string) => void;
  onFileClick?: (fileName: string, content: string) => void;
  onInterruptCurrentTurn?: () => void | Promise<void>;
  onOpenArtifactFromTimeline?: (target: ArtifactTimelineOpenTarget) => void;
  onOpenMessagePreview?: (
    target: MessagePreviewTarget,
    message: Message,
  ) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onOpenSubagentSession?: (sessionId: string) => void;
  onPermissionResponse?: (response: ConfirmResponse) => void;
  onQuoteMessage?: (content: string, id: string) => void;
  onSaveMessageAsInspiration?: (source: {
    messageId: string;
    content: string;
  }) => void;
  onSaveMessageAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
  onSaveMessageAsSkill?: (source: {
    messageId: string;
    content: string;
  }) => void;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
}

export function MessageListItem({
  msg,
  group,
  streamingTextOverlay = null,
  activeConversationRuntimeStatusLine,
  activeCurrentTurnId,
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
  hasActiveInteractiveRuntime,
  isRestoredHistoryWindow,
  isSending,
  lastAssistantMessageId,
  promoteActionRequestsToA2UI,
  promptCacheNotice,
  providerType,
  renderA2UIInline,
  shouldCollapseCodeBlock,
  shouldDeferHistoricalAssistantMessageDetails,
  shouldDeferHistoricalTimelineDetails,
  shouldDeferThreadItemsScan,
  tailRuntimeStatusLine,
  threadRead,
  timelineFocusRequestKey,
  handleCopy,
  handleExpandHistoricalAssistantMessage,
  handleExpandHistoricalTimeline,
  handleExpandLongHistoricalMessage,
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
}: MessageListItemProps) {
  const projection = resolveMessageListItemProjection({
    activeCurrentTurnId,
    activePendingA2UISource,
    canOpenSavedSiteContent: Boolean(onOpenSavedSiteContent),
    expandedHistoricalAssistantMessageIds,
    expandedHistoricalTimelineKeys,
    expandedLongHistoricalMessageIds,
    focusedTimelineItemId,
    group,
    hasActiveInteractiveRuntime,
    isRestoredHistoryWindow,
    isSending,
    lastAssistantMessageId,
    message: msg,
    shouldDeferHistoricalAssistantMessageDetails,
    shouldDeferThreadItemsScan,
    streamingTextOverlay,
  });
  const {
    actionContent,
    arePrimaryTimelineDetailsDeferred,
    canCopyMessage,
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
  } = projection;

  const canQuoteMessage = Boolean(onQuoteMessage && projection.canQuoteMessage);
  const canSaveMessageAsSkill = Boolean(
    onSaveMessageAsSkill && projection.canSaveMessageAsSkill,
  );
  const canSaveMessageAsInspiration = Boolean(
    onSaveMessageAsInspiration && projection.canSaveMessageAsInspiration,
  );
  const canSaveMessageAsKnowledge = Boolean(
    onSaveMessageAsKnowledge && projection.canSaveMessageAsKnowledge,
  );
  const showMessageActions =
    (msg.role === "user" &&
      !isUserCommandMessage &&
      (canQuoteMessage || canCopyMessage)) ||
    (msg.role === "assistant" &&
      Boolean(msg.imageWorkbenchPreview) &&
      (canQuoteMessage || canCopyMessage)) ||
    canSaveMessageAsSkill ||
    canSaveMessageAsInspiration ||
    canSaveMessageAsKnowledge;
  const assistantMetaFooterState = resolveMessageAssistantMetaFooterState({
    activeConversationRuntimeStatusLine,
    hasAssistantBodyContent,
    isConversationTailAssistant,
    lastAssistantMessageId,
    message: msg,
    shouldDeferHistoricalMarkdownRender,
    shouldPreviewHistoricalAssistantMessage,
    shouldSuppressStandaloneImageWorkbenchProcess,
    tailRuntimeStatusLine,
  });
  const assistantMetaFooter = (
    <MessageAssistantMetaFooter
      activeConversationRuntimeStatusLine={activeConversationRuntimeStatusLine}
      hasAssistantBodyContent={hasAssistantBodyContent}
      message={msg}
      onInterruptCurrentTurn={onInterruptCurrentTurn}
      promptCacheNotice={promptCacheNotice}
      providerType={providerType}
      state={assistantMetaFooterState}
      tailRuntimeStatusLine={tailRuntimeStatusLine}
    />
  );
  const firstTokenRuntimeStatusNode = shouldRenderFirstTokenRuntimeStatus ? (
    <AssistantFirstTokenRuntimeStatus status={msg.runtimeStatus} />
  ) : null;

  if (
    msg.role === "assistant" &&
    !hasAssistantBodyContent &&
    !assistantMetaFooterState.hasAssistantMetaFooter &&
    !firstTokenRuntimeStatusNode
  ) {
    return null;
  }

  const primaryTimelineNode = primaryTimeline ? (
    <MessageTimelineSection
      timeline={primaryTimeline}
      actionRequests={primaryActionRequests}
      activeCurrentTurnId={activeCurrentTurnId}
      detailsDeferred={arePrimaryTimelineDetailsDeferred}
      focusedTimelineItemId={focusedTimelineItemId}
      focusRequestKey={timelineFocusRequestKey}
      isCurrentTurnSending={isSending}
      messageId={msg.id}
      onExpandPreview={
        primaryTimelineKey
          ? () => handleExpandHistoricalTimeline(primaryTimelineKey)
          : undefined
      }
      onFileClick={onFileClick}
      onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
      onOpenSavedSiteContent={onOpenSavedSiteContent}
      onOpenSubagentSession={onOpenSubagentSession}
      onPermissionResponse={onPermissionResponse}
      onSaveMessageAsKnowledge={onSaveMessageAsKnowledge}
      placement="leading"
      renderCompactPreview={
        shouldRenderCompactPrimaryTimeline && Boolean(primaryTimelineKey)
      }
      shouldDeferHistoricalTimelineDetails={
        shouldDeferHistoricalTimelineDetails
      }
      threadRead={threadRead}
    />
  ) : null;

  return (
    <MessageWrapper
      key={msg.id}
      $isUser={msg.role === "user"}
      $compactLeadingSpacing={compactLeadingSpacing}
    >
      <ContentColumn $isUser={msg.role === "user"}>
        {shouldRenderPrimaryTimelineOutsideBubble ? (
          <div className="mb-2" data-testid="assistant-primary-timeline-shell">
            {primaryTimelineNode}
          </div>
        ) : null}
        {firstTokenRuntimeStatusNode ? (
          <div
            className="mb-1.5 px-1"
            data-testid="assistant-runtime-status-shell"
          >
            {firstTokenRuntimeStatusNode}
          </div>
        ) : null}
        {hasAssistantBodyContent ? (
          <MessageBubble
            $isUser={msg.role === "user"}
            $bareMedia={shouldRenderImageWorkbenchBareBubble}
            className={
              isUserCommandMessage ? "message-bubble-user-command" : undefined
            }
            aria-label={msg.role === "assistant" ? assistantLabel : undefined}
          >
            {msg.role === "assistant" ? (
              <MessageAssistantBody
                a2uiFormDataMap={a2uiFormDataMap}
                actionContent={actionContent}
                collapseCodeBlocks={collapseCodeBlocks}
                displayContent={displayContent}
                handleExpandHistoricalAssistantMessage={
                  handleExpandHistoricalAssistantMessage
                }
                handleExpandLongHistoricalMessage={
                  handleExpandLongHistoricalMessage
                }
                hasImageWorkbenchLeadContent={hasImageWorkbenchLeadContent}
                historicalAssistantPreviewContent={
                  historicalAssistantPreviewContent
                }
                imageWorkbenchRendererState={imageWorkbenchRendererState}
                message={msg}
                messageCanvasShortcutPath={messageCanvasShortcutPath}
                messageCanvasShortcutTitle={messageCanvasShortcutTitle}
                messageSavedSiteContentTarget={messageSavedSiteContentTarget}
                onA2UIFormChange={onA2UIFormChange}
                onA2UISubmit={onA2UISubmit}
                onCodeBlockClick={onCodeBlockClick}
                onFileClick={onFileClick}
                onOpenMessagePreview={onOpenMessagePreview}
                onOpenSavedSiteContent={onOpenSavedSiteContent}
                onPermissionResponse={onPermissionResponse}
                onQuoteMessage={onQuoteMessage}
                onWriteFile={onWriteFile}
                primaryTimeline={primaryTimelineNode}
                promoteActionRequestsToA2UI={promoteActionRequestsToA2UI}
                readOnlyInteractiveContent={shouldReadOnlyInteractiveContent}
                renderA2UIInline={renderA2UIInline}
                rendererActionRequests={rendererActionRequests}
                rendererContent={rendererContent}
                rendererContentParts={rendererContentParts}
                rendererMarkdownRenderMode={rendererMarkdownRenderMode}
                rendererRawContent={rendererRawContent}
                rendererThinkingContent={rendererThinkingContent}
                rendererToolCalls={rendererToolCalls}
                renderProposedPlanBlocks={
                  !primaryTimeline ||
                  inlineProcessCoverage.hasInlineProcessEntries
                }
                shouldCollapseCodeBlock={shouldCollapseCodeBlock}
                shouldCollapseLongHistoricalMessage={
                  shouldCollapseLongHistoricalMessage
                }
                shouldDeferHistoricalMarkdownRender={
                  shouldDeferHistoricalMarkdownRender
                }
                shouldPreviewHistoricalAssistantMessage={
                  shouldPreviewHistoricalAssistantMessage
                }
                shouldRenderMessageCanvasShortcut={
                  shouldRenderMessageCanvasShortcut
                }
                shouldRenderPrimaryTimelineOutsideBubble={
                  shouldRenderPrimaryTimelineOutsideBubble
                }
                shouldSuppressInlineA2UI={shouldSuppressInlineA2UI}
                shouldSuppressRendererProcessFlow={
                  shouldSuppressRendererProcessFlow
                }
                suppressedActionRequestId={suppressedActionRequestId}
              />
            ) : (
              <MessageUserBody
                content={displayContent}
                installedSkillMessageLabel={installedSkillMessageLabel}
                isUserCommandMessage={isUserCommandMessage}
                message={msg}
                onA2UISubmit={onA2UISubmit}
                rawRuntimePeerContent={rawRuntimePeerContent}
                renderA2UIInline={renderA2UIInline}
                shouldRenderRuntimePeerCards={shouldRenderRuntimePeerCards}
              />
            )}

            <MessageImageAttachments images={msg.images} />

            {msg.role === "assistant" &&
            visibleAssistantArtifacts.length > 0 ? (
              <MessageArtifactCards
                artifacts={visibleAssistantArtifacts}
                messageId={msg.id}
                onArtifactClick={onArtifactClick}
                onSaveMessageAsKnowledge={onSaveMessageAsKnowledge}
              />
            ) : null}

            {msg.role === "assistant" &&
            trailingTimeline &&
            !shouldRenderFirstTokenRuntimeStatus ? (
              <MessageTimelineSection
                timeline={trailingTimeline}
                actionRequests={trailingActionRequests}
                activeCurrentTurnId={activeCurrentTurnId}
                focusedTimelineItemId={focusedTimelineItemId}
                focusRequestKey={timelineFocusRequestKey}
                isCurrentTurnSending={isSending}
                messageId={msg.id}
                onFileClick={onFileClick}
                onOpenArtifactFromTimeline={onOpenArtifactFromTimeline}
                onOpenSavedSiteContent={onOpenSavedSiteContent}
                onOpenSubagentSession={onOpenSubagentSession}
                onPermissionResponse={onPermissionResponse}
                onSaveMessageAsKnowledge={onSaveMessageAsKnowledge}
                placement="trailing"
                shouldDeferHistoricalTimelineDetails={
                  shouldDeferHistoricalTimelineDetails
                }
                threadRead={threadRead}
              />
            ) : null}

            {assistantMetaFooter}

            {showMessageActions ? (
              <MessageActionButtons
                actionContent={actionContent}
                canCopyMessage={canCopyMessage}
                canQuoteMessage={canQuoteMessage}
                canSaveMessageAsInspiration={canSaveMessageAsInspiration}
                canSaveMessageAsKnowledge={canSaveMessageAsKnowledge}
                canSaveMessageAsSkill={canSaveMessageAsSkill}
                copied={copiedId === msg.id}
                isImageWorkbenchMessage={Boolean(msg.imageWorkbenchPreview)}
                knowledgeContent={knowledgeArtifactSource?.content}
                knowledgeDescription={knowledgeArtifactSource?.description}
                knowledgeSourceName={knowledgeArtifactSource?.sourceName}
                messageId={msg.id}
                onCopy={handleCopy}
                onQuoteMessage={onQuoteMessage}
                onSaveMessageAsInspiration={onSaveMessageAsInspiration}
                onSaveMessageAsKnowledge={onSaveMessageAsKnowledge}
                onSaveMessageAsSkill={onSaveMessageAsSkill}
              />
            ) : null}
          </MessageBubble>
        ) : null}
        {!hasAssistantBodyContent ? assistantMetaFooter : null}
      </ContentColumn>
    </MessageWrapper>
  );
}
