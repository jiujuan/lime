/**
 * Mock for @tauri-apps/plugin-dialog
 */

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

/**
 * Mock open function (file picker)
 */
export async function open(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  console.log("[Mock] Dialog open:", options);

  // 浏览器预览拿不到本机绝对目录路径；不能伪造目录，否则会让发布链路误以为已选中真实目录。
  if (options?.directory) {
    throw new Error(
      "Tauri native directory dialog is unavailable in browser preview.",
    );
  }

  if (options?.multiple) {
    return ["/mock/path/to/file1.txt", "/mock/path/to/file2.txt"];
  }

  return "/mock/path/to/file.txt";
}

/**
 * Mock save function
 */
export async function save(
  options?: SaveDialogOptions,
): Promise<string | null> {
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
