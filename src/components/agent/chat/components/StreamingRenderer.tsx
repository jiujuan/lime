/**
 * 流式消息渲染组件
 *
 * 参考 aster UI 设计，支持思考内容、工具调用和实时 Markdown 渲染
 * Requirements: 9.3, 9.4
 */

import React, { memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/lib/artifact/hooks/useDebouncedValue";
import type { MarkdownRenderMode } from "./MarkdownRenderer";
import { A2UITaskCard, A2UITaskLoadingCard } from "./A2UITaskCard";
import {
  isImportedProcessMetadata,
  shouldSplitProcessBeforeEntry,
  type StreamingProcessEntry,
} from "./StreamingProcessGroupModel";
import { RuntimePeerMessageCards } from "./RuntimePeerMessageCards";
import { FileChangesSummaryCard } from "./FileChangesSummaryCard";
import { StreamingProcessRun } from "./StreamingProcessRun";
import { StreamingMediaReferenceCard } from "./StreamingMediaReferenceCard";
import type {
  A2UIFormData,
  ParseResult,
  ParsedMessageContent,
} from "@/components/workspace/a2ui/types";
import { CHAT_A2UI_TASK_CARD_PRESET } from "@/components/workspace/a2ui/taskCardPresets";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type {
  AgentRuntimeStatus,
  ContentPart,
  ActionRequired,
  ConfirmResponse,
  MessageMediaReference,
  SiteSavedContentTarget,
  WriteArtifactContext,
} from "../types";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/messageDisplaySanitizer";
import { isPureRuntimePeerMessageText } from "../utils/runtimePeerMessageDisplay";
import type { SearchResultPreviewItem } from "../utils/searchResultPreview";
import {
  FileChangesUndoError,
  restoreFileChangesFromCheckpoints,
} from "../utils/fileChangesUndo";
import { orderStreamingContentPartsForDisplay } from "./streamingContentPartOrder";
import { coalesceAdjacentDisplayContentParts } from "./streamingContentPartSegments";
import { StreamingCursor, StreamingText } from "./StreamingText";
import {
  EMPTY_PARSE_RESULT,
  getCachedStructuredParse,
  hasStructuredContentHint,
  STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS,
} from "./StreamingStructuredContent";
import {
  isActiveRuntimeStatus,
  parseThinkingContent,
  resolveContentPartDebugSignature,
} from "./StreamingRendererViewModel";

// ============ 主组件 ============

interface StreamingRendererProps {
  /** 文本内容（向后兼容） */
  content: string;
  /** 原始文本内容（用于保留协议包络的专门展示） */
  rawContent?: string;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 工具调用列表（向后兼容） */
  toolCalls?: ToolCallState[];
  /** 是否显示光标 */
  showCursor?: boolean;
  /** 思考内容（可选，如果不提供则从 content 中解析） */
  thinkingContent?: string;
  /** 交错内容列表；存在时按事件顺序渲染，否则回退 content + toolCalls。 */
  contentParts?: ContentPart[];
  /** 权限确认请求列表（向后兼容） */
  actionRequests?: ActionRequired[];
  /** A2UI 表单提交回调 */
  onA2UISubmit?: (formData: A2UIFormData) => void;
  /** A2UI 表单 ID（用于持久化） */
  a2uiFormId?: string;
  /** A2UI 初始表单数据（从数据库加载） */
  a2uiInitialFormData?: A2UIFormData;
  /** A2UI 表单数据变化回调（用于持久化） */
  onA2UIFormChange?: (formId: string, formData: A2UIFormData) => void;
  /** 是否渲染消息内联 A2UI */
  renderA2UIInline?: boolean;
  /** 文件写入回调 */
  onWriteFile?: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void;
  /** 文件点击回调 */
  onFileClick?: (fileName: string, content: string) => void;
  /** 当前会话 ID；存在时文件变更摘要可执行 checkpoint 撤销。 */
  fileChangesUndoSessionId?: string | null;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  onOpenUrlPreview?: (item: SearchResultPreviewItem) => void;
  onOpenMediaReference?: (
    reference: MessageMediaReference,
    index: number,
  ) => void;
  /** 权限确认响应回调 */
  onPermissionResponse?: (response: ConfirmResponse) => void;
  /** 是否折叠代码块（当画布打开时） */
  collapseCodeBlocks?: boolean;
  /** 按代码块决定是否折叠 */
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  /** 代码块点击回调（用于在画布中显示） */
  onCodeBlockClick?: (language: string, code: string) => void;
  runtimeStatus?: AgentRuntimeStatus;
  showRuntimeStatusInline?: boolean;
  promoteActionRequestsToA2UI?: boolean;
  renderProposedPlanBlocks?: boolean;
  suppressedActionRequestId?: string | null;
  suppressProcessFlow?: boolean;
  showContentBlockActions?: boolean;
  onQuoteContent?: (content: string) => void;
  /** Markdown 渲染模式；历史恢复可使用 light 降低首帧成本。 */
  markdownRenderMode?: MarkdownRenderMode;
  /** 历史或非活动消息里的 A2UI 只读回显，不能再次提交。 */
  readOnlyA2UI?: boolean;
  /** 历史或非活动消息里的 ask/elicitation 只读回显，不能再次提交。 */
  readOnlyActionRequests?: boolean;
}

export const StreamingRenderer: React.FC<StreamingRendererProps> = memo(
  ({
    content,
    rawContent,
    isStreaming = false,
    toolCalls,
    showCursor = true,
    thinkingContent: externalThinking,
    contentParts,
    actionRequests,
    onA2UISubmit,
    a2uiFormId,
    a2uiInitialFormData,
    onA2UIFormChange,
    renderA2UIInline = true,
    onFileClick,
    fileChangesUndoSessionId,
    onOpenSavedSiteContent,
    onOpenUrlPreview,
    onOpenMediaReference,
    onPermissionResponse,
    collapseCodeBlocks,
    shouldCollapseCodeBlock,
    onCodeBlockClick,
    promoteActionRequestsToA2UI = false,
    renderProposedPlanBlocks = true,
    runtimeStatus,
    suppressedActionRequestId = null,
    suppressProcessFlow = false,
    showContentBlockActions = false,
    onQuoteContent,
    markdownRenderMode = "standard",
    readOnlyA2UI = false,
    readOnlyActionRequests = false,
  }) => {
    const { t } = useTranslation("agent");
    const shouldRenderInlineActionRequest = React.useCallback(
      (request: ActionRequired) =>
        suppressedActionRequestId !== request.requestId,
      [suppressedActionRequestId],
    );

    // 判断是否使用交错显示模式
    const displayContent = useMemo(
      () =>
        sanitizeMessageTextForDisplay(content, {
          role: "assistant",
        }),
      [content],
    );
    const runtimePeerSourceText = useMemo(
      () => (rawContent ?? content).trim(),
      [content, rawContent],
    );
    const shouldRenderRuntimePeerCards = useMemo(
      () => isPureRuntimePeerMessageText(runtimePeerSourceText),
      [runtimePeerSourceText],
    );
    const interleavedContentParts = useMemo(
      () =>
        coalesceAdjacentDisplayContentParts(
          orderStreamingContentPartsForDisplay(
            sanitizeContentPartsForDisplay(contentParts, {
              role: "assistant",
            }),
          ),
        ) ?? [],
      [contentParts],
    );
    const useInterleavedMode = interleavedContentParts.length > 0;
    const contentPartDebugSignature = useMemo(
      () => resolveContentPartDebugSignature(interleavedContentParts),
      [interleavedContentParts],
    );
    const parseCacheRef = useRef<Map<string, ParseResult>>(new Map());

    // 解析思考内容（仅在非交错模式下使用）
    const { visibleText, thinkingText } = useMemo(
      () => parseThinkingContent(displayContent),
      [displayContent],
    );
    const containsStructuredContent = useMemo(
      () => hasStructuredContentHint(visibleText),
      [visibleText],
    );
    const debouncedVisibleText = useDebouncedValue(
      visibleText,
      isStreaming && containsStructuredContent
        ? STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS
        : 0,
      {
        maxWait:
          isStreaming && containsStructuredContent
            ? STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS
            : undefined,
      },
    );
    const parsedVisibleText =
      isStreaming && containsStructuredContent
        ? debouncedVisibleText
        : visibleText;

    // 解析 A2UI 内容
    const parsedContent = useMemo(() => {
      if (useInterleavedMode) {
        return EMPTY_PARSE_RESULT;
      }
      const result = getCachedStructuredParse(
        parseCacheRef,
        parsedVisibleText,
        isStreaming,
      );
      return result;
    }, [parsedVisibleText, isStreaming, useInterleavedMode]);

    const interleavedParsedContent = useMemo(() => {
      if (!useInterleavedMode) {
        return [];
      }

      return interleavedContentParts.map((part) => {
        if (part.type !== "text") {
          return EMPTY_PARSE_RESULT;
        }

        return getCachedStructuredParse(parseCacheRef, part.text, isStreaming);
      });
    }, [interleavedContentParts, isStreaming, useInterleavedMode]);

    // 使用外部提供的思考内容或解析出的内容
    const finalThinking = suppressProcessFlow
      ? null
      : externalThinking || thinkingText;
    const processIsActive = isStreaming || isActiveRuntimeStatus(runtimeStatus);
    const hasFinalRenderableContent =
      displayContent.trim().length > 0 || shouldRenderRuntimePeerCards;
    const shouldKeepProcessOpenForFinalAnswer =
      processIsActive && !hasFinalRenderableContent;
    const visibleActionRequests = (actionRequests || []).filter(
      shouldRenderInlineActionRequest,
    );

    // 判断是否有正在执行的工具
    const hasRunningTools = useMemo(() => {
      if (useInterleavedMode) {
        return interleavedContentParts.some(
          (part) =>
            part.type === "tool_use" && part.toolCall.status === "running",
        );
      }
      return toolCalls?.some((tc) => tc.status === "running") ?? false;
    }, [interleavedContentParts, toolCalls, useInterleavedMode]);

    // 判断是否显示光标
    const shouldShowCursor = isStreaming && showCursor && !hasRunningTools;

    const renderProcessRun = React.useCallback(
      (
        entries: StreamingProcessEntry[],
        key: string,
        options?: { forceGroup?: boolean },
      ) => (
        <StreamingProcessRun
          key={key}
          entries={entries}
          forceGroup={options?.forceGroup}
          isStreaming={isStreaming}
          processIsActive={processIsActive}
          shouldKeepProcessOpenForFinalAnswer={
            shouldKeepProcessOpenForFinalAnswer
          }
          promoteActionRequestsToA2UI={promoteActionRequestsToA2UI}
          readOnlyActionRequests={readOnlyActionRequests}
          onPermissionResponse={onPermissionResponse}
          onFileClick={onFileClick}
          onOpenSavedSiteContent={onOpenSavedSiteContent}
          onOpenUrlPreview={onOpenUrlPreview}
        />
      ),
      [
        isStreaming,
        onFileClick,
        onOpenSavedSiteContent,
        onOpenUrlPreview,
        onPermissionResponse,
        processIsActive,
        promoteActionRequestsToA2UI,
        readOnlyActionRequests,
        shouldKeepProcessOpenForFinalAnswer,
      ],
    );

    const renderParsedResultParts = React.useCallback(
      (params: {
        parsed: ParseResult;
        keyPrefix: string;
        lastStreamingPartIndex?: number;
      }) => {
        const { parsed, keyPrefix, lastStreamingPartIndex } = params;
        return parsed.parts.map((part, index) => {
          switch (part.type) {
            case "a2ui": {
              if (!renderA2UIInline || typeof part.content === "string") {
                return null;
              }
              const response = readOnlyA2UI
                ? { ...part.content, submitAction: undefined }
                : part.content;
              return (
                <A2UITaskCard
                  key={`${keyPrefix}-a2ui-${index}`}
                  response={response}
                  onSubmit={readOnlyA2UI ? undefined : onA2UISubmit}
                  formId={a2uiFormId}
                  initialFormData={a2uiInitialFormData}
                  onFormChange={onA2UIFormChange}
                  preset={CHAT_A2UI_TASK_CARD_PRESET}
                  compact={true}
                  className="max-w-[432px]"
                  preview={readOnlyA2UI}
                />
              );
            }

            case "pending_a2ui":
              if (!renderA2UIInline) {
                return null;
              }
              return (
                <A2UITaskLoadingCard
                  key={`${keyPrefix}-pending-${index}`}
                  preset={CHAT_A2UI_TASK_CARD_PRESET}
                  subtitle={t("agentChat.streamingRenderer.pendingA2ui")}
                  compact={true}
                  className="max-w-[432px]"
                />
              );

            case "text":
            default: {
              const textContent =
                typeof part.content === "string" ? part.content : "";
              if (!textContent || textContent.trim() === "") {
                return null;
              }
              const isStreamingPart =
                typeof lastStreamingPartIndex === "number" &&
                index === lastStreamingPartIndex;
              return (
                <StreamingText
                  key={`${keyPrefix}-text-${index}`}
                  text={textContent}
                  isStreaming={isStreaming && isStreamingPart}
                  showCursor={shouldShowCursor && isStreamingPart}
                  onA2UISubmit={onA2UISubmit}
                  a2uiFormId={a2uiFormId}
                  a2uiInitialFormData={a2uiInitialFormData}
                  onA2UIFormChange={onA2UIFormChange}
                  renderA2UIInline={renderA2UIInline}
                  renderProposedPlanBlocks={renderProposedPlanBlocks}
                  collapseCodeBlocks={collapseCodeBlocks}
                  shouldCollapseCodeBlock={shouldCollapseCodeBlock}
                  onCodeBlockClick={onCodeBlockClick}
                  showBlockActions={showContentBlockActions}
                  onQuoteContent={onQuoteContent}
                  markdownRenderMode={markdownRenderMode}
                  readOnlyA2UI={readOnlyA2UI}
                />
              );
            }
          }
        });
      },
      [
        a2uiFormId,
        a2uiInitialFormData,
        collapseCodeBlocks,
        isStreaming,
        onA2UIFormChange,
        onA2UISubmit,
        onCodeBlockClick,
        onQuoteContent,
        markdownRenderMode,
        renderA2UIInline,
        renderProposedPlanBlocks,
        readOnlyA2UI,
        showContentBlockActions,
        shouldCollapseCodeBlock,
        shouldShowCursor,
        t,
      ],
    );

    const renderInterleavedTextPart = React.useCallback(
      (part: Extract<ContentPart, { type: "text" }>, index: number) => {
        const partText = part.text;
        if (!partText) {
          return null;
        }

        const partParsed =
          interleavedParsedContent[index] || EMPTY_PARSE_RESULT;
        const isLastPart = index === interleavedContentParts.length - 1;
        const lastStreamingPartIndex = isLastPart
          ? partParsed.parts.length - 1
          : undefined;

        if (partParsed.parts.length > 0) {
          return (
            <React.Fragment key={`text-${index}`}>
              {renderParsedResultParts({
                parsed: partParsed,
                keyPrefix: `interleaved-${index}`,
                lastStreamingPartIndex,
              })}
            </React.Fragment>
          );
        }

        return (
          <StreamingText
            key={`text-${index}`}
            text={partText}
            isStreaming={isStreaming && isLastPart}
            showCursor={shouldShowCursor && isLastPart}
            onA2UISubmit={onA2UISubmit}
            a2uiFormId={a2uiFormId}
            a2uiInitialFormData={a2uiInitialFormData}
            onA2UIFormChange={onA2UIFormChange}
            renderProposedPlanBlocks={renderProposedPlanBlocks}
            collapseCodeBlocks={collapseCodeBlocks}
            shouldCollapseCodeBlock={shouldCollapseCodeBlock}
            onCodeBlockClick={onCodeBlockClick}
            showBlockActions={showContentBlockActions}
            onQuoteContent={onQuoteContent}
            markdownRenderMode={markdownRenderMode}
            readOnlyA2UI={readOnlyA2UI}
          />
        );
      },
      [
        a2uiFormId,
        a2uiInitialFormData,
        collapseCodeBlocks,
        interleavedContentParts.length,
        interleavedParsedContent,
        isStreaming,
        onA2UIFormChange,
        onA2UISubmit,
        onCodeBlockClick,
        onQuoteContent,
        readOnlyA2UI,
        renderParsedResultParts,
        renderProposedPlanBlocks,
        markdownRenderMode,
        showContentBlockActions,
        shouldCollapseCodeBlock,
        shouldShowCursor,
      ],
    );

    const hasVisibleContent = useInterleavedMode
      ? interleavedContentParts.some((part) => {
          if (part.type === "text") {
            return part.text.length > 0;
          }
          if (suppressProcessFlow) {
            return false;
          }
          if (part.type === "thinking") {
            return part.text.length > 0;
          }
          if (part.type === "tool_use") {
            return true;
          }
          if (part.type === "file_changes_batch") {
            return part.aggregate.fileCount > 0;
          }
          if (part.type === "media_reference") {
            return Boolean(part.reference.uri);
          }
          return shouldRenderInlineActionRequest(part.actionRequired);
        }) ||
        (isStreaming &&
          (displayContent.length > 0 ||
            (externalThinking && externalThinking.length > 0)))
      : visibleText.length > 0 ||
        shouldRenderRuntimePeerCards ||
        Boolean(finalThinking) ||
        (toolCalls?.length ?? 0) > 0 ||
        visibleActionRequests.length > 0;

    // 交错显示模式：按顺序渲染 contentParts
    if (useInterleavedMode) {
      const nodes: React.ReactNode[] = [];
      let processBuffer: StreamingProcessEntry[] = [];

      const hasRenderableDownstreamContent = (startIndex: number): boolean =>
        interleavedContentParts.slice(startIndex + 1).some((part) => {
          if (part.type === "text") {
            return part.text.trim().length > 0;
          }
          if (suppressProcessFlow) {
            return false;
          }
          if (part.type === "thinking") {
            return part.text.trim().length > 0;
          }
          if (part.type === "tool_use") {
            return true;
          }
          if (part.type === "file_changes_batch") {
            return part.aggregate.fileCount > 0;
          }
          if (part.type === "media_reference") {
            return Boolean(part.reference.uri);
          }
          return shouldRenderInlineActionRequest(part.actionRequired);
        });

      const processBufferOnlyThinking = () =>
        processBuffer.length > 0 &&
        processBuffer.every((entry) => entry.kind === "thinking");

      const flushProcessBuffer = (
        keySuffix: string,
        options?: { forceGroup?: boolean },
      ) => {
        if (processBuffer.length === 0) {
          return;
        }
        const shouldKeepStreamingThinkingStandalone =
          isStreaming && processBufferOnlyThinking();
        const shouldForceGroup =
          options?.forceGroup ??
          (processBuffer.some((entry) => entry.kind !== "action") &&
            !shouldKeepStreamingThinkingStandalone);
        const renderedRun = renderProcessRun(
          processBuffer,
          `interleaved-process-${keySuffix}`,
          {
            forceGroup: shouldForceGroup,
          },
        );
        if (renderedRun) {
          nodes.push(renderedRun);
        }
        processBuffer = [];
      };

      interleavedContentParts.forEach((part, index) => {
        if (part.type === "text") {
          flushProcessBuffer(String(index));
          const textNode = renderInterleavedTextPart(part, index);
          if (textNode) {
            nodes.push(textNode);
          }
          return;
        }

        if (part.type === "thinking") {
          if (suppressProcessFlow) {
            return;
          }
          if (!part.text) {
            return;
          }
          const hasDownstreamContent = hasRenderableDownstreamContent(index);
          const nextEntry: StreamingProcessEntry = {
            kind: "thinking",
            id: `thinking-${index}`,
            text: part.text,
            defaultExpanded:
              isStreaming || isImportedProcessMetadata(part.metadata),
            isActive: isStreaming,
            autoCollapseEligible: hasDownstreamContent,
            metadata: part.metadata,
          };
          if (shouldSplitProcessBeforeEntry(processBuffer, nextEntry)) {
            flushProcessBuffer(String(index));
          }
          processBuffer.push(nextEntry);
          return;
        }

        if (part.type === "tool_use") {
          if (suppressProcessFlow) {
            return;
          }
          const nextEntry: StreamingProcessEntry = {
            kind: "tool",
            id: part.toolCall.id,
            toolCall: part.toolCall,
            metadata: part.metadata,
          };
          const shouldSplitBeforeTool = shouldSplitProcessBeforeEntry(
            processBuffer,
            nextEntry,
          );
          const shouldKeepCompletedProcessIntroWithTool =
            !isStreaming && processBufferOnlyThinking() && shouldSplitBeforeTool;
          if (
            isStreaming &&
            processBufferOnlyThinking() &&
            shouldSplitBeforeTool
          ) {
            flushProcessBuffer(String(index), {
              forceGroup: true,
            });
          }
          if (
            shouldSplitBeforeTool &&
            !shouldKeepCompletedProcessIntroWithTool
          ) {
            flushProcessBuffer(String(index));
          }
          processBuffer.push(nextEntry);
          return;
        }

        if (part.type === "file_changes_batch") {
          if (suppressProcessFlow) {
            return;
          }
          flushProcessBuffer(String(index));
          const undoSessionId = fileChangesUndoSessionId;
          nodes.push(
            <FileChangesSummaryCard
              key={`file-changes-${index}`}
              aggregate={part.aggregate}
              isStreaming={isStreaming}
              onUndo={
                undoSessionId
                  ? async () => {
                      try {
                        return await restoreFileChangesFromCheckpoints({
                          aggregate: part.aggregate,
                          sessionId: undoSessionId,
                        });
                      } catch (error) {
                        if (error instanceof FileChangesUndoError) {
                          throw new Error(
                            t(
                              `agentChat.fileChangesSummary.undoError.${error.code}`,
                            ),
                          );
                        }
                        throw error;
                      }
                    }
                  : undefined
              }
              onFileClick={
                onFileClick
                  ? (path, content) => onFileClick(path, content)
                  : undefined
              }
            />,
          );
          return;
        }

        if (part.type === "media_reference") {
          flushProcessBuffer(String(index));
          nodes.push(
            <StreamingMediaReferenceCard
              key={`media-reference-${index}`}
              reference={part.reference}
              isStreaming={isStreaming}
              onOpen={
                onOpenMediaReference
                  ? (reference) => onOpenMediaReference(reference, index)
                  : undefined
              }
            />,
          );
          return;
        }

        if (!suppressProcessFlow) {
          const nextEntry: StreamingProcessEntry = {
            kind: "action",
            id: part.actionRequired.requestId,
            actionRequired: part.actionRequired,
          };
          if (shouldSplitProcessBeforeEntry(processBuffer, nextEntry)) {
            flushProcessBuffer(String(index));
          }
          if (isStreaming && processBufferOnlyThinking()) {
            flushProcessBuffer(String(index));
          }
          processBuffer.push(nextEntry);
          flushProcessBuffer(`${index}-action`);
        }
      });

      flushProcessBuffer("tail");

      return (
        <div
          className="flex flex-col gap-2"
          data-testid="streaming-renderer"
          data-content-part-types={contentPartDebugSignature}
          data-render-mode="interleaved"
        >
          {nodes}

          {/* 如果没有内容但正在流式输出，显示光标 */}
          {!hasVisibleContent &&
            isStreaming &&
            showCursor &&
            !hasRunningTools && (
              <div>
                <StreamingCursor />
              </div>
            )}
        </div>
      );
    }

    // 非交错内容统一收敛到同一条执行过程，避免重复渲染多条过程流。
    const fallbackProcessEntries: StreamingProcessEntry[] = [];
    const hasFallbackDownstreamContent =
      visibleText.trim().length > 0 ||
      shouldRenderRuntimePeerCards ||
      (toolCalls?.length ?? 0) > 0 ||
      visibleActionRequests.length > 0;
    if (finalThinking) {
      fallbackProcessEntries.push({
        kind: "thinking",
        id: "fallback-thinking",
        text: finalThinking,
        defaultExpanded: isStreaming,
        isActive: isStreaming,
        autoCollapseEligible: hasFallbackDownstreamContent,
      });
    }
    for (const toolCall of suppressProcessFlow ? [] : toolCalls || []) {
      fallbackProcessEntries.push({
        kind: "tool",
        id: toolCall.id,
        toolCall,
      });
    }
    for (const request of suppressProcessFlow ? [] : visibleActionRequests) {
      fallbackProcessEntries.push({
        kind: "action",
        id: request.requestId,
        actionRequired: request,
      });
    }

    const fallbackProcessNode = (() => {
      if (fallbackProcessEntries.length === 0) {
        return null;
      }

      const processSegments: StreamingProcessEntry[][] = [];
      let segmentBuffer: StreamingProcessEntry[] = [];
      for (const entry of fallbackProcessEntries) {
        if (shouldSplitProcessBeforeEntry(segmentBuffer, entry)) {
          processSegments.push(segmentBuffer);
          segmentBuffer = [];
        }
        segmentBuffer.push(entry);
      }
      if (segmentBuffer.length > 0) {
        processSegments.push(segmentBuffer);
      }

      if (processSegments.length > 1) {
        return (
          <>
            {processSegments.map((segment, segmentIndex) =>
              renderProcessRun(
                segment,
                `fallback-process-${segmentIndex}`,
                {
                  forceGroup: true,
                },
              ),
            )}
          </>
        );
      }

      const [firstEntry, ...downstreamEntries] = fallbackProcessEntries;
      if (
        isStreaming &&
        firstEntry?.kind === "thinking" &&
        hasFallbackDownstreamContent
      ) {
        return (
          <>
            {renderProcessRun([firstEntry], "fallback-thinking")}
            {downstreamEntries.length > 0
              ? renderProcessRun(downstreamEntries, "fallback-process")
              : null}
          </>
        );
      }

      return renderProcessRun(fallbackProcessEntries, "fallback-process");
    })();

    return (
      <div
        className="flex flex-col gap-2"
        data-testid="streaming-renderer"
        data-content-part-types={contentPartDebugSignature}
        data-render-mode="standard"
      >
        {fallbackProcessNode}

        {/* 解析后的内容区域（包括 A2UI、普通文本） */}
        {shouldRenderRuntimePeerCards ? (
          <RuntimePeerMessageCards text={runtimePeerSourceText} />
        ) : (
          renderParsedResultParts({
            parsed: parsedContent,
            keyPrefix: "standard",
            lastStreamingPartIndex: parsedContent.parts.length - 1,
          })
        )}

        {/* 如果没有内容但正在流式输出，显示光标 */}
        {!hasVisibleContent &&
          isStreaming &&
          showCursor &&
          !hasRunningTools && (
            <div>
              <StreamingCursor />
            </div>
          )}
      </div>
    );
  },
);

StreamingRenderer.displayName = "StreamingRenderer";
