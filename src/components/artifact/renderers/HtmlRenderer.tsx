/**
 * @file HTML 渲染器组件
 * @description Artifact 系统的 HTML 渲染器，支持沙箱化 iframe 预览、源码切换、响应式尺寸和刷新功能
 * @module components/artifact/renderers/HtmlRenderer
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 14.4
 */

import React, {
  useState,
  useRef,
  useCallback,
  memo,
  useMemo,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Eye,
  Code2,
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactRendererProps } from "@/lib/artifact/types";
import { CodeRenderer } from "./CodeRenderer";

/**
 * 预览尺寸类型
 */
type PreviewSize = "mobile" | "tablet" | "desktop";

/**
 * 预览尺寸配置
 * 定义各设备尺寸的宽度
 */
const PREVIEW_WIDTHS: Record<PreviewSize, number | string> = {
  mobile: 375,
  tablet: 768,
  desktop: "100%",
};

/**
 * 尺寸选项配置
 */
type HtmlRendererPreviewSizeLabelKey =
  | "errors.htmlRenderer.previewSize.mobile"
  | "errors.htmlRenderer.previewSize.tablet"
  | "errors.htmlRenderer.previewSize.desktop";

const SIZE_OPTIONS = [
  {
    value: "mobile",
    labelKey: "errors.htmlRenderer.previewSize.mobile",
    icon: Smartphone,
  },
  {
    value: "tablet",
    labelKey: "errors.htmlRenderer.previewSize.tablet",
    icon: Tablet,
  },
  {
    value: "desktop",
    labelKey: "errors.htmlRenderer.previewSize.desktop",
    icon: Monitor,
  },
] as const satisfies ReadonlyArray<{
  value: PreviewSize;
  labelKey: HtmlRendererPreviewSizeLabelKey;
  icon: React.ComponentType<{ className?: string }>;
}>;

/**
 * 视图模式类型
 */
type ViewMode = "preview" | "source";

/**
 * 流式指示器组件
 */
const StreamingIndicator: React.FC = memo(() => {
  const { t } = useTranslation("errors");

  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>{t("errors.htmlRenderer.status.streaming")}</span>
    </div>
  );
});
StreamingIndicator.displayName = "StreamingIndicator";

/**
 * 错误显示组件
 * Requirement 14.4
 */
interface ErrorDisplayProps {
  message: string;
  content: string;
  onRetry?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(
  ({ message, content, onRetry }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-100">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 mb-1">
              {t("errors.htmlRenderer.error.renderFailed")}
            </h3>
            <p className="text-xs text-red-600">{message}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t("errors.htmlRenderer.action.retry")}</span>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          <h4 className="text-xs font-medium text-gray-500 mb-2">
            {t("errors.htmlRenderer.section.sourceContent")}
          </h4>
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-gray-200">
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
          title={t("errors.htmlRenderer.view.previewTitle")}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{t("errors.htmlRenderer.view.preview")}</span>
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
          title={t("errors.htmlRenderer.view.sourceTitle")}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{t("errors.htmlRenderer.view.source")}</span>
        </button>
      </div>
    );
  },
);
ViewModeToggle.displayName = "ViewModeToggle";

/**
 * 尺寸选择器组件
 */
interface SizeSelectorProps {
  value: PreviewSize;
  onChange: (value: PreviewSize) => void;
}

const SizeSelector: React.FC<SizeSelectorProps> = memo(
  ({ value, onChange }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="inline-flex items-center rounded-md bg-gray-100 p-1">
        {SIZE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center justify-center w-8 h-7 rounded transition-all",
                value === option.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
              title={t(option.labelKey)}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    );
  },
);
SizeSelector.displayName = "SizeSelector";

/**
 * 刷新按钮组件
 */
interface RefreshButtonProps {
  onClick: () => void;
  isRefreshing?: boolean;
}

const RefreshButton: React.FC<RefreshButtonProps> = memo(
  ({ onClick, isRefreshing }) => {
    const { t } = useTranslation("errors");

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isRefreshing}
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded transition-all",
          "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        title={t("errors.htmlRenderer.action.refreshPreview")}
      >
        <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
      </button>
    );
  },
);
RefreshButton.displayName = "RefreshButton";

/**
 * HTML 渲染器组件
 *
 * 功能特性：
 * - 在沙箱化 iframe 中渲染 HTML 内容 (Requirement 5.1)
 * - 使用 sandbox 属性隔离 iframe (Requirement 5.2)
 * - 提供预览/源码视图切换 (Requirement 5.3)
 * - 支持响应式预览尺寸（手机/平板/桌面）(Requirement 5.4)
 * - 脚本仅在沙箱内执行 (Requirement 5.5)
 * - 提供刷新功能重新渲染内容 (Requirement 5.6)
 *
 * @param artifact - 要渲染的 Artifact 对象
 * @param isStreaming - 是否处于流式生成状态
 */
