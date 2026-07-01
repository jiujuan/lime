import type { GeneratedImage } from "./types";

export const IMAGE_GEN_MATERIAL_TAG = "image-gen";

const HISTORY_KEY = "image-gen-history";
const IMAGE_MATERIAL_NAME_MAX_LENGTH = 48;

export function loadStoredImageGenerationHistory(): GeneratedImage[] {
  const saved = localStorage.getItem(HISTORY_KEY);
  if (!saved) {
    return [];
  }

  const parsed = JSON.parse(saved) as GeneratedImage[];
  return Array.isArray(parsed) ? parsed : [];
}

export function saveStoredImageGenerationHistory(
  images: GeneratedImage[],
): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(images.slice(0, 50)));
}

function sanitizeMaterialName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateForMaterialName(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

export function buildGeneratedImageMaterialName(image: GeneratedImage): string {
  const promptHead = sanitizeMaterialName(image.prompt || "").slice(
    0,
    IMAGE_MATERIAL_NAME_MAX_LENGTH,
  );
  const prefix = promptHead || "生成图片";
  const timestamp = formatDateForMaterialName(image.createdAt);
  return `${prefix}-${timestamp}.png`;
}
