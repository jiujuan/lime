import React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Sparkles } from "lucide-react";
import { emitImageWorkbenchFocus } from "@/lib/imageWorkbenchEvents";
import { cn } from "@/lib/utils";
import type { MessageImageWorkbenchPreview } from "../types";
import { RenderableTaskImage } from "./RenderableTaskImage";
import { buildLimeCorePolicyEvaluationMetaItem } from "../workspace/mediaTaskPolicyEvaluation";

interface ImageWorkbenchMessagePreviewProps {
  preview: MessageImageWorkbenchPreview;
  onOpen?: (preview: MessageImageWorkbenchPreview) => void;
}

type AgentTranslate = TFunction<"agent", undefined>;

const TRANSITION_STATUS_MESSAGE_FRAGMENTS = [
  "\u6b63\u5728\u540c\u6b65",
  "\u540c\u6b65\u4efb\u52a1\u72b6\u6001",
  "\u540c\u6b65\u5230\u5bf9\u8bdd",
  "\u5f02\u6b65\u961f\u5217",
];

function resolveResultLabel(
  mode: MessageImageWorkbenchPreview["mode"] | undefined,
  t: AgentTranslate,
): string {
  switch (mode) {
    case "edit":
      return t("agentChat.imageWorkbenchPreview.result.edit");
    case "variation":
      return t("agentChat.imageWorkbenchPreview.result.variation");
    case "generate":
    default:
      return t("agentChat.imageWorkbenchPreview.result.generate");
  }
}

function resolveSourceLabel(
  mode: MessageImageWorkbenchPreview["mode"] | undefined,
  t: AgentTranslate,
): string {
  if (mode === "variation") {
    return t("agentChat.imageWorkbenchPreview.source.referenceLabel");
  }
  return t("agentChat.imageWorkbenchPreview.source.sourceLabel");
}

function resolveStatusPrefix(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  switch (preview.status) {
    case "complete":
      switch (preview.mode) {
        case "edit":
          return t("agentChat.imageWorkbenchPreview.status.complete.edit");
        case "variation":
          return t("agentChat.imageWorkbenchPreview.status.complete.variation");
        case "generate":
        default:
          return t("agentChat.imageWorkbenchPreview.status.complete.generate");
      }
    case "partial":
      return t("agentChat.imageWorkbenchPreview.status.partial");
    case "cancelled":
      return t("agentChat.imageWorkbenchPreview.status.cancelled");
    case "failed":
      switch (preview.mode) {
        case "edit":
          return t("agentChat.imageWorkbenchPreview.status.failed.edit");
        case "variation":
          return t("agentChat.imageWorkbenchPreview.status.failed.variation");
        case "generate":
        default:
          return t("agentChat.imageWorkbenchPreview.status.failed.generate");
      }
    case "running":
    default:
      switch ((preview.phase || "").trim().toLowerCase()) {
        case "queued":
          return t("agentChat.imageWorkbenchPreview.status.running.queued");
        case "running":
          switch (preview.mode) {
            case "edit":
              return t("agentChat.imageWorkbenchPreview.status.running.edit");
            case "variation":
              return t(
                "agentChat.imageWorkbenchPreview.status.running.variation",
              );
            case "generate":
            default:
              return t(
                "agentChat.imageWorkbenchPreview.status.running.generate",
              );
          }
        default:
          return t("agentChat.imageWorkbenchPreview.status.running.preparing");
      }
  }
}

function resolveStatusAccentClass(
  preview: MessageImageWorkbenchPreview,
): string {
  switch (preview.status) {
    case "complete":
      return "bg-emerald-500";
    case "partial":
      return "bg-amber-500";
    case "cancelled":
      return "bg-slate-400";
    case "failed":
      return "bg-rose-500";
    case "running":
    default:
      return "bg-sky-500";
  }
}

function isTransitionStatusMessage(statusMessage: string): boolean {
  return TRANSITION_STATUS_MESSAGE_FRAGMENTS.some((fragment) =>
    statusMessage.includes(fragment),
  );
}

