import React from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "../types";
import { resolveLocalFilePreviewUrl } from "@/lib/api/fileSystem";
import { buildMessageImageDataUrl } from "../utils/imageAttachments";

interface MessageImageAttachmentsProps {
  images: Message["images"];
  onOpenImage?: (
    image: NonNullable<Message["images"]>[number],
    index: number,
  ) => void;
}

function resolveMessageImageSrc(image: NonNullable<Message["images"]>[number]) {
  if (image.previewUrl?.trim()) {
    return image.previewUrl.trim();
  }
  if (image.sourcePath?.trim()) {
    return resolveLocalFilePreviewUrl(image.sourcePath) || image.sourcePath;
  }
  if (image.sourceUri?.trim()) {
    return image.sourceUri.trim();
  }
  if (image.data.trim()) {
    return buildMessageImageDataUrl(image);
  }
  return "";
}

export function MessageImageAttachments({
  images,
  onOpenImage,
}: MessageImageAttachmentsProps) {
  const { t } = useTranslation("agent");

  if (!images?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img, index) => {
        const src = resolveMessageImageSrc(img);
        const image = (
          <img
            src={src}
            className="max-h-64 max-w-xs rounded-lg border border-border object-contain"
            alt={t("agentChat.messageImageAttachments.alt")}
            data-testid={`message-image-attachment-${index}`}
          />
        );

        if (!onOpenImage) {
          return <React.Fragment key={index}>{image}</React.Fragment>;
        }

        return (
          <button
            key={index}
            type="button"
            className="rounded-lg text-left transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid={`message-image-attachment-open-${index}`}
            onClick={() => onOpenImage(img, index)}
          >
            {image}
          </button>
        );
      })}
    </div>
  );
}
