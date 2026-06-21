import React from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WriteFileMessagePart } from "./StreamingStructuredContent";

interface StreamingWriteFileCardProps {
  part: WriteFileMessagePart;
  isStreaming: boolean;
  onFileClick?: (fileName: string, content: string) => void;
}

export function StreamingWriteFileCard({
  part,
  isStreaming,
  onFileClick,
}: StreamingWriteFileCardProps) {
  const { t } = useTranslation("agent");
  const fileContent = typeof part.content === "string" ? part.content : "";
  const filePath = part.filePath || "文档.md";
  const normalizedPath = filePath.replace(/\\/g, "/").trim();
  const fileName =
    normalizedPath.split("/").filter(Boolean).pop() || normalizedPath;
  const previewText =
    fileContent.trim().replace(/\s+/g, " ").slice(0, 160) ||
    "正在准备文件内容，稍后会同步完整预览。";
  const displayPreview =
    previewText.length >= 160 ? `${previewText.slice(0, 159)}...` : previewText;
  const isPending = part.type === "pending_write_file" || isStreaming;

  return (
    <div
      data-testid="streaming-write-file-card"
      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm shadow-slate-950/5 transition hover:border-sky-200 hover:bg-sky-50/40"
      onClick={() => part.filePath && onFileClick?.(part.filePath, fileContent)}
    >
      <div className="group flex w-full items-start gap-3 text-left">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
          {isPending ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin text-sky-600" />
          ) : (
            <FileText className="h-[18px] w-[18px]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 text-sm font-medium leading-6 text-slate-900">
              <span className="line-clamp-1 break-all">
                {isPending ? `正在生成 ${fileName}` : fileName}
              </span>
            </div>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] leading-5 text-sky-700">
              {isPending ? "生成中" : "已写入"}
            </span>
          </div>

          <div className="mt-2 text-sm leading-6 text-slate-600">
            {displayPreview}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              title={filePath}
              className="inline-flex max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-500"
            >
              <span className="truncate">{normalizedPath || fileName}</span>
            </span>
            {part.filePath ? (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 transition group-hover:text-sky-700">
                <span>{t("agentChat.streamingRenderer.openCanvas")}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
