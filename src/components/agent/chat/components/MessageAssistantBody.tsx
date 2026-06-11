import React from "react";
import type { A2UIFormData } from "@/components/workspace/a2ui/types";
import { StreamingRenderer } from "./StreamingRenderer";
import {
  HistoricalAssistantMessagePreview,
  HistoricalMarkdownHydrationPreview,
} from "./MessageListHistoricalPreviews";
import { MessageCanvasShortcut } from "./MessageCanvasShortcut";
import { MessagePreviewCards } from "./MessagePreviewCards";
import type { resolveImageWorkbenchRendererProcessState } from "./imageWorkbenchMessageDisplay";
import type {
  ConfirmResponse,
  Message,
  MessagePreviewTarget,
  SiteSavedContentTarget,
  WriteArtifactContext,
} from "../types";

type ImageWorkbenchRendererState = ReturnType<
  typeof resolveImageWorkbenchRendererProcessState
>;

interface MessageAssistantBodyProps {
  a2uiFormDataMap?: Record<string, { formId: string; formData: A2UIFormData }>;
  actionContent: string;
  collapseCodeBlocks?: boolean;
  displayContent: string;
  handleExpandHistoricalAssistantMessage: (messageId: string) => void;
  handleExpandLongHistoricalMessage: (messageId: string) => void;
  hasImageWorkbenchLeadContent: boolean;
  historicalAssistantPreviewContent: string;
  imageWorkbenchRendererState: ImageWorkbenchRendererState;
  isCurrentInteractiveAssistantMessage: boolean;
  message: Message;
  sessionId?: string | null;
  messageCanvasShortcutPath: string | null;
  messageCanvasShortcutTitle: string;
  messageSavedSiteContentTarget: SiteSavedContentTarget | null;
  onA2UIFormChange?: (formId: string, formData: A2UIFormData) => void;
  onA2UISubmit?: (formData: A2UIFormData, messageId: string) => void;
  onCodeBlockClick?: (language: string, code: string) => void;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenMessagePreview?: (
    target: MessagePreviewTarget,
    message: Message,
  ) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onPermissionResponse?: (response: ConfirmResponse) => void;
  onQuoteMessage?: (content: string, id: string) => void;
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
  primaryTimeline: React.ReactNode;
  promoteActionRequestsToA2UI: boolean;
  readOnlyInteractiveContent: boolean;
  renderA2UIInline: boolean;
  rendererActionRequests: Message["actionRequests"] | undefined;
  rendererContent: string;
  rendererContentParts: Message["contentParts"] | undefined;
  rendererMarkdownRenderMode: "light" | "standard";
  rendererRawContent: string;
  rendererThinkingContent: string | undefined;
  rendererToolCalls: Message["toolCalls"] | undefined;
  renderProposedPlanBlocks: boolean;
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  shouldCollapseLongHistoricalMessage: boolean;
  shouldDeferHistoricalMarkdownRender: boolean;
  shouldPreviewHistoricalAssistantMessage: boolean;
  shouldRenderMessageCanvasShortcut: boolean;
  shouldRenderPrimaryTimelineOutsideBubble: boolean;
  shouldSuppressInlineA2UI: boolean;
  shouldSuppressRendererProcessFlow: boolean;
  suppressedActionRequestId: string | null;
}

