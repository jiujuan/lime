import { memo, type ReactNode } from "react";
import { FileSearch } from "lucide-react";
import type { DirectoryListing } from "@/lib/api/fileBrowser";
import type { CanvasWorkbenchResolvedSelection } from "../../CanvasWorkbenchLayoutViewModel";
import type { CanvasWorkbenchPanelCopy } from "../../CanvasWorkbenchLayout";
import {
  CanvasWorkbenchWorkspacePanel,
  type CanvasWorkbenchWorkspacePanelProps,
} from "../CanvasWorkbenchWorkspacePanel";
import { CanvasWorkbenchPreviewModePanel } from "../CanvasWorkbenchPreviewModePanel";
import {
  resolveCanvasWorkbenchPreviewModeState,
  type CanvasWorkbenchPreviewMode,
} from "../CanvasWorkbenchPreviewModeViewModel";
import { useCanvasWorkbenchProjectFilesSplitState } from "./useCanvasWorkbenchProjectFilesSplitState";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface CanvasWorkbenchProjectFilesPanelProps {
  workspaceUnavailable: boolean;
  workspaceRoot?: string | null;
  selectedFileKey: string | null;
  documentContext: CanvasWorkbenchResolvedSelection | null;
  previewMode: CanvasWorkbenchPreviewMode;
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
  onSelectPreviewMode: (mode: CanvasWorkbenchPreviewMode) => void;
}

export const CanvasWorkbenchProjectFilesPanel = memo(
  function CanvasWorkbenchProjectFilesPanel({
    workspaceUnavailable,
    workspaceRoot,
    selectedFileKey,
    documentContext,
    previewMode,
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
    onSelectPreviewMode,
  }: CanvasWorkbenchProjectFilesPanelProps): ReactNode {
    const {
      containerRef,
      treeWidthPercent,
      minTreeWidthPercent,
      maxTreeWidthPercent,
      handleResizerPointerDown,
      handleResizerKeyDown,
    } = useCanvasWorkbenchProjectFilesSplitState();
    const projectPanelCopy: CanvasWorkbenchWorkspacePanelProps["panelCopy"] = {
      ...panelCopy,
      sectionEyebrow:
        panelCopy?.sectionEyebrow ||
        translateWorkbench("agentChat.canvasWorkbench.projectFiles.treeTitle"),
      emptyText:
        panelCopy?.emptyText ||
        translateWorkbench("agentChat.canvasWorkbench.projectFiles.empty"),
      unavailableText:
        panelCopy?.unavailableText ||
        translateWorkbench(
          "agentChat.canvasWorkbench.projectFiles.unavailable",
        ),
    };
    const projectPreviewModeState =
      resolveCanvasWorkbenchPreviewModeState(documentContext);
    const resolvedPreviewMode = projectPreviewModeState.modes[previewMode]
      ?.enabled
      ? previewMode
      : projectPreviewModeState.defaultMode;

    return (
      <section
        ref={containerRef}
        data-testid="canvas-workbench-panel-project-files"
        className="grid h-full min-h-0 bg-white"
        style={{
          gridTemplateColumns: `minmax(0,1fr) 6px minmax(220px, ${treeWidthPercent}%)`,
        }}
      >
        <div className="min-w-0 bg-slate-50/60">
          {documentContext?.selectionKey?.startsWith("workspace-file:") ? (
            <CanvasWorkbenchPreviewModePanel
              context={documentContext}
              mode={resolvedPreviewMode}
              modeState={projectPreviewModeState}
              translateWorkbench={translateWorkbench}
              onSelectMode={onSelectPreviewMode}
            />
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center p-6">
              <div className="max-w-[320px] text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-950/5">
                  <FileSearch className="h-5 w-5" />
                </div>
                <div className="text-[15px] font-semibold text-slate-900">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.projectFiles.openTitle",
                  )}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-slate-500">
                  {translateWorkbench(
                    "agentChat.canvasWorkbench.projectFiles.openHint",
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          aria-label={translateWorkbench(
            "agentChat.canvasWorkbench.projectFiles.resizeTree",
          )}
          aria-valuemin={minTreeWidthPercent}
          aria-valuemax={maxTreeWidthPercent}
          aria-valuenow={Math.round(treeWidthPercent)}
          data-testid="canvas-workbench-project-files-resizer"
          onPointerDown={handleResizerPointerDown}
          onKeyDown={handleResizerKeyDown}
          className="group relative h-full cursor-col-resize border-x border-slate-200 bg-white outline-none transition-colors hover:bg-sky-50 focus-visible:bg-sky-50"
        >
          <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-200 transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-500" />
        </button>
        <div className="min-w-0">
          <CanvasWorkbenchWorkspacePanel
            workspaceUnavailable={workspaceUnavailable}
            workspaceRoot={workspaceRoot}
            workspacePanelRootPath={workspaceRoot || null}
            workspacePanelDisplayPath={workspaceRoot || null}
            selectedFileKey={selectedFileKey}
            directoryCache={directoryCache}
            expandedDirectories={expandedDirectories}
            loadingDirectories={loadingDirectories}
            panelCopy={projectPanelCopy}
            locale={locale}
            ghostButtonClassName={ghostButtonClassName}
            mutedPanelClassName={mutedPanelClassName}
            translateWorkbench={translateWorkbench}
            onToggleDirectory={onToggleDirectory}
            onSelectFile={onSelectFile}
            onRefreshDirectory={onRefreshDirectory}
          />
        </div>
      </section>
    );
  },
);

CanvasWorkbenchProjectFilesPanel.displayName =
  "CanvasWorkbenchProjectFilesPanel";
