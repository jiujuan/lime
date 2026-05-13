import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { MessageImage } from "../../../types";
import {
  getClipboardImageCandidates,
  MAX_IMAGE_ATTACHMENTS_PER_TURN,
  readImageAttachment,
} from "../../../utils/imageAttachments";
import { buildInputbarImageAttachmentsCopy } from "./inputbarImageAttachmentsCopy";

export function useImageAttachments() {
  const { t } = useTranslation("agent");
  const copy = useMemo(
    () =>
      buildInputbarImageAttachmentsCopy((key, values) =>
        t(key, values ?? {}),
      ),
    [t],
  );
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([]);
  const pendingImagesRef = useRef<MessageImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setPendingImagesSnapshot = useCallback((images: MessageImage[]) => {
    pendingImagesRef.current = images;
    setPendingImages(images);
  }, []);

  const appendImageFile = useCallback(
    async (
      file: File,
      successMessage?: string,
      preferredMediaType?: string,
    ) => {
      const fileName = file.name || copy.unnamedImage;
      try {
        if (pendingImagesRef.current.length >= MAX_IMAGE_ATTACHMENTS_PER_TURN) {
          toast.error(copy.imageReadFailed(fileName));
          return;
        }

        const image = await readImageAttachment(file, preferredMediaType);
        if (pendingImagesRef.current.length >= MAX_IMAGE_ATTACHMENTS_PER_TURN) {
          toast.error(copy.imageReadFailed(fileName));
          return;
        }

        setPendingImagesSnapshot([...pendingImagesRef.current, image]);
        toast.success(successMessage ?? copy.imageAdded(fileName));
      } catch {
        toast.error(copy.imageReadFailed(fileName));
      }
    },
    [copy, setPendingImagesSnapshot],
  );

  const appendImageFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        void appendImageFile(file);
      });
    },
    [appendImageFile],
  );

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }

      appendImageFiles(files);
      event.target.value = "";
    },
    [appendImageFiles],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const imageFiles = getClipboardImageCandidates(event.clipboardData);
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      imageFiles.forEach(({ file, mediaType }, index) => {
        void appendImageFile(
          file,
          index === 0 ? copy.imagePasted : undefined,
          mediaType,
        );
      });
    },
    [appendImageFile, copy.imagePasted],
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const files = event.dataTransfer.files;
      if (!files || files.length === 0) {
        return;
      }

      appendImageFiles(files);
    },
    [appendImageFiles],
  );

  const handleRemoveImage = useCallback(
    (index: number) => {
      setPendingImagesSnapshot(
        pendingImagesRef.current.filter(
          (_, currentIndex) => currentIndex !== index,
        ),
      );
    },
    [setPendingImagesSnapshot],
  );

  const clearPendingImages = useCallback(() => {
    setPendingImagesSnapshot([]);
  }, [setPendingImagesSnapshot]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    pendingImages,
    fileInputRef,
    handleFileSelect,
    handlePaste,
    handleDragOver,
    handleDrop,
    handleRemoveImage,
    clearPendingImages,
    openFileDialog,
  };
}
