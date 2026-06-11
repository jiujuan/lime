import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import styled from "styled-components";
import { Copy, Check, Quote } from "lucide-react";
import { parseA2UIJson } from "@/components/workspace/a2ui/parser";
import type { A2UIFormData } from "@/components/workspace/a2ui/types";
import { CHAT_A2UI_TASK_CARD_PRESET } from "@/components/workspace/a2ui/taskCardPresets";
import { useDebouncedValue } from "@/lib/artifact/hooks/useDebouncedValue";
import { readFilePreview } from "@/lib/api/fileBrowser";
import {
  hasDesktopHostInvokeCapability,
  hasDesktopHostRuntimeMarkers,
} from "@/lib/desktop-runtime";
import {
  interceptHttpExternalLinkClick,
  resolveHttpExternalHref,
} from "@/lib/markdown/externalLinks";
import { resolveMarkdownImageSrc } from "@/lib/markdown/resolveMarkdownImageSrc";
import {
  parseMarkdownBundleImageOverrides,
  resolveMarkdownBundleMetaPath,
} from "@/lib/markdown/markdownBundleMeta";
import { ArtifactPlaceholder } from "./ArtifactPlaceholder";
import { A2UITaskCard, A2UITaskLoadingCard } from "./A2UITaskCard";

const STREAMING_LIGHT_RENDER_THRESHOLD = 2_000;
const STREAMING_LIGHT_RENDER_DEBOUNCE_MS = 48;
const STREAMING_STANDARD_RENDER_DEBOUNCE_MS = 24;
const MARKDOWN_BUNDLE_META_MAX_SIZE = 64 * 1024;
const CODE_BLOCK_SURFACE = "#f7f8fa";
const CODE_BLOCK_SURFACE_ACCENT =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 248, 250, 0.98) 100%)";
const CODE_BLOCK_HEADER_SURFACE =
  "linear-gradient(180deg, rgba(250, 251, 252, 0.98) 0%, rgba(243, 245, 247, 0.98) 100%)";
const CODE_BLOCK_BORDER = "rgba(188, 199, 214, 0.78)";
const CODE_BLOCK_HEADER_BORDER = "rgba(148, 163, 184, 0.22)";
const CODE_BLOCK_TEXT = "#0f172a";
const CODE_BLOCK_MUTED_TEXT = "#64748b";
const CODE_BLOCK_BUTTON_SURFACE = "rgba(255, 255, 255, 0.88)";
const CODE_BLOCK_BUTTON_HOVER_SURFACE = "rgba(248, 250, 252, 0.98)";
const CODE_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// 收紧正文与代码块表面，让消息正文更接近单列执行流的阅读节奏。
const MarkdownContainer = styled.div`
  font-size: inherit;
  line-height: inherit;
  color: #1f2937;
  overflow-wrap: break-word;
  word-break: break-word;
  text-wrap: pretty;

  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0 0 0.95em;
    color: inherit;
    font-size: 1em;
    line-height: inherit;
    font-weight: 400;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: 600;
    margin: 1.08em 0 0.5em;
    line-height: 1.42;
    letter-spacing: 0;
    color: #111827;
  }

  h1:first-child,
  h2:first-child,
  h3:first-child {
    margin-top: 0;
  }

  h1 {
    font-size: 1.14em;
  }
  h2 {
    font-size: 1.08em;
  }
  h3 {
    font-size: 1.03em;
  }
  h4 {
    font-size: 1em;
  }
  h5,
  h6 {
    font-size: 0.98em;
  }

  ul,
  ol {
    padding-left: 1.28rem;
    margin: 0 0 0.95em;
  }

  ul {
    list-style-type: disc;
  }

  ol {
    list-style-type: decimal;
  }

  li {
    margin: 0.26em 0;
    padding-left: 0.08rem;
    color: inherit;
    font-weight: 400;
  }

  li > p {
    margin-bottom: 0.42em;
  }

  li::marker {
    color: hsl(var(--muted-foreground));
  }

  ul ul,
  ul ol,
  ol ul,
  ol ol {
    margin-top: 0.35em;
    margin-bottom: 0.45em;
  }

  strong {
    font-weight: 600;
    color: #111827;
  }

  em {
    font-style: italic;
  }

  hr {
    margin: 18px 0;
    border: none;
    border-top: 1px solid hsl(var(--border));
    opacity: 0.9;
  }

  code[data-inline-code="true"] {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.86em;
    line-height: 1.45;
    padding: 0.08rem 0.34rem;
    border-radius: 5px;
    border: 1px solid rgba(203, 213, 225, 0.86);
    background-color: rgba(248, 250, 252, 0.95);
    color: #0f172a;
  }

  pre {
    margin: 14px 0;
    padding: 10px 12px 12px;
    border-radius: 8px;
    overflow: auto;
    border: 1px solid hsl(var(--border));
    background: ${CODE_BLOCK_SURFACE};

    code {
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: inherit;
    }
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    min-width: 100%;
    margin: 0;
    font-size: 0.94em;
    table-layout: auto;
  }

  th,
  td {
    border-right: 1px solid var(--lime-surface-border, hsl(var(--border)));
    border-bottom: 1px solid var(--lime-surface-border, hsl(var(--border)));
    padding: 0.45rem 0.65rem;
    vertical-align: top;
    text-align: left;
  }

  th {
    font-weight: 600;
    background: #f8fafc;
    color: #334155;
    white-space: nowrap;
  }

  tr > *:last-child {
    border-right: none;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(even) td {
    background: var(--lime-surface-soft, hsl(var(--secondary) / 0.5));
  }

  a {
    color: #2563eb;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    text-decoration-color: rgba(37, 99, 235, 0.32);
    &:hover {
      text-decoration-color: currentColor;
    }
  }

  img {
    max-width: 100%;
    max-height: 512px;
    border-radius: 10px;
    object-fit: contain;
    cursor: pointer;
    border: 1px solid hsl(var(--border));
  }
`;

const MarkdownDivider = styled.hr`
  height: 1px;
  margin: 22px 0;
  border: none;
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--border)) 16%,
    hsl(var(--border)) 84%,
    transparent 100%
  );
`;

const MarkdownQuoteCard = styled.blockquote`
  margin: 0 0 0.95em;
  padding: 0;
  border: 1px solid var(--lime-surface-border-strong, hsl(var(--border)));
  border-radius: 20px;
  background: linear-gradient(
    180deg,
    var(--lime-surface, hsl(var(--background))) 0%,
    var(--lime-surface-soft, hsl(var(--secondary) / 0.5)) 100%
  );
  box-shadow: 0 14px 34px -30px rgba(15, 23, 42, 0.18);
  overflow: hidden;
`;

const MarkdownQuoteInner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
`;

const MarkdownQuoteIconShell = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--muted-foreground));
`;

const MarkdownQuoteBody = styled.div`
  min-width: 0;
  color: hsl(var(--foreground));

  p {
    margin-bottom: 0.55em;
  }

  p:last-child {
    margin-bottom: 0;
  }
`;

const ImageContainer = styled.div`
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ImageCaption = styled.span`
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
`;

const GeneratedImage = styled.img`
  max-width: 100%;
  max-height: 512px;
  border-radius: 10px;
  object-fit: contain;
  cursor: pointer;
  border: 1px solid hsl(var(--border));
  transition:
    border-color 0.18s ease,
    box-shadow 0.2s ease;

  &:hover {
    border-color: hsl(var(--ring));
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }
`;

const CodeBlockContainer = styled.div`
  position: relative;
  margin: 10px 0;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid ${CODE_BLOCK_BORDER};
  background-color: ${CODE_BLOCK_SURFACE};
  background-image: ${CODE_BLOCK_SURFACE_ACCENT};
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 14px 28px -28px rgba(15, 23, 42, 0.32);
`;

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px 5px 10px;
  background: ${CODE_BLOCK_HEADER_SURFACE};
  color: ${CODE_BLOCK_MUTED_TEXT};
  font-family: ${CODE_FONT_FAMILY};
  font-size: 11.5px;
  letter-spacing: 0;
  text-transform: none;
  border-bottom: 1px solid ${CODE_BLOCK_HEADER_BORDER};

  > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const CodeHeaderInfo = styled.span`
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
`;

const CodeLanguageLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${CODE_BLOCK_TEXT};
  font-weight: 600;
`;

