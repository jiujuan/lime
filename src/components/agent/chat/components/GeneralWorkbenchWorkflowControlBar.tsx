import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceWorkflowControlItem } from "../workspace/workspaceWorkflowControls";

interface GeneralWorkbenchWorkflowControlBarProps {
  items: readonly WorkspaceWorkflowControlItem[];
  pendingItemId?: string | null;
  onTrigger?: (item: WorkspaceWorkflowControlItem) => Promise<void> | void;
  translate: (
    key: string,
    options?: Record<string, string | number | null>,
  ) => string;
}

const CONTROL_BAR_CLASSNAME = "mt-2 flex flex-wrap gap-1.5";

const CONTROL_BUTTON_CLASSNAME =
  "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function GeneralWorkbenchWorkflowControlBar({
  items,
  pendingItemId,
  onTrigger,
  translate,
}: GeneralWorkbenchWorkflowControlBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={CONTROL_BAR_CLASSNAME} data-testid="workflow-control-bar">
      {items.map((item) => {
        const pending = pendingItemId === item.id;
        const disabled = pending || !onTrigger;
        return (
          <button
            key={item.id}
            type="button"
            className={cn(CONTROL_BUTTON_CLASSNAME, getToneClassName(item))}
            aria-label={translate(item.ariaLabelKey, {
              runId: item.workflowRunId,
            })}
            disabled={disabled}
            data-testid={`workflow-control-${item.kind}`}
            onClick={() => {
              if (!disabled) {
                void onTrigger?.(item);
              }
            }}
          >
            {getControlIcon(item.kind)}
            <span>{translate(item.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function getToneClassName(item: WorkspaceWorkflowControlItem): string {
  if (item.tone === "primary") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100";
  }
  if (item.tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100";
  }
  return "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900";
}

function getControlIcon(kind: WorkspaceWorkflowControlItem["kind"]) {
  if (kind === "respond") {
    return <CheckCircle2 size={12} aria-hidden="true" />;
  }
  if (kind === "retry") {
    return <RotateCcw size={12} aria-hidden="true" />;
  }
  return <XCircle size={12} aria-hidden="true" />;
}
