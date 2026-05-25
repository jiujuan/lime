import { useCallback, useRef } from "react";

interface UseWorkspaceHistorySidebarPrefetchParams {
  topicsReady: boolean;
  projectId?: string | null;
  showSidebar: boolean;
  loadTopics: () => Promise<unknown>;
  onToggleSidebar: () => void;
}

export function useWorkspaceHistorySidebarPrefetch({
  topicsReady,
  projectId,
  showSidebar,
  loadTopics,
  onToggleSidebar,
}: UseWorkspaceHistorySidebarPrefetchParams) {
  const prefetchPromiseRef = useRef<Promise<unknown> | null>(null);

  const prefetchHistoryTopics = useCallback(() => {
    if (topicsReady || !projectId?.trim()) {
      return;
    }
    if (prefetchPromiseRef.current) {
      return;
    }

    const prefetchPromise = loadTopics();
    prefetchPromiseRef.current = prefetchPromise;
    void prefetchPromise.finally(() => {
      if (prefetchPromiseRef.current === prefetchPromise) {
        prefetchPromiseRef.current = null;
      }
    });
  }, [loadTopics, projectId, topicsReady]);

  const handleToggleHistorySidebar = useCallback(() => {
    if (!showSidebar) {
      prefetchHistoryTopics();
    }
    onToggleSidebar();
  }, [onToggleSidebar, prefetchHistoryTopics, showSidebar]);

  return {
    handleToggleHistorySidebar,
    prefetchHistoryTopics,
  };
}
