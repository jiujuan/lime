import React, { useMemo } from "react";
import {
  CornerDownRight,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FileChangesAggregate, FileChangeSummary } from "../utils/fileChangeSummary";

interface FileChangesSummaryCardProps {
  aggregate: FileChangesAggregate;
  isStreaming?: boolean;
  onFileClick?: (path: string) => void;
}

const MAX_REVIEW_ROWS = 4;

interface FileChangeReviewRow {
  id: string;
  path: string;
  text: string;
}

function normalizePreviewText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function resolveFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function buildReviewRows(files: FileChangeSummary[]): FileChangeReviewRow[] {
  const rows: FileChangeReviewRow[] = [];

  for (const file of files) {
    const changedLines = file.diff.filter(
      (line) => line.kind === "add" || line.kind === "remove",
    );
    const sourceLines = changedLines.length > 0 ? changedLines : file.diff;

    for (const [index, line] of sourceLines.entries()) {
      const text = normalizePreviewText(line.value);
      if (!text) {
        continue;
      }
      rows.push({
        id: `${file.path}:${index}:${line.kind}`,
        path: file.path,
        text,
      });
      if (rows.length >= MAX_REVIEW_ROWS) {
        return rows;
      }
    }

    if (sourceLines.length === 0) {
      rows.push({
        id: `${file.path}:file`,
        path: file.path,
        text: resolveFileName(file.path),
      });
      if (rows.length >= MAX_REVIEW_ROWS) {
        return rows;
      }
    }
  }

  return rows;
}

export function FileChangesSummaryCard({
  aggregate,
  isStreaming = false,
  onFileClick,
}: FileChangesSummaryCardProps) {
  const { t } = useTranslation("agent");
  const { files, totalAdded, totalRemoved, fileCount } = aggregate;
  const reviewRows = useMemo(() => buildReviewRows(files), [files]);

  const summaryLabel = isStreaming
    ? t("agentChat.fileChangesSummary.writing")
    : t("agentChat.fileChangesSummary.summary", {
        count: fileCount,
        added: totalAdded,
        removed: totalRemoved,
      });

  const reviewLabel = t("agentChat.fileChangesSummary.review");
  const guideLabel = t("agentChat.fileChangesSummary.guide");
  const firstFilePath = files[0]?.path;

  return (
    <div
      data-testid="file-changes-summary-card"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
    >
      <div
        data-testid="file-changes-summary-card-header"
        className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
          ) : null}
          <div className="min-w-0 text-sm font-medium leading-6 text-slate-700">
            <span>{summaryLabel}</span>
            {!isStreaming && totalAdded + totalRemoved > 0 ? (
              <span className="ml-2 whitespace-nowrap font-semibold">
                <span className="text-emerald-600">+{totalAdded}</span>
                <span className="ml-1 text-red-500">-{totalRemoved}</span>
              </span>
            ) : null}
          </div>
        </div>
        {!isStreaming && firstFilePath ? (
          <button
            type="button"
            className="shrink-0 text-sm font-medium leading-6 text-slate-900 transition-colors hover:text-sky-700"
            onClick={() => onFileClick?.(firstFilePath)}
          >
            {reviewLabel}
          </button>
        ) : null}
      </div>

      {!isStreaming && reviewRows.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {reviewRows.map((row) => (
            <div
              key={row.id}
              data-testid="file-changes-summary-row"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3 py-2"
            >
              <button
                type="button"
                className="flex min-w-0 items-start gap-2 text-left text-sm leading-6 text-slate-500 transition-colors hover:text-slate-700"
                onClick={() => onFileClick?.(row.path)}
                title={row.path}
              >
                <CornerDownRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                <span
                  data-testid="file-changes-summary-row-preview"
                  className="line-clamp-2 min-w-0 break-words"
                >
                  {row.text}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-3 text-sm leading-6 text-slate-400">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-sky-700"
                  onClick={() => onFileClick?.(row.path)}
                >
                  <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                  {guideLabel}
                </button>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
