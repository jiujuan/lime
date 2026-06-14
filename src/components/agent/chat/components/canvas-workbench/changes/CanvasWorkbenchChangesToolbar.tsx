import {
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FolderOpen,
  ListChecks,
  MoreHorizontal,
} from "lucide-react";
import type { CanvasWorkbenchChangeDiffStats } from "./CanvasWorkbenchChangesPanelViewModel";
import { DiffStats } from "./CanvasWorkbenchChangeStats";
import {
  CanvasWorkbenchReviewMenu,
  type CanvasWorkbenchReviewMenuModel,
} from "./CanvasWorkbenchReviewMenu";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type CanvasWorkbenchReviewBase =
  | "unstaged"
  | "staged"
  | "commit"
  | "branch"
  | "previousConversation";

interface CanvasWorkbenchChangesToolbarProps extends CanvasWorkbenchReviewMenuModel {
  translateWorkbench: CanvasWorkbenchTranslation;
  diffStats: CanvasWorkbenchChangeDiffStats;
  checkpointCount?: number;
  reviewMenuOpen: boolean;
  baseMenuOpen: boolean;
  selectedBase: CanvasWorkbenchReviewBase;
  filesPanelOpen?: boolean;
  showFilesToggle?: boolean;
  actionsDisabled?: boolean;
  baseSelectorDisabled?: boolean;
  reviewMenuDisabled?: boolean;
  diffViewToggleDisabled?: boolean;
  reviewActionBusy?: boolean;
  copyGitApplyDisabled?: boolean;
  loadFullFileDisabled?: boolean;
  diffVariant: "inline" | "split";
  onToggleReviewMenu: () => void;
  onToggleBaseMenu: () => void;
  onSelectBase: (base: CanvasWorkbenchReviewBase) => void;
  onRefreshChanges?: () => void | Promise<void>;
  onCopyGitApply?: () => void | Promise<void>;
  onToggleDiffVariant: () => void;
  onToggleFilesPanel?: () => void;
}

const REVIEW_BASE_OPTIONS: Array<{
  key: CanvasWorkbenchReviewBase;
  labelKey: string;
}> = [
  {
    key: "unstaged",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.unstaged",
  },
  {
    key: "staged",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.staged",
  },
  {
    key: "commit",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.commit",
  },
  {
    key: "branch",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.branch",
  },
  {
    key: "previousConversation",
    labelKey:
      "agentChat.canvasWorkbench.coding.changes.base.previousConversation",
  },
];

