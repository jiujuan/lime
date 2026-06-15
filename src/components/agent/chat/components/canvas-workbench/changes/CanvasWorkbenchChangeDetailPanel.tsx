import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CanvasWorkbenchDiffLine,
  CanvasWorkbenchDisplayedDiffLine,
} from "../../../utils/canvasWorkbenchDiff";
import { CanvasWorkbenchDiffState } from "./CanvasWorkbenchDiffState";
import { DiffStats } from "./CanvasWorkbenchChangeStats";
import type {
  CanvasWorkbenchChangeDiffStats,
  CanvasWorkbenchChangeItem,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { resolveChangeDisplayMeta } from "./CanvasWorkbenchChangesPanelViewModel";
import { CanvasWorkbenchChangeStatusMark } from "./CanvasWorkbenchChangeStatusMark";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchChangeDetailPanelProps {
  selectedChangeItem: CanvasWorkbenchChangeItem | undefined;
  selectedItemStats: CanvasWorkbenchChangeDiffStats;
  latestCheckpointPath: string | null;
  visibleDiffLines: CanvasWorkbenchDisplayedDiffLine[];
  selectedDiffLines: CanvasWorkbenchDiffLine[];
  panelClassName: string;
  mutedPanelClassName: string;
  diffVariant: "inline" | "split";
  showWhitespace: boolean;
  wordWrapEnabled: boolean;
  translateWorkbench: CanvasWorkbenchTranslation;
}

export function CanvasWorkbenchChangeDetailPanel({
  selectedChangeItem,
  selectedItemStats,
  latestCheckpointPath,
  visibleDiffLines,
  selectedDiffLines,
  panelClassName,
  mutedPanelClassName,
  diffVariant,
  showWhitespace,
  wordWrapEnabled,
  translateWorkbench,
}: CanvasWorkbenchChangeDetailPanelProps) {
  const selectedItemMeta = selectedChangeItem
    ? resolveChangeDisplayMeta(selectedChangeItem)
    : null;
  const selectedRangeLabel = selectedChangeItem?.hunkStartLine
    ? selectedChangeItem.hunkEndLine &&
      selectedChangeItem.hunkEndLine !== selectedChangeItem.hunkStartLine
      ? `${selectedChangeItem.hunkStartLine}-${selectedChangeItem.hunkEndLine}`
      : `${selectedChangeItem.hunkStartLine}`
    : null;

  return (
    <div className="group relative flex min-h-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-[13px] font-medium text-slate-700">
            {selectedChangeItem?.path ||
              translateWorkbench(
                "agentChat.canvasWorkbench.coding.changes.detailTitle",
              )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedItemMeta ? (
            <CanvasWorkbenchChangeStatusMark
              meta={selectedItemMeta}
              translateWorkbench={translateWorkbench}
            />
          ) : null}
          {selectedRangeLabel ? (
            <span className="inline-flex h-5 items-center rounded-[6px] border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-500">
              {selectedRangeLabel}
            </span>
          ) : null}
          <span className="font-mono text-[12px] font-semibold">
            <DiffStats stats={selectedItemStats} />
          </span>
          {latestCheckpointPath && selectedChangeItem ? (
            <span
              className="max-w-40 truncate text-[11px] text-slate-500"
              title={selectedChangeItem.checkpointLabel || latestCheckpointPath}
              data-testid="canvas-workbench-changes-checkpoints"
            >
              {translateWorkbench(
                "agentChat.canvasWorkbench.coding.changes.latestCheckpoint",
                {
                  path:
                    selectedChangeItem.checkpointLabel || latestCheckpointPath,
                },
              )}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedDiffLines.length > 0 ? (
          <CanvasWorkbenchDiffState
            diffLines={visibleDiffLines}
            panelClassName={panelClassName}
            variant={diffVariant}
            filePath={selectedChangeItem?.path}
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
        ) : selectedChangeItem?.preview ? (
          <div className={cn(panelClassName, "h-full overflow-auto p-4")}>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-700">
              {selectedChangeItem.preview}
            </pre>
          </div>
        ) : (
          <div className={mutedPanelClassName}>
            {translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.noDiff",
            )}
          </div>
        )}
      </div>
    </div>
  );
}
