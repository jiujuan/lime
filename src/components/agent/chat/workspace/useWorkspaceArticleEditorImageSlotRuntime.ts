import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import {
  buildWorkspaceArticleEditorImageSlotCommand,
  type WorkspaceArticleEditorImageSlotCommand,
} from "./workspaceArticleEditorImageSlotDispatch";
import type { WorkspaceArticleWorkspaceImageSlotIntent } from "./workspaceArticleWorkspaceModel";

interface UseWorkspaceArticleEditorImageSlotRuntimeParams {
  contentId?: string | null;
  handleImageWorkbenchCommand: (
    command: WorkspaceArticleEditorImageSlotCommand,
  ) => Promise<unknown>;
  projectId?: string | null;
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
}

export function useWorkspaceArticleEditorImageSlotRuntime({
  contentId,
  handleImageWorkbenchCommand,
  projectId,
  setLayoutMode,
}: UseWorkspaceArticleEditorImageSlotRuntimeParams) {
  const { t } = useTranslation("agent");
  const handleArticleWorkspaceImageSlotIntent = useCallback(
    async (intent: WorkspaceArticleWorkspaceImageSlotIntent) => {
      const command = buildWorkspaceArticleEditorImageSlotCommand({
        intent,
        projectId,
        contentId,
        actionLabel: t("agentChat.imageWorkbenchAction.apply.documentLabel"),
        dispatchLabel: t(
          "agentChat.imageWorkbenchAction.apply.documentDispatch",
        ),
      });
      if (!command) {
        toast.error(
          t("agentChat.imageWorkbenchAction.toast.command.missingPrompt"),
        );
        return;
      }

      setLayoutMode("chat");
      await handleImageWorkbenchCommand(command);
    },
    [contentId, handleImageWorkbenchCommand, projectId, setLayoutMode, t],
  );

  return { handleArticleWorkspaceImageSlotIntent };
}
