import { useWorkspaceImageWorkbenchActionRuntime } from "./useWorkspaceImageWorkbenchActionRuntime";
import { useWorkspaceImageWorkbenchCommandActionRuntime } from "./useWorkspaceImageWorkbenchCommandActionRuntime";
import { useWorkspaceImageWorkbenchSendCommandRuntime } from "./useWorkspaceImageWorkbenchSendCommandRuntime";

type SendCommandParams = Parameters<
  typeof useWorkspaceImageWorkbenchSendCommandRuntime
>[0];
type ActionParams = Parameters<
  typeof useWorkspaceImageWorkbenchActionRuntime
>[0];
interface UseWorkspaceImageWorkbenchRuntimeParams {
  cancelImageTask: ActionParams["cancelImageTask"];
  contentId: SendCommandParams["contentId"];
  createImageGenerationTask: ActionParams["createImageGenerationTask"];
  currentImageWorkbenchState: SendCommandParams["currentImageWorkbenchState"];
  ensureImageWorkbenchProvidersLoaded: SendCommandParams["ensureImageWorkbenchProvidersLoaded"];
  getImageTask: ActionParams["getImageTask"];
  imageWorkbenchPreferredModelId: SendCommandParams["imageWorkbenchPreferredModelId"];
  imageWorkbenchPreferredProviderId: SendCommandParams["imageWorkbenchPreferredProviderId"];
  imageWorkbenchPreferredProviderUnavailable: SendCommandParams["imageWorkbenchPreferredProviderUnavailable"];
  imageWorkbenchProvidersLoading: SendCommandParams["imageWorkbenchProvidersLoading"];
  imageWorkbenchSelectedModelId: SendCommandParams["imageWorkbenchSelectedModelId"];
  imageWorkbenchSelectedProviderId: SendCommandParams["imageWorkbenchSelectedProviderId"];
  imageWorkbenchSelectedSize: SendCommandParams["imageWorkbenchSelectedSize"];
  imageWorkbenchSessionKey: SendCommandParams["imageWorkbenchSessionKey"];
  projectId: SendCommandParams["projectId"];
  projectImageGenerationPreference: SendCommandParams["projectImageGenerationPreference"];
  projectRootPath: SendCommandParams["projectRootPath"];
  saveImageWorkbenchImagesToResource: ActionParams["saveImageWorkbenchImagesToResource"];
  setCanvasState: ActionParams["setCanvasState"];
  setInput: ActionParams["setInput"];
  setOnDemandMediaDefaults: SendCommandParams["setOnDemandMediaDefaults"];
  updateCurrentImageWorkbenchState: ActionParams["updateCurrentImageWorkbenchState"];
}

/** Image Workbench 的发送准备、任务操作和命令启动统一由此组合。 */
export function useWorkspaceImageWorkbenchRuntime({
  cancelImageTask,
  contentId,
  createImageGenerationTask,
  currentImageWorkbenchState,
  ensureImageWorkbenchProvidersLoaded,
  getImageTask,
  imageWorkbenchPreferredModelId,
  imageWorkbenchPreferredProviderId,
  imageWorkbenchPreferredProviderUnavailable,
  imageWorkbenchProvidersLoading,
  imageWorkbenchSelectedModelId,
  imageWorkbenchSelectedProviderId,
  imageWorkbenchSelectedSize,
  imageWorkbenchSessionKey,
  projectId,
  projectImageGenerationPreference,
  projectRootPath,
  saveImageWorkbenchImagesToResource,
  setCanvasState,
  setInput,
  setOnDemandMediaDefaults,
  updateCurrentImageWorkbenchState,
}: UseWorkspaceImageWorkbenchRuntimeParams) {
  const sendCommandRuntime = useWorkspaceImageWorkbenchSendCommandRuntime({
    contentId,
    currentImageWorkbenchState,
    ensureImageWorkbenchProvidersLoaded,
    imageWorkbenchPreferredModelId,
    imageWorkbenchPreferredProviderId,
    imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchProvidersLoading,
    imageWorkbenchSelectedModelId,
    imageWorkbenchSelectedProviderId,
    imageWorkbenchSelectedSize,
    imageWorkbenchSessionKey,
    projectId,
    projectImageGenerationPreference,
    projectRootPath,
    setOnDemandMediaDefaults,
  });
  const imageWorkbenchActionRuntime = useWorkspaceImageWorkbenchActionRuntime({
    cancelImageTask,
    contentId,
    createImageGenerationTask,
    getImageTask,
    currentImageWorkbenchState,
    imageWorkbenchSelectedModelId,
    imageWorkbenchSelectedProviderId,
    imageWorkbenchSelectedSize,
    imageWorkbenchSessionKey,
    projectId,
    projectRootPath,
    saveImageWorkbenchImagesToResource,
    setCanvasState,
    setInput,
    updateCurrentImageWorkbenchState,
  });
  const commandActionRuntime = useWorkspaceImageWorkbenchCommandActionRuntime({
    contentId,
    currentImageWorkbenchState,
    ensureImageWorkbenchProvidersLoaded,
    imageWorkbenchPreferredModelId,
    imageWorkbenchPreferredProviderId,
    imageWorkbenchPreferredProviderUnavailable,
    imageWorkbenchProvidersLoading,
    imageWorkbenchSelectedModelId,
    imageWorkbenchSelectedProviderId,
    imageWorkbenchSelectedSize,
    imageWorkbenchSessionKey,
    projectId,
    projectRootPath,
    submitImageWorkbenchAgentCommand:
      sendCommandRuntime.submitImageWorkbenchAgentCommand,
  });

  return {
    bindWorkspaceHandleSendRef: sendCommandRuntime.bindWorkspaceHandleSendRef,
    handleImageWorkbenchCommand:
      commandActionRuntime.handleImageWorkbenchCommand,
    imageWorkbenchActionRuntime,
    prepareImageWorkbenchSkillSend:
      sendCommandRuntime.prepareImageWorkbenchSkillSend,
    resolveImageWorkbenchCommandRequest:
      sendCommandRuntime.resolveImageWorkbenchCommandRequest,
  };
}
