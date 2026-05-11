/**
 * @file Mermaid 渲染器组件
 * @description Artifact 系统的 Mermaid 渲染器，支持图表渲染、导出功能（PNG/SVG）、主题切换和预览/源码切换
 * @module components/artifact/renderers/MermaidRenderer
 * @requirements 7.1, 7.2, 7.3, 7.4, 7.6, 14.4
 */

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  memo,
} from "react";
import { useTranslation } from "react-i18next";
import mermaid from "mermaid";
import {
  Eye,
  Code2,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  ChevronDown,
  FileImage,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactRendererProps } from "@/lib/artifact/types";
import { CodeRenderer } from "./CodeRenderer";

/**
 * 视图模式类型
 */
type ViewMode = "preview" | "source";

/**
 * 主题类型
 */
type MermaidTheme = "default" | "dark" | "forest" | "neutral";

/**
 * 导出格式类型
 */
type ExportFormat = "svg" | "png";

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
 * 主题配置
 */
type MermaidThemeLabelKey =
  | "errors.mermaidRenderer.theme.default"
  | "errors.mermaidRenderer.theme.dark"
  | "errors.mermaidRenderer.theme.forest"
  | "errors.mermaidRenderer.theme.neutral";

const THEME_OPTIONS = [
  {
    value: "default",
    labelKey: "errors.mermaidRenderer.theme.default",
    icon: <Sun className="w-3.5 h-3.5" />,
  },
  {
    value: "dark",
    labelKey: "errors.mermaidRenderer.theme.dark",
    icon: <Moon className="w-3.5 h-3.5" />,
  },
  {
    value: "forest",
    labelKey: "errors.mermaidRenderer.theme.forest",
    icon: <Sun className="w-3.5 h-3.5" />,
  },
  {
    value: "neutral",
    labelKey: "errors.mermaidRenderer.theme.neutral",
    icon: <Sun className="w-3.5 h-3.5" />,
  },
] as const satisfies ReadonlyArray<{
  value: MermaidTheme;
  labelKey: MermaidThemeLabelKey;
  icon: React.ReactNode;
}>;

/**
 * 流式指示器组件
 */
const StreamingIndicator: React.FC = memo(() => {
  const { t } = useTranslation("errors");

  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>{t("errors.mermaidRenderer.status.streaming")}</span>
    </div>
  );
});
StreamingIndicator.displayName = "StreamingIndicator";

/**
 * 流式占位符组件
 */
const StreamingPlaceholder: React.FC = memo(() => {
  const { t } = useTranslation("errors");

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <Loader2 className="w-12 h-12 text-blue-400 mb-4 animate-spin" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {t("errors.mermaidRenderer.streamingPlaceholder.title")}
      </h3>
      <p className="text-sm text-gray-500">
        {t("errors.mermaidRenderer.streamingPlaceholder.description")}
      </p>
    </div>
  );
});
StreamingPlaceholder.displayName = "StreamingPlaceholder";

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
          title={t("errors.mermaidRenderer.view.previewTitle")}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{t("errors.mermaidRenderer.view.preview")}</span>
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
          title={t("errors.mermaidRenderer.view.sourceTitle")}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{t("errors.mermaidRenderer.view.source")}</span>
        </button>
      </div>
    );
  },
);
ViewModeToggle.displayName = "ViewModeToggle";

/**
 * 缩放控制组件
 */
interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = memo(
  ({ zoom, onZoomChange }) => {
    const { t } = useTranslation("errors");
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
          title={t("errors.mermaidRenderer.zoom.out")}
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
          title={t("errors.mermaidRenderer.zoom.in")}
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
          title={t("errors.mermaidRenderer.zoom.fit")}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  },
);
ZoomControls.displayName = "ZoomControls";

/**
 * 主题选择器组件
 * Requirement 7.6
 */
