import { resolveLocalFilePreviewUrl } from "@/lib/api/fileSystem";
import type { WorkspaceProductProfilePreviewImage } from "./workspaceProductProfileModel";

export function resolveWorkspaceProductProfileImageRenderSrc(
  image: Pick<
    WorkspaceProductProfilePreviewImage,
    "cachedPath" | "filePath" | "localPath" | "url"
  >,
): string | null {
  const remoteUrl = normalizeString(image.url);
  if (remoteUrl) {
    return remoteUrl;
  }
  return resolveLocalFilePreviewUrl(resolveWorkspaceProductProfileImageLocalPath(image));
}

export function resolveWorkspaceProductProfileImageLocalPath(
  image: Pick<
    WorkspaceProductProfilePreviewImage,
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

export function resolveWorkspaceProductProfileImageSourceLabel(
  image: Pick<
    WorkspaceProductProfilePreviewImage,
    "cachedPath" | "filePath" | "localPath" | "url"
  >,
): string | null {
  return normalizeString(image.url) || resolveWorkspaceProductProfileImageLocalPath(image);
}

function normalizeString(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}