export const HtmlRenderer: React.FC<ArtifactRendererProps> = memo(
  ({ artifact, isStreaming = false }) => {
    const { t } = useTranslation("errors");
    // 视图模式状态
    const [viewMode, setViewMode] = useState<ViewMode>("preview");
    // 预览尺寸状态
    const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
    // 刷新状态
    const [isRefreshing, setIsRefreshing] = useState(false);
    // 错误状态
    const [error, setError] = useState<string | null>(null);
    // iframe 引用
    const iframeRef = useRef<HTMLIFrameElement>(null);

    /**
     * 验证 HTML 内容
     * Requirement 14.4
     */
    useEffect(() => {
      try {
        if (!artifact.content || typeof artifact.content !== "string") {
          throw new Error(t("errors.htmlRenderer.error.emptyOrInvalidContent"));
        }
        setError(null);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("errors.htmlRenderer.error.validationFailed");
        console.error(
          "[HtmlRenderer] Error validating content:",
          errorMessage,
          err,
        );
        setError(errorMessage);
      }
    }, [artifact.content, t]);

    /**
     * 刷新预览
     * 通过重新设置 srcdoc 来刷新 iframe 内容
     */
    const refreshPreview = useCallback(() => {
      try {
        if (iframeRef.current) {
          setIsRefreshing(true);
          setError(null);
          // 先清空再设置，确保触发重新渲染
          iframeRef.current.srcdoc = "";
          // 使用 requestAnimationFrame 确保 DOM 更新后再设置新内容
          requestAnimationFrame(() => {
            try {
              if (iframeRef.current) {
                iframeRef.current.srcdoc = artifact.content;
              }
            } catch (err) {
              const errorMessage =
                err instanceof Error
                  ? err.message
                  : t("errors.htmlRenderer.error.refreshFailed");
              console.error(
                "[HtmlRenderer] Error refreshing preview:",
                errorMessage,
                err,
              );
              setError(errorMessage);
            }
            // 短暂延迟后取消刷新状态
            setTimeout(() => setIsRefreshing(false), 300);
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("errors.htmlRenderer.error.refreshFailed");
        console.error(
          "[HtmlRenderer] Error in refreshPreview:",
          errorMessage,
          err,
        );
        setError(errorMessage);
        setIsRefreshing(false);
      }
    }, [artifact.content, t]);

    /**
     * 处理 iframe 加载错误
     * Requirement 14.4
     */
    const handleIframeError = useCallback(() => {
      const errorMessage = t("errors.htmlRenderer.error.iframeLoadFailed");
      console.error("[HtmlRenderer] Error loading iframe:", errorMessage);
      setError(errorMessage);
    }, [t]);

    /**
     * 计算 iframe 样式
     */
    const iframeStyle = useMemo(() => {
      const width = PREVIEW_WIDTHS[previewSize];
      return {
        width: typeof width === "number" ? `${width}px` : width,
        height: "100%",
        maxWidth: "100%",
      };
    }, [previewSize]);

    /**
     * 创建用于源码视图的 artifact 对象
     */
    const sourceArtifact = useMemo(
      () => ({
        ...artifact,
        type: "code" as const,
        meta: { ...artifact.meta, language: "html" },
      }),
      [artifact],
    );

    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden border border-gray-200">
        {/* 工具栏 */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50">
          {/* 视图模式切换 */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {/* 预览尺寸选择器（仅在预览模式显示） */}
          {viewMode === "preview" && (
            <>
              <div className="w-px h-5 bg-gray-300" />
              <SizeSelector value={previewSize} onChange={setPreviewSize} />
            </>
          )}

          {/* 刷新按钮（仅在预览模式显示） */}
          {viewMode === "preview" && (
            <RefreshButton
              onClick={refreshPreview}
              isRefreshing={isRefreshing}
            />
          )}

          {/* 当前尺寸标签 */}
          {viewMode === "preview" && previewSize !== "desktop" && (
            <span className="text-xs text-gray-500 ml-auto">
              {PREVIEW_WIDTHS[previewSize]}px
            </span>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto relative bg-gray-100">
          {error ? (
            /* 错误显示 - Requirement 14.4 */
            <ErrorDisplay
              message={error}
              content={artifact.content}
              onRetry={refreshPreview}
            />
          ) : viewMode === "preview" ? (
            <div className="h-full flex items-start justify-center p-4">
              {/* 
                沙箱化 iframe
                - sandbox="allow-scripts" 允许脚本执行但限制其他能力
                - 脚本无法访问父窗口、无法导航、无法提交表单等
                Requirement 5.1, 5.2, 5.5
              */}
              <iframe
                ref={iframeRef}
                srcDoc={artifact.content}
                sandbox="allow-scripts"
                style={iframeStyle}
                className={cn(
                  "bg-white border-0 shadow-sm transition-all duration-200",
                  previewSize !== "desktop" &&
                    "rounded-lg border border-gray-300",
                )}
                title={artifact.title || t("errors.htmlRenderer.iframe.title")}
                onError={handleIframeError}
              />
            </div>
          ) : (
            /* 源码视图 - 复用 CodeRenderer */
            <CodeRenderer artifact={sourceArtifact} isStreaming={isStreaming} />
          )}

          {/* 流式指示器 */}
          {isStreaming && <StreamingIndicator />}
        </div>
      </div>
    );
  },
);

HtmlRenderer.displayName = "HtmlRenderer";

export default HtmlRenderer;
