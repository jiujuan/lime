/**
 * @file 代码渲染器组件（虚拟化版本）
 * @description Artifact 系统的代码渲染器，使用 @tanstack/react-virtual 实现虚拟滚动
 *              解决长代码渲染时的性能问题（花屏、卡顿）
 *              支持 HTML 代码的预览/源码切换
 * @module components/artifact/renderers/CodeRenderer
 * @requirements 4.1, 4.2, 4.3, 4.4, 4.6, 14.4
 */

import React, {
  useState,
  useCallback,
  useMemo,
  memo,
  useRef,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { refractor } from "refractor";
import { toHtml } from "hast-util-to-html";
import {
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  Code2,
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
} from "lucide-react";
import "./code-highlight.css";
import { cn } from "@/lib/utils";
import type { ArtifactRendererProps } from "@/lib/artifact/types";

/** 行高常量 */
const LINE_HEIGHT = 20;
/** 行号宽度 */
const LINE_NUMBER_WIDTH = 48;
/** 虚拟化阈值：超过此行数启用虚拟滚动 */
const VIRTUALIZATION_THRESHOLD = 100;

/** 视图模式类型 */
type ViewMode = "source" | "preview";

/** 预览尺寸类型 */
type PreviewSize = "mobile" | "tablet" | "desktop";

/** 预览尺寸配置 */
const PREVIEW_WIDTHS: Record<PreviewSize, number | string> = {
  mobile: 375,
  tablet: 768,
  desktop: "100%",
};

/** 支持预览的语言列表 */
const PREVIEWABLE_LANGUAGES = ["html", "svg"];

/**
 * 语言名称映射表
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  dockerfile: "docker",
  plaintext: "text",
  txt: "text",
};

/**
 * 规范化语言名称
 */
function normalizeLanguage(language: string | undefined): string {
  if (!language) return "text";
  const lower = language.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] || lower;
}

/**
 * 检查 refractor 是否支持该语言
 */
function isLanguageSupported(lang: string): boolean {
  try {
    return refractor.registered(lang);
  } catch {
    return false;
  }
}

/**
 * 高亮单行代码
 * @param line - 代码行内容
 * @param language - 语言
 * @returns 高亮后的 HTML 字符串
 */
function highlightLine(line: string, language: string): string {
  if (!line || language === "text" || !isLanguageSupported(language)) {
    return escapeHtml(line || " ");
  }

  try {
    const tree = refractor.highlight(line, language);
    return toHtml(tree);
  } catch {
    return escapeHtml(line);
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 复制按钮组件
 */
interface CopyButtonProps {
  copied: boolean;
  onClick: () => void;
}

const CopyButton: React.FC<CopyButtonProps> = memo(({ copied, onClick }) => {
  const { t } = useTranslation("errors");

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
        "hover:bg-white/10",
        copied ? "text-green-400" : "text-gray-400 hover:text-white",
      )}
      title={
        copied
          ? t("errors.codeRenderer.action.copied")
          : t("errors.codeRenderer.action.copyCode")
      }
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          <span>{t("errors.codeRenderer.action.copied")}</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>{t("errors.codeRenderer.action.copy")}</span>
        </>
      )}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

/**
 * 错误显示组件
 */
interface ErrorDisplayProps {
  message: string;
  content: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(
  ({ message, content }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="flex flex-col h-full bg-[#282c34]">
        <div className="flex items-start gap-3 p-4 bg-red-900/30 border-b border-red-500/30">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-300 mb-1">
              {t("errors.codeRenderer.error.renderFailed")}
            </h3>
            <p className="text-xs text-red-400">{message}</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">
            {t("errors.codeRenderer.section.originalContent")}
          </h4>
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
            {content}
          </pre>
        </div>
      </div>
    );
  },
);
ErrorDisplay.displayName = "ErrorDisplay";

/**
 * 视图模式切换按钮组件
 */
interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = memo(
  ({ value, onChange }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="inline-flex items-center rounded bg-white/5 p-0.5">
        <button
          type="button"
          onClick={() => onChange("source")}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
            value === "source"
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:text-white",
          )}
          title={t("errors.codeRenderer.view.source")}
        >
          <Code2 className="w-3 h-3" />
          <span>{t("errors.codeRenderer.view.source")}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange("preview")}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
            value === "preview"
              ? "bg-white/10 text-white"
              : "text-gray-400 hover:text-white",
          )}
          title={t("errors.codeRenderer.view.preview")}
        >
          <Eye className="w-3 h-3" />
          <span>{t("errors.codeRenderer.view.preview")}</span>
        </button>
      </div>
    );
  },
);
ViewModeToggle.displayName = "ViewModeToggle";

/**
 * 预览尺寸选择器组件
 */
interface SizeSelectorProps {
  value: PreviewSize;
  onChange: (value: PreviewSize) => void;
}