function resolveDescription(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  const statusMessage = preview.statusMessage?.trim();
  if (
    statusMessage &&
    !(preview.status !== "running" && isTransitionStatusMessage(statusMessage))
  ) {
    return statusMessage;
  }

  const resultLabel = resolveResultLabel(preview.mode, t);
  const storyboardLabel =
    preview.layoutHint === "storyboard_3x3"
      ? t("agentChat.imageWorkbenchPreview.layout.storyboard")
      : null;
  const returnedImageCount = Math.max(
    preview.previewImages?.length ?? 0,
    preview.imageUrl ? 1 : 0,
    preview.imageCount ?? 0,
  );
  const expectedImageCount = Math.max(
    preview.expectedImageCount ?? 0,
    returnedImageCount,
  );

  switch (preview.status) {
    case "complete":
      return storyboardLabel
        ? t("agentChat.imageWorkbenchPreview.description.complete.storyboard", {
            label: storyboardLabel,
          })
        : returnedImageCount > 1
          ? t("agentChat.imageWorkbenchPreview.description.complete.multiple", {
              count: returnedImageCount,
              result: resultLabel,
            })
          : t("agentChat.imageWorkbenchPreview.description.complete.single", {
              result: resultLabel,
            });
    case "partial":
      return storyboardLabel
        ? t("agentChat.imageWorkbenchPreview.description.partial.storyboard", {
            expected: expectedImageCount || 9,
            label: storyboardLabel,
            returned: returnedImageCount,
          })
        : returnedImageCount > 0
          ? t("agentChat.imageWorkbenchPreview.description.partial.multiple", {
              expected: expectedImageCount || returnedImageCount,
              result: resultLabel,
              returned: returnedImageCount,
            })
          : t("agentChat.imageWorkbenchPreview.description.partial.single", {
              result: resultLabel,
            });
    case "cancelled":
      return t("agentChat.imageWorkbenchPreview.description.cancelled");
    case "failed":
      return preview.retryable === false
        ? t("agentChat.imageWorkbenchPreview.description.failed.notRetryable")
        : t("agentChat.imageWorkbenchPreview.description.failed.retryable");
    case "running":
    default:
      if (storyboardLabel && expectedImageCount > 1) {
        return t(
          "agentChat.imageWorkbenchPreview.description.running.storyboard",
          {
            expected: expectedImageCount,
            label: storyboardLabel,
          },
        );
      }
      switch (preview.mode) {
        case "edit":
          return t("agentChat.imageWorkbenchPreview.description.running.edit");
        case "variation":
          return t(
            "agentChat.imageWorkbenchPreview.description.running.variation",
          );
        case "generate":
        default:
          return t(
            "agentChat.imageWorkbenchPreview.description.running.generate",
          );
      }
  }
}

function resolvePlaceholderLabel(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  if (preview.status === "failed") {
    return t("agentChat.imageWorkbenchPreview.placeholder.failed");
  }
  if (preview.status === "cancelled") {
    return t("agentChat.imageWorkbenchPreview.placeholder.cancelled");
  }
  if (preview.status === "complete" || preview.status === "partial") {
    return t("agentChat.imageWorkbenchPreview.placeholder.synced");
  }
  return resolveStatusPrefix(preview, t);
}

function resolveImageUnavailableLabel(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  if (preview.status === "complete" || preview.status === "partial") {
    return t("agentChat.imageWorkbenchPreview.placeholder.imageUnavailable");
  }
  return resolvePlaceholderLabel(preview, t);
}

function shouldShowSourceFootnote(
  preview: MessageImageWorkbenchPreview,
): boolean {
  return Boolean(
    preview.mode === "edit" ||
    preview.mode === "variation" ||
    preview.sourceImageUrl?.trim() ||
    preview.sourceImagePrompt?.trim() ||
    preview.sourceImageRef?.trim() ||
    preview.sourceImageCount,
  );
}

