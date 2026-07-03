import React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Leaf, RotateCcw } from "lucide-react";
import { emitImageWorkbenchTaskAction } from "@/lib/imageWorkbenchEvents";
import type {
  MessageImageWorkbenchPreview,
  MessageImageWorkbenchPreviewSelection,
} from "../types";
import {
  buildImageWorkbenchCaption,
  resolveImageWorkbenchPreviewModelLabel,
  sanitizeImageWorkbenchPresentationText,
} from "../utils/imageWorkbenchPresentation";
import { ImageWorkbenchPreviewMedia } from "./ImageWorkbenchPreviewMedia";

interface ImageWorkbenchMessagePreviewProps {
  preview: MessageImageWorkbenchPreview;
  onOpen?: (
    preview: MessageImageWorkbenchPreview,
    selection?: MessageImageWorkbenchPreviewSelection,
  ) => void;
}

type AgentTranslate = TFunction<"agent", undefined>;
type CaptionStatus = Parameters<typeof buildImageWorkbenchCaption>[0]["status"];

function resolveToolLabel(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  switch (preview.mode) {
    case "edit":
      return t("agentChat.imageWorkbenchPreview.tool.editing");
    case "variation":
      return t("agentChat.imageWorkbenchPreview.tool.redraw");
    case "generate":
    default:
      return t("agentChat.imageWorkbenchPreview.tool.generation");
  }
}

export const ImageWorkbenchMessagePreview: React.FC<
  ImageWorkbenchMessagePreviewProps
> = ({ preview, onOpen }) => {
  const { t } = useTranslation("agent");
  const toolLabel = resolveToolLabel(preview, t);
  const modelLabel = resolveImageWorkbenchPreviewModelLabel(preview);
  const hasRenderedImage = Boolean(
    preview.imageUrl || preview.previewImages?.some((url) => url.trim()),
  );
  const resolvedCaptionStatus: CaptionStatus =
    preview.status === "running" && hasRenderedImage
      ? preview.expectedImageCount &&
        preview.imageCount &&
        preview.imageCount < preview.expectedImageCount
        ? "partial"
        : "complete"
      : preview.status;
  const displayPrompt =
    sanitizeImageWorkbenchPresentationText(preview.prompt, {
      languageSource: preview.prompt,
    }) || "";
  const explicitCaption =
    resolvedCaptionStatus === "running"
      ? ""
      : sanitizeImageWorkbenchPresentationText(preview.caption, {
          languageSource: displayPrompt || preview.prompt,
        });
  const caption =
    explicitCaption ||
    buildImageWorkbenchCaption({
      prompt: displayPrompt,
      status: resolvedCaptionStatus,
      imageCount: preview.imageCount ?? preview.expectedImageCount ?? null,
      statusMessage: preview.statusMessage ?? null,
    });
  const showRetryAction =
    (preview.status === "failed" || preview.status === "cancelled") &&
    preview.retryable !== false;
  const canOpenPreview = Boolean(onOpen);

  const openPreview = (selection?: MessageImageWorkbenchPreviewSelection) => {
    if (!onOpen) {
      return;
    }
    onOpen(preview, selection);
  };

  const handleRetry = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    emitImageWorkbenchTaskAction({
      action: "retry",
      taskId: preview.taskId,
      projectId: preview.projectId ?? null,
      contentId: preview.contentId ?? null,
    });
  };

  return (
    <div className="w-full max-w-[800px]">
      <div
        onClick={canOpenPreview ? () => openPreview() : undefined}
        data-testid={`image-workbench-message-preview-${preview.taskId}`}
        className={`group block w-full text-left ${
          canOpenPreview ? "cursor-pointer" : ""
        }`}
      >
        <div
          data-testid={`image-workbench-message-preview-toolbar-${preview.taskId}`}
          className="mb-3 flex min-h-10 w-full max-w-full items-center gap-2 rounded-[10px] border border-[#d9ded6] bg-[#eef0ec] px-4 text-[13px] font-medium leading-5 text-[#435d2e]"
        >
          <Leaf className="h-3.5 w-3.5 shrink-0 fill-[#496631]/15 text-[#496631]" />
          <span className="truncate">{toolLabel}</span>
          {modelLabel ? (
            <>
              <span className="text-[#8aa47b]/55">|</span>
              <span className="truncate text-[#8aa47b]">{modelLabel}</span>
            </>
          ) : null}
        </div>
        <div className="relative max-w-full transition">
          <ImageWorkbenchPreviewMedia
            preview={preview}
            t={t}
            onSelect={canOpenPreview ? openPreview : undefined}
          />
        </div>
        {caption ? (
          <div
            data-testid={`image-workbench-message-preview-caption-${preview.taskId}`}
            className="mt-2 max-w-[800px] whitespace-pre-line text-sm leading-6 text-slate-700"
          >
            {caption}
          </div>
        ) : null}
      </div>
      {showRetryAction ? (
        <div className="mt-2 flex items-center">
          <button
            type="button"
            onClick={handleRetry}
            data-testid={`image-workbench-message-preview-action-${preview.taskId}-retry`}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-stone-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("agentChat.imageWorkbenchPreview.action.retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
};