export function MessageAssistantBody({
  a2uiFormDataMap,
  actionContent,
  collapseCodeBlocks,
  displayContent,
  handleExpandHistoricalAssistantMessage,
  handleExpandLongHistoricalMessage,
  hasImageWorkbenchLeadContent,
  historicalAssistantPreviewContent,
  imageWorkbenchRendererState,
  isCurrentInteractiveAssistantMessage,
  message,
  sessionId,
  messageCanvasShortcutPath,
  messageCanvasShortcutTitle,
  messageSavedSiteContentTarget,
  onA2UIFormChange,
  onA2UISubmit,
  onCodeBlockClick,
  onFileClick,
  onOpenMessagePreview,
  onOpenSavedSiteContent,
  onPermissionResponse,
  onQuoteMessage,
  onWriteFile,
  primaryTimeline,
  promoteActionRequestsToA2UI,
  readOnlyInteractiveContent,
  renderA2UIInline,
  rendererActionRequests,
  rendererContent,
  rendererContentParts,
  rendererMarkdownRenderMode,
  rendererRawContent,
  rendererThinkingContent,
  rendererToolCalls,
  renderProposedPlanBlocks,
  shouldCollapseCodeBlock,
  shouldCollapseLongHistoricalMessage,
  shouldDeferHistoricalMarkdownRender,
  shouldPreviewHistoricalAssistantMessage,
  shouldRenderMessageCanvasShortcut,
  shouldRenderPrimaryTimelineOutsideBubble,
  shouldSuppressInlineA2UI,
  shouldSuppressRendererProcessFlow,
  suppressedActionRequestId,
}: MessageAssistantBodyProps) {
  const hasTerminalRuntimeStatus =
    message.runtimeStatus?.phase === "failed" ||
    message.runtimeStatus?.phase === "cancelled";
  const isMessageStreaming = Boolean(
    message.isThinking &&
      isCurrentInteractiveAssistantMessage &&
      !hasTerminalRuntimeStatus,
  );

  return (
    <>
      {shouldRenderPrimaryTimelineOutsideBubble ? null : primaryTimeline}

      {shouldPreviewHistoricalAssistantMessage ? (
        <HistoricalAssistantMessagePreview
          content={historicalAssistantPreviewContent}
          contentLength={actionContent.length}
          variant={shouldCollapseLongHistoricalMessage ? "long" : "compact"}
          onExpand={() => {
            if (shouldCollapseLongHistoricalMessage) {
              handleExpandLongHistoricalMessage(message.id);
              return;
            }

            handleExpandHistoricalAssistantMessage(message.id);
          }}
        />
      ) : shouldDeferHistoricalMarkdownRender ? (
        <HistoricalMarkdownHydrationPreview content={rendererContent} />
      ) : message.imageWorkbenchPreview ? (
        hasImageWorkbenchLeadContent ||
        imageWorkbenchRendererState.shouldRenderInlineProcess ? (
          <StreamingRenderer
            content={rendererContent}
            rawContent={rendererRawContent}
            isStreaming={isMessageStreaming}
            showCursor={isMessageStreaming && !displayContent}
            thinkingContent={imageWorkbenchRendererState.thinkingContent}
            contentParts={imageWorkbenchRendererState.contentParts}
            toolCalls={imageWorkbenchRendererState.toolCalls}
            actionRequests={rendererActionRequests}
            markdownRenderMode={rendererMarkdownRenderMode}
            suppressProcessFlow={false}
            showContentBlockActions={Boolean(actionContent)}
            onQuoteContent={
              onQuoteMessage
                ? (quotedContent) => onQuoteMessage(quotedContent, message.id)
                : undefined
            }
          />
        ) : null
      ) : (
        <StreamingRenderer
          content={rendererContent}
          rawContent={rendererRawContent}
          isStreaming={isMessageStreaming}
          toolCalls={rendererToolCalls}
          showCursor={isMessageStreaming && !displayContent}
          thinkingContent={rendererThinkingContent}
          runtimeStatus={message.runtimeStatus}
          contentParts={rendererContentParts}
          actionRequests={rendererActionRequests}
          onA2UISubmit={
            onA2UISubmit
              ? (formData) => onA2UISubmit(formData, message.id)
              : undefined
          }
          a2uiFormId={a2uiFormDataMap?.[message.id]?.formId}
          a2uiInitialFormData={a2uiFormDataMap?.[message.id]?.formData}
          onA2UIFormChange={onA2UIFormChange}
          renderA2UIInline={renderA2UIInline && !shouldSuppressInlineA2UI}
          onWriteFile={
            onWriteFile
              ? (content, fileName, context) =>
                  onWriteFile(content, fileName, {
                    ...context,
                    sourceMessageId: context?.sourceMessageId || message.id,
                    source: context?.source || "message_content",
                  })
              : undefined
          }
          onFileClick={onFileClick}
          fileChangesUndoSessionId={sessionId}
          onOpenSavedSiteContent={onOpenSavedSiteContent}
          onPermissionResponse={onPermissionResponse}
          collapseCodeBlocks={collapseCodeBlocks}
          shouldCollapseCodeBlock={shouldCollapseCodeBlock}
          onCodeBlockClick={onCodeBlockClick}
          promoteActionRequestsToA2UI={promoteActionRequestsToA2UI}
          suppressedActionRequestId={suppressedActionRequestId}
          showRuntimeStatusInline={true}
          renderProposedPlanBlocks={renderProposedPlanBlocks}
          suppressProcessFlow={shouldSuppressRendererProcessFlow}
          showContentBlockActions={Boolean(actionContent)}
          markdownRenderMode={rendererMarkdownRenderMode}
          readOnlyA2UI={readOnlyInteractiveContent}
          readOnlyActionRequests={readOnlyInteractiveContent}
          onQuoteContent={
            onQuoteMessage
              ? (quotedContent) => onQuoteMessage(quotedContent, message.id)
              : undefined
          }
        />
      )}
      {shouldRenderMessageCanvasShortcut ? (
        <MessageCanvasShortcut
          target={messageSavedSiteContentTarget!}
          title={messageCanvasShortcutTitle}
          path={messageCanvasShortcutPath}
          onOpenSavedSiteContent={onOpenSavedSiteContent!}
        />
      ) : null}
      <MessagePreviewCards
        message={message}
        hasImageWorkbenchLeadContent={hasImageWorkbenchLeadContent}
        onOpenMessagePreview={onOpenMessagePreview}
      />
    </>
  );
}
