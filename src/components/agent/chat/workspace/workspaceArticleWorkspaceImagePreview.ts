import { resolveLocalFilePreviewUrl } from "@/lib/api/fileSystem";
import type { WorkspaceArticleWorkspacePreviewImage } from "./workspaceArticleWorkspaceModel";

export function resolveWorkspaceArticleWorkspaceImageRenderSrc(
  image: Pick<
    WorkspaceArticleWorkspacePreviewImage,
    "cachedPath" | "filePath" | "localPath" | "url"
  >,
): string | null {
  const remoteUrl = normalizeString(image.url);
  if (remoteUrl) {
    return remoteUrl;
  }
  return resolveLocalFilePreviewUrl(resolveWorkspaceArticleWorkspaceImageLocalPath(image));
}

export function resolveWorkspaceArticleWorkspaceImageLocalPath(
  image: Pick<
    WorkspaceArticleWorkspacePreviewImage,
    "cachedPath" | "filePath" | "localPath"
  >,
): string | null {
  return (
    normalizeString(image.localPath) ||
    normalizeString(image.filePath) ||
    normalizeString(image.cachedPath) ||
    null
  );
}

export function resolveWorkspaceArticleWorkspaceImageSourceLabel(
  image: Pick<
    WorkspaceArticleWorkspacePreviewImage,
    "cachedPath" | "filePath" | "localPath" | "url"
  >,
): string | null {
  return normalizeString(image.url) || resolveWorkspaceArticleWorkspaceImageLocalPath(image);
}

function normalizeString(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}