const CodeLineCount = styled.span`
  flex-shrink: 0;
  color: ${CODE_BLOCK_MUTED_TEXT};
`;

const CopyButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid ${CODE_BLOCK_HEADER_BORDER};
  background: ${CODE_BLOCK_BUTTON_SURFACE};
  color: ${CODE_BLOCK_TEXT};
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${CODE_BLOCK_BUTTON_HOVER_SURFACE};
    border-color: rgba(148, 163, 184, 0.34);
  }

  &:focus-visible {
    outline: 2px solid rgba(148, 163, 184, 0.26);
    outline-offset: 1px;
  }
`;

const MarkdownBlockShell = styled.div`
  position: relative;

  &:hover [data-markdown-block-actions],
  &:focus-within [data-markdown-block-actions] {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
`;

const MarkdownBlockActions = styled.div`
  position: absolute;
  top: -10px;
  right: 2px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
`;

const MarkdownBlockActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(255, 255, 255, 0.96);
  color: rgb(100, 116, 139);
  box-shadow: 0 8px 22px -18px rgba(15, 23, 42, 0.3);
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    color: rgb(15, 23, 42);
    border-color: rgba(148, 163, 184, 0.9);
    background: rgba(255, 255, 255, 1);
    box-shadow: 0 10px 24px -18px rgba(15, 23, 42, 0.34);
  }

  &:focus-visible {
    outline: 2px solid rgba(148, 163, 184, 0.56);
    outline-offset: 1px;
  }
`;

const MarkdownTableScroll = styled.div`
  margin: 0 0 0.82em;
  overflow-x: auto;
  border: 1px solid var(--lime-surface-border-strong, hsl(var(--border)));
  border-radius: 8px;
  background: var(--lime-surface, hsl(var(--background)));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
`;

const PLAIN_TEXT_LANGUAGES = new Set(["text", "plaintext", "plain", "txt"]);
const FLOW_ARROW_ONLY_PATTERN = /^(↓|⬇|⇣|↧|->|=>|→|↘|v)$/u;
const CODE_SIGNAL_PATTERN =
  /[{}[\];=]|\b(const|let|var|function|class|return|import|export|interface|type|async|await)\b/;
const LANGUAGE_CLASS_PATTERN = /\blanguage-([^\s]+)/i;
const FLOW_VIEW_LANGUAGES = new Set(["flow"]);
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  "c#": "csharp",
  "c++": "cpp",
  js: "javascript",
  md: "markdown",
  objc: "objectivec",
  "objective-c": "objectivec",
  plain: "text",
  plaintext: "text",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  text: "text",
  ts: "typescript",
  txt: "text",
  yml: "yaml",
  zsh: "bash",
};
const COMPACT_PIPE_TABLE_SEPARATOR_PATTERN = /\|\|[ \t:|-]{3,}\|\|/;
const MARKDOWN_FENCE_LINE_PATTERN = /^\s*(`{3,}|~{3,})/;
const MARKDOWN_FENCE_OPEN_PATTERN = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)?.*$/;
const INLINE_COLLAPSED_FENCE_PATTERN =
  /```([A-Za-z0-9_+.#-]+)(?=[^\r\nA-Za-z0-9_+.#-])([\s\S]*?)```/g;
const COLLAPSED_MARKDOWN_TRAILING_TABLE_TEXT_PATTERN =
  /\|(?=[\u3400-\u9fffA-Za-z][^|\n]{0,24}[：:])/g;
const COLLAPSED_SPACED_HEADING_PATTERN = /[^\n#]#{2,6}\s+\S/g;
const COLLAPSED_ORDERED_LIST_PATTERN = /(?:[：:]\s*|\s)[1-9]\d{0,1}\.\s+\S/g;
const COLLAPSED_BULLET_LIST_PATTERN = /(?:[：:]\s*|\s)[-*+]\s+\S/g;
const MARKDOWN_HEADING_LINE_PATTERN = /^#{1,6}\s+\S/;
const MARKDOWN_ORDERED_LIST_LINE_PATTERN = /^[1-9]\d{0,1}\.\s+\S/;
const MARKDOWN_UNORDERED_LIST_LINE_PATTERN = /^[-*+]\s+\S/;
const PARTIAL_COLLAPSED_MARKDOWN_LINE_PATTERN =
  /(?:[^\n]\*\*[^*\n]{1,32}[：:]\*\*|[A-Za-z0-9\u3400-\u9fff。！？.!?)）】》”’\]][-+]\s*(?:\*\*)?[\u3400-\u9fffA-Za-z]|[\u3400-\u9fff，。！？；：,.!?;:)）】》”’\]][1-9]\d{0,1}\.\s+\S)/u;
const INLINE_FOLLOW_UP_ORDERED_MARKERS_PATTERN =
  /[2-9]\d{0,1}\.\s+\S[^\n]*[3-9]\d{0,1}\.\s+\S/u;
const COLLAPSED_HEADING_PROSE_BODY_PATTERN = /[。！？.!?]/u;
const COLLAPSED_HEADING_TITLE_FORBIDDEN_PATTERN =
  /[#>*`_[\]()|：:。！？.!?,，；;]/u;
const COLLAPSED_HEADING_BODY_LEADING_FORBIDDEN_PATTERN =
  /^[#>*`_[\]()|：:。！？.!?,，；;]/u;

function hasDesktopHostImagePreviewBoundary(): boolean {
  return hasDesktopHostRuntimeMarkers() || hasDesktopHostInvokeCapability();
}

interface MarkdownRendererProps {
  content: string;
  /** 当前 Markdown 文件路径，用于解析相对图片资源 */
  baseFilePath?: string;
  /** A2UI 表单提交回调 */
  onA2UISubmit?: (formData: A2UIFormData) => void;
  /** 是否渲染消息内联 A2UI */
  renderA2UIInline?: boolean;
  /** 历史消息中的 A2UI 只允许回显，不能再次提交。 */
  readOnlyA2UI?: boolean;
  /** 是否折叠代码块（当画布打开时） */
  collapseCodeBlocks?: boolean;
  /** 按代码块决定是否折叠 */
  shouldCollapseCodeBlock?: (language: string, code: string) => boolean;
  /** 代码块点击回调（用于在画布中显示） */
  onCodeBlockClick?: (language: string, code: string) => void;
  /** 是否正在流式生成 */
  isStreaming?: boolean;
  /** 是否为正文块显示引用/复制按钮 */
  showBlockActions?: boolean;
  /** 引用当前正文块 */
  onQuoteContent?: (content: string) => void;
  /** 历史恢复等冷路径可用轻量模式，避开高成本 HTML/Katex/语法高亮。 */
  renderMode?: MarkdownRenderMode;
}

export type MarkdownRenderMode = "standard" | "light";

function normalizeCodeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "text";
  }

  return CODE_LANGUAGE_ALIASES[normalized] ?? normalized;
}

function extractCodeLanguageToken(className: string): string {
  const match = LANGUAGE_CLASS_PATTERN.exec(className);
  return (match?.[1] ?? "text").trim().toLowerCase() || "text";
}

