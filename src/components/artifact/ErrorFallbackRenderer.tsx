/**
 * @file Artifact 错误回退渲染器
 * @description 当 Artifact 渲染失败时显示友好的错误信息，提供重试和源码回退功能
 * @module components/artifact/ErrorFallbackRenderer
 * @requirements 14.1, 14.2, 14.3, 14.5
 */

import React, { memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  RefreshCw,
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/lib/artifact/types";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * ErrorFallbackRenderer Props
 */
interface ErrorFallbackRendererProps {
  /** 发生错误的 Artifact */
  artifact: Artifact;
  /** 错误对象 */
  error?: Error | null;
  /** 重试回调 */
  onRetry?: () => void;
  /** 显示源码回调 */
  onShowSource?: () => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 错误详情展开状态
 */
interface ErrorDetailsState {
  showStack: boolean;
  showContent: boolean;
}

interface ErrorReportLabels {
  heading: string;
  time: string;
  artifactId: string;
  artifactType: string;
  artifactTitle: string;
  artifactStatus: string;
  errorInfo: string;
  errorType: string;
  errorMessage: string;
  errorStack: string;
  artifactContent: string;
}

// ============================================================================
// 辅助组件
// ============================================================================

/**
 * 复制按钮组件
 */
const CopyButton: React.FC<{
  text: string;
  label: string;
  copiedLabel: string;
  className?: string;
}> = memo(({ text, label, copiedLabel, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ErrorFallbackRenderer] 复制失败:", err);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
        copied
          ? "bg-green-500/20 text-green-400"
          : "bg-white/10 hover:bg-white/15 text-gray-300",
        className,
      )}
      title={copied ? copiedLabel : label}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

/**
 * 可折叠区域组件
 */
const CollapsibleSection: React.FC<{
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}> = memo(({ title, isOpen, onToggle, children, className }) => (
  <div className={cn("border border-white/10 rounded", className)}>
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:bg-white/5 transition-colors"
    >
      <span>{title}</span>
      {isOpen ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      )}
    </button>
    {isOpen && <div className="border-t border-white/10">{children}</div>}
  </div>
));
CollapsibleSection.displayName = "CollapsibleSection";

// ============================================================================
// 主组件
// ============================================================================

/**
 * 格式化错误信息用于复制
 */
function formatErrorForCopy(
  artifact: Artifact,
  labels: ErrorReportLabels,
  error?: Error | null,
): string {
  const lines: string[] = [
    labels.heading,
    "",
    `${labels.time}: ${new Date().toISOString()}`,
    `${labels.artifactId}: ${artifact.id}`,
    `${labels.artifactType}: ${artifact.type}`,
    `${labels.artifactTitle}: ${artifact.title}`,
    `${labels.artifactStatus}: ${artifact.status}`,
    "",
  ];

  if (error) {
    lines.push(labels.errorInfo);
    lines.push(`${labels.errorType}: ${error.name}`);
    lines.push(`${labels.errorMessage}: ${error.message}`);
    if (error.stack) {
      lines.push("");
      lines.push(labels.errorStack);
      lines.push(error.stack);
    }
  }

  lines.push("");
  lines.push(labels.artifactContent);
  lines.push(artifact.content);

  return lines.join("\n");
}

/**
 * 错误回退渲染器
 *
 * 功能特性：
 * - 显示友好的错误信息 (Requirement 14.2)
 * - 提供重试按钮 (Requirement 14.3)
 * - 错误时可以查看原始源码 (Requirement 14.5)
 * - 支持复制错误信息用于调试
 * - 可折叠的错误详情和源码区域
 *
 * @param artifact - 发生错误的 Artifact
 * @param error - 错误对象
 * @param onRetry - 重试回调
 * @param onShowSource - 显示源码回调
 * @param className - 自定义类名
 *
 * @requirements 14.1, 14.2, 14.3, 14.5
 */
export const ErrorFallbackRenderer: React.FC<ErrorFallbackRendererProps> = memo(
  ({ artifact, error, onRetry, onShowSource, className }) => {
    const { t } = useTranslation("errors");
    // 展开状态管理
    const [details, setDetails] = useState<ErrorDetailsState>({
      showStack: false,
      showContent: true, // 默认展开源码
    });

    // 切换错误堆栈显示
    const toggleStack = useCallback(() => {
      setDetails((prev) => ({ ...prev, showStack: !prev.showStack }));
    }, []);

    // 切换内容显示
    const toggleContent = useCallback(() => {
      setDetails((prev) => ({ ...prev, showContent: !prev.showContent }));
    }, []);

    // 格式化的错误报告
    const copyLabel = t("errors.artifactFallback.action.copy", {
      defaultValue: "复制",
    });
    const copiedLabel = t("errors.artifactFallback.action.copied", {
      defaultValue: "已复制",
    });
    const errorReport = formatErrorForCopy(
      artifact,
      {
        heading: t("errors.artifactFallback.report.heading", {
          defaultValue: "=== Artifact 渲染错误报告 ===",
        }),
        time: t("errors.artifactFallback.report.time", {
          defaultValue: "时间",
        }),
        artifactId: t("errors.artifactFallback.report.artifactId", {
          defaultValue: "Artifact ID",
        }),
        artifactType: t("errors.artifactFallback.report.artifactType", {
          defaultValue: "Artifact 类型",
        }),
        artifactTitle: t("errors.artifactFallback.report.artifactTitle", {
          defaultValue: "Artifact 标题",
        }),
        artifactStatus: t("errors.artifactFallback.report.artifactStatus", {
          defaultValue: "Artifact 状态",
        }),
        errorInfo: t("errors.artifactFallback.report.errorInfo", {
          defaultValue: "--- 错误信息 ---",
        }),
        errorType: t("errors.artifactFallback.report.errorType", {
          defaultValue: "错误类型",
        }),
        errorMessage: t("errors.artifactFallback.report.errorMessage", {
          defaultValue: "错误消息",
        }),
        errorStack: t("errors.artifactFallback.report.errorStack", {
          defaultValue: "--- 错误堆栈 ---",
        }),
        artifactContent: t("errors.artifactFallback.report.artifactContent", {
          defaultValue: "--- Artifact 内容 ---",
        }),
      },
      error,
    );

    return (
      <div className={cn("flex flex-col h-full bg-[#1e2227]", className)}>
        {/* 错误提示区域 */}
        <div className="p-4 bg-red-500/10 border-b border-red-500/20">
          {/* 错误标题 */}
          <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>
              {t("errors.artifactFallback.title.renderFailed", {
                defaultValue: "渲染失败",
              })}
            </span>
          </div>

          {/* 错误消息 */}
          {error && (
            <div className="mb-3">
              <div className="text-sm text-gray-300 mb-1">
                {error.message ||
                  t("errors.artifactFallback.error.unknown", {
                    defaultValue: "未知错误",
                  })}
              </div>
              {error.name && error.name !== "Error" && (
                <div className="text-xs text-gray-500">
                  {t("errors.artifactFallback.error.typeLine", {
                    defaultValue: "错误类型: {{type}}",
                    type: error.name,
                  })}
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t("errors.artifactFallback.action.retry", {
                  defaultValue: "重试",
                })}
              </button>
            )}
            {onShowSource && (
              <button
                type="button"
                onClick={onShowSource}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded transition-colors"
              >
                <Code className="w-4 h-4" />
                {t("errors.artifactFallback.action.showSource", {
                  defaultValue: "查看源码",
                })}
              </button>
            )}
            <CopyButton
              text={errorReport}
              label={t("errors.artifactFallback.action.copyErrorReport", {
                defaultValue: "复制错误报告",
              })}
              copiedLabel={copiedLabel}
              className="px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* 详情区域 */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Artifact 信息 */}
          <div className="text-xs text-gray-500 space-y-1">
            <div>
              <span className="text-gray-600">
                {t("errors.artifactFallback.field.type", {
                  defaultValue: "类型",
                })}
                :
              </span>{" "}
              <span className="text-gray-400">{artifact.type}</span>
            </div>
            <div>
              <span className="text-gray-600">
                {t("errors.artifactFallback.field.title", {
                  defaultValue: "标题",
                })}
                :
              </span>{" "}
              <span className="text-gray-400">
                {artifact.title ||
                  t("errors.artifactFallback.value.untitled", {
                    defaultValue: "(无标题)",
                  })}
              </span>
            </div>
            <div>
              <span className="text-gray-600">
                {t("errors.artifactFallback.field.status", {
                  defaultValue: "状态",
                })}
                :
              </span>{" "}
              <span className="text-gray-400">{artifact.status}</span>
            </div>
          </div>

          {/* 错误堆栈（可折叠） */}
          {error?.stack && (
            <CollapsibleSection
              title={t("errors.artifactFallback.section.stack", {
                defaultValue: "错误堆栈",
              })}
              isOpen={details.showStack}
              onToggle={toggleStack}
            >
              <div className="relative">
                <pre className="p-3 text-xs text-red-300/80 overflow-auto whitespace-pre-wrap break-all max-h-[200px] bg-black/20">
                  {error.stack}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton
                    text={error.stack}
                    label={copyLabel}
                    copiedLabel={copiedLabel}
                  />
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* 源码内容（可折叠） */}
          <CollapsibleSection
            title={t("errors.artifactFallback.section.content", {
              defaultValue: "原始内容",
            })}
            isOpen={details.showContent}
            onToggle={toggleContent}
          >
            <div className="relative">
              <pre className="p-3 text-xs text-gray-300 overflow-auto whitespace-pre-wrap break-all max-h-[400px] bg-black/20">
                {artifact.content ||
                  t("errors.artifactFallback.value.emptyContent", {
                    defaultValue: "(空内容)",
                  })}
              </pre>
              {artifact.content && (
                <div className="absolute top-2 right-2">
                  <CopyButton
                    text={artifact.content}
                    label={copyLabel}
                    copiedLabel={copiedLabel}
                  />
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    );
  },
);

ErrorFallbackRenderer.displayName = "ErrorFallbackRenderer";
