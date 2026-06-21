import type { MessageImage } from "../types";
import { normalizeHistoryImagePart } from "./agentChatToolResult";
import { normalizeHistoryPartType } from "./agentChatHistoryPrimitives";

const messageImageIdentity = (image: MessageImage): string => {
  return [
    image.mediaType,
    image.sourcePath || "",
    image.sourceUri || "",
    image.previewUrl || "",
    image.data.slice(0, 128),
  ].join("::");
};

export const appendUniqueMessageImage = (
  images: MessageImage[],
  image: MessageImage,
) => {
  const identity = messageImageIdentity(image);
  if (images.some((current) => messageImageIdentity(current) === identity)) {
    return;
  }
  images.push(image);
};

const normalizeHistoryAttachmentImage = (
  attachment: unknown,
): MessageImage | null => {
  if (
    !attachment ||
    typeof attachment !== "object" ||
    Array.isArray(attachment)
  ) {
    return null;
  }
  const record = attachment as Record<string, unknown>;
  const kind = normalizeHistoryPartType(record.kind ?? record.type);
  if (
    kind &&
    kind !== "image" &&
    kind !== "input_image" &&
    kind !== "image_url"
  ) {
    return null;
  }

  return normalizeHistoryImagePart({
    ...record,
    type: kind || "image",
  });
};

export const appendHistoryMessageAttachments = (
  images: MessageImage[],
  message: unknown,
) => {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return;
  }
  const attachments = (message as Record<string, unknown>).attachments;
  if (!Array.isArray(attachments)) {
    return;
  }

  for (const attachment of attachments) {
    const normalizedImage = normalizeHistoryAttachmentImage(attachment);
    if (normalizedImage) {
      appendUniqueMessageImage(images, normalizedImage);
    }
  }
};
