import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Artifact } from "@/lib/artifact/types";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import type { HarnessFilePreviewResult } from "../HarnessStatusPanel";
import type { TaskFile } from "../TaskFiles";
import {
  buildDefaultPreviewSelection,
  buildEntries,
  resolveSavedContentBundleRoot,
  resolveSelectionContext,
  resolveWorkspacePanelDisplayPath,
  type CanvasWorkbenchCopy,
  type CanvasWorkbenchResolvedSelection,
} from "../CanvasWorkbenchLayoutViewModel";
import {
  isCanvasWorkbenchPreviewMode,
  resolveCanvasWorkbenchPreferredPreviewModeFromPath,
  resolveCanvasWorkbenchPreviewModeState,
  type CanvasWorkbenchPreviewMode,
  type CanvasWorkbenchPreviewModeState,
} from "./CanvasWorkbenchPreviewModeViewModel";
import {
  resolveCanvasWorkbenchToolTabKind,
  resolveInitialCanvasWorkbenchTab,
  type CanvasWorkbenchDefaultPreview,
  type CanvasWorkbenchTab,
} from "./CanvasWorkbenchLayoutState";
import { useCanvasWorkbenchFileTreeState } from "./files/useCanvasWorkbenchFileTreeState";
import type { CanvasWorkbenchChangeView } from "./changes/CanvasWorkbenchChangesPanelViewModel";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface UseCanvasWorkbenchDocumentStateParams {
  artifacts: Artifact[];
  canvasState: CanvasStateUnion | null;
  taskFiles: TaskFile[];
  selectedFileId?: string;
  workspaceRoot?: string | null;
  workspaceUnavailable: boolean;
  defaultPreview: CanvasWorkbenchDefaultPreview | null;
  loadFilePreview: (path: string) => Promise<HarnessFilePreviewResult>;
  workbenchCopy: CanvasWorkbenchCopy;
  translateWorkbench: CanvasWorkbenchTranslation;
  hasDefaultPreviewContent: boolean;
  hasCustomSessionView: boolean;
  isCodingWorkbench: boolean;
  changeView?: CanvasWorkbenchChangeView | null;
}

interface UseCanvasWorkbenchDocumentStateResult {
  activeTab: CanvasWorkbenchTab;
  setActiveTab: Dispatch<SetStateAction<CanvasWorkbenchTab>>;
  activePreviewContext: CanvasWorkbenchResolvedSelection | null;
  documentContext: CanvasWorkbenchResolvedSelection | null;
  documentSelectionKey: string | null;
  previewModeState: CanvasWorkbenchPreviewModeState;
  projectFilesPreviewMode: CanvasWorkbenchPreviewMode;
  setProjectFilesPreviewMode: Dispatch<
    SetStateAction<CanvasWorkbenchPreviewMode>
  >;
  sessionContext: CanvasWorkbenchResolvedSelection | null;
  workspacePanelRootPath: string | null;
  workspacePanelDisplayPath?: string;
  directoryCache: ReturnType<
    typeof useCanvasWorkbenchFileTreeState
  >["directoryCache"];
  expandedDirectories: ReturnType<
    typeof useCanvasWorkbenchFileTreeState
  >["expandedDirectories"];
  loadingDirectories: ReturnType<
    typeof useCanvasWorkbenchFileTreeState
  >["loadingDirectories"];
  toggleDirectory: ReturnType<
    typeof useCanvasWorkbenchFileTreeState
  >["toggleDirectory"];
  refreshDirectorySubtree: ReturnType<
    typeof useCanvasWorkbenchFileTreeState
  >["refreshDirectorySubtree"];
  openDocumentSelection: (selectionKey: string) => void;
  handleSelectWorkspaceFile: (path: string) => Promise<void>;
  shouldShowSessionTab: boolean;
}