interface ThemeSelectorProps {
  value: MermaidTheme;
  onChange: (value: MermaidTheme) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = memo(
  ({ value, onChange }) => {
    const { t } = useTranslation("errors");
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭下拉菜单
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const currentTheme = THEME_OPTIONS.find((t) => t.value === value);

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all",
            "text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200",
          )}
          title={t("errors.mermaidRenderer.action.switchTheme")}
        >
          {currentTheme?.icon}
          <span>{currentTheme ? t(currentTheme.labelKey) : null}</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 py-1 bg-white rounded-md shadow-lg border border-gray-200 z-10 min-w-[100px]">
            {THEME_OPTIONS.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => {
                  onChange(theme.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                  value === theme.value
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                {theme.icon}
                <span>{t(theme.labelKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
ThemeSelector.displayName = "ThemeSelector";

/**
 * 导出菜单组件
 * Requirement 7.4
 */
interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}

const ExportMenu: React.FC<ExportMenuProps> = memo(({ onExport, disabled }) => {
  const { t } = useTranslation("errors");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all",
          "text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        title={t("errors.mermaidRenderer.action.exportDiagram")}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{t("errors.mermaidRenderer.action.export")}</span>
        <ChevronDown
          className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 py-1 bg-white rounded-md shadow-lg border border-gray-200 z-10 min-w-[120px]">
          <button
            type="button"
            onClick={() => {
              onExport("svg");
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{t("errors.mermaidRenderer.action.exportSvg")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onExport("png");
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>{t("errors.mermaidRenderer.action.exportPng")}</span>
          </button>
        </div>
      )}
    </div>
  );
});
ExportMenu.displayName = "ExportMenu";

/**
 * 错误显示组件
 * Requirement 7.5
 */
interface ErrorDisplayProps {
  message: string;
  source: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(
  ({ message, source }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-100">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800 mb-1">
              {t("errors.mermaidRenderer.error.syntax")}
            </h3>
            <p className="text-xs text-red-600">{message}</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          <h4 className="text-xs font-medium text-gray-500 mb-2">
            {t("errors.mermaidRenderer.section.sourceContent")}
          </h4>
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-gray-200">
            {source}
          </pre>
        </div>
      </div>
    );
  },
);
ErrorDisplay.displayName = "ErrorDisplay";

/**
 * 下载 Blob 文件的辅助函数
 * @param blob - 要下载的 Blob 对象
 * @param filename - 文件名
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 将 SVG 转换为 Canvas 的辅助函数
 * 用于 PNG 导出
 * @param svgString - SVG 字符串
 * @returns Promise<HTMLCanvasElement>
 */
interface SvgToCanvasMessages {
  canvasContextUnavailable: string;
  imageLoadFailed: string;
}

async function svgToCanvas(
  svgString: string,
  messages: SvgToCanvasMessages,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // 创建 canvas，使用 2x 分辨率以获得更清晰的图像
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error(messages.canvasContextUnavailable));
        return;
      }

      // 设置白色背景
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 缩放并绘制图像
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(messages.imageLoadFailed));
    };

    img.src = url;
  });
}

/**
 * 生成唯一的 Mermaid 渲染 ID
 * 避免多个图表之间的 ID 冲突
 */
