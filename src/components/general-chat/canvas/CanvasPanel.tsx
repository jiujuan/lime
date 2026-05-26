/**
 * @file CanvasPanel.tsx
 * @description 画布面板组件 - 显示代码或 Markdown 预览
 * @module components/general-chat/canvas/CanvasPanel
 *
 * @requirements 3.3, 4.4
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, X } from "lucide-react";
import {
  isAbsoluteLocalFilePath,
  openHtmlPreviewWindow,
  openPathWithDefaultApp,
  resolveLocalFilePreviewUrl,
} from "@/lib/api/fileSystem";
import type { CanvasContentType, CanvasState } from "../types";
import { CodePreview } from "./CodePreview";
import { MarkdownPreview } from "./MarkdownPreview";

type HtmlViewMode = "preview" | "source";
type CanvasPanelFallbackTitleKey =
  | "workspace.canvasPanel.fallbackTitle.code"
  | "workspace.canvasPanel.fallbackTitle.html"
  | "workspace.canvasPanel.fallbackTitle.markdown"
  | "workspace.canvasPanel.fallbackTitle.file"
  | "workspace.canvasPanel.fallbackTitle.empty";

function assertNever(value: never): never {
  throw new Error(`未支持的画布内容类型: ${String(value)}`);
}

function resolveDownloadFilename(state: CanvasState): string {
  if (state.filename) {
    return state.filename;
  }

  switch (state.contentType) {
    case "code":
    case "html":
      return `code.${
        state.language || (state.contentType === "html" ? "html" : "txt")
      }`;
    case "markdown":
      return "content.md";
    case "file":
      return "file.txt";
    case "empty":
      return "content.txt";
    default:
      return assertNever(state.contentType);
  }
}

function resolveFallbackTitleKey(
  contentType: CanvasContentType,
): CanvasPanelFallbackTitleKey {
  switch (contentType) {
    case "code":
      return "workspace.canvasPanel.fallbackTitle.code";
    case "html":
      return "workspace.canvasPanel.fallbackTitle.html";
    case "markdown":
      return "workspace.canvasPanel.fallbackTitle.markdown";
    case "file":
      return "workspace.canvasPanel.fallbackTitle.file";
    case "empty":
      return "workspace.canvasPanel.fallbackTitle.empty";
    default:
      return assertNever(contentType);
  }
}

function resolveHtmlPreviewPath(
  state: Pick<CanvasState, "sourcePath" | "filename">,
  baseFilePath?: string,
): string | null {
  if (state.sourcePath && isAbsoluteLocalFilePath(state.sourcePath)) {
    return state.sourcePath;
  }
  if (baseFilePath && isAbsoluteLocalFilePath(baseFilePath)) {
    return baseFilePath;
  }
  if (state.filename && isAbsoluteLocalFilePath(state.filename)) {
    return state.filename;
  }
  return null;
}

interface CanvasPanelProps {
  /** 画布状态 */
  state: CanvasState;
  /** 当前文件绝对路径，用于解析相对资源 */
  baseFilePath?: string;
  /** 关闭画布回调 */
  onClose: () => void;
  /** 内容变更回调 */
  onContentChange?: (content: string) => void;
  /** 头部附加操作 */
  toolbarActions?: React.ReactNode;
  /** 画布外壳形态 */
  chrome?: "default" | "embedded";
}

/**
 * 画布面板组件
 */
