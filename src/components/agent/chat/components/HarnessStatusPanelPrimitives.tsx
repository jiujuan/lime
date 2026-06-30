import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { FileCode2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  buildDiffReviewFileTreeItems,
  buildDiffReviewSideBySideRows,
  type DiffReviewLine,
  type DiffReviewSummary,
} from "../utils/diffReview";
import {
  findFirstUrl,
  isLikelyFilePath,
  resolveDiffReviewStatusLabelKey,
  splitTextIntoSegments,
} from "./harnessStatusPanelViewModel";

export type AgentTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function resolveDiffReviewLineClass(
  kind: DiffReviewLine["kind"] | "change",
  side: "before" | "after",
): string {
  if (kind === "hunk") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (kind === "change") {
    return side === "before"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (kind === "remove") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (kind === "add") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-border bg-background text-muted-foreground";
}

export function DiffReviewMiniPanel({
  summary,
  translate,
  onOpenPath,
  stopPropagation = false,
}: {
  summary: DiffReviewSummary;
  translate: AgentTranslation;
  onOpenPath: (path: string) => void | Promise<void>;
  stopPropagation?: boolean;
}) {
  const treeItems = buildDiffReviewFileTreeItems(summary.files).filter(
    (item) => item.kind === "file",
  );
  const visibleTreeItems = treeItems.slice(0, 5);
  const remainingTreeItemCount = Math.max(0, treeItems.length - 5);
  const firstFile = summary.files[0] ?? null;
  const sideBySideRows = firstFile
    ? buildDiffReviewSideBySideRows(firstFile, { maxRows: 8 })
    : [];

  return (
    <div
      className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3"
      data-testid="harness-diff-review-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
          <FileCode2 className="h-4 w-4 text-slate-600" />
          {translate("agentChat.harness.diff.title")}
        </div>
        <Badge variant="outline" className="border-slate-300 bg-background">
          {translate("agentChat.harness.diff.badge", {
            files: summary.files.length,
            additions: summary.additions,
            deletions: summary.deletions,
            hunks: summary.hunks,
          })}
        </Badge>
      </div>

      {visibleTreeItems.length > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="text-[11px] font-medium text-slate-700">
            {translate("agentChat.harness.diff.filesTitle")}
          </div>
          <div className="space-y-1">
            {visibleTreeItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-background px-2 py-1 text-[11px] text-slate-700"
              >
                <Badge variant="secondary">
                  {translate(resolveDiffReviewStatusLabelKey(item.status))}
                </Badge>
                <PathTextLink
                  path={item.path}
                  className="text-[11px]"
                  stopPropagation={stopPropagation}
                  onOpenPath={onOpenPath}
                />
                <span className="text-emerald-700">+{item.additions}</span>
                <span className="text-rose-700">-{item.deletions}</span>
              </div>
            ))}
            {remainingTreeItemCount > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {translate("agentChat.harness.diff.moreFiles", {
                  count: remainingTreeItemCount,
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {firstFile && sideBySideRows.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-slate-700">
              {translate("agentChat.harness.diff.sideBySideTitle")}
            </div>
            <PathTextLink
              path={firstFile.path}
              className="text-[11px]"
              stopPropagation={stopPropagation}
              onOpenPath={onOpenPath}
            />
          </div>
          <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
            <div className="text-[11px] font-medium text-rose-700">
              {translate("agentChat.harness.diff.before")}
            </div>
            <div className="text-[11px] font-medium text-emerald-700">
              {translate("agentChat.harness.diff.after")}
            </div>
          </div>
          <div className="space-y-1">
            {sideBySideRows.map((row) => (
              <div
                key={row.id}
                className="grid min-w-0 gap-1 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]"
              >
                <div
                  className={cn(
                    "min-h-6 whitespace-pre-wrap break-words rounded-md border px-2 py-1 font-mono text-[11px] leading-5",
                    row.before === null
                      ? "border-dashed border-slate-200 bg-background text-slate-400"
                      : resolveDiffReviewLineClass(row.kind, "before"),
                  )}
                >
                  {row.before ?? ""}
                </div>
                <div
                  className={cn(
                    "min-h-6 whitespace-pre-wrap break-words rounded-md border px-2 py-1 font-mono text-[11px] leading-5",
                    row.after === null
                      ? "border-dashed border-slate-200 bg-background text-slate-400"
                      : resolveDiffReviewLineClass(row.kind, "after"),
                  )}
                >
                  {row.after ?? ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InteractiveText({
  text,
  className,
  mono = false,
  stopPropagation = false,
  onOpenUrl,
}: {
  text?: string;
  className?: string;
  mono?: boolean;
  stopPropagation?: boolean;
  onOpenUrl: (url: string) => void | Promise<void>;
}) {
  if (!text?.trim()) {
    return null;
  }

  const segments = splitTextIntoSegments(text);

  return (
    <span
      className={cn(
        "whitespace-pre-wrap break-all",
        mono && "font-mono",
        className,
      )}
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <span key={`text-${index}`} className="whitespace-pre-wrap">
              {segment.value}
            </span>
          );
        }

        const handleOpen = (
          event:
            | ReactMouseEvent<HTMLSpanElement>
            | ReactKeyboardEvent<HTMLSpanElement>,
        ) => {
          if ("key" in event && event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          if (stopPropagation) {
            event.stopPropagation();
          }
          void onOpenUrl(segment.value);
        };

        return (
          <span
            key={`url-${segment.value}-${index}`}
            role="link"
            tabIndex={0}
            aria-label={`打开链接：${segment.value}`}
            className="cursor-pointer underline decoration-dotted underline-offset-2 text-primary transition-colors hover:text-primary/80"
            onClick={handleOpen}
            onKeyDown={handleOpen}
          >
            {segment.value}
          </span>
        );
      })}
    </span>
  );
}

export function PathTextLink({
  path,
  className,
  stopPropagation = false,
  onOpenPath,
}: {
  path?: string;
  className?: string;
  stopPropagation?: boolean;
  onOpenPath: (path: string) => void | Promise<void>;
}) {
  if (!path?.trim()) {
    return null;
  }

  const normalizedPath = path.trim();

  const handleOpen = (
    event:
      | ReactMouseEvent<HTMLSpanElement>
      | ReactKeyboardEvent<HTMLSpanElement>,
  ) => {
    if ("key" in event && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (stopPropagation) {
      event.stopPropagation();
    }
    void onOpenPath(normalizedPath);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`系统打开路径：${normalizedPath}`}
      className={cn(
        "cursor-pointer break-all underline decoration-dotted underline-offset-2 text-primary transition-colors hover:text-primary/80",
        className,
      )}
      onClick={handleOpen}
      onKeyDown={handleOpen}
    >
      {normalizedPath}
    </span>
  );
}

export function ActionableBadge({
  value,
  variant,
  onOpenUrl,
  onOpenPath,
}: {
  value: string;
  variant: ComponentProps<typeof Badge>["variant"];
  onOpenUrl: (url: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
}) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const matchedUrl = findFirstUrl(normalized);
  if (matchedUrl && matchedUrl === normalized) {
    return (
      <Badge variant={variant} className="max-w-full whitespace-normal">
        <InteractiveText text={normalized} onOpenUrl={onOpenUrl} />
      </Badge>
    );
  }

  if (isLikelyFilePath(normalized)) {
    return (
      <Badge variant={variant} className="max-w-full whitespace-normal">
        <PathTextLink path={normalized} onOpenPath={onOpenPath} />
      </Badge>
    );
  }

  return <Badge variant={variant}>{normalized}</Badge>;
}

export function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  onClick,
  compact = false,
}: {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  onClick?: () => void;
  compact?: boolean;
}) {
  const cardContent = (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium leading-5 text-muted-foreground">
          {title}
        </div>
        <div
          className={cn(
            "mt-1 break-words font-semibold leading-5 text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {value}
        </div>
        <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">
          {hint}
        </div>
      </div>
      <div className="shrink-0 rounded-lg bg-muted p-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "min-w-0 rounded-xl border border-border bg-background/80 text-left transition-colors hover:bg-muted/60",
          compact ? "p-2.5" : "p-3",
        )}
        onClick={onClick}
        aria-label={`跳转到${title}`}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-background/80",
        compact ? "p-2.5" : "p-3",
      )}
    >
      {cardContent}
    </div>
  );
}

export function InventoryStatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 text-base font-semibold text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
