import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCanvasWorkbenchDiff,
  collapseCanvasWorkbenchDiffContext,
} from "../../../utils/canvasWorkbenchDiff";
import type { HarnessFilePreviewResult } from "../../HarnessStatusPanel";
import type { CanvasWorkbenchDiffLine } from "../../../utils/canvasWorkbenchDiff";
import type { CanvasWorkbenchResolvedSelection } from "../../CanvasWorkbenchLayoutViewModel";
import {
  buildCanvasWorkbenchChangeFileTree,
  countCanvasWorkbenchChangeItemStats,
  countCanvasWorkbenchDiffStats,
  findChangeItemForSelection,
} from "./CanvasWorkbenchChangesPanelViewModel";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeView,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { CanvasWorkbenchChangeDetailPanel } from "./CanvasWorkbenchChangeDetailPanel";
import { CanvasWorkbenchChangesToolbar } from "./CanvasWorkbenchChangesToolbar";
import { CanvasWorkbenchEmptyDiffPanel } from "./CanvasWorkbenchEmptyDiffPanel";
import { useCanvasWorkbenchChangesFilesPanelResize } from "./useCanvasWorkbenchChangesFilesPanelResize";
import { useCanvasWorkbenchReviewState } from "./useCanvasWorkbenchReviewState";
import type { CanvasWorkbenchTranslation } from "./CanvasWorkbenchChangesTypes";
import { CanvasWorkbenchChangesContent } from "./CanvasWorkbenchChangesContent";

interface CanvasWorkbenchChangesPanelProps {
  changeView: CanvasWorkbenchChangeView | null | undefined;
  documentContext: CanvasWorkbenchResolvedSelection | null;
  documentDiffLines: CanvasWorkbenchDiffLine[];
  translateWorkbench: CanvasWorkbenchTranslation;
  panelClassName: string;
  mutedPanelClassName: string;
  workspaceRoot?: string | null;
  loadFilePreview?: (path: string) => Promise<HarnessFilePreviewResult>;
  filesPanelOpen?: boolean;
  onToggleFilesPanel?: () => void;
}

function buildSelectedChangeDiffLines(
  item: CanvasWorkbenchChangeItem | undefined,
  loadedContent?: string,
): CanvasWorkbenchDiffLine[] {
  if (!item) {
    return [];
  }
  if (item.diffLines?.length) {
    return item.diffLines;
  }
  const currentContent = loadedContent ?? item.currentContent;
  if (item.previousContent != null && currentContent != null) {
    return buildCanvasWorkbenchDiff(item.previousContent, currentContent);
  }
  if (item.previousContent === null && currentContent != null) {
    return buildCanvasWorkbenchDiff("", currentContent);
  }
  if (item.previousContent != null && currentContent === null) {
    return buildCanvasWorkbenchDiff(item.previousContent, "");
  }
  return [];
}

