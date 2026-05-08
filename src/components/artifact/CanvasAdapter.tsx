/**
 * @file Canvas 适配器组件
 * @description 将 Canvas 类型的 Artifact 适配到现有 Canvas 系统
 * @module components/artifact/CanvasAdapter
 * @requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/artifact/types";

// Canvas 系统导入
import {
  CanvasFactory,
  type CanvasStateUnion,
  type DesignCanvasState,
} from "@/lib/workspace/workbenchCanvas";

// 工具函数导入
import {
  getCanvasTypeFromArtifact,
  createCanvasStateFromArtifact,
  extractContentFromCanvasState,
  CANVAS_TYPE_LABELS,
  CANVAS_TYPE_ICONS,
} from "./canvasAdapterUtils";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Canvas 适配器 Props
 */
export type CanvasAdapterCanvasFactoryProps = Pick<
  ComponentProps<typeof CanvasFactory>,
  | "projectRootPath"
  | "projectId"
  | "contentId"
  | "imageGenerationProviderId"
  | "imageGenerationModelId"
  | "imageGenerationSelectionReady"
  | "imageGenerationSelectionWarning"
  | "designAnalyzeFlatImage"
  | "designAnalyzerModelSlotConfigs"
>;

interface CanvasAdapterProps {
  /** 要渲染的 Artifact 对象 */
  artifact: Artifact;
  /** 是否处于流式生成状态 */
  isStreaming?: boolean;
  /** 内容变更回调 */
  onContentChange?: (content: string) => void;
  /** 由工作台注入的 Canvas 运行上下文，用于 project 保存和图层生成 */
  canvasFactoryProps?: CanvasAdapterCanvasFactoryProps;
  /** 自定义类名 */
  className?: string;
}

// ============================================================================
// 辅助组件
// ============================================================================

/**
 * Canvas 加载骨架屏
 */
const CanvasLoadingSkeleton: React.FC = memo(() => (
  <div className="flex items-center justify-center h-full min-h-[300px] bg-[#1e2227]">
    <div className="flex flex-col items-center gap-3 text-gray-400">
      <Loader2 className="w-8 h-8 animate-spin" />
      <span className="text-sm">加载 Canvas...</span>
    </div>
  </div>
));
CanvasLoadingSkeleton.displayName = "CanvasLoadingSkeleton";

/**
 * Canvas 不支持提示
 */
const CanvasUnsupportedMessage: React.FC<{ canvasType: string }> = memo(
  ({ canvasType }) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-[#1e2227]">
      <div className="text-center p-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h3 className="text-lg font-medium text-white mb-2">
          不支持的 Canvas 类型
        </h3>
        <p className="text-sm text-gray-400">
          类型 "{canvasType}" 暂不支持在此处渲染
        </p>
      </div>
    </div>
  ),
);
CanvasUnsupportedMessage.displayName = "CanvasUnsupportedMessage";

function isDesignCanvasState(
  state: CanvasStateUnion,
): state is DesignCanvasState {
  return state.type === "design";
}

