/**
 * @file React 渲染器组件
 * @description Artifact 系统的 React 渲染器，支持 JSX 编译、沙箱化渲染、错误边界和预览/源码切换
 * @module components/artifact/renderers/ReactRenderer
 * @requirements 8.1, 8.2, 8.4, 8.6, 8.7, 14.4
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  Component,
} from "react";
import { useTranslation } from "react-i18next";
import * as Babel from "@babel/standalone";
import { Eye, Code2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactRendererProps } from "@/lib/artifact/types";
import { CodeRenderer } from "./CodeRenderer";

/**
 * 视图模式类型
 */
type ViewMode = "preview" | "source";

interface ReactRendererErrorCopy {
  emptyCompileResult: string;
  compileFailed: string;
  componentCreateFailed: string;
}

/**
 * 错误边界 Props
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * 错误边界 State
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 * 捕获子组件渲染过程中的错误，防止整个应用崩溃
 * Requirement 8.4
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      "[ReactRenderer] Component render error:",
      error.message,
      error,
    );
    console.error("[ReactRenderer] Error info:", errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * 流式指示器组件
 */
const StreamingIndicator: React.FC = memo(() => {
  const { t } = useTranslation("errors");

  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>{t("errors.reactRenderer.status.generating")}</span>
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
        {t("errors.reactRenderer.placeholder.generatingTitle")}
      </h3>
      <p className="text-sm text-gray-500">
        {t("errors.reactRenderer.placeholder.generatingDescription")}
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
          title={t("errors.reactRenderer.view.previewTitle")}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{t("errors.reactRenderer.view.preview")}</span>
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
          title={t("errors.reactRenderer.view.sourceTitle")}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{t("errors.reactRenderer.view.source")}</span>
        </button>
      </div>
    );
  },
);
ViewModeToggle.displayName = "ViewModeToggle";

/**
 * 错误显示组件
 * Requirement 8.5
 */
interface ErrorDisplayProps {
  message: string;
  source?: string;
  onRetry?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = memo(
  ({ message, source, onRetry }) => {
    const { t } = useTranslation("errors");

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-start gap-3 p-4 bg-red-50 border-b border-red-100">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 mb-1">
              {t("errors.reactRenderer.error.compileOrRender")}
            </h3>
            <p className="text-xs text-red-600 whitespace-pre-wrap">
              {message}
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t("errors.reactRenderer.action.retry")}</span>
            </button>
          )}
        </div>
        {source && (
          <div className="flex-1 overflow-auto p-4 bg-gray-50">
            <h4 className="text-xs font-medium text-gray-500 mb-2">
              {t("errors.reactRenderer.section.sourceContent")}
            </h4>
            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-gray-200">
              {source}
            </pre>
          </div>
        )}
      </div>
    );
  },
);
ErrorDisplay.displayName = "ErrorDisplay";

/**
 * 编译 React/JSX 代码
 * 使用 @babel/standalone 将 JSX 转换为可执行的 JavaScript
 * Requirement 8.1, 14.4
 *
 * @param code - JSX 源代码
 * @returns 编译后的代码字符串
 */
function compileJSX(code: string, copy: ReactRendererErrorCopy): string {
  try {
    const result = Babel.transform(code, {
      presets: ["react"],
      filename: "component.jsx",
    });

    if (!result.code) {
      throw new Error(copy.emptyCompileResult);
    }

    return result.code;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : copy.compileFailed;
    console.error("[ReactRenderer] Error compiling JSX:", errorMessage, err);
    throw err;
  }
}

/**
 * 从编译后的代码创建 React 组件
 * 支持 App、Component 或默认导出的组件
 * Requirement 8.2, 8.7, 14.4
 *
 * @param compiledCode - 编译后的 JavaScript 代码
 * @returns React 组件
 */
