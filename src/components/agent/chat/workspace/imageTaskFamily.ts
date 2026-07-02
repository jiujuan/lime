export function normalizeTaskFamily(
  taskType: string,
  taskFamily?: string | null,
): string | undefined {
  const normalizedFamily = taskFamily?.trim().toLowerCase();
  if (normalizedFamily) {
    return normalizedFamily === "image_generation" ? "image" : normalizedFamily;
  }

  const normalizedType = taskType.trim().toLowerCase();
  if (normalizedType.includes("image") || normalizedType.includes("cover")) {
    return "image";
  }
  if (normalizedType.includes("video")) {
    return "video";
  }
  return undefined;
}
