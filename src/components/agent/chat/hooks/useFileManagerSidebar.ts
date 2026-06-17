import { useCallback, useEffect, useRef, useState } from "react";

import {
  APP_SIDEBAR_COLLAPSE_EVENT,
  FILE_MANAGER_NAV_COLLAPSE_BREAKPOINT_PX,
  loadFileManagerSidebarOpen,
  saveFileManagerSidebarOpen,
} from "../workspace/agentChatWorkspaceHelpers";

export interface FileManagerSidebarController {
  fileManagerAvailable: boolean;
  fileManagerSidebarOpen: boolean;
  fileManagerOpen: boolean;
  setFileManagerSidebarOpen: (open: boolean) => void;
  closeFileManagerSidebar: () => void;
  toggleFileManagerSidebar: () => void;
}

interface UseFileManagerSidebarOptions {
  onCollapseTopicSidebar: () => void;
}

function dispatchAppSidebarCollapse(collapsed: boolean) {
  window.dispatchEvent(
    new CustomEvent(APP_SIDEBAR_COLLAPSE_EVENT, {
      detail: { collapsed, source: "file-manager" },
    }),
  );
}

export function useFileManagerSidebar({
  onCollapseTopicSidebar,
}: UseFileManagerSidebarOptions): FileManagerSidebarController {
  const fileManagerAvailable = true;
  const [fileManagerSidebarOpen, setFileManagerSidebarOpenState] = useState(
    () => loadFileManagerSidebarOpen(),
  );
  const appSidebarCollapsedRef = useRef(false);

  const setFileManagerSidebarOpen = useCallback((open: boolean) => {
    setFileManagerSidebarOpenState(open);
    saveFileManagerSidebarOpen(open);
  }, []);

  const closeFileManagerSidebar = useCallback(() => {
    setFileManagerSidebarOpen(false);
  }, [setFileManagerSidebarOpen]);

  const toggleFileManagerSidebar = useCallback(() => {
    if (!fileManagerAvailable) {
      return;
    }
    setFileManagerSidebarOpen(!fileManagerSidebarOpen);
  }, [
    fileManagerAvailable,
    fileManagerSidebarOpen,
    setFileManagerSidebarOpen,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!fileManagerSidebarOpen) {
      if (appSidebarCollapsedRef.current) {
        appSidebarCollapsedRef.current = false;
        dispatchAppSidebarCollapse(false);
      }
      return;
    }

    appSidebarCollapsedRef.current = true;
    dispatchAppSidebarCollapse(true);
    if (window.innerWidth <= FILE_MANAGER_NAV_COLLAPSE_BREAKPOINT_PX) {
      onCollapseTopicSidebar();
    }
    return () => {
      if (!appSidebarCollapsedRef.current) {
        return;
      }
      appSidebarCollapsedRef.current = false;
      dispatchAppSidebarCollapse(false);
    };
  }, [fileManagerSidebarOpen, onCollapseTopicSidebar]);

  return {
    fileManagerAvailable,
    fileManagerSidebarOpen,
    fileManagerOpen: fileManagerAvailable && fileManagerSidebarOpen,
    setFileManagerSidebarOpen,
    closeFileManagerSidebar,
    toggleFileManagerSidebar,
  };
}