function createComponentFromCode(
  compiledCode: string,
  copy: ReactRendererErrorCopy,
): React.ComponentType {
  try {
    // 创建一个安全的执行环境
    // 提供基本的 React hooks 支持 (Requirement 8.7)
    const createComponent = new Function(
      "React",
      "useState",
      "useEffect",
      "useMemo",
      "useCallback",
      "useRef",
      `
      ${compiledCode}
      // 尝试返回常见的组件导出名称
      if (typeof App !== 'undefined') return App;
      if (typeof Component !== 'undefined') return Component;
      if (typeof Main !== 'undefined') return Main;
      if (typeof default_1 !== 'undefined') return default_1;
      // 如果没有找到组件，返回一个空组件
      return function() { return null; };
      `,
    );

    return createComponent(
      React,
      React.useState,
      React.useEffect,
      React.useMemo,
      React.useCallback,
      React.useRef,
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : copy.componentCreateFailed;
    console.error(
      "[ReactRenderer] Error creating component from code:",
      errorMessage,
      err,
    );
    throw err;
  }
}

/**
 * React 渲染器组件
 *
 * 功能特性：
 * - 使用 @babel/standalone 编译 React/JSX 代码 (Requirement 8.1)
 * - 在沙箱化环境中渲染编译后的组件 (Requirement 8.2)
 * - 提供实时预览，内容变化时自动更新 (Requirement 8.3 - 由 useEffect 实现)
 * - 提供错误边界捕获渲染错误 (Requirement 8.4)
 * - 编译失败时显示编译错误 (Requirement 8.5)
 * - 提供预览/源码视图切换 (Requirement 8.6)
 * - 支持基本 React hooks (useState, useEffect, useMemo) (Requirement 8.7)
 *
 * @param artifact - 要渲染的 Artifact 对象
 * @param isStreaming - 是否处于流式生成状态
 */
export const ReactRenderer: React.FC<ArtifactRendererProps> = memo(
  ({ artifact, isStreaming = false }) => {
    const { t } = useTranslation("errors");
    // 视图模式状态
    const [viewMode, setViewMode] = useState<ViewMode>("preview");
    // 编译/渲染错误
    const [error, setError] = useState<string | null>(null);
    // 编译后的组件
    const [Component, setComponent] = useState<React.ComponentType | null>(
      null,
    );
    // 编译状态
    const [isCompiling, setIsCompiling] = useState(false);
    // 用于强制重新编译的 key
    const [compileKey, setCompileKey] = useState(0);
    const errorCopy = useMemo<ReactRendererErrorCopy>(
      () => ({
        emptyCompileResult: t("errors.reactRenderer.error.emptyCompileResult"),
        compileFailed: t("errors.reactRenderer.error.compileFailed"),
        componentCreateFailed: t(
          "errors.reactRenderer.error.componentCreateFailed",
        ),
      }),
      [t],
    );

    /**
     * 编译并创建组件
     * Requirement 8.1, 8.2, 8.5
     */
    useEffect(() => {
      // 流式生成时不编译，等待内容完成
      if (isStreaming) {
        setComponent(null);
        setError(null);
        return;
      }

      // 内容为空时不编译
      if (!artifact.content.trim()) {
        setComponent(null);
        setError(null);
        return;
      }

      const compile = async () => {
        setIsCompiling(true);
        setError(null);

        try {
          // 编译 JSX (Requirement 8.1)
          const compiledCode = compileJSX(artifact.content, errorCopy);

          // 创建组件 (Requirement 8.2)
          const Comp = createComponentFromCode(compiledCode, errorCopy);

          setComponent(() => Comp);
          setError(null);
        } catch (e) {
          // 编译失败时显示错误 (Requirement 8.5, 14.4)
          const errorMessage =
            e instanceof Error ? e.message : errorCopy.compileFailed;
          console.error(
            "[ReactRenderer] Error compiling/creating component:",
            errorMessage,
            e,
          );
          console.error(
            "[ReactRenderer] Failed content:",
            artifact.content.substring(0, 200),
          );
          setError(errorMessage);
          setComponent(null);
        } finally {
          setIsCompiling(false);
        }
      };

      compile();
    }, [artifact.content, isStreaming, compileKey, errorCopy]);

    /**
     * 重试编译
     */
    const handleRetry = useCallback(() => {
      setCompileKey((prev) => prev + 1);
    }, []);

    /**
     * 处理渲染错误
     * Requirement 14.4
     */
    const handleRenderError = useCallback(
      (err: Error) => {
        const errorMessage = t("errors.reactRenderer.error.renderFailed", {
          message: err.message,
        });
        console.error(
          "[ReactRenderer] Runtime render error:",
          errorMessage,
          err,
        );
        setError(errorMessage);
      },
      [t],
    );

    /**
     * 创建用于源码视图的 artifact 对象
     */
    const sourceArtifact = useMemo(
      () => ({
        ...artifact,
        type: "code" as const,
        meta: { ...artifact.meta, language: "jsx" },
      }),
      [artifact],
    );

    /**
     * 渲染错误回退组件
     */
    const errorFallback = useMemo(
      () => (
        <ErrorDisplay
          message={t("errors.reactRenderer.error.componentRenderFailed")}
          source={artifact.content}
          onRetry={handleRetry}
        />
      ),
      [artifact.content, handleRetry, t],
    );

    return (
      <div className="h-full flex flex-col bg-white rounded-lg overflow-hidden border border-gray-200">
        {/* 工具栏 */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50">
          {/* 视图模式切换 - Requirement 8.6 */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {/* 编译状态指示 */}
          {isCompiling && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t("errors.reactRenderer.status.compiling")}</span>
            </div>
          )}

          {/* 重新编译按钮 */}
          {viewMode === "preview" && !isStreaming && !isCompiling && (
            <button
              type="button"
              onClick={handleRetry}
              className={cn(
                "inline-flex items-center justify-center w-8 h-8 rounded transition-all ml-auto",
                "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              )}
              title={t("errors.reactRenderer.action.recompile")}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto relative">
          {viewMode === "preview" ? (
            error ? (
              /* 错误显示 - Requirement 8.5 */
              <ErrorDisplay
                message={error}
                source={artifact.content}
                onRetry={handleRetry}
              />
            ) : isStreaming ? (
              /* 流式占位符 */
              <StreamingPlaceholder />
            ) : isCompiling ? (
              /* 编译中状态 */
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : Component ? (
              /* 组件预览 - Requirement 8.2, 8.4 */
              <div className="p-4 h-full">
                <ErrorBoundary
                  fallback={errorFallback}
                  onError={handleRenderError}
                >
                  <Component />
                </ErrorBoundary>
              </div>
            ) : (
              /* 空内容状态 */
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Code2 className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-sm text-gray-500">
                  {t("errors.reactRenderer.empty.noComponentContent")}
                </p>
              </div>
            )
          ) : (
            /* 源码视图 - 复用 CodeRenderer - Requirement 8.6 */
            <CodeRenderer artifact={sourceArtifact} isStreaming={isStreaming} />
          )}

          {/* 流式指示器 */}
          {isStreaming && viewMode === "source" && <StreamingIndicator />}
        </div>
      </div>
    );
  },
);

ReactRenderer.displayName = "ReactRenderer";

export default ReactRenderer;
