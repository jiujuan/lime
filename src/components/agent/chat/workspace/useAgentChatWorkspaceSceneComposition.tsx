import type { ComponentProps } from "react";
import { WorkspaceShellScene } from "./WorkspaceShellScene";
import { renderWorkspaceFileManagerSidebarRuntime } from "./WorkspaceFileManagerSidebarRuntime";
import { useWorkspaceConversationCompositionRuntime } from "./useWorkspaceConversationCompositionRuntime";
import { useWorkspaceHomeRecoveryRuntime } from "./useWorkspaceHomeRecoveryRuntime";
import { useWorkspaceRightSurfaceCompositionRuntime } from "./useWorkspaceRightSurfaceCompositionRuntime";
import { useWorkspaceRightSurfaceExpertPanelRuntime } from "./useWorkspaceRightSurfaceExpertPanelRuntime";

type ExpertPanelParams = Parameters<
  typeof useWorkspaceRightSurfaceExpertPanelRuntime
>[0];
type RightSurfaceParams = Parameters<
  typeof useWorkspaceRightSurfaceCompositionRuntime
>[0];
type HomeRecoveryParams = Parameters<typeof useWorkspaceHomeRecoveryRuntime>[0];
type ConversationParams = Parameters<
  typeof useWorkspaceConversationCompositionRuntime
>[0];
type FileManagerParams = Parameters<
  typeof renderWorkspaceFileManagerSidebarRuntime
>[0];
type ShellParams = ComponentProps<typeof WorkspaceShellScene>;

interface UseAgentChatWorkspaceSceneCompositionParams {
  expertPanel: ExpertPanelParams;
  rightSurface: Omit<RightSurfaceParams, "chrome" | "coordinator" | "host"> & {
    chrome: Omit<
      RightSurfaceParams["chrome"],
      "expertInfoPanelVisible" | "hasExpertInfoPanel"
    >;
    coordinator: Omit<
      RightSurfaceParams["coordinator"],
      "expertInfoPanelVisible" | "hasExpertInfoPanel"
    >;
    host: Omit<RightSurfaceParams["host"], "expertInfoPanelProps">;
  };
  homeRecovery: HomeRecoveryParams;
  conversation: Omit<
    ConversationParams,
    "landing" | "messageList" | "scene"
  > & {
    landing: Omit<
      ConversationParams["landing"],
      "homeRecoverySession" | "onResumeRecentSession"
    >;
    messageList: Omit<ConversationParams["messageList"], "projection"> & {
      projection: Omit<
        ConversationParams["messageList"]["projection"],
        "messages"
      >;
    };
    scene: Omit<
      ConversationParams["scene"],
      "canvasWorkbenchRootPath" | "handleToggleCanvas" | "rightSurfaceChrome"
    >;
  };
  fileManager: FileManagerParams;
  shell: Omit<
    ShellParams,
    "fileManagerNode" | "generalWorkbenchSidebarNode" | "mainAreaNode"
  >;
}

/** 只组合既有 scene owner，不创建第二套 scene tree 或 runtime truth。 */
export function useAgentChatWorkspaceSceneComposition({
  expertPanel,
  rightSurface,
  homeRecovery,
  conversation,
  fileManager,
  shell,
}: UseAgentChatWorkspaceSceneCompositionParams) {
  const { expertInfoPanelProps, expertInfoPanelVisible, hasExpertInfoPanel } =
    useWorkspaceRightSurfaceExpertPanelRuntime(expertPanel);
  const {
    canvasWorkbenchRootPath,
    generalWorkbenchSidebarNode,
    handleToggleCanvasFromRightSurface,
    rightSurfaceChrome,
    sceneDisplayMessagesWithArticleWorkspaceArtifact,
  } = useWorkspaceRightSurfaceCompositionRuntime({
    ...rightSurface,
    chrome: {
      ...rightSurface.chrome,
      expertInfoPanelVisible,
      hasExpertInfoPanel,
    },
    coordinator: {
      ...rightSurface.coordinator,
      expertInfoPanelVisible,
      hasExpertInfoPanel,
    },
    host: {
      ...rightSurface.host,
      expertInfoPanelProps,
    },
  });
  const { homeRecoverySession, handleResumeHomeRecoverySession } =
    useWorkspaceHomeRecoveryRuntime(homeRecovery);
  const conversationSceneRuntime = useWorkspaceConversationCompositionRuntime({
    ...conversation,
    landing: {
      ...conversation.landing,
      homeRecoverySession,
      onResumeRecentSession: handleResumeHomeRecoverySession,
    },
    messageList: {
      ...conversation.messageList,
      projection: {
        ...conversation.messageList.projection,
        messages: sceneDisplayMessagesWithArticleWorkspaceArtifact,
      },
    },
    scene: {
      ...conversation.scene,
      canvasWorkbenchRootPath,
      handleToggleCanvas: handleToggleCanvasFromRightSurface,
      rightSurfaceChrome,
    },
  });
  const fileManagerNode = renderWorkspaceFileManagerSidebarRuntime(fileManager);

  return (
    <WorkspaceShellScene
      {...shell}
      fileManagerNode={fileManagerNode}
      generalWorkbenchSidebarNode={generalWorkbenchSidebarNode}
      mainAreaNode={conversationSceneRuntime.mainAreaNode}
    />
  );
}