function resolveSourceSummary(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string {
  const prompt = preview.sourceImagePrompt?.trim();
  if (prompt) {
    return prompt;
  }

  const ref = preview.sourceImageRef?.trim();
  if (ref) {
    return t("agentChat.imageWorkbenchPreview.source.ref", { ref });
  }

  if (preview.sourceImageCount && preview.sourceImageCount > 1) {
    return preview.mode === "variation"
      ? t("agentChat.imageWorkbenchPreview.source.referenceCount", {
          count: preview.sourceImageCount,
        })
      : t("agentChat.imageWorkbenchPreview.source.sourceCount", {
          count: preview.sourceImageCount,
        });
  }

  return preview.mode === "variation"
    ? t("agentChat.imageWorkbenchPreview.source.variationSummary")
    : t("agentChat.imageWorkbenchPreview.source.editSummary");
}

function resolveSourceFootnote(
  preview: MessageImageWorkbenchPreview,
  t: AgentTranslate,
): string | null {
  if (!shouldShowSourceFootnote(preview)) {
    return null;
  }

  return t("agentChat.imageWorkbenchPreview.source.footnote", {
    label: resolveSourceLabel(preview.mode, t),
    summary: resolveSourceSummary(preview, t),
  });
}

function renderPlaceholder(
  preview: MessageImageWorkbenchPreview,
  reason: string,
  t: AgentTranslate,
) {
  return (
    <div className="flex aspect-[16/10] items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] px-6 text-center">
      <div className="space-y-2">
        {reason === "empty" && preview.status === "running" ? (
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-sky-500" />
        ) : (
          <Sparkles className="mx-auto h-7 w-7 text-slate-400" />
        )}
        <div className="text-sm font-medium text-slate-700">
          {reason === "error"
            ? resolveImageUnavailableLabel(preview, t)
            : resolvePlaceholderLabel(preview, t)}
        </div>
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

function resolvePreviewCardAspectClass(
  preview: MessageImageWorkbenchPreview,
  imageCount: number,
): string {
  if (preview.layoutHint === "storyboard_3x3" && imageCount >= 4) {
    return "aspect-square";
  }
  return "aspect-[16/10]";
}

function resolveStoryboardSlotLabel(
  preview: MessageImageWorkbenchPreview,
  index: number,
): string | null {
  return (
    preview.storyboardSlots?.find((slot) => slot.slotIndex === index + 1)
      ?.label || null
  );
}

function resolvePreviewMetaLabels(
  preview: MessageImageWorkbenchPreview,
  imageCount: number,
  expectedImageCount: number,
  t: AgentTranslate,
): string[] {
  const labels: string[] = [];
  const policyLabel = buildLimeCorePolicyEvaluationMetaItem({
    evaluationStatus: preview.runtimeContract?.limecorePolicyEvaluationStatus,
    evaluationDecision:
      preview.runtimeContract?.limecorePolicyEvaluationDecision,
    blockingRefs: preview.runtimeContract?.limecorePolicyEvaluationBlockingRefs,
    askRefs: preview.runtimeContract?.limecorePolicyEvaluationAskRefs,
    pendingRefs: preview.runtimeContract?.limecorePolicyEvaluationPendingRefs,
    missingInputs: preview.runtimeContract?.limecorePolicyMissingInputs,
    pendingHitRefs: preview.runtimeContract?.limecorePolicyPendingHitRefs,
  });

  if (policyLabel) {
    labels.push(policyLabel);
  }

  if (preview.layoutHint === "storyboard_3x3" && expectedImageCount >= 4) {
    labels.push(t("agentChat.imageWorkbenchPreview.layout.storyboard"));
  }

  if (expectedImageCount > imageCount && expectedImageCount > 1) {
    labels.push(
      t("agentChat.imageWorkbenchPreview.meta.imageProgress", {
        current: imageCount,
        expected: expectedImageCount,
      }),
    );
  } else if (imageCount > 1) {
    labels.push(
      t("agentChat.imageWorkbenchPreview.meta.imageCount", {
        count: imageCount,
      }),
    );
  }

  return labels;
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
  const aspectClass = resolvePreviewCardAspectClass(preview, totalSlotCount);

  if (!isStoryboardGrid && previewImages.length <= 1) {
    return (
      <RenderableTaskImage
        src={previewImages[0] || preview.imageUrl}
        alt={preview.prompt || t("agentChat.imageWorkbenchPreview.media.alt")}
        className={cn(aspectClass, "h-full w-full object-cover")}
        renderFallback={(reason) => renderPlaceholder(preview, reason, t)}
      />
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
      className={cn(
        "grid gap-1.5 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] p-1.5",
        aspectClass,
        columnsClass,
      )}
    >
      {Array.from({ length: visibleCount }, (_, index) => {
        const url = previewImages[index];
        const isLastWithOverflow = extraCount > 0 && index === visibleCount - 1;
        const storyboardSlotLabel = isStoryboardGrid
          ? resolveStoryboardSlotLabel(preview, index)
          : null;
        return (
          <div
            key={`${url || "placeholder"}-${index}`}
            className={cn(
              "relative overflow-hidden rounded-[16px] border border-slate-200/80 bg-white",
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
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] text-[11px] font-medium text-slate-400">
                {preview.status === "running" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-sky-500" />
                ) : (
                  <Sparkles className="h-4 w-4 text-slate-300" />
                )}
                <span>
                  {preview.status === "partial"
                    ? t("agentChat.imageWorkbenchPreview.slot.waiting")
                    : preview.status === "failed"
                      ? t("agentChat.imageWorkbenchPreview.slot.failed")
                      : preview.status === "cancelled"
                        ? t("agentChat.imageWorkbenchPreview.slot.cancelled")
                        : t("agentChat.imageWorkbenchPreview.slot.pending")}
                </span>
              </div>
            )}
            {isStoryboardGrid ? (
              <>
                <span className="absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 px-1.5 text-[11px] font-semibold text-slate-700 shadow-sm shadow-slate-950/5">
                  {index + 1}
                </span>
                {storyboardSlotLabel ? (
                  <span className="pointer-events-none absolute inset-x-2 bottom-2 line-clamp-2 rounded-[12px] bg-slate-950/66 px-2 py-1 text-[10px] font-medium leading-4 text-white backdrop-blur-[1px]">
                    {storyboardSlotLabel}
                  </span>
                ) : null}
              </>
            ) : null}
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
  const sourceFootnote = resolveSourceFootnote(preview, t);
  const statusPrefix = resolveStatusPrefix(preview, t);
  const statusDescription = resolveDescription(preview, t);
  const previewImages = resolvePreviewImages(preview);
  const totalImageCount = Math.max(
    preview.imageCount ?? 0,
    preview.imageUrl ? 1 : 0,
    previewImages.length,
  );
  const expectedImageCount = Math.max(
    preview.expectedImageCount ?? 0,
    totalImageCount,
  );
  const previewMetaLabels = resolvePreviewMetaLabels(
    preview,
    totalImageCount,
    expectedImageCount,
    t,
  );

  return (
    <button
      type="button"
      onClick={() => {
        if (onOpen) {
          onOpen(preview);
          return;
        }
        emitImageWorkbenchFocus({
          projectId: preview.projectId ?? null,
          contentId: preview.contentId ?? null,
        });
      }}
      data-testid={`image-workbench-message-preview-${preview.taskId}`}
      className="group block w-full max-w-[360px] text-left sm:max-w-[400px] lg:max-w-[440px]"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 transition group-hover:border-slate-300",
          previewImages.length > 0
            ? "shadow-[0_18px_42px_-34px_rgba(15,23,42,0.45)]"
            : "shadow-[0_16px_38px_-34px_rgba(15,23,42,0.28)]",
        )}
      >
        {previewMetaLabels.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
            {previewMetaLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm shadow-slate-950/5"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {renderPreviewMedia(preview, t)}
      </div>

      <div className="space-y-1.5 px-0.5 pt-3">
        <div className="line-clamp-2 text-[15px] font-medium leading-6 text-slate-900">
          {preview.prompt ||
            t("agentChat.imageWorkbenchPreview.promptFallback")}
        </div>

        <div className="flex items-start gap-2 text-[13px] leading-5 text-slate-500">
          <span
            className={cn(
              "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
              resolveStatusAccentClass(preview),
            )}
          />
          <span>
            <span className="font-medium text-slate-700">{statusPrefix}</span>
            <span>
              {t("agentChat.imageWorkbenchPreview.statusDescription", {
                description: statusDescription,
              })}
            </span>
          </span>
        </div>

        {sourceFootnote ? (
          <div className="line-clamp-2 text-[12px] leading-5 text-slate-400">
            {sourceFootnote}
          </div>
        ) : null}
      </div>
    </button>
  );
};
