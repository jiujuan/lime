import type { ContentPart, Message } from "../types";
import {
  containsRuntimeAttachmentPlaceholder,
  isOnlyRuntimeAttachmentPlaceholderText,
  replaceRuntimeAttachmentPlaceholders,
} from "./runtimeAttachmentPlaceholder";
import { isInternalThinkingPreviewLine } from "./internalThinkingText";
import { readContentPartSequence } from "./contentPartTimeline";
import { stripAssistantProtocolResidue } from "./protocolResidue";
import { formatRuntimePeerMessageText } from "./runtimePeerMessageDisplay";

const TOOL_NARRATION_TOOL_NAME_RE =
  /\b(?:ToolSearch|WebSearch|WebFetch|Read|Write|Edit|Glob|Grep|Bash|StructuredOutput|webReader)\b|(?:mcp__[\w-]+(?:__[\w-]+)?|lime_[\w-]+)/i;
const TOOL_NARRATION_ACTION_RE =
  /调用|使用|执行|检索|搜索|查询|核实|确认|验证|联网|上网|获取|读取|抓取|访问|打开|分析|查找|扩搜|筛选|切换|转去|改为|尝试/i;
const TOOL_NARRATION_SELF_PROCESS_RE =
  /让我|我将|我会|接下来|现在|继续|直接|先|然后|随后|改为|转去|尝试|开始/i;
const TOOL_NARRATION_SCHEDULING_RE =
  /只返回了元数据|未命中|没有返回|改为|转去|切换到|直接调用/i;
const TOOL_NARRATION_NAVIGATION_TARGET_RE =
  /搜索页|结果页|网页|页面|链接|文件|目录|仓库|日志|结果/i;
const TOOL_NARRATION_NAVIGATION_RE =
  /已经打开|已打开|打开了|开始筛选|继续筛选|开始查看|继续查看|开始检索|继续检索|开始分析|继续分析|开始整理|继续整理/i;
const TOOL_NARRATION_RESULT_RE =
  /结果如下|结论|我发现|发现了|找到|搜到|查到|查到了|显示|表明|说明|意味着|共有|共计|\d+\s*(?:个|条|项|篇|页|处)/i;
const TOOL_NARRATION_ITERATION_RE =
  /(?:第\s*[一二三四五六七八九十\d]+\s*轮|本轮|上一轮|这轮|当前).*(?:质量不高|不稳定|噪声|受限|失败|未命中|不够|不可读|无法读取)|(?:页面|结果|来源|抓取|读取|访问).*(?:质量不高|不稳定|噪声|受限|失败|未命中|不够|不可读|无法读取).*(?:继续|补充|改为|换|再)/i;
const TOOL_NARRATION_CONTINUATION_RE =
  /(?:继续|补充|改为|换|再).*(?:搜索|检索|查询|核实|确认|验证|获取|拉取|浏览|打开|访问|抓取|读取|聚合|整理|来源|页面|结果)/i;
const TOOL_NARRATION_RETRIEVAL_STATUS_RE =
  /(?:搜索|检索|查询|核实|确认|验证|获取|拉取|浏览|打开|访问|抓取|读取|来源|页面|结果|媒体|命中|提取).*(?:质量不高|不稳定|噪声|受限|失败|未命中|不够|不足|不可读|无法读取)|(?:质量不高|不稳定|噪声|受限|失败|未命中|不够|不足|不可读|无法读取).*(?:搜索|检索|查询|来源|页面|结果|媒体|命中|抓取|读取|访问)/i;
const TOOL_NARRATION_INTERNAL_RETRY_RE =
  /(?:继续|补充|改为|换|再|尝试|转去|切换到).*(?:搜索|检索|查询|核实|确认|验证|获取|拉取|浏览|打开|访问|抓取|读取|提取|聚合|补充)/i;
const TOOL_NARRATION_MAX_LENGTH = 120;
const TOOL_NARRATION_STATUS_MAX_LENGTH = 240;
const PROCESS_NEARBY_SCAN_LIMIT = 2;
const ASSISTANT_PROCESS_PREFIX_MAX_LENGTH = 800;
const ASSISTANT_SENTENCE_SPLIT_RE = /[^。！？!?]+[。！？!?]?|[。！？!?]+/g;
const ASSISTANT_INCOMPLETE_PROCESS_LEAD_IN_RE =
  /^(?:我|我先|我会|我将|我来|我们|我们先|让我|先|接下来|现在|好的|好)$/;