function resolveCodePresentationMode(
  language: string,
  codeContent: string,
): "syntax" | "plain" | "flow" {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const trimmed = codeContent.trim();
  if (!trimmed) {
    return "plain";
  }
  if (FLOW_VIEW_LANGUAGES.has(normalizedLanguage)) {
    return "flow";
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletRows = lines.filter((line) => /^[-*]\s+/.test(line)).length;
  const hasCodeSignals = CODE_SIGNAL_PATTERN.test(trimmed);

  if (
    PLAIN_TEXT_LANGUAGES.has(normalizedLanguage) ||
    (!hasCodeSignals && (bulletRows >= 2 || lines.length >= 4))
  ) {
    return "plain";
  }

  return "syntax";
}

function parsePipeTableCells(row: string): string[] {
  const trimmed = row.trim();
  if (!trimmed.includes("|")) {
    return [];
  }

  const withoutLeadingPipe = trimmed.startsWith("|")
    ? trimmed.slice(1)
    : trimmed;
  const withoutEdgePipes = withoutLeadingPipe.endsWith("|")
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;

  return withoutEdgePipes.split("|").map((cell) => cell.trim());
}

function formatPipeTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function normalizeCellsForTableWidth(cells: string[], width: number): string[] {
  if (cells.length === width) {
    return cells;
  }

  if (cells.length > width) {
    return [...cells.slice(0, width - 1), cells.slice(width - 1).join(" | ")];
  }

  return [...cells, ...Array.from({ length: width - cells.length }, () => "")];
}

function normalizeCompactPipeTableLine(line: string): string {
  const separatorMatch = COMPACT_PIPE_TABLE_SEPARATOR_PATTERN.exec(line);
  if (!separatorMatch || typeof separatorMatch.index !== "number") {
    return line;
  }

  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
  const headerSource = line.slice(0, separatorMatch.index).trim();
  if (!headerSource.startsWith("|")) {
    return line;
  }

  const headerCells = parsePipeTableCells(headerSource);
  const nonEmptyHeaderCells = headerCells.filter(Boolean);
  if (headerCells.length < 2 || nonEmptyHeaderCells.length < 2) {
    return line;
  }

  const rowSource = line
    .slice(separatorMatch.index + separatorMatch[0].length)
    .trim();
  const bodyRows = rowSource
    .split(/\s*\|\|\s*/)
    .map(parsePipeTableCells)
    .filter((cells) => cells.filter(Boolean).length >= 2)
    .map((cells) => normalizeCellsForTableWidth(cells, headerCells.length));

  if (bodyRows.length === 0) {
    return line;
  }

  const tableLines = [
    formatPipeTableRow(headerCells),
    formatPipeTableRow(headerCells.map(() => "---")),
    ...bodyRows.map(formatPipeTableRow),
  ];

  return tableLines
    .map((tableLine) => `${leadingWhitespace}${tableLine}`)
    .join("\n");
}

function isCompactPipeTableContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (
    !trimmed ||
    MARKDOWN_HEADING_LINE_PATTERN.test(trimmed) ||
    MARKDOWN_FENCE_LINE_PATTERN.test(trimmed)
  ) {
    return false;
  }

  return (
    trimmed.includes("|") &&
    parsePipeTableCells(trimmed).filter(Boolean).length >= 2
  );
}

function collectCompactPipeTableLine(
  lines: string[],
  startIndex: number,
): { line: string; endIndex: number } {
  let line = lines[startIndex] ?? "";
  let endIndex = startIndex;
  let cursor = startIndex + 1;

  while (cursor < lines.length) {
    const currentLine = lines[cursor] ?? "";
    const nextLine = lines[cursor + 1] ?? "";

    if (
      currentLine.trim() === "" &&
      isCompactPipeTableContinuationLine(nextLine)
    ) {
      line = `${line.trimEnd()} ${nextLine.trim()}`;
      endIndex = cursor + 1;
      cursor += 2;
      continue;
    }

    if (isCompactPipeTableContinuationLine(currentLine)) {
      line = `${line.trimEnd()} ${currentLine.trim()}`;
      endIndex = cursor;
      cursor += 1;
      continue;
    }

    break;
  }

  return { line, endIndex };
}

function countPatternMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function collectTextOutsideMarkdownFences(markdown: string): string {
  const outsideLines: string[] = [];
  let activeFence: { marker: "`" | "~"; markerLength: number } | null = null;

  for (const line of markdown.split("\n")) {
    const fenceMatch = MARKDOWN_FENCE_OPEN_PATTERN.exec(line);
    if (!activeFence && fenceMatch) {
      const markerRun = fenceMatch[2] || "";
      activeFence = {
        marker: markerRun.startsWith("~") ? "~" : "`",
        markerLength: markerRun.length,
      };
      continue;
    }

    if (activeFence) {
      if (fenceMatch) {
        const markerRun = fenceMatch[2] || "";
        const marker = markerRun.startsWith("~") ? "~" : "`";
        if (
          marker === activeFence.marker &&
          markerRun.length >= activeFence.markerLength &&
          line.trim() === markerRun
        ) {
          activeFence = null;
        }
      }
      continue;
    }

    outsideLines.push(line);
  }

  return outsideLines.join("\n");
}

function shouldNormalizeCollapsedMarkdownBlocks(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return false;
  }

  const outsideText = collectTextOutsideMarkdownFences(trimmed).trim();
  const hasInlineCollapsedFence = INLINE_COLLAPSED_FENCE_PATTERN.test(trimmed);
  INLINE_COLLAPSED_FENCE_PATTERN.lastIndex = 0;
  if (!outsideText && !hasInlineCollapsedFence) {
    return false;
  }

  const scanText = outsideText || trimmed;
  const lines = scanText.split("\n");
  const hasSparseLineBreaks =
    lines.length <= 2 || scanText.length / Math.max(lines.length, 1) > 800;
  const hasPartiallyCollapsedLine = lines.some(
    (line) =>
      line.length >= 72 && PARTIAL_COLLAPSED_MARKDOWN_LINE_PATTERN.test(line),
  );

  const collapsedSpacedHeadingCount = countPatternMatches(
    scanText,
    COLLAPSED_SPACED_HEADING_PATTERN,
  );
  const collapsedOrderedListCount = countPatternMatches(
    scanText,
    COLLAPSED_ORDERED_LIST_PATTERN,
  );
  const collapsedBulletListCount = countPatternMatches(
    scanText,
    COLLAPSED_BULLET_LIST_PATTERN,
  );
  const markerCount = [
    /(^|[^#])#{1,6}(?!#)\S/.test(scanText),
    collapsedSpacedHeadingCount > 0,
    /---#{1,6}(?!#)\S/.test(scanText),
    /[：:]\s*[-*+]\s+\S|`-\s*\S/.test(scanText),
    /[：:]\s*[1-9]\d{0,1}\.\s+\S/.test(scanText),
    collapsedOrderedListCount >= 2,
    collapsedBulletListCount >= 2,
    COMPACT_PIPE_TABLE_SEPARATOR_PATTERN.test(scanText),
    hasInlineCollapsedFence,
  ].filter(Boolean).length;

  INLINE_COLLAPSED_FENCE_PATTERN.lastIndex = 0;
  return (
    hasPartiallyCollapsedLine ||
    (hasSparseLineBreaks &&
      (markerCount >= 2 ||
        collapsedSpacedHeadingCount >= 2 ||
        collapsedOrderedListCount >= 2 ||
        collapsedBulletListCount >= 2))
  );
}

function normalizeCollapsedFenceBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/(\/(?:Users|home|var|tmp|opt|Applications)\b)/g, "\n$1")
    .replace(/^\n/, "");
}

function normalizeInlineCollapsedCodeFences(markdown: string): string {
  return markdown.replace(
    INLINE_COLLAPSED_FENCE_PATTERN,
    (_match, language: string, body: string) => {
      const normalizedLanguage = language.trim() || "text";
      const normalizedBody = normalizeCollapsedFenceBody(body);
      return `\n\n\`\`\`${normalizedLanguage}\n${normalizedBody}\n\`\`\`\n\n`;
    },
  );
}

