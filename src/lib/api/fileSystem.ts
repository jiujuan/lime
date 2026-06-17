import { convertFileSrc } from "@/lib/desktop-host/core";
import { safeInvoke } from "@/lib/dev-bridge";
import { hasDesktopHostInvokeCapability } from "@/lib/desktop-runtime";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import { assertEmptyElectronHostResult } from "./electronHostResult";

const FILE_SHELL_CURRENT_SURFACE = "真实文件壳 current 通道";

export type ProjectPathOpenTool = "vscode" | "cursor" | "terminal" | "finder";

export async function revealPathInFinder(path: string): Promise<void> {
  const result = await safeInvoke("reveal_in_finder", { path });
  assertNotDiagnosticFacade(
    "reveal_in_finder",
    result,
    FILE_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("reveal_in_finder", result);
}

export async function openPathWithDefaultApp(path: string): Promise<void> {
  const result = await safeInvoke("open_with_default_app", { path });
  assertNotDiagnosticFacade(
    "open_with_default_app",
    result,
    FILE_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("open_with_default_app", result);
}

export async function openProjectPathWithTool(
  rootPath: string,
  tool: ProjectPathOpenTool,
): Promise<void> {
  const result = await safeInvoke("open_project_path_with_tool", {
    rootPath,
    tool,
  });
  assertNotDiagnosticFacade(
    "open_project_path_with_tool",
    result,
    FILE_SHELL_CURRENT_SURFACE,
  );
  assertEmptyElectronHostResult("open_project_path_with_tool", result);
}

export async function getHomeDirectory(): Promise<string> {
  const result = await safeInvoke<string>("get_home_dir");
  assertNotDiagnosticFacade("get_home_dir", result, FILE_SHELL_CURRENT_SURFACE);
  if (typeof result !== "string" || !result.trim()) {
    throw new Error("get_home_dir did not return a home directory");
  }
  return result;
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
  if (!hasDesktopHostInvokeCapability()) {
    return false;
  }

  try {
    const result = await safeInvoke("open_file_preview_window", {
      path,
      title: options?.title?.trim() || extractFileName(path) || undefined,
    });
    assertNotDiagnosticFacade(
      "open_file_preview_window",
      result,
      FILE_SHELL_CURRENT_SURFACE,
    );
    return isFilePreviewWindowOpenResult(result) && result.opened === true;
  } catch (error) {
    console.warn("[HTML 预览] 打开 Desktop Host 独立窗口失败:", error);
    return false;
  }
}

function extractFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop()?.trim() || "";
}

function isFilePreviewWindowOpenResult(
  value: unknown,
): value is { opened: boolean } {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { opened?: unknown }).opened === "boolean",
  );
}
