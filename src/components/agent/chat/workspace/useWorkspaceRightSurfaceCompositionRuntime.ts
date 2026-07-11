import type { ReactNode } from "react";
import { useWorkspaceArticleEditorImageSlotRuntime } from "./useWorkspaceArticleEditorImageSlotRuntime";
import { useWorkspaceArticleEditorRightSurfaceRuntime } from "./useWorkspaceArticleEditorRightSurfaceRuntime";
import { useWorkspaceRightSurfaceCoordinatorRuntime } from "./useWorkspaceRightSurfaceCoordinatorRuntime";
import { useWorkspaceRightSurfaceHostRuntime } from "./useWorkspaceRightSurfaceHostRuntime";
import {
  buildWorkspaceConversationRightSurfaceChrome,
  type WorkspaceConversationRightSurfaceChromeRuntime,
} from "./workspaceConversationRightSurfaceChrome";

type ImageSlotParams = Parameters<
  typeof useWorkspaceArticleEditorImageSlotRuntime
>[0];
type ArticleEditorParams = Parameters<
  typeof useWorkspaceArticleEditorRightSurfaceRuntime
>[0];
type CoordinatorParams = Parameters<
  typeof useWorkspaceRightSurfaceCoordinatorRuntime
>[0];
type HostParams = Parameters<typeof useWorkspaceRightSurfaceHostRuntime>[0];
type ChromeParams = Parameters<
  typeof buildWorkspaceConversationRightSurfaceChrome
>[0];
type ArticleEditorRightSurface = ReturnType<
  typeof useWorkspaceArticleEditorRightSurfaceRuntime
>["articleEditorRightSurface"];

interface UseWorkspaceRightSurfaceCompositionRuntimeParams {
  articleEditor: Omit<
    ArticleEditorParams,
    "canvasWorkbenchRootPath" | "onImageSlotIntent"
  >;
  bindArticleEditorRightSurface: (surface: ArticleEditorRightSurface) => void;
  chrome: Omit<ChromeParams, "content" | "rightSurfaceRuntime">;
  coordinator: Omit<
    CoordinatorParams,
    | "articleEditorRightSurface"
    | "articleEditorRightSurfaceAvailable"
    | "canvasWorkbenchRootPath"
    | "shellRightSurfaceAvailable"
  >;
  host: Omit<
    HostParams,
    | "articleActionsDisabled"
    | "articleEditorRightSurface"
    | "canvasWorkbenchRootPath"
    | "onArticleMarkdownChange"
    | "rightSurfaceRuntime"
  >;
  imageSlot: ImageSlotParams;
  projectRootPath?: string | null;
  renderGeneralWorkbenchSidebarNode: (params: {
    rightSurfaceChrome: Pick<
      WorkspaceConversationRightSurfaceChromeRuntime,
      "harnessPanelVisible" | "onToggleHarnessPanel"
    >;
  }) => ReactNode;
  sessionWorkingDir?: string | null;
}

/** Article Editor、right-surface coordinator、host 与 chrome 统一在此编排。 */
export function useWorkspaceRightSurfaceCompositionRuntime({
  articleEditor,
  bindArticleEditorRightSurface,
  chrome,
  coordinator,
  host,
  imageSlot,
  projectRootPath,
  renderGeneralWorkbenchSidebarNode,
  sessionWorkingDir,
}: UseWorkspaceRightSurfaceCompositionRuntimeParams) {
  const canvasWorkbenchRootPath =
    sessionWorkingDir?.trim() || projectRootPath || null;
  const { handleArticleWorkspaceImageSlotIntent } =
    useWorkspaceArticleEditorImageSlotRuntime(imageSlot);
  const articleEditorRuntime = useWorkspaceArticleEditorRightSurfaceRuntime({
    ...articleEditor,
    canvasWorkbenchRootPath,
    onImageSlotIntent: handleArticleWorkspaceImageSlotIntent,
  });
  bindArticleEditorRightSurface(articleEditorRuntime.articleEditorRightSurface);

  const rightSurfaceRuntime = useWorkspaceRightSurfaceCoordinatorRuntime({
    ...coordinator,
    articleEditorRightSurface: articleEditorRuntime.articleEditorRightSurface,
    articleEditorRightSurfaceAvailable:
      articleEditorRuntime.articleEditorRightSurfaceAvailable,
    canvasWorkbenchRootPath,
    shellRightSurfaceAvailable: Boolean(canvasWorkbenchRootPath),
  });
  const rightSurfaceContent = useWorkspaceRightSurfaceHostRuntime({
    ...host,
    articleActionsDisabled:
      coordinator.sceneIsSending || coordinator.sceneIsPreparingSend,
    articleEditorRightSurface: articleEditorRuntime.articleEditorRightSurface,
    canvasWorkbenchRootPath,
    onArticleMarkdownChange:
      articleEditorRuntime.handleArticleWorkspaceMarkdownChange,
    rightSurfaceRuntime,
  });
  const rightSurfaceChrome = buildWorkspaceConversationRightSurfaceChrome({
    ...chrome,
    content: rightSurfaceContent,
    rightSurfaceRuntime,
  });

  return {
    canvasWorkbenchRootPath,
    generalWorkbenchSidebarNode: renderGeneralWorkbenchSidebarNode({
      rightSurfaceChrome,
    }),
    handleToggleCanvasFromRightSurface:
      rightSurfaceRuntime.handleToggleCanvasFromRightSurface,
    rightSurfaceChrome,
    sceneDisplayMessagesWithArticleWorkspaceArtifact:
      articleEditorRuntime.sceneDisplayMessagesWithArticleWorkspaceArtifact,
  };
}