function transformOutsideMarkdownFences(
  markdown: string,
  transform: (text: string) => string,
): string {
  const outputLines: string[] = [];
  let pendingOutsideLines: string[] = [];
  let activeFence: { marker: "`" | "~"; markerLength: number } | null = null;

  const flushOutsideLines = () => {
    if (pendingOutsideLines.length === 0) {
      return;
    }
    outputLines.push(transform(pendingOutsideLines.join("\n")));
    pendingOutsideLines = [];
  };

  for (const line of markdown.split("\n")) {
    const fenceMatch = MARKDOWN_FENCE_OPEN_PATTERN.exec(line);
    if (!activeFence && fenceMatch) {
      flushOutsideLines();
      const markerRun = fenceMatch[2] || "";
      activeFence = {
        marker: markerRun.startsWith("~") ? "~" : "`",
        markerLength: markerRun.length,
      };
      outputLines.push(line);
      continue;
    }

    if (activeFence) {
      outputLines.push(line);
      if (fenceMatch) {
        const markerRun = fenceMatch[2] || "";
        const marker = markerRun.startsWith("~") ? "~" : "`";
        if (
          marker === activeFence.marker &&
          markerRun.length >= activeFence.markerLength &&
          line.trim() === markerRun
        ) {
          activeFence = null;
        }
      }
      continue;
    }

    pendingOutsideLines.push(line);
  }

  flushOutsideLines();
  return outputLines.join("\n");
}

function normalizeCollapsedMarkdownTextBlocks(markdown: string): string {
  const withBlockBoundaries = markdown
    .replace(/---(?=#{1,6}(?!#)\s*\S)/g, "\n\n---\n\n")
    .replace(/([^\n#])(?=#{2,6}\s+\S)/g, "$1\n\n")
    .replace(/(^|[^A-Za-z0-9#\n])(?=#{1,6}(?!#)\S)/g, "$1\n\n")
    .replace(/(^|\n)(#{1,6})(?!#)(?=\S)/g, "$1$2 ")
    .replace(/(^|\n)(#{1,6}\s+\d+\.)(?=\S)/g, "$1$2 ")
    .replace(
      /(^|\n)(#{1,6}\s+[^\n*#]{2,64}?)(?=\*\*[\u3400-\u9fffA-Za-z0-9][^*\n]{0,32}[：:])/gu,
      "$1$2\n\n",
    )
    .replace(/(^|\n)(#{1,6}\s+[^\n#>]{2,90}?)(?=>\s*\S)/gu, "$1$2\n\n")
    .replace(
      /(^|\n)(#{1,6}\s+[^\n`#]{2,64}?)(?=`[^`\n])/gu,
      (_match, prefix: string, heading: string) => {
        const headingText = heading.replace(/^#{1,6}\s+/, "").trim();
        if (/^[1-9]\d{0,1}\.$/.test(headingText)) {
          return `${prefix}${heading}`;
        }
        return `${prefix}${heading}\n\n`;
      },
    )
    .replace(/([：:])(\|[^\n]*?\|\|[ \t:|-]{3,}\|\|)/g, "$1\n\n$2")
    .replace(COLLAPSED_MARKDOWN_TRAILING_TABLE_TEXT_PATTERN, "|\n\n");

  const normalized = normalizeCompactPipeTables(withBlockBoundaries)
    .replace(/\*\*([^*\n]{1,32}[：:])(?!\*)(?![^\n]{0,120}\*\*)/gu, "**$1**")
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9。！？.!?])(\*\*[^*\n]{1,32}[：:]\*\*)/gu,
      "\n\n$1",
    )
    .replace(
      /(^|\n)(\*\*[^*\n]{1,32}[：:]\*\*)[ \t]*(?=[\u3400-\u9fffA-Za-z0-9])/gu,
      "$1$2\n\n",
    )
    .replace(
      /(^|\n)([-*+]\s+)(\*\*[^*\n]{1,32}[：:]\*\*)[ \t]*(?=[\u3400-\u9fffA-Za-z0-9])/gu,
      "$1$2$3 ",
    )
    .replace(
      /(^|\n)(#{1,6}\s+[^\n#]{2,90}?)(?<=[\u3400-\u9fff）】》”’])([-*+])\s*(?=(?:\*\*)?(?:[\u3400-\u9fffA-Za-z0-9]|\[))/gu,
      "$1$2\n\n$3 ",
    )
    .replace(/([：:])\s*([1-9]\d{0,1}\.\s+)/g, "$1\n\n$2")
    .replace(
      /(?<=[\u3400-\u9fff，。！？；：,.!?;:)）】》”’\]])([1-9]\d{0,1}\.\s+\S)/gu,
      "\n\n$1",
    )
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9，。！？；：,.!?;:)）】》”’\]])\s+([1-9]\d{0,1}\.\s+\S)/gu,
      "\n\n$1",
    )
    .replace(/([：:])\s*([-+])\s*/g, "$1\n$2 ")
    .replace(/([：:])\s*(\*)(?!\*)\s*/g, "$1\n$2 ")
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9。！？.!?)）】》”’\]])([-+]|(?<!\*)\*(?!\*))\s+(?=(?:\*\*)?[\u3400-\u9fffA-Za-z][^\n]{2,})/gu,
      "\n$1 ",
    )
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9)）】》”’\]])([-+]|(?<!\*)\*(?!\*))(?=[\u3400-\u9fffA-Za-z][^，。！？；：,.!?;:\n]{0,24}[：:])/gu,
      "\n$1 ",
    )
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9。！？.!?)）】》”’\]])([-+])(?=[\u3400-\u9fff])/gu,
      "\n$1 ",
    )
    .replace(
      /(^|\n)([-*+]\s+)(\*\*[^*\n]{1,32}[：:]\*\*)[ \t]*(?=[\u3400-\u9fffA-Za-z0-9])/gu,
      "$1$2$3 ",
    )
    .replace(
      /(?<=[\u3400-\u9fffA-Za-z0-9)）】》”’\]])\s+((?:[-+]|(?<!\*)\*(?!\*))\s+\S)/gu,
      "\n$1",
    )
    .replace(/`-\s*/g, "`\n- ")
    .replace(/([：:])```/g, "$1\n\n```");

  const withHeadingProseBoundaries =
    normalizeCollapsedHeadingProseBoundaries(normalized);

  return normalizeRecoveredListNesting(
    withHeadingProseBoundaries.replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

type WordSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

type WordSegmenter = {
  segment(input: string): Iterable<WordSegment>;
};

type IntlWithWordSegmenter = typeof Intl & {
  Segmenter?: new (
    locale?: string | string[],
    options?: { granularity?: "word" },
  ) => WordSegmenter;
};

function getWordSegmentBoundaries(value: string): number[] {
  const SegmenterConstructor = (Intl as IntlWithWordSegmenter).Segmenter;
  if (!SegmenterConstructor) {
    return [];
  }

  const segmenter = new SegmenterConstructor(["zh", "en"], {
    granularity: "word",
  });
  const boundaries: number[] = [];

  for (const segment of segmenter.segment(value)) {
    const isWordLike =
      segment.isWordLike ?? /[\u3400-\u9fffA-Za-z0-9]/u.test(segment.segment);
    if (!isWordLike) {
      continue;
    }
    boundaries.push(segment.index + segment.segment.length);
  }

  return boundaries;
}

function findCollapsedHeadingProseBoundary(value: string): number | null {
  const trimmed = value.trim();
  if (
    trimmed.length < 28 ||
    !COLLAPSED_HEADING_PROSE_BODY_PATTERN.test(trimmed) ||
    /^(?:[1-9]\d{0,1}\.\s|[-*+]\s|>)/.test(trimmed)
  ) {
    return null;
  }

  for (const boundary of getWordSegmentBoundaries(trimmed).slice(1, 5)) {
    const title = trimmed.slice(0, boundary).trim();
    const body = trimmed.slice(boundary).trimStart();
    if (
      title.length >= 4 &&
      title.length <= 16 &&
      body.length >= 18 &&
      !COLLAPSED_HEADING_TITLE_FORBIDDEN_PATTERN.test(title) &&
      !COLLAPSED_HEADING_BODY_LEADING_FORBIDDEN_PATTERN.test(body) &&
      COLLAPSED_HEADING_PROSE_BODY_PATTERN.test(body)
    ) {
      return boundary;
    }
  }

  return null;
}

function normalizeCollapsedHeadingProseBoundaries(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const match = /^(\s{0,3}#{1,6}\s+)(\S[^\n]*)$/u.exec(line);
      if (!match) {
        return line;
      }

      const [, prefix, headingText] = match;
      const boundary = findCollapsedHeadingProseBoundary(headingText);
      if (boundary == null) {
        return line;
      }

      return `${prefix}${headingText.slice(0, boundary).trimEnd()}\n\n${headingText.slice(boundary).trimStart()}`;
    })
    .join("\n");
}

function normalizeRecoveredListNesting(markdown: string): string {
  const outputLines: string[] = [];
  let activeOrderedItem = false;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || MARKDOWN_HEADING_LINE_PATTERN.test(trimmed)) {
      activeOrderedItem = false;
      outputLines.push(line);
      continue;
    }

    if (MARKDOWN_ORDERED_LIST_LINE_PATTERN.test(trimmed)) {
      activeOrderedItem = true;
      outputLines.push(trimmed);
      continue;
    }

    if (
      activeOrderedItem &&
      MARKDOWN_UNORDERED_LIST_LINE_PATTERN.test(trimmed)
    ) {
      outputLines.push(`   ${trimmed}`);
      continue;
    }

    activeOrderedItem = false;
    outputLines.push(line);
  }

  return outputLines.join("\n");
}

