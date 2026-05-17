/**
 * 流式消息渲染组件
 *
 * 参考 aster UI 设计，支持思考内容、工具调用和实时 Markdown 渲染
 * Requirements: 9.3, 9.4
 */

import React, { memo, useMemo, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/lib/artifact/hooks/useDebouncedValue";
import { MarkdownRenderer, type MarkdownRenderMode } from "./MarkdownRenderer";
import { A2UITaskCard, A2UITaskLoadingCard } from "./A2UITaskCard";
import { ActionRequestA2UIPreviewCard } from "./ActionRequestA2UIPreviewCard";
import { InlineToolProcessStep } from "./InlineToolProcessStep";
import { ThinkingBlock } from "./ThinkingBlock";
import { resolveThinkingDisplayParts } from "./thinkingBlockDisplay";
import { DecisionPanel } from "./DecisionPanel";
import { AgentPlanBlock } from "./AgentPlanBlock";
import { RuntimePeerMessageCards } from "./RuntimePeerMessageCards";
import { parseAIResponse } from "@/lib/workspace/a2ui";
import type {
  A2UIFormData,
  ParseResult,
  ParsedMessageContent,
} from "@/lib/workspace/a2ui";
import { CHAT_A2UI_TASK_CARD_PRESET } from "@/lib/workspace/a2ui";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type {
  AgentRuntimeStatus,
  ContentPart,
  ActionRequired,
  ConfirmResponse,
  SiteSavedContentTarget,
  WriteArtifactContext,
} from "../types";
import {
  splitProposedPlanSegments,
  stripProposedPlanBlocks,
} from "../utils/proposedPlan";
import {
  buildActionRequestSubmissionPayload,
  isActionRequestA2UICompatible,
} from "../utils/actionRequestA2UI";
import {
  sanitizeContentPartsForDisplay,
  sanitizeMessageTextForDisplay,
} from "../utils/internalImagePlaceholder";
import { isPureRuntimePeerMessageText } from "../utils/runtimePeerMessageDisplay";
import {
  summarizeStreamingToolBatch,
  type ToolBatchSummaryDescriptor,
} from "../utils/toolBatchGrouping";
import { resolveToolProcessNarrative } from "../utils/toolProcessSummary";

const STRUCTURED_CONTENT_HINT_RE = /<a2ui|```\s*a2ui|<write_file|<document/i;
const STRUCTURED_PARSE_CACHE_LIMIT = 64;
const STREAMING_STRUCTURED_PARSE_DEBOUNCE_MS = 48;
const STREAMING_TEXT_LARGE_BACKLOG_CHARS = 240;
const STREAMING_TEXT_MEDIUM_BACKLOG_CHARS = 80;
const STREAMING_TEXT_SMALL_BACKLOG_CHARS = 24;
const STREAMING_TEXT_INITIAL_VISIBLE_CHARS = 12;

function resolveStreamingTextStepSize(
  pendingChars: number,
  elapsedMs: number,
  charInterval: number,
): number {
  const timedStep = Math.max(1, Math.floor(elapsedMs / charInterval));

  if (pendingChars > STREAMING_TEXT_LARGE_BACKLOG_CHARS) {
    return Math.max(timedStep, Math.ceil(pendingChars * 0.5));
  }

  if (pendingChars > STREAMING_TEXT_MEDIUM_BACKLOG_CHARS) {
    return Math.max(timedStep, Math.ceil(pendingChars * 0.3));
  }

  if (pendingChars > STREAMING_TEXT_SMALL_BACKLOG_CHARS) {
    return Math.max(timedStep, 8);
  }

  return timedStep;
}

function resolveInitialStreamingDisplayText(
  text: string,
  isStreaming: boolean,
) {
  if (!isStreaming || !text || hasStructuredContentHint(text)) {
    return isStreaming ? "" : text;
  }

  return Array.from(text)
    .slice(0, STREAMING_TEXT_INITIAL_VISIBLE_CHARS)
    .join("");
}

// ============ 思考内容组件 ============

type WriteFileMessagePart = ParsedMessageContent & {
  type: "write_file" | "pending_write_file";
};

// ============ 流式光标 ============

const StreamingCursor: React.FC = () => (
  <span
    className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 align-text-bottom animate-pulse"
    style={{ animationDuration: "1s" }}
  />
);

const EMPTY_PARSE_RESULT: ParseResult = {
  parts: [],
  hasA2UI: false,
  hasWriteFile: false,
  hasPending: false,
};

function hasStructuredContentHint(text: string): boolean {
  return STRUCTURED_CONTENT_HINT_RE.test(text);
}

function createPlainTextParts(text: string): ParsedMessageContent[] {
  const trimmed = text.trim();
  return trimmed ? [{ type: "text", content: trimmed }] : [];
}

function isWriteFileMessagePart(
  part: ParsedMessageContent,
): part is WriteFileMessagePart {
  return part.type === "write_file" || part.type === "pending_write_file";
}

function parseStructuredContent(
  text: string,
  isStreaming: boolean,
): ParseResult {
  if (!text.trim()) {
    return EMPTY_PARSE_RESULT;
  }

  if (!hasStructuredContentHint(text)) {
    return {
      parts: createPlainTextParts(text),
      hasA2UI: false,
      hasWriteFile: false,
      hasPending: false,
    };
  }

  return parseAIResponse(text, isStreaming);
}

function getCachedStructuredParse(
  cacheRef: React.MutableRefObject<Map<string, ParseResult>>,
  text: string,
  isStreaming: boolean,
): ParseResult {
  const key = `${isStreaming ? "stream" : "static"}:${text}`;
  const cached = cacheRef.current.get(key);
  if (cached) {
    return cached;
  }

  const parsed = parseStructuredContent(text, isStreaming);
  if (cacheRef.current.size >= STRUCTURED_PARSE_CACHE_LIMIT) {
    const oldestKey = cacheRef.current.keys().next().value;
    if (oldestKey) {
      cacheRef.current.delete(oldestKey);
    }
  }
  cacheRef.current.set(key, parsed);
  return parsed;
}

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

// ============ 流式文本组件（逐字符动画） ============

interface StreamingTextProps {
  /** 目标文本（完整内容） */
  text: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 是否显示光标 */
  showCursor?: boolean;
  /** 每个字符的渲染间隔（毫秒），默认 12ms */
  charInterval?: number;
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
 * 实现逐字符平滑显示效果，类似 ChatGPT/Claude 的打字机效果。
 * 当流式结束时，立即显示完整文本。
 */
const StreamingText: React.FC<StreamingTextProps> = memo(
  ({
    text,
    isStreaming,
    showCursor = true,
    charInterval = 12,
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
    const initialDisplayText = resolveInitialStreamingDisplayText(
      text,
      isStreaming,
    );
    const [displayText, setDisplayText] = useState(() => initialDisplayText);
    const displayIndexRef = useRef(initialDisplayText.length);
    const animationRef = useRef<number | null>(null);
    const prevTextRef = useRef(isStreaming ? "" : text);
    const targetTextRef = useRef(text);
    const parseCacheRef = useRef<Map<string, ParseResult>>(new Map());

    useEffect(() => {
      targetTextRef.current = text;
      // 如果不是流式输出，直接显示完整文本
      if (!isStreaming) {
        // 调试：确认非流式时是否正确设置完整文本
        if (text.includes("```a2ui")) {
          console.log(
            "[StreamingText] isStreaming=false, 包含 a2ui 代码块，长度:",
            text.length,
          );
        }
        setDisplayText(text);
        displayIndexRef.current = text.length;
        prevTextRef.current = text;
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        return;
      }

      if (
        !text.startsWith(prevTextRef.current) ||
        displayIndexRef.current > text.length
      ) {
        const seededText = resolveInitialStreamingDisplayText(
          text,
          isStreaming,
        );
        displayIndexRef.current = seededText.length;
        prevTextRef.current = "";
        setDisplayText(seededText);
      }

      // 检测文本是否有新增
      if (text.length <= prevTextRef.current.length) {
        prevTextRef.current = text;
        return;
      }

      prevTextRef.current = text;

      // 如果已经有动画在运行，让它继续
      if (animationRef.current !== null) {
        return;
      }

      let lastTime = 0;

      const animate = (currentTime: number) => {
        if (!lastTime) lastTime = currentTime;
        const elapsed = currentTime - lastTime;

        if (elapsed >= charInterval) {
          const targetText = targetTextRef.current;
          const pendingChars = Math.max(
            0,
            targetText.length - displayIndexRef.current,
          );
          const charsToAdd = resolveStreamingTextStepSize(
            pendingChars,
            elapsed,
            charInterval,
          );
          const newIndex = Math.min(
            displayIndexRef.current + charsToAdd,
            targetText.length,
          );

          if (newIndex > displayIndexRef.current) {
            displayIndexRef.current = newIndex;
            setDisplayText(targetText.slice(0, newIndex));
          }

          lastTime = currentTime;
        }

        // 继续动画直到追上目标
        if (displayIndexRef.current < targetTextRef.current.length) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }, [text, isStreaming, charInterval]);

    // 组件卸载时清理
    useEffect(() => {
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, []);

    const shouldShowCursor =
      isStreaming && showCursor && displayIndexRef.current < text.length;
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
        return renderPlanAwareMarkdown(displayText, "stream", {
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
        });
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
                    subtitle="正在解析结构化问题，请稍等。"
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
                return renderPlanAwareMarkdown(textContent, `text-${index}`, {
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
                });
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

// ============ 思考内容解析 ============

interface ParsedContent {
  visibleText: string;
  thinkingText: string | null;
}

const parseThinkingContent = (text: string): ParsedContent => {
  // 支持 <think>...</think> 和 <thinking>...</thinking> 标签
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let thinkingText: string | null = null;
  let visibleText = text;

  const matches = text.matchAll(thinkRegex);
  const thinkingParts: string[] = [];

  for (const match of matches) {
    thinkingParts.push(match[1].trim());
    visibleText = visibleText.replace(match[0], "");
  }

  if (thinkingParts.length > 0) {
    thinkingText = thinkingParts.join("\n\n");
  }

  return {
    visibleText: visibleText.trim(),
    thinkingText,
  };
};

type StreamingProcessEntry =
  | {
      kind: "thinking";
      id: string;
      text: string;
      defaultExpanded?: boolean;
    }
  | {
      kind: "tool";
      id: string;
      toolCall: ToolCallState;
    }
  | {
      kind: "action";
      id: string;
      actionRequired: ActionRequired;
    };

function buildStreamingProcessSummary(entries: StreamingProcessEntry[]): {
  summaryText: string;
  descriptor: ToolBatchSummaryDescriptor | null;
  metaText: string | null;
} {
  const toolEntries = entries.filter(
    (entry): entry is Extract<StreamingProcessEntry, { kind: "tool" }> =>
      entry.kind === "tool",
  );
  const thinkingCount = entries.filter(
    (entry) => entry.kind === "thinking",
  ).length;
  const batchDescriptor =
    toolEntries.length === entries.length
      ? summarizeStreamingToolBatch(toolEntries.map((entry) => entry.toolCall))
      : null;
  if (batchDescriptor) {
    return {
      summaryText: batchDescriptor.title,
      descriptor: batchDescriptor,
      metaText: null,
    };
  }

  const toolCount = toolEntries.length;
  const messageCount = entries.length - toolCount;
  const primarySummary = (() => {
    if (thinkingCount > 0 && toolCount > 0) {
      for (const entry of toolEntries) {
        const narrative = resolveToolProcessNarrative(entry.toolCall);
        if (narrative.preSummary || narrative.summary) {
          return narrative.preSummary || narrative.summary;
        }
      }
      return "正在处理过程步骤";
    }

    for (const entry of entries) {
      if (entry.kind === "thinking") {
        const preview = resolveThinkingDisplayParts(
          entry.text,
          entry.defaultExpanded === true,
        ).preview;
        if (preview) {
          return preview;
        }
        continue;
      }

      if (entry.kind === "tool") {
        const narrative = resolveToolProcessNarrative(entry.toolCall);
        if (narrative.preSummary || narrative.summary) {
          return narrative.preSummary || narrative.summary;
        }
        continue;
      }

      const prompt = entry.actionRequired.prompt?.trim();
      if (prompt) {
        return prompt.length <= 72
          ? prompt
          : `${prompt.slice(0, 71).trimEnd()}…`;
      }
    }

    return null;
  })();

  if (!primarySummary) {
    const summaryParts: string[] = [];
    if (thinkingCount > 0) {
      summaryParts.push("思考中");
    }
    if (toolCount > 0) {
      summaryParts.push(`${toolCount} 个工具调用`);
    }
    if (messageCount > thinkingCount) {
      summaryParts.push(`${messageCount} 条过程消息`);
    }
    return {
      summaryText: summaryParts.join("，"),
      descriptor: null,
      metaText: null,
    };
  }

  if (toolCount === 0) {
    return {
      summaryText: primarySummary,
      descriptor: null,
      metaText: thinkingCount > 1 ? `${thinkingCount} 条思路` : null,
    };
  }

  return {
    summaryText: primarySummary,
    descriptor: null,
    metaText:
      entries.length > 1
        ? [
            thinkingCount > 0 ? `${thinkingCount} 条思路` : null,
            `${toolCount} 个工具调用`,
          ]
            .filter(Boolean)
            .join("，")
        : null,
  };
}

const GroupedProcessShell: React.FC<{
  groupMarker: string;
  children: React.ReactNode;
}> = ({ groupMarker, children }) => (
  <div className="flex items-start gap-2 py-1.5">
    <span className="pt-0.5 font-mono text-xs text-slate-400">
      {groupMarker}
    </span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

const StreamingProcessGroup: React.FC<{
  entries: StreamingProcessEntry[];
  defaultExpanded?: boolean;
  renderEntry: (
    entry: StreamingProcessEntry,
    grouped: boolean,
    groupMarker: string,
  ) => React.ReactNode;
}> = ({ entries, defaultExpanded = false, renderEntry }) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const previousDefaultExpandedRef = React.useRef(defaultExpanded);
  const { summaryText, descriptor, metaText } = useMemo(
    () => buildStreamingProcessSummary(entries),
    [entries],
  );

  React.useEffect(() => {
    if (previousDefaultExpandedRef.current !== defaultExpanded) {
      previousDefaultExpandedRef.current = defaultExpanded;
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded]);

  return (
    <div className="py-0.5" data-testid="streaming-process-group">
      <button
        type="button"
        className="flex w-full items-start gap-2 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
        <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-slate-700">
          <span className="block break-words">{summaryText}</span>
          {metaText ? (
            <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-500">
              {metaText}
            </span>
          ) : null}
          {descriptor?.supportingLines?.length ? (
            <span className="mt-0.5 block space-y-0.5">
              {descriptor.supportingLines.slice(0, 2).map((line) => (
                <span
                  key={line}
                  className="block text-xs font-normal leading-5 text-slate-500"
                >
                  {line}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="ml-2">
          {entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
              {renderEntry(entry, true, index === 0 ? "└" : "·")}
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
};

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
  /**
   * 交错内容列表（按事件到达顺序排列）
   * 如果存在且非空，按顺序渲染
   * 否则回退到 content + toolCalls 渲染方式
   */
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
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
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

/**
 * 流式消息渲染组件
 *
 * 支持：
 * - 思考内容折叠显示（<think> 或 <thinking> 标签）
 * - 工具调用状态和结果显示
 * - 实时 Markdown 渲染
 * - 流式光标
 * - **交错内容显示**（文本和工具调用按事件顺序交错）
 */
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
    onWriteFile,
    onFileClick,
    onOpenSavedSiteContent,
    onPermissionResponse,
    collapseCodeBlocks,
    shouldCollapseCodeBlock,
    onCodeBlockClick,
    promoteActionRequestsToA2UI = false,
    renderProposedPlanBlocks = true,
    suppressedActionRequestId = null,
    suppressProcessFlow = false,
    showContentBlockActions = false,
    onQuoteContent,
    markdownRenderMode = "standard",
    readOnlyA2UI = false,
    readOnlyActionRequests = false,
  }) => {
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
        sanitizeContentPartsForDisplay(contentParts, {
          role: "assistant",
        }) ?? [],
      [contentParts],
    );
    const useInterleavedMode = interleavedContentParts.length > 0;
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

    // 解析 A2UI 和 write_file 内容
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

    // 处理文件写入 - 使用 ref 追踪同一路径的最新阶段与内容签名
    const processedWriteFilesRef = useRef<Map<string, string>>(new Map());

    const emitWriteFile = React.useCallback(
      (part: ParsedMessageContent, signatureKey: string) => {
        if (
          !onWriteFile ||
          (part.type !== "write_file" && part.type !== "pending_write_file") ||
          !part.filePath
        ) {
          return;
        }

        const contentValue =
          typeof part.content === "string" ? part.content : "";
        const signature = `${part.type}:${signatureKey}:${contentValue}`;
        const previousSignature = processedWriteFilesRef.current.get(
          part.filePath,
        );
        if (previousSignature === signature) {
          return;
        }

        processedWriteFilesRef.current.set(part.filePath, signature);
        const metadata: WriteArtifactContext["metadata"] = {
          writePhase:
            part.type === "pending_write_file"
              ? "streaming"
              : isStreaming
                ? "streaming"
                : "completed",
          previewText: contentValue.trim()
            ? contentValue.slice(0, 480).trim()
            : undefined,
          latestChunk: contentValue.trim()
            ? contentValue.slice(-240).trim()
            : undefined,
          isPartial: part.type === "pending_write_file" || isStreaming,
          lastUpdateSource: "message_content",
        };

        onWriteFile(contentValue, part.filePath, {
          source: "message_content",
          status:
            part.type === "pending_write_file" || isStreaming
              ? "streaming"
              : "complete",
          metadata,
        });
      },
      [isStreaming, onWriteFile],
    );

    useEffect(() => {
      if (!onWriteFile) return;

      const writeCandidates = useInterleavedMode
        ? interleavedParsedContent.flatMap((parsed, index) =>
            parsed.parts.map((part, partIndex) => ({
              part,
              signatureKey: `interleaved:${index}:${partIndex}`,
            })),
          )
        : parsedContent.parts.map((part, index) => ({
            part,
            signatureKey: `standard:${index}`,
          }));

      for (const candidate of writeCandidates) {
        if (
          candidate.part.type === "write_file" ||
          candidate.part.type === "pending_write_file"
        ) {
          emitWriteFile(candidate.part, candidate.signatureKey);
        }
      }
    }, [
      emitWriteFile,
      interleavedParsedContent,
      onWriteFile,
      parsedContent.parts,
      useInterleavedMode,
    ]);

    // 使用外部提供的思考内容或解析出的内容
    const finalThinking = suppressProcessFlow
      ? null
      : externalThinking || thinkingText;
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

    const renderWriteFileIndicator = React.useCallback(
      (part: WriteFileMessagePart, key: string) => {
        const fileContent =
          typeof part.content === "string" ? part.content : "";
        const filePath = part.filePath || "文档.md";
        const normalizedPath = filePath.replace(/\\/g, "/").trim();
        const fileName =
          normalizedPath.split("/").filter(Boolean).pop() || normalizedPath;
        const previewText =
          fileContent.trim().replace(/\s+/g, " ").slice(0, 160) ||
          "正在准备文件内容，稍后会同步完整预览。";
        const displayPreview =
          previewText.length >= 160
            ? `${previewText.slice(0, 159)}…`
            : previewText;
        const isPending = part.type === "pending_write_file" || isStreaming;

        return (
          <div
            key={key}
            data-testid="streaming-write-file-card"
            className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm shadow-slate-950/5 transition hover:border-sky-200 hover:bg-sky-50/40"
            onClick={() =>
              part.filePath && onFileClick?.(part.filePath, fileContent)
            }
          >
            <div className="group flex w-full items-start gap-3 text-left">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
                {isPending ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin text-sky-600" />
                ) : (
                  <FileText className="h-[18px] w-[18px]" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium leading-6 text-slate-900">
                    <span className="line-clamp-1 break-all">
                      {isPending ? `正在生成 ${fileName}` : fileName}
                    </span>
                  </div>
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] leading-5 text-sky-700">
                    {isPending ? "生成中" : "已写入"}
                  </span>
                </div>

                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {displayPreview}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    title={filePath}
                    className="inline-flex max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-500"
                  >
                    <span className="truncate">
                      {normalizedPath || fileName}
                    </span>
                  </span>
                  {part.filePath ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 transition group-hover:text-sky-700">
                      <span>在画布中打开</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      },
      [isStreaming, onFileClick],
    );

    const renderActionRequestNode = React.useCallback(
      (request: ActionRequired) => {
        if (!shouldRenderInlineActionRequest(request)) {
          return null;
        }

        const shouldRenderA2UICard =
          isActionRequestA2UICompatible(request) &&
          (readOnlyActionRequests ||
            request.status === "submitted" ||
            request.status === "queued" ||
            (promoteActionRequestsToA2UI && request.status === "pending"));
        if (shouldRenderA2UICard) {
          const isReadOnly =
            readOnlyActionRequests ||
            request.status === "submitted" ||
            request.status === "queued" ||
            !onPermissionResponse;
          return (
            <ActionRequestA2UIPreviewCard
              request={request}
              compact={true}
              context="chat"
              readOnly={isReadOnly}
              onSubmit={
                isReadOnly
                  ? undefined
                  : (formData) => {
                      const payload = buildActionRequestSubmissionPayload(
                        request,
                        formData,
                      );
                      onPermissionResponse({
                        requestId: request.requestId,
                        confirmed: true,
                        actionType: request.actionType,
                        response: payload.responseText,
                        userData: payload.userData,
                      });
                    }
              }
            />
          );
        }
        return (
          <DecisionPanel
            request={request}
            onSubmit={onPermissionResponse || (() => {})}
          />
        );
      },
      [
        onPermissionResponse,
        promoteActionRequestsToA2UI,
        readOnlyActionRequests,
        shouldRenderInlineActionRequest,
      ],
    );

    const renderProcessEntry = React.useCallback(
      (entry: StreamingProcessEntry, grouped: boolean, groupMarker: string) => {
        if (entry.kind === "thinking") {
          return (
            <ThinkingBlock
              key={entry.id}
              content={entry.text}
              defaultExpanded={Boolean(entry.defaultExpanded)}
              grouped={grouped}
              groupMarker={groupMarker}
              isStreaming={isStreaming}
            />
          );
        }

        if (entry.kind === "tool") {
          return (
            <InlineToolProcessStep
              key={entry.id}
              toolCall={entry.toolCall}
              isMessageStreaming={isStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              grouped={grouped}
              groupMarker={groupMarker}
            />
          );
        }

        const actionNode = renderActionRequestNode(entry.actionRequired);
        if (!actionNode) {
          return null;
        }

        if (!grouped) {
          return <React.Fragment key={entry.id}>{actionNode}</React.Fragment>;
        }

        return (
          <GroupedProcessShell key={entry.id} groupMarker={groupMarker}>
            {actionNode}
          </GroupedProcessShell>
        );
      },
      [
        isStreaming,
        onFileClick,
        onOpenSavedSiteContent,
        renderActionRequestNode,
      ],
    );

    const renderProcessRun = React.useCallback(
      (entries: StreamingProcessEntry[], key: string) => {
        if (entries.length === 0) {
          return null;
        }

        const toolCount = entries.filter(
          (entry) => entry.kind === "tool",
        ).length;
        if (toolCount > 0 && entries.length > 1) {
          return (
            <StreamingProcessGroup
              key={key}
              entries={entries}
              defaultExpanded={isStreaming}
              renderEntry={renderProcessEntry}
            />
          );
        }

        return entries.map((entry) => (
          <React.Fragment key={entry.id}>
            {renderProcessEntry(entry, false, "•")}
          </React.Fragment>
        ));
      },
      [isStreaming, renderProcessEntry],
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

            case "write_file":
            case "pending_write_file":
              return isWriteFileMessagePart(part)
                ? renderWriteFileIndicator(part, `${keyPrefix}-write-${index}`)
                : null;

            case "pending_a2ui":
              if (!renderA2UIInline) {
                return null;
              }
              return (
                <A2UITaskLoadingCard
                  key={`${keyPrefix}-pending-${index}`}
                  preset={CHAT_A2UI_TASK_CARD_PRESET}
                  subtitle="正在解析结构化问题，请稍等。"
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
        renderWriteFileIndicator,
        readOnlyA2UI,
        showContentBlockActions,
        shouldCollapseCodeBlock,
        shouldShowCursor,
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

      const flushProcessBuffer = (keySuffix: string) => {
        if (processBuffer.length === 0) {
          return;
        }
        const renderedRun = renderProcessRun(
          processBuffer,
          `interleaved-process-${keySuffix}`,
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
          processBuffer.push({
            kind: "thinking",
            id: `thinking-${index}`,
            text: part.text,
            defaultExpanded: isStreaming,
          });
          return;
        }

        if (part.type === "tool_use") {
          if (suppressProcessFlow) {
            return;
          }
          processBuffer.push({
            kind: "tool",
            id: part.toolCall.id,
            toolCall: part.toolCall,
          });
          return;
        }

        if (
          !suppressProcessFlow &&
          shouldRenderInlineActionRequest(part.actionRequired)
        ) {
          processBuffer.push({
            kind: "action",
            id: part.actionRequired.requestId,
            actionRequired: part.actionRequired,
          });
        }
      });

      flushProcessBuffer("tail");

      return (
        <div className="flex flex-col gap-2">
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
    if (finalThinking) {
      fallbackProcessEntries.push({
        kind: "thinking",
        id: "fallback-thinking",
        text: finalThinking,
        defaultExpanded: isStreaming,
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

    return (
      <div className="flex flex-col gap-2">
        {fallbackProcessEntries.length > 0
          ? renderProcessRun(fallbackProcessEntries, "fallback-process")
          : null}

        {/* 解析后的内容区域（包括 A2UI、write_file、普通文本） */}
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
