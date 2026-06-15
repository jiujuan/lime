import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  collapseCanvasWorkbenchDiffContext,
  type CanvasWorkbenchDisplayedDiffLine,
} from "../../../utils/canvasWorkbenchDiff";
import { CanvasWorkbenchDiffState } from "./CanvasWorkbenchDiffState";
import { DiffStats } from "./CanvasWorkbenchChangeStats";
import {
  buildCanvasWorkbenchChangeDiffLines,
  countCanvasWorkbenchChangeItemStats,
  resolveChangeDisplayMeta,
  type CanvasWorkbenchChangeItem,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { CanvasWorkbenchChangeStatusMark } from "./CanvasWorkbenchChangeStatusMark";
import type { CanvasWorkbenchTranslation } from "./CanvasWorkbenchChangesTypes";

interface CanvasWorkbenchChangeDiffListProps {
  items: CanvasWorkbenchChangeItem[];
  selectedChangeItem?: CanvasWorkbenchChangeItem;
  fullFileContentById?: Record<string, string>;
  loadFullFile?: boolean;
  collapseDiffContext: boolean;
  textDiffEnabled: boolean;
  panelClassName: string;
  diffVariant: "inline" | "split";
  showWhitespace: boolean;
  wordWrapEnabled: boolean;
  translateWorkbench: CanvasWorkbenchTranslation;
  onSelectChangeItem?: (item: CanvasWorkbenchChangeItem) => void;
}

function buildVisibleDiffLines(
  item: CanvasWorkbenchChangeItem,
  fullFileContentById: Record<string, string> | undefined,
  loadFullFile: boolean,
  collapseDiffContext: boolean,
  textDiffEnabled: boolean,
): CanvasWorkbenchDisplayedDiffLine[] {
  const loadedContent = loadFullFile
    ? fullFileContentById?.[item.id]
    : undefined;
  const diffLines = buildCanvasWorkbenchChangeDiffLines(item, loadedContent);
  if (collapseDiffContext) {
    return collapseCanvasWorkbenchDiffContext(diffLines);
  }
  if (textDiffEnabled) {
    return diffLines;
  }
  return diffLines.filter((line) => line.type !== "context");
}

export function CanvasWorkbenchChangeDiffList({
  items,
  selectedChangeItem,
  fullFileContentById,
  loadFullFile = false,
  collapseDiffContext,
  textDiffEnabled,
  panelClassName,
  diffVariant,
  showWhitespace,
  wordWrapEnabled,
  translateWorkbench,
  onSelectChangeItem,
}: CanvasWorkbenchChangeDiffListProps) {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white">
      <div className="min-w-[760px]">
        {items.map((item) => {
          const diffLines = buildCanvasWorkbenchChangeDiffLines(
            item,
            loadFullFile ? fullFileContentById?.[item.id] : undefined,
          );
          const visibleDiffLines = buildVisibleDiffLines(
            item,
            fullFileContentById,
            loadFullFile,
            collapseDiffContext,
            textDiffEnabled,
          );
          const stats = countCanvasWorkbenchChangeItemStats(item);
          const meta = resolveChangeDisplayMeta(item);
          const active = item.id === selectedChangeItem?.id;

          return (
            <section
              key={item.id}
              data-testid="canvas-workbench-change-diff-file"
              data-change-id={item.id}
              className={cn(
                "border-b border-slate-200 bg-white",
                active && "shadow-[inset_3px_0_0_#22c55e]",
              )}
            >
              <button
                type="button"
                className={cn(
                  "flex h-9 w-full items-center justify-between gap-2 border-b border-slate-200 px-3 text-left transition-colors hover:bg-slate-50",
                  active ? "bg-emerald-50/60" : "bg-white",
                )}
                onClick={() => onSelectChangeItem?.(item)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <CanvasWorkbenchChangeStatusMark
                    meta={meta}
                    translateWorkbench={translateWorkbench}
                  />
                  <span className="truncate text-[13px] font-medium text-slate-700">
                    {item.path}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">
                    <DiffStats stats={stats} />
                  </span>
                </span>
              </button>
              {diffLines.length > 0 ? (
                <div className="max-h-[560px] min-h-[72px] overflow-hidden">
                  <CanvasWorkbenchDiffState
                    diffLines={visibleDiffLines}
                    panelClassName={panelClassName}
                    variant={diffVariant}
                    filePath={item.path}
                    showWhitespace={showWhitespace}
                    wordWrapEnabled={wordWrapEnabled}
                    omittedLabel={(count) =>
                      translateWorkbench(
                        "agentChat.canvasWorkbench.coding.changes.omittedLines",
                        { count },
                      )
                    }
                    beforeLabel={translateWorkbench(
                      "agentChat.canvasWorkbench.coding.changes.beforeLabel",
                    )}
                    afterLabel={translateWorkbench(
                      "agentChat.canvasWorkbench.coding.changes.afterLabel",
                    )}
                  />
                </div>
              ) : item.preview ? (
                <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-6 text-slate-700">
                  {item.preview}
                </pre>
              ) : (
                <div className="px-4 py-3 text-xs text-slate-500">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.coding.changes.noDiff",
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