function normalizeCollapsedMarkdownBlocks(markdown: string): string {
  if (!shouldNormalizeCollapsedMarkdownBlocks(markdown)) {
    return markdown;
  }

  const withCodeFences = normalizeInlineCollapsedCodeFences(markdown);
  return transformOutsideMarkdownFences(
    withCodeFences,
    normalizeCollapsedMarkdownTextBlocks,
  );
}

function normalizeInlineFollowUpListMarkers(markdown: string): string {
  if (!INLINE_FOLLOW_UP_ORDERED_MARKERS_PATTERN.test(markdown)) {
    return markdown;
  }

  return transformOutsideMarkdownFences(markdown, (text) =>
    text.replace(
      /(^|\n)([^\n]*[2-9]\d{0,1}\.\s+\S[^\n]*[3-9]\d{0,1}\.\s+\S[^\n]*)/gu,
      (_match, prefix: string, line: string) => {
        const trimmedLine = line.trim();
        if (/^1\.\s+/.test(trimmedLine)) {
          return `${prefix}${trimmedLine.replace(/\s+([2-9]\d{0,1}\.\s+)/g, "\n$1")}`;
        }
        return `${prefix}- ${trimmedLine.replace(/\s*[2-9]\d{0,1}\.\s+/g, "\n- ")}`;
      },
    ),
  );
}

function normalizeCompactPipeTables(markdown: string): string {
  if (!COMPACT_PIPE_TABLE_SEPARATOR_PATTERN.test(markdown)) {
    return markdown;
  }

  let activeFenceMarker: "`" | "~" | null = null;
  const lines = markdown.split("\n");
  const outputLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = MARKDOWN_FENCE_LINE_PATTERN.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.startsWith("~") ? "~" : "`";
      activeFenceMarker = activeFenceMarker === marker ? null : marker;
      outputLines.push(line);
      continue;
    }

    if (activeFenceMarker) {
      outputLines.push(line);
      continue;
    }

    if (COMPACT_PIPE_TABLE_SEPARATOR_PATTERN.test(line)) {
      const collected = collectCompactPipeTableLine(lines, index);
      const normalizedLine = normalizeCompactPipeTableLine(collected.line);
      if (normalizedLine !== collected.line) {
        outputLines.push(normalizedLine);
        index = collected.endIndex;
        continue;
      }
    }

    outputLines.push(normalizeCompactPipeTableLine(line));
  }

  return outputLines.join("\n");
}

function isMarkdownFenceInfo(info: string | undefined): boolean {
  const normalized = (info || "").trim().toLowerCase();
  return (
    normalized === "md" || normalized === "markdown" || normalized === "gfm"
  );
}

function isMarkdownTableDelimiterCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

function stripBlockquotePrefix(line: string): string {
  return line.replace(/^\s*>\s?/, "");
}

