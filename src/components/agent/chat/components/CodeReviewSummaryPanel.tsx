import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  GitCompare,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentI18nKey } from "@/i18n/agentResources";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import { cn } from "@/lib/utils";
import type { HarnessSessionState } from "../utils/harnessState";
import {
  countFailedHarnessOutputSignals,
  countPassingHarnessOutputSignals,
  resolvePriorityHarnessOutputSignal,
} from "../utils/harnessOutputSignals";
import {
  buildCodeFixPromptFromHarnessSignal,
  type CodeFixPromptFileChange,
} from "../utils/codeFixPrompt";
import type { CodeWorkbenchGuideTarget } from "./CodeWorkbenchGuide";
import type { HarnessFileChangeReviewSummary } from "./HarnessStatusPanel";

interface CodeReviewSummaryPanelProps {
  harnessState: HarnessSessionState;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  fileChangeReviewSummary?: HarnessFileChangeReviewSummary | null;
  onOpenSection: (target: CodeWorkbenchGuideTarget) => void;
  onOpenFileCheckpoints?: () => void;
  onSubmitCodeFixPrompt?: (prompt: string) => void | Promise<void>;
}

interface ReviewableFileChange extends CodeFixPromptFileChange {
  path: string;
  displayName: string;
}

interface ReviewStatusPresentation {
  key: "failed_output" | "file_review" | "outputs" | "snapshots";
  labelKey: AgentI18nKey;
  className: string;
}

type ReviewFocusTone = "danger" | "review" | "success" | "snapshot";

const OUTPUT_PREVIEW_MAX_CHARS = 220;

function outputMentionsFile(
  signal: HarnessSessionState["outputSignals"][number] | null,
  file: ReviewableFileChange | null,
): boolean {
  if (!signal || !file) {
    return false;
  }

  const haystack = [
    signal.title,
    signal.summary,
    signal.preview,
    signal.content,
  ]
    .join("\n")
    .toLowerCase();

  return (
    haystack.includes(file.displayName.toLowerCase()) ||
    haystack.includes(file.path.toLowerCase())
  );
}

function isReviewableFileEvent(
  event: HarnessSessionState["recentFileEvents"][number],
): boolean {
  if (event.action === "write" || event.action === "edit") {
    return true;
  }
  if (event.action !== "persist") {
    return false;
  }
  return event.kind !== "log" && event.kind !== "offload";
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
    if (path && isReviewableFileEvent(event)) {
      changesByPath.set(path, {
        path,
        displayName: event.displayName || path,
      });
    }
  }

  return [...changesByPath.values()];
}

function rankFileChangesForOutput(
  fileChanges: ReviewableFileChange[],
  signal: HarnessSessionState["outputSignals"][number] | null,
): ReviewableFileChange[] {
  if (!signal || fileChanges.length < 2) {
    return fileChanges;
  }

  return [...fileChanges].sort((left, right) => {
    const leftMentioned = outputMentionsFile(signal, left);
    const rightMentioned = outputMentionsFile(signal, right);

    if (leftMentioned === rightMentioned) {
      return 0;
    }
    return leftMentioned ? -1 : 1;
  });
}

function buildOutputPreviewText(
  signal: HarnessSessionState["outputSignals"][number] | null,
): string | null {
  const raw = signal?.content || signal?.preview || signal?.summary || "";
  const text = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n")
    .trim();

  if (!text) {
    return null;
  }

  if (text.length <= OUTPUT_PREVIEW_MAX_CHARS) {
    return text;
  }

  return `${text.slice(0, OUTPUT_PREVIEW_MAX_CHARS).trimEnd()}...`;
}

function buildOutputDetailText(
  signal: HarnessSessionState["outputSignals"][number] | null,
): string | null {
  if (!signal) {
    return null;
  }

  const parts = [signal.title, signal.summary, signal.preview]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return [...new Set(parts)].slice(0, 2).join(" · ") || null;
}

