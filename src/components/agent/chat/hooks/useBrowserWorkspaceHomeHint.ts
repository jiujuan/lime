import { useCallback, useEffect, useState } from "react";

import {
  BROWSER_WORKSPACE_HOME_HINT_AUTO_HIDE_MS,
  BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY,
} from "../workspace/agentChatWorkspaceHelpers";

interface UseBrowserWorkspaceHomeHintOptions {
  enabled: boolean;
  projectId: string | null;
  entryBannerMessage?: string;
}

export interface BrowserWorkspaceHomeHintController {
  browserWorkspaceHintVisible: boolean;
  dismissBrowserWorkspaceHint: () => void;
}

function shouldPersistBrowserWorkspaceHomeHint(
  enabled: boolean,
  projectId: string | null,
  entryBannerMessage?: string,
): boolean {
  return enabled && Boolean(projectId) && !entryBannerMessage;
}

export function useBrowserWorkspaceHomeHint({
  enabled,
  projectId,
  entryBannerMessage,
}: UseBrowserWorkspaceHomeHintOptions): BrowserWorkspaceHomeHintController {
  const [browserWorkspaceHintVisible, setBrowserWorkspaceHintVisible] =
    useState(false);

  useEffect(() => {
    if (
      !shouldPersistBrowserWorkspaceHomeHint(
        enabled,
        projectId,
        entryBannerMessage,
      )
    ) {
      return;
    }

    try {
      if (
        window.localStorage.getItem(BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY) ===
        "true"
      ) {
        return;
      }

      window.localStorage.setItem(
        BROWSER_WORKSPACE_HOME_HINT_STORAGE_KEY,
        "true",
      );
    } catch {
      // 本地存储不可用时仍展示一次提示，避免首开闭环静默失败。
    }

    setBrowserWorkspaceHintVisible(true);
  }, [enabled, projectId, entryBannerMessage]);

  useEffect(() => {
    if (!browserWorkspaceHintVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setBrowserWorkspaceHintVisible(false);
    }, BROWSER_WORKSPACE_HOME_HINT_AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [browserWorkspaceHintVisible]);

  const dismissBrowserWorkspaceHint = useCallback(() => {
    setBrowserWorkspaceHintVisible(false);
  }, []);

  return {
    browserWorkspaceHintVisible,
    dismissBrowserWorkspaceHint,
  };
}
