import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { readProjectGitDiff } from "@/lib/api/projectGit";
import { cn } from "@/lib/utils";
import { resolveAbsoluteWorkspacePath } from "../../../workspace/workspacePath";
import {
  buildCanvasWorkbenchDiff,
  collapseCanvasWorkbenchDiffContext,
} from "../../../utils/canvasWorkbenchDiff";
import type { HarnessFilePreviewResult } from "../../HarnessStatusPanel";
import type { CanvasWorkbenchDiffLine } from "../../../utils/canvasWorkbenchDiff";
import type { CanvasWorkbenchResolvedSelection } from "../../CanvasWorkbenchLayoutViewModel";
import {
  buildCanvasWorkbenchGitApplyPatch,
  buildCanvasWorkbenchChangeFileTree,
  countCanvasWorkbenchChangeItemStats,
  countCanvasWorkbenchDiffStats,
  findChangeItemForSelection,
  parseCanvasWorkbenchGitPatchToChangeItems,
} from "./CanvasWorkbenchChangesPanelViewModel";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeView,
} from "./CanvasWorkbenchChangesPanelViewModel";
import { CanvasWorkbenchDiffState } from "./CanvasWorkbenchDiffState";
import { CanvasWorkbenchChangeDetailPanel } from "./CanvasWorkbenchChangeDetailPanel";
import { CanvasWorkbenchChangesFileList } from "./CanvasWorkbenchChangesFileList";
import { CanvasWorkbenchChangesToolbar } from "./CanvasWorkbenchChangesToolbar";
import type { CanvasWorkbenchReviewBase } from "./CanvasWorkbenchChangesToolbar";
import { CanvasWorkbenchEmptyDiffPanel } from "./CanvasWorkbenchEmptyDiffPanel";
import { useCanvasWorkbenchChangesFilesPanelResize } from "./useCanvasWorkbenchChangesFilesPanelResize";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

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

function buildGitApplyCommand(patch: string): string {
  return `git apply <<'PATCH'\n${patch.trimEnd()}\nPATCH\n`;
}

