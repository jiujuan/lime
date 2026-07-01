import type { MessageImage } from "../types";
import {
  parseImageWorkbenchCommand,
  type ParsedImageWorkbenchCommand,
} from "../utils/imageWorkbenchCommand";
import {
  buildImageWorkbenchCommandText,
  type ImageWorkbenchApplyTarget,
} from "./imageWorkbenchHelpers";
import type { WorkspaceArticleWorkspaceImageSlotIntent } from "./workspaceArticleWorkspaceModel";

export interface WorkspaceArticleEditorImageSlotCommand {
  rawText: string;
  parsedCommand: ParsedImageWorkbenchCommand;
  images: MessageImage[];
  applyTarget: ImageWorkbenchApplyTarget;
}

export interface BuildWorkspaceArticleEditorImageSlotCommandParams {
  intent: WorkspaceArticleWorkspaceImageSlotIntent;
  projectId?: string | null;
  contentId?: string | null;
  actionLabel: string;
  dispatchLabel: string;
}

export function buildWorkspaceArticleEditorImageSlotCommand({
  actionLabel,
  contentId,
  dispatchLabel,
  intent,
  projectId,
}: BuildWorkspaceArticleEditorImageSlotCommandParams): WorkspaceArticleEditorImageSlotCommand | null {
  const rawText = buildImageWorkbenchCommandText(intent.prompt);
  const parsedCommand = parseImageWorkbenchCommand(rawText);
  if (!parsedCommand) {
    return null;
  }

  return {
    rawText,
    parsedCommand,
    images: [],
    applyTarget: {
      kind: "canvas-insert",
      canvasType: "document",
      anchorHint: "section_end",
      slotId: intent.slot.id,
      sectionTitle: intent.anchorSectionTitle ?? null,
      anchorText: intent.anchorText ?? null,
      projectId: projectId ?? null,
      contentId: contentId ?? null,
      actionLabel,
      dispatchLabel,
    },
  };
}
