import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCanvasWorkbenchToolTabId,
  isCanvasWorkbenchToolTab,
  resolveCanvasWorkbenchToolTabKind,
  type CanvasWorkbenchBrowserOpenRequest,
  type CanvasWorkbenchNewToolTab,
  type CanvasWorkbenchOpenedToolTab,
  type CanvasWorkbenchTab,
} from "../CanvasWorkbenchLayoutState";
import { normalizeCanvasWorkbenchBrowserUrl } from "../browser/CanvasWorkbenchBrowserViewModel";

export interface CanvasWorkbenchToolTabsState {
  openedToolTabs: CanvasWorkbenchOpenedToolTab[];
  openNewToolTab: (tab: CanvasWorkbenchNewToolTab) => void;
  closeToolTab: (tab: CanvasWorkbenchTab) => void;
  resolveToolTabKind: (
    tab: CanvasWorkbenchTab,
  ) => CanvasWorkbenchNewToolTab | null;
  resolveBrowserInitialUrl: (tab: CanvasWorkbenchTab) => string | null;
  updateBrowserTabUrl: (tab: CanvasWorkbenchTab, url: string) => void;
}

export function useCanvasWorkbenchToolTabsState({
  activeTab,
  setActiveTab,
  browserOpenRequest,
  onBrowserOpenRequestHandled,
}: {
  activeTab: CanvasWorkbenchTab;
  setActiveTab: (tab: CanvasWorkbenchTab) => void;
  browserOpenRequest?: CanvasWorkbenchBrowserOpenRequest | null;
  onBrowserOpenRequestHandled?: (requestKey: string | number) => void;
}): CanvasWorkbenchToolTabsState {
  const [openedToolTabs, setOpenedToolTabs] = useState<
    CanvasWorkbenchOpenedToolTab[]
  >([]);
  const nextToolTabSequenceRef = useRef<
    Record<CanvasWorkbenchNewToolTab, number>
  >({
    browser: 1,
    "project-files": 1,
    terminal: 1,
  });

  const createToolTab = useCallback(
    (
      kind: CanvasWorkbenchNewToolTab,
      options?: { browserUrl?: string | null },
    ): CanvasWorkbenchOpenedToolTab => {
      const sequence = nextToolTabSequenceRef.current[kind];
      nextToolTabSequenceRef.current[kind] += 1;
      return {
        id: createCanvasWorkbenchToolTabId(kind, sequence),
        kind,
        sequence,
        browserUrl: options?.browserUrl ?? null,
      };
    },
    [],
  );

  const openNewToolTab = useCallback(
    (tab: CanvasWorkbenchNewToolTab) => {
      const nextTab = createToolTab(tab);
      setOpenedToolTabs((previous) => [...previous, nextTab]);
      setActiveTab(nextTab.id);
    },
    [createToolTab, setActiveTab],
  );

  const closeToolTab = useCallback(
    (tab: CanvasWorkbenchTab) => {
      if (!isCanvasWorkbenchToolTab(tab)) {
        return;
      }

      const targetIndex = openedToolTabs.findIndex((item) => item.id === tab);
      const nextTabs = openedToolTabs.filter((item) => item.id !== tab);
      setOpenedToolTabs(nextTabs);
      if (activeTab === tab) {
        const nextActiveTab =
          nextTabs[targetIndex] ?? nextTabs[targetIndex - 1] ?? null;
        setActiveTab(nextActiveTab?.id ?? "changes");
      }
    },
    [activeTab, openedToolTabs, setActiveTab],
  );

  const resolveBrowserInitialUrl = useCallback(
    (tab: CanvasWorkbenchTab) => {
      if (tab === "browser") {
        return null;
      }
      return openedToolTabs.find((item) => item.id === tab)?.browserUrl ?? null;
    },
    [openedToolTabs],
  );

  const updateBrowserTabUrl = useCallback(
    (tab: CanvasWorkbenchTab, url: string) => {
      setOpenedToolTabs((previous) =>
        previous.map((item) =>
          item.id === tab && item.kind === "browser"
            ? { ...item, browserUrl: url }
            : item,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    if (!browserOpenRequest) {
      return;
    }

    const requestKey = browserOpenRequest.requestKey;
    const nextUrl = normalizeCanvasWorkbenchBrowserUrl(
      browserOpenRequest.url || "",
    );
    const nextTab = createToolTab("browser", { browserUrl: nextUrl });
    setOpenedToolTabs((previous) => [...previous, nextTab]);
    setActiveTab(nextTab.id);
    onBrowserOpenRequestHandled?.(requestKey);
  }, [
    browserOpenRequest,
    createToolTab,
    onBrowserOpenRequestHandled,
    setActiveTab,
  ]);

  return {
    openedToolTabs,
    openNewToolTab,
    closeToolTab,
    resolveToolTabKind: resolveCanvasWorkbenchToolTabKind,
    resolveBrowserInitialUrl,
    updateBrowserTabUrl,
  };
}
