import React, { useState } from "react";
import { toast } from "sonner";
import type { HomeSurfaceToastCopy } from "../home/homeSurfaceCopy";
import type { MessageImage, MessagePathReference } from "../types";
import {
  getClipboardImageCandidates,
  readImageAttachment,
} from "../utils/imageAttachments";
import {
  readCustomPathReferencesFromDataTransfer,
  readSystemPathReferencesFromFiles,
} from "../utils/pathReferences";

interface UseEmptyStateAttachmentsInput {
  toastCopy: HomeSurfaceToastCopy;
  onAddPathReferences?: (references: MessagePathReference[]) => void;
}

export function useEmptyStateAttachments({
  toastCopy,
  onAddPathReferences,
}: UseEmptyStateAttachmentsInput) {
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([]);

  const readAndAppendImage = (
    file: File,
    mediaType: string | undefined,
    options?: { successToast?: string },
  ) => {
    void readImageAttachment(file, mediaType)
      .then((image) => {
        setPendingImages((previous) => [...previous, image]);
        if (options?.successToast) {
          toast.success(options.successToast);
        }
      })
      .catch(() => {
        toast.error(
          toastCopy.imageReadFailed(file.name || toastCopy.unnamedImage),
        );
      });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    Array.from(files).forEach((file) => {
      readAndAppendImage(file, undefined);
    });
    event.target.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getClipboardImageCandidates(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    imageFiles.forEach(({ file, mediaType }, index) => {
      readAndAppendImage(file, mediaType, {
        successToast: index === 0 ? toastCopy.imagePasted : undefined,
      });
    });
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent) => {
    const customReferences = readCustomPathReferencesFromDataTransfer(
      event.dataTransfer,
    );
    if (customReferences.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onAddPathReferences?.(customReferences);
      return;
    }

    const files = event.dataTransfer.files;
    const systemReferences =
      files && files.length > 0 ? readSystemPathReferencesFromFiles(files) : [];
    if (systemReferences.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onAddPathReferences?.(systemReferences);
      return;
    }

    const imageFiles = getClipboardImageCandidates(event.dataTransfer);
    if (imageFiles.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      imageFiles.forEach(({ file, mediaType }, index) => {
        readAndAppendImage(file, mediaType, {
          successToast: index === 0 ? toastCopy.imageAdded : undefined,
        });
      });
      return;
    }

    if (files && files.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      toast.error(toastCopy.systemPathDropUnsupported);
    }
  };

  const handleRemoveImage = (index: number) => {
    setPendingImages((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const clearPendingImages = () => {
    setPendingImages([]);
  };

  const replacePendingImages = (images: MessageImage[]) => {
    setPendingImages(images);
  };

  return {
    clearPendingImages,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    handlePaste,
    handleRemoveImage,
    pendingImages,
    replacePendingImages,
  };
}
