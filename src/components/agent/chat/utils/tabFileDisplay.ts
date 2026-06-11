import { extractFileNameFromPath } from "../workspace/workspacePath";

export function isPathLikeTabTitle(value: string | null | undefined): boolean {
  const title = value?.trim() || "";
  if (!title) {
    return false;
  }

  return (
    title.startsWith("/") ||
    title.startsWith("~/") ||
    title.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(title)
  );
}

export function resolveFileNameTabLabel(
  value: string | null | undefined,
  fallbackLabel = "未命名文件",
): string {
  const title = value?.trim() || "";
  if (!title) {
    return fallbackLabel;
  }

  if (!isPathLikeTabTitle(title)) {
    return title;
  }

  return extractFileNameFromPath(title) || title;
}

export function buildFileNameTabTooltip(params: {
  label: string;
  source?: string | null;
  fallback?: string;
}): string {
  const label = params.label.trim() || params.fallback || "未命名文件";
  const source = params.source?.trim() || "";
  if (!source || source === label) {
    return label;
  }
  return `${label}\n${source}`;
}