const SizeSelector: React.FC<SizeSelectorProps> = memo(
  ({ value, onChange }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="inline-flex items-center rounded bg-white/5 p-0.5">
        <button
          type="button"
          onClick={() => onChange("mobile")}
          className={cn(
            "p-1 rounded transition-all",
            value === "mobile"
              ? "bg-white/10 text-white"
              : "text-gray-500 hover:text-white",
          )}
          title={t("errors.codeRenderer.previewSize.mobile")}
        >
          <Smartphone className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange("tablet")}
          className={cn(
            "p-1 rounded transition-all",
            value === "tablet"
              ? "bg-white/10 text-white"
              : "text-gray-500 hover:text-white",
          )}
          title={t("errors.codeRenderer.previewSize.tablet")}
        >
          <Tablet className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange("desktop")}
          className={cn(
            "p-1 rounded transition-all",
            value === "desktop"
              ? "bg-white/10 text-white"
              : "text-gray-500 hover:text-white",
          )}
          title={t("errors.codeRenderer.previewSize.desktop")}
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  },
);
SizeSelector.displayName = "SizeSelector";

/**
 * HTML 预览组件
 */
interface HtmlPreviewProps {
  content: string;
  size: PreviewSize;
  onRefresh: () => void;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = memo(
  ({ content, size, onRefresh }) => {
    const { t } = useTranslation("errors");
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const width = PREVIEW_WIDTHS[size];

    return (
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="h-full flex items-start justify-center">
          <div
            className="relative"
            style={{
              width: typeof width === "number" ? `${width}px` : width,
              maxWidth: "100%",
            }}
          >
            <button
              type="button"
              onClick={onRefresh}
              className="absolute -top-8 right-0 p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
              title={t("errors.codeRenderer.action.refreshPreview")}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <iframe
              ref={iframeRef}
              srcDoc={content}
              sandbox="allow-scripts"
              className={cn(
                "w-full h-full min-h-[400px] bg-white border-0 shadow-sm",
                size !== "desktop" && "rounded-lg border border-gray-300",
              )}
              title={t("errors.codeRenderer.iframe.htmlPreview")}
            />
          </div>
        </div>
      </div>
    );
  },
);
HtmlPreview.displayName = "HtmlPreview";

/**
 * 单行代码组件（用于虚拟列表）
 */
interface CodeLineProps {
  lineNumber: number;
  content: string;
  showLineNumbers: boolean;
}

const CodeLine: React.FC<CodeLineProps> = memo(
  ({ lineNumber, content, showLineNumbers }) => (
    <div
      className="flex"
      style={{
        height: LINE_HEIGHT,
        lineHeight: `${LINE_HEIGHT}px`,
      }}
    >
      {showLineNumbers && (
        <span
          className="flex-shrink-0 text-right pr-4 select-none text-[#636d83]"
          style={{
            width: LINE_NUMBER_WIDTH,
            fontSize: "13px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          {lineNumber}
        </span>
      )}
      <span
        className="flex-1 whitespace-pre"
        style={{
          fontSize: "13px",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
        dangerouslySetInnerHTML={{ __html: content || "&nbsp;" }}
      />
    </div>
  ),
);
CodeLine.displayName = "CodeLine";

/**
 * 虚拟化代码视图组件
 */
interface VirtualizedCodeViewProps {
  lines: string[];
  highlightedLines: string[];
  showLineNumbers: boolean;
}

const VirtualizedCodeView: React.FC<VirtualizedCodeViewProps> = memo(
  ({ lines, highlightedLines, showLineNumbers }) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
      count: lines.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => LINE_HEIGHT,
      overscan: 10, // 预渲染上下各 10 行，减少滚动时的空白
    });

    return (
      <div
        ref={parentRef}
        className="flex-1 overflow-auto p-3"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <CodeLine
                lineNumber={virtualRow.index + 1}
                content={highlightedLines[virtualRow.index]}
                showLineNumbers={showLineNumbers}
              />
            </div>
          ))}
        </div>
      </div>
    );
  },
);
VirtualizedCodeView.displayName = "VirtualizedCodeView";

/**
 * 普通代码视图组件（行数较少时使用）
 */
interface SimpleCodeViewProps {
  highlightedLines: string[];
  showLineNumbers: boolean;
}

const SimpleCodeView: React.FC<SimpleCodeViewProps> = memo(
  ({ highlightedLines, showLineNumbers }) => (
    <div className="flex-1 overflow-auto p-3">
      {highlightedLines.map((content, index) => (
        <CodeLine
          key={index}
          lineNumber={index + 1}
          content={content}
          showLineNumbers={showLineNumbers}
        />
      ))}
    </div>
  ),
);
SimpleCodeView.displayName = "SimpleCodeView";

