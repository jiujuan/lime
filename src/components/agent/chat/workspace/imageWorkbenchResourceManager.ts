import { getLimeI18n } from "@/i18n/createI18n";
import type {
  OpenResourceManagerInput,
  ResourceManagerItemInput,
  ResourceManagerSourceContext,
} from "@/features/resource-manager/types";
import type {
  Message,
  MessageImageWorkbenchPreview,
  MessageImageWorkbenchPreviewSelection,
} from "../types";

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveImageWorkbenchPreviewImages(
  preview: MessageImageWorkbenchPreview,
): string[] {
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

export function buildImageTaskResourceSourceContext(params: {
  taskId?: string | null;
  outputId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  sourcePage: string;
}): ResourceManagerSourceContext {
  return {
    kind: "image_task",
    projectId: normalizeOptionalText(params.projectId),
    contentId: normalizeOptionalText(params.contentId),
    taskId: normalizeOptionalText(params.taskId),
    outputId: normalizeOptionalText(params.outputId),
    threadId: normalizeOptionalText(params.threadId),
    messageId: normalizeOptionalText(params.messageId),
    sourcePage: normalizeOptionalText(params.sourcePage),
  };
}

function normalizeSelectionIndex(
  selection?: MessageImageWorkbenchPreviewSelection,
): number | null {
  const value = selection?.imageIndex;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function resolveSelectedPreviewIndex(
  images: string[],
  selection?: MessageImageWorkbenchPreviewSelection,
): number {
  const selectionUrl = selection?.imageUrl?.trim();
  if (selectionUrl) {
    const urlIndex = images.findIndex((url) => url === selectionUrl);
    if (urlIndex >= 0) {
      return urlIndex;
    }
  }

  const selectionIndex = normalizeSelectionIndex(selection);
  if (selectionIndex !== null && selectionIndex < images.length) {
    return selectionIndex;
  }

  return 0;
}

function resolvePreviewSourceLabel(
  preview: MessageImageWorkbenchPreview,
): string {
  const i18n = getLimeI18n();
  switch (preview.mode) {
    case "edit":
      return i18n.t("agentChat.imageWorkbenchPreview.tool.editing", {
        ns: "agent",
      });
    case "variation":
      return i18n.t("agentChat.imageWorkbenchPreview.tool.redraw", {
        ns: "agent",
      });
    case "generate":
    default:
      return i18n.t("agentChat.imageWorkbenchPreview.tool.generation", {
        ns: "agent",
      });
  }
}

function resolvePreviewSlot(params: {
  preview: MessageImageWorkbenchPreview;
  imageIndex: number;
}) {
  const slotIndex = params.imageIndex + 1;
  return params.preview.storyboardSlots?.find(
    (slot) => slot.slotIndex === slotIndex,
  );
}

function buildPreviewResourceItems(params: {
  images: string[];
  message: Message;
  preview: MessageImageWorkbenchPreview;
  threadId?: string | null;
}): ResourceManagerItemInput[] {
  return params.images.map((url, index) => {
    const slot = resolvePreviewSlot({
      preview: params.preview,
      imageIndex: index,
    });
    const outputId = `${params.preview.taskId}:preview-${index + 1}`;
    const prompt =
      slot?.prompt?.trim() ||
      params.preview.caption?.trim() ||
      params.preview.prompt;
    const title = slot?.label?.trim() || prompt;

    return {
      id: outputId,
      kind: "image",
      src: url,
      title,
      description: prompt,
      metadata: {
        prompt,
        slotLabel: slot?.label ?? null,
        size: params.preview.size,
        providerName: params.preview.providerName,
        modelName: params.preview.modelName,
        projectId: params.preview.projectId,
      },
      sourceContext: buildImageTaskResourceSourceContext({
        taskId: params.preview.taskId,
        outputId,
        projectId: params.preview.projectId,
        contentId: params.preview.contentId,
        threadId: params.threadId,
        messageId: params.message.id,
        sourcePage: "message-image-preview",
      }),
    };
  });
}

export function buildImageWorkbenchPreviewResourceManagerInput(params: {
  message: Message;
  preview: MessageImageWorkbenchPreview;
  selection?: MessageImageWorkbenchPreviewSelection;
  threadId?: string | null;
}): OpenResourceManagerInput | null {
  const images = resolveImageWorkbenchPreviewImages(params.preview);
  if (images.length === 0) {
    return null;
  }

  return {
    sourceLabel: resolvePreviewSourceLabel(params.preview),
    sourceContext: buildImageTaskResourceSourceContext({
      taskId: params.preview.taskId,
      projectId: params.preview.projectId,
      contentId: params.preview.contentId,
      threadId: params.threadId,
      messageId: params.message.id,
      sourcePage: "message-image-preview",
    }),
    initialIndex: resolveSelectedPreviewIndex(images, params.selection),
    items: buildPreviewResourceItems({
      images,
      message: params.message,
      preview: params.preview,
      threadId: params.threadId,
    }),
  };
}
