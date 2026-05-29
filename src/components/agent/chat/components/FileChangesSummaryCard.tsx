import React, { useState } from "react";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FileChangesAggregate, FileChangeSummary } from "../utils/fileChangeSummary";

interface FileChangesSummaryCardProps {
  aggregate: FileChangesAggregate;
  isStreaming?: boolean;
  onFileClick?: (path: string) => void;
}

function resolveFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function DiffLines({ summary }: { summary: FileChangeSummary }) {
  const { t } = useTranslation("agent");
  const addedCount = summary.linesAdded;
  const removedCount = summary.linesRemoved;

  return (
    <div className="mt-1 font-mono text-xs leading-5">
      {summary.diff.slice(0, 60).map((line, i) => {
        if (line.kind === "add") {
          return (
            <div key={i} className="text-green-700 bg-green-50">
              + {line.value}
            </div>
          );
        }
        if (line.kind === "remove") {
          return (
            <div key={i} className="text-red-700 bg-red-50">
              - {line.value}
            </div>
          );
        }
        return null;
      })}
      {summary.truncated && (
        <div className="text-slate-400 italic">
          {t("agentChat.fileChangesSummary.truncated", {
            added: addedCount,
            removed: removedCount,
          })}
        </div>
      )}
    </div>
  );
}

export function FileChangesSummaryCard({
  aggregate,
  isStreaming = false,
  onFileClick,
}: FileChangesSummaryCardProps) {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const { files, totalAdded, totalRemoved, fileCount } = aggregate;

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const summaryLabel = isStreaming
    ? t("agentChat.fileChangesSummary.writing")
    : t("agentChat.fileChangesSummary.summary", {
        count: fileCount,
        added: totalAdded,
        removed: totalRemoved,
      });

  const reviewLabel = t("agentChat.fileChangesSummary.review");

  return (
    <div
      data-testid="file-changes-summary-card"
      className="rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {isStreaming ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <span className="min-w-0 flex-1 text-sm text-slate-700">
          {summaryLabel}
          {!isStreaming && totalAdded + totalRemoved > 0 && (
            <span className="ml-1.5 text-xs text-slate-400">
              <span className="text-green-600">+{totalAdded}</span>
              {" "}
              <span className="text-red-500">−{totalRemoved}</span>
            </span>
          )}
        </span>
        {!isStreaming && (
          <>
            <span className="shrink-0 text-xs text-sky-600 hover:underline">
              {reviewLabel}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {expanded && !isStreaming && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-2">
          {files.map((file) => {
            const isFileExpanded = expandedFiles.has(file.path);
            const fileName = resolveFileName(file.path);
            return (
              <div key={file.path} className="text-sm">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-mono text-xs text-slate-700 hover:text-sky-600 truncate"
                    onClick={() => onFileClick?.(file.path)}
                    title={file.path}
                  >
                    {fileName}
                  </button>
                  <span className="shrink-0 text-xs text-slate-400">
                    <span className="text-green-600">+{file.linesAdded}</span>
                    {" "}
                    <span className="text-red-500">−{file.linesRemoved}</span>
                  </span>
                  {file.diff.length > 0 && (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
                      onClick={() => toggleFile(file.path)}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-150",
                          isFileExpanded && "rotate-180",
                        )}
                      />
                    </button>
                  )}
                </div>
                {isFileExpanded && <DiffLines summary={file} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
