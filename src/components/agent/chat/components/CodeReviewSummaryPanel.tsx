import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  GitCompare,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import { cn } from "@/lib/utils";
import type { HarnessSessionState } from "../utils/harnessState";
import type { CodeWorkbenchGuideTarget } from "./CodeWorkbenchGuide";

interface CodeReviewSummaryPanelProps {
  harnessState: HarnessSessionState;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenSection: (target: CodeWorkbenchGuideTarget) => void;
  onOpenFileCheckpoints?: () => void;
}

interface ReviewableFileChange {
  path: string;
  displayName: string;
}

function isReviewableAction(
  action: HarnessSessionState["recentFileEvents"][number]["action"],
): boolean {
  return action === "write" || action === "edit";
}

function resolveReviewableFileChanges(
  harnessState: HarnessSessionState,
): ReviewableFileChange[] {
  const changesByPath = new Map<string, ReviewableFileChange>();

  for (const write of harnessState.activeFileWrites) {
    const path = write.path.trim();
    if (path) {
      changesByPath.set(path, {
        path,
        displayName: write.displayName || path,
      });
    }
  }

  for (const event of harnessState.recentFileEvents) {
    const path = event.path.trim();
    if (path && isReviewableAction(event.action)) {
      changesByPath.set(path, {
        path,
        displayName: event.displayName || path,
      });
    }
  }

  return [...changesByPath.values()];
}

function resolvePassingOutputCount(harnessState: HarnessSessionState): number {
  return harnessState.outputSignals.filter((signal) => {
    if (typeof signal.exitCode === "number") {
      return signal.exitCode === 0;
    }
    return /pass|passed|ok|success|成功|通过/i.test(
      [signal.title, signal.summary, signal.preview].filter(Boolean).join(" "),
    );
  }).length;
}

function resolveFailedOutputCount(harnessState: HarnessSessionState): number {
  return harnessState.outputSignals.filter((signal) => {
    if (typeof signal.exitCode === "number") {
      return signal.exitCode !== 0;
    }
    return /fail|failed|error|失败|错误|报错/i.test(
      [signal.title, signal.summary, signal.preview].filter(Boolean).join(" "),
    );
  }).length;
}

export function CodeReviewSummaryPanel({
  harnessState,
  fileCheckpointSummary,
  onOpenSection,
  onOpenFileCheckpoints,
}: CodeReviewSummaryPanelProps) {
  const { t } = useTranslation("agent");
  const fileChanges = useMemo(
    () => resolveReviewableFileChanges(harnessState),
    [harnessState],
  );
  const visibleFileChanges = fileChanges.slice(0, 3);
  const passingOutputCount = resolvePassingOutputCount(harnessState);
  const failedOutputCount = resolveFailedOutputCount(harnessState);
  const checkpointCount = fileCheckpointSummary?.count ?? 0;
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const hasReviewSurface =
    fileChanges.length > 0 ||
    harnessState.outputSignals.length > 0 ||
    checkpointCount > 0;

  if (!hasReviewSurface) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-950"
      data-testid="code-review-summary-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
              <GitCompare className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold">
              {t("agentChat.harness.codeReview.title")}
            </div>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {t("agentChat.harness.codeReview.description", {
              files: fileChanges.length,
              outputs: harnessState.outputSignals.length,
              checkpoints: checkpointCount,
            })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() =>
            onOpenSection(fileChanges.length > 0 ? "file_review" : "outputs")
          }
          data-testid="code-review-summary-primary-action"
        >
          {t("agentChat.harness.codeReview.action.review")}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            fileChanges.length > 0
              ? "border-sky-200 bg-sky-50 hover:bg-sky-100"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
          onClick={() => onOpenSection("file_review")}
          data-testid="code-review-summary-files"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <FileText className="h-4 w-4" />
            {t("agentChat.harness.codeReview.metric.files", {
              count: fileChanges.length,
            })}
          </div>
          <div className="mt-1 text-xs leading-5">
            {visibleFileChanges.length > 0
              ? visibleFileChanges.map((item) => item.displayName).join(", ")
              : t("agentChat.harness.codeReview.metric.filesEmpty")}
          </div>
        </button>

        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            failedOutputCount > 0
              ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
              : harnessState.outputSignals.length > 0
                ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-50 text-slate-500",
          )}
          onClick={() => onOpenSection("outputs")}
          data-testid="code-review-summary-outputs"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <TerminalSquare className="h-4 w-4" />
            {t("agentChat.harness.codeReview.metric.outputs", {
              count: harnessState.outputSignals.length,
            })}
          </div>
          <div className="mt-1 text-xs leading-5">
            {failedOutputCount > 0
              ? t("agentChat.harness.codeReview.metric.outputsFailed", {
                  count: failedOutputCount,
                })
              : passingOutputCount > 0
                ? t("agentChat.harness.codeReview.metric.outputsPassing", {
                    count: passingOutputCount,
                  })
              : t("agentChat.harness.codeReview.metric.outputsEmpty")}
          </div>
        </button>

        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            checkpointCount > 0
              ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
          disabled={!onOpenFileCheckpoints || checkpointCount === 0}
          onClick={onOpenFileCheckpoints}
          data-testid="code-review-summary-checkpoints"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <RotateCcw className="h-4 w-4" />
            {t("agentChat.harness.codeReview.metric.checkpoints", {
              count: checkpointCount,
            })}
          </div>
          <div className="mt-1 text-xs leading-5">
            {latestCheckpoint?.path ||
              t("agentChat.harness.codeReview.metric.checkpointsEmpty")}
          </div>
        </button>
      </div>
    </div>
  );
}
