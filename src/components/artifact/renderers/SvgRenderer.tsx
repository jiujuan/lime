/**
 * @file SVG 渲染器组件
 * @description Artifact 系统的 SVG 渲染器，支持内联渲染、缩放控制、下载功能和预览/源码切换
 * @module components/artifact/renderers/SvgRenderer
 * @requirements 6.1, 6.2, 6.4, 6.5, 14.4
 */

import React, { useState, useRef, useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import {
  Eye,
  Code2,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactRendererProps } from "@/lib/artifact/types";
import { CodeRenderer } from "./CodeRenderer";

/**
 * 视图模式类型
 */
type ViewMode = "preview" | "source";

/**
 * 缩放级别配置
 */
const ZOOM_LEVELS = {
  min: 0.25,
  max: 4,
  step: 0.25,
  default: 1,
};

/**
 * 流式指示器组件
 */
const StreamingIndicator: React.FC<{ label: string }> = memo(({ label }) => (
  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
    <Loader2 className="w-3 h-3 animate-spin" />
    <span>{label}</span>
  </div>
));
StreamingIndicator.displayName = "StreamingIndicator";

/**
 * 视图模式切换按钮组件
 */
interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  copy: {
    previewLabel: string;
    previewTitle: string;
    sourceLabel: string;
    sourceTitle: string;
  };
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = memo(
  ({ value, onChange, copy }) => (
    <div className="inline-flex items-center rounded-md bg-gray-100 p-1">
      <button
        type="button"
        onClick={() => onChange("preview")}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all",
          value === "preview"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900",
        )}
        title={copy.previewTitle}
      >
        <Eye className="w-3.5 h-3.5" />
        <span>{copy.previewLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("source")}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all",
          value === "source"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900",
        )}
        title={copy.sourceTitle}
      >
        <Code2 className="w-3.5 h-3.5" />
        <span>{copy.sourceLabel}</span>
      </button>
    </div>
  ),
);
ViewModeToggle.displayName = "ViewModeToggle";

/**
 * 缩放控制组件
 */
interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  copy: {
    zoomOutTitle: string;
    zoomInTitle: string;
    fitToViewTitle: string;
  };
}

const ZoomControls: React.FC<ZoomControlsProps> = memo(
  ({ zoom, onZoomChange, copy }) => {
    const handleZoomIn = useCallback(() => {
      onZoomChange(Math.min(zoom + ZOOM_LEVELS.step, ZOOM_LEVELS.max));
    }, [zoom, onZoomChange]);

    const handleZoomOut = useCallback(() => {
      onZoomChange(Math.max(zoom - ZOOM_LEVELS.step, ZOOM_LEVELS.min));
    }, [zoom, onZoomChange]);

    const handleFitToView = useCallback(() => {
      onZoomChange(ZOOM_LEVELS.default);
    }, [onZoomChange]);

    const zoomPercentage = Math.round(zoom * 100);

    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_LEVELS.min}
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded transition-all",
            "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          title={copy.zoomOutTitle}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="min-w-[3.5rem] text-center text-xs text-gray-600 font-medium">
          {zoomPercentage}%
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_LEVELS.max}
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded transition-all",
            "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          title={copy.zoomInTitle}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFitToView}
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded transition-all",
            "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
          )}
          title={copy.fitToViewTitle}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  },
);
ZoomControls.displayName = "ZoomControls";

/**
 * 下载按钮组件
 */
interface DownloadButtonProps {
  onClick: () => void;
  title: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = memo(
  ({ onClick, title }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded transition-all",
        "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
      )}
      title={title}
    >
      <Download className="w-4 h-4" />
    </button>
  ),
);
DownloadButton.displayName = "DownloadButton";

/**
 * 错误显示组件
 */
interface ErrorDisplayProps {
  message: string;
  title: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(({ message, title }) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
    <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
    <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
    <p className="text-sm text-gray-500 max-w-md">{message}</p>
  </div>
));
ErrorDisplay.displayName = "ErrorDisplay";

/**
 * 验证 SVG 内容是否有效
 * @param content - SVG 内容字符串
 * @returns 是否为有效的 SVG
 */
function isValidSvg(content: string): boolean {
  try {
    if (!content || typeof content !== "string") {
      console.error(
        "[SvgRenderer] Error: SVG content is empty or not a string",
      );
      return false;
    }
    const trimmed = content.trim();
    // 检查是否以 <svg 开头（允许有 XML 声明）
    const isValid =
      trimmed.startsWith("<svg") ||
      trimmed.startsWith("<?xml") ||
      trimmed.includes("<svg");
    if (!isValid) {
      console.error(
        "[SvgRenderer] Error: Content does not appear to be valid SVG",
      );
    }
    return isValid;
  } catch (err) {
    console.error("[SvgRenderer] Error validating SVG:", err);
    return false;
  }
}

/**
 * 清理 SVG 内容，移除潜在的危险元素
 * @param content - 原始 SVG 内容
 * @returns 清理后的 SVG 内容
 */
function sanitizeSvg(content: string): string {
  try {
    // 移除 script 标签
    let sanitized = content.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      "",
    );
    // 移除 on* 事件处理器
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
    return sanitized;
  } catch (err) {
    console.error("[SvgRenderer] Error sanitizing SVG:", err);
    return content;
  }
}

