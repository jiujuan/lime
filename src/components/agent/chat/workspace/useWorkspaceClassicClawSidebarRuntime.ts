import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface WorkspaceClassicClawSidebarEntryKeyParams {
  contentId?: string | null;
  externalProjectId?: string | null;
  newChatAt?: number | null;
  normalizedEntryTheme: string;
  sessionId?: string | null;
  shouldAutoCollapseClassicClawSidebar: boolean;
}

export interface UseWorkspaceClassicClawSidebarRuntimeParams extends WorkspaceClassicClawSidebarEntryKeyParams {
  setShowSidebar: Dispatch<SetStateAction<boolean>>;
}

export function buildWorkspaceClassicClawSidebarEntryResetKey({
  contentId,
  externalProjectId,
  newChatAt,
  normalizedEntryTheme,
  sessionId,
  shouldAutoCollapseClassicClawSidebar,
}: WorkspaceClassicClawSidebarEntryKeyParams): string | null {
  if (!shouldAutoCollapseClassicClawSidebar) {
    return null;
  }

  return JSON.stringify({
    projectId: externalProjectId ?? null,
    contentId: contentId ?? null,
    sessionId: sessionId ?? null,
    theme: normalizedEntryTheme,
    newChatAt: newChatAt ?? null,
  });
}

export function useWorkspaceClassicClawSidebarRuntime({
  contentId,
  externalProjectId,
  newChatAt,
  normalizedEntryTheme,
  sessionId,
  shouldAutoCollapseClassicClawSidebar,
  setShowSidebar,
}: UseWorkspaceClassicClawSidebarRuntimeParams) {
  const autoCollapsedTopicSidebarRef = useRef(false);
  const entryResetKey = useMemo(
    () =>
      buildWorkspaceClassicClawSidebarEntryResetKey({
        contentId,
        externalProjectId,
        newChatAt,
        normalizedEntryTheme,
        sessionId,
        shouldAutoCollapseClassicClawSidebar,
      }),
    [
      contentId,
      externalProjectId,
      newChatAt,
      normalizedEntryTheme,
      sessionId,
      shouldAutoCollapseClassicClawSidebar,
    ],
  );

  useEffect(() => {
    if (!shouldAutoCollapseClassicClawSidebar) {
      return;
    }

    autoCollapsedTopicSidebarRef.current = false;
    setShowSidebar(false);
  }, [entryResetKey, setShowSidebar, shouldAutoCollapseClassicClawSidebar]);

  return {
    autoCollapsedTopicSidebarRef,
  };
}