const ASSISTANT_TOOL_PROCESS_LEAD_IN_RE =
  /^(?:(?:我|我们)(?:会|将|来)?先?|让我|先|接下来|现在|正在)?\s*(?:联网|上网)?(?:搜索|检索|查询|查找|核实|确认|验证|获取|拉取|浏览|打开|访问|抓取|读取|联网|上网)/i;
const ASSISTANT_USER_FACING_LEAD_IN_RE =
  /(?:再|然后|随后|并).*(?:整理|汇总|生成|输出|给出|形成|组织).*(?:简报|报告|摘要|结论|清单|要点|正文|回答)/i;
const ASSISTANT_MARKDOWN_HEADING_RE = /(?:^|\n)\s{0,3}#{1,6}[ \t]+\S/;
const ASSISTANT_LOOSE_MARKDOWN_HEADING_RE =
  /(?:^|\n)\s{0,3}(?:#{1,6}(?=\S)|[^\n#|`*_]{2,72}#{2,6}\s*(?=\n|$))/;
const ASSISTANT_MARKDOWN_BLOCK_START_RE =
  /(?:^|\n)(?:[-*+]\s+\S|\d+\.\s+\S|```|~~~|\|.*\|)/;
const ASSISTANT_PHASE_SUMMARY_HEADING_RE = /^\s{0,3}#{1,6}\s*阶段结论\s*$/;
const ASSISTANT_PHASE_SUMMARY_INLINE_RE = /^\s*阶段结论[:：]\s*/;
const ASSISTANT_RUNTIME_ERROR_ENVELOPE_PREFIX_RE =
  /^\s*Ran into this error:\s*/;
const ASSISTANT_RUNTIME_ERROR_ENVELOPE_RETRY_RE =
  /\n+\s*Please retry if you think this is a transient or recoverable error\.\s*$/;
const ASSISTANT_RUNTIME_ERROR_TITLE_RE = /^Ran into this erro(?:r\b|\.\.\.$)/i;
const MARKDOWN_IMAGE_RE = /!\[([^\]\n]*)]\((?:[^()\\\n]|\\.|\([^)\n]*\))*\)/;
const MARKDOWN_IMAGE_GLOBAL_RE =
  /!\[([^\]\n]*)]\((?:[^()\\\n]|\\.|\([^)\n]*\))*\)/g;

interface SanitizeMessageTextOptions {
  role: Message["role"];
  hasImages?: boolean;
}

function collapseDisplayWhitespace(value: string): string {
  return value
    .replace(/\s+([，。！？、；：,.!?;:])/g, "$1")
    .replace(/([（【《“‘([<])\s+/g, "$1")
    .replace(/\s+([）】》”’)\]>])/g, "$1")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAdjacentToolUse(parts: ContentPart[], index: number): boolean {
  return (
    parts[index - 1]?.type === "tool_use" ||
    parts[index + 1]?.type === "tool_use"
  );
}

function hasStructuredContentPartProvenance(part: ContentPart): boolean {
  return Boolean(
    part.metadata?.source ||
    part.metadata?.threadItemId ||
    part.metadata?.turnId ||
    readContentPartSequence(part) !== null,
  );
}

function isProcessContentPart(part: ContentPart | undefined): boolean {
  return Boolean(part && part.type !== "text");
}

function hasNearbyProcessPart(parts: ContentPart[], index: number): boolean {
  if (hasAdjacentToolUse(parts, index)) {
    return true;
  }

  for (let offset = 1; offset <= PROCESS_NEARBY_SCAN_LIMIT; offset += 1) {
    if (
      isProcessContentPart(parts[index - offset]) ||
      isProcessContentPart(parts[index + offset])
    ) {
      return true;
    }
  }

  return false;
}

function isBeforeFirstProcessPart(
  parts: ContentPart[],
  index: number,
): boolean {
  return !parts.slice(0, index).some(isProcessContentPart);
}

function shouldKeepLeadingProcessIntro(text: string): boolean {
  const normalized = collapseDisplayWhitespace(text);
  if (!normalized || normalized.length < 8) {
    return false;
  }

  if (
    isInternalThinkingPreviewLine(normalized) ||
    ASSISTANT_INCOMPLETE_PROCESS_LEAD_IN_RE.test(normalized) ||
    TOOL_NARRATION_TOOL_NAME_RE.test(normalized) ||
    TOOL_NARRATION_ITERATION_RE.test(normalized) ||
    TOOL_NARRATION_RETRIEVAL_STATUS_RE.test(normalized) ||
    TOOL_NARRATION_INTERNAL_RETRY_RE.test(normalized)
  ) {
    return false;
  }

  return (
    /[。！？.!?]$/.test(normalized) &&
    /^(?:我|我们)(?:会|将|来)?先/.test(normalized) &&
    ASSISTANT_TOOL_PROCESS_LEAD_IN_RE.test(normalized)
  );
}

function shouldStripAssistantProcessLeadIn(text: string): boolean {
  const normalized = collapseDisplayWhitespace(text);
  if (!normalized) {
    return false;
  }

  if (isInternalThinkingPreviewLine(normalized)) {
    return true;
  }

  if (normalized.length > TOOL_NARRATION_STATUS_MAX_LENGTH) {
    return false;
  }

  if (
    normalized.length <= TOOL_NARRATION_STATUS_MAX_LENGTH &&
    ((TOOL_NARRATION_ITERATION_RE.test(normalized) &&
      TOOL_NARRATION_CONTINUATION_RE.test(normalized)) ||
      TOOL_NARRATION_RETRIEVAL_STATUS_RE.test(normalized) ||
      TOOL_NARRATION_INTERNAL_RETRY_RE.test(normalized))
  ) {
    return true;
  }

  if (TOOL_NARRATION_RESULT_RE.test(normalized)) {
    return false;
  }

  if (ASSISTANT_USER_FACING_LEAD_IN_RE.test(normalized)) {
    return false;
  }

  if (normalized.length > TOOL_NARRATION_MAX_LENGTH) {
    return false;
  }

  return (
    ASSISTANT_INCOMPLETE_PROCESS_LEAD_IN_RE.test(normalized) ||
    ASSISTANT_TOOL_PROCESS_LEAD_IN_RE.test(normalized) ||
    shouldStripAssistantToolNarration(normalized)
  );
}

function shouldStripAssistantProcessPrefix(text: string): boolean {
  const normalized = collapseDisplayWhitespace(text);
  if (!normalized) {
    return false;
  }

  if (isInternalThinkingPreviewLine(normalized)) {
    return true;
  }

  if (normalized.length > ASSISTANT_PROCESS_PREFIX_MAX_LENGTH) {
    return false;
  }

  if (
    TOOL_NARRATION_RESULT_RE.test(normalized) ||
    ASSISTANT_USER_FACING_LEAD_IN_RE.test(normalized)
  ) {
    return false;
  }

  return (
    ASSISTANT_INCOMPLETE_PROCESS_LEAD_IN_RE.test(normalized) ||
    ASSISTANT_TOOL_PROCESS_LEAD_IN_RE.test(normalized) ||
    shouldStripAssistantToolNarration(normalized)
  );
}

function resolveStructuredBodyMatchIndex(
  match: RegExpExecArray | null,
): number | undefined {
  if (!match || typeof match.index !== "number" || match.index < 0) {
    return undefined;
  }

  return match[0].startsWith("\n") ? match.index + 1 : match.index;
}

function findStructuredBodyStartIndex(text: string): number | null {
  const headingMatch = ASSISTANT_MARKDOWN_HEADING_RE.exec(text);
  const looseHeadingMatch = ASSISTANT_LOOSE_MARKDOWN_HEADING_RE.exec(text);
  const blockStartMatch = ASSISTANT_MARKDOWN_BLOCK_START_RE.exec(text);
  const indexes = [
    resolveStructuredBodyMatchIndex(headingMatch),
    resolveStructuredBodyMatchIndex(looseHeadingMatch),
    resolveStructuredBodyMatchIndex(blockStartMatch),
  ].filter((index): index is number => typeof index === "number");

  if (indexes.length === 0) {
    return null;
  }

  return Math.min(...indexes);
}

function splitAssistantProcessSentences(line: string): string[] {
  const matches = line.match(ASSISTANT_SENTENCE_SPLIT_RE);
  return matches?.length ? matches : [line];
}

function stripAssistantProcessLeadInText(text: string): string | null {
  const bodyStartIndex = findStructuredBodyStartIndex(text);
  if (bodyStartIndex !== null && bodyStartIndex > 0) {
    const prefix = text.slice(0, bodyStartIndex);
    if (shouldStripAssistantProcessPrefix(prefix)) {
      return text.slice(bodyStartIndex).trim() || null;
    }
  }

  const visibleLines = text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) {
        return "";
      }
      const visibleLine = splitAssistantProcessSentences(line)
        .filter((sentence) => !shouldStripAssistantProcessLeadIn(sentence))
        .join("")
        .trim();
      return visibleLine || null;
    })
    .filter((line): line is string => line !== null);
  const visibleText = visibleLines.join("\n").trim();
  return visibleText || null;
}

function shouldStripAssistantToolNarration(text: string): boolean {
  const normalized = collapseDisplayWhitespace(text);
  if (!normalized || normalized.length > TOOL_NARRATION_MAX_LENGTH) {
    return false;
  }

  if (TOOL_NARRATION_RESULT_RE.test(normalized)) {
    return false;
  }

  const hasToolName = TOOL_NARRATION_TOOL_NAME_RE.test(normalized);
  const hasAction = TOOL_NARRATION_ACTION_RE.test(normalized);
  const hasSelfProcess = TOOL_NARRATION_SELF_PROCESS_RE.test(normalized);
  const hasSchedulingCue = TOOL_NARRATION_SCHEDULING_RE.test(normalized);

  if (hasToolName && hasAction && (hasSelfProcess || hasSchedulingCue)) {
    return true;
  }

  return (
    hasSelfProcess &&
    TOOL_NARRATION_NAVIGATION_RE.test(normalized) &&
    TOOL_NARRATION_NAVIGATION_TARGET_RE.test(normalized)
  );
}

function stripAssistantPhaseSummaryTitle(text: string): string {
  const strippedLines: string[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const trimmed = line.trim();

    if (
      ASSISTANT_PHASE_SUMMARY_HEADING_RE.test(trimmed) ||
      trimmed === "阶段结论"
    ) {
      while (index + 1 < lines.length && !(lines[index + 1] || "").trim()) {
        index += 1;
      }
      continue;
    }

    if (ASSISTANT_PHASE_SUMMARY_INLINE_RE.test(trimmed)) {
      const stripped = line.replace(ASSISTANT_PHASE_SUMMARY_INLINE_RE, "");
      if (!stripped.trim()) {
        continue;
      }
      strippedLines.push(stripped);
      continue;
    }

    strippedLines.push(line);
  }

  return strippedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMarkdownImageSyntax(text: string): boolean {
  return MARKDOWN_IMAGE_RE.test(text);
}

function normalizeMarkdownAltEcho(value: string): string {
  return collapseDisplayWhitespace(value);
}

function stripMarkdownAltEchoSegment(
  segment: string,
  normalizedAlts: Set<string>,
): string {
  const normalized = normalizeMarkdownAltEcho(segment);
  if (!normalized) {
    return segment;
  }
  return normalizedAlts.has(normalized) ? "" : segment;
}

function stripInlineMarkdownImageAltEchoes(line: string): {
  line: string;
  normalizedAlts: Set<string>;
} {
  const matches = Array.from(line.matchAll(MARKDOWN_IMAGE_GLOBAL_RE));
  const normalizedAlts = new Set(
    matches
      .map((match) => normalizeMarkdownAltEcho(match[1] || ""))
      .filter(Boolean),
  );
  if (!matches.length || !normalizedAlts.size) {
    return { line, normalizedAlts };
  }

  let cursor = 0;
  let nextLine = "";
  for (const match of matches) {
    const start = match.index ?? 0;
    nextLine += stripMarkdownAltEchoSegment(
      line.slice(cursor, start),
      normalizedAlts,
    );
    nextLine += match[0];
    cursor = start + match[0].length;
  }
  nextLine += stripMarkdownAltEchoSegment(line.slice(cursor), normalizedAlts);

  return { line: nextLine, normalizedAlts };
}

function stripRedundantMarkdownImageAltEchoes(text: string): string {
  if (!hasMarkdownImageSyntax(text)) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const projected = lines.map(stripInlineMarkdownImageAltEchoes);
  const strippedLines = projected.map((entry, index) => {
    if (entry.normalizedAlts.size > 0) {
      return entry.line;
    }

    const normalized = normalizeMarkdownAltEcho(entry.line);
    if (!normalized) {
      return entry.line;
    }

    const previousAlts = projected[index - 1]?.normalizedAlts;
    const nextAlts = projected[index + 1]?.normalizedAlts;
    if (previousAlts?.has(normalized) || nextAlts?.has(normalized)) {
      return "";
    }

    return entry.line;
  });

  return strippedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isAssistantRuntimeErrorDisplayText(
  text: string,
  options: { allowTruncatedTitle?: boolean } = {},
): boolean {
  const normalized = text.trim();
  const isFullEnvelope =
    ASSISTANT_RUNTIME_ERROR_ENVELOPE_PREFIX_RE.test(normalized) &&
    ASSISTANT_RUNTIME_ERROR_ENVELOPE_RETRY_RE.test(normalized);
  if (isFullEnvelope) {
    return true;
  }

  return Boolean(
    options.allowTruncatedTitle &&
    ASSISTANT_RUNTIME_ERROR_TITLE_RE.test(normalized.replace(/\s+/g, " ")),
  );
}

export function sanitizeMessageTextForDisplay(
  text: string,
  options: SanitizeMessageTextOptions,
): string {
  const normalized =
    options.role === "assistant"
      ? stripAssistantPhaseSummaryTitle(stripAssistantProtocolResidue(text))
      : text.trim();
  if (
    options.role === "assistant" &&
    isAssistantRuntimeErrorDisplayText(normalized)
  ) {
    return "";
  }

  const formattedRuntimePeerMessage = formatRuntimePeerMessageText(normalized);
  if (!formattedRuntimePeerMessage) {
    return "";
  }

  const displayMessage =
    options.role === "user"
      ? stripRedundantMarkdownImageAltEchoes(formattedRuntimePeerMessage)
      : formattedRuntimePeerMessage;

  if (!displayMessage) {
    return "";
  }

  if (!containsRuntimeAttachmentPlaceholder(displayMessage)) {
    return displayMessage;
  }

  if (
    isOnlyRuntimeAttachmentPlaceholderText(displayMessage) &&
    ((options.role === "user" && options.hasImages) ||
      options.role === "assistant")
  ) {
    return "";
  }

  return collapseDisplayWhitespace(
    replaceRuntimeAttachmentPlaceholders(displayMessage, "图片"),
  );
}

export function sanitizeMessageTextForPreview(
  text: string,
  options: SanitizeMessageTextOptions,
): string {
  const sanitized = sanitizeMessageTextForDisplay(text, options);
  if (sanitized) {
    return sanitized;
  }

  if (options.role === "user" && options.hasImages) {
    return "已附加图片";
  }

  if (
    options.role === "assistant" &&
    isOnlyRuntimeAttachmentPlaceholderText(text)
  ) {
    return "图片处理中";
  }

  return "";
}

export function sanitizeContentPartsForDisplay(
  parts: ContentPart[] | undefined,
  options: SanitizeMessageTextOptions,
): ContentPart[] | undefined {
  if (!parts || parts.length === 0) {
    return parts;
  }

  const sanitizedParts = parts.flatMap<ContentPart>((part, index) => {
    if (part.type !== "text") {
      return [part];
    }

    const sanitizedText = sanitizeMessageTextForDisplay(part.text, options);
    if (!sanitizedText) {
      return [];
    }

    if (options.role === "assistant" && hasNearbyProcessPart(parts, index)) {
      if (hasStructuredContentPartProvenance(part)) {
        return [
          {
            ...part,
            text: sanitizedText,
          },
        ];
      }

      if (
        isBeforeFirstProcessPart(parts, index) &&
        shouldKeepLeadingProcessIntro(sanitizedText)
      ) {
        return [
          {
            ...part,
            text: sanitizedText,
          },
        ];
      }

      const visibleText = stripAssistantProcessLeadInText(sanitizedText);
      if (!visibleText) {
        return [];
      }

      return [
        {
          ...part,
          text: visibleText,
        },
      ];
    }

    return [
      {
        ...part,
        text: sanitizedText,
      },
    ];
  });

  return sanitizedParts.length > 0 ? sanitizedParts : undefined;
}
