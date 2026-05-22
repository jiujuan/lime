export interface SkillFilePreviewEntry {
  path: string;
  isDirectory: boolean;
  size: number;
  content?: string;
}

export function formatSkillFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
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

export function getSkillFileEntryLabel(entry: SkillFilePreviewEntry): string {
  return entry.path.split("/").filter(Boolean).at(-1) || entry.path;
}

export function getSkillFileEntryDepth(entry: SkillFilePreviewEntry): number {
  return Math.max(0, entry.path.split("/").filter(Boolean).length - 1);
}

export function getSkillFilePreviewContent(
  entry: SkillFilePreviewEntry | undefined,
  fallbackContent?: string | null,
): string | null {
  if (!entry || entry.isDirectory) {
    return null;
  }
  if (typeof entry.content === "string" && entry.content.trim()) {
    return entry.content;
  }
  if (fallbackContent?.trim()) {
    return fallbackContent;
  }
  return null;
}

export function getDefaultSkillFilePath(
  files: SkillFilePreviewEntry[],
): string {
  return (
    files.find((entry) => entry.path === "SKILL.md")?.path ||
    files.find((entry) => !entry.isDirectory)?.path ||
    "SKILL.md"
  );
}

export function isSkillMarkdownFile(
  entry: SkillFilePreviewEntry | undefined,
): boolean {
  return Boolean(entry && !entry.isDirectory && /\.md$/i.test(entry.path));
}