function containsMarkdownTable(markdown: string): boolean {
  const lines = markdown.split("\n").map(stripBlockquotePrefix);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerCells = parsePipeTableCells(lines[index] || "");
    const delimiterCells = parsePipeTableCells(lines[index + 1] || "");
    if (
      headerCells.filter(Boolean).length >= 2 &&
      delimiterCells.length >= headerCells.length &&
      delimiterCells.every(isMarkdownTableDelimiterCell)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeMarkdownTableFences(markdown: string): string {
  if (!markdown.includes("```") && !markdown.includes("~~~")) {
    return markdown;
  }

  const lines = markdown.split("\n");
  const outputLines: string[] = [];
  let activeFence: {
    marker: "`" | "~";
    markerLength: number;
    openLine: string;
    isMarkdown: boolean;
    contentLines: string[];
  } | null = null;

  for (const line of lines) {
    const fenceMatch = MARKDOWN_FENCE_OPEN_PATTERN.exec(line);
    if (!activeFence) {
      if (fenceMatch) {
        const markerRun = fenceMatch[2] || "";
        const marker = markerRun.startsWith("~") ? "~" : "`";
        activeFence = {
          marker,
          markerLength: markerRun.length,
          openLine: line,
          isMarkdown: isMarkdownFenceInfo(fenceMatch[3]),
          contentLines: [],
        };
        continue;
      }

      outputLines.push(line);
      continue;
    }

    if (fenceMatch) {
      const markerRun = fenceMatch[2] || "";
      const marker = markerRun.startsWith("~") ? "~" : "`";
      const isClosingFence =
        marker === activeFence.marker &&
        markerRun.length >= activeFence.markerLength &&
        line.trim() === markerRun;

      if (isClosingFence) {
        const content = activeFence.contentLines.join("\n");
        if (activeFence.isMarkdown && containsMarkdownTable(content)) {
          outputLines.push(...activeFence.contentLines);
        } else {
          outputLines.push(
            activeFence.openLine,
            ...activeFence.contentLines,
            line,
          );
        }
        activeFence = null;
        continue;
      }
    }

    activeFence.contentLines.push(line);
  }

  if (activeFence) {
    outputLines.push(activeFence.openLine, ...activeFence.contentLines);
  }

  return outputLines.join("\n");
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(
  ({
    content,
    baseFilePath,
    onA2UISubmit,
    renderA2UIInline = true,
    readOnlyA2UI = false,
    collapseCodeBlocks = false,
    shouldCollapseCodeBlock,
    onCodeBlockClick,
    isStreaming = false,
    showBlockActions = false,
    onQuoteContent,
    renderMode = "standard",
  }) => {
    const { t } = useTranslation("agent");
    const [copied, setCopied] = React.useState<string | null>(null);
    const [bundleImageOverrides, setBundleImageOverrides] = React.useState<
      Record<string, string>
    >({});
    const copyTimeoutRef = React.useRef<number | null>(null);
    const blockRef = React.useRef<HTMLDivElement | null>(null);
    const selectionSnapshotRef = React.useRef<string | null>(null);
    const useLightweightStreamingRender =
      isStreaming && content.length >= STREAMING_LIGHT_RENDER_THRESHOLD;
    const useLightweightMarkdownRender =
      renderMode === "light" || useLightweightStreamingRender;
    const debouncedStreamingContent = useDebouncedValue(
      content,
      useLightweightStreamingRender
        ? STREAMING_LIGHT_RENDER_DEBOUNCE_MS
        : STREAMING_STANDARD_RENDER_DEBOUNCE_MS,
      {
        maxWait: useLightweightStreamingRender
          ? STREAMING_LIGHT_RENDER_DEBOUNCE_MS
          : STREAMING_STANDARD_RENDER_DEBOUNCE_MS,
      },
    );
    const renderContent = isStreaming ? debouncedStreamingContent : content;

    const remarkPlugins = React.useMemo(
      () =>
        useLightweightMarkdownRender ? [remarkGfm] : [remarkGfm, remarkMath],
      [useLightweightMarkdownRender],
    );

    const rehypePlugins = React.useMemo(
      () => (useLightweightMarkdownRender ? [] : [rehypeRaw, rehypeKatex]),
      [useLightweightMarkdownRender],
    );
    const hasRemoteImageReferences = React.useMemo(
      () => /https?:\/\//i.test(content),
      [content],
    );

    React.useEffect(() => {
      const metaPath = resolveMarkdownBundleMetaPath(baseFilePath);
      if (!metaPath || !hasRemoteImageReferences) {
        setBundleImageOverrides((previous) =>
          Object.keys(previous).length === 0 ? previous : {},
        );
        return;
      }

      let cancelled = false;
      void (async () => {
        try {
          const preview = await readFilePreview(
            metaPath,
            MARKDOWN_BUNDLE_META_MAX_SIZE,
          );
          if (cancelled) {
            return;
          }

          if (
            preview.error ||
            preview.isBinary ||
            typeof preview.content !== "string"
          ) {
            setBundleImageOverrides({});
            return;
          }

          setBundleImageOverrides(
            parseMarkdownBundleImageOverrides(preview.content),
          );
        } catch {
          if (!cancelled) {
            setBundleImageOverrides({});
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [baseFilePath, hasRemoteImageReferences]);

    const resolveImageSrc = React.useCallback(
      (src?: string | null) => {
        if (typeof src !== "string") {
          return "";
        }
        const normalizedSrc = src.trim();
        const overriddenSrc =
          bundleImageOverrides[normalizedSrc] || normalizedSrc;
        return resolveMarkdownImageSrc(overriddenSrc, baseFilePath);
      },
      [baseFilePath, bundleImageOverrides],
    );

    React.useEffect(() => {
      return () => {
        if (copyTimeoutRef.current !== null) {
          window.clearTimeout(copyTimeoutRef.current);
        }
      };
    }, []);

    const handleCopy = React.useCallback(
      async (copyKey: string, value: string) => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(copyKey);
          if (copyTimeoutRef.current !== null) {
            window.clearTimeout(copyTimeoutRef.current);
          }
          copyTimeoutRef.current = window.setTimeout(
            () => setCopied(null),
            1200,
          );
        } catch {
          // 剪贴板在受限上下文里可能不可用，这里保持静默降级。
        }
      },
      [],
    );

    const getSelectedMarkdownText = React.useCallback(() => {
      const block = blockRef.current;
      const selection = window.getSelection();
      if (
        !block ||
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed
      ) {
        return null;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        return null;
      }

      const range = selection.getRangeAt(0);
      if (!block.contains(range.commonAncestorContainer)) {
        return null;
      }

      const isWithinControls = (node: Node | null) => {
        if (!node) {
          return false;
        }

        const element = node instanceof Element ? node : node.parentElement;
        return Boolean(
          element?.closest(
            "[data-markdown-block-actions], [data-markdown-code-action]",
          ),
        );
      };

      if (
        isWithinControls(selection.anchorNode) ||
        isWithinControls(selection.focusNode)
      ) {
        return null;
      }

      return selectedText;
    }, []);

    const normalizedContent = React.useMemo(() => content.trim(), [content]);
    const canShowBlockActions = showBlockActions && Boolean(normalizedContent);
    const isContentCopied = copied?.startsWith("content:") ?? false;
    const copiedLabel = t("agentChat.markdown.code.copied");
    const copyLabel = t("agentChat.markdown.code.copy");
    const copyCodeBlockLabel = t("agentChat.markdown.code.copyBlock");
    const getCodeLineCountLabel = React.useCallback(
      (codeContent: string) =>
        t("agentChat.markdown.code.lineCount", {
          count: codeContent.length > 0 ? codeContent.split("\n").length : 0,
        }),
      [t],
    );
    const renderCodeHeaderInfo = React.useCallback(
      (language: string, codeContent: string) => (
        <CodeHeaderInfo>
          <CodeLanguageLabel>{language}</CodeLanguageLabel>
          <CodeLineCount>{getCodeLineCountLabel(codeContent)}</CodeLineCount>
        </CodeHeaderInfo>
      ),
      [getCodeLineCountLabel],
    );
    const imageOpenTitle = t("agentChat.markdown.image.openTitle");
    const imageCaption = t("agentChat.markdown.image.caption");
    const quoteContentBlockLabel = t("agentChat.markdown.block.quote");
    const copyContentBlockLabel = t("agentChat.markdown.block.copy");
    const shouldBlockBrowserImagePreview = React.useCallback(
      (source: string) => {
        if (!hasDesktopHostImagePreviewBoundary()) {
          return false;
        }

        console.error(
          "[MarkdownRenderer] Desktop Host image preview cannot fall back to browser window",
          source,
        );
        return true;
      },
      [],
    );
    const handleQuoteContent = React.useCallback(() => {
      if (!onQuoteContent) {
        return;
      }

      const selectedText =
        getSelectedMarkdownText() ?? selectionSnapshotRef.current ?? undefined;
      selectionSnapshotRef.current = null;
      onQuoteContent(
        selectedText?.trim().length ? selectedText : normalizedContent,
      );
    }, [getSelectedMarkdownText, normalizedContent, onQuoteContent]);

    const handleCopyContent = React.useCallback(async () => {
      const selectedText =
        getSelectedMarkdownText() ?? selectionSnapshotRef.current ?? undefined;
      selectionSnapshotRef.current = null;
      const copyValue = selectedText?.trim().length
        ? selectedText
        : normalizedContent;
      if (!copyValue) {
        return;
      }
      await handleCopy(`content:${copyValue}`, copyValue);
    }, [getSelectedMarkdownText, handleCopy, normalizedContent]);

    // 预处理内容：检测并提取 base64 图片
    const processedContent = React.useMemo(() => {
      // 匹配 markdown 图片语法中的 base64 data URL
      const base64ImageRegex =
        /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
      let result = renderContent;
      const images: { alt: string; src: string; placeholder: string }[] = [];

      let match;
      let index = 0;
      while ((match = base64ImageRegex.exec(renderContent)) !== null) {
        const placeholder = `__BASE64_IMAGE_${index}__`;
        images.push({
          alt: match[1] || "Generated Image",
          src: match[2],
          placeholder,
        });
        result = result.replace(match[0], placeholder);
        index++;
      }

      return {
        text: normalizeCompactPipeTables(
          normalizeMarkdownTableFences(
            normalizeInlineFollowUpListMarkers(
              normalizeCollapsedMarkdownBlocks(result),
            ),
          ),
        ),
        images,
      };
    }, [renderContent]);

    // 渲染 base64 图片
    const renderBase64Images = () => {
      if (processedContent.images.length === 0) return null;

      return processedContent.images.map((img, idx) => {
        const handleImageClick = () => {
          if (shouldBlockBrowserImagePreview(img.src)) {
            return;
          }

          const newWindow = window.open();
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head>
                  <title>${img.alt}</title>
                  <style>
                    body { 
                      margin: 0; 
                      display: flex; 
                      justify-content: center; 
                      align-items: center; 
                      min-height: 100vh; 
                      background: #1a1a1a; 
                    }
                    img { 
                      max-width: 100%; 
                      max-height: 100vh; 
                      object-fit: contain; 
                    }
                  </style>
                </head>
                <body>
                  <img src="${img.src}" alt="${img.alt}" />
                </body>
              </html>
            `);
            newWindow.document.close();
          }
        };

        return (
          <ImageContainer key={`base64-img-${idx}`}>
            <GeneratedImage
              src={img.src}
              alt={img.alt}
              onClick={handleImageClick}
              title={imageOpenTitle}
              onError={(e) => {
                console.error("[MarkdownRenderer] 图片加载失败:", img.alt);
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <ImageCaption>{imageCaption}</ImageCaption>
          </ImageContainer>
        );
      });
    };

    // 检查处理后的文本是否只包含占位符
    const hasOnlyPlaceholders = React.useMemo(() => {
      const trimmed = processedContent.text.trim();
      return /^(__BASE64_IMAGE_\d+__\s*)+$/.test(trimmed) || trimmed === "";
    }, [processedContent.text]);

    const renderPlainTextCodeBlock = React.useCallback(
      (language: string, codeContent: string) => {
        const copyKey = `code:${codeContent}`;
        const isCopied = copied === copyKey;

        return (
          <CodeBlockContainer data-testid="markdown-plain-code-block">
            <CodeHeader>
              {renderCodeHeaderInfo(language, codeContent)}
              <CopyButton
                type="button"
                data-markdown-code-action
                onClick={() => void handleCopy(copyKey, codeContent)}
                aria-label={copyCodeBlockLabel}
                title={isCopied ? copiedLabel : copyLabel}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                {isCopied ? copiedLabel : copyLabel}
              </CopyButton>
            </CodeHeader>
            <div className="overflow-auto px-3 py-3">
              <div
                data-testid="markdown-plain-code-content"
                className="whitespace-pre-wrap break-words text-[12px] leading-6 text-slate-700"
                style={{
                  margin: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  fontFamily: CODE_FONT_FAMILY,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  textShadow: "none",
                  fontVariantLigatures: "none",
                }}
              >
                {codeContent}
              </div>
            </div>
          </CodeBlockContainer>
        );
      },
      [
        copied,
        copiedLabel,
        copyCodeBlockLabel,
        copyLabel,
        handleCopy,
        renderCodeHeaderInfo,
      ],
    );

    const renderFlowCodeBlock = React.useCallback(
      (language: string, codeContent: string) => {
        const copyKey = `code:${codeContent}`;
        const isCopied = copied === copyKey;
        const lines = codeContent
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        return (
          <CodeBlockContainer data-testid="markdown-flow-code-block">
            <CodeHeader>
              {renderCodeHeaderInfo(language, codeContent)}
              <CopyButton
                type="button"
                data-markdown-code-action
                onClick={() => void handleCopy(copyKey, codeContent)}
                aria-label={copyCodeBlockLabel}
                title={isCopied ? copiedLabel : copyLabel}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                {isCopied ? copiedLabel : copyLabel}
              </CopyButton>
            </CodeHeader>
            <div className="space-y-1.5 px-3 py-3">
              {lines.map((line, index) =>
                FLOW_ARROW_ONLY_PATTERN.test(line) ? (
                  <div
                    key={`${line}:${index}`}
                    className="pl-3 text-sm leading-5 text-slate-500"
                    style={{
                      fontFamily: CODE_FONT_FAMILY,
                      textShadow: "none",
                      fontVariantLigatures: "none",
                    }}
                  >
                    {line}
                  </div>
                ) : (
                  <div
                    key={`${line}:${index}`}
                    className="inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[12px] leading-5 text-slate-700 shadow-sm"
                    style={{
                      fontFamily: CODE_FONT_FAMILY,
                      textShadow: "none",
                      fontVariantLigatures: "none",
                    }}
                  >
                    {line}
                  </div>
                ),
              )}
            </div>
          </CodeBlockContainer>
        );
      },
      [
        copied,
        copiedLabel,
        copyCodeBlockLabel,
        copyLabel,
        handleCopy,
        renderCodeHeaderInfo,
      ],
    );

    return (
      <MarkdownBlockShell ref={blockRef}>
        {canShowBlockActions ? (
          <MarkdownBlockActions data-markdown-block-actions>
            {onQuoteContent ? (
              <MarkdownBlockActionButton
                type="button"
                onMouseDown={() => {
                  selectionSnapshotRef.current = getSelectedMarkdownText();
                }}
                onTouchStart={() => {
                  selectionSnapshotRef.current = getSelectedMarkdownText();
                }}
                onClick={handleQuoteContent}
                aria-label={quoteContentBlockLabel}
                title={quoteContentBlockLabel}
              >
                <Quote size={14} />
              </MarkdownBlockActionButton>
            ) : null}
            <MarkdownBlockActionButton
              type="button"
              onMouseDown={() => {
                selectionSnapshotRef.current = getSelectedMarkdownText();
              }}
              onTouchStart={() => {
                selectionSnapshotRef.current = getSelectedMarkdownText();
              }}
              onClick={() => void handleCopyContent()}
              aria-label={copyContentBlockLabel}
              title={isContentCopied ? copiedLabel : copyContentBlockLabel}
            >
              {isContentCopied ? <Check size={14} /> : <Copy size={14} />}
            </MarkdownBlockActionButton>
          </MarkdownBlockActions>
        ) : null}
        <MarkdownContainer>
          {renderBase64Images()}

          {!hasOnlyPlaceholders && processedContent.text.trim() && (
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              skipHtml={useLightweightMarkdownRender}
              components={{
                // 使用 pre 组件来处理代码块，以便更好地控制 a2ui 的渲染
                pre({ children, ...props }: any) {
                  // ReactMarkdown 传递的 children 是一个 React 元素
                  // 需要通过 React.Children 来正确访问
                  const child = React.Children.toArray(
                    children,
                  )[0] as React.ReactElement;
                  if (!child || !React.isValidElement(child)) {
                    return <pre {...props}>{children}</pre>;
                  }

                  const childProps = child.props as any;
                  const className = childProps?.className || "";
                  const rawLanguage = extractCodeLanguageToken(className);
                  const language = normalizeCodeLanguage(rawLanguage);
                  const codeChildren = childProps?.children;
                  const codeContent = String(
                    Array.isArray(codeChildren)
                      ? codeChildren.join("")
                      : codeChildren || "",
                  ).replace(/\n$/, "");

                  // 如果是 a2ui 代码块，特殊处理
                  if (language === "a2ui") {
                    if (!renderA2UIInline) {
                      return null;
                    }

                    const parsed = parseA2UIJson(codeContent);

                    if (parsed) {
                      const response = readOnlyA2UI
                        ? { ...parsed, submitAction: undefined }
                        : parsed;
                      // 解析成功，直接渲染 A2UI 组件（不包裹在 pre 中）
                      return (
                        <A2UITaskCard
                          response={response}
                          onSubmit={readOnlyA2UI ? undefined : onA2UISubmit}
                          preset={CHAT_A2UI_TASK_CARD_PRESET}
                          compact={true}
                          className="max-w-[432px]"
                          preview={readOnlyA2UI}
                        />
                      );
                    } else {
                      // 解析失败（可能是流式输出中，JSON 还不完整）
                      return (
                        <A2UITaskLoadingCard
                          preset={CHAT_A2UI_TASK_CARD_PRESET}
                          subtitle={t("agentChat.markdown.a2ui.parsing")}
                          compact={true}
                          className="max-w-[432px]"
                        />
                      );
                    }
                  }

                  // 如果启用了代码块折叠，显示占位符卡片
                  const shouldRenderArtifactPlaceholder =
                    collapseCodeBlocks &&
                    (shouldCollapseCodeBlock
                      ? shouldCollapseCodeBlock(rawLanguage, codeContent)
                      : true);

                  if (shouldRenderArtifactPlaceholder) {
                    const lineCount = codeContent.split("\n").length;
                    return (
                      <ArtifactPlaceholder
                        language={rawLanguage}
                        lineCount={isStreaming ? undefined : lineCount}
                        isStreaming={isStreaming}
                        onClick={() =>
                          onCodeBlockClick?.(rawLanguage, codeContent)
                        }
                      />
                    );
                  }

                  if (useLightweightMarkdownRender) {
                    return (
                      <pre {...props}>
                        <code className={className}>{codeContent}</code>
                      </pre>
                    );
                  }

                  const presentationMode = resolveCodePresentationMode(
                    language,
                    codeContent,
                  );
                  if (presentationMode === "flow") {
                    return renderFlowCodeBlock(language, codeContent);
                  }
                  if (presentationMode === "plain") {
                    return renderPlainTextCodeBlock(language, codeContent);
                  }

                  // Block code - 完整显示
                  const copyKey = `code:${codeContent}`;
                  const isCopied = copied === copyKey;

                  return (
                    <CodeBlockContainer data-testid="markdown-syntax-code-block">
                      <CodeHeader>
                        {renderCodeHeaderInfo(language, codeContent)}
                        <CopyButton
                          type="button"
                          data-markdown-code-action
                          onClick={() => void handleCopy(copyKey, codeContent)}
                          aria-label={copyCodeBlockLabel}
                          title={isCopied ? copiedLabel : copyLabel}
                        >
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                          {isCopied ? copiedLabel : copyLabel}
                        </CopyButton>
                      </CodeHeader>
                      <SyntaxHighlighter
                        style={oneLight}
                        language={language}
                        PreTag="div"
                        codeTagProps={{
                          style: {
                            display: "block",
                            fontFamily: CODE_FONT_FAMILY,
                            fontVariantLigatures: "none",
                            padding: 0,
                            border: "none",
                            borderRadius: 0,
                            background: "transparent",
                            color: "inherit",
                            textShadow: "none",
                          },
                        }}
                        customStyle={{
                          margin: 0,
                          padding: "12px 14px 14px",
                          background: "transparent",
                          fontSize: "12.5px",
                          lineHeight: "1.55",
                          fontFamily: CODE_FONT_FAMILY,
                          overflowX: "auto",
                          maxWidth: "100%",
                          textShadow: "none",
                          fontVariantLigatures: "none",
                        }}
                      >
                        {codeContent}
                      </SyntaxHighlighter>
                    </CodeBlockContainer>
                  );
                },
                code({ inline, className, children, ...props }: any) {
                  const content = String(
                    Array.isArray(children)
                      ? children.join("")
                      : children || "",
                  );
                  const isInlineCode =
                    typeof inline === "boolean"
                      ? inline
                      : !className && !content.includes("\n");

                  if (isInlineCode) {
                    return (
                      <code
                        className={className}
                        data-inline-code="true"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  // 非 inline code 统一由 pre 组件处理，避免块级元素落入 <p>
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                a({ href, children, ...props }: any) {
                  const { onAuxClick, onClick, rel, ...anchorProps } = props;
                  const externalHref = typeof href === "string" ? href : "";
                  const linkRel = resolveHttpExternalHref(externalHref)
                    ? "noreferrer noopener"
                    : rel;
                  const handleClick = (
                    event: React.MouseEvent<HTMLAnchorElement>,
                  ) => {
                    onClick?.(event);
                    if (!event.defaultPrevented) {
                      interceptHttpExternalLinkClick(event, externalHref);
                    }
                  };
                  const handleAuxClick = (
                    event: React.MouseEvent<HTMLAnchorElement>,
                  ) => {
                    onAuxClick?.(event);
                    if (!event.defaultPrevented) {
                      interceptHttpExternalLinkClick(event, externalHref);
                    }
                  };

                  return (
                    <a
                      {...anchorProps}
                      href={href}
                      rel={linkRel}
                      onClick={handleClick}
                      onAuxClick={handleAuxClick}
                    >
                      {children}
                    </a>
                  );
                },
                // 普通图片渲染（非 base64）
                img({ src, alt, ...props }: any) {
                  // base64 图片已经在上面单独处理了，这里只处理普通 URL 图片
                  if (src?.startsWith("data:")) {
                    return null; // 跳过 base64 图片，已在上面处理
                  }
                  const resolvedSrc = resolveImageSrc(src);

                  const handleImageClick = (
                    event: React.MouseEvent<HTMLImageElement>,
                  ) => {
                    if (
                      !interceptHttpExternalLinkClick(event, resolvedSrc) &&
                      resolvedSrc
                    ) {
                      if (shouldBlockBrowserImagePreview(resolvedSrc)) {
                        event.preventDefault();
                        return;
                      }

                      window.open(resolvedSrc, "_blank");
                    }
                  };

                  return (
                    <GeneratedImage
                      src={resolvedSrc}
                      alt={alt || "Image"}
                      onClick={handleImageClick}
                      title={imageOpenTitle}
                      {...props}
                    />
                  );
                },
                h1({ children, ...props }: any) {
                  return (
                    <h1 data-markdown-heading-level="1" {...props}>
                      {children}
                    </h1>
                  );
                },
                h2({ children, ...props }: any) {
                  return (
                    <h2 data-markdown-heading-level="2" {...props}>
                      {children}
                    </h2>
                  );
                },
                h3({ children, ...props }: any) {
                  return (
                    <h3 data-markdown-heading-level="3" {...props}>
                      {children}
                    </h3>
                  );
                },
                blockquote({ children }: any) {
                  return (
                    <MarkdownQuoteCard data-testid="markdown-blockquote-card">
                      <MarkdownQuoteInner>
                        <MarkdownQuoteIconShell aria-hidden="true">
                          <Quote size={15} />
                        </MarkdownQuoteIconShell>
                        <MarkdownQuoteBody>{children}</MarkdownQuoteBody>
                      </MarkdownQuoteInner>
                    </MarkdownQuoteCard>
                  );
                },
                hr() {
                  return <MarkdownDivider data-testid="markdown-divider" />;
                },
                table({ children, ...props }: any) {
                  return (
                    <MarkdownTableScroll data-testid="markdown-table-scroll">
                      <table {...props}>{children}</table>
                    </MarkdownTableScroll>
                  );
                },
              }}
            >
              {processedContent.text}
            </ReactMarkdown>
          )}
        </MarkdownContainer>
      </MarkdownBlockShell>
    );
  },
);

MarkdownRenderer.displayName = "MarkdownRenderer";
