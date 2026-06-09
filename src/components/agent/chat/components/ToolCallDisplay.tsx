/**
 * 工具调用显示组件
 *
 * 参考 aster UI 设计，显示工具执行状态、参数、日志和结果
 * Requirements: 9.1, 9.2 - 工具执行指示器和结果折叠面板
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  FileText,
  FolderTree,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import { cn } from "@/lib/utils";
import { skillsApi } from "@/lib/api/skills";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import type { SiteSavedContentTarget } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { SearchResultPreviewList } from "./SearchResultPreviewList";
import { ToolSearchSummaryPanel } from "./ToolSearchSummaryPanel";
import {
  isUnifiedWebSearchToolName,
  resolveSearchResultPreviewItemsFromText,
} from "../utils/searchResultPreview";
import {
  extractLimeToolMetadataBlock,
  isToolResultSuccessful,
} from "../hooks/agentChatToolResult";
import {
  normalizeSiteToolResultSummary,
  resolveSiteSavedContentTargetFromMetadata,
} from "../utils/siteToolResultSummary";
import { normalizeToolSearchResultSummary } from "../utils/toolSearchResultSummary";
import {
  buildDiffFileCanvasContent,
  buildDiffReviewScopeItems,
  resolveDiffReviewSummaryFromCandidates,
  type DiffReviewFile,
} from "../utils/diffReview";
import type { ToolCallArgumentValue } from "../utils/toolDisplayInfo";
import {
  buildGroupedChildLine as buildGroupedChildLineFromInfo,
  buildToolHeadline as buildToolHeadlineFromInfo,
  extractSearchQueryLabel as extractSearchQueryLabelFromInfo,
  getToolDisplayInfo as getToolDisplayInfoFromInfo,
  parseToolCallArguments as parseToolCallArgumentsFromInfo,
  resolveToolFilePath as resolveToolFilePathFromInfo,
  resolveToolPrimarySubject as resolveToolPrimarySubjectFromInfo,
} from "../utils/toolDisplayInfo";
import {
  resolveToolErrorDetailText,
  resolveToolProcessNarrative,
} from "../utils/toolProcessSummary";
import {
  isLimeTaskProtocolFailure,
  resolveLimeTaskProtocolFailureDisplayText,
} from "../utils/limeTaskProtocolNoise";
import {
  buildRenderedToolResultContent,
  buildToolCallDisplayGroups,
  buildToolGroupHeadline,
  buildToolGroupPreview,
  buildToolResultMetaNoticeKeys,
  formatCommandEncoding,
  isToolSearchToolName,
  normalizeToolResultImages,
  normalizeToolResultMetadata,
  readRecordString,
  resolveCommandOutputStreams,
  resolveCommandToolSummary,
  resolveSkillInvocationContentInfo,
  resolveToolResultPath,
  type ToolResultNotice,
} from "./ToolCallDisplayViewModel";

// ============ 可展开面板组件 ============

interface ExpandablePanelProps {
  label: React.ReactNode;
  isStartExpanded?: boolean;
  isForceExpand?: boolean;
  children: React.ReactNode;
  className?: string;
}

const ExpandablePanel: React.FC<ExpandablePanelProps> = ({
  label,
  isStartExpanded = false,
  isForceExpand,
  children,
  className = "",
}) => {
  const [isExpandedState, setIsExpanded] = useState<boolean | null>(null);
  const isExpanded =
    isExpandedState === null ? isStartExpanded : isExpandedState;
  const toggleExpand = () => setIsExpanded(!isExpanded);

  useEffect(() => {
    if (isForceExpand) setIsExpanded(true);
  }, [isForceExpand]);

  return (
    <div className={className}>
      <button
        onClick={toggleExpand}
        className="group w-full flex justify-between items-center pr-2 py-2 px-3 transition-colors rounded-none hover:bg-muted/50"
      >
        <span className="flex items-center text-sm truncate flex-1 min-w-0">
          {label}
        </span>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground group-hover:opacity-100 transition-transform opacity-70",
            isExpanded && "rotate-90",
          )}
        />
      </button>
      {isExpanded && <div>{children}</div>}
    </div>
  );
};

// ============ 工具参数显示 ============

interface ToolCallArgumentsProps {
  args: Record<string, ToolCallArgumentValue>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ToolCallArguments: React.FC<ToolCallArgumentsProps> = ({ args }) => {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderValue = (key: string, value: ToolCallArgumentValue) => {
    if (typeof value === "string") {
      const needsExpansion = value.length > 60;
      const isExpanded = expandedKeys[key];

      if (!needsExpansion) {
        return (
          <div className="text-sm mb-2">
            <div className="flex flex-row">
              <span className="text-muted-foreground min-w-[120px] shrink-0">
                {key}
              </span>
              <span className="text-foreground/70 break-all">{value}</span>
            </div>
          </div>
        );
      }

      return (
        <div className={cn("text-sm mb-2", !isExpanded && "truncate min-w-0")}>
          <div
            className={cn(
              "flex flex-row items-start",
              !isExpanded && "truncate min-w-0",
            )}
          >
            <button
              onClick={() => toggleKey(key)}
              className="flex text-left text-muted-foreground min-w-[120px] shrink-0 hover:text-foreground"
            >
              {key}
            </button>
            <div className={cn("flex-1 min-w-0", !isExpanded && "truncate")}>
              {isExpanded ? (
                <MarkdownRenderer content={`\`\`\`\n${value}\n\`\`\``} />
              ) : (
                <button
                  onClick={() => toggleKey(key)}
                  className="text-left text-foreground/70 truncate w-full hover:text-foreground"
                >
                  {value}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 处理非字符串值
    const content = Array.isArray(value)
      ? value
          .map((item, index) => `${index + 1}. ${JSON.stringify(item)}`)
          .join("\n")
      : typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value);

    return (
      <div className="mb-2">
        <div className="flex flex-row text-sm">
          <span className="text-muted-foreground min-w-[120px] shrink-0">
            {key}
          </span>
          <pre className="whitespace-pre-wrap text-foreground/70 overflow-x-auto max-w-full font-mono text-xs">
            {content}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="py-2 px-4">
      {Object.entries(args).map(([key, value]) => (
        <div key={key}>{renderValue(key, value)}</div>
      ))}
    </div>
  );
};

// ============ 工具日志显示 ============

interface ToolLogsViewProps {
  logs: string[];
  working: boolean;
  isStartExpanded?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ToolLogsView: React.FC<ToolLogsViewProps> = ({
  logs,
  working,
  isStartExpanded = false,
}) => {
  const { t } = useTranslation("agent");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <ExpandablePanel
      label={
        <span className="pl-2 py-1 text-sm flex items-center gap-2">
          <span>{t("agentChat.toolCall.logs.title")}</span>
          {working && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </span>
      }
      isStartExpanded={isStartExpanded}
    >
      <div
        ref={boxRef}
        className={cn(
          "flex flex-col items-start space-y-1 overflow-y-auto p-3 font-mono text-xs",
          working ? "max-h-16" : "max-h-80",
        )}
      >
        {logs.map((log, i) => (
          <span key={i} className="text-muted-foreground">
            {log}
          </span>
        ))}
      </div>
    </ExpandablePanel>
  );
};

// ============ 工具结果显示 ============

interface ToolResultViewProps {
  result: string;
  isError?: boolean;
  isStartExpanded?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ToolResultView: React.FC<ToolResultViewProps> = ({
  result,
  isError = false,
  isStartExpanded = false,
}) => {
  const { t } = useTranslation("agent");
  return (
    <ExpandablePanel
      label={
        <span
          className={cn("pl-2 py-1 text-sm", isError && "text-destructive")}
        >
          {isError
            ? t("agentChat.toolCall.result.error")
            : t("agentChat.toolCall.result.output")}
        </span>
      }
      isStartExpanded={isStartExpanded}
    >
      <div className="p-3 max-h-80 overflow-y-auto">
        <pre
          className={cn(
            "whitespace-pre-wrap font-mono text-xs break-all",
            isError ? "text-destructive" : "text-foreground/80",
          )}
        >
          {result || t("agentChat.toolCall.result.empty")}
        </pre>
      </div>
    </ExpandablePanel>
  );
};

// ============ 主组件 ============

interface ToolCallDisplayProps {
  toolCall: ToolCallState;
  defaultExpanded?: boolean;
  /** 当前 assistant 消息是否仍在流式输出 */
  isMessageStreaming?: boolean;
  /** 文件点击回调 - 用于打开右边栏显示文件内容 */
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
  grouped?: boolean;
  groupMarker?: string;
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolCall,
  defaultExpanded = false,
  isMessageStreaming = false,
  onFileClick,
  onOpenSavedSiteContent,
  grouped = false,
  groupMarker = "•",
}) => {
  const { t } = useTranslation("agent");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isSkillContentExpanded, setIsSkillContentExpanded] = useState(false);
  const [fetchedSkillContent, setFetchedSkillContent] = useState<string | null>(
    null,
  );
  const [skillContentLoading, setSkillContentLoading] = useState(false);
  const [skillContentError, setSkillContentError] = useState<string | null>(
    null,
  );
  const [skillMarkdownBodyExpanded, setSkillMarkdownBodyExpanded] =
    useState(false);
  const [showRawSearchResultOutput, setShowRawSearchResultOutput] =
    useState(false);
  const [expandedDiffFileIds, setExpandedDiffFileIds] = useState<
    Record<string, boolean>
  >({});
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const hasUserToggledExpandedRef = useRef(false);
  const emptyOutputLabel = t("agentChat.toolCall.result.empty");

  // 解析参数
  const parsedArgs = useMemo(
    () => parseToolCallArgumentsFromInfo(toolCall.arguments),
    [toolCall.arguments],
  );

  const toolDisplay = useMemo(
    () => getToolDisplayInfoFromInfo(toolCall.name, toolCall.status),
    [toolCall.name, toolCall.status],
  );

  // 获取文件路径
  const filePath = useMemo(
    () => resolveToolFilePathFromInfo(parsedArgs),
    [parsedArgs],
  );

  // 获取文件名
  const fileName = useMemo(
    () =>
      resolveToolPrimarySubjectFromInfo(toolCall.name, parsedArgs, filePath),
    [filePath, parsedArgs, toolCall.name],
  );

  // 获取文件内容（用于点击打开右边栏）
  const fileContent = useMemo(() => {
    const content = parsedArgs.content || parsedArgs.text;
    return content ? String(content) : null;
  }, [parsedArgs]);

  const isRunning = toolCall.status === "running";
  const isCompleted = toolCall.status === "completed";
  const isFailed = toolCall.status === "failed";
  const hasResult = !isRunning && toolCall.result;
  const resultImages = useMemo(
    () =>
      normalizeToolResultImages(
        toolCall.result?.images,
        toolCall.result?.output,
        toolCall.result?.metadata,
      ),
    [
      toolCall.result?.images,
      toolCall.result?.metadata,
      toolCall.result?.output,
    ],
  );
  const resultMetadata = useMemo(
    () => normalizeToolResultMetadata(toolCall.result?.metadata),
    [toolCall.result?.metadata],
  );
  const skillInvocationContentInfo = useMemo(
    () =>
      resolveSkillInvocationContentInfo({
        toolCall,
        args: parsedArgs,
        metadata: resultMetadata,
      }),
    [parsedArgs, resultMetadata, toolCall],
  );
  const siteResultSummary = useMemo(
    () => normalizeSiteToolResultSummary(toolCall.result?.metadata),
    [toolCall.result?.metadata],
  );
  const savedSiteContentTarget = useMemo(
    () => resolveSiteSavedContentTargetFromMetadata(toolCall.result?.metadata),
    [toolCall.result?.metadata],
  );
  const rawResultText = useMemo(() => {
    const rawText = toolCall.result?.error || toolCall.result?.output || "";
    return extractLimeToolMetadataBlock(rawText).text;
  }, [toolCall.result?.error, toolCall.result?.output]);
  const limeTaskProtocolFailureText = useMemo(() => {
    if (!isFailed) {
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
  }, [isFailed, rawResultText, toolCall.name]);
  const resultText = useMemo(() => {
    const normalized = rawResultText;
    if (isFailed) {
      return (
        resolveToolErrorDetailText(toolCall.name, normalized) ||
        normalized ||
        emptyOutputLabel
      );
    }
    return normalized || emptyOutputLabel;
  }, [emptyOutputLabel, isFailed, rawResultText, toolCall.name]);
  const isResultFailure = useMemo(() => {
    if (!toolCall.result) return isFailed;
    return !isToolResultSuccessful({
      success: toolCall.result.success,
      metadata: resultMetadata,
    });
  }, [isFailed, resultMetadata, toolCall.result]);
  const resolveSiteProjectTargetDisplay = useCallback(
    (params: { source?: string; projectId?: string }): string => {
      if (params.source === "context_project") {
        return t("agentChat.toolCall.siteResult.target.currentProject");
      }
      if (params.source === "explicit_project") {
        return t("agentChat.toolCall.siteResult.target.selectedProject");
      }
      const projectId = params.projectId?.trim();
      if (projectId) {
        return t("agentChat.toolCall.siteResult.target.project", {
          projectId,
        });
      }
      return t("agentChat.toolCall.siteResult.target.currentProject");
    },
    [t],
  );
  const resultMetaItems = useMemo(() => {
    return buildToolResultMetaNoticeKeys({
      metadata: resultMetadata,
      isResultFailure,
    }).map((key) => t(`agentChat.toolCall.resultNotice.${key}`));
  }, [isResultFailure, resultMetadata, t]);
  const commandSummary = useMemo(
    () =>
      resolveCommandToolSummary({
        toolName: toolCall.name,
        args: parsedArgs,
        metadata: resultMetadata,
      }),
    [parsedArgs, resultMetadata, toolCall.name],
  );
  const commandEncoding = useMemo(
    () => (commandSummary ? formatCommandEncoding(commandSummary) : null),
    [commandSummary],
  );
  const commandSurfaceLabel = useMemo(() => {
    if (!commandSummary?.executionSurface) {
      return null;
    }
    return commandSummary.executionSurface === "embedded"
      ? t("agentChat.toolCall.commandSummary.surfaceEmbedded")
      : t("agentChat.toolCall.commandSummary.surfaceExternal");
  }, [commandSummary, t]);
  const commandDecodedWithLabel = useMemo(() => {
    if (!commandSummary?.decodedWith) {
      return null;
    }
    return commandSummary.decodedWith === "strict"
      ? t("agentChat.toolCall.commandSummary.decodedWithStrict")
      : t("agentChat.toolCall.commandSummary.decodedWithLossy");
  }, [commandSummary, t]);
  const commandOutputStreams = useMemo(
    () =>
      commandSummary
        ? resolveCommandOutputStreams({
            output: toolCall.result?.output,
            error: toolCall.result?.error,
            metadata: resultMetadata,
          })
        : [],
    [
      commandSummary,
      resultMetadata,
      toolCall.result?.error,
      toolCall.result?.output,
    ],
  );
  const diffReviewSummary = useMemo(
    () =>
      resolveDiffReviewSummaryFromCandidates([
        readRecordString(parsedArgs, [
          "patch",
          "diff",
          "unified_diff",
          "unifiedDiff",
        ]),
        readRecordString(resultMetadata, [
          "patch",
          "diff",
          "unified_diff",
          "unifiedDiff",
        ]),
        ...commandOutputStreams.map((stream) => stream.content),
        resultText,
      ]),
    [commandOutputStreams, parsedArgs, resultMetadata, resultText],
  );
  const diffReviewScopeItems = useMemo(
    () =>
      diffReviewSummary
        ? buildDiffReviewScopeItems(diffReviewSummary.files)
        : [],
    [diffReviewSummary],
  );
  const siteResultNotices = useMemo(() => {
    if (!siteResultSummary) return [] as ToolResultNotice[];

    const notices: ToolResultNotice[] = [];
    const savedProjectId =
      siteResultSummary.savedProjectId ||
      siteResultSummary.savedContent?.projectId;
    const savedProjectTarget = resolveSiteProjectTargetDisplay({
      source: siteResultSummary.savedBy,
      projectId: savedProjectId,
    });

    if (siteResultSummary.savedContent?.title) {
      const text = t("agentChat.toolCall.siteResult.saved", {
        target: savedProjectTarget,
        title: siteResultSummary.savedContent.title,
      });
      notices.push({
        key: "site-save-success",
        text,
        tone: "success",
      });
    }

    if (siteResultSummary.savedContent?.markdownRelativePath) {
      notices.push({
        key: "site-save-markdown-path",
        text: t("agentChat.toolCall.siteResult.markdownExported"),
        tone: "neutral",
      });
    }

    if (typeof siteResultSummary.savedContent?.imageCount === "number") {
      notices.push({
        key: "site-save-images",
        text: t("agentChat.toolCall.siteResult.images", {
          count: siteResultSummary.savedContent.imageCount,
        }),
        tone: "neutral",
      });
    }

    if (siteResultSummary.saveSkippedProjectId) {
      const skippedProjectTarget = resolveSiteProjectTargetDisplay({
        source: siteResultSummary.saveSkippedBy,
        projectId: siteResultSummary.saveSkippedProjectId,
      });
      const text =
        toolCall.status === "failed"
          ? t("agentChat.toolCall.siteResult.saveSkippedAfterFailure", {
              target: skippedProjectTarget,
            })
          : t("agentChat.toolCall.siteResult.saveSkipped", {
              target: skippedProjectTarget,
            });
      notices.push({
        key: "site-save-skipped",
        text,
        tone: siteResultSummary.saveErrorMessage ? "warning" : "neutral",
      });
    }

    if (siteResultSummary.saveErrorMessage) {
      notices.push({
        key: "site-save-error",
        text: t("agentChat.toolCall.siteResult.saveError", {
          message: siteResultSummary.saveErrorMessage,
        }),
        tone: "error",
      });
    }
    return notices;
  }, [resolveSiteProjectTargetDisplay, siteResultSummary, t, toolCall.status]);
  const resultPath = useMemo(() => {
    const presentation = resolveToolResultPath(resultMetadata);
    return presentation
      ? {
          label: t("agentChat.toolCall.resultFile"),
          ...presentation,
        }
      : undefined;
  }, [resultMetadata, t]);
  const openableFilePath = useMemo(
    () => resultPath?.value || filePath,
    [filePath, resultPath?.value],
  );
  const renderedResultContent = useMemo(
    () =>
      buildRenderedToolResultContent({
        toolCall,
        content: resultText,
        filePath,
        resultPath: resultPath?.value,
        emptyOutputLabel,
      }),
    [emptyOutputLabel, filePath, resultPath?.value, resultText, toolCall],
  );
  const toolHeadline = useMemo(
    () =>
      limeTaskProtocolFailureText ||
      buildToolHeadlineFromInfo({
        toolDisplay,
        subject: fileName,
        toolName: toolCall.name,
      }),
    [fileName, limeTaskProtocolFailureText, toolCall.name, toolDisplay],
  );
  const processNarrative = useMemo(
    () => resolveToolProcessNarrative(toolCall),
    [toolCall],
  );
  const searchResultItems = useMemo(() => {
    if (!isUnifiedWebSearchToolName(toolCall.name)) {
      return [];
    }

    return resolveSearchResultPreviewItemsFromText(toolCall.result?.output);
  }, [toolCall.name, toolCall.result?.output]);
  const hasResultImages = resultImages.length > 0;
  const hasSearchResults = searchResultItems.length > 0;
  const isToolSearch = useMemo(
    () => isToolSearchToolName(toolCall.name),
    [toolCall.name],
  );
  const toolSearchSummary = useMemo(
    () => (isToolSearch ? normalizeToolSearchResultSummary(resultText) : null),
    [isToolSearch, resultText],
  );
  const hasToolSearchSummary = Boolean(toolSearchSummary);
  const groupedChildLine = useMemo(() => {
    if (isToolSearch && processNarrative.postSource === "tool_search") {
      return processNarrative.summary;
    }
    return buildGroupedChildLineFromInfo(toolCall);
  }, [
    isToolSearch,
    processNarrative.postSource,
    processNarrative.summary,
    toolCall,
  ]);
  const shouldShowRawSearchResultToggle =
    hasSearchResults && resultText !== emptyOutputLabel;
  const shouldRenderResultPanel =
    isExpanded &&
    hasResult &&
    (!hasSearchResults || showRawSearchResultOutput) &&
    !hasToolSearchSummary;
  const resolvedSkillContent =
    skillInvocationContentInfo.snapshotContent || fetchedSkillContent || "";
  const hasSkillContentAccess =
    skillInvocationContentInfo.isSkillInvocation &&
    Boolean(
      skillInvocationContentInfo.snapshotContent ||
      fetchedSkillContent ||
      skillInvocationContentInfo.skillName,
    );
  const skillContentSourceLabel = skillInvocationContentInfo.snapshotContent
    ? t("agentChat.toolCall.skillContent.source.snapshot")
    : t("agentChat.toolCall.skillContent.source.current");
  const skillContentTitle = skillInvocationContentInfo.snapshotContent
    ? t("agentChat.toolCall.skillContent.title.snapshot")
    : t("agentChat.toolCall.skillContent.title.current");
  const openInCanvasTitle = t("agentChat.toolCall.openInCanvas");
  const openInCanvasAriaLabel = openableFilePath
    ? t("agentChat.toolCall.openInCanvasWithTarget", {
        target: openableFilePath,
      })
    : openInCanvasTitle;
  const resultImageAlt = t("agentChat.toolCall.resultImage.alt");
  const resultImageOpenTitle = t("agentChat.markdown.image.openTitle");
  const openExternalUnsupportedMessage = t(
    "agentChat.toolCall.error.openExternalUnsupported",
  );

  const handleOpenExternalUrl = useCallback(
    async (url: string) => {
      try {
        await openExternalUrlWithSystemBrowser(url);
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error(openExternalUnsupportedMessage);
      }
    },
    [openExternalUnsupportedMessage],
  );

  useEffect(() => {
    setIsSkillContentExpanded(false);
    setFetchedSkillContent(null);
    setSkillContentLoading(false);
    setSkillContentError(null);
    setSkillMarkdownBodyExpanded(false);
    setExpandedDiffFileIds({});
  }, [toolCall.id]);

  useEffect(() => {
    if (
      isMessageStreaming &&
      !isToolSearch &&
      (isRunning || hasResult || hasResultImages || hasSearchResults)
    ) {
      setIsExpanded(true);
    }
  }, [
    isMessageStreaming,
    isToolSearch,
    isRunning,
    hasResult,
    hasResultImages,
    hasSearchResults,
  ]);

  useEffect(() => {
    if (hasSearchResults && !hasUserToggledExpandedRef.current) {
      setIsExpanded(true);
    }
  }, [hasSearchResults]);

  useEffect(() => {
    if (!hasSearchResults) {
      setShowRawSearchResultOutput(false);
    }
  }, [hasSearchResults]);

  // 处理点击事件 - 如果是文件写入工具，打开右边栏
  const handleOpenFile = useCallback(() => {
    if (openableFilePath && onFileClick) {
      onFileClick(openableFilePath, fileContent || "");
    }
  }, [fileContent, onFileClick, openableFilePath]);

  const handleOpenSavedSiteContent = useCallback(() => {
    if (savedSiteContentTarget && onOpenSavedSiteContent) {
      onOpenSavedSiteContent(savedSiteContentTarget);
    }
  }, [onOpenSavedSiteContent, savedSiteContentTarget]);
  const openSavedSiteContentLabel =
    savedSiteContentTarget?.preferredTarget === "project_file"
      ? t("agentChat.toolCall.siteResult.openMarkdownPreview")
      : t("agentChat.toolCall.siteResult.openSavedContent");
  const resultToggleTitle = isExpanded
    ? t("agentChat.toolCall.result.collapse")
    : t("agentChat.toolCall.result.expand");
  const searchRawToggleLabel = showRawSearchResultOutput
    ? t("agentChat.toolCall.searchRaw.collapse")
    : t("agentChat.toolCall.searchRaw.expand");
  const searchRawToggleAriaLabel = showRawSearchResultOutput
    ? t("agentChat.toolCall.searchRaw.collapseAria")
    : t("agentChat.toolCall.searchRaw.expandAria");

  const handleToggleExpanded = useCallback(() => {
    hasUserToggledExpandedRef.current = true;
    setIsExpanded((prev) => !prev);
  }, []);

  const handleToggleDiffFileExpanded = useCallback((fileId: string) => {
    setExpandedDiffFileIds((current) => ({
      ...current,
      [fileId]: !current[fileId],
    }));
  }, []);

  const handleOpenDiffFileInCanvas = useCallback(
    (file: DiffReviewFile) => {
      if (!onFileClick) return;
      const title = t("agentChat.toolCall.diffReview.canvasTitle", {
        path: file.path,
      });
      const content = buildDiffFileCanvasContent({
        file,
        title,
        statusLabel: t("agentChat.toolCall.diffReview.canvasStatus", {
          status: t(`agentChat.toolCall.diffReview.status.${file.status}`),
        }),
        additionsLabel: t("agentChat.toolCall.diffReview.additions", {
          count: file.additions,
        }),
        deletionsLabel: t("agentChat.toolCall.diffReview.deletions", {
          count: file.deletions,
        }),
        hunksLabel: t("agentChat.toolCall.diffReview.hunks", {
          count: file.hunks,
        }),
      });
      onFileClick(`${file.path}.diff.md`, content);
    },
    [onFileClick, t],
  );

  const handleToggleSkillContent = useCallback(async () => {
    if (isSkillContentExpanded) {
      setIsSkillContentExpanded(false);
      setSkillMarkdownBodyExpanded(false);
      return;
    }

    setIsSkillContentExpanded(true);
    setSkillMarkdownBodyExpanded(false);
    if (skillInvocationContentInfo.snapshotContent || fetchedSkillContent) {
      return;
    }

    const skillName = skillInvocationContentInfo.skillName?.trim();
    if (!skillName) {
      setSkillContentError(
        t("agentChat.toolCall.skillContent.error.unavailable"),
      );
      return;
    }

    setSkillContentLoading(true);
    setSkillContentError(null);
    try {
      const inspection = await skillsApi.inspectLocalSkill(skillName);
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
    isSkillContentExpanded,
    skillInvocationContentInfo.skillName,
    skillInvocationContentInfo.snapshotContent,
    t,
  ]);

  const skillContentButton = hasSkillContentAccess ? (
    <button
      type="button"
      onClick={handleToggleSkillContent}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        isSkillContentExpanded
          ? "bg-emerald-50 text-emerald-800"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
      )}
      title={
        isSkillContentExpanded
          ? t("agentChat.toolCall.skillContent.action.hide")
          : t("agentChat.toolCall.skillContent.action.view")
      }
      aria-label={
        isSkillContentExpanded
          ? t("agentChat.toolCall.skillContent.action.hide")
          : t("agentChat.toolCall.skillContent.action.view")
      }
    >
      <FileText className="h-3.5 w-3.5" />
      <span>{t("agentChat.toolCall.skillContent.action.viewShort")}</span>
    </button>
  ) : null;

  return (
    <div className={cn("group", grouped && "pl-1")}>
      {grouped ? (
        <div
          className="flex items-start gap-2 py-1.5"
          data-testid="tool-call-row"
        >
          <span className="pt-0.5 font-mono text-xs text-slate-400">
            {groupMarker}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-slate-700">
              {groupedChildLine}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 pt-0.5">
            {skillContentButton}
            {openableFilePath && onFileClick && (
              <button
                onClick={handleOpenFile}
                className="rounded-md p-1 transition-colors hover:bg-slate-100"
                title={openInCanvasTitle}
                aria-label={openInCanvasAriaLabel}
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-slate-900" />
              </button>
            )}
            {(hasResult || hasSearchResults) && (
              <button
                onClick={handleToggleExpanded}
                className="rounded-md p-1 transition-colors hover:bg-slate-100"
                title={resultToggleTitle}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-slate-500 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex items-start gap-2.5 py-1.5"
          data-testid="tool-call-row"
        >
          <span
            className={cn(
              "pt-0.5 text-sm font-medium",
              isCompleted && "text-emerald-600",
              isFailed && "text-rose-600",
              isRunning && "text-sky-600",
              !isCompleted && !isFailed && !isRunning && "text-slate-400",
            )}
            aria-hidden="true"
          >
            •
          </span>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-slate-900">
              {toolHeadline}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 pt-0.5">
            {skillContentButton}
            {openableFilePath && onFileClick && (
              <button
                onClick={handleOpenFile}
                className="rounded-md p-1 transition-colors hover:bg-slate-100"
                title={openInCanvasTitle}
                aria-label={openInCanvasAriaLabel}
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-slate-900" />
              </button>
            )}

            {(hasResult || hasSearchResults) && (
              <button
                onClick={handleToggleExpanded}
                className="rounded-md p-1 transition-colors hover:bg-slate-100"
                title={resultToggleTitle}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-slate-500 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {hasResultImages && (
        <div className="mb-2 ml-4 mt-2 flex flex-wrap gap-2">
          {resultImages.map((image, index) => (
            <button
              key={`${image.src.slice(0, 48)}-${index}`}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              onClick={() => setPreviewImageSrc(image.src)}
              title={resultImageOpenTitle}
            >
              <img
                src={image.src}
                alt={resultImageAlt}
                className="h-20 w-20 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {hasSearchResults && isExpanded && (
        <div className="mb-2 ml-6 mt-1.5">
          <SearchResultPreviewList
            items={searchResultItems}
            onOpenUrl={handleOpenExternalUrl}
            popoverSide="bottom"
            popoverAlign="start"
          />
          {shouldShowRawSearchResultToggle ? (
            <div className="mt-2">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label={searchRawToggleAriaLabel}
                onClick={() =>
                  setShowRawSearchResultOutput((current) => !current)
                }
              >
                {searchRawToggleLabel}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {toolSearchSummary && isExpanded ? (
        <div
          className="mb-2 ml-6 mt-1.5"
          data-testid="tool-call-tool-search-result"
        >
          <ToolSearchSummaryPanel summary={toolSearchSummary} />
        </div>
      ) : null}

      {isSkillContentExpanded ? (
        <div
          className="mb-2 ml-6 mt-1.5 rounded-[14px] border border-emerald-100 bg-emerald-50/60 p-3"
          data-testid="tool-call-skill-content-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{skillContentTitle}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-700">
                <span>{skillContentSourceLabel}</span>
                {skillInvocationContentInfo.displayName ? (
                  <span>{skillInvocationContentInfo.displayName}</span>
                ) : null}
                {skillInvocationContentInfo.markdownContentBytes !== null ? (
                  <span>
                    {t("agentChat.toolCall.skillContent.meta.bytes", {
                      count: skillInvocationContentInfo.markdownContentBytes,
                    })}
                  </span>
                ) : null}
                {skillInvocationContentInfo.isSnapshotStandard === true ? (
                  <span>
                    {t("agentChat.toolCall.skillContent.meta.standard")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between rounded-[12px] border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-900 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            aria-expanded={skillMarkdownBodyExpanded}
            aria-controls={`tool-call-skill-content-body-${toolCall.id}`}
            onClick={() => setSkillMarkdownBodyExpanded((current) => !current)}
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
              id={`tool-call-skill-content-body-${toolCall.id}`}
              className="mt-2 max-h-80 overflow-y-auto rounded-[12px] border border-slate-200 bg-white p-3"
              data-testid="tool-call-skill-content-body"
            >
              {skillContentLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("agentChat.toolCall.skillContent.loading")}
                </div>
              ) : skillContentError ? (
                <div className="text-sm text-rose-700">{skillContentError}</div>
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

      {shouldRenderResultPanel && (
        <div
          className="mb-2 ml-6 mt-1.5 space-y-2"
          data-testid="tool-call-result-panel"
        >
          {commandSummary ? (
            <div
              className="rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2"
              data-testid="tool-call-command-summary"
            >
              <div className="text-[11px] font-semibold text-slate-700">
                {t("agentChat.toolCall.commandSummary.title")}
              </div>
              <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                {commandSummary.command ? (
                  <div className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 text-slate-500">
                      {t("agentChat.toolCall.commandSummary.command")}
                    </span>
                    <code className="min-w-0 break-all rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-800">
                      {commandSummary.command}
                    </code>
                  </div>
                ) : null}
                {commandSummary.cwd ? (
                  <div className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 text-slate-500">
                      {t("agentChat.toolCall.commandSummary.cwd")}
                    </span>
                    <span className="min-w-0 break-all text-slate-700">
                      {commandSummary.cwd}
                    </span>
                  </div>
                ) : null}
                {commandSummary.shell ? (
                  <div className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 text-slate-500">
                      {t("agentChat.toolCall.commandSummary.shell")}
                    </span>
                    <code className="min-w-0 break-all rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-800">
                      {commandSummary.shell}
                    </code>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {commandSummary.exitCode !== null ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.exitCode", {
                        value: commandSummary.exitCode,
                      })}
                    </span>
                  ) : null}
                  {commandSummary.stdoutLength !== null ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.stdout", {
                        value: commandSummary.stdoutLength,
                      })}
                    </span>
                  ) : null}
                  {commandSummary.stderrLength !== null ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.stderr", {
                        value: commandSummary.stderrLength,
                      })}
                    </span>
                  ) : null}
                  {commandSummary.sandboxed === true ? (
                    <span>
                      {commandSummary.sandboxType
                        ? t(
                            "agentChat.toolCall.commandSummary.sandboxEnabledWithType",
                            { type: commandSummary.sandboxType },
                          )
                        : t("agentChat.toolCall.commandSummary.sandboxEnabled")}
                    </span>
                  ) : null}
                  {commandSummary.sandboxed === false ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.sandboxDisabled")}
                    </span>
                  ) : null}
                  {commandSummary.outputTruncated === true ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.truncated")}
                    </span>
                  ) : null}
                  {commandSurfaceLabel ? (
                    <span>{commandSurfaceLabel}</span>
                  ) : null}
                  {commandEncoding ? (
                    <span>
                      {t("agentChat.toolCall.commandSummary.encoding", {
                        value: commandEncoding,
                      })}
                    </span>
                  ) : null}
                  {commandDecodedWithLabel ? (
                    <span>{commandDecodedWithLabel}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {commandOutputStreams.length > 0 ? (
            <div
              className="rounded-[12px] border border-slate-200 bg-white"
              data-testid="tool-call-command-output-streams"
            >
              <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700">
                {t("agentChat.toolCall.commandOutput.title")}
              </div>
              <div className="divide-y divide-slate-100">
                {commandOutputStreams.map((stream) => (
                  <div
                    key={stream.key}
                    className="px-3 py-2"
                    data-testid={`tool-call-command-output-${stream.key}`}
                  >
                    <div
                      className={cn(
                        "mb-1 text-[11px] font-semibold",
                        stream.tone === "error"
                          ? "text-rose-700"
                          : "text-slate-600",
                      )}
                    >
                      {t(`agentChat.toolCall.commandOutput.${stream.key}`)}
                    </div>
                    <pre
                      className={cn(
                        "max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed",
                        stream.tone === "error"
                          ? "text-rose-800"
                          : "text-slate-800",
                      )}
                    >
                      {stream.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {diffReviewSummary ? (
            <div
              className="rounded-[12px] border border-slate-200 bg-white"
              data-testid="tool-call-diff-review"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <div className="text-[11px] font-semibold text-slate-700">
                  {t("agentChat.toolCall.diffReview.title")}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                  <span>
                    {t("agentChat.toolCall.diffReview.files", {
                      count: diffReviewSummary.files.length,
                    })}
                  </span>
                  <span className="text-emerald-700">
                    {t("agentChat.toolCall.diffReview.additions", {
                      count: diffReviewSummary.additions,
                    })}
                  </span>
                  <span className="text-rose-700">
                    {t("agentChat.toolCall.diffReview.deletions", {
                      count: diffReviewSummary.deletions,
                    })}
                  </span>
                  <span>
                    {t("agentChat.toolCall.diffReview.hunks", {
                      count: diffReviewSummary.hunks,
                    })}
                  </span>
                </div>
              </div>
              {diffReviewScopeItems.length > 0 ? (
                <div
                  className="border-b border-slate-100 bg-slate-50/70 px-3 py-2"
                  data-testid="tool-call-diff-review-scope"
                >
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                    <FolderTree className="h-3.5 w-3.5 text-slate-500" />
                    <span>{t("agentChat.toolCall.diffReview.scopeTitle")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {diffReviewScopeItems.map((scope) => (
                      <div
                        key={scope.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                        data-testid="tool-call-diff-review-scope-item"
                      >
                        <code className="max-w-56 truncate font-mono text-slate-800">
                          {scope.label ||
                            t("agentChat.toolCall.diffReview.scopeRoot")}
                        </code>
                        <span className="text-slate-500">
                          {t("agentChat.toolCall.diffReview.files", {
                            count: scope.fileCount,
                          })}
                        </span>
                        <span className="text-emerald-700">
                          +{scope.additions}
                        </span>
                        <span className="text-rose-700">
                          -{scope.deletions}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="divide-y divide-slate-100">
                {diffReviewSummary.files.map((file) => {
                  const isDiffFileExpanded = Boolean(
                    expandedDiffFileIds[file.id],
                  );
                  const visibleLines = isDiffFileExpanded
                    ? file.lines
                    : file.previewLines;
                  const hiddenLineCount = Math.max(
                    file.lines.length - file.previewLines.length,
                    0,
                  );
                  const diffLinesId = `tool-call-diff-lines-${toolCall.id}-${file.id}`;

                  return (
                    <div
                      key={file.id}
                      className="px-3 py-2"
                      data-testid="tool-call-diff-review-file"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            file.status === "added" &&
                              "border-emerald-200 bg-emerald-50 text-emerald-800",
                            file.status === "deleted" &&
                              "border-rose-200 bg-rose-50 text-rose-800",
                            file.status === "modified" &&
                              "border-sky-200 bg-sky-50 text-sky-800",
                            file.status === "unknown" &&
                              "border-slate-200 bg-slate-50 text-slate-700",
                          )}
                        >
                          {t(
                            `agentChat.toolCall.diffReview.status.${file.status}`,
                          )}
                        </span>
                        <code className="min-w-0 break-all font-mono text-[11px] text-slate-800">
                          {file.path}
                        </code>
                        <span className="text-[11px] text-emerald-700">
                          +{file.additions}
                        </span>
                        <span className="text-[11px] text-rose-700">
                          -{file.deletions}
                        </span>
                        {onFileClick ? (
                          <button
                            type="button"
                            className="ml-auto inline-flex items-center justify-center rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={t(
                              "agentChat.toolCall.diffReview.openInCanvasWithTarget",
                              { target: file.path },
                            )}
                            aria-label={t(
                              "agentChat.toolCall.diffReview.openInCanvasWithTarget",
                              { target: file.path },
                            )}
                            onClick={() => handleOpenDiffFileInCanvas(file)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      {visibleLines.length > 0 ? (
                        <div
                          id={diffLinesId}
                          className={cn(
                            "mt-2 overflow-y-auto rounded-[10px] border border-slate-100 bg-slate-50 font-mono text-[11px] leading-relaxed",
                            isDiffFileExpanded ? "max-h-80" : "max-h-36",
                          )}
                          data-testid="tool-call-diff-review-file-lines"
                        >
                          {visibleLines.map((line, index) => (
                            <div
                              key={`${file.id}:${index}`}
                              className={cn(
                                "grid grid-cols-[24px_minmax(0,1fr)] gap-2 px-2 py-0.5",
                                line.kind === "add" &&
                                  "bg-emerald-50 text-emerald-900",
                                line.kind === "remove" &&
                                  "bg-rose-50 text-rose-900",
                                line.kind === "hunk" &&
                                  "bg-sky-50 text-sky-900",
                                line.kind === "context" && "text-slate-700",
                              )}
                            >
                              <span className="select-none text-right text-slate-400">
                                {line.kind === "add"
                                  ? "+"
                                  : line.kind === "remove"
                                    ? "-"
                                    : line.kind === "hunk"
                                      ? "@@"
                                      : ""}
                              </span>
                              <span className="min-w-0 break-all">
                                {line.text || " "}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {hiddenLineCount > 0 ? (
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                          aria-expanded={isDiffFileExpanded}
                          aria-controls={diffLinesId}
                          onClick={() => handleToggleDiffFileExpanded(file.id)}
                        >
                          <span>
                            {isDiffFileExpanded
                              ? t("agentChat.toolCall.diffReview.collapseFile")
                              : t("agentChat.toolCall.diffReview.expandFile", {
                                  count: hiddenLineCount,
                                })}
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              isDiffFileExpanded && "rotate-180",
                            )}
                          />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {resultMetaItems.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {resultMetaItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
          {siteResultNotices.length > 0 ? (
            <div className="space-y-1 text-[11px]">
              {siteResultNotices.map((notice) => (
                <div
                  key={notice.key}
                  className={cn(
                    notice.tone === "success" && "text-emerald-700",
                    notice.tone === "warning" && "text-amber-700",
                    notice.tone === "error" && "text-rose-700",
                    notice.tone === "neutral" && "text-slate-500",
                  )}
                >
                  {notice.text}
                </div>
              ))}
            </div>
          ) : null}
          {savedSiteContentTarget && onOpenSavedSiteContent ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
                onClick={handleOpenSavedSiteContent}
              >
                {openSavedSiteContentLabel}
              </button>
            </div>
          ) : null}
          {resultPath ? (
            <div
              className="break-all text-[11px] text-slate-500"
              title={resultPath.value}
            >
              {resultPath.label}: {resultPath.displayValue}
            </div>
          ) : null}
          {commandOutputStreams.length === 0 ? (
            <div
              className={cn(
                "max-h-64 overflow-y-auto rounded-[14px] border border-slate-200 bg-white p-3",
                isResultFailure && "border-rose-200",
              )}
              data-testid="tool-call-rendered-result"
            >
              <MarkdownRenderer content={renderedResultContent} />
            </div>
          ) : null}
        </div>
      )}

      {previewImageSrc && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-[linear-gradient(180deg,rgba(240,249,255,0.88)_0%,rgba(236,253,245,0.8)_52%,rgba(255,255,255,0.92)_100%)] p-6 backdrop-blur-[2px]"
          onClick={() => setPreviewImageSrc(null)}
        >
          <img
            src={previewImageSrc}
            alt={resultImageAlt}
            className="mx-auto max-h-full max-w-full rounded-lg object-contain"
          />
        </button>
      )}
    </div>
  );
};

// ============ 工具调用列表 ============

interface ToolCallListProps {
  toolCalls: ToolCallState[];
  /** 当前 assistant 消息是否仍在流式输出 */
  isMessageStreaming?: boolean;
  /** 文件点击回调 - 用于打开右边栏显示文件内容 */
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}

export const ToolCallList: React.FC<ToolCallListProps> = ({
  toolCalls,
  isMessageStreaming = false,
  onFileClick,
  onOpenSavedSiteContent,
}) => {
  if (!toolCalls || toolCalls.length === 0) return null;

  const groups = buildToolCallDisplayGroups(toolCalls);

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        if (group.type === "single") {
          return (
            <ToolCallDisplay
              key={group.id}
              toolCall={group.item}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
            />
          );
        }

        if (group.type === "work") {
          if (group.items.length === 1) {
            return (
              <ToolCallDisplay
                key={group.id}
                toolCall={group.items[0]!}
                isMessageStreaming={isMessageStreaming}
                onFileClick={onFileClick}
                onOpenSavedSiteContent={onOpenSavedSiteContent}
              />
            );
          }

          return (
            <WorkToolCallGroup
              key={group.id}
              toolCalls={group.items}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
            />
          );
        }

        return (
          <SearchToolCallGroup
            key={group.id}
            toolCalls={group.items}
            isMessageStreaming={isMessageStreaming}
            onFileClick={onFileClick}
            onOpenSavedSiteContent={onOpenSavedSiteContent}
          />
        );
      })}
    </div>
  );
};

function WorkToolCallGroup({
  toolCalls,
  isMessageStreaming,
  onFileClick,
  onOpenSavedSiteContent,
}: {
  toolCalls: ToolCallState[];
  isMessageStreaming: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}) {
  const { t } = useTranslation("agent");
  const hasRunning = toolCalls.some((item) => item.status === "running");
  const hasFailed = toolCalls.some((item) => item.status === "failed");
  const [expanded, setExpanded] = useState(hasRunning || hasFailed);
  const headline = buildToolGroupHeadline(toolCalls);
  const preview = buildToolGroupPreview(toolCalls, (count) =>
    t("agentChat.toolCall.group.hiddenItems", { count }),
  );

  useEffect(() => {
    if (hasRunning || hasFailed) {
      setExpanded(true);
    }
  }, [hasFailed, hasRunning]);

  return (
    <div className="py-0.5" data-testid="tool-call-work-group">
      <button
        type="button"
        className="flex w-full items-start gap-2.5 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={
          expanded
            ? t("agentChat.toolCall.group.collapseWork")
            : t("agentChat.toolCall.group.expandWork")
        }
      >
        <span className="pt-0.5 text-sm text-slate-400">•</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">
            {headline}
          </span>
          {!expanded && preview ? (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {preview}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 text-slate-500 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="ml-6 space-y-1">
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay
              key={toolCall.id}
              toolCall={toolCall}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              grouped={true}
              groupMarker={index === 0 ? "└" : "·"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchToolCallGroup({
  toolCalls,
  isMessageStreaming,
  onFileClick,
  onOpenSavedSiteContent,
}: {
  toolCalls: ToolCallState[];
  isMessageStreaming: boolean;
  onFileClick?: (fileName: string, content: string) => void;
  onOpenSavedSiteContent?: (target: SiteSavedContentTarget) => void;
}) {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(true);
  const headline = buildToolGroupHeadline(toolCalls);
  const queryPreview = toolCalls
    .slice(0, 2)
    .map(extractSearchQueryLabelFromInfo)
    .join(" · ");
  const hiddenCount = Math.max(toolCalls.length - 2, 0);

  return (
    <div className="py-0.5">
      <button
        type="button"
        className="flex w-full items-start gap-2.5 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={
          expanded
            ? t("agentChat.toolCall.group.collapseSearch")
            : t("agentChat.toolCall.group.expandSearch")
        }
      >
        <span className="pt-0.5 text-sm text-slate-400">•</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-900">
            {headline}
          </span>
          {!expanded ? (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {queryPreview}
              {hiddenCount > 0
                ? t("agentChat.toolCall.group.hiddenSearchGroups", {
                    count: hiddenCount,
                  })
                : ""}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 text-slate-500 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="ml-6 space-y-1">
          {toolCalls.map((toolCall, index) => (
            <ToolCallDisplay
              key={toolCall.id}
              toolCall={toolCall}
              isMessageStreaming={isMessageStreaming}
              onFileClick={onFileClick}
              onOpenSavedSiteContent={onOpenSavedSiteContent}
              grouped={true}
              groupMarker={index === 0 ? "└" : "·"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// 导出别名，用于交错显示模式
export const ToolCallItem = ToolCallDisplay;