/**
 * SVG 渲染器组件
 *
 * 功能特性：
 * - 内联渲染 SVG 内容 (Requirement 6.1)
 * - 提供缩放控制（放大、缩小、适应视图）(Requirement 6.2)
 * - 提供下载为 SVG 文件功能 (Requirement 6.4)
 * - 提供预览/源码视图切换 (Requirement 6.5)
 *
 * @param artifact - 要渲染的 Artifact 对象
 * @param isStreaming - 是否处于流式生成状态
 */
export const SvgRenderer: React.FC<ArtifactRendererProps> = memo(
  ({ artifact, isStreaming = false }) => {
    const { t } = useTranslation("errors");
    // 视图模式状态
    const [viewMode, setViewMode] = useState<ViewMode>("preview");
    // 缩放级别状态
    const [zoom, setZoom] = useState(ZOOM_LEVELS.default);
    // 容器引用
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 下载 SVG 文件
     * Requirement 6.4
     */
    const handleDownload = useCallback(() => {
      try {
        const blob = new Blob([artifact.content], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = artifact.meta.filename || "image.svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "下载失败";
        console.error(
          "[SvgRenderer] Error downloading SVG:",
          errorMessage,
          err,
        );
      }
    }, [artifact.content, artifact.meta.filename]);

    /**
     * 验证并清理 SVG 内容
     * Requirement 14.4
     */
    const { isValid, sanitizedContent, errorMessage } = useMemo(() => {
      try {
        if (!isValidSvg(artifact.content)) {
          const msg = t("errors.svgRenderer.error.invalidContent", {
            defaultValue: "SVG 内容格式无效，请检查是否为有效的 SVG 代码",
          });
          console.error("[SvgRenderer] Error:", msg);
          return {
            isValid: false,
            sanitizedContent: "",
            errorMessage: msg,
          };
        }
        return {
          isValid: true,
          sanitizedContent: sanitizeSvg(artifact.content),
          errorMessage: null,
        };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : t("errors.svgRenderer.error.processingFailed", {
                defaultValue: "SVG 处理失败",
              });
        console.error("[SvgRenderer] Error processing SVG:", msg, err);
        return {
          isValid: false,
          sanitizedContent: "",
          errorMessage: msg,
        };
      }
    }, [artifact.content, t]);

    /**
     * 创建用于源码视图的 artifact 对象
     */
    const sourceArtifact = useMemo(
      () => ({
        ...artifact,
        type: "code" as const,
        meta: { ...artifact.meta, language: "xml" },
      }),
      [artifact],
    );

    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden border border-gray-200">
        {/* 工具栏 */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50">
          {/* 视图模式切换 */}
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            copy={{
              previewLabel: t("errors.svgRenderer.view.preview", {
                defaultValue: "预览",
              }),
              previewTitle: t("errors.svgRenderer.view.previewTitle", {
                defaultValue: "预览模式",
              }),
              sourceLabel: t("errors.svgRenderer.view.source", {
                defaultValue: "源码",
              }),
              sourceTitle: t("errors.svgRenderer.view.sourceTitle", {
                defaultValue: "源码模式",
              }),
            }}
          />

          {/* 缩放控制（仅在预览模式显示） */}
          {viewMode === "preview" && (
            <>
              <div className="w-px h-5 bg-gray-300" />
              <ZoomControls
                zoom={zoom}
                onZoomChange={setZoom}
                copy={{
                  zoomOutTitle: t("errors.svgRenderer.zoom.out", {
                    defaultValue: "缩小",
                  }),
                  zoomInTitle: t("errors.svgRenderer.zoom.in", {
                    defaultValue: "放大",
                  }),
                  fitToViewTitle: t("errors.svgRenderer.zoom.fit", {
                    defaultValue: "适应视图",
                  }),
                }}
              />
            </>
          )}

          {/* 下载按钮 */}
          <div className="ml-auto">
            <DownloadButton
              onClick={handleDownload}
              title={t("errors.svgRenderer.action.download", {
                defaultValue: "下载 SVG",
              })}
            />
          </div>
        </div>

        {/* 内容区域 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative bg-gray-100"
        >
          {viewMode === "preview" ? (
            isValid ? (
              <div className="h-full flex items-center justify-center p-4">
                {/* 
                  SVG 内联渲染
                  - 使用 transform: scale() 实现缩放
                  - transformOrigin: center 确保从中心缩放
                  Requirement 6.1, 6.2
                */}
                <div
                  className="transition-transform duration-200 ease-out"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center",
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />
              </div>
            ) : (
              /* 错误显示 - Requirement 6.6 */
              <ErrorDisplay
                message={
                  errorMessage ||
                  t("errors.svgRenderer.error.renderFailed", {
                    defaultValue: "SVG 渲染失败",
                  })
                }
                title={t("errors.svgRenderer.error.renderFailed", {
                  defaultValue: "SVG 渲染失败",
                })}
              />
            )
          ) : (
            /* 源码视图 - 复用 CodeRenderer */
            <CodeRenderer artifact={sourceArtifact} isStreaming={isStreaming} />
          )}

          {/* 流式指示器 */}
          {isStreaming && (
            <StreamingIndicator
              label={t("errors.svgRenderer.status.streaming", {
                defaultValue: "生成中...",
              })}
            />
          )}
        </div>
      </div>
    );
  },
);

SvgRenderer.displayName = "SvgRenderer";

export default SvgRenderer;
