import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { cn } from "@/lib/utils";
import { skillsApi } from "@/lib/api/skills";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import { ToolSearchSummaryPanel } from "./ToolSearchSummaryPanel";
import {
  extractLimeToolMetadataBlock,
  normalizeToolResultImages,
} from "../hooks/agentChatToolResult";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { SiteSavedContentTarget } from "../types";
import {
  buildToolHeadline,
  getToolDisplayInfo,
  normalizeToolNameKey,
  parseToolCallArguments,
  resolveToolFilePath,
  resolveToolPrimarySubject,
} from "../utils/toolDisplayInfo";
import {
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
} from "../utils/searchResultPreview";
import {
  normalizeSiteToolResultSummary,
  resolveSiteProjectTargetLabel,
  resolveSiteSavedContentTargetDisplayName,
  resolveSiteSavedContentTargetRelativePath,
  resolveSiteSavedContentTargetFromMetadata,
} from "../utils/siteToolResultSummary";
import {
  normalizeToolSearchResultSummary,
  resolveUserFacingToolSearchItemLabel,
} from "../utils/toolSearchResultSummary";
import {
  resolveToolErrorDetailText,
  resolveToolProcessNarrative,
  isLikelyWebRetrievalDiagnosticNoise,
} from "../utils/toolProcessSummary";
import {
  isLimeTaskProtocolFailure,
  resolveLimeTaskProtocolFailureDisplayText,
} from "../utils/limeTaskProtocolNoise";
import { resolveImportedSourceToolPresentation } from "./ToolCallDisplayViewModel";

interface InlineToolProcessStepProps {
  toolCall: ToolCallState;
  grouped?: boolean;
  groupMarker?: string;
  isMessageStreaming?: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(
  record: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown> | null,
  keys: string[],
): boolean | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function summarizeResultText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const singleLine = trimmed.replace(/\s+/g, " ");
  if (singleLine.length <= 180) {
    return singleLine;
  }
  return `${singleLine.slice(0, 180).trim()}...`;
}

const LARGE_RESULT_AUTO_COLLAPSE_CHARS = 1200;
const STRUCTURED_DETAIL_TEXT_KEYS = [
  "markdown",
  "markdownContent",
  "markdown_content",
  "contentMarkdown",
  "content_markdown",
  "bodyMarkdown",
  "body_markdown",
  "content",
  "text",
  "body",
  "summary",
  "description",
  "output",
] as const;
const STRUCTURED_DETAIL_OBJECT_KEYS = [
  "result",
  "data",
  "page",
  "article",
  "document",
  "content",
] as const;
const TASK_BOARD_TOOL_NAMES = new Set([
  "taskcreate",
  "tasklist",
  "taskget",
  "taskupdate",
]);