/**
 * 代码渲染器组件（虚拟化版本）
 *
 * 功能特性：
 * - 使用 refractor 实现语法高亮 (Requirement 4.1)
 * - 显示行号 (Requirement 4.2)
 * - 提供复制到剪贴板功能 (Requirement 4.3)
 * - 支持从 artifact 元数据检测语言 (Requirement 4.4)
 * - 支持流式内容更新，无闪烁 (Requirement 4.6)
 * - 使用 @tanstack/react-virtual 实现虚拟滚动，解决长代码性能问题
 * - HTML/SVG 代码支持预览/源码切换
 */
export const CodeRenderer: React.FC<ArtifactRendererProps> = memo(
  ({
    artifact,
    isStreaming = false,
    hideToolbar = false,
    viewMode: externalViewMode,
    previewSize: externalPreviewSize,
    onViewModeChange,
    onPreviewSizeChange,
  }) => {
    const { t } = useTranslation("errors");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // 内部状态（当没有外部控制时使用）
    const [internalViewMode, setInternalViewMode] =
      useState<ViewMode>("source");
    const [internalPreviewSize, setInternalPreviewSize] =
      useState<PreviewSize>("desktop");
    const [refreshKey, setRefreshKey] = useState(0);

    // 使用外部状态或内部状态
    const viewMode = externalViewMode ?? internalViewMode;
    const previewSize = externalPreviewSize ?? internalPreviewSize;

    // 处理视图模式变更
    const handleViewModeChange = useCallback(
      (mode: ViewMode) => {
        if (onViewModeChange) {
          onViewModeChange(mode);
        } else {
          setInternalViewMode(mode);
        }
      },
      [onViewModeChange],
    );

    // 处理预览尺寸变更
    const handlePreviewSizeChange = useCallback(
      (size: PreviewSize) => {
        if (onPreviewSizeChange) {
          onPreviewSizeChange(size);
        } else {
          setInternalPreviewSize(size);
        }
      },
      [onPreviewSizeChange],
    );

    // 规范化语言
    const language = useMemo(() => {
      try {
        return normalizeLanguage(artifact.meta.language);
      } catch (err) {
        console.error("[CodeRenderer] Error normalizing language:", err);
        return "text";
      }
    }, [artifact.meta.language]);

    // 是否支持预览
    const canPreview = PREVIEWABLE_LANGUAGES.includes(language);

    // 分割代码为行
    const lines = useMemo(() => {
      if (!artifact.content) return [""];
      return artifact.content.split("\n");
    }, [artifact.content]);

    // 是否显示行号
    const showLineNumbers = lines.length > 1;

    // 是否使用虚拟化
    const useVirtualization = lines.length > VIRTUALIZATION_THRESHOLD;

    // 高亮所有行（带缓存）
    const highlightedLines = useMemo(() => {
      return lines.map((line) => highlightLine(line, language));
    }, [lines, language]);

    // 复制代码
    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("[CodeRenderer] Error copying:", err);
      }
    }, [artifact.content]);

    // 刷新预览
    const handleRefresh = useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []);

    // 验证内容
    useEffect(() => {
      if (artifact.content === null || artifact.content === undefined) {
        setError(t("errors.codeRenderer.error.emptyContent"));
      } else {
        setError(null);
      }
    }, [artifact.content, t]);

    if (error) {
      return <ErrorDisplay message={error} content={artifact.content || ""} />;
    }

    return (
      <div className="code-renderer relative h-full flex flex-col bg-[#282c34] rounded-lg overflow-hidden">
        {/* 工具栏（当外部有工具栏时隐藏） */}
        {!hideToolbar && (
          <div className="flex items-center justify-between px-3 py-2 bg-[#21252b] border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-mono">
                {language}
              </span>
              {isStreaming ? (
                <span className="flex items-center gap-1.5 text-xs text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t("errors.codeRenderer.status.streaming")}</span>
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {t("errors.codeRenderer.status.lineCount", {
                    count: lines.length,
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 预览/源码切换（仅 HTML/SVG） */}
              {canPreview && (
                <ViewModeToggle
                  value={viewMode}
                  onChange={handleViewModeChange}
                />
              )}
              {/* 预览尺寸选择器 */}
              {canPreview && viewMode === "preview" && (
                <SizeSelector
                  value={previewSize}
                  onChange={handlePreviewSizeChange}
                />
              )}
              <CopyButton copied={copied} onClick={handleCopy} />
            </div>
          </div>
        )}

        {/* 内容区域 */}
        {viewMode === "preview" && canPreview ? (
          <HtmlPreview
            key={refreshKey}
            content={artifact.content}
            size={previewSize}
            onRefresh={handleRefresh}
          />
        ) : useVirtualization ? (
          <VirtualizedCodeView
            lines={lines}
            highlightedLines={highlightedLines}
            showLineNumbers={showLineNumbers}
          />
        ) : (
          <SimpleCodeView
            highlightedLines={highlightedLines}
            showLineNumbers={showLineNumbers}
          />
        )}
      </div>
    );
  },
);

CodeRenderer.displayName = "CodeRenderer";

export default CodeRenderer;
