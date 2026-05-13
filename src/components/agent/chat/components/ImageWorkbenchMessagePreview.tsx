import React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Leaf, LoaderCircle, RotateCcw } from "lucide-react";
import {
  emitImageWorkbenchFocus,
  emitImageWorkbenchTaskAction,
} from "@/lib/imageWorkbenchEvents";
import { cn } from "@/lib/utils";
import type { MessageImageWorkbenchPreview } from "../types";
import { resolveImageWorkbenchPreviewModelLabel } from "../utils/imageWorkbenchPresentation";
import { RenderableTaskImage } from "./RenderableTaskImage";

interface ImageWorkbenchMessagePreviewProps {
  preview: MessageImageWorkbenchPreview;
  onOpen?: (preview: MessageImageWorkbenchPreview) => void;
}

type AgentTranslate = TFunction<"agent", undefined>;

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

function resolvePlaceholderLabel(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  switch (preview.status) {
    case "cancelled":
      return t("agentChat.imageWorkbenchPreview.placeholder.cancelled");
    case "failed":
      return t("agentChat.imageWorkbenchPreview.placeholder.failed");
    case "complete":
    case "partial":
      return t("agentChat.imageWorkbenchPreview.placeholder.imageUnavailable");
    case "running":
    default:
      switch (preview.mode) {
        case "edit":
          return t("agentChat.imageWorkbenchPreview.placeholder.editing");
        case "variation":
          return t("agentChat.imageWorkbenchPreview.placeholder.redrawing");
        case "generate":
        default:
          return t("agentChat.imageWorkbenchPreview.placeholder.generating");
      }
  }
}

function renderPlaceholder(
  preview: MessageImageWorkbenchPreview,
  reason: string,
  t: AgentTranslate,
) {
  const detail =
    preview.status === "failed" ? preview.statusMessage?.trim() : "";

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center rounded-[12px] bg-slate-50 px-5 text-center">
      <div className="space-y-1.5">
        {reason === "empty" && preview.status === "running" ? (
          <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-slate-500" />
        ) : null}
        <div className="text-sm font-medium text-slate-700">
          {resolvePlaceholderLabel(preview, t)}
        </div>
        {detail ? (
          <div className="line-clamp-2 max-w-[320px] text-xs leading-5 text-slate-500">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolvePreviewImages(preview: MessageImageWorkbenchPreview): string[] {
  const urls: string[] = [];
  (preview.previewImages || []).forEach((value) => {
    const normalized = value.trim();
    if (!normalized || urls.includes(normalized)) {
      return;
    }
    urls.push(normalized);
  });
  const primaryUrl = preview.imageUrl?.trim();
  if (primaryUrl && !urls.includes(primaryUrl)) {
    urls.unshift(primaryUrl);
  }
  return urls.slice(0, 9);
}

function resolvePreviewGridAspectClass(
  preview: MessageImageWorkbenchPreview,
  imageCount: number,
): string {
  if (preview.layoutHint === "storyboard_3x3" && imageCount >= 4) {
    return "aspect-square";
  }
  return "aspect-[16/10]";
}

function renderPreviewMedia(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
) {
  const previewImages = resolvePreviewImages(preview);
  const expectedImageCount = Math.max(
    preview.expectedImageCount ?? 0,
    preview.imageCount ?? 0,
    previewImages.length,
  );
  const isStoryboardGrid = preview.layoutHint === "storyboard_3x3";
  const totalSlotCount = isStoryboardGrid
    ? Math.max(expectedImageCount, 9)
    : previewImages.length;
  const aspectClass = resolvePreviewGridAspectClass(preview, totalSlotCount);

  if (!isStoryboardGrid && previewImages.length <= 1) {
    return (
      <div
        data-testid={`image-workbench-message-preview-single-media-${preview.taskId}`}
        className="aspect-[16/9] w-[358px] max-w-full overflow-hidden rounded-[12px] bg-slate-50"
      >
        <RenderableTaskImage
          src={previewImages[0] || preview.imageUrl}
          alt={preview.prompt || t("agentChat.imageWorkbenchPreview.media.alt")}
          className="h-full w-full object-cover"
          renderFallback={(reason) => renderPlaceholder(preview, reason, t)}
        />
      </div>
    );
  }

  const visibleCount = isStoryboardGrid
    ? Math.min(totalSlotCount, 9)
    : Math.min(previewImages.length, previewImages.length <= 4 ? 4 : 6);
  const extraCount = Math.max(0, previewImages.length - visibleCount);
  const columnsClass = isStoryboardGrid
    ? "grid-cols-3"
    : visibleCount <= 4
      ? "grid-cols-2"
      : "grid-cols-3";

  return (
    <div
      data-testid={`image-workbench-message-preview-grid-${preview.taskId}`}
      className={cn("grid gap-1.5", aspectClass, columnsClass)}
    >
      {Array.from({ length: visibleCount }, (_, index) => {
        const url = previewImages[index];
        const isLastWithOverflow = extraCount > 0 && index === visibleCount - 1;
        return (
          <div
            key={`${url || "placeholder"}-${index}`}
            className={cn(
              "relative overflow-hidden rounded-[14px] bg-slate-50",
              isStoryboardGrid ? "aspect-square" : "aspect-[4/3]",
            )}
          >
            {url ? (
              <RenderableTaskImage
                src={url}
                alt={`${preview.prompt || t("agentChat.imageWorkbenchPreview.media.alt")} ${
                  index + 1
                }`}
                className="h-full w-full object-cover"
                renderFallback={() => (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[11px] font-medium text-slate-400">
                    {t("agentChat.imageWorkbenchPreview.media.previewFailed")}
                  </div>
                )}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-50">
                {preview.status === "running" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" />
                ) : null}
              </div>
            )}
            {isLastWithOverflow ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/48 text-sm font-semibold text-white">
                +{extraCount}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const ImageWorkbenchMessagePreview: React.FC<
  ImageWorkbenchMessagePreviewProps
> = ({ preview, onOpen }) => {
  const { t } = useTranslation("agent");
  const toolLabel = resolveToolLabel(preview, t);
  const modelLabel = resolveImageWorkbenchPreviewModelLabel(preview);
  const caption = preview.caption?.trim();
  const showRetryAction = preview.status === "failed";

  const openPreview = () => {
    if (onOpen) {
      onOpen(preview);
      return;
    }
    emitImageWorkbenchFocus({
      projectId: preview.projectId ?? null,
      contentId: preview.contentId ?? null,
    });
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
      <button
        type="button"
        aria-label={t("agentChat.imageWorkbenchPreview.media.open")}
        onClick={openPreview}
        data-testid={`image-workbench-message-preview-${preview.taskId}`}
        className="group block w-full text-left"
      >
        <div
          data-testid={`image-workbench-message-preview-toolbar-${preview.taskId}`}
          className="mb-2 flex min-h-6 w-full max-w-full items-center gap-2 px-0.5 text-[13px] font-medium leading-5 text-[#435d2e]"
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
          {renderPreviewMedia(preview, t)}
        </div>
        {caption ? (
          <div
            data-testid={`image-workbench-message-preview-caption-${preview.taskId}`}
            className="mt-2 max-w-[800px] whitespace-pre-line text-sm leading-6 text-slate-700"
          >
            {caption}
          </div>
        ) : null}
      </button>
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
