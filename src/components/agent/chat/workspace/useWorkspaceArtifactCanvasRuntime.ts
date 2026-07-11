import type { Dispatch, SetStateAction } from "react";
import type { CanvasState as GeneralCanvasState } from "@/components/general-chat/bridge";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import type { Message } from "../types";
import type { WorkspaceWorkbenchRequestsController } from "../hooks/useWorkspaceWorkbenchRequests";
import { useWorkspaceArtifactSelectionRuntime } from "./useWorkspaceArtifactSelectionRuntime";
import { useWorkspaceArtifactStoreRuntime } from "./useWorkspaceArtifactStoreRuntime";
import { useWorkspaceArtifactViewModeControl } from "./useWorkspaceArtifactViewModeControl";
import { useWorkspaceBrowserAssistCanvasRuntime } from "./useWorkspaceBrowserAssistCanvasRuntime";

interface UseWorkspaceArtifactCanvasRuntimeParams {
  activeTheme: string;
  contentId?: string | null;
  generalBrowserAssistProfileKey: string;
  generalCanvasState: GeneralCanvasState;
  input: string;
  initialAutoSendRequestMetadata?: Record<string, unknown> | null;
  initialSiteSkillLaunch?: AgentChatWorkspaceProps["initialSiteSkillLaunch"];
  initialUserPrompt?: string;
  isSending: boolean;
  mappedTheme: string;
  messages: Message[];
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  openBrowserAssistOnMount: boolean;
  projectId?: string | null;
  sessionId?: string | null;
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
  siteSkillLaunchNonce?: number;
  workbenchRequests: WorkspaceWorkbenchRequestsController;
}

export function useWorkspaceArtifactCanvasRuntime({
  activeTheme,
  contentId,
  generalBrowserAssistProfileKey,
  generalCanvasState,
  input,
  initialAutoSendRequestMetadata,
  initialSiteSkillLaunch,
  initialUserPrompt,
  isSending,
  mappedTheme,
  messages,
  onNavigate,
  openBrowserAssistOnMount,
  projectId,
  sessionId,
  setLayoutMode,
  siteSkillLaunchNonce,
  workbenchRequests,
}: UseWorkspaceArtifactCanvasRuntimeParams) {
  const selection = useWorkspaceArtifactSelectionRuntime({
    activeTheme,
    generalCanvasState,
  });
  const browserAssist = useWorkspaceBrowserAssistCanvasRuntime({
    activeTheme,
    artifacts: selection.artifacts,
    contentId,
    generalBrowserAssistProfileKey,
    input,
    initialAutoSendRequestMetadata,
    initialSiteSkillLaunch,
    initialUserPrompt,
    mappedTheme,
    messages,
    onBrowserWorkbenchOpenRequest:
      workbenchRequests.requestBrowserWorkbenchOpen,
    onNavigate,
    openBrowserAssistOnMount,
    projectId,
    selection,
    sessionId,
    setLayoutMode,
    siteSkillLaunchNonce,
    upsertGeneralArtifact: selection.upsertGeneralArtifact,
  });
  const store = useWorkspaceArtifactStoreRuntime({
    activeTheme,
    artifacts: selection.artifacts,
    browserAssistScopeKey: browserAssist.currentBrowserAssistScopeKey,
    defaultSelectedArtifactId: selection.defaultSelectedArtifactId,
    isSending,
    liveArtifact: selection.liveArtifact,
    messages,
    preferGeneralCanvasFilePreview: selection.preferGeneralCanvasFilePreview,
    selectedArtifact: selection.selectedArtifact,
    selectedArtifactId: selection.selectedArtifactId,
    setArtifacts: selection.setArtifacts,
    setSelectedArtifactId: selection.setSelectedArtifactId,
    upsertGeneralArtifact: selection.upsertGeneralArtifact,
  });
  const viewMode = useWorkspaceArtifactViewModeControl({
    activeTheme,
    displayedArtifact: store.displayedCanvasArtifact,
    activeArtifactId: store.activeArtifactViewTargetId,
  });

  return {
    ...selection,
    ...browserAssist,
    ...store,
    ...viewMode,
  };
}
