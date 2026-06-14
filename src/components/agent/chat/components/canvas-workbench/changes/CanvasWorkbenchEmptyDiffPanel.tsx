import { ChevronDown } from "lucide-react";
import { DiffStats } from "./CanvasWorkbenchChangeStats";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function CanvasWorkbenchEmptyDiffPanel({
  messageKey = "agentChat.canvasWorkbench.coding.changes.empty",
  translateWorkbench,
}: {
  messageKey?: string;
  translateWorkbench: CanvasWorkbenchTranslation;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-[13px] font-medium text-slate-700">
            {translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.detailTitle",
            )}
          </span>
        </div>
        <span className="font-mono text-[12px] font-semibold">
          <DiffStats stats={{ additions: 0, removals: 0 }} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        <div className="h-full overflow-auto">
          <div className="grid min-w-[720px] grid-cols-[52px_28px_minmax(0,1fr)] border-b border-slate-100 bg-white font-mono text-[12px] leading-6 text-slate-400">
            <span className="select-none border-r border-slate-100 px-2 py-1.5 text-right text-[11px] text-slate-300">
              1
            </span>
            <span className="select-none border-r border-slate-100 px-1 py-1.5 text-center text-slate-300">
              {" "}
            </span>
            <span className="px-3 py-1.5">
              {translateWorkbench(messageKey)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
