import { memo, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DirectoryListing } from "@/lib/api/fileBrowser";
import {
  formatEntryModifiedTime,
  formatFileSize,
} from "../FileManager/fileManagerDisplay";
import { sortWorkspaceListingEntries } from "../CanvasWorkbenchLayoutViewModel";
import type { CanvasWorkbenchPanelCopy } from "../CanvasWorkbenchLayout";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface CanvasWorkbenchWorkspacePanelProps {
  workspaceUnavailable: boolean;
  workspaceRoot?: string | null;
  workspacePanelRootPath: string | null;
  workspacePanelDisplayPath?: string | null;
  selectedFileKey: string | null;
  directoryCache: Record<string, DirectoryListing>;
  expandedDirectories: Record<string, boolean>;
  loadingDirectories: Record<string, boolean>;
  panelCopy?: CanvasWorkbenchPanelCopy;
  locale: string;
  ghostButtonClassName: string;
  mutedPanelClassName: string;
  translateWorkbench: CanvasWorkbenchTranslation;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRefreshDirectory: (path: string) => void;
}

function isCodeLikeFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx|rs|json|yml|yaml|toml)$/i.test(name);
}

export const CanvasWorkbenchWorkspacePanel = memo(
  function CanvasWorkbenchWorkspacePanel({
    workspaceUnavailable,
    workspaceRoot,
    workspacePanelRootPath,
    workspacePanelDisplayPath,
    selectedFileKey,
    directoryCache,
    expandedDirectories,
    loadingDirectories,
    panelCopy,
    locale,
    ghostButtonClassName,
    mutedPanelClassName,
    translateWorkbench,
    onToggleDirectory,
    onSelectFile,
    onRefreshDirectory,
  }: CanvasWorkbenchWorkspacePanelProps): ReactNode {
    if (workspaceUnavailable) {
      return (
        <div data-testid="canvas-workbench-panel-workspace" className="p-3">
          <div className={mutedPanelClassName}>
            {panelCopy?.unavailableText ||
              translateWorkbench(
                "agentChat.canvasWorkbench.workspace.unavailable",
              )}
          </div>
        </div>
      );
    }

    if (!workspacePanelRootPath?.trim()) {
      return (
        <div data-testid="canvas-workbench-panel-workspace" className="p-3">
          <div className={mutedPanelClassName}>
            {panelCopy?.emptyText ||
              translateWorkbench("agentChat.canvasWorkbench.workspace.empty")}
          </div>
        </div>
      );
    }

    const rootListing = directoryCache[workspacePanelRootPath];
    const workspacePanelEyebrow =
      workspacePanelRootPath !== workspaceRoot
        ? translateWorkbench("agentChat.canvasWorkbench.workspace.resultDir")
        : null;

    const renderDirectoryNode = (path: string, depth = 0): ReactNode => {
      const listing = directoryCache[path];
      if (!listing) {
        return null;
      }

      return sortWorkspaceListingEntries(
        listing.entries,
        path,
        workspaceRoot,
      ).map((entry) => {
        const isDirectory = entry.isDir;
        const isExpanded = Boolean(expandedDirectories[entry.path]);
        const fileSelectionKey = `workspace-file:${entry.path}`;
        const isSelected = selectedFileKey === fileSelectionKey;

        return (
          <div key={entry.path}>
            <button
              type="button"
              aria-label={
                isDirectory
                  ? translateWorkbench(
                      isExpanded
                        ? "agentChat.canvasWorkbench.workspace.collapseDirectoryAria"
                        : "agentChat.canvasWorkbench.workspace.expandDirectoryAria",
                      { name: entry.name },
                    )
                  : translateWorkbench(
                      "agentChat.canvasWorkbench.workspace.selectFileAria",
                      { name: entry.name },
                    )
              }
              onClick={() => {
                if (isDirectory) {
                  onToggleDirectory(entry.path);
                  return;
                }
                onSelectFile(entry.path);
              }}
              className={cn(
                "grid min-h-[34px] w-full grid-cols-[minmax(0,1fr)_94px_66px] items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-left text-[13px] transition-colors",
                isSelected
                  ? "bg-sky-50 text-slate-950"
                  : "text-slate-600 hover:bg-sky-50/70 hover:text-slate-900",
              )}
              title={entry.name}
            >
              <span
                className="flex min-w-0 items-center gap-2"
                style={{ paddingLeft: `${depth * 14}px` }}
              >
                {isDirectory ? (
                  isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                {isDirectory ? (
                  isExpanded ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  )
                ) : isCodeLikeFile(entry.name) ? (
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {entry.name}
                </span>
                {loadingDirectories[entry.path] ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : null}
              </span>
              <span className="truncate text-[12px] text-slate-500">
                {formatEntryModifiedTime(entry.modifiedAt, locale)}
              </span>
              <span className="truncate text-right text-[12px] text-slate-500">
                {entry.isDir ? "-" : formatFileSize(entry.size, "-")}
              </span>
            </button>
            {isDirectory && isExpanded
              ? renderDirectoryNode(entry.path, depth + 1)
              : null}
          </div>
        );
      });
    };

    return (
      <section
        data-testid="canvas-workbench-panel-workspace"
        className="flex h-full min-h-0 flex-col bg-white"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-11 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-slate-200 bg-white px-2.5 py-1.5">
              <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-900">
                  {panelCopy?.sectionEyebrow ||
                    workspacePanelEyebrow ||
                    translateWorkbench(
                      "agentChat.canvasWorkbench.workspace.projectDir",
                    )}
                </div>
              </div>
              <div
                className="min-w-0 flex-1 truncate text-right text-[12px] text-slate-500"
                title={workspacePanelDisplayPath || workspacePanelRootPath}
              >
                {workspacePanelDisplayPath || workspacePanelRootPath}
              </div>
            </div>
            <button
              type="button"
              aria-label={translateWorkbench(
                "agentChat.canvasWorkbench.workspace.refreshTree",
              )}
              onClick={() => onRefreshDirectory(workspacePanelRootPath)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors",
                ghostButtonClassName,
              )}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {rootListing ? (
            <div className="grid h-8 grid-cols-[minmax(0,1fr)_94px_66px] items-center gap-3 border-b border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-500">
              <span>
                {translateWorkbench("agentChat.fileManager.column.name")}
              </span>
              <span>
                {translateWorkbench("agentChat.fileManager.column.modified")}
              </span>
              <span className="text-right">
                {translateWorkbench("agentChat.fileManager.column.size")}
              </span>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            {loadingDirectories[workspacePanelRootPath] && !rootListing ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {panelCopy?.loadingText ||
                  translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.loading",
                  )}
              </div>
            ) : rootListing ? (
              renderDirectoryNode(workspacePanelRootPath)
            ) : (
              <div className="px-2 py-4 text-sm text-slate-500">
                {panelCopy?.emptyDirectoryText ||
                  translateWorkbench(
                    "agentChat.canvasWorkbench.workspace.emptyDirectory",
                  )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  },
);

CanvasWorkbenchWorkspacePanel.displayName = "CanvasWorkbenchWorkspacePanel";
