import type { FileEntry } from "@/lib/api/fileBrowser";

export function formatFileSize(size: number, emptyValue = ""): string {
  if (!Number.isFinite(size) || size <= 0) {
    return emptyValue;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatEntryModifiedTime(
  modifiedAt: number,
  locale: string,
  emptyValue = "-",
): string {
  if (!modifiedAt) {
    return emptyValue;
  }
  return new Date(modifiedAt).toLocaleString(locale || "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function compareFileManagerEntries(
  left: FileEntry,
  right: FileEntry,
  locale = "zh-CN",
): number {
  if (left.isDir !== right.isDir) {
    return left.isDir ? -1 : 1;
  }
  return left.name.localeCompare(right.name, locale, {
    numeric: true,
    sensitivity: "base",
  });
}
