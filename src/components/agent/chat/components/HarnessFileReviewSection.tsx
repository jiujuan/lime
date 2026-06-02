import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileArchive,
  FileCode2,
  FileText,
  SquareCheckBig,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HarnessFileKind } from "../utils/harnessState";
import {
  DiffReviewMiniPanel,
  InteractiveText,
  PathTextLink,
  type AgentTranslation,
} from "./HarnessStatusPanelPrimitives";
import {
  buildFileChangeReviewDiffSummary,
  buildFileReviewSummaryTextParts,
  formatHarnessTime,
  joinDisplayParts,
  resolveFileChangeStatusLabelKey,
  resolveFileReviewActionLabelKey,
  resolveFileReviewKindLabelKey,
  type FileChangeDecisionStatus,
  type FileChangeReviewEntry,
} from "./harnessStatusPanelViewModel";

interface FileReviewPreviewRequest {
  title: string;
  description?: string;
  path?: string;
  content?: string;
  preview?: string;
}

interface HarnessFileReviewSectionProps {
  entries: FileChangeReviewEntry[];
  statusCounts: Record<FileChangeDecisionStatus, number>;
  selectableKeys: string[];
  selectedSet: Set<string>;
  selectedEntries: FileChangeReviewEntry[];
  selectedCount: number;
  allSelected: boolean;
  setSelectedKeys: Dispatch<SetStateAction<string[]>>;
  setDecisions: Dispatch<
    SetStateAction<Record<string, FileChangeDecisionStatus>>
  >;
  onOpenFileCheckpoints?: () => void;
  onOpenPreview: (request: FileReviewPreviewRequest) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void | Promise<void>;
  onRejectedWithoutCheckpoint: () => void;
  onAppliedSelection: (count: number) => void;
  translate: AgentTranslation;
}

function resolveKindIcon(kind: HarnessFileKind): LucideIcon {
  switch (kind) {
    case "code":
      return FileCode2;
    case "artifact":
    case "offload":
      return FileArchive;
    default:
      return FileText;
  }
}

function summarizeFileReviewActionText(
  translate: AgentTranslation,
  items: FileChangeReviewEntry["actionSummaryItems"],
): string {
  return buildFileReviewSummaryTextParts(items)
    .map((item) =>
      translate(item.labelKey, {
        label: translate(item.valueLabelKey),
        count: item.count,
      }),
    )
    .join(" · ");
}

