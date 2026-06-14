import { type ReactNode } from "react";
import {
  Copy,
  EyeOff,
  FileDiff,
  FileText,
  Image,
  ListCollapse,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface CanvasWorkbenchReviewMenuModel {
  translateWorkbench: CanvasWorkbenchTranslation;
  reviewActionBusy?: boolean;
  copyGitApplyDisabled?: boolean;
  loadFullFileDisabled?: boolean;
  autoExecuteEnabled: boolean;
  collapseDiffContext: boolean;
  loadFullFile: boolean;
  richPreviewEnabled: boolean;
  textDiffEnabled: boolean;
  showWhitespace: boolean;
  onRefreshChanges?: () => void | Promise<void>;
  onCopyGitApply?: () => void | Promise<void>;
  onToggleAutoExecute: () => void;
  onToggleCollapseContext: () => void;
  onToggleLoadFullFile: () => void;
  onToggleRichPreview: () => void;
  onToggleTextDiff: () => void;
  onToggleWhitespace: () => void;
}

interface CanvasWorkbenchReviewMenuProps extends CanvasWorkbenchReviewMenuModel {
  className?: string;
  testId?: string;
  onRequestClose: () => void;
}

function ReviewMenuItem({
  icon,
  label,
  active,
  disabled,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className="group flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
    >
      <span
        className={
          active
            ? "shrink-0 text-slate-900"
            : "shrink-0 text-slate-400 group-disabled:text-slate-300"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export function CanvasWorkbenchReviewMenu({
  translateWorkbench,
  reviewActionBusy = false,
  copyGitApplyDisabled = false,
  loadFullFileDisabled = false,
  autoExecuteEnabled,
  collapseDiffContext,
  loadFullFile,
  richPreviewEnabled,
  textDiffEnabled,
  showWhitespace,
  onRefreshChanges,
  onCopyGitApply,
  onToggleAutoExecute,
  onToggleCollapseContext,
  onToggleLoadFullFile,
  onToggleRichPreview,
  onToggleTextDiff,
  onToggleWhitespace,
  onRequestClose,
  className,
  testId = "canvas-workbench-changes-more-menu",
}: CanvasWorkbenchReviewMenuProps) {
  const runAction = (action?: () => void | Promise<void>) => {
    onRequestClose();
    void action?.();
  };

  return (
    <div
      role="menu"
      className={cn(
        "w-[220px] rounded-[12px] border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-950/10",
        className,
      )}
      data-testid={testId}
    >
      <ReviewMenuItem
        icon={<RefreshCw className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.refresh",
        )}
        disabled={reviewActionBusy || !onRefreshChanges}
        onClick={() => runAction(onRefreshChanges)}
      />
      <ReviewMenuItem
        icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.enableAutoExecute",
        )}
        active={autoExecuteEnabled}
        onClick={() => runAction(onToggleAutoExecute)}
      />
      <ReviewMenuItem
        icon={<ListCollapse className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.collapseContext",
        )}
        active={collapseDiffContext}
        onClick={() => runAction(onToggleCollapseContext)}
        testId="canvas-workbench-changes-collapse-toggle"
      />
      <div className="my-1.5 border-t border-slate-100" />
      <ReviewMenuItem
        icon={<FileText className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.unloadFullFile",
        )}
        active={!loadFullFile}
        disabled={reviewActionBusy || loadFullFileDisabled}
        onClick={() => runAction(onToggleLoadFullFile)}
      />
      <ReviewMenuItem
        icon={<Image className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.enableRichPreview",
        )}
        active={richPreviewEnabled}
        onClick={() => runAction(onToggleRichPreview)}
      />
      <ReviewMenuItem
        icon={<FileDiff className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.enableTextDiff",
        )}
        active={textDiffEnabled}
        onClick={() => runAction(onToggleTextDiff)}
      />
      <ReviewMenuItem
        icon={<EyeOff className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.hideWhitespace",
        )}
        active={!showWhitespace}
        onClick={() => runAction(onToggleWhitespace)}
        testId="canvas-workbench-changes-whitespace-toggle"
      />
      <div className="my-1.5 border-t border-slate-100" />
      <ReviewMenuItem
        icon={<Copy className="h-3.5 w-3.5" />}
        label={translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.menu.copyGitApply",
        )}
        disabled={reviewActionBusy || copyGitApplyDisabled}
        onClick={() => runAction(onCopyGitApply)}
      />
    </div>
  );
}