export function CodeReviewSummaryPanel({
  harnessState,
  fileCheckpointSummary,
  fileChangeReviewSummary,
  onOpenSection,
  onOpenFileCheckpoints,
  onSubmitCodeFixPrompt,
}: CodeReviewSummaryPanelProps) {
  const { t } = useTranslation("agent");
  const [fixSubmitting, setFixSubmitting] = useState(false);
  const fileChanges = useMemo(
    () => resolveReviewableFileChanges(harnessState),
    [harnessState],
  );
  const passingOutputCount = countPassingHarnessOutputSignals(
    harnessState.outputSignals,
  );
  const failedOutputCount = countFailedHarnessOutputSignals(
    harnessState.outputSignals,
  );
  const outputSignalForDetail = resolvePriorityHarnessOutputSignal(
    harnessState.outputSignals,
  );
  const prioritizedFileChanges = useMemo(
    () => rankFileChangesForOutput(fileChanges, outputSignalForDetail),
    [fileChanges, outputSignalForDetail],
  );
  const outputDetail = buildOutputDetailText(outputSignalForDetail);
  const outputPreviewText = buildOutputPreviewText(outputSignalForDetail);
  const checkpointCount = fileCheckpointSummary?.count ?? 0;
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const focusOutputLabel =
    outputDetail || t("agentChat.harness.codeReview.focus.outputFallback");
  const visibleFileChanges = prioritizedFileChanges.slice(0, 3);
  const hiddenFileChangeCount = Math.max(
    prioritizedFileChanges.length - visibleFileChanges.length,
    0,
  );
  const focusFileLabel =
    visibleFileChanges[0]?.displayName ||
    t("agentChat.harness.codeReview.focus.fileFallback");
  const shouldShowReviewPair =
    harnessState.outputSignals.length > 0 && visibleFileChanges.length > 0;
  const reviewPairFile = visibleFileChanges[0] || null;
  const reviewPairFileMentioned = outputMentionsFile(
    outputSignalForDetail,
    reviewPairFile,
  );
  const reviewSummary = fileChangeReviewSummary?.total
    ? fileChangeReviewSummary
    : null;
  const confirmedFileChangeCount = reviewSummary
    ? reviewSummary.applied + reviewSummary.rejected
    : 0;
  const primaryActionKey =
    failedOutputCount > 0 && harnessState.outputSignals.length > 0
      ? "agentChat.harness.codeReview.action.viewFailedOutput"
      : fileChanges.length > 0
        ? "agentChat.harness.codeReview.action.review"
        : harnessState.outputSignals.length > 0
          ? "agentChat.harness.codeReview.action.viewOutput"
          : checkpointCount > 0
            ? "agentChat.harness.codeReview.action.viewSnapshots"
            : "agentChat.harness.codeReview.action.review";
  const hasReviewSurface =
    fileChanges.length > 0 ||
    harnessState.outputSignals.length > 0 ||
    checkpointCount > 0;
  const codeFixPrompt = useMemo(() => {
    if (failedOutputCount === 0 || !outputSignalForDetail) {
      return null;
    }
    return buildCodeFixPromptFromHarnessSignal({
      signal: outputSignalForDetail,
      fileChanges: prioritizedFileChanges,
      fileCheckpointSummary,
      copy: {
        intro: t("agentChat.harness.codeReview.fixPrompt.intro"),
        requirements: t(
          "agentChat.harness.codeReview.fixPrompt.requirements",
        ),
        failedTool: t("agentChat.harness.codeReview.fixPrompt.failedTool"),
        failedTitle: t("agentChat.harness.codeReview.fixPrompt.failedTitle"),
        failedSummary: t(
          "agentChat.harness.codeReview.fixPrompt.failedSummary",
        ),
        failedPreview: t(
          "agentChat.harness.codeReview.fixPrompt.failedPreview",
        ),
        relatedFiles: t("agentChat.harness.codeReview.fixPrompt.relatedFiles"),
        latestCheckpoint: t(
          "agentChat.harness.codeReview.fixPrompt.latestCheckpoint",
        ),
      },
    });
  }, [
    failedOutputCount,
    prioritizedFileChanges,
    fileCheckpointSummary,
    outputSignalForDetail,
    t,
  ]);
  const canSubmitCodeFix = Boolean(onSubmitCodeFixPrompt && codeFixPrompt);
  const reviewStatus: ReviewStatusPresentation =
    failedOutputCount > 0
      ? {
          key: "failed_output",
          labelKey: "agentChat.harness.codeReview.status.failedOutput",
          className: "border-rose-200 bg-rose-50 text-rose-700",
        }
      : reviewSummary && reviewSummary.pending === 0
        ? {
            key: reviewSummary.rejected > 0 ? "snapshots" : "outputs",
            labelKey:
              reviewSummary.rejected > 0
                ? "agentChat.harness.codeReview.status.rollbackReviewed"
                : "agentChat.harness.codeReview.status.reviewed",
            className:
              reviewSummary.rejected > 0
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
          }
        : fileChanges.length > 0
        ? {
            key: "file_review",
            labelKey: "agentChat.harness.codeReview.status.fileReview",
            className: "border-sky-200 bg-sky-50 text-sky-700",
          }
        : harnessState.outputSignals.length > 0
          ? {
              key: "outputs",
              labelKey: "agentChat.harness.codeReview.status.outputsReady",
              className: "border-emerald-200 bg-emerald-50 text-emerald-700",
            }
          : {
              key: "snapshots",
              labelKey: "agentChat.harness.codeReview.status.snapshotsReady",
              className: "border-amber-200 bg-amber-50 text-amber-700",
            };
  const focusTone: ReviewFocusTone =
    failedOutputCount > 0
      ? "danger"
      : fileChanges.length > 0
        ? "review"
        : harnessState.outputSignals.length > 0
          ? "success"
          : "snapshot";
  const focusDescriptionKey: AgentI18nKey =
    failedOutputCount > 0 && fileChanges.length > 0
      ? "agentChat.harness.codeReview.focus.failedWithFiles"
      : failedOutputCount > 0
        ? "agentChat.harness.codeReview.focus.failed"
        : fileChanges.length > 0
          ? "agentChat.harness.codeReview.focus.files"
          : harnessState.outputSignals.length > 0
            ? "agentChat.harness.codeReview.focus.outputs"
            : "agentChat.harness.codeReview.focus.snapshots";

  if (!hasReviewSurface) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-950"
      data-testid="code-review-summary-panel"
      data-status={reviewStatus.key}
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
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                reviewStatus.className,
              )}
              data-testid="code-review-summary-status"
            >
              {t(reviewStatus.labelKey)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {t("agentChat.harness.codeReview.description", {
              files: fileChanges.length,
              outputs: harnessState.outputSignals.length,
              checkpoints: checkpointCount,
            })}
            {reviewSummary ? (
              <span
                className="mt-1 block"
                data-testid="code-review-summary-review-state"
              >
                {t("agentChat.harness.codeReview.reviewState", {
                  pending: reviewSummary.pending,
                  applied: reviewSummary.applied,
                  rejected: reviewSummary.rejected,
                })}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canSubmitCodeFix ? (
            <Button
              type="button"
              size="sm"
              disabled={fixSubmitting}
              onClick={async () => {
                if (!codeFixPrompt || !onSubmitCodeFixPrompt) {
                  return;
                }
                setFixSubmitting(true);
                try {
                  await onSubmitCodeFixPrompt(codeFixPrompt);
                } finally {
                  setFixSubmitting(false);
                }
              }}
              data-testid="code-review-summary-fix-action"
            >
              {fixSubmitting
                ? t("agentChat.harness.codeReview.action.fixFailedOutputBusy")
                : t("agentChat.harness.codeReview.action.fixFailedOutput")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              if (
                failedOutputCount > 0 &&
                harnessState.outputSignals.length > 0
              ) {
                onOpenSection("outputs");
                return;
              }
              if (fileChanges.length > 0) {
                onOpenSection("file_review");
                return;
              }
              if (harnessState.outputSignals.length > 0) {
                onOpenSection("outputs");
                return;
              }
              if (checkpointCount > 0 && onOpenFileCheckpoints) {
                onOpenFileCheckpoints?.();
                return;
              }
              onOpenSection("runtime");
            }}
            data-testid="code-review-summary-primary-action"
          >
            {t(primaryActionKey)}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 rounded-lg border px-3 py-2",
          focusTone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-950"
            : focusTone === "review"
              ? "border-sky-200 bg-sky-50 text-sky-950"
              : focusTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950",
        )}
        data-testid="code-review-summary-focus"
        data-tone={focusTone}
      >
        <div className="text-[11px] font-medium">
          {t("agentChat.harness.codeReview.focus.title")}
        </div>
        <div className="mt-1 text-xs leading-5 text-current/75">
          {t(focusDescriptionKey, {
            output: focusOutputLabel,
            file: focusFileLabel,
            files: fileChanges.length,
            checkpoints: checkpointCount,
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {harnessState.outputSignals.length > 0 ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-current/15 bg-white/75 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white"
              onClick={() => onOpenSection("outputs")}
              data-testid="code-review-summary-focus-output"
            >
              <TerminalSquare className="h-3.5 w-3.5" />
              {t("agentChat.harness.codeReview.focus.openOutput")}
            </button>
          ) : null}
          {fileChanges.length > 0 ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-current/15 bg-white/75 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white"
              onClick={() => onOpenSection("file_review")}
              data-testid="code-review-summary-focus-files"
            >
              <FileText className="h-3.5 w-3.5" />
              {t("agentChat.harness.codeReview.focus.openFiles")}
            </button>
          ) : null}
          {checkpointCount > 0 && onOpenFileCheckpoints ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-current/15 bg-white/75 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white"
              onClick={onOpenFileCheckpoints}
              data-testid="code-review-summary-focus-snapshots"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("agentChat.harness.codeReview.focus.openSnapshots")}
            </button>
          ) : null}
        </div>
      </div>

      {shouldShowReviewPair ? (
        <div
          className="mt-3 grid gap-2 md:grid-cols-2"
          data-testid="code-review-summary-pair"
        >
          <button
            type="button"
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              failedOutputCount > 0
                ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100",
            )}
            onClick={() => onOpenSection("outputs")}
            data-testid="code-review-summary-pair-output"
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <TerminalSquare className="h-4 w-4" />
              {t(
                failedOutputCount > 0
                  ? "agentChat.harness.codeReview.pair.failedOutput"
                  : "agentChat.harness.codeReview.pair.output",
              )}
            </div>
            <div className="mt-1 truncate text-xs text-current/75">
              {focusOutputLabel}
            </div>
            {outputPreviewText ? (
              <div className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-current/15 bg-white/75 px-2 py-1.5 font-mono text-[11px] leading-5">
                {outputPreviewText}
              </div>
            ) : null}
          </button>
          <button
            type="button"
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sky-950 transition-colors hover:bg-sky-100"
            onClick={() => onOpenSection("file_review")}
            data-testid="code-review-summary-pair-file"
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <FileText className="h-4 w-4" />
              {t("agentChat.harness.codeReview.pair.file")}
            </div>
            <div className="mt-1 truncate text-xs text-current/75">
              {reviewPairFile?.displayName ||
                t("agentChat.harness.codeReview.focus.fileFallback")}
            </div>
            <div className="mt-2 text-xs leading-5 text-current/65">
              {t(
                reviewPairFileMentioned
                  ? "agentChat.harness.codeReview.pair.fileMentionedHint"
                  : "agentChat.harness.codeReview.pair.fileHint",
                {
                  files: fileChanges.length,
                },
              )}
            </div>
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            fileChanges.length > 0
              ? "border-sky-200 bg-sky-50 hover:bg-sky-100"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
          disabled={fileChanges.length === 0}
          onClick={() => onOpenSection("file_review")}
          data-testid="code-review-summary-files"
          data-confirmed={String(confirmedFileChangeCount)}
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
            {hiddenFileChangeCount > 0 ? (
              <div className="mt-1 text-current/70">
                {t("agentChat.harness.codeReview.metric.filesMore", {
                  count: hiddenFileChangeCount,
                })}
              </div>
            ) : null}
            {reviewSummary ? (
              <div className="mt-1 text-current/70">
                {t("agentChat.harness.codeReview.metric.filesReviewState", {
                  pending: reviewSummary.pending,
                  applied: reviewSummary.applied,
                  rejected: reviewSummary.rejected,
                })}
              </div>
            ) : null}
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
          disabled={harnessState.outputSignals.length === 0}
          onClick={() => onOpenSection("outputs")}
          data-testid="code-review-summary-outputs"
          data-tone={
            failedOutputCount > 0
              ? "danger"
              : harnessState.outputSignals.length > 0
                ? "success"
                : "muted"
          }
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <TerminalSquare className="h-4 w-4" />
            {t("agentChat.harness.codeReview.metric.outputs", {
              count: harnessState.outputSignals.length,
            })}
          </div>
          <div className="mt-1 text-xs leading-5">
            <div>
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
            {outputDetail ? (
              <div className="mt-1 truncate text-current/75">
                {outputDetail}
              </div>
            ) : null}
            {outputPreviewText ? (
              <div
                className={cn(
                  "mt-2 rounded-md border px-2 py-1.5",
                  "max-h-24 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-5",
                  failedOutputCount > 0
                    ? "border-rose-200 bg-white/75 text-rose-950"
                    : "border-emerald-200 bg-white/75 text-emerald-950",
                )}
                data-testid="code-review-summary-output-preview"
              >
                <div className="mb-0.5 font-sans text-[10px] font-medium text-current/65">
                  {t(
                    failedOutputCount > 0
                      ? "agentChat.harness.codeReview.metric.outputPreviewFailed"
                      : "agentChat.harness.codeReview.metric.outputPreview",
                  )}
                </div>
                {outputPreviewText}
              </div>
            ) : null}
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