export function HarnessFileReviewSection({
  entries,
  statusCounts,
  selectableKeys,
  selectedSet,
  selectedEntries,
  selectedCount,
  allSelected,
  setSelectedKeys,
  setDecisions,
  onOpenFileCheckpoints,
  onOpenPreview,
  onOpenPath,
  onOpenUrl,
  onRejectedWithoutCheckpoint,
  onAppliedSelection,
  translate,
}: HarnessFileReviewSectionProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-sky-950">
              {translate("agentChat.harness.fileReview.summaryTitle")}
            </div>
            <div className="mt-1 text-xs leading-5 text-sky-800">
              {translate("agentChat.harness.fileReview.summary", {
                pending: statusCounts.pending,
                applied: statusCounts.applied,
                rejected: statusCounts.rejected,
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-sky-300 bg-white text-sky-700"
            >
              {translate("agentChat.harness.fileReview.pendingCount", {
                count: statusCounts.pending,
              })}
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-300 bg-white text-emerald-700"
            >
              {translate("agentChat.harness.fileReview.appliedCount", {
                count: statusCounts.applied,
              })}
            </Badge>
            <Badge
              variant="outline"
              className="border-rose-300 bg-white text-rose-700"
            >
              {translate("agentChat.harness.fileReview.rejectedCount", {
                count: statusCounts.rejected,
              })}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedKeys(allSelected ? [] : selectableKeys)}
            aria-label={translate(
              allSelected
                ? "agentChat.harness.fileReview.clearSelectionAria"
                : "agentChat.harness.fileReview.selectAllAria",
            )}
          >
            <SquareCheckBig className="mr-1 h-4 w-4" />
            {allSelected
              ? translate("agentChat.harness.fileReview.clearSelection")
              : translate("agentChat.harness.fileReview.selectAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedCount === 0}
            onClick={() => {
              setDecisions((previous) => ({
                ...previous,
                ...Object.fromEntries(
                  selectedEntries.map((entry) => [
                    entry.key,
                    "applied" as const,
                  ]),
                ),
              }));
              onAppliedSelection(selectedCount);
            }}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {translate("agentChat.harness.fileReview.markApplied", {
              count: selectedCount,
            })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedCount === 0}
            onClick={() => {
              setDecisions((previous) => ({
                ...previous,
                ...Object.fromEntries(
                  selectedEntries.map((entry) => [
                    entry.key,
                    "rejected" as const,
                  ]),
                ),
              }));
              if (onOpenFileCheckpoints) {
                onOpenFileCheckpoints();
              } else {
                onRejectedWithoutCheckpoint();
              }
            }}
          >
            <XCircle className="mr-1 h-4 w-4" />
            {translate("agentChat.harness.fileReview.markRejected", {
              count: selectedCount,
            })}
          </Button>
        </div>
        {onOpenFileCheckpoints ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenFileCheckpoints}
          >
            <Undo2 className="mr-1 h-4 w-4" />
            {translate("agentChat.harness.fileReview.openCheckpoints")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {entries.map((entry) => {
          const Icon = resolveKindIcon(entry.kind);
          const selected = selectedSet.has(entry.key);
          const latestActionLabel = translate(
            resolveFileReviewActionLabelKey(entry.latestAction),
          );
          const kindLabel = translate(
            resolveFileReviewKindLabelKey(entry.kind),
          );
          const actionSummary = summarizeFileReviewActionText(
            translate,
            entry.actionSummaryItems,
          );
          const diffSummary = buildFileChangeReviewDiffSummary(entry);
          return (
            <div
              key={entry.key}
              className={cn(
                "rounded-xl border bg-background p-3",
                selected
                  ? "border-primary/50 ring-1 ring-primary/20"
                  : "border-border",
              )}
              data-testid={`harness-file-review-item-${entry.displayName}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border"
                    checked={selected}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelectedKeys((previous) =>
                        checked
                          ? previous.includes(entry.key)
                            ? previous
                            : [...previous, entry.key]
                          : previous.filter((key) => key !== entry.key),
                      );
                    }}
                    aria-label={translate(
                      "agentChat.harness.fileReview.selectItemAria",
                      { path: entry.path },
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {entry.displayName}
                      </span>
                    </span>
                    <PathTextLink
                      path={entry.path}
                      className="mt-1 text-xs"
                      stopPropagation={true}
                      onOpenPath={onOpenPath}
                    />
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{formatHarnessTime(entry.timestamp)}</span>
                      <span>·</span>
                      <span>{latestActionLabel}</span>
                      <span>·</span>
                      <span>{actionSummary}</span>
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary">{kindLabel}</Badge>
                  <Badge
                    variant={
                      entry.status === "applied"
                        ? "secondary"
                        : entry.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {translate(resolveFileChangeStatusLabelKey(entry.status))}
                  </Badge>
                </div>
              </div>

              {diffSummary ? (
                <DiffReviewMiniPanel
                  summary={diffSummary}
                  translate={translate}
                  onOpenPath={onOpenPath}
                  stopPropagation={true}
                />
              ) : entry.preview ? (
                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                  <InteractiveText
                    text={entry.preview}
                    mono={true}
                    stopPropagation={true}
                    onOpenUrl={onOpenUrl}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void onOpenPreview({
                      title: entry.displayName,
                      description: joinDisplayParts([
                        latestActionLabel,
                        kindLabel,
                        actionSummary,
                      ]),
                      path: entry.path,
                      content: entry.content,
                      preview: entry.preview,
                    })
                  }
                >
                  <Eye className="mr-1 h-4 w-4" />
                  {translate("agentChat.harness.fileReview.preview")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDecisions((previous) => ({
                      ...previous,
                      [entry.key]: "applied",
                    }))
                  }
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {translate("agentChat.harness.fileReview.applyOne")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDecisions((previous) => ({
                      ...previous,
                      [entry.key]: "rejected",
                    }));
                    if (onOpenFileCheckpoints) {
                      onOpenFileCheckpoints();
                    } else {
                      onRejectedWithoutCheckpoint();
                    }
                  }}
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  {translate("agentChat.harness.fileReview.rejectOne")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