export function CanvasWorkbenchChangesPanel({
  changeView,
  documentContext,
  documentDiffLines,
  translateWorkbench,
  panelClassName,
  mutedPanelClassName,
  workspaceRoot,
  loadFilePreview,
  filesPanelOpen = true,
  onToggleFilesPanel,
}: CanvasWorkbenchChangesPanelProps) {
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false);
  const [baseMenuOpen, setBaseMenuOpen] = useState(false);
  const [collapseDiffContext, setCollapseDiffContext] = useState(false);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const wordWrapEnabled = true;
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const [richPreviewEnabled, setRichPreviewEnabled] = useState(true);
  const [textDiffEnabled, setTextDiffEnabled] = useState(true);
  const [diffVariant, setDiffVariant] = useState<"inline" | "split">("inline");
  const [fileFilter, setFileFilter] = useState("");
  const {
    filesPanelGridStyle,
    handleFilesPanelResizeStart,
    handleFilesPanelResizeMove,
    handleFilesPanelResizeEnd,
    handleFilesPanelResizeKeyDown,
  } = useCanvasWorkbenchChangesFilesPanelResize(filesPanelOpen);
  const {
    backendPatch,
    changeItems,
    commitOptions,
    commitsLoading,
    copyGitApply,
    fallbackPatch,
    fullFileContentById,
    loadFullFile,
    openCommitMenu,
    refreshChanges,
    reviewActionBusy,
    selectBase,
    selectCommit,
    selectedBase,
    selectedBaseUsesGit,
    selectedCommitSha,
    toggleLoadFullFile,
  } = useCanvasWorkbenchReviewState({
    changeView,
    workspaceRoot,
    loadFilePreview,
    translateWorkbench,
  });
  const changeItemCount = changeItems.length;
  const activeSelectionChangeItem = useMemo(
    () => findChangeItemForSelection(changeItems, documentContext),
    [changeItems, documentContext],
  );
  const selectedChangeItem =
    changeItems.find((item) => item.id === selectedChangeId) ||
    activeSelectionChangeItem ||
    changeItems[0];
  const selectedChangeItemRef = useRef<CanvasWorkbenchChangeItem | undefined>(
    selectedChangeItem,
  );
  selectedChangeItemRef.current = selectedChangeItem;
  const selectedLoadedContent =
    loadFullFile && selectedChangeItem
      ? fullFileContentById[selectedChangeItem.id]
      : undefined;
  const selectedLoadFullFile = Boolean(
    loadFullFile && selectedLoadedContent != null,
  );

  useEffect(() => {
    if (
      selectedChangeId !== null &&
      !changeItems.some((item) => item.id === selectedChangeId)
    ) {
      setSelectedChangeId(null);
    }
  }, [changeItems, selectedChangeId]);

  const handleSelectBase = (base: typeof selectedBase) => {
    if (base === "commit") {
      return;
    }
    void selectBase(base).then((changed) => {
      if (changed) {
        setBaseMenuOpen(false);
      }
    });
  };
  const handleSelectCommit = (commit: Parameters<typeof selectCommit>[0]) => {
    selectCommit(commit);
    setBaseMenuOpen(false);
  };

  const filesPanelResizeHandle = filesPanelOpen ? (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={translateWorkbench(
        "agentChat.canvasWorkbench.coding.changes.resizeFilesPanel",
      )}
      tabIndex={0}
      data-testid="canvas-workbench-changes-files-resizer"
      className="absolute inset-y-0 right-0 z-10 w-2 translate-x-1 cursor-col-resize touch-none"
      onPointerDown={handleFilesPanelResizeStart}
      onPointerMove={handleFilesPanelResizeMove}
      onPointerUp={handleFilesPanelResizeEnd}
      onPointerCancel={handleFilesPanelResizeEnd}
      onKeyDown={handleFilesPanelResizeKeyDown}
    >
      <span className="mx-auto block h-full w-px bg-slate-200 transition-colors group-hover:bg-slate-300" />
    </div>
  ) : null;

  if (changeItemCount > 0) {
    const selectedDiffLines = buildSelectedChangeDiffLines(
      selectedChangeItem,
      selectedLoadedContent,
    );
    const diffStats = countCanvasWorkbenchDiffStats(selectedDiffLines);
    const selectedItemStats = selectedChangeItem
      ? countCanvasWorkbenchChangeItemStats(selectedChangeItem)
      : { additions: 0, removals: 0 };
    const visibleDiffLines = collapseDiffContext
      ? collapseCanvasWorkbenchDiffContext(selectedDiffLines)
      : textDiffEnabled
        ? selectedDiffLines
        : selectedDiffLines.filter((line) => line.type !== "context");
    const filteredFileTree = buildCanvasWorkbenchChangeFileTree(
      changeItems,
      fileFilter,
    );
    const latestCheckpointPath =
      changeView?.latestCheckpointPath ||
      selectedChangeItem?.checkpointPath ||
      null;
    const handleSelectChangeItem = (item: CanvasWorkbenchChangeItem) => {
      setSelectedChangeId(item.id);
      if (item.absolutePath || item.path) {
        void changeView?.onOpenFile?.(item.absolutePath || item.path);
      }
    };
    return (
      <section
        data-testid="canvas-workbench-panel-changes"
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-white"
      >
        <CanvasWorkbenchChangesToolbar
          translateWorkbench={translateWorkbench}
          diffStats={diffStats}
          checkpointCount={changeView?.checkpointCount}
          reviewMenuOpen={reviewMenuOpen}
          baseMenuOpen={baseMenuOpen}
          selectedBase={selectedBase}
          filesPanelOpen={filesPanelOpen}
          reviewActionBusy={reviewActionBusy}
          copyGitApplyDisabled={!backendPatch?.trim() && !fallbackPatch.trim()}
          loadFullFileDisabled={!loadFilePreview || !selectedChangeItem}
          autoExecuteEnabled={autoExecuteEnabled}
          commitOptions={commitOptions}
          commitsLoading={commitsLoading}
          selectedCommitSha={selectedCommitSha}
          collapseDiffContext={collapseDiffContext}
          loadFullFile={selectedLoadFullFile}
          richPreviewEnabled={richPreviewEnabled}
          textDiffEnabled={textDiffEnabled}
          showWhitespace={showWhitespace}
          diffVariant={diffVariant}
          onToggleReviewMenu={() => {
            setBaseMenuOpen(false);
            setReviewMenuOpen((open) => !open);
          }}
          onToggleBaseMenu={() => {
            setReviewMenuOpen(false);
            setBaseMenuOpen((open) => !open);
          }}
          onSelectBase={handleSelectBase}
          onOpenCommitMenu={openCommitMenu}
          onSelectCommit={handleSelectCommit}
          onRefreshChanges={refreshChanges}
          onCopyGitApply={copyGitApply}
          onToggleAutoExecute={() =>
            setAutoExecuteEnabled((enabled) => !enabled)
          }
          onToggleCollapseContext={() =>
            setCollapseDiffContext((enabled) => !enabled)
          }
          onToggleLoadFullFile={() => {
            void toggleLoadFullFile(selectedChangeItemRef.current);
          }}
          onToggleRichPreview={() =>
            setRichPreviewEnabled((enabled) => !enabled)
          }
          onToggleTextDiff={() => setTextDiffEnabled((enabled) => !enabled)}
          onToggleWhitespace={() => setShowWhitespace((enabled) => !enabled)}
          onToggleDiffVariant={() =>
            setDiffVariant((variant) =>
              variant === "inline" ? "split" : "inline",
            )
          }
          onToggleFilesPanel={onToggleFilesPanel}
        />

        <CanvasWorkbenchChangesContent
          filesPanelOpen={filesPanelOpen}
          filesPanelGridStyle={filesPanelGridStyle}
          filesPanelResizeHandle={filesPanelResizeHandle}
          fileTree={filteredFileTree}
          selectedChangeItem={selectedChangeItem}
          fileFilter={fileFilter}
          translateWorkbench={translateWorkbench}
          onFileFilterChange={setFileFilter}
          onSelectChangeItem={handleSelectChangeItem}
          detail={
            <CanvasWorkbenchChangeDetailPanel
              selectedChangeItem={selectedChangeItem}
              selectedItemStats={selectedItemStats}
              latestCheckpointPath={latestCheckpointPath}
              visibleDiffLines={visibleDiffLines}
              selectedDiffLines={selectedDiffLines}
              panelClassName={panelClassName}
              mutedPanelClassName={mutedPanelClassName}
              diffVariant={diffVariant}
              showWhitespace={showWhitespace}
              wordWrapEnabled={wordWrapEnabled}
              translateWorkbench={translateWorkbench}
            />
          }
        />
      </section>
    );
  }

  if ((changeView || selectedBaseUsesGit) && changeItemCount === 0) {
    return (
      <section
        data-testid="canvas-workbench-panel-changes"
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-white"
      >
        <CanvasWorkbenchChangesToolbar
          translateWorkbench={translateWorkbench}
          diffStats={{ additions: 0, removals: 0 }}
          reviewMenuOpen={reviewMenuOpen}
          baseMenuOpen={baseMenuOpen}
          selectedBase={selectedBase}
          filesPanelOpen={filesPanelOpen}
          copyGitApplyDisabled={!backendPatch?.trim()}
          diffViewToggleDisabled
          loadFullFileDisabled
          autoExecuteEnabled={autoExecuteEnabled}
          commitOptions={commitOptions}
          commitsLoading={commitsLoading}
          selectedCommitSha={selectedCommitSha}
          collapseDiffContext={collapseDiffContext}
          loadFullFile={loadFullFile}
          richPreviewEnabled={richPreviewEnabled}
          textDiffEnabled={textDiffEnabled}
          showWhitespace={showWhitespace}
          diffVariant={diffVariant}
          onToggleReviewMenu={() => {
            setBaseMenuOpen(false);
            setReviewMenuOpen((open) => !open);
          }}
          onToggleBaseMenu={() => {
            setReviewMenuOpen(false);
            setBaseMenuOpen((open) => !open);
          }}
          onSelectBase={handleSelectBase}
          onOpenCommitMenu={openCommitMenu}
          onSelectCommit={handleSelectCommit}
          onRefreshChanges={refreshChanges}
          onToggleAutoExecute={() =>
            setAutoExecuteEnabled((enabled) => !enabled)
          }
          onToggleCollapseContext={() =>
            setCollapseDiffContext((enabled) => !enabled)
          }
          onToggleLoadFullFile={() => undefined}
          onToggleRichPreview={() =>
            setRichPreviewEnabled((enabled) => !enabled)
          }
          onToggleTextDiff={() => setTextDiffEnabled((enabled) => !enabled)}
          onToggleWhitespace={() => setShowWhitespace((enabled) => !enabled)}
          onToggleDiffVariant={() => undefined}
          onToggleFilesPanel={onToggleFilesPanel}
        />

        <CanvasWorkbenchChangesContent
          filesPanelOpen={filesPanelOpen}
          filesPanelGridStyle={filesPanelGridStyle}
          filesPanelResizeHandle={filesPanelResizeHandle}
          fileTree={[]}
          selectedChangeItem={undefined}
          fileFilter=""
          fileListDisabled
          translateWorkbench={translateWorkbench}
          onFileFilterChange={() => undefined}
          onSelectChangeItem={() => undefined}
          detail={
            <CanvasWorkbenchEmptyDiffPanel
              translateWorkbench={translateWorkbench}
            />
          }
        />
      </section>
    );
  }

  if (!documentContext) {
    return (
      <div data-testid="canvas-workbench-panel-changes" className="p-5">
        <div className={mutedPanelClassName}>
          {translateWorkbench("agentChat.canvasWorkbench.coding.changes.empty")}
        </div>
      </div>
    );
  }

  if (documentContext.previousContent === null) {
    return (
      <div data-testid="canvas-workbench-panel-changes" className="p-5">
        <div className={mutedPanelClassName}>
          {translateWorkbench(
            "agentChat.canvasWorkbench.coding.changes.noBaseline",
          )}
        </div>
      </div>
    );
  }

  const documentChangeItem: CanvasWorkbenchChangeItem = {
    id: documentContext.selectionKey || `document:${documentContext.title}`,
    path:
      documentContext.selectionPath ||
      documentContext.subtitle ||
      documentContext.title,
    absolutePath: documentContext.selectionPath || null,
    displayName: documentContext.title,
    source: "document",
    status: "completed",
    changeKind: "modified",
    previousContent: documentContext.previousContent,
    currentContent: documentContext.content,
  };
  const documentDiffStats = countCanvasWorkbenchDiffStats(documentDiffLines);
  const visibleDocumentDiffLines = collapseDiffContext
    ? collapseCanvasWorkbenchDiffContext(documentDiffLines)
    : textDiffEnabled
      ? documentDiffLines
      : documentDiffLines.filter((line) => line.type !== "context");
  const filteredDocumentFileTree = buildCanvasWorkbenchChangeFileTree(
    [documentChangeItem],
    fileFilter,
  );

  return (
    <section
      data-testid="canvas-workbench-panel-changes"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-white"
    >
      <CanvasWorkbenchChangesToolbar
        translateWorkbench={translateWorkbench}
        diffStats={documentDiffStats}
        reviewMenuOpen={reviewMenuOpen}
        baseMenuOpen={baseMenuOpen}
        selectedBase={selectedBase}
        filesPanelOpen={filesPanelOpen}
        reviewActionBusy={reviewActionBusy}
        copyGitApplyDisabled
        loadFullFileDisabled
        autoExecuteEnabled={autoExecuteEnabled}
        commitOptions={commitOptions}
        commitsLoading={commitsLoading}
        selectedCommitSha={selectedCommitSha}
        collapseDiffContext={collapseDiffContext}
        loadFullFile={false}
        richPreviewEnabled={richPreviewEnabled}
        textDiffEnabled={textDiffEnabled}
        showWhitespace={showWhitespace}
        diffVariant={diffVariant}
        onToggleReviewMenu={() => {
          setBaseMenuOpen(false);
          setReviewMenuOpen((open) => !open);
        }}
        onToggleBaseMenu={() => {
          setReviewMenuOpen(false);
          setBaseMenuOpen((open) => !open);
        }}
        onSelectBase={handleSelectBase}
        onOpenCommitMenu={openCommitMenu}
        onSelectCommit={handleSelectCommit}
        onRefreshChanges={refreshChanges}
        onToggleAutoExecute={() => setAutoExecuteEnabled((enabled) => !enabled)}
        onToggleCollapseContext={() =>
          setCollapseDiffContext((enabled) => !enabled)
        }
        onToggleLoadFullFile={() => undefined}
        onToggleRichPreview={() => setRichPreviewEnabled((enabled) => !enabled)}
        onToggleTextDiff={() => setTextDiffEnabled((enabled) => !enabled)}
        onToggleWhitespace={() => setShowWhitespace((enabled) => !enabled)}
        onToggleDiffVariant={() =>
          setDiffVariant((variant) =>
            variant === "inline" ? "split" : "inline",
          )
        }
        onToggleFilesPanel={onToggleFilesPanel}
      />

      <CanvasWorkbenchChangesContent
        filesPanelOpen={filesPanelOpen}
        filesPanelGridStyle={filesPanelGridStyle}
        filesPanelResizeHandle={filesPanelResizeHandle}
        fileTree={filteredDocumentFileTree}
        selectedChangeItem={documentChangeItem}
        fileFilter={fileFilter}
        translateWorkbench={translateWorkbench}
        onFileFilterChange={setFileFilter}
        onSelectChangeItem={() => undefined}
        detail={
          <CanvasWorkbenchChangeDetailPanel
            selectedChangeItem={documentChangeItem}
            selectedItemStats={documentDiffStats}
            latestCheckpointPath={null}
            visibleDiffLines={visibleDocumentDiffLines}
            selectedDiffLines={documentDiffLines}
            panelClassName={panelClassName}
            mutedPanelClassName={mutedPanelClassName}
            diffVariant={diffVariant}
            showWhitespace={showWhitespace}
            wordWrapEnabled={wordWrapEnabled}
            translateWorkbench={translateWorkbench}
          />
        }
      />
    </section>
  );
}