function resolveBackendPatchForCopy(
  selectedBase: CanvasWorkbenchReviewBase,
  backendPatch: string | null,
  fallbackPatch: string,
): string {
  return selectedBase === "previousConversation"
    ? fallbackPatch
    : backendPatch || "";
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
  const [selectedBase, setSelectedBase] = useState<CanvasWorkbenchReviewBase>(
    "previousConversation",
  );
  const [collapseDiffContext, setCollapseDiffContext] = useState(false);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const wordWrapEnabled = true;
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const [loadFullFile, setLoadFullFile] = useState(false);
  const [richPreviewEnabled, setRichPreviewEnabled] = useState(true);
  const [textDiffEnabled, setTextDiffEnabled] = useState(true);
  const [diffVariant, setDiffVariant] = useState<"inline" | "split">("inline");
  const [fileFilter, setFileFilter] = useState("");
  const [reviewActionBusy, setReviewActionBusy] = useState(false);
  const [backendPatch, setBackendPatch] = useState<string | null>(null);
  const [backendChangeItems, setBackendChangeItems] = useState<
    CanvasWorkbenchChangeItem[]
  >([]);
  const {
    filesPanelGridStyle,
    handleFilesPanelResizeStart,
    handleFilesPanelResizeMove,
    handleFilesPanelResizeEnd,
    handleFilesPanelResizeKeyDown,
  } = useCanvasWorkbenchChangesFilesPanelResize(filesPanelOpen);
  const [fullFileContentById, setFullFileContentById] = useState<
    Record<string, string>
  >({});
  const selectedBaseUsesGit = selectedBase !== "previousConversation";
  const changeItems = useMemo(
    () =>
      selectedBaseUsesGit ? backendChangeItems : (changeView?.items ?? []),
    [backendChangeItems, changeView, selectedBaseUsesGit],
  );
  const changeItemCount = changeItems.length;
  const fallbackPatch = useMemo(
    () => buildCanvasWorkbenchGitApplyPatch(changeItems),
    [changeItems],
  );
  const activeSelectionChangeItem = useMemo(
    () => findChangeItemForSelection(changeItems, documentContext),
    [changeItems, documentContext],
  );
  const selectedChangeItem =
    changeItems.find((item) => item.id === selectedChangeId) ||
    activeSelectionChangeItem ||
    changeItems[0];
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

  const loadGitDiffBase = useCallback(
    async (base: Exclude<CanvasWorkbenchReviewBase, "commit">) => {
      if (base === "previousConversation") {
        setBackendPatch(null);
        setBackendChangeItems([]);
        setSelectedBase(base);
        setBaseMenuOpen(false);
        return;
      }
      if (!workspaceRoot) {
        toast.error(
          translateWorkbench(
            "agentChat.canvasWorkbench.coding.changes.toast.missingWorkspaceRoot",
          ),
        );
        return;
      }

      setReviewActionBusy(true);
      try {
        const diff = await readProjectGitDiff(workspaceRoot, 3, base);
        setBackendPatch(diff.patch);
        setBackendChangeItems(
          parseCanvasWorkbenchGitPatchToChangeItems(diff.patch),
        );
        setSelectedBase(base);
        setBaseMenuOpen(false);
        toast.success(
          translateWorkbench(
            "agentChat.canvasWorkbench.coding.changes.toast.refreshed",
          ),
        );
      } catch (error) {
        setBackendPatch(null);
        setBackendChangeItems([]);
        toast.error(
          error instanceof Error
            ? error.message
            : translateWorkbench(
                "agentChat.canvasWorkbench.coding.changes.toast.refreshFailed",
              ),
        );
      } finally {
        setReviewActionBusy(false);
      }
    },
    [translateWorkbench, workspaceRoot],
  );

  const handleSelectBase = useCallback(
    (base: CanvasWorkbenchReviewBase) => {
      if (base === "commit") {
        return;
      }
      void loadGitDiffBase(base);
    },
    [loadGitDiffBase],
  );

  const handleRefreshChanges = useCallback(async () => {
    if (selectedBaseUsesGit && selectedBase !== "commit") {
      await loadGitDiffBase(selectedBase);
      return;
    }
    if (!workspaceRoot) {
      toast.error(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.missingWorkspaceRoot",
        ),
      );
      return;
    }

    setReviewActionBusy(true);
    try {
      const diff = await readProjectGitDiff(workspaceRoot, 3);
      setBackendPatch(diff.patch);
      toast.success(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.refreshed",
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.toast.refreshFailed",
            ),
      );
    } finally {
      setReviewActionBusy(false);
    }
  }, [
    loadGitDiffBase,
    selectedBase,
    selectedBaseUsesGit,
    translateWorkbench,
    workspaceRoot,
  ]);

  const handleCopyGitApply = useCallback(async () => {
    const patch = resolveBackendPatchForCopy(
      selectedBase,
      backendPatch,
      fallbackPatch,
    );
    if (!patch.trim()) {
      toast.error(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.noPatch",
        ),
      );
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error(
        translateWorkbench("agentChat.canvasWorkbench.clipboard.unsupported"),
      );
      return;
    }

    setReviewActionBusy(true);
    try {
      await navigator.clipboard.writeText(buildGitApplyCommand(patch));
      toast.success(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.gitApplyCopied",
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.toast.gitApplyCopyFailed",
            ),
      );
    } finally {
      setReviewActionBusy(false);
    }
  }, [backendPatch, fallbackPatch, selectedBase, translateWorkbench]);

  const handleToggleLoadFullFile = useCallback(async () => {
    if (selectedLoadFullFile) {
      setLoadFullFile(false);
      return;
    }
    if (!selectedChangeItem || !loadFilePreview) {
      toast.error(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.fullFileLoadFailed",
        ),
      );
      return;
    }
    if (fullFileContentById[selectedChangeItem.id] != null) {
      setLoadFullFile(true);
      return;
    }

    const previewPath = resolveAbsoluteWorkspacePath(
      workspaceRoot,
      selectedChangeItem.absolutePath || selectedChangeItem.path,
    );
    if (!previewPath) {
      toast.error(
        translateWorkbench(
          "agentChat.canvasWorkbench.coding.changes.toast.fullFileLoadFailed",
        ),
      );
      setLoadFullFile(false);
      return;
    }

    setReviewActionBusy(true);
    try {
      const preview = await loadFilePreview(previewPath);
      if (preview.error || preview.isBinary || preview.content == null) {
        toast.error(
          preview.error ||
            translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.toast.fullFileLoadFailed",
            ),
        );
        setLoadFullFile(false);
        return;
      }
      setFullFileContentById((current) => ({
        ...current,
        [selectedChangeItem.id]: preview.content || "",
      }));
      setLoadFullFile(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateWorkbench(
              "agentChat.canvasWorkbench.coding.changes.toast.fullFileLoadFailed",
            ),
      );
      setLoadFullFile(false);
    } finally {
      setReviewActionBusy(false);
    }
  }, [
    fullFileContentById,
    loadFilePreview,
    selectedChangeItem,
    selectedLoadFullFile,
    translateWorkbench,
    workspaceRoot,
  ]);

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
          onRefreshChanges={handleRefreshChanges}
          onCopyGitApply={handleCopyGitApply}
          onToggleAutoExecute={() =>
            setAutoExecuteEnabled((enabled) => !enabled)
          }
          onToggleCollapseContext={() =>
            setCollapseDiffContext((enabled) => !enabled)
          }
          onToggleLoadFullFile={() => {
            void handleToggleLoadFullFile();
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

        <div
          className={cn(
            "grid min-h-0 gap-0",
            filesPanelOpen ? "grid-cols-[minmax(0,1fr)_252px]" : "grid-cols-1",
          )}
          style={filesPanelGridStyle}
        >
          <div className="relative min-h-0 overflow-hidden">
            {filesPanelResizeHandle}
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
          </div>

          {filesPanelOpen ? (
            <CanvasWorkbenchChangesFileList
              fileTree={filteredFileTree}
              selectedChangeItem={selectedChangeItem}
              fileFilter={fileFilter}
              translateWorkbench={translateWorkbench}
              onFileFilterChange={setFileFilter}
              onSelectChangeItem={handleSelectChangeItem}
            />
          ) : null}
        </div>
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
          onRefreshChanges={handleRefreshChanges}
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

        <div
          className={cn(
            "grid min-h-0",
            filesPanelOpen ? "grid-cols-[minmax(0,1fr)_252px]" : "grid-cols-1",
          )}
          style={filesPanelGridStyle}
        >
          <div className="group relative min-h-0">
            {filesPanelResizeHandle}
            <CanvasWorkbenchEmptyDiffPanel
              translateWorkbench={translateWorkbench}
            />
          </div>

          {filesPanelOpen ? (
            <CanvasWorkbenchChangesFileList
              fileTree={[]}
              selectedChangeItem={undefined}
              fileFilter=""
              disabled
              translateWorkbench={translateWorkbench}
              onFileFilterChange={() => undefined}
              onSelectChangeItem={() => undefined}
            />
          ) : null}
        </div>
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
        onRefreshChanges={handleRefreshChanges}
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

      <div
        className={cn(
          "grid min-h-0 gap-0",
          filesPanelOpen ? "grid-cols-[minmax(0,1fr)_252px]" : "grid-cols-1",
        )}
        style={filesPanelGridStyle}
      >
        <div className="relative min-h-0 overflow-hidden">
          {filesPanelResizeHandle}
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
        </div>

        {filesPanelOpen ? (
          <CanvasWorkbenchChangesFileList
            fileTree={filteredDocumentFileTree}
            selectedChangeItem={documentChangeItem}
            fileFilter={fileFilter}
            translateWorkbench={translateWorkbench}
            onFileFilterChange={setFileFilter}
            onSelectChangeItem={() => undefined}
          />
        ) : null}
      </div>
    </section>
  );
}
