import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Artifact } from "@/lib/artifact/types";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type {
  AgentSiteSkillLaunchParams,
  Page,
  PageParams,
} from "@/types/page";
import type { Message } from "../types";
import { useWorkspaceBrowserAssistRuntime } from "./useWorkspaceBrowserAssistRuntime";
import { useWorkspaceBrowserAssistRequestRuntime } from "./useWorkspaceBrowserAssistRequestRuntime";
import type {
  WorkspaceBrowserAssistArtifactOpenControl,
  WorkspaceBrowserAssistCanvasControl,
} from "./workspaceBrowserAssistCanvasControl";

type WorkspaceNavigate = (page: Page, params?: PageParams) => void;

interface BrowserAssistArtifactSelection {
  clearBrowserAssistCanvasArtifact: () => void;
  hasBrowserAssistArtifact: boolean;
}

interface UseWorkspaceBrowserAssistCanvasRuntimeParams {
  activeTheme: string;
  artifacts: Artifact[];
  contentId?: string | null;
  generalBrowserAssistProfileKey: string;
  input: string;
  initialAutoSendRequestMetadata?: Record<string, unknown> | null;
  initialSiteSkillLaunch?: AgentSiteSkillLaunchParams;
  initialUserPrompt?: string;
  mappedTheme: string;
  messages: Message[];
  onBrowserWorkbenchOpenRequest?: (url: string | null) => void;
  onNavigate?: WorkspaceNavigate;
  openBrowserAssistOnMount: boolean;
  projectId?: string | null;
  selection: BrowserAssistArtifactSelection;
  sessionId?: string | null;
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
  siteSkillLaunchNonce?: number;
  upsertGeneralArtifact: (artifact: Artifact) => void;
}

export function useWorkspaceBrowserAssistCanvasRuntime({
  activeTheme,
  artifacts,
  contentId,
  generalBrowserAssistProfileKey,
  input,
  initialAutoSendRequestMetadata,
  initialSiteSkillLaunch,
  initialUserPrompt,
  mappedTheme,
  messages,
  onBrowserWorkbenchOpenRequest,
  onNavigate,
  openBrowserAssistOnMount,
  projectId,
  selection,
  sessionId,
  setLayoutMode,
  siteSkillLaunchNonce,
  upsertGeneralArtifact,
}: UseWorkspaceBrowserAssistCanvasRuntimeParams) {
  const browserAssistRuntime = useWorkspaceBrowserAssistRuntime({
    activeTheme,
    projectId,
    sessionId,
    contentId,
    input,
    initialUserPrompt,
    openBrowserAssistOnMount,
    initialSiteSkillLaunch,
    siteSkillLaunchNonce,
    artifacts,
    messages,
    setLayoutMode,
    upsertGeneralArtifact,
    generalBrowserAssistProfileKey,
    onBrowserWorkbenchOpenRequest,
  });
  const browserAssistRequestRuntime = useWorkspaceBrowserAssistRequestRuntime({
    browserAssistSessionState: browserAssistRuntime.browserAssistSessionState,
    contentId,
    initialAutoSendRequestMetadata,
    initialSiteSkillLaunch,
    mappedTheme,
    onNavigate,
    projectId,
  });
  const canvasControl = useMemo<WorkspaceBrowserAssistCanvasControl>(
    () => ({
      clearArtifact: selection.clearBrowserAssistCanvasArtifact,
      hasArtifact: selection.hasBrowserAssistArtifact,
      suppressAutoOpen:
        browserAssistRuntime.suppressBrowserAssistCanvasAutoOpen,
      suppressGeneralArtifactAutoOpen:
        browserAssistRuntime.suppressGeneralCanvasArtifactAutoOpen,
    }),
    [
      browserAssistRuntime.suppressBrowserAssistCanvasAutoOpen,
      browserAssistRuntime.suppressGeneralCanvasArtifactAutoOpen,
      selection.clearBrowserAssistCanvasArtifact,
      selection.hasBrowserAssistArtifact,
    ],
  );
  const artifactOpenControl =
    useMemo<WorkspaceBrowserAssistArtifactOpenControl>(
      () => ({
        openRuntimeForArtifact:
          browserAssistRequestRuntime.handleOpenBrowserRuntimeForBrowserAssist,
        suppressAutoOpen:
          browserAssistRuntime.suppressBrowserAssistCanvasAutoOpen,
      }),
      [
        browserAssistRequestRuntime.handleOpenBrowserRuntimeForBrowserAssist,
        browserAssistRuntime.suppressBrowserAssistCanvasAutoOpen,
      ],
    );

  return {
    ...browserAssistRuntime,
    ...browserAssistRequestRuntime,
    artifactOpenControl,
    canvasControl,
  };
}