function getLayerTypeLabel(type: string): string {
  switch (type) {
    case "image":
      return "图片";
    case "text":
      return "文字";
    case "shape":
      return "形状";
    case "effect":
      return "效果";
    case "group":
      return "组";
    default:
      return "图层";
  }
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * Canvas 适配器组件
 *
 * 功能特性：
 * - 检测 Canvas 类型 (canvas:document, canvas:video, canvas:design) (Requirement 12.1)
 * - 将 Artifact 内容作为初始状态传递给 Canvas (Requirement 12.2)
 * - 同步 Canvas 状态变更回 Artifact (Requirement 12.3)
 * - 支持在完整 Canvas 编辑器模式中打开 (Requirement 12.4)
 * - 保留 Canvas 特定元数据 (platform, version 等) (Requirement 12.5)
 *
 * @param artifact - 要渲染的 Artifact 对象
 * @param isStreaming - 是否处于流式生成状态
 * @param onContentChange - 内容变更回调
 * @param className - 自定义类名
 *
 * @requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */
export const CanvasAdapter: React.FC<CanvasAdapterProps> = memo(
  ({
    artifact,
    isStreaming = false,
    onContentChange,
    canvasFactoryProps,
    className,
  }) => {
    // 获取 Canvas 类型
    const canvasType = useMemo(
      () => getCanvasTypeFromArtifact(artifact.type),
      [artifact.type],
    );

    // Canvas 状态管理
    // @requirements 12.2
    const [canvasState, setCanvasState] = useState<CanvasStateUnion | null>(
      () => createCanvasStateFromArtifact(artifact),
    );

    // 是否显示完整编辑器模式
    const [isFullEditorMode, setIsFullEditorMode] = useState(false);

    // 当 Artifact 内容变化时，更新 Canvas 状态
    // @requirements 12.2
    useEffect(() => {
      // 仅在非编辑模式下同步外部内容变化
      if (!isFullEditorMode) {
        const newState = createCanvasStateFromArtifact(artifact);
        if (newState) {
          setCanvasState(newState);
        }
      }
    }, [artifact, isFullEditorMode]);

    /**
     * 处理 Canvas 状态变更
     * 同步状态变更回 Artifact
     * @requirements 12.3
     */
    const handleStateChange = useCallback(
      (newState: CanvasStateUnion) => {
        setCanvasState(newState);

        // 提取内容并回调
        if (onContentChange) {
          const content = extractContentFromCanvasState(newState);
          onContentChange(content);
        }
      },
      [onContentChange],
    );

    /**
     * 处理关闭 Canvas
     */
    const handleClose = useCallback(() => {
      setIsFullEditorMode(false);
    }, []);

    useEffect(() => {
      if (!isFullEditorMode || typeof document === "undefined") {
        return;
      }

      const previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setIsFullEditorMode(false);
        }
      };

      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.body.style.overflow = previousBodyOverflow;
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isFullEditorMode]);

    /**
     * 打开完整编辑器模式
     * @requirements 12.4
     */
    const handleOpenFullEditor = useCallback(() => {
      setIsFullEditorMode(true);
      console.log("[CanvasAdapter] 打开完整 Canvas 编辑器:", artifact.type);
    }, [artifact.type]);

    // 不支持的 Canvas 类型
    if (!canvasType) {
      return (
        <div className={cn("h-full", className)}>
          <CanvasUnsupportedMessage canvasType={artifact.type} />
        </div>
      );
    }

    // Canvas 状态未初始化
    if (!canvasState) {
      return (
        <div className={cn("h-full", className)}>
          <CanvasLoadingSkeleton />
        </div>
      );
    }

    // 获取显示信息
    const label =
      CANVAS_TYPE_LABELS[canvasType as keyof typeof CANVAS_TYPE_LABELS];
    const icon =
      CANVAS_TYPE_ICONS[canvasType as keyof typeof CANVAS_TYPE_ICONS];

    const renderCanvasFactory = () => (
      <CanvasFactory
        theme="general"
        state={canvasState}
        onStateChange={handleStateChange}
        onBackHome={handleClose}
        onClose={handleClose}
        isStreaming={isStreaming}
        projectRootPath={canvasFactoryProps?.projectRootPath}
        projectId={canvasFactoryProps?.projectId}
        contentId={canvasFactoryProps?.contentId}
        imageGenerationProviderId={
          canvasFactoryProps?.imageGenerationProviderId
        }
        imageGenerationModelId={canvasFactoryProps?.imageGenerationModelId}
        imageGenerationSelectionReady={
          canvasFactoryProps?.imageGenerationSelectionReady
        }
        imageGenerationSelectionWarning={
          canvasFactoryProps?.imageGenerationSelectionWarning
        }
        designAnalyzeFlatImage={canvasFactoryProps?.designAnalyzeFlatImage}
        designAnalyzerModelSlotConfigs={
          canvasFactoryProps?.designAnalyzerModelSlotConfigs
        }
      />
    );
    const renderDesignPreview = (state: DesignCanvasState) => {
      const document = state.document;
      const imageLayerCount = document.layers.filter(
        (layer) => layer.type === "image" || layer.type === "effect",
      ).length;
      const generatedAssetCount = document.assets.filter(
        (asset) =>
          asset.params?.source === "image_generation_task" ||
          Boolean(asset.provider || asset.modelId),
      ).length;
      const visibleLayers = document.layers.filter((layer) => layer.visible);
      const layerSummary = [...document.layers]
        .sort((a, b) => b.zIndex - a.zIndex)
        .slice(0, 4);

      return (
        <div
          className="flex min-h-[280px] flex-1 flex-col bg-slate-50"
          data-testid="design-canvas-inline-preview"
        >
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500">
                LayeredDesignDocument
              </p>
              <h3 className="mt-1 truncate text-base font-semibold text-slate-950">
                {document.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {document.canvas.width} x {document.canvas.height} /{" "}
                {document.layers.length} 个图层 / {imageLayerCount} 个图片层 /{" "}
                {document.status}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">显示图层</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {visibleLayers.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">资产</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {document.assets.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">已生成</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {generatedAssetCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">当前层</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {document.layers.find(
                    (layer) => layer.id === state.selectedLayerId,
                  )?.name ||
                    document.layers[0]?.name ||
                    "未选择"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-950">
                  图层摘要
                </h4>
                <span className="text-xs font-medium text-slate-500">
                  top {layerSummary.length}
                </span>
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {layerSummary.map((layer) => (
                  <div
                    key={layer.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {layer.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {getLayerTypeLabel(layer.type)} / z {layer.zIndex}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {layer.visible ? "显示" : "隐藏"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {layer.locked ? "锁定" : "可编辑"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    };
    const fullEditorRoot =
      typeof document === "undefined" ? null : document.body;
    const fullEditor =
      isFullEditorMode && fullEditorRoot
        ? createPortal(
            <div
              aria-label="图层设计完整编辑器"
              aria-modal="true"
              className="fixed inset-0 z-[99990] flex flex-col bg-[#1e2227]"
              data-testid="canvas-full-editor"
              role="dialog"
            >
              <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-lg">{icon}</span>
                  <span className="truncate text-sm font-medium text-white">
                    {label} Canvas · 完整编辑器
                  </span>
                </div>
                <button
                  aria-label="关闭完整编辑器"
                  onClick={handleClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-200 transition-colors hover:bg-gray-700"
                  title="关闭完整编辑器"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderCanvasFactory()}
              </div>
            </div>,
            fullEditorRoot,
          )
        : null;

    return (
      <div className={cn("h-full flex flex-col bg-[#1e2227]", className)}>
        {/* Canvas 信息头部 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-medium text-white">
              {label} Canvas
            </span>
            {isStreaming && (
              <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                生成中...
              </span>
            )}
          </div>
          <button
            aria-label="在完整编辑器中打开"
            onClick={handleOpenFullEditor}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            title="在完整编辑器中打开"
            type="button"
          >
            <Maximize2 className="w-4 h-4" />
            <span>编辑</span>
          </button>
        </div>

        {/* Canvas 渲染区域 */}
        <div className="flex-1 overflow-hidden">
          {isDesignCanvasState(canvasState)
            ? renderDesignPreview(canvasState)
            : renderCanvasFactory()}
        </div>
        {fullEditor}
      </div>
    );
  },
);

CanvasAdapter.displayName = "CanvasAdapter";