let mermaidIdCounter = 0;
function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${++mermaidIdCounter}`;
}

/**
 * Mermaid 渲染器组件
 *
 * 功能特性：
 * - 使用 mermaid 库渲染 Mermaid 语法图表 (Requirement 7.1)
 * - 支持 flowchart, sequence, class, state, ER, gantt 等图表类型 (Requirement 7.2)
 * - 提供缩放控制 (Requirement 7.3)
 * - 提供导出为 PNG/SVG 功能 (Requirement 7.4)
 * - 语法错误时显示错误信息和源码 (Requirement 7.5)
 * - 支持主题切换（light/dark）(Requirement 7.6)
 *
 * @param artifact - 要渲染的 Artifact 对象
 * @param isStreaming - 是否处于流式生成状态
 */
export const MermaidRenderer: React.FC<ArtifactRendererProps> = memo(
  ({ artifact, isStreaming = false }) => {
    const { t } = useTranslation("errors");
    // 视图模式状态
    const [viewMode, setViewMode] = useState<ViewMode>("preview");
    // 渲染后的 SVG 内容
    const [svg, setSvg] = useState<string>("");
    // 错误信息
    const [error, setError] = useState<string | null>(null);
    // 缩放级别
    const [zoom, setZoom] = useState(ZOOM_LEVELS.default);
    // 主题
    const [theme, setTheme] = useState<MermaidTheme>("default");
    // 渲染状态
    const [isRendering, setIsRendering] = useState(false);
    // 容器引用
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 初始化 Mermaid 配置并渲染图表
     * Requirement 7.1, 7.2, 7.6
     */
    useEffect(() => {
      // 流式生成时不渲染，等待内容完成
      if (isStreaming) {
        setSvg("");
        setError(null);
        return;
      }

      // 内容为空时不渲染
      if (!artifact.content.trim()) {
        setSvg("");
        setError(null);
        return;
      }

      const renderDiagram = async () => {
        setIsRendering(true);
        setError(null);

        try {
          // 初始化 Mermaid 配置
          mermaid.initialize({
            startOnLoad: false,
            theme: theme,
            securityLevel: "loose",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            flowchart: {
              useMaxWidth: true,
              htmlLabels: true,
              curve: "basis",
            },
            sequence: {
              useMaxWidth: true,
              diagramMarginX: 50,
              diagramMarginY: 10,
            },
            gantt: {
              useMaxWidth: true,
            },
          });

          // 生成唯一 ID 避免冲突
          const id = generateMermaidId();

          // 渲染图表
          const { svg: renderedSvg } = await mermaid.render(
            id,
            artifact.content,
          );
          setSvg(renderedSvg);
          setError(null);
        } catch (e) {
          const errorMessage =
            e instanceof Error
              ? e.message
              : t("errors.mermaidRenderer.error.renderFailed");
          console.error(
            "[MermaidRenderer] Error rendering diagram:",
            errorMessage,
            e,
          );
          console.error(
            "[MermaidRenderer] Failed content:",
            artifact.content.substring(0, 200),
          );
          setError(errorMessage);
          setSvg("");
        } finally {
          setIsRendering(false);
        }
      };

      renderDiagram();
    }, [artifact.content, artifact.id, isStreaming, theme, t]);

    /**
     * 导出图表
     * Requirement 7.4
     */
    const handleExport = useCallback(
      async (format: ExportFormat) => {
        if (!svg) return;

        const filename = artifact.meta.filename || artifact.title || "diagram";

        try {
          if (format === "svg") {
            // 导出 SVG
            const blob = new Blob([svg], { type: "image/svg+xml" });
            downloadBlob(blob, `${filename}.svg`);
          } else {
            // 导出 PNG
            const canvas = await svgToCanvas(svg, {
              canvasContextUnavailable: t(
                "errors.mermaidRenderer.error.canvasContextUnavailable",
              ),
              imageLoadFailed: t(
                "errors.mermaidRenderer.error.svgImageLoadFailed",
              ),
            });
            canvas.toBlob((blob) => {
              if (blob) {
                downloadBlob(blob, `${filename}.png`);
              }
            }, "image/png");
          }
        } catch (e) {
          const errorMessage =
            e instanceof Error
              ? e.message
              : t("errors.mermaidRenderer.error.exportFailed");
          console.error(
            "[MermaidRenderer] Error exporting diagram:",
            errorMessage,
            e,
          );
        }
      },
      [svg, artifact.meta.filename, artifact.title, t],
    );

    /**
     * 创建用于源码视图的 artifact 对象
     */
    const sourceArtifact = useMemo(
      () => ({
        ...artifact,
        type: "code" as const,
        meta: { ...artifact.meta, language: "mermaid" },
      }),
      [artifact],
    );

    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden border border-gray-200">
        {/* 工具栏 */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-wrap">
          {/* 视图模式切换 */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {/* 预览模式下的控制项 */}
          {viewMode === "preview" && (
            <>
              <div className="w-px h-5 bg-gray-300" />
              {/* 缩放控制 - Requirement 7.3 */}
              <ZoomControls zoom={zoom} onZoomChange={setZoom} />
              <div className="w-px h-5 bg-gray-300" />
              {/* 主题选择器 - Requirement 7.6 */}
              <ThemeSelector value={theme} onChange={setTheme} />
            </>
          )}

          {/* 导出菜单 - Requirement 7.4 */}
          <div className="ml-auto">
            <ExportMenu
              onExport={handleExport}
              disabled={!svg || isRendering}
            />
          </div>
        </div>

        {/* 内容区域 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative bg-gray-100"
        >
          {viewMode === "preview" ? (
            error ? (
              /* 错误显示 - Requirement 7.5 */
              <ErrorDisplay message={error} source={artifact.content} />
            ) : isStreaming ? (
              /* 流式占位符 */
              <StreamingPlaceholder />
            ) : isRendering ? (
              /* 渲染中状态 */
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : svg ? (
              /* 图表预览 - Requirement 7.1, 7.3 */
              <div className="h-full flex items-center justify-center p-4">
                <div
                  className="transition-transform duration-200 ease-out"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center",
                  }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
            ) : (
              /* 空内容状态 */
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Code2 className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-sm text-gray-500">
                  {t("errors.mermaidRenderer.empty")}
                </p>
              </div>
            )
          ) : (
            /* 源码视图 - 复用 CodeRenderer */
            <CodeRenderer artifact={sourceArtifact} isStreaming={isStreaming} />
          )}

          {/* 流式指示器 */}
          {isStreaming && viewMode === "source" && <StreamingIndicator />}
        </div>
      </div>
    );
  },
);

MermaidRenderer.displayName = "MermaidRenderer";

export default MermaidRenderer;
