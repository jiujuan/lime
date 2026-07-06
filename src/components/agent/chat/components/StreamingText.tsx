import React, { memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/lib/artifact/hooks/useDebouncedValue";
import { MarkdownRenderer, type MarkdownRenderMode } from "./MarkdownRenderer";
import { A2UITaskCard, A2UITaskLoadingCard } from "./A2UITaskCard";
import { AgentPlanBlock } from "./AgentPlanBlock";
import type {
  A2UIFormData,
  ParseResult,
} from "@/components/workspace/a2ui/types";
import { CHAT_A2UI_TASK_CARD_PRESET } from "@/components/workspace/a2ui/taskCardPresets";
import {
  splitProposedPlanSegments,
  stripProposedPlanBlocks,
} from "../utils/proposedPlan";
import { StreamingMarkdownContent } from "./StreamingMarkdownContent";
import {
  getCachedStructuredParse,
  hasStructuredContentHint,
  STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS,
} from "./StreamingStructuredContent";

// ============ 流式光标 ============

export const StreamingCursor: React.FC = () => (
  <span
    className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 align-text-bottom animate-pulse"
    style={{ animationDuration: "1s" }}
  />
);

interface PlanAwareMarkdownOptions {
  onA2UISubmit?: (formData: A2UIFormData) => void;
  renderA2UIInline?: boolean;
  collapseCodeBlocks?: boolean;
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  onCodeBlockClick?: (language: string, code: string) => void;
  isStreaming?: boolean;
  renderProposedPlanBlocks?: boolean;
  showBlockActions?: boolean;
  onQuoteContent?: (content: string) => void;
  markdownRenderMode?: MarkdownRenderMode;
  readOnlyA2UI?: boolean;
}

function renderPlanAwareMarkdown(
  text: string,
  keyPrefix: string,
  {
    onA2UISubmit,
    renderA2UIInline,
    collapseCodeBlocks,
    shouldCollapseCodeBlock,
    onCodeBlockClick,
    isStreaming,
    renderProposedPlanBlocks = true,
    showBlockActions = false,
    onQuoteContent,
    markdownRenderMode = "standard",
    readOnlyA2UI = false,
  }: PlanAwareMarkdownOptions,
) {
  if (!renderProposedPlanBlocks) {
    const visibleText = stripProposedPlanBlocks(text);
    if (!visibleText.trim()) {
      return null;
    }
    return (
      <MarkdownRenderer
        key={`${keyPrefix}-text-only`}
        content={visibleText}
        onA2UISubmit={onA2UISubmit}
        renderA2UIInline={renderA2UIInline}
        collapseCodeBlocks={collapseCodeBlocks}
        shouldCollapseCodeBlock={shouldCollapseCodeBlock}
        onCodeBlockClick={onCodeBlockClick}
        isStreaming={isStreaming}
        showBlockActions={showBlockActions}
        onQuoteContent={onQuoteContent}
        renderMode={markdownRenderMode}
        readOnlyA2UI={readOnlyA2UI}
      />
    );
  }

  const segments = splitProposedPlanSegments(text);
  if (segments.length === 0) {
    return null;
  }

  return segments.map((segment, index) =>
    segment.type === "plan" ? (
      <AgentPlanBlock
        key={`${keyPrefix}-plan-${index}`}
        content={segment.content}
        isComplete={segment.isComplete}
      />
    ) : (
      <MarkdownRenderer
        key={`${keyPrefix}-text-${index}`}
        content={segment.content}
        onA2UISubmit={onA2UISubmit}
        renderA2UIInline={renderA2UIInline}
        collapseCodeBlocks={collapseCodeBlocks}
        shouldCollapseCodeBlock={shouldCollapseCodeBlock}
        onCodeBlockClick={onCodeBlockClick}
        isStreaming={isStreaming}
        showBlockActions={showBlockActions}
        onQuoteContent={onQuoteContent}
        renderMode={markdownRenderMode}
        readOnlyA2UI={readOnlyA2UI}
      />
    ),
  );
}

// ============ 流式文本组件 ============

interface StreamingTextProps {
  /** 目标文本（完整内容） */
  text: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 是否显示光标 */
  showCursor?: boolean;
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
  /** 是否内联渲染 proposed plan 块 */
  renderProposedPlanBlocks?: boolean;
  /** 是否折叠代码块 */
  collapseCodeBlocks?: boolean;
  /** 按代码块决定是否折叠 */
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  /** 代码块点击回调 */
  onCodeBlockClick?: (language: string, code: string) => void;
  /** 是否为正文块显示引用/复制按钮 */
  showBlockActions?: boolean;
  /** 引用当前正文块 */
  onQuoteContent?: (content: string) => void;
  /** Markdown 渲染模式；历史恢复可使用 light 降低首帧成本。 */
  markdownRenderMode?: MarkdownRenderMode;
  /** 历史消息中的 A2UI 只允许回显，不能再次提交。 */
  readOnlyA2UI?: boolean;
}

/**
 * 流式文本组件
 *
 * 直接展示已经收到的最新文本，避免前端打字机动画拖慢首字和输出过程。
 */
export const StreamingText: React.FC<StreamingTextProps> = memo(
  ({
    text,
    isStreaming,
    showCursor = true,
    onA2UISubmit,
    a2uiFormId,
    a2uiInitialFormData,
    onA2UIFormChange,
    renderA2UIInline = true,
    renderProposedPlanBlocks = true,
    collapseCodeBlocks,
    shouldCollapseCodeBlock,
    onCodeBlockClick,
    showBlockActions = false,
    onQuoteContent,
    markdownRenderMode = "standard",
    readOnlyA2UI = false,
  }) => {
    const { t } = useTranslation("agent");
    const displayText = text;
    const parseCacheRef = useRef<Map<string, ParseResult>>(new Map());

    const shouldShowCursor = isStreaming && showCursor;
    const containsStructuredContent = useMemo(
      () => hasStructuredContentHint(displayText),
      [displayText],
    );
    const debouncedStructuredText = useDebouncedValue(
      displayText,
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
    const parsedSourceText =
      isStreaming && containsStructuredContent
        ? debouncedStructuredText
        : displayText;

    // 使用 parseAIResponse 解析内容，以正确处理 a2ui 代码块
    // 这比依赖 MarkdownRenderer 的 pre 组件更可靠
    const parsedContent = useMemo(
      () =>
        getCachedStructuredParse(parseCacheRef, parsedSourceText, isStreaming),
      [parsedSourceText, isStreaming],
    );

    // 渲染解析后的内容
    const renderContent = () => {
      // 如果没有 a2ui 内容，直接使用 MarkdownRenderer
      if (!parsedContent.hasA2UI && !parsedContent.hasPending) {
        return (
          <StreamingMarkdownContent
            content={displayText}
            isStreaming={isStreaming}
            renderMarkdown={(markdown) =>
              renderPlanAwareMarkdown(markdown, "stream", {
                onA2UISubmit,
                renderA2UIInline,
                renderProposedPlanBlocks,
                collapseCodeBlocks,
                shouldCollapseCodeBlock,
                onCodeBlockClick,
                isStreaming,
                showBlockActions,
                onQuoteContent,
                markdownRenderMode,
                readOnlyA2UI,
              })
            }
          />
        );
      }

      // 有 a2ui 内容，按部分渲染
      return (
        <>
          {parsedContent.parts.map((part, index) => {
            switch (part.type) {
              case "a2ui":
                if (!renderA2UIInline) {
                  return null;
                }
                // 直接渲染 A2UI 表单
                if (typeof part.content !== "string") {
                  const response = readOnlyA2UI
                    ? { ...part.content, submitAction: undefined }
                    : part.content;
                  return (
                    <A2UITaskCard
                      key={`a2ui-${index}`}
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
                return null;

              case "pending_a2ui":
                if (!renderA2UIInline) {
                  return null;
                }
                // 显示加载状态
                return (
                  <A2UITaskLoadingCard
                    key={`pending-${index}`}
                    preset={CHAT_A2UI_TASK_CARD_PRESET}
                    subtitle={t("agentChat.streamingRenderer.pendingA2ui")}
                    compact={true}
                    className="max-w-[432px]"
                  />
                );

              case "text":
              default: {
                // 渲染普通文本
                const textContent =
                  typeof part.content === "string" ? part.content : "";
                if (!textContent || textContent.trim() === "") return null;
                return (
                  <StreamingMarkdownContent
                    key={`text-${index}`}
                    content={textContent}
                    isStreaming={isStreaming}
                    renderMarkdown={(markdown) =>
                      renderPlanAwareMarkdown(markdown, `text-${index}`, {
                        onA2UISubmit,
                        renderA2UIInline,
                        renderProposedPlanBlocks,
                        collapseCodeBlocks,
                        shouldCollapseCodeBlock,
                        onCodeBlockClick,
                        isStreaming,
                        showBlockActions,
                        onQuoteContent,
                        markdownRenderMode,
                        readOnlyA2UI,
                      })
                    }
                  />
                );
              }
            }
          })}
        </>
      );
    };

    return (
      <div className="relative">
        {renderContent()}
        {shouldShowCursor && <StreamingCursor />}
      </div>
    );
  },
);

StreamingText.displayName = "StreamingText";
