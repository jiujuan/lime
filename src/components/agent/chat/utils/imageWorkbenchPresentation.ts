import { getLimeI18n } from "@/i18n/createI18n";
import {
  getSeededSkillCatalog,
  listSkillCatalogCommandEntries,
} from "@/lib/api/skillCatalog";
import type { MessageImageWorkbenchPreview } from "../types";

function titleCaseModelSegment(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => {
      if (/^gpt$/i.test(segment)) {
        return "GPT";
      }
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return `${segment.slice(0, 1).toUpperCase()}${segment
        .slice(1)
        .toLowerCase()}`;
    })
    .join(" ");
}

function resolveImageWorkbenchCatalogModelLabel(modelId: string): string {
  const normalizedModelId = modelId.trim().toLowerCase();
  if (!normalizedModelId) {
    return "";
  }

  const command = listSkillCatalogCommandEntries(getSeededSkillCatalog()).find(
    (entry) => {
      const defaults = entry.binding?.requestDefaults;
      const defaultModel = (
        defaults?.model ||
        defaults?.modelId ||
        ""
      )
        .trim()
        .toLowerCase();
      return defaultModel === normalizedModelId;
    },
  );
  return command?.title?.trim() || "";
}

export function collapseImageWorkbenchWhitespace(
  value: string | null | undefined,
): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function resolveImageWorkbenchModelLabel(
  value: string | null | undefined,
): string {
  const rawModel = value?.trim();
  if (!rawModel) {
    return "";
  }

  const catalogLabel = resolveImageWorkbenchCatalogModelLabel(rawModel);
  if (catalogLabel) {
    return catalogLabel;
  }

  const tail = rawModel.split("/").filter(Boolean).at(-1) || rawModel;
  return titleCaseModelSegment(tail);
}

export function resolveImageWorkbenchPreviewModelLabel(
  preview: MessageImageWorkbenchPreview,
): string {
  return resolveImageWorkbenchModelLabel(
    preview.modelName || preview.runtimeContract?.model || null,
  );
}

type ImageWorkbenchPresentationKey =
  | "agentChat.imageWorkbenchPresentation.process.prepareParameters"
  | "agentChat.imageWorkbenchPresentation.process.generateNow"
  | "agentChat.imageWorkbenchPresentation.caption.completeWithSubject"
  | "agentChat.imageWorkbenchPresentation.caption.completeDefault"
  | "agentChat.imageWorkbenchPresentation.caption.partialWithCount"
  | "agentChat.imageWorkbenchPresentation.caption.partialDefault"
  | "agentChat.imageWorkbenchPresentation.caption.failedWithMessage"
  | "agentChat.imageWorkbenchPresentation.caption.failedDefault"
  | "agentChat.imageWorkbenchPresentation.caption.cancelled";

function tImageWorkbenchPresentation(
  key: ImageWorkbenchPresentationKey,
  options?: Record<string, unknown>,
): string {
  return getLimeI18n().t(key, {
    ns: "agent",
    ...(options || {}),
  });
}

export function buildImageWorkbenchProcessLines(): string[] {
  return [
    tImageWorkbenchPresentation(
      "agentChat.imageWorkbenchPresentation.process.prepareParameters",
    ),
    tImageWorkbenchPresentation(
      "agentChat.imageWorkbenchPresentation.process.generateNow",
    ),
  ];
}

export function buildImageWorkbenchCaption(params: {
  prompt: string;
  status: MessageImageWorkbenchPreview["status"];
  imageCount?: number | null;
  statusMessage?: string | null;
}): string | null {
  switch (params.status) {
    case "complete":
      return tImageWorkbenchPresentation(
        "agentChat.imageWorkbenchPresentation.caption.completeDefault",
      );
    case "partial":
      return params.imageCount && params.imageCount > 0
        ? tImageWorkbenchPresentation(
            "agentChat.imageWorkbenchPresentation.caption.partialWithCount",
            { count: params.imageCount },
          )
        : tImageWorkbenchPresentation(
            "agentChat.imageWorkbenchPresentation.caption.partialDefault",
          );
    case "failed":
      return params.statusMessage?.trim()
        ? tImageWorkbenchPresentation(
            "agentChat.imageWorkbenchPresentation.caption.failedWithMessage",
            { message: params.statusMessage.trim() },
          )
        : tImageWorkbenchPresentation(
            "agentChat.imageWorkbenchPresentation.caption.failedDefault",
          );
    case "cancelled":
      return tImageWorkbenchPresentation(
        "agentChat.imageWorkbenchPresentation.caption.cancelled",
      );
    case "running":
    default:
      return null;
  }
}
