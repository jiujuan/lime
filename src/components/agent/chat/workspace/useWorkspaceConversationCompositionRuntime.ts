import { useWorkspaceConversationLandingSurfaceRuntime } from "./useWorkspaceConversationLandingSurfaceRuntime";
import { useWorkspaceConversationMessageListRuntime } from "./useWorkspaceConversationMessageListRuntime";
import { useWorkspaceConversationSceneRuntime } from "./useWorkspaceConversationSceneRuntime";

type LandingParams = Parameters<
  typeof useWorkspaceConversationLandingSurfaceRuntime
>[0];
type MessageListParams = Parameters<
  typeof useWorkspaceConversationMessageListRuntime
>[0];
type SceneParams = Parameters<typeof useWorkspaceConversationSceneRuntime>[0];

interface UseWorkspaceConversationCompositionRuntimeParams {
  landing: LandingParams;
  messageList: MessageListParams;
  scene: Omit<SceneParams, "landingSurface" | "messageListRuntime">;
}

/** Conversation landing、message list 与 scene 统一在 presentation owner 中组合。 */
export function useWorkspaceConversationCompositionRuntime({
  landing,
  messageList,
  scene,
}: UseWorkspaceConversationCompositionRuntimeParams) {
  const landingSurface = useWorkspaceConversationLandingSurfaceRuntime(landing);
  const messageListRuntime =
    useWorkspaceConversationMessageListRuntime(messageList);

  return useWorkspaceConversationSceneRuntime({
    ...scene,
    landingSurface,
    messageListRuntime,
  });
}
