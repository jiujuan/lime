import { useCallback, useState } from "react";
import { toast } from "sonner";
import { listDirectory, type DirectoryListing } from "@/lib/api/fileBrowser";
import type { HarnessFilePreviewResult } from "../../HarnessStatusPanel";
import {
  normalizeCanvasWorkbenchPath,
  type WorkspaceFileSelection,
} from "../../CanvasWorkbenchLayoutViewModel";
import { extractFileNameFromPath } from "../../../workspace/workspacePath";
import { filterWorkspaceDirectoryListing } from "../../../workspace/workspaceTreeVisibility";

type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface CanvasWorkbenchFileTreeState {
  directoryCache: Record<string, DirectoryListing>;
  expandedDirectories: Record<string, boolean>;
  loadingDirectories: Record<string, boolean>;
  workspaceFileSelections: Record<string, WorkspaceFileSelection>;
  loadDirectory: (path: string) => Promise<void>;
  refreshDirectorySubtree: (rootPath: string) => Promise<void>;
  toggleDirectory: (path: string) => void;
  selectWorkspaceFile: (path: string) => Promise<string>;
}

export function useCanvasWorkbenchFileTreeState({
  workspaceRoot,
  loadFilePreview,
  translateWorkbench,
}: {
  workspaceRoot?: string | null;
  loadFilePreview: (path: string) => Promise<HarnessFilePreviewResult>;
  translateWorkbench: CanvasWorkbenchTranslation;
}): CanvasWorkbenchFileTreeState {
  const [directoryCache, setDirectoryCache] = useState<
    Record<string, DirectoryListing>
  >({});
  const [loadingDirectories, setLoadingDirectories] = useState<
    Record<string, boolean>
  >({});
  const [expandedDirectories, setExpandedDirectories] = useState<
    Record<string, boolean>
  >({});
  const [workspaceFileSelections, setWorkspaceFileSelections] = useState<
    Record<string, WorkspaceFileSelection>
  >({});

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path.trim()) {
        return;
      }
      setLoadingDirectories((previous) => ({ ...previous, [path]: true }));
      try {
        const listing = filterWorkspaceDirectoryListing(
          await listDirectory(path),
          workspaceRoot,
        );
        setDirectoryCache((previous) => ({
          ...previous,
          [path]: listing,
        }));
      } catch (error) {
        toast.error(
          translateWorkbench("agentChat.canvasWorkbench.workspace.loadFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        setLoadingDirectories((previous) => ({ ...previous, [path]: false }));
      }
    },
    [translateWorkbench, workspaceRoot],
  );

  const toggleDirectory = useCallback(
    (path: string) => {
      const willExpand = !expandedDirectories[path];
      setExpandedDirectories((previous) => ({
        ...previous,
        [path]: willExpand,
      }));
      if (willExpand) {
        void loadDirectory(path);
      }
    },
    [expandedDirectories, loadDirectory],
  );

  const refreshDirectorySubtree = useCallback(
    async (rootPath: string) => {
      const normalizedRootPath = normalizeCanvasWorkbenchPath(rootPath.trim());
      if (!normalizedRootPath) {
        return;
      }

      const expandedDescendants = Object.entries(expandedDirectories)
        .filter(
          ([path, expanded]) =>
            expanded &&
            normalizeCanvasWorkbenchPath(path).startsWith(
              `${normalizedRootPath}/`,
            ),
        )
        .map(([path]) => path);

      await Promise.all([
        loadDirectory(rootPath),
        ...expandedDescendants.map((path) => loadDirectory(path)),
      ]);
    },
    [expandedDirectories, loadDirectory],
  );

  const selectWorkspaceFile = useCallback(
    async (path: string) => {
      const title = extractFileNameFromPath(path);
      const selectionKey = `workspace-file:${path}`;
      setWorkspaceFileSelections((previous) => ({
        ...previous,
        [selectionKey]: {
          path,
          title,
          status: "loading",
        },
      }));

      const preview = await loadFilePreview(path);
      setWorkspaceFileSelections((previous) => {
        if (preview.isBinary) {
          return {
            ...previous,
            [selectionKey]: {
              path,
              title,
              status: "binary",
              error: preview.error ?? null,
              size: preview.size,
            },
          };
        }

        if (preview.error) {
          return {
            ...previous,
            [selectionKey]: {
              path,
              title,
              status: "error",
              error: preview.error,
              size: preview.size,
            },
          };
        }

        return {
          ...previous,
          [selectionKey]: {
            path,
            title,
            status: "ready",
            content: preview.content || "",
            size: preview.size,
          },
        };
      });

      return selectionKey;
    },
    [loadFilePreview],
  );

  return {
    directoryCache,
    expandedDirectories,
    loadingDirectories,
    workspaceFileSelections,
    loadDirectory,
    refreshDirectorySubtree,
    toggleDirectory,
    selectWorkspaceFile,
  };
}
