import { cn } from "@/lib/utils";
import type { CanvasWorkbenchChangeDisplayMeta } from "./CanvasWorkbenchChangesPanelViewModel";
import type { CanvasWorkbenchTranslation } from "./CanvasWorkbenchChangesTypes";

function resolveStatusMarkClassName(meta: CanvasWorkbenchChangeDisplayMeta) {
  if (meta.kind === "added") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200/70";
  }
  if (meta.kind === "deleted") {
    return "bg-rose-50 text-rose-700 ring-rose-200/70";
  }
  if (meta.kind === "renamed") {
    return "bg-sky-50 text-sky-700 ring-sky-200/70";
  }
  if (meta.kind === "copied") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200/70";
  }
  if (meta.kind === "modified") {
    return "bg-amber-50 text-amber-700 ring-amber-200/70";
  }
  return "bg-slate-50 text-slate-500 ring-slate-200/80";
}

export function CanvasWorkbenchChangeStatusMark({
  meta,
  translateWorkbench,
  className,
}: {
  meta: CanvasWorkbenchChangeDisplayMeta | null;
  translateWorkbench: CanvasWorkbenchTranslation;
  className?: string;
}) {
  if (!meta) {
    return null;
  }

  const label = translateWorkbench(meta.labelKey);

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] px-1 font-mono text-[10px] font-bold leading-none ring-1",
        resolveStatusMarkClassName(meta),
        className,
      )}
      title={label}
      data-testid="canvas-workbench-change-status-mark"
      data-change-kind={meta.kind}
    >
      {translateWorkbench(meta.shortLabelKey)}
    </span>
  );
}
