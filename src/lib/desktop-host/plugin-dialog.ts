/**
 * Mock for @/lib/desktop-host/plugin-dialog
 */

import { getElectronHostBridge } from "@/lib/electron-host";

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
  directory?: boolean;
  recursive?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

type OpenDialog = {
  (
    options?: OpenDialogOptions & { multiple: true },
  ): Promise<string[] | null>;
  (
    options?: OpenDialogOptions & { multiple?: false },
  ): Promise<string | null>;
  (options?: OpenDialogOptions): Promise<string | string[] | null>;
};

/**
 * Mock open function (file picker)
 */
const openDialog = async (
  options?: OpenDialogOptions,
): Promise<string | string[] | null> => {
  const electronHost = getElectronHostBridge();
  if (electronHost?.dialog) {
    return electronHost.dialog.open(options);
  }

  console.log("[Mock] Dialog open:", options);

  // 浏览器预览拿不到本机绝对目录路径；不能伪造目录，否则会让发布链路误以为已选中真实目录。
  if (options?.directory) {
    throw new Error(
      "Native directory dialog is unavailable in browser preview.",
    );
  }

  if (options?.multiple) {
    return ["/mock/path/to/file1.txt", "/mock/path/to/file2.txt"];
  }

  return "/mock/path/to/file.txt";
};

export const open = openDialog as OpenDialog;

/**
 * Mock save function
 */
export async function save(
  options?: SaveDialogOptions,
): Promise<string | null> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.dialog) {
    return electronHost.dialog.save(options);
  }

  console.log("[Mock] Dialog save:", options);
  const hasSkillPackageFilter = options?.filters?.some((filter) =>
    filter.extensions.some(
      (extension) =>
        extension.toLowerCase() === "skill" ||
        extension.toLowerCase() === "skills",
    ),
  );
  return hasSkillPackageFilter
    ? "/mock/path/to/saved/file.skills"
    : "/mock/path/to/saved/file.txt";
}
