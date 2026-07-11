import React from "react";
import type { Message, MessagePreviewTarget } from "../types";
import { ImageWorkbenchMessagePreview } from "./ImageWorkbenchMessagePreview";
import { TaskMessagePreview } from "./TaskMessagePreview";

interface MessagePreviewCardsProps {
  message: Message;
  hasImageWorkbenchLeadContent: boolean;
  onOpenMessagePreview?: (
    target: MessagePreviewTarget,
    message: Message,
  ) => void;
}

export function MessagePreviewCards({
  message,
  hasImageWorkbenchLeadContent,
  onOpenMessagePreview,
}: MessagePreviewCardsProps) {
  if (message.imageWorkbenchPreview) {
    return (
      <div className={hasImageWorkbenchLeadContent ? "mt-2.5" : ""}>
        <ImageWorkbenchMessagePreview
          preview={message.imageWorkbenchPreview}
          showCompletionCaption={false}
          onOpen={
            onOpenMessagePreview
              ? (preview, selection) =>
                  onOpenMessagePreview(
                    {
                      kind: "image_workbench",
                      preview,
                      selection,
                    },
                    message,
                  )
              : undefined
          }
        />
      </div>
    );
  }

  if (message.taskPreview) {
    return (
      <TaskMessagePreview
        preview={message.taskPreview}
        onOpen={
          onOpenMessagePreview
            ? (preview) =>
                onOpenMessagePreview(
                  {
                    kind: "task",
                    preview,
                  },
                  message,
                )
            : undefined
        }
      />
    );
  }

  return null;
}
