import { useWorkspaceAudioTaskPreviewRuntime } from "./useWorkspaceAudioTaskPreviewRuntime";
import { useWorkspaceImageWorkbenchEventRuntime } from "./useWorkspaceImageWorkbenchEventRuntime";
import { useWorkspaceTranscriptionTaskPreviewRuntime } from "./useWorkspaceTranscriptionTaskPreviewRuntime";
import { useWorkspaceVideoTaskActionRuntime } from "./useWorkspaceVideoTaskActionRuntime";
import { useWorkspaceVideoTaskPreviewRuntime } from "./useWorkspaceVideoTaskPreviewRuntime";

type ImageWorkbenchEventParams = Parameters<
  typeof useWorkspaceImageWorkbenchEventRuntime
>[0];
type VideoTaskPreviewParams = Parameters<
  typeof useWorkspaceVideoTaskPreviewRuntime
>[0];

interface UseWorkspaceMediaTaskRuntimeParams {
  canvasState: ImageWorkbenchEventParams["canvasState"];
  contentId?: string | null;
  handleImageWorkbenchCommand: ImageWorkbenchEventParams["handleImageWorkbenchCommand"];
  messages: VideoTaskPreviewParams["messages"];
  onImageWorkbenchRequested: ImageWorkbenchEventParams["onImageWorkbenchRequested"];
  projectId?: string | null;
  projectRootPath?: string | null;
  setCanvasState: ImageWorkbenchEventParams["setCanvasState"];
  setChatMessages: VideoTaskPreviewParams["setChatMessages"];
  setImageWorkbenchSelectedSize: ImageWorkbenchEventParams["setImageWorkbenchSelectedSize"];
  updateCurrentImageWorkbenchState: ImageWorkbenchEventParams["updateCurrentImageWorkbenchState"];
}

export function useWorkspaceMediaTaskRuntime({
  canvasState,
  contentId,
  handleImageWorkbenchCommand,
  messages,
  onImageWorkbenchRequested,
  projectId,
  projectRootPath,
  setCanvasState,
  setChatMessages,
  setImageWorkbenchSelectedSize,
  updateCurrentImageWorkbenchState,
}: UseWorkspaceMediaTaskRuntimeParams) {
  useWorkspaceImageWorkbenchEventRuntime({
    canvasState,
    projectId,
    contentId,
    setImageWorkbenchSelectedSize,
    setCanvasState,
    updateCurrentImageWorkbenchState,
    handleImageWorkbenchCommand,
    onImageWorkbenchRequested,
  });

  useWorkspaceVideoTaskPreviewRuntime({
    projectRootPath,
    messages,
    setChatMessages,
  });
  useWorkspaceAudioTaskPreviewRuntime({
    projectRootPath,
    messages,
    setChatMessages,
  });
  useWorkspaceTranscriptionTaskPreviewRuntime({
    projectRootPath,
    messages,
    setChatMessages,
  });
  useWorkspaceVideoTaskActionRuntime({
    projectRootPath,
    projectId,
    contentId,
    setChatMessages,
  });
}
