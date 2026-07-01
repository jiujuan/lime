import type {
  CanvasImageInsertRequest,
  InsertableImage,
} from "@/lib/canvasImageInsertBus";
import { appendImageToMarkdown } from "./autoImageInsert";
import { replaceDocumentImageTaskPlaceholderWithImage } from "./imageTaskPlaceholder";

export interface ApplyDocumentImageInsertRequestResult {
  content: string;
  changed: boolean;
  locationLabel: string;
  reason?: "duplicate" | "missing_image_url";
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveImageTitle(image: InsertableImage): string {
  return normalizeText(image.title) || normalizeText(image.id) || "插图";
}

export function hasDocumentImageInsertPlacement(
  request: CanvasImageInsertRequest,
): boolean {
  return Boolean(
    normalizeText(request.slotId) ||
    normalizeText(request.sectionTitle) ||
    normalizeText(request.anchorText),
  );
}

function resolveLocationLabel(request: CanvasImageInsertRequest): string {
  if (normalizeText(request.slotId)) {
    return "文档指定配图位";
  }
  if (normalizeText(request.anchorText)) {
    return "文档选中文本附近";
  }
  if (normalizeText(request.sectionTitle)) {
    return "文档目标小节";
  }
  return "文档正文末尾";
}

export function applyDocumentImageInsertRequest(
  markdown: string,
  request: CanvasImageInsertRequest,
): ApplyDocumentImageInsertRequestResult {
  const imageUrl = normalizeText(request.image.contentUrl);
  if (!imageUrl) {
    return {
      content: markdown,
      changed: false,
      locationLabel: resolveLocationLabel(request),
      reason: "missing_image_url",
    };
  }

  const nextContent = hasDocumentImageInsertPlacement(request)
    ? replaceDocumentImageTaskPlaceholderWithImage(markdown, {
        taskId: normalizeText(request.taskId) || request.image.id,
        imageUrl,
        prompt: resolveImageTitle(request.image),
        slotId: request.slotId,
        anchorSectionTitle: request.sectionTitle,
        anchorText: request.anchorText,
      })
    : appendImageToMarkdown(markdown, request.image, true);

  return {
    content: nextContent,
    changed: nextContent !== markdown,
    locationLabel: resolveLocationLabel(request),
    reason: nextContent === markdown ? "duplicate" : undefined,
  };
}