export function useCanvasWorkbenchDocumentState({
  artifacts,
  canvasState,
  taskFiles,
  selectedFileId,
  workspaceRoot,
  workspaceUnavailable,
  defaultPreview,
  loadFilePreview,
  workbenchCopy,
  translateWorkbench,
  hasDefaultPreviewContent,
  hasCustomSessionView,
  isCodingWorkbench,
  changeView,
}: UseCanvasWorkbenchDocumentStateParams): UseCanvasWorkbenchDocumentStateResult {
  const {
    directoryCache,
    expandedDirectories,
    loadingDirectories,
    workspaceFileSelections,
    loadDirectory,
    refreshDirectorySubtree,
    toggleDirectory,
    selectWorkspaceFile,
  } = useCanvasWorkbenchFileTreeState({
    workspaceRoot,
    loadFilePreview,
    translateWorkbench,
  });

  const entries = useMemo(
    () =>
      buildEntries(
        artifacts,
        canvasState,
        taskFiles,
        workbenchCopy,
        workspaceRoot,
      ),
    [artifacts, canvasState, taskFiles, workbenchCopy, workspaceRoot],
  );

  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [entry.key, entry])),
    [entries],
  );

  const fallbackSelectionKey = useMemo(() => {
    if (
      defaultPreview?.selectionKey &&
      entryMap.has(defaultPreview.selectionKey)
    ) {
      return defaultPreview.selectionKey;
    }

    if (selectedFileId) {
      const selectedTaskKey = `task:${selectedFileId}`;
      if (entryMap.has(selectedTaskKey)) {
        return selectedTaskKey;
      }
    }

    return entries[0]?.key || null;
  }, [defaultPreview?.selectionKey, entries, entryMap, selectedFileId]);

  const initialDocumentSelectionKey =
    defaultPreview?.selectionKey || fallbackSelectionKey;
  const initialDocumentPath =
    defaultPreview?.filePath ||
    defaultPreview?.absolutePath ||
    defaultPreview?.title ||
    (initialDocumentSelectionKey
      ? entryMap.get(initialDocumentSelectionKey)?.filePath ||
        entryMap.get(initialDocumentSelectionKey)?.absolutePath ||
        entryMap.get(initialDocumentSelectionKey)?.title
      : null);
  const shouldPreferSessionTabOnMount = Boolean(
    !isCodingWorkbench &&
    (hasCustomSessionView || hasDefaultPreviewContent) &&
    !initialDocumentSelectionKey,
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialDocumentSelectionKey,
  );
  const [activeTab, setActiveTab] = useState<CanvasWorkbenchTab>(() => {
    return resolveInitialCanvasWorkbenchTab(
      defaultPreview,
      changeView,
      initialDocumentPath || initialDocumentSelectionKey,
      shouldPreferSessionTabOnMount,
      isCodingWorkbench,
    );
  });
  const [projectFilesPreviewMode, setProjectFilesPreviewMode] =
    useState<CanvasWorkbenchPreviewMode>("code");

  const isKnownSelectionKey = useCallback(
    (selectionKey: string | null) => {
      if (!selectionKey) {
        return false;
      }
      if (selectionKey.startsWith("workspace-file:")) {
        return true;
      }
      return (
        entryMap.has(selectionKey) ||
        selectionKey === defaultPreview?.selectionKey
      );
    },
    [defaultPreview?.selectionKey, entryMap],
  );

  useEffect(() => {
    if (!selectedKey || isKnownSelectionKey(selectedKey)) {
      return;
    }
    if (
      selectedKey.startsWith("artifact:") ||
      selectedKey.startsWith("task:") ||
      selectedKey.startsWith("version:")
    ) {
      return;
    }
    setSelectedKey(fallbackSelectionKey);
  }, [fallbackSelectionKey, isKnownSelectionKey, selectedKey]);

  useEffect(() => {
    if (!workspaceRoot?.trim() || workspaceUnavailable) {
      return;
    }
    if (directoryCache[workspaceRoot]) {
      return;
    }
    void loadDirectory(workspaceRoot);
  }, [directoryCache, loadDirectory, workspaceRoot, workspaceUnavailable]);

  const handleOpenDocumentSelection = useCallback(
    (selectionKey: string) => {
      setSelectedKey(selectionKey);
      if (resolveCanvasWorkbenchToolTabKind(activeTab) === "project-files") {
        setProjectFilesPreviewMode(
          resolveCanvasWorkbenchPreferredPreviewModeFromPath(
            selectionKey.replace(/^workspace-file:/, ""),
          ),
        );
        return;
      }
      setActiveTab(
        resolveCanvasWorkbenchPreferredPreviewModeFromPath(
          selectionKey.replace(/^workspace-file:/, ""),
        ),
      );
    },
    [activeTab],
  );

  const handleSelectWorkspaceFile = useCallback(
    async (path: string) => {
      const selectionKey = `workspace-file:${path}`;
      handleOpenDocumentSelection(selectionKey);
      await selectWorkspaceFile(path);
    },
    [handleOpenDocumentSelection, selectWorkspaceFile],
  );

  const documentSelectionKey = useMemo(() => {
    return selectedKey || fallbackSelectionKey;
  }, [fallbackSelectionKey, selectedKey]);

  const documentContext = useMemo(
    () =>
      resolveSelectionContext({
        selectionKey: documentSelectionKey,
        defaultPreview,
        entryMap,
        workspaceFileSelections,
        canvasState,
        artifacts,
        copy: workbenchCopy,
        workspaceRoot,
      }),
    [
      artifacts,
      canvasState,
      defaultPreview,
      documentSelectionKey,
      entryMap,
      workspaceFileSelections,
      workbenchCopy,
      workspaceRoot,
    ],
  );

  const sessionContext = useMemo(() => {
    if (documentContext) {
      return documentContext;
    }
    if (defaultPreview?.content.trim()) {
      return buildDefaultPreviewSelection(defaultPreview, workbenchCopy);
    }
    return null;
  }, [defaultPreview, documentContext, workbenchCopy]);

  const workspacePanelRootPath = useMemo(
    () =>
      resolveSavedContentBundleRoot(
        workspaceRoot,
        documentContext?.selectionPath || sessionContext?.selectionPath,
      ) ||
      workspaceRoot ||
      null,
    [
      documentContext?.selectionPath,
      sessionContext?.selectionPath,
      workspaceRoot,
    ],
  );

  const workspacePanelDisplayPath = useMemo(
    () =>
      resolveWorkspacePanelDisplayPath(workspaceRoot, workspacePanelRootPath),
    [workspacePanelRootPath, workspaceRoot],
  );

  const previewModeState = useMemo(
    () => resolveCanvasWorkbenchPreviewModeState(documentContext),
    [documentContext],
  );

  useEffect(() => {
    if (!workspacePanelRootPath?.trim() || workspaceUnavailable) {
      return;
    }
    if (directoryCache[workspacePanelRootPath]) {
      return;
    }
    void loadDirectory(workspacePanelRootPath);
  }, [
    directoryCache,
    loadDirectory,
    workspacePanelRootPath,
    workspaceUnavailable,
  ]);

  const shouldShowSessionTab = Boolean(sessionContext || hasCustomSessionView);
  const activeToolTabKind = resolveCanvasWorkbenchToolTabKind(activeTab);
  const activePreviewContext = isCanvasWorkbenchPreviewMode(activeTab)
    ? documentContext
    : activeToolTabKind === "project-files" &&
        documentSelectionKey?.startsWith("workspace-file:")
      ? documentContext
      : activeTab === "outputs" || activeTab === "logs"
        ? hasCustomSessionView
          ? null
          : sessionContext
        : null;

  useEffect(() => {
    if (activeTab !== "outputs" || shouldShowSessionTab) {
      return;
    }
    setActiveTab(documentContext ? previewModeState.defaultMode : "workspace");
  }, [
    activeTab,
    documentContext,
    previewModeState.defaultMode,
    shouldShowSessionTab,
  ]);

  useEffect(() => {
    if (
      isCanvasWorkbenchPreviewMode(activeTab) &&
      !previewModeState.modes[activeTab].enabled &&
      activeTab !== previewModeState.defaultMode
    ) {
      setActiveTab(previewModeState.defaultMode);
    }
  }, [activeTab, previewModeState]);

  return {
    activeTab,
    setActiveTab,
    activePreviewContext,
    documentContext,
    documentSelectionKey,
    previewModeState,
    projectFilesPreviewMode,
    setProjectFilesPreviewMode,
    sessionContext,
    workspacePanelRootPath,
    workspacePanelDisplayPath,
    directoryCache,
    expandedDirectories,
    loadingDirectories,
    toggleDirectory,
    refreshDirectorySubtree,
    openDocumentSelection: handleOpenDocumentSelection,
    handleSelectWorkspaceFile,
    shouldShowSessionTab,
  };
}