function sanitizeToolResultDetailMarkdown(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseStructuredToolResult(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function readArray(
  record: Record<string, unknown> | null,
  keys: string[],
): unknown[] | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function taskRecordFrom(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}

function readTaskSubject(
  record: Record<string, unknown> | null,
): string | null {
  return readString(record, ["subject", "content", "title", "description"]);
}

function readTaskStatus(record: Record<string, unknown> | null): string | null {
  return readString(record, ["status", "state"]);
}

function readTaskId(record: Record<string, unknown> | null): string | null {
  return readString(record, ["id", "taskId", "task_id"]);
}

function formatTaskLine(record: Record<string, unknown>): string | null {
  const id = readTaskId(record);
  const subject = readTaskSubject(record);
  const status = readTaskStatus(record);
  const label = [id ? `#${id}` : null, subject].filter(Boolean).join(" ");
  const main = label || status;
  if (!main) {
    return null;
  }
  return status && label ? `${main} · ${status}` : main;
}

function resolveTaskBoardResultDetailText(params: {
  toolName: string;
  outputText: string;
  metadata: Record<string, unknown> | null;
  fallbackSummary: string | null;
}): string | null {
  const normalizedName = normalizeToolNameKey(params.toolName);
  if (!TASK_BOARD_TOOL_NAMES.has(normalizedName)) {
    return null;
  }

  const parsedOutput = parseStructuredToolResult(params.outputText);
  const outputRecord = asRecord(parsedOutput);
  const metadata = params.metadata;
  const task =
    taskRecordFrom(metadata?.task) || taskRecordFrom(outputRecord?.task);
  const tasks =
    readArray(metadata, ["tasks", "task_list"]) ||
    readArray(outputRecord, ["tasks", "task_list"]);
  const lines: string[] = [];

  if (task) {
    const taskLine = formatTaskLine(task);
    if (taskLine) {
      lines.push(taskLine);
    }
  }

  if (!task && normalizedName === "taskget") {
    lines.push("未找到任务");
  }

  if (tasks) {
    const taskLines = tasks
      .map((item) => taskRecordFrom(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map(formatTaskLine)
      .filter((item): item is string => Boolean(item));
    if (taskLines.length > 0) {
      lines.push(...taskLines.slice(0, 5));
      if (taskLines.length > 5) {
        lines.push(`还有 ${taskLines.length - 5} 个任务`);
      }
    } else if (normalizedName === "tasklist") {
      lines.push("任务列表为空");
    }
  }

  const summary = params.fallbackSummary?.trim();
  if (summary && !lines.includes(summary)) {
    lines.unshift(summary);
  }

  return lines.length > 0 ? lines.join("\n") : summary || null;
}

function extractStructuredToolDetailText(
  value: unknown,
  visited = new Set<unknown>(),
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractStructuredToolDetailText(item, visited))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.slice(0, 3).join("\n\n") : null;
  }

  const record = value as Record<string, unknown>;
  for (const key of STRUCTURED_DETAIL_TEXT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const key of STRUCTURED_DETAIL_OBJECT_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const candidate = extractStructuredToolDetailText(nested, visited);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function normalizeToolResultDetailText(value: string): string {
  const parsed = parseStructuredToolResult(value);
  if (!parsed) {
    return value;
  }

  return extractStructuredToolDetailText(parsed) || value;
}

function summarizeToolSearchPreview(
  value: ReturnType<typeof normalizeToolSearchResultSummary>,
): string | null {
  if (!value) {
    return null;
  }

  const toolNames = value.tools
    .slice(0, 2)
    .map((item) => resolveUserFacingToolSearchItemLabel(item.name))
    .filter(Boolean);
  const prefix = `找到工具 ${value.count} 个`;

  if (toolNames.length === 0) {
    return prefix;
  }

  return `${prefix} · ${toolNames.join(" · ")}`;
}

function summarizeSearchResultPreview(resultCount: number): string | null {
  if (resultCount <= 0) {
    return null;
  }

  return `找到 ${resultCount} 条搜索结果`;
}

function summarizeDiagnosticResultPreview(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parseStructuredToolResult(trimmed);
  const record = asRecord(parsed);
  const webSearchMetadata = asRecord(record?.metadata)?.web_search;
  const webSearchRecord = asRecord(webSearchMetadata);
  const attempts = Array.isArray(webSearchRecord?.attempts)
    ? webSearchRecord.attempts
    : [];
  const firstAttempt = asRecord(attempts[0]);
  const firstAttemptError = readString(firstAttempt, ["error", "message"]);

  if (firstAttemptError) {
    return `搜索诊断：${summarizeResultText(firstAttemptError)}`;
  }

  const message =
    readString(record, ["error", "message", "detail", "output"]) ||
    extractStructuredToolDetailText(parsed);

  return message
    ? `搜索诊断：${summarizeResultText(message)}`
    : "搜索诊断已收起";
}

function normalizeSummaryLine(
  value: string | null,
  headline: string,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const normalizedHeadline = headline.trim();
  if (normalized === normalizedHeadline) {
    return null;
  }

  return normalized;
}

function buildSiteNoticeLines(toolCall: ToolCallState): string[] {
  const summary = normalizeSiteToolResultSummary(toolCall.result?.metadata);
  if (!summary) {
    return [];
  }

  const lines: string[] = [];
  const savedProjectId =
    summary.savedProjectId || summary.savedContent?.projectId || "";
  const savedProjectTarget = resolveSiteProjectTargetLabel({
    source: summary.savedBy,
    projectId: savedProjectId || undefined,
  });

  if (summary.savedContent?.title) {
    lines.push(`已保存到${savedProjectTarget}：${summary.savedContent.title}`);
  }

  if (summary.savedContent?.markdownRelativePath) {
    lines.push("已导出 Markdown 文稿");
  }

  if (typeof summary.savedContent?.imageCount === "number") {
    lines.push(`附带图片 ${summary.savedContent.imageCount} 张`);
  }

  if (summary.saveSkippedProjectId) {
    const skippedProjectTarget = resolveSiteProjectTargetLabel({
      source: summary.saveSkippedBy,
      projectId: summary.saveSkippedProjectId,
    });
    lines.push(`未保存到${skippedProjectTarget}`);
  }

  if (summary.saveErrorMessage) {
    lines.push(`自动保存失败：${summary.saveErrorMessage}`);
  }

  return lines;
}

export const InlineToolProcessStep: React.FC<InlineToolProcessStepProps> = ({
  toolCall,
  grouped = false,
  groupMarker = "•",
  isMessageStreaming = false,
  onFileClick,
  onOpenSavedSiteContent,
}) => {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(false);
  const [skillContentExpanded, setSkillContentExpanded] = useState(false);
  const [fetchedSkillContent, setFetchedSkillContent] = useState<string | null>(
    null,
  );
  const [skillContentLoading, setSkillContentLoading] = useState(false);
  const [skillContentError, setSkillContentError] = useState<string | null>(
    null,
  );
  const [skillMarkdownBodyExpanded, setSkillMarkdownBodyExpanded] =
    useState(false);

  const parsedArgs = useMemo(
    () => parseToolCallArguments(toolCall.arguments),
    [toolCall.arguments],
  );
  const argsRecord = useMemo(() => asRecord(parsedArgs), [parsedArgs]);
  const toolDisplay = useMemo(
    () => getToolDisplayInfo(toolCall.name, toolCall.status),
    [toolCall.name, toolCall.status],
  );
  const ToolIcon = toolDisplay.icon;
  const metadata = useMemo(() => {
    const merged = {
      ...(asRecord(toolCall.metadata) || {}),
      ...(asRecord(toolCall.result?.metadata) || {}),
    };
    return Object.keys(merged).length > 0 ? merged : null;
  }, [toolCall.metadata, toolCall.result?.metadata]);
  const filePath = useMemo(() => resolveToolFilePath(parsedArgs), [parsedArgs]);
  const fileContent = useMemo(() => {
    const content = parsedArgs.content || parsedArgs.text;
    return content ? String(content) : "";
  }, [parsedArgs.content, parsedArgs.text]);
  const subject = useMemo(
    () => resolveToolPrimarySubject(toolCall.name, parsedArgs, filePath),
    [filePath, parsedArgs, toolCall.name],
  );
  const rawResultText = useMemo(() => {
    const rawText = toolCall.result?.error || toolCall.result?.output || "";
    return extractLimeToolMetadataBlock(rawText).text.trim();
  }, [toolCall.result?.error, toolCall.result?.output]);
  const limeTaskProtocolFailureText = useMemo(() => {
    if (toolCall.status !== "failed") {
      return null;
    }

    return isLimeTaskProtocolFailure({
      toolName: toolCall.name,
      text: rawResultText,
    })
      ? resolveLimeTaskProtocolFailureDisplayText({
          toolName: toolCall.name,
          text: rawResultText,
        })
      : null;
  }, [rawResultText, toolCall.name, toolCall.status]);
  const importedSourcePresentation = useMemo(
    () => resolveImportedSourceToolPresentation(toolCall),
    [toolCall],
  );
  const headline = useMemo(
    () =>
      importedSourcePresentation
        ? t("agentChat.toolCall.importedCommandRecord.title")
        : limeTaskProtocolFailureText ||
          buildToolHeadline({
            toolDisplay,
            subject,
            toolName: toolCall.name,
          }),
    [
      importedSourcePresentation,
      limeTaskProtocolFailureText,
      subject,
      t,
      toolCall.name,
      toolDisplay,
    ],
  );
  const processNarrative = useMemo(
    () => resolveToolProcessNarrative(toolCall),
    [toolCall],
  );
  const resultText = useMemo(() => {
    if (importedSourcePresentation) {
      return t("agentChat.toolCall.importedCommandRecord.description");
    }

    if (toolCall.status !== "failed") {
      return (
        resolveTaskBoardResultDetailText({
          toolName: toolCall.name,
          outputText: rawResultText,
          metadata,
          fallbackSummary:
            processNarrative.postSummary ||
            processNarrative.summary ||
            processNarrative.preSummary,
        }) || normalizeToolResultDetailText(rawResultText)
      );
    }

    return (
      resolveToolErrorDetailText(toolCall.name, rawResultText) || rawResultText
    );
  }, [
    importedSourcePresentation,
    metadata,
    processNarrative.postSummary,
    processNarrative.preSummary,
    processNarrative.summary,
    rawResultText,
    t,
    toolCall.name,
    toolCall.status,
  ]);
  const isRawDiagnosticDetail = useMemo(
    () =>
      processNarrative.postSource === "error" &&
      Boolean(rawResultText) &&
      isLikelyWebRetrievalDiagnosticNoise(rawResultText),
    [processNarrative.postSource, rawResultText],
  );
  const resultDetailMarkdown = useMemo(
    () => sanitizeToolResultDetailMarkdown(resultText),
    [resultText],
  );
  const resultPreview = useMemo(
    () => summarizeResultText(resultText),
    [resultText],
  );
  const resultImages = useMemo(
    () =>
      normalizeToolResultImages(
        toolCall.result?.images,
        rawResultText,
        metadata,
      ) || [],
    [metadata, rawResultText, toolCall.result?.images],
  );
  const isToolSearch = useMemo(
    () => normalizeToolNameKey(toolCall.name) === "toolsearch",
    [toolCall.name],
  );
  const toolSearchSummary = useMemo(
    () =>
      isToolSearch ? normalizeToolSearchResultSummary(rawResultText) : null,
    [isToolSearch, rawResultText],
  );
  const searchResultItems = useMemo(() => {
    if (!isUnifiedWebSearchToolName(toolCall.name)) {
      return [];
    }

    return resolveSearchResultPreviewItemsFromText(rawResultText);
  }, [rawResultText, toolCall.name]);
  const structuredResultPreview = useMemo(() => {
    if (toolSearchSummary) {
      return summarizeToolSearchPreview(toolSearchSummary);
    }
    if (searchResultItems.length > 0) {
      return summarizeSearchResultPreview(searchResultItems.length);
    }
    if (isRawDiagnosticDetail) {
      return summarizeDiagnosticResultPreview(rawResultText);
    }
    return resultPreview;
  }, [
    isRawDiagnosticDetail,
    rawResultText,
    resultPreview,
    searchResultItems.length,
    toolSearchSummary,
  ]);
  const savedSiteContentTarget = useMemo(
    () => resolveSiteSavedContentTargetFromMetadata(toolCall.result?.metadata),
    [toolCall.result?.metadata],
  );
  const savedSiteContentDisplayName = useMemo(
    () =>
      resolveSiteSavedContentTargetDisplayName(savedSiteContentTarget) ||
      resolveSiteSavedContentTargetRelativePath(savedSiteContentTarget),
    [savedSiteContentTarget],
  );
  const siteNoticeLines = useMemo(
    () => buildSiteNoticeLines(toolCall),
    [toolCall],
  );
  const skillTitle =
    readString(argsRecord, ["skill_title", "skillTitle"]) ||
    readString(metadata, ["skill_title", "skillTitle"]);
  const isPreload =
    metadata?.execution_origin === "preload" || metadata?.preload === true;
  const hasOpenableFile = Boolean(filePath && onFileClick);
  const skillSource =
    readString(metadata, ["skill_source", "skillSource"]) ||
    readString(argsRecord, ["source"]);
  const isSkillInvocation =
    toolDisplay.family === "skill" ||
    metadata?.tool_family === "skill" ||
    skillSource === "SKILL.md";
  const skillName =
    readString(metadata, ["skill_name", "skillName"]) ||
    readString(argsRecord, ["skill", "name"]);
  const skillDisplayName =
    readString(metadata, ["skill_display_name", "skillDisplayName"]) ||
    readString(argsRecord, ["display_name", "displayName"]) ||
    skillName;
  const skillSnapshotContent = readString(metadata, [
    "skill_markdown_content",
    "skillMarkdownContent",
    "markdown_content",
    "markdownContent",
  ]);
  const skillMarkdownContentBytes = readNumber(metadata, [
    "markdown_content_bytes",
    "markdownContentBytes",
  ]);
  const isStandardSkillSnapshot = readBoolean(metadata, [
    "agent_skills_standard",
    "agentSkillsStandard",
  ]);
  const hasSkillContentAccess =
    isSkillInvocation &&
    Boolean(skillSnapshotContent || fetchedSkillContent || skillName);
  const resolvedSkillContent =
    skillSnapshotContent || fetchedSkillContent || "";
  const skillContentSourceLabel = skillSnapshotContent
    ? t("agentChat.toolCall.skillContent.source.snapshot")
    : t("agentChat.toolCall.skillContent.source.current");
  const skillContentTitle = skillSnapshotContent
    ? t("agentChat.toolCall.skillContent.title.snapshot")
    : t("agentChat.toolCall.skillContent.title.current");
  const processSummary = useMemo(() => {
    const streamingOutputSummary =
      toolCall.status === "running" && structuredResultPreview
        ? `实时输出：${structuredResultPreview}`
        : null;
    const progressSummary =
      toolCall.status === "running" && toolCall.progress?.message
        ? `进度：${toolCall.progress.message}`
        : null;
    const preferredSummary = importedSourcePresentation
      ? t("agentChat.toolCall.importedCommandRecord.description")
      : toolCall.status === "running"
        ? streamingOutputSummary ||
          progressSummary ||
          processNarrative.preSummary
        : processNarrative.postSource === "generic" && structuredResultPreview
          ? structuredResultPreview
          : processNarrative.postSummary ||
            structuredResultPreview ||
            processNarrative.preSummary;

    return normalizeSummaryLine(preferredSummary, headline);
  }, [
    headline,
    importedSourcePresentation,
    processNarrative.postSource,
    processNarrative.postSummary,
    processNarrative.preSummary,
    structuredResultPreview,
    t,
    toolCall.progress?.message,
    toolCall.status,
  ]);
  const hasDetails =
    Boolean(resultText) ||
    resultImages.length > 0 ||
    searchResultItems.length > 0 ||
    Boolean(toolSearchSummary) ||
    siteNoticeLines.length > 0 ||
    Boolean(savedSiteContentTarget) ||
    Boolean(skillTitle && skillTitle !== subject);

  const handleOpenExternalUrl = useCallback(async (url: string) => {
    try {
      await openExternalUrlWithSystemBrowser(url);
    } catch (error) {
      console.error("打开外部链接失败:", error);
    }
  }, []);

  useEffect(() => {
    if (toolCall.status === "running" || siteNoticeLines.length > 0) {
      setExpanded(true);
      return;
    }

    if (isMessageStreaming && !toolSearchSummary) {
      setExpanded(resultText.length <= LARGE_RESULT_AUTO_COLLAPSE_CHARS);
    }
  }, [
    isMessageStreaming,
    resultText.length,
    siteNoticeLines.length,
    toolCall.status,
    toolSearchSummary,
  ]);

  useEffect(() => {
    setSkillContentExpanded(false);
    setFetchedSkillContent(null);
    setSkillContentLoading(false);
    setSkillContentError(null);
    setSkillMarkdownBodyExpanded(false);
  }, [toolCall.id]);

  const handleToggleSkillContent = useCallback(async () => {
    if (skillContentExpanded) {
      setSkillContentExpanded(false);
      setSkillMarkdownBodyExpanded(false);
      return;
    }

    setSkillContentExpanded(true);
    setSkillMarkdownBodyExpanded(false);
    if (skillSnapshotContent || fetchedSkillContent) {
      return;
    }

    const normalizedSkillName = skillName?.trim();
    if (!normalizedSkillName) {
      setSkillContentError(
        t("agentChat.toolCall.skillContent.error.unavailable"),
      );
      return;
    }

    setSkillContentLoading(true);
    setSkillContentError(null);
    try {
      const inspection = await skillsApi.inspectLocalSkill(normalizedSkillName);
      setFetchedSkillContent(inspection.content || "");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : t("agentChat.toolCall.skillContent.error.unknown");
      setSkillContentError(
        t("agentChat.toolCall.skillContent.error.loadFailed", { message }),
      );
    } finally {
      setSkillContentLoading(false);
    }
  }, [
    fetchedSkillContent,
    skillContentExpanded,
    skillName,
    skillSnapshotContent,
    t,
  ]);

  const detailBadges = [
    isPreload ? "系统预执行" : null,
    skillTitle && skillTitle !== subject ? `技能：${skillTitle}` : null,
    toolCall.status === "running" || toolCall.status === "failed"
      ? toolDisplay.action
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div
      className="py-1"
      data-testid="inline-tool-process-step"
      data-grouped={grouped ? "yes" : "no"}
    >
      <div className="flex items-start gap-2">
        {grouped ? (
          <span className="pt-0.5 font-mono text-xs text-slate-400">
            {groupMarker}
          </span>
        ) : null}
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          {toolCall.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          ) : (
            <ToolIcon
              className={cn(
                "h-4 w-4",
                toolCall.status === "completed" && "text-slate-400",
                toolCall.status === "failed" && "text-rose-600",
                toolCall.status !== "completed" &&
                  toolCall.status !== "failed" &&
                  "text-slate-500",
              )}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className={cn(
                "min-w-0 flex-1 text-left",
                hasDetails && "cursor-pointer",
              )}
              onClick={() => {
                if (hasDetails) {
                  setExpanded((current) => !current);
                }
              }}
              aria-expanded={hasDetails ? expanded : undefined}
            >
              <div className="truncate text-[13px] font-normal leading-6 text-slate-700">
                {headline}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-slate-500">
                {detailBadges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
              {processSummary ? (
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  {processSummary}
                </div>
              ) : !expanded && structuredResultPreview ? (
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  {structuredResultPreview}
                </div>
              ) : null}
            </button>

            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              {hasSkillContentAccess ? (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    skillContentExpanded
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                  )}
                  title={
                    skillContentExpanded
                      ? t("agentChat.toolCall.skillContent.action.hide")
                      : t("agentChat.toolCall.skillContent.action.view")
                  }
                  aria-label={
                    skillContentExpanded
                      ? t("agentChat.toolCall.skillContent.action.hide")
                      : t("agentChat.toolCall.skillContent.action.view")
                  }
                  onClick={handleToggleSkillContent}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>
                    {t("agentChat.toolCall.skillContent.action.viewShort")}
                  </span>
                </button>
              ) : null}
              {hasOpenableFile ? (
                <button
                  type="button"
                  data-testid="inline-tool-open-file"
                  data-file-path={filePath || undefined}
                  className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={t("agentChat.toolCall.openInCanvas")}
                  aria-label={t("agentChat.toolCall.openInCanvasWithTarget", {
                    target: filePath,
                  })}
                  onClick={() => {
                    if (filePath && onFileClick) {
                      onFileClick(filePath, fileContent);
                    }
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {hasDetails ? (
                <button
                  type="button"
                  className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={expanded ? "收起过程详情" : "展开过程详情"}
                  onClick={() => setExpanded((current) => !current)}
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
              ) : null}
            </div>
          </div>

          {skillContentExpanded ? (
            <div
              className="ml-1 mt-2 rounded-[14px] border border-emerald-100 bg-emerald-50/60 p-3"
              data-testid="inline-tool-skill-content-panel"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{skillContentTitle}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-700">
                <span>{skillContentSourceLabel}</span>
                {skillDisplayName ? <span>{skillDisplayName}</span> : null}
                {skillMarkdownContentBytes !== null ? (
                  <span>
                    {t("agentChat.toolCall.skillContent.meta.bytes", {
                      count: skillMarkdownContentBytes,
                    })}
                  </span>
                ) : null}
                {isStandardSkillSnapshot === true ? (
                  <span>
                    {t("agentChat.toolCall.skillContent.meta.standard")}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-between rounded-[12px] border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-900 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
                aria-expanded={skillMarkdownBodyExpanded}
                aria-controls={`inline-skill-content-body-${toolCall.id}`}
                onClick={() =>
                  setSkillMarkdownBodyExpanded((current) => !current)
                }
              >
                <span>
                  {skillMarkdownBodyExpanded
                    ? t("agentChat.toolCall.skillContent.action.collapseBody")
                    : t("agentChat.toolCall.skillContent.action.expandBody")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    skillMarkdownBodyExpanded && "rotate-180",
                  )}
                />
              </button>
              {skillMarkdownBodyExpanded ? (
                <div
                  id={`inline-skill-content-body-${toolCall.id}`}
                  className="mt-2 max-h-80 overflow-y-auto rounded-[12px] border border-slate-200 bg-white p-3"
                  data-testid="inline-tool-skill-content-body"
                >
                  {skillContentLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("agentChat.toolCall.skillContent.loading")}
                    </div>
                  ) : skillContentError ? (
                    <div className="text-sm text-rose-700">
                      {skillContentError}
                    </div>
                  ) : resolvedSkillContent.trim() ? (
                    <MarkdownRenderer content={resolvedSkillContent} />
                  ) : (
                    <div className="text-sm text-slate-500">
                      {t("agentChat.toolCall.skillContent.empty")}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {expanded && hasDetails ? (
            <div className="ml-1 mt-2 space-y-2 border-l border-slate-200 pl-3">
              {siteNoticeLines.length > 0 ? (
                <div className="space-y-1 text-xs leading-5 text-slate-600">
                  {siteNoticeLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}

              {savedSiteContentTarget && onOpenSavedSiteContent ? (
                <div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3 py-2 text-left transition-colors hover:bg-emerald-100/70"
                    onClick={() =>
                      onOpenSavedSiteContent(savedSiteContentTarget)
                    }
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium leading-5 text-emerald-900">
                        {savedSiteContentTarget.preferredTarget ===
                        "project_file"
                          ? "在下方预览导出 Markdown"
                          : "打开已保存内容"}
                      </span>
                      {savedSiteContentDisplayName ? (
                        <span className="block truncate text-[11px] leading-5 text-emerald-700/80">
                          {savedSiteContentDisplayName}
                        </span>
                      ) : null}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  </button>
                </div>
              ) : null}

              {toolSearchSummary ? (
                <ToolSearchSummaryPanel
                  summary={toolSearchSummary}
                  testId="inline-tool-process-tool-search-result"
                />
              ) : null}

              {!toolSearchSummary && searchResultItems.length > 0 ? (
                <SearchResultPreviewList
                  items={searchResultItems}
                  onOpenUrl={handleOpenExternalUrl}
                  popoverSide="bottom"
                  popoverAlign="start"
                  className="max-w-2xl"
                />
              ) : null}

              {!toolSearchSummary &&
              searchResultItems.length === 0 &&
              resultText ? (
                <div className="text-sm leading-6 text-slate-700">
                  <MarkdownRenderer content={resultDetailMarkdown} />
                </div>
              ) : null}

              {resultImages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {resultImages.map((image, index) => (
                    <img
                      key={`${image.src.slice(0, 48)}-${index}`}
                      src={image.src}
                      alt={t("agentChat.toolCall.resultImage.alt")}
                      className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
