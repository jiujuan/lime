import React from "react";
import type { Message } from "../types";

interface MessageImageAttachmentsProps {
  images: Message["images"];
}

export function MessageImageAttachments({
  images,
}: MessageImageAttachmentsProps) {
  if (!images?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img, index) => (
        <img
          key={index}
          src={`data:${img.mediaType};base64,${img.data}`}
          className="max-w-xs rounded-lg border border-border"
          alt="attachment"
        />
      ))}
    </div>
  );
}