export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  state,
  baseFilePath,
  onClose,
  onContentChange,
  toolbarActions,
  chrome = "default",
}) => {
  const { t } = useTranslation("workspace");
  const [copied, setCopied] = useState(false);
  const [htmlViewMode, setHtmlViewMode] = useState<HtmlViewMode>("preview");
  const isEmbeddedChrome = chrome === "embedded";
  const isHtmlContent = state.contentType === "html";
  const htmlPreviewPath = isHtmlContent
    ? resolveHtmlPreviewPath(state, baseFilePath)
    : null;
  const htmlPreviewUrl = resolveLocalFilePreviewUrl(htmlPreviewPath);

  useEffect(() => {
    setHtmlViewMode("preview");
  }, [state.filename, state.contentType]);

  // 复制内容
  const handleCopy = () => {
    navigator.clipboard.writeText(state.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 下载内容
  const handleDownload = () => {
    const filename = resolveDownloadFilename(state);
    const blob = new Blob([state.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenHtmlPreviewExternally = () => {
    if (!htmlPreviewPath) {
      return;
    }
    void (async () => {
      const openedInWindow = await openHtmlPreviewWindow(htmlPreviewPath, {
        title: state.filename || t("workspace.canvasPanel.htmlPreviewTitle"),
      });
      if (!openedInWindow) {
        await openPathWithDefaultApp(htmlPreviewPath);
      }
    })();
  };

  if (!state.isOpen) {
    return null;
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isEmbeddedChrome ? "bg-white" : "border-r border-border bg-background"
      }`}
    >
      {!isEmbeddedChrome ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {state.filename || t(resolveFallbackTitleKey(state.contentType))}
            </span>
            {state.language && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {state.language}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleCopy}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={copied ? "已复制" : "复制"}
            >
              {copied ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="下载"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
            {toolbarActions}
            <button
              onClick={onClose}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="关闭"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {isHtmlContent ? (
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2">
          <div className="min-w-0 truncate text-xs text-ink-500">
            {state.filename || "HTML"}
          </div>
          <div className="inline-flex shrink-0 items-center rounded-lg border border-ink-200 bg-white p-0.5">
            <button
              type="button"
              data-testid="canvas-html-preview-mode"
              onClick={() => setHtmlViewMode("preview")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                htmlViewMode === "preview"
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              {t("workspace.artifactToolbar.view.preview")}
            </button>
            <button
              type="button"
              data-testid="canvas-html-source-mode"
              onClick={() => setHtmlViewMode("source")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                htmlViewMode === "source"
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              {t("workspace.artifactToolbar.view.source")}
            </button>
          </div>
          {htmlPreviewPath ? (
            <button
              type="button"
              data-testid="canvas-html-open-external"
              onClick={handleOpenHtmlPreviewExternally}
              className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
              title={t("workspace.artifactToolbar.action.openInWindow")}
              aria-label={t("workspace.artifactToolbar.action.openInWindow")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {isEmbeddedChrome ? (
            <button
              type="button"
              data-testid="canvas-html-close"
              onClick={onClose}
              className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
              title={t("workspace.artifactToolbar.action.close")}
              aria-label={t("workspace.artifactToolbar.action.close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {(() => {
          switch (state.contentType) {
            case "html":
              return htmlViewMode === "preview" ? (
                htmlPreviewUrl ? (
                  <iframe
                    src={htmlPreviewUrl}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    className="h-full min-h-[420px] w-full border-0 bg-white"
                    title={
                      state.filename ||
                      t("workspace.canvasPanel.htmlPreviewTitle")
                    }
                  />
                ) : (
                  <iframe
                    srcDoc={state.content}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    className="h-full min-h-[420px] w-full border-0 bg-white"
                    title={
                      state.filename ||
                      t("workspace.canvasPanel.htmlPreviewTitle")
                    }
                  />
                )
              ) : (
                <CodePreview
                  code={state.content}
                  language={state.language || "html"}
                  isEditing={state.isEditing}
                  onContentChange={onContentChange}
                />
              );
            case "code":
              return (
                <CodePreview
                  code={state.content}
                  language={state.language || "plaintext"}
                  isEditing={state.isEditing}
                  onContentChange={onContentChange}
                />
              );
            case "markdown":
              return (
                <MarkdownPreview
                  content={state.content}
                  baseFilePath={baseFilePath}
                  isEditing={state.isEditing}
                  onContentChange={onContentChange}
                />
              );
            case "file":
            case "empty":
              return (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {t("workspace.canvasPanel.emptyContent")}
                </div>
              );
            default:
              return assertNever(state.contentType);
          }
        })()}
      </div>
    </div>
  );
};
