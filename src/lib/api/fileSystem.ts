import { convertFileSrc } from "@tauri-apps/api/core";
import { safeInvoke } from "@/lib/dev-bridge";
import { hasTauriInvokeCapability } from "@/lib/tauri-runtime";

export async function revealPathInFinder(path: string): Promise<void> {
  await safeInvoke("reveal_in_finder", { path });
}

export async function openPathWithDefaultApp(path: string): Promise<void> {
  await safeInvoke("open_with_default_app", { path });
}

export function convertLocalFileSrc(path: string): string {
  try {
    return typeof convertFileSrc === "function" ? convertFileSrc(path) : path;
  } catch {
    return path;
  }
}

export function isAbsoluteLocalFilePath(path: string): boolean {
  const normalized = path.trim();
  return (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(normalized) ||
    normalized.startsWith("\\\\")
  );
}

export function resolveLocalFilePreviewUrl(
  path?: string | null,
): string | null {
  const normalizedPath = path?.trim();
  if (!normalizedPath || !isAbsoluteLocalFilePath(normalizedPath)) {
    return null;
  }

  const convertedUrl = convertLocalFileSrc(normalizedPath);
  if (
    !convertedUrl ||
    convertedUrl === normalizedPath ||
    isAbsoluteLocalFilePath(convertedUrl)
  ) {
    return null;
  }

  return convertedUrl;
}

export async function openHtmlPreviewWindow(
  path: string,
  options?: { title?: string },
): Promise<boolean> {
  if (!hasTauriInvokeCapability()) {
    return false;
  }

  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const url = convertLocalFileSrc(path);
    const label = `html-preview-${hashPathForWindowLabel(path)}`;
    const existingWindow = await WebviewWindow.getByLabel(label).catch(
      () => null,
    );

    if (existingWindow) {
      await existingWindow.show().catch(() => undefined);
      await existingWindow.setFocus().catch(() => undefined);
      return true;
    }

    const previewWindow = new WebviewWindow(label, {
      url,
      title: options?.title?.trim() || extractFileName(path) || path,
      width: 1280,
      height: 860,
      minWidth: 860,
      minHeight: 560,
      center: true,
      visible: true,
      focus: true,
      resizable: true,
      decorations: true,
    });

    return await Promise.race([
      new Promise<boolean>((resolve) => {
        void previewWindow.once("tauri://created", () => resolve(true));
      }),
      new Promise<boolean>((resolve) => {
        void previewWindow.once("tauri://error", () => resolve(false));
      }),
      new Promise<boolean>((resolve) =>
        window.setTimeout(() => resolve(true), 160),
      ),
    ]);
  } catch (error) {
    console.warn("[HTML 预览] 打开 Tauri 独立窗口失败:", error);
    return false;
  }
}

function extractFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop()?.trim() || "";
}

function hashPathForWindowLabel(path: string): string {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
