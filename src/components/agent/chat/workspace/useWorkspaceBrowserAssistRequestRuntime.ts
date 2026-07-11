import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { Artifact } from "@/lib/artifact/types";
import type {
  AgentSiteSkillLaunchParams,
  Page,
  PageParams,
} from "@/types/page";
import type { BrowserAssistSessionState } from "../types";
import { GENERAL_BROWSER_ASSIST_PROFILE_KEY } from "./agentChatWorkspaceHelpers";
import { resolveWorkspaceBrowserAssistRequest } from "./workspaceBrowserAssistRequest";
import { resolveBrowserRuntimeNavigationFromBrowserAssist } from "./workspaceBrowserRuntimeNavigation";
import { buildBrowserSessionRefFromBrowserAssistSessionState } from "./workspaceBrowserSessionRef";

type WorkspaceNavigate = (page: Page, params?: PageParams) => void;

interface UseWorkspaceBrowserAssistRequestRuntimeParams {
  browserAssistSessionState: BrowserAssistSessionState | null;
  contentId?: string | null;
  initialAutoSendRequestMetadata?: Record<string, unknown> | null;
  initialSiteSkillLaunch?: AgentSiteSkillLaunchParams;
  mappedTheme: string;
  onNavigate?: WorkspaceNavigate;
  projectId?: string | null;
}

export function useWorkspaceBrowserAssistRequestRuntime({
  browserAssistSessionState,
  contentId,
  initialAutoSendRequestMetadata,
  initialSiteSkillLaunch,
  mappedTheme,
  onNavigate,
  projectId,
}: UseWorkspaceBrowserAssistRequestRuntimeParams) {
  const browserAssistSessionRef = useMemo(
    () =>
      buildBrowserSessionRefFromBrowserAssistSessionState(
        browserAssistSessionState,
      ),
    [browserAssistSessionState],
  );
  const {
    browserAssistRequestProfileKey,
    browserAssistRequestPreferredBackend,
    browserAssistRequestAutoLaunch,
  } = resolveWorkspaceBrowserAssistRequest({
    mappedTheme,
    initialAutoSendRequestMetadata,
    initialSiteSkillLaunch,
    browserAssistSessionState,
  });
  const handleOpenBrowserRuntimeForBrowserAssist = useCallback(
    (artifact?: Artifact) => {
      if (!onNavigate) {
        toast.error("当前入口暂不支持打开浏览器工作台，请从桌面主界面重试。");
        return;
      }

      onNavigate(
        "browser-runtime",
        resolveBrowserRuntimeNavigationFromBrowserAssist({
          artifact,
          browserSessionRef: browserAssistSessionRef,
          browserAssistSessionState,
          contentId,
          generalBrowserAssistProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
          projectId,
        }),
      );
    },
    [
      browserAssistSessionRef,
      browserAssistSessionState,
      contentId,
      onNavigate,
      projectId,
    ],
  );

  return {
    browserAssistRequestAutoLaunch,
    browserAssistRequestPreferredBackend,
    browserAssistRequestProfileKey,
    browserAssistSessionRef,
    handleOpenBrowserRuntimeForBrowserAssist,
  };
}