export function CanvasWorkbenchChangesToolbar({
  translateWorkbench,
  diffStats,
  checkpointCount,
  reviewMenuOpen,
  baseMenuOpen,
  selectedBase,
  filesPanelOpen = true,
  showFilesToggle = true,
  actionsDisabled = false,
  baseSelectorDisabled,
  reviewMenuDisabled,
  diffViewToggleDisabled,
  reviewActionBusy = false,
  copyGitApplyDisabled = false,
  loadFullFileDisabled = false,
  autoExecuteEnabled,
  collapseDiffContext,
  loadFullFile,
  richPreviewEnabled,
  textDiffEnabled,
  showWhitespace,
  diffVariant,
  onToggleReviewMenu,
  onToggleBaseMenu,
  onSelectBase,
  onRefreshChanges,
  onCopyGitApply,
  onToggleAutoExecute,
  onToggleCollapseContext,
  onToggleLoadFullFile,
  onToggleRichPreview,
  onToggleTextDiff,
  onToggleWhitespace,
  onToggleDiffVariant,
  onToggleFilesPanel,
}: CanvasWorkbenchChangesToolbarProps) {
  const filesPanelToggleLabel = translateWorkbench(
    filesPanelOpen
      ? "agentChat.canvasWorkbench.coding.changes.hideFiles"
      : "agentChat.canvasWorkbench.coding.changes.showFiles",
  );
  const diffViewToggleLabel = translateWorkbench(
    diffVariant === "inline"
      ? "agentChat.canvasWorkbench.coding.changes.switchToSplitDiff"
      : "agentChat.canvasWorkbench.coding.changes.switchToInlineDiff",
  );
  const selectedBaseLabel = translateWorkbench(
    REVIEW_BASE_OPTIONS.find((option) => option.key === selectedBase)
      ?.labelKey ||
      "agentChat.canvasWorkbench.coding.changes.base.previousConversation",
  );
  const isBaseSelectorDisabled = baseSelectorDisabled ?? actionsDisabled;
  const isReviewMenuDisabled = reviewMenuDisabled ?? actionsDisabled;
  const isDiffViewToggleDisabled = diffViewToggleDisabled ?? actionsDisabled;

  return (
    <div className="flex min-h-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative">
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.base.selectorAria",
            )}
            aria-haspopup="menu"
            aria-expanded={baseMenuOpen}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-slate-200 bg-slate-50 px-2.5 text-[13px] font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-white disabled:opacity-70"
            disabled={isBaseSelectorDisabled}
            onClick={onToggleBaseMenu}
          >
            <span className="truncate">{selectedBaseLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {baseMenuOpen && !isBaseSelectorDisabled ? (
            <div
              role="menu"
              data-testid="canvas-workbench-changes-base-menu"
              className="absolute left-0 top-[calc(100%+6px)] z-[80] w-[202px] rounded-[12px] border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-950/10"
            >
              {REVIEW_BASE_OPTIONS.map((option) => {
                const active = option.key === selectedBase;
                const isCommit = option.key === "commit";
                return (
                  <div key={option.key} className="relative">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      data-testid={`canvas-workbench-changes-base-option-${option.key}`}
                      onClick={() => {
                        if (!isCommit) {
                          onSelectBase(option.key);
                        }
                      }}
                      className={
                        "flex h-8 w-full items-center justify-between gap-2 rounded-[7px] px-2 text-left text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                      }
                    >
                      <span className="min-w-0 truncate">
                        {translateWorkbench(option.labelKey)}
                      </span>
                      {isCommit ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : active ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                      ) : null}
                    </button>
                    {isCommit ? (
                      <div
                        role="menu"
                        data-testid="canvas-workbench-changes-base-commit-submenu"
                        className="absolute left-[calc(100%+6px)] top-0 z-[90] w-[220px] rounded-[10px] border border-slate-200/90 bg-white px-3 py-2 text-[13px] font-medium text-slate-400 shadow-xl shadow-slate-950/10"
                      >
                        {translateWorkbench(
                          "agentChat.canvasWorkbench.coding.changes.base.emptyCommits",
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <span
          className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold"
          data-testid="canvas-workbench-changes-diff-stats"
        >
          <DiffStats stats={diffStats} />
        </span>
        {checkpointCount ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
            data-testid="canvas-workbench-changes-checkpoints"
          >
            <ListChecks className="h-3.5 w-3.5" />
            {translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.checkpointBadge",
              { count: checkpointCount },
            )}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <button
            type="button"
            aria-label={translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.more",
            )}
            title={translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.more",
            )}
            disabled={isReviewMenuDisabled}
            onClick={onToggleReviewMenu}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-transparent bg-white text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {reviewMenuOpen && !isReviewMenuDisabled ? (
            <CanvasWorkbenchReviewMenu
              translateWorkbench={translateWorkbench}
              reviewActionBusy={reviewActionBusy}
              copyGitApplyDisabled={copyGitApplyDisabled}
              loadFullFileDisabled={loadFullFileDisabled}
              autoExecuteEnabled={autoExecuteEnabled}
              collapseDiffContext={collapseDiffContext}
              loadFullFile={loadFullFile}
              richPreviewEnabled={richPreviewEnabled}
              textDiffEnabled={textDiffEnabled}
              showWhitespace={showWhitespace}
              onRefreshChanges={onRefreshChanges}
              onCopyGitApply={onCopyGitApply}
              onToggleAutoExecute={onToggleAutoExecute}
              onToggleCollapseContext={onToggleCollapseContext}
              onToggleLoadFullFile={onToggleLoadFullFile}
              onToggleRichPreview={onToggleRichPreview}
              onToggleTextDiff={onToggleTextDiff}
              onToggleWhitespace={onToggleWhitespace}
              onRequestClose={onToggleReviewMenu}
              className="absolute right-0 z-[80] mt-2"
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label={diffViewToggleLabel}
          title={diffViewToggleLabel}
          disabled={isDiffViewToggleDisabled}
          onClick={onToggleDiffVariant}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-transparent bg-white text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <FileDiff className="h-4 w-4" />
        </button>
        {showFilesToggle ? (
          <button
            type="button"
            aria-label={filesPanelToggleLabel}
            title={filesPanelToggleLabel}
            disabled={!onToggleFilesPanel}
            onClick={onToggleFilesPanel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
